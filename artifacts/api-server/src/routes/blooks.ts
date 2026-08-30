import { Router, type IRouter } from "express";
import {
  GetBlooksResponse,
  GetRaritiesResponse,
  GetPacksResponse,
} from "@workspace/api-zod";
import { RARITIES } from "../data/blacketData";
import { CATALOG_BLOOKS as BLOOKS, CATALOG_PACKS as PACKS } from "../data/catalogExtensions";
import { getBlookDef, TOP_PACK } from "../lib/game";
import { orderedPacks } from "../lib/packOrder";
import { isTopPackDisabled } from "./owner";
import { isTopPackSoldOut, getTopPackRemaining } from "../lib/topPack";

const router: IRouter = Router();

router.get("/blooks", (_req, res) => {
  res.json(GetBlooksResponse.parse(BLOOKS));
});

router.get("/rarities", (_req, res) => {
  const result = Object.entries(RARITIES).map(([name, r]) => ({
    name,
    color: r.color,
    animation: r.animation,
    exp: r.exp,
  }));
  res.json(GetRaritiesResponse.parse(result));
});

router.get("/packs", async (_req, res) => {
  const topDisabled = (await isTopPackDisabled()) || (await isTopPackSoldOut());
  const topRemaining = topDisabled ? null : await getTopPackRemaining();
  // Owner-set market order (falls back to catalog order when unset).
  const list = await orderedPacks(PACKS);
  const result = list.filter((p) => !(topDisabled && p.name === TOP_PACK)).map((p) => ({
    name: p.name,
    price: p.price,
    color1: p.color1,
    color2: p.color2,
    image: p.image,
    remaining: p.name === TOP_PACK ? topRemaining : null,
    blooks: p.blooks
      .map((n) => getBlookDef(n))
      .filter((b) => b !== undefined),
  }));
  res.json(GetPacksResponse.parse(result));
});

export default router;
