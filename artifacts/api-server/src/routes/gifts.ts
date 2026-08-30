import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db, playersTable } from "@workspace/db";
import { SendGiftBody } from "@workspace/api-zod";
import { getBlookDef, syncCollectorBadge } from "../lib/game";
import { removeBlookFrom, addBlookTo } from "../lib/tradeBot";

const router: IRouter = Router();

/**
 * One-way gift: tokens and/or blooks transferred directly to another player.
 * All transfers run in ONE transaction — sender rows are locked and checked
 * (conditional token deduct, FOR UPDATE blook rows), so a failed check rolls
 * everything back and nothing is ever lost or duplicated.
 */
router.post("/gifts/send", async (req, res): Promise<void> => {
  const parsed = SendGiftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const me = req.player!;
  const { username, tokens } = parsed.data;
  if (me.muted) {
    res.status(403).json({ message: "You are muted" });
    return;
  }
  if (!Number.isSafeInteger(tokens) || tokens < 0) {
    res.status(400).json({ message: "Invalid token amount" });
    return;
  }

  // Merge duplicate blook entries and validate names/quantities up front.
  const merged = new Map<string, number>();
  for (const b of parsed.data.blooks) {
    if (!getBlookDef(b.name)) {
      res.status(400).json({ message: `Unknown blook: ${b.name}` });
      return;
    }
    if (!Number.isSafeInteger(b.quantity) || b.quantity < 1 || b.quantity > 1_000_000) {
      res.status(400).json({ message: `Invalid quantity for ${b.name}` });
      return;
    }
    merged.set(b.name, (merged.get(b.name) ?? 0) + b.quantity);
  }
  if (tokens <= 0 && merged.size === 0) {
    res.status(400).json({ message: "Pick something to gift first" });
    return;
  }

  const [target] = await db
    .select({ id: playersTable.id, username: playersTable.username, isBot: playersTable.isBot, banned: playersTable.banned })
    .from(playersTable)
    .where(sql`lower(${playersTable.username}) = lower(${username})`);
  if (!target || target.isBot || target.banned) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  if (target.id === me.id) {
    res.status(400).json({ message: "You can't gift yourself" });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      if (tokens > 0) {
        // Conditional deduct — never lets the sender go negative.
        const deducted = await tx
          .update(playersTable)
          .set({ tokens: sql`${playersTable.tokens} - ${tokens}` })
          .where(and(eq(playersTable.id, me.id), sql`${playersTable.tokens} >= ${tokens}`))
          .returning({ id: playersTable.id });
        if (deducted.length === 0) throw new Error("You don't have that many tokens");
        await tx
          .update(playersTable)
          .set({ tokens: sql`${playersTable.tokens} + ${tokens}` })
          .where(eq(playersTable.id, target.id));
      }
      for (const [name, quantity] of merged) {
        const ok = await removeBlookFrom(tx, me.id, name, quantity);
        if (!ok) throw new Error(`You don't have ${quantity}x ${name}`);
        await addBlookTo(tx, target.id, name, quantity);
      }
    });
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Gift failed" });
    return;
  }

  // Blooks changed hands — keep both players' Collector badges accurate.
  if (merged.size > 0) {
    await Promise.all([syncCollectorBadge(me.id), syncCollectorBadge(target.id)]);
  }

  req.log.info(
    { from: me.username, to: target.username, tokens, blooks: [...merged.entries()] },
    "Gift sent",
  );
  res.json({ message: `Gift sent to ${target.username}!` });
});

export default router;
