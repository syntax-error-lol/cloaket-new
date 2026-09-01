import { runMigrations } from "stripe-replit-sync";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import app from "./app";
import { CATALOG_BLOOKS as BLOOKS } from "./data/catalogExtensions";
import { COLLECTOR_THRESHOLD } from "./lib/game";
import { runHackRepair } from "./lib/hackRepair";
import { logger } from "./lib/logger";
import { MAINTENANCE_MODE } from "./lib/maintenance";
import { sweepBaseWorkerRates } from "./lib/progression";
import { autoCollectHeldMines } from "./lib/clanHeldBlooks";
import { getStripeSync, getUncachableStripeClient } from "./lib/stripeClient";
import { applyBundleUpgrades, fulfillUnclaimedPurchases, syncStarterBundleBadges } from "./routes/store";
import { startDiscordBot } from "./discord/bot";

/**
 * Remove synced products/prices that don't exist in the currently active
 * Stripe account (e.g. leftovers from the sandbox account after switching
 * to live keys). Stale rows can make the store offer resolve to a price id
 * that the active account rejects at checkout.
 */
async function cleanupStaleStripeRows() {
  const stripe = await getUncachableStripeClient();
  const liveIds = new Set<string>();
  for await (const p of stripe.products.list({ limit: 100 })) liveIds.add(p.id);
  const rows = (await db.execute(sql`SELECT id FROM stripe.products`)) as unknown as {
    rows: Array<{ id: string }>;
  };
  const stale = rows.rows.map((r) => r.id).filter((id) => !liveIds.has(id));
  if (stale.length > 0) {
    const ids = sql.join(stale.map((id) => sql`${id}`), sql`, `);
    await db.execute(sql`DELETE FROM stripe.prices WHERE product IN (${ids})`);
    await db.execute(sql`DELETE FROM stripe.products WHERE id IN (${ids})`);
    logger.info({ stale }, "Removed stale Stripe products from other accounts");
  }
}

/** Preserve existing Monitor inventory and history after correcting its typo. */
async function renameMoniterBlook() {
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'monitor_blook_rename_done') THEN
        UPDATE owned_blooks old
        SET quantity = old.quantity + current_row.quantity
        FROM owned_blooks current_row
        WHERE old.blook_name = 'Monitor'
          AND current_row.blook_name = 'Moniter'
          AND old.player_id = current_row.player_id;

        DELETE FROM owned_blooks WHERE blook_name = 'Moniter'
          AND EXISTS (
            SELECT 1 FROM owned_blooks current_row
            WHERE current_row.blook_name = 'Monitor'
              AND current_row.player_id = owned_blooks.player_id
          );
        UPDATE owned_blooks SET blook_name = 'Monitor' WHERE blook_name = 'Moniter';
        UPDATE unlocks SET blook_name = 'Monitor' WHERE blook_name = 'Moniter';
        UPDATE bazaar_listings SET blook_name = 'Monitor' WHERE blook_name = 'Moniter';
        UPDATE pack_pulls SET blook_name = 'Monitor' WHERE blook_name = 'Moniter';
        UPDATE clan_held_blooks SET blook_name = 'Monitor' WHERE blook_name = 'Moniter';
        UPDATE base_workers SET blook_name = 'Monitor' WHERE blook_name = 'Moniter';
        UPDATE players SET avatar_blook = 'Monitor' WHERE avatar_blook = 'Moniter';
        UPDATE trades SET
          my_blooks = replace(my_blooks::text, 'Moniter', 'Monitor')::jsonb,
          partner_blooks = replace(partner_blooks::text, 'Moniter', 'Monitor')::jsonb
        WHERE my_blooks::text LIKE '%Moniter%' OR partner_blooks::text LIKE '%Moniter%';

        INSERT INTO app_settings (key, value) VALUES ('monitor_blook_rename_done', 'true')
        ON CONFLICT (key) DO NOTHING;
      END IF;
    END $$;
  `);
  logger.info("Monitor blook rename checked");
}

/** Fix Tech pack typos ("Camra Drone" → "Camera Drone", "Nitendo Switch" → "Nintendo Switch") preserving inventory and history. */
async function renameTechTypoBlooks() {
  await db.execute(sql`
    DO $$
    DECLARE
      pair RECORD;
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'tech_blook_typo_rename_done_v2') THEN
        FOR pair IN SELECT * FROM (VALUES ('Camra Drone', 'Camera Drone'), ('Nitendo Switch', 'Nintendo Switch')) AS t(old_name, new_name) LOOP
          -- Merge quantities if someone already pulled the corrected name post-deploy
          UPDATE owned_blooks old
          SET quantity = old.quantity + current_row.quantity
          FROM owned_blooks current_row
          WHERE old.blook_name = pair.new_name
            AND current_row.blook_name = pair.old_name
            AND old.player_id = current_row.player_id;

          DELETE FROM owned_blooks WHERE blook_name = pair.old_name
            AND EXISTS (
              SELECT 1 FROM owned_blooks current_row
              WHERE current_row.blook_name = pair.new_name
                AND current_row.player_id = owned_blooks.player_id
            );
          DELETE FROM unlocks WHERE blook_name = pair.old_name
            AND EXISTS (
              SELECT 1 FROM unlocks u2
              WHERE u2.blook_name = pair.new_name
                AND u2.player_id = unlocks.player_id
            );
          UPDATE owned_blooks SET blook_name = pair.new_name WHERE blook_name = pair.old_name;
          UPDATE unlocks SET blook_name = pair.new_name WHERE blook_name = pair.old_name;
          UPDATE bazaar_listings SET blook_name = pair.new_name WHERE blook_name = pair.old_name;
          UPDATE pack_pulls SET blook_name = pair.new_name WHERE blook_name = pair.old_name;
          UPDATE clan_held_blooks SET blook_name = pair.new_name WHERE blook_name = pair.old_name;
          UPDATE base_workers SET blook_name = pair.new_name WHERE blook_name = pair.old_name;
          UPDATE grant_requests SET blook_name = pair.new_name WHERE blook_name = pair.old_name;
          UPDATE dm_messages SET gift_blook = pair.new_name WHERE gift_blook = pair.old_name;
          UPDATE store_purchases SET chroma_blook = pair.new_name WHERE chroma_blook = pair.old_name;
          UPDATE players SET avatar_blook = pair.new_name WHERE avatar_blook = pair.old_name;
          UPDATE craft_logs SET result_name = pair.new_name WHERE result_name = pair.old_name;
          UPDATE craft_logs SET inputs = replace(inputs::text, pair.old_name, pair.new_name)::jsonb
          WHERE inputs::text LIKE '%' || pair.old_name || '%';
          UPDATE trades SET
            my_blooks = replace(my_blooks::text, pair.old_name, pair.new_name)::jsonb,
            partner_blooks = replace(partner_blooks::text, pair.old_name, pair.new_name)::jsonb
          WHERE my_blooks::text LIKE '%' || pair.old_name || '%'
             OR partner_blooks::text LIKE '%' || pair.old_name || '%';
        END LOOP;

        INSERT INTO app_settings (key, value) VALUES ('tech_blook_typo_rename_done_v2', 'true')
        ON CONFLICT (key) DO NOTHING;
      END IF;
    END $$;
  `);
  logger.info("Tech blook typo rename checked");
}

/** Initialize Stripe schema, managed webhook, and data sync on startup. */
async function initStripe() {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Stripe integration.");
  }
  logger.info("Initializing Stripe schema...");
  await runMigrations({ databaseUrl });

  const stripeSync = await getStripeSync();
  try {
    const webhookBaseUrl = `https://${process.env["REPLIT_DOMAINS"]?.split(",")[0]}`;
    await stripeSync.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`,
    );
  } catch (err) {
    // Webhook registration failing must not prevent the data backfill below.
    logger.error({ err }, "Error creating Stripe webhook");
  }

  // A bare syncBackfill() does NOT populate stripe.products/prices —
  // sync those explicitly or the store offer stays unavailable.
  try {
    await stripeSync.syncBackfill({ object: "product" });
    await stripeSync.syncBackfill({ object: "price" });
    await stripeSync.syncBackfill();
    await cleanupStaleStripeRows();
    logger.info("Stripe data synced");
  } catch (err) {
    logger.error({ err }, "Error syncing Stripe data");
  }
}

/**
 * Boot-time sweep (idempotent): award Collector to everyone at/over the 90%
 * threshold and revoke it from anyone who has fallen below it, so a publish
 * immediately reconciles live players.
 */
async function backfillCollectorBadge() {
  const threshold = COLLECTOR_THRESHOLD;
  const namesSql = sql.join(
    BLOOKS.map((b) => sql`${b.name}`),
    sql`, `,
  );
  const awarded = await db.execute(sql`
    UPDATE players p
    SET badges = badges || '["Collector"]'::jsonb
    FROM (
      SELECT player_id, count(*) AS n FROM owned_blooks
      WHERE quantity > 0 AND blook_name IN (${namesSql})
      GROUP BY player_id
    ) c
    WHERE c.player_id = p.id
      AND c.n >= ${threshold}
      AND NOT (p.badges @> '["Collector"]'::jsonb)
  `);
  const revoked = await db.execute(sql`
    UPDATE players p
    SET badges = badges - 'Collector'
    WHERE p.badges @> '["Collector"]'::jsonb
      AND (
        SELECT count(*) FROM owned_blooks ob
        WHERE ob.player_id = p.id AND ob.quantity > 0 AND ob.blook_name IN (${namesSql})
      ) < ${threshold}
  `);
  logger.info(
    { awarded: awarded.rowCount ?? 0, revoked: revoked.rowCount ?? 0, threshold },
    "Collector badge sweep done",
  );
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");

  // Run Stripe setup in the background AFTER the server is up — a slow or
  // failing Stripe init must never block the health check (it previously
  // caused deployments to fail promotion in a silent restart loop).
  initStripe()
    .then(() => logger.info("Stripe initialization complete"))
    .catch((err) => logger.error({ err }, "Stripe initialization failed"));

  backfillCollectorBadge().catch((err) =>
    logger.error({ err }, "Collector badge backfill failed"),
  );

  syncStarterBundleBadges()
    .then((awarded) => logger.info({ awarded }, "Starter Bundle badge sync done"))
    .catch((err) => logger.error({ err }, "Starter Bundle badge sync failed"));

  // One-time data heal: reset any players who ended up with negative tokens
  // (from old non-race-safe purchases) back to zero.
  db.execute(sql`UPDATE players SET tokens = 0 WHERE tokens < 0`)
    .then((r) => logger.info({ fixed: r.rowCount ?? 0 }, "Negative token sweep done"))
    .catch((err) => logger.error({ err }, "Negative token sweep failed"));

  // Rebalance heal: base dig rates were retuned (e.g. Uncommon 12/hr → 2/hr).
  // Settles each affected mine at its old stored rate first, then re-syncs
  // worker rows to the current rate table. Idempotent after the first run.
  sweepBaseWorkerRates()
    .then(({ updated, failed }) => logger.info({ updated, failed }, "Base worker rate sweep done"))
    .catch((err) => logger.error({ err }, "Base worker rate sweep failed"));

  // One-time data heal: before TRUST_PROXY_HOPS=2 was set in production,
  // req.ip resolved to Google's load balancers, so players.last_ip was a
  // shared 34.x/35.x datacenter address for everyone (up to 77 players per
  // "IP"). Null those out so IP-ban shared-account lists reflect real,
  // individual client IPs only. Idempotent; real client IPs are untouched.
  db.execute(
    sql`UPDATE players SET last_ip = NULL
        WHERE last_ip IS NOT NULL
          AND last_ip ~ '^(34|35)\\.'
          AND (last_ip::inet <<= '34.0.0.0/8'::inet OR last_ip::inet <<= '35.0.0.0/8'::inet)`,
  )
    .then((r) => logger.info({ cleared: r.rowCount ?? 0 }, "Datacenter last_ip sweep done"))
    .catch((err) => logger.error({ err }, "Datacenter last_ip sweep failed"));

  // One-time data heal (flag-gated so it never re-runs): remove owner-granted
  // 1ks while keeping every 1k that entered circulation through a real Top
  // pack pull — INCLUDING ones later traded to other players. Each player's
  // allowance = their own logged 1k pulls + net 1ks received via completed
  // trades; anything they own above that is a pre-pack grant and is deleted.
  // Players left with 0 also lose the unlock, bazaar listings, and 1k avatar.
  db.execute(
    sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'unpulled_1k_cleanup_done') THEN
          CREATE TEMP TABLE onek_allow ON COMMIT DROP AS
          WITH pulls AS (
            SELECT player_id AS pid, count(*)::int AS n
            FROM pack_pulls WHERE blook_name = '1k' GROUP BY player_id
          ),
          moves AS (
            -- player_id gives my_blooks, receives partner_blooks (and vice versa)
            SELECT t.player_id AS pid, -SUM((e->>'quantity')::int) AS n
            FROM trades t, jsonb_array_elements(t.my_blooks) e
            WHERE t.status = 'completed' AND e->>'name' = '1k' GROUP BY t.player_id
            UNION ALL
            SELECT t.partner_id, SUM((e->>'quantity')::int)
            FROM trades t, jsonb_array_elements(t.my_blooks) e
            WHERE t.status = 'completed' AND e->>'name' = '1k' GROUP BY t.partner_id
            UNION ALL
            SELECT t.partner_id, -SUM((e->>'quantity')::int)
            FROM trades t, jsonb_array_elements(t.partner_blooks) e
            WHERE t.status = 'completed' AND e->>'name' = '1k' GROUP BY t.partner_id
            UNION ALL
            SELECT t.player_id, SUM((e->>'quantity')::int)
            FROM trades t, jsonb_array_elements(t.partner_blooks) e
            WHERE t.status = 'completed' AND e->>'name' = '1k' GROUP BY t.player_id
          )
          SELECT pid, SUM(n)::int AS allow FROM (
            SELECT pid, n FROM pulls
            UNION ALL
            SELECT pid, n FROM moves
            UNION ALL
            -- Owner-confirmed exemptions (bought theirs off the bazaar, which
            -- has no sales log): they keep 1 each.
            SELECT id, 1 FROM players WHERE username IN ('Kaz', 'MatthewiskingerGD')
          ) all_moves GROUP BY pid;

          UPDATE owned_blooks ob
          SET quantity = GREATEST(LEAST(ob.quantity, a.allow), 0)
          FROM onek_allow a
          WHERE ob.blook_name = '1k' AND ob.player_id = a.pid AND ob.quantity > GREATEST(a.allow, 0);

          DELETE FROM owned_blooks ob WHERE ob.blook_name = '1k'
            AND (ob.quantity <= 0 OR ob.player_id NOT IN (SELECT pid FROM onek_allow WHERE allow > 0));
          DELETE FROM bazaar_listings WHERE blook_name = '1k'
            AND seller_id NOT IN (SELECT pid FROM onek_allow WHERE allow > 0);
          DELETE FROM unlocks u WHERE u.blook_name = '1k'
            AND NOT EXISTS (SELECT 1 FROM owned_blooks ob WHERE ob.player_id = u.player_id AND ob.blook_name = '1k');
          UPDATE players p SET avatar_blook = NULL WHERE p.avatar_blook = '1k'
            AND NOT EXISTS (SELECT 1 FROM owned_blooks ob WHERE ob.player_id = p.id AND ob.blook_name = '1k');

          -- Owner decision: the ~100 1ks already in circulation ARE the full
          -- supply — the Top pack launches already sold out (hidden, opens
          -- rejected). No new 1ks can ever be pulled.
          INSERT INTO app_settings (key, value) VALUES ('top_pack_remaining', '0')
          ON CONFLICT (key) DO UPDATE SET value = '0';

          INSERT INTO app_settings (key, value) VALUES ('unpulled_1k_cleanup_done', 'true')
          ON CONFLICT (key) DO NOTHING;
        END IF;
      END $$;
    `,
  )
    .then(() => logger.info("Unpulled 1k cleanup checked"))
    .catch((err) => logger.error({ err }, "Unpulled 1k cleanup failed"));

  // One-time flag-gated backfill: catnapcasualty's legacy hard-coded custom
  // avatar moves into players.custom_avatar_url so the owner panel can
  // remove or replace it like any other custom pfp. The WHERE guard keeps
  // this from clobbering an owner-set value if the flag row is ever lost.
  db.execute(
    sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'custom_avatar_backfill_done') THEN
          UPDATE players SET custom_avatar_url = '/api/content/avatars/catnapcasualty.gif'
            WHERE lower(username) = 'catnapcasualty' AND custom_avatar_url IS NULL;
          INSERT INTO app_settings (key, value) VALUES ('custom_avatar_backfill_done', 'true')
          ON CONFLICT (key) DO NOTHING;
        END IF;
      END $$;
    `,
  )
    .then(() => logger.info("Custom avatar backfill checked"))
    .catch((err) => logger.error({ err }, "Custom avatar backfill failed"));

  // The one-time global logout sweep (Aug 28) already did its job on the
  // current timeline — every stolen pre-hack cookie is dead. It is REMOVED
  // (not just flag-gated) because the forward restore wipes app_settings,
  // which would have made it re-run and log everyone out again — and the
  // owner explicitly wants sessions to survive the restore. The hack repair
  // preserves sessions instead by restoring each player's exact captured
  // session_version.
  runHackRepair()
    .then((s) => logger.info(s, "Hack repair sweep checked"))
    .catch((err) => logger.error({ err }, "Hack repair sweep failed"));

  renameMoniterBlook().catch((err) => logger.error({ err }, "Monitor blook rename failed"));
  renameTechTypoBlooks().catch((err) => logger.error({ err }, "Tech blook typo rename failed"));

  // Safety net: fulfill any paid store purchase that never got claimed
  // (player closed the tab / lost login before the redirect-back claim).
  const sweepPurchases = () =>
    fulfillUnclaimedPurchases()
      .then((n) => {
        if (n > 0) logger.info({ fulfilled: n }, "Unclaimed purchase sweep granted bundles");
      })
      .catch((err) => logger.error({ err }, "Unclaimed purchase sweep failed"));
  sweepPurchases();
  setInterval(sweepPurchases, 10 * 60 * 1000);

  // Held-mine auto-collect: clan mine pay deposits itself into every
  // member's balance — there is no collect button. Whole banked tokens pay
  // out each sweep; fractional accrual is preserved because the member
  // clock only advances when tokens actually pay.
  const sweepHeldMines = () =>
    autoCollectHeldMines()
      .then(({ paidMembers, totalPaid, failed }) => {
        if (totalPaid > 0 || failed > 0)
          logger.info({ paidMembers, totalPaid, failed }, "Held mine auto-collect sweep done");
      })
      .catch((err) => logger.error({ err }, "Held mine auto-collect sweep failed"));
  sweepHeldMines();
  setInterval(sweepHeldMines, 5 * 60 * 1000);

  // Discord bot (live chat bridge + /open). No-op if DISCORD_BOT_TOKEN unset.
  // During emergency maintenance the bot stays offline entirely — /open and
  // the chat bridge write to the database, which must stay frozen mid-restore.
  if (MAINTENANCE_MODE) {
    logger.info("Discord bot not started: maintenance mode");
  } else {
    try {
      startDiscordBot();
    } catch (err) {
      logger.error({ err }, "Discord bot failed to start");
    }
  }

  // Grant existing bundle owners any newly added bundle rewards.
  applyBundleUpgrades()
    .then((n) => logger.info({ upgraded: n }, "Bundle upgrade sweep done"))
    .catch((err) => logger.error({ err }, "Bundle upgrade sweep failed"));
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});
