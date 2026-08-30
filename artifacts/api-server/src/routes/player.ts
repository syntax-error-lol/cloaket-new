import { Router, type IRouter } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, playersTable, ownedBlooksTable } from "@workspace/db";
import {
  ChangePasswordBody,
  GetMeResponse,
  UpdateMeBody,
  UpdateMeResponse,
  ClaimTokensResponse,
  GetMyBlooksResponse,
  SellBlooksBody,
  SellBlooksResponse,
  GetUpdateMessageResponse,
} from "@workspace/api-zod";
import {
  getBlookDef,
  isClanHoldBanned,
  levelForExp,
  nextClaimAt,
  badgeViews,
  playerAvatarImage,
  CLAIM_INTERVAL_MS,
  CLAIM_AMOUNT,
  USERNAME_RE,
  syncCollectorBadge,
} from "../lib/game";
import { clanEffectForBlook, clanEffectsForPlayer } from "../lib/clanHeldBlooks";
import { CATALOG_BLOOKS as BLOOKS } from "../data/catalogExtensions";
import { hashPassword, verifyPassword } from "./auth";
import { setSessionCookie } from "../middlewares/auth";
import { passwordProblem } from "../lib/passwordPolicy";
import { isUpdateMessageDisabled } from "./owner";

const router: IRouter = Router();

async function playerProfile(player: NonNullable<import("express").Request["player"]>) {
  const owned = await db
    .select({
      unique: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${ownedBlooksTable.quantity}), 0)::int`,
    })
    .from(ownedBlooksTable)
    .where(
      and(
        eq(ownedBlooksTable.playerId, player.id),
        inArray(ownedBlooksTable.blookName, BLOOKS.map((b) => b.name)),
      ),
    );
  const next = nextClaimAt(player);
  return {
    id: player.id,
    username: player.username,
    tokens: player.tokens,
    experience: player.experience,
    level: levelForExp(player.experience),
    avatarBlook: player.avatarBlook,
    avatarImage: playerAvatarImage(player.avatarBlook, player.username, player.customAvatarUrl),
    bannerColor: player.bannerColor,
    packsOpened: player.packsOpened,
    uniqueBlooks: owned[0]?.unique ?? 0,
    totalBlooks: owned[0]?.total ?? 0,
    nextClaimAt: next && next.getTime() > Date.now() ? next.toISOString() : null,
    badges: badgeViews(player.badges),
    nameEffect: player.nameEffect ?? null,
    chatColor: player.chatColor ?? null,
    hasBundle: player.bundleVersion > 0,
    clanBoosts: player.clanBoosts,
    rainbowPerks: player.rainbowPerks,
    createdAt: player.createdAt.toISOString(),
  };
}

router.get("/me", async (req, res): Promise<void> => {
  res.json(GetMeResponse.parse(await playerProfile(req.player!)));
});

// Read by the what's-new dialog on load. The owner panel's "Update Message"
// switch (update_message_disabled kill-switch) hides it for everyone.
router.get("/update-message", async (_req, res): Promise<void> => {
  res.json(GetUpdateMessageResponse.parse({ enabled: !(await isUpdateMessageDisabled()) }));
});

router.patch("/me", async (req, res): Promise<void> => {
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid update" });
    return;
  }
  const player = req.player!;
  const update: Partial<{ avatarBlook: string; bannerColor: string; username: string; chatColor: string | null; nameEffect: string }> = {};
  if (parsed.data.chatColor !== undefined) {
    if (player.bundleVersion <= 0) {
      res.status(403).json({ message: "Custom chat colors are a Starter Bundle perk" });
      return;
    }
    if (parsed.data.chatColor !== null && !/^#[0-9a-fA-F]{6}$/.test(parsed.data.chatColor)) {
      res.status(400).json({ message: "Invalid color" });
      return;
    }
    update.chatColor = parsed.data.chatColor;
  }
  if (parsed.data.nameColor !== undefined) {
    if (player.bundleVersion <= 0) {
      res.status(403).json({ message: "Custom name colors are a Starter Bundle perk" });
      return;
    }
    // A hex sets a custom solid color; "golden" switches back to the bundle
    // default. Nothing else is accepted (players can't grant themselves
    // rainbow through this).
    if (parsed.data.nameColor === "golden") {
      update.nameEffect = "golden";
    } else if (/^#[0-9a-fA-F]{6}$/.test(parsed.data.nameColor)) {
      update.nameEffect = parsed.data.nameColor;
    } else {
      res.status(400).json({ message: "Invalid color" });
      return;
    }
  }
  if (parsed.data.username !== undefined && parsed.data.username !== player.username) {
    // Renames require the current password: a stolen session alone must not
    // be enough to rebrand (and effectively take over) an account.
    const currentPassword = parsed.data.currentPassword;
    if (
      !currentPassword ||
      !player.passwordHash ||
      !(await verifyPassword(currentPassword, player.passwordHash))
    ) {
      res.status(401).json({ message: "Enter your current password to change your username" });
      return;
    }
    const username = parsed.data.username.trim();
    if (!USERNAME_RE.test(username)) {
      res.status(400).json({
        message: "Username must be 3-20 characters (letters, numbers, _ or -)",
      });
      return;
    }
    const [existing] = await db
      .select({ id: playersTable.id })
      .from(playersTable)
      .where(sql`lower(${playersTable.username}) = lower(${username})`);
    if (existing && existing.id !== player.id) {
      res.status(400).json({ message: "That username is taken" });
      return;
    }
    update.username = username;
  }
  if (parsed.data.avatarBlook !== undefined) {
    if (!getBlookDef(parsed.data.avatarBlook)) {
      res.status(400).json({ message: "Unknown blook" });
      return;
    }
    const [owned] = await db
      .select()
      .from(ownedBlooksTable)
      .where(
        sql`${ownedBlooksTable.playerId} = ${player.id} and ${ownedBlooksTable.blookName} = ${parsed.data.avatarBlook}`,
      );
    if (!owned) {
      res.status(400).json({ message: "You don't own that blook" });
      return;
    }
    update.avatarBlook = parsed.data.avatarBlook;
  }
  if (parsed.data.bannerColor !== undefined) {
    update.bannerColor = parsed.data.bannerColor;
  }
  if (Object.keys(update).length > 0) {
    try {
      await db
        .update(playersTable)
        .set(update)
        .where(eq(playersTable.id, player.id));
    } catch (err: unknown) {
      // Unique violation from the case-insensitive lower(username) index (rename race).
      if ((err as { code?: string })?.code === "23505" || (err as { cause?: { code?: string } })?.cause?.code === "23505") {
        res.status(400).json({ message: "That username is taken" });
        return;
      }
      throw err;
    }
    Object.assign(player, update);
  }
  res.json(UpdateMeResponse.parse(await playerProfile(req.player!)));
});

// Lives behind requirePlayer (unlike the other /auth routes) — you must be
// logged in AND prove you know the current password.
router.post("/auth/change-password", async (req, res): Promise<void> => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const me = req.player!;
  const { oldPassword, newPassword } = parsed.data;
  const passwordIssue = passwordProblem(newPassword);
  if (passwordIssue) {
    res.status(400).json({ message: passwordIssue });
    return;
  }
  if (!me.passwordHash || !(await verifyPassword(oldPassword, me.passwordHash))) {
    res.status(401).json({ message: "Wrong current password" });
    return;
  }
  // Bump the session version so every OTHER device/stolen cookie is signed
  // out, then re-issue this device's cookie at the new version.
  const [updated] = await db
    .update(playersTable)
    .set({
      passwordHash: await hashPassword(newPassword),
      sessionVersion: sql`${playersTable.sessionVersion} + 1`,
    })
    .where(eq(playersTable.id, me.id))
    .returning({ sessionVersion: playersTable.sessionVersion });
  if (updated) setSessionCookie(res, me.id, updated.sessionVersion);
  res.json({ message: "Password changed. Any other signed-in devices were logged out." });
});

router.post("/me/claim", async (req, res): Promise<void> => {
  const player = req.player!;
  const now = Date.now();
  // Spring Butterfly clan effect: daily claims pay a bonus while it's held.
  const effects = await clanEffectsForPlayer(player.id);
  const claimAmount = Math.floor(CLAIM_AMOUNT * effects.dailyClaimMultiplier);
  const next = nextClaimAt(player);
  if (next && next.getTime() > now) {
    res.status(400).json(
      ClaimTokensResponse.parse({
        claimed: false,
        tokensAwarded: 0,
        tokens: player.tokens,
        nextClaimAt: next.toISOString(),
      }),
    );
    return;
  }
  const [updated] = await db
    .update(playersTable)
    .set({
      tokens: sql`${playersTable.tokens} + ${claimAmount}`,
      tokensEarned: sql`${playersTable.tokensEarned} + ${claimAmount}`,
      lastClaimAt: new Date(now),
    })
    .where(
      and(
        eq(playersTable.id, player.id),
        sql`(${playersTable.lastClaimAt} is null or ${playersTable.lastClaimAt} <= ${new Date(now - CLAIM_INTERVAL_MS)})`,
      ),
    )
    .returning();
  if (!updated) {
    res.status(400).json(
      ClaimTokensResponse.parse({
        claimed: false,
        tokensAwarded: 0,
        tokens: player.tokens,
        nextClaimAt: new Date(now + CLAIM_INTERVAL_MS).toISOString(),
      }),
    );
    return;
  }
  req.log.info({ amount: claimAmount }, "Tokens claimed");
  res.json(
    ClaimTokensResponse.parse({
      claimed: true,
      tokensAwarded: claimAmount,
      tokens: updated!.tokens,
      nextClaimAt: new Date(now + CLAIM_INTERVAL_MS).toISOString(),
    }),
  );
});

router.get("/me/blooks", async (req, res): Promise<void> => {
  const player = req.player!;
  const rows = await db
    .select()
    .from(ownedBlooksTable)
    .where(eq(ownedBlooksTable.playerId, player.id));
  const result = rows
    .map((r) => {
      const def = getBlookDef(r.blookName);
      if (!def) return null;
      return {
        name: r.blookName,
        quantity: r.quantity,
        rarity: def.rarity,
        image: def.image,
        price: def.price,
        pack: def.pack,
        firstObtainedAt: r.firstObtainedAt.toISOString(),
        // Honest server-defined clan power (or null) — the placement picker
        // shows exactly this, never a client-side invention. Hold-banned
        // blooks (Miscellaneous, 1k) advertise no power at all.
        clanEffect: isClanHoldBanned(def.pack)
          ? null
          : (clanEffectForBlook(r.blookName, def.rarity)?.ability ?? null),
      };
    })
    .filter((r) => r !== null);
  res.json(GetMyBlooksResponse.parse(result));
});

router.post("/me/blooks/sell", async (req, res): Promise<void> => {
  const parsed = SellBlooksBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid sell request" });
    return;
  }
  const { name, quantity } = parsed.data;
  // The schema only enforces min(1); a fractional quantity would corrupt the
  // integer inventory column via rounding. There is deliberately NO upper
  // cap — selling an entire 1500-copy stack in one request is supported.
  if (!Number.isInteger(quantity)) {
    res.status(400).json({ message: "Invalid sell request" });
    return;
  }
  const def = getBlookDef(name);
  if (!def) {
    res.status(400).json({ message: "Unknown blook" });
    return;
  }
  const player = req.player!;
  // Phantom King clan effect: sales pay a royal cut while it's held.
  const effects = await clanEffectsForPlayer(player.id);
  const tokensEarned = Math.floor(def.price * quantity * effects.sellPriceMultiplier);
  // Race-safe: the decrement is a conditional UPDATE (quantity >= n) inside a
  // transaction, so two concurrent sells can't both cash in the same copies.
  // Lock ordering matters: bazaar buy locks player row THEN owned-blook row,
  // so sell must do the same (player first) to avoid deadlocks. If the
  // conditional decrement then fails, the whole transaction rolls back.
  const notEnough = new Error("NOT_ENOUGH_BLOOKS");
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(playersTable)
      .set({
        tokens: sql`${playersTable.tokens} + ${tokensEarned}`,
        tokensEarned: sql`${playersTable.tokensEarned} + ${tokensEarned}`,
      })
      .where(eq(playersTable.id, player.id))
      .returning();
    const [decremented] = await tx
      .update(ownedBlooksTable)
      .set({ quantity: sql`${ownedBlooksTable.quantity} - ${quantity}` })
      .where(
        sql`${ownedBlooksTable.playerId} = ${player.id} and ${ownedBlooksTable.blookName} = ${name} and ${ownedBlooksTable.quantity} >= ${quantity}`,
      )
      .returning({ id: ownedBlooksTable.id, quantity: ownedBlooksTable.quantity });
    if (!decremented) {
      // Throwing aborts the transaction, undoing the token credit above.
      throw notEnough;
    }
    if (decremented.quantity === 0) {
      await tx.delete(ownedBlooksTable).where(eq(ownedBlooksTable.id, decremented.id));
    }
    return { updated: row, remaining: decremented.quantity };
  }).catch((err) => {
    if (err === notEnough) return null;
    throw err;
  });
  if (!result) {
    res.status(400).json({ message: "Not enough of that blook to sell" });
    return;
  }
  const { updated, remaining } = result;
  if (remaining === 0) {
    // Selling the last copy may drop the player below the Collector threshold.
    await syncCollectorBadge(player.id);
  }
  res.json(
    SellBlooksResponse.parse({
      tokensEarned,
      tokens: updated!.tokens,
      remainingQuantity: remaining,
    }),
  );
});

export default router;
