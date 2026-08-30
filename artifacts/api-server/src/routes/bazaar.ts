import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  playersTable,
  bazaarListingsTable,
  ownedBlooksTable,
} from "@workspace/db";
import {
  GetBazaarListingsResponse,
  CreateBazaarListingBody,
  CreateBazaarListingResponse,
  BuyBazaarListingResponse,
} from "@workspace/api-zod";
import {
  getBlookDef,
  addBlookToPlayer,
  syncCollectorBadge,
} from "../lib/game";

const router: IRouter = Router();

function parseId(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(v ?? "", 10);
}

router.get("/bazaar", async (req, res): Promise<void> => {
  const me = req.player!;
  const rows = await db
    .select({
      id: bazaarListingsTable.id,
      sellerId: bazaarListingsTable.sellerId,
      sellerName: playersTable.username,
      sellerNameEffect: playersTable.nameEffect,
      blookName: bazaarListingsTable.blookName,
      price: bazaarListingsTable.price,
      createdAt: bazaarListingsTable.createdAt,
    })
    .from(bazaarListingsTable)
    .innerJoin(playersTable, eq(bazaarListingsTable.sellerId, playersTable.id))
    .where(eq(bazaarListingsTable.active, true))
    .orderBy(desc(bazaarListingsTable.createdAt));
  const result = rows
    .map((r) => {
      const def = getBlookDef(r.blookName);
      if (!def) return null;
      return {
        id: r.id,
        sellerName: r.sellerName,
        sellerNameEffect: r.sellerNameEffect ?? null,
        blookName: r.blookName,
        rarity: def.rarity,
        image: def.image,
        price: r.price,
        pack: def.pack,
        isMine: r.sellerId === me.id,
        createdAt: r.createdAt.toISOString(),
      };
    })
    .filter((r) => r !== null);
  res.json(GetBazaarListingsResponse.parse(result));
});

router.post("/bazaar", async (req, res): Promise<void> => {
  const parsed = CreateBazaarListingBody.safeParse(req.body);
  if (!parsed.success || !Number.isInteger(parsed.data.price)) {
    res.status(400).json({ message: "Invalid listing" });
    return;
  }
  const { blookName, price } = parsed.data;
  const def = getBlookDef(blookName);
  if (!def) {
    res.status(400).json({ message: "Unknown blook" });
    return;
  }
  const me = req.player!;
  // Remove one copy from inventory and create the listing atomically. The
  // decrement is a race-safe conditional UPDATE (quantity >= 1) so two
  // concurrent requests can't both list the same last copy (dupe glitch).
  let removedLastCopy = false;
  const listing = await db.transaction(async (tx) => {
    const [decremented] = await tx
      .update(ownedBlooksTable)
      .set({ quantity: sql`${ownedBlooksTable.quantity} - 1` })
      .where(
        and(
          eq(ownedBlooksTable.playerId, me.id),
          eq(ownedBlooksTable.blookName, blookName),
          sql`${ownedBlooksTable.quantity} >= 1`,
        ),
      )
      .returning({ id: ownedBlooksTable.id, quantity: ownedBlooksTable.quantity });
    if (!decremented) return null;
    if (decremented.quantity === 0) {
      removedLastCopy = true;
      await tx.delete(ownedBlooksTable).where(eq(ownedBlooksTable.id, decremented.id));
    }
    const [created] = await tx
      .insert(bazaarListingsTable)
      .values({ sellerId: me.id, blookName, price })
      .returning();
    return created;
  });
  if (!listing) {
    res.status(400).json({ message: "You don't own that blook" });
    return;
  }
  if (removedLastCopy) {
    // Listing the last copy may drop the seller below the Collector threshold.
    await syncCollectorBadge(me.id);
  }
  res.status(201).json(
    CreateBazaarListingResponse.parse({
      id: listing!.id,
      sellerName: me.username,
      sellerNameEffect: me.nameEffect ?? null,
      blookName,
      rarity: def.rarity,
      image: def.image,
      price,
      pack: def.pack,
      isMine: true,
      createdAt: listing!.createdAt.toISOString(),
    }),
  );
});

router.post("/bazaar/:id/buy", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: "Invalid listing id" });
    return;
  }
  const me = req.player!;
  const [listing] = await db
    .select()
    .from(bazaarListingsTable)
    .where(
      and(eq(bazaarListingsTable.id, id), eq(bazaarListingsTable.active, true)),
    );
  if (!listing) {
    res.status(400).json({ message: "Listing not found" });
    return;
  }
  if (listing.sellerId === me.id) {
    res.status(400).json({ message: "You can't buy your own listing" });
    return;
  }
  if (me.tokens < listing.price) {
    res.status(400).json({ message: "Not enough tokens" });
    return;
  }
  let updatedMe;
  try {
    updatedMe = await db.transaction(async (tx) => {
      // Race-safe claim: only one buyer can flip the listing inactive.
      const claimed = await tx
        .update(bazaarListingsTable)
        .set({ active: false })
        .where(and(eq(bazaarListingsTable.id, id), eq(bazaarListingsTable.active, true)))
        .returning({ id: bazaarListingsTable.id });
      if (claimed.length === 0) throw new Error("Listing not found");
      // Race-safe charge: only if the buyer can still afford it at commit time.
      const [me2] = await tx
        .update(playersTable)
        .set({
          tokens: sql`${playersTable.tokens} - ${listing.price}`,
          tokensSpent: sql`${playersTable.tokensSpent} + ${listing.price}`,
        })
        .where(and(eq(playersTable.id, me.id), sql`${playersTable.tokens} >= ${listing.price}`))
        .returning();
      if (!me2) throw new Error("Not enough tokens");
      await tx
        .update(playersTable)
        .set({
          tokens: sql`${playersTable.tokens} + ${listing.price}`,
          tokensEarned: sql`${playersTable.tokensEarned} + ${listing.price}`,
        })
        .where(eq(playersTable.id, listing.sellerId));
      await addBlookToPlayer(me.id, listing.blookName, 1, tx);
      return me2;
    });
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Purchase failed" });
    return;
  }
  req.log.info({ listingId: id, blook: listing.blookName }, "Bazaar purchase");
  res.json(
    BuyBazaarListingResponse.parse({
      blookName: listing.blookName,
      price: listing.price,
      tokens: updatedMe!.tokens,
    }),
  );
});

router.delete("/bazaar/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: "Invalid listing id" });
    return;
  }
  const me = req.player!;
  // Claim the listing atomically (active=true condition) so two concurrent
  // cancel requests can't both return the blook (dupe glitch), and do the
  // deactivate + item return in one transaction.
  const cancelled = await db.transaction(async (tx) => {
    const [listing] = await tx
      .update(bazaarListingsTable)
      .set({ active: false })
      .where(
        and(
          eq(bazaarListingsTable.id, id),
          eq(bazaarListingsTable.active, true),
          eq(bazaarListingsTable.sellerId, me.id),
        ),
      )
      .returning();
    if (!listing) return false;
    await addBlookToPlayer(me.id, listing.blookName, 1, tx);
    return true;
  });
  if (!cancelled) {
    res.status(400).json({ message: "Listing not found" });
    return;
  }
  res.json({ message: "Listing cancelled" });
});

export default router;
