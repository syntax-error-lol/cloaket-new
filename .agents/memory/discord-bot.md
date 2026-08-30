---
name: Discord bot bridge
description: How the Cloaket Discord bot (chat bridge + /open) is wired and its safety rules
---

- Bot runs inside the api-server process; `startDiscordBot()` in `src/discord/bot.ts`, no-op without `DISCORD_BOT_TOKEN` secret.
- Chat bridge: 3s poll of chat_messages → Discord webhook impersonation (username+avatar) in a channel named `cloaket-chat`; Discord→game inserts as the linked player. Echo prevention via in-memory set of Discord-origin message ids.
- **Why safety rules exist:** review found the bridge could bind to an attacker's server and the login modal allowed unthrottled scrypt guessing.
- **How to apply:** if the bot joins >1 server, bridging is disabled until `DISCORD_CHANNEL_ID` env is set; /login modal rate-limited 5 tries/15min per Discord user; ready-handler wrapped so bot failures never crash the HTTP server; bridge cursor only advances after successful webhook delivery (3 retries).
- Account links live in `discord_links` (dev via manual DDL, prod via Publish diff). Pack opens reuse the shared race-safe `openPackForPlayer()` in `lib/openPack.ts` (also used by the web route — keep them in sync by editing only this function).
- Blook/pack images in Discord embeds use absolute URLs built from `REPLIT_DOMAINS` — works in dev (.replit.dev) and prod (cloaket.com).

## Clan chat & trades (added Aug 2026)
- Clan chat bridges to `#cloaket-clan-chat` via one PRIVATE thread per clan. Auth must bind to the bot's clanId→thread map (bot-created threads only, checked via ownerId) — thread names are user-editable and must never be trusted.
- Trade logic shared between web routes and bot lives in one actions module; all state changes are conditional UPDATEs on `status='active'` (+ expected accept flag for toggles) so racing Discord buttons/web clicks can't edit ended trades.
- All `/trade` replies are ephemeral; the target gets a DM, never a public channel ping.
- Cloaket @mentions become real Discord pings only for linked players, via explicit `allowedMentions.users` — never `parse`.
- Slash commands are blocked inside bridge channels/threads (chat-only).
- Sidebar Discord badge invite URL is a constant in the frontend `discord-link` component.

## Dev/prod double-bot (fixed Aug 2026)
- The bot now only starts when `REPLIT_DEPLOYMENT` is set. Before, the dev workspace ran a second instance on the same token; it raced the prod bot for interactions, so /login randomly hit the dev DB → "wrong password" / "use /login" for real players. Never remove this guard; test bot changes by publishing.

## Duplicate-message fix (Aug 2026, two layers)
- Layer 1 (game→Discord): cursors live in app_settings (`discord_chat_cursor`, `discord_clan_cursor`); each poll atomically claims its batch via conditional UPDATE (key AND value=old) — losers skip. Delivery is at-most-once by design (drop beats double-post).
- Discord-origin messages carry `from_discord` boolean on chat_messages/clan_messages (prod gets columns via Publish diff) so echo suppression works cross-instance; the in-memory Sets are just a fast path.
- Layer 2 (Discord→game): cursors were NOT enough. Autoscale runs N instances; each logged in its own gateway session on the same token, and Discord delivers every event to EVERY session → N chat-row inserts per Discord message, N warning replies, N× token rewards. Diagnosis: exact-N duplicate rows with millisecond spread in chat_messages (vs. minutes-apart dups = users repeating themselves); interleaved pino req.id counters in deploy logs prove N instances.
- Fix: single-leader election. app_settings lease `discord_bot_leader` = `"<expiresAtMs>:<instanceId>"`, claimed/renewed every 15s (TTL 45s) by conditional UPDATE. Expiry is written AND compared in DB time (`extract(epoch from now())*1000`) so instance clock skew can't matter, and parsed via CASE (Postgres does not short-circuit OR) with `^[0-9]{1,15}:` bounding the `::bigint` cast. Only the leader runs `launchBot()`; losing the lease calls `stop()` (clears tracked poll timers, sets `stopped` flag checked at poller entry and after ClientReady awaits, destroys client). Renewal errors fail closed on a monotonic elapsed timer (stop before the lease could expire for others).
- Handoff safety reasoning (don't "fix" this): Discord never redelivers gateway events to a later session, so an in-flight handler finishing its insert at handoff can't be duplicated by the new leader; claimed webhook batches should finish sending — cursor fencing owns them, and drop-guards there would lose messages.
- SIGTERM/SIGINT handlers (prod path only) stop the bot + release the lease (3s bound) then MUST `process.exit(0)` — registering any signal handler disables Node's default exit behavior.
