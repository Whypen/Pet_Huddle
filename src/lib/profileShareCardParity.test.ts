import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  engagementPill,
  memberSinceLine,
  normalizeNativeAvailabilityStatus,
  profileTicker,
  tierBrandLabel,
} from "./profileShareCardData";

const repoRoot = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

describe("profile share card parity", () => {
  it("keeps the card palette and variant-derived accent tied to native", () => {
    const native = read("app/src/components/share/NativeShareCard.tsx");
    expect(native).toMatch(/const INK\s*=\s*"#0C1E5C"/);
    expect(native).toMatch(/const CREAM\s*=\s*"#FFF9F0"/);
    expect(native).toMatch(/const LIME\s*=\s*"#BFFF00"/);
    expect(native).toMatch(/const CORAL\s*=\s*"#FF751F"/);
    expect(native).toMatch(/const BLUE\s*=\s*"#2145CF"/);
    expect(native).toMatch(/colors=\{\["#1B3AA0", INK\]\}/);
    expect(native).toMatch(/const accent = data\.variant === "care" \? CORAL : LIME;/);
    expect(native).not.toMatch(/accent\s*=.*tier/);
  });

  it("keeps the native card strings and tier wordmark rules", () => {
    const native = read("app/src/lib/shareCardData.ts");
    expect(native).toMatch(/tier === "gold" \? "huddle＊" : tier === "plus" \? "huddle\+" : "huddle"/);
    expect(native).toMatch(/with huddle since \$\{when\}/);
    expect(native).toMatch(/\$\{seq\}huddle member/);
    expect(native).toMatch(/tier === "trusted"\) return "Top Member"/);
    expect(native).toMatch(/tier === "pillar"\) return "Loyal Member"/);

    expect(tierBrandLabel("free")).toBe("huddle");
    expect(tierBrandLabel("plus")).toBe("huddle+");
    expect(tierBrandLabel("gold")).toBe("huddle＊");
    expect(engagementPill("trusted")).toBe("Top Member");
    expect(engagementPill("pillar")).toBe("Loyal Member");
    expect(memberSinceLine(11, "2026-05-20T00:00:00.000Z")).toBe("#11 · with huddle since May 2026");
    expect(memberSinceLine(null, null)).toBe("huddle member");
  });

  it("keeps the web ticker facts and order identical to native", () => {
    expect(profileTicker({
      id: "member-1",
      display_name: "Alex",
      social_id: "alex",
      avatar_url: null,
      verified: false,
      tier: "huddle+",
      member_since: null,
      roles: ["Pet Parent"],
      engagement_tier: null,
      experience_years: 4,
      pet_experience: ["Dogs"],
      groups_count: 2,
      friends_count: 3,
      member_number: null,
      pets: [{ name: "Milo", species: "Dog", photo_url: null }],
    })).toEqual(["4 years with dogs 🐕", "Milo 🐕", "2 groups", "3 friends", "huddle+"]);
  });

  it("keeps the availability allow-list and fallback behavior tied to native", () => {
    const native = read("app/src/lib/nativePublicProfile.ts");
    expect(native).toMatch(/const allowed = new Set\(\["Pet Parent", "Pet Nanny", "Animal Friend", "Veterinarian", "Pet Photographer", "Pet Groomer", "Vet Nurse", "Volunteer"\]\);/);
    expect(native).toMatch(/return \["Pet Parent"\];/);
    expect(native).toMatch(/return \["Animal Friend"\];/);

    expect(normalizeNativeAvailabilityStatus({ availability_status: ["Vet"] })).toEqual(["Veterinarian"]);
    expect(normalizeNativeAvailabilityStatus({ availability_status: ["unknown"] })).toEqual(["Animal Friend"]);
    expect(normalizeNativeAvailabilityStatus({ availability_status: [], owns_pets: true })).toEqual(["Pet Parent"]);
  });
});
