import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFileSync(resolve(dir, path), "utf8");

describe("native location search priority", () => {
  it("merges selected-country results before GPS-biased global results", () => {
    const location = source("./nativeLocation.ts");
    expect(location).toContain("const [selectedResults, gpsResults, globallyRelevantResults] = await Promise.all");
    expect(location).toContain("return [...selectedResults, ...gpsResults, ...globallyRelevantResults]");
    expect(location).toContain("locationCountryByPointCache");
    expect(location).toContain("const seen = new Set<string>()");
  });

  it("uses the same priority contract for profile, group, carer, and service locations", () => {
    const editProfile = source("../screens/NativeEditProfileScreen.tsx");
    const chats = source("../screens/NativeChatsScreen.tsx");
    const carer = source("../screens/NativeCarerProfileScreen.tsx");
    const serviceChat = source("../screens/NativeServiceChatScreen.tsx");

    expect(editProfile).toContain("fetchNativePrioritizedLocationSuggestions(query");
    expect(chats.match(/fetchNativePrioritizedLocationSuggestions\(trimmed/g)).toHaveLength(2);
    expect(chats).toContain("onChangeCountryEdit?.(suggestion.country || extractNativeCountryFromPlaceLabel(suggestion.label) || null)");
    expect(carer).toContain("return fetchNativePrioritizedLocationSuggestions(query");
    expect(serviceChat.match(/fetchNativePrioritizedLocationSuggestions\(trimmed/g)).toHaveLength(2);
  });
});
