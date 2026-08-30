---
name: Friends & DM inbox
description: Friend requests, private DMs with blook gifts — invariants and prod DDL that must exist
---

## Rules
- Friendship pair uniqueness is direction-agnostic and enforced ONLY by a functional index that drizzle can't model: `CREATE UNIQUE INDEX friendships_pair_idx ON friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));` — **must be created manually in prod after the first Publish that ships the friendships table**, or concurrent opposite-direction requests create duplicate rows.
- **Why:** the drizzle schema only declares a directional (requester,addressee) unique index; the code relies on the functional index turning races into constraint errors.
- Blook gifts are escrowed: sending deducts from the sender in-transaction (quantity >= 1 conditional); claiming flips gift_claimed_at AND grants the blook in ONE transaction — never split them or a failed grant loses the blook forever.
- Any player-deletion flow must delete friendships + dm_messages rows (both directions) before players — restrictive FKs otherwise abort the delete.
- Pull-share "flex" cards are only trustworthy because the server verifies the shared pack_pulls row belongs to the sender; dm_messages now references pack_pulls, so deletion flows must delete DMs BEFORE pack pulls.
- DMs are open to any username (not friends-only, per user request); friends are a lightweight status shown in Inbox. Muted players can't send; banned/bot targets are hidden.

**UI hidden again (Aug 2, 2026):** User toggled Friends/DM/Inbox UI back off after briefly restoring it — sidebar Inbox link, /inbox route, stats Friends card, and pack-reveal Share flow removed; backend routes and `pages/inbox.tsx` remain for future re-enable. Generated ApiError exposes server messages at `err.data.message` (not `err.response.data`).

**UI re-enabled + direct gifting (Aug 4, 2026):** Friends tab is back (dedicated /friends page, sidebar Heart icon), NOT the old inbox page. New `POST /gifts/send` transfers tokens+blooks directly (no claim/escrow) — one transaction, conditional token deduct, FOR UPDATE blook rows, muted senders blocked, banned/bot recipients hidden, Collector badges re-synced for both after blook gifts. Shared PlayerProfileDialog component (Trade/Gift split + Add Friend) replaced the duplicated dialogs in stats.tsx and chat.tsx — edit the component, not the pages.
