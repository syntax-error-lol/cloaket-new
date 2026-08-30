import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import {
  db,
  playersTable,
  ownedBlooksTable,
  tradesTable,
  tradeRequestsTable,
  type TradeRow,
  type TradeBlookEntry,
  type TradeRequestRow,
  type Player,
} from "@workspace/db";
import { getBlookDef, playerAvatarImage } from "./game";
import { botTick, completeTrade } from "./tradeBot";

/**
 * Shared trade actions used by BOTH the web routes (routes/trades.ts) and the
 * Discord bot (discord/bot.ts). Change trade behavior here, not in the routes.
 */

export function offerBlooks(entries: TradeBlookEntry[]) {
  return entries
    .map((e) => {
      const def = getBlookDef(e.name);
      if (!def) return null;
      return {
        name: e.name,
        quantity: e.quantity,
        rarity: def.rarity,
        image: def.image,
        price: def.price,
      };
    })
    .filter((e) => e !== null);
}

/** True when the viewer occupies the trade's "A" side (the "my" columns). */
export function isSideA(trade: TradeRow, viewerId: number): boolean {
  return trade.playerId === viewerId;
}

/** Render a trade relative to the viewer, swapping sides when they are side B. */
export async function tradeView(trade: TradeRow, viewerId: number) {
  const sideA = isSideA(trade, viewerId);
  const otherId = sideA ? trade.partnerId : trade.playerId;
  const [partner] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.id, otherId));
  const mine = sideA
    ? { tokens: trade.myTokens, blooks: trade.myBlooks, accepted: trade.myAccepted }
    : { tokens: trade.partnerTokens, blooks: trade.partnerBlooks, accepted: trade.partnerAccepted };
  const theirs = sideA
    ? { tokens: trade.partnerTokens, blooks: trade.partnerBlooks, accepted: trade.partnerAccepted }
    : { tokens: trade.myTokens, blooks: trade.myBlooks, accepted: trade.myAccepted };
  return {
    id: trade.id,
    status: trade.status,
    partnerName: partner?.username ?? "Unknown",
    partnerAvatarBlook: partner?.avatarBlook ?? null,
    partnerAvatarImage: playerAvatarImage(partner?.avatarBlook ?? null, partner?.username ?? null, partner?.customAvatarUrl ?? null),
    myOffer: { tokens: mine.tokens, blooks: offerBlooks(mine.blooks) },
    partnerOffer: { tokens: theirs.tokens, blooks: offerBlooks(theirs.blooks) },
    myAccepted: mine.accepted,
    partnerAccepted: theirs.accepted,
    createdAt: trade.createdAt.toISOString(),
  };
}

export type TradeViewData = Awaited<ReturnType<typeof tradeView>>;

type Dbish = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Decline any active trades the given players are in (superseded by a new trade). */
export async function endActiveTradesFor(playerIds: number[], tx: Dbish = db): Promise<void> {
  await tx
    .update(tradesTable)
    .set({
      status: "declined",
      myAccepted: false,
      partnerAccepted: false,
      endedAt: new Date(),
    })
    .where(
      and(
        or(
          inArray(tradesTable.playerId, playerIds),
          inArray(tradesTable.partnerId, playerIds),
        ),
        eq(tradesTable.status, "active"),
      ),
    );
}

export async function activeTrade(playerId: number): Promise<TradeRow | undefined> {
  const [trade] = await db
    .select()
    .from(tradesTable)
    .where(
      and(
        or(
          eq(tradesTable.playerId, playerId),
          eq(tradesTable.partnerId, playerId),
        ),
        eq(tradesTable.status, "active"),
      ),
    )
    .orderBy(desc(tradesTable.id))
    .limit(1);
  return trade;
}

export async function startTradeBetween(aId: number, bId: number, tx: Dbish = db): Promise<TradeRow> {
  const [trade] = await tx
    .insert(tradesTable)
    .values({ playerId: aId, partnerId: bId })
    .returning();
  return trade!;
}

/**
 * Supersede everything for a new trade between two players (in a transaction):
 * end their active trades, cancel/decline all OTHER pending requests involving
 * either of them, then start the new trade.
 */
export async function supersedeAndStartTrade(
  aId: number,
  bId: number,
  exceptRequestId: number,
): Promise<TradeRow> {
  return db.transaction(async (tx) => {
    await endActiveTradesFor([aId, bId], tx);
    await tx
      .update(tradeRequestsTable)
      .set({ status: "declined" })
      .where(
        and(
          or(
            inArray(tradeRequestsTable.fromId, [aId, bId]),
            inArray(tradeRequestsTable.toId, [aId, bId]),
          ),
          eq(tradeRequestsTable.status, "pending"),
          ne(tradeRequestsTable.id, exceptRequestId),
        ),
      );
    return startTradeBetween(aId, bId, tx);
  });
}

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Send a trade request to a player by username (bots auto-accept). */
export async function sendTradeRequest(
  me: Pick<Player, "id" | "username">,
  targetUsername: string,
): Promise<ActionResult<{ request: TradeRequestRow; target: Player; autoStarted: boolean }>> {
  const [target] = await db
    .select()
    .from(playersTable)
    .where(sql`lower(${playersTable.username}) = lower(${targetUsername})`);
  if (!target) return { ok: false, error: "Player not found" };
  // Dev-only escape hatch: extravextra may trade with themselves to preview
  // the active-trade UI. Never enabled in production.
  const selfTradeAllowed =
    process.env.NODE_ENV !== "production" &&
    me.username.toLowerCase() === "extravextra";
  if (target.id === me.id && !selfTradeAllowed) {
    return { ok: false, error: "You can't trade with yourself" };
  }
  const [existing] = await db
    .select()
    .from(tradeRequestsTable)
    .where(
      and(
        eq(tradeRequestsTable.status, "pending"),
        eq(tradeRequestsTable.fromId, me.id),
        eq(tradeRequestsTable.toId, target.id),
      ),
    );
  if (existing) return { ok: false, error: "Request already sent" };
  let status = "pending";
  if (target.isBot || target.id === me.id) {
    // Bots always accept immediately; self-trades (dev only) do too.
    status = "accepted";
  }
  const [request] = await db
    .insert(tradeRequestsTable)
    .values({ fromId: me.id, toId: target.id, status })
    .returning();
  const autoStarted = target.isBot || target.id === me.id;
  if (autoStarted) {
    await supersedeAndStartTrade(me.id, target.id, request!.id);
  }
  return { ok: true, value: { request: request!, target, autoStarted } };
}

/** Accept a pending incoming request (atomic — only one accept wins). */
export async function acceptTradeRequest(
  meId: number,
  requestId: number,
): Promise<ActionResult<TradeRow>> {
  const [request] = await db
    .select()
    .from(tradeRequestsTable)
    .where(eq(tradeRequestsTable.id, requestId));
  if (!request || request.toId !== meId || request.status !== "pending") {
    return { ok: false, error: "Request is no longer available" };
  }
  const [claimed] = await db
    .update(tradeRequestsTable)
    .set({ status: "accepted" })
    .where(
      and(
        eq(tradeRequestsTable.id, requestId),
        eq(tradeRequestsTable.status, "pending"),
      ),
    )
    .returning();
  if (!claimed) return { ok: false, error: "Request is no longer available" };
  const trade = await supersedeAndStartTrade(request.fromId, meId, requestId);
  return { ok: true, value: trade };
}

/** Most recent pending incoming request for a player (used by the Discord bot). */
export async function latestIncomingRequest(meId: number): Promise<TradeRequestRow | undefined> {
  const [row] = await db
    .select()
    .from(tradeRequestsTable)
    .where(
      and(
        eq(tradeRequestsTable.toId, meId),
        eq(tradeRequestsTable.status, "pending"),
      ),
    )
    .orderBy(desc(tradeRequestsTable.id))
    .limit(1);
  return row;
}

/**
 * Replace the player's entire offer (tokens + blooks) on their active trade.
 * Validates token balance and blook ownership; resets both accepts.
 */
export async function setTradeOffer(
  me: Pick<Player, "id" | "tokens">,
  tokens: number,
  blooks: { name: string; quantity: number }[],
): Promise<ActionResult<TradeRow>> {
  const trade = await activeTrade(me.id);
  if (!trade) return { ok: false, error: "No active trade" };
  if (tokens < 0 || !Number.isInteger(tokens)) return { ok: false, error: "Invalid token amount" };
  if (tokens > me.tokens) return { ok: false, error: "You don't have that many tokens" };
  // Merge duplicate entries and validate ownership
  const merged = new Map<string, number>();
  for (const b of blooks) {
    if (!getBlookDef(b.name)) return { ok: false, error: `Unknown blook: ${b.name}` };
    if (b.quantity <= 0 || !Number.isInteger(b.quantity)) {
      return { ok: false, error: `Invalid quantity for ${b.name}` };
    }
    merged.set(b.name, (merged.get(b.name) ?? 0) + b.quantity);
  }
  for (const [name, quantity] of merged) {
    const [owned] = await db
      .select()
      .from(ownedBlooksTable)
      .where(
        and(
          eq(ownedBlooksTable.playerId, me.id),
          eq(ownedBlooksTable.blookName, name),
        ),
      );
    if (!owned || owned.quantity < quantity) {
      return { ok: false, error: `You don't have ${quantity}x ${name}` };
    }
  }
  const entries: TradeBlookEntry[] = [...merged].map(([name, quantity]) => ({
    name,
    quantity,
  }));
  // Conditional on status so a completed/declined trade can never be edited
  // by a racing request.
  const [updated] = await db
    .update(tradesTable)
    .set({
      ...(isSideA(trade, me.id)
        ? { myTokens: tokens, myBlooks: entries }
        : { partnerTokens: tokens, partnerBlooks: entries }),
      // Changing my offer cancels BOTH accepts
      myAccepted: false,
      partnerAccepted: false,
    })
    .where(and(eq(tradesTable.id, trade.id), eq(tradesTable.status, "active")))
    .returning();
  if (!updated) return { ok: false, error: "No active trade" };
  return { ok: true, value: updated };
}

/** The player's current offer entries on their active trade (bot helpers). */
export function myOfferEntries(trade: TradeRow, meId: number): { tokens: number; blooks: TradeBlookEntry[] } {
  return isSideA(trade, meId)
    ? { tokens: trade.myTokens, blooks: trade.myBlooks }
    : { tokens: trade.partnerTokens, blooks: trade.partnerBlooks };
}

/** Toggle the player's accept flag; completes the trade when both accepted. */
export async function toggleTradeAccept(meId: number): Promise<ActionResult<TradeRow>> {
  let trade = await activeTrade(meId);
  if (!trade) return { ok: false, error: "No active trade" };
  const sideA = isSideA(trade, meId);
  // Conditional on status AND the accept flag we read, so concurrent toggles
  // or a racing completion/decline can't double-flip or resurrect the trade.
  const [updated] = await db
    .update(tradesTable)
    .set(
      sideA
        ? { myAccepted: !trade.myAccepted }
        : { partnerAccepted: !trade.partnerAccepted },
    )
    .where(
      and(
        eq(tradesTable.id, trade.id),
        eq(tradesTable.status, "active"),
        sideA
          ? eq(tradesTable.myAccepted, trade.myAccepted)
          : eq(tradesTable.partnerAccepted, trade.partnerAccepted),
      ),
    )
    .returning();
  if (!updated) return { ok: false, error: "The trade just changed — check it and try again" };
  trade = updated;
  if (trade.myAccepted && trade.partnerAccepted) {
    trade = await completeTrade(trade);
  }
  return { ok: true, value: trade };
}

/** Decline/end the player's active trade. */
export async function declineActiveTrade(meId: number): Promise<ActionResult<TradeRow>> {
  const trade = await activeTrade(meId);
  if (!trade) return { ok: false, error: "No active trade" };
  const [updated] = await db
    .update(tradesTable)
    .set({ status: "declined", myAccepted: false, partnerAccepted: false, endedAt: new Date() })
    .where(and(eq(tradesTable.id, trade.id), eq(tradesTable.status, "active")))
    .returning();
  if (!updated) return { ok: false, error: "No active trade" };
  return { ok: true, value: updated };
}

/** Current trade after running bot logic + auto-completion (matches GET /trades/current). */
export async function refreshedActiveTrade(meId: number): Promise<TradeRow | undefined> {
  let trade = await activeTrade(meId);
  if (!trade) return undefined;
  trade = await botTick(trade);
  if (trade.status === "active" && trade.myAccepted && trade.partnerAccepted) {
    trade = await completeTrade(trade);
  }
  return trade;
}
