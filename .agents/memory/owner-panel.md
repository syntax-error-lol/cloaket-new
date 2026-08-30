---
name: Owner panel
description: OWNER_PASSWORD tier above admin/mod and app_settings kill-switch flags.
---

- Password tiers: owner > admin > mod. Owner password is accepted on all /admin endpoints; badges, clear-chat/clear-bazaar, and AI-scan full-account deletion are owner-only. Admin/mod Cloaket AI downgrades "delete" to "ban" (CloaketAiPanel `allowDelete` prop).
- Owner kill-switch: `app_settings` key-value table (manual DDL: `CREATE TABLE app_settings (key text PRIMARY KEY, value text NOT NULL)` — **must be run in prod after publish**). Flag `admin_panel_disabled` is enforced by a router-level middleware that rejects the ADMIN password specifically (owner/mod unaffected), avoiding edits to ~20 sync checkPassword call sites.
- Live Spectate — REMOVED (Aug 2026) at user request: player screen-frame reporting, owner viewer, `spectate_enabled` flag, and the /api/spectate/* + /owner/spectate/* endpoints are gone. Stale prod `app_settings` row is harmless; old published clients POST /api/spectate/report → 404 until they pick up the new bundle. If re-adding: keep client frame budget < a route-specific parser limit < in-memory store cap (bodies far over the default JSON limit otherwise stack-spam), and in-memory frames are per-autoscale-instance.
- Lesson: never `req.log.info(parsed.data, ...)` on password-bearing bodies — log only the specific fields.


## Market pack order (owner-editable)
- Saved in app_settings key `pack_order` (JSON array of pack names, 10s per-process cache like the flags). orderedPacks() sorts listed names first; unlisted/new packs keep relative catalog order AFTER the listed ones, so a stale saved order can never hide a pack; deleted names are harmless. Applied in GET /packs and both Discord pack lists.
- Endpoints follow the owner-settings pattern (body password + zod via openapi.yaml → `pnpm --filter @workspace/api-spec run codegen`); set-endpoint whitelists CATALOG_PACKS minus Miscellaneous and dedupes.
- **Why unlisted-after:** new catalog packs must appear without requiring the owner to re-save the order.

## Sitewide events — REMOVED (Aug 2026)
- Events feature (pack luck/double XP/token rain) was built then removed at user request; if re-adding, prior design stored event JSON in app_settings key `active_event` with short per-process cache.
- Mod endpoints still accept OWNER_PASSWORD (timing-safe); mod UI lives in shared components/mod-tools.tsx used by /mod and /owner.

## Staff-panel approval gate
- Only accounts approved for a panel may even attempt its password on /admin, /mod, /owner, /blookgen (guard middleware runs before password checks). Column via manual dev DDL; prod via Publish diff.
- Per-panel approvals: `players.panel_access` jsonb array (admin/mod/owner; /blookgen counts as admin). Gate switch `app_settings.panel_approval_enabled` (10s cache). OFF = anyone may attempt passwords, list freely editable.
- Lockout guards run under one pg advisory xact lock (shared by gate-enable and owner-access changes): enabling requires the session account to have owner access; while ON, self-revoke of owner access and last-owner-account revoke are blocked.
- Mod-panel grant/revoke syncs the "Mod" badge in the SAME UPDATE statement (SET expressions read old row, so revoke only strips the badge when mod access is actually lost — manually granted badges survive).
- **Why:** blocks password brute-forcing by random accounts; the last-account invariant closes a concurrent-revoke race that would silently disable the gate.

## Custom player pfps (owner-set)
- `players.custom_avatar_url` overrides the equipped blook everywhere through the single server avatar resolver, which takes the custom URL as a REQUIRED param — so tsc flags any payload site that forgets to select/thread the column.
- Avatars store the FULL servable path (`/api/storage/objects/...`) because every payload's `avatarImage` is rendered verbatim by the client. Clan banners are the opposite convention (bare `/objects/` path, client prefixes) — don't mix them up.
- Set flow reuses the shared upload validator (image type, 5MB cap, AI moderation, ACL claim); the ACL is claimed by the OWNER's session player, so only fresh or owner-owned uploads can be pointed at. Target lookup is case-insensitive; remove just nulls the column.
- The old hard-coded username→avatar map is gone, replaced by a flag-gated boot backfill into the column — that's what makes owner removal stick for legacy holders. Discord webhooks can't fetch auth-gated `/api/storage/objects/*` avatars and fall back to Discord's default (accepted).

## Account unlock (one-time password reset)
- Owner panel "Unlock Account": sets players.unlock_pending (manual dev DDL; prod via Publish diff). Next login with ANY password (6+ chars) claims it via conditional UPDATE (unlock_pending=true) — race-safe, one use — and that password becomes the account's password. Logging in with the correct old password just clears the flag.

## Co-owner tier (Aug 2026)
- `checkCoownerPassword` + `checkOwnerTierPassword` live in routes/owner.ts (moved from coowner.ts to avoid an import cycle; coowner.ts keeps only legacy /coowner/* grant routes for stale clients).
- The co-owner password is accepted everywhere the owner password is (owner/admin/mod/ai-scan routes, incl. delete-players, badges, wipes, raw-IP visibility) EXCEPT two owner-only powers: /owner/pack-order(/set) and turning topPackEnabled back ON (403 guard in /owner/settings/set; co-owner may still turn it OFF).
- **Why:** owner wants the co-owner panel identical to the owner panel minus pack arranging and 1k re-enabling.
- Client: owner.tsx exports OwnerControlPanel({ variant }); /coowner is a thin wrapper (coowner-tools.tsx deleted). Coowner variant hides the Pack Order card and disables the 1k switch while it's off.
- panel-approval: owner/coowner approvals open the /admin and /mod gates too (both panels embed those tools); /blookgen stays ["admin"]-approved only — it has no password check of its own and consumes paid AI generation.
