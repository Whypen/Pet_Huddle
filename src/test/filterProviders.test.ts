import { describe, it, expect } from "vitest";
import { filterAndSortProviders } from "@/components/service/filterProviders";
import type { ProviderSummary } from "@/components/service/types";

const BASE: Omit<ProviderSummary, "userId" | "displayName" | "serviceRankWeight"> = {
  avatarUrl: null, socialAlbumUrls: [], servicesOffered: [], servicesOther: "",
  currency: "USD", startingPrice: null, startingPriceRateUnit: null, rateRows: [],
  minNoticeValue: "", minNoticeUnit: "hours", skills: [], proofMetadata: {},
  hasCar: false, days: [], timeBlocks: [], otherTimeFrom: "", otherTimeTo: "",
  locationStyles: [], areaName: "", petTypes: [], petTypesOther: "",
  dogSizes: [], emergencyReadiness: null, verificationStatus: null,
  viewCount: 0, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  isBookmarked: false, agreementAccepted: true, stripePayoutStatus: null,
  story: "", distanceKm: null,
};

const defaultFilters = {
  search: "", serviceTypes: [], selectedWeekdays: [], bookmarkedOnly: false,
  verifiedLicensedOnly: false, emergencyReadyOnly: false, petTypes: [], dogSizes: [],
  locationStyles: [],
};

function makeProvider(userId: string, overrides: Partial<ProviderSummary>): ProviderSummary {
  return { ...BASE, userId, displayName: userId, serviceRankWeight: 0, ...overrides };
}

describe("filterAndSortProviders — tier tiebreaker", () => {
  it("latest: equal updatedAt → gold beats free", () => {
    const ts = "2026-01-01T00:00:00Z";
    const gold = makeProvider("gold", { serviceRankWeight: 20, updatedAt: ts });
    const free = makeProvider("free", { serviceRankWeight: 0,  updatedAt: ts });
    const result = filterAndSortProviders([free, gold], { ...defaultFilters, sort: "latest" });
    expect(result[0].userId).toBe("gold");
  });

  it("latest: more recent updatedAt overrides tier", () => {
    const gold = makeProvider("gold", { serviceRankWeight: 20, updatedAt: "2026-01-01T00:00:00Z" });
    const free = makeProvider("free", { serviceRankWeight: 0,  updatedAt: "2026-06-01T00:00:00Z" });
    const result = filterAndSortProviders([gold, free], { ...defaultFilters, sort: "latest" });
    expect(result[0].userId).toBe("free");
  });

  it("proximity: equal distance → gold beats free", () => {
    const gold = makeProvider("gold", { serviceRankWeight: 20, distanceKm: 1 });
    const free = makeProvider("free", { serviceRankWeight: 0,  distanceKm: 1 });
    const result = filterAndSortProviders([free, gold], { ...defaultFilters, sort: "proximity" });
    expect(result[0].userId).toBe("gold");
  });

  it("price_low_to_high: equal price → gold beats free", () => {
    const gold = makeProvider("gold", { serviceRankWeight: 20, startingPrice: "50" });
    const free = makeProvider("free", { serviceRankWeight: 0,  startingPrice: "50" });
    const result = filterAndSortProviders([free, gold], { ...defaultFilters, sort: "price_low_to_high" });
    expect(result[0].userId).toBe("gold");
  });

  it("price_high_to_low: equal price → gold beats free", () => {
    const gold = makeProvider("gold", { serviceRankWeight: 20, startingPrice: "50" });
    const free = makeProvider("free", { serviceRankWeight: 0,  startingPrice: "50" });
    const result = filterAndSortProviders([free, gold], { ...defaultFilters, sort: "price_high_to_low" });
    expect(result[0].userId).toBe("gold");
  });

  it("popularity: equal viewCount → gold beats free", () => {
    const gold = makeProvider("gold", { serviceRankWeight: 20, viewCount: 10 });
    const free = makeProvider("free", { serviceRankWeight: 0,  viewCount: 10 });
    const result = filterAndSortProviders([free, gold], { ...defaultFilters, sort: "popularity" });
    expect(result[0].userId).toBe("gold");
  });

  it("tier order: gold > plus > free at equal rank signal", () => {
    const ts = "2026-01-01T00:00:00Z";
    const gold = makeProvider("gold", { serviceRankWeight: 20, updatedAt: ts });
    const plus = makeProvider("plus", { serviceRankWeight: 10, updatedAt: ts });
    const free = makeProvider("free", { serviceRankWeight: 0,  updatedAt: ts });
    const result = filterAndSortProviders([free, gold, plus], { ...defaultFilters, sort: "latest" });
    expect(result.map((p) => p.userId)).toEqual(["gold", "plus", "free"]);
  });
});
