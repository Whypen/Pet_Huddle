import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleNativeMembershipRefreshRetry } from "./nativeMembershipRefreshRetry";

describe("native membership refresh retry", () => {
  afterEach(() => vi.useRealTimers());

  it("runs one delayed refresh and never loops", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => {});

    scheduleNativeMembershipRefreshRetry({ delayMs: 1500, isCurrentSession: () => true, refresh });
    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh after cleanup or a session change", async () => {
    vi.useFakeTimers();
    const refreshAfterCleanup = vi.fn();
    const cancel = scheduleNativeMembershipRefreshRetry({ delayMs: 1500, isCurrentSession: () => true, refresh: refreshAfterCleanup });
    cancel();

    const refreshAfterSessionChange = vi.fn();
    scheduleNativeMembershipRefreshRetry({ delayMs: 1500, isCurrentSession: () => false, refresh: refreshAfterSessionChange });
    await vi.advanceTimersByTimeAsync(1500);

    expect(refreshAfterCleanup).not.toHaveBeenCalled();
    expect(refreshAfterSessionChange).not.toHaveBeenCalled();
  });
});
