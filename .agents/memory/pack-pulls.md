---
name: Pack pulls live feed
description: Mod-panel live feed of every pack open; retention and FK rules.
---

Every pack open inserts a `pack_pulls` row inside the pack-open transaction; rows are never deleted (permanent moderation log). Mod panel "Pulls" tab polls it (newest 200).

**Why:** mods wanted a permanent live log of who pulled what from which pack.

**How to apply:** blook rarity/image resolve at read time from the catalog (missing blooks render "Unknown"). `pack_pulls.player_id` has an FK to players — any player-deletion flow (admin delete-players, AI-scan deletion, future ones) must delete the player's pulls first. Prod schema comes from Replit's Publish diff — do not hand-run DDL against prod.
