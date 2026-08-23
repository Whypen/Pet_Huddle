import { beforeEach, describe, expect, it, vi } from "vitest";

const asyncStorage = vi.hoisted(() => ({
  getAllKeys: vi.fn(),
  getItem: vi.fn(),
  multiRemove: vi.fn(),
  removeItem: vi.fn(),
  setItem: vi.fn(),
}));
const exactTokenRpc = vi.hoisted(() => vi.fn());

vi.mock("@react-native-async-storage/async-storage", () => ({ default: asyncStorage }));
vi.mock("./nativeExactTokenRequest", () => ({ nativeExactTokenRpc: exactTokenRpc }));
vi.mock("./nativeProfileSummary", () => ({ fetchNativeProfileSummary: vi.fn() }));
vi.mock("./nativeProfilePhotos", () => ({ resolveNativeProfilePhotoDisplayUrl: vi.fn(async () => null) }));
vi.mock("./nativeStorageUrlCache", () => ({
  resolveNativeAvatarUrl: vi.fn(() => null),
  resolveNativeProfileImageUrlAsync: vi.fn(async () => null),
  resolveNativeStoragePublicUrl: vi.fn(() => null),
}));
vi.mock("./nativeMapMutations", () => ({ lookupNativeMapQueryCenter: vi.fn() }));
vi.mock("./nativeVerificationGate", () => ({ isNativeVerifiedProfile: vi.fn(() => false) }));

import { clearNativeMapCaches, fetchNativeMapPeopleV2, purgeNativeMapPersistentCaches } from "./nativeMapData";

describe("native map session privacy", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    asyncStorage.getAllKeys.mockResolvedValue([]);
    asyncStorage.getItem.mockResolvedValue(null);
    asyncStorage.multiRemove.mockResolvedValue(undefined);
    asyncStorage.removeItem.mockResolvedValue(undefined);
    asyncStorage.setItem.mockResolvedValue(undefined);
    await clearNativeMapCaches();
    vi.clearAllMocks();
  });

  it("purges every persisted map surface without touching unrelated storage", async () => {
    asyncStorage.getAllKeys.mockResolvedValue([
      "native-map:peopleV2:v4:old-session",
      "native-map:peopleV2:v5:current-session",
      "huddle:native-map-session:v7:viewer-session",
      "huddle:native-map-alerts:viewer",
      "huddle:unrelated",
    ]);

    await clearNativeMapCaches();

    expect(asyncStorage.multiRemove).toHaveBeenCalledWith([
      "native-map:peopleV2:v4:old-session",
      "native-map:peopleV2:v5:current-session",
      "huddle:native-map-session:v7:viewer-session",
      "huddle:native-map-alerts:viewer",
    ]);
  });

  it("removes every historical per-viewport cache and friend-bearing session snapshot", async () => {
    asyncStorage.getAllKeys.mockResolvedValue([
      "native-map:peopleV2:v4:old-session",
      "native-map:peopleV2:v5:current-session",
      "native-map:pinShell:v3:old-session",
      "native-map:pinShell:v4:current-session",
      "native-map:alertDetail:v3:current-session",
      "huddle:native-map-session:v7:friend-bearing-session",
      "huddle:native-map-session:v8:privacy-safe-session",
      "huddle:native-map-alerts:viewer",
    ]);

    await purgeNativeMapPersistentCaches();

    expect(asyncStorage.multiRemove).toHaveBeenCalledWith([
      "native-map:peopleV2:v4:old-session",
      "native-map:peopleV2:v5:current-session",
      "native-map:pinShell:v3:old-session",
      "native-map:pinShell:v4:current-session",
      "native-map:alertDetail:v3:current-session",
      "huddle:native-map-session:v7:friend-bearing-session",
    ]);
  });

  it("keeps per-viewport Map responses in memory without minting AsyncStorage keys", async () => {
    exactTokenRpc.mockResolvedValue({
      data: { connections: [], anonymousAreas: [], nextRefreshAt: null },
      error: null,
    });

    await fetchNativeMapPeopleV2([114.17, 22.30], 25000, {
      accessToken: "test-token",
      viewerId: "viewer",
      sessionKey: "viewer:session",
    });
    await fetchNativeMapPeopleV2([114.171, 22.301], 25000, {
      accessToken: "test-token",
      viewerId: "viewer",
      sessionKey: "viewer:session",
    });

    expect(exactTokenRpc).toHaveBeenCalledTimes(2);
    expect(asyncStorage.getItem).not.toHaveBeenCalled();
    expect(asyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("parses the versioned viewer area and connection area key", async () => {
    exactTokenRpc.mockResolvedValue({
      data: {
        geometryVersion: 2,
        viewerArea: { areaKey: "viewer-cell", lat: 22.302, lng: 114.171 },
        connections: [{
          id: "friend-a",
          displayName: "Friend A",
          avatarUrl: null,
          areaKey: "friend-cell",
          lat: 22.306,
          lng: 114.176,
          visibleUntil: "2026-08-17T00:00:00.000Z",
        }],
        anonymousAreas: [],
        nextRefreshAt: null,
      },
      error: null,
    });

    const result = await fetchNativeMapPeopleV2([114.17, 22.30], 25000, {
      accessToken: "test-token",
      viewerId: "viewer",
      sessionKey: "viewer:versioned",
      force: true,
    });

    expect(result.geometryVersion).toBe(2);
    expect(result.viewerArea).toEqual({ areaKey: "viewer-cell", lat: 22.302, lng: 114.171 });
    expect(result.connections).toEqual([expect.objectContaining({ id: "friend-a", area_key: "friend-cell" })]);
    expect(exactTokenRpc).toHaveBeenCalledWith("get_native_map_people_v3", expect.any(Object), "test-token");
  });

  it("falls back as one complete legacy response only when the versioned RPC is unavailable", async () => {
    exactTokenRpc
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "missing", status: 404 } })
      .mockResolvedValueOnce({ data: { connections: [], anonymousAreas: [], nextRefreshAt: null }, error: null });

    const result = await fetchNativeMapPeopleV2([114.18, 22.31], 25000, {
      accessToken: "test-token",
      viewerId: "viewer",
      sessionKey: "viewer:legacy",
      force: true,
    });

    expect(result).toEqual({
      connections: [],
      anonymousAreas: [],
      geometryVersion: 1,
      nextRefreshAt: null,
      viewerArea: null,
    });
    expect(exactTokenRpc.mock.calls.map(([name]) => name)).toEqual([
      "get_native_map_people_v3",
      "get_native_map_people_v2",
    ]);
  });

  it("discards hidden identity metadata and prevents a signed-out request from writing it", async () => {
    const finishRequest: { current: ((value: { data: unknown; error: null }) => void) | null } = { current: null };
    exactTokenRpc.mockImplementation(() => new Promise((resolve) => {
      finishRequest.current = resolve;
    }));

    const request = fetchNativeMapPeopleV2([114.17, 22.30], 25000, {
      accessToken: "test-token",
      viewerId: "viewer",
      sessionKey: "viewer:session",
      force: true,
    });
    await vi.waitFor(() => expect(finishRequest.current).not.toBeNull());

    await clearNativeMapCaches();
    finishRequest.current?.({
      data: {
        connections: [{
          id: "must-not-survive",
          displayName: "Must Not Survive",
          avatarUrl: "https://example.invalid/private.jpg",
          isVerified: true,
          isInvisible: true,
          genderGenre: "private",
          lat: 22.30225,
          lng: 114.17225,
          visibleUntil: "2026-08-15T12:00:00.000Z",
        }],
        anonymousAreas: [],
        nextRefreshAt: null,
      },
      error: null,
    });

    const result = await request;
    expect(result.connections).toEqual([expect.objectContaining({
      id: expect.stringMatching(/^incognito:/),
      display_name: null,
      avatar_url: null,
      is_verified: false,
      is_invisible: true,
      gender_genre: null,
      location_pinned_until: null,
    })]);
    expect(asyncStorage.setItem).not.toHaveBeenCalled();
  });
});
