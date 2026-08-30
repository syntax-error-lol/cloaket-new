import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * IP bans. An IP ban blocks NEW account registration from that IP only —
 * existing accounts (e.g. innocent classmates on a shared school IP) keep
 * playing normally; the banned player's own account is banned separately via
 * players.banned. This targets ban evasion without collateral damage.
 *
 * Table added via manual DDL in dev — publish auto-diffs it into prod:
 *   CREATE TABLE ip_bans (
 *     id serial PRIMARY KEY,
 *     ip text NOT NULL UNIQUE,
 *     banned_username text NOT NULL,
 *     created_at timestamptz NOT NULL DEFAULT now()
 *   );
 */
export const ipBansTable = pgTable("ip_bans", {
  id: serial("id").primaryKey(),
  ip: text("ip").notNull().unique(),
  // Username of the player whose ban created this entry (for the admin list).
  bannedUsername: text("banned_username").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
