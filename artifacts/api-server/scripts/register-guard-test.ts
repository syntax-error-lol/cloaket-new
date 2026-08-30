/**
 * End-to-end test for the DB-backed registration flood guards, WITHOUT
 * touching the maintenance gate in app.ts: mounts only the auth router on a
 * throwaway port against the dev database, spoofing client IPs via
 * X-Forwarded-For (trust proxy is fully open in this harness only).
 *
 * Run from artifacts/api-server (fully bundled — see the shell command in
 * the repair notes): the harness stubs req.log because pino-http (an
 * app.ts middleware) is deliberately not mounted here.
 */
import express from "express";
import cookieParser from "cookie-parser";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import authRouter from "../src/routes/auth";

const app = express();
app.set("trust proxy", true); // test harness only — lets XFF set req.ip
app.use(cookieParser());
app.use(express.json());
// pino-http lives in app.ts, not this harness — stub req.log so routes can log.
app.use((req, _res, next) => {
  (req as unknown as { log: object }).log = { info() {}, warn() {}, error() {} };
  next();
});
app.use("/api", authRouter);

const PASSWORD = "GuardTest#123";
let failures = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`);
}

async function register(port: number, username: string, ip: string) {
  const r = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  return { status: r.status, body: (await r.json()) as { message?: string } };
}

async function cleanup() {
  // '#_' escapes the underscore — plain 'RGT_%' would treat _ as a wildcard
  // and could sweep up an unrelated dev account named RGTsomething.
  await db.execute(sql`DELETE FROM players WHERE username LIKE 'RGT#_%' ESCAPE '#'`);
}

async function seed(prefix: string, count: number, lastIp: string | null) {
  for (let i = 0; i < count; i++) {
    await db.execute(sql`
      INSERT INTO players (username, password_hash, tokens, is_bot, last_ip, created_at)
      VALUES (${`${prefix}${i}`}, 'x:x', 0, false, ${lastIp}, now())
      ON CONFLICT DO NOTHING
    `);
  }
}

const server = app.listen(0, async () => {
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  try {
    await cleanup();

    // 1. Normal signup succeeds and records the signup IP.
    const a = await register(port, "RGT_alpha", "7.7.7.7");
    check("normal signup returns 201", a.status === 201, a);
    const row = (await db.execute(
      sql`SELECT last_ip FROM players WHERE username = 'RGT_alpha'`,
    )) as unknown as { rows: Array<{ last_ip: string | null }> };
    check("signup recorded last_ip", row.rows[0]?.last_ip === "7.7.7.7", row.rows[0]);

    // 2. Per-IP hourly cap: 8 recent accounts already on this IP → 429.
    await seed("RGT_ip", 8, "9.9.9.9");
    const b = await register(port, "RGT_bravo", "9.9.9.9");
    check(
      "9th account from one IP inside an hour is throttled (429)",
      b.status === 429 && /network/i.test(b.body.message ?? ""),
      b,
    );

    // 3. Global breaker: ≥25 signups game-wide in 10 min → 429 for everyone.
    await seed("RGT_glob", 20, null); // plus the 9 rows above ≥ 25 total
    const c = await register(port, "RGT_charlie", "6.6.6.6");
    check(
      "global flood breaker pauses signups (429)",
      c.status === 429 && /paused/i.test(c.body.message ?? ""),
      c,
    );
  } catch (err) {
    failures += 1;
    console.error("Test run crashed:", err);
  } finally {
    await cleanup();
    console.log(failures === 0 ? "ALL GUARD TESTS PASSED" : `${failures} TEST(S) FAILED`);
    server.close();
    process.exit(failures === 0 ? 0 : 1);
  }
});
