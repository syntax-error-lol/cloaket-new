import { Router, type IRouter } from "express";
import { OpenPackResponse } from "@workspace/api-zod";
import { getPackDef, TOP_PACK } from "../lib/game";
import { openPackForPlayer } from "../lib/openPack";
import { checkPackOpen, releasePackOpen } from "../lib/packOpenGuard";
import { isTopPackDisabled } from "./owner";
import { isTopPackSoldOut } from "../lib/topPack";

const router: IRouter = Router();

router.post("/packs/:name/open", async (req, res): Promise<void> => {
  const raw = req.params.name;
  const packName = Array.isArray(raw) ? raw[0]! : raw;
  if (
    !getPackDef(packName) ||
    (packName === TOP_PACK && ((await isTopPackDisabled()) || (await isTopPackSoldOut())))
  ) {
    res.status(400).json({ message: "Unknown pack" });
    return;
  }
  const player = req.player!;
  const guard = checkPackOpen(player.id);
  if (!guard.ok) {
    req.log.warn({ pack: packName, reason: guard.reason }, "Pack open blocked by auto-opener guard");
    res.status(guard.status).json({ message: guard.message });
    return;
  }
  let result;
  try {
    result = await openPackForPlayer(player.id, packName);
  } finally {
    releasePackOpen(player.id);
  }
  if (!result.ok) {
    res.status(400).json({ message: result.error });
    return;
  }
  req.log.info({ pack: packName, blook: result.blook?.name ?? null, isNew: result.isNew }, "Pack opened");
  res.json(
    OpenPackResponse.parse({
      blook: result.blook,
      isNew: result.isNew,
      tokens: result.tokens,
      experience: result.experience,
      level: result.level,
      pullId: result.pullId,
    }),
  );
});

export default router;
