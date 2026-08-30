import { eq } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";

// Owner-editable market pack order. Stored in app_settings as a JSON array of
// pack names so it is shared across instances and survives restarts. Packs
// missing from the saved list (e.g. newly added catalog packs) keep their
// relative catalog order and sort after the listed ones, so a stale saved
// order can never hide a pack.
const PACK_ORDER_KEY = "pack_order";
const CACHE_TTL_MS = 10_000;

let cache: { order: string[] | null; ts: number } | null = null;

/** The saved order (null when unset/invalid — callers fall back to catalog order). */
export async function getSavedPackOrder(): Promise<string[] | null> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.order;
  const [row] = await db
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, PACK_ORDER_KEY));
  let order: string[] | null = null;
  if (row?.value) {
    try {
      const parsed: unknown = JSON.parse(row.value);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every((n) => typeof n === "string")
      ) {
        order = parsed;
      }
    } catch {
      // Corrupt value — fall back to catalog order rather than crash.
    }
  }
  cache = { order, ts: Date.now() };
  return order;
}

export async function setSavedPackOrder(order: string[]): Promise<void> {
  const value = JSON.stringify(order);
  await db
    .insert(appSettingsTable)
    .values({ key: PACK_ORDER_KEY, value })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value } });
  cache = null;
}

/** Sort packs by the saved order; unlisted packs keep their relative
 * (catalog) order after the listed ones. Never drops entries. */
export async function orderedPacks<T extends { name: string }>(packs: T[]): Promise<T[]> {
  const saved = await getSavedPackOrder();
  if (!saved) return packs;
  const pos = new Map(saved.map((name, i) => [name, i]));
  return [...packs].sort(
    (a, b) => (pos.get(a.name) ?? saved.length) - (pos.get(b.name) ?? saved.length),
  );
}
