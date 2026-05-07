import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";

export type NativeBroadcastAlertType = "Stray" | "Lost" | "Caution" | "Others";

export type NativeBroadcastCreatePayload = {
  alertId: string;
  threadId: string | null;
  expiresAt: string;
  rangeMeters: number;
};

export const NATIVE_BROADCAST_RANGE_STEPS = [1, 3, 5, 10, 20, 50] as const;
export const NATIVE_BROADCAST_DURATION_STEPS = [1, 3, 6, 12, 24, 48, 72] as const;

export const NATIVE_BROADCAST_CAPS_BY_TIER: Record<"free" | "plus" | "gold", { radiusKm: number; durationHours: number }> = {
  free: { radiusKm: 5, durationHours: 12 },
  plus: { radiusKm: 10, durationHours: 24 },
  gold: { radiusKm: 20, durationHours: 48 },
};

export const NATIVE_BROADCAST_ACTIVE_CONCURRENT_CAPS_BY_TIER: Record<"free" | "plus" | "gold", number> = {
  free: 3,
  plus: 5,
  gold: 10,
};

export const NATIVE_BROADCAST_VERIFIED_BROADCAST_BONUS = 10;

export const NATIVE_SUPER_BROADCAST_CAPS = { radiusKm: 50, durationHours: 72 } as const;

export const normalizeNativeBroadcastTier = (tierRaw?: string | null): "free" | "plus" | "gold" => {
  const tier = String(tierRaw || "free").toLowerCase();
  if (tier === "gold") return "gold";
  if (tier === "plus" || tier === "premium") return "plus";
  return "free";
};

export const normalizeNativeBroadcastAlertType = (value?: string | null): NativeBroadcastAlertType => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "lost") return "Lost";
  if (normalized === "caution") return "Caution";
  if (normalized === "others" || normalized === "other") return "Others";
  return "Stray";
};

export const getNativeBroadcastActiveConcurrentLimit = (
  tier: "free" | "plus" | "gold",
  isVerified: boolean | null = false,
) => {
  return NATIVE_BROADCAST_ACTIVE_CONCURRENT_CAPS_BY_TIER[tier] + (isVerified ? NATIVE_BROADCAST_VERIFIED_BROADCAST_BONUS : 0);
};

export const getNativeBroadcastPinColor = (type: NativeBroadcastAlertType) => {
  if (type === "Lost") return "#EF4444";
  if (type === "Caution") return "#2145CF";
  if (type === "Others") return "#A1A4A9";
  return "#EAB308";
};

const base64ToArrayBuffer = (base64: string) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const cleanBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, "");
  const padding = cleanBase64.endsWith("==") ? 2 : cleanBase64.endsWith("=") ? 1 : 0;
  const byteLength = Math.max(0, Math.floor((cleanBase64.length * 3) / 4) - padding);
  const bytes = new Uint8Array(byteLength);
  let buffer = 0;
  let bits = 0;
  let index = 0;

  for (const char of cleanBase64) {
    if (char === "=") break;
    const value = chars.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8 && index < byteLength) {
      bits -= 8;
      bytes[index] = (buffer >> bits) & 0xff;
      index += 1;
    }
  }

  return bytes;
};

export async function createNativeBroadcastNoMedia({
  address,
  alertType,
  description,
  durationHours,
  images = [],
  isSensitive = false,
  lat,
  lng,
  postOnThreads = false,
  rangeKm,
  title,
}: {
  address: string | null;
  alertType: NativeBroadcastAlertType;
  description: string | null;
  durationHours: number;
  images?: string[];
  isSensitive?: boolean;
  lat: number;
  lng: number;
  postOnThreads?: boolean;
  rangeKm: number;
  title: string | null;
}): Promise<NativeBroadcastCreatePayload> {
  const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
  const rangeMeters = Math.round(rangeKm * 1000);
  const photoUrl = images[0] || null;
  const payload = {
    lat,
    lng,
    type: alertType,
    title: title?.trim() || null,
    description: description?.trim() || null,
    address,
    photo_url: photoUrl,
    images,
    range_meters: rangeMeters,
    expires_at: expiresAt,
    post_on_social: postOnThreads,
    post_on_threads: postOnThreads,
    is_sensitive: isSensitive,
  };

  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown }>)("create_alert_thread_and_pin", { payload });
  if (error) throw error;
  const result = (data || {}) as { alert_id?: string | null; thread_id?: string | null };
  if (!result.alert_id) throw new Error("Broadcast create RPC did not return alert_id");
  return {
    alertId: result.alert_id,
    threadId: result.thread_id ?? null,
    expiresAt,
    rangeMeters,
  };
}

export async function uploadNativeBroadcastImage(userId: string, uri: string, fileName?: string | null, mimeType?: string | null) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error("Selected image is unavailable.");
  const extension = (fileName?.split(".").pop() || mimeType?.split("/").pop() || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
  const objectName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const body = base64ToArrayBuffer(base64);
  if (body.byteLength === 0) throw new Error("Selected image is empty.");
  const { error } = await supabase.storage.from("alerts").upload(objectName, body, {
    contentType: mimeType || "image/jpeg",
  });
  if (error) throw error;
  if (__DEV__) {
    console.log("STORAGE_URL_GET_PUBLIC", { bucket: "alerts", path: objectName });
  }
  const publicUrl = supabase.storage.from("alerts").getPublicUrl(objectName).data.publicUrl || null;
  if (!publicUrl) throw new Error("Upload succeeded but public URL missing.");
  return publicUrl;
}
