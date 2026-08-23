import { describe, expect, it } from "vitest";
import { resolveNativeBootRoute } from "./nativeAuthBoot";

const session = {
  access_token: "access-token",
  user: { id: "user-id" },
} as never;

describe("native auth boot route contract", () => {
  it("keeps signed-in users without a registered profile identity in recoverable signup", () => {
    expect(resolveNativeBootRoute(session, "/", {
      profileExists: false,
      registeredIdentity: false,
      onboardingCompleted: false,
      ownsPets: false,
      activePetCount: 0,
    })).toEqual({
      route: "/signup",
      needsOnboardingSnapshot: false,
    });
  });

  it("lets profile rows without Social ID repair onboarding without signing out", () => {
    expect(resolveNativeBootRoute(session, "/", {
      profileExists: true,
      registeredIdentity: false,
      onboardingCompleted: false,
      ownsPets: false,
      activePetCount: 0,
    })).toEqual({
      route: "/signup",
      needsOnboardingSnapshot: false,
    });
  });

  it("routes registered identities with incomplete onboarding into Step 5 signup onboarding", () => {
    expect(resolveNativeBootRoute(session, "/", {
      profileExists: true,
      registeredIdentity: true,
      onboardingCompleted: false,
      ownsPets: false,
      activePetCount: 0,
    }).route).toBe("/signup");
  });

  it("never reopens signup after Quick Profile committed, including after an interrupted Care-interest sheet", () => {
    expect(resolveNativeBootRoute(session, "/signup", {
      profileExists: true,
      registeredIdentity: true,
      onboardingCompleted: true,
      ownsPets: false,
      activePetCount: 0,
    })).toEqual({
      route: "/",
      needsOnboardingSnapshot: false,
    });
  });
});
