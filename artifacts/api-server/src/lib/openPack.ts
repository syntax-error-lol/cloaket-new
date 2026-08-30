import { and, eq, sql } from "drizzle-orm";
import {
  db,
  playersTable,
  unlocksTable,
  packPullsTable,
  clansTable,
  clanMembersTable,
} from "@workspace/db";
import type { BlookDefData } from "../data/blacketData";
import {
  getPackDef,
  getBlookDef,
  rollPack,
  addBlookToPlayer,
  levelForExp,
  rarityExp,
  TOP_PACK,
  TOP_PACK_BLOOK,
  TOP_PACK_HIT_CHANCE,
} from "./game";
import { claimTopPackHit } from "./topPack";
import { clanEffectsForPlayer } from "./clanHeldBlooks";

/** Thrown inside the open transaction to roll everything back. */
class InsufficientTokensError extends Error {}

export type OpenPackResult =
  // blook/pullId are null when a Top-pack open comes up empty (still charged).
  | { ok: true; blook: BlookDefData | null; isNew: boolean; tokens: number; experience: number; level: number; pullId: number | null }
  | { ok: false; error: string };

/**
 * Open one pack for a player. Shared by the web route and the Discord bot.
 * Race-safe: charges only if the player can still afford it at commit time.
 */
export async function openPackForPlayer(
  playerId: number,
  packName: string,
): Promise<OpenPackResult> {
  const pack = getPackDef(packName);
  if (!pack) return { ok: false, error: "Unknown pack" };
  let blook: BlookDefData | null = null;
  // All pack-open side effects commit or roll back together.
  let txResult: { isNew: boolean; updated: typeof playersTable.$inferSelect; pullId: number | null };
  try {
    txResult = await db.transaction(async (tx) => {
    // Resolve clan effects in the transaction so every caller (web and
    // Discord) uses the same server-owned luck rule at open time.
    const effects = await clanEffectsForPlayer(playerId, tx);
    // Rainbow Astronaut clan effect: a small pack discount applied to the
    // charge below. Free packs (price 0) stay free; a discounted pack never
    // rounds below 1 token.
    const price =
      pack.price > 0
        ? Math.max(1, Math.ceil(pack.price * effects.packPriceMultiplier))
        : 0;
    if (pack.name === TOP_PACK) {
      // Gamble pack: tiny chance at the 1k blook, otherwise nothing (but the
      // tokens are still spent). Its global 1k odds intentionally stay fixed.
      blook =
        Math.random() * 100 < TOP_PACK_HIT_CHANCE
          ? (getBlookDef(TOP_PACK_BLOOK) ?? null)
          : null;
    } else {
      // Uncommon charm: a clan holding any Uncommon blook grants a flat,
      // non-stacking +0.001x on top of the aura multiplier (the Top pack
      // keeps its fixed global odds).
      blook = rollPack(pack.name, effects.packLuckMultiplier + effects.packLuckBonus);
      if (!blook) throw new Error("Pack has no blooks");
    }
    // A Top-pack hit must also win one unit of the global 1k supply. Claimed
    // FIRST so a failed charge below rolls the decrement back; if the supply
    // is gone the open silently becomes a miss.
    if (pack.name === TOP_PACK && blook && !(await claimTopPackHit(tx))) {
      blook = null;
    }
    const expGain = blook ? rarityExp(blook.rarity) : 0;
    const [updated] = await tx
      .update(playersTable)
      .set({
        tokens: sql`${playersTable.tokens} - ${price}`,
        tokensSpent: sql`${playersTable.tokensSpent} + ${price}`,
        experience: sql`${playersTable.experience} + ${expGain}`,
        packsOpened: sql`${playersTable.packsOpened} + 1`,
      })
      .where(and(eq(playersTable.id, playerId), sql`${playersTable.tokens} >= ${price}`))
      .returning();
    // Throwing rolls back the whole transaction, including the supply claim.
    if (!updated) throw new InsufficientTokensError();
    // Empty Top-pack open: nothing won, but the miss is still logged so the
    // mod panel can count "Nothing" pulls. Not shareable (pullId stays null).
    if (!blook) {
      await tx.insert(packPullsTable).values({
        playerId,
        blookName: "Nothing",
        packName: pack.name,
      });
      return { isNew: false, updated, pullId: null };
    }
    const { isNew } = await addBlookToPlayer(playerId, blook.name, 1, tx);
    // Rainbow Waffles clan effect: occasionally a pull lands as a double.
    // Never for the Top pack — its 1k copies are supply-controlled above.
    if (
      pack.name !== TOP_PACK &&
      effects.bonusCopyChance > 0 &&
      Math.random() < effects.bonusCopyChance
    ) {
      await addBlookToPlayer(playerId, blook.name, 1, tx);
    }
    // Opening packs also earns experience for the player's clan (if any).
    if (expGain > 0) {
      await tx
        .update(clansTable)
        .set({ experience: sql`${clansTable.experience} + ${expGain}` })
        .where(
          eq(
            clansTable.id,
            sql`(SELECT ${clanMembersTable.clanId} FROM ${clanMembersTable} WHERE ${clanMembersTable.playerId} = ${playerId} LIMIT 1)`,
          ),
        );
    }
    // Every pull is logged permanently for the mod panel live feed. The row id
    // doubles as verifiable proof for "share your pull" DMs.
    const [pull] = await tx
      .insert(packPullsTable)
      .values({
        playerId,
        blookName: blook.name,
        packName: pack.name,
      })
      .returning({ id: packPullsTable.id });
    if (isNew) {
      await tx.insert(unlocksTable).values({
        playerId,
        blookName: blook.name,
        packName: pack.name,
      });
    }
    return { isNew, updated, pullId: pull!.id as number | null };
    });
  } catch (err) {
    if (err instanceof InsufficientTokensError) return { ok: false, error: "Not enough tokens" };
    throw err;
  }
  return {
    ok: true,
    blook,
    isNew: txResult.isNew,
    tokens: txResult.updated!.tokens,
    experience: txResult.updated!.experience,
    level: levelForExp(txResult.updated!.experience),
    pullId: txResult.pullId,
  };
}
