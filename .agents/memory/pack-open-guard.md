---
name: Pack-open auto-opener guard
description: In-memory anti-bot guard on the web pack-open route; limits, strikes, and known limitations.
---

Players ran browser-console auto-openers (shadow-DOM panel, 4–16 parallel `fetch` workers against `/api/packs/:name/open`, backing off 600ms on 429).

Guard (in `packOpenGuard.ts`, wired only into the web packs route — Discord bot path intentionally bypasses it):
- One open in flight per player; a concurrent request is an instant violation (impossible from the real UI — button disabled while pending).
- Sliding window 60 opens/60s (reveal animation is click-skippable, so a fast human can approach ~60/min — don't lower this).
- 5 violations in 10 min → 15-min pack-opening timeout ("Auto-openers aren't allowed…"). Violations return 429 with kid-friendly messages; route logs a warn with reason.

**Why:** server-side is the only reliable place — client checks are trivially bypassed by console scripts.

**How to apply:** any new pack-open entry point (routes) should call checkPackOpen/releasePackOpen (try/finally). Known limitations (accepted): state is per-process (multi-instance prod or restart resets it); failed opens (no tokens) still consume rate budget; eviction never removes active blocks or in-flight entries.
