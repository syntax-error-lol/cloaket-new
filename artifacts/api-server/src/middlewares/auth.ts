import type { NextFunction, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, playersTable, type Player } from "@workspace/db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      player?: Player;
    }
  }
}

const COOKIE_NAME = "blk_session";
const COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

/**
 * Set the session cookie for a player on the response. The payload embeds
 * the player's current session version — bumping the version (password
 * change/reset) invalidates every cookie issued before the bump.
 */
export function setSessionCookie(res: Response, playerId: number, sessionVersion: number): void {
  const payload = `${playerId}.${Date.now()}.${sessionVersion}`;
  res.cookie(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // dev preview terminates TLS at the proxy
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

/** Verify the session cookie; returns { id, version } or null. */
export function sessionFromRequest(req: Request): { id: number; version: number } | null {
  const raw = (req.cookies as Record<string, string> | undefined)?.[COOKIE_NAME];
  if (!raw) return null;
  const lastDot = raw.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const payload = raw.slice(0, lastDot);
  const sig = raw.slice(lastDot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [idPart, tsPart, versionPart] = payload.split(".");
  const id = Number(idPart);
  const ts = Number(tsPart);
  if (!Number.isInteger(id) || !Number.isFinite(ts)) return null;
  if (Date.now() - ts > COOKIE_MAX_AGE_MS) return null;
  if (ts > Date.now() + 5 * 60_000) return null; // forged/clock-skewed future timestamp
  // Cookies issued before session versioning have a 2-part payload; they
  // count as version 1 and die as soon as the account's version moves on.
  const version = versionPart === undefined ? 1 : Number(versionPart);
  if (!Number.isInteger(version) || version < 1) return null;
  return { id, version };
}

/** Verify the session cookie; returns the player id or null. */
export function sessionPlayerId(req: Request): number | null {
  return sessionFromRequest(req)?.id ?? null;
}

/** Requires a signed-in player (session cookie) and attaches req.player. */
export async function requirePlayer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = sessionFromRequest(req);
    if (session === null) {
      res.status(401).json({ message: "Sign in to play" });
      return;
    }
    const [player] = await db
      .select()
      .from(playersTable)
      .where(eq(playersTable.id, session.id));
    if (!player || player.isBot) {
      clearSessionCookie(res);
      res.status(401).json({ message: "Sign in to play" });
      return;
    }
    if (player.banned) {
      clearSessionCookie(res);
      res.status(401).json({ message: "Your account has been banned" });
      return;
    }
    if (session.version !== player.sessionVersion) {
      // Password changed/reset since this cookie was issued — session is dead.
      clearSessionCookie(res);
      res.status(401).json({ message: "Sign in to play" });
      return;
    }
    // Throttled presence tracking: refresh last_seen_at at most once a minute.
    // The WHERE clause makes the throttle atomic under concurrent requests.
    // Also record the client IP — immediately if it changed, otherwise along
    // with the throttled presence write.
    const now = Date.now();
    const ip = req.ip ?? null;
    const ipChanged = ip !== null && player.lastIp !== ip;
    if (ipChanged || !player.lastSeenAt || now - player.lastSeenAt.getTime() > 60_000) {
      const where = ipChanged
        ? sql`${playersTable.id} = ${player.id}`
        : sql`${playersTable.id} = ${player.id} AND (${playersTable.lastSeenAt} IS NULL OR ${playersTable.lastSeenAt} < ${new Date(now - 60_000)})`;
      db.update(playersTable)
        .set({ lastSeenAt: new Date(now), ...(ip !== null ? { lastIp: ip } : {}) })
        .where(where)
        .catch((err) => {
          console.warn("[presence] failed to update last_seen_at:", err);
        });
    }
    req.player = player;
    next();
  } catch (err) {
    next(err);
  }
}
