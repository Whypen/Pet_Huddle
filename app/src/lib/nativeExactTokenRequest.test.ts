import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(() => ({ authorization: "Bearer token" })),
  token: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabaseAnonKey: "anon-key",
  supabaseUrl: "https://example.supabase.co",
}));

vi.mock("./nativeFunctionClient", () => ({
  createNativeAuthenticatedHeaders: mocks.headers,
  getFreshNativeAccessToken: mocks.token,
}));

const deferred = <T,>() => new Promise<T>(() => undefined);

describe("native exact-token RPC transport", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mocks.headers.mockClear();
    mocks.token.mockReset().mockResolvedValue("user-token");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("maps a response-body stall to the existing retryable rpc_timeout result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ text: () => deferred<string>() }));
    const { nativeExactTokenRpc } = await import("./nativeExactTokenRequest");

    const request = nativeExactTokenRpc("get_chat_inbox_summaries", {});
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(request).resolves.toMatchObject({
      data: null,
      error: { code: "rpc_timeout", message: "request_timeout", status: 0 },
    });
  });
});
