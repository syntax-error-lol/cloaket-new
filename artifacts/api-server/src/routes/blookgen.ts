import { Router, type IRouter } from "express";
import { GenerateBlookBody, GenerateBlookResponse } from "@workspace/api-zod";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server/image";
import { logger } from "../lib/logger";
import { rateLimit } from "../middlewares/rate-limit";

const router: IRouter = Router();

// Image generation is expensive — throttle per IP (5/min, 30/hour).
router.use(
  "/blookgen/generate",
  rateLimit({ windowMs: 60_000, max: 5 }),
  rateLimit({ windowMs: 3_600_000, max: 30 }),
);

const STYLE_PROMPT =
  "cute flat 2D vector blook character: ONE large rounded-square block shape filling most of the frame, the face with big oval eyes drawn directly on the front of the block, only tiny features (ears, horns, small hat, antennae) sticking out slightly past the block edges, body IS the block — no separate arms, legs or body, flat solid colors, one darker flat shade, no gradients, no outlines, no text, centered, plain solid white background";

router.post("/blookgen/generate", async (req, res) => {
  const parsed = GenerateBlookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Please describe your blook (2-300 characters)." });
    return;
  }

  const description = parsed.data.description.trim();
  if (description.length < 2) {
    res.status(400).json({ message: "Please describe your blook (2-300 characters)." });
    return;
  }

  try {
    const buffer = await generateImageBuffer(
      `${description}, ${STYLE_PROMPT}`,
      "1024x1024",
    );
    if (buffer.length === 0) {
      res.status(500).json({ message: "Image generation failed. Please try again." });
      return;
    }
    const imageDataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
    res.json(GenerateBlookResponse.parse({ imageDataUrl }));
  } catch (err) {
    logger.error({ err }, "Blook generation failed");
    res.status(500).json({ message: "Image generation failed. Please try again." });
  }
});

export default router;
