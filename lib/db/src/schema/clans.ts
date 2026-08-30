import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players";

export const clansTable = pgTable("clans", {
  id: serial("id").primaryKey(),
  // Max 20 chars, enforced at the API layer. Unique index on lower(name)
  // (clans_name_lower_idx, applied via manual DDL).
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#ffffff"),
  // Object-storage path (e.g. /objects/uploads/<uuid>) for the clan banner
  // image; NSFW-checked at the API layer before being stored.
  imageUrl: text("image_url"),
  // Short clan description shown on the clan card, editable by the owner.
  description: text("description"),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => playersTable.id),
  // Clan XP earned by members opening packs. Column added via manual DDL
  // (ALTER TABLE clans ADD COLUMN experience integer NOT NULL DEFAULT 0) —
  // must exist in prod too.
  experience: integer("experience").notNull().default(0),
  // Player id whose rainbow perk is applied to this clan (rainbow clan name).
  // Added via manual DDL: ALTER TABLE clans ADD COLUMN rainbow_owner_id integer.
  rainbowOwnerId: integer("rainbow_owner_id"),
  // Soft-ban: banned clans are hidden everywhere (list, tags, chat) but all
  // data is kept so a mod can unban to fully recover them. Added via manual
  // DDL: ALTER TABLE clans ADD COLUMN banned boolean NOT NULL DEFAULT false.
  banned: boolean("banned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const clanMembersTable = pgTable("clan_members", {
  id: serial("id").primaryKey(),
  clanId: integer("clan_id")
    .notNull()
    .references(() => clansTable.id),
  // A player can only be in one clan (unique constraint via manual DDL).
  playerId: integer("player_id")
    .notNull()
    .unique()
    .references(() => playersTable.id),
  role: text("role").notNull().default("member"),
  // Chroma mine ledger: held-Chroma production banks against this clock and it
  // only advances when a collect actually pays out. Added via manual DDL:
  // ALTER TABLE clan_members ADD COLUMN clan_tokens_last_at timestamptz NOT NULL DEFAULT now().
  clanTokensLastAt: timestamp("clan_tokens_last_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// One application row per (clan, player) — unique index
// clan_applications_clan_player_idx applied via manual DDL.
export const clanApplicationsTable = pgTable("clan_applications", {
  id: serial("id").primaryKey(),
  clanId: integer("clan_id")
    .notNull()
    .references(() => clansTable.id),
  playerId: integer("player_id")
    .notNull()
    .references(() => playersTable.id),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const clanMessagesTable = pgTable("clan_messages", {
  id: serial("id").primaryKey(),
  clanId: integer("clan_id")
    .notNull()
    .references(() => clansTable.id),
  playerId: integer("player_id")
    .notNull()
    .references(() => playersTable.id),
  content: text("content").notNull(),
  // True when bridged in from Discord (see chatMessages.fromDiscord).
  // DDL: ALTER TABLE clan_messages ADD COLUMN from_discord boolean NOT NULL DEFAULT false;
  fromDiscord: boolean("from_discord").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ClanRow = typeof clansTable.$inferSelect;
export type ClanMemberRow = typeof clanMembersTable.$inferSelect;
export type ClanApplicationRow = typeof clanApplicationsTable.$inferSelect;
export type ClanMessageRow = typeof clanMessagesTable.$inferSelect;
