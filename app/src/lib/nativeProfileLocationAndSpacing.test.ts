import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("expo-location", () => ({
  Accuracy: { Balanced: 3, High: 4 },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), removeItem: vi.fn(), setItem: vi.fn() },
}));
vi.mock("react-native", () => ({
  Linking: { openSettings: vi.fn(), sendIntent: vi.fn() },
  Platform: { OS: "ios" },
}));
vi.mock("./nativeMapConfig", () => ({
  readNativeMapTokenConfig: () => ({ ok: false }),
}));
import { normalizeNativeLocationTextFields } from "./nativeLocation";

const dir = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFileSync(resolve(dir, path), "utf8");

describe("native profile location", () => {
  it("uses the device ISO code for Hong Kong when the geocoder labels its country China", () => {
    expect(normalizeNativeLocationTextFields({
      country: "China",
      countryCode: "HK",
      city: "Hong Kong",
      district: "Central and Western",
    })).toMatchObject({
      countryCode: "HK",
      countryName: "Hong Kong",
      city: "Hong Kong",
      district: "Central and Western",
    });
  });

  it("does not reject an atomically selected location by comparing duplicate display text", () => {
    const editProfile = source("../screens/NativeEditProfileScreen.tsx");
    const profileForm = source("../components/profile/NativeProfileForm.tsx");

    expect(editProfile).not.toContain("Country must match your location");
    expect(profileForm).not.toMatch(/<SelectField\s+compact\s+error=\{errors\.location\}/);
    expect(profileForm).toMatch(/<NativeFormTextField\s+compact\s+error=\{errors\.location\}/);
  });

  it("lets an area selection replace a previously selected country", () => {
    const editProfile = source("../screens/NativeEditProfileScreen.tsx");
    const profileForm = source("../components/profile/NativeProfileForm.tsx");
    const location = source("./nativeLocation.ts");

    expect(editProfile).toContain("fetchNativePrioritizedLocationSuggestions(query, {");
    expect(editProfile).toContain("selectedCountry: form.location_country");
    expect(editProfile).toContain("location_country: item.country || previous.location_country");
    expect(profileForm).toContain('code === "HK" ? "Hong Kong"');
    expect(location).toContain('label.toLowerCase().includes("hong kong") ? "Hong Kong" : rawCountry');
  });
});

describe("native public profile spacing", () => {
  it("keeps balanced stats spacing and a tighter optional bio entrance", () => {
    const stats = source("../components/profile/NativeProfileEngagementStats.tsx");
    const bio = source("../components/profile/NativeProfilePullQuote.tsx");

    expect(stats).toMatch(/paddingTop: huddleSpacing\.x6,[\s\S]*paddingBottom: huddleSpacing\.x6/);
    expect(bio).toMatch(/paddingTop: huddleSpacing\.x2,[\s\S]*paddingBottom: huddleSpacing\.x7/);
  });
});
