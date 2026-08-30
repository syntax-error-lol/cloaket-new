import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { db, playersTable, chatMessagesTable } from "@workspace/db";
import {
  GetChatMessagesQueryParams,
  GetChatMessagesResponse,
  SendChatMessageBody,
  SendChatMessageResponse,
} from "@workspace/api-zod";
import {
  playerAvatarImage,
  badgeViews,
  containsLink,
  clanTagsForPlayers,
} from "../lib/game";
import { areLinksAllowed } from "./owner";

const router: IRouter = Router();

const MENTION_ONLINE_WINDOW_MS = 5 * 60 * 1000; // seen in the last 5 minutes = online

// Rewrite "@username" mentions so their capitalization matches the real
// player's username (e.g. "@COOLguy" -> "@CoolGuy") — but only for players
// who are currently online. Returns the fixed content plus the canonical
// usernames of the online players that were mentioned.
export async function canonicalizeMentions(
  content: string,
): Promise<{ content: string; mentions: string[]; mentionEffects: Record<string, string | null> }> {
  const names = [...content.matchAll(/@([A-Za-z0-9_-]+)/g)].map((m) => m[1]!);
  if (names.length === 0) return { content, mentions: [], mentionEffects: {} };
  const lowered = [...new Set(names.map((n) => n.toLowerCase()))];
  const cutoff = new Date(Date.now() - MENTION_ONLINE_WINDOW_MS);
  const rows = await db
    .select({ username: playersTable.username, nameEffect: playersTable.nameEffect })
    .from(playersTable)
    .where(
      sql`lower(${playersTable.username}) in (${sql.join(
        lowered.map((n) => sql`${n}`),
        sql`, `,
      )}) AND ${playersTable.lastSeenAt} >= ${cutoff}`,
    );
  if (rows.length === 0) return { content, mentions: [], mentionEffects: {} };
  const canonical = new Map(rows.map((r) => [r.username.toLowerCase(), r.username]));
  const effects = new Map(rows.map((r) => [r.username, r.nameEffect ?? null]));
  const mentioned = new Set<string>();
  const fixed = content.replace(/@([A-Za-z0-9_-]+)/g, (full, name: string) => {
    const real = canonical.get(name.toLowerCase());
    if (!real) return full;
    mentioned.add(real);
    return `@${real}`;
  });
  const mentionEffects: Record<string, string | null> = {};
  for (const name of mentioned) mentionEffects[name] = effects.get(name) ?? null;
  return { content: fixed, mentions: [...mentioned], mentionEffects };
}

// Current name effects for every mentioned username across a set of messages.
async function mentionEffectsFor(
  allMentions: string[][],
): Promise<Record<string, string | null>> {
  const names = [...new Set(allMentions.flat())];
  if (names.length === 0) return {};
  const rows = await db
    .select({ username: playersTable.username, nameEffect: playersTable.nameEffect })
    .from(playersTable)
    .where(
      sql`${playersTable.username} in (${sql.join(
        names.map((n) => sql`${n}`),
        sql`, `,
      )})`,
    );
  return Object.fromEntries(rows.map((r) => [r.username, r.nameEffect ?? null]));
}

// ---------------------------------------------------------------------------
// The message list is identical for every viewer except the isMine flag, and
// every online player polls it every couple of seconds. Build the shared view
// once per second instead of running 3 DB queries per poll per player.
// ---------------------------------------------------------------------------

type MsgView = ReturnType<typeof GetChatMessagesResponse.parse>[number];
type SharedRow = { playerId: number; view: Omit<MsgView, "isMine"> };

const LIST_CACHE_TTL_MS = 1000;
let listCache: { at: number; rows: SharedRow[] } | null = null;
let listInflight: Promise<SharedRow[]> | null = null;

// Call whenever a message is created or deleted so the next poll sees it
// immediately instead of up to a second later.
export function invalidateChatListCache(): void {
  listCache = null;
}

async function buildSharedRows(after?: number): Promise<SharedRow[]> {
  const base = db
    .select({
      id: chatMessagesTable.id,
      playerId: chatMessagesTable.playerId,
      author: playersTable.username,
      avatarBlook: playersTable.avatarBlook,
      customAvatarUrl: playersTable.customAvatarUrl,
      badges: playersTable.badges,
      nameEffect: playersTable.nameEffect,
      chatColor: playersTable.chatColor,
      content: chatMessagesTable.content,
      mentions: chatMessagesTable.mentions,
      createdAt: chatMessagesTable.createdAt,
    })
    .from(chatMessagesTable)
    .innerJoin(playersTable, eq(chatMessagesTable.playerId, playersTable.id));
  // With an `after` cursor: everything newer, oldest-first.
  // Without: the NEWEST 200 (fetch desc, then reverse) — otherwise once the
  // room passes 200 total messages, new ones would never appear.
  const rows =
    after !== undefined
      ? await base
          .where(gt(chatMessagesTable.id, after))
          .orderBy(asc(chatMessagesTable.id))
          .limit(200)
      : (await base.orderBy(desc(chatMessagesTable.id)).limit(200)).reverse();
  const clanTags = await clanTagsForPlayers(rows.map((r) => r.playerId));
  const allEffects = await mentionEffectsFor(rows.map((r) => r.mentions ?? []));
  return rows.map((r) => ({
    playerId: r.playerId,
    view: {
      id: r.id,
      author: r.author,
      avatarBlook: r.avatarBlook,
      avatarImage: playerAvatarImage(r.avatarBlook, r.author, r.customAvatarUrl),
      badges: badgeViews(r.badges),
      nameEffect: r.nameEffect ?? null,
      chatColor: r.chatColor ?? null,
      content: r.content,
      mentions: r.mentions ?? [],
      mentionEffects: Object.fromEntries(
        (r.mentions ?? []).map((m) => [m, allEffects[m] ?? null]),
      ),
      createdAt: r.createdAt.toISOString(),
      clanName: clanTags.get(r.playerId)?.name ?? null,
      clanColor: clanTags.get(r.playerId)?.color ?? null,
    },
  }));
}

async function recentSharedRows(): Promise<SharedRow[]> {
  if (listCache && Date.now() - listCache.at < LIST_CACHE_TTL_MS) {
    return listCache.rows;
  }
  // Single flight: concurrent polls share one rebuild instead of stampeding.
  if (!listInflight) {
    listInflight = buildSharedRows()
      .then((rows) => {
        listCache = { at: Date.now(), rows };
        return rows;
      })
      .finally(() => {
        listInflight = null;
      });
  }
  return listInflight;
}

router.get("/chat/messages", async (req, res): Promise<void> => {
  const query = GetChatMessagesQueryParams.safeParse(req.query);
  const after = query.success ? query.data.after : undefined;
  const me = req.player!;
  const rows = after !== undefined ? await buildSharedRows(after) : await recentSharedRows();
  const result = rows.map((r) => ({ ...r.view, isMine: r.playerId === me.id }));
  res.json(GetChatMessagesResponse.parse(result));
});

router.post("/chat/messages", async (req, res): Promise<void> => {
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success || parsed.data.content.trim().length === 0) {
    res.status(400).json({ message: "Message can't be empty" });
    return;
  }
  const me = req.player!;
  if (me.muted) {
    res.status(403).json({ message: "You are muted and can't send chat messages" });
    return;
  }
  if (me.mutedUntil && me.mutedUntil.getTime() > Date.now()) {
    const mins = Math.ceil((me.mutedUntil.getTime() - Date.now()) / 60_000);
    res.status(403).json({ message: `You are muted for ${mins} more minute${mins === 1 ? "" : "s"}` });
    return;
  }
  if (containsLink(parsed.data.content) && !(await areLinksAllowed())) {
    res.status(400).json({ message: "Links aren't allowed in chat" });
    return;
  }
  const { content, mentions, mentionEffects } = await canonicalizeMentions(parsed.data.content.trim());
  const [msg] = await db
    .insert(chatMessagesTable)
    .values({ playerId: me.id, content, mentions })
    .returning();
  invalidateChatListCache();
  // 1 token per chat message sent
  await db
    .update(playersTable)
    .set({ tokens: sql`${playersTable.tokens} + 1` })
    .where(eq(playersTable.id, me.id));
  const myClanTag = (await clanTagsForPlayers([me.id])).get(me.id);
  res.status(201).json(
    SendChatMessageResponse.parse({
      id: msg!.id,
      author: me.username,
      avatarBlook: me.avatarBlook,
      avatarImage: playerAvatarImage(me.avatarBlook, me.username, me.customAvatarUrl),
      badges: badgeViews(me.badges),
      nameEffect: me.nameEffect ?? null,
      chatColor: me.chatColor ?? null,
      content: msg!.content,
      mentions: msg!.mentions,
      mentionEffects,
      isMine: true,
      createdAt: msg!.createdAt.toISOString(),
      clanName: myClanTag?.name ?? null,
      clanColor: myClanTag?.color ?? null,
    }),
  );
});

router.delete("/chat/messages/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ message: "Message not found" });
    return;
  }
  const me = req.player!;
  // Ownership enforced in the WHERE — you can only ever delete YOUR message.
  const [deleted] = await db
    .delete(chatMessagesTable)
    .where(and(eq(chatMessagesTable.id, id), eq(chatMessagesTable.playerId, me.id)))
    .returning({ id: chatMessagesTable.id });
  if (!deleted) {
    res.status(404).json({ message: "Message not found" });
    return;
  }
  invalidateChatListCache();
  res.json({ message: "Deleted" });
});

export default router;
