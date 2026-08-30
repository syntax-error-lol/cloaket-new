import { and, eq, sql } from "drizzle-orm";
import {
  db,
  playersTable,
  ownedBlooksTable,
  tradesTable,
  tradeMessagesTable,
  type TradeRow,
  type TradeBlookEntry,
} from "@workspace/db";
import { getBlookDef, addBlookToPlayer, syncCollectorBadge } from "./game";

const BOT_ACTION_COOLDOWN_MS = 4000;

export function offerValue(tokens: number, blooks: TradeBlookEntry[]): number {
  let value = tokens;
  for (const b of blooks) {
    const def = getBlookDef(b.name);
    if (def) value += def.price * b.quantity;
  }
  return value;
}

async function botSay(tradeId: number, botId: number, content: string) {
  await db.insert(tradeMessagesTable).values({ tradeId, playerId: botId, content });
}

async function botInventory(botId: number) {
  return db
    .select()
    .from(ownedBlooksTable)
    .where(eq(ownedBlooksTable.playerId, botId));
}

/**
 * Advance the bot partner's behavior for a trade. Called on every trade poll.
 * Returns the (possibly updated) trade row.
 */
export async function botTick(trade: TradeRow): Promise<TradeRow> {
  if (trade.status !== "active") return trade;
  const now = Date.now();
  const botId = trade.partnerId;
  const [partner] = await db
    .select({ isBot: playersTable.isBot })
    .from(playersTable)
    .where(eq(playersTable.id, botId));
  if (!partner?.isBot) return trade; // human-vs-human trade — no bot behavior

  if (!trade.botGreeted) {
    await botSay(
      trade.id,
      botId,
      "hey! whatcha got for trade? throw something in and I'll try to match it",
    );
    const [updated] = await db
      .update(tradesTable)
      .set({ botGreeted: true, botLastActionAt: new Date(now) })
      .where(eq(tradesTable.id, trade.id))
      .returning();
    return updated!;
  }

  const last = trade.botLastActionAt?.getTime() ?? 0;
  if (now - last < BOT_ACTION_COOLDOWN_MS) return trade;

  const myValue = offerValue(trade.myTokens, trade.myBlooks);
  const botValue = offerValue(trade.partnerTokens, trade.partnerBlooks);

  // Player hasn't offered anything yet — wait.
  if (myValue <= 0) return trade;

  // Try to roughly match the player's offer value.
  if (botValue < myValue * 0.85) {
    const newBlooks: TradeBlookEntry[] = [...trade.partnerBlooks];
    let newValue = botValue;
    // Occasionally add a blook from the bot's inventory
    const inv = await botInventory(botId);
    const offeredNames = new Set(newBlooks.map((b) => b.name));
    const candidates = inv.filter((r) => {
      const def = getBlookDef(r.blookName);
      return (
        def &&
        !offeredNames.has(r.blookName) &&
        def.price <= myValue - newValue
      );
    });
    let addedBlook: string | null = null;
    if (candidates.length > 0 && Math.random() < 0.6) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)]!;
      newBlooks.push({ name: pick.blookName, quantity: 1 });
      newValue += getBlookDef(pick.blookName)!.price;
      addedBlook = pick.blookName;
    }
    // Top up with tokens to ~90-105% of the player's value
    const target = Math.round(myValue * (0.9 + Math.random() * 0.15));
    const newTokens = Math.max(trade.partnerTokens, trade.partnerTokens + (target - newValue));

    const [updated] = await db
      .update(tradesTable)
      .set({
        partnerBlooks: newBlooks,
        partnerTokens: newTokens,
        // Bot changed its offer: the player's accept is cancelled
        myAccepted: false,
        botLastActionAt: new Date(now),
      })
      .where(eq(tradesTable.id, trade.id))
      .returning();
    await botSay(
      trade.id,
      botId,
      addedBlook
        ? `added my ${addedBlook} and some tokens, how's that look?`
        : "bumped my tokens a bit, that should be close",
    );
    return updated!;
  }

  // Offers are roughly balanced — bot accepts once the player accepted.
  if (trade.myAccepted && !trade.partnerAccepted && botValue <= myValue * 1.25) {
    const [updated] = await db
      .update(tradesTable)
      .set({ partnerAccepted: true, botLastActionAt: new Date(now) })
      .where(eq(tradesTable.id, trade.id))
      .returning();
    await botSay(trade.id, botId, "deal! accepting now");
    return updated!;
  }

  // Bot is over-offering badly — it trims tokens (which cancels player's accept).
  if (botValue > myValue * 1.6 && trade.partnerTokens > 0) {
    const target = Math.round(myValue * 1.05);
    const blookValue = offerValue(0, trade.partnerBlooks);
    const newTokens = Math.max(0, target - blookValue);
    if (newTokens < trade.partnerTokens) {
      const [updated] = await db
        .update(tradesTable)
        .set({
          partnerTokens: newTokens,
          myAccepted: false,
          botLastActionAt: new Date(now),
        })
        .where(eq(tradesTable.id, trade.id))
        .returning();
      await botSay(trade.id, botId, "hold on, that was too many tokens from me, evening it out");
      return updated!;
    }
  }

  return trade;
}

export async function removeBlookFrom(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ownerId: number,
  name: string,
  quantity: number,
): Promise<boolean> {
  const [owned] = await tx
    .select()
    .from(ownedBlooksTable)
    .where(
      and(
        eq(ownedBlooksTable.playerId, ownerId),
        eq(ownedBlooksTable.blookName, name),
      ),
    )
    .for("update");
  if (!owned || owned.quantity < quantity) return false;
  if (owned.quantity - quantity <= 0) {
    await tx.delete(ownedBlooksTable).where(eq(ownedBlooksTable.id, owned.id));
  } else {
    await tx
      .update(ownedBlooksTable)
      .set({ quantity: owned.quantity - quantity })
      .where(eq(ownedBlooksTable.id, owned.id));
  }
  return true;
}

export async function addBlookTo(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ownerId: number,
  name: string,
  quantity: number,
) {
  const [existing] = await tx
    .select()
    .from(ownedBlooksTable)
    .where(
      and(
        eq(ownedBlooksTable.playerId, ownerId),
        eq(ownedBlooksTable.blookName, name),
      ),
    )
    .for("update");
  if (existing) {
    await tx
      .update(ownedBlooksTable)
      .set({ quantity: sql`${ownedBlooksTable.quantity} + ${quantity}` })
      .where(eq(ownedBlooksTable.id, existing.id));
  } else {
    await tx
      .insert(ownedBlooksTable)
      .values({ playerId: ownerId, blookName: name, quantity });
  }
}

/**
 * Execute the swap when both sides have accepted.
 *
 * Single-winner: atomically transitions the trade active -> completed first,
 * so concurrent callers (accept endpoint + poll) can't double-apply transfers.
 * All transfers run in one transaction; on validation failure the trade is
 * reverted to active with both accepts cleared (never a 500, never a partial swap).
 */
export async function completeTrade(trade: TradeRow): Promise<TradeRow> {
  const playerId = trade.playerId;
  const botId = trade.partnerId;
  const [partnerRow] = await db
    .select({ isBot: playersTable.isBot })
    .from(playersTable)
    .where(eq(playersTable.id, botId));
  const partnerIsBot = partnerRow?.isBot ?? false;

  // Claim the completion: only one caller wins this transition.
  const [claimed] = await db
    .update(tradesTable)
    .set({ status: "completed", endedAt: new Date() })
    .where(and(eq(tradesTable.id, trade.id), eq(tradesTable.status, "active")))
    .returning();
  if (!claimed) {
    // Someone else already completed (or declined) it — return current state.
    const [current] = await db
      .select()
      .from(tradesTable)
      .where(eq(tradesTable.id, trade.id));
    return current ?? trade;
  }

  try {
    await db.transaction(async (tx) => {
      // Validate + lock player tokens
      const [player] = await tx
        .select()
        .from(playersTable)
        .where(eq(playersTable.id, playerId))
        .for("update");
      if (!player || player.tokens < claimed.myTokens) {
        throw new Error("Not enough tokens to complete the trade");
      }
      // Validate + lock partner tokens too (may be a human offering tokens)
      const [partnerPlayer] = await tx
        .select()
        .from(playersTable)
        .where(eq(playersTable.id, botId))
        .for("update");
      if (!partnerPlayer || partnerPlayer.tokens < claimed.partnerTokens) {
        throw new Error("Partner doesn't have enough tokens");
      }
      // Player gives blooks to bot
      for (const b of claimed.myBlooks) {
        const ok = await removeBlookFrom(tx, playerId, b.name, b.quantity);
        if (!ok) throw new Error(`You no longer have ${b.quantity}x ${b.name}`);
        await addBlookTo(tx, botId, b.name, b.quantity);
      }
      // Bot gives blooks to player (bot inventory is consumed too)
      for (const b of claimed.partnerBlooks) {
        const ok = await removeBlookFrom(tx, botId, b.name, b.quantity);
        if (!ok) throw new Error("Partner no longer has the offered blooks");
        await addBlookTo(tx, playerId, b.name, b.quantity);
      }
      // Token exchange
      const net = claimed.partnerTokens - claimed.myTokens;
      await tx
        .update(playersTable)
        .set({
          tokens: sql`${playersTable.tokens} + ${net}`,
          ...(net >= 0
            ? { tokensEarned: sql`${playersTable.tokensEarned} + ${net}` }
            : { tokensSpent: sql`${playersTable.tokensSpent} + ${-net}` }),
        })
        .where(eq(playersTable.id, playerId));
      await tx
        .update(playersTable)
        .set({
          tokens: sql`${playersTable.tokens} - ${net}`,
          ...(net <= 0
            ? { tokensEarned: sql`${playersTable.tokensEarned} + ${-net}` }
            : { tokensSpent: sql`${playersTable.tokensSpent} + ${net}` }),
        })
        .where(eq(playersTable.id, botId));
    });
  } catch (err) {
    // Revert to active, clear both accepts, and tell the player why.
    const [reverted] = await db
      .update(tradesTable)
      .set({ myAccepted: false, partnerAccepted: false, status: "active", endedAt: null })
      .where(eq(tradesTable.id, trade.id))
      .returning();
    if (partnerIsBot) {
      await botSay(
        trade.id,
        botId,
        err instanceof Error
          ? `trade fell through: ${err.message.toLowerCase()}`
          : "hm, that trade didn't go through, let's retry",
      );
    }
    return reverted!;
  }

  // Trades can push either party above or below the Collector threshold.
  await Promise.all([syncCollectorBadge(playerId), syncCollectorBadge(botId)]);

  if (partnerIsBot) {
    await botSay(trade.id, botId, "nice doing business with you!");
  }
  return claimed;
}
