---
name: Stripe store integration
description: How the paid starter-bundle store works — connection key quirk, sync backfill gotcha, fulfillment invariants.
---

- Replit Stripe connection API returns the key under `settings.secret` (not `secret_key`); client code reads `secret_key ?? secret`.
- `stripe-replit-sync` `runMigrations` accepts only `{ databaseUrl }` (no `schema` option); it creates the `stripe.*` schema. A bare `syncBackfill()` at boot may report "synced" without populating `stripe.products`/`prices` — run `syncBackfill({ object: 'product' })` and `({ object: 'price' })` explicitly (done once; webhooks keep it fresh afterwards).
- Fulfillment invariants (`/store/claim`): verify session `payment_status === 'paid'`, `metadata.playerId` match, `metadata.productKey === 'starter_bundle'`, and amount/currency vs synced price. Idempotency: unique `stripe_session_id` insert inside the grant transaction; one-per-player via unique `(player_id, product_key)` (manual DDL applied in dev — publish diffs to prod).
- **Why:** review found any paid session could be claimed and repeat purchases could stack rewards; the metadata/amount checks + unique constraints close both.
- Prices live in the synced `stripe.products`/`stripe.prices` tables, looked up by `metadata->>'cloaket_key'` — never hardcode price IDs.
- Real payments require entering Stripe live keys in the Publish pane; dev is test mode (card 4242 4242 4242 4242).

**Startup must not block on Stripe init.** Deploy health checks kill the app if `runMigrations`/webhook setup runs before `listen()` — in prod this hung silently and failed publishes in a restart loop. Listen first, then init Stripe in the background with logged errors. Also: prod hits the same bare-`syncBackfill()` gap — explicitly sync `{object:'product'}` and `{object:'price'}` at startup or the store offer stays unavailable after every publish.

## Prod resilience (July 2026)
- Production DB can have an EMPTY stripe schema (sync never ran / failed at startup). Store routes must degrade gracefully: offer returns available:false instead of 500; claim falls back to Stripe API product search for amount validation.
- **Debug trick:** prod API auth is an HMAC cookie (`blk_session`) signed with SESSION_SECRET — mint one in node for a real player id (from prod read-replica) to curl authenticated prod endpoints directly.
- **Bundling gotcha:** api-server prod build (esbuild single-file) breaks stripe-replit-sync `runMigrations` — it resolves `./migrations` relative to module __dirname and silently SKIPS when missing ("directory not found"), leaving an empty stripe schema in prod. Build script must copy the package's dist/migrations into dist/migrations.

**Free bundle + purchase stats (July 2026)**
- Allowlisted usernames (FREE_BUNDLE_USERNAMES in routes/store.ts) claim the bundle free & unlimited via POST /store/free-claim; rows use stripe_session_id prefix `free_...` and are EXCLUDED from admin purchase stats (`NOT LIKE 'free\_%'`). Real Stripe sessions start with cs_ so the filter is safe.
- Session cookie ts is Date.now() MILLIS, not seconds — minting with seconds fails HMAC-age check. /api/me (not /api/players/me) is the profile endpoint.

## Fulfillment safety net (July 2026)
- Redirect-back `/store/claim` is NOT the only fulfillment path: `fulfillUnclaimedPurchases()` scans synced `stripe.checkout_sessions` for paid starter sessions with no `store_purchases` row and grants them (same idempotency lock). Runs on `checkout.session.completed` webhook (instant), at startup, and every 10 min.
- **Why:** players who closed the tab or lost their login cookie across the Stripe redirect paid but never got the bundle; nothing retried.
- **How to apply:** any new paid product must be added to the sweep's metadata filter, not just its claim route.

## Bundle versioning (retro-grants)
- Bundle rewards are versioned: `players.bundle_version` + `BUNDLE_VERSION` const + `applyBundleUpgrades()` startup sweep grants existing owners the diff exactly once (single conditional UPDATE; claims stamp the current version via greatest()).
- **How to apply:** when bundle contents change, bump BUNDLE_VERSION, add a diff step to the sweep, and cap every increment with `least(...::bigint + n, 2147483647)::int` — one saturated row would otherwise abort the whole sweep.
- **Trap:** older sweep steps must SET their version as a literal (e.g. `bundle_version = 2`), never `${BUNDLE_VERSION}` — otherwise after a bump, a v1 owner jumps straight to the latest version and silently skips the newer diffs. Steps run oldest-first; only the final step stamps BUNDLE_VERSION.

## Bundle color perks (Aug 2026)
- Custom chat color (`players.chat_color`, dev column added by manual DDL) and custom name color are Starter Bundle perks, gated server-side on `bundleVersion > 0` in PATCH /me.
- Custom name colors reuse the `name_effect` column: values are 'rainbow' | 'golden' | '#rrggbb'. PATCH /me only accepts hex or 'golden' — never let clients set 'rainbow'.
- Frontend renders hex effects via `nameEffectStyle()` alongside `nameEffectClass()`; any new place that shows a player name/chat message must apply both, and any new chat surface must select+return `chatColor`.

## Given-bundles tracking (Aug 2026)
- `store_purchases.granted_by` (nullable text) records the logged-in username that pressed Grant Bundle (via sessionPlayerId — admin routes are mounted before requirePlayer so read the session manually). Null for grants made while not logged in / before this column. Prod gets the column via Publish schema diff.
- Session-id namespaces matter: `free_admin_` = admin grants, plain `free_` also used by /store/free-claim — grant lists must filter LIKE 'free\_admin\_%', paid lists NOT LIKE 'free\_%'.
- Owner panel: separate "Given Bundles" section (giver → recipient); admin-tools has a Load-on-demand list under the Grant Bundle button.
