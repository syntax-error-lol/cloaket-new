---
name: Game content resets
description: How pack/blook catalog rewrites are done and what prod cleanup they require after publish.
---

**Rule:** When blooks are removed from blacketData, prod DB rows referencing them must be cleaned after the next publish: `DELETE FROM owned_blooks / unlocks / bazaar_listings WHERE blook_name NOT IN (<kept list>)`, and reset `players.avatar_blook` if it references a removed blook. Dev is cleaned at edit time; prod lags until publish.

**Why:** Catalog was fully replaced (July 2026) with 5 generated packs — Ice, Spooky, Monsters, Earth, Fire (10 blooks each: 4 Uncommon / 2 Rare / 1 Epic / 1 Legendary / 1 Chroma / 1 Mythical; chances 19.5/10/3.7/0.3/0.02/0.005, prices 5/20/75/200/300/1000, pack price 25). All old Blooket-derived packs removed. Orphaned owned rows render nowhere and confuse users.

**How to apply:** Kept blook names = union of PACKS[].blooks in blacketData.ts. Art style prompt: "cute flat 2D vector cartoon, rounded-square blocky body, big oval eyes, flat solid colors, one darker flat shade, no gradients/outlines/text" + removeBackground, trim, 288x288 webp. Pack covers: vertical booster-pack style, 320x420 webp.

**Renaming a blook:** Names are durable player-facing IDs, not presentation labels. Use a one-time, flag-gated boot migration to preserve and merge the old name across owned inventory, unlocks, listings, pulls, clan holds, workers, avatars, and completed-trade JSON before shipping the catalog rename.

**Adding packs (Aug 2026, Fast Food):** blook names are global keys — check for collisions before writing images/entries ("Cheese" existed in Lunch, new one became "Cheese Wedge"; a collision nearly overwrote the old blook's webp). Per-pack chances must still sum to exactly 100; insert new packs before Miscellaneous.

**Adding packs, current pattern (Aug 2026, Bug/Tech):** define new packs+blooks in `catalogExtensions.ts` (typed consts spliced into CATALOG_PACKS/CATALOG_BLOOKS) — never splice the single-line blacketData arrays for additions. All consumers (craft pools, store bundle Mystical pool, Discord, stats denominators, Collector threshold) derive automatically from CATALOG_*; a new Mystical with chance>0 auto-joins the store bundle pool, and the boot Collector sweep re-syncs badges when the threshold grows. Market shows packs in CATALOG_PACKS order; the limited "Top" gamble pack stays pinned first — insert featured packs right after it.

**Editing blacketData:** never use naive indexOf/regex splicing on the single-line arrays — it corrupts the file. Use anchor `BLOOKS: BlookDefData[] =` / `PACKS: PackDefData[] =` plus bracket-depth matching to find the array bounds.

## Blook art style (current, July 2026)
All blook images use the "block-first" style prompt: ONE large rounded-square block filling the frame, face drawn directly on the block, only tiny features (ears, horns, hats, antennae) sticking slightly past the edges, body IS the block, flat solid colors + one darker flat shade, no gradients/outlines/text. Same prompt lives server-side in the public blook-generator route — keep the two in sync if the style changes again. Pipeline: generateImage + removeBackground, then magick -trim -resize 256x256 -extent 288x288 to webp; bump ?v=N on every changed image URL in blacketData.

## Catalog v3 (July 2026): real Blooket art
Catalog replaced with 12 packs / 120 blooks scraped from https://blooket.github.io/blooks/list (SVGs from res.cloudinary.com/blooket, converted via magick -density 150 to 288x288 webp, ?v=5). Pack covers reuse existing blacket pack webps (5 all-Common animal packs mapped to Ice/Earth/Autumn/OG/Safari covers, price 10). Rarity is now named "Mystical" everywhere (renamed from "Mythical" July 2026, color #843af2; rarity names are data-only — nothing rarity-named is stored in the DB, so renames need no migration); per-pack chances normalized to sum exactly 100 because rollPack uses raw weighted totals — keep that invariant on any future catalog edit. Blook-generator style prompt is now decorative-only (game art is no longer AI-generated).

## Catalog v4 (July 2026): official market packs + real drop rates
Now 12 official Blooket market packs / 124 blooks. Data source: blooks.json from UndercoverGoose/blooket-src (has per-blook chance, sellValue, rarity, box id) — packs come from its `packs` map; blooks with no `chance` (event blooks like Party Pig) are excluded. Prices = sellValue; per-pack chances normalized to exactly 100. SVGs downloaded from undercovergoose.github.io/blooket-src/blooks/{box}/{id}.svg with res.cloudinary.com/blooket/image/upload/Blooks/{id}.svg as fallback for newer blooks. Image URLs at ?v=6. Blooket's S3 bucket 403s — don't use it.

**Badge catalog reset (July 2026)**: BADGES redefined as Owner/Mod/OG/Artist/Verified (images in api-server public/content/badges, ?v=2 cache-bust). After publish, prod needs `update players set badges='[]'::jsonb` — dev was cleared but prod player badge arrays persist and unknown names are silently dropped by badgeViews, so stale names linger invisibly in the column.

**User decision (July 29, 2026): do NOT reset prod badge data.** Existing player badge grants stay as-is after the badge catalog rewrite. Names that match the new catalog (OG, Verified) keep showing with new art; unknown old names are silently hidden by badgeViews anyway. Do not propose or run a prod badges wipe.

## Collector badge sync
- Collector badge (90% of catalog) is awarded AND revoked by a single shared sync that runs as one atomic UPDATE (count subquery inside CASE) — never split count-then-write, it races under concurrent inventory ops.
- Counts must filter quantity > 0 AND blook_name in current catalog, or orphaned rows from catalog rewrites wrongly qualify players; catalog cleanup must resync affected players.
- Drizzle `= ANY(${jsArray})` renders a tuple, not an array — use `IN (${sql.join(names.map(n=>sql`${n}`), sql`, `)})` instead.
- Boot-time sweep reconciles award+revoke on every server start (covers publishes).
