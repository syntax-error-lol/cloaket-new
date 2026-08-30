import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players";

export const tradeRequestsTable = pgTable("trade_requests", {
  id: serial("id").primaryKey(),
  fromId: integer("from_id")
    .notNull()
    .references(() => playersTable.id),
  toId: integer("to_id")
    .notNull()
    .references(() => playersTable.id),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TradeRequestRow = typeof tradeRequestsTable.$inferSelect;
