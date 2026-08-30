import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players";

// One row per fulfilled Stripe checkout session — the unique session id makes
// reward-granting idempotent (a session can only ever be fulfilled once).
// Players may buy the bundle any number of times (one row per purchase).
export const storePurchasesTable = pgTable("store_purchases", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id")
    .notNull()
    .references(() => playersTable.id),
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  productKey: text("product_key").notNull(),
  chromaBlook: text("chroma_blook"),
  // For admin-granted bundles (`free_` session ids): username of the
  // logged-in account that pressed the grant button, if known.
  grantedBy: text("granted_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type StorePurchaseRow = typeof storePurchasesTable.$inferSelect;
