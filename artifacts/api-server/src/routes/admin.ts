import { Router, type IRouter } from "express";
import { timingSafeEqual, randomInt } from "node:crypto";
import { hashPassword } from "./auth";
import { eq, sql, asc, desc, inArray, notInArray, or, and, isNotNull } from "drizzle-orm";
import {
  db,
  playersTable,
  ownedBlooksTable,
  unlocksTable,
  packPullsTable,
  craftLogsTable,
  friendshipsTable,
  dmMessagesTable,
  chatMessagesTable,
  bazaarListingsTable,
  tradesTable,
  tradeMessagesTable,
  tradeRequestsTable,
  storePurchasesTable,
  clansTable,
  clanMembersTable,
  clanApplicationsTable,
  clanMessagesTable,
  ipBansTable,
  grantRequestsTable,
  appSettingsTable,
} from "@workspace/db";
import {
  AdminLookupBody,
  AdminLookupResponse,
  AdminGrantBadgeBody,
  AdminGrantBadgeResponse,
  AdminGrantBlookBody,
  AdminGrantBlookResponse,
  AdminGrantModBody,
  AdminGrantModResponse,
  AdminGiftAllBlooksBody,
  AdminGiftAllBlooksResponse,
  AdminDeletePlayersBody,
  AdminDeletePlayersResponse,
  AdminSetNameEffectBody,
  AdminSetNameEffectResponse,
  AdminRenamePlayerBody,
  AdminRenamePlayerResponse,
  AdminResetPasswordBody,
  AdminResetPasswordResponse,
  AdminUpdateBadgesBody,
  AdminUpdateBadgesResponse,
  AdminGiveTokensBody,
  AdminGrantBundleBody,
  AdminListGrantsBody,
  AdminListGrantsResponse,
  AdminGrantBundleResponse,
  AdminGiveTokensResponse,
  AdminGiveTokensAllBody,
  AdminPurgeLinkMessagesBody,
  AdminPurgeLinkMessagesResponse,
  AdminGiveTokensAllResponse,
  AdminCleanupCatalogBody,
  AdminCleanupCatalogResponse,
  AdminPlayerStatsBody,
  AdminPlayerStatsResponse,
  AdminClearChatBody,
  AdminClearChatResponse,
  AdminClearBazaarBody,
  AdminClearBazaarResponse,
  AdminListIpBansBody,
  AdminListIpBansResponse,
  AdminIpBanBody,
  AdminIpUnbanBody,
  AdminSetDiscordLinkBody,
  GetDiscordLinkResponse,
  AdminSetDiscordLinkResponse,
} from "@workspace/api-zod";
import { CATALOG_BADGES as BADGES, CATALOG_BLOOKS as BLOOKS } from "../data/catalogExtensions";
import {
  getBlookDef,
  badgeViews,
  containsLink,
  syncCollectorBadge,
  USERNAME_RE,
  isProtectedUsername,
} from "../lib/game";
import { rateLimit } from "../middlewares/rate-limit";
import { sessionPlayerId } from "../middlewares/auth";
import { checkOwnerPassword, checkOwnerTierPassword, isAdminPanelDisabled } from "./owner";

const router: IRouter = Router();
const DISCORD_INVITE_KEY = "discord_invite_url";
const DEFAULT_DISCORD_INVITE_URL = "https://discord.gg/KgDvKnKun";

if (!process.env.ADMIN_PASSWORD) {
  // Fail-closed at request time, but be loud about the misconfiguration.
  console.warn(
    "[admin] ADMIN_PASSWORD is not set — all /admin endpoints will reject with 401 until it is configured.",
  );
}

// Per-IP rate limit to blunt online password guessing.
router.use("/admin", rateLimit({ windowMs: 60_000, max: 20 }));

function matchesAdmin(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// The owner-tier passwords (owner and co-owner) are accepted everywhere the
// admin password is, and keep working even when the owner has disabled the
// admin panel.
function checkPassword(password: string | undefined): boolean {
  if (!password) return false;
  return matchesAdmin(password) || checkOwnerTierPassword(password);
}

function normalizeDiscordInviteUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    const isShortInvite = host === "discord.gg" && /^\/[a-z0-9-]{2,}\/?$/i.test(url.pathname);
    const isFullInvite =
      (host === "discord.com" || host === "www.discord.com") &&
      /^\/invite\/[a-z0-9-]{2,}\/?$/i.test(url.pathname);
    return isShortInvite || isFullInvite ? url.toString() : null;
  } catch {
    return null;
  }
}

async function discordLinkPayload() {
  const [setting] = await db
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, DISCORD_INVITE_KEY));
  return { url: normalizeDiscordInviteUrl(setting?.value ?? "") ?? DEFAULT_DISCORD_INVITE_URL };
}

// Owner kill-switch: when the admin panel is disabled, the ADMIN password is
// rejected on every /admin endpoint (the owner password still works).
router.use("/admin", async (req, res, next) => {
  const pw = (req.body as any)?.password;
  if (typeof pw === "string" && matchesAdmin(pw) && !checkOwnerPassword(pw)) {
    if (await isAdminPanelDisabled()) {
      res.status(403).json({ message: "The admin panel has been disabled by the owner" });
      return;
    }
  }
  next();
});

// The sidebar reads this without authentication, while changing it requires
// the normal admin (or owner) password flow below.
router.get("/discord-link", async (_req, res): Promise<void> => {
  res.json(GetDiscordLinkResponse.parse(await discordLinkPayload()));
});

router.post("/admin/discord-link", async (req, res): Promise<void> => {
  const parsed = AdminSetDiscordLinkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Enter a valid Discord invite link" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong admin password" });
    return;
  }
  const url = normalizeDiscordInviteUrl(parsed.data.url);
  if (!url) {
    res.status(400).json({ message: "Use a Discord invite link from discord.gg or discord.com/invite" });
    return;
  }
  await db
    .insert(appSettingsTable)
    .values({ key: DISCORD_INVITE_KEY, value: url })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: url } });
  req.log.info({ url }, "Admin updated Discord invite link");
  res.json(AdminSetDiscordLinkResponse.parse({ url }));
});

async function findPlayer(username: string) {
  const [player] = await db
    .select()
    .from(playersTable)
    .where(sql`lower(${playersTable.username}) = lower(${username})`);
  return player;
}

async function requesterName(req: Parameters<typeof sessionPlayerId>[0]): Promise<string | null> {
  const playerId = sessionPlayerId(req);
  if (playerId === null) return null;
  const [requester] = await db
    .select({ username: playersTable.username })
    .from(playersTable)
    .where(eq(playersTable.id, playerId));
  return requester?.username ?? null;
}

// ---- IP bans -----------------------------------------------------------------
// An IP ban only blocks NEW account registration from that IP. Existing
// accounts on the same IP (innocent players on a shared school/home network)
// keep playing normally — the banned player's own account is banned via
// players.banned like any other ban.

async function ipBanPayload(showIps: boolean) {
  const bans = await db
    .select({
      id: ipBansTable.id,
      ip: ipBansTable.ip,
      bannedUsername: ipBansTable.bannedUsername,
      createdAt: ipBansTable.createdAt,
    })
    .from(ipBansTable)
    .orderBy(desc(ipBansTable.createdAt))
    .limit(200);
  // Show which OTHER accounts share each banned IP so admins can see who
  // else is on that network (they are NOT affected — visibility only).
  // Single set-based query, grouped in memory, capped per IP.
  const byIp = new Map<string, { username: string; banned: boolean }[]>();
  if (bans.length > 0) {
    const shared = await db
      .select({ ip: playersTable.lastIp, username: playersTable.username, banned: playersTable.banned })
      .from(playersTable)
      .where(inArray(playersTable.lastIp, bans.map((b) => b.ip)))
      .orderBy(asc(playersTable.username));
    for (const s of shared) {
      if (!s.ip) continue;
      const list = byIp.get(s.ip) ?? [];
      if (list.length < 25) list.push({ username: s.username, banned: s.banned });
      byIp.set(s.ip, list);
    }
  }
  return {
    bans: bans.map((b) => ({
      id: b.id,
      // Raw IPs are owner-only, matching /mod/lookup.
      ip: showIps ? b.ip : null,
      bannedUsername: b.bannedUsername,
      createdAt: b.createdAt.toISOString(),
      sharedAccounts: byIp.get(b.ip) ?? [],
    })),
  };
}

// Mods, admins and the owner can all manage IP bans (ban/unban by username),
// but RAW IP addresses stay owner-only — same boundary as /mod/lookup.
function matchesMod(password: string): boolean {
  const expected = process.env.MOD_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function canManageIpBans(password: string | undefined): boolean {
  if (!password) return false;
  return matchesMod(password) || checkPassword(password);
}

router.post("/admin/ip-bans", async (req, res): Promise<void> => {
  const parsed = AdminListIpBansBody.safeParse(req.body);
  if (!parsed.success || !canManageIpBans(parsed.data.password)) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  res.json(AdminListIpBansResponse.parse(await ipBanPayload(checkOwnerTierPassword(parsed.data.password))));
});

router.post("/admin/ip-bans/ban", async (req, res): Promise<void> => {
  const parsed = AdminIpBanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!canManageIpBans(parsed.data.password)) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  const player = await findPlayer(parsed.data.username);
  if (!player) {
    res.status(400).json({ message: "No account with that username" });
    return;
  }
  if (!player.lastIp) {
    res.status(400).json({ message: "No IP recorded for that account yet" });
    return;
  }
  // Ban the account AND its last IP atomically, serialized per-IP with
  // registration (same advisory lock key) so a signup can't slip through
  // mid-ban and no account-only half-ban can be left behind.
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"ipban:" + player.lastIp}))`);
    await tx.update(playersTable).set({ banned: true }).where(eq(playersTable.id, player.id));
    await tx
      .insert(ipBansTable)
      .values({ ip: player.lastIp!, bannedUsername: player.username })
      .onConflictDoNothing({ target: ipBansTable.ip });
  });
  req.log.info({ username: player.username, ip: player.lastIp }, "Staff IP-banned player");
  res.json(AdminListIpBansResponse.parse(await ipBanPayload(checkOwnerTierPassword(parsed.data.password))));
});

router.post("/admin/ip-bans/unban", async (req, res): Promise<void> => {
  const parsed = AdminIpUnbanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!canManageIpBans(parsed.data.password)) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  // Unban by USERNAME so mods can lift a ban without ever seeing the IP.
  await db
    .delete(ipBansTable)
    .where(sql`lower(${ipBansTable.bannedUsername}) = lower(${parsed.data.username})`);
  req.log.info({ username: parsed.data.username }, "Staff removed IP ban");
  res.json(AdminListIpBansResponse.parse(await ipBanPayload(checkOwnerTierPassword(parsed.data.password))));
});

router.post("/admin/lookup", async (req, res): Promise<void> => {
  const parsed = AdminLookupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong admin password" });
    return;
  }
  const players = await db
    .select({
      username: playersTable.username,
      badges: playersTable.badges,
      nameEffect: playersTable.nameEffect,
    })
    .from(playersTable)
    .orderBy(asc(playersTable.username));
  res.json(
    AdminLookupResponse.parse({
      badges: BADGES,
      blooks: BLOOKS.map((b) => ({ name: b.name, rarity: b.rarity, image: b.image })),
      players: players.map((p) => ({
      username: p.username,
      badges: p.badges,
      nameEffect: p.nameEffect ?? null,
    })),
    }),
  );
});

router.post("/admin/grant-badge", async (req, res): Promise<void> => {
  const parsed = AdminGrantBadgeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong admin password" });
    return;
  }
  const badge = BADGES.find((b) => b.name === parsed.data.badge);
  if (!badge) {
    res.status(404).json({ message: "Badge not found" });
    return;
  }
  const player = await findPlayer(parsed.data.username);
  if (!player) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  const badges = player.badges.includes(badge.name)
    ? player.badges
    : [...player.badges, badge.name];
  await db
    .update(playersTable)
    .set({ badges })
    .where(eq(playersTable.id, player.id));
  req.log.info({ username: player.username, badge: badge.name }, "Admin granted badge");
  res.json(
    AdminGrantBadgeResponse.parse({
      username: player.username,
      badges: badgeViews(badges),
    }),
  );
});

router.post("/admin/grant-blook", async (req, res): Promise<void> => {
  const parsed = AdminGrantBlookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong admin password" });
    return;
  }
  const def = getBlookDef(parsed.data.blook);
  if (!def) {
    res.status(404).json({ message: "Blook not found" });
    return;
  }
  const player = await findPlayer(parsed.data.username);
  if (!player) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  const quantity = parsed.data.quantity ?? 1;
  const requester = await requesterName(req);
  const [request] = await db
    .insert(grantRequestsTable)
    .values({
      requesterName: requester,
      targetPlayerId: player.id,
      kind: "blook",
      blookName: def.name,
      quantity,
    })
    .returning({ id: grantRequestsTable.id });
  req.log.info(
    { requestId: request.id, requester, username: player.username, blook: def.name, quantity },
    "Admin requested blook grant",
  );
  res.json(
    AdminGrantBlookResponse.parse({
      id: request.id,
      status: "pending",
      username: player.username,
      blook: def.name,
      quantity,
    }),
  );
});

router.post("/admin/grant-mod", async (req, res): Promise<void> => {
  const parsed = AdminGrantModBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong admin password" });
    return;
  }
  const [player] = await db
    .update(playersTable)
    .set({
      panelAccess: sql`CASE WHEN ${playersTable.panelAccess} @> '["mod"]'::jsonb
        THEN ${playersTable.panelAccess}
        ELSE ${playersTable.panelAccess} || '["mod"]'::jsonb END`,
      badges: sql`CASE WHEN ${playersTable.badges} @> '["Mod"]'::jsonb
        THEN ${playersTable.badges}
        ELSE ${playersTable.badges} || '["Mod"]'::jsonb END`,
    })
    .where(sql`lower(${playersTable.username}) = lower(${parsed.data.username}) AND ${playersTable.isBot} = false`)
    .returning({ username: playersTable.username });
  if (!player) {
    res.status(400).json({ message: "No player with that username" });
    return;
  }
  req.log.info({ username: player.username }, "Admin granted Mod badge and panel access");
  res.json(AdminGrantModResponse.parse({ username: player.username, granted: true }));
});

router.post("/admin/gift-all-blooks", async (req, res): Promise<void> => {
  const parsed = AdminGiftAllBlooksBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong admin password" });
    return;
  }
  const player = await findPlayer(parsed.data.username);
  if (!player) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  const quantity = parsed.data.quantity ?? 10;
  // Bulk upsert: one statement for all blooks instead of thousands of queries.
  await db
    .insert(ownedBlooksTable)
    .values(
      BLOOKS.map((b) => ({
        playerId: player.id,
        blookName: b.name,
        quantity,
      })),
    )
    .onConflictDoUpdate({
      target: [ownedBlooksTable.playerId, ownedBlooksTable.blookName],
      set: {
        quantity: sql`${ownedBlooksTable.quantity} + ${quantity}`,
      },
    });
  await syncCollectorBadge(player.id);
  req.log.info(
    { username: player.username, blookCount: BLOOKS.length, quantity },
    "Admin gifted all blooks",
  );
  res.json(
    AdminGiftAllBlooksResponse.parse({
      username: player.username,
      blookCount: BLOOKS.length,
      quantityEach: quantity,
    }),
  );
});

router.post("/admin/delete-players", async (req, res): Promise<void> => {
  const parsed = AdminDeletePlayersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  // Deleting whole accounts is owner-tier — the admin password is not enough.
  if (!checkOwnerTierPassword(parsed.data.password)) {
    res.status(401).json({ message: "Owner or co-owner password required" });
    return;
  }
  const requested = parsed.data.usernames;
  const lowered = requested.map((u) => u.toLowerCase());
  const players = await db
    .select({ id: playersTable.id, username: playersTable.username })
    .from(playersTable)
    .where(inArray(sql`lower(${playersTable.username})`, lowered));
  const foundLower = new Set(players.map((p) => p.username.toLowerCase()));
  const notFound = requested.filter((u) => !foundLower.has(u.toLowerCase()));
  if (players.length > 0) {
    const ids = players.map((p) => p.id);
    await db.transaction(async (tx) => {
      // Lock the player rows first so an in-flight craft/pack open (which
      // updates the player row) can't insert new child rows after we've
      // cleaned them up — that would FK-abort the whole deletion.
      await tx.execute(
        sql`SELECT id FROM players WHERE id = ANY(${ids}) FOR UPDATE`,
      );
      const theirTrades = tx
        .select({ id: tradesTable.id })
        .from(tradesTable)
        .where(
          or(
            inArray(tradesTable.playerId, ids),
            inArray(tradesTable.partnerId, ids),
          ),
        );
      await tx
        .delete(tradeMessagesTable)
        .where(
          or(
            inArray(tradeMessagesTable.playerId, ids),
            inArray(tradeMessagesTable.tradeId, theirTrades),
          ),
        );
      await tx
        .delete(tradesTable)
        .where(
          or(
            inArray(tradesTable.playerId, ids),
            inArray(tradesTable.partnerId, ids),
          ),
        );
      await tx
        .delete(tradeRequestsTable)
        .where(
          or(
            inArray(tradeRequestsTable.fromId, ids),
            inArray(tradeRequestsTable.toId, ids),
          ),
        );
      await tx
        .delete(chatMessagesTable)
        .where(inArray(chatMessagesTable.playerId, ids));
      // Clans owned by these players are deleted entirely (with all their
      // members, applications, and messages). Memberships/applications/
      // messages the players have in other clans are removed too.
      const ownedClans = tx
        .select({ id: clansTable.id })
        .from(clansTable)
        .where(inArray(clansTable.ownerId, ids));
      await tx
        .delete(clanMessagesTable)
        .where(
          or(
            inArray(clanMessagesTable.clanId, ownedClans),
            inArray(clanMessagesTable.playerId, ids),
          ),
        );
      await tx
        .delete(clanApplicationsTable)
        .where(
          or(
            inArray(clanApplicationsTable.clanId, ownedClans),
            inArray(clanApplicationsTable.playerId, ids),
          ),
        );
      await tx
        .delete(clanMembersTable)
        .where(
          or(
            inArray(clanMembersTable.clanId, ownedClans),
            inArray(clanMembersTable.playerId, ids),
          ),
        );
      // Clear rainbow perk references pointing at deleted players.
      await tx
        .update(clansTable)
        .set({ rainbowOwnerId: null })
        .where(inArray(clansTable.rainbowOwnerId, ids));
      await tx.delete(clansTable).where(inArray(clansTable.ownerId, ids));
      await tx
        .delete(storePurchasesTable)
        .where(inArray(storePurchasesTable.playerId, ids));
      await tx
        .delete(bazaarListingsTable)
        .where(inArray(bazaarListingsTable.sellerId, ids));
      await tx
        .delete(unlocksTable)
        .where(inArray(unlocksTable.playerId, ids));
      // Friends + DMs reference players from both sides. DMs must go before
      // pack_pulls: shared_pull_id references pack_pulls.
      await tx
        .delete(friendshipsTable)
        .where(
          or(
            inArray(friendshipsTable.requesterId, ids),
            inArray(friendshipsTable.addresseeId, ids),
          ),
        );
      await tx
        .delete(dmMessagesTable)
        .where(
          or(
            inArray(dmMessagesTable.senderId, ids),
            inArray(dmMessagesTable.recipientId, ids),
          ),
        );
      // A deleted player's pulls may still be referenced by OTHER players'
      // shared-pull DMs? No — only the puller can share their own pull, and
      // their DMs were just deleted above.
      await tx
        .delete(packPullsTable)
        .where(inArray(packPullsTable.playerId, ids));
      await tx
        .delete(craftLogsTable)
        .where(inArray(craftLogsTable.playerId, ids));
      await tx
        .delete(ownedBlooksTable)
        .where(inArray(ownedBlooksTable.playerId, ids));
      await tx.delete(playersTable).where(inArray(playersTable.id, ids));
    });
  }
  req.log.info(
    { deleted: players.map((p) => p.username), notFound },
    "Admin deleted players",
  );
  res.json(
    AdminDeletePlayersResponse.parse({
      deleted: players.map((p) => p.username),
      notFound,
    }),
  );
});

router.post("/admin/update-badges", async (req, res): Promise<void> => {
  const parsed = AdminUpdateBadgesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  // Badges are owner-tier (owner or co-owner).
  if (!checkOwnerTierPassword(parsed.data.password)) {
    res.status(401).json({ message: "Owner or co-owner password required" });
    return;
  }
  const validNames = new Set(BADGES.map((b) => b.name));
  const add = parsed.data.add ?? [];
  const remove = parsed.data.remove ?? [];
  const invalid = [...add, ...remove].filter((n) => !validNames.has(n));
  if (invalid.length > 0) {
    res.status(404).json({ message: `Unknown badges: ${invalid.join(", ")}` });
    return;
  }
  const player = await findPlayer(parsed.data.username);
  if (!player) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  const removeSet = new Set(remove);
  const badges = [
    ...player.badges.filter((n) => !removeSet.has(n)),
    ...add.filter((n) => !player.badges.includes(n) && !removeSet.has(n)),
  ];
  await db
    .update(playersTable)
    .set({ badges })
    .where(eq(playersTable.id, player.id));
  req.log.info(
    { username: player.username, add, remove },
    "Admin updated badges",
  );
  res.json(
    AdminUpdateBadgesResponse.parse({
      username: player.username,
      badges: badgeViews(badges),
    }),
  );
});

router.post("/admin/rename-player", async (req, res): Promise<void> => {
  const parsed = AdminRenamePlayerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong admin password" });
    return;
  }
  const newUsername = parsed.data.newUsername.trim();
  if (!USERNAME_RE.test(newUsername)) {
    res.status(400).json({
      message: "New username must be 3-20 characters (letters, numbers, _ or -)",
    });
    return;
  }
  const player = await findPlayer(parsed.data.username);
  if (!player) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  // Some usernames carry name-keyed privileges (custom avatars, free
  // bundles). Refuse to rename those accounts or hand their name to
  // someone else.
  if (isProtectedUsername(player.username) || isProtectedUsername(newUsername)) {
    res.status(400).json({ message: "That username is protected and cannot be renamed" });
    return;
  }
  try {
    const renamed = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(playersTable)
        .set({ username: newUsername })
        .where(
          and(
            eq(playersTable.id, player.id),
            eq(playersTable.username, player.username),
          ),
        )
        .returning({ username: playersTable.username });
      if (!row) return false;
      // Keep IP-ban records in sync so unban-by-username still works.
      await tx
        .update(ipBansTable)
        .set({ bannedUsername: newUsername })
        .where(sql`lower(${ipBansTable.bannedUsername}) = lower(${player.username})`);
      return true;
    });
    if (!renamed) {
      res.status(409).json({ message: "Player changed while renaming — try again" });
      return;
    }
  } catch (err: unknown) {
    // Unique violation from the case-insensitive lower(username) index.
    if (
      (err as { code?: string })?.code === "23505" ||
      (err as { cause?: { code?: string } })?.cause?.code === "23505"
    ) {
      res.status(409).json({ message: "That username is already taken" });
      return;
    }
    throw err;
  }
  req.log.info(
    { oldUsername: player.username, newUsername },
    "Admin renamed player",
  );
  res.json(
    AdminRenamePlayerResponse.parse({
      oldUsername: player.username,
      username: newUsername,
    }),
  );
});

router.post("/admin/reset-password", async (req, res): Promise<void> => {
  const parsed = AdminResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong admin password" });
    return;
  }
  const player = await findPlayer(parsed.data.username);
  if (!player) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  // Random temporary password, shown once to the admin so they can pass it
  // on. Long enough to satisfy the password policy (the old 4-digit codes
  // were brute-forceable). The session-version bump signs out every device —
  // including whoever hijacked the account — and the reset also clears any
  // lockout or pending owner-unlock so the player can log straight in.
  const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const code = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  await db
    .update(playersTable)
    .set({
      passwordHash: await hashPassword(code),
      sessionVersion: sql`${playersTable.sessionVersion} + 1`,
      failedLogins: 0,
      lockoutUntil: null,
      lastFailedLoginAt: null,
      unlockPending: false,
      unlockPendingAt: null,
    })
    .where(eq(playersTable.id, player.id));
  // Log the action but never the code itself.
  req.log.info({ username: player.username }, "Admin reset player password");
  res.json(
    AdminResetPasswordResponse.parse({
      username: player.username,
      newPassword: code,
    }),
  );
});

router.post("/admin/set-name-effect", async (req, res): Promise<void> => {
  const parsed = AdminSetNameEffectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong admin password" });
    return;
  }
  const player = await findPlayer(parsed.data.username);
  if (!player) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  const effect = parsed.data.effect === "none" ? null : parsed.data.effect;
  await db
    .update(playersTable)
    .set({ nameEffect: effect })
    .where(eq(playersTable.id, player.id));
  req.log.info({ username: player.username, effect }, "Admin set name effect");
  res.json(
    AdminSetNameEffectResponse.parse({
      username: player.username,
      nameEffect: effect,
    }),
  );
});

router.post("/admin/purge-link-messages", async (req, res): Promise<void> => {
  const parsed = AdminPurgeLinkMessagesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong admin password" });
    return;
  }
  // Use the same containsLink() logic as write-time blocking so purge
  // catches the identical set of messages (including obfuscated links).
  const chatRows = await db
    .select({ id: chatMessagesTable.id, content: chatMessagesTable.content })
    .from(chatMessagesTable);
  const chatIds = chatRows.filter((r) => containsLink(r.content)).map((r) => r.id);
  const tradeRows = await db
    .select({ id: tradeMessagesTable.id, content: tradeMessagesTable.content })
    .from(tradeMessagesTable);
  const tradeIds = tradeRows.filter((r) => containsLink(r.content)).map((r) => r.id);
  let deletedCount = 0;
  if (chatIds.length > 0) {
    deletedCount += (
      await db.delete(chatMessagesTable).where(inArray(chatMessagesTable.id, chatIds)).returning({ id: chatMessagesTable.id })
    ).length;
  }
  if (tradeIds.length > 0) {
    deletedCount += (
      await db.delete(tradeMessagesTable).where(inArray(tradeMessagesTable.id, tradeIds)).returning({ id: tradeMessagesTable.id })
    ).length;
  }
  req.log.info({ messagesDeleted: deletedCount }, "Admin purged link messages");
  res.json(AdminPurgeLinkMessagesResponse.parse({ messagesDeleted: deletedCount }));
});

router.post("/admin/give-tokens-all", async (req, res): Promise<void> => {
  const parsed = AdminGiveTokensAllBody.safeParse(req.body);
  if (!parsed.success || !Number.isInteger(parsed.data.amount)) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong admin password" });
    return;
  }
  const updated = await db
    .update(playersTable)
    // Clamp to int4 max so a huge grant can't overflow the integer column.
    .set({
      tokens: sql`least(${playersTable.tokens}::bigint + ${parsed.data.amount}::bigint, 2147483647)::int`,
    })
    .where(eq(playersTable.isBot, false))
    .returning({ id: playersTable.id });
  req.log.info(
    { amount: parsed.data.amount, playersUpdated: updated.length },
    "Admin distributed tokens to all players",
  );
  res.json(
    AdminGiveTokensAllResponse.parse({
      playersUpdated: updated.length,
      amount: parsed.data.amount,
    }),
  );
});

router.post("/admin/give-tokens", async (req, res): Promise<void> => {
  const parsed = AdminGiveTokensBody.safeParse(req.body);
  if (!parsed.success || !Number.isInteger(parsed.data.amount)) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong admin password" });
    return;
  }
  const player = await findPlayer(parsed.data.username);
  if (!player) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  const [updated] = await db
    .update(playersTable)
    // Clamp to [0, int4 max] so a huge grant can't overflow and a removal can't go negative.
    .set({
      tokens: sql`greatest(least(${playersTable.tokens}::bigint + ${parsed.data.amount}::bigint, 2147483647), 0)::int`,
    })
    .where(eq(playersTable.id, player.id))
    .returning({ tokens: playersTable.tokens });
  req.log.info(
    { username: player.username, amount: parsed.data.amount },
    "Admin gave tokens",
  );
  res.json(
    AdminGiveTokensResponse.parse({
      username: player.username,
      amount: parsed.data.amount,
      tokens: updated!.tokens,
    }),
  );
});

router.post("/admin/grant-bundle", async (req, res): Promise<void> => {
  const parsed = AdminGrantBundleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong admin password" });
    return;
  }
  const player = await findPlayer(parsed.data.username);
  if (!player) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  const requester = await requesterName(req);
  const [request] = await db
    .insert(grantRequestsTable)
    .values({
      requesterName: requester,
      targetPlayerId: player.id,
      kind: "starter_bundle",
    })
    .returning({ id: grantRequestsTable.id });
  req.log.info(
    { requestId: request.id, requester, username: player.username },
    "Admin requested starter bundle grant",
  );
  res.json(
    AdminGrantBundleResponse.parse({
      id: request.id,
      status: "pending",
      username: player.username,
    }),
  );
});

// List every admin-granted starter bundle: who pressed the button and who got it.
router.post("/admin/grants", async (req, res): Promise<void> => {
  const parsed = AdminListGrantsBody.safeParse(req.body);
  if (!parsed.success || !checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong admin password" });
    return;
  }
  const rows = await db
    .select({
      id: storePurchasesTable.id,
      givenBy: storePurchasesTable.grantedBy,
      givenTo: playersTable.username,
      createdAt: storePurchasesTable.createdAt,
    })
    .from(storePurchasesTable)
    .leftJoin(playersTable, eq(storePurchasesTable.playerId, playersTable.id))
    .where(sql`${storePurchasesTable.stripeSessionId} LIKE 'free\_admin\_%'`)
    .orderBy(sql`${storePurchasesTable.id} desc`);
  res.json(
    AdminListGrantsResponse.parse({
      grants: rows.map((r) => ({
        id: r.id,
        givenBy: r.givenBy,
        givenTo: r.givenTo,
        createdAt: r.createdAt.toISOString(),
      })),
    }),
  );
});

router.post("/admin/cleanup-catalog", async (req, res): Promise<void> => {
  const parsed = AdminCleanupCatalogBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong admin password" });
    return;
  }
  const validNames = BLOOKS.map((b) => b.name);
  const result = await db.transaction(async (tx) => {
    const owned = await tx
      .delete(ownedBlooksTable)
      .where(notInArray(ownedBlooksTable.blookName, validNames))
      .returning({ id: ownedBlooksTable.id, playerId: ownedBlooksTable.playerId });
    const unlocks = await tx
      .delete(unlocksTable)
      .where(notInArray(unlocksTable.blookName, validNames))
      .returning({ id: unlocksTable.id });
    const listings = await tx
      .delete(bazaarListingsTable)
      .where(notInArray(bazaarListingsTable.blookName, validNames))
      .returning({ id: bazaarListingsTable.id });
    const avatars = await tx
      .update(playersTable)
      .set({ avatarBlook: null })
      .where(
        and(
          isNotNull(playersTable.avatarBlook),
          notInArray(playersTable.avatarBlook, validNames),
        ),
      )
      .returning({ id: playersTable.id });
    return {
      ownedBlooksDeleted: owned.length,
      unlocksDeleted: unlocks.length,
      listingsDeleted: listings.length,
      avatarsCleared: avatars.length,
      affectedPlayerIds: [...new Set(owned.map((o) => o.playerId))],
    };
  });
  // Deleted rows can change these players' effective collection counts.
  for (const pid of result.affectedPlayerIds) {
    await syncCollectorBadge(pid);
  }
  const { affectedPlayerIds: _ignored, ...summary } = result;
  req.log.info(summary, "Admin cleaned up orphaned catalog data");
  res.json(AdminCleanupCatalogResponse.parse(result));
});

const ONLINE_WINDOW_MS = 5 * 60 * 1000; // seen in the last 5 minutes = online

router.post("/admin/player-stats", async (req, res): Promise<void> => {
  const parsed = AdminPlayerStatsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong admin password" });
    return;
  }
  const [counts] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(playersTable)
    .where(eq(playersTable.isBot, false));
  const [purchases] = await db
    .select({
      total: sql<number>`count(*)::int`,
      buyers: sql<number>`count(distinct ${storePurchasesTable.playerId})::int`,
    })
    .from(storePurchasesTable)
    // Free claims (allowlisted accounts) don't count as real buys.
    .where(sql`${storePurchasesTable.stripeSessionId} NOT LIKE 'free\_%'`);
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS);
  const online = await db
    .select({
      username: playersTable.username,
      lastSeenAt: playersTable.lastSeenAt,
    })
    .from(playersTable)
    .where(
      sql`${playersTable.isBot} = false AND ${playersTable.lastSeenAt} >= ${cutoff}`,
    )
    .orderBy(sql`${playersTable.lastSeenAt} DESC`);
  res.json(
    AdminPlayerStatsResponse.parse({
      totalPlayers: counts?.total ?? 0,
      onlineCount: online.length,
      purchaseCount: purchases?.total ?? 0,
      purchaseBuyers: purchases?.buyers ?? 0,
      onlinePlayers: online.map((p) => ({
        username: p.username,
        lastSeenAt: p.lastSeenAt!.toISOString(),
      })),
    }),
  );
});

router.post("/admin/clear-chat", async (req, res): Promise<void> => {
  const parsed = AdminClearChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  // Wiping data is owner-tier (owner or co-owner).
  if (!checkOwnerTierPassword(parsed.data.password)) {
    res.status(401).json({ message: "Owner or co-owner password required" });
    return;
  }
  const deleted = await db.delete(chatMessagesTable).returning({ id: chatMessagesTable.id });
  req.log.info({ deleted: deleted.length }, "Admin cleared chat");
  res.json(AdminClearChatResponse.parse({ deleted: deleted.length }));
});

router.post("/admin/clear-bazaar", async (req, res): Promise<void> => {
  const parsed = AdminClearBazaarBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  // Wiping data is owner-tier (owner or co-owner).
  if (!checkOwnerTierPassword(parsed.data.password)) {
    res.status(401).json({ message: "Owner or co-owner password required" });
    return;
  }
  const deleted = await db
    .delete(bazaarListingsTable)
    .returning({ id: bazaarListingsTable.id });
  req.log.info({ deleted: deleted.length }, "Admin cleared bazaar");
  res.json(AdminClearBazaarResponse.parse({ deleted: deleted.length }));
});

export default router;
