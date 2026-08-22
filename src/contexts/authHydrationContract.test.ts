import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const authContext = readFileSync(join(process.cwd(), "src/contexts/AuthContext.tsx"), "utf8");

const between = (start: string, end: string) => {
  const startIndex = authContext.indexOf(start);
  const endIndex = authContext.indexOf(end, startIndex + start.length);
  expect(startIndex, `missing start marker: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `missing end marker: ${end}`).toBeGreaterThan(startIndex);
  return authContext.slice(startIndex, endIndex);
};

describe("auth hydration release contract", () => {
  it("deduplicates the initial getSession and auth-state event for one token", () => {
    expect(authContext).toContain("lastHydrationTokenRef");
    expect(authContext).toContain("lastHydrationTokenRef.current === candidateToken");
    expect(authContext).toContain("lastHydrationTokenRef.current = candidateToken");
  });

  it("does not let profile realtime refresh cancel auth bootstrap", () => {
    const realtimeSync = between(
      "const channel = supabase",
      "const onVerificationUpdated = () =>",
    );
    expect(realtimeSync).toContain("fetchProfile(user.id, hydrationRunRef.current)");
    expect(realtimeSync).not.toContain("beginHydrationRun()");
  });

  it("does not let a verification refresh cancel auth bootstrap", () => {
    const verificationSync = between(
      "const onVerificationUpdated = () =>",
      "window.addEventListener(\"huddle:verification-updated\"",
    );
    expect(verificationSync).toContain("fetchProfile(user.id, hydrationRunRef.current)");
    expect(verificationSync).not.toContain("beginHydrationRun()");
  });

  it("repairs email from the fetched profile instead of a stale render closure", () => {
    const hydration = between(
      "const hydrateValidatedSession = useCallback",
      "useEffect(() => {\n    if (!user) return;",
    );
    expect(hydration).toContain("const hydratedProfile = await profilePromise");
    expect(hydration).toContain("String(hydratedProfile?.email || \"\")");
    expect(hydration).not.toContain("String((profile as");
  });

  it("validates the session and reads its RLS-scoped profile in parallel", () => {
    const hydration = between(
      "const hydrateValidatedSession = useCallback",
      "useEffect(() => {\n    if (!user) return;",
    );
    expect(hydration).toContain("const profilePromise = fetchProfile(candidateUserId, runId");
    expect(hydration).toContain("const [{ data, error }, aal] = await Promise.all([");
    expect(hydration).toContain("data.user.id !== candidateUserId");
    expect(hydration).toContain("const hydratedProfile = await profilePromise");
  });

  it("publishes the core profile before resolving quota-only family ownership", () => {
    const fetchProfile = between(
      "const fetchProfile = useCallback",
      "const touchProfileActivity = useCallback",
    );
    const profilePublish = fetchProfile.indexOf("const nextProfile = {");
    const familyLookup = fetchProfile.indexOf("void resolveFamilyOwnerId(userId)");
    expect(profilePublish).toBeGreaterThanOrEqual(0);
    expect(familyLookup).toBeGreaterThan(profilePublish);
    expect(fetchProfile).toContain("if (!isHydrationRunCurrent(runId)) return;");
  });
});
