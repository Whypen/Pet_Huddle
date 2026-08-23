import { describe, expect, it } from "vitest";
import { parseNativeMapAnonymousAreas, parseNativeMapAreaCell } from "./nativeMapPeopleV2";

describe("native Map anonymous-area response parser", () => {
  it("accepts only a complete server area cell", () => {
    expect(parseNativeMapAreaCell({ areaKey: "cell-a", lat: 22.30225, lng: 114.16975 })).toEqual({
      areaKey: "cell-a",
      lat: 22.30225,
      lng: 114.16975,
    });
    expect(parseNativeMapAreaCell({ areaKey: "", lat: 22.30225, lng: 114.16975 })).toBeNull();
    expect(parseNativeMapAreaCell({ areaKey: "cell-a", lat: "bad", lng: 114.16975 })).toBeNull();
  });

  it("suppresses singleton cells before rendering and strips unrecognised identity fields", () => {
    expect(parseNativeMapAnonymousAreas([{
      clusterKey: "cell-a",
      lat: 22.30225,
      lng: 114.16975,
      count: 1,
      id: "must-not-survive",
      avatarUrl: "must-not-survive",
    }])).toEqual([]);
  });

  it("rejects malformed, singleton, zero, and negative anonymous areas", () => {
    expect(parseNativeMapAnonymousAreas([
      { clusterKey: "", lat: 22.3, lng: 114.17, count: 2 },
      { clusterKey: "zero", lat: 22.3, lng: 114.17, count: 0 },
      { clusterKey: "negative", lat: 22.3, lng: 114.17, count: -1 },
      { clusterKey: "bad-lat", lat: "not-a-number", lng: 114.17, count: 2 },
    ])).toEqual([]);
  });

  it("preserves the agreed two-person floor", () => {
    expect(parseNativeMapAnonymousAreas([{
      clusterKey: "cell-two",
      lat: 22.30225,
      lng: 114.16975,
      count: 2,
    }])).toEqual([{
      clusterKey: "cell-two",
      lat: 22.30225,
      lng: 114.16975,
      count: 2,
    }]);
  });
});
