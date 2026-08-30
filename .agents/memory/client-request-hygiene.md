---
name: Request hygiene & chat speed
description: Scoped global mutation invalidation, self-polling query skip list, optimistic chat send, and the server-side shared chat-list cache — do not regress these.
---

# Client request hygiene & chat speed

## Scoped global invalidation (web app queryClient)
The queryClient MutationCache invalidates on-screen queries after every successful mutation, with two carve-outs:
- Mutations with `meta: { noGlobalInvalidate: true }` are skipped — they must do their own targeted cache updates (chat send/delete do `setQueryData` + invalidate only `/api/me`).
- Query key paths in the self-polling skip list (`/api/chat/messages`, `/api/online-count`, `/api/trades/`) are never invalidated globally — their own 2–4s polls pick up changes.

**Why:** the previous unconditional `invalidateQueries()` fired ~8 refetches per chat message / pack open (visible as request storms in prod logs) and made the whole game feel laggy.
**How to apply:** any new high-frequency mutation should set `meta.noGlobalInvalidate` and invalidate only what it touches. Any new polled query should be added to the skip list. Queries relying on mutation-triggered refresh must NOT be under a skip-list path prefix.

## Global staleTime 15s
Remounts within 15s serve cache instantly (page navigation feels instant). Mutations still force-refresh via invalidation; polls ignore staleTime.

## Optimistic chat send (chat page)
Pending messages live in component state OUTSIDE the react-query cache (negative ids, dimmed rows), so a poll landing mid-send can never wipe them. On success the server's full message view is appended to the cache deduped by id; on error the text is restored to the input.
**Why:** cache-injected optimistic rows get overwritten by concurrent polls — that flicker was the original "glitchy" complaint.

## Server-side shared chat-list cache (routes/chat.ts)
GET /chat/messages (no cursor) serves a 1s-TTL in-process cache of the shared view; `isMine` is mapped per request from the cached `playerId` (NEVER cache isMine). Single-flight rebuild; busted on player POST/DELETE; mod/admin/Discord-bridge writes rely on the ≤1s TTL. Per-process cache is fine on autoscale (bounded staleness).
**How to apply:** if the message view gains a per-viewer field, exclude it from the cached view and map it per request like isMine.
