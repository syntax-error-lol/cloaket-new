import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players";

export const bazaarListingsTable = pgTable("bazaar_listings", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id")
    .notNull()
    .references(() => playersTable.id),
  blookName: text("blook_name").notNull(),
  price: integer("price").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type BazaarListingRow = typeof bazaarListingsTable.$inferSelect;
