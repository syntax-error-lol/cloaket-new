import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players";

export const ownedBlooksTable = pgTable(
  "owned_blooks",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id")
      .notNull()
      .references(() => playersTable.id),
    blookName: text("blook_name").notNull(),
    quantity: integer("quantity").notNull().default(1),
    firstObtainedAt: timestamp("first_obtained_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("owned_blooks_player_blook_idx").on(t.playerId, t.blookName)],
);

export type OwnedBlookRow = typeof ownedBlooksTable.$inferSelect;
