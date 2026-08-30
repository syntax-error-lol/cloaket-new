import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const playersTable = pgTable("players", {
  id: serial("id").primaryKey(),
  authId: text("auth_id").unique(),
  // Also has a unique index on lower(username) (players_username_lower_idx,
  // applied via manual DDL) enforcing case-insensitive uniqueness.
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash"),
  badges: jsonb("badges").$type<string[]>().notNull().default([]),
  nameEffect: text("name_effect"),
  tokens: integer("tokens").notNull().default(0),
  experience: integer("experience").notNull().default(0),
  packsOpened: integer("packs_opened").notNull().default(0),
  tokensSpent: integer("tokens_spent").notNull().default(0),
  tokensEarned: integer("tokens_earned").notNull().default(0),
  // Starter-bundle clan perks. Columns added via manual DDL in dev
  // (ALTER TABLE players ADD COLUMN clan_boosts/rainbow_perks integer NOT NULL DEFAULT 0)
  // — must exist in prod too (publish auto-diffs them).
  clanBoosts: integer("clan_boosts").notNull().default(0),
  rainbowPerks: integer("rainbow_perks").notNull().default(0),
  // One-use 2.5x craft luck items (only obtainable from the starter bundle).
  // Column added via manual DDL in dev — publish auto-diffs it into prod.
  craftLuckItems: integer("craft_luck_items").notNull().default(0),
  // Extra permanent Base miner slots bought with tokens (BASE_SLOT_COST each)
  // on top of the free MAX_BASE_WORKERS cap. Column added via manual DDL in
  // dev — publish auto-diffs it into prod.
  baseExtraSlots: integer("base_extra_slots").notNull().default(0),
  // Highest starter-bundle version whose rewards this player has received.
  // Bundle owners below the current version get the diff at server startup
  // (see applyBundleUpgrades). Column added via manual DDL in dev — publish
  // auto-diffs it into prod.
  bundleVersion: integer("bundle_version").notNull().default(0),
  avatarBlook: text("avatar_blook"),
  // Owner-managed custom profile picture (a served path like
  // /api/storage/objects/<id> or /api/content/avatars/<file>). Takes
  // precedence over avatarBlook everywhere avatars render. Column added via
  // manual DDL in dev — publish auto-diffs it into prod.
  customAvatarUrl: text("custom_avatar_url"),
  bannerColor: text("banner_color"),
  // Custom chat text color (#rrggbb). Column added via manual DDL in dev
  // (ALTER TABLE players ADD COLUMN chat_color text) — publish auto-diffs it.
  chatColor: text("chat_color"),
  lastClaimAt: timestamp("last_claim_at", { withTimezone: true }),
  // Updated (throttled) on every authenticated request; "online" = seen recently.
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  // Last client IP seen for this player. Column added via manual DDL in dev
  // (ALTER TABLE players ADD COLUMN last_ip text) — must exist in prod too.
  lastIp: text("last_ip"),
  // Staff-panel approvals, per panel: subset of ["admin","mod","coowner","owner"].
  // Only accounts approved for a panel may even attempt its password while
  // the approval gate is on (/blookgen counts as "admin"). Column added via
  // manual DDL in dev (ALTER TABLE players ADD COLUMN panel_access jsonb
  // NOT NULL DEFAULT '[]') — publish auto-diffs it into prod.
  panelAccess: jsonb("panel_access").$type<string[]>().notNull().default([]),
  // Owner "unlock": while true, the NEXT login with ANY password (min 6 chars)
  // is accepted, that password becomes the account's new password, and the
  // flag clears — a password reset for kids who forgot theirs. Column added
  // via manual DDL in dev (ALTER TABLE players ADD COLUMN unlock_pending
  // boolean NOT NULL DEFAULT false) — publish auto-diffs it into prod.
  unlockPending: boolean("unlock_pending").notNull().default(false),
  // When the unlock was granted; the one-time reset is only honored for an
  // hour (stale unlocks are ignored at login). Column added via manual DDL in
  // dev — publish auto-diffs it into prod.
  unlockPendingAt: timestamp("unlock_pending_at", { withTimezone: true }),
  // Login brute-force protection: failed attempts inside the sliding window
  // and the lockout deadline once the threshold is hit. Columns added via
  // manual DDL in dev — publish auto-diffs them into prod.
  failedLogins: integer("failed_logins").notNull().default(0),
  lastFailedLoginAt: timestamp("last_failed_login_at", { withTimezone: true }),
  lockoutUntil: timestamp("lockout_until", { withTimezone: true }),
  // Bumped on password change/reset. Session cookies embed the version they
  // were issued with and die on mismatch, so stolen cookies stop working the
  // moment the password changes. Column added via manual DDL in dev —
  // publish auto-diffs it into prod.
  sessionVersion: integer("session_version").notNull().default(1),
  isBot: boolean("is_bot").notNull().default(false),
  banned: boolean("banned").notNull().default(false),
  muted: boolean("muted").notNull().default(false),
  // Timed chat mute (mod panel "mute for X minutes"). NULL or past = not
  // muted. Column added via manual DDL in dev — publish auto-diffs it into
  // prod.
  mutedUntil: timestamp("muted_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Player = typeof playersTable.$inferSelect;
