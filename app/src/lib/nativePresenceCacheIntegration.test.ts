import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => new Map<string, string>());

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getAllKeys: vi.fn(async () => [...storage.keys()]),
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    multiRemove: vi.fn(async (keys: string[]) => keys.forEach((key) => storage.delete(key))),
    removeItem: vi.fn(async (key: string) => storage.delete(key)),
    setItem: vi.fn(async (key: string, value: string) => storage.set(key, value)),
  },
}));

vi.mock("./nativeStorageUrlCache", () => ({ resolveNativeProfileImageUrlAsync: vi.fn(async () => null) }));
vi.mock("./nativeFunctionClient", () => ({
  createNativeAuthenticatedHeaders: (token: string, extra: Record<string, string> = {}) => ({
    Authorization: `Bearer ${token}`,
    ...extra,
  }),
  getFreshNativeAccessToken: vi.fn(async () => null),
}));
vi.mock("./nativeEngagement", () => ({ fetchNativeEngagementTiers: vi.fn(async () => new Map()) }));
vi.mock("./supabase", () => ({ supabaseAnonKey: "test", supabaseUrl: "https://example.test" }));

import {
  clearNativeProfileSummaryCache,
  fetchNativeProfileSummary,
  patchNativeProfileSummaryCache,
  readCachedNativeProfileSummary,
  subscribeNativeProfileSummary,
  writeNativeProfileSummaryCache,
} from "./nativeProfileSummary";
import { getFreshNativeAccessToken } from "./nativeFunctionClient";

describe("Home and Map presence cache integration", () => {
  const sessionKey = "session-1";
  const userId = "user-1";

  beforeEach(async () => {
    storage.clear();
    await clearNativeProfileSummaryCache();
    vi.mocked(getFreshNativeAccessToken).mockResolvedValue("");
    vi.unstubAllGlobals();
  });

  it("fans a server-confirmed Out Now snapshot from Home to Map", async () => {
    const home = vi.fn();
    const map = vi.fn();
    const stopHome = subscribeNativeProfileSummary(userId, home);
    const stopMap = subscribeNativeProfileSummary(userId, map);
    const visibleUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    await writeNativeProfileSummaryCache(userId, { profile: { id: userId }, quota: null }, { sessionKey });
    await patchNativeProfileSummaryCache(userId, {
      last_lat: 22.3193,
      last_lng: 114.1694,
      map_visible_until: visibleUntil,
    }, { createIfMissing: true, sessionKey });

    for (const listener of [home, map]) {
      expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({
        profile: expect.objectContaining({
          last_lat: 22.3193,
          last_lng: 114.1694,
          map_visible_until: visibleUntil,
        }),
      }));
    }
    expect((await readCachedNativeProfileSummary(userId, { sessionKey }))?.profile?.map_visible_until).toBe(visibleUntil);
    stopHome();
    stopMap();
  });

  it("makes either screen's stop action disappear everywhere and supports rollback", async () => {
    const listener = vi.fn();
    const stop = subscribeNativeProfileSummary(userId, listener);
    const activeUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const stoppedAt = new Date().toISOString();
    await writeNativeProfileSummaryCache(userId, {
      profile: { id: userId, map_visible_until: activeUntil }, quota: null,
    }, { sessionKey });

    await patchNativeProfileSummaryCache(userId, { map_visible_until: stoppedAt }, { sessionKey });
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({
      profile: expect.objectContaining({ map_visible_until: stoppedAt }),
    }));

    await patchNativeProfileSummaryCache(userId, { map_visible_until: activeUntil }, { sessionKey });
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({
      profile: expect.objectContaining({ map_visible_until: activeUntil }),
    }));
    stop();
  });

  it("continues Home/Map fan-out if one stale subscriber throws", async () => {
    const broken = vi.fn();
    const map = vi.fn();
    const stopBroken = subscribeNativeProfileSummary(userId, broken);
    const stopMap = subscribeNativeProfileSummary(userId, map);
    broken.mockImplementation(() => { throw new Error("stale_screen"); });

    await patchNativeProfileSummaryCache(userId, {
      map_visible_until: new Date(Date.now() + 60_000).toISOString(),
    }, { createIfMissing: true, sessionKey });

    expect(broken).toHaveBeenCalledOnce();
    expect(map).toHaveBeenCalledOnce();
    stopBroken();
    stopMap();
  });

  it("does not deliver another session's profile cache update to a session-scoped subscriber", async () => {
    const currentSession = vi.fn();
    const previousSession = vi.fn();
    const stopCurrent = subscribeNativeProfileSummary(userId, currentSession, { sessionKey: "session-current" });
    const stopPrevious = subscribeNativeProfileSummary(userId, previousSession, { sessionKey: "session-previous" });

    await writeNativeProfileSummaryCache(userId, {
      profile: { id: userId, display_name: "Current session" }, quota: null,
    }, { sessionKey: "session-current" });
    expect(currentSession).toHaveBeenCalledOnce();
    expect(previousSession).not.toHaveBeenCalled();

    await writeNativeProfileSummaryCache(userId, {
      profile: { id: userId, display_name: "Previous session" }, quota: null,
    }, { sessionKey: "session-previous" });
    expect(previousSession).toHaveBeenCalledOnce();
    expect(currentSession).toHaveBeenCalledOnce();

    stopCurrent();
    stopPrevious();
  });

  it("keeps a viewed public profile scoped to the viewer session, not the viewed profile id", async () => {
    const viewedProfileId = "public-carer-1";
    const currentViewer = vi.fn();
    const previousViewer = vi.fn();
    const stopCurrent = subscribeNativeProfileSummary(viewedProfileId, currentViewer, { sessionKey: "viewer-current:3" });
    const stopPrevious = subscribeNativeProfileSummary(viewedProfileId, previousViewer, { sessionKey: "viewer-previous:2" });

    await writeNativeProfileSummaryCache(viewedProfileId, {
      profile: { id: viewedProfileId, display_name: "Public carer" }, quota: null,
    }, { sessionKey: "viewer-current:3" });

    expect(currentViewer).toHaveBeenCalledOnce();
    expect(currentViewer).toHaveBeenLastCalledWith(expect.objectContaining({
      profile: expect.objectContaining({ id: viewedProfileId, display_name: "Public carer" }),
    }));
    expect(previousViewer).not.toHaveBeenCalled();

    stopCurrent();
    stopPrevious();
  });

  it("never lets an older profile response overwrite a newer shared Back decision", async () => {
    const activeUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const stoppedAt = new Date().toISOString();
    await writeNativeProfileSummaryCache(userId, {
      profile: { id: userId, map_visible_until: activeUntil }, quota: null,
    }, { sessionKey });

    let resolveResponse!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    vi.mocked(getFreshNativeAccessToken).mockResolvedValue("token");
    vi.stubGlobal("fetch", vi.fn(() => response));

    const staleRead = fetchNativeProfileSummary(userId, { force: true, sessionKey });
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledOnce());
    await patchNativeProfileSummaryCache(userId, { map_visible_until: stoppedAt }, { sessionKey });
    resolveResponse(new Response(JSON.stringify({
      profile: { id: userId, map_visible_until: activeUntil },
      quota: null,
    }), { status: 200 }));

    await expect(staleRead).resolves.toEqual(expect.objectContaining({
      profile: expect.objectContaining({ map_visible_until: stoppedAt }),
    }));
    expect((await readCachedNativeProfileSummary(userId, { sessionKey }))?.profile?.map_visible_until).toBe(stoppedAt);
  });
});
