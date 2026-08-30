import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players";
import { packPullsTable } from "./packPulls";

// Private messages (Inbox). A message can carry a blook gift: the blook is
// deducted from the sender when the message is sent (escrow) and granted to
// the recipient when they claim it (gift_claimed_at set, race-safe).
// Table created via manual DDL in dev — publish auto-diffs it into prod:
//   CREATE TABLE dm_messages (
//     id serial PRIMARY KEY,
//     sender_id integer NOT NULL REFERENCES players(id),
//     recipient_id integer NOT NULL REFERENCES players(id),
//     content text NOT NULL DEFAULT '',
//     gift_blook text,
//     gift_claimed_at timestamptz,
//     read_at timestamptz,
//     created_at timestamptz NOT NULL DEFAULT now()
//   );
//   CREATE INDEX dm_messages_recipient_idx ON dm_messages (recipient_id, created_at);
//   CREATE INDEX dm_messages_sender_idx ON dm_messages (sender_id, created_at);
export const dmMessagesTable = pgTable(
  "dm_messages",
  {
    id: serial("id").primaryKey(),
    senderId: integer("sender_id")
      .notNull()
      .references(() => playersTable.id),
    recipientId: integer("recipient_id")
      .notNull()
      .references(() => playersTable.id),
    content: text("content").notNull().default(""),
    giftBlook: text("gift_blook"),
    giftClaimedAt: timestamp("gift_claimed_at", { withTimezone: true }),
    // Verified pull share ("flex"): validated server-side to belong to the
    // sender. FK modeled here so the Publish schema diff creates it in prod.
    sharedPullId: integer("shared_pull_id").references(() => packPullsTable.id),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("dm_messages_recipient_idx").on(t.recipientId, t.createdAt),
    index("dm_messages_sender_idx").on(t.senderId, t.createdAt),
  ],
);

export type DmMessageRow = typeof dmMessagesTable.$inferSelect;
