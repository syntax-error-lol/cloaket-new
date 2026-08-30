import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gt, inArray, ne, or } from "drizzle-orm";
import {
  db,
  playersTable,
  tradesTable,
  tradeMessagesTable,
  tradeRequestsTable,
  type TradeRow,
  type TradeRequestRow,
} from "@workspace/db";
import {
  GetTradeRequestsResponse,
  SendTradeRequestBody,
  SendTradeRequestResponse,
  AcceptTradeRequestResponse,
  DeclineTradeRequestResponse,
  GetCurrentTradeResponse,
  UpdateTradeOfferBody,
  UpdateTradeOfferResponse,
  AcceptTradeResponse,
  DeclineTradeResponse,
  GetTradeMessagesQueryParams,
  GetTradeMessagesResponse,
  SendTradeMessageBody,
  SendTradeMessageResponse,
} from "@workspace/api-zod";
import {
  playerAvatarImage,
  badgeViews,
  containsLink,
  clanTagsForPlayers,
} from "../lib/game";
import { botTick, completeTrade } from "../lib/tradeBot";
import {
  activeTrade,
  tradeView,
  sendTradeRequest,
  acceptTradeRequest,
  setTradeOffer,
  toggleTradeAccept,
  declineActiveTrade,
} from "../lib/tradeActions";
import { areLinksAllowed } from "./owner";

const router: IRouter = Router();

function requestView(
  r: TradeRequestRow,
  meId: number,
  users: Map<number, { username: string; avatarBlook: string | null; customAvatarUrl: string | null }>,
) {
  const from = users.get(r.fromId);
  const to = users.get(r.toId);
  return {
    id: r.id,
    fromUsername: from?.username ?? "Unknown",
    fromAvatarImage: playerAvatarImage(from?.avatarBlook ?? null, from?.username ?? null, from?.customAvatarUrl ?? null),
    toUsername: to?.username ?? "Unknown",
    toAvatarImage: playerAvatarImage(to?.avatarBlook ?? null, to?.username ?? null, to?.customAvatarUrl ?? null),
    direction: r.fromId === meId ? "outgoing" : "incoming",
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}

async function usersMap(ids: number[]) {
  if (ids.length === 0)
    return new Map<number, { username: string; avatarBlook: string | null; customAvatarUrl: string | null }>();
  const rows = await db
    .select({
      id: playersTable.id,
      username: playersTable.username,
      avatarBlook: playersTable.avatarBlook,
      customAvatarUrl: playersTable.customAvatarUrl,
    })
    .from(playersTable)
    .where(inArray(playersTable.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}

router.get("/trades/requests", async (req, res): Promise<void> => {
  const me = req.player!;
  const rows = await db
    .select()
    .from(tradeRequestsTable)
    .where(
      and(
        eq(tradeRequestsTable.status, "pending"),
        or(
          eq(tradeRequestsTable.fromId, me.id),
          eq(tradeRequestsTable.toId, me.id),
        ),
      ),
    )
    .orderBy(desc(tradeRequestsTable.id));
  const users = await usersMap([
    ...new Set(rows.flatMap((r) => [r.fromId, r.toId])),
  ]);
  res.json(
    GetTradeRequestsResponse.parse({
      incoming: rows
        .filter((r) => r.toId === me.id)
        .map((r) => requestView(r, me.id, users)),
      outgoing: rows
        .filter((r) => r.fromId === me.id)
        .map((r) => requestView(r, me.id, users)),
    }),
  );
});

router.post("/trades/requests", async (req, res): Promise<void> => {
  const parsed = SendTradeRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const me = req.player!;
  const result = await sendTradeRequest(me, parsed.data.username);
  if (!result.ok) {
    res.status(result.error === "Player not found" ? 404 : 400).json({ message: result.error });
    return;
  }
  const { request, target } = result.value;
  const users = await usersMap([me.id, target.id]);
  req.log.info({ to: target.username, status: request.status }, "Trade request sent");
  res
    .status(201)
    .json(SendTradeRequestResponse.parse(requestView(request, me.id, users)));
});

router.post("/trades/requests/:id/accept", async (req, res): Promise<void> => {
  const me = req.player!;
  const id = Number(req.params.id);
  const result = await acceptTradeRequest(me.id, id);
  if (!result.ok) {
    res.status(400).json({ message: result.error });
    return;
  }
  req.log.info({ requestId: id, tradeId: result.value.id }, "Trade request accepted");
  res.json(AcceptTradeRequestResponse.parse(await tradeView(result.value, me.id)));
});

router.post("/trades/requests/:id/decline", async (req, res): Promise<void> => {
  const me = req.player!;
  const id = Number(req.params.id);
  const [request] = await db
    .select()
    .from(tradeRequestsTable)
    .where(eq(tradeRequestsTable.id, id));
  if (
    !request ||
    (request.toId !== me.id && request.fromId !== me.id) ||
    request.status !== "pending"
  ) {
    res.status(400).json({ message: "Request is no longer available" });
    return;
  }
  const status = request.toId === me.id ? "declined" : "cancelled";
  await db
    .update(tradeRequestsTable)
    .set({ status })
    .where(eq(tradeRequestsTable.id, id));
  res.json(DeclineTradeRequestResponse.parse({ message: `Request ${status}` }));
});

router.get("/trades/current", async (req, res): Promise<void> => {
  const me = req.player!;
  let trade = await activeTrade(me.id);
  if (!trade) {
    // No active trade — briefly surface a just-ended one so BOTH sides can
    // render the completed/declined screen (the poller would otherwise 404
    // immediately for the side that didn't trigger the final action).
    const [recent] = await db
      .select()
      .from(tradesTable)
      .where(
        and(
          or(
            eq(tradesTable.playerId, me.id),
            eq(tradesTable.partnerId, me.id),
          ),
          ne(tradesTable.status, "active"),
          gt(tradesTable.endedAt, new Date(Date.now() - 45_000)),
        ),
      )
      .orderBy(desc(tradesTable.id))
      .limit(1);
    if (recent) {
      res.json(GetCurrentTradeResponse.parse(await tradeView(recent, me.id)));
      return;
    }
    res.status(404).json({ message: "No active trade" });
    return;
  }
  trade = await botTick(trade);
  if (trade.status === "active" && trade.myAccepted && trade.partnerAccepted) {
    trade = await completeTrade(trade);
  }
  res.json(GetCurrentTradeResponse.parse(await tradeView(trade, me.id)));
});

router.put("/trades/current/offer", async (req, res): Promise<void> => {
  const parsed = UpdateTradeOfferBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid offer" });
    return;
  }
  const me = req.player!;
  const trade = await activeTrade(me.id);
  if (!trade) {
    res.status(400).json({ message: "No active trade" });
    return;
  }
  const { tokens, blooks } = parsed.data;
  const result = await setTradeOffer(me, tokens, blooks);
  if (!result.ok) {
    res.status(400).json({ message: result.error });
    return;
  }
  res.json(UpdateTradeOfferResponse.parse(await tradeView(result.value, me.id)));
});

router.post("/trades/current/accept", async (req, res): Promise<void> => {
  const me = req.player!;
  const result = await toggleTradeAccept(me.id);
  if (!result.ok) {
    res.status(400).json({ message: result.error });
    return;
  }
  req.log.info({ tradeId: result.value.id, status: result.value.status }, "Trade accept toggled");
  res.json(AcceptTradeResponse.parse(await tradeView(result.value, me.id)));
});

router.post("/trades/current/decline", async (req, res): Promise<void> => {
  const me = req.player!;
  const result = await declineActiveTrade(me.id);
  if (!result.ok) {
    res.status(400).json({ message: result.error });
    return;
  }
  req.log.info({ tradeId: result.value.id }, "Trade declined");
  res.json(DeclineTradeResponse.parse(await tradeView(result.value, me.id)));
});

async function currentOrRecentTrade(playerId: number): Promise<TradeRow | undefined> {
  const active = await activeTrade(playerId);
  if (active) return active;
  const [recent] = await db
    .select()
    .from(tradesTable)
    .where(
      or(
        eq(tradesTable.playerId, playerId),
        eq(tradesTable.partnerId, playerId),
      ),
    )
    .orderBy(desc(tradesTable.id))
    .limit(1);
  return recent;
}

router.get("/trades/current/messages", async (req, res): Promise<void> => {
  const query = GetTradeMessagesQueryParams.safeParse(req.query);
  const after = query.success ? query.data.after : undefined;
  const me = req.player!;
  const trade = await currentOrRecentTrade(me.id);
  if (!trade) {
    res.json(GetTradeMessagesResponse.parse([]));
    return;
  }
  const base = db
    .select({
      id: tradeMessagesTable.id,
      playerId: tradeMessagesTable.playerId,
      author: playersTable.username,
      avatarBlook: playersTable.avatarBlook,
      customAvatarUrl: playersTable.customAvatarUrl,
      badges: playersTable.badges,
      nameEffect: playersTable.nameEffect,
      chatColor: playersTable.chatColor,
      content: tradeMessagesTable.content,
      createdAt: tradeMessagesTable.createdAt,
    })
    .from(tradeMessagesTable)
    .innerJoin(playersTable, eq(tradeMessagesTable.playerId, playersTable.id));
  const rows = await (after !== undefined
    ? base.where(
        and(
          eq(tradeMessagesTable.tradeId, trade.id),
          gt(tradeMessagesTable.id, after),
        ),
      )
    : base.where(eq(tradeMessagesTable.tradeId, trade.id))
  )
    .orderBy(asc(tradeMessagesTable.id))
    .limit(200);
  const clanTags = await clanTagsForPlayers(rows.map((r) => r.playerId));
  const result = rows.map((r) => ({
    id: r.id,
    author: r.author,
    avatarBlook: r.avatarBlook,
    avatarImage: playerAvatarImage(r.avatarBlook, r.author, r.customAvatarUrl),
    badges: badgeViews(r.badges),
    nameEffect: r.nameEffect ?? null,
    chatColor: r.chatColor ?? null,
    content: r.content,
    mentions: [],
    isMine: r.playerId === me.id,
    createdAt: r.createdAt.toISOString(),
    clanName: clanTags.get(r.playerId)?.name ?? null,
    clanColor: clanTags.get(r.playerId)?.color ?? null,
  }));
  res.json(GetTradeMessagesResponse.parse(result));
});

router.post("/trades/current/messages", async (req, res): Promise<void> => {
  const parsed = SendTradeMessageBody.safeParse(req.body);
  if (!parsed.success || parsed.data.content.trim().length === 0) {
    res.status(400).json({ message: "Message can't be empty" });
    return;
  }
  const me = req.player!;
  if (containsLink(parsed.data.content) && !(await areLinksAllowed())) {
    res.status(400).json({ message: "Links aren't allowed in chat" });
    return;
  }
  const trade = await activeTrade(me.id);
  if (!trade) {
    res.status(400).json({ message: "No active trade" });
    return;
  }
  const [msg] = await db
    .insert(tradeMessagesTable)
    .values({
      tradeId: trade.id,
      playerId: me.id,
      content: parsed.data.content.trim(),
    })
    .returning();
  const myClanTag = (await clanTagsForPlayers([me.id])).get(me.id);
  res.status(201).json(
    SendTradeMessageResponse.parse({
      id: msg!.id,
      author: me.username,
      avatarBlook: me.avatarBlook,
      avatarImage: playerAvatarImage(me.avatarBlook, me.username, me.customAvatarUrl),
      badges: badgeViews(me.badges),
      nameEffect: me.nameEffect ?? null,
      chatColor: me.chatColor ?? null,
      content: msg!.content,
      mentions: [],
      isMine: true,
      createdAt: msg!.createdAt.toISOString(),
      clanName: myClanTag?.name ?? null,
      clanColor: myClanTag?.color ?? null,
    }),
  );
});

export default router;
