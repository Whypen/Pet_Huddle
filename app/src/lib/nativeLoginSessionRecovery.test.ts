import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  asyncGetItem: vi.fn(async () => null),
  asyncRemoveItem: vi.fn(async () => undefined),
  asyncSetItem: vi.fn(async () => undefined),
  secureDeleteItem: vi.fn(async () => undefined),
  secureGetItem: vi.fn(async () => null),
  secureSetItem: vi.fn(async () => {
    throw new Error("keychain unavailable");
  }),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: mocks.asyncGetItem,
    removeItem: mocks.asyncRemoveItem,
    setItem: mocks.asyncSetItem,
  },
}));

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: mocks.secureDeleteItem,
  getItemAsync: mocks.secureGetItem,
  setItemAsync: mocks.secureSetItem,
}));

vi.mock("react-native-url-polyfill/auto", () => ({}));

vi.mock("@supabase/supabase-js", () => ({
  processLock: vi.fn(),
  createClient: vi.fn((_url: string, _key: string, options: {
    auth: { storage: { setItem: (key: string, value: string) => Promise<void> } };
  }) => ({
    auth: {
      setSession: async (tokens: { access_token: string; refresh_token: string }) => {
        await options.auth.storage.setItem("auth-session", JSON.stringify(tokens));
        return {
          data: {
            session: {
              access_token: tokens.access_token,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              refresh_token: tokens.refresh_token,
              user: { id: "login-user" },
            },
          },
          error: null,
        };
      },
    },
  })),
}));

vi.stubGlobal("__DEV__", false);

const base64Url = (value: Record<string, unknown>) =>
  btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const authenticatedJwt = () =>
  `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url({
    exp: Math.floor(Date.now() / 1000) + 3600,
    role: "authenticated",
    sub: "login-user",
  })}.signature`;

describe("native successful-login storage regression", () => {
  it("does not turn a successful auth-login response into a UI failure when Keychain is temporarily unavailable", async () => {
    const { getNativeAuthStorageHealth, secureStorageAdapter } = await import("./supabase");
    const { createNativeAuthenticatedHeaders, getFreshNativeAccessToken, installNativeAuthSession } = await import("./nativeFunctionClient");
    const accessToken = authenticatedJwt();

    await expect(installNativeAuthSession({
      access_token: accessToken,
      refresh_token: "single-use-refresh-token",
    })).resolves.toMatchObject({ access_token: accessToken, user: { id: "login-user" } });

    await expect(getFreshNativeAccessToken()).resolves.toBe(accessToken);
    expect(createNativeAuthenticatedHeaders(accessToken).Authorization).toBe(`Bearer ${accessToken}`);
    expect(getNativeAuthStorageHealth()).toEqual({ ephemeral: true, ephemeralEntryCount: 1 });
    expect(mocks.asyncSetItem).not.toHaveBeenCalled();
    expect(mocks.asyncRemoveItem).toHaveBeenCalledWith("auth-session");

    await secureStorageAdapter.removeItem("auth-session");
    expect(getNativeAuthStorageHealth()).toEqual({ ephemeral: false, ephemeralEntryCount: 0 });
  });
});
