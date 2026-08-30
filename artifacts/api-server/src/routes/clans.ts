import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gt, ne, notInArray, sql } from "drizzle-orm";
import {
  db,
  playersTable,
  clansTable,
  clanMembersTable,
  clanApplicationsTable,
  clanMessagesTable,
  clanHeldBlooksTable,
  ownedBlooksTable,
} from "@workspace/db";
import {
  GetClansResponse,
  GetMyClanMembershipResponse,
  CreateClanBody,
  CreateClanResponse,
  GetClanResponse,
  BoostClanResponse,
  SetClanRainbowBody,
  SetClanRainbowResponse,
  DecideClanApplicationBody,
  KickClanMemberBody,
  TransferClanOwnershipBody,
  SetClanDescriptionBody,
  RenameClanBody,
  SetClanImageBody,
  GetClanMessagesQueryParams,
  GetClanMessagesResponse,
  SendClanMessageBody,
  SendClanMessageResponse,
  PlaceClanHeldBlookBody,
  PlaceClanHeldBlookParams,
  PlaceClanHeldBlookResponse,
  WithdrawClanHeldBlookParams,
  WithdrawClanHeldBlookResponse,
} from "@workspace/api-zod";
import {
  playerAvatarImage,
  badgeViews,
  containsLink,
  levelForExp,
  getBlookDef,
  addBlookToPlayer,
  syncCollectorBadge,
  isClanHoldBanned,
} from "../lib/game";
import {
  heldMineRatePerHour,
  CLAN_HELD_LOCK_MS,
  clanEffectForBlook,
  hasMysticalAura,
  UNCOMMON_CHARM_KEY,
  UNCOMMON_HELD_LUCK_BONUS,
  releaseClanHeldBlooks,
  settleClanMembersMines,
} from "../lib/clanHeldBlooks";
import { areLinksAllowed } from "./owner";
import { validateUploadedImage } from "../lib/imageUploads";

const router: IRouter = Router();

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
export const MAX_CLAN_MEMBERS = 25;

async function myMembership(playerId: number) {
  const [row] = await db
    .select({
      clanId: clanMembersTable.clanId,
      role: clanMembersTable.role,
    })
    .from(clanMembersTable)
    .where(eq(clanMembersTable.playerId, playerId))
    .limit(1);
  return row ?? null;
}

async function myStatusForClan(
  playerId: number,
  clanId: number,
): Promise<"none" | "pending" | "accepted" | "member" | "owner"> {
  const membership = await myMembership(playerId);
  if (membership?.clanId === clanId) {
    return membership.role === "owner" ? "owner" : "member";
  }
  if (membership) return "none";
  const [app] = await db
    .select({ status: clanApplicationsTable.status })
    .from(clanApplicationsTable)
    .where(
      and(
        eq(clanApplicationsTable.clanId, clanId),
        eq(clanApplicationsTable.playerId, playerId),
      ),
    )
    .orderBy(desc(clanApplicationsTable.id))
    .limit(1);
  if (app?.status === "pending") return "pending";
  if (app?.status === "accepted") return "accepted";
  return "none";
}

router.get("/clans", async (req, res): Promise<void> => {
  const me = req.player!;
  const clans = await db
    .select({
      id: clansTable.id,
      name: clansTable.name,
      color: clansTable.color,
      imageUrl: clansTable.imageUrl,
      description: clansTable.description,
      experience: clansTable.experience,
      rainbowOwnerId: clansTable.rainbowOwnerId,
      ownerUsername: playersTable.username,
    })
    .from(clansTable)
    .innerJoin(playersTable, eq(clansTable.ownerId, playersTable.id))
    .where(eq(clansTable.banned, false))
    .orderBy(desc(clansTable.experience), asc(clansTable.id));
  const counts = await db
    .select({
      clanId: clanMembersTable.clanId,
      count: sql<number>`count(*)::int`,
    })
    .from(clanMembersTable)
    .groupBy(clanMembersTable.clanId);
  const countMap = new Map(counts.map((c) => [c.clanId, c.count]));
  const membership = await myMembership(me.id);
  const myApps = await db
    .select({
      clanId: clanApplicationsTable.clanId,
      status: clanApplicationsTable.status,
      id: clanApplicationsTable.id,
    })
    .from(clanApplicationsTable)
    .where(eq(clanApplicationsTable.playerId, me.id))
    .orderBy(asc(clanApplicationsTable.id));
  const appMap = new Map<number, string>();
  for (const a of myApps) appMap.set(a.clanId, a.status);
  const result = clans.map((c) => {
    let myStatus: "none" | "pending" | "accepted" | "member" | "owner" = "none";
    if (membership?.clanId === c.id) {
      myStatus = membership.role === "owner" ? "owner" : "member";
    } else if (!membership) {
      const s = appMap.get(c.id);
      if (s === "pending") myStatus = "pending";
      else if (s === "accepted") myStatus = "accepted";
    }
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      imageUrl: c.imageUrl,
      description: c.description,
      memberCount: countMap.get(c.id) ?? 0,
      ownerUsername: c.ownerUsername,
      myStatus,
      experience: c.experience,
      level: levelForExp(c.experience),
      rainbow: c.rainbowOwnerId !== null,
    };
  });
  res.json(GetClansResponse.parse(result));
});

// The clans list hides banned clans, so a member of a banned clan would
// otherwise have no way to see — or leave — their own clan. This reports the
// caller's membership even when the clan is hidden, so the client can offer
// a way out.
router.get("/clans/my-membership", async (req, res): Promise<void> => {
  const me = req.player!;
  const [row] = await db
    .select({
      clanId: clanMembersTable.clanId,
      role: clanMembersTable.role,
      clanName: clansTable.name,
      banned: clansTable.banned,
    })
    .from(clanMembersTable)
    .innerJoin(clansTable, eq(clanMembersTable.clanId, clansTable.id))
    .where(eq(clanMembersTable.playerId, me.id))
    .limit(1);
  res.json(
    GetMyClanMembershipResponse.parse(
      row
        ? { inClan: true, clanId: row.clanId, clanName: row.clanName, role: row.role, banned: row.banned }
        : { inClan: false, clanId: null, clanName: null, role: null, banned: false },
    ),
  );
});

router.post("/clans", async (req, res): Promise<void> => {
  const parsed = CreateClanBody.safeParse(req.body);
  const me = req.player!;
  if (!parsed.success) {
    res.status(400).json({ message: "Clan name must be 1-20 characters" });
    return;
  }
  const name = parsed.data.name.trim();
  if (name.length === 0 || name.length > 20) {
    res.status(400).json({ message: "Clan name must be 1-20 characters" });
    return;
  }
  if (containsLink(name)) {
    res.status(400).json({ message: "Links aren't allowed in clan names" });
    return;
  }
  if (!COLOR_RE.test(parsed.data.color)) {
    res.status(400).json({ message: "Color must be a hex color like #ff0000" });
    return;
  }
  if (await myMembership(me.id)) {
    res.status(400).json({ message: "You're already in a clan" });
    return;
  }
  let imageUrl: string | null = null;
  if (parsed.data.imagePath) {
    const check = await validateUploadedImage(parsed.data.imagePath, me.id);
    if (!check.ok) {
      res.status(400).json({ message: check.message });
      return;
    }
    imageUrl = check.path;
  }
  try {
    const created = await db.transaction(async (tx) => {
      const [clan] = await tx
        .insert(clansTable)
        .values({ name, color: parsed.data.color, ownerId: me.id, imageUrl })
        .returning();
      await tx
        .insert(clanMembersTable)
        .values({ clanId: clan!.id, playerId: me.id, role: "owner" });
      return clan!;
    });
    res.status(201).json(
      CreateClanResponse.parse({
        id: created.id,
        name: created.name,
        color: created.color,
        imageUrl: created.imageUrl,
        description: created.description,
        ownerUsername: me.username,
        myStatus: "owner",
        experience: 0,
        level: levelForExp(0),
        rainbow: false,
        rainbowMine: false,
        members: [
          {
            username: me.username,
            role: "owner",
            avatarImage: playerAvatarImage(me.avatarBlook, me.username, me.customAvatarUrl),
          },
        ],
        pendingApplications: [],
        heldBlooks: [],
        heldProduction: { payingCount: 0, ratePerHour: 0 },
        activeEffects: [],
      }),
    );
  } catch (err: unknown) {
    const code =
      (err as { code?: string })?.code ??
      ((err as { cause?: { code?: string } })?.cause?.code);
    if (code === "23505") {
      res.status(400).json({ message: "That clan name is taken" });
      return;
    }
    throw err;
  }
});

router.post("/clans/leave", async (req, res): Promise<void> => {
  const me = req.player!;
  const membership = await myMembership(me.id);
  if (!membership) {
    res.status(400).json({ message: "You're not in a clan" });
    return;
  }
  // Deposit any accrued mine pay before membership rows change hands — the
  // member clock (clan_tokens_last_at) lives on the row being deleted.
  await settleClanMembersMines(membership.clanId);
  if (membership.role === "owner") {
    // All checks happen inside the transaction, after locking the clan row,
    // so a concurrent transfer/join can't race the disband: transfers also
    // lock the clan row, so once we hold it the ownership/membership state
    // we read is the state we delete against.
    const outcome = await db.transaction(async (tx) => {
      const [clanRow] = await tx
        .select({
          ownerId: clansTable.ownerId,
          rainbowOwnerId: clansTable.rainbowOwnerId,
          banned: clansTable.banned,
        })
        .from(clansTable)
        .where(eq(clansTable.id, membership.clanId))
        .for("update");
      if (!clanRow) return "gone" as const;
      if (clanRow.ownerId !== me.id) {
        // Ownership changed concurrently — we're a regular member now.
        await tx
          .delete(clanMembersTable)
          .where(eq(clanMembersTable.playerId, me.id));
        return "left" as const;
      }
      // Re-check under the lock: an owner with other members must transfer
      // ownership before leaving.
      const [otherMember] = await tx
        .select({ id: clanMembersTable.id })
        .from(clanMembersTable)
        .where(
          and(
            eq(clanMembersTable.clanId, membership.clanId),
            ne(clanMembersTable.playerId, me.id),
          ),
        )
        .limit(1);
      // A banned clan is hidden everywhere, so its owner can never reach the
      // transfer UI. Let them leave anyway: the clan disbands, every member
      // is freed, and held blooks are returned below.
      if (otherMember && !clanRow.banned) return "transfer_first" as const;
      // Sole member: owner leaving disbands the clan entirely.
      // Refund an applied rainbow perk to whoever put it on this clan.
      if (clanRow.rainbowOwnerId != null) {
        const cleared = await tx
          .update(clansTable)
          .set({ rainbowOwnerId: null })
          .where(and(eq(clansTable.id, membership.clanId), eq(clansTable.rainbowOwnerId, clanRow.rainbowOwnerId)))
          .returning({ id: clansTable.id });
        if (cleared.length > 0) {
          await tx
            .update(playersTable)
            .set({ rainbowPerks: sql`${playersTable.rainbowPerks} + 1` })
            .where(eq(playersTable.id, clanRow.rainbowOwnerId));
        }
      }
      await tx
        .delete(clanMessagesTable)
        .where(eq(clanMessagesTable.clanId, membership.clanId));
      await tx
        .delete(clanApplicationsTable)
        .where(eq(clanApplicationsTable.clanId, membership.clanId));
      await tx
        .delete(clanMembersTable)
        .where(eq(clanMembersTable.clanId, membership.clanId));
      // A disbanded clan has nowhere to hold commitments. Return them rather
      // than silently destroying members' blooks (even if still time-locked).
      await releaseClanHeldBlooks(tx, membership.clanId);
      await tx.delete(clansTable).where(eq(clansTable.id, membership.clanId));
      return "disbanded" as const;
    });
    if (outcome === "transfer_first") {
      res.status(400).json({
        message: "Transfer ownership to another member before leaving",
      });
      return;
    }
    if (outcome === "gone") {
      res.status(400).json({ message: "You're not in a clan" });
      return;
    }
    res.json({
      message: outcome === "disbanded" ? "Clan disbanded" : "Left the clan",
    });
    return;
  }
  await db
    .delete(clanMembersTable)
    .where(eq(clanMembersTable.playerId, me.id));
  res.json({ message: "Left the clan" });
});

router.get("/clans/chat", async (req, res): Promise<void> => {
  const me = req.player!;
  const membership = await myMembership(me.id);
  if (!membership) {
    res.status(400).json({ message: "You're not in a clan" });
    return;
  }
  const query = GetClanMessagesQueryParams.safeParse(req.query);
  const after = query.success ? query.data.after : undefined;
  const [clan] = await db
    .select({ name: clansTable.name, color: clansTable.color, rainbowOwnerId: clansTable.rainbowOwnerId, banned: clansTable.banned })
    .from(clansTable)
    .where(eq(clansTable.id, membership.clanId))
    .limit(1);
  if (clan?.banned) {
    res.status(400).json({ message: "You're not in a clan" });
    return;
  }
  const base = db
    .select({
      id: clanMessagesTable.id,
      playerId: clanMessagesTable.playerId,
      author: playersTable.username,
      avatarBlook: playersTable.avatarBlook,
      customAvatarUrl: playersTable.customAvatarUrl,
      badges: playersTable.badges,
      nameEffect: playersTable.nameEffect,
      chatColor: playersTable.chatColor,
      content: clanMessagesTable.content,
      createdAt: clanMessagesTable.createdAt,
    })
    .from(clanMessagesTable)
    .innerJoin(playersTable, eq(clanMessagesTable.playerId, playersTable.id));
  const rows =
    after !== undefined
      ? await base
          .where(
            and(
              eq(clanMessagesTable.clanId, membership.clanId),
              gt(clanMessagesTable.id, after),
            ),
          )
          .orderBy(asc(clanMessagesTable.id))
          .limit(200)
      : (
          await base
            .where(eq(clanMessagesTable.clanId, membership.clanId))
            .orderBy(desc(clanMessagesTable.id))
            .limit(200)
        ).reverse();
  const result = rows.map((r) => ({
    id: r.id,
    author: r.author,
    avatarBlook: r.avatarBlook,
    avatarImage: playerAvatarImage(r.avatarBlook, r.author, r.customAvatarUrl),
    badges: badgeViews(r.badges),
    nameEffect: r.nameEffect ?? null,
    chatColor: r.chatColor ?? null,
    content: r.content,
    mentions: [],
    isMine: r.playerId === me.id,
    createdAt: r.createdAt.toISOString(),
    clanName: clan?.name ?? null,
    clanColor: clan ? (clan.rainbowOwnerId !== null ? "rainbow" : clan.color) : null,
  }));
  res.json(GetClanMessagesResponse.parse(result));
});

router.post("/clans/chat", async (req, res): Promise<void> => {
  const parsed = SendClanMessageBody.safeParse(req.body);
  if (!parsed.success || parsed.data.content.trim().length === 0) {
    res.status(400).json({ message: "Message can't be empty" });
    return;
  }
  const me = req.player!;
  if (me.muted) {
    res.status(403).json({ message: "You are muted and can't send chat messages" });
    return;
  }
  if (containsLink(parsed.data.content) && !(await areLinksAllowed())) {
    res.status(400).json({ message: "Links aren't allowed in chat" });
    return;
  }
  const membership = await myMembership(me.id);
  if (!membership) {
    res.status(400).json({ message: "You're not in a clan" });
    return;
  }
  const [clan] = await db
    .select({ name: clansTable.name, color: clansTable.color, rainbowOwnerId: clansTable.rainbowOwnerId, banned: clansTable.banned })
    .from(clansTable)
    .where(eq(clansTable.id, membership.clanId))
    .limit(1);
  if (clan?.banned) {
    res.status(400).json({ message: "You're not in a clan" });
    return;
  }
  const [msg] = await db
    .insert(clanMessagesTable)
    .values({
      clanId: membership.clanId,
      playerId: me.id,
      content: parsed.data.content.trim(),
    })
    .returning();
  res.status(201).json(
    SendClanMessageResponse.parse({
      id: msg!.id,
      author: me.username,
      avatarBlook: me.avatarBlook,
      avatarImage: playerAvatarImage(me.avatarBlook, me.username, me.customAvatarUrl),
      badges: badgeViews(me.badges),
      nameEffect: me.nameEffect ?? null,
      chatColor: me.chatColor ?? null,
      content: msg!.content,
      mentions: [],
      isMine: true,
      createdAt: msg!.createdAt.toISOString(),
      clanName: clan?.name ?? null,
      clanColor: clan ? (clan.rainbowOwnerId !== null ? "rainbow" : clan.color) : null,
    }),
  );
});

router.get("/clans/:clanId", async (req, res): Promise<void> => {
  const me = req.player!;
  const clanId = Number.parseInt(req.params.clanId ?? "", 10);
  if (!Number.isInteger(clanId)) {
    res.status(404).json({ message: "Clan not found" });
    return;
  }
  const [clan] = await db
    .select({
      id: clansTable.id,
      name: clansTable.name,
      color: clansTable.color,
      imageUrl: clansTable.imageUrl,
      description: clansTable.description,
      experience: clansTable.experience,
      rainbowOwnerId: clansTable.rainbowOwnerId,
      ownerId: clansTable.ownerId,
      ownerUsername: playersTable.username,
    })
    .from(clansTable)
    .innerJoin(playersTable, eq(clansTable.ownerId, playersTable.id))
    .where(and(eq(clansTable.id, clanId), eq(clansTable.banned, false)))
    .limit(1);
  if (!clan) {
    res.status(404).json({ message: "Clan not found" });
    return;
  }
  const members = await db
    .select({
      username: playersTable.username,
      role: clanMembersTable.role,
      avatarBlook: playersTable.avatarBlook,
      customAvatarUrl: playersTable.customAvatarUrl,
    })
    .from(clanMembersTable)
    .innerJoin(playersTable, eq(clanMembersTable.playerId, playersTable.id))
    .where(eq(clanMembersTable.clanId, clanId))
    .orderBy(asc(clanMembersTable.id));
  const heldRows = await db
    .select({
      id: clanHeldBlooksTable.id,
      blookName: clanHeldBlooksTable.blookName,
      placedAt: clanHeldBlooksTable.placedAt,
      withdrawableAt: clanHeldBlooksTable.withdrawableAt,
      ownerId: clanHeldBlooksTable.ownerId,
      ownerUsername: playersTable.username,
      ownerAvatarBlook: playersTable.avatarBlook,
      ownerCustomAvatarUrl: playersTable.customAvatarUrl,
    })
    .from(clanHeldBlooksTable)
    .innerJoin(playersTable, eq(clanHeldBlooksTable.ownerId, playersTable.id))
    .where(eq(clanHeldBlooksTable.clanId, clanId))
    .orderBy(asc(clanHeldBlooksTable.id));
  const now = Date.now();
  // Duplicate-Mystical classification, derived ONCE from the stable id
  // ordering of the raw held rows and reused by the cards, the
  // active-effects list, AND the production summary. It is FUNCTIONAL: the
  // first copy of each Mystical is aura-only, duplicates pay the mine — the
  // settle sweep derives the same classification from the same id order.
  const duplicateMystical = new Map<number, boolean>();
  {
    const seen = new Map<string, number>();
    for (const held of heldRows) {
      const prior = seen.get(held.blookName) ?? 0;
      seen.set(held.blookName, prior + 1);
      duplicateMystical.set(
        held.id,
        getBlookDef(held.blookName)?.rarity === "Mystical" &&
          (prior > 0 || !hasMysticalAura(held.blookName)),
      );
    }
  }
  const heldBlooks = heldRows
    .map((held) => {
      const def = getBlookDef(held.blookName);
      if (!def) return null;
      return {
        id: held.id,
        blookName: held.blookName,
        rarity: def.rarity,
        image: def.image,
        ownerUsername: held.ownerUsername,
        ownerAvatarImage: playerAvatarImage(held.ownerAvatarBlook, held.ownerUsername, held.ownerCustomAvatarUrl),
        placedAt: held.placedAt.toISOString(),
        withdrawableAt: held.withdrawableAt.toISOString(),
        canWithdraw: held.ownerId === me.id && held.withdrawableAt.getTime() <= now,
        effect: clanEffectForBlook(held.blookName, def.rarity, duplicateMystical.get(held.id) ?? false)?.ability ?? null,
      };
    })
    .filter((held): held is NonNullable<typeof held> => held !== null);
  const myStatus = await myStatusForClan(me.id, clanId);
  let pendingApplications: { username: string; avatarImage: string | null }[] = [];
  if (clan.ownerId === me.id) {
    const apps = await db
      .select({
        username: playersTable.username,
        avatarBlook: playersTable.avatarBlook,
        customAvatarUrl: playersTable.customAvatarUrl,
      })
      .from(clanApplicationsTable)
      .innerJoin(playersTable, eq(clanApplicationsTable.playerId, playersTable.id))
      .where(
        and(
          eq(clanApplicationsTable.clanId, clanId),
          eq(clanApplicationsTable.status, "pending"),
        ),
      )
      .orderBy(asc(clanApplicationsTable.id));
    pendingApplications = apps.map((a) => ({
      username: a.username,
      avatarImage: playerAvatarImage(a.avatarBlook, a.username, a.customAvatarUrl),
    }));
  }
  // Auras are listed as active effects: Mystical powers dedupe by key (they
  // never stack), while the Uncommon charm keeps one chip whose label shows
  // the stacked total across every held copy. The mine's aggregate production
  // is summarized by heldProduction, not one chip per rarity.
  const activeEffectsByKey = new Map<string, { key: string; label: string; description: string }>();
  let uncommonCharmCount = 0;
  for (const held of heldBlooks) {
    const effect = clanEffectForBlook(held.blookName, held.rarity, duplicateMystical.get(held.id) ?? false);
    if (effect.kind !== "aura") continue;
    if (effect.key === UNCOMMON_CHARM_KEY) {
      uncommonCharmCount += 1;
      continue;
    }
    activeEffectsByKey.set(effect.key, {
      key: effect.key,
      label: effect.label,
      description: effect.description,
    });
  }
  if (uncommonCharmCount > 0) {
    const total = parseFloat((uncommonCharmCount * UNCOMMON_HELD_LUCK_BONUS).toFixed(3));
    activeEffectsByKey.set(UNCOMMON_CHARM_KEY, {
      key: UNCOMMON_CHARM_KEY,
      label:
        uncommonCharmCount === 1
          ? `Uncommon Charm — +${total}x Pack Luck`
          : `Uncommon Charm ×${uncommonCharmCount} — +${total}x Pack Luck`,
      description: `Each held Uncommon adds +${UNCOMMON_HELD_LUCK_BONUS}x pack luck for all members — this clan's ${uncommonCharmCount} stack to +${total}x.`,
    });
  }
  const mineEntries = heldBlooks
    .map((held) => ({
      placedAt: new Date(held.placedAt),
      ratePerHour: heldMineRatePerHour(held.rarity, duplicateMystical.get(held.id) ?? false),
    }))
    .filter((entry) => entry.ratePerHour > 0);
  // Mine pay auto-deposits on a server sweep (autoCollectHeldMines), so
  // there is no claim state to read — members see the live per-member rate,
  // outsiders just the public paying count.
  const heldProduction = {
    payingCount: mineEntries.length,
    ratePerHour:
      myStatus === "member" || myStatus === "owner"
        ? mineEntries.reduce((sum, entry) => sum + entry.ratePerHour, 0)
        : 0,
  };
  res.json(
    GetClanResponse.parse({
      id: clan.id,
      name: clan.name,
      color: clan.color,
      imageUrl: clan.imageUrl,
      description: clan.description,
      ownerUsername: clan.ownerUsername,
      myStatus,
      experience: clan.experience,
      level: levelForExp(clan.experience),
      rainbow: clan.rainbowOwnerId !== null,
      rainbowMine: clan.rainbowOwnerId === me.id,
      members: members.map((m) => ({
        username: m.username,
        role: m.role,
        avatarImage: playerAvatarImage(m.avatarBlook, m.username, m.customAvatarUrl),
      })),
      pendingApplications,
      heldBlooks,
      heldProduction,
      activeEffects: [...activeEffectsByKey.values()],
    }),
  );
});

router.post("/clans/:clanId/held-blooks", async (req, res): Promise<void> => {
  const params = PlaceClanHeldBlookParams.safeParse(req.params);
  const parsed = PlaceClanHeldBlookBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Invalid held blook placement" });
    return;
  }
  // Every requested name must be a real blook before anything is consumed. A
  // name may repeat to place several copies in one batch.
  const defs: { name: string }[] = [];
  for (const name of parsed.data.blookNames) {
    const def = getBlookDef(name);
    if (!def) {
      res.status(400).json({ message: "Unknown blook" });
      return;
    }
    // Grant-only trophies and the 1k gamble blook stay out of clan holds.
    if (isClanHoldBanned(def.pack)) {
      res.status(400).json({ message: `${name} can't be placed in a clan hold` });
      return;
    }
    defs.push(def);
  }
  const me = req.player!;
  const result = await db.transaction(async (tx) => {
    // Player first is the shared ordering for actions that consume inventory.
    await tx
      .select({ id: playersTable.id })
      .from(playersTable)
      .where(eq(playersTable.id, me.id))
      .for("update");
    const [clan] = await tx
      .select({ id: clansTable.id })
      .from(clansTable)
      .where(and(eq(clansTable.id, params.data.clanId), eq(clansTable.banned, false)))
      .for("update");
    if (!clan) return { ok: false as const, error: "Clan not found" };
    const [membership] = await tx
      .select({ id: clanMembersTable.id })
      .from(clanMembersTable)
      .where(and(eq(clanMembersTable.clanId, clan.id), eq(clanMembersTable.playerId, me.id)))
      .limit(1);
    if (!membership) return { ok: false as const, error: "You must be in this clan" };
    const results: { blookName: string; outcome: "held" | "lost" | "unavailable" }[] = [];
    const withdrawableAt = new Date(Date.now() + CLAN_HELD_LOCK_MS);
    let anyDepleted = false;
    for (const def of defs) {
      // Consume one copy race-safely; a copy the player no longer owns is
      // skipped as "unavailable" instead of failing the whole batch.
      const [removed] = await tx
        .update(ownedBlooksTable)
        .set({ quantity: sql`${ownedBlooksTable.quantity} - 1` })
        .where(
          and(
            eq(ownedBlooksTable.playerId, me.id),
            eq(ownedBlooksTable.blookName, def.name),
            sql`${ownedBlooksTable.quantity} >= 1`,
          ),
        )
        .returning({ id: ownedBlooksTable.id, quantity: ownedBlooksTable.quantity });
      if (!removed) {
        results.push({ blookName: def.name, outcome: "unavailable" });
        continue;
      }
      if (removed.quantity === 0) {
        await tx.delete(ownedBlooksTable).where(eq(ownedBlooksTable.id, removed.id));
        anyDepleted = true;
      }
      // Risk is resolved only after safely consuming the source blook, and
      // each copy rolls independently. A loss is permanent by design and
      // never creates a hidden, recoverable hold row.
      if (Math.random() < 0.05) {
        results.push({ blookName: def.name, outcome: "lost" });
        continue;
      }
      await tx.insert(clanHeldBlooksTable).values({
        clanId: clan.id,
        ownerId: me.id,
        blookName: def.name,
        withdrawableAt,
      });
      results.push({ blookName: def.name, outcome: "held" });
    }
    if (anyDepleted) await syncCollectorBadge(me.id, tx);
    return { ok: true as const, results, withdrawableAt };
  });
  if (!result.ok) {
    res.status(400).json({ message: result.error });
    return;
  }
  const heldCount = result.results.filter((r) => r.outcome === "held").length;
  const lostCount = result.results.filter((r) => r.outcome === "lost").length;
  req.log.info(
    { clanId: params.data.clanId, requested: result.results.length, held: heldCount, lost: lostCount },
    "Clan blook placement resolved",
  );
  res.json(
    PlaceClanHeldBlookResponse.parse({
      results: result.results,
      heldCount,
      lostCount,
      withdrawableAt: heldCount > 0 ? result.withdrawableAt.toISOString() : null,
    }),
  );
});

router.post("/clans/:clanId/held-blooks/:heldBlookId/withdraw", async (req, res): Promise<void> => {
  const params = WithdrawClanHeldBlookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "Invalid held blook" });
    return;
  }
  const me = req.player!;
  // Cheap unlocked pre-check so only the row's owner with an unlocked
  // commitment can trigger the clan-wide settlement below — otherwise any
  // player could hammer arbitrary clan IDs into serial settle work. The
  // transaction re-checks all of this under FOR UPDATE as the authority.
  const [preCheck] = await db
    .select({
      ownerId: clanHeldBlooksTable.ownerId,
      withdrawableAt: clanHeldBlooksTable.withdrawableAt,
    })
    .from(clanHeldBlooksTable)
    .where(
      and(
        eq(clanHeldBlooksTable.id, params.data.heldBlookId),
        eq(clanHeldBlooksTable.clanId, params.data.clanId),
      ),
    );
  if (!preCheck || preCheck.ownerId !== me.id) {
    res.status(400).json({ message: "That held blook isn't yours" });
    return;
  }
  if (preCheck.withdrawableAt.getTime() > Date.now()) {
    res.status(400).json({ message: "This blook is still locked for its seven-day commitment" });
    return;
  }
  // Pay out everyone's accrued mine tokens at the PRE-withdraw rates first.
  // Removing a copy lowers the clan's total rate — and withdrawing the FIRST
  // copy of a Mystical promotes a duplicate to aura duty, dropping its
  // 75/hr mine to 0. Settling after the delete would reprice the whole
  // unsettled interval at the reduced rates. If settlement throws, the
  // request aborts before anything is deleted (retry-safe).
  await settleClanMembersMines(params.data.clanId);
  const result = await db.transaction(async (tx) => {
    await tx
      .select({ id: playersTable.id })
      .from(playersTable)
      .where(eq(playersTable.id, me.id))
      .for("update");
    const [held] = await tx
      .select()
      .from(clanHeldBlooksTable)
      .where(
        and(
          eq(clanHeldBlooksTable.id, params.data.heldBlookId),
          eq(clanHeldBlooksTable.clanId, params.data.clanId),
        ),
      )
      .for("update");
    if (!held || held.ownerId !== me.id) {
      return { ok: false as const, error: "That held blook isn't yours" };
    }
    if (held.withdrawableAt.getTime() > Date.now()) {
      return { ok: false as const, error: "This blook is still locked for its seven-day commitment" };
    }
    await addBlookToPlayer(me.id, held.blookName, 1, tx);
    await tx.delete(clanHeldBlooksTable).where(eq(clanHeldBlooksTable.id, held.id));
    return { ok: true as const, blookName: held.blookName };
  });
  if (!result.ok) {
    res.status(400).json({ message: result.error });
    return;
  }
  res.json(
    WithdrawClanHeldBlookResponse.parse({
      blookName: result.blookName,
      message: "Blook returned to your collection",
    }),
  );
});


// Spend one clan boost (from the starter bundle) to raise the clan 10 levels.
router.post("/clans/:clanId/boost", async (req, res): Promise<void> => {
  const me = req.player!;
  const clanId = Number.parseInt(req.params.clanId ?? "", 10);
  if (!Number.isInteger(clanId)) {
    res.status(404).json({ message: "Clan not found" });
    return;
  }
  const [membership] = await db
    .select({ clanId: clanMembersTable.clanId })
    .from(clanMembersTable)
    .where(and(eq(clanMembersTable.playerId, me.id), eq(clanMembersTable.clanId, clanId)))
    .limit(1);
  if (!membership) {
    res.status(400).json({ message: "You can only boost your own clan" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    // Lock the clan row FIRST — if the clan vanished, no boost is spent.
    const [clan] = await tx
      .select({ experience: clansTable.experience })
      .from(clansTable)
      .where(eq(clansTable.id, clanId))
      .for("update");
    if (!clan) return null;
    // Consume one boost race-safely.
    const spent = await tx
      .update(playersTable)
      .set({ clanBoosts: sql`${playersTable.clanBoosts} - 1` })
      .where(and(eq(playersTable.id, me.id), sql`${playersTable.clanBoosts} >= 1`))
      .returning({ clanBoosts: playersTable.clanBoosts });
    if (spent.length === 0) return null;
    // Raise the clan exactly 10 levels: level = floor(sqrt(exp/100)) + 1, so
    // exp for level L is 100*(L-1)^2.
    const targetLevel = levelForExp(clan.experience) + 10;
    const newExp = Math.max(clan.experience, 100 * (targetLevel - 1) ** 2);
    await tx
      .update(clansTable)
      .set({ experience: newExp })
      .where(eq(clansTable.id, clanId));
    return { experience: newExp, boostsLeft: spent[0]!.clanBoosts };
  });
  if (!result) {
    res.status(400).json({ message: "You don't have any clan boosts. Get one from the store!" });
    return;
  }
  res.json(
    BoostClanResponse.parse({
      level: levelForExp(result.experience),
      experience: result.experience,
      clanBoostsLeft: result.boostsLeft,
    }),
  );
});

// Apply or remove the rainbow clan name perk (from the starter bundle).
// Applying requires owning the clan; the perk is movable — remove it and
// re-apply it to any clan you own later.
router.post("/clans/:clanId/rainbow", async (req, res): Promise<void> => {
  const me = req.player!;
  const clanId = Number.parseInt(req.params.clanId ?? "", 10);
  const parsed = SetClanRainbowBody.safeParse(req.body);
  if (!parsed.success || !Number.isInteger(clanId)) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const [clan] = await db
    .select({ id: clansTable.id, ownerId: clansTable.ownerId, rainbowOwnerId: clansTable.rainbowOwnerId })
    .from(clansTable)
    .where(eq(clansTable.id, clanId))
    .limit(1);
  if (!clan) {
    res.status(404).json({ message: "Clan not found" });
    return;
  }
  if (parsed.data.apply) {
    if (clan.ownerId !== me.id) {
      res.status(403).json({ message: "Only the clan owner can apply a rainbow name" });
      return;
    }
    if (clan.rainbowOwnerId !== null) {
      res.status(400).json({ message: "This clan already has a rainbow name" });
      return;
    }
    const applied = await db.transaction(async (tx) => {
      const spent = await tx
        .update(playersTable)
        .set({ rainbowPerks: sql`${playersTable.rainbowPerks} - 1` })
        .where(and(eq(playersTable.id, me.id), sql`${playersTable.rainbowPerks} >= 1`))
        .returning({ rainbowPerks: playersTable.rainbowPerks });
      if (spent.length === 0) return null;
      const updated = await tx
        .update(clansTable)
        .set({ rainbowOwnerId: me.id })
        .where(and(eq(clansTable.id, clanId), sql`${clansTable.rainbowOwnerId} IS NULL`))
        .returning({ id: clansTable.id });
      if (updated.length === 0) throw new Error("rainbow already applied");
      return spent[0]!.rainbowPerks;
    }).catch(() => null);
    if (applied === null) {
      res.status(400).json({ message: "You don't have a rainbow perk. Get one from the store!" });
      return;
    }
    res.json(SetClanRainbowResponse.parse({ rainbow: true, rainbowPerksLeft: applied }));
    return;
  }
  // Remove: only the player whose perk is on the clan can take it back.
  if (clan.rainbowOwnerId !== me.id) {
    res.status(403).json({ message: "The rainbow on this clan isn't yours" });
    return;
  }
  const perksLeft = await db.transaction(async (tx) => {
    const removed = await tx
      .update(clansTable)
      .set({ rainbowOwnerId: null })
      .where(and(eq(clansTable.id, clanId), eq(clansTable.rainbowOwnerId, me.id)))
      .returning({ id: clansTable.id });
    if (removed.length === 0) throw new Error("already removed");
    const [p] = await tx
      .update(playersTable)
      .set({ rainbowPerks: sql`${playersTable.rainbowPerks} + 1` })
      .where(eq(playersTable.id, me.id))
      .returning({ rainbowPerks: playersTable.rainbowPerks });
    return p!.rainbowPerks;
  }).catch(() => null);
  if (perksLeft === null) {
    res.status(400).json({ message: "The rainbow was already removed" });
    return;
  }
  res.json(SetClanRainbowResponse.parse({ rainbow: false, rainbowPerksLeft: perksLeft }));
});

router.post("/clans/:clanId/image", async (req, res): Promise<void> => {
  const me = req.player!;
  const clanId = Number.parseInt(req.params.clanId ?? "", 10);
  const parsed = SetClanImageBody.safeParse(req.body);
  if (!parsed.success || !Number.isInteger(clanId)) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const [clan] = await db
    .select({ id: clansTable.id, ownerId: clansTable.ownerId })
    .from(clansTable)
    .where(eq(clansTable.id, clanId))
    .limit(1);
  if (!clan) {
    res.status(400).json({ message: "Clan not found" });
    return;
  }
  if (clan.ownerId !== me.id) {
    res.status(403).json({ message: "Only the clan owner can change the image" });
    return;
  }
  const check = await validateUploadedImage(parsed.data.imagePath, me.id);
  if (!check.ok) {
    res.status(400).json({ message: check.message });
    return;
  }
  await db
    .update(clansTable)
    .set({ imageUrl: check.path })
    .where(eq(clansTable.id, clanId));
  res.json({ message: "Clan image updated" });
});

router.post("/clans/:clanId/description", async (req, res): Promise<void> => {
  const me = req.player!;
  const clanId = Number.parseInt(req.params.clanId ?? "", 10);
  const parsed = SetClanDescriptionBody.safeParse(req.body);
  if (!parsed.success || !Number.isInteger(clanId)) {
    res.status(400).json({ message: "Description must be at most 100 characters" });
    return;
  }
  // Collapse all whitespace (newlines, runs of spaces) so descriptions
  // always render as one compact paragraph.
  const description = parsed.data.description.replace(/\s+/g, " ").trim();
  if (description.length > 100) {
    res.status(400).json({ message: "Description must be at most 100 characters" });
    return;
  }
  if (containsLink(description)) {
    res.status(400).json({ message: "Links aren't allowed in clan descriptions" });
    return;
  }
  const [clan] = await db
    .select({ id: clansTable.id, ownerId: clansTable.ownerId })
    .from(clansTable)
    .where(eq(clansTable.id, clanId))
    .limit(1);
  if (!clan) {
    res.status(400).json({ message: "Clan not found" });
    return;
  }
  if (clan.ownerId !== me.id) {
    res.status(403).json({ message: "Only the clan owner can edit the description" });
    return;
  }
  await db
    .update(clansTable)
    .set({ description: description.length > 0 ? description : null })
    .where(eq(clansTable.id, clanId));
  res.json({ message: "Clan description updated" });
});

router.post("/clans/:clanId/rename", async (req, res): Promise<void> => {
  const me = req.player!;
  const clanId = Number.parseInt(req.params.clanId ?? "", 10);
  const parsed = RenameClanBody.safeParse(req.body);
  if (!parsed.success || !Number.isInteger(clanId)) {
    res.status(400).json({ message: "Clan name must be 1-20 characters" });
    return;
  }
  const name = parsed.data.name.trim();
  if (name.length === 0 || name.length > 20) {
    res.status(400).json({ message: "Clan name must be 1-20 characters" });
    return;
  }
  if (containsLink(name)) {
    res.status(400).json({ message: "Links aren't allowed in clan names" });
    return;
  }
  const [clan] = await db
    .select({ id: clansTable.id, ownerId: clansTable.ownerId })
    .from(clansTable)
    .where(eq(clansTable.id, clanId))
    .limit(1);
  if (!clan) {
    res.status(400).json({ message: "Clan not found" });
    return;
  }
  if (clan.ownerId !== me.id) {
    res.status(403).json({ message: "Only the clan owner can rename the clan" });
    return;
  }
  try {
    await db
      .update(clansTable)
      .set({ name })
      .where(eq(clansTable.id, clanId));
  } catch (err: unknown) {
    const code =
      (err as { code?: string })?.code ??
      ((err as { cause?: { code?: string } })?.cause?.code);
    if (code === "23505") {
      res.status(400).json({ message: "That clan name is taken" });
      return;
    }
    throw err;
  }
  res.json({ message: "Clan renamed" });
});

router.post("/clans/:clanId/apply", async (req, res): Promise<void> => {
  const me = req.player!;
  const clanId = Number.parseInt(req.params.clanId ?? "", 10);
  const [clan] = Number.isInteger(clanId)
    ? await db.select({ id: clansTable.id }).from(clansTable).where(and(eq(clansTable.id, clanId), eq(clansTable.banned, false))).limit(1)
    : [];
  if (!clan) {
    res.status(400).json({ message: "Clan not found" });
    return;
  }
  if (await myMembership(me.id)) {
    res.status(400).json({ message: "You're already in a clan" });
    return;
  }
  const status = await myStatusForClan(me.id, clanId);
  if (status === "pending" || status === "accepted") {
    res.status(400).json({ message: "You already applied to this clan" });
    return;
  }
  // One row per (clan, player): re-applying after a rejection (or after
  // leaving) resets the row to pending. Unique index makes this race-safe.
  await db
    .insert(clanApplicationsTable)
    .values({ clanId, playerId: me.id, status: "pending" })
    .onConflictDoUpdate({
      target: [clanApplicationsTable.clanId, clanApplicationsTable.playerId],
      set: { status: "pending" },
      setWhere: sql`${clanApplicationsTable.status} IN ('rejected', 'joined')`,
    });
  res.json({ message: "Application sent" });
});

router.post("/clans/:clanId/applications", async (req, res): Promise<void> => {
  const me = req.player!;
  const clanId = Number.parseInt(req.params.clanId ?? "", 10);
  const parsed = DecideClanApplicationBody.safeParse(req.body);
  if (!parsed.success || !Number.isInteger(clanId)) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const [clan] = await db
    .select({ id: clansTable.id, ownerId: clansTable.ownerId })
    .from(clansTable)
    .where(eq(clansTable.id, clanId))
    .limit(1);
  if (!clan) {
    res.status(400).json({ message: "Clan not found" });
    return;
  }
  if (clan.ownerId !== me.id) {
    res.status(403).json({ message: "Only the clan owner can manage applications" });
    return;
  }
  const [applicant] = await db
    .select({ id: playersTable.id })
    .from(playersTable)
    .where(eq(playersTable.username, parsed.data.username))
    .limit(1);
  if (!applicant) {
    res.status(400).json({ message: "Player not found" });
    return;
  }
  const updated = await db
    .update(clanApplicationsTable)
    .set({ status: parsed.data.action === "accept" ? "accepted" : "rejected" })
    .where(
      and(
        eq(clanApplicationsTable.clanId, clanId),
        eq(clanApplicationsTable.playerId, applicant.id),
        eq(clanApplicationsTable.status, "pending"),
      ),
    )
    .returning({ id: clanApplicationsTable.id });
  if (updated.length === 0) {
    res.status(400).json({ message: "No pending application from that player" });
    return;
  }
  res.json({
    message: parsed.data.action === "accept" ? "Application accepted" : "Application rejected",
  });
});

router.post("/clans/:clanId/transfer", async (req, res): Promise<void> => {
  const me = req.player!;
  const clanId = Number.parseInt(req.params.clanId ?? "", 10);
  const parsed = TransferClanOwnershipBody.safeParse(req.body);
  if (!parsed.success || !Number.isInteger(clanId)) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const [target] = await db
    .select({ id: playersTable.id, username: playersTable.username })
    .from(playersTable)
    .where(eq(playersTable.username, parsed.data.username))
    .limit(1);
  if (!target) {
    res.status(400).json({ message: "Player not found" });
    return;
  }
  if (target.id === me.id) {
    res.status(400).json({ message: "You already own this clan" });
    return;
  }
  try {
    await db.transaction(async (tx) => {
      // Lock the clan row so concurrent transfers can't race.
      const [clan] = await tx
        .select({ id: clansTable.id, ownerId: clansTable.ownerId })
        .from(clansTable)
        .where(eq(clansTable.id, clanId))
        .for("update");
      if (!clan) throw new Error("NO_CLAN");
      if (clan.ownerId !== me.id) throw new Error("NOT_OWNER");
      const [targetMembership] = await tx
        .select({ id: clanMembersTable.id })
        .from(clanMembersTable)
        .where(
          and(
            eq(clanMembersTable.clanId, clanId),
            eq(clanMembersTable.playerId, target.id),
          ),
        )
        .limit(1);
      if (!targetMembership) throw new Error("NOT_A_MEMBER");
      await tx
        .update(clansTable)
        .set({ ownerId: target.id })
        .where(eq(clansTable.id, clanId));
      await tx
        .update(clanMembersTable)
        .set({ role: "owner" })
        .where(
          and(
            eq(clanMembersTable.clanId, clanId),
            eq(clanMembersTable.playerId, target.id),
          ),
        );
      await tx
        .update(clanMembersTable)
        .set({ role: "member" })
        .where(
          and(
            eq(clanMembersTable.clanId, clanId),
            eq(clanMembersTable.playerId, me.id),
          ),
        );
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === "NO_CLAN") {
        res.status(400).json({ message: "Clan not found" });
        return;
      }
      if (err.message === "NOT_OWNER") {
        res.status(403).json({ message: "Only the clan owner can transfer ownership" });
        return;
      }
      if (err.message === "NOT_A_MEMBER") {
        res.status(400).json({ message: "That player isn't in your clan" });
        return;
      }
    }
    throw err;
  }
  res.json({ message: `${target.username} is now the clan owner` });
});

router.post("/clans/:clanId/kick", async (req, res): Promise<void> => {
  const me = req.player!;
  const clanId = Number.parseInt(req.params.clanId ?? "", 10);
  const parsed = KickClanMemberBody.safeParse(req.body);
  if (!parsed.success || !Number.isInteger(clanId)) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const [clan] = await db
    .select({ id: clansTable.id, ownerId: clansTable.ownerId })
    .from(clansTable)
    .where(eq(clansTable.id, clanId))
    .limit(1);
  if (!clan) {
    res.status(400).json({ message: "Clan not found" });
    return;
  }
  if (clan.ownerId !== me.id) {
    res.status(403).json({ message: "Only the clan owner can kick members" });
    return;
  }
  const [target] = await db
    .select({ id: playersTable.id })
    .from(playersTable)
    .where(eq(playersTable.username, parsed.data.username))
    .limit(1);
  if (!target) {
    res.status(400).json({ message: "Player not found" });
    return;
  }
  if (target.id === me.id) {
    res.status(400).json({ message: "You can't kick yourself — leave the clan instead" });
    return;
  }
  // Pay out accrued mine tokens BEFORE removing the member — deleting the
  // membership row destroys their mine clock, which would silently forfeit
  // up to 24h of banked earnings. If settlement throws, the kick aborts
  // (retry-safe), matching the leave/disband invariant.
  await settleClanMembersMines(clanId);
  // Remove membership and delete their application row so they must
  // re-apply (and be re-accepted) to rejoin.
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(clanMembersTable)
      .where(
        and(
          eq(clanMembersTable.clanId, clanId),
          eq(clanMembersTable.playerId, target.id),
        ),
      )
      .returning({ playerId: clanMembersTable.playerId });
    if (removed.length === 0) {
      throw new Error("NOT_A_MEMBER");
    }
    await tx
      .delete(clanApplicationsTable)
      .where(
        and(
          eq(clanApplicationsTable.clanId, clanId),
          eq(clanApplicationsTable.playerId, target.id),
        ),
      );
  }).catch((err: unknown) => {
    if (err instanceof Error && err.message === "NOT_A_MEMBER") {
      res.status(400).json({ message: "That player isn't in your clan" });
      return;
    }
    throw err;
  });
  if (res.headersSent) return;
  res.json({ message: `${parsed.data.username} was kicked from the clan` });
});

router.post("/clans/:clanId/join", async (req, res): Promise<void> => {
  const me = req.player!;
  const clanId = Number.parseInt(req.params.clanId ?? "", 10);
  if (!Number.isInteger(clanId)) {
    res.status(400).json({ message: "Clan not found" });
    return;
  }
  if (await myMembership(me.id)) {
    res.status(400).json({ message: "You're already in a clan" });
    return;
  }
  // Held blooks follow their owner: find clans still holding my commitments
  // (left/kicked players' rows stay behind until they join somewhere new).
  const myHeldClans = await db
    .selectDistinct({ clanId: clanHeldBlooksTable.clanId })
    .from(clanHeldBlooksTable)
    .where(and(eq(clanHeldBlooksTable.ownerId, me.id), ne(clanHeldBlooksTable.clanId, clanId)));
  if (myHeldClans.length > 0) {
    // Pay out accrued mine tokens at PRE-move rates on BOTH sides before the
    // rows change clans (same settle-before-rate-change discipline as
    // withdraw/kick): the old clan loses my auras/mine copies, the new clan
    // gains them. If settlement throws, the join aborts (retry-safe).
    for (const held of myHeldClans) {
      await settleClanMembersMines(held.clanId);
    }
    await settleClanMembersMines(clanId);
  }
  let movedCount = 0;
  // Atomic one-time join: consume the accepted application and insert
  // membership in one transaction. Rejoining after leaving requires a
  // fresh application + acceptance.
  try {
    await db.transaction(async (tx) => {
      // Lock the clan row so concurrent joins serialize and can't
      // oversubscribe past the member cap. Banned clans can't be joined.
      const locked = await tx.execute(
        sql`SELECT id FROM clans WHERE id = ${clanId} AND banned = false FOR UPDATE`,
      );
      if (locked.rows.length === 0) {
        throw new Error("CLAN_GONE");
      }
      const [{ count }] = (await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(clanMembersTable)
        .where(eq(clanMembersTable.clanId, clanId))) as [{ count: number }];
      if (count >= MAX_CLAN_MEMBERS) {
        throw new Error("CLAN_FULL");
      }
      const consumed = await tx
        .update(clanApplicationsTable)
        .set({ status: "joined" })
        .where(
          and(
            eq(clanApplicationsTable.clanId, clanId),
            eq(clanApplicationsTable.playerId, me.id),
            eq(clanApplicationsTable.status, "accepted"),
          ),
        )
        .returning({ id: clanApplicationsTable.id });
      if (consumed.length === 0) {
        throw new Error("NOT_ACCEPTED");
      }
      await tx
        .insert(clanMembersTable)
        .values({ clanId, playerId: me.id, role: "member" });
      // Migrate my held blooks into the new clan. placedAt resets to the
      // arrival time so clanmates' boost weighting can't reprice time from
      // before the blook was actually here; the 7-day withdraw lock keeps
      // its original clock (switching clans never shortens or extends it).
      const moved = await tx
        .update(clanHeldBlooksTable)
        .set({ clanId, placedAt: new Date() })
        .where(
          and(
            eq(clanHeldBlooksTable.ownerId, me.id),
            ne(clanHeldBlooksTable.clanId, clanId),
          ),
        )
        .returning({
          id: clanHeldBlooksTable.id,
          blookName: clanHeldBlooksTable.blookName,
        });
      movedCount = moved.length;
      // Demotion guard: classification is id-ordered, so an incoming
      // aura-registered Mystical with a LOWER id than the clan's existing
      // first copy takes over aura duty and flips that existing copy from
      // 0/hr aura to 75/hr duplicate. Its accrual must start NOW — with its
      // old placedAt, a member's stale collect clock (zero payouts never
      // advance it) would back-pay up to 24h of duplicate production for
      // time when the row was aura-only. Reset ONLY the previously-first
      // existing copy; existing duplicates were already paying and settled.
      const movedIdsByAuraName = new Map<string, number[]>();
      for (const row of moved) {
        const def = getBlookDef(row.blookName);
        if (def?.rarity !== "Mystical" || !hasMysticalAura(row.blookName)) continue;
        const ids = movedIdsByAuraName.get(row.blookName) ?? [];
        ids.push(row.id);
        movedIdsByAuraName.set(row.blookName, ids);
      }
      for (const [name, movedIds] of movedIdsByAuraName) {
        const [prevFirst] = await tx
          .select({ id: clanHeldBlooksTable.id })
          .from(clanHeldBlooksTable)
          .where(
            and(
              eq(clanHeldBlooksTable.clanId, clanId),
              eq(clanHeldBlooksTable.blookName, name),
              notInArray(clanHeldBlooksTable.id, movedIds),
            ),
          )
          .orderBy(asc(clanHeldBlooksTable.id))
          .limit(1);
        if (prevFirst && Math.min(...movedIds) < prevFirst.id) {
          await tx
            .update(clanHeldBlooksTable)
            .set({ placedAt: new Date() })
            .where(eq(clanHeldBlooksTable.id, prevFirst.id));
        }
      }
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "NOT_ACCEPTED") {
      res.status(400).json({ message: "Your application hasn't been accepted yet" });
      return;
    }
    if (err instanceof Error && err.message === "CLAN_GONE") {
      res.status(400).json({ message: "Clan not found" });
      return;
    }
    if (err instanceof Error && err.message === "CLAN_FULL") {
      res.status(400).json({ message: `This clan is full (max ${MAX_CLAN_MEMBERS} members)` });
      return;
    }
    const code =
      (err as { code?: string })?.code ??
      ((err as { cause?: { code?: string } })?.cause?.code);
    if (code === "23505") {
      res.status(400).json({ message: "You're already in a clan" });
      return;
    }
    throw err;
  }
  res.json({
    message:
      movedCount > 0
        ? `Welcome to the clan — ${movedCount} of your held blook${movedCount === 1 ? "" : "s"} moved with you`
        : "Welcome to the clan",
  });
});

export default router;
