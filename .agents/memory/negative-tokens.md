---
name: Negative token prevention
description: Why player tokens went negative and how deductions must be written
---
**Rule:** every token deduction must be a conditional UPDATE (`WHERE tokens >= amount`) inside the same transaction as its side effects, with the empty-`returning()` case handled as "not enough tokens".
**Why:** pack opens and bazaar buys used a pre-read balance check + unconditional decrement; spam-clicking raced past the check and drove prod players negative (worst −2,293). Fixed July 2026; a startup sweep in the API server resets `tokens < 0` to 0 (heals prod on publish).
**How to apply:** any new spend path (shops, fees, wagers) copies the craft.ts / packs.ts pattern. Trade completion is already safe via `FOR UPDATE` locks. A DB `CHECK (tokens >= 0)` was deliberately NOT added — adding it before prod data is healed would fail the publish migration; safe to add in a later publish after the sweep has run in prod.

## Dupe-glitch races (fixed Aug 2026)
- Same-account two-browser dupes came from read-then-write inventory code. Now race-safe: bazaar list (conditional `quantity >= 1` decrement in tx), bazaar cancel (claim `active=true` + item return in one tx), sell blooks (conditional decrement in tx).
- **Lock ordering rule:** any tx touching both players and owned_blooks must lock player row FIRST then owned-blook row (bazaar buy does player→owned); sell credits tokens first then decrements, throwing a sentinel to roll back if short.
- Verified via concurrent-request node scripts (Promise.all of 3-4 same-cookie requests; expect exactly one success).
