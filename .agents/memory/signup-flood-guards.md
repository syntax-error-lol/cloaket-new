---
name: Signup flood guards
description: Why registration abuse limits must be DB-backed, and how to test auth routes while the maintenance gate is on
---

**Rule:** Abuse limits that matter (registration caps, breakers) must live in the DATABASE, not in-memory middleware.

**Why:** The Aug 2026 wave-3/4 attack created ~121k bot accounts straight through an in-memory per-IP limiter — every autoscale instance starts with fresh buckets (N instances × limit, reset on every restart/scale event), and the botter rotated IPs. In-memory limits are a speed bump for single-instance dev, not a defense.

**How to apply:** Registration now has two DB-backed guards in the register route (constants at the top of the auth routes file): a global breaker (too many signups game-wide in 10 min pauses signups for everyone) and a per-IP hourly cap (checked inside the register transaction while holding the per-IP advisory lock, race-safe because the insert records last_ip at signup). Raise the constants temporarily for planned signup events (e.g. a whole class joining). A patient bot under the global threshold still accumulates accounts — CAPTCHA is the next escalation if needed.

**Testing auth routes with the maintenance gate on:** don't flip the gate flag to test — mount the auth router alone on a throwaway port (see scripts/register-guard-test.ts). Quirks: bundle the harness FULLY with esbuild (no --packages=external — pnpm isolation hides transitive deps like pg/zod from the api-server's node_modules; add a createRequire banner for CJS deps); stub req.log (pino-http lives in app.ts, not the harness); spoof IPs via X-Forwarded-For with trust proxy true in the harness only; escape underscores in SQL LIKE cleanup patterns ('RGT#_%' ESCAPE '#').

**CORS:** the game never needs cross-origin browser access (client and API share an origin via path routing; cloaket.com fronts prod). CORS is an allowlist (REPLIT_DOMAINS + dev domain + cloaket.com); `origin: true` + credentials reflected any website and is never acceptable.
