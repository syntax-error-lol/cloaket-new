---
name: Presence tracking
description: How online-player tracking works and the prod DDL it requires
---
Online presence is inferred from `players.last_seen_at`, refreshed by the auth middleware at most once per minute per player, with the throttle enforced atomically in the UPDATE's WHERE clause (avoids write amplification under concurrent requests). Admin "online" = non-bot seen within 5 minutes.
**Why:** no websocket/heartbeat exists; piggybacking on authenticated requests is cheap and good enough.
**How to apply:** after each publish that includes this feature, prod DB needs `ALTER TABLE players ADD COLUMN IF NOT EXISTS last_seen_at timestamptz` (manual DDL policy — drizzle push is not used).
