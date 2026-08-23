import { describe, expect, it, vi } from "vitest";
import { publishNativePermissionDetail, readNativePermissionDetail, subscribeNativePermissionDetail } from "./nativePermissionState";

describe("native permission source of truth", () => {
  it("publishes a permission change to every subscriber for that permission", () => {
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = subscribeNativePermissionDetail("camera", first);
    const stopSecond = subscribeNativePermissionDetail("camera", second);

    publishNativePermissionDetail("camera", { canAskAgain: false, state: "granted" });

    expect(readNativePermissionDetail("camera")).toEqual({ canAskAgain: false, state: "granted" });
    expect(first).toHaveBeenLastCalledWith({ canAskAgain: false, state: "granted" });
    expect(second).toHaveBeenLastCalledWith({ canAskAgain: false, state: "granted" });
    stopFirst();
    stopSecond();
  });

  it("keeps OS permission scopes independent", () => {
    publishNativePermissionDetail("photo_library_read", { canAskAgain: true, state: "granted" });
    publishNativePermissionDetail("photo_library_add", { canAskAgain: false, state: "denied" });

    expect(readNativePermissionDetail("photo_library_read").state).toBe("granted");
    expect(readNativePermissionDetail("photo_library_add").state).toBe("denied");
  });

  it("continues fan-out when one mounted screen subscriber throws", () => {
    const broken = vi.fn();
    const healthy = vi.fn();
    const stopBroken = subscribeNativePermissionDetail("location", broken);
    const stopHealthy = subscribeNativePermissionDetail("location", healthy);
    broken.mockClear();
    healthy.mockClear();
    broken.mockImplementation(() => { throw new Error("screen_unmounted_mid_publish"); });

    expect(() => publishNativePermissionDetail("location", { canAskAgain: false, state: "granted" })).not.toThrow();
    expect(broken).toHaveBeenCalledOnce();
    expect(healthy).toHaveBeenCalledOnce();
    stopBroken();
    stopHealthy();
  });
});
