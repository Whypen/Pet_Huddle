import { describe, expect, it } from "vitest";
import { extractNativeCityFromMapboxContext } from "./nativeLocationCityParsing";

describe("native location city parsing", () => {
  it("prefers the actual city over a smaller locality", () => {
    expect(extractNativeCityFromMapboxContext([
      { id: "locality.central", text: "Central" },
      { id: "place.san-francisco", text: "San Francisco" },
    ])).toBe("San Francisco");
  });

  it("does not mislabel a smaller locality as the city", () => {
    expect(extractNativeCityFromMapboxContext([
      { id: "locality.central", text: "Central" },
    ])).toBeNull();
  });
});
