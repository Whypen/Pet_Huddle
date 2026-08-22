import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_INTENT_TTL_MS,
  DEFAULT_AUTH_RETURN_TO,
  clearAuthIntent,
  readAuthIntent,
  resolveAuthReturnTo,
  takeResolvedAuthReturnTo,
  takeAuthIntent,
  takeAuthReturnTo,
  writeAuthReturnTo,
  writeAuthIntent,
} from "./authIntent";

const STORAGE_KEY = "huddle_auth_intent";

describe("authIntent", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the exact safe origin and one centralized no-origin fallback", () => {
    expect(resolveAuthReturnTo("/map?alert=abc", "/social")).toBe("/map?alert=abc");
    expect(resolveAuthReturnTo("https://evil.example", "//evil.example")).toBe(DEFAULT_AUTH_RETURN_TO);
  });

  it.each(["/", "/auth", "/auth/callback", "/join?mode=signin", "/signup/dob", "/settings"])(
    "never returns authentication into legacy or auth-only surface %s",
    (returnTo) => {
      expect(resolveAuthReturnTo(returnTo)).toBe(DEFAULT_AUTH_RETURN_TO);
    },
  );

  it("round-trips an intent", () => {
    writeAuthIntent({ type: "join-group", targetId: "g-1", returnTo: "/chats" });
    expect(readAuthIntent()).toMatchObject({ type: "join-group", targetId: "g-1", returnTo: "/chats" });
  });

  it("survives a simulated full page reload", () => {
    // The OAuth redirect unloads the page; sessionStorage is what carries the
    // intent across it. Nothing in-memory may be relied on.
    writeAuthIntent({ type: "post" });
    const persisted = sessionStorage.getItem(STORAGE_KEY);
    expect(persisted).toBeTruthy();
    expect(readAuthIntent()?.type).toBe("post");
  });

  it("persists the profile intent used by avatar gates", () => {
    writeAuthIntent({ type: "profile", targetId: "member-handle", returnTo: "/social" });
    expect(readAuthIntent()).toMatchObject({
      type: "profile",
      targetId: "member-handle",
      returnTo: "/social",
    });
  });

  it("discards an intent older than the TTL", () => {
    writeAuthIntent({ type: "broadcast" });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + AUTH_INTENT_TTL_MS + 1);
    expect(readAuthIntent()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("keeps an intent that is still inside the TTL", () => {
    writeAuthIntent({ type: "broadcast" });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + AUTH_INTENT_TTL_MS - 1000);
    expect(readAuthIntent()?.type).toBe("broadcast");
  });

  it("discards an intent from the future (clock skew)", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ type: "post", createdAt: Date.now() + 60_000 }),
    );
    expect(readAuthIntent()).toBeNull();
  });

  it("takeAuthIntent consumes, so a replay cannot fire twice", () => {
    writeAuthIntent({ type: "like", targetId: "t-9" });
    expect(takeAuthIntent()?.targetId).toBe("t-9");
    expect(takeAuthIntent()).toBeNull();
  });

  it("rejects an unknown intent type rather than trusting storage", () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ type: "delete-everything", createdAt: Date.now() }));
    expect(readAuthIntent()).toBeNull();
  });

  it("survives corrupt JSON without throwing", () => {
    sessionStorage.setItem(STORAGE_KEY, "{not json");
    expect(() => readAuthIntent()).not.toThrow();
    expect(readAuthIntent()).toBeNull();
  });

  it.each([
    ["https://evil.example", "absolute URL"],
    ["//evil.example", "protocol-relative URL"],
    ["javascript:alert(1)", "javascript scheme"],
  ])("strips an off-origin returnTo (%s — %s)", (returnTo) => {
    writeAuthIntent({ type: "post", returnTo });
    expect(readAuthIntent()?.returnTo).toBeUndefined();
  });

  it("keeps a same-origin path returnTo", () => {
    writeAuthIntent({ type: "post", returnTo: "/social?compose=1" });
    expect(readAuthIntent()?.returnTo).toBe("/social?compose=1");
  });

  it("carries and consumes a return path even when there is no write intent", () => {
    writeAuthReturnTo("/map?alert=a-1");
    expect(takeAuthReturnTo()).toBe("/map?alert=a-1");
    expect(takeAuthReturnTo()).toBeNull();
  });

  it("rejects an off-origin standalone return path", () => {
    writeAuthReturnTo("https://evil.example");
    expect(takeAuthReturnTo()).toBeNull();
  });

  it("returns to the exact originating surface after onboarding and consumes the handoff", () => {
    writeAuthReturnTo("/chats?tab=friends&room=kurio");
    expect(takeResolvedAuthReturnTo()).toBe("/chats?tab=friends&room=kurio");
    expect(takeResolvedAuthReturnTo()).toBe(DEFAULT_AUTH_RETURN_TO);
  });

  it("prefers the action origin and still rejects legacy Home as an auth fallback", () => {
    writeAuthReturnTo("/map");
    writeAuthIntent({ type: "message", returnTo: "/chats?tab=friends" });
    expect(takeResolvedAuthReturnTo()).toBe("/chats?tab=friends");
    expect(DEFAULT_AUTH_RETURN_TO).toBe("/social");
  });

  it("clearAuthIntent removes it", () => {
    writeAuthIntent({ type: "message" });
    clearAuthIntent();
    expect(readAuthIntent()).toBeNull();
  });
});
