import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { objectStorageClient } from "./objectStorage";

/**
 * One-time repair after the Aug 2026 hack + double point-in-time restore.
 *
 * Timeline: hackers hit the live game Wed Aug 26 → Fri Aug 28. The owner
 * first restored production back to Tue Aug 25 ~12:30 PM PT (overshooting
 * the hack start and losing almost 3 days of legit play — verified from
 * prod: last surviving pack pull Tue 12:30 PM PT, next one Fri 3:08 PM),
 * published the security update, then decided to restore FORWARD to the
 * moment just before that first rewind — bringing back the lost days,
 * hack damage included. This sweep runs right after that forward restore
 * and surgically repairs the result:
 *
 *  1. AUTH RESTORE — passwords, staff-panel access, ban/mute state, and
 *     session versions were captured from the clean post-rewind database
 *     (Wednesday auth state + changes players made today under the new
 *     security rules) and uploaded to private object storage. Those values
 *     are re-applied on top, so hacker password/permission changes from
 *     the window never come back. Session versions are restored to their
 *     EXACT captured values — current login cookies keep working (owner's
 *     call: no forced logout). Stolen hack-era cookies stay dead anyway,
 *     because every captured account went through the Aug 28 global logout
 *     (session_version >= 2) while legacy cookies count as version 1.
 *  2. HIGH-VOLUME REPORT — accounts with a huge number of pack opens in
 *     the hack window are ONLY listed in the flag summary for the owner to
 *     review; nothing is banned, stripped, or changed automatically
 *     (owner's explicit decision, Aug 28).
 *  3. FLOORS — no legit player ends up below the tokens/XP they had at
 *     capture time on the clean timeline.
 *
 * Safety properties:
 *  - Flag-gated (app_settings hack_repair_2026_08_28), set INSIDE the same
 *    transaction as the repair: all-or-nothing, so a crash mid-way retries
 *    cleanly on next boot.
 *  - Timeline detection: the repair only fires when the database actually
 *    contains hack-window pack pulls (a range verified EMPTY on the clean
 *    timeline). Publishing this code before the forward restore is safe —
 *    the sweep just logs that it is armed and waits.
 *  - If the capture file is missing or unreadable, nothing is touched.
 */

const FLAG_KEY = "hack_repair_2026_08_28";
const CAPTURE_OBJECT_PATH = "hack-repair/capture-2026-08-28.json";

// Range verified EMPTY on the clean (post-first-rewind) timeline but dense
// with pulls on the hacked timeline. Used only to detect which timeline the
// database is on.
const DETECT_START = "2026-08-26 19:00:00+00";
const DETECT_END = "2026-08-28 11:00:00+00";
const DETECT_MIN_PULLS = 100;

// Full hack window used for the high-volume report (Wed 00:00 PT → just
// before the first rewind on Friday).
const WINDOW_START = "2026-08-26 07:00:00+00";
const WINDOW_END = "2026-08-28 20:10:00+00";

// Accounts with this many window opens get LISTED (report only, no action).
const REPORT_PULL_THRESHOLD = 5000;

// The first rewind's TARGET — the moment the two timelines fork (last
// surviving pack pull on the clean timeline: Tue Aug 25 12:30 PM PT).
// Player ids issued AFTER this moment mean different people on each
// timeline: the rewind reset the id sequence, so today's post-republish
// signups (present in the capture) reuse ids that belong to Tue-PM→Fri
// accounts on the restored timeline. Every capture-applied step therefore
// targets only rows created BEFORE the fork; later rows are left untouched
// (same policy as hack-window signups: keep their passwords and sessions).
const FORK_CUTOFF = "2026-08-25 19:30:00+00";

const CHUNK = 400;

type CapturedPlayer = {
  id: number;
  username: string;
  password_hash: string | null;
  panel_access: unknown;
  banned: boolean;
  muted: boolean;
  muted_until: string | null;
  session_version: number;
  tokens: number;
  experience: number;
};

function parsePrivateObjectPath(): { bucketName: string; objectName: string } {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const full = `${dir.replace(/\/$/, "")}/${CAPTURE_OBJECT_PATH}`;
  const parts = (full.startsWith("/") ? full : `/${full}`).split("/");
  if (parts.length < 3) throw new Error("Invalid PRIVATE_OBJECT_DIR path");
  return { bucketName: parts[1]!, objectName: parts.slice(2).join("/") };
}

async function downloadCapture(): Promise<CapturedPlayer[]> {
  const { bucketName, objectName } = parsePrivateObjectPath();
  const file = objectStorageClient.bucket(bucketName).file(objectName);
  const [exists] = await file.exists();
  if (!exists) throw new Error(`Capture object missing: ${objectName}`);
  const [buf] = await file.download();
  const parsed = JSON.parse(buf.toString("utf8")) as { players: CapturedPlayer[] };
  if (!Array.isArray(parsed.players) || parsed.players.length === 0) {
    throw new Error("Capture file has no players");
  }
  return parsed.players;
}

export async function runHackRepair(): Promise<
  | { status: "already-done" }
  | { status: "armed-waiting"; windowPulls: number }
  | {
      status: "repaired";
      authRestored: number;
      usernamesRestored: number;
      usernameConflicts: number;
      highVolumeListed: number;
      floorsApplied: number;
      postForkSessionBumps: number;
    }
> {
  const flag = await db.execute(
    sql`SELECT 1 FROM app_settings WHERE key = ${FLAG_KEY} LIMIT 1`,
  );
  if ((flag as unknown as { rows: unknown[] }).rows.length > 0) {
    return { status: "already-done" };
  }

  const detect = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM pack_pulls
        WHERE created_at >= ${DETECT_START}::timestamptz
          AND created_at < ${DETECT_END}::timestamptz`,
  );
  const windowPulls =
    ((detect as unknown as { rows: Array<{ n: number }> }).rows[0]?.n ?? 0);
  if (windowPulls < DETECT_MIN_PULLS) {
    return { status: "armed-waiting", windowPulls };
  }

  // We are on the hacked timeline — download the clean-auth capture first;
  // abort untouched if it cannot be read.
  const captured = await downloadCapture();

  let authRestored = 0;
  let usernamesRestored = 0;
  let usernameConflicts = 0;
  let floorsApplied = 0;
  let postForkSessionBumps = 0;
  let highVolume: Array<{ id: number; username: string; pulls: number }> = [];
  let alreadyDone = false;

  await db.transaction(async (tx) => {
    // Cross-instance exactly-once guard: autoscale boots several instances
    // simultaneously. Take a transaction-scoped advisory lock, then re-check
    // the flag INSIDE the lock — the loser of the race waits here, sees the
    // winner's committed flag, and exits without touching anything. A
    // rollback releases the lock with the flag unset, preserving
    // retry-on-failure.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${FLAG_KEY}))`);
    const flagInTx = await tx.execute(
      sql`SELECT 1 FROM app_settings WHERE key = ${FLAG_KEY} LIMIT 1`,
    );
    if ((flagInTx as unknown as { rows: unknown[] }).rows.length > 0) {
      alreadyDone = true;
      return;
    }
    // ---- 1. Auth restore (by id — valid ONLY for rows created before the
    // fork, where both timelines agree on who owns the id).
    for (let i = 0; i < captured.length; i += CHUNK) {
      const chunk = captured.slice(i, i + CHUNK);
      const values = sql.join(
        chunk.map(
          (p) =>
            sql`(${p.id}::int, ${p.password_hash}::text, ${JSON.stringify(
              p.panel_access ?? [],
            )}::jsonb, ${p.banned}::boolean, ${p.muted}::boolean, ${p.muted_until}::timestamptz, ${p.session_version}::int)`,
        ),
        sql`, `,
      );
      const res = await tx.execute(sql`
        UPDATE players p SET
          password_hash = c.password_hash,
          panel_access = c.panel_access,
          banned = c.banned,
          muted = c.muted,
          muted_until = c.muted_until,
          session_version = c.session_version,
          failed_logins = 0,
          last_failed_login_at = NULL,
          lockout_until = NULL,
          unlock_pending = false,
          unlock_pending_at = NULL
        FROM (VALUES ${values}) AS c(id, password_hash, panel_access, banned, muted, muted_until, session_version)
        WHERE p.id = c.id
          AND p.created_at < ${FORK_CUTOFF}::timestamptz
      `);
      authRestored += (res as unknown as { rowCount?: number }).rowCount ?? 0;
    }

    // Post-fork rows keep their (hack-era) passwords — nothing newer was
    // ever captured for them — but their session slots are NOT trusted:
    // today's post-republish signups hold live cookies whose ids point at
    // DIFFERENT people on this timeline (the rewound id sequence reused
    // their ids). Bumping post-fork rows to session version 2 turns those
    // stale cookies into clean 401s instead of silent logins to a
    // stranger's account. Post-fork players just log in again with their
    // own password; every pre-fork (captured) session survives untouched.
    const bump = await tx.execute(sql`
      UPDATE players SET session_version = 2
      WHERE created_at >= ${FORK_CUTOFF}::timestamptz
        AND session_version < 2
    `);
    postForkSessionBumps = (bump as unknown as { rowCount?: number }).rowCount ?? 0;

    // ---- 2. Username restore, skipping any name now held by another row.
    for (let i = 0; i < captured.length; i += CHUNK) {
      const chunk = captured.slice(i, i + CHUNK);
      const values = sql.join(
        chunk.map((p) => sql`(${p.id}::int, ${p.username}::text)`),
        sql`, `,
      );
      const res = await tx.execute(sql`
        UPDATE players p SET username = c.username
        FROM (VALUES ${values}) AS c(id, username)
        WHERE p.id = c.id
          AND p.created_at < ${FORK_CUTOFF}::timestamptz
          AND p.username <> c.username
          AND NOT EXISTS (
            SELECT 1 FROM players x
            WHERE lower(x.username) = lower(c.username) AND x.id <> c.id
          )
      `);
      usernamesRestored += (res as unknown as { rowCount?: number }).rowCount ?? 0;
    }
    const conflicts = await tx.execute(sql`
      SELECT c.id, c.username FROM (VALUES ${sql.join(
        captured.map((p) => sql`(${p.id}::int, ${p.username}::text)`),
        sql`, `,
      )}) AS c(id, username)
      JOIN players p ON p.id = c.id
      WHERE p.created_at < ${FORK_CUTOFF}::timestamptz
        AND p.username <> c.username
    `);
    usernameConflicts = (conflicts as unknown as { rows: unknown[] }).rows.length;

    // ---- 3. High-volume report — READ ONLY. Owner explicitly chose not to
    // auto-ban or strip anyone; this just records who opened an inhuman
    // number of packs in the window so they can review later.
    const hv = await tx.execute(sql`
      SELECT p.id, p.username, COUNT(*)::int AS n
      FROM pack_pulls pp
      JOIN players p ON p.id = pp.player_id
      WHERE pp.created_at >= ${WINDOW_START}::timestamptz
        AND pp.created_at < ${WINDOW_END}::timestamptz
      GROUP BY p.id, p.username
      HAVING COUNT(*) >= ${REPORT_PULL_THRESHOLD}
      ORDER BY COUNT(*) DESC
      LIMIT 200
    `);
    highVolume = (hv as unknown as {
      rows: Array<{ id: number; username: string; n: number }>;
    }).rows.map((r) => ({
      id: Number(r.id),
      username: r.username,
      pulls: Number(r.n),
    }));

    // ---- 4. Floors: nobody legit ends below their clean-timeline values.
    for (let i = 0; i < captured.length; i += CHUNK) {
      const chunk = captured.slice(i, i + CHUNK);
      const values = sql.join(
        chunk.map((p) => sql`(${p.id}::int, ${p.tokens}::int, ${p.experience}::int)`),
        sql`, `,
      );
      const res = await tx.execute(sql`
        UPDATE players p SET
          tokens = GREATEST(p.tokens, c.tokens),
          experience = GREATEST(p.experience, c.experience)
        FROM (VALUES ${values}) AS c(id, tokens, experience)
        WHERE p.id = c.id AND p.banned = false
          AND p.created_at < ${FORK_CUTOFF}::timestamptz
          AND (p.tokens < c.tokens OR p.experience < c.experience)
      `);
      floorsApplied += (res as unknown as { rowCount?: number }).rowCount ?? 0;
    }

    // ---- 5. Flag, inside the transaction: all-or-nothing.
    const summary = {
      authRestored,
      usernamesRestored,
      usernameConflicts,
      floorsApplied,
      postForkSessionBumps,
      highVolumeOpeners: highVolume,
      at: new Date().toISOString(),
    };
    await tx.execute(sql`
      INSERT INTO app_settings (key, value) VALUES (${FLAG_KEY}, ${JSON.stringify(summary)})
      ON CONFLICT (key) DO NOTHING
    `);
  });

  if (alreadyDone) {
    return { status: "already-done" };
  }

  return {
    status: "repaired",
    authRestored,
    usernamesRestored,
    usernameConflicts,
    highVolumeListed: highVolume.length,
    floorsApplied,
    postForkSessionBumps,
  };
}
