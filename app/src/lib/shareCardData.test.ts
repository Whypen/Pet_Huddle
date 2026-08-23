import { describe, expect, it } from "vitest";
import { buildProfileShareCard } from "./shareCardData";

describe("profile share-card pet ticker", () => {
  it("keeps every public pet supplied by the profile resolver", () => {
    const card = buildProfileShareCard({
      id: "member-1",
      displayName: "Huddle",
      roleLabels: [],
      pets: [
        { name: "Miso", species: "cat" },
        { name: "Miles", species: "dog" },
        { name: "Mochi", species: "rabbit" },
      ],
    });

    expect(card.ticker).toEqual(expect.arrayContaining([
      expect.stringContaining("Miso"),
      expect.stringContaining("Miles"),
      expect.stringContaining("Mochi"),
    ]));
  });

  it("keeps membership branding in the ticker and promotes groups when there is no engagement sticker", () => {
    const card = buildProfileShareCard({
      id: "member-2",
      displayName: "Huddle",
      tier: "huddle＊",
      groupCount: 22,
      roleLabels: ["Pet Parent"],
      pets: [],
    });

    expect(card.tier).toBe("gold");
    expect(card.ticker).toContain("huddle＊");
    expect(card.stickers).toEqual([{ label: "22 groups" }]);
    expect(card.verified).toBe(false);
  });

  it("keeps the engagement sticker first when the profile has a qualifying sparkle", () => {
    const card = buildProfileShareCard({
      id: "member-3",
      displayName: "Huddle",
      engagementTier: "trusted",
      groupCount: 22,
      roleLabels: ["Pet Parent"],
      pets: [],
    });

    expect(card.stickers).toEqual([
      { label: "Top Member", sparkle: "half" },
      { label: "22 groups" },
    ]);
  });

  it("always supplies a role label when profile roles are empty", () => {
    const card = buildProfileShareCard({
      id: "member-4",
      displayName: "Huddle",
      roleLabels: [],
      pets: [],
    });

    expect(card.eyebrowItems).toEqual(["Animal Friend"]);
  });
});
