import { describe, expect, it } from "vitest";
import { buildGroupExploreViewerScope } from "./groupExploreViewerScope";

describe("group Explore viewer scope", () => {
  it("maps the owner-only RPC row into the native group payload", () => {
    expect(buildGroupExploreViewerScope({
      country: "Hong Kong",
      city: "Hong Kong",
      district: "Wan Chai",
      own_pin_point: { lat: 22.28, lng: 114.17 },
    })).toEqual({
      country: "Hong Kong",
      payload: {
        city: "Hong Kong",
        country: "Hong Kong",
        countryCode: null,
        district: "Wan Chai",
        lat: 22.28,
        lng: 114.17,
        source: "viewer_scope",
      },
    });
  });

  it("degrades without inventing a location", () => {
    expect(buildGroupExploreViewerScope(null)).toEqual({
      country: null,
      payload: { city: null, country: null, countryCode: null, district: null, lat: null, lng: null, source: "profile_text_fallback" },
    });
  });
});
