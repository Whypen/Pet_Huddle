import { describe, expect, it } from "vitest";
import {
  consumeNativeInboundDestination,
  enqueueNativeInboundDestination,
  canonicalizeNativeProfilePetPath,
  canonicalizeNativeNotificationPath,
  completeNativeRecoveryDismissal,
  nativeNavigationOverlayStateFor,
  nativePreviousSignupStep,
  nativeRouteTransition,
  nativeSignupResumePath,
  nativeSignupStepForResumeState,
  nativeSignupStepFromPath,
  removeNativeInboundDestination,
  recordNativeRouteHistory,
  replaceNativeRouteHistory,
  resolveNativeEffectiveRoute,
  restoreNativeRouteHistory,
} from "./nativeNavigationState";

describe("native navigation state", () => {
  it("maps legacy profile and pet destinations onto the current edit UX", () => {
    expect(canonicalizeNativeProfilePetPath("/set-profile?focus=name")).toBe("/edit-profile?focus=name");
    expect(canonicalizeNativeProfilePetPath("/set-pet")).toBe("/edit-pet-profile");
    expect(canonicalizeNativeProfilePetPath("/profile")).toBe("/profile");
  });

  it("queues every inbound destination with deterministic cold-start priority", () => {
    let queue = enqueueNativeInboundDestination([], { path: "/social?focus=push", source: "notification" });
    queue = enqueueNativeInboundDestination(queue, { path: "/map?alert=cold", source: "initial-url" });
    queue = enqueueNativeInboundDestination(queue, { path: "/chats", source: "live-url" });

    const first = consumeNativeInboundDestination(queue);
    expect(first.destination).toEqual({ path: "/map?alert=cold", source: "initial-url" });
    expect(first.remaining.map((item) => item.path)).toEqual(["/social?focus=push", "/chats"]);
  });

  it("deduplicates identical inbound events without dropping distinct destinations", () => {
    const first = enqueueNativeInboundDestination([], { path: "/social?focus=one", source: "notification" });
    const duplicate = enqueueNativeInboundDestination(first, { path: "/social?focus=one", source: "notification" });
    const distinct = enqueueNativeInboundDestination(duplicate, { path: "/social?focus=two", source: "notification" });
    expect(distinct.map((item) => item.path)).toEqual(["/social?focus=one", "/social?focus=two"]);
    expect(removeNativeInboundDestination(distinct, distinct[0])).toEqual([distinct[1]]);
  });

  it.each([
    ["step_1_dob", "dob"],
    ["step_2_credentials", "credentials"],
    ["step_3_email_verification", "emailConfirmation"],
    ["step_4_identity", "name"],
    ["step_5_quick_profile", "quickProfile"],
    ["complete", "quickProfile"],
    ["unknown_state", "dob"],
  ])("resumes %s at the exact visible step", (state, step) => {
    expect(nativeSignupStepForResumeState(state)).toBe(step);
    expect(nativeSignupStepFromPath(nativeSignupResumePath(state))).toBe(step);
  });

  it("preserves transition screens instead of skipping them on resume", () => {
    expect(nativeSignupResumePath("location_transition")).toBe("/signup?resume=locationTransition");
    expect(nativeSignupResumePath("notification_transition")).toBe("/signup?resume=notificationTransition");
  });

  it("maps every owned navigation overlay to one visible owner", () => {
    expect(nativeNavigationOverlayStateFor("settings-drawer")).toEqual({
      settingsOpen: true,
      settingsOverlay: null,
      notificationsOpen: false,
      supportOpen: false,
    });
    expect(nativeNavigationOverlayStateFor("account")).toEqual({
      settingsOpen: false,
      settingsOverlay: "account",
      notificationsOpen: false,
      supportOpen: false,
    });
    expect(nativeNavigationOverlayStateFor("account-with-settings-drawer")).toEqual({
      settingsOpen: true,
      settingsOverlay: "account",
      notificationsOpen: false,
      supportOpen: false,
    });
    expect(nativeNavigationOverlayStateFor("notifications")).toEqual({
      settingsOpen: false,
      settingsOverlay: null,
      notificationsOpen: true,
      supportOpen: false,
    });
    expect(nativeNavigationOverlayStateFor("support")).toEqual({
      settingsOpen: false,
      settingsOverlay: null,
      notificationsOpen: false,
      supportOpen: true,
    });
    expect(nativeNavigationOverlayStateFor("destination")).toEqual({
      settingsOpen: false,
      settingsOverlay: null,
      notificationsOpen: false,
      supportOpen: false,
    });
  });

  it("records and restores nested detail history in the same order Android back uses", () => {
    const home = { path: "/", route: "/" as const };
    const profile = { path: "/profile", route: "/profile" as const };
    const premium = { path: "/premium?tab=addons", route: "/premium" as const };
    const pet = { path: "/pet-details?id=pet-1", route: "/pet-details" as const };
    const history: Array<{ path: string; route: string }> = [];

    recordNativeRouteHistory(history, home, profile);
    recordNativeRouteHistory(history, profile, premium);
    recordNativeRouteHistory(history, premium, pet);

    expect(restoreNativeRouteHistory(history, home)).toEqual({ target: premium, previous: profile });
    expect(restoreNativeRouteHistory(history, home)).toEqual({ target: profile, previous: home });
    expect(restoreNativeRouteHistory(history, home)).toEqual({ target: home, previous: home });
  });

  it("clears history for an intentional root replacement and does not add same-path entries", () => {
    const home = { path: "/", route: "/" as const };
    const profile = { path: "/profile", route: "/profile" as const };
    const history = [home];

    recordNativeRouteHistory(history, profile, home, { preserveHistory: false });
    expect(history).toEqual([]);
    recordNativeRouteHistory(history, home, home);
    expect(history).toEqual([]);
  });

  it.each(["/active-session/returned", "/active-session/continue"])(
    "replaces %s with Home and makes stale detail history unreachable",
    (commandPath) => {
      const home = { path: "/", route: "/" };
      const current = { path: commandPath, route: "/service-chat" };
      const history = [
        home,
        { path: "/service", route: "/service" },
        { path: "/service-chat?id=booking-1", route: "/service-chat" },
      ];

      const transition = replaceNativeRouteHistory(history, current, "/", (path) => path);

      expect(transition).toEqual({ previous: current, current: home });
      expect(history).toEqual([]);
      expect(restoreNativeRouteHistory(history, home)).toEqual({ target: home, previous: home });
    },
  );

  it("backs through signup before leaving the signup route", () => {
    expect(nativePreviousSignupStep("quickProfile")).toBe("location");
    expect(nativePreviousSignupStep("location")).toBe("name");
    expect(nativePreviousSignupStep("name")).toBe("credentials");
    expect(nativePreviousSignupStep("emailConfirmation")).toBe("credentials");
    expect(nativePreviousSignupStep("credentials")).toBe("dob");
    expect(nativePreviousSignupStep("dob")).toBeNull();
  });

  it("changes route and path atomically while preserving the actual origin", () => {
    const result = nativeRouteTransition(
      { path: "/profile", route: "/profile" },
      "/premium?tab=addons",
      (path) => path.split("?")[0],
    );
    expect(result.current).toEqual({ path: "/premium?tab=addons", route: "/premium" });
    expect(result.previous).toEqual({ path: "/profile", route: "/profile" });
  });

  it("canonicalizes legacy thread notification paths", () => {
    expect(canonicalizeNativeNotificationPath("/threads?focus=post-1")).toBe("/social?focus=post-1");
    expect(canonicalizeNativeNotificationPath("/threads")).toBe("/social");
    expect(canonicalizeNativeNotificationPath("/chats?tab=friends")).toBe("/chats?tab=friends");
  });

  it("does not dismiss recovery until local signout completes", async () => {
    let release!: () => void;
    const signOut = new Promise<void>((resolve) => { release = resolve; });
    let result: { recoveryPasswordPending: false } | undefined;
    const dismissal = completeNativeRecoveryDismissal(() => signOut).then((value) => { result = value; });
    await Promise.resolve();
    expect(result).toBeUndefined();
    release();
    await dismissal;
    expect(result).toEqual({ recoveryPasswordPending: false });
  });

  it("does not hide recovery when local signout rejects", async () => {
    const error = new Error("offline");
    await expect(completeNativeRecoveryDismissal(async () => { throw error; })).rejects.toBe(error);
  });

  it("keeps verification visible while a stale onboarding snapshot resolves to signup", () => {
    expect(resolveNativeEffectiveRoute("/verify-identity", "/signup", true)).toBe("/verify-identity");
    expect(resolveNativeEffectiveRoute("/verify-identity", "/signup", false)).toBe("/signup");
  });
});
