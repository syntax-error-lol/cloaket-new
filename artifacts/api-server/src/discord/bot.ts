import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  SlashCommandBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
  ThreadChannel,
  type Guild,
  type Webhook,
} from "discord.js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import nodePath from "node:path";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import {
  db,
  playersTable,
  appSettingsTable,
  chatMessagesTable,
  clanMembersTable,
  clanMessagesTable,
  clansTable,
  discordLinksTable,
  ownedBlooksTable,
  packPullsTable,
  type Player,
  type TradeRow,
} from "@workspace/db";
import { CATALOG_BLOOKS as BLOOKS, CATALOG_PACKS as PACKS } from "../data/catalogExtensions";
import {
  clanTagsForPlayers,
  containsLink,
  getBlookDef,
  getPackDef,
  MISC_PACK,
  TOP_PACK,
  LEGACY_TOP_PACK,
  playerAvatarImage,
} from "../lib/game";
import { isTopPackDisabled } from "../routes/owner";
import { isTopPackSoldOut } from "../lib/topPack";
import { orderedPacks } from "../lib/packOrder";

/** Hidden from lists and unopenable when owner-disabled or the 1k supply is gone. */
async function topPackHidden(): Promise<boolean> {
  return (await isTopPackDisabled()) || (await isTopPackSoldOut());
}
import { openPackForPlayer } from "../lib/openPack";
import {
  activeTrade,
  acceptTradeRequest,
  declineActiveTrade,
  latestIncomingRequest,
  myOfferEntries,
  refreshedActiveTrade,
  sendTradeRequest,
  setTradeOffer,
  toggleTradeAccept,
  tradeView,
} from "../lib/tradeActions";
import { verifyPassword } from "../routes/auth";
import { isLockedOut, recordFailedLogin, clearLoginFailures } from "../lib/loginGuard";
import { canonicalizeMentions } from "../routes/chat";
import { areLinksAllowed } from "../routes/owner";
import { logger } from "../lib/logger";

const BRIDGE_CHANNEL_NAME = "cloaket-chat";
const CLAN_CHANNEL_NAME = "cloaket-clan-chat";
const WEBHOOK_NAME = "Cloaket Bridge";
const POLL_MS = 3000;
const CLAN_SYNC_MS = 60_000;

/** Public origin for absolute image URLs (blook art, avatars). */
function publicOrigin(): string {
  const domain =
    process.env["REPLIT_DOMAINS"]?.split(",")[0] ??
    process.env["REPLIT_DEV_DOMAIN"] ??
    "";
  return domain ? `https://${domain}` : "";
}

function absUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  const origin = publicOrigin();
  return origin ? `${origin}${path}` : undefined;
}

/**
 * Best image URL for a blook in a Discord embed. Discord doesn't animate
 * webp files, so animated blooks ship a .gif twin next to the .webp —
 * use it when it exists (checked once and cached). Keeps the ?v= cache
 * buster so Discord fetches updated art.
 */
const gifTwinCache = new Map<string, boolean>();
function blookArtUrl(image: string | null | undefined): string | undefined {
  if (!image) return undefined;
  const [imgPath = "", query] = image.split("?");
  if (imgPath.endsWith(".webp")) {
    const rel = decodeURIComponent(imgPath.replace(/^\/api\/content\//, "")).replace(/\.webp$/, ".gif");
    let hasGif = gifTwinCache.get(rel);
    if (hasGif === undefined) {
      // The server runs from the bundled dist/ directory, so public/ sits one
      // level up (same resolution app.ts uses for the static mount).
      hasGif = fs.existsSync(nodePath.resolve(import.meta.dirname, "../public/content", rel));
      gifTwinCache.set(rel, hasGif);
    }
    if (hasGif) {
      const gifPath = imgPath.replace(/\.webp$/, ".gif");
      return absUrl(query ? `${gifPath}?${query}` : gifPath);
    }
  }
  return absUrl(image);
}

async function linkedPlayer(discordId: string): Promise<Player | null> {
  const [row] = await db
    .select({ player: playersTable })
    .from(discordLinksTable)
    .innerJoin(playersTable, eq(discordLinksTable.playerId, playersTable.id))
    .where(eq(discordLinksTable.discordId, discordId));
  return row?.player ?? null;
}

const commands = [
  new SlashCommandBuilder()
    .setName("login")
    .setDescription("Log in to your Cloaket account"),
  new SlashCommandBuilder()
    .setName("logout")
    .setDescription("Unlink your Cloaket account from Discord"),
  new SlashCommandBuilder()
    .setName("open")
    .setDescription("Open a Cloaket pack")
    .addStringOption((o) =>
      o
        .setName("pack")
        .setDescription("Which pack to open (e.g. Space)")
        .setRequired(true)
        .setAutocomplete(true),
    ),
  new SlashCommandBuilder()
    .setName("packs")
    .setDescription("List all Cloaket packs and prices"),
  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Show your Cloaket token balance"),
  new SlashCommandBuilder()
    .setName("trade")
    .setDescription("Trade with another Cloaket player")
    .addSubcommand((s) =>
      s
        .setName("start")
        .setDescription("Send a trade request to a player")
        .addStringOption((o) =>
          o.setName("user").setDescription("Cloaket username").setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add a blook to your trade offer")
        .addStringOption((o) =>
          o.setName("blook").setDescription("Search your blooks").setRequired(true).setAutocomplete(true),
        )
        .addIntegerOption((o) =>
          o.setName("quantity").setDescription("How many (default 1)").setMinValue(1),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove a blook from your trade offer")
        .addStringOption((o) =>
          o.setName("blook").setDescription("Blook in your offer").setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("tokens")
        .setDescription("Set the tokens in your trade offer")
        .addIntegerOption((o) =>
          o.setName("amount").setDescription("Token amount").setRequired(true).setMinValue(0),
        ),
    )
    .addSubcommand((s) => s.setName("view").setDescription("See both sides of the trade"))
    .addSubcommand((s) => s.setName("accept").setDescription("Accept the trade request or trade"))
    .addSubcommand((s) => s.setName("decline").setDescription("Decline the trade")),
  new SlashCommandBuilder()
    .setName("quantity")
    .setDescription("How many of a blook exist in Cloaket + top 10 owners")
    .addStringOption((o) =>
      o
        .setName("blook")
        .setDescription("Which blook (e.g. Alien)")
        .setRequired(true)
        .setAutocomplete(true),
    ),
].map((c) => c.toJSON());

async function registerCommands(guild: Guild): Promise<void> {
  try {
    await guild.commands.set(commands);
  } catch (err) {
    logger.error({ err, guild: guild.id }, "Discord: failed to register commands");
  }
}

/** Message ids inserted from Discord — the poller must not echo them back. */
const fromDiscord = new Set<number>();
const fromDiscordClan = new Set<number>();
function markEcho(set: Set<number>, id: number): void {
  set.add(id);
  if (set.size > 500) {
    for (const v of set) {
      set.delete(v);
      if (set.size <= 400) break;
    }
  }
}

/** Clan thread names carry the clan id so renames/duplicates can't confuse us. */
function clanThreadName(clanName: string, clanId: number): string {
  return `${clanName.slice(0, 80)} [${clanId}]`;
}
function clanIdFromThreadName(name: string): number | null {
  const m = /\[(\d+)\]$/.exec(name);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------------------
// Single-leader election.
//
// The production deployment runs several server instances at once
// (autoscale), and Discord delivers every gateway event to EVERY logged-in
// session of the bot. With one session per instance, a single Discord
// message was inserted into game chat once per instance (players saw each
// message double/triple), warning replies were duplicated the same way, and
// the 1-token chat reward was granted N times.
//
// Fix: exactly one instance may run the bot. Instances compete for a lease
// row in app_settings (value "<expiresAtMs>:<instanceId>"); the holder
// renews it every LEADER_RENEW_MS, everyone else re-checks and takes over
// only once the lease expires (crash) or is released (clean shutdown). The
// game->Discord cursor claims stay as the second safety layer.
// ---------------------------------------------------------------------------
const LEADER_KEY = "discord_bot_leader";
const LEADER_TTL_MS = 45_000;
const LEADER_RENEW_MS = 15_000;
const instanceId = randomUUID();

async function claimLeadership(): Promise<boolean> {
  // Make sure the lease row exists (as an expired lease nobody owns).
  await db
    .insert(appSettingsTable)
    .values({ key: LEADER_KEY, value: "0:none" })
    .onConflictDoNothing({ target: appSettingsTable.key });
  // Timestamps are DATABASE time (epoch ms), written and compared in SQL, so
  // instance clock skew can never make one machine treat a live lease as
  // expired. The parse is a CASE — Postgres does NOT short-circuit boolean
  // OR, so this is the only way to guarantee the ::bigint cast never runs on
  // junk — and the digit count is bounded so the cast can't overflow.
  const res = await db
    .update(appSettingsTable)
    .set({
      value: sql<string>`((extract(epoch from now()) * 1000)::bigint + ${LEADER_TTL_MS})::text || ':' || ${instanceId}`,
    })
    .where(
      and(
        eq(appSettingsTable.key, LEADER_KEY),
        // Claimable when it's already mine (renewal), malformed junk, or
        // expired. Anything else means another instance holds a live lease.
        sql`CASE
          WHEN split_part(${appSettingsTable.value}, ':', 2) = ${instanceId} THEN true
          WHEN ${appSettingsTable.value} !~ '^[0-9]{1,15}:' THEN true
          ELSE split_part(${appSettingsTable.value}, ':', 1)::bigint < (extract(epoch from now()) * 1000)::bigint
        END`,
      ),
    );
  return (res.rowCount ?? 0) > 0;
}

async function releaseLeadership(): Promise<void> {
  await db
    .update(appSettingsTable)
    .set({ value: "0:none" })
    .where(
      and(
        eq(appSettingsTable.key, LEADER_KEY),
        sql`split_part(${appSettingsTable.value}, ':', 2) = ${instanceId}`,
      ),
    );
}

export function startDiscordBot(): void {
  // Only run the bot in the published deployment. In the dev workspace a
  // second bot instance shares the same token and races the prod bot for
  // Discord interactions — users would randomly hit the dev database and get
  // "wrong password" / "use /login" even though their prod account is fine.
  if (!process.env.REPLIT_DEPLOYMENT) {
    logger.info("Discord bot disabled outside production deployment");
    return;
  }
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    logger.info("DISCORD_BOT_TOKEN not set — Discord bot disabled");
    return;
  }

  let bot: { stop: () => void } | null = null;
  let checking = false;
  // When we last CONFIRMED holding the lease. Monotonic clock
  // (performance.now) so a wall-clock step can't delay the fail-close; only
  // ever used to measure elapsed time on this machine, never compared
  // across instances.
  let leaseConfirmedAt = 0;
  // If renewals keep failing (e.g. only OUR db connection is broken while
  // other instances are healthy), the lease will expire and someone else
  // will claim it. Fail closed: stop our bot comfortably BEFORE that can
  // happen, so two live gateway sessions can never overlap.
  const FAIL_CLOSED_AFTER_MS = LEADER_TTL_MS - LEADER_RENEW_MS - 5_000;
  const tick = async (): Promise<void> => {
    if (checking) return;
    checking = true;
    try {
      const leader = await claimLeadership();
      if (leader) {
        leaseConfirmedAt = performance.now();
        if (!bot) {
          logger.info({ instanceId }, "Discord: won bot leadership — starting bot");
          bot = launchBot(token);
        }
      } else if (bot) {
        // Another instance took over after our lease lapsed. Stop right away
        // so there is never more than one live gateway session.
        logger.warn({ instanceId }, "Discord: lost bot leadership — stopping bot");
        bot.stop();
        bot = null;
      }
    } catch (err) {
      logger.error({ err }, "Discord: leadership check failed");
      if (bot && performance.now() - leaseConfirmedAt > FAIL_CLOSED_AFTER_MS) {
        logger.warn(
          { instanceId },
          "Discord: lease renewal failing — stopping bot before the lease can expire",
        );
        bot.stop();
        bot = null;
      }
    } finally {
      checking = false;
    }
  };
  void tick();
  setInterval(tick, LEADER_RENEW_MS);

  // Hand the lease back on shutdown so the replacement instance takes over
  // in seconds instead of waiting out the whole TTL. Registering a SIGTERM
  // handler disables the default exit, so we must exit ourselves (bounded —
  // never hang shutdown on a dead database).
  const releaseOnExit = (): void => {
    bot?.stop();
    bot = null;
    void Promise.race([
      releaseLeadership().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]).finally(() => process.exit(0));
  };
  process.once("SIGTERM", releaseOnExit);
  process.once("SIGINT", releaseOnExit);
}

/** Builds, logs in, and runs the Discord client. Only ever runs on the lease leader. */
function launchBot(token: string): { stop: () => void } {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });
  let stopped = false;
  const timers: NodeJS.Timeout[] = [];

  let bridgeChannel: TextChannel | null = null;
  let bridgeWebhook: Webhook | null = null;
  let polling = false;

  // Bridge cursors live in app_settings (NOT in memory) so that when more
  // than one server instance runs at once (autoscale, overlapping deploys),
  // only ONE instance bridges each message — the others lose the atomic
  // cursor claim below and skip the batch. In-memory cursors caused the same
  // game message to be posted to Discord once per running instance.
  const CHAT_CURSOR_KEY = "discord_chat_cursor";
  const CLAN_CURSOR_KEY = "discord_clan_cursor";

  /** Ensure a cursor row exists; start bridging from "now", never replay history. */
  async function initCursor(key: string, init: number): Promise<void> {
    await db
      .insert(appSettingsTable)
      .values({ key, value: String(init) })
      .onConflictDoNothing({ target: appSettingsTable.key });
  }

  async function readCursor(key: string): Promise<number> {
    const [row] = await db
      .select({ value: appSettingsTable.value })
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, key));
    return Number(row?.value ?? 0);
  }

  /**
   * Atomically advance the cursor; false means another instance claimed it.
   * Delivery is deliberately at-most-once: if a send (or the process) fails
   * after the claim, that batch is dropped rather than retried — for a live
   * chat mirror, losing a rare message beats ever double-posting one.
   * Banned-clan messages between cursor positions are skipped on purpose;
   * they stay ineligible even if the clan is later unbanned.
   */
  async function claimCursor(key: string, from: number, to: number): Promise<boolean> {
    const res = await db
      .update(appSettingsTable)
      .set({ value: String(to) })
      .where(and(eq(appSettingsTable.key, key), eq(appSettingsTable.value, String(from))));
    return (res.rowCount ?? 0) > 0;
  }

  // Clan chat bridge: #cloaket-clan-chat with one PRIVATE thread per clan, so
  // players only ever see their own clan's chat.
  let clanChannel: TextChannel | null = null;
  let clanWebhook: Webhook | null = null;
  let clanPolling = false;
  const clanThreads = new Map<number, ThreadChannel>(); // clanId -> thread
  const threadMembersAdded = new Set<string>(); // `${threadId}:${discordId}`

  // Blunt password guessing through the /login modal: max 5 attempts per
  // Discord user per 15 minutes (in-memory, resets on restart).
  const loginAttempts = new Map<string, { count: number; resetAt: number }>();
  function loginRateLimited(discordId: string): boolean {
    const now = Date.now();
    const entry = loginAttempts.get(discordId);
    if (!entry || now >= entry.resetAt) {
      loginAttempts.set(discordId, { count: 1, resetAt: now + 15 * 60_000 });
      return false;
    }
    entry.count += 1;
    return entry.count > 5;
  }

  /**
   * The single guild the bot is allowed to bridge to. Security: never let a
   * random server become the bridge — with multiple guilds, an explicit
   * DISCORD_CHANNEL_ID (a channel in the right guild) is required.
   */
  function allowedGuilds(): Guild[] {
    const pinnedChannelId = process.env["DISCORD_CHANNEL_ID"];
    if (pinnedChannelId) {
      const guild = client.guilds.cache.find((g) => g.channels.cache.has(pinnedChannelId));
      return guild ? [guild] : [];
    }
    if (client.guilds.cache.size > 1) {
      logger.warn(
        "Discord: bot is in multiple servers — set DISCORD_CHANNEL_ID to the #" +
          BRIDGE_CHANNEL_NAME +
          " channel id to enable the chat bridges",
      );
      return [];
    }
    return [...client.guilds.cache.values()];
  }

  async function webhookFor(channel: TextChannel): Promise<Webhook> {
    const hooks = await channel.fetchWebhooks();
    return (
      hooks.find((h) => h.name === WEBHOOK_NAME && h.token) ??
      (await channel.createWebhook({ name: WEBHOOK_NAME }))
    );
  }

  async function findBridgeChannel(): Promise<void> {
    bridgeChannel = null;
    bridgeWebhook = null;
    const pinnedChannelId = process.env["DISCORD_CHANNEL_ID"];
    for (const guild of allowedGuilds()) {
      const channel = guild.channels.cache.find(
        (c): c is TextChannel =>
          c.type === ChannelType.GuildText &&
          (pinnedChannelId ? c.id === pinnedChannelId : c.name === BRIDGE_CHANNEL_NAME),
      );
      if (!channel) continue;
      try {
        bridgeWebhook = await webhookFor(channel);
        bridgeChannel = channel;
        logger.info({ guild: guild.name }, "Discord: chat bridge connected to #" + BRIDGE_CHANNEL_NAME);
        return;
      } catch (err) {
        logger.error({ err }, "Discord: can't manage webhooks in #" + BRIDGE_CHANNEL_NAME);
      }
    }
    logger.warn(
      `Discord: no #${BRIDGE_CHANNEL_NAME} channel found — create one (and give the bot Manage Webhooks) to enable the live chat bridge`,
    );
  }

  async function findClanChannel(): Promise<void> {
    clanChannel = null;
    clanWebhook = null;
    for (const guild of allowedGuilds()) {
      const channel = guild.channels.cache.find(
        (c): c is TextChannel =>
          c.type === ChannelType.GuildText && c.name === CLAN_CHANNEL_NAME,
      );
      if (!channel) continue;
      try {
        clanWebhook = await webhookFor(channel);
        clanChannel = channel;
        logger.info({ guild: guild.name }, "Discord: clan chat connected to #" + CLAN_CHANNEL_NAME);
        return;
      } catch (err) {
        logger.error({ err }, "Discord: can't manage webhooks in #" + CLAN_CHANNEL_NAME);
      }
    }
  }

  /** Get (or create) the private thread for a clan and keep its members synced. */
  async function ensureClanThread(clanId: number, clanName: string): Promise<ThreadChannel | null> {
    if (!clanChannel) return null;
    let thread = clanThreads.get(clanId) ?? null;
    if (!thread) {
      try {
        // Only trust PRIVATE threads that the BOT created — thread names are
        // user-editable, so a renamed thread must never hijack another clan.
        const trusted = (t: ThreadChannel) =>
          t.type === ChannelType.PrivateThread &&
          t.ownerId === client.user?.id &&
          clanIdFromThreadName(t.name) === clanId;
        const active = await clanChannel.threads.fetchActive();
        thread = active.threads.find(trusted) ?? null;
        if (!thread) {
          const archived = await clanChannel.threads.fetchArchived();
          const found = archived.threads.find(trusted) ?? null;
          if (found) {
            await found.setArchived(false).catch(() => {});
            thread = found;
          }
        }
        if (!thread) {
          thread = await clanChannel.threads.create({
            name: clanThreadName(clanName, clanId),
            type: ChannelType.PrivateThread,
            invitable: false,
            reason: "Cloaket clan chat",
          });
        }
        clanThreads.set(clanId, thread);
      } catch (err) {
        logger.error({ err, clanId }, "Discord: can't create clan thread (bot needs Create Private Threads + Manage Threads)");
        return null;
      }
    }
    // Add every linked member of this clan to the private thread (idempotent).
    try {
      const members = await db
        .select({ discordId: discordLinksTable.discordId })
        .from(clanMembersTable)
        .innerJoin(discordLinksTable, eq(clanMembersTable.playerId, discordLinksTable.playerId))
        .where(eq(clanMembersTable.clanId, clanId));
      for (const m of members) {
        const key = `${thread.id}:${m.discordId}`;
        if (threadMembersAdded.has(key)) continue;
        await thread.members.add(m.discordId).catch(() => {});
        threadMembersAdded.add(key);
      }
    } catch (err) {
      logger.error({ err, clanId }, "Discord: failed to sync clan thread members");
    }
    return thread;
  }

  /** Periodically make sure every clan with linked members has its thread. */
  async function syncClanThreads(): Promise<void> {
    if (stopped) return;
    if (!clanChannel) return;
    try {
      const rows = await db
        .selectDistinct({ clanId: clanMembersTable.clanId, name: clansTable.name })
        .from(clanMembersTable)
        .innerJoin(discordLinksTable, eq(clanMembersTable.playerId, discordLinksTable.playerId))
        .innerJoin(clansTable, eq(clanMembersTable.clanId, clansTable.id))
        .where(eq(clansTable.banned, false));
      for (const r of rows) await ensureClanThread(r.clanId, r.name);
    } catch (err) {
      logger.error({ err }, "Discord: clan thread sync failed");
    }
  }

  /** Push new Cloaket clan chat messages into each clan's private thread. */
  async function pollClanChat(): Promise<void> {
    if (stopped) return;
    if (clanPolling || !clanWebhook || !clanChannel) return;
    clanPolling = true;
    try {
      const clanCursor = await readCursor(CLAN_CURSOR_KEY);
      const rows = await db
        .select({
          id: clanMessagesTable.id,
          clanId: clanMessagesTable.clanId,
          playerId: clanMessagesTable.playerId,
          username: playersTable.username,
          avatarBlook: playersTable.avatarBlook,
          customAvatarUrl: playersTable.customAvatarUrl,
          content: clanMessagesTable.content,
          clanName: clansTable.name,
          fromDiscord: clanMessagesTable.fromDiscord,
        })
        .from(clanMessagesTable)
        .innerJoin(playersTable, eq(clanMessagesTable.playerId, playersTable.id))
        .innerJoin(clansTable, eq(clanMessagesTable.clanId, clansTable.id))
        // Banned clans are hidden everywhere — skip bridging their messages.
        .where(and(gt(clanMessagesTable.id, clanCursor), eq(clansTable.banned, false)))
        .orderBy(asc(clanMessagesTable.id))
        .limit(50);
      if (rows.length === 0) return;
      // Claim the whole batch atomically — if another instance got there
      // first, skip it entirely (prevents double-posting to Discord).
      if (!(await claimCursor(CLAN_CURSOR_KEY, clanCursor, rows[rows.length - 1].id))) return;
      for (const r of rows) {
        if (!r.fromDiscord && !fromDiscordClan.has(r.id)) {
          const thread = await ensureClanThread(r.clanId, r.clanName);
          if (thread) {
            const content = r.content.replace(/@(everyone|here)/gi, "@\u200b$1").slice(0, 2000);
            try {
              await clanWebhook.send({
                content,
                username: r.username.slice(0, 80),
                avatarURL: absUrl(playerAvatarImage(r.avatarBlook, r.username, r.customAvatarUrl)),
                allowedMentions: { parse: [] },
                threadId: thread.id,
              });
            } catch (err) {
              // Batch is already claimed — dropping beats double-posting.
              logger.error({ err, msgId: r.id }, "Discord: failed to bridge clan message");
            }
          }
        }
      }
    } catch (err) {
      logger.error({ err }, "Discord: clan chat poll failed");
    } finally {
      clanPolling = false;
    }
  }

  /** Push new Cloaket chat messages into Discord as the players themselves. */
  async function pollChat(): Promise<void> {
    if (stopped) return;
    if (polling || !bridgeWebhook) return;
    polling = true;
    try {
      const cursor = await readCursor(CHAT_CURSOR_KEY);
      const rows = await db
        .select({
          id: chatMessagesTable.id,
          playerId: chatMessagesTable.playerId,
          username: playersTable.username,
          avatarBlook: playersTable.avatarBlook,
          customAvatarUrl: playersTable.customAvatarUrl,
          content: chatMessagesTable.content,
          mentions: chatMessagesTable.mentions,
          fromDiscord: chatMessagesTable.fromDiscord,
        })
        .from(chatMessagesTable)
        .innerJoin(playersTable, eq(chatMessagesTable.playerId, playersTable.id))
        .where(gt(chatMessagesTable.id, cursor))
        .orderBy(asc(chatMessagesTable.id))
        .limit(50);
      if (rows.length === 0) return;
      // Claim the whole batch atomically — if another instance got there
      // first, skip it entirely (prevents double-posting to Discord).
      if (!(await claimCursor(CHAT_CURSOR_KEY, cursor, rows[rows.length - 1].id))) return;
      const tags = await clanTagsForPlayers(rows.map((r) => r.playerId));
      // Cloaket @mentions of linked players become real Discord pings.
      const mentioned = [...new Set(rows.flatMap((r) => r.mentions ?? []))];
      const discordIds = new Map<string, string>(); // lowercased username -> discord id
      if (mentioned.length > 0) {
        const links = await db
          .select({ username: playersTable.username, discordId: discordLinksTable.discordId })
          .from(discordLinksTable)
          .innerJoin(playersTable, eq(discordLinksTable.playerId, playersTable.id))
          .where(inArray(playersTable.username, mentioned));
        for (const l of links) discordIds.set(l.username.toLowerCase(), l.discordId);
      }
      for (const r of rows) {
        if (!r.fromDiscord && !fromDiscord.has(r.id)) {
          const tag = tags.get(r.playerId);
          const name = tag ? `[${tag.name}] ${r.username}` : r.username;
          // Strip @everyone/@here-style pings so game chat can't ping Discord.
          let content = r.content.replace(/@(everyone|here)/gi, "@\u200b$1").slice(0, 2000);
          const pingIds: string[] = [];
          for (const m of r.mentions ?? []) {
            const id = discordIds.get(m.toLowerCase());
            if (!id) continue;
            const re = new RegExp(`@${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
            if (re.test(content)) {
              content = content.replace(re, `<@${id}>`);
              pingIds.push(id);
            }
          }
          try {
            await bridgeWebhook.send({
              content,
              username: name.slice(0, 80),
              avatarURL: absUrl(playerAvatarImage(r.avatarBlook, r.username, r.customAvatarUrl)),
              allowedMentions: { parse: [], users: pingIds.slice(0, 20) },
            });
          } catch (err) {
            // Batch is already claimed — dropping beats double-posting.
            logger.error({ err, msgId: r.id }, "Discord: failed to bridge message to Discord");
          }
        }
      }
    } catch (err) {
      logger.error({ err }, "Discord: chat poll failed");
    } finally {
      polling = false;
    }
  }

  client.on(Events.Error, (err) => {
    logger.error({ err }, "Discord client error");
  });

  client.once(Events.ClientReady, async () => {
    if (stopped) return; // leadership was lost before the gateway came up
    // Any failure here must never crash the game server.
    try {
      logger.info({ user: client.user?.tag }, "Discord bot logged in");
      for (const guild of client.guilds.cache.values()) await registerCommands(guild);
      // Start bridging from "now" — don't replay old history into Discord.
      // (Only seeds the DB cursor rows if they don't exist yet.)
      const [row] = await db
        .select({ max: sql<number>`coalesce(max(${chatMessagesTable.id}), 0)` })
        .from(chatMessagesTable);
      await initCursor(CHAT_CURSOR_KEY, row?.max ?? 0);
      const [clanRow] = await db
        .select({ max: sql<number>`coalesce(max(${clanMessagesTable.id}), 0)` })
        .from(clanMessagesTable);
      await initCursor(CLAN_CURSOR_KEY, clanRow?.max ?? 0);
      await findBridgeChannel();
      await findClanChannel();
      await syncClanThreads();
      // Re-check after all the awaits above: if leadership was lost during
      // this async setup, installing timers now would leak pollers that
      // stop() already ran too early to clear.
      if (stopped) return;
      timers.push(setInterval(pollChat, POLL_MS));
      timers.push(setInterval(pollClanChat, POLL_MS));
      timers.push(setInterval(syncClanThreads, CLAN_SYNC_MS));
    } catch (err) {
      logger.error({ err }, "Discord bot startup failed — bot disabled");
    }
  });

  client.on(Events.GuildCreate, async (guild) => {
    await registerCommands(guild);
    if (!bridgeChannel) await findBridgeChannel();
    if (!clanChannel) await findClanChannel();
  });

  client.on(Events.ChannelCreate, async (channel) => {
    if (channel.type !== ChannelType.GuildText) return;
    if (!bridgeChannel && channel.name === BRIDGE_CHANNEL_NAME) await findBridgeChannel();
    if (!clanChannel && channel.name === CLAN_CHANNEL_NAME) {
      await findClanChannel();
      await syncClanThreads();
    }
  });

  // Discord -> Cloaket: clan chat typed inside a clan's private thread.
  async function handleClanThreadMessage(message: import("discord.js").Message): Promise<void> {
    const thread = message.channel as ThreadChannel;
    // Authorize by the bot's own clanId -> thread map (bot-created threads
    // only) — NEVER by the thread's user-editable name.
    let clanId: number | null = null;
    for (const [id, t] of clanThreads) {
      if (t.id === thread.id) {
        clanId = id;
        break;
      }
    }
    if (clanId === null) return;
    const player = await linkedPlayer(message.author.id);
    if (!player) {
      const warn = await message.reply(
        "You're not logged in — use `/login` to link your Cloaket account first.",
      );
      setTimeout(() => warn.delete().catch(() => {}), 10_000);
      return;
    }
    if (player.banned || player.muted) {
      const warn = await message.reply(
        player.banned ? "Your Cloaket account is banned." : "You are muted and can't send chat messages.",
      );
      setTimeout(() => warn.delete().catch(() => {}), 10_000);
      return;
    }
    // Only members of THIS clan may talk in its thread.
    const [membership] = await db
      .select()
      .from(clanMembersTable)
      .where(eq(clanMembersTable.playerId, player.id));
    if (!membership || membership.clanId !== clanId) {
      const warn = await message.reply("This isn't your clan's chat.");
      setTimeout(() => warn.delete().catch(() => {}), 10_000);
      await message.delete().catch(() => {});
      return;
    }
    // Banned clans are frozen: no chat through Discord either.
    const [clanRow] = await db
      .select({ banned: clansTable.banned })
      .from(clansTable)
      .where(eq(clansTable.id, clanId));
    if (!clanRow || clanRow.banned) {
      await message.delete().catch(() => {});
      return;
    }
    const raw = message.content.trim().slice(0, 500);
    if (!raw) return;
    if (containsLink(raw) && !(await areLinksAllowed())) {
      const warn = await message.reply("Links aren't allowed in Cloaket chat.");
      setTimeout(() => warn.delete().catch(() => {}), 10_000);
      return;
    }
    const [msg] = await db
      .insert(clanMessagesTable)
      .values({ clanId, playerId: player.id, content: raw, fromDiscord: true })
      .returning();
    if (msg) markEcho(fromDiscordClan, msg.id);
  }

  // Discord -> Cloaket: messages in #cloaket-chat from linked users.
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot || message.webhookId) return;
      if (
        clanChannel &&
        message.channel.isThread() &&
        message.channel.parentId === clanChannel.id
      ) {
        await handleClanThreadMessage(message);
        return;
      }
      if (!bridgeChannel || message.channelId !== bridgeChannel.id) return;
      const player = await linkedPlayer(message.author.id);
      if (!player) {
        const warn = await message.reply(
          "You're not logged in — use `/login` to link your Cloaket account first.",
        );
        setTimeout(() => warn.delete().catch(() => {}), 10_000);
        return;
      }
      if (player.banned || player.muted) {
        const warn = await message.reply(
          player.banned ? "Your Cloaket account is banned." : "You are muted and can't send chat messages.",
        );
        setTimeout(() => warn.delete().catch(() => {}), 10_000);
        return;
      }
      const raw = message.content.trim().slice(0, 500);
      if (!raw) return;
      if (containsLink(raw) && !(await areLinksAllowed())) {
        const warn = await message.reply("Links aren't allowed in Cloaket chat.");
        setTimeout(() => warn.delete().catch(() => {}), 10_000);
        return;
      }
      const { content, mentions } = await canonicalizeMentions(raw);
      const [msg] = await db
        .insert(chatMessagesTable)
        .values({ playerId: player.id, content, mentions, fromDiscord: true })
        .returning();
      if (msg) markEcho(fromDiscord, msg.id);
      // Same 1-token reward as sending from the site.
      await db
        .update(playersTable)
        .set({ tokens: sql`${playersTable.tokens} + 1` })
        .where(eq(playersTable.id, player.id));
    } catch (err) {
      logger.error({ err }, "Discord: failed to bridge message to Cloaket");
    }
  });

  /** Embed + Accept/Decline buttons showing both sides of the player's trade. */
  async function tradePanel(trade: TradeRow, playerId: number) {
    const view = await tradeView(trade, playerId);
    const side = (o: { tokens: number; blooks: { name: string; quantity: number }[] }) => {
      const lines = o.blooks.map((b) => `${b.name} ×${b.quantity}`);
      if (o.tokens > 0) lines.push(`🪙 ${o.tokens.toLocaleString()} tokens`);
      return lines.length > 0 ? lines.join("\n") : "*Nothing yet*";
    };
    const statusLine =
      view.status === "completed"
        ? "✅ **Trade completed!**"
        : view.status === "declined"
          ? "❌ **Trade declined.**"
          : `You: ${view.myAccepted ? "✅ accepted" : "⬜ not accepted"} · ${view.partnerName}: ${view.partnerAccepted ? "✅ accepted" : "⬜ not accepted"}`;
    const embed = new EmbedBuilder()
      .setTitle(`Trade with ${view.partnerName}`)
      .setDescription(statusLine)
      .addFields(
        { name: "Your offer", value: side(view.myOffer), inline: true },
        { name: `${view.partnerName}'s offer`, value: side(view.partnerOffer), inline: true },
      )
      .setColor(view.status === "completed" ? 0x4caf50 : view.status === "declined" ? 0xf44336 : 0x8a7fff)
      .setThumbnail(absUrl(view.partnerAvatarImage) ?? null);
    const buttons =
      view.status === "active"
        ? [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("ct-accept")
                .setLabel(view.myAccepted ? "Un-accept" : "Accept")
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId("ct-decline").setLabel("Decline").setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId("ct-view").setLabel("Refresh").setStyle(ButtonStyle.Secondary),
            ),
          ]
        : [];
    return { embeds: [embed], components: buttons };
  }

  /** True when slash commands should be rejected in this channel (bridge channels are chat-only). */
  function inBridgeChannel(channelId: string | null, channel: { isThread(): boolean; parentId?: string | null } | null): boolean {
    if (bridgeChannel && channelId === bridgeChannel.id) return true;
    if (clanChannel && channelId === clanChannel.id) return true;
    if (clanChannel && channel?.isThread() && channel.parentId === clanChannel.id) return true;
    return false;
  }

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isAutocomplete()) {
        const q = interaction.options.getFocused().toLowerCase();
        if (interaction.commandName === "trade") {
          const sub = interaction.options.getSubcommand(false);
          if (sub === "start") {
            const rows = await db
              .select({ username: playersTable.username })
              .from(playersTable)
              .where(
                sql`lower(${playersTable.username}) like ${"%" + q + "%"} AND ${playersTable.isBot} = false AND ${playersTable.banned} = false`,
              )
              .orderBy(playersTable.username)
              .limit(25);
            await interaction.respond(rows.map((r) => ({ name: r.username, value: r.username })));
          } else if (sub === "add") {
            const player = await linkedPlayer(interaction.user.id);
            if (!player) {
              await interaction.respond([]);
              return;
            }
            const rows = await db
              .select({ name: ownedBlooksTable.blookName, quantity: ownedBlooksTable.quantity })
              .from(ownedBlooksTable)
              .where(
                sql`${ownedBlooksTable.playerId} = ${player.id} AND ${ownedBlooksTable.quantity} > 0 AND lower(${ownedBlooksTable.blookName}) like ${"%" + q + "%"}`,
              )
              .orderBy(ownedBlooksTable.blookName)
              .limit(25);
            await interaction.respond(
              rows.map((r) => {
                const def = getBlookDef(r.name);
                return {
                  name: `${r.name} (${def?.rarity ?? "?"}) — you own ${r.quantity}`,
                  value: r.name,
                };
              }),
            );
          } else if (sub === "remove") {
            const player = await linkedPlayer(interaction.user.id);
            const trade = player ? await activeTrade(player.id) : undefined;
            if (!player || !trade) {
              await interaction.respond([]);
              return;
            }
            const mine = myOfferEntries(trade, player.id);
            await interaction.respond(
              mine.blooks
                .filter((b) => b.name.toLowerCase().includes(q))
                .slice(0, 25)
                .map((b) => ({ name: `${b.name} ×${b.quantity}`, value: b.name })),
            );
          } else {
            await interaction.respond([]);
          }
          return;
        }
        if (interaction.commandName === "open") {
          const topDisabled = await topPackHidden();
          const matches = (await orderedPacks(PACKS)).filter((p) => p.name !== MISC_PACK && !(topDisabled && p.name === TOP_PACK) && p.name.toLowerCase().includes(q))
            .slice(0, 25)
            .map((p) => ({ name: `${p.name} — ${p.price} tokens`, value: p.name }));
          await interaction.respond(matches);
        } else if (interaction.commandName === "quantity") {
          const matches = BLOOKS.filter((b) => b.name.toLowerCase().includes(q))
            .slice(0, 25)
            .map((b) => ({ name: `${b.name} (${b.rarity})`, value: b.name }));
          await interaction.respond(matches);
        }
        return;
      }

      // Trade panel buttons (Accept / Decline / Refresh) — always ephemeral.
      if (interaction.isButton() && interaction.customId.startsWith("ct-")) {
        const player = await linkedPlayer(interaction.user.id);
        if (!player) {
          await interaction.reply({ content: "Use `/login` to link your Cloaket account first.", ephemeral: true });
          return;
        }
        if (interaction.customId === "ct-accept") {
          const result = await toggleTradeAccept(player.id);
          if (!result.ok) {
            await interaction.reply({ content: result.error, ephemeral: true });
            return;
          }
          await interaction.update(await tradePanel(result.value, player.id));
          return;
        }
        if (interaction.customId === "ct-decline") {
          const result = await declineActiveTrade(player.id);
          if (!result.ok) {
            await interaction.reply({ content: result.error, ephemeral: true });
            return;
          }
          await interaction.update(await tradePanel(result.value, player.id));
          return;
        }
        // ct-view (refresh)
        const trade = await refreshedActiveTrade(player.id);
        if (!trade) {
          await interaction.reply({ content: "No active trade.", ephemeral: true });
          return;
        }
        await interaction.update(await tradePanel(trade, player.id));
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === "cloaket-login") {
        if (loginRateLimited(interaction.user.id)) {
          await interaction.reply({
            content: "Too many login attempts — wait 15 minutes and try again.",
            ephemeral: true,
          });
          return;
        }
        const username = interaction.fields.getTextInputValue("username").trim().slice(0, 20);
        const password = interaction.fields.getTextInputValue("password").slice(0, 200);
        const [player] = await db
          .select()
          .from(playersTable)
          .where(sql`lower(${playersTable.username}) = lower(${username})`);
        if (!player || player.isBot || !player.passwordHash) {
          await interaction.reply({ content: "Wrong username or password.", ephemeral: true });
          return;
        }
        if (isLockedOut(player)) {
          await interaction.reply({ content: "Too many attempts on that account — try again later.", ephemeral: true });
          return;
        }
        if (!(await verifyPassword(password, player.passwordHash))) {
          // Same DB-backed lockout as the web login — Discord must not be a
          // side door around it.
          await recordFailedLogin(player.id);
          await interaction.reply({ content: "Wrong username or password.", ephemeral: true });
          return;
        }
        if (player.banned) {
          await interaction.reply({ content: "That account is banned.", ephemeral: true });
          return;
        }
        await clearLoginFailures(player);
        await db
          .insert(discordLinksTable)
          .values({ discordId: interaction.user.id, playerId: player.id })
          .onConflictDoUpdate({
            target: discordLinksTable.discordId,
            set: { playerId: player.id },
          });
        await interaction.reply({
          content: `Logged in as **${player.username}**. You can now chat in #${BRIDGE_CHANNEL_NAME} and use \`/open\`.`,
          ephemeral: true,
        });
        // If they're in a clan, drop them straight into their clan's private thread.
        try {
          const [membership] = await db
            .select({ clanId: clanMembersTable.clanId, name: clansTable.name })
            .from(clanMembersTable)
            .innerJoin(clansTable, eq(clanMembersTable.clanId, clansTable.id))
            .where(and(eq(clanMembersTable.playerId, player.id), eq(clansTable.banned, false)));
          if (membership) await ensureClanThread(membership.clanId, membership.name);
        } catch (err) {
          logger.error({ err }, "Discord: failed to add new login to clan thread");
        }
        return;
      }

      if (!interaction.isChatInputCommand()) return;
      const cmd = interaction as ChatInputCommandInteraction;

      // #cloaket-chat and the clan chat threads are chat-only — no commands.
      if (inBridgeChannel(cmd.channelId, cmd.channel)) {
        await cmd.reply({
          content: "Commands don't work in the chat bridge channels — use them anywhere else in the server.",
          ephemeral: true,
        });
        return;
      }

      if (cmd.commandName === "login") {
        const modal = new ModalBuilder()
          .setCustomId("cloaket-login")
          .setTitle("Log in to Cloaket")
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("username")
                .setLabel("Cloaket username")
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("password")
                .setLabel("Password")
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
          );
        await cmd.showModal(modal);
        return;
      }

      if (cmd.commandName === "logout") {
        const deleted = await db
          .delete(discordLinksTable)
          .where(eq(discordLinksTable.discordId, cmd.user.id))
          .returning();
        await cmd.reply({
          content: deleted.length > 0 ? "Logged out." : "You weren't logged in.",
          ephemeral: true,
        });
        return;
      }

      if (cmd.commandName === "trade") {
        const player = await linkedPlayer(cmd.user.id);
        if (!player) {
          await cmd.reply({ content: "Use `/login` to link your Cloaket account first.", ephemeral: true });
          return;
        }
        if (player.banned) {
          await cmd.reply({ content: "That account is banned.", ephemeral: true });
          return;
        }
        const sub = cmd.options.getSubcommand();

        if (sub === "start") {
          const username = cmd.options.getString("user", true).trim().slice(0, 30);
          const result = await sendTradeRequest(player, username);
          if (!result.ok) {
            await cmd.reply({ content: result.error, ephemeral: true });
            return;
          }
          if (result.value.autoStarted) {
            const trade = await activeTrade(player.id);
            if (trade) {
              await cmd.reply({ ...(await tradePanel(trade, player.id)), ephemeral: true });
              return;
            }
          }
          // Notify the other player privately (DM) if they're linked — the
          // reply itself stays ephemeral so trades aren't broadcast publicly.
          const [link] = await db
            .select({ discordId: discordLinksTable.discordId })
            .from(discordLinksTable)
            .where(eq(discordLinksTable.playerId, result.value.target.id));
          let notified = false;
          if (link) {
            try {
              const user = await client.users.fetch(link.discordId);
              await user.send(
                `**${player.username}** wants to trade with you on Cloaket! Type \`/trade accept\` in the server to start.`,
              );
              notified = true;
            } catch {
              // DMs closed — they'll still see it in the game.
            }
          }
          await cmd.reply({
            content:
              `Trade request sent to **${result.value.target.username}**.` +
              (notified
                ? " I sent them a DM."
                : " They can accept it in the game" + (link ? " or with `/trade accept`." : ".")),
            ephemeral: true,
          });
          return;
        }

        if (sub === "accept") {
          // Active trade? Toggle your accept. Otherwise accept the newest incoming request.
          const trade = await activeTrade(player.id);
          if (trade) {
            const result = await toggleTradeAccept(player.id);
            if (!result.ok) {
              await cmd.reply({ content: result.error, ephemeral: true });
              return;
            }
            await cmd.reply({ ...(await tradePanel(result.value, player.id)), ephemeral: true });
            return;
          }
          const request = await latestIncomingRequest(player.id);
          if (!request) {
            await cmd.reply({ content: "No trade requests waiting for you.", ephemeral: true });
            return;
          }
          const result = await acceptTradeRequest(player.id, request.id);
          if (!result.ok) {
            await cmd.reply({ content: result.error, ephemeral: true });
            return;
          }
          await cmd.reply({ ...(await tradePanel(result.value, player.id)), ephemeral: true });
          return;
        }

        if (sub === "decline") {
          const result = await declineActiveTrade(player.id);
          if (!result.ok) {
            await cmd.reply({ content: result.error, ephemeral: true });
            return;
          }
          await cmd.reply({ content: "Trade declined.", ephemeral: true });
          return;
        }

        if (sub === "view") {
          const trade = await refreshedActiveTrade(player.id);
          if (!trade) {
            await cmd.reply({ content: "No active trade — start one with `/trade start`.", ephemeral: true });
            return;
          }
          await cmd.reply({ ...(await tradePanel(trade, player.id)), ephemeral: true });
          return;
        }

        // add / remove / tokens all edit my current offer.
        const trade = await activeTrade(player.id);
        if (!trade) {
          await cmd.reply({ content: "No active trade — start one with `/trade start`.", ephemeral: true });
          return;
        }
        const mine = myOfferEntries(trade, player.id);

        if (sub === "add") {
          const name = cmd.options.getString("blook", true).trim();
          const qty = cmd.options.getInteger("quantity") ?? 1;
          const def = getBlookDef(name) ?? getBlookDef(
            BLOOKS.find((b) => b.name.toLowerCase() === name.toLowerCase())?.name ?? "",
          );
          if (!def) {
            await cmd.reply({ content: `Unknown blook "${name}".`, ephemeral: true });
            return;
          }
          const blooks = mine.blooks.map((b) => ({ ...b }));
          const existing = blooks.find((b) => b.name === def.name);
          if (existing) existing.quantity += qty;
          else blooks.push({ name: def.name, quantity: qty });
          const result = await setTradeOffer(player, mine.tokens, blooks);
          if (!result.ok) {
            await cmd.reply({ content: result.error, ephemeral: true });
            return;
          }
          await cmd.reply({ ...(await tradePanel(result.value, player.id)), ephemeral: true });
          return;
        }

        if (sub === "remove") {
          const name = cmd.options.getString("blook", true).trim().toLowerCase();
          const blooks = mine.blooks.filter((b) => b.name.toLowerCase() !== name);
          if (blooks.length === mine.blooks.length) {
            await cmd.reply({ content: "That blook isn't in your offer.", ephemeral: true });
            return;
          }
          const result = await setTradeOffer(player, mine.tokens, blooks);
          if (!result.ok) {
            await cmd.reply({ content: result.error, ephemeral: true });
            return;
          }
          await cmd.reply({ ...(await tradePanel(result.value, player.id)), ephemeral: true });
          return;
        }

        if (sub === "tokens") {
          const amount = cmd.options.getInteger("amount", true);
          const result = await setTradeOffer(player, amount, mine.blooks);
          if (!result.ok) {
            await cmd.reply({ content: result.error, ephemeral: true });
            return;
          }
          await cmd.reply({ ...(await tradePanel(result.value, player.id)), ephemeral: true });
          return;
        }
        return;
      }

      if (cmd.commandName === "packs") {
        const topDisabledForList = await topPackHidden();
        const list = (await orderedPacks(PACKS)).filter((p) => p.name !== MISC_PACK && !(topDisabledForList && p.name === TOP_PACK))
          .map((p) => `**${p.name}** — ${p.price} tokens`)
          .join("\n");
        await cmd.reply({ content: list, ephemeral: true });
        return;
      }

      if (cmd.commandName === "balance") {
        const player = await linkedPlayer(cmd.user.id);
        if (!player) {
          await cmd.reply({ content: "Use `/login` to link your Cloaket account first.", ephemeral: true });
          return;
        }
        await cmd.reply({
          content: `**${player.username}** has **${player.tokens.toLocaleString()}** tokens.`,
          ephemeral: true,
        });
        return;
      }

      if (cmd.commandName === "quantity") {
        const rawName = cmd.options.getString("blook", true).trim();
        const blook = BLOOKS.find((b) => b.name.toLowerCase() === rawName.toLowerCase());
        if (!blook) {
          await cmd.reply({ content: `Unknown blook "${rawName}".`, ephemeral: true });
          return;
        }
        await cmd.deferReply();
        // Quantity counts PACK PULLS only — blooks granted from the admin
        // panel (or crafted/traded) never inflate these numbers.
        const owners = await db
          .select({
            username: playersTable.username,
            quantity: sql<number>`count(*)::int`,
          })
          .from(packPullsTable)
          .innerJoin(playersTable, eq(packPullsTable.playerId, playersTable.id))
          .where(
            sql`${packPullsTable.blookName} = ${blook.name} AND ${playersTable.isBot} = false`,
          )
          .groupBy(playersTable.username)
          .orderBy(sql`count(*) DESC`)
          .limit(10);
        const [totals] = await db
          .select({
            total: sql<number>`count(*)`,
            holders: sql<number>`count(distinct ${packPullsTable.playerId})`,
          })
          .from(packPullsTable)
          .innerJoin(playersTable, eq(packPullsTable.playerId, playersTable.id))
          .where(
            sql`${packPullsTable.blookName} = ${blook.name} AND ${playersTable.isBot} = false`,
          );
        const total = Number(totals?.total ?? 0);
        const holders = Number(totals?.holders ?? 0);
        const medals = ["🥇", "🥈", "🥉"];
        const top =
          owners.length > 0
            ? owners
                .map(
                  (o, i) =>
                    `${medals[i] ?? `**${i + 1}.**`} ${o.username} — ${o.quantity.toLocaleString()}`,
                )
                .join("\n")
            : "Nobody has pulled this blook from a pack yet.";
        const embed = new EmbedBuilder()
          .setTitle(blook.name)
          .setDescription(
            `Rarity: **${blook.rarity}**\n` +
              `Pulled from packs: **${total.toLocaleString()}** time${total === 1 ? "" : "s"} (by **${holders.toLocaleString()}** player${holders === 1 ? "" : "s"})\n\n` +
              `**Top pullers**\n${top}`,
          )
          .setThumbnail(blookArtUrl(blook.image) ?? null);
        await cmd.editReply({ embeds: [embed] });
        return;
      }

      if (cmd.commandName === "open") {
        const player = await linkedPlayer(cmd.user.id);
        if (!player) {
          await cmd.reply({ content: "Use `/login` to link your Cloaket account first.", ephemeral: true });
          return;
        }
        if (player.banned) {
          await cmd.reply({ content: "That account is banned.", ephemeral: true });
          return;
        }
        const rawName = cmd.options.getString("pack", true);
        const pack =
          getPackDef(rawName) ??
          getPackDef(
            PACKS.find((p) => p.name.toLowerCase() === rawName.trim().toLowerCase())?.name ?? "",
          ) ??
          // Legacy alias: the gamble pack was renamed "Top" -> "1k".
          (rawName.trim().toLowerCase() === LEGACY_TOP_PACK.toLowerCase()
            ? getPackDef(TOP_PACK)
            : undefined);
        if (!pack || pack.name === MISC_PACK || (pack.name === TOP_PACK && (await topPackHidden()))) {
          await cmd.reply({ content: `Unknown pack "${rawName}". Try \`/packs\` to see the list.`, ephemeral: true });
          return;
        }
        await cmd.deferReply();
        const result = await openPackForPlayer(player.id, pack.name);
        if (!result.ok) {
          await cmd.editReply(
            result.error === "Not enough tokens"
              ? `Not enough tokens — the **${pack.name}** pack costs **${pack.price}**.`
              : result.error,
          );
          return;
        }
        if (!result.blook) {
          // Top pack came up empty — the gamble didn't pay off.
          await cmd.editReply(
            `**${player.username}** opened a **${pack.name}** pack and got... **nothing!** ` +
              `Tokens left: **${result.tokens.toLocaleString()}**`,
          );
          return;
        }
        const embed = new EmbedBuilder()
          .setTitle(`${result.blook.name}${result.isNew ? "  •  NEW!" : ""}`)
          .setDescription(
            `**${player.username}** opened a **${pack.name}** pack\n` +
              `Rarity: **${result.blook.rarity}**\nTokens left: **${result.tokens.toLocaleString()}**`,
          )
          .setColor((pack.color1 as `#${string}`) ?? "#8a7fff")
          .setThumbnail(absUrl(pack.image) ?? null)
          .setImage(blookArtUrl(result.blook.image) ?? null);
        await cmd.editReply({ embeds: [embed] });
        return;
      }
    } catch (err) {
      logger.error({ err }, "Discord: interaction failed");
      if (interaction.isRepliable()) {
        const msg = { content: "Something went wrong — try again.", ephemeral: true } as const;
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(msg).catch(() => {});
        } else {
          await interaction.reply(msg).catch(() => {});
        }
      }
    }
  });

  client.login(token).catch((err) => {
    logger.error({ err }, "Discord bot failed to log in — check DISCORD_BOT_TOKEN");
  });

  return {
    stop() {
      stopped = true;
      for (const t of timers) clearInterval(t);
      timers.length = 0;
      void client.destroy().catch(() => {});
    },
  };
}
