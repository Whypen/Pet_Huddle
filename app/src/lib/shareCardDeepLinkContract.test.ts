import { describe, expect, it } from "vitest";
import { buildCareShareCard, buildProfileShareCard } from "./shareCardData";

describe("share card deep links", () => {
  it("gives profile cards an installed-app destination", () => {
    const card = buildProfileShareCard({
      id: "profile-1",
      displayName: "Huddle Member",
      roleLabels: [],
      pets: [],
    });
    expect(card.deepLink).toBe("https://huddle.pet/share/profile_profile-1");
  });

  it("gives care cards an installed-app destination", () => {
    const card = buildCareShareCard({
      id: "carer-1",
      displayName: "Pet Carer",
      availableNow: false,
      emergencyReady: false,
      voluntaryRate: false,
      petTypes: [],
      allPets: false,
      services: [],
      skills: [],
      credentials: [],
    });
    expect(card.deepLink).toBe("https://huddle.pet/share/carer_carer-1");
  });

  it("never presents a self-declared care credential as verified", () => {
    const card = buildCareShareCard({
      id: "carer-1",
      displayName: "Pet Carer",
      availableNow: false,
      emergencyReady: false,
      voluntaryRate: false,
      petTypes: ["Dogs"],
      allPets: false,
      services: ["Sitting & Visit"],
      skills: [],
      credentials: [{ type: "Dog Trainer", verified: false }],
    });

    expect(card.verified).toBe(false);
    // Eyebrow now carries the services list (not a generic carer label).
    expect(card.eyebrowItems).toEqual(["Sitting & Visit"]);
    expect(card.careStats).not.toContainEqual(["✓", "Verified"]);
    // One combined credentials row; a self-declared credential carries NO "✓".
    expect(card.careRows).toContainEqual(["Credentials", "Dog Trainer"]);
    expect(card.careRows?.some(([, v]) => v.includes("✓"))).toBe(false);
  });
});
