import { and, eq, sql, inArray } from "drizzle-orm";
import {
  db,
  playersTable,
  ownedBlooksTable,
  clansTable,
  clanMembersTable,
  type Player,
} from "@workspace/db";
import { RARITIES, type BlookDefData } from "../data/blacketData";
import { CATALOG_BADGES as BADGES, CATALOG_BLOOKS as BLOOKS, CATALOG_PACKS as PACKS } from "../data/catalogExtensions";

export const MAIN_USERNAME = "Player";
export const CLAIM_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
export const CLAIM_AMOUNT = 4000;
export const STARTING_TOKENS = 1500;

// Blocks URLs/links in user-generated messages to prevent phishing spam.
const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|gg|xyz|app|co|me|dev|link|site|online|info|club|top|shop)\b|discord\.gg|bit\.ly|tinyurl)/i;
function normalizeForLinkCheck(text: string): string {
  return text
    // strip zero-width / invisible characters used to evade filters
    .replace(/[\u200B-\u200F\u2060\uFEFF\u00AD]/g, "")
    // common dot obfuscations: example[.]com, example(dot)com, example (.) com
    .replace(/[\[\(\{]\s*(\.|dot)\s*[\]\)\}]/gi, ".")
    .replace(/\s+(dot)\s+/gi, ".");
}
// Map of playerId -> clan tag (name + color) for rendering chat tags.
export async function clanTagsForPlayers(
  playerIds: number[],
): Promise<Map<number, { name: string; color: string }>> {
  const map = new Map<number, { name: string; color: string }>();
  if (playerIds.length === 0) return map;
  const rows = await db
    .select({
      playerId: clanMembersTable.playerId,
      name: clansTable.name,
      color: clansTable.color,
      rainbowOwnerId: clansTable.rainbowOwnerId,
    })
    .from(clanMembersTable)
    .innerJoin(clansTable, eq(clanMembersTable.clanId, clansTable.id))
    .where(
      and(
        inArray(clanMembersTable.playerId, [...new Set(playerIds)]),
        eq(clansTable.banned, false),
      ),
    );
  for (const r of rows)
    map.set(r.playerId, {
      name: r.name,
      // "rainbow" is a sentinel the frontend renders as an animated gradient.
      color: r.rainbowOwnerId !== null ? "rainbow" : r.color,
    });
  return map;
}

export function containsLink(text: string): boolean {
  const normalized = normalizeForLinkCheck(text);
  return LINK_RE.test(normalized) || LINK_RE.test(normalized.replace(/\s+/g, ""));
}

const blookByName = new Map(BLOOKS.map((b) => [b.name, b]));
const packByName = new Map(PACKS.map((p) => [p.name, p]));

export function getBlookDef(name: string): BlookDefData | undefined {
  return blookByName.get(name);
}

export function getPackDef(name: string) {
  return packByName.get(name);
}

export function levelForExp(exp: number): number {
  return Math.floor(Math.sqrt(exp / 100)) + 1;
}

export function rarityExp(rarity: string): number {
  return RARITIES[rarity]?.exp ?? 0;
}

/**
 * Weighted random pick of a blook from a pack using each blook's chance.
 */
export function rollPack(packName: string, luckMultiplier = 1): BlookDefData | null {
  const pack = packByName.get(packName);
  if (!pack) return null;
  const entries = pack.blooks
    .map((n) => blookByName.get(n))
    .filter((b): b is BlookDefData => !!b && b.chance > 0);
  if (entries.length === 0) return null;
  const total = entries.reduce((s, b) => s + b.chance, 0);
  const rollOnce = () => {
    let roll = Math.random() * total;
    for (const b of entries) {
      roll -= b.chance;
      if (roll <= 0) return b;
    }
    return entries[entries.length - 1]!;
  };
  // Luck grants fractional extra rolls and keeps the rarer of them. This
  // improves outcomes without mutating the catalog's authored probabilities.
  let winner = rollOnce();
  let extraRolls = Math.max(0, luckMultiplier - 1);
  while (extraRolls > 0) {
    const chanceToRoll = Math.min(1, extraRolls);
    if (Math.random() < chanceToRoll) {
      const candidate = rollOnce();
      if (candidate.chance < winner.chance) winner = candidate;
    }
    extraRolls -= 1;
  }
  return winner;
}

export async function getOrCreateMainPlayer(): Promise<Player> {
  const [existing] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.username, MAIN_USERNAME));
  if (existing) return existing;
  const [created] = await db
    .insert(playersTable)
    .values({
      username: MAIN_USERNAME,
      tokens: STARTING_TOKENS,
      isBot: false,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.username, MAIN_USERNAME));
  return again!;
}

export async function addBlookToPlayer(
  playerId: number,
  blookName: string,
  quantity = 1,
  executor: Pick<typeof db, "select" | "update" | "insert"> = db,
): Promise<{ isNew: boolean }> {
  // Atomic upsert (unique index on player_id+blook_name) so concurrent opens
  // can't race a select-then-insert into a unique-constraint 500.
  // `xmax = 0` is true only for freshly inserted rows, telling us if this
  // was the player's first copy.
  const [row] = await executor
    .insert(ownedBlooksTable)
    .values({ playerId, blookName, quantity })
    .onConflictDoUpdate({
      target: [ownedBlooksTable.playerId, ownedBlooksTable.blookName],
      set: { quantity: sql`${ownedBlooksTable.quantity} + ${quantity}` },
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  const isNew = row!.inserted;
  if (isNew) {
    // A brand-new blook can push the player over the Collector threshold.
    await syncCollectorBadge(playerId, executor);
  }
  return { isNew };
}

/** Special hidden pack: its blooks are granted (never pulled), don't count
 * toward collection totals, and never show as locked. */
export const MISC_PACK = "Miscellaneous";
/** Number of "real" (non-Miscellaneous) blooks — the /165 denominator. */
export const MAIN_BLOOK_COUNT = BLOOKS.filter((b) => b.pack !== MISC_PACK).length;

export const COLLECTOR_THRESHOLD = Math.ceil(MAIN_BLOOK_COUNT * 0.9);

/** Gamble pack: almost always gives nothing, tiny chance at the 1k blook.
 * Renamed from "Top" to "1k" — the catalog rename lives in catalogExtensions. */
export const TOP_PACK = "1k";
/** The gamble pack's original name. Historical DB rows (pack_pulls.pack_name,
 * unlocks.pack_name) still carry it; never write it for new rows. */
export const LEGACY_TOP_PACK = "Top";
/** Maps stored pack names to their display name (gamble pack rename). */
export function displayPackName(name: string): string {
  return name === LEGACY_TOP_PACK ? TOP_PACK : name;
}
export const TOP_PACK_BLOOK = "1k";
/** Blooks that may never be committed to a clan hold: grant-only
 * Miscellaneous trophies and the 1k gamble blook (incl. legacy "Top" rows).
 * The placement route rejects them and /me/blooks advertises no clan power
 * for them (the client also hides them from the placement picker). */
export function isClanHoldBanned(pack: string | null | undefined): boolean {
  return pack === MISC_PACK || pack === TOP_PACK || pack === LEGACY_TOP_PACK;
}
/** Percent chance (0-100) that opening the gamble pack wins the 1k blook. */
export const TOP_PACK_HIT_CHANCE = 0.5;
/** Only this many 1k blooks can EVER be pulled from the gamble pack. */
export const TOP_PACK_SUPPLY = 100;

// SQL fragment listing every current catalog blook name, so counts ignore
// orphaned rows for blooks that were removed from the catalog.
const CATALOG_NAMES_SQL = sql.join(
  BLOOKS.map((b) => sql`${b.name}`),
  sql`, `,
);

/**
 * Award or revoke the Collector badge based on the player's current distinct
 * catalog-blook count vs the 90% threshold. Runs as a single UPDATE so the
 * count and the badge write happen atomically under the player's row lock —
 * concurrent add/remove syncs serialize instead of racing a stale count.
 */
export async function syncCollectorBadge(
  playerId: number,
  executor: Pick<typeof db, "select" | "update" | "insert"> = db,
): Promise<void> {
  const countSql = sql`(
    SELECT count(*) FROM ${ownedBlooksTable} ob
    WHERE ob.player_id = ${playersTable.id}
      AND ob.quantity > 0
      AND ob.blook_name IN (${CATALOG_NAMES_SQL})
  )`;
  await executor
    .update(playersTable)
    .set({
      badges: sql`CASE
        WHEN ${countSql} >= ${COLLECTOR_THRESHOLD} THEN (
          CASE WHEN ${playersTable.badges} @> '["Collector"]'::jsonb
            THEN ${playersTable.badges}
            ELSE ${playersTable.badges} || '["Collector"]'::jsonb
          END
        )
        ELSE ${playersTable.badges} - 'Collector'
      END`,
    })
    .where(eq(playersTable.id, playerId));
}

export function nextClaimAt(player: Player): Date | null {
  if (!player.lastClaimAt) return null;
  return new Date(player.lastClaimAt.getTime() + CLAIM_INTERVAL_MS);
}

const BADGE_MAP = new Map(BADGES.map((b) => [b.name, b]));

/** Resolve a player's badge names to full badge defs (unknown names dropped). */
export function badgeViews(names: string[]): { name: string; image: string; description: string }[] {
  if (!Array.isArray(names)) return [];
  return names
    .map((n) => BADGE_MAP.get(n))
    .filter((b) => b !== undefined);
}

// Usernames that carry special, name-keyed privileges (free store bundles,
// legacy avatar backfill). Renaming to/from these names would move or lose
// those privileges, so admin renames refuse to touch them.
const PROTECTED_USERNAMES = new Set<string>(["catnapcasualty", "extravextras"]);

export function isProtectedUsername(username: string): boolean {
  return PROTECTED_USERNAMES.has(username.toLowerCase());
}

/**
 * Single avatar resolver used by every payload that carries avatarImage.
 * Custom avatars (owner-set uploads, stored as full servable paths in
 * players.custom_avatar_url) win over the equipped blook's image. The third
 * param is required so tsc flags any call site that forgets to thread it.
 */
export function playerAvatarImage(
  avatarBlook: string | null,
  username: string | null | undefined,
  customAvatarUrl: string | null,
): string | null {
  if (customAvatarUrl) return customAvatarUrl;
  if (!avatarBlook) return null;
  return blookByName.get(avatarBlook)?.image ?? null;
}

// Shared username rules for register + rename.
export const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;
