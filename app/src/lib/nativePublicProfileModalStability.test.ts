import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(dir, "../components/profile/NativePublicProfileModal.tsx"), "utf8");

describe("native public profile modal stability", () => {
  it("does not restart an open profile load when fallback or callback identities change", () => {
    const modal = source();

    expect(modal).toContain("const fallbackDataRef = useRef(fallbackData)");
    expect(modal).toContain("fallbackData: fallbackDataRef.current");
    expect(modal).toContain("onProfileResolvedRef.current?.(cachedProfile)");
    expect(modal).toContain("[accessToken, viewerUserId, memberNumber, open, profileLoadVersion, sessionKey, profileUserId]");
    expect(modal).not.toContain("[accessToken, viewerUserId, fallbackData, memberNumber, onProfileResolved, open, sessionKey, profileUserId]");
  });

  it("preserves rendered images on reopen without navigation-triggered canonical refresh", () => {
    const modal = source();

    expect(modal).toContain("const targetChanged = resolvedProfileUserIdRef.current !== profileUserId");
    expect(modal).toContain("if (targetChanged) {");
    expect(modal).not.toContain("PUBLIC_PROFILE_REVALIDATE_MS");
    expect(modal).not.toContain("requireCanonical: true");
    expect(modal).toContain("Profile paint is cache/fallback-first and must not wait for auth");
    expect(modal).toContain("profileLoadAttemptRef.current += 1");
    expect(modal).toContain("setProfileLoadVersion((current) => current + 1)");
  });
});
