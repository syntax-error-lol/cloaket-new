import { Router, type IRouter } from "express";
import { requirePlayer } from "../middlewares/auth";
import { requirePanelApproval } from "../middlewares/panel-approval";
import healthRouter from "./health";
import authRouter from "./auth";
import adminRouter from "./admin";
import adminAiScanRouter from "./adminAiScan";
import ownerRouter from "./owner";
import coownerRouter from "./coowner";
import modRouter from "./mod";
import playerRouter from "./player";
import baseRouter from "./base";
import blooksRouter from "./blooks";
import packsRouter from "./packs";
import bazaarRouter from "./bazaar";
import chatRouter from "./chat";
import socialRouter from "./social";
import tradesRouter from "./trades";
import clansRouter from "./clans";
import storageRouter from "./storage";
import storeRouter from "./store";
import craftRouter from "./craft";
import friendsRouter from "./friends";
import dmsRouter from "./dms";
import giftsRouter from "./gifts";
import blookgenRouter from "./blookgen";
import { staffBruteforceGuard } from "../middlewares/staff-guard";
import devRouter from "./dev";

const router: IRouter = Router();

router.use(healthRouter);
if (process.env.NODE_ENV !== "production") {
  router.use(devRouter);
}
router.use(authRouter);
// Staff panels: only owner-approved accounts may even attempt a password.
router.use(["/admin", "/mod", "/coowner", "/owner", "/blookgen"], staffBruteforceGuard, requirePanelApproval);
router.use(adminRouter);
router.use(adminAiScanRouter);
router.use(ownerRouter);
router.use(coownerRouter);
router.use(modRouter);
router.use(blookgenRouter);
router.use(requirePlayer);
router.use(playerRouter);
router.use(baseRouter);
router.use(blooksRouter);
router.use(packsRouter);
router.use(bazaarRouter);
router.use(chatRouter);
router.use(socialRouter);
router.use(tradesRouter);
router.use(clansRouter);
router.use(storageRouter);
router.use(storeRouter);
router.use(craftRouter);
router.use(friendsRouter);
router.use(dmsRouter);
router.use(giftsRouter);

export default router;
