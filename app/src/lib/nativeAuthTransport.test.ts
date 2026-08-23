import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  anonKey: "sb_publishable_test_anon",
  fetch: vi.fn(),
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
  supabaseAnonKey: mocks.anonKey,
  supabaseUrl: "https://example.supabase.co",
}));

const base64Url = (value: Record<string, unknown>) =>
  btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const jwtFor = (sub: string, expOffsetSeconds: number, role = "authenticated") =>
  `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url({ exp: Math.floor(Date.now() / 1000) + expOffsetSeconds, role, sub })}.signature`;

const makeSession = (accessToken: string, refreshToken = "refresh-token", userId = "user-1") => ({
  access_token: accessToken,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: refreshToken,
  user: { id: userId },
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

describe("native auth kernel and transport contract", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) {
      if (typeof mock === "function" && "mockReset" in mock) mock.mockReset();
    }
    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: mocks.unsubscribe } } });
    mocks.signOut.mockResolvedValue({ error: null });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("refreshes a stale stored session and sends only fresh user headers", async () => {
    const staleToken = jwtFor("user-1", -60);
    const freshToken = jwtFor("user-1", 3600);
    mocks.getSession.mockResolvedValue({ data: { session: makeSession(staleToken) }, error: null });
    mocks.refreshSession.mockResolvedValue({ data: { session: makeSession(freshToken) }, error: null });

    const { createFreshNativeFunctionHeaders, getFreshNativeAccessToken } = await import("./nativeFunctionClient");
    const token = await getFreshNativeAccessToken(staleToken);
    const headers = await createFreshNativeFunctionHeaders(staleToken, { functionName: "delete-account", routeToken: staleToken });

    expect(token).toBe(freshToken);
    expect(headers.Authorization).toBe(`Bearer ${freshToken}`);
    expect(headers["x-huddle-access-token"]).toBe(freshToken);
    expect(headers.Authorization).not.toBe(`Bearer ${mocks.anonKey}`);
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
  });

  it("coalesces 50 simultaneous stale-session callers into one read and one refresh", async () => {
    const staleToken = jwtFor("user-1", -60);
    const freshToken = jwtFor("user-1", 3600);
    const refresh = deferred<{ data: { session: ReturnType<typeof makeSession> }; error: null }>();
    mocks.getSession.mockResolvedValue({ data: { session: makeSession(staleToken) }, error: null });
    mocks.refreshSession.mockReturnValue(refresh.promise);

    const { getFreshNativeAccessToken } = await import("./nativeFunctionClient");
    const requests = Array.from({ length: 50 }, () => getFreshNativeAccessToken("stale-route-token"));
    await vi.waitFor(() => expect(mocks.refreshSession).toHaveBeenCalledTimes(1));
    refresh.resolve({ data: { session: makeSession(freshToken) }, error: null });

    await expect(Promise.all(requests)).resolves.toEqual(Array.from({ length: 50 }, () => freshToken));
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
  });

  it("never accepts an anonymous JWT or a caller-supplied route token for protected requests", async () => {
    const anonToken = jwtFor("anon-key-subject", 3600, "anon");
    const unownedToken = jwtFor("route-user", 3600);
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.refreshSession.mockResolvedValue({ data: { session: null }, error: null });

    const { createFreshNativeFunctionHeaders, getFreshNativeAccessToken } = await import("./nativeFunctionClient");

    await expect(getFreshNativeAccessToken(anonToken)).resolves.toBe("");
    await expect(getFreshNativeAccessToken(unownedToken)).resolves.toBe("");
    await expect(createFreshNativeFunctionHeaders(unownedToken, { functionName: "delete-account" })).rejects.toThrow("auth_required");
  });

  it("binds protected headers to the kernel session even when a different token is passed", async () => {
    const routeToken = jwtFor("signup-user", 3600);
    const currentToken = jwtFor("current-user", 3600);
    mocks.getSession.mockResolvedValue({ data: { session: makeSession(currentToken, "current-refresh", "current-user") }, error: null });

    const { createFreshNativeFunctionHeaders, getFreshNativeAccessToken } = await import("./nativeFunctionClient");

    await expect(getFreshNativeAccessToken(routeToken)).resolves.toBe(currentToken);
    await expect(createFreshNativeFunctionHeaders(routeToken)).resolves.toMatchObject({
      Authorization: `Bearer ${currentToken}`,
      "x-huddle-access-token": currentToken,
    });
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });

  it("rejects a valid session when it belongs to a different expected user", async () => {
    const currentToken = jwtFor("current-user", 3600);
    mocks.getSession.mockResolvedValue({
      data: { session: makeSession(currentToken, "current-refresh", "current-user") },
      error: null,
    });

    const { getFreshNativeAccessToken } = await import("./nativeFunctionClient");

    await expect(getFreshNativeAccessToken(currentToken, "other-user")).resolves.toBe("");
    await expect(getFreshNativeAccessToken(currentToken, "current-user")).resolves.toBe(currentToken);
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
  });

  it("prevents an old in-flight refresh from overwriting a newly activated account", async () => {
    const oldStaleToken = jwtFor("old-user", -60);
    const oldFreshToken = jwtFor("old-user", 3600);
    const newToken = jwtFor("new-user", 3600);
    const refresh = deferred<{ data: { session: ReturnType<typeof makeSession> }; error: null }>();
    mocks.getSession.mockResolvedValue({ data: { session: makeSession(oldStaleToken, "old-refresh", "old-user") }, error: null });
    mocks.refreshSession.mockReturnValue(refresh.promise);

    const { createNativeAuthenticatedHeaders, getFreshNativeAccessToken, noteNativeAuthState } = await import("./nativeFunctionClient");
    const pending = getFreshNativeAccessToken();
    await vi.waitFor(() => expect(mocks.refreshSession).toHaveBeenCalledTimes(1));
    noteNativeAuthState(makeSession(newToken, "new-refresh", "new-user") as never);
    refresh.resolve({ data: { session: makeSession(oldFreshToken, "old-refresh", "old-user") }, error: null });

    await expect(pending).resolves.toBe(newToken);
    expect(createNativeAuthenticatedHeaders(newToken).Authorization).toBe(`Bearer ${newToken}`);
    expect(() => createNativeAuthenticatedHeaders(oldFreshToken)).toThrow("auth_required");
  });

  it("holds the authority invariant through 128 delayed-refresh account-switch and sign-out races", async () => {
    const {
      clearNativeAuthState,
      createNativeAuthenticatedHeaders,
      getFreshNativeAccessToken,
      noteNativeAuthState,
    } = await import("./nativeFunctionClient");
    let seed = 0x4d595df4;
    const nextRandomBit = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed & 1;
    };

    for (let index = 0; index < 128; index += 1) {
      clearNativeAuthState();
      const oldUserId = `old-user-${index}`;
      const newUserId = `new-user-${index}`;
      const oldStaleToken = jwtFor(oldUserId, -60);
      const oldFreshToken = jwtFor(oldUserId, 3600);
      const newToken = jwtFor(newUserId, 3600);
      const refresh = deferred<{ data: { session: ReturnType<typeof makeSession> }; error: null }>();
      mocks.getSession.mockResolvedValueOnce({ data: { session: makeSession(oldStaleToken, `old-refresh-${index}`, oldUserId) }, error: null });
      mocks.refreshSession.mockReturnValueOnce(refresh.promise);

      const pending = getFreshNativeAccessToken();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mocks.refreshSession, `iteration ${index} must start exactly one refresh`).toHaveBeenCalledTimes(index + 1);
      const switchesAccount = nextRandomBit() === 1;
      if (switchesAccount) {
        noteNativeAuthState(makeSession(newToken, `new-refresh-${index}`, newUserId) as never);
      } else {
        clearNativeAuthState();
      }
      refresh.resolve({ data: { session: makeSession(oldFreshToken, `old-refresh-${index}`, oldUserId) }, error: null });

      await expect(pending, `iteration ${index}`).resolves.toBe(switchesAccount ? newToken : "");
      expect(() => createNativeAuthenticatedHeaders(oldFreshToken), `iteration ${index} must reject the stale account`).toThrow("auth_required");
      if (switchesAccount) {
        expect(createNativeAuthenticatedHeaders(newToken).Authorization).toBe(`Bearer ${newToken}`);
      } else {
        expect(() => createNativeAuthenticatedHeaders(newToken), `iteration ${index} must reject after sign-out`).toThrow("auth_required");
      }
    }
  });

  it("installs sessions through one owner and rejects invalid token material before mutation", async () => {
    const token = jwtFor("user-1", 3600);
    const session = makeSession(token);
    mocks.setSession.mockResolvedValue({ data: { session }, error: null });

    const { createNativeAuthenticatedHeaders, installNativeAuthSession } = await import("./nativeFunctionClient");

    await expect(installNativeAuthSession({ access_token: token, refresh_token: "refresh-token" })).resolves.toEqual(session);
    expect(mocks.setSession).toHaveBeenCalledTimes(1);
    expect(createNativeAuthenticatedHeaders(token).Authorization).toBe(`Bearer ${token}`);
    await expect(installNativeAuthSession({ access_token: "not-a-jwt", refresh_token: "refresh-token" })).rejects.toThrow("session_missing");
    expect(mocks.setSession).toHaveBeenCalledTimes(1);
  });

  it("clears local authority even when the underlying sign-out request fails", async () => {
    const token = jwtFor("user-1", 3600);
    mocks.signOut.mockRejectedValue(new Error("network unavailable"));

    const { createNativeAuthenticatedHeaders, noteNativeAuthState, signOutNativeAuthSession } = await import("./nativeFunctionClient");
    noteNativeAuthState(makeSession(token) as never);
    expect(createNativeAuthenticatedHeaders(token).Authorization).toBe(`Bearer ${token}`);

    await expect(signOutNativeAuthSession({ scope: "local" })).rejects.toThrow("network unavailable");
    expect(() => createNativeAuthenticatedHeaders(token)).toThrow("auth_required");
  });

  it("owns exactly one auth subscription and releases it after the final listener", async () => {
    const { subscribeNativeAuthState } = await import("./nativeFunctionClient");
    const first = subscribeNativeAuthState(vi.fn());
    const second = subscribeNativeAuthState(vi.fn());

    expect(mocks.onAuthStateChange).toHaveBeenCalledTimes(1);
    first();
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
    second();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("starts and stops auto-refresh once per foreground transition", async () => {
    const { setNativeAuthRefreshForeground } = await import("./nativeFunctionClient");

    setNativeAuthRefreshForeground(true);
    setNativeAuthRefreshForeground(true);
    setNativeAuthRefreshForeground(false);
    setNativeAuthRefreshForeground(false);

    expect(mocks.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.stopAutoRefresh).toHaveBeenCalledTimes(1);
  });

  it("runtime self-test emits the same fresh protected token for every probe", async () => {
    const staleToken = jwtFor("user-1", -60);
    const freshToken = jwtFor("user-1", 3600);
    mocks.getSession.mockResolvedValue({ data: { session: makeSession(staleToken) }, error: null });
    mocks.refreshSession.mockResolvedValue({ data: { session: makeSession(freshToken) }, error: null });
    mocks.fetch.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body || "{}")) as { action?: string; turnstile_action?: string };
      const status = body.action === "auth_probe" || body.action === "get" || body.turnstile_action === "auth_probe" ? 200 : 409;
      return {
        json: async () => ({ ok: status === 200, error: status === 409 ? "business_gate" : undefined }),
        status,
      };
    });

    const { runNativeAuthTransportSelfTest } = await import("./nativeAuthTransportSelfTest");
    const result = await runNativeAuthTransportSelfTest();

    expect(result.ok).toBe(true);
    for (const [, init] of mocks.fetch.mock.calls) {
      expect(init.headers.Authorization).toBe(`Bearer ${freshToken}`);
      expect(init.headers["x-huddle-access-token"]).toBe(freshToken);
      expect(init.headers.Authorization).not.toBe(`Bearer ${mocks.anonKey}`);
    }
  });
});
