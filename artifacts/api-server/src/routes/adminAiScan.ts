import { Router, type IRouter } from "express";
import { timingSafeEqual } from "crypto";
import { desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  db,
  playersTable,
  clansTable,
  clanMembersTable,
  clanApplicationsTable,
  clanMessagesTable,
  chatMessagesTable,
  tradeMessagesTable,
  tradesTable,
  tradeRequestsTable,
  bazaarListingsTable,
  unlocksTable,
  packPullsTable,
  craftLogsTable,
  ownedBlooksTable,
  storePurchasesTable,
} from "@workspace/db";
import {
  AdminAiScanBody,
  AdminAiScanApplyBody,
  AdminAiScanResponse,
  AdminAiScanApplyResponse,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { batchProcess } from "@workspace/integrations-openai-ai-server/batch";
import { logger } from "../lib/logger";
import { rateLimit } from "../middlewares/rate-limit";
import { checkOwnerPassword, checkOwnerTierPassword, isAdminPanelDisabled } from "./owner";

const router: IRouter = Router();

// Same brute-force protection as the main admin router.
router.use("/admin", rateLimit({ windowMs: 60_000, max: 20 }));

// Accessible from the owner, admin, and mod panels.
function matches(password: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function checkPassword(password: string | undefined): boolean {
  if (!password) return false;
  return (
    matches(password, process.env.ADMIN_PASSWORD) ||
    matches(password, process.env.MOD_PASSWORD) ||
    checkOwnerTierPassword(password)
  );
}

// Honor the owner's admin-panel kill-switch here too (mod/owner unaffected).
router.use("/admin", async (req, res, next) => {
  const pw = (req.body as any)?.password;
  if (
    typeof pw === "string" &&
    matches(pw, process.env.ADMIN_PASSWORD) &&
    !checkOwnerPassword(pw) &&
    !matches(pw, process.env.MOD_PASSWORD)
  ) {
    if (await isAdminPanelDisabled()) {
      res.status(403).json({ message: "The admin panel has been disabled by the owner" });
      return;
    }
  }
  next();
});

type ScanItem = {
  token: string; // e.g. "u:12"
  kind: "username" | "player" | "clan" | "chat_message" | "clan_message" | "trade_message";
  id: string;
  label: string;
  text: string;
  action: string;
  authorToken?: string; // "p:<playerId>" for chat messages
};

const MODERATION_PROMPT =
  "You are a strict content moderator for Cloaket, a kids' game (all ages). " +
  "You will receive a numbered list of items, each with a unique id in square brackets. " +
  "Flag every item that is inappropriate for a kids' game: racism, slurs, hate speech, " +
  "nazi/hate symbols or references, NSFW/sexual content, graphic violence or gore, drug " +
  "references, severe profanity, harassment/bullying, or attempts to disguise any of " +
  "these with creative spelling (leetspeak, spacing, symbols). " +
  "IMPORTANT: only flag content that is CLEARLY and DELIBERATELY inappropriate or " +
  "malicious. NEVER flag normal conversation, general chatter, jokes, game talk, " +
  "trash-talk, mild words, or anything ambiguous — if you are not sure, do NOT flag " +
  "it. Never punish innocent players. " +
  "Chat message items include their author as 'by p:<playerId>'. In addition to " +
  "flagging individual items, you may flag \"p:<playerId>\" to take action against " +
  "that player's ENTIRE ACCOUNT (the human reviewer chooses ban or delete) — reserve " +
  "this for severe cases only: repeated hate/racism, predatory or sexual behavior, or " +
  "accounts that clearly exist just to post inappropriate content. A single mild " +
  "offense is NEVER enough to flag an account. " +
  'When you flag a "p:<playerId>" account, also include a "punishment" field weighing ' +
  'severity: "rename" if only the username is the problem, "ban" for serious or repeated ' +
  'offenses (the default), "delete" ONLY for the absolute worst accounts that clearly ' +
  "exist just to spread hate or predatory content. " +
  'Respond with ONLY a JSON object: {"flagged":[{"id":"<id>","reason":"<short reason>","punishment":"ban|rename|delete (accounts only)"}]}. ' +
  "If nothing is inappropriate, respond {\"flagged\":[]}.";

type Flag = { id: string; reason: string; punishment?: "ban" | "rename" | "delete" };

async function classifyChunk(
  chunk: ScanItem[],
  instructions?: string,
): Promise<Flag[]> {
  const list = chunk
    .map((it) => `[${it.token}] (${it.kind}${it.authorToken ? ` by ${it.authorToken}` : ""}) ${it.text.slice(0, 300)}`)
    .join("\n");
  const systemPrompt = instructions
    ? `${MODERATION_PROMPT}\n\nThe game admin has given you EXTRA instructions for this scan — also flag anything matching them (in addition to the rules above):\n"""${instructions}"""`
    : MODERATION_PROMPT;
  const response = await openai.chat.completions.create({
    model: "gpt-5.6-terra",
    max_completion_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: list },
    ],
    response_format: { type: "json_object" },
  });
  const raw = response.choices[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.flagged)) {
      return parsed.flagged
        .filter(
          (f: any) => typeof f?.id === "string" && typeof f?.reason === "string",
        )
        .map((f: any) => ({
          id: f.id,
          reason: f.reason,
          punishment: ["ban", "rename", "delete"].includes(f?.punishment) ? f.punishment : undefined,
        }));
    }
  } catch (err) {
    // Don't fail the whole scan over one bad chunk — log and skip it.
    logger.error({ err, raw: raw.slice(0, 500) }, "AI scan: bad JSON from model");
  }
  return [];
}

function isContentFilterError(err: unknown): boolean {
  const e = err as any;
  return e?.code === "content_filter" || e?.error?.code === "content_filter";
}

/**
 * Classify a chunk, handling the provider's own safety filter: when a chunk
 * is rejected for severe content, bisect it to isolate the offending items —
 * a single item that still trips the filter is auto-flagged (the filter
 * itself is strong evidence it's inappropriate).
 */
async function classifyWithFallback(
  chunk: ScanItem[],
  instructions?: string,
): Promise<Flag[]> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await classifyChunk(chunk, instructions);
    } catch (err) {
      if (isContentFilterError(err)) {
        if (chunk.length === 1) {
          return [
            {
              id: chunk[0].token,
              reason: "Severe content — blocked by the AI safety filter itself",
            },
          ];
        }
        const mid = Math.ceil(chunk.length / 2);
        const [left, right] = await Promise.all([
          classifyWithFallback(chunk.slice(0, mid), instructions),
          classifyWithFallback(chunk.slice(mid), instructions),
        ]);
        return [...left, ...right];
      }
      logger.error({ err, attempt }, "AI scan: chunk classification failed");
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return [];
}

router.post("/admin/ai-scan", async (req, res): Promise<void> => {
  const parsed = AdminAiScanBody.safeParse(req.body);
  if (!parsed.success || !checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong admin password" });
    return;
  }
  const instructions = parsed.data.instructions?.trim() || undefined;

  try {
    const players = await db
      .select({ id: playersTable.id, username: playersTable.username })
      .from(playersTable)
      .where(eq(playersTable.isBot, false))
      .limit(3000);

    const clans = await db
      .select({
        id: clansTable.id,
        name: clansTable.name,
        ownerId: clansTable.ownerId,
      })
      .from(clansTable)
      .limit(1000);

    const globalMsgs = await db
      .select({
        id: chatMessagesTable.id,
        content: chatMessagesTable.content,
        playerId: chatMessagesTable.playerId,
      })
      .from(chatMessagesTable)
      .orderBy(desc(chatMessagesTable.id))
      .limit(400);

    const clanMsgs = await db
      .select({
        id: clanMessagesTable.id,
        content: clanMessagesTable.content,
        playerId: clanMessagesTable.playerId,
      })
      .from(clanMessagesTable)
      .orderBy(desc(clanMessagesTable.id))
      .limit(400);

    const tradeMsgs = await db
      .select({
        id: tradeMessagesTable.id,
        content: tradeMessagesTable.content,
        playerId: tradeMessagesTable.playerId,
      })
      .from(tradeMessagesTable)
      .orderBy(desc(tradeMessagesTable.id))
      .limit(400);

    const usernameById = new Map(players.map((p) => [p.id, p.username]));
    const who = (playerId: number) => usernameById.get(playerId) ?? `player #${playerId}`;

    const items: ScanItem[] = [
      ...players.map((p): ScanItem => ({
        token: `u:${p.id}`,
        kind: "username",
        id: String(p.id),
        label: `Username: ${p.username}`,
        text: p.username,
        action: `Rename to "player${p.id}"`,
      })),
      ...clans.map((c): ScanItem => ({
        token: `c:${c.id}`,
        kind: "clan",
        id: String(c.id),
        label: `Clan: ${c.name} (owned by ${who(c.ownerId)})`,
        text: c.name,
        action: "Delete the entire clan (members are removed, clan chat wiped)",
      })),
      ...globalMsgs.map((m): ScanItem => ({
        token: `g:${m.id}`,
        kind: "chat_message",
        id: String(m.id),
        label: `Global chat by ${who(m.playerId)}`,
        text: m.content,
        action: "Delete this message",
        authorToken: `p:${m.playerId}`,
      })),
      ...clanMsgs.map((m): ScanItem => ({
        token: `cm:${m.id}`,
        kind: "clan_message",
        id: String(m.id),
        label: `Clan chat by ${who(m.playerId)}`,
        text: m.content,
        action: "Delete this message",
        authorToken: `p:${m.playerId}`,
      })),
      ...tradeMsgs.map((m): ScanItem => ({
        token: `tm:${m.id}`,
        kind: "trade_message",
        id: String(m.id),
        label: `Trade chat by ${who(m.playerId)}`,
        text: m.content,
        action: "Delete this message",
        authorToken: `p:${m.playerId}`,
      })),
    ];

    // Chunk items and classify with retries + rate limiting.
    const chunks: ScanItem[][] = [];
    for (let i = 0; i < items.length; i += 120) {
      chunks.push(items.slice(i, i + 120));
    }
    // Tolerate transient provider failures on individual chunks — a failed
    // chunk just contributes no flags instead of failing the whole scan.
    const results = await batchProcess(
      chunks,
      (chunk) => classifyWithFallback(chunk, instructions),
      { concurrency: 2, retries: 0 },
    );

    const byToken = new Map(items.map((it) => [it.token, it]));
    const flagged: { item: ScanItem; reason: string; punishment?: "ban" | "rename" | "delete" }[] = [];
    const seen = new Set<string>();
    for (const chunkFlags of results) {
      for (const f of chunkFlags) {
        if (seen.has(f.id)) continue;
        // "p:<id>" flags mean: delete this player's whole account.
        if (f.id.startsWith("p:")) {
          const playerId = Number(f.id.slice(2));
          if (!Number.isInteger(playerId) || !usernameById.has(playerId)) continue;
          seen.add(f.id);
          flagged.push({
            item: {
              token: f.id,
              kind: "player",
              id: String(playerId),
              label: `Account: ${usernameById.get(playerId)}`,
              text: usernameById.get(playerId)!,
              action: "Ban this account (or choose Delete to wipe it entirely)",
            },
            reason: f.reason,
            punishment: f.punishment ?? "ban",
          });
          continue;
        }
        const item = byToken.get(f.id);
        if (!item) continue;
        seen.add(f.id);
        flagged.push({ item, reason: f.reason });
      }
    }

    res.json(
      AdminAiScanResponse.parse({
        items: flagged.map(({ item, reason, punishment }) => ({
          kind: item.kind,
          id: item.id,
          label: item.label,
          text: item.text,
          reason,
          action: item.action,
          ...(punishment ? { punishment } : {}),
        })),
        scannedPlayers: players.length,
        scannedClans: clans.length,
        scannedMessages: globalMsgs.length + clanMsgs.length + tradeMsgs.length,
      }),
    );
  } catch (err) {
    logger.error({ err }, "AI scan failed");
    res.status(500).json({ message: "AI scan failed. Please try again." });
  }
});

router.post("/admin/ai-scan/apply", async (req, res): Promise<void> => {
  const parsed = AdminAiScanApplyBody.safeParse(req.body);
  if (!parsed.success || !checkPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong admin password" });
    return;
  }

  const details: string[] = [];
  let applied = 0;

  for (const item of parsed.data.items) {
    const numId = Number(item.id);
    if (!Number.isInteger(numId) || numId <= 0) continue;

    // Each item is handled independently — one failure must not stop the rest.
    try {
      if (item.kind === "username") {
        // Collision-safe rename: try player{id}, then add a random suffix.
        let renamed: string | null = null;
        for (let attempt = 0; attempt < 5 && !renamed; attempt++) {
          const candidate =
            attempt === 0
              ? `player${numId}`
              : `player${numId}_${Math.floor(Math.random() * 10000)}`;
          try {
            const [row] = await db
              .update(playersTable)
              .set({ username: candidate })
              .where(eq(playersTable.id, numId))
              .returning({ username: playersTable.username });
            if (!row) break; // player no longer exists
            renamed = row.username;
          } catch {
            // unique violation — try the next candidate
          }
        }
        if (renamed) {
          applied++;
          details.push(`Renamed player #${numId} to "${renamed}"`);
        }
      } else if (item.kind === "ban_player") {
        const [row] = await db
          .update(playersTable)
          .set({ banned: true })
          .where(eq(playersTable.id, numId))
          .returning({ username: playersTable.username });
        if (row) {
          applied++;
          details.push(`Banned account "${row.username}" (player #${numId})`);
        }
      } else if (item.kind === "player") {
        // Full account deletion is owner-tier; admin/mod can only ban or rename.
        if (!checkOwnerTierPassword(parsed.data.password)) {
          details.push(`Skipped deleting account #${item.id} — only the owner or co-owner can delete accounts`);
          continue;
        }
        const [target] = await db
          .select({ username: playersTable.username })
          .from(playersTable)
          .where(eq(playersTable.id, numId));
        if (!target) continue;
        await db.transaction(async (tx) => {
          // Lock the player row first so an in-flight craft/pack open can't
          // insert new child rows mid-deletion (would FK-abort the delete).
          await tx.execute(
            sql`SELECT id FROM players WHERE id = ${numId} FOR UPDATE`,
          );
          // Clans this player owns get disbanded entirely.
          const ownedClans = await tx
            .select({ id: clansTable.id })
            .from(clansTable)
            .where(eq(clansTable.ownerId, numId));
          const ownedClanIds = ownedClans.map((c) => c.id);
          if (ownedClanIds.length > 0) {
            await tx.delete(clanMessagesTable).where(inArray(clanMessagesTable.clanId, ownedClanIds));
            await tx.delete(clanApplicationsTable).where(inArray(clanApplicationsTable.clanId, ownedClanIds));
            await tx.delete(clanMembersTable).where(inArray(clanMembersTable.clanId, ownedClanIds));
            await tx.delete(clansTable).where(inArray(clansTable.id, ownedClanIds));
          }
          // Their own clan traces elsewhere.
          await tx.delete(clanMessagesTable).where(eq(clanMessagesTable.playerId, numId));
          await tx.delete(clanApplicationsTable).where(eq(clanApplicationsTable.playerId, numId));
          await tx.delete(clanMembersTable).where(eq(clanMembersTable.playerId, numId));
          await tx
            .update(clansTable)
            .set({ rainbowOwnerId: null })
            .where(eq(clansTable.rainbowOwnerId, numId));
          // Trades and trade chat.
          const theirTrades = tx
            .select({ id: tradesTable.id })
            .from(tradesTable)
            .where(or(eq(tradesTable.playerId, numId), eq(tradesTable.partnerId, numId)));
          await tx
            .delete(tradeMessagesTable)
            .where(or(eq(tradeMessagesTable.playerId, numId), inArray(tradeMessagesTable.tradeId, theirTrades)));
          await tx
            .delete(tradesTable)
            .where(or(eq(tradesTable.playerId, numId), eq(tradesTable.partnerId, numId)));
          await tx
            .delete(tradeRequestsTable)
            .where(or(eq(tradeRequestsTable.fromId, numId), eq(tradeRequestsTable.toId, numId)));
          // Everything else they own.
          await tx.delete(chatMessagesTable).where(eq(chatMessagesTable.playerId, numId));
          await tx.delete(bazaarListingsTable).where(eq(bazaarListingsTable.sellerId, numId));
          await tx.delete(unlocksTable).where(eq(unlocksTable.playerId, numId));
          await tx.delete(packPullsTable).where(eq(packPullsTable.playerId, numId));
          await tx.delete(craftLogsTable).where(eq(craftLogsTable.playerId, numId));
          await tx.delete(ownedBlooksTable).where(eq(ownedBlooksTable.playerId, numId));
          await tx.delete(storePurchasesTable).where(eq(storePurchasesTable.playerId, numId));
          await tx.delete(playersTable).where(eq(playersTable.id, numId));
        });
        applied++;
        details.push(`Deleted account "${target.username}" (player #${numId})`);
      } else if (item.kind === "clan") {
        const [clan] = await db
          .select({ name: clansTable.name })
          .from(clansTable)
          .where(eq(clansTable.id, numId));
        if (!clan) continue;
        await db.delete(clanMessagesTable).where(eq(clanMessagesTable.clanId, numId));
        await db.delete(clanApplicationsTable).where(eq(clanApplicationsTable.clanId, numId));
        await db.delete(clanMembersTable).where(eq(clanMembersTable.clanId, numId));
        await db
          .update(clansTable)
          .set({ rainbowOwnerId: null })
          .where(eq(clansTable.id, numId));
        await db.delete(clansTable).where(eq(clansTable.id, numId));
        applied++;
        details.push(`Deleted clan "${clan.name}"`);
      } else if (item.kind === "chat_message") {
        const deleted = await db
          .delete(chatMessagesTable)
          .where(eq(chatMessagesTable.id, numId))
          .returning({ id: chatMessagesTable.id });
        if (deleted.length) {
          applied++;
          details.push(`Deleted global chat message #${numId}`);
        }
      } else if (item.kind === "clan_message") {
        const deleted = await db
          .delete(clanMessagesTable)
          .where(eq(clanMessagesTable.id, numId))
          .returning({ id: clanMessagesTable.id });
        if (deleted.length) {
          applied++;
          details.push(`Deleted clan chat message #${numId}`);
        }
      } else if (item.kind === "trade_message") {
        const deleted = await db
          .delete(tradeMessagesTable)
          .where(eq(tradeMessagesTable.id, numId))
          .returning({ id: tradeMessagesTable.id });
        if (deleted.length) {
          applied++;
          details.push(`Deleted trade chat message #${numId}`);
        }
      }
    } catch (err) {
      logger.error({ err, item }, "AI scan apply: item failed");
      details.push(`Failed to handle ${item.kind} #${item.id} — skipped`);
    }
  }

  res.json(AdminAiScanApplyResponse.parse({ applied, details }));
});

export default router;
