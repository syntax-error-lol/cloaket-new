import { Router, type IRouter } from "express";
import { and, eq, or, sql, desc } from "drizzle-orm";
import { db, playersTable, friendshipsTable } from "@workspace/db";
import {
  GetFriendsResponse,
  SendFriendRequestBody,
  SendFriendRequestResponse,
} from "@workspace/api-zod";
import { playerAvatarImage } from "../lib/game";

const router: IRouter = Router();

const ONLINE_WINDOW_MS = 5 * 60_000;

router.get("/friends", async (req, res): Promise<void> => {
  const me = req.player!;
  const rows = await db
    .select({
      id: friendshipsTable.id,
      requesterId: friendshipsTable.requesterId,
      addresseeId: friendshipsTable.addresseeId,
      status: friendshipsTable.status,
      createdAt: friendshipsTable.createdAt,
      requesterName: sql<string>`req.username`,
      requesterAvatar: sql<string | null>`req.avatar_blook`,
      requesterCustomAvatar: sql<string | null>`req.custom_avatar_url`,
      requesterEffect: sql<string | null>`req.name_effect`,
      requesterSeen: sql<Date | null>`req.last_seen_at`,
      addresseeName: sql<string>`addr.username`,
      addresseeAvatar: sql<string | null>`addr.avatar_blook`,
      addresseeCustomAvatar: sql<string | null>`addr.custom_avatar_url`,
      addresseeEffect: sql<string | null>`addr.name_effect`,
      addresseeSeen: sql<Date | null>`addr.last_seen_at`,
    })
    .from(friendshipsTable)
    .innerJoin(sql`${playersTable} as req`, sql`req.id = ${friendshipsTable.requesterId}`)
    .innerJoin(sql`${playersTable} as addr`, sql`addr.id = ${friendshipsTable.addresseeId}`)
    .where(or(eq(friendshipsTable.requesterId, me.id), eq(friendshipsTable.addresseeId, me.id)))
    .orderBy(desc(friendshipsTable.createdAt));

  const friends: unknown[] = [];
  const incoming: unknown[] = [];
  const outgoing: unknown[] = [];
  for (const r of rows) {
    const iAmRequester = r.requesterId === me.id;
    const otherName = iAmRequester ? r.addresseeName : r.requesterName;
    const otherAvatar = iAmRequester ? r.addresseeAvatar : r.requesterAvatar;
    const otherCustomAvatar = iAmRequester ? r.addresseeCustomAvatar : r.requesterCustomAvatar;
    const otherSeen = iAmRequester ? r.addresseeSeen : r.requesterSeen;
    const view = {
      id: r.id,
      username: otherName,
      avatarImage: playerAvatarImage(otherAvatar, otherName, otherCustomAvatar),
      createdAt: r.createdAt.toISOString(),
    };
    if (r.status === "accepted") {
      friends.push({
        username: otherName,
        avatarImage: playerAvatarImage(otherAvatar, otherName, otherCustomAvatar),
        nameEffect: (iAmRequester ? r.addresseeEffect : r.requesterEffect) ?? null,
        isOnline: !!otherSeen && Date.now() - new Date(otherSeen).getTime() < ONLINE_WINDOW_MS,
      });
    } else if (iAmRequester) {
      outgoing.push(view);
    } else {
      incoming.push(view);
    }
  }
  res.json(GetFriendsResponse.parse({ friends, incoming, outgoing }));
});

router.post("/friends/requests", async (req, res): Promise<void> => {
  const parsed = SendFriendRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const me = req.player!;
  const [target] = await db
    .select({ id: playersTable.id, username: playersTable.username, isBot: playersTable.isBot })
    .from(playersTable)
    .where(sql`lower(${playersTable.username}) = lower(${parsed.data.username})`);
  if (!target || target.isBot) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  if (target.id === me.id) {
    res.status(400).json({ message: "You can't friend yourself" });
    return;
  }
  // If they already sent US a pending request, accept it instead.
  const accepted = await db
    .update(friendshipsTable)
    .set({ status: "accepted" })
    .where(and(
      eq(friendshipsTable.requesterId, target.id),
      eq(friendshipsTable.addresseeId, me.id),
      eq(friendshipsTable.status, "pending"),
    ))
    .returning({ id: friendshipsTable.id });
  if (accepted.length > 0) {
    res.json(SendFriendRequestResponse.parse({ message: `You and ${target.username} are now friends!`, status: "accepted" }));
    return;
  }
  try {
    // The pair-unique index (direction-agnostic) makes duplicate requests a
    // constraint error instead of a race.
    await db.insert(friendshipsTable).values({ requesterId: me.id, addresseeId: target.id });
  } catch {
    res.status(400).json({ message: "Friend request already exists" });
    return;
  }
  res.json(SendFriendRequestResponse.parse({ message: `Friend request sent to ${target.username}`, status: "pending" }));
});

router.post("/friends/requests/:id/accept", async (req, res): Promise<void> => {
  const me = req.player!;
  const id = Number(req.params.id);
  const updated = await db
    .update(friendshipsTable)
    .set({ status: "accepted" })
    .where(and(
      eq(friendshipsTable.id, id),
      eq(friendshipsTable.addresseeId, me.id),
      eq(friendshipsTable.status, "pending"),
    ))
    .returning({ id: friendshipsTable.id });
  if (updated.length === 0) {
    res.status(404).json({ message: "No such pending request" });
    return;
  }
  res.json({ message: "Friend request accepted" });
});

router.post("/friends/requests/:id/decline", async (req, res): Promise<void> => {
  const me = req.player!;
  const id = Number(req.params.id);
  // Addressee declines, or requester cancels their own outgoing request.
  const deleted = await db
    .delete(friendshipsTable)
    .where(and(
      eq(friendshipsTable.id, id),
      eq(friendshipsTable.status, "pending"),
      or(eq(friendshipsTable.addresseeId, me.id), eq(friendshipsTable.requesterId, me.id)),
    ))
    .returning({ id: friendshipsTable.id });
  if (deleted.length === 0) {
    res.status(404).json({ message: "No such pending request" });
    return;
  }
  res.json({ message: "Request removed" });
});

router.delete("/friends/:username", async (req, res): Promise<void> => {
  const me = req.player!;
  const [target] = await db
    .select({ id: playersTable.id })
    .from(playersTable)
    .where(sql`lower(${playersTable.username}) = lower(${req.params.username})`);
  if (!target) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  const deleted = await db
    .delete(friendshipsTable)
    .where(and(
      eq(friendshipsTable.status, "accepted"),
      or(
        and(eq(friendshipsTable.requesterId, me.id), eq(friendshipsTable.addresseeId, target.id)),
        and(eq(friendshipsTable.requesterId, target.id), eq(friendshipsTable.addresseeId, me.id)),
      ),
    ))
    .returning({ id: friendshipsTable.id });
  if (deleted.length === 0) {
    res.status(404).json({ message: "Not friends" });
    return;
  }
  res.json({ message: "Friend removed" });
});

/** True when the two players are accepted friends. */
export async function areFriends(a: number, b: number): Promise<boolean> {
  const [row] = await db
    .select({ id: friendshipsTable.id })
    .from(friendshipsTable)
    .where(and(
      eq(friendshipsTable.status, "accepted"),
      or(
        and(eq(friendshipsTable.requesterId, a), eq(friendshipsTable.addresseeId, b)),
        and(eq(friendshipsTable.requesterId, b), eq(friendshipsTable.addresseeId, a)),
      ),
    ))
    .limit(1);
  return !!row;
}

export default router;
