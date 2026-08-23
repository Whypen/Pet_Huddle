import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storageGetItem: vi.fn(),
  storageRemoveItem: vi.fn(),
  storageSetItem: vi.fn(),
  secureDeleteItem: vi.fn(),
  secureGetItem: vi.fn(),
  secureSetItem: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: mocks.storageGetItem,
    removeItem: mocks.storageRemoveItem,
    setItem: mocks.storageSetItem,
  },
}));

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: mocks.secureDeleteItem,
  getItemAsync: mocks.secureGetItem,
  setItemAsync: mocks.secureSetItem,
}));

vi.mock("./nativeFunctionClient", () => ({
  createNativeFunctionHeaders: () => ({ "content-type": "application/json" }),
  installNativeAuthSession: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    rpc: vi.fn(),
  },
  supabaseUrl: "https://example.supabase.co",
}));

describe("native signup draft storage", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.storageGetItem.mockReset();
    mocks.storageRemoveItem.mockReset();
    mocks.storageSetItem.mockReset();
    mocks.secureDeleteItem.mockReset();
    mocks.secureGetItem.mockReset();
    mocks.secureSetItem.mockReset();
  });

  it("does not read secure password storage for OAuth draft hydration", async () => {
    mocks.storageGetItem.mockResolvedValue(JSON.stringify({
      email: "apple@example.com",
      phone: "+85262233017",
      password: "should-not-win",
    }));
    mocks.secureGetItem.mockResolvedValue(JSON.stringify({
      password: "StoredPassword1!",
      createdAt: Date.now(),
    }));

    const { loadNativeSignupDraft } = await import("./nativeSignup");
    const draft = await loadNativeSignupDraft({ includePassword: false });

    expect(draft.email).toBe("apple@example.com");
    expect(draft.password).toBe("");
    expect(mocks.secureGetItem).not.toHaveBeenCalled();
  });

  it("deletes secure password storage instead of writing password for OAuth draft save", async () => {
    const { emptyNativeSignupDraft, saveNativeSignupDraft } = await import("./nativeSignup");

    await saveNativeSignupDraft({
      ...emptyNativeSignupDraft,
      email: "apple@example.com",
      password: "StoredPassword1!",
      phone: "+85262233017",
    }, { includePassword: false });

    expect(mocks.storageSetItem).toHaveBeenCalledOnce();
    expect(mocks.secureSetItem).not.toHaveBeenCalled();
    expect(mocks.secureDeleteItem).toHaveBeenCalled();
  });
});
