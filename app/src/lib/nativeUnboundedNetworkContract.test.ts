import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(resolve(src, path), "utf8");

const walk = (dir: string): string[] => {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
      continue;
    }
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) files.push(full);
  }
  return files;
};

// Files allowed to call the raw primitives, because they ARE the bounded
// transport layer (or bound the call inline with their own AbortController).
const TRANSPORT_OWNERS = new Set([
  "lib/nativeTimeout.ts",
  "lib/nativeExactTokenRequest.ts",
]);

describe("unbounded network contract", () => {
  it("gives every non-RPC network primitive a hard deadline", () => {
    const timeout = read("lib/nativeTimeout.ts");
    // AbortController for anything cancellable, plain race for what is not.
    expect(timeout).toMatch(/export const fetchWithNativeTimeout/);
    expect(timeout).toMatch(/new AbortController\(\)/);
    expect(timeout).toMatch(/pendingBodyRejectors/);
    expect(timeout).toMatch(/export const fetchNativeResponseWithTimeout/);
    expect(timeout).toMatch(/export const withNativeTimeout/);
  });

  it("never adds a bare fetch() outside the bounded transport layer", () => {
    const offenders: string[] = [];
    for (const file of walk(src)) {
      const rel = relative(src, file);
      if (TRANSPORT_OWNERS.has(rel)) continue;
      const contents = readFileSync(file, "utf8");
      // A bare `fetch(` is only safe when the module-scope `fetch` binding IS the
      // bounded transport, i.e. the file aliases it on import. That shadowing is
      // what makes this check correct-by-construction: once the alias is present,
      // a `fetch(` added later is automatically bounded too.
      //
      // Merely importing the un-aliased helper does NOT count — the file could
      // call the helper in one place and the global fetch in another. An inline
      // AbortController does not count either: it bounds headers, not a stalled
      // response.text()/json() body, which is the actual iOS hang.
      const hasBareFetch = /(?:await |= )fetch\(/.test(contents);
      const aliasesFetch = /import \{[^}]*fetchNativeResponseWithTimeout as fetch[^}]*\} from/.test(contents);
      if (hasBareFetch && !aliasesFetch) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("bounds the storage and geocoder calls that hung the chats screen", () => {
    const storage = read("lib/nativeStorageUrlCache.ts");
    const location = read("lib/nativeLocation.ts");

    // createSignedUrl and the public-URL HEAD probe both sit on the profile
    // summary path that Chats awaits before it will clear its spinner.
    expect(storage).toMatch(/withNativeTimeout\(\s*createSignedUrlPromise/);
    expect(storage).toMatch(/fetchWithNativeTimeout\(url, \{ method: "HEAD" \}/);

    // Apple/Android geocoders have no timeout of their own.
    expect(location).toMatch(/withNativeTimeout\(\s*Location\.reverseGeocodeAsync/);
  });

  it("bounds notification ownership before a push tap can enter navigation", () => {
    const notifications = read("lib/nativeNotifications.ts");
    const root = read("navigation/RootNavigator.tsx");
    expect(notifications).toMatch(/verifyNativeNotificationOwnershipWithToken[\s\S]*?fetch\([^;]+NOTIFICATION_OWNERSHIP_TIMEOUT_MS\)/);
    expect(root).toContain("verifyNativeNotificationOwnershipWithToken(");
    expect(root).not.toMatch(/from\("notifications"\)[\s\S]{0,180}maybeSingle\(\)/);
  });

  it("caches settled photo urls, never the in-flight promise", () => {
    const storage = read("lib/nativeStorageUrlCache.ts");
    // Caching the promise meant one stalled request poisoned the key for the
    // whole process — every later caller joined the dead promise and hung.
    expect(storage).toMatch(/const publicProfilePhotoUrlCache = new Map<string, string \| null>\(\)/);
    expect(storage).toMatch(/publicProfilePhotoUrlCache\.set\(cacheKey, value\)/);
    expect(storage).not.toMatch(/publicProfilePhotoUrlCache\.set\(cacheKey, promise\)/);
  });

  it("keeps a UI deadline so no screen can spin forever", () => {
    const hook = read("lib/useNativeLoadingDeadline.ts");
    expect(hook).toMatch(/export const useNativeLoadingDeadline/);
    expect(hook).toMatch(/setTripped\(true\)/);

    const chats = read("screens/NativeChatsScreen.tsx");
    expect(chats).toMatch(/useNativeLoadingDeadline\(loading, \{/);
    // The trip must both clear the spinner and release the in-flight gate, or
    // the retry the user is now being offered would be swallowed.
    expect(chats).toMatch(/loadRowsGateRef\.current\.inFlight = false/);
    expect(chats).toMatch(/loadingDeadlineTripped/);
    expect(chats).toMatch(/hasLoadError = [^;]*loadingDeadlineTripped/);
  });

  it("puts the same deadline on every screen that mounts already loading", () => {
    // These screens initialise loading=true, so they render a spinner from mount
    // and depend entirely on a load settling. Each must fall into its own
    // existing retryable error state instead of spinning forever.
    for (const screen of [
      "screens/NativeSocialScreen.tsx",
      "screens/NativeServiceScreen.tsx",
      "screens/NativeProfileSummaryScreen.tsx",
      "screens/NativePetDetailsScreen.tsx",
      "screens/NativeCarerProfileScreen.tsx",
      "screens/NativeEditProfileScreen.tsx",
      "screens/NativeServiceChatScreen.tsx",
      "screens/NativeSetPetScreen.tsx",
    ]) {
      const contents = read(screen);
      expect(contents, screen).toMatch(/useNativeLoadingDeadline\(loading, \{/);
      expect(contents, screen).toMatch(/onTrip: \(\) => \{[\s\S]{0,700}?setLoading\(false\)/);
    }
    expect(read("screens/NativeSocialScreen.tsx")).toMatch(/onTrip: \(\) => \{[\s\S]{0,500}?requestIdRef\.current \+= 1;[\s\S]{0,300}?feedLoadGateRef\.current\.inFlight = false/);
    expect(read("screens/NativeServiceScreen.tsx")).toMatch(/onTrip: \(\) => \{[\s\S]{0,500}?loadAttemptRef\.current \+= 1;[\s\S]{0,300}?loadInFlightRef\.current = null/);
    expect(read("screens/NativePetDetailsScreen.tsx")).toContain("setLoadError(\"Pet details are taking too long to load. Please try again.\")");
    expect(read("screens/NativeCarerProfileScreen.tsx")).toContain("setLoadError(\"Care profile is taking too long to load. Please try again.\")");
    expect(read("screens/NativeEditProfileScreen.tsx")).toContain("setLoadFailed(true)");
    expect(read("screens/NativeServiceChatScreen.tsx")).toContain("setRouteUnavailable(true)");
    expect(read("screens/NativeSetPetScreen.tsx")).toContain("setMessage(\"Pet details are taking too long to load. Please try again.\")");

    const home = read("screens/NativeHomeScreen.tsx");
    expect(home).toMatch(/useNativeLoadingDeadline\(state === "loading", \{/);
    expect(home).toMatch(/onTrip: \(\) => \{\s*setState\("error"\)/);
  });

  it("makes membership loading finite and leaves a real retry action", () => {
    const membership = read("screens/NativeManageSubscriptionScreen.tsx");
    expect(membership).toMatch(/useNativeLoadingDeadline\(profileLoading, \{/);
    expect(membership).toMatch(/setProfileLoading\(false\);\s*setProfileLoadFailed\(true\)/);
    expect(membership).toContain("profileLoadFailed ? void retryMembershipProfile() : void requestPurchaseForProduct(planProductId)");
    expect(membership).not.toContain("disabled={isBlockedByTier || profileLoading || profileLoadFailed");
  });

  it("never retries a Care network action forever", () => {
    const care = read("screens/NativeServiceChatScreen.tsx");
    expect(care).toContain("let prepareAttempts = 0");
    expect(care).toContain("if (prepareAttempts < 2)");
    expect(care).toContain("Pull to refresh and try again.");
    expect(care).not.toContain("Retrying automatically.");
  });
});
