import { describe, expect, it } from "vitest";
import { buildNativeProfileAreaCity, canonicalNativeProfileCity, canonicalNativeProfileDistrict, formatNativeProfileAreaCity, resolveNativeProfileMarketCity } from "./nativeProfileLocation";

describe("native public profile area and city labels", () => {
  it("shows district or area followed by city", () => {
    expect(formatNativeProfileAreaCity("Downtown, San Francisco", "United States")).toBe("Downtown, San Francisco");
  });

  it("does not mistake the legacy country suffix for a city", () => {
    expect(formatNativeProfileAreaCity("Downtown, United States", "United States")).toBe("Downtown, United States");
  });

  it("drops country when a city is available", () => {
    expect(formatNativeProfileAreaCity("Downtown, San Francisco, United States", "United States")).toBe("Downtown, San Francisco");
    expect(formatNativeProfileAreaCity("Canary Wharf, London, United Kingdom", "United Kingdom")).toBe("Canary Wharf, London");
  });

  it("does not repeat city-level districts", () => {
    expect(buildNativeProfileAreaCity("Hong Kong", "Hong Kong")).toBe("Hong Kong");
  });

  it("keeps safe fallbacks when city is unavailable", () => {
    expect(buildNativeProfileAreaCity("Central", null)).toBe("Central");
    expect(formatNativeProfileAreaCity("", "United States")).toBe("");
  });

  it("always resolves a market city from confirmed profile location data", () => {
    expect(resolveNativeProfileMarketCity({ city: "London", country: "United Kingdom", district: "Canary Wharf" })).toBe("London");
    expect(resolveNativeProfileMarketCity({ country: "United Kingdom", district: "Canary Wharf", locationName: "Canary Wharf, London, United Kingdom" })).toBe("London");
    expect(resolveNativeProfileMarketCity({ adminArea: "Cumbria", country: "United Kingdom", district: "Keswick" })).toBe("Cumbria");
    expect(resolveNativeProfileMarketCity({ country: "United Kingdom", district: "Keswick" })).toBe("Keswick");
    expect(resolveNativeProfileMarketCity({ city: "Central", country: "Hong Kong", district: "Central and Western District" })).toBe("Hong Kong");
    // Rural/ambiguous geocodes are still valid: the confirmed area becomes the
    // stable market key rather than preventing a profile or interest save.
    expect(resolveNativeProfileMarketCity({ country: "United Kingdom", district: "Isle of Skye" })).toBe("Isle of Skye");
    expect(resolveNativeProfileMarketCity({ country: "Australia", district: "Katoomba", locationName: "Katoomba, Blue Mountains, Australia" })).toBe("Blue Mountains");
  });

  it("never presents an Apple Hong Kong locality as a city", () => {
    expect(canonicalNativeProfileCity("Central", "Hong Kong")).toBe("Hong Kong");
    expect(buildNativeProfileAreaCity("Central and Western District", "Central", "HK"))
      .toBe("Central and Western District, Hong Kong");
    expect(formatNativeProfileAreaCity("Central and Western District, Central", "Hong Kong SAR, China"))
      .toBe("Central and Western District, Hong Kong");
  });

  it("normalizes Apple's HK district capitalization", () => {
    expect(canonicalNativeProfileDistrict("Central And Western District", "Hong Kong"))
      .toBe("Central and Western District");
    expect(buildNativeProfileAreaCity("Central And Western District", "Central", "HK"))
      .toBe("Central and Western District, Hong Kong");
  });

  it.each([
    ["SoHo", "New York", "United States", "SoHo, New York"],
    ["Hayes Valley", "San Francisco", "United States", "Hayes Valley, San Francisco"],
    ["Canary Wharf", "London", "United Kingdom", "Canary Wharf, London"],
    ["Le Marais", "Paris", "France", "Le Marais, Paris"],
    ["Shibuya", "Tokyo", "Japan", "Shibuya, Tokyo"],
    ["Orchard", "Singapore", "Singapore", "Orchard, Singapore"],
    ["Surry Hills", "Sydney", "Australia", "Surry Hills, Sydney"],
    ["Yorkville", "Toronto", "Canada", "Yorkville, Toronto"],
    ["Da’an", "Taipei", "Taiwan", "Da’an, Taipei"],
    ["Central and Western District", "Central", "Hong Kong", "Central and Western District, Hong Kong"],
  ])("formats %s with its canonical city", (district, city, country, expected) => {
    expect(buildNativeProfileAreaCity(district, city, country)).toBe(expected);
  });
});
