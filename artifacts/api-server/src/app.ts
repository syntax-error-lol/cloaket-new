import express, { type Express } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { MAINTENANCE_MODE, MAINTENANCE_MESSAGE } from "./lib/maintenance";
import { WebhookHandlers } from "./lib/webhookHandlers";
import { fulfillUnclaimedPurchases } from "./routes/store";

const app: Express = express();

// Behind Replit's proxy — trust the X-Forwarded-For hops added by our
// infrastructure so req.ip is the real client IP (used by per-IP rate
// limiting and lastIp tracking) instead of a proxy address.
// Hop-count-based trust broke twice as the ingress changed (req.ip became a
// shared Google LB/front-end address for EVERY player, collapsing rate
// limits onto one shared IP). Trust by ADDRESS RANGE instead: Express walks
// X-Forwarded-For right-to-left, skipping any address in a trusted range,
// and stops at the first untrusted one — the real client — regardless of how
// many proxy hops the infrastructure adds or removes.
// Ranges: private/loopback (workspace + internal proxies), plus Google
// Cloud's DOCUMENTED load-balancer / front-end source ranges
// (35.191.0.0/16, 130.211.0.0/22). Deliberately NOT trusting broad public
// GCP space (34.0.0.0/8 etc.) — a player could rent a VM there and spoof
// X-Forwarded-For to evade rate limits. TRUST_PROXY_HOPS (numeric) can
// override these ranges if the ingress changes again.
const hops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? "", 10);
app.set(
  "trust proxy",
  Number.isInteger(hops) && hops > 0
    ? hops
    : ["loopback", "linklocal", "uniquelocal", "35.191.0.0/16", "130.211.0.0/22"],
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Cross-origin browser access is never legitimate here — the game client is
// served from the same origin as the API in dev and production (path
// routing), with cloaket.com fronting the published deployment. The previous
// `origin: true` reflected ANY website back with credentials allowed, letting
// a malicious page aim authenticated requests at the API from a player's
// browser (risky on older browsers that don't default cookies to
// SameSite=Lax). Same-origin/no-Origin requests pass; our own domains pass;
// every other origin gets no CORS headers, so browsers block it.
const CORS_ALLOWED_HOSTS = new Set<string>(
  [
    ...(process.env.REPLIT_DOMAINS?.split(",") ?? []),
    process.env.REPLIT_DEV_DOMAIN,
    "cloaket.com",
    "www.cloaket.com",
  ]
    .filter((h): h is string => Boolean(h))
    .map((h) => h.trim().toLowerCase()),
);
app.use(
  cors({
    credentials: true,
    origin(origin, cb) {
      if (!origin) {
        cb(null, true); // same-origin, curl, server-to-server
        return;
      }
      try {
        cb(null, CORS_ALLOWED_HOSTS.has(new URL(origin).hostname.toLowerCase()));
      } catch {
        cb(null, false);
      }
    },
  }),
);
app.use(cookieParser());

// Stripe webhook must be registered BEFORE express.json() — it needs the raw
// body Buffer for signature verification.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature" });
      return;
    }
    try {
      const sig = Array.isArray(signature) ? signature[0]! : signature;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
      // Instant fulfillment: the moment Stripe tells us a checkout finished,
      // grant any paid-but-unclaimed bundles (sync above already stored it).
      try {
        const event = JSON.parse((req.body as Buffer).toString("utf8")) as { type?: string };
        if (event.type === "checkout.session.completed") {
          fulfillUnclaimedPurchases()
            .then((n) => {
              if (n > 0) logger.info({ fulfilled: n }, "Webhook-triggered purchase fulfillment");
            })
            .catch((err) => logger.error({ err }, "Webhook-triggered fulfillment failed"));
        }
      } catch {
        // Non-JSON payload — nothing to do.
      }
    } catch (error) {
      logger.error({ err: error }, "Stripe webhook error");
      res.status(400).json({ error: "Webhook processing error" });
    }
  },
);

// Default small JSON body limit for all API routes (Stripe's raw webhook is
// registered above, before this parser).
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Self-hosted game images (blooks/packs/badges), downloaded from blacket.org
// because it blocks hotlinked .png/.gif images in browsers.
const publicDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public",
);
app.use(
  "/api/content",
  express.static(path.join(publicDir, "content"), {
    immutable: true,
    maxAge: "7d",
  }),
);

// EMERGENCY MAINTENANCE GATE (hack recovery): while the owner restores the
// database, every game API route answers 503 so no gameplay, logins, or chat
// can write to the database mid-restore. Stripe webhooks and /api/content
// static images are mounted above this gate and stay reachable. Boot-time
// sweeps (including the hack repair) are not HTTP and run normally.
if (MAINTENANCE_MODE) {
  app.use("/api", (_req, res) => {
    res.status(503).json({ maintenance: true, message: MAINTENANCE_MESSAGE });
  });
}

app.use("/api", router);

// Render runs the API and frontend as one service. Keep API routes above this
// mount, then serve the Vite output for the root page and client-side routes.
// The frontend is optional in the Replit API-only workflow, so only register
// these handlers when its production build is present.
const frontendDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../blacket-game/dist/public",
);
const frontendIndex = path.join(frontendDir, "index.html");

if (existsSync(frontendIndex)) {
  const frontendStatic = express.static(frontendDir, {
    immutable: true,
    maxAge: "1h",
  });

  app.use((req, res, next) => {
    if (req.path === "/api" || req.path.startsWith("/api/")) {
      next();
      return;
    }
    frontendStatic(req, res, next);
  });

  app.use((req, res, next) => {
    if (
      req.path === "/api" ||
      req.path.startsWith("/api/") ||
      (req.method !== "GET" && req.method !== "HEAD")
    ) {
      next();
      return;
    }

    res.sendFile(frontendIndex, (error) => {
      if (error) next(error);
    });
  });
}

export default app;
