---
name: Craft system
description: Deterministic blook crafting — combo-seeded outcomes, luck items, race-safe consumption
---

# Craft system

- Outcomes MUST be deterministic per combo (sorted names → FNV-1a seed → mulberry32) so preview always equals the craft's outcome set. Rolling the result is random; only the outcome pool + chances are seeded.
- **Why:** users see the 5 possible results before crafting; any preview/result mismatch reads as a scam.
- Rarity ceiling: combos with nothing Legendary/Chroma/Mystical in them (e.g. all epics) filter Mysticals out of the candidate catalog entirely — best possible outcome is a Chroma.
- Rarity upgrade caps: Mystical total hard-capped (7% normal, 12.5% with luck; friendlier 8.05%/14.4% when any input is Chroma); Chroma total capped only when no chroma input — 4.2%/7.5% if a legendary+ is in, else 3%/6%; excess redistributed to uncapped slots, capped rarities round DOWN.
- Rarity capping must still work when ALL outcomes are capped rarities (all Chroma/Mystical): relax the Chroma cap so excess flows onto chromas — never skip capping just because the "rest" pool is empty (that once let a Mystical show 24%).
- Value bands are relative to total input price; fallback for empty bands is capped at the band ceiling for the three losing/break-even slots so extreme combos can't become profitable.
- 2.5x luck item (`players.craft_luck_items`, dev DDL applied; prod via Publish diff) is ONLY granted by the starter bundle (all 3 grant paths: free claim, paid claim, admin grant). Boost multiplies the two best chances; the rest renormalize to 100.
- Consumption is race-safe: conditional `UPDATE ... WHERE quantity >= n` per input inside one tx, luck spend `WHERE craft_luck_items >= 1`; sync Collector badge after tx if any row emptied.
- Frontend preview responses must be generation-tagged (stale responses discarded, outcomes cleared on edit, Craft gated on a fresh preview) or a slow response shows wrong odds for the crafted combo.
