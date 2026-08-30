import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// Per-ACCOUNT lockout shared by every password-checking entry point (web
// login AND the Discord /login modal — an attacker must not be able to dodge
// the lockout by guessing through a different door): 5 wrong passwords
// inside 15 minutes locks the account for 15 minutes, no matter how many
// IPs or Discord identities the attempts come from. DB-backed, so it holds
// across restarts and autoscale instances (in-memory limiters do not).
export const LOCKOUT_THRESHOLD = 5;

/** True while the account is locked from too many failed logins. */
export function isLockedOut(player: { lockoutUntil: Date | null }): boolean {
  return player.lockoutUntil !== null && player.lockoutUntil.getTime() > Date.now();
}

export async function recordFailedLogin(playerId: number): Promise<void> {
  // One race-safe statement: restart the counter when the last failure is
  // stale, otherwise increment; reaching the threshold arms the lockout.
  await db.execute(sql`
    UPDATE players SET
      failed_logins = CASE
        WHEN last_failed_login_at IS NULL OR last_failed_login_at < now() - interval '15 minutes'
        THEN 1 ELSE failed_logins + 1
      END,
      lockout_until = CASE
        WHEN (CASE
          WHEN last_failed_login_at IS NULL OR last_failed_login_at < now() - interval '15 minutes'
          THEN 1 ELSE failed_logins + 1
        END) >= ${LOCKOUT_THRESHOLD}
        THEN now() + interval '15 minutes'
        ELSE lockout_until
      END,
      last_failed_login_at = now()
    WHERE id = ${playerId}
  `);
}

/** Clean slate after a successful login (no-op when nothing to clear). */
export async function clearLoginFailures(player: {
  id: number;
  failedLogins: number;
  lockoutUntil: Date | null;
  lastFailedLoginAt: Date | null;
}): Promise<void> {
  if (player.failedLogins === 0 && !player.lockoutUntil && !player.lastFailedLoginAt) return;
  await db.execute(
    sql`UPDATE players SET failed_logins = 0, lockout_until = NULL, last_failed_login_at = NULL WHERE id = ${player.id}`,
  );
}
