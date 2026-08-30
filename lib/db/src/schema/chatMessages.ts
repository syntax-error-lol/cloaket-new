import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players";

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id")
    .notNull()
    .references(() => playersTable.id),
  content: text("content").notNull(),
  // Canonical usernames of players who were online when the message was sent
  // and were @mentioned in it. Only these render as bold mentions.
  mentions: text("mentions").array().notNull().default([]),
  // True when the message originated in Discord (bridged into the game by the
  // bot). The Discord bridge skips these so they never echo back to Discord —
  // this must live in the DB (not bot memory) because multiple server
  // instances can run at once.
  // DDL: ALTER TABLE chat_messages ADD COLUMN from_discord boolean NOT NULL DEFAULT false;
  fromDiscord: boolean("from_discord").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ChatMessageRow = typeof chatMessagesTable.$inferSelect;
