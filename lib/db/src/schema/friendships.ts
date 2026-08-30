import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players";

// Friend requests / friendships. One row per pair, created by the requester.
// status: 'pending' until the addressee accepts. Declining deletes the row.
// Table created via manual DDL in dev — publish auto-diffs it into prod:
//   CREATE TABLE friendships (
//     id serial PRIMARY KEY,
//     requester_id integer NOT NULL REFERENCES players(id),
//     addressee_id integer NOT NULL REFERENCES players(id),
//     status text NOT NULL DEFAULT 'pending',
//     created_at timestamptz NOT NULL DEFAULT now()
//   );
//   CREATE UNIQUE INDEX friendships_pair_idx ON friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
export const friendshipsTable = pgTable(
  "friendships",
  {
    id: serial("id").primaryKey(),
    requesterId: integer("requester_id")
      .notNull()
      .references(() => playersTable.id),
    addresseeId: integer("addressee_id")
      .notNull()
      .references(() => playersTable.id),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Direction-agnostic pair uniqueness is enforced by a functional index in
    // real DDL (see comment above); this plain index keeps drizzle aware of
    // the columns involved.
    uniqueIndex("friendships_requester_addressee_idx").on(t.requesterId, t.addresseeId),
  ],
);

export type FriendshipRow = typeof friendshipsTable.$inferSelect;
