import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, playersTable, storePurchasesTable } from "@workspace/db";
import {
  CreateStoreCheckoutResponse,
  ClaimStorePurchaseBody,
  ClaimStorePurchaseResponse,
  GetStoreOfferResponse,
} from "@workspace/api-zod";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { addBlookToPlayer, MISC_PACK } from "../lib/game";
import { CATALOG_BLOOKS as BLOOKS } from "../data/catalogExtensions";

const router: IRouter = Router();

export const STARTER_PRODUCT_KEY = "starter_bundle";
export const STARTER_BUNDLE_BADGE = "Cloaket+";
export const STARTER_TOKENS = 75_000;
export const BUNDLE_CLAN_BOOSTS = 2;

const STARTER_BUNDLE_BADGE_JSON = JSON.stringify([STARTER_BUNDLE_BADGE]);
export const starterBundleBadgeUpdate = sql`CASE
  WHEN ${playersTable.badges} @> ${STARTER_BUNDLE_BADGE_JSON}::jsonb THEN ${playersTable.badges}
  ELSE ${playersTable.badges} || ${STARTER_BUNDLE_BADGE_JSON}::jsonb
END`;

/** Award the ownership badge to every existing Starter Bundle owner. */
export async function syncStarterBundleBadges(): Promise<number> {
  const result = await db.execute(sql`
    UPDATE players
    SET badges = ${starterBundleBadgeUpdate}
    WHERE bundle_version > 0
      AND NOT (badges @> ${STARTER_BUNDLE_BADGE_JSON}::jsonb)
  `);
  return result.rowCount ?? 0;
}

// Bump this whenever the bundle's permanent rewards change, and add a step in
// applyBundleUpgrades() granting existing owners the difference. Claims stamp
// the player with the current version so they never get the diff twice.
export const BUNDLE_VERSION = 3;

export const CHROMA_BLOOKS = BLOOKS.filter((b) => b.rarity === "Chroma");
export const MYSTICAL_BLOOKS = BLOOKS.filter(
  (b) => b.rarity === "Mystical" && b.pack !== MISC_PACK && b.chance > 0,
);

const MYSTICAL_CHANCE = 0.03; // per blook slot
const BUNDLE_BLOOK_COUNT = 2;

/**
 * Startup sweep (idempotent, race-safe single UPDATE per version step):
 * every player who owns the starter bundle but is below the current
 * BUNDLE_VERSION gets the newly added rewards.
 *
 * Steps run oldest-first so a v1 owner receives every diff on the way up.
 *
 * v2 diff (tokens 45k→50k, clan boosts 1→2, craft luck added):
 * +5,000 tokens, +1 clan boost, +1 craft luck item.
 * v3 diff (tokens 50k→75k): +25,000 tokens.
 */
export async function applyBundleUpgrades(): Promise<number> {
  await db.execute(sql`
    UPDATE players p
    SET tokens = least(p.tokens::bigint + 5000, 2147483647)::int,
        tokens_earned = least(p.tokens_earned::bigint + 5000, 2147483647)::int,
        clan_boosts = least(p.clan_boosts::bigint + 1, 2147483647)::int,
        craft_luck_items = least(p.craft_luck_items::bigint + 1, 2147483647)::int,
        bundle_version = 2
    WHERE p.bundle_version < 2
      AND EXISTS (
        SELECT 1 FROM store_purchases sp
        WHERE sp.player_id = p.id AND sp.product_key = ${STARTER_PRODUCT_KEY}
      )
  `);
  const result = await db.execute(sql`
    UPDATE players p
    SET tokens = least(p.tokens::bigint + 25000, 2147483647)::int,
        tokens_earned = least(p.tokens_earned::bigint + 25000, 2147483647)::int,
        bundle_version = ${BUNDLE_VERSION}
    WHERE p.bundle_version < 3
      AND EXISTS (
        SELECT 1 FROM store_purchases sp
        WHERE sp.player_id = p.id AND sp.product_key = ${STARTER_PRODUCT_KEY}
      )
  `);
  return result.rowCount ?? 0;
}

type BundleBlook = { name: string; rarity: string; image: string | null };

/**
 * Safety-net sweep: fulfill any PAID starter-bundle checkout session that has
 * no store_purchases row yet (player closed the tab / lost their login before
 * the redirect-back claim could run). Idempotent — the unique
 * stripe_session_id insert is the lock, same as /store/claim.
 */
export async function fulfillUnclaimedPurchases(): Promise<number> {
  // Ask Stripe directly (authoritative) — the synced webhook data has been
  // observed to miss paid sessions, which left paying players unfulfilled.
  const rows: Array<{ id: string; player_id: string | null }> = [];
  try {
    const stripe = await getUncachableStripeClient();
    for await (const s of stripe.checkout.sessions.list({ limit: 100 })) {
      if (s.payment_status !== "paid") continue;
      if (s.metadata?.["productKey"] !== STARTER_PRODUCT_KEY) continue;
      rows.push({ id: s.id, player_id: s.metadata?.["playerId"] ?? null });
      if (rows.length >= 500) break;
    }
  } catch (err) {
    console.error("[store] failed to list Stripe sessions, falling back to synced data:", err);
    const result = await db.execute(sql`
      SELECT cs.id, cs.metadata->>'playerId' AS player_id
      FROM stripe.checkout_sessions cs
      WHERE cs.payment_status = 'paid'
        AND cs.metadata->>'productKey' = ${STARTER_PRODUCT_KEY}
    `);
    rows.push(...(result.rows as Array<{ id: string; player_id: string | null }>));
  }
  let fulfilled = 0;
  for (const row of rows) {
    const playerId = Number(row.player_id);
    if (!Number.isInteger(playerId)) continue;
    const picks = rollBundleBlooks();
    const granted = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(storePurchasesTable)
        .values({
          playerId,
          stripeSessionId: row.id,
          productKey: STARTER_PRODUCT_KEY,
          chromaBlook: encodeBundleBlooks(picks),
        })
        .onConflictDoNothing()
        .returning({ id: storePurchasesTable.id });
      if (inserted.length === 0) return false;
      const updated = await tx
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
        .where(eq(playersTable.id, playerId))
        .returning({ id: playersTable.id });
      // Player deleted since paying — skip (roll back the purchase row too).
      if (updated.length === 0) throw new Error(`player ${playerId} not found`);
      await grantBundleBlooks(playerId, picks, tx);
      return true;
    }).catch(() => false);
    if (granted) fulfilled++;
  }
  return fulfilled;
}

/** Roll the bundle's blooks: 2 slots, each is a Chroma with a 1% chance of a Mystical. */
export function rollBundleBlooks(): BundleBlook[] {
  const picks: BundleBlook[] = [];
  for (let i = 0; i < BUNDLE_BLOOK_COUNT; i++) {
    const pool =
      Math.random() < MYSTICAL_CHANCE && MYSTICAL_BLOOKS.length > 0
        ? MYSTICAL_BLOOKS
        : CHROMA_BLOOKS;
    const b = pool[Math.floor(Math.random() * pool.length)]!;
    picks.push({ name: b.name, rarity: b.rarity, image: b.image ?? null });
  }
  return picks;
}

/** Grant the rolled blooks inside a transaction (deduped so 2x the same blook = quantity 2). */
export async function grantBundleBlooks(
  playerId: number,
  picks: BundleBlook[],
  tx: Parameters<typeof addBlookToPlayer>[3],
): Promise<void> {
  const counts = new Map<string, number>();
  for (const p of picks) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
  for (const [name, qty] of counts) await addBlookToPlayer(playerId, name, qty, tx);
}

/** Serialize the granted blook names for the store_purchases.chroma_blook text column. */
export function encodeBundleBlooks(picks: BundleBlook[]): string {
  return JSON.stringify(picks.map((p) => p.name));
}

/**
 * Re-hydrate names stored in store_purchases.chroma_blook into full blook
 * info. New rows are a JSON array ('["A","B"]'); legacy rows are a single
 * plain name (delimiter-safe either way).
 */
export function bundleBlooksFromStored(stored: string | null): BundleBlook[] {
  if (!stored) return [];
  let names: string[];
  if (stored.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(stored);
      names = Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === "string") : [stored];
    } catch {
      names = [stored];
    }
  } else {
    names = [stored];
  }
  return names.map((name) => {
    const def = BLOOKS.find((b) => b.name === name);
    return { name, rarity: def?.rarity ?? "Chroma", image: def?.image ?? null };
  });
}

// Accounts that can claim the starter bundle for free, unlimited times.
const FREE_BUNDLE_USERNAMES = new Set(["extravextras"]);

function hasFreeBundle(username: string): boolean {
  return FREE_BUNDLE_USERNAMES.has(username.toLowerCase());
}

// Look up the starter bundle product + price from the synced stripe schema.
async function findStarterPrice(): Promise<{
  priceId: string;
  unitAmount: number;
  currency: string;
} | null> {
  try {
    return await findStarterPriceInner();
  } catch (err) {
    // e.g. stripe schema not created yet in a fresh environment — the store
    // should degrade to "unavailable", never crash the whole offer endpoint.
    console.error("[store] failed to look up starter price:", err);
    return null;
  }
}

async function findStarterPriceInner(): Promise<{
  priceId: string;
  unitAmount: number;
  currency: string;
} | null> {
  const result = await db.execute(sql`
    SELECT pr.id, pr.unit_amount, pr.currency
    FROM stripe.products p
    JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
    WHERE p.active = true AND p.metadata->>'cloaket_key' = ${STARTER_PRODUCT_KEY}
    ORDER BY pr.created DESC
    LIMIT 1
  `);
  const row = result.rows[0] as
    | { id: string; unit_amount: string | number; currency: string }
    | undefined;
  if (!row) return null;
  return {
    priceId: row.id,
    unitAmount: Number(row.unit_amount),
    currency: row.currency,
  };
}

router.get("/store/offer", async (req, res): Promise<void> => {
  const price = await findStarterPrice();
  const me = req.player!;
  const [purchase] = await db
    .select({ id: storePurchasesTable.id })
    .from(storePurchasesTable)
    .where(eq(storePurchasesTable.playerId, me.id))
    .limit(1);
  res.json(
    GetStoreOfferResponse.parse({
      available: price !== null,
      priceAmount: price?.unitAmount ?? null,
      currency: price?.currency ?? null,
      tokens: STARTER_TOKENS,
      alreadyPurchased: !!purchase,
      freeForYou: hasFreeBundle(me.username),
      chromaBlooks: CHROMA_BLOOKS.map((b) => ({
        name: b.name,
        image: b.image ?? null,
      })),
    }),
  );
});

router.post("/store/checkout", async (req, res): Promise<void> => {
  const me = req.player!;
  const price = await findStarterPrice();
  if (!price) {
    res.status(503).json({ message: "The store isn't set up yet. Try again later." });
    return;
  }
  try {
    const stripe = await getUncachableStripeClient();
    // Send the player back to the domain they came from (e.g. cloaket.com),
    // not the internal deployment domain.
    const origin = req.get("origin") ?? (req.get("referer") ? new URL(req.get("referer")!).origin : null);
    const baseUrl = origin ?? `https://${process.env["REPLIT_DOMAINS"]?.split(",")[0]}`;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: price.priceId, quantity: 1 }],
      metadata: { playerId: String(me.id), productKey: STARTER_PRODUCT_KEY },
      success_url: `${baseUrl}/store?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/store?cancelled=1`,
    });
    res.json(CreateStoreCheckoutResponse.parse({ url: session.url }));
  } catch (err) {
    // e.g. the synced price id no longer exists in the active Stripe account
    req.log.error({ err }, "Failed to create Stripe checkout session");
    res.status(503).json({ message: "The store isn't available right now. Try again later." });
  }
});

// Allowlisted accounts can claim the bundle for free, unlimited times.
router.post("/store/free-claim", async (req, res): Promise<void> => {
  const me = req.player!;
  if (!hasFreeBundle(me.username)) {
    res.status(403).json({ message: "This account can't claim the bundle for free" });
    return;
  }
  const picks = rollBundleBlooks();
  await db.transaction(async (tx) => {
    await tx.insert(storePurchasesTable).values({
      playerId: me.id,
      stripeSessionId: `free_${me.id}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      productKey: STARTER_PRODUCT_KEY,
      chromaBlook: encodeBundleBlooks(picks),
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
      .where(eq(playersTable.id, me.id));
    await grantBundleBlooks(me.id, picks, tx);
  });
  req.log.info({ playerId: me.id, blooks: picks.map((p) => p.name) }, "Free store bundle claimed");
  res.json(
    ClaimStorePurchaseResponse.parse({
      alreadyClaimed: false,
      tokens: STARTER_TOKENS,
      blooks: picks,
    }),
  );
});

// Called by the frontend after Stripe redirects back with a session_id.
// Verifies payment with Stripe and grants rewards exactly once (the unique
// stripe_session_id insert is the idempotency lock).
router.post("/store/claim", async (req, res): Promise<void> => {
  const parsed = ClaimStorePurchaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Missing session id" });
    return;
  }
  const me = req.player!;
  const stripe = await getUncachableStripeClient();
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(parsed.data.sessionId);
  } catch {
    res.status(404).json({ message: "Purchase not found" });
    return;
  }
  if (session.payment_status !== "paid") {
    res.status(400).json({ message: "Payment not completed" });
    return;
  }
  if (session.metadata?.["playerId"] !== String(me.id)) {
    res.status(403).json({ message: "This purchase belongs to another account" });
    return;
  }
  // Bind the claim to the starter bundle contract: right product + amount.
  if (session.metadata?.["productKey"] !== STARTER_PRODUCT_KEY) {
    res.status(400).json({ message: "This payment isn't for the starter bundle" });
    return;
  }
  // Validate the paid amount against the authoritative bundle price. If the
  // local synced catalog is unavailable, fall back to asking Stripe directly —
  // never grant a claim without an amount check.
  let price = await findStarterPrice();
  if (!price) {
    try {
      const found = await stripe.products.search({
        query: `active:'true' AND metadata['cloaket_key']:'${STARTER_PRODUCT_KEY}'`,
        limit: 1,
      });
      const product = found.data[0];
      if (product) {
        const prices = await stripe.prices.list({ product: product.id, active: true, limit: 1 });
        const p = prices.data[0];
        if (p && p.unit_amount !== null) {
          price = { priceId: p.id, unitAmount: p.unit_amount, currency: p.currency };
        }
      }
    } catch (err) {
      req.log.error({ err }, "Failed to fetch starter price from Stripe for claim validation");
    }
  }
  if (!price) {
    res.status(503).json({ message: "Couldn't verify your purchase right now. Try again shortly." });
    return;
  }
  if (session.amount_total !== price.unitAmount || session.currency !== price.currency) {
    res.status(400).json({ message: "Payment amount doesn't match the bundle price" });
    return;
  }

  const picks = rollBundleBlooks();

  const granted = await db.transaction(async (tx) => {
    // Idempotency: if this session was already fulfilled, do nothing.
    const inserted = await tx
      .insert(storePurchasesTable)
      .values({
        playerId: me.id,
        stripeSessionId: session.id,
        productKey: STARTER_PRODUCT_KEY,
        chromaBlook: encodeBundleBlooks(picks),
      })
      .onConflictDoNothing()
      .returning({ id: storePurchasesTable.id });
    if (inserted.length === 0) return null;

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
      .where(eq(playersTable.id, me.id));
    await grantBundleBlooks(me.id, picks, tx);
    return picks;
  });

  if (granted === null) {
    const [existing] = await db
      .select({ chromaBlook: storePurchasesTable.chromaBlook })
      .from(storePurchasesTable)
      .where(eq(storePurchasesTable.stripeSessionId, session.id));
    res.json(
      ClaimStorePurchaseResponse.parse({
        alreadyClaimed: true,
        tokens: STARTER_TOKENS,
        blooks: bundleBlooksFromStored(existing?.chromaBlook ?? null),
      }),
    );
    return;
  }

  req.log.info({ playerId: me.id, blooks: granted.map((p) => p.name) }, "Store purchase fulfilled");
  res.json(
    ClaimStorePurchaseResponse.parse({
      alreadyClaimed: false,
      tokens: STARTER_TOKENS,
      blooks: granted,
    }),
  );
});

export default router;
