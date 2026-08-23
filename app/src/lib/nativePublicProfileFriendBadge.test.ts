import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const profileLib = () => readFileSync(resolve(dir, "./nativePublicProfile.ts"), "utf8");
const profileModal = () => readFileSync(resolve(dir, "../components/profile/NativePublicProfileModal.tsx"), "utf8");

describe("native public profile Friend badge", () => {
  it("uses the pairwise active-match relationship and excludes blocked users", () => {
    const s = profileLib();
    expect(s).toMatch(/get_native_public_profile_relationship/);
    expect(s).toMatch(/row\.active_match === true && row\.blocked !== true/);
  });

  it("does not infer friendship from action visibility, Care, or group context", () => {
    const s = profileModal();
    expect(s).toMatch(/\{isFriend && !isOwnProfile \? \(/);
    expect(s).toMatch(/<Text style=\{styles\.matchedChipText\}>Friend<\/Text>/);
    expect(s).not.toMatch(/\{hideMatchedActions && !isOwnProfile \? \(/);
  });

  it("replaces Star with a direct chat action for friends", () => {
    const s = profileModal();
    expect(s).toContain("const canFriendChat = canInteract && isFriend");
    expect(s).toContain("!hideMatchedActions && !isFriend");
    expect(s).toContain("name=\"message-circle\"");
    expect(s).toContain("/chat-dialogue?with=");
  });

  it("loads profile content without waiting for the relationship badge request", () => {
    const s = profileModal();
    const relationshipStart = s.indexOf("void getFreshNativeAccessToken(accessToken)");
    const profileStart = s.indexOf("const cachedProfile = await fetchNativePublicProfile", relationshipStart);
    expect(relationshipStart).toBeGreaterThan(-1);
    expect(profileStart).toBeGreaterThan(relationshipStart);
    expect(s.slice(relationshipStart, profileStart)).not.toContain("await getFreshNativeAccessToken");
    expect(s).toMatch(/const cachedProfile = await fetchNativePublicProfile/);
  });
});
