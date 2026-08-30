---
name: Base progression
description: Transaction and accrual rules for permanent Base workers and token production.
---

Base production uses a server-owned integer token balance, a timestamp, and a microtoken carry. When workers are permanently assigned (the assign endpoint takes a batch of names), settle the existing time at the *old* worker rate ONCE for the whole batch before any insert, then start the new rate from that moment. Copies the player no longer owns are skipped (reported as skippedCount), never a whole-batch failure — mirrors clan placement semantics; the free-slot cap check is all-or-nothing up front.

**Why:** Applying the new worker's rate retroactively over elapsed time overpays tokens; resetting the timestamp before a failed inventory decrement can silently discard fractional production. Keeping the fractional carry prevents frequent claims from permanently underpaying players.

**How to apply:** Keep worker assignment, inventory consumption, production settlement, and Base clock updates in one transaction behind a player lock. Claims must also lock the player/Base and clear only whole settled tokens while retaining the microtoken carry.

Rate multipliers from clan effects must be time-weighted, never applied to the whole lazy interval. Price `[lastAccruedAt, boostStart)` at the plain worker rate and only `[boostStart, now]` at the boosted rate, where `boostStart = max(member joinedAt, effect blook placedAt)`. If the effect is inactive at settlement, the whole interval is plain (use-it-or-lose-it).

**Why:** Lazy accrual plus a current-state multiplier reprices history — a player could accrue for weeks, join a clan holding the boost blook, and claim the boosted rate retroactively (unbounded token inflation, flagged in review).

Worker roster is capped (MAX_BASE_WORKERS = 15) — enforce in the assign transaction, not just the UI, and surface the cap in the status payload so the client renders x/cap.

Dismissal follows the same settle-first discipline as assignment: lock the player, settle at the *old* weighted rate, then conditionally delete the worker row (id + playerId with `.returning()` — zero rows means someone else already dismissed it, so bail without paying), then refund. Refund is the plain catalog price credited to both `tokens` and `tokensEarned`; the blook is not returned (it was consumed at assignment) and the refund deliberately ignores sell multipliers so the number shown in the confirm dialog is exactly the number paid.

Worker rates are persisted per row at assignment time, so a rarity-rate rebalance does NOT reach existing workers — it needs a boot sweep that, per player, locks, settles at the OLD stored rates first, then rewrites the rows.

**Why:** Updating rows without settling reprices the player's entire unclaimed interval at the new rate (retroactive nerf/buff); a single throwing player transaction aborting the loop strands everyone after them on old rates until some future restart.

**How to apply:** Settle using the same *filtered* total the live status/claim paths accrue at (catalog-removed blooks are excluded from production everywhere, so exclude them from the old-rate sum too). Wrap each player in try/catch and continue; the next boot retries whoever is still stale. The rarity→rate table is duplicated in the web client for the assign-picker labels — change both together.

Base page visuals: the animated cavern/miner-sprite scene was explicitly reverted by the user (Aug 2026) in favor of a static, rarity-colored crew-card roster — keep the mine theme but don't reintroduce ambient animations there.

Base has NO pack-luck perk (removed Aug 2026): Uncommon miners are rate-only and `BaseStatus` has no `packLuckBonus` field. The +0.001x luck lives on clan-held Uncommons instead (flat, non-stacking) — see clan-held-effects.md. Don't reintroduce per-miner luck or "+.001x luck" UI tags on the Base page.

Mine rates and clan-held rates are DIFFERENT systems the user tunes independently: mine Mystical 250/hr, Chroma 20/hr; clan-held dupe Mystical 75/hr, Chroma 10/hr. Don't "sync" them.

Hold-banned packs (Miscellaneous trophies + the 1k gamble blook, via the shared isClanHoldBanned helper) are also banned from the mine: assignment rejects them, the picker hides them (`pack` is on /me/blooks), and baseWorkerRate returns null so the boot sweep never reprices legacy banned rows — they keep their stored rate until the user decides their fate.