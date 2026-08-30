import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, appSettingsTable, clansTable, clanMembersTable, grantRequestsTable, storePurchasesTable, playersTable } from "@workspace/db";
import {
  OwnerGetSettingsBody,
  OwnerGetSettingsResponse,
  OwnerSetSettingsBody,
  OwnerGetPackOrderBody,
  OwnerGetPackOrderResponse,
  OwnerSetPackOrderBody,
  OwnerSetPackOrderResponse,
  OwnerListClansBody,
  OwnerListClansResponse,
  OwnerSetClanLevelBody,
  OwnerSetClanLevelResponse,
  OwnerListPurchasesBody,
  OwnerListPurchasesResponse,
  OwnerListPanelAccessBody,
  OwnerListPanelAccessResponse,
  OwnerSetPanelAccessBody,
  OwnerListModBadgesResponse,
  OwnerSetModBadgeBody,
  OwnerUnlockAccountBody,
  OwnerSetPlayerPfpBody,
  OwnerSetPlayerPfpResponse,
  OwnerRemovePlayerPfpBody,
  OwnerRemovePlayerPfpResponse,
  OwnerListGrantRequestsBody,
  OwnerListGrantRequestsResponse,
  OwnerApproveGrantRequestBody,
  OwnerApproveGrantRequestResponse,
  OwnerRejectGrantRequestBody,
  OwnerRejectGrantRequestResponse,
} from "@workspace/api-zod";
import { sessionPlayerId } from "../middlewares/auth";
import { addBlookToPlayer, getBlookDef, levelForExp, MISC_PACK } from "../lib/game";
import { CATALOG_PACKS } from "../data/catalogExtensions";
import { orderedPacks, setSavedPackOrder } from "../lib/packOrder";
import { validateUploadedImage } from "../lib/imageUploads";
import { rateLimit } from "../middlewares/rate-limit";
import {
  isExtravextrasBaseLevel3Enabled,
  setExtravextrasBaseLevel3Enabled,
} from "../lib/baseAccess";
import {
  BUNDLE_CLAN_BOOSTS,
  BUNDLE_VERSION,
  encodeBundleBlooks,
  grantBundleBlooks,
  rollBundleBlooks,
  STARTER_PRODUCT_KEY,
  STARTER_TOKENS,
  starterBundleBadgeUpdate,
} from "./store";

const router: IRouter = Router();

if (!process.env.OWNER_PASSWORD) {
  console.warn(
    "[owner] OWNER_PASSWORD is not set — all /owner endpoints will reject with 401 until it is configured.",
  );
}

// Per-IP rate limit to blunt online password guessing.
router.use("/owner", rateLimit({ windowMs: 60_000, max: 30 }));

function matches(password: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True only for the owner's password. Shared with the admin/AI-scan routers. */
export function checkOwnerPassword(password: string | undefined): boolean {
  if (!password) return false;
  return matches(password, process.env.OWNER_PASSWORD);
}

/**
 * True only for the co-owner's password. Defined here (not coowner.ts) so the
 * owner/admin/mod routers can accept it without an import cycle — coowner.ts
 * already imports the grant-request helpers from this module.
 */
export function checkCoownerPassword(password: string | undefined): boolean {
  if (!password) return false;
  return matches(password, process.env.COOWNER_PASSWORD);
}

/**
 * Owner tier: owner OR co-owner password. The co-owner panel mirrors the
 * owner panel except two owner-only powers, which stay on checkOwnerPassword:
 * arranging the market pack order, and re-enabling the 1k Pack.
 */
export function checkOwnerTierPassword(password: string | undefined): boolean {
  return checkOwnerPassword(password) || checkCoownerPassword(password);
}

// ---- Owner-controlled settings (stored in app_settings) --------------------

const ADMIN_DISABLED_KEY = "admin_panel_disabled";
const LINKS_ALLOWED_KEY = "links_allowed";
const PANEL_APPROVAL_KEY = "panel_approval_enabled";
const TOP_PACK_DISABLED_KEY = "top_pack_disabled";
const UPDATE_MESSAGE_DISABLED_KEY = "update_message_disabled";

// Serializes owner-panel access changes with gate enabling, so concurrent
// revokes/enables can never strand the gate ON with zero owner-approved
// accounts. Taken via pg_advisory_xact_lock inside a transaction.
const OWNER_ACCESS_LOCK_SQL = sql`SELECT pg_advisory_xact_lock(811427001)`;

type Executor = Pick<typeof db, "select" | "insert" | "update">;

async function getFlag(key: string, ex: Executor = db): Promise<boolean> {
  const [row] = await ex
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, key));
  return row?.value === "true";
}

async function setFlag(key: string, value: boolean, ex: Executor = db): Promise<void> {
  await ex
    .insert(appSettingsTable)
    .values({ key, value: String(value) })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: String(value) } });
}

export function isAdminPanelDisabled(): Promise<boolean> {
  return getFlag(ADMIN_DISABLED_KEY);
}

// Approval-gate flag is checked on every staff-panel request; cache briefly.
let panelApprovalCache: { value: boolean; ts: number } | null = null;
export async function isPanelApprovalEnabled(): Promise<boolean> {
  if (panelApprovalCache && Date.now() - panelApprovalCache.ts < 10_000) {
    return panelApprovalCache.value;
  }
  const value = await getFlag(PANEL_APPROVAL_KEY);
  panelApprovalCache = { value, ts: Date.now() };
  return value;
}

// Links flag is checked on every chat/trade/clan message, so cache it briefly.
let linksCache: { value: boolean; ts: number } | null = null;
export async function areLinksAllowed(): Promise<boolean> {
  if (linksCache && Date.now() - linksCache.ts < 10_000) return linksCache.value;
  const value = await getFlag(LINKS_ALLOWED_KEY);
  linksCache = { value, ts: Date.now() };
  return value;
}

// Checked on every GET /packs and pack open; cache briefly.
let topPackCache: { value: boolean; ts: number } | null = null;
export async function isTopPackDisabled(): Promise<boolean> {
  if (topPackCache && Date.now() - topPackCache.ts < 10_000) return topPackCache.value;
  const value = await getFlag(TOP_PACK_DISABLED_KEY);
  topPackCache = { value, ts: Date.now() };
  return value;
}

// Read by every client on load via GET /update-message; cache briefly.
// Default (no row) = message enabled.
let updateMessageCache: { value: boolean; ts: number } | null = null;
export async function isUpdateMessageDisabled(): Promise<boolean> {
  if (updateMessageCache && Date.now() - updateMessageCache.ts < 10_000) {
    return updateMessageCache.value;
  }
  const value = await getFlag(UPDATE_MESSAGE_DISABLED_KEY);
  updateMessageCache = { value, ts: Date.now() };
  return value;
}

// ---- Routes -----------------------------------------------------------------

async function settingsPayload() {
  return {
    adminPanelDisabled: await getFlag(ADMIN_DISABLED_KEY),
    linksAllowed: await getFlag(LINKS_ALLOWED_KEY),
    panelApprovalEnabled: await getFlag(PANEL_APPROVAL_KEY),
    topPackEnabled: !(await getFlag(TOP_PACK_DISABLED_KEY)),
    updateMessageEnabled: !(await getFlag(UPDATE_MESSAGE_DISABLED_KEY)),
    extravextrasBaseLevel3Enabled: await isExtravextrasBaseLevel3Enabled(),
  };
}

// Every market-visible pack (the hidden Miscellaneous pack is not orderable),
// in the order the market currently shows them.
async function effectivePackOrder(): Promise<string[]> {
  return (await orderedPacks(CATALOG_PACKS))
    .filter((p) => p.name !== MISC_PACK)
    .map((p) => p.name);
}

router.post("/owner/pack-order", async (req, res): Promise<void> => {
  const parsed = OwnerGetPackOrderBody.safeParse(req.body);
  if (!parsed.success || !checkOwnerPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong owner password" });
    return;
  }
  res.json(OwnerGetPackOrderResponse.parse({ order: await effectivePackOrder() }));
});

router.post("/owner/pack-order/set", async (req, res): Promise<void> => {
  const parsed = OwnerSetPackOrderBody.safeParse(req.body);
  if (!parsed.success || !checkOwnerPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong owner password" });
    return;
  }
  // Keep only real, orderable pack names (deduped) so a stale client can't
  // save junk; anything left out keeps catalog order after the listed ones.
  const valid = new Set(CATALOG_PACKS.filter((p) => p.name !== MISC_PACK).map((p) => p.name));
  const order: string[] = [];
  for (const name of parsed.data.order) {
    if (valid.has(name) && !order.includes(name)) order.push(name);
  }
  if (order.length === 0) {
    res.status(400).json({ message: "No valid pack names in the new order" });
    return;
  }
  await setSavedPackOrder(order);
  req.log.info({ order }, "Owner updated market pack order");
  res.json(OwnerSetPackOrderResponse.parse({ order: await effectivePackOrder() }));
});

router.post("/owner/settings", async (req, res): Promise<void> => {
  const parsed = OwnerGetSettingsBody.safeParse(req.body);
  if (!parsed.success || !checkOwnerTierPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  res.json(OwnerGetSettingsResponse.parse(await settingsPayload()));
});

router.post("/owner/settings/set", async (req, res): Promise<void> => {
  const parsed = OwnerSetSettingsBody.safeParse(req.body);
  if (!parsed.success || !checkOwnerTierPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  // Turning the 1k Pack back ON is owner-only; the co-owner may turn it off.
  if (parsed.data.topPackEnabled === true && !checkOwnerPassword(parsed.data.password)) {
    res.status(403).json({ message: "Only the owner can re-enable the 1k Pack" });
    return;
  }
  if (typeof parsed.data.adminPanelDisabled === "boolean") {
    await setFlag(ADMIN_DISABLED_KEY, parsed.data.adminPanelDisabled);
  }
  if (typeof parsed.data.linksAllowed === "boolean") {
    await setFlag(LINKS_ALLOWED_KEY, parsed.data.linksAllowed);
    linksCache = null;
  }
  if (typeof parsed.data.topPackEnabled === "boolean") {
    await setFlag(TOP_PACK_DISABLED_KEY, !parsed.data.topPackEnabled);
    topPackCache = null;
  }
  if (typeof parsed.data.updateMessageEnabled === "boolean") {
    await setFlag(UPDATE_MESSAGE_DISABLED_KEY, !parsed.data.updateMessageEnabled);
    updateMessageCache = null;
  }
  if (typeof parsed.data.extravextrasBaseLevel3Enabled === "boolean") {
    await setExtravextrasBaseLevel3Enabled(parsed.data.extravextrasBaseLevel3Enabled);
  }
  if (typeof parsed.data.panelApprovalEnabled === "boolean") {
    if (parsed.data.panelApprovalEnabled) {
      // Lockout guard: never enable the gate unless the account flipping the
      // switch has owner-panel access. Checked and committed under the same
      // advisory lock that serializes owner-access revokes, so a concurrent
      // revoke can't slip between the check and the flag write.
      const requesterId = sessionPlayerId(req);
      const ok = await db.transaction(async (tx) => {
        await tx.execute(OWNER_ACCESS_LOCK_SQL);
        const [requester] = requesterId
          ? await tx
              .select({ access: playersTable.panelAccess })
              .from(playersTable)
              .where(eq(playersTable.id, requesterId))
          : [];
        if (!requester?.access?.includes("owner")) return false;
        await setFlag(PANEL_APPROVAL_KEY, true, tx);
        return true;
      });
      if (!ok) {
        res.status(400).json({
          message: "Approve the account you're logged in as for the Owner panel before turning this on",
        });
        return;
      }
    } else {
      await setFlag(PANEL_APPROVAL_KEY, false);
    }
    panelApprovalCache = null;
  }
  req.log.info(
    {
      adminPanelDisabled: parsed.data.adminPanelDisabled,
      linksAllowed: parsed.data.linksAllowed,
    },
    "Owner updated settings",
  );
  res.json(OwnerGetSettingsResponse.parse(await settingsPayload()));
});

// ---- Staff-panel access approvals (owner only) -------------------------------

const PANEL_ORDER = ["admin", "mod", "coowner", "owner"] as const;

async function panelAccessPayload() {
  const rows = await db
    .select({ id: playersTable.id, username: playersTable.username, panels: playersTable.panelAccess })
    .from(playersTable)
    .where(sql`${playersTable.panelAccess} <> '[]'::jsonb`)
    .orderBy(asc(playersTable.username));
  return {
    accounts: rows.map((r) => ({
      id: r.id,
      username: r.username,
      panels: PANEL_ORDER.filter((p) => r.panels.includes(p)),
    })),
  };
}

router.post("/owner/panel-access", async (req, res): Promise<void> => {
  const parsed = OwnerListPanelAccessBody.safeParse(req.body);
  if (!parsed.success || !checkOwnerTierPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  res.json(OwnerListPanelAccessResponse.parse(await panelAccessPayload()));
});

router.post("/owner/panel-access/set", async (req, res): Promise<void> => {
  const parsed = OwnerSetPanelAccessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkOwnerTierPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  const [target] = await db
    .select({ id: playersTable.id, username: playersTable.username })
    .from(playersTable)
    .where(sql`lower(${playersTable.username}) = lower(${parsed.data.username})`);
  if (!target) {
    res.status(400).json({ message: "No account with that username" });
    return;
  }
  const { panel, granted } = parsed.data;
  const panelJson = JSON.stringify([panel]);
  // Access change and Mod-badge sync live in ONE statement so they can never
  // drift apart under concurrency (all SET expressions read the OLD row, so
  // the badge branch below sees pre-update panel_access).
  const grantSet = {
    panelAccess: sql`CASE WHEN ${playersTable.panelAccess} @> ${panelJson}::jsonb
      THEN ${playersTable.panelAccess}
      ELSE ${playersTable.panelAccess} || ${panelJson}::jsonb END`,
    ...(panel === "mod"
      ? {
          badges: sql`CASE WHEN ${playersTable.badges} @> '["Mod"]'::jsonb
            THEN ${playersTable.badges}
            ELSE ${playersTable.badges} || '["Mod"]'::jsonb END`,
        }
      : {}),
  };
  const revokeSet = {
    // Badge is only removed when the account actually LOSES mod access in
    // this statement — an independently granted Mod badge on an account
    // without mod access is left alone.
    ...(panel === "mod"
      ? {
          badges: sql`CASE WHEN ${playersTable.panelAccess} @> '["mod"]'::jsonb
            THEN ${playersTable.badges} - 'Mod'
            ELSE ${playersTable.badges} END`,
        }
      : {}),
    panelAccess: sql`${playersTable.panelAccess} - ${panel}`,
  };
  if (panel !== "owner") {
    // Admin/mod access never gates the owner panel, so no lockout risk.
    await db
      .update(playersTable)
      .set(granted ? grantSet : revokeSet)
      .where(eq(playersTable.id, target.id));
  } else {
    // Owner-panel changes are serialized (advisory lock, shared with gate
    // enabling) so concurrent revokes can never strand the gate ON with zero
    // owner-approved accounts.
    const blocked = await db.transaction(async (tx): Promise<"self" | "last" | null> => {
      await tx.execute(OWNER_ACCESS_LOCK_SQL);
      if (granted) {
        await tx.update(playersTable).set(grantSet).where(eq(playersTable.id, target.id));
        return null;
      }
      const enabled = await getFlag(PANEL_APPROVAL_KEY, tx);
      if (!enabled) {
        // Gate OFF: freely editable (turning it on later requires an
        // owner-approved session, checked under this same lock).
        await tx.update(playersTable).set(revokeSet).where(eq(playersTable.id, target.id));
        return null;
      }
      // Gate ON: the owner can't revoke the account they're logged in as…
      if (sessionPlayerId(req) === target.id) return "self";
      // …and never drop the LAST owner-approved account.
      const revoked = await tx
        .update(playersTable)
        .set(revokeSet)
        .where(
          sql`${playersTable.id} = ${target.id} AND ${playersTable.panelAccess} @> ${panelJson}::jsonb AND (SELECT count(*) FROM ${playersTable} WHERE ${playersTable.panelAccess} @> ${panelJson}::jsonb) > 1`,
        )
        .returning({ id: playersTable.id });
      if (revoked.length === 0) {
        const [still] = await tx
          .select({ access: playersTable.panelAccess })
          .from(playersTable)
          .where(eq(playersTable.id, target.id));
        if (still?.access?.includes("owner")) return "last";
        // Already unapproved — treat as success.
      }
      return null;
    });
    if (blocked === "self") {
      res.status(400).json({ message: "You can't remove your own account's owner-panel access" });
      return;
    }
    if (blocked === "last") {
      res.status(400).json({ message: "You can't remove the last owner-approved account while approval is turned on" });
      return;
    }
  }
  req.log.info(
    { targetId: target.id, username: target.username, panel, granted },
    "Owner updated staff-panel access",
  );
  res.json(OwnerListPanelAccessResponse.parse(await panelAccessPayload()));
});

// ---- Mod badge holders (owner only) ------------------------------------------

async function modBadgePayload() {
  const rows = await db
    .select({ id: playersTable.id, username: playersTable.username, panels: playersTable.panelAccess })
    .from(playersTable)
    .where(sql`${playersTable.badges} @> '["Mod"]'::jsonb`)
    .orderBy(asc(playersTable.username));
  return {
    accounts: rows.map((r) => ({
      id: r.id,
      username: r.username,
      modPanel: r.panels.includes("mod"),
    })),
  };
}

router.post("/owner/unlock-account", async (req, res): Promise<void> => {
  const parsed = OwnerUnlockAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkOwnerTierPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  const [target] = await db
    .update(playersTable)
    // Also clear any brute-force lockout so the kid can claim immediately.
    .set({ unlockPending: true, unlockPendingAt: new Date(), failedLogins: 0, lockoutUntil: null, lastFailedLoginAt: null })
    .where(sql`lower(${playersTable.username}) = lower(${parsed.data.username}) AND ${playersTable.isBot} = false`)
    .returning({ username: playersTable.username });
  if (!target) {
    res.status(400).json({ message: "No account with that username" });
    return;
  }
  req.log.info({ username: target.username }, "Account unlocked for one-time password reset");
  res.json({
    message: `${target.username} unlocked — within the next hour, the next password used to log in becomes their new password`,
  });
});

router.post("/owner/mod-badges", async (req, res): Promise<void> => {
  const parsed = OwnerListPanelAccessBody.safeParse(req.body);
  if (!parsed.success || !checkOwnerTierPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  res.json(OwnerListModBadgesResponse.parse(await modBadgePayload()));
});

/**
 * Set a player's custom pfp from an uploaded image. The upload is validated
 * (image type, 5MB cap, moderation) and its ACL is claimed by the OWNER's
 * session player — so only files the owner uploaded (or unclaimed fresh
 * uploads) can be pointed at. The stored value is the full servable path.
 */
router.post("/owner/pfp/set", async (req, res): Promise<void> => {
  const parsed = OwnerSetPlayerPfpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkOwnerTierPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  const uploaderId = sessionPlayerId(req);
  if (!uploaderId) {
    res.status(401).json({ message: "Not logged in" });
    return;
  }
  const [target] = await db
    .select({ id: playersTable.id, username: playersTable.username })
    .from(playersTable)
    .where(sql`lower(${playersTable.username}) = lower(${parsed.data.username})`);
  if (!target) {
    res.status(400).json({ message: "No account with that username" });
    return;
  }
  const check = await validateUploadedImage(parsed.data.imagePath, uploaderId);
  if (!check.ok) {
    res.status(400).json({ message: check.message });
    return;
  }
  // Full servable path — avatarImage payloads render this verbatim.
  const avatarUrl = `/api/storage${check.path}`;
  await db
    .update(playersTable)
    .set({ customAvatarUrl: avatarUrl })
    .where(eq(playersTable.id, target.id));
  req.log.info(
    { targetId: target.id, username: target.username },
    "Owner set custom pfp",
  );
  res.json(OwnerSetPlayerPfpResponse.parse({ ok: true, avatarImage: avatarUrl }));
});

/** Clear a player's custom pfp; their equipped blook shows again. */
router.post("/owner/pfp/remove", async (req, res): Promise<void> => {
  const parsed = OwnerRemovePlayerPfpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkOwnerTierPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  const [target] = await db
    .select({ id: playersTable.id, username: playersTable.username })
    .from(playersTable)
    .where(sql`lower(${playersTable.username}) = lower(${parsed.data.username})`);
  if (!target) {
    res.status(400).json({ message: "No account with that username" });
    return;
  }
  await db
    .update(playersTable)
    .set({ customAvatarUrl: null })
    .where(eq(playersTable.id, target.id));
  req.log.info(
    { targetId: target.id, username: target.username },
    "Owner removed custom pfp",
  );
  res.json(OwnerRemovePlayerPfpResponse.parse({ ok: true, avatarImage: null }));
});

/**
 * Approve = grant mod-panel access (badge stays, same as panel-access grant).
 * Decline = strip the Mod badge AND any mod-panel access, in one statement.
 */
router.post("/owner/mod-badges/set", async (req, res): Promise<void> => {
  const parsed = OwnerSetModBadgeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkOwnerTierPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  const [target] = await db
    .select({ id: playersTable.id, username: playersTable.username })
    .from(playersTable)
    .where(sql`lower(${playersTable.username}) = lower(${parsed.data.username})`);
  if (!target) {
    res.status(400).json({ message: "No account with that username" });
    return;
  }
  if (parsed.data.approved) {
    await db
      .update(playersTable)
      .set({
        panelAccess: sql`CASE WHEN ${playersTable.panelAccess} @> '["mod"]'::jsonb
          THEN ${playersTable.panelAccess}
          ELSE ${playersTable.panelAccess} || '["mod"]'::jsonb END`,
        badges: sql`CASE WHEN ${playersTable.badges} @> '["Mod"]'::jsonb
          THEN ${playersTable.badges}
          ELSE ${playersTable.badges} || '["Mod"]'::jsonb END`,
      })
      .where(eq(playersTable.id, target.id));
  } else {
    await db
      .update(playersTable)
      .set({
        badges: sql`${playersTable.badges} - 'Mod'`,
        panelAccess: sql`${playersTable.panelAccess} - 'mod'`,
      })
      .where(eq(playersTable.id, target.id));
  }
  req.log.info(
    { targetId: target.id, username: target.username, approved: parsed.data.approved },
    "Owner updated mod badge/panel",
  );
  res.json(OwnerListModBadgesResponse.parse(await modBadgePayload()));
});

// ---- Admin grant approvals --------------------------------------------------

export function grantRequestView(row: {
  id: number;
  kind: string;
  requesterName: string | null;
  targetUsername: string;
  blookName: string | null;
  quantity: number | null;
  status: string;
  createdAt: Date;
  decidedBy: string | null;
  decidedAt: Date | null;
}) {
  return {
    id: row.id,
    kind: row.kind,
    requesterName: row.requesterName,
    targetUsername: row.targetUsername,
    blook: row.blookName,
    quantity: row.quantity,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

export async function grantRequestDecisionName(
  req: Parameters<typeof sessionPlayerId>[0],
  fallback = "Owner",
): Promise<string> {
  const playerId = sessionPlayerId(req);
  if (playerId === null) return fallback;
  const [staffMember] = await db
    .select({ username: playersTable.username })
    .from(playersTable)
    .where(eq(playersTable.id, playerId));
  return staffMember?.username ?? fallback;
}

async function pendingGrantRequestRows() {
  return db
    .select({
      id: grantRequestsTable.id,
      kind: grantRequestsTable.kind,
      requesterName: grantRequestsTable.requesterName,
      targetUsername: playersTable.username,
      blookName: grantRequestsTable.blookName,
      quantity: grantRequestsTable.quantity,
      status: grantRequestsTable.status,
      createdAt: grantRequestsTable.createdAt,
      decidedBy: grantRequestsTable.decidedBy,
      decidedAt: grantRequestsTable.decidedAt,
    })
    .from(grantRequestsTable)
    .innerJoin(playersTable, eq(grantRequestsTable.targetPlayerId, playersTable.id))
    .where(eq(grantRequestsTable.status, "pending"))
    .orderBy(desc(grantRequestsTable.createdAt));
}

export async function listPendingGrantRequests() {
  return (await pendingGrantRequestRows()).map(grantRequestView);
}

/**
 * Atomically claim a pending request before applying its reward. Both Owner
 * and Co-owner call this shared path, so retries and concurrent decisions
 * cannot duplicate a reward.
 */
export async function decideGrantRequest(
  requestId: number,
  status: "approved" | "rejected",
  decidedBy: string,
) {
  const result = await db.transaction(async (tx) => {
    const [request] = await tx
      .update(grantRequestsTable)
      .set({ status, decidedBy, decidedAt: new Date() })
      .where(and(eq(grantRequestsTable.id, requestId), eq(grantRequestsTable.status, "pending")))
      .returning();
    if (!request) return null;

    const [target] = await tx
      .select({ username: playersTable.username })
      .from(playersTable)
      .where(eq(playersTable.id, request.targetPlayerId));
    if (!target) throw new Error("Grant request target disappeared");

    if (status === "approved") {
      if (request.kind === "blook") {
        if (!request.blookName || !request.quantity || !getBlookDef(request.blookName)) {
          throw new Error("Grant request has an unavailable blook");
        }
        await addBlookToPlayer(request.targetPlayerId, request.blookName, request.quantity, tx);
      } else if (request.kind === "starter_bundle") {
        const picks = rollBundleBlooks();
        await tx.insert(storePurchasesTable).values({
          playerId: request.targetPlayerId,
          stripeSessionId: `free_admin_request_${request.id}`,
          productKey: STARTER_PRODUCT_KEY,
          chromaBlook: encodeBundleBlooks(picks),
          grantedBy: request.requesterName,
        });
        await tx
          .update(playersTable)
          .set({
            tokens: sql`least(${playersTable.tokens}::bigint + ${STARTER_TOKENS}::bigint, 2147483647)::int`,
            tokensEarned: sql`${playersTable.tokensEarned} + ${STARTER_TOKENS}`,
            badges: starterBundleBadgeUpdate,
            nameEffect: "golden",
            clanBoosts: sql`${playersTable.clanBoosts} + ${BUNDLE_CLAN_BOOSTS}`,
            rainbowPerks: sql`${playersTable.rainbowPerks} + 1`,
            craftLuckItems: sql`${playersTable.craftLuckItems} + 1`,
            bundleVersion: sql`greatest(${playersTable.bundleVersion}, ${BUNDLE_VERSION})`,
          })
          .where(eq(playersTable.id, request.targetPlayerId));
        await grantBundleBlooks(request.targetPlayerId, picks, tx);
      } else {
        throw new Error("Grant request has an unknown type");
      }
    }

    return { ...request, targetUsername: target.username };
  });
  return result ? grantRequestView(result) : null;
}

router.post("/owner/grant-requests", async (req, res): Promise<void> => {
  const parsed = OwnerListGrantRequestsBody.safeParse(req.body);
  if (!parsed.success || !checkOwnerTierPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  res.json(OwnerListGrantRequestsResponse.parse({ requests: await listPendingGrantRequests() }));
});

router.post("/owner/grant-requests/approve", async (req, res): Promise<void> => {
  const parsed = OwnerApproveGrantRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkOwnerTierPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  const decisionBy = await grantRequestDecisionName(req);
  const result = await decideGrantRequest(parsed.data.requestId, "approved", decisionBy);
  if (!result) {
    res.status(400).json({ message: "That request has already been handled" });
    return;
  }
  req.log.info(
    { requestId: result.id, kind: result.kind, targetUsername: result.targetUsername, decidedBy: decisionBy },
    "Owner approved grant request",
  );
  res.json(OwnerApproveGrantRequestResponse.parse(result));
});

router.post("/owner/grant-requests/reject", async (req, res): Promise<void> => {
  const parsed = OwnerRejectGrantRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkOwnerTierPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  const decisionBy = await grantRequestDecisionName(req);
  const result = await decideGrantRequest(parsed.data.requestId, "rejected", decisionBy);
  if (!result) {
    res.status(400).json({ message: "That request has already been handled" });
    return;
  }
  req.log.info(
    { requestId: result.id, kind: result.kind, targetUsername: result.targetUsername, decidedBy: decisionBy },
    "Owner rejected grant request",
  );
  res.json(OwnerRejectGrantRequestResponse.parse(result));
});

// ---- Clan levels (owner only) ----------------------------------------------

router.post("/owner/clans", async (req, res): Promise<void> => {
  const parsed = OwnerListClansBody.safeParse(req.body);
  if (!parsed.success || !checkOwnerTierPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  const clans = await db
    .select({ id: clansTable.id, name: clansTable.name, experience: clansTable.experience })
    .from(clansTable)
    .orderBy(asc(clansTable.name));
  const counts = await db
    .select({ clanId: clanMembersTable.clanId, members: sql<number>`count(*)::int` })
    .from(clanMembersTable)
    .groupBy(clanMembersTable.clanId);
  const membersByClan = new Map(counts.map((c) => [c.clanId, c.members]));
  res.json(
    OwnerListClansResponse.parse({
      clans: clans.map((c) => ({
        id: c.id,
        name: c.name,
        level: levelForExp(c.experience),
        experience: c.experience,
        members: membersByClan.get(c.id) ?? 0,
      })),
    }),
  );
});

// ---- Store purchases (owner only) ------------------------------------------

router.post("/owner/purchases", async (req, res): Promise<void> => {
  const parsed = OwnerListPurchasesBody.safeParse(req.body);
  if (!parsed.success || !checkOwnerTierPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  const rows = await db
    .select({
      id: storePurchasesTable.id,
      username: playersTable.username,
      productKey: storePurchasesTable.productKey,
      createdAt: storePurchasesTable.createdAt,
    })
    .from(storePurchasesTable)
    .leftJoin(playersTable, eq(storePurchasesTable.playerId, playersTable.id))
    .where(sql`${storePurchasesTable.stripeSessionId} NOT LIKE 'free\_%'`)
    .orderBy(sql`${storePurchasesTable.id} desc`);
  res.json(
    OwnerListPurchasesResponse.parse({
      purchases: rows.map((r) => ({
        id: r.id,
        username: r.username,
        productKey: r.productKey,
        createdAt: r.createdAt.toISOString(),
      })),
    }),
  );
});

router.post("/owner/clans/set-level", async (req, res): Promise<void> => {
  const parsed = OwnerSetClanLevelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkOwnerTierPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  // level = floor(sqrt(exp/100)) + 1, so exp for level L is 100*(L-1)^2.
  const newExp = 100 * (parsed.data.level - 1) ** 2;
  // Defensive: never write past the int4 experience column.
  if (newExp > 2_147_483_647) {
    res.status(400).json({ message: "Level too high" });
    return;
  }
  const [updated] = await db
    .update(clansTable)
    .set({ experience: newExp })
    .where(eq(clansTable.id, parsed.data.clanId))
    .returning({ id: clansTable.id, name: clansTable.name, experience: clansTable.experience });
  if (!updated) {
    res.status(404).json({ message: "Clan not found" });
    return;
  }
  const [memberCount] = await db
    .select({ members: sql<number>`count(*)::int` })
    .from(clanMembersTable)
    .where(eq(clanMembersTable.clanId, updated.id));
  req.log.info({ clanId: updated.id, level: parsed.data.level }, "Owner set clan level");
  res.json(
    OwnerSetClanLevelResponse.parse({
      id: updated.id,
      name: updated.name,
      level: levelForExp(updated.experience),
      experience: updated.experience,
      members: memberCount?.members ?? 0,
    }),
  );
});

export default router;
