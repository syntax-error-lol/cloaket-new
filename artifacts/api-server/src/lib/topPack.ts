import { and, eq, sql } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";
import { TOP_PACK_SUPPLY } from "./game";

// Global limited supply for the Top pack's 1k blook. The remaining count
// lives in app_settings so it is shared across instances and survives
// restarts. Seeded on first use; decremented race-safely on each hit.
const REMAINING_KEY = "top_pack_remaining";

type Executor = Pick<typeof db, "select" | "insert" | "update">;

async function ensureSeeded(ex: Executor): Promise<void> {
  await ex
    .insert(appSettingsTable)
    .values({ key: REMAINING_KEY, value: String(TOP_PACK_SUPPLY) })
    .onConflictDoNothing();
}

/**
 * Claim one unit of 1k supply (call inside the pack-open transaction).
 * Returns false when the supply is exhausted — the open becomes a miss.
 */
export async function claimTopPackHit(ex: Executor): Promise<boolean> {
  await ensureSeeded(ex);
  const [row] = await ex
    .update(appSettingsTable)
    .set({ value: sql`((${appSettingsTable.value})::int - 1)::text` })
    .where(and(eq(appSettingsTable.key, REMAINING_KEY), sql`(${appSettingsTable.value})::int > 0`))
    .returning({ value: appSettingsTable.value });
  if (row) soldOutCache = null; // remaining changed — refresh on next check
  return !!row;
}

// Checked on every GET /packs and pack open; cache briefly.
let soldOutCache: { remaining: number; ts: number } | null = null;

/** Remaining global 1k supply (briefly cached). */
export async function getTopPackRemaining(): Promise<number> {
  if (soldOutCache && Date.now() - soldOutCache.ts < 10_000) return soldOutCache.remaining;
  await ensureSeeded(db);
  const [row] = await db
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, REMAINING_KEY));
  const remaining = Math.max(0, Number(row?.value ?? 0));
  soldOutCache = { remaining, ts: Date.now() };
  return remaining;
}

export async function isTopPackSoldOut(): Promise<boolean> {
  return (await getTopPackRemaining()) <= 0;
}
