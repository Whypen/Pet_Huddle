import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pricingSource = readFileSync(
  join(process.cwd(), "supabase/functions/stripe-pricing/index.ts"),
  "utf8",
);

describe("Stripe pricing mode contract", () => {
  it("resolves membership prices by canonical lookup key before mode-bound ids", () => {
    const coreBranch = pricingSource.slice(
      pricingSource.indexOf("if (CORE_PREMIUM_KEYS.has(key))"),
      pricingSource.indexOf("} else {", pricingSource.indexOf("if (CORE_PREMIUM_KEYS.has(key))")),
    );

    expect(coreBranch).toContain("resolveLookupKeyFromMetadata(key, targetCurrency)");
    expect(coreBranch).toContain("resolvePriceByLookupKey(stripe, lookupKey)");
    expect(coreBranch.indexOf("resolvePriceByLookupKey")).toBeLessThan(
      coreBranch.indexOf("stripe.prices.retrieve(priceId"),
    );
  });
});
