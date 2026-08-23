import { describe, expect, it } from "vitest";
import { mergeNativeDiscoveryPermissionDeck } from "./nativeDiscoveryPermissionDeck";

const profile = (id: string, locationCountry: string) => ({ id, locationCountry });

describe("Discover permission deck handoff", () => {
  it("keeps the first four cards stable and starts the refreshed country at card five", () => {
    const preview = [
      profile("preview-1", "United States"),
      profile("preview-2", "United States"),
      profile("preview-3", "United States"),
      profile("preview-4", "United States"),
    ];
    const refreshed = [
      profile("hk-1", "Hong Kong"),
      profile("us-1", "United States"),
      profile("hk-2", "Hong Kong SAR"),
      profile("preview-3", "Hong Kong"),
    ];

    const result = mergeNativeDiscoveryPermissionDeck(preview, refreshed, "HK");

    expect(result.map((item) => item.id)).toEqual([
      "preview-1",
      "preview-2",
      "preview-3",
      "preview-4",
      "hk-1",
      "hk-2",
    ]);
  });

  it("retains the refreshed queue when profile country is unavailable", () => {
    expect(mergeNativeDiscoveryPermissionDeck([], [profile("first", "Canada")], null)).toEqual([
      profile("first", "Canada"),
    ]);
  });
});
