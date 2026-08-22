import { describe, expect, it } from "vitest";
import {
  pickStripeRuntimeSecret,
  resolveStripeRuntimeMode,
} from "../../supabase/functions/stripeModeContract";

describe("Stripe membership runtime mode", () => {
  it("uses test mode for localhost and live mode for huddle.pet", () => {
    expect(resolveStripeRuntimeMode("", "http://127.0.0.1:8083")).toBe("test");
    expect(resolveStripeRuntimeMode("", "https://huddle.pet")).toBe("live");
  });

  it("honors the existing explicit mode contract", () => {
    expect(resolveStripeRuntimeMode("test", "https://huddle.pet")).toBe("test");
    expect(resolveStripeRuntimeMode("live", "http://localhost:8083")).toBe("live");
  });

  it("uses only a secret matching the selected Stripe mode", () => {
    const secrets = {
      defaultSecret: "sk_test_default",
      testSecret: "sk_test_dedicated",
      liveSecret: "sk_live_dedicated",
    };
    expect(pickStripeRuntimeSecret("test", secrets)).toBe("sk_test_dedicated");
    expect(pickStripeRuntimeSecret("live", secrets)).toBe("sk_live_dedicated");
    expect(pickStripeRuntimeSecret("live", { defaultSecret: "sk_live_default" })).toBe("sk_live_default");
    expect(pickStripeRuntimeSecret("live", { defaultSecret: "sk_test_wrong_mode" })).toBe("");
    expect(pickStripeRuntimeSecret("test", { liveSecret: "sk_live_wrong_mode" })).toBe("");
  });
});
