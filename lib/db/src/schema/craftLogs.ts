import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players";

/** Every craft is logged here permanently for moderation. */
export const craftLogsTable = pgTable(
  "craft_logs",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id")
      .notNull()
      .references(() => playersTable.id),
    /** Names of the blooks consumed (2-5, may repeat). */
    inputs: jsonb("inputs").$type<string[]>().notNull(),
    resultName: text("result_name").notNull(),
    usedLuck: boolean("used_luck").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("craft_logs_player_id_idx").on(t.playerId),
    // Mod-panel live filter: per-result-blook feed + all-time counts.
    index("craft_logs_result_name_idx").on(t.resultName),
  ],
);

export type CraftLogRow = typeof craftLogsTable.$inferSelect;
