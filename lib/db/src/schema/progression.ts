import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { clansTable } from "./clans";
import { playersTable } from "./players";

/** A blook committed to a clan. It is absent from the owner's inventory until withdrawn. */
export const clanHeldBlooksTable = pgTable(
  "clan_held_blooks",
  {
    id: serial("id").primaryKey(),
    clanId: integer("clan_id")
      .notNull()
      .references(() => clansTable.id, { onDelete: "cascade" }),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => playersTable.id, { onDelete: "cascade" }),
    blookName: text("blook_name").notNull(),
    placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
    withdrawableAt: timestamp("withdrawable_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("clan_held_blooks_clan_idx").on(table.clanId),
    index("clan_held_blooks_owner_idx").on(table.ownerId),
  ],
);

/** One permanent factory job. Workers never re-enter a player's blook inventory. */
export const baseWorkersTable = pgTable(
  "base_workers",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id")
      .notNull()
      .references(() => playersTable.id, { onDelete: "cascade" }),
    blookName: text("blook_name").notNull(),
    tokenRatePerHour: integer("token_rate_per_hour").notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("base_workers_player_idx").on(table.playerId)],
);

/**
 * The persisted token balance and accrual point for a player's Base. A separate
 * row lets claims lock and settle production atomically even with several tabs.
 */
export const playerBasesTable = pgTable("player_bases", {
  playerId: integer("player_id")
    .primaryKey()
    .references(() => playersTable.id, { onDelete: "cascade" }),
  unclaimedTokens: integer("unclaimed_tokens").notNull().default(0),
  /** Fractional production in millionths of one token; retained across claims and rate changes. */
  accruedMicrotokens: integer("accrued_microtokens").notNull().default(0),
  lastAccruedAt: timestamp("last_accrued_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ClanHeldBlookRow = typeof clanHeldBlooksTable.$inferSelect;
export type BaseWorkerRow = typeof baseWorkersTable.$inferSelect;
export type PlayerBaseRow = typeof playerBasesTable.$inferSelect;