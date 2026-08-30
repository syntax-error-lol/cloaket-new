---
name: Clans & chat rewards
description: Design rules for the clan system and silent chat token rewards; manual DDL indexes needing prod parity.
---

**Clan system rules**
- One application row per (clan, player). Re-apply after rejection/leaving resets the row to `pending` via upsert. **Why:** duplicate pending rows made "latest status wins" race-prone (code-review finding).
- Joining consumes the `accepted` application atomically (status -> `joined` + membership insert in one transaction). Leaving and rejoining requires a fresh application + owner acceptance. **Why:** otherwise one acceptance authorized unlimited rejoins.
- Held blooks follow their owner at JOIN time (Aug 2026): left/kicked players' rows stay behind until they join somewhere new, then migrate inside the join tx. Settle BOTH sides' mines pre-move; moved rows get placed_at = arrival while withdrawable_at keeps its original clock. **Why:** per-row pay window is max(member clock, placed_at, now-24h) and zero payouts never advance the clock — old placed_at would let stale clocks reprice history.
- Demotion guard on migration: an incoming aura-registered Mystical with a LOWER id than the target clan's first copy flips that existing copy from 0/hr aura to 75/hr duplicate — reset placed_at on exactly that previously-first row too, or a stale member clock back-pays up to 24h of duplicate production it never earned. **Why:** review caught this overpay; classification is id-ordered and moved rows keep their global ids.
- Owner leave (July 2026): an owner with other members gets 400 "transfer ownership first"; only a sole-member owner disbands the clan. New `/clans/:clanId/transfer` route swaps `clans.owner_id` + member roles. **Why:** user wanted no accidental disbands; UI leave button opens a transfer picker for owners.
- All owner leave/transfer checks must run INSIDE a transaction after `SELECT ... FOR UPDATE` on the clan row — transfers lock the same row, so state read under the lock is the state deleted against. **Why:** review found a precheck-outside-tx race where a stale disband deleted a just-transferred clan.
- Admin delete-players cascades clan data: owned clans deleted entirely (messages/applications/members), other memberships removed, `rainbow_owner_id` cleared, store_purchases deleted. **Why:** FK errors previously blocked deleting players in clans.
- Clan tag (clanName/clanColor, nullable) is part of the shared ChatMessage schema and returned by global chat, trade chat, and clan chat — any new chat-like endpoint must populate it.

**Chat token reward: REMOVED (July 2026)**
- User first asked for a silent 25-token-per-chat-message reward, then had it removed the next day and raised the daily claim from 2,000 to 4,000 instead. **Why:** simpler economy; if chat rewards ever come back, normalization must strip punctuation/zero-width chars and rewards must be paced, or variants mint unlimited tokens (past review finding). Daily-claim UI copy in the stats page hardcodes the amount — keep it in sync with CLAIM_AMOUNT.

**Clan banner images (July 2026)**
- Uploads go through object storage presigned URLs; an image only becomes servable after passing the AI NSFW check, which then claims it (ACL owner = player, visibility public). `/api/storage/objects/*` serves ONLY objects with a passing ACL — unclaimed raw uploads 403. **Why:** otherwise direct object URLs bypass moderation entirely (review finding).
- A player can only attach unclaimed uploads or their own claimed objects as a clan image — blocks pointing at others' uploads.
- 25-member cap is enforced inside the join transaction with `SELECT ... FOR UPDATE` on the clan row. **Why:** count-then-insert without the lock oversubscribes under concurrent joins.
- Moderation fails closed; tiny/ambiguous images can occasionally be rejected — surface the 400 message, retrying with a real image works.
- `clans.image_url` column added via manual DDL in dev (`ALTER TABLE clans ADD COLUMN image_url text`) — must exist in prod too.

**Clan levels (July 2026)**
- Clans have an `experience` column; pack opens add the opener's exp gain to their clan inside the same transaction as the player update. Clan level uses the same levelForExp formula as players.
- Manual DDL in dev: `ALTER TABLE clans ADD COLUMN experience integer NOT NULL DEFAULT 0` — must exist in prod too.

**Chat @mentions (July 2026)**
- Mentions are validated server-side at send time: only players online (last_seen_at within 5 min) get casing canonicalized and stored in `chat_messages.mentions text[]`. Frontend styles/pings ONLY names in that array — never regex-guess client-side. **Why:** user wants offline mentions to render as plain text; online status at send time can't be reconstructed later.
- Mention token charset must match USERNAME_RE (`[A-Za-z0-9_-]`, hyphen included) everywhere. **Why:** review found `@Foo-Bar` mis-parsed as `@Foo` when hyphen was excluded.
- Column added via manual DDL in dev (`ALTER TABLE chat_messages ADD COLUMN mentions text[] NOT NULL DEFAULT '{}'`); publish auto-diffs it to prod.

**Manual DDL indexes that must also exist in prod** (drizzle schema comments note them; publish does NOT create them):
- `players_username_lower_idx` on lower(username)
- `clans_name_lower_idx` on lower(name)
- `clan_applications_clan_player_idx` unique (clan_id, player_id)
Verify/create after publishing schema changes.

**Starter-bundle clan perks (July 2026)**
- Bundle grants movable perks: `players.clan_boosts` (+10 clan levels each; exp for level L is 100*(L-1)^2) and `players.rainbow_perks` (rainbow clan name; apply requires owning the clan, only the applier can remove; refunded on clan disband via a FOR UPDATE lock + conditional clear so concurrent remove can't double-refund). **Why:** review found refund races mint free perks.
- Clan rainbow is exposed as the sentinel `clanColor: "rainbow"` in ALL chat-tag responses; frontend renders `text-rainbow`. Any new chat-like endpoint must apply the sentinel, not raw clans.color.
- Clan chat responses share the ChatMessage schema, which REQUIRES `mentions: []` — omitting it 500s the endpoint with a ZodError — this silently broke BOTH clan chat and trade chat when mentions was added to global chat; check every ChatMessage-shaped response when the shared schema gains a field.
- New columns via manual DDL in dev (players.clan_boosts/rainbow_perks int default 0, clans.rainbow_owner_id int null); publish auto-diffs to prod.

## Clan soft-ban (Aug 2026)
- clans.banned boolean (default false) — banned clans hidden from list/detail/apply/join/chat, chat tags, AND the Discord thread bridge (sync, login-assign, inbound auth, outbound poll). Data untouched so unban fully restores.
- Mod endpoints: /mod/clans (list incl. banned), /mod/clans/ban|unban by case-insensitive name; UI is a Clans tab in shared mod-tools.
- Prod needs the column after Publish: ALTER TABLE clans ADD COLUMN banned boolean NOT NULL DEFAULT false.

## Banned-clan trap (fixed Aug 2026)
- GET /clans filters banned=false, so members of banned clans had no list entry, no detail page, no Leave button, and couldn't join another clan.
- Fix: GET /clans/my-membership (registered before /clans/:clanId) reports membership incl. banned; clans.tsx shows a leave banner; the leave route lets a banned clan's owner disband even with other members (skips transfer_first) and releases held blooks in the same locked transaction.
- **How to apply:** any future "hidden clan" state must keep a self-serve exit path (membership visibility + a leave/disband route that bypasses transfer requirements). Blook-rename sweeps must also cover craft_logs (result_name + inputs jsonb) — its columns don't match a %blook% scan.
