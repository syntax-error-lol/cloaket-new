import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players";

export const unlocksTable = pgTable("unlocks", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id")
    .notNull()
    .references(() => playersTable.id),
  blookName: text("blook_name").notNull(),
  packName: text("pack_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type UnlockRow = typeof unlocksTable.$inferSelect;
