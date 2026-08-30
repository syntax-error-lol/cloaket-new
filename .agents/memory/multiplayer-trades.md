---
name: multiplayer trades & Clerk auth
description: Durable lessons from converting the Blacket game to multiplayer with Clerk auth and two-sided trades.
---

- Trades table is viewer-relative: `playerId`=side A owns the `my*` columns, `partnerId`=side B owns `partner*`. Every read/write must swap via the viewer (see `isSideA`/`tradeView` in trades routes). **Why:** originally single-player vs bot; conversion kept the schema. **How to apply:** any new trade feature must resolve the viewer's side first; never assume the caller is `playerId`.
- Bot behavior (`botTick`, `botSay`) must be gated on the partner actually being a bot, or human-vs-human trades get spoofed chat messages / bot logic.
- Terminal trade state: GET /trades/current serves a just-ended (completed/declined) trade for ~45s via `trades.ended_at` instead of 404, so the *non-acting* side's poller can render the completion screen. Don't remove that window.
- All state-transition endpoints (trade-request accept, daily spin) use conditional UPDATE ... WHERE status/cooldown predicates to be race-safe; keep that pattern for new transitions.
- Frontend trade token offer commits on blur/Enter only — e2e tests must blur/press Enter or the PUT never fires.
- Drizzle push can't run non-interactively on populated tables; apply DDL via executeSql and mirror it in the schema files.

## Cookie auth & supersede rework (July 2026)
- Auth is now plain username/password: scrypt hashes, HMAC(SESSION_SECRET)-signed httpOnly cookie `blk_session`; `secure` gated on NODE_ENV=production because dev preview terminates TLS at the proxy. Clerk fully removed (stale deps may remain in manifests).
- **Why:** user asked to drop Clerk; cookie must stay non-secure in dev or the proxied preview loses the session.
- Trade supersede rule: accepting a request (or requesting a bot) runs one transaction that ends BOTH parties' active trades, declines all their other pending requests, then starts the new trade. Keep it atomic — separate updates let concurrent accepts create two active trades.
- Frontend guard gotcha: react-query keeps stale `data` after failed refetch — route guards must check `isError` too, and logout must `queryClient.clear()`, or PublicOnly/Protected redirects ping-pong ("Maximum update depth exceeded").
- Ended-trade 45s resurface window: trade page persists dismissed trade id in sessionStorage and ignores terminal trades with id <= dismissed.
- Bot requests return status "accepted" in the response — frontend uses that to navigate straight to /trade.
- Game data regenerated from https://blacket.org/data/index.json (44 packs, 600 blooks, BADGES export in blacketData.ts; minified lines — inspect with node, not ReadFile).
- Admin panel: /admin (frontend, outside auth guards) + password-gated POST /admin/* API (mounted before requirePlayer), checks body password against ADMIN_PASSWORD env (secret), timing-safe, per-IP rate limited. Grants badges/blooks.
- Mod panel: /mod (public frontend route) + password-gated POST /mod/* checked against MOD_PASSWORD secret (separate from admin so mods lack admin power). Bans: players.banned boolean; enforced in requirePlayer (clears cookie) and login (403); banning declines the player's active trades in one transaction. Verified = the "Verified" badge in badges jsonb. Prod schema changes ship automatically via Replit's Publish flow — never hand-migrate prod.
- Blooks from removed packs keep pack:null — bazaar/pack fields must stay nullable in the spec or response parsing breaks after state mutation.
- Rebranded to "Cloaket" (July 2026): C logo in src/assets + public/logo.svg, rainbow animated wordmark kept. Name effects: players.name_effect ("rainbow"|null), nameEffect surfaced on every username-bearing response (chat, leaderboard, profiles, trade messages, bazaar sellerNameEffect); admin /admin/set-name-effect grants it. Trade chat reuses the ChatMessage schema — any new required ChatMessage field MUST also be added to the trade-message payloads in trades.ts or those routes 500 on zod parse.
