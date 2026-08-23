import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A genuinely hung supabase.auth.getSession()/refreshSession() call (dropped connection,
// backgrounded app) must not wedge every future caller forever. See nativeFunctionClient.ts's
// raceNativeAuthTimeout for the fix this file proves. Uses fake timers, isolated to this file,
// so it never affects nativeAuthTransport.test.ts's real-timer assertions.

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  refreshSession: vi.fn(),
  setSession: vi.fn(),
  signOut: vi.fn(),
  startAutoRefresh: vi.fn(),
  stopAutoRefresh: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      refreshSession: mocks.refreshSession,
      setSession: mocks.setSession,
      signOut: mocks.signOut,
      startAutoRefresh: mocks.startAutoRefresh,
      stopAutoRefresh: mocks.stopAutoRefresh,
    },
  },
  supabaseAnonKey: "sb_publishable_test_anon",
  supabaseUrl: "https://example.supabase.co",
}));

// A promise that never settles — the closest simulation of a permanently dropped request.
const neverResolves = <T,>(): Promise<T> => new Promise<T>(() => {});

describe("native auth kernel hang timeout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    for (const mock of Object.values(mocks)) {
      if (typeof mock === "function" && "mockReset" in mock) mock.mockReset();
    }
    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: mocks.unsubscribe } } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves to an empty token instead of hanging forever when getSession never settles", async () => {
    mocks.getSession.mockReturnValue(neverResolves());
    mocks.refreshSession.mockReturnValue(neverResolves());

    const { getFreshNativeAccessToken } = await import("./nativeFunctionClient");
    const pending = getFreshNativeAccessToken();

    // Two bounded waits happen in sequence: getSession's race, then refreshNativeSessionOnce's
    // own race once the unusable `null` session falls through. Advance past both.
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);

    await expect(pending).resolves.toBe("");
  });

  it("gives a second caller its own independent bounded wait, not an instant or compounded one", async () => {
    mocks.getSession.mockReturnValue(neverResolves());
    mocks.refreshSession.mockReturnValue(neverResolves());

    const { getFreshNativeAccessToken } = await import("./nativeFunctionClient");

    const first = getFreshNativeAccessToken();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(first).resolves.toBe("");

    // The singleton is still wedged (the real getSession/refreshSession calls never settled,
    // so their `.finally()` cleanup never ran) — a fresh caller must not be permanently stuck
    // behind it, and must not resolve before its own timer elapses.
    const second = getFreshNativeAccessToken();
    let secondSettled = false;
    void second.then(() => { secondSettled = true; });

    await vi.advanceTimersByTimeAsync(4999);
    expect(secondSettled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(second).resolves.toBe("");
  });

  it("still returns the real session promptly once it resolves before the timeout", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    const staleAt = -60;
    const freshAt = 3600;
    const base64Url = (value: Record<string, unknown>) =>
      btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    const jwtFor = (sub: string, expOffsetSeconds: number) =>
      `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url({ exp: Math.floor(Date.now() / 1000) + expOffsetSeconds, role: "authenticated", sub })}.signature`;
    const freshToken = jwtFor("user-1", freshAt);
    mocks.refreshSession.mockResolvedValue({
      data: { session: { access_token: freshToken, expires_at: Math.floor(Date.now() / 1000) + freshAt, refresh_token: "refresh-token", user: { id: "user-1" } } },
      error: null,
    });
    void staleAt;

    const { getFreshNativeAccessToken } = await import("./nativeFunctionClient");
    const pending = getFreshNativeAccessToken();
    // Real (fast) resolution must win the race well before either timer would fire.
    await vi.advanceTimersByTimeAsync(0);
    await expect(pending).resolves.toBe(freshToken);
  });
});
