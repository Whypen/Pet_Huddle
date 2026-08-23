import { createNativeAuthenticatedHeaders, getFreshNativeAccessToken } from "./nativeFunctionClient";
import { resolveNativeProfileImageUrlAsync } from "./nativeStorageUrlCache";
import { supabaseAnonKey, supabaseUrl } from "./supabase";
import { fetchNativeResponseWithTimeout as fetch } from "./nativeTimeout";

export type NativeNearbyOutCompanion = {
  avatarUrl: string | null;
  id: string;
  isBlurred: boolean;
  name: string;
};

export type NativeNearbyOutSnapshot = {
  companions: NativeNearbyOutCompanion[];
  friendCount: number;
  nearbyUserCount: number;
  totalCount: number;
};

type NearbyOutRpcSnapshot = {
  companions?: Array<{
    avatarUrl?: unknown;
    id?: unknown;
    isBlurred?: unknown;
    name?: unknown;
  }>;
  friendCount?: unknown;
  nearbyUserCount?: unknown;
  totalCount?: unknown;
};

const count = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

// Canonical source shared by Home, cold hydration, and the server dispatcher.
// A null result means the read failed and must not be treated as an empty area.
export const fetchNativeNearbyOutSnapshot = async (
  userId: string,
  accessToken?: string | null,
): Promise<NativeNearbyOutSnapshot | null> => {
  const token = await getFreshNativeAccessToken(accessToken || null);
  if (!token || !userId) return null;
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_live_activity_nearby_companions`, {
    method: "POST",
    headers: createNativeAuthenticatedHeaders(token, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ p_user_id: userId }),
  });
  if (!response.ok) return null;
  const raw = await response.json() as NearbyOutRpcSnapshot | null;
  if (!raw || !Array.isArray(raw.companions)) return null;
  const companions = await Promise.all(raw.companions.map(async (entry) => {
    const rawAvatar = String(entry.avatarUrl || "").trim();
    const avatarUrl = rawAvatar
      ? await resolveNativeProfileImageUrlAsync(rawAvatar, 60 * 60, { defaultBucket: "profile_photos" }).catch(() => null)
      : null;
    return {
      avatarUrl,
      id: String(entry.id || "").trim(),
      isBlurred: entry.isBlurred === true,
      name: entry.isBlurred === true ? "" : String(entry.name || "").trim(),
    };
  }));
  return {
    companions,
    friendCount: count(raw.friendCount),
    nearbyUserCount: count(raw.nearbyUserCount),
    totalCount: count(raw.totalCount),
  };
};
