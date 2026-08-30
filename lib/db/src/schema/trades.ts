import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players";

export interface TradeBlookEntry {
  name: string;
  quantity: number;
}

export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id")
    .notNull()
    .references(() => playersTable.id),
  partnerId: integer("partner_id")
    .notNull()
    .references(() => playersTable.id),
  status: text("status").notNull().default("active"),
  myTokens: integer("my_tokens").notNull().default(0),
  myBlooks: jsonb("my_blooks").$type<TradeBlookEntry[]>().notNull().default([]),
  partnerTokens: integer("partner_tokens").notNull().default(0),
  partnerBlooks: jsonb("partner_blooks")
    .$type<TradeBlookEntry[]>()
    .notNull()
    .default([]),
  myAccepted: boolean("my_accepted").notNull().default(false),
  partnerAccepted: boolean("partner_accepted").notNull().default(false),
  botGreeted: boolean("bot_greeted").notNull().default(false),
  botLastActionAt: timestamp("bot_last_action_at", { withTimezone: true }),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type TradeRow = typeof tradesTable.$inferSelect;

export const tradeMessagesTable = pgTable("trade_messages", {
  id: serial("id").primaryKey(),
  tradeId: integer("trade_id")
    .notNull()
    .references(() => tradesTable.id),
  playerId: integer("player_id")
    .notNull()
    .references(() => playersTable.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TradeMessageRow = typeof tradeMessagesTable.$inferSelect;
