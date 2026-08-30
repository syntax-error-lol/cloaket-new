import { and, eq, sql } from "drizzle-orm";
import {
  clanHeldBlooksTable,
  clanMembersTable,
  clansTable,
  playersTable,
  db,
} from "@workspace/db";
import { addBlookToPlayer, getBlookDef } from "./game";

export const CLAN_HELD_LOCK_MS = 7 * 24 * 60 * 60 * 1000;

/** Unclaimed mine pay banks for at most 24 hours per held blook, then stops. */
export const HELD_BANK_MS = 24 * 60 * 60 * 1000;

/**
 * Held-blook token mine: blooks a clan holds pay each member this many
 * tokens per hour, scaled by rarity. The Mystical entry is what DUPLICATE
 * copies pay — the FIRST copy of each Mystical name is aura-only (its unique
 * clan-wide power, see MYSTICAL_EFFECTS; auras never stack), so extra copies
 * work the mine instead. Uncommons pay nothing and grant the stacking
 * pack-luck charm.
 */
export const HELD_TOKENS_PER_HOUR: Record<string, number> = {
  Common: 1,
  Rare: 3,
  Epic: 5,
  Legendary: 7,
  Chroma: 10,
  Mystical: 75,
  Unique: 5,
};

/** Hourly mine rate for a held blook of this rarity. 0 for Uncommons (their
 * whole power is the luck charm) and for FIRST-copy Mysticals (aura-only —
 * pass isDuplicateMystical for 2nd+ copies of a name, which pay the mine).
 * Unknown rarities pay the 1/hr floor so every placeable blook honestly does
 * something for the clan. */
export function heldMineRatePerHour(rarity: string, isDuplicateMystical = false): number {
  if (rarity === "Uncommon") return 0;
  if (rarity === "Mystical" && !isDuplicateMystical) return 0;
  return HELD_TOKENS_PER_HOUR[rarity] ?? 1;
}

/**
 * Uncommon charm: every Uncommon blook the clan holds adds a flat +0.001x
 * pack luck at open time — copies STACK (unlike Mystical auras, which never
 * do). Uncommons still pay NO mine tokens; the charm is their whole power.
 */
export const UNCOMMON_HELD_LUCK_BONUS = 0.001;
export const UNCOMMON_CHARM_KEY = "uncommon-held-luck";

export type ClanBlookEffect = {
  key: string;
  /** Auras are unique Mystical powers; mines pay the hourly token trickle. */
  kind: "aura" | "mine";
  /** Headline for the clan's active-effects list. */
  label: string;
  /** Full sentence for effect summaries. */
  description: string;
  /** Short text for blook cards and the placement picker. */
  ability: string;
};

// Every entry here MUST have a real gameplay hook that consumes it (see
// clanEffectsForPlayer and the held-mine collect flow). Never list an effect
// the server does not apply. Mystical auras do not stack across copies; the
// token mine stacks per held blook.
const MYSTICAL_EFFECTS: Record<string, ClanBlookEffect> = {
  "Aurora Fox": {
    key: "aurora-fox-pack-luck",
    kind: "aura",
    label: "Aurora Fox — 1.5× Pack Luck",
    description: "All clan members receive 1.5× pack luck while Aurora Fox is held.",
    ability: "1.5× pack luck for the whole clan",
  },
  "Phantom King": {
    key: "phantom-king-royal-cut",
    kind: "aura",
    label: "Phantom King — +10% Sell Price",
    description: "All clan members earn 10% more tokens when selling blooks while Phantom King is held.",
    ability: "+10% tokens from blook sales",
  },
  "Spring Butterfly": {
    key: "spring-butterfly-daily-bloom",
    kind: "aura",
    label: "Spring Butterfly — +10% Daily Claim",
    description: "All clan members' daily token claims pay 10% more while Spring Butterfly is held.",
    ability: "+10% daily claim tokens",
  },
  "Spooky Ghost": {
    key: "spooky-ghost-night-shift",
    kind: "aura",
    label: "Spooky Ghost — +10% Mine Output",
    description: "All clan members' Mines produce 10% more tokens while Spooky Ghost is held.",
    ability: "+10% Mine production",
  },
  "Rainbow Astronaut": {
    key: "rainbow-astronaut-cosmic-discount",
    kind: "aura",
    label: "Rainbow Astronaut — 5% Pack Discount",
    description: "All clan members pay 5% fewer tokens for packs while Rainbow Astronaut is held.",
    ability: "5% off all pack prices",
  },
  "Rainbow Waffles": {
    key: "rainbow-waffles-second-helping",
    kind: "aura",
    label: "Rainbow Waffles — 5% Double Pull",
    description: "All clan members have a 5% chance that a pack pull lands as a double while Rainbow Waffles is held (the bonus copy goes straight to your inventory).",
    ability: "5% chance pack pulls land as a double",
  },
};

/** True when this blook name has a registered clan-wide aura. A Mystical
 * WITHOUT an aura entry is a pure mine blook — every copy pays (the
 * first-copy-is-aura-only rule exists to price the aura, and there is no
 * aura to price). */
export function hasMysticalAura(blookName: string): boolean {
  return blookName in MYSTICAL_EFFECTS;
}

/** Uncommons pay no mine tokens — each held copy adds another +0.001x pack
 * luck. The shared key keeps a single active-effects chip; the clan route
 * rewrites its label with the stacked total. */
const UNCOMMON_CHARM_EFFECT: ClanBlookEffect = {
  key: UNCOMMON_CHARM_KEY,
  kind: "aura",
  label: "Uncommon Charm — +0.001x Pack Luck Each",
  description:
    "Every Uncommon blook the clan holds adds +0.001x pack luck for all clan members. Copies stack.",
  ability: "+0.001x pack luck per held Uncommon (stacks)",
};

function mineEffect(rarity: string, rateOverride?: number): ClanBlookEffect {
  const rate = rateOverride ?? heldMineRatePerHour(rarity);
  return {
    key: `held-mine-${rarity.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    kind: "mine",
    label: `${rarity} Mine — ${rate} Tokens/hr Each`,
    description: `Each held ${rarity} pays every clan member ${rate} tokens per hour, deposited automatically.`,
    ability: `Pays every member ${rate} tokens/hr (auto)`,
  };
}

/** The one honest source of what a blook does for a clan. Every blook has a
 * power: the FIRST copy of an aura-registered Mystical grants its unique
 * aura (and nothing else), duplicate copies work the mine, an aura-less
 * Mystical pays the mine on EVERY copy, Uncommons carry the luck charm,
 * everything else pays the mine. `isDuplicateMystical` is FUNCTIONAL: it
 * selects between aura and mine, mirroring the settle sweep's id-ordered
 * classification. */
export function clanEffectForBlook(
  blookName: string,
  rarity: string,
  isDuplicateMystical = false,
): ClanBlookEffect {
  const mystical = MYSTICAL_EFFECTS[blookName];
  if (mystical) {
    if (isDuplicateMystical) {
      return mineEffect(rarity, heldMineRatePerHour(rarity, true));
    }
    return mystical;
  }
  if (rarity === "Uncommon") return UNCOMMON_CHARM_EFFECT;
  if (rarity === "Mystical") {
    // Aura-less Mystical: every copy pays the Mystical mine rate.
    return mineEffect(rarity, heldMineRatePerHour(rarity, true));
  }
  return mineEffect(rarity);
}

/** Resolve effects at the moment gameplay executes — never trust a client modifier. */
export async function clanEffectsForPlayer(playerId: number, executor: any = db) {
  const rows = await executor
    .select({
      blookName: clanHeldBlooksTable.blookName,
      placedAt: clanHeldBlooksTable.placedAt,
      joinedAt: clanMembersTable.createdAt,
    })
    .from(clanMembersTable)
    .innerJoin(clansTable, eq(clansTable.id, clanMembersTable.clanId))
    .innerJoin(clanHeldBlooksTable, eq(clanHeldBlooksTable.clanId, clansTable.id))
    .where(and(eq(clanMembersTable.playerId, playerId), eq(clansTable.banned, false)));
  const held = new Set<string>(rows.map((row: { blookName: string }) => row.blookName));
  // The Base boost only pays from the moment this player actually had it: the
  // later of joining the clan and the Spooky Ghost being placed. Base accrual
  // uses this to price the pre-boost part of an interval at the plain rate, so
  // joining a Spooky clan right before claiming earns nothing retroactively.
  let baseBoostActiveSince: Date | null = null;
  for (const row of rows as { blookName: string; placedAt: Date; joinedAt: Date }[]) {
    if (row.blookName !== "Spooky Ghost") continue;
    const since = new Date(Math.max(row.placedAt.getTime(), row.joinedAt.getTime()));
    if (!baseBoostActiveSince || since < baseBoostActiveSince) baseBoostActiveSince = since;
  }
  // Uncommon charm STACKS: count every held copy (rows, not the deduped name
  // set — two copies of the same Uncommon both count). Mystical auras below
  // stay non-stacking booleans. Applied additively on top of the aura
  // multiplier at open time.
  let uncommonHeldCount = 0;
  for (const row of rows as { blookName: string }[]) {
    if (getBlookDef(row.blookName)?.rarity === "Uncommon") uncommonHeldCount += 1;
  }
  return {
    packLuckBonus: uncommonHeldCount * UNCOMMON_HELD_LUCK_BONUS,
    packLuckMultiplier: held.has("Aurora Fox") ? 1.5 : 1,
    packPriceMultiplier: held.has("Rainbow Astronaut") ? 0.95 : 1,
    bonusCopyChance: held.has("Rainbow Waffles") ? 0.05 : 0,
    sellPriceMultiplier: held.has("Phantom King") ? 1.1 : 1,
    dailyClaimMultiplier: held.has("Spring Butterfly") ? 1.1 : 1,
    baseProductionMultiplier: held.has("Spooky Ghost") ? 1.1 : 1,
    baseBoostActiveSince,
  };
}

/**
 * Whole tokens a member can collect from the clan's held-blook mine right now.
 * Each paying blook accrues from the later of the member's last collect, its
 * own placement, or the 24h bank horizon — so pay can never reach back further
 * than one banked day, nor before the blook was placed.
 */
export function heldUnclaimedTokens(
  lastCollectedAt: Date,
  entries: { placedAt: Date; ratePerHour: number }[],
  now: Date,
): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.ratePerHour <= 0) continue;
    const from = Math.max(
      lastCollectedAt.getTime(),
      entry.placedAt.getTime(),
      now.getTime() - HELD_BANK_MS,
    );
    const elapsedMs = now.getTime() - from;
    if (elapsedMs <= 0) continue;
    total += (elapsedMs / (60 * 60 * 1000)) * entry.ratePerHour;
  }
  return Math.floor(total);
}

/**
 * Settle one member's held-mine pay straight into their token balance. This
 * is the auto-collect engine — same lock order as every token flow (player
 * row → member row → held rows by id) so it serializes with withdraw,
 * disband, and spends. The member clock only advances when whole tokens
 * actually pay out; a zero payout must never wipe fractional accrual.
 */
export async function settleHeldMineForMember(playerId: number, clanId: number): Promise<number> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: playersTable.id })
      .from(playersTable)
      .where(eq(playersTable.id, playerId))
      .for("update");
    const [clan] = await tx
      .select({ id: clansTable.id })
      .from(clansTable)
      .where(and(eq(clansTable.id, clanId), eq(clansTable.banned, false)))
      .limit(1);
    if (!clan) return 0;
    const [membership] = await tx
      .select()
      .from(clanMembersTable)
      .where(and(eq(clanMembersTable.clanId, clan.id), eq(clanMembersTable.playerId, playerId)))
      .for("update");
    if (!membership) return 0;
    const held = await tx
      .select({
        blookName: clanHeldBlooksTable.blookName,
        placedAt: clanHeldBlooksTable.placedAt,
      })
      .from(clanHeldBlooksTable)
      .where(eq(clanHeldBlooksTable.clanId, clan.id))
      .orderBy(clanHeldBlooksTable.id)
      .for("update");
    // Mine classification must mirror the clan detail route: rows come back
    // ordered by id, the first copy of each aura-registered Mystical name is
    // aura-only, every later copy pays the mine. An aura-less Mystical is a
    // pure mine blook — every copy pays.
    const seenMysticals = new Set<string>();
    const mineEntries = held
      .map((row) => {
        const def = getBlookDef(row.blookName);
        let isDuplicateMystical = false;
        if (def?.rarity === "Mystical") {
          isDuplicateMystical =
            !hasMysticalAura(row.blookName) || seenMysticals.has(row.blookName);
          seenMysticals.add(row.blookName);
        }
        return {
          placedAt: row.placedAt,
          ratePerHour: def ? heldMineRatePerHour(def.rarity, isDuplicateMystical) : 0,
        };
      })
      .filter((entry) => entry.ratePerHour > 0);
    const now = new Date();
    const amount = heldUnclaimedTokens(membership.clanTokensLastAt, mineEntries, now);
    if (amount <= 0) return 0;
    await tx
      .update(clanMembersTable)
      .set({ clanTokensLastAt: now })
      .where(eq(clanMembersTable.id, membership.id));
    await tx
      .update(playersTable)
      .set({
        tokens: sql`${playersTable.tokens} + ${amount}`,
        tokensEarned: sql`${playersTable.tokensEarned} + ${amount}`,
      })
      .where(eq(playersTable.id, playerId));
    return amount;
  });
}

/**
 * Auto-collect sweep: deposit mine pay for every member of every live clan
 * that holds blooks. Members settle one at a time in their own transactions
 * so a single failure can't poison the batch.
 */
export async function autoCollectHeldMines(): Promise<{
  paidMembers: number;
  totalPaid: number;
  failed: number;
}> {
  const memberRows = await db
    .select({ playerId: clanMembersTable.playerId, clanId: clanMembersTable.clanId })
    .from(clanMembersTable)
    .innerJoin(
      clansTable,
      and(eq(clansTable.id, clanMembersTable.clanId), eq(clansTable.banned, false)),
    )
    .where(
      sql`EXISTS (SELECT 1 FROM ${clanHeldBlooksTable} WHERE ${clanHeldBlooksTable.clanId} = ${clanMembersTable.clanId})`,
    );
  let paidMembers = 0;
  let totalPaid = 0;
  let failed = 0;
  for (const row of memberRows) {
    try {
      const paid = await settleHeldMineForMember(row.playerId, row.clanId);
      if (paid > 0) {
        paidMembers += 1;
        totalPaid += paid;
      }
    } catch {
      failed += 1;
    }
  }
  return { paidMembers, totalPaid, failed };
}

/**
 * Settle every member of ONE clan at the CURRENT held set/rates. Must run
 * and SUCCEED before any mutation that removes or reclassifies held blooks
 * (withdraw, disband, a member leaving) — otherwise the next sweep would
 * price the whole unsettled interval at the new, lower rates and silently
 * forfeit accrued pay (e.g. a withdrawn duplicate Mystical's 75/hr vanishing
 * retroactively). Errors propagate so callers ABORT the destructive change; retrying
 * later is always safe because settlement is idempotent bookkeeping.
 *
 * Accepted residual: each member's clock only advances on whole earned
 * tokens, so the instant between a member's settle commit and the caller's
 * mutation can reprice at most <1 whole token per member — never the
 * multi-minute/hour accrual this guard exists for.
 */
export async function settleClanMembersMines(clanId: number): Promise<void> {
  const members = await db
    .select({ playerId: clanMembersTable.playerId })
    .from(clanMembersTable)
    .where(eq(clanMembersTable.clanId, clanId));
  for (const member of members) {
    await settleHeldMineForMember(member.playerId, clanId);
  }
}

/** A clan cannot outlive its held blooks: disbanding returns every commitment. */
export async function releaseClanHeldBlooks(tx: any, clanId: number) {
  const held = await tx
    .select({
      ownerId: clanHeldBlooksTable.ownerId,
      blookName: clanHeldBlooksTable.blookName,
    })
    .from(clanHeldBlooksTable)
    .where(eq(clanHeldBlooksTable.clanId, clanId));
  for (const blook of held) {
    await addBlookToPlayer(blook.ownerId, blook.blookName, 1, tx);
  }
  if (held.length > 0) {
    await tx.delete(clanHeldBlooksTable).where(eq(clanHeldBlooksTable.clanId, clanId));
  }
}
