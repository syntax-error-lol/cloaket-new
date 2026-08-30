import { getUncachableStripeClient } from "./stripeClient";

/**
 * Creates the Cloaket store products in Stripe. Idempotent — safe to re-run.
 * Run with: pnpm --filter @workspace/scripts exec tsx src/seed-products.ts
 */
async function createProducts() {
  const stripe = await getUncachableStripeClient();

  const existing = await stripe.products.search({
    query: "metadata['cloaket_key']:'starter_bundle' AND active:'true'",
  });
  if (existing.data.length > 0) {
    console.log("Starter Bundle already exists:", existing.data[0]!.id);
    return;
  }

  const product = await stripe.products.create({
    name: "Cloaket Starter Bundle",
    description:
      "30,000 tokens, a golden username, and a random Chroma blook added to your collection.",
    metadata: { cloaket_key: "starter_bundle" },
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 499, // $4.99
    currency: "usd",
  });
  console.log("Created:", product.id, price.id);
}

createProducts().catch((err) => {
  console.error("Error creating products:", err.message);
  process.exit(1);
});
