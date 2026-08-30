import type { Request, Response, NextFunction } from "express";

const WINDOW_MS = 10 * 60_000; // failures counted inside this window
const MAX_FAILS = 10; // wrong-password responses allowed per window
const BLOCK_MS = 15 * 60_000; // cooldown once the threshold is hit

const buckets = new Map<string, { fails: number[]; blockedUntil: number }>();

/**
 * Brute-force guard for the staff panels (shared-password routes under
 * /admin, /mod, /owner, /coowner). Counts 401 responses (wrong password)
 * per IP across all staff endpoints; too many failures put that IP's staff
 * routes on a cooldown. Gameplay routes are untouched, and staff with the
 * right password never accumulate failures. In-memory per instance — a
 * speed bump on top of strong staff passwords, not a replacement for them.
 */
export function staffBruteforceGuard(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (bucket && bucket.blockedUntil > now) {
    res.status(429).json({ message: "Too many failed attempts. Try again later." });
    return;
  }
  res.on("finish", () => {
    if (res.statusCode !== 401) return;
    const t = Date.now();
    const b = buckets.get(ip) ?? { fails: [], blockedUntil: 0 };
    b.fails = b.fails.filter((ts) => ts > t - WINDOW_MS);
    b.fails.push(t);
    if (b.fails.length >= MAX_FAILS) {
      b.blockedUntil = t + BLOCK_MS;
      b.fails = [];
    }
    buckets.set(ip, b);
    // Opportunistic prune so the map can't grow forever.
    if (buckets.size > 10_000) {
      for (const [key, v] of buckets) {
        if (v.blockedUntil <= t && (v.fails[v.fails.length - 1] ?? 0) <= t - WINDOW_MS) {
          buckets.delete(key);
        }
      }
    }
  });
  next();
}
