# Blacket

A Blacket-style blook-collecting game: open packs with tokens, collect 600 blooks across 29 packs, trade on a bazaar, chat, and climb the leaderboard.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Render single-service deployment

The API service can serve the built Blacket frontend, so Render only needs one Web Service:

- Build command: `pnpm install --frozen-lockfile && pnpm --filter @workspace/db run push && PORT=18170 BASE_PATH=/ pnpm --filter @workspace/blacket-game run build && pnpm --filter @workspace/api-server run build`
- Run command: `pnpm --filter @workspace/api-server run start`
- Health check path: `/api/healthz`
- Required environment: `DATABASE_URL`, `SESSION_SECRET`, `AI_INTEGRATIONS_OPENAI_BASE_URL`, and `AI_INTEGRATIONS_OPENAI_API_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Frontend: `artifacts/blacket-game/src/pages/` (home, market, blooks, bazaar, chat, leaderboard, stats)
- API routes: `artifacts/api-server/src/routes/` (player, blooks, packs, bazaar, chat, social)
- Game data (blooks/packs/rarities, from blacket.org public data): `artifacts/api-server/src/data/blacketData.ts`
- Game logic (pack rolls, leveling, claim timer): `artifacts/api-server/src/lib/game.ts`
- DB schema: `lib/db/src/schema/` (players, ownedBlooks, bazaarListings, chatMessages, unlocks)
- API contract: `lib/api-spec/openapi.yaml`

## Architecture decisions

- Single implicit player ("Player") — no auth; seeded bot players fill the bazaar, chat, and leaderboard.
- Blook/pack images are hotlinked .webp URLs from blacket.org (per user request), not stored locally.
- Blook/pack/rarity definitions are static in-code data, not DB tables; only ownership, listings, chat, and unlocks live in Postgres.
- Pack opening is a weighted random roll on each blook's `chance`; XP per pull comes from rarity `exp`; level = floor(sqrt(exp/100)) + 1.
- Token claim: 500 tokens per hour; listing a blook on the bazaar removes one copy from inventory until sold or cancelled.

## Product

Dashboard with timed token claim, pack market with animated opening, collection view with selling and avatar selection, player bazaar (buy/list/cancel), polling community chat, leaderboard, and collection stats.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
