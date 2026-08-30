import type { NextFunction, Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db, playersTable } from "@workspace/db";
import { sessionPlayerId } from "./auth";
import { isPanelApprovalEnabled } from "../routes/owner";

/** Panels that can be approved per account. /blookgen counts as "admin". */
export const PANELS = ["admin", "mod", "coowner", "owner"] as const;
export type Panel = (typeof PANELS)[number];

/**
 * Which panel approvals satisfy this request. Most /admin endpoints need
 * "admin", but IP bans and Cloaket AI scans are shared tools that mods use
 * with the MOD_PASSWORD (the routes themselves accept it), so approval for
 * either the admin OR mod panel is enough there. Owner- and coowner-approved
 * accounts pass every gate their passwords are accepted on: both panels embed
 * the admin and mod tools, so those approvals must open /admin and /mod too.
 */
function panelsForRequest(baseUrl: string, path: string): Panel[] {
  if (baseUrl.endsWith("/mod")) return ["mod", "coowner", "owner"];
  if (baseUrl.endsWith("/owner")) return ["owner", "coowner"];
  if (baseUrl.endsWith("/coowner")) return ["coowner", "owner"];
  // /blookgen has no password check of its own — the approval IS the gate,
  // and it consumes paid AI generation. Keep it strictly admin-approved.
  if (baseUrl.endsWith("/blookgen")) return ["admin"];
  // /admin
  if (baseUrl.endsWith("/admin") && (path.startsWith("/ip-bans") || path.startsWith("/ai-scan"))) {
    return ["admin", "mod", "coowner", "owner"];
  }
  return ["admin", "coowner", "owner"];
}

/**
 * Staff-panel gate: while the owner has turned approval ON, only accounts
 * approved for the specific panel may even attempt its password on /admin,
 * /mod, /owner, or /blookgen endpoints. Runs BEFORE any password comparison,
 * so unapproved accounts can't brute-force panel passwords.
 *
 * The gate can only be enabled by an account approved for the owner panel
 * (see /owner/settings/set), and while NO account has any panel approval
 * requests are allowed through, so the owner can never lock themselves out.
 */
export async function requirePanelApproval(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!(await isPanelApprovalEnabled())) {
      next();
      return;
    }
    const panels = panelsForRequest(req.baseUrl, req.path);
    const playerId = sessionPlayerId(req);
    if (playerId !== null) {
      const [row] = await db
        .select({ access: playersTable.panelAccess })
        .from(playersTable)
        .where(eq(playersTable.id, playerId));
      if (panels.some((p) => row?.access?.includes(p))) {
        next();
        return;
      }
    }
    // Not logged in, or logged in but unapproved — only allowed while NO
    // account has any panel approval yet (first-time setup).
    const [any] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(playersTable)
      .where(sql`${playersTable.panelAccess} <> '[]'::jsonb`);
    if (!any || any.n === 0) {
      next();
      return;
    }
    req.log?.warn({ playerId, panels, path: req.path }, "Unapproved staff-panel attempt blocked");
    res.status(403).json({
      message:
        playerId === null
          ? "Log in first — only approved accounts can use staff panels"
          : "This account isn't approved for this panel",
    });
  } catch (err) {
    next(err);
  }
}
