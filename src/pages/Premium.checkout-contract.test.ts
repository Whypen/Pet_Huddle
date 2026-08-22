import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSubscriptionCheckoutBody } from "@/lib/checkoutContract";

const premiumSource = readFileSync(join(process.cwd(), "src/pages/Premium.tsx"), "utf8");
const routesSource = readFileSync(join(process.cwd(), "src/routes/FullAppRoutes.tsx"), "utf8");

describe("web membership checkout contract", () => {
  it("keeps Premium route-lazy and out of primary surface boot imports", () => {
    expect(routesSource).toContain('lazyWithChunkRecovery("premium", () => import("@/pages/Premium"))');
    expect(routesSource).not.toMatch(/^import Premium from/m);
    expect(routesSource).toContain('path="/member"');
    expect(routesSource).toContain('<Route path="/premium" element={<Navigate to="/member" replace />} />');
  });

  it("preserves safe customer copy while recording structured checkout stages and codes", () => {
    expect(premiumSource).toContain('[premium.checkout_failed]');
    expect(premiumSource).toContain('stage, code');
    expect(premiumSource).toContain('reportCheckoutFailure("addon_sequence", error)');
    expect(premiumSource).toContain('reportCheckoutFailure("plan", error)');
    expect(premiumSource).toContain('reportCheckoutFailure("share_perks", error)');
    expect(premiumSource).toContain('reportCheckoutFailure("addon_payment", error)');
    expect(premiumSource.match(/Checkout unavailable\. Please try again\./g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("uses only the existing checkout function contract", () => {
    expect(premiumSource).toContain('invokeAuthedFunction<{ url?: string }>("create-checkout-session"');
    expect(premiumSource).toContain("buildSubscriptionCheckoutBody({");
    expect(premiumSource).not.toContain("stripe-return");
    expect(premiumSource).not.toContain("stripe-refresh");

    expect(buildSubscriptionCheckoutBody({
      userId: "viewer-1",
      type: "gold_monthly",
      lookupKey: "Gold_monthly",
      successUrl: "https://huddle.pet/member?plan_done=1",
      cancelUrl: "https://huddle.pet/member?tab=gold",
      currency: "GBP",
      country: "GB",
    })).toEqual({
      userId: "viewer-1",
      mode: "subscription",
      type: "gold_monthly",
      lookupKey: "Gold_monthly",
      successUrl: "https://huddle.pet/member?plan_done=1",
      cancelUrl: "https://huddle.pet/member?tab=gold",
      currency: "GBP",
      country: "GB",
    });
    expect(buildSubscriptionCheckoutBody({
      userId: "viewer-1",
      type: "plus_monthly",
      lookupKey: "plus_monthly",
      successUrl: "https://huddle.pet/member?plan_done=1",
      cancelUrl: "https://huddle.pet/member?tab=plus",
    })).not.toHaveProperty("priceId");
  });
});
