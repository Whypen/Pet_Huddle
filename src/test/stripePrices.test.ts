import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "stripe_prices:last_snapshot:v1";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null })),
              })),
            })),
          })),
        })),
      })),
    })),
    functions: {
      invoke: vi.fn(),
    },
    auth: {
      getUser: vi.fn(),
    },
  },
}));

describe("stripePrices snapshot bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  it("rejects legacy snapshots that do not contain Share Perks pricing", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        cacheKey: "USD|-",
        prices: {
          plus_monthly: 5.99,
          plus_annual: 59.99,
          gold_monthly: 11.99,
          gold_annual: 109.99,
          superBroadcast: 4.99,
          topProfileBooster: 2.99,
          currencyCode: "USD",
        },
      }),
    );

    const { getLastLivePricesSnapshot } = await import("@/lib/stripePrices");

    expect(getLastLivePricesSnapshot({ currency: "USD" })).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("ignores snapshots from a different currency when bootstrapping membership UI", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        cacheKey: "USD|-",
        prices: {
          plus_monthly: 5.99,
          plus_annual: 59.99,
          gold_monthly: 11.99,
          gold_annual: 109.99,
          superBroadcast: 4.99,
          topProfileBooster: 2.99,
          sharePerks: 4.99,
          sharePerksInterval: "month",
          currencyCode: "USD",
        },
      }),
    );

    const { getLastLivePricesSnapshot } = await import("@/lib/stripePrices");

    expect(getLastLivePricesSnapshot({ country: "HK" })).toBeNull();
    expect(getLastLivePricesSnapshot({ currency: "USD" })?.currencyCode).toBe("USD");
  });
});
