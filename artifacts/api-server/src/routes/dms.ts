import { Router, type IRouter } from "express";
import { and, eq, or, sql, desc, isNull } from "drizzle-orm";
import { db, playersTable, dmMessagesTable, ownedBlooksTable, packPullsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import {
  GetDmConversationsResponse,
  GetDmThreadResponse,
  SendDmBody,
  SendDmResponse,
  ClaimDmGiftResponse,
} from "@workspace/api-zod";
import { playerAvatarImage, getBlookDef, addBlookToPlayer, containsLink, displayPackName } from "../lib/game";
import { areFriends } from "./friends";
import { rateLimit } from "../middlewares/rate-limit";

const router: IRouter = Router();

// Same pacing spirit as public chat: DMs are private but it's still a kids
// game — keep spam in check.
router.use("/dms", rateLimit({ windowMs: 10_000, max: 15 }));

type PullInfo = { blookName: string; packName: string; createdAt: Date };

function pullView(p: PullInfo | undefined) {
  if (!p) return null;
  const def = getBlookDef(p.blookName);
  return {
    blookName: p.blookName,
    image: def?.image ?? null,
    rarity: def?.rarity ?? null,
    packName: p.packName,
    pulledAt: p.createdAt.toISOString(),
  };
}

function dmView(r: {
  id: number;
  senderId: number;
  content: string;
  giftBlook: string | null;
  giftClaimedAt: Date | null;
  sharedPullId: number | null;
  createdAt: Date;
}, meId: number, pulls?: Map<number, PullInfo>) {
  const def = r.giftBlook ? getBlookDef(r.giftBlook) : undefined;
  return {
    id: r.id,
    fromMe: r.senderId === meId,
    content: r.content,
    giftBlook: r.giftBlook ?? null,
    giftImage: def?.image ?? null,
    giftRarity: def?.rarity ?? null,
    giftClaimed: !!r.giftClaimedAt,
    pull: pullView(r.sharedPullId != null ? pulls?.get(r.sharedPullId) : undefined),
    createdAt: r.createdAt.toISOString(),
  };
}

// Resolve the pack_pulls rows referenced by a batch of messages in one query.
async function loadPulls(ids: number[]): Promise<Map<number, PullInfo>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: packPullsTable.id,
      blookName: packPullsTable.blookName,
      packName: packPullsTable.packName,
      createdAt: packPullsTable.createdAt,
    })
    .from(packPullsTable)
    .where(inArray(packPullsTable.id, ids));
  // Historical rows may carry the gamble pack's old "Top" name.
  return new Map(rows.map((r) => [r.id, { ...r, packName: displayPackName(r.packName) }]));
}

async function findPlayer(username: string) {
  const [p] = await db
    .select({
      id: playersTable.id,
      username: playersTable.username,
      avatarBlook: playersTable.avatarBlook,
      customAvatarUrl: playersTable.customAvatarUrl,
      nameEffect: playersTable.nameEffect,
      chatColor: playersTable.chatColor,
      isBot: playersTable.isBot,
      banned: playersTable.banned,
    })
    .from(playersTable)
    .where(sql`lower(${playersTable.username}) = lower(${username})`);
  return p && !p.isBot ? p : undefined;
}

router.get("/dms/conversations", async (req, res): Promise<void> => {
  const me = req.player!;
  // Latest message per partner + unread count, resolved in one query.
  const rows = await db.execute(sql`
    WITH mine AS (
      SELECT *,
        CASE WHEN sender_id = ${me.id} THEN recipient_id ELSE sender_id END AS partner_id
      FROM dm_messages
      WHERE sender_id = ${me.id} OR recipient_id = ${me.id}
    ),
    latest AS (
      SELECT DISTINCT ON (partner_id) partner_id, content, gift_blook, shared_pull_id, created_at
      FROM mine ORDER BY partner_id, created_at DESC
    ),
    unread AS (
      SELECT partner_id, count(*) AS n FROM mine
      WHERE recipient_id = ${me.id} AND read_at IS NULL
      GROUP BY partner_id
    )
    SELECT l.partner_id, l.content, l.gift_blook, l.shared_pull_id, l.created_at,
      p.username, p.avatar_blook, p.custom_avatar_url, p.name_effect,
      COALESCE(u.n, 0) AS unread,
      EXISTS (
        SELECT 1 FROM friendships f WHERE f.status = 'accepted'
          AND ((f.requester_id = ${me.id} AND f.addressee_id = l.partner_id)
            OR (f.requester_id = l.partner_id AND f.addressee_id = ${me.id}))
      ) AS is_friend
    FROM latest l
    JOIN players p ON p.id = l.partner_id
    LEFT JOIN unread u ON u.partner_id = l.partner_id
    ORDER BY l.created_at DESC
  `);
  const conversations = (rows.rows as any[]).map((r) => ({
    username: r.username as string,
    avatarImage: playerAvatarImage(r.avatar_blook ?? null, r.username, r.custom_avatar_url ?? null),
    nameEffect: (r.name_effect as string | null) ?? null,
    isFriend: !!r.is_friend,
    lastMessage: (r.content as string) || (r.gift_blook ? `🎁 ${r.gift_blook}` : r.shared_pull_id ? "📦 shared a pull" : ""),
    lastAt: new Date(r.created_at).toISOString(),
    unread: Number(r.unread),
  }));
  res.json(GetDmConversationsResponse.parse({ conversations }));
});

router.get("/dms/with/:username", async (req, res): Promise<void> => {
  const me = req.player!;
  const partner = await findPlayer(req.params.username);
  if (!partner) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  const rows = await db
    .select()
    .from(dmMessagesTable)
    .where(or(
      and(eq(dmMessagesTable.senderId, me.id), eq(dmMessagesTable.recipientId, partner.id)),
      and(eq(dmMessagesTable.senderId, partner.id), eq(dmMessagesTable.recipientId, me.id)),
    ))
    .orderBy(desc(dmMessagesTable.createdAt))
    .limit(100);
  // Opening the thread marks everything they sent me as read.
  await db
    .update(dmMessagesTable)
    .set({ readAt: sql`now()` })
    .where(and(
      eq(dmMessagesTable.senderId, partner.id),
      eq(dmMessagesTable.recipientId, me.id),
      isNull(dmMessagesTable.readAt),
    ));
  res.json(GetDmThreadResponse.parse({
    partner: {
      username: partner.username,
      avatarImage: playerAvatarImage(partner.avatarBlook, partner.username, partner.customAvatarUrl),
      nameEffect: partner.nameEffect ?? null,
      chatColor: partner.chatColor ?? null,
      isFriend: await areFriends(me.id, partner.id),
    },
    messages: await (async () => {
      const pulls = await loadPulls(rows.map((r) => r.sharedPullId).filter((x): x is number => x != null));
      return rows.reverse().map((r) => dmView(r, me.id, pulls));
    })(),
  }));
});

router.post("/dms/with/:username", async (req, res): Promise<void> => {
  const me = req.player!;
  if (me.muted) {
    res.status(403).json({ message: "You are muted" });
    return;
  }
  if (me.mutedUntil && me.mutedUntil.getTime() > Date.now()) {
    const mins = Math.ceil((me.mutedUntil.getTime() - Date.now()) / 60_000);
    res.status(403).json({ message: `You are muted for ${mins} more minute${mins === 1 ? "" : "s"}` });
    return;
  }
  const parsed = SendDmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const partner = await findPlayer(req.params.username);
  if (!partner || partner.banned) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  if (partner.id === me.id) {
    res.status(400).json({ message: "You can't message yourself" });
    return;
  }
  const content = (parsed.data.content ?? "").trim();
  const giftBlook = parsed.data.giftBlook;
  const sharePullId = parsed.data.sharePullId;
  if (!content && !giftBlook && !sharePullId) {
    res.status(400).json({ message: "Message is empty" });
    return;
  }
  if (containsLink(content)) {
    res.status(400).json({ message: "Links aren't allowed" });
    return;
  }
  if (giftBlook && !getBlookDef(giftBlook)) {
    res.status(400).json({ message: "Unknown blook" });
    return;
  }
  // A shared pull is only valid proof if the pull actually belongs to the
  // sender — that's what makes the flex card "official".
  let sharedPull: PullInfo | undefined;
  if (sharePullId != null) {
    const [pull] = await db
      .select({
        id: packPullsTable.id,
        blookName: packPullsTable.blookName,
        packName: packPullsTable.packName,
        createdAt: packPullsTable.createdAt,
      })
      .from(packPullsTable)
      .where(and(eq(packPullsTable.id, sharePullId), eq(packPullsTable.playerId, me.id)));
    if (!pull) {
      res.status(400).json({ message: "That pull isn't yours to share" });
      return;
    }
    sharedPull = { ...pull, packName: displayPackName(pull.packName) };
  }
  const inserted = await db.transaction(async (tx) => {
    if (giftBlook) {
      // Escrow: take one copy from the sender now, race-safe (quantity >= 1).
      const taken = await tx
        .update(ownedBlooksTable)
        .set({ quantity: sql`${ownedBlooksTable.quantity} - 1` })
        .where(and(
          eq(ownedBlooksTable.playerId, me.id),
          eq(ownedBlooksTable.blookName, giftBlook),
          sql`${ownedBlooksTable.quantity} >= 1`,
        ))
        .returning({ id: ownedBlooksTable.id });
      if (taken.length === 0) return null;
      await tx
        .delete(ownedBlooksTable)
        .where(and(
          eq(ownedBlooksTable.playerId, me.id),
          eq(ownedBlooksTable.blookName, giftBlook),
          sql`${ownedBlooksTable.quantity} <= 0`,
        ));
    }
    const [row] = await tx
      .insert(dmMessagesTable)
      .values({
        senderId: me.id,
        recipientId: partner.id,
        content,
        giftBlook: giftBlook ?? null,
        sharedPullId: sharePullId ?? null,
      })
      .returning();
    return row!;
  });
  if (!inserted) {
    res.status(400).json({ message: "You don't have that blook" });
    return;
  }
  res.json(SendDmResponse.parse(dmView(
    inserted,
    me.id,
    sharedPull ? new Map([[sharePullId!, sharedPull]]) : undefined,
  )));
});

router.post("/dms/messages/:id/claim", async (req, res): Promise<void> => {
  const me = req.player!;
  const id = Number(req.params.id);
  // Race-safe: only one claim can flip gift_claimed_at from NULL. The claim
  // mark and the blook grant commit together — if the grant fails, the claim
  // rolls back so the gift stays claimable.
  const claimed = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(dmMessagesTable)
      .set({ giftClaimedAt: sql`now()` })
      .where(and(
        eq(dmMessagesTable.id, id),
        eq(dmMessagesTable.recipientId, me.id),
        sql`${dmMessagesTable.giftBlook} IS NOT NULL`,
        isNull(dmMessagesTable.giftClaimedAt),
      ))
      .returning({ giftBlook: dmMessagesTable.giftBlook });
    if (!row?.giftBlook) return null;
    await addBlookToPlayer(me.id, row.giftBlook, 1, tx);
    return row;
  });
  if (!claimed?.giftBlook) {
    res.status(404).json({ message: "Nothing to claim" });
    return;
  }
  const def = getBlookDef(claimed.giftBlook);
  res.json(ClaimDmGiftResponse.parse({
    message: `You got ${claimed.giftBlook}!`,
    blookName: claimed.giftBlook,
    image: def?.image ?? "",
  }));
});

export default router;
