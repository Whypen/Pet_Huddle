import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  parseNativeOnboardingSnapshot,
  resolveNativeBootRoute,
} from "../src/lib/nativeAuthBoot.ts";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");

const mockSession = {
  access_token: "access",
  user: { id: "user-1" },
};

assert.equal(parseNativeOnboardingSnapshot(null), null);
assert.equal(parseNativeOnboardingSnapshot({}), null);
assert.equal(parseNativeOnboardingSnapshot({ profile_exists: "false" }), null);
assert.deepEqual(parseNativeOnboardingSnapshot({
  profile_exists: true,
  onboarding_completed: true,
  owns_pets: false,
  active_pet_count: 0,
}), {
  profileExists: true,
  onboardingCompleted: true,
  ownsPets: false,
  activePetCount: 0,
});

assert.deepEqual(resolveNativeBootRoute(null, "/", null), {
  route: "auth",
  needsOnboardingSnapshot: false,
});
assert.deepEqual(resolveNativeBootRoute(mockSession, "/map", null), {
  route: "/map",
  needsOnboardingSnapshot: true,
});
assert.deepEqual(resolveNativeBootRoute(mockSession, "/map", {
  profileExists: false,
  onboardingCompleted: false,
  ownsPets: false,
  activePetCount: 0,
}), {
  route: "/verify-identity",
  needsOnboardingSnapshot: false,
});
assert.deepEqual(resolveNativeBootRoute(mockSession, "/set-profile", {
  profileExists: false,
  onboardingCompleted: false,
  ownsPets: false,
  activePetCount: 0,
}), {
  route: "/set-profile",
  needsOnboardingSnapshot: false,
});
assert.deepEqual(resolveNativeBootRoute(mockSession, "/map", {
  profileExists: true,
  onboardingCompleted: true,
  ownsPets: true,
  activePetCount: 0,
}), {
  route: "/set-pet",
  needsOnboardingSnapshot: false,
});

const profileSummarySource = readFileSync(resolve(appRoot, "src/lib/nativeProfileSummary.ts"), "utf8");
assert.match(profileSummarySource, /memory && isFresh\(memory\.cachedAt\) && memory\.profile/);
assert.match(profileSummarySource, /!payload\.profile/);

const rootNavigatorSource = readFileSync(resolve(appRoot, "src/navigation/RootNavigator.tsx"), "utf8");
assert.match(rootNavigatorSource, /parseNativeOnboardingSnapshot\(row\)/);
assert.doesNotMatch(rootNavigatorSource, /profile_exists === true/);

console.log("nativeAuthIdleHarness: PASS");
