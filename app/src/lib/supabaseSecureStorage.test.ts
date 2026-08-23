import { beforeEach, describe, expect, it, vi } from "vitest";

const asyncStorage = vi.hoisted(() => ({
  getAllKeys: vi.fn(),
  getItem: vi.fn(),
  multiRemove: vi.fn(),
  removeItem: vi.fn(),
  setItem: vi.fn(),
}));

const secureStore = vi.hoisted(() => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

const supabaseJs = vi.hoisted(() => ({
  createClient: vi.fn((_url: string, _key: string, _options: Record<string, unknown>) => ({ auth: {} })),
  processLock: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({ default: asyncStorage }));
vi.mock("expo-secure-store", () => secureStore);
vi.mock("react-native-url-polyfill/auto", () => ({}));
vi.mock("@supabase/supabase-js", () => supabaseJs);
vi.stubGlobal("__DEV__", false);

import { getNativeAuthStorageHealth, secureStorageAdapter } from "./supabase";

const initialCreateClientOptions = supabaseJs.createClient.mock.calls[0]![2] as {
  auth: {
    autoRefreshToken: boolean;
    detectSessionInUrl: boolean;
    lock: unknown;
    persistSession: boolean;
  };
};

describe("Supabase native secure storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asyncStorage.getItem.mockResolvedValue(null);
    asyncStorage.getAllKeys.mockResolvedValue([]);
    asyncStorage.multiRemove.mockResolvedValue(undefined);
    asyncStorage.removeItem.mockResolvedValue(undefined);
    asyncStorage.setItem.mockResolvedValue(undefined);
    secureStore.deleteItemAsync.mockResolvedValue(undefined);
    secureStore.getItemAsync.mockResolvedValue(null);
    secureStore.setItemAsync.mockResolvedValue(undefined);
  });

  it("configures the Supabase client with the supported cross-runtime process lock", () => {
    expect(initialCreateClientOptions.auth.lock).toBe(supabaseJs.processLock);
    expect(initialCreateClientOptions.auth.persistSession).toBe(true);
    expect(initialCreateClientOptions.auth.autoRefreshToken).toBe(true);
    expect(initialCreateClientOptions.auth.detectSessionInUrl).toBe(false);
  });

  it("removes a stale plaintext fallback after a successful secure write", async () => {
    await secureStorageAdapter.setItem("auth-success", "session");

    expect(secureStore.setItemAsync).toHaveBeenCalledWith("auth-success", "session");
    expect(asyncStorage.removeItem).toHaveBeenCalledWith("auth-success");
    expect(asyncStorage.setItem).not.toHaveBeenCalled();
    expect(getNativeAuthStorageHealth()).toEqual({ ephemeral: false, ephemeralEntryCount: 0 });
  });

  it("keeps a successful login alive in memory when Keychain fails without leaking to plaintext storage", async () => {
    secureStore.setItemAsync.mockRejectedValueOnce(new Error("keychain unavailable"));

    await expect(secureStorageAdapter.setItem("auth-ephemeral", "session")).resolves.toBeUndefined();
    await expect(secureStorageAdapter.getItem("auth-ephemeral")).resolves.toBe("session");

    expect(asyncStorage.setItem).not.toHaveBeenCalled();
    expect(asyncStorage.removeItem).toHaveBeenCalledWith("auth-ephemeral");
    expect(getNativeAuthStorageHealth()).toEqual({ ephemeral: true, ephemeralEntryCount: 1 });

    await secureStorageAdapter.removeItem("auth-ephemeral");
    expect(getNativeAuthStorageHealth()).toEqual({ ephemeral: false, ephemeralEntryCount: 0 });
  });

  it("round-trips chunked secure sessions using only SecureStore-safe key names", async () => {
    const value = "x".repeat(4_000);
    const stored = new Map<string, string>();
    secureStore.setItemAsync.mockImplementation(async (key: string, item: string) => {
      stored.set(key, item);
    });
    secureStore.getItemAsync.mockImplementation(async (key: string) => stored.get(key) ?? null);
    secureStore.deleteItemAsync.mockImplementation(async (key: string) => {
      stored.delete(key);
    });

    await secureStorageAdapter.setItem("auth-chunked", value);

    expect([...stored.keys()].every((key) => /^[A-Za-z0-9._-]+$/.test(key))).toBe(true);
    expect([...stored.keys()].some((key) => key.includes(":"))).toBe(false);
    await expect(secureStorageAdapter.getItem("auth-chunked")).resolves.toBe(value);
    expect(asyncStorage.setItem).not.toHaveBeenCalled();
    expect(asyncStorage.getItem).not.toHaveBeenCalled();
  });

  it("migrates and deletes a historical plaintext session without retaining another plaintext copy", async () => {
    asyncStorage.getItem.mockResolvedValueOnce("legacy-plaintext-session");

    await expect(secureStorageAdapter.getItem("auth-plaintext")).resolves.toBe("legacy-plaintext-session");

    expect(secureStore.setItemAsync).toHaveBeenCalledWith("auth-plaintext", "legacy-plaintext-session");
    expect(asyncStorage.removeItem).toHaveBeenCalledWith("auth-plaintext");
    expect(asyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("cleans every attempted chunk after a partial secure write failure", async () => {
    secureStore.setItemAsync.mockImplementation(async (key: string) => {
      if (key.endsWith(".chunk.1")) throw new Error("partial keychain failure");
    });

    await expect(secureStorageAdapter.setItem("auth-partial", "x".repeat(4_000))).resolves.toBeUndefined();

    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith("auth-partial.chunk.0");
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith("auth-partial.chunk.1");
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith("auth-partial.chunk.2");
    expect(asyncStorage.setItem).not.toHaveBeenCalled();
    await secureStorageAdapter.removeItem("auth-partial");
  });

  it.each([
    ["direct value", "auth-failure-direct", "session", (key: string) => key === "auth-failure-direct"],
    ["first chunk", "auth-failure-chunk-0", "x".repeat(4_000), (key: string) => key.endsWith(".chunk.0")],
    ["middle chunk", "auth-failure-chunk-1", "x".repeat(4_000), (key: string) => key.endsWith(".chunk.1")],
    ["last chunk", "auth-failure-chunk-2", "x".repeat(4_000), (key: string) => key.endsWith(".chunk.2")],
    ["chunk manifest", "auth-failure-manifest", "x".repeat(4_000), (key: string) => key.endsWith(".chunks")],
  ])("keeps the current process authenticated without plaintext leakage when SecureStore fails at %s", async (_stage, key, value, shouldFail) => {
    secureStore.setItemAsync.mockImplementation(async (storageKey: string) => {
      if (shouldFail(storageKey)) throw new Error("keychain unavailable");
    });

    await expect(secureStorageAdapter.setItem(key, value)).resolves.toBeUndefined();
    await expect(secureStorageAdapter.getItem(key)).resolves.toBe(value);
    expect(asyncStorage.setItem).not.toHaveBeenCalled();
    expect(asyncStorage.removeItem).toHaveBeenCalledWith(key);
    expect(getNativeAuthStorageHealth()).toEqual({ ephemeral: true, ephemeralEntryCount: 1 });

    await secureStorageAdapter.removeItem(key);
    expect(getNativeAuthStorageHealth()).toEqual({ ephemeral: false, ephemeralEntryCount: 0 });
  });

  it("does not resurrect an in-memory-only session after a simulated cold restart", async () => {
    const key = "auth-cold-restart";
    asyncStorage.getItem.mockResolvedValueOnce("legacy-plaintext-session");
    secureStore.setItemAsync.mockRejectedValue(new Error("keychain unavailable"));

    await expect(secureStorageAdapter.getItem(key)).resolves.toBe("legacy-plaintext-session");
    expect(asyncStorage.setItem).not.toHaveBeenCalled();
    expect(asyncStorage.removeItem).toHaveBeenCalledWith(key);
    expect(getNativeAuthStorageHealth()).toEqual({ ephemeral: true, ephemeralEntryCount: 1 });

    vi.resetModules();
    const rebooted = await import("./supabase");

    await expect(rebooted.secureStorageAdapter.getItem(key)).resolves.toBeNull();
    expect(rebooted.getNativeAuthStorageHealth()).toEqual({ ephemeral: false, ephemeralEntryCount: 0 });
    expect(asyncStorage.setItem).not.toHaveBeenCalled();
  });
});
