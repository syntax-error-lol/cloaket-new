---
name: Auth session resilience & proxy hops
description: Why transient getMe failures must not log players out, and how trust proxy hop count affects req.ip in prod vs dev.
---

**Transient errors are not logouts**
- Frontend route guards (ProtectedRoutes/PublicOnlyRoute) must treat ONLY ApiError status 401 as "signed out"; network/5xx failures retry (up to 3, backoff) and then show a reconnect screen. **Why:** with `retry: false` and `isError → redirect to sign-up`, every network blip or autoscale restart "logged users out" (user-reported bug: kept auto-logging out, couldn't send messages).
- **How to apply:** any new route guard or auth-dependent redirect must inspect the error status, never bare `isError`.

**Trust proxy hop count**
- Production (autoscale) has TWO X-Forwarded-For hops; dev has one. With `trust proxy = 1`, prod req.ip was the Google LB's 34.x address for every player — rate limits would collapse everyone onto shared LB IPs (IP bans were removed entirely in July 2026 after repeatedly hitting shared IPs). Server uses NODE_ENV-based default (prod 2, dev 1), overridable via `TRUST_PROXY_HOPS` env var.
- **Why:** verified empirically — prod `players.last_ip` was full of 34.x/35.x GCP addresses shared by up to 10 players each.
- **How to apply:** after any infra/ingress change or if last_ip looks like datacenter IPs again, re-verify the hop count; wrong-in-either-direction is bad (too few = shared LB IP, too many = client-spoofable XFF).

## Login lockout & session versioning (Aug 2026)
- Per-account lockout is DB-backed (players.failed_logins / last_failed_login_at / lockout_until): 5 fails in 15 min → 15-min lock (429 with generic message). In-memory IP limiters reset on restart/autoscale — the DB counter is the real guard.
- **Every** password-checking entry point must share the same lockout helpers (web login AND the Discord bot login modal). A second door that skips recordFailedLogin defeats the lockout entirely — review catch.
- Session cookies embed a session version (payload `id.ts.version`, HMAC base64url). requirePlayer 401s + clears cookie on version mismatch; legacy 2-part cookies count as version 1 so existing sessions survived the rollout.
- **Why:** any path that sets password_hash (change-password, owner-unlock claim, admin reset) must bump session_version in the same UPDATE, or cookies stolen before the reset keep working — the exact hijack being fixed. Admin reset originally forgot the bump AND issued 4-digit temp passwords; both were review catches.
- Owner unlock honored only 60 min, and the expiry must live in the conditional-claim UPDATE predicate too (not just the pre-read check) or a race claims just past the deadline.
- New-password policy (min 8 + small common-password blocklist, passwordPolicy.ts) gates register / change-password / unlock-claim / admin reset; login stays permissive so legacy 6-char accounts still sign in.
- Cookie hygiene: 30-day maxAge; valid-signature cookies with future timestamps (>5 min skew) rejected.
- Staff panels get an in-memory per-IP guard counting only 401s (10 in 10 min → 15-min 429). Don't count 403s — those are kill-switch/approval denials hitting legit staff.
- Username change over PATCH /me requires currentPassword — a stolen session alone must not rebrand an account.

## Aug 2026 hack response — global logout + restore ordering
- One-time flag-gated startup sweep (`global_logout_2026_08_28` in app_settings) bumps every player's session_version by 1, killing all pre-existing cookies (stolen ones included). If a DB restore wipes the flag, the sweep intentionally re-runs — desired post-restore.
- **Prod point-in-time restore must happen BEFORE publish** when unpublished schema adds columns: restore rewinds the schema, so already-published new code would 500 on missing columns. Recovery if done backwards: publish again (re-applies the diff).
- Real-money purchases lost to a restore self-heal: startup Stripe sync repopulates stripe.* from the Stripe API and fulfillUnclaimedPurchases re-grants paid-but-unclaimed bundles.
- Forward-restore repair (recovering days a rewind erased WITHOUT re-importing the hack): capture auth + floor columns (password_hash, panel_access, ban/mute, session_version, tokens, XP) from the clean timeline via read-only prod SQL → private object storage; restore prod to just BEFORE the bad rewind; publish code whose boot sweep detects the hacked timeline (pack_pulls present in a range verified EMPTY on the clean timeline), then in ONE transaction: re-apply captured auth on top (+bump session_version, conflict-guarded username restore), ban + claw accounts with inhuman window pull counts (inventory/XP/packs_opened derived from pack_pulls × rarityExp), floor everyone's tokens/XP at captured values, INSERT the flag last. Publish-before-restore stays safe — the sweep arms and waits; capture upload must be the REAL one before handoff (dev tests overwrite the same object path).
