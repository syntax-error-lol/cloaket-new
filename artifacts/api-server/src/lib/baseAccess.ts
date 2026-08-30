import { eq } from "drizzle-orm";
import { appSettingsTable, db } from "@workspace/db";

export const EXTRAVEXTRAS_USERNAME = "extravextras";
export const EXTRAVEXTRAS_BASE_LEVEL3_KEY = "extravextras_base_level3_enabled";

type ReadExecutor = Pick<typeof db, "select">;
type WriteExecutor = Pick<typeof db, "insert">;

/**
 * This one account's early Base access starts enabled. Owner can explicitly
 * turn it off to return the account to the normal level-five requirement.
 */
export async function isExtravextrasBaseLevel3Enabled(
  executor: ReadExecutor = db,
): Promise<boolean> {
  const [row] = await executor
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, EXTRAVEXTRAS_BASE_LEVEL3_KEY));
  return row?.value !== "false";
}

export async function baseLevelRequiredFor(
  username: string,
  executor: ReadExecutor = db,
): Promise<number> {
  if (username.toLowerCase() !== EXTRAVEXTRAS_USERNAME) return 5;
  return (await isExtravextrasBaseLevel3Enabled(executor)) ? 3 : 5;
}

export async function setExtravextrasBaseLevel3Enabled(
  enabled: boolean,
  executor: WriteExecutor = db,
): Promise<void> {
  await executor
    .insert(appSettingsTable)
    .values({ key: EXTRAVEXTRAS_BASE_LEVEL3_KEY, value: String(enabled) })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value: String(enabled) },
    });
}