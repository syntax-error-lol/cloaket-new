import { Router, type IRouter } from "express";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq, sql } from "drizzle-orm";
import { db, playersTable, ipBansTable } from "@workspace/db";
import { RegisterBody, LoginBody, RegisterResponse, LoginResponse, LogoutResponse } from "@workspace/api-zod";
import { STARTING_TOKENS } from "../lib/game";
import { setSessionCookie, clearSessionCookie } from "../middlewares/auth";
import { rateLimit } from "../middlewares/rate-limit";

const scrypt = promisify(scryptCb);

const router: IRouter = Router();

import { USERNAME_RE } from "../lib/game";
import { passwordProblem } from "../lib/passwordPolicy";
import { recordFailedLogin, clearLoginFailures } from "../lib/loginGuard";

// Blunt online password guessing / mass account creation.
router.use(["/auth/login", "/auth/register"], rateLimit({ windowMs: 60_000, max: 10 }));
// Stricter pace on sign-ups: bots hammer this endpoint; humans don't need
// more than a few tries in a short burst. No long-term per-IP account cap —
// just a speed limit.
router.use("/auth/register", rateLimit({ windowMs: 5 * 60_000, max: 3 }));

// ---- Registration flood breakers (added after the Aug 29 2026 wave-3
// attack created ~121k bot accounts). The in-memory limiters above reset on
// every restart and exist per autoscale instance, which is exactly how the
// flood got through. These two guards live in the DATABASE, so they hold
// across every instance and restart:
//  1. GLOBAL breaker — more than this many signups game-wide in 10 minutes
//     pauses signups for everyone. Organic growth never bursts this hard; a
//     bot flood trips it within seconds and stays locked out.
//  2. PER-IP cap — at most this many new accounts per IP per hour (checked
//     inside the register transaction, race-safe under the per-IP lock).
// If a legit signup event is planned (e.g. a whole class joining at once),
// raise these constants and publish.
const REGISTRATIONS_GLOBAL_MAX_PER_10MIN = 25;
const REGISTRATIONS_PER_IP_MAX_PER_HOUR = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid username or password" });
    return;
  }
  const { username, password } = parsed.data;
  if (!USERNAME_RE.test(username)) {
    res.status(400).json({
      message: "Username must be 3-20 characters (letters, numbers, _ or -)",
    });
    return;
  }
  const passwordIssue = passwordProblem(password);
  if (passwordIssue) {
    res.status(400).json({ message: passwordIssue });
    return;
  }
  // Global flood breaker — see the constants above for why this is DB-backed.
  const recentGlobal = (await db.execute(
    sql`SELECT count(*)::int AS n FROM players WHERE created_at > now() - interval '10 minutes'`,
  )) as unknown as { rows: Array<{ n: number }> };
  if (Number(recentGlobal.rows[0]?.n ?? 0) >= REGISTRATIONS_GLOBAL_MAX_PER_10MIN) {
    res.status(429).json({ message: "Sign-ups are briefly paused — try again in a few minutes" });
    return;
  }
  const [existing] = await db
    .select({ id: playersTable.id })
    .from(playersTable)
    .where(sql`lower(${playersTable.username}) = lower(${username})`);
  if (existing) {
    res.status(400).json({ message: "That username is taken" });
    return;
  }
  const passwordHash = await hashPassword(password);
  let created;
  try {
    // IP bans block NEW registrations only (ban evasion) — existing accounts
    // on a shared IP (schools etc.) are unaffected. Check + insert run under
    // a per-IP advisory lock shared with the admin ban action, so a signup
    // can't slip through while a ban is being applied.
    created = await db.transaction(async (tx) => {
      if (req.ip) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"ipban:" + req.ip}))`);
        const [ipBan] = await tx
          .select({ id: ipBansTable.id })
          .from(ipBansTable)
          .where(eq(ipBansTable.ip, req.ip));
        if (ipBan) return "ip_banned" as const;
        // Per-IP account cap (race-safe: we hold this IP's advisory lock, and
        // the insert below records last_ip, so parallel signups from one IP
        // serialize through here and see each other's rows).
        const recentFromIp = (await tx.execute(
          sql`SELECT count(*)::int AS n FROM players WHERE last_ip = ${req.ip} AND created_at > now() - interval '1 hour'`,
        )) as unknown as { rows: Array<{ n: number }> };
        if (Number(recentFromIp.rows[0]?.n ?? 0) >= REGISTRATIONS_PER_IP_MAX_PER_HOUR) {
          return "ip_throttled" as const;
        }
      }
      const [row] = await tx
        .insert(playersTable)
        .values({
          username,
          passwordHash,
          tokens: STARTING_TOKENS,
          isBot: false,
          // Recorded at signup (not just on later authed requests) so the
          // per-IP cap above and staff IP tools see brand-new accounts too.
          lastIp: req.ip ?? null,
        })
        .onConflictDoNothing({ target: playersTable.username })
        .returning();
      return row;
    });
  } catch (err: unknown) {
    // Unique violation from the case-insensitive lower(username) index.
    if ((err as { code?: string })?.code === "23505" || (err as { cause?: { code?: string } })?.cause?.code === "23505") {
      res.status(400).json({ message: "That username is taken" });
      return;
    }
    throw err;
  }
  if (created === "ip_banned") {
    req.log.warn({ ip: req.ip, username }, "Registration blocked by IP ban");
    res.status(403).json({ message: "You can't create an account right now" });
    return;
  }
  if (created === "ip_throttled") {
    res.status(429).json({ message: "Too many new accounts from your network — try again later" });
    return;
  }
  if (!created) {
    res.status(400).json({ message: "That username is taken" });
    return;
  }
  setSessionCookie(res, created.id, created.sessionVersion);
  req.log.info({ username }, "Player registered");
  res.status(201).json(RegisterResponse.parse({ username: created.username }));
});

// An owner "unlock" (one-time password reset) is only honored for this long.
// Keep in sync with the interval in the unlock-claim UPDATE below.
const UNLOCK_WINDOW_MS = 60 * 60_000;

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid username or password" });
    return;
  }
  const { username, password } = parsed.data;
  const [player] = await db
    .select()
    .from(playersTable)
    .where(sql`lower(${playersTable.username}) = lower(${username})`);
  if (!player || player.isBot || !player.passwordHash) {
    res.status(401).json({ message: "Wrong username or password" });
    return;
  }
  if (player.lockoutUntil && player.lockoutUntil.getTime() > Date.now()) {
    const mins = Math.max(1, Math.ceil((player.lockoutUntil.getTime() - Date.now()) / 60_000));
    res.status(429).json({
      message: `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
    });
    return;
  }
  const passwordOk = await verifyPassword(password, player.passwordHash);
  const unlockFresh =
    player.unlockPending &&
    player.unlockPendingAt !== null &&
    Date.now() - player.unlockPendingAt.getTime() < UNLOCK_WINDOW_MS;
  let sessionVersion = player.sessionVersion;
  if (!passwordOk && unlockFresh) {
    // Owner unlocked this account: the next login with ANY acceptable
    // password is accepted and that password becomes the new password.
    const passwordIssue = passwordProblem(password);
    if (passwordIssue) {
      res.status(400).json({ message: passwordIssue });
      return;
    }
    const newHash = await hashPassword(password);
    // Conditional update = only ONE login can consume the unlock, even if
    // two people race; losers fall through to the normal wrong-password path.
    // The session-version bump kills every cookie issued before the reset.
    const [claimed] = await db
      .update(playersTable)
      .set({
        passwordHash: newHash,
        unlockPending: false,
        unlockPendingAt: null,
        sessionVersion: sql`${playersTable.sessionVersion} + 1`,
        failedLogins: 0,
        lockoutUntil: null,
        lastFailedLoginAt: null,
      })
      // The expiry lives in the predicate too, so a claim that started just
      // before the deadline can't consume an unlock just after it.
      .where(
        sql`${playersTable.id} = ${player.id} AND ${playersTable.unlockPending} = true AND ${playersTable.unlockPendingAt} IS NOT NULL AND ${playersTable.unlockPendingAt} >= now() - interval '60 minutes'`,
      )
      .returning({ sessionVersion: playersTable.sessionVersion });
    if (!claimed) {
      await recordFailedLogin(player.id);
      res.status(401).json({ message: "Wrong username or password" });
      return;
    }
    sessionVersion = claimed.sessionVersion;
    req.log.info({ username: player.username }, "Unlocked account claimed: password reset on login");
  } else if (!passwordOk) {
    await recordFailedLogin(player.id);
    res.status(401).json({ message: "Wrong username or password" });
    return;
  } else if (player.unlockPending) {
    // Correct old password while unlocked — account is fine; close the window.
    await db
      .update(playersTable)
      .set({ unlockPending: false, unlockPendingAt: null })
      .where(eq(playersTable.id, player.id));
  }
  if (player.banned) {
    res.status(403).json({ message: "Your account has been banned" });
    return;
  }
  await clearLoginFailures(player);
  setSessionCookie(res, player.id, sessionVersion);
  res.json(LoginResponse.parse({ username: player.username }));
});

router.post("/auth/logout", (_req, res): void => {
  clearSessionCookie(res);
  res.json(LogoutResponse.parse({ message: "Logged out" }));
});

export default router;
