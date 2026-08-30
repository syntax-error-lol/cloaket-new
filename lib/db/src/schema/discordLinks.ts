import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { playersTable } from "./players";

// Links a Discord user to their Cloaket account (via the Discord bot's
// /login command). One Discord user <-> one Cloaket account.
// Created via manual DDL in dev — publish auto-diffs it into prod.
export const discordLinksTable = pgTable("discord_links", {
  discordId: text("discord_id").primaryKey(),
  playerId: integer("player_id")
    .notNull()
    .unique()
    .references(() => playersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type DiscordLinkRow = typeof discordLinksTable.$inferSelect;
