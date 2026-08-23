import { describe, expect, it } from "vitest";
import { mergeNativeMapAnonymousAreas } from "./nativeMapAnonymousAreaMerge";

describe("mergeNativeMapAnonymousAreas", () => {
  it("deduplicates the same server cluster returned by overlapping map anchors", () => {
    expect(mergeNativeMapAnonymousAreas([
      { clusterKey: "a", lat: 22.3000, lng: 114.1700, count: 3 },
      { clusterKey: "a", lat: 22.3000, lng: 114.1700, count: 3 },
    ])).toEqual([{ clusterKey: "a", lat: 22.3000, lng: 114.1700, count: 3 }]);
  });

  it("does not invent a client-side geographic merge for neighbouring server cells", () => {
    const merged = mergeNativeMapAnonymousAreas([
      { clusterKey: "anchor-a", lat: 22.3000, lng: 114.1700, count: 4 },
      { clusterKey: "anchor-b", lat: 22.3005, lng: 114.1705, count: 3 },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.map((area) => area.count)).toEqual([4, 3]);
  });

  it("keeps genuinely separate popularity areas separate", () => {
    const merged = mergeNativeMapAnonymousAreas([
      { clusterKey: "a", lat: 22.3000, lng: 114.1700, count: 2 },
      { clusterKey: "b", lat: 22.3200, lng: 114.1700, count: 5 },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.map((area) => area.count)).toEqual([2, 5]);
  });

  it("rejects malformed data and singleton area counts", () => {
    expect(mergeNativeMapAnonymousAreas([
      { clusterKey: "", lat: 22.3, lng: 114.17, count: 4 },
      { clusterKey: "singleton", lat: 22.3, lng: 114.17, count: 1 },
      { clusterKey: "valid", lat: 22.3, lng: 114.17, count: 2 },
    ])).toEqual([{ clusterKey: "valid", lat: 22.3, lng: 114.17, count: 2 }]);
  });
});
