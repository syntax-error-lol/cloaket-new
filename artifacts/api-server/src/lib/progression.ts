import { and, eq, sql } from "drizzle-orm";
import {
  baseWorkersTable,
  db,
  ownedBlooksTable,
  playerBasesTable,
  playersTable,
} from "@workspace/db";
import { getBlookDef, isClanHoldBanned, levelForExp, syncCollectorBadge } from "./game";
import { baseLevelRequiredFor } from "./baseAccess";
import { clanEffectsForPlayer } from "./clanHeldBlooks";
import { logger } from "./logger";

export const BASE_LEVEL_REQUIRED = 5;
export const MAX_BASE_WORKERS = 15;
/** Each purchase permanently raises the miner cap by one. */
export const BASE_SLOT_COST = 10_000;
const HOUR_MS = 60 * 60 * 1000;
const MICROTOKENS_PER_TOKEN = 1_000_000;

const RATE_BY_RARITY: Record<string, number> = {
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Epic: 5,
  Legendary: 8,
  Chroma: 20,
  Unique: 6,
  Mystical: 250,
};

type WorkerView = {
  id: number;
  blookName: string;
  rarity: string;
  image: string;
  tokenRatePerHour: number;
  sellValue: number;
  assignedAt: string;
};

export function baseWorkerRate(blookName: string): number | null {
  const blook = getBlookDef(blookName);
  if (!blook) return null;
  // Grant-only Miscellaneous trophies and the 1k gamble blook can never mine.
  // Returning null also keeps the boot sweep from repricing legacy rows that
  // were deployed before this ban — they keep their stored rate.
  if (isClanHoldBanned(blook.pack)) return null;
  return RATE_BY_RARITY[blook.rarity] ?? 1;
}

function accruedProduction(rateMilliseconds: number, carriedMicrotokens: number) {
  if (rateMilliseconds <= 0) {
    return { wholeTokens: 0, microtokens: carriedMicrotokens };
  }
  const wholeTokens = Math.floor(rateMilliseconds / HOUR_MS);
  const fractionalMicrotokens = Math.floor(
    ((rateMilliseconds % HOUR_MS) * MICROTOKENS_PER_TOKEN) / HOUR_MS,
  );
  const combinedMicrotokens = carriedMicrotokens + fractionalMicrotokens;
  return {
    wholeTokens: wholeTokens + Math.floor(combinedMicrotokens / MICROTOKENS_PER_TOKEN),
    microtokens: combinedMicrotokens % MICROTOKENS_PER_TOKEN,
  };
}

/**
 * Milliseconds-weighted production for [lastAccruedAt, now], pricing only the
 * part of the interval where the clan Base boost was actually active. History
 * is never repriced upward: time before the boost existed accrues at the plain
 * worker rate, and if the boost is gone at settlement the whole interval is
 * plain — so clan-hopping right before a claim earns nothing extra.
 */
function weightedRateMilliseconds(
  lastAccruedAt: Date,
  now: Date,
  plainRatePerHour: number,
  boostedRatePerHour: number,
  boostActiveSince: Date | null,
) {
  const start = lastAccruedAt.getTime();
  const end = now.getTime();
  if (end <= start) return 0;
  if (!boostActiveSince) return (end - start) * plainRatePerHour;
  const boostStart = Math.min(Math.max(boostActiveSince.getTime(), start), end);
  return (boostStart - start) * plainRatePerHour + (end - boostStart) * boostedRatePerHour;
}

async function workerViews(playerId: number, executor: any): Promise<WorkerView[]> {
  const workers = await executor
    .select()
    .from(baseWorkersTable)
    .where(eq(baseWorkersTable.playerId, playerId))
    .orderBy(baseWorkersTable.id);
  return workers
    .map((worker: typeof baseWorkersTable.$inferSelect): WorkerView | null => {
      const blook = getBlookDef(worker.blookName);
      if (!blook) return null;
      return {
        id: worker.id,
        blookName: worker.blookName,
        rarity: blook.rarity,
        image: blook.image,
        tokenRatePerHour: worker.tokenRatePerHour,
        // Dismissing a miner pays the blook's plain catalog price — the same
        // "sell value" the sell flow starts from, with no clan multipliers so
        // the number shown is exactly the number paid.
        sellValue: blook.price,
        assignedAt: worker.assignedAt.toISOString(),
      };
    })
    .filter((worker: WorkerView | null): worker is WorkerView => worker !== null);
}

export async function getBaseStatus(playerId: number, executor: any = db) {
  const [player] = await executor
    .select({
      experience: playersTable.experience,
      username: playersTable.username,
      baseExtraSlots: playersTable.baseExtraSlots,
    })
    .from(playersTable)
    .where(eq(playersTable.id, playerId))
    .limit(1);
  const level = player ? levelForExp(player.experience) : 1;
  const levelRequired = player ? await baseLevelRequiredFor(player.username, executor) : BASE_LEVEL_REQUIRED;
  if (!player || level < levelRequired) {
    return {
      unlocked: false,
      level,
      levelRequired,
      tokensReady: 0,
      tokenRatePerHour: 0,
      maxWorkers: MAX_BASE_WORKERS + (player?.baseExtraSlots ?? 0),
      nextSlotCost: BASE_SLOT_COST,
      workers: [],
    };
  }

  const workers = await workerViews(playerId, executor);
  // Spooky Ghost clan effect: the Base produces faster only while it's held.
  // The displayed rate is the current instantaneous rate; accrual weights the
  // interval so time from before the boost existed is paid at the plain rate.
  const effects = await clanEffectsForPlayer(playerId, executor);
  const plainRatePerHour = workers.reduce((sum, worker) => sum + worker.tokenRatePerHour, 0);
  const tokenRatePerHour = Math.round(plainRatePerHour * effects.baseProductionMultiplier);
  const [base] = await executor
    .select()
    .from(playerBasesTable)
    .where(eq(playerBasesTable.playerId, playerId))
    .limit(1);
  const now = new Date();
  const currentProduction = base
    ? accruedProduction(
        weightedRateMilliseconds(
          base.lastAccruedAt,
          now,
          plainRatePerHour,
          tokenRatePerHour,
          effects.baseBoostActiveSince,
        ),
        base.accruedMicrotokens,
      )
    : { wholeTokens: 0, microtokens: 0 };
  const tokensReady =
    (base?.unclaimedTokens ?? 0) +
    currentProduction.wholeTokens +
    currentProduction.microtokens / MICROTOKENS_PER_TOKEN;
  return {
    unlocked: true,
    level,
    levelRequired,
    tokensReady,
    tokenRatePerHour,
    maxWorkers: MAX_BASE_WORKERS + player.baseExtraSlots,
    nextSlotCost: BASE_SLOT_COST,
    workers,
  };
}

async function ensureLockedBase(tx: any, playerId: number, now: Date) {
  await tx
    .insert(playerBasesTable)
    .values({ playerId, lastAccruedAt: now })
    .onConflictDoNothing();
  const [base] = await tx
    .select()
    .from(playerBasesTable)
    .where(eq(playerBasesTable.playerId, playerId))
    .for("update");
  return base!;
}

async function settleBase(
  tx: any,
  playerId: number,
  base: typeof playerBasesTable.$inferSelect,
  rateMilliseconds: number,
  now: Date,
) {
  const production = accruedProduction(rateMilliseconds, base.accruedMicrotokens);
  const pending = base.unclaimedTokens + production.wholeTokens;
  // Always persist the remainder at the current boundary. This preserves
  // production when a player claims frequently or swaps to a new worker rate.
  await tx
    .update(playerBasesTable)
    .set({
      unclaimedTokens: pending,
      accruedMicrotokens: production.microtokens,
      lastAccruedAt: now,
    })
    .where(eq(playerBasesTable.playerId, playerId));
  return pending;
}

export async function assignPermanentBaseWorkers(playerId: number, blookNames: string[]) {
  // Every requested name must be a real blook before anything is consumed. A
  // name may repeat to deploy several copies in one batch.
  const rates = new Map<string, number>();
  for (const name of blookNames) {
    if (rates.has(name)) continue;
    const def = getBlookDef(name);
    if (!def) return { ok: false as const, error: "Unknown blook" };
    if (isClanHoldBanned(def.pack)) {
      return { ok: false as const, error: `${name} can't be sent into the mine` };
    }
    const rate = baseWorkerRate(name);
    if (rate === null) return { ok: false as const, error: "Unknown blook" };
    rates.set(name, rate);
  }
  return db.transaction(async (tx) => {
    // Every inventory-consuming progression action locks the player first.
    // That makes an assignment mutually exclusive with other token/blook work.
    const [player] = await tx
      .select()
      .from(playersTable)
      .where(eq(playersTable.id, playerId))
      .for("update");
    const levelRequired = player ? await baseLevelRequiredFor(player.username, tx) : BASE_LEVEL_REQUIRED;
    if (!player || levelForExp(player.experience) < levelRequired) {
      return { ok: false as const, error: `Your Mine unlocks at level ${levelRequired}` };
    }

    const now = new Date();
    const existingWorkers = await workerViews(playerId, tx);
    const workerCap = MAX_BASE_WORKERS + player.baseExtraSlots;
    const freeSlots = workerCap - existingWorkers.length;
    if (freeSlots <= 0) {
      return { ok: false as const, error: `Your mine is full — ${workerCap} miners max. Buy a slot to expand.` };
    }
    if (blookNames.length > freeSlots) {
      return { ok: false as const, error: `Only ${freeSlots} miner slot${freeSlots === 1 ? "" : "s"} free — select fewer or buy a slot.` };
    }
    const effects = await clanEffectsForPlayer(playerId, tx);
    const oldPlainRate = existingWorkers.reduce(
      (sum, worker) => sum + worker.tokenRatePerHour,
      0,
    );
    const oldBoostedRate = Math.round(oldPlainRate * effects.baseProductionMultiplier);
    const base = await ensureLockedBase(tx, playerId, now);
    // Settle with the old rate before the permanent worker changes it. If the
    // inventory decrement fails, the whole transaction (including settlement)
    // rolls back without touching production.
    await settleBase(
      tx,
      playerId,
      base,
      weightedRateMilliseconds(
        base.lastAccruedAt,
        now,
        oldPlainRate,
        oldBoostedRate,
        effects.baseBoostActiveSince,
      ),
      now,
    );

    let deployedCount = 0;
    let skippedCount = 0;
    let anyDepleted = false;
    for (const blookName of blookNames) {
      // Consume one copy race-safely; a copy the player no longer owns is
      // skipped instead of failing the whole batch (mirrors clan placement).
      const [removed] = await tx
        .update(ownedBlooksTable)
        .set({ quantity: sql`${ownedBlooksTable.quantity} - 1` })
        .where(
          sql`${ownedBlooksTable.playerId} = ${playerId} and ${ownedBlooksTable.blookName} = ${blookName} and ${ownedBlooksTable.quantity} >= 1`,
        )
        .returning({ id: ownedBlooksTable.id, quantity: ownedBlooksTable.quantity });
      if (!removed) {
        skippedCount += 1;
        continue;
      }
      if (removed.quantity === 0) {
        await tx.delete(ownedBlooksTable).where(eq(ownedBlooksTable.id, removed.id));
        anyDepleted = true;
      }
      await tx
        .insert(baseWorkersTable)
        .values({ playerId, blookName, tokenRatePerHour: rates.get(blookName)! });
      deployedCount += 1;
    }
    if (anyDepleted) await syncCollectorBadge(playerId, tx);
    return { ok: true as const, deployedCount, skippedCount, status: await getBaseStatus(playerId, tx) };
  });
}

/**
 * Buy one extra permanent miner slot. The spend is a conditional decrement
 * (tokens >= cost) inside the player-locked transaction — the same
 * negative-balance guard every token sink uses. No settlement needed: the
 * cap change doesn't touch production rates.
 */
export async function buyBaseSlot(playerId: number) {
  return db.transaction(async (tx) => {
    const [player] = await tx
      .select()
      .from(playersTable)
      .where(eq(playersTable.id, playerId))
      .for("update");
    if (!player) return { ok: false as const, error: "Player not found" };
    const levelRequired = await baseLevelRequiredFor(player.username, tx);
    if (levelForExp(player.experience) < levelRequired) {
      return { ok: false as const, error: `Your Mine unlocks at level ${levelRequired}` };
    }
    const [paid] = await tx
      .update(playersTable)
      .set({
        tokens: sql`${playersTable.tokens} - ${BASE_SLOT_COST}`,
        tokensSpent: sql`${playersTable.tokensSpent} + ${BASE_SLOT_COST}`,
        baseExtraSlots: sql`${playersTable.baseExtraSlots} + 1`,
      })
      .where(
        sql`${playersTable.id} = ${playerId} and ${playersTable.tokens} >= ${BASE_SLOT_COST}`,
      )
      .returning({ tokens: playersTable.tokens });
    if (!paid) {
      return {
        ok: false as const,
        error: `You need ${BASE_SLOT_COST.toLocaleString()} tokens to buy a slot`,
      };
    }
    return { ok: true as const, tokens: paid.tokens, status: await getBaseStatus(playerId, tx) };
  });
}

export async function dismissBaseWorker(playerId: number, workerId: number) {
  return db.transaction(async (tx) => {
    // Same lock order as every token flow: player row first.
    const [player] = await tx
      .select()
      .from(playersTable)
      .where(eq(playersTable.id, playerId))
      .for("update");
    if (!player) return { ok: false as const, error: "Player not found" };

    const now = new Date();
    const existingWorkers = await workerViews(playerId, tx);
    const dismissed = existingWorkers.find((worker) => worker.id === workerId);
    if (!dismissed) return { ok: false as const, error: "That miner isn't in your mine" };

    const effects = await clanEffectsForPlayer(playerId, tx);
    const oldPlainRate = existingWorkers.reduce(
      (sum, worker) => sum + worker.tokenRatePerHour,
      0,
    );
    const oldBoostedRate = Math.round(oldPlainRate * effects.baseProductionMultiplier);
    const base = await ensureLockedBase(tx, playerId, now);
    // Settle at the old rate before the roster shrinks, mirroring assignment:
    // the dismissed miner's production up to this instant is preserved.
    await settleBase(
      tx,
      playerId,
      base,
      weightedRateMilliseconds(
        base.lastAccruedAt,
        now,
        oldPlainRate,
        oldBoostedRate,
        effects.baseBoostActiveSince,
      ),
      now,
    );

    const deleted = await tx
      .delete(baseWorkersTable)
      .where(and(eq(baseWorkersTable.id, workerId), eq(baseWorkersTable.playerId, playerId)))
      .returning({ id: baseWorkersTable.id });
    if (deleted.length === 0) {
      return { ok: false as const, error: "That miner isn't in your mine" };
    }

    // The blook itself was consumed at assignment; dismissal pays out its
    // plain sell value instead of returning the blook.
    const refund = dismissed.sellValue;
    const [updated] = await tx
      .update(playersTable)
      .set({
        tokens: sql`${playersTable.tokens} + ${refund}`,
        tokensEarned: sql`${playersTable.tokensEarned} + ${refund}`,
      })
      .where(eq(playersTable.id, playerId))
      .returning({ tokens: playersTable.tokens });
    return {
      ok: true as const,
      tokensAwarded: refund,
      tokens: updated!.tokens,
      blookName: dismissed.blookName,
      status: await getBaseStatus(playerId, tx),
    };
  });
}

/**
 * Boot sweep: re-sync stored worker rates after a RATE_BY_RARITY rebalance.
 * Each affected player's base is settled at the OLD stored rate first, so
 * production already dug is preserved at the rate it was actually dug at
 * (catalog-removed workers excluded, matching live accrual); only time after
 * the sweep accrues at the new rate. Idempotent.
 */
export async function sweepBaseWorkerRates() {
  const all = await db
    .select({
      playerId: baseWorkersTable.playerId,
      blookName: baseWorkersTable.blookName,
      tokenRatePerHour: baseWorkersTable.tokenRatePerHour,
    })
    .from(baseWorkersTable);
  const stalePlayers = new Set<number>();
  for (const worker of all) {
    const rate = baseWorkerRate(worker.blookName);
    if (rate !== null && rate !== worker.tokenRatePerHour) stalePlayers.add(worker.playerId);
  }

  let updated = 0;
  let failed = 0;
  for (const playerId of stalePlayers) {
    try {
      await db.transaction(async (tx) => {
        await tx
          .select({ id: playersTable.id })
          .from(playersTable)
          .where(eq(playersTable.id, playerId))
          .for("update");
        const workers = await tx
          .select()
          .from(baseWorkersTable)
          .where(eq(baseWorkersTable.playerId, playerId));
        const changes: Array<{ id: number; rate: number }> = [];
        for (const worker of workers) {
          const rate = baseWorkerRate(worker.blookName);
          if (rate !== null && rate !== worker.tokenRatePerHour) changes.push({ id: worker.id, rate });
        }
        if (changes.length === 0) return;

        const effects = await clanEffectsForPlayer(playerId, tx);
        // Settle at the rate the live status/claim paths were actually
        // accruing: only workers still present in the catalog count
        // (workerViews drops removed blooks from every production total).
        const oldPlainRate = workers.reduce(
          (sum, worker) => sum + (getBlookDef(worker.blookName) ? worker.tokenRatePerHour : 0),
          0,
        );
        const oldBoostedRate = Math.round(oldPlainRate * effects.baseProductionMultiplier);
        const now = new Date();
        const base = await ensureLockedBase(tx, playerId, now);
        await settleBase(
          tx,
          playerId,
          base,
          weightedRateMilliseconds(
            base.lastAccruedAt,
            now,
            oldPlainRate,
            oldBoostedRate,
            effects.baseBoostActiveSince,
          ),
          now,
        );
        for (const change of changes) {
          await tx
            .update(baseWorkersTable)
            .set({ tokenRatePerHour: change.rate })
            .where(eq(baseWorkersTable.id, change.id));
          updated += 1;
        }
      });
    } catch (err) {
      // One bad player must not strand everyone else on the old rates; the
      // next boot retries whoever is still stale.
      failed += 1;
      logger.error({ err, playerId }, "Base worker rate sweep failed for a player; continuing");
    }
  }
  return { updated, failed };
}

export async function claimBaseProduction(playerId: number) {
  return db.transaction(async (tx) => {
    const [player] = await tx
      .select()
      .from(playersTable)
      .where(eq(playersTable.id, playerId))
      .for("update");
    const levelRequired = player ? await baseLevelRequiredFor(player.username, tx) : BASE_LEVEL_REQUIRED;
    if (!player || levelForExp(player.experience) < levelRequired) {
      return { ok: false as const, error: `Your Mine unlocks at level ${levelRequired}` };
    }
    const [existingBase] = await tx
      .select()
      .from(playerBasesTable)
      .where(eq(playerBasesTable.playerId, playerId))
      .for("update");
    if (!existingBase) {
      return {
        ok: true as const,
        claimed: false,
        tokensAwarded: 0,
        tokens: player.tokens,
        status: await getBaseStatus(playerId, tx),
      };
    }

    const workers = await workerViews(playerId, tx);
    const effects = await clanEffectsForPlayer(playerId, tx);
    const plainRate = workers.reduce((sum, worker) => sum + worker.tokenRatePerHour, 0);
    const boostedRate = Math.round(plainRate * effects.baseProductionMultiplier);
    const now = new Date();
    const pending = await settleBase(
      tx,
      playerId,
      existingBase,
      weightedRateMilliseconds(
        existingBase.lastAccruedAt,
        now,
        plainRate,
        boostedRate,
        effects.baseBoostActiveSince,
      ),
      now,
    );
    if (pending <= 0) {
      return {
        ok: true as const,
        claimed: false,
        tokensAwarded: 0,
        tokens: player.tokens,
        status: await getBaseStatus(playerId, tx),
      };
    }
    const [updatedPlayer] = await tx
      .update(playersTable)
      .set({
        tokens: sql`${playersTable.tokens} + ${pending}`,
        tokensEarned: sql`${playersTable.tokensEarned} + ${pending}`,
      })
      .where(eq(playersTable.id, playerId))
      .returning({ tokens: playersTable.tokens });
    await tx
      .update(playerBasesTable)
      .set({ unclaimedTokens: 0 })
      .where(eq(playerBasesTable.playerId, playerId));
    return {
      ok: true as const,
      claimed: true,
      tokensAwarded: pending,
      tokens: updatedPlayer!.tokens,
      status: await getBaseStatus(playerId, tx),
    };
  });
}