import { Router, type IRouter } from "express";
import {
  AssignBaseWorkerBody,
  AssignBaseWorkerResponse,
  BuyBaseSlotResponse,
  ClaimBaseTokensResponse,
  DismissBaseWorkerParams,
  DismissBaseWorkerResponse,
  GetBaseResponse,
} from "@workspace/api-zod";
import {
  assignPermanentBaseWorkers,
  buyBaseSlot,
  claimBaseProduction,
  dismissBaseWorker,
  getBaseStatus,
} from "../lib/progression";

const router: IRouter = Router();

router.get("/base", async (req, res): Promise<void> => {
  res.json(GetBaseResponse.parse(await getBaseStatus(req.player!.id)));
});

router.post("/base/workers", async (req, res): Promise<void> => {
  const parsed = AssignBaseWorkerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Pick at least one blook to assign" });
    return;
  }
  const result = await assignPermanentBaseWorkers(req.player!.id, parsed.data.blookNames);
  if (!result.ok) {
    res.status(400).json({ message: result.error });
    return;
  }
  req.log.info(
    { requested: parsed.data.blookNames.length, deployed: result.deployedCount, skipped: result.skippedCount },
    "Base workers assigned",
  );
  res.json(
    AssignBaseWorkerResponse.parse({
      deployedCount: result.deployedCount,
      skippedCount: result.skippedCount,
      base: result.status,
    }),
  );
});

router.delete("/base/workers/:workerId", async (req, res): Promise<void> => {
  const parsed = DismissBaseWorkerParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid miner" });
    return;
  }
  const result = await dismissBaseWorker(req.player!.id, parsed.data.workerId);
  if (!result.ok) {
    res.status(400).json({ message: result.error });
    return;
  }
  req.log.info(
    { workerId: parsed.data.workerId, blook: result.blookName, refund: result.tokensAwarded },
    "Base worker dismissed",
  );
  res.json(
    DismissBaseWorkerResponse.parse({
      tokensAwarded: result.tokensAwarded,
      tokens: result.tokens,
      base: result.status,
    }),
  );
});

router.post("/base/buy-slot", async (req, res): Promise<void> => {
  const result = await buyBaseSlot(req.player!.id);
  if (!result.ok) {
    res.status(400).json({ message: result.error });
    return;
  }
  req.log.info("Base miner slot purchased");
  res.json(BuyBaseSlotResponse.parse({ tokens: result.tokens, base: result.status }));
});

router.post("/base/claim", async (req, res): Promise<void> => {
  const result = await claimBaseProduction(req.player!.id);
  if (!result.ok) {
    res.status(400).json({ message: result.error });
    return;
  }
  res.json(
    ClaimBaseTokensResponse.parse({
      claimed: result.claimed,
      tokensAwarded: result.tokensAwarded,
      tokens: result.tokens,
      base: result.status,
    }),
  );
});

export default router;