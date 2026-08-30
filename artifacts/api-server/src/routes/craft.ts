import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, playersTable, ownedBlooksTable, craftLogsTable } from "@workspace/db";
import {
  CraftPreviewBody,
  CraftPreviewResponse,
  CraftBlooksBody,
  CraftBlooksResponse,
} from "@workspace/api-zod";
import { CATALOG_BLOOKS as BLOOKS } from "../data/catalogExtensions";
import { getBlookDef, addBlookToPlayer, syncCollectorBadge, MISC_PACK } from "../lib/game";

const router: IRouter = Router();

const MAX_INPUTS = 5;
const LUCK_MULTIPLIER = 2.5;
const CRAFT_FEE = 50; // tokens charged per craft

// Chances for the 5 outcome slots (worst → best) scale with how many
// ingredients go in: 1 blook → 3% jackpot, 5 blooks → 5%. More ingredients
// risked = better odds at the top end.
function baseChances(inputCount: number): number[] {
  // Good/jackpot odds heavily nerfed — crafting was way too profitable.
  const NERF = 0.1056;
  const jackpot = (2.5 + 0.5 * inputCount) * NERF;
  const good = (9 + 1.2 * inputCount) * NERF;
  const mid = 24;
  const badTotal = 100 - mid - good - jackpot;
  // Split the bad odds ~32:25 like before.
  const bad1 = (badTotal * 32) / 57;
  const bad2 = badTotal - bad1;
  const r = (x: number) => Math.round(x * 100) / 100;
  return [r(bad1), r(bad2), r(mid), r(good), r(jackpot)];
}

// Ingredient worth also depends on drop rate: within a rarity, a blook that
// drops less often is worth more as an ingredient. Same for outcome pricing.
function effectiveValue(name: string): number {
  const def = getBlookDef(name);
  if (!def) return 0;
  const median = rarityMedianChance(def.rarity);
  if (!median || !def.chance) return def.price;
  const factor = Math.min(2, Math.max(0.6, Math.sqrt(median / def.chance)));
  return def.price * factor;
}

const rarityMedianCache = new Map<string, number>();
function rarityMedianChance(rarity: string): number {
  if (rarityMedianCache.has(rarity)) return rarityMedianCache.get(rarity)!;
  const chances = BLOOKS.filter((b) => b.rarity === rarity && b.chance > 0)
    .map((b) => b.chance)
    .sort((a, b) => a - b);
  const median = chances.length ? chances[Math.floor(chances.length / 2)]! : 0;
  rarityMedianCache.set(rarity, median);
  return median;
}

// Value bands for each outcome slot, as multiples of the total input value.
const VALUE_BANDS: [number, number][] = [
  [0.08, 0.35], // bad
  [0.35, 0.7], // meh
  [0.8, 1.25], // break-even-ish
  [1.4, 2.6], // good
  [2.6, 6.0], // jackpot
];

type Outcome = {
  name: string;
  rarity: string;
  image: string;
  price: number;
  chance: number;
  luckChance: number;
};

// Deterministic 32-bit FNV-1a hash → seeded PRNG (mulberry32). The outcome
// pool for a given combo NEVER changes, so the preview always matches the
// craft roll's outcome set.
function comboSeed(names: string[]): number {
  const key = [...names].sort().join("|").toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Chances with the 2.5x luck item: the two best slots are multiplied by 2.5,
 * the rest scaled down so the total stays at 100%. */
function luckChances(base: number[]): number[] {
  const boosted = base.map((c, i) => (i >= base.length - 2 ? c * LUCK_MULTIPLIER : c));
  const boostedTotal = boosted[3]! + boosted[4]!;
  if (boostedTotal >= 100) {
    // Degenerate combos can't exceed certainty — cap and zero the rest.
    const scale = 100 / boostedTotal;
    return base.map((c, i) => (i >= 3 ? c * LUCK_MULTIPLIER * scale : 0));
  }
  const remaining = 100 - boostedTotal;
  const baseRest = base[0]! + base[1]! + base[2]!;
  return base.map((c, i) => (i >= 3 ? c * LUCK_MULTIPLIER : (c / baseRest) * remaining));
}

/**
 * Deterministically derive the 5 possible outcomes for an input combo.
 * Each slot picks a blook whose value falls in a band relative to the total
 * input value; picks are unique and exclude the input blooks themselves.
 */
export function craftOutcomes(inputNames: string[]): Outcome[] {
  const totalValue = inputNames.reduce((sum, n) => sum + effectiveValue(n), 0);
  const rand = mulberry32(comboSeed(inputNames));
  const inputSet = new Set(inputNames);
  const picked = new Set<string>();
  const rarities = inputNames.map((n) => getBlookDef(n)?.rarity);
  const inputHasMystical = rarities.includes("Mystical");
  const inputHasChroma = rarities.includes("Chroma");
  const inputHasLegendary = inputHasChroma || rarities.includes("Legendary") || inputHasMystical;
  // Rarity ceiling on outcomes: combos with nothing Legendary-or-better in
  // them (e.g. all epics) can never produce a Mystical — the best possible
  // jump from that tier is a Chroma.
  const catalog = BLOOKS.filter(
    (b) =>
      b.image &&
      // Miscellaneous blooks are special grants — never craftable outcomes.
      b.pack !== MISC_PACK &&
      (inputHasLegendary || b.rarity !== "Mystical"),
  );

  const outcomes: Outcome[] = [];
  const base = baseChances(inputNames.length);
  const luck = luckChances(base);
  for (let slot = 0; slot < 5; slot++) {
    const [lo, hi] = VALUE_BANDS[slot]!;
    let candidates = catalog.filter(
      (b) =>
        !picked.has(b.name) &&
        !inputSet.has(b.name) &&
        effectiveValue(b.name) >= totalValue * lo &&
        effectiveValue(b.name) <= totalValue * hi,
    );
    if (candidates.length === 0) {
      // Band empty (very cheap or very expensive combos) — fall back to the
      // nearest-priced unpicked blooks around the band's midpoint. The three
      // "at or below input value" slots stay capped at the band ceiling so a
      // fallback can never turn a losing slot into a profitable one.
      const target = totalValue * ((lo + hi) / 2);
      const pool = catalog.filter(
        (b) =>
          !picked.has(b.name) &&
          !inputSet.has(b.name) &&
          (slot >= 3 || effectiveValue(b.name) <= totalValue * hi),
      );
      const widePool = pool.length > 0
        ? pool
        : catalog.filter((b) => !picked.has(b.name) && !inputSet.has(b.name));
      candidates = widePool
        .sort(
          (a, b) =>
            Math.abs(effectiveValue(a.name) - target) - Math.abs(effectiveValue(b.name) - target),
        )
        .slice(0, 5);
    }
    const pick = candidates[Math.floor(rand() * candidates.length)]!;
    picked.add(pick.name);
    outcomes.push({
      name: pick.name,
      rarity: pick.rarity,
      image: pick.image!,
      price: pick.price,
      chance: Math.round(base[slot]! * 100) / 100,
      luckChance: Math.round(luck[slot]! * 100) / 100,
    });
  }
  // Rarity caps: mystical odds are hard-capped at 3% (even with luck).
  // Putting a mystical INTO the craft raises that ceiling to 20%.
  const caps: Record<string, { chance: number; luckChance: number }> = {
    Mystical: inputHasMystical
      ? { chance: 20, luckChance: 20 }
      : { chance: 3, luckChance: 3 },
  };
  if (!inputHasChroma) {
    // Legendaries can reach for a chroma; anything below (epics etc.) gets
    // only a slim shot at jumping that far up.
    caps["Chroma"] = inputHasLegendary
      ? { chance: 4.2, luckChance: 7.5 }
      : { chance: 3, luckChance: 6 };
  }
  capRarityChances(outcomes, caps);
  return outcomes;
}

/** Hard-cap the total odds of the given rarities, pushing the excess onto
 * the remaining (uncapped) slots proportionally. */
function capRarityChances(
  outcomes: Outcome[],
  caps: Record<string, { chance: number; luckChance: number }>,
): void {
  for (const key of ["chance", "luckChance"] as const) {
    const activeCaps: Record<string, { chance: number; luckChance: number }> = { ...caps };
    let rest = outcomes.filter((o) => !(o.rarity in activeCaps));
    // If EVERY outcome is a capped rarity there's nowhere to push the excess,
    // so relax the Chroma cap (least important) and let the excess land on
    // the chroma slots — the Mystical cap must always hold.
    if (rest.length === 0 && "Chroma" in activeCaps) {
      delete activeCaps["Chroma"];
      rest = outcomes.filter((o) => !(o.rarity in activeCaps));
    }
    // Per capped rarity: current total and capped target.
    const groups = Object.entries(activeCaps).map(([rarity, cap]) => {
      const total = outcomes
        .filter((o) => o.rarity === rarity)
        .reduce((s, o) => s + o[key], 0);
      return { rarity, total, target: Math.min(total, cap[key]) };
    });
    if (groups.every((g) => g.total <= g.target)) continue;
    const restTotal = rest.reduce((s, o) => s + o[key], 0);
    if (restTotal <= 0) continue; // nothing to shift the excess onto
    const restTarget = 100 - groups.reduce((s, g) => s + g.target, 0);
    const scaleByRarity = new Map(
      groups.map((g) => [g.rarity, g.total > 0 ? g.target / g.total : 1]),
    );
    for (const o of outcomes) {
      const scale = scaleByRarity.get(o.rarity) ?? restTarget / restTotal;
      const scaled = o[key] * scale;
      // Capped rarities round DOWN so the caps are hard ceilings.
      o[key] = (o.rarity in activeCaps ? Math.floor(scaled * 100) : Math.round(scaled * 100)) / 100;
    }
  }
}

/** Validate the request's input list: known blooks, 1-5 of them. Returns
 * per-name counts, or null if invalid. */
function validateInputs(names: string[]): Map<string, number> | null {
  if (names.length < 1 || names.length > MAX_INPUTS) return null;
  const counts = new Map<string, number>();
  for (const n of names) {
    if (!getBlookDef(n)) return null;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return counts;
}

router.post("/craft/preview", async (req, res): Promise<void> => {
  const parsed = CraftPreviewBody.safeParse(req.body);
  if (!parsed.success || !validateInputs(parsed.data.blooks)) {
    res.status(400).json({ message: "Pick between 1 and 5 valid blooks" });
    return;
  }
  res.json(
    CraftPreviewResponse.parse({
      outcomes: craftOutcomes(parsed.data.blooks),
      luckItems: req.player!.craftLuckItems,
    }),
  );
});

router.post("/craft", async (req, res): Promise<void> => {
  const parsed = CraftBlooksBody.safeParse(req.body);
  const counts = parsed.success ? validateInputs(parsed.data.blooks) : null;
  if (!parsed.success || !counts || parsed.data.blooks.length < 2) {
    res.status(400).json({ message: "Pick between 2 and 5 valid blooks" });
    return;
  }
  const player = req.player!;
  const { useLuck } = parsed.data;

  const outcomes = craftOutcomes(parsed.data.blooks);
  // Roll the result up-front; the transaction only commits if every input
  // (and the luck item, if used) could actually be consumed.
  const roll = Math.random() * 100;
  let acc = 0;
  let result = outcomes[0]!;
  for (const o of outcomes) {
    acc += useLuck ? o.luckChance : o.chance;
    if (roll < acc) {
      result = o;
      break;
    }
  }

  try {
    const { isNew, luckItemsLeft, emptied } = await db.transaction(async (tx) => {
      // Race-safe crafting fee: only charged if the player can afford it.
      const feePaid = await tx
        .update(playersTable)
        .set({
          tokens: sql`${playersTable.tokens} - ${CRAFT_FEE}`,
          tokensSpent: sql`${playersTable.tokensSpent} + ${CRAFT_FEE}`,
        })
        .where(and(eq(playersTable.id, player.id), sql`${playersTable.tokens} >= ${CRAFT_FEE}`))
        .returning({ id: playersTable.id });
      if (feePaid.length === 0)
        throw new CraftError(`Crafting costs ${CRAFT_FEE} tokens — you don't have enough`);
      if (useLuck) {
        // Race-safe: only spend a luck item if one is actually available.
        const spent = await tx
          .update(playersTable)
          .set({ craftLuckItems: sql`${playersTable.craftLuckItems} - 1` })
          .where(and(eq(playersTable.id, player.id), sql`${playersTable.craftLuckItems} >= 1`))
          .returning({ left: playersTable.craftLuckItems });
        if (spent.length === 0) throw new CraftError("You don't have a 2.5x luck item");
      }
      let emptied = false;
      for (const [name, qty] of counts) {
        // Race-safe conditional decrement — fails (rolls back) if the player
        // doesn't have enough copies at commit time.
        const updated = await tx
          .update(ownedBlooksTable)
          .set({ quantity: sql`${ownedBlooksTable.quantity} - ${qty}` })
          .where(
            and(
              eq(ownedBlooksTable.playerId, player.id),
              eq(ownedBlooksTable.blookName, name),
              sql`${ownedBlooksTable.quantity} >= ${qty}`,
            ),
          )
          .returning({ quantity: ownedBlooksTable.quantity });
        if (updated.length === 0) throw new CraftError(`You don't have ${qty}x ${name}`);
        if (updated[0]!.quantity === 0) {
          emptied = true;
          await tx
            .delete(ownedBlooksTable)
            .where(
              and(eq(ownedBlooksTable.playerId, player.id), eq(ownedBlooksTable.blookName, name)),
            );
        }
      }
      const { isNew } = await addBlookToPlayer(player.id, result.name, 1, tx);
      // Permanent moderation log — only written if the craft actually commits.
      await tx.insert(craftLogsTable).values({
        playerId: player.id,
        inputs: parsed.data.blooks,
        resultName: result.name,
        usedLuck: useLuck,
      });
      const [row] = await tx
        .select({ luck: playersTable.craftLuckItems })
        .from(playersTable)
        .where(eq(playersTable.id, player.id));
      return { isNew, luckItemsLeft: row!.luck, emptied };
    });
    if (emptied) await syncCollectorBadge(player.id);
    req.log.info(
      { playerId: player.id, inputs: parsed.data.blooks, result: result.name, useLuck },
      "Blooks crafted",
    );
    res.json(
      CraftBlooksResponse.parse({
        blook: { name: result.name, rarity: result.rarity, image: result.image, price: result.price },
        isNew,
        usedLuck: useLuck,
        luckItemsLeft,
      }),
    );
  } catch (err) {
    if (err instanceof CraftError) {
      res.status(400).json({ message: err.message });
      return;
    }
    throw err;
  }
});

class CraftError extends Error {}

export default router;
