---
name: 1k gamble pack (ex-"Top")
description: Limited gamble pack (renamed "Top"→"1k" Aug 2026) — tiny roll for the 1k blook, global supply of 100 ever; nullable open results; owner kill-switch + auto sell-out; legacy-name mapping rules.
---

- Renamed "Top" → "1k" (Aug 2026) WITHOUT re-release: TOP_PACK constant is now "1k"; catalog rename happens via a RENAMED_PACKS map in catalogExtensions (never edit generated blacketData). The app_settings keys `top_pack_remaining`, `top_pack_disabled`, `unpulled_1k_cleanup_done` are fixed strings — untouched by any rename.
- Historical DB rows (pack_pulls/unlocks pack_name='Top') are kept as-is; every response surface that returns stored pack names must map via displayPackName() (LEGACY_TOP_PACK in lib/game). Pull filters for the pack must match IN ('1k','Top'). Discord /open accepts typed "top" as a legacy alias. If another pack is ever renamed, extend displayPackName and audit the same surfaces (mod pulls feed, DM share/gift cards, profile recent unlocks).

- "Top" pack (100 tokens) is a gamble: openPackForPlayer special-cases it — charge + packsOpened always; a 0.2% roll wins the 1k blook (which stays pack:"Miscellaneous"); a miss returns blook:null/pullId:null with NO pull log, unlock, clan XP, or grant.
- Global limited supply: only 100 1k pulls EVER, tracked in app_settings `top_pack_remaining` (seeded 100 on demand). Hits must claim via a conditional decrement (value::int > 0) inside the open transaction, claimed BEFORE the charge and rolled back by throwing if the charge fails; claim failure downgrades the hit to a miss. When remaining hits 0 the pack auto-hides from market/Discord and opens are rejected — permanent sell-out.
- PackOpenResult.blook and pullId are nullable in the spec — every consumer of pack-open results (web reveal, Discord embed, share-pull) must handle the null case.
- Exclusions: blooks page and bazaar pack strip skip "Top" (its only blook lists under Miscellaneous, so sections/filters would be dead); 1k is uncraftable because craft outcomes already exclude Miscellaneous blooks.
- Owner kill-switch: app_settings key `top_pack_disabled` (stored inverse of the `topPackEnabled` API field), 10s cache, ORed with sold-out everywhere.
- Owner decision (Aug 2026): the ~100 1ks already in prod circulation ARE the whole supply — the one-time boot cleanup (flag `unpulled_1k_cleanup_done`) removes owner-granted 1ks (allowance = pulls + net completed-trade transfers + named bazaar-buyer exemptions) and sets `top_pack_remaining` to 0, so the pack launches sold out in prod; only dev has openable supply for testing. Bazaar sales have no history log — untraceable buys need explicit exemptions.
- **Why:** any pack whose reward belongs to Miscellaneous must be excluded everywhere Miscellaneous already is; global supply counters must be claimed transactionally with the charge or concurrent hits could overshoot the cap.
