import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { eq, sql, asc, desc, inArray, and } from "drizzle-orm";
import {
  db,
  playersTable,
  tradesTable,
  tradeMessagesTable,
  chatMessagesTable,
  clanMessagesTable,
  clansTable,
  clanMembersTable,
  packPullsTable,
  craftLogsTable,
  type TradeBlookEntry,
} from "@workspace/db";
import {
  ModLookupBody,
  ModLookupResponse,
  ModBanPlayerBody,
  ModBanPlayerResponse,
  ModUnbanPlayerBody,
  ModUnbanPlayerResponse,
  ModSetVerifiedBody,
  ModSetVerifiedResponse,
  ModSetMutedBody,
  ModSetMutedResponse,
  ModSetBadgeBody,
  ModSetBadgeResponse,
  ModListChatBody,
  ModListChatResponse,
  ModDeleteChatMessageBody,
  ModDeleteChatMessageResponse,
  ModDeletePlayerChatBody,
  ModDeletePlayerChatResponse,
  ModListTradesBody,
  ModListTradesResponse,
  ModPlayerTradesBody,
  ModPlayerTradesResponse,
  ModListPullsBody,
  ModListPullsResponse,
  ModListCraftsBody,
  ModListCraftsResponse,
  ModListClansBody,
  ModListClansResponse,
  ModBanClanBody,
  ModBanClanResponse,
  ModUnbanClanBody,
  ModUnbanClanResponse,
} from "@workspace/api-zod";
import { getBlookDef, displayPackName, LEGACY_TOP_PACK, TOP_PACK } from "../lib/game";
import { rateLimit } from "../middlewares/rate-limit";
import { checkOwnerTierPassword } from "./owner";

const router: IRouter = Router();

const VERIFIED_BADGE = "Verified";

if (!process.env.MOD_PASSWORD) {
  // Fail-closed at request time, but be loud about the misconfiguration.
  console.warn(
    "[mod] MOD_PASSWORD is not set — all /mod endpoints will reject with 401 until it is configured.",
  );
}

// Per-IP rate limit to blunt online password guessing. The trade spectator
// polls, so allow a higher ceiling than the admin panel.
router.use("/mod", rateLimit({ windowMs: 60_000, max: 60 }));

function matchesSecret(password: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// The owner-tier passwords unlock all mod tools too (owner/co-owner > mod).
function checkPassword(password: string | undefined): boolean {
  if (!password) return false;
  return matchesSecret(password, process.env.MOD_PASSWORD) || checkOwnerTierPassword(password);
}

async function findPlayer(username: string) {
  const [player] = await db
    .select()
    .from(playersTable)
    .where(sql`lower(${playersTable.username}) = lower(${username})`);
  return player;
}

function offerBlooks(entries: TradeBlookEntry[]) {
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

router.post("/mod/lookup", async (req, res): Promise<void> => {
  const parsed = ModLookupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong mod password" });
    return;
  }
  const players = await db
    .select({
      username: playersTable.username,
      badges: playersTable.badges,
      banned: playersTable.banned,
      muted: playersTable.muted,
      mutedUntil: playersTable.mutedUntil,
      isBot: playersTable.isBot,
      createdAt: playersTable.createdAt,
      lastIp: playersTable.lastIp,
    })
    .from(playersTable)
    .orderBy(asc(playersTable.username));
  // IPs are owner-tier only: mods (MOD_PASSWORD) never receive them.
  const showIps = checkOwnerTierPassword(parsed.data.password);
  res.json(
    ModLookupResponse.parse({
      players: players.map((p) => ({
        username: p.username,
        badges: p.badges,
        banned: p.banned,
        muted: p.muted,
        mutedUntil:
          p.mutedUntil && p.mutedUntil.getTime() > Date.now() ? p.mutedUntil.toISOString() : null,
        isBot: p.isBot,
        createdAt: p.createdAt.toISOString(),
        lastIp: showIps ? p.lastIp : null,
      })),
    }),
  );
});

router.post("/mod/ban", async (req, res): Promise<void> => {
  const parsed = ModBanPlayerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong mod password" });
    return;
  }
  const player = await findPlayer(parsed.data.username);
  if (!player || player.isBot) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  // One transaction: ban + kick them out of any live trade so their
  // partner isn't left hanging.
  await db.transaction(async (tx) => {
    await tx
      .update(playersTable)
      .set({ banned: true })
      .where(eq(playersTable.id, player.id));
    await tx
      .update(tradesTable)
      .set({
        status: "declined",
        myAccepted: false,
        partnerAccepted: false,
        endedAt: new Date(),
      })
      .where(
        sql`(${tradesTable.playerId} = ${player.id} OR ${tradesTable.partnerId} = ${player.id}) AND ${tradesTable.status} = 'active'`,
      );
  });
  req.log.info({ username: player.username }, "Mod banned player");
  res.json(
    ModBanPlayerResponse.parse({ username: player.username, banned: true }),
  );
});

router.post("/mod/delete-player-chat", async (req, res): Promise<void> => {
  const parsed = ModDeletePlayerChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong mod password" });
    return;
  }
  const player = await findPlayer(parsed.data.username);
  if (!player || player.isBot) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  const deleted = await db.transaction(async (tx) => {
    const global = await tx
      .delete(chatMessagesTable)
      .where(eq(chatMessagesTable.playerId, player.id))
      .returning({ id: chatMessagesTable.id });
    const clan = await tx
      .delete(clanMessagesTable)
      .where(eq(clanMessagesTable.playerId, player.id))
      .returning({ id: clanMessagesTable.id });
    const trade = await tx
      .delete(tradeMessagesTable)
      .where(eq(tradeMessagesTable.playerId, player.id))
      .returning({ id: tradeMessagesTable.id });
    return global.length + clan.length + trade.length;
  });
  req.log.info(
    { username: player.username, messagesDeleted: deleted },
    "Mod deleted player chat history",
  );
  res.json(
    ModDeletePlayerChatResponse.parse({
      username: player.username,
      messagesDeleted: deleted,
    }),
  );
});

router.post("/mod/unban", async (req, res): Promise<void> => {
  const parsed = ModUnbanPlayerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong mod password" });
    return;
  }
  const player = await findPlayer(parsed.data.username);
  if (!player || player.isBot) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  await db
    .update(playersTable)
    .set({ banned: false })
    .where(eq(playersTable.id, player.id));
  req.log.info({ username: player.username }, "Mod unbanned player");
  res.json(
    ModUnbanPlayerResponse.parse({ username: player.username, banned: false }),
  );
});

router.post("/mod/set-verified", async (req, res): Promise<void> => {
  const parsed = ModSetVerifiedBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong mod password" });
    return;
  }
  const player = await findPlayer(parsed.data.username);
  if (!player || player.isBot) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  const badges = parsed.data.verified
    ? player.badges.includes(VERIFIED_BADGE)
      ? player.badges
      : [...player.badges, VERIFIED_BADGE]
    : player.badges.filter((b) => b !== VERIFIED_BADGE);
  await db
    .update(playersTable)
    .set({ badges })
    .where(eq(playersTable.id, player.id));
  req.log.info(
    { username: player.username, verified: parsed.data.verified },
    "Mod set verified",
  );
  res.json(
    ModSetVerifiedResponse.parse({ username: player.username, badges }),
  );
});

router.post("/mod/set-muted", async (req, res): Promise<void> => {
  const parsed = ModSetMutedBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong mod password" });
    return;
  }
  const player = await findPlayer(parsed.data.username);
  if (!player || player.isBot) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  // muted=true + minutes => timed mute (auto-expires); muted=true without
  // minutes => permanent mute; muted=false => unmute (clears both).
  // Generated zod doesn't enforce integer — floor to whole minutes.
  const minutes = parsed.data.minutes ? Math.max(1, Math.floor(parsed.data.minutes)) : undefined;
  const mutedUntil =
    parsed.data.muted && minutes ? new Date(Date.now() + minutes * 60_000) : null;
  const permanent = parsed.data.muted && !minutes;
  await db
    .update(playersTable)
    .set({ muted: permanent, mutedUntil })
    .where(eq(playersTable.id, player.id));
  req.log.info(
    { username: player.username, muted: parsed.data.muted, minutes: minutes ?? null },
    "Mod set muted",
  );
  res.json(
    ModSetMutedResponse.parse({
      username: player.username,
      muted: parsed.data.muted,
      mutedUntil: mutedUntil ? mutedUntil.toISOString() : null,
    }),
  );
});

// Badges moderators are allowed to grant/revoke.
const MOD_BADGES = new Set(["Verified", "OG"]);

router.post("/mod/set-badge", async (req, res): Promise<void> => {
  const parsed = ModSetBadgeBody.safeParse(req.body);
  if (!parsed.success || !MOD_BADGES.has(parsed.data.badge)) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong mod password" });
    return;
  }
  const player = await findPlayer(parsed.data.username);
  if (!player || player.isBot) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  const { badge, granted } = parsed.data;
  const badges = granted
    ? player.badges.includes(badge)
      ? player.badges
      : [...player.badges, badge]
    : player.badges.filter((b) => b !== badge);
  await db
    .update(playersTable)
    .set({ badges })
    .where(eq(playersTable.id, player.id));
  req.log.info(
    { username: player.username, badge, granted },
    "Mod set badge",
  );
  res.json(ModSetBadgeResponse.parse({ username: player.username, badges }));
});

router.post("/mod/chat", async (req, res): Promise<void> => {
  const parsed = ModListChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong mod password" });
    return;
  }
  // Newest 200, returned oldest-first for display.
  const rows = (
    await db
      .select({
        id: chatMessagesTable.id,
        content: chatMessagesTable.content,
        createdAt: chatMessagesTable.createdAt,
        username: playersTable.username,
      })
      .from(chatMessagesTable)
      .innerJoin(playersTable, eq(chatMessagesTable.playerId, playersTable.id))
      .orderBy(desc(chatMessagesTable.id))
      .limit(200)
  ).reverse();
  res.json(
    ModListChatResponse.parse({
      messages: rows.map((m) => ({
        id: m.id,
        username: m.username,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    }),
  );
});

router.post("/mod/chat/delete", async (req, res): Promise<void> => {
  const parsed = ModDeleteChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong mod password" });
    return;
  }
  const deleted = await db
    .delete(chatMessagesTable)
    .where(eq(chatMessagesTable.id, parsed.data.messageId))
    .returning({ id: chatMessagesTable.id });
  if (deleted.length === 0) {
    res.status(404).json({ message: "Message not found" });
    return;
  }
  req.log.info({ messageId: parsed.data.messageId }, "Mod deleted chat message");
  res.json(
    ModDeleteChatMessageResponse.parse({
      deleted: true,
      messageId: parsed.data.messageId,
    }),
  );
});

/** Resolve usernames and messages for a set of trade rows and shape them for the API. */
async function tradesPayload(trades: (typeof tradesTable.$inferSelect)[]) {
  const playerIds = [
    ...new Set(trades.flatMap((t) => [t.playerId, t.partnerId])),
  ];
  const players = playerIds.length
    ? await db
        .select({ id: playersTable.id, username: playersTable.username })
        .from(playersTable)
        .where(inArray(playersTable.id, playerIds))
    : [];
  const nameById = new Map(players.map((p) => [p.id, p.username]));

  const tradeIds = trades.map((t) => t.id);
  const messages = tradeIds.length
    ? await db
        .select()
        .from(tradeMessagesTable)
        .where(inArray(tradeMessagesTable.tradeId, tradeIds))
        .orderBy(asc(tradeMessagesTable.id))
    : [];
  const messagesByTrade = new Map<number, typeof messages>();
  for (const m of messages) {
    const list = messagesByTrade.get(m.tradeId) ?? [];
    list.push(m);
    messagesByTrade.set(m.tradeId, list);
  }

  return trades.map((t) => ({
    id: t.id,
    status: t.status,
    sideA: {
      username: nameById.get(t.playerId) ?? "Unknown",
      offer: { tokens: t.myTokens, blooks: offerBlooks(t.myBlooks) },
      accepted: t.myAccepted,
    },
    sideB: {
      username: nameById.get(t.partnerId) ?? "Unknown",
      offer: {
        tokens: t.partnerTokens,
        blooks: offerBlooks(t.partnerBlooks),
      },
      accepted: t.partnerAccepted,
    },
    messages: (messagesByTrade.get(t.id) ?? []).map((m) => ({
      username: nameById.get(m.playerId) ?? "Unknown",
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));
}

router.post("/mod/trades", async (req, res): Promise<void> => {
  const parsed = ModListTradesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong mod password" });
    return;
  }
  const trades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "active"))
    .orderBy(asc(tradesTable.id));
  res.json(ModListTradesResponse.parse({ trades: await tradesPayload(trades) }));
});

const PLAYER_TRADES_LIMIT = 100;

router.post("/mod/player-trades", async (req, res): Promise<void> => {
  const parsed = ModPlayerTradesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong mod password" });
    return;
  }
  const [player] = await db
    .select({ id: playersTable.id, username: playersTable.username })
    .from(playersTable)
    .where(sql`lower(${playersTable.username}) = lower(${parsed.data.username})`);
  if (!player) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  const trades = await db
    .select()
    .from(tradesTable)
    .where(sql`${tradesTable.playerId} = ${player.id} OR ${tradesTable.partnerId} = ${player.id}`)
    .orderBy(desc(tradesTable.id))
    .limit(PLAYER_TRADES_LIMIT);
  res.json(ModPlayerTradesResponse.parse({ trades: await tradesPayload(trades) }));
});

const PULLS_LIMIT = 200;
/** Short cache for the all-time pull count so 3s polling doesn't re-count the table. */
const PULL_COUNT_TTL_MS = 10_000;
const pullCountCache = new Map<string, { total: number; at: number }>();

router.post("/mod/pulls", async (req, res): Promise<void> => {
  const parsed = ModListPullsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong mod password" });
    return;
  }
  // Optional filters: watch a single blook or a single pack.
  const filters = [];
  if (parsed.data.blook) filters.push(eq(packPullsTable.blookName, parsed.data.blook));
  if (parsed.data.pack) {
    // The gamble pack was renamed "Top" -> "1k"; historical rows keep "Top".
    filters.push(
      parsed.data.pack === TOP_PACK
        ? inArray(packPullsTable.packName, [TOP_PACK, LEGACY_TOP_PACK])
        : eq(packPullsTable.packName, parsed.data.pack),
    );
  }
  const where = filters.length > 0 ? and(...filters) : undefined;
  // The all-time count is polled every 3s per open mod panel; cache it briefly
  // so the table isn't counted on every tick as pull history grows.
  const cacheKey = `${parsed.data.blook ?? ""}\u0000${parsed.data.pack ?? ""}`;
  const cached = pullCountCache.get(cacheKey);
  const countPromise: Promise<number> =
    cached && Date.now() - cached.at < PULL_COUNT_TTL_MS
      ? Promise.resolve(cached.total)
      : db
          .select({ total: sql<number>`count(*)::int` })
          .from(packPullsTable)
          .where(where)
          .then(([row]) => {
            const total = row?.total ?? 0;
            pullCountCache.set(cacheKey, { total, at: Date.now() });
            return total;
          });
  const [pulls, totalCount] = await Promise.all([
    db
      .select({
        id: packPullsTable.id,
        blookName: packPullsTable.blookName,
        packName: packPullsTable.packName,
        createdAt: packPullsTable.createdAt,
        username: playersTable.username,
      })
      .from(packPullsTable)
      .innerJoin(playersTable, eq(playersTable.id, packPullsTable.playerId))
      .where(where)
      .orderBy(desc(packPullsTable.id))
      .limit(PULLS_LIMIT),
    countPromise,
  ]);
  res.json(
    ModListPullsResponse.parse({
      totalCount,
      pulls: pulls.map((p) => {
        const def = getBlookDef(p.blookName);
        return {
          id: p.id,
          username: p.username,
          blook: p.blookName,
          rarity: def?.rarity ?? (p.blookName === "Nothing" ? "Empty" : "Unknown"),
          image: def?.image ?? "",
          pack: displayPackName(p.packName),
          createdAt: p.createdAt.toISOString(),
        };
      }),
    }),
  );
});

const CRAFTS_LIMIT = 200;
const craftCountCache = new Map<string, { total: number; at: number }>();

router.post("/mod/crafts", async (req, res): Promise<void> => {
  const parsed = ModListCraftsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong mod password" });
    return;
  }
  // Optional filter: watch crafts producing a single blook.
  const where = parsed.data.blook
    ? eq(craftLogsTable.resultName, parsed.data.blook)
    : undefined;
  // Same brief count cache as pulls — the panel polls every 3s.
  const cacheKey = parsed.data.blook ?? "";
  const cached = craftCountCache.get(cacheKey);
  const countPromise: Promise<number> =
    cached && Date.now() - cached.at < PULL_COUNT_TTL_MS
      ? Promise.resolve(cached.total)
      : db
          .select({ total: sql<number>`count(*)::int` })
          .from(craftLogsTable)
          .where(where)
          .then(([row]) => {
            const total = row?.total ?? 0;
            craftCountCache.set(cacheKey, { total, at: Date.now() });
            return total;
          });
  const [crafts, totalCount] = await Promise.all([
    db
      .select({
        id: craftLogsTable.id,
        inputs: craftLogsTable.inputs,
        resultName: craftLogsTable.resultName,
        usedLuck: craftLogsTable.usedLuck,
        createdAt: craftLogsTable.createdAt,
        username: playersTable.username,
      })
      .from(craftLogsTable)
      .innerJoin(playersTable, eq(playersTable.id, craftLogsTable.playerId))
      .where(where)
      .orderBy(desc(craftLogsTable.id))
      .limit(CRAFTS_LIMIT),
    countPromise,
  ]);
  res.json(
    ModListCraftsResponse.parse({
      totalCount,
      crafts: crafts.map((c) => {
        const def = getBlookDef(c.resultName);
        return {
          id: c.id,
          username: c.username,
          inputs: c.inputs,
          result: c.resultName,
          rarity: def?.rarity ?? "Unknown",
          image: def?.image ?? "",
          usedLuck: c.usedLuck,
          createdAt: c.createdAt.toISOString(),
        };
      }),
    }),
  );
});

// ---- Clan moderation --------------------------------------------------------

router.post("/mod/clans", async (req, res): Promise<void> => {
  const parsed = ModListClansBody.safeParse(req.body);
  if (!parsed.success || !checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong mod password" });
    return;
  }
  const clans = await db
    .select({
      id: clansTable.id,
      name: clansTable.name,
      color: clansTable.color,
      experience: clansTable.experience,
      banned: clansTable.banned,
      ownerUsername: playersTable.username,
    })
    .from(clansTable)
    .innerJoin(playersTable, eq(clansTable.ownerId, playersTable.id))
    .orderBy(desc(clansTable.experience), asc(clansTable.id));
  const counts = await db
    .select({ clanId: clanMembersTable.clanId, count: sql<number>`count(*)::int` })
    .from(clanMembersTable)
    .groupBy(clanMembersTable.clanId);
  const countMap = new Map(counts.map((c) => [c.clanId, c.count]));
  res.json(
    ModListClansResponse.parse(
      clans.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        memberCount: countMap.get(c.id) ?? 0,
        ownerUsername: c.ownerUsername,
        experience: c.experience,
        banned: c.banned,
      })),
    ),
  );
});

async function setClanBanned(
  req: Parameters<Parameters<IRouter["post"]>[1]>[0],
  res: Parameters<Parameters<IRouter["post"]>[1]>[1],
  body: typeof ModBanClanBody,
  banned: boolean,
): Promise<void> {
  const parsed = body.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong mod password" });
    return;
  }
  const [clan] = await db
    .update(clansTable)
    .set({ banned })
    .where(sql`lower(${clansTable.name}) = lower(${parsed.data.clanName})`)
    .returning({ name: clansTable.name, banned: clansTable.banned });
  if (!clan) {
    res.status(404).json({ message: "Clan not found" });
    return;
  }
  req.log.info({ clan: clan.name, banned }, banned ? "Mod banned clan" : "Mod unbanned clan");
  res.json(ModBanClanResponse.parse({ name: clan.name, banned: clan.banned }));
}

router.post("/mod/clans/ban", (req, res) => setClanBanned(req, res, ModBanClanBody, true));
router.post("/mod/clans/unban", (req, res) => setClanBanned(req, res, ModUnbanClanBody, false));

export default router;
