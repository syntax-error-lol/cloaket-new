import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players";

/** Every pack open is logged here permanently for moderation. */
export const packPullsTable = pgTable(
  "pack_pulls",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id")
      .notNull()
      .references(() => playersTable.id),
    blookName: text("blook_name").notNull(),
    packName: text("pack_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("pack_pulls_player_id_idx").on(t.playerId),
    // Mod-panel live filters: per-blook and per-pack feeds + all-time counts.
    index("pack_pulls_blook_name_idx").on(t.blookName),
    index("pack_pulls_pack_name_idx").on(t.packName),
  ],
);

export type PackPullRow = typeof packPullsTable.$inferSelect;
