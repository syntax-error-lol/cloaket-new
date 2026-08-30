import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { and, eq, or, sql } from "drizzle-orm";
import { db, playersTable, tradesTable } from "@workspace/db";
import { setSessionCookie } from "../middlewares/auth";
import { addBlookToPlayer } from "../lib/game";

/**
 * Dev-only helpers. This router is only mounted when NODE_ENV !== "production"
 * (see routes/index.ts), and every handler double-checks as a belt-and-braces.
 */
const router: IRouter = Router();

// Logs in as a throwaway "devpreview" account with an active self-trade so the
// active-trade UI can be screenshotted without real credentials.
router.get("/dev/trade-preview", async (req, res): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).end();
    return;
  }
  const username = "devpreview";
  let [player] = await db
    .select()
    .from(playersTable)
    .where(sql`lower(${playersTable.username}) = lower(${username})`);
  if (!player) {
    [player] = await db
      .insert(playersTable)
      .values({
        username,
        // Random unusable password; this account is dev-only.
        passwordHash: `${randomBytes(16).toString("hex")}:${randomBytes(64).toString("hex")}`,
        tokens: 5000,
        isBot: false,
      })
      .returning();
  }
  const id = player!.id;
  const demoBlooks = ["Fairy", "Wizard", "Dragon", "Knight", "Queen"];
  for (const name of demoBlooks) {
    await addBlookToPlayer(id, name, 2).catch(() => {});
  }
  // End any current trade, then start a fresh self-trade with sample offers.
  await db
    .update(tradesTable)
    .set({ status: "declined", endedAt: new Date() })
    .where(
      and(
        eq(tradesTable.status, "active"),
        or(eq(tradesTable.playerId, id), eq(tradesTable.partnerId, id)),
      ),
    );
  await db.insert(tradesTable).values({
    playerId: id,
    partnerId: id,
    myTokens: 150,
    myBlooks: [
      { name: "Fairy", quantity: 1 },
      { name: "Wizard", quantity: 2 },
    ],
    partnerTokens: 300,
    partnerBlooks: [{ name: "Dragon", quantity: 1 }],
  });
  setSessionCookie(res, id, player.sessionVersion);
  res.redirect("/trade");
});

export default router;
