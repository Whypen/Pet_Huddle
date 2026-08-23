import AsyncStorage from "@react-native-async-storage/async-storage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NATIVE_DISPLAY_CACHE_CIRCUIT_OPEN_MS,
  readNativeDisplayCacheItem,
  readNativeDisplayCacheItems,
  readNativeDisplayCacheKeys,
  resetNativeDisplayCacheReadCircuitForTests,
} from "./nativeDisplayCacheStorage";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getAllKeys: vi.fn(),
    getItem: vi.fn(),
    multiGet: vi.fn(),
  },
}));

describe("nativeDisplayCacheStorage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetNativeDisplayCacheReadCircuitForTests();
  });

  it("bounds a never-settling item read and opens the circuit", async () => {
    vi.mocked(AsyncStorage.getItem).mockReturnValue(new Promise(() => undefined));
    const first = readNativeDisplayCacheItem("feed", { deadlineMs: 20 });
    await vi.advanceTimersByTimeAsync(20);
    await expect(first).resolves.toBeNull();

    await expect(readNativeDisplayCacheItem("map", { deadlineMs: 20 })).resolves.toBeNull();
    expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1);
  });

  it("deduplicates identical reads while preserving successful values", async () => {
    let resolveRead!: (value: string | null) => void;
    vi.mocked(AsyncStorage.getItem).mockReturnValue(new Promise((resolve) => { resolveRead = resolve; }));
    const first = readNativeDisplayCacheItem("profile");
    const second = readNativeDisplayCacheItem("profile");
    await vi.advanceTimersByTimeAsync(0);
    expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1);
    resolveRead("cached");
    await expect(first).resolves.toBe("cached");
    await expect(second).resolves.toBe("cached");
  });

  it("bounds multiGet and getAllKeys without starting more I/O while open", async () => {
    vi.mocked(AsyncStorage.multiGet).mockReturnValue(new Promise(() => undefined));
    const first = readNativeDisplayCacheItems(["a", "b"], { deadlineMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    await expect(first).resolves.toEqual([]);
    await expect(readNativeDisplayCacheKeys()).resolves.toEqual([]);
    expect(AsyncStorage.getAllKeys).not.toHaveBeenCalled();
  });

  it("opens the circuit after a storage error to prevent retry churn", async () => {
    vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(readNativeDisplayCacheItem("first")).resolves.toBeNull();
    await expect(readNativeDisplayCacheItem("second")).resolves.toBeNull();
    expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1);
  });

  it("tries one fresh read after the circuit cools down", async () => {
    vi.mocked(AsyncStorage.getAllKeys)
      .mockReturnValueOnce(new Promise(() => undefined))
      .mockResolvedValueOnce(["fresh"]);
    const first = readNativeDisplayCacheKeys({ deadlineMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    await expect(first).resolves.toEqual([]);
    await vi.advanceTimersByTimeAsync(NATIVE_DISPLAY_CACHE_CIRCUIT_OPEN_MS);
    await expect(readNativeDisplayCacheKeys()).resolves.toEqual(["fresh"]);
    expect(AsyncStorage.getAllKeys).toHaveBeenCalledTimes(2);
  });

  it("ignores a timed-out operation's late completion", async () => {
    let resolveOld!: (value: string | null) => void;
    vi.mocked(AsyncStorage.getItem)
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce("fresh");
    const first = readNativeDisplayCacheItem("same", { deadlineMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    await expect(first).resolves.toBeNull();
    resolveOld("stale");
    await vi.advanceTimersByTimeAsync(NATIVE_DISPLAY_CACHE_CIRCUIT_OPEN_MS);
    await expect(readNativeDisplayCacheItem("same")).resolves.toBe("fresh");
  });
});
