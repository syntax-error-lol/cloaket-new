import type { Request, Response, NextFunction } from "express";

/**
 * Simple in-memory per-IP rate limiter to blunt online password guessing.
 * Not distributed — good enough for a single-process server.
 */
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip ?? "unknown";
    const now = Date.now();
    const bucket = buckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      // Opportunistically prune expired buckets so the map can't grow forever.
      if (buckets.size > 10_000) {
        for (const [key, b] of buckets) {
          if (b.resetAt <= now) buckets.delete(key);
        }
      }
      buckets.set(ip, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.status(429).json({ message: "Too many attempts, slow down" });
      return;
    }
    next();
  };
}
