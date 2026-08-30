---
name: IP bans
description: How IP bans work, why they only block registration, and the per-IP advisory lock pattern.
---

## IP bans (owner-only)
- `ip_bans` table (manual dev DDL; prod via Publish diff). Ban action = ban the account (`players.banned`) + record their `last_ip`.
- Enforcement blocks ONLY new registrations from a banned IP. Existing accounts on the same IP keep playing.
- **Why:** kids' game — school/CGNAT IPs are heavily shared; blanket IP blocks would hit innocent classmates. Account bans + registration block stops evasion without collateral.
- Registration check+insert and the ban action share a per-IP advisory lock (`pg_advisory_xact_lock(hashtext('ipban:'||ip))`) so a signup can't race a ban and no half-ban is left.
- /admin/ip-bans* endpoints accept MOD, ADMIN or OWNER passwords; raw IPs are null in responses unless the OWNER password was used (matches /mod/lookup boundary). Unban is by USERNAME (case-insensitive) so mods never need the IP. IpBansPanel is shared: admin panel + mod panel players tab.
- Ban list shows accounts sharing each banned IP (set-based query, 200 bans / 25 accounts caps) for innocent-check visibility only.
- `req.ip` comes from CIDR-based trust proxy config in app.ts (documented GCP LB ranges only; TRUST_PROXY_HOPS override) — spoof-resistant, don't switch to naive hop counts.

## Prod IP capture fix (Aug 2026)
- Prod players.last_ip was Google LB addresses (34.x/35.x) shared by up to 77 players — the CIDR trust-proxy config deliberately doesn't trust broad GCP space, so req.ip stopped at the LB.
- Fix: `TRUST_PROXY_HOPS=2` set as a PRODUCTION env var (dev keeps CIDR default, 1 effective hop). Takes effect on next publish.
- Startup sweep nulls last_ip values inside 34.0.0.0/8 / 35.0.0.0/8 (idempotent) so stale datacenter IPs never pollute shared-account lists.
- If last_ip ever looks like datacenter IPs again, re-verify the hop count (infra changed).

## VPN signup block (Aug 2026)
- Register handler calls isVpnIp (lib/vpn-check.ts) before creating accounts: proxycheck.io `?vpn=1`, blocks when `proxy === "yes"`, same generic 403 message as IP bans.
- FAIL-OPEN by design (timeouts, quota, errors → allow) so a third-party hiccup never blocks a real kid. Private/loopback IPs skipped (dev always passes).
- Keyless free tier (~100 lookups/day) + 1h in-memory cache; set PROXYCHECK_API_KEY env var if quota ever becomes a problem.
- Architect's XFF-spoof concern only applies if the app were directly reachable; prod is only reachable via GCP LB (exactly 2 hops, TRUST_PROXY_HOPS=2), and dev doesn't set the numeric override.

## VPN block v2 — keyless list-based (replaces proxycheck API)
- vpn-check.ts now downloads X4BNet/lists_vpn VPN + datacenter IPv4 CIDR lists (GitHub raw) at boot + every 24h, merges ~30k ranges, binary-searches locally — unlimited checks, no key/quota. startVpnListLoader() called in index.ts boot.
- Verified: home ISP IPs allowed, AWS/GCP/DO blocked. Fail-open if lists unreachable; IPv6 clients allowed; private IPs skipped. PROXYCHECK_API_KEY no longer used.
