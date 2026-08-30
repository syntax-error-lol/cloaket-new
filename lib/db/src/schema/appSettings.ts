import { pgTable, text } from "drizzle-orm/pg-core";

// Simple key-value store for owner-controlled flags (admin panel disabled,
// links allowed, ...). Created via manual DDL — see owner routes.
export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
