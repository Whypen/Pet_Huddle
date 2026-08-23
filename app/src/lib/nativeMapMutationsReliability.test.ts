import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exactRpc: vi.fn(),
  freshToken: vi.fn(async () => "fresh-token"),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
  },
}));

vi.mock("./nativeFunctionClient", () => ({
  getFreshNativeAccessToken: mocks.freshToken,
}));

vi.mock("./nativeExactTokenRequest", () => ({
  nativeExactTokenRpc: mocks.exactRpc,
}));

vi.mock("./nativeMapConfig", () => ({
  readNativeMapTokenConfig: vi.fn(() => ({ ok: false })),
}));

import { pinNativeUserOutNow } from "./nativeMapMutations";

describe("native Out Now mutation reliability", () => {
  beforeEach(() => {
    mocks.exactRpc.mockReset();
    mocks.freshToken.mockClear();
  });

  it("reconciles a timed-out start instead of reporting failure after the server committed", async () => {
    const startedAt = new Date(Date.now() - 1_000).toISOString();
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1_000).toISOString();
    mocks.exactRpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: "rpc_timeout", message: "request_timeout", status: 0 },
      })
      .mockResolvedValueOnce({ data: { startedAt, expiresAt }, error: null });

    await expect(pinNativeUserOutNow("user-1", 22.3, 114.1, null, {
      accessToken: "route-token",
    })).resolves.toEqual({ startedAt, expiresAt });

    expect(mocks.exactRpc).toHaveBeenNthCalledWith(
      1,
      "start_native_out_now",
      expect.objectContaining({ p_lat: 22.3, p_lng: 114.1 }),
      "fresh-token",
      { expectedUserId: "user-1" },
    );
    expect(mocks.exactRpc).toHaveBeenNthCalledWith(
      2,
      "get_native_out_now_session_clock",
      {},
      "fresh-token",
      { expectedUserId: "user-1" },
    );
  });

  it("does not accept an old session as proof that an uncertain start committed", async () => {
    const startedAt = new Date(Date.now() - 60 * 60 * 1_000).toISOString();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
    mocks.exactRpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: "rpc_network_error", message: "network_error", status: 0 },
      })
      .mockResolvedValueOnce({ data: { startedAt, expiresAt }, error: null });

    const failure = pinNativeUserOutNow("user-1", 22.3, 114.1, null, {
      accessToken: "route-token",
    });

    await expect(failure).rejects.toMatchObject({
      code: "rpc_network_error",
      operation: "start_native_out_now",
      status: 0,
    });
  });
});
