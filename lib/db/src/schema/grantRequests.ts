import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players";

/**
 * Staff-issued rewards that need an owner decision before they can affect a
 * player. The decision is claimed conditionally at approval time, which makes
 * the eventual reward safe against double-clicks and concurrent requests.
 */
export const grantRequestsTable = pgTable("grant_requests", {
  id: serial("id").primaryKey(),
  requesterName: text("requester_name"),
  targetPlayerId: integer("target_player_id")
    .notNull()
    .references(() => playersTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  blookName: text("blook_name"),
  quantity: integer("quantity"),
  status: text("status").notNull().default("pending"),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type GrantRequestRow = typeof grantRequestsTable.$inferSelect;