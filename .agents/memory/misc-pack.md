---
name: Miscellaneous hidden pack
description: Special grant-only blooks (e.g. 1k) — every place the misc pack must be excluded
---

# Miscellaneous hidden pack

- The "Miscellaneous" pack holds grant-only special blooks (chance 0, never pullable). `MISC_PACK` / `MAIN_BLOOK_COUNT` / `COLLECTOR_THRESHOLD` live in api-server lib/game.
- **Rule:** any new blook-catalog consumer must decide misc handling explicitly. Current exclusions: pack roll (chance>0), craft outcome catalog, store bundle mystical pool, market page, Discord /packs + /open + autocomplete, stats totals/rarity denominators, boot Collector backfill (must use shared COLLECTOR_THRESHOLD, not BLOOKS.length), clan holds (`isClanHoldBanned` — placement 400s, clanEffect null, picker hides). Misc blooks stay SELLABLE (they have prices).
- **Why:** misc blooks must never leak into random reward pools or count toward /165-style denominators; review round caught the starter-bundle pool and a boot-vs-runtime Collector threshold mismatch that would flap the badge on restarts.
- Numerators intentionally INCLUDE owned misc blooks (166/165 overshoot is a feature). My Blooks page shows misc blooks only when owned — never as locked tiles; the section hides when empty.
- Shine-sweep animation recipe: composite a rotated white-bar stripe (alpha ~0.45) over the trimmed art with `-compose Atop` per frame, sweep offset across ~10 of 16 frames, delay 7cs; bake .webp + .gif twin into public/content/blooks.
