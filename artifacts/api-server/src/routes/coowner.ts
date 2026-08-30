import { Router, type IRouter } from "express";
import { asc, eq, sql } from "drizzle-orm";
import { db, grantRequestsTable, playersTable } from "@workspace/db";
import {
  CoownerLookupBody,
  CoownerLookupResponse,
  CoownerGrantBlookBody,
  CoownerGrantBlookResponse,
  CoownerGrantBundleBody,
  CoownerGrantBundleResponse,
  CoownerListGrantRequestsBody,
  CoownerListGrantRequestsResponse,
  CoownerApproveGrantRequestBody,
  CoownerApproveGrantRequestResponse,
  CoownerRejectGrantRequestBody,
  CoownerRejectGrantRequestResponse,
} from "@workspace/api-zod";
import { CATALOG_BADGES as BADGES, CATALOG_BLOOKS as BLOOKS } from "../data/catalogExtensions";
import { getBlookDef } from "../lib/game";
import { sessionPlayerId } from "../middlewares/auth";
import { rateLimit } from "../middlewares/rate-limit";
import {
  checkCoownerPassword,
  decideGrantRequest,
  grantRequestDecisionName,
  listPendingGrantRequests,
} from "./owner";

const router: IRouter = Router();

if (!process.env.COOWNER_PASSWORD) {
  console.warn(
    "[coowner] COOWNER_PASSWORD is not set — all /coowner endpoints will reject with 401 until it is configured.",
  );
}

// Legacy co-owner grant-request endpoints, kept for older clients. The
// password check itself lives in ./owner (checkCoownerPassword): the co-owner
// password is accepted owner-tier-wide — everything the owner panel can do
// except arranging the market pack order and re-enabling the 1k Pack.
router.use("/coowner", rateLimit({ windowMs: 60_000, max: 20 }));

async function findPlayer(username: string) {
  const [player] = await db
    .select({ id: playersTable.id, username: playersTable.username })
    .from(playersTable)
    .where(sql`lower(${playersTable.username}) = lower(${username}) AND ${playersTable.isBot} = false`);
  return player;
}

async function requesterName(req: Parameters<typeof sessionPlayerId>[0]): Promise<string> {
  const playerId = sessionPlayerId(req);
  if (playerId === null) return "Co-owner";
  const [player] = await db
    .select({ username: playersTable.username })
    .from(playersTable)
    .where(eq(playersTable.id, playerId));
  return player?.username ?? "Co-owner";
}

router.post("/coowner/lookup", async (req, res): Promise<void> => {
  const parsed = CoownerLookupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkCoownerPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong co-owner password" });
    return;
  }
  const players = await db
    .select({
      username: playersTable.username,
      badges: playersTable.badges,
      nameEffect: playersTable.nameEffect,
    })
    .from(playersTable)
    .orderBy(asc(playersTable.username));
  res.json(
    CoownerLookupResponse.parse({
      badges: BADGES,
      blooks: BLOOKS.map((b) => ({ name: b.name, rarity: b.rarity, image: b.image })),
      players: players.map((player) => ({
        username: player.username,
        badges: player.badges,
        nameEffect: player.nameEffect ?? null,
      })),
    }),
  );
});

router.post("/coowner/grant-blook", async (req, res): Promise<void> => {
  const parsed = CoownerGrantBlookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkCoownerPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong co-owner password" });
    return;
  }
  const blook = getBlookDef(parsed.data.blook);
  if (!blook) {
    res.status(404).json({ message: "Blook not found" });
    return;
  }
  const player = await findPlayer(parsed.data.username);
  if (!player) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  const quantity = parsed.data.quantity ?? 1;
  const requester = await requesterName(req);
  const [request] = await db
    .insert(grantRequestsTable)
    .values({
      requesterName: requester,
      targetPlayerId: player.id,
      kind: "blook",
      blookName: blook.name,
      quantity,
    })
    .returning({ id: grantRequestsTable.id });
  req.log.info(
    { requestId: request.id, requester, username: player.username, blook: blook.name, quantity },
    "Co-owner created blook reward request",
  );
  res.json(
    CoownerGrantBlookResponse.parse({
      id: request.id,
      status: "pending",
      username: player.username,
      blook: blook.name,
      quantity,
    }),
  );
});

router.post("/coowner/grant-bundle", async (req, res): Promise<void> => {
  const parsed = CoownerGrantBundleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkCoownerPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong co-owner password" });
    return;
  }
  const player = await findPlayer(parsed.data.username);
  if (!player) {
    res.status(404).json({ message: "Player not found" });
    return;
  }
  const requester = await requesterName(req);
  const [request] = await db
    .insert(grantRequestsTable)
    .values({
      requesterName: requester,
      targetPlayerId: player.id,
      kind: "starter_bundle",
    })
    .returning({ id: grantRequestsTable.id });
  req.log.info(
    { requestId: request.id, requester, username: player.username },
    "Co-owner created Starter Bundle reward request",
  );
  res.json(
    CoownerGrantBundleResponse.parse({
      id: request.id,
      status: "pending",
      username: player.username,
    }),
  );
});

router.post("/coowner/grant-requests", async (req, res): Promise<void> => {
  const parsed = CoownerListGrantRequestsBody.safeParse(req.body);
  if (!parsed.success || !checkCoownerPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong co-owner password" });
    return;
  }
  res.json(CoownerListGrantRequestsResponse.parse({ requests: await listPendingGrantRequests() }));
});

router.post("/coowner/grant-requests/approve", async (req, res): Promise<void> => {
  const parsed = CoownerApproveGrantRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkCoownerPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong co-owner password" });
    return;
  }
  const decidedBy = await grantRequestDecisionName(req, "Co-owner");
  const result = await decideGrantRequest(parsed.data.requestId, "approved", decidedBy);
  if (!result) {
    res.status(400).json({ message: "That request has already been handled" });
    return;
  }
  req.log.info(
    { requestId: result.id, kind: result.kind, targetUsername: result.targetUsername, decidedBy },
    "Co-owner approved reward request",
  );
  res.json(CoownerApproveGrantRequestResponse.parse(result));
});

router.post("/coowner/grant-requests/reject", async (req, res): Promise<void> => {
  const parsed = CoownerRejectGrantRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (!checkCoownerPassword(parsed.data.password)) {
    res.status(401).json({ message: "Wrong co-owner password" });
    return;
  }
  const decidedBy = await grantRequestDecisionName(req, "Co-owner");
  const result = await decideGrantRequest(parsed.data.requestId, "rejected", decidedBy);
  if (!result) {
    res.status(400).json({ message: "That request has already been handled" });
    return;
  }
  req.log.info(
    { requestId: result.id, kind: result.kind, targetUsername: result.targetUsername, decidedBy },
    "Co-owner rejected reward request",
  );
  res.json(CoownerRejectGrantRequestResponse.parse(result));
});

export default router;