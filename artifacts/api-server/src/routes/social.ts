import { Router, type IRouter } from "express";
import { desc, eq, inArray, sql, and } from "drizzle-orm";
import {
  db,
  playersTable,
  ownedBlooksTable,
  unlocksTable,
  chatMessagesTable,
  baseWorkersTable,
} from "@workspace/db";
import {
  GetLeaderboardResponse,
  GetStatsResponse,
  GetPlayerProfileResponse,
  GetOnlineCountResponse,
} from "@workspace/api-zod";
import {
  getBlookDef,
  levelForExp,
  playerAvatarImage,
  badgeViews,
  MAIN_BLOOK_COUNT,
  MISC_PACK,
  displayPackName,
} from "../lib/game";
import { clanEffectsForPlayer } from "../lib/clanHeldBlooks";
import { RARITIES } from "../data/blacketData";
import { CATALOG_BLOOKS as BLOOKS } from "../data/catalogExtensions";

const router: IRouter = Router();

router.get("/leaderboard", async (req, res): Promise<void> => {
  const me = req.player!;
  // Exact per-hour mine rate, boosts included: stored miner rates × the
  // Spooky Ghost clan boost (1.1x while a live clan the player belongs to
  // holds one), rounded the same way as getBaseStatus so it matches the
  // Mine page's Dig Rate exactly. Sorting uses the boosted value too.
  // Raw SQL with explicit aliases: scalar-subquery fields in a multi-column
  // drizzle select silently mapped to undefined here (long-standing bug that
  // also zeroed uniqueBlooks), so the whole query is hand-written.
  const sort = req.query.sort === "mineRate" ? "mineRate" : "experience";
  const orderClause = sort === "mineRate"
    ? sql`mine_per_hour desc, experience desc`
    : sql`experience desc`;
  const queryResult = await db.execute(sql`
    select
      p.id,
      p.username,
      p.experience,
      p.tokens,
      p.avatar_blook,
      p.custom_avatar_url,
      p.badges,
      p.name_effect,
      (select count(*) from owned_blooks ob where ob.player_id = p.id)::int as unique_blooks,
      round(
        (select coalesce(sum(bw.token_rate_per_hour), 0) from base_workers bw where bw.player_id = p.id)
        * (case when exists (
            select 1
            from clan_members cm
            join clans c on c.id = cm.clan_id and c.banned = false
            join clan_held_blooks chb on chb.clan_id = cm.clan_id and chb.blook_name = 'Spooky Ghost'
            where cm.player_id = p.id
          ) then 1.1 else 1 end)
      )::int as mine_per_hour
    from players p
    order by ${orderClause}
    limit 25
  `);
  type LbRow = {
    id: number;
    username: string;
    experience: number;
    tokens: number;
    avatar_blook: string | null;
    custom_avatar_url: string | null;
    badges: unknown;
    name_effect: string | null;
    unique_blooks: number;
    mine_per_hour: number;
  };
  const rows = queryResult.rows as unknown as LbRow[];
  const result = rows.map((r, i) => ({
    rank: i + 1,
    username: r.username,
    level: levelForExp(r.experience),
    experience: r.experience,
    tokens: r.tokens,
    uniqueBlooks: r.unique_blooks,
    avatarBlook: r.avatar_blook,
    avatarImage: playerAvatarImage(r.avatar_blook, r.username, r.custom_avatar_url),
    badges: badgeViews((r.badges ?? []) as string[]),
    nameEffect: r.name_effect ?? null,
    minePerHour: r.mine_per_hour,
    isMe: r.id === me.id,
  }));
  res.json(GetLeaderboardResponse.parse(result));
});

router.get("/online-count", async (_req, res): Promise<void> => {
  // Online = real (non-bot) players seen in the last 5 minutes, matching the
  // mod panel's definition of "online".
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(playersTable)
    .where(
      sql`${playersTable.isBot} = false AND ${playersTable.lastSeenAt} >= ${cutoff}`,
    );
  res.json(GetOnlineCountResponse.parse({ online: row?.count ?? 0 }));
});

router.get("/stats", async (req, res): Promise<void> => {
  const me = req.player!;
  const owned = await db
    .select()
    .from(ownedBlooksTable)
    .where(eq(ownedBlooksTable.playerId, me.id));
  const ownedByRarity = new Map<string, number>();
  for (const r of owned) {
    const def = getBlookDef(r.blookName);
    if (!def) continue;
    ownedByRarity.set(def.rarity, (ownedByRarity.get(def.rarity) ?? 0) + 1);
  }
  const totalByRarity = new Map<string, number>();
  for (const b of BLOOKS) {
    if (b.pack === MISC_PACK) continue; // hidden specials don't count in totals
    totalByRarity.set(b.rarity, (totalByRarity.get(b.rarity) ?? 0) + 1);
  }
  const rarityBreakdown = Object.entries(RARITIES).map(([name, r]) => ({
    rarity: name,
    color: r.color,
    owned: ownedByRarity.get(name) ?? 0,
    total: totalByRarity.get(name) ?? 0,
  }));
  const [msgCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.playerId, me.id));
  const messagesSent = msgCount?.count ?? 0;
  const unlockRows = await db
    .select()
    .from(unlocksTable)
    .where(eq(unlocksTable.playerId, me.id))
    .orderBy(desc(unlocksTable.createdAt))
    .limit(20);
  const recentUnlocks = unlockRows
    .map((u) => {
      const def = getBlookDef(u.blookName);
      if (!def) return null;
      return {
        blookName: u.blookName,
        rarity: def.rarity,
        image: def.image,
        // Historical rows may carry the gamble pack's old "Top" name.
        packName: displayPackName(u.packName),
        createdAt: u.createdAt.toISOString(),
      };
    })
    .filter((u) => u !== null);
  res.json(
    GetStatsResponse.parse({
      packsOpened: me.packsOpened,
      uniqueBlooks: owned.filter((r) => getBlookDef(r.blookName)).length,
      totalBlookDefs: MAIN_BLOOK_COUNT,
      tokensSpent: me.tokensSpent,
      tokensEarned: me.tokensEarned,
      messagesSent,
      rarityBreakdown,
      recentUnlocks,
    }),
  );
});

router.get("/players/:username", async (req, res): Promise<void> => {
  const [player] = await db
    .select()
    .from(playersTable)
    .where(sql`lower(${playersTable.username}) = lower(${req.params.username})`);
  if (!player) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  const me = req.player!;
  let friendStatus: "none" | "friends" | "outgoing" | "incoming" | "self" = "none";
  if (player.id === me.id) {
    friendStatus = "self";
  } else {
    const fr = await db.execute(sql`
      SELECT status, requester_id FROM friendships
      WHERE (requester_id = ${me.id} AND addressee_id = ${player.id})
         OR (requester_id = ${player.id} AND addressee_id = ${me.id})
      LIMIT 1
    `);
    const row = (fr.rows as any[])[0];
    if (row) {
      if (row.status === "accepted") friendStatus = "friends";
      else if (row.status === "pending") friendStatus = Number(row.requester_id) === me.id ? "outgoing" : "incoming";
    }
  }
  const owned = await db
    .select({
      unique: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${ownedBlooksTable.quantity}), 0)::int`,
    })
    .from(ownedBlooksTable)
    .where(
      and(
        eq(ownedBlooksTable.playerId, player.id),
        inArray(ownedBlooksTable.blookName, BLOOKS.map((b) => b.name)),
      ),
    );
  // Exact mine rate, boosts included — same math as the Mine page's Dig
  // Rate: round(stored worker rate sum × Spooky Ghost clan multiplier).
  const [mineRate] = await db
    .select({ perHour: sql<number>`coalesce(sum(${baseWorkersTable.tokenRatePerHour}), 0)::int` })
    .from(baseWorkersTable)
    .where(eq(baseWorkersTable.playerId, player.id));
  const effects = await clanEffectsForPlayer(player.id);
  const minePerHour = Math.round((mineRate?.perHour ?? 0) * effects.baseProductionMultiplier);
  res.json(
    GetPlayerProfileResponse.parse({
      username: player.username,
      level: levelForExp(player.experience),
      experience: player.experience,
      tokens: player.tokens,
      packsOpened: player.packsOpened,
      minePerHour,
      uniqueBlooks: owned[0]?.unique ?? 0,
      totalBlooks: owned[0]?.total ?? 0,
      totalBlookDefs: MAIN_BLOOK_COUNT,
      avatarBlook: player.avatarBlook,
      avatarImage: playerAvatarImage(player.avatarBlook, player.username, player.customAvatarUrl),
      hasBundle: player.bundleVersion > 0,
      badges: badgeViews(player.badges),
      nameEffect: player.nameEffect ?? null,
      isOnline: player.isBot
        ? true
        : !!player.lastSeenAt && Date.now() - player.lastSeenAt.getTime() < 5 * 60_000,
      joinedAt: player.createdAt.toISOString(),
      friendStatus,
    }),
  );
});

export default router;
