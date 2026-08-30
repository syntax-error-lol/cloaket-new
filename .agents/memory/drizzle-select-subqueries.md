---
name: Drizzle select subqueries
description: Raw-SQL scalar-subquery fields inside multi-column db.select() silently return undefined in the api-server; use db.execute with explicit aliases instead.
---

# Drizzle scalar subqueries in multi-column selects

**The rule:** In the api-server (esbuild-bundled drizzle + node-postgres), a raw ``sql`(select ...)` `` scalar-subquery field inside a **multi-column** `db.select({...})` silently maps to `undefined` in the returned rows — while `orderBy` on the very same fragment works correctly. Zod response schemas can mask this as `0`, so the API returns 200 with wrong values instead of erroring.

**Why:** Discovered Aug 2026 adding minePerHour to /leaderboard: the sort order was right but every selected subquery value came back 0 — and the pre-existing `uniqueBlooks` count subquery in the same select had been silently 0 the whole time (invisible because the UI never rendered it). Single-fragment selects (e.g. one SUM from one table) map fine; the failure shows up when raw fragments sit alongside many regular columns.

**How to apply:**
- Need computed/subquery columns alongside regular columns? Write the whole query as `db.execute(sql`...`)` with explicit `as snake_case` aliases and map rows manually (see /leaderboard in routes/social.ts for the pattern; declare a local row type, cast `result.rows`).
- Verify any endpoint that adds a computed column by curling it and comparing against a hand-run SQL query — "typechecks + 200" proves nothing here.
- Audit hint: any OTHER multi-column `db.select` with embedded ``sql`(select ...)` `` fields is suspect until its output is verified.

## Array parameters in sql`` templates
**The rule:** Interpolating a JS array into a drizzle ``sql`` `` template — e.g. ``ANY(${ids}::int[])`` — expands it into a parenthesized param tuple `($1,$2,…)`, and Postgres fails with "cannot cast type record to integer[]". Pass a Postgres array literal string instead: `const lit = "{" + ids.join(",") + "}"` then ``ANY(${lit}::int[])``.
**Why:** Hit in the Aug 2026 hack-repair boot sweep; the whole repair transaction rolled back cleanly (flag INSERT was inside the tx) and retried next boot after the fix — which validated the all-or-nothing design.
**How to apply:** Any `= ANY(${jsArray})` in db.execute/tx.execute needs the literal-string form (safe for numeric ids; quote/escape anything else), or unnest a single string param.
