import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat, type Action } from "expo-image-manipulator";
import { supabase } from "./supabase";
import { supabaseAnonKey } from "./supabase";
import { registerNativeMediaAsset } from "./nativeMediaAssets";
import { createNativeProtectedActionError, requestNativeStorageCleanupResult } from "./nativeStorageCleanup";
import {
  parseNativeProfileImageStorageRef,
  resolveNativeProfileImageUrlAsync,
} from "./nativeStorageUrlCache";

export type NativeProfilePhotoSlot = "cover" | "establishing" | "pack" | "solo" | "closer";
export type NativeSoloAspect = "1:1" | "4:5" | "16:9";

export type NativeProfilePhotos = {
  cover: string | null;
  establishing: string | null;
  pack: string | null;
  solo: string | null;
  closer: string | null;
  establishing_caption: string | null;
  pack_caption: string | null;
  solo_caption: string | null;
  closer_caption: string | null;
  solo_aspect: NativeSoloAspect | null;
};

export type NativeProfileUploadAsset = {
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  uri?: string | null;
};

export type NativeProfilePhotoCropRect = {
  height: number;
  originX: number;
  originY: number;
  width: number;
};

export type NativeProfilePhotoTransform = {
  rotationDegrees?: number;
  rotatedHeight?: number;
  rotatedWidth?: number;
};

export const NATIVE_PROFILE_PHOTO_SLOTS: NativeProfilePhotoSlot[] = [
  "cover",
  "establishing",
  "pack",
  "solo",
  "closer",
];

export const NATIVE_SOLO_ASPECTS: NativeSoloAspect[] = ["1:1", "4:5", "16:9"];

export const PROFILE_PHOTOS_BUCKET = "profile_photos";
export const LEGACY_PROFILE_PHOTOS_BUCKET = "Profiles";
const LEGACY_AVATARS_BUCKET = "avatars";
const NATIVE_PROFILE_PHOTO_STORAGE_PATH_REGEX = /^(?:profile_photos|Profiles)\/[^/]+\/(?:cover|establishing|pack|solo|closer)-\d+\.(?:webp|jpg)$/;
export const NATIVE_PROFILE_PHOTO_RAW_MAX_BYTES = 25 * 1024 * 1024;
export const NATIVE_PROFILE_PHOTO_FINAL_MAX_BYTES = 1.2 * 1024 * 1024;
export const NATIVE_PROFILE_PHOTO_LONG_EDGE = 1600;

const cleanString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const cleanCaption = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  return value || null;
};

export const emptyNativeProfilePhotos = (): NativeProfilePhotos => ({
  cover: null,
  establishing: null,
  pack: null,
  solo: null,
  closer: null,
  establishing_caption: null,
  pack_caption: null,
  solo_caption: null,
  closer_caption: null,
  solo_aspect: null,
});

export const normalizeNativeSoloAspect = (value: unknown): NativeSoloAspect | null => (
  typeof value === "string" && (NATIVE_SOLO_ASPECTS as string[]).includes(value)
    ? value as NativeSoloAspect
    : null
);

export const curateLegacyNativeProfilePhotos = (
  avatarUrl: string | null | undefined,
  legacyAlbum: string[] | null | undefined,
): NativeProfilePhotos => {
  const album = Array.isArray(legacyAlbum)
    ? legacyAlbum.map(cleanString).filter((item): item is string => Boolean(item))
    : [];

  return {
    cover: cleanString(avatarUrl),
    establishing: album[0] ?? null,
    pack: album[1] ?? null,
    solo: album[2] ?? null,
    closer: album[3] ?? null,
    establishing_caption: null,
    pack_caption: null,
    solo_caption: null,
    closer_caption: null,
    solo_aspect: album[2] ? "4:5" : null,
  };
};

export const normalizeNativeProfilePhotos = (
  value: unknown,
  fallback?: {
    avatarUrl?: string | null;
    socialAlbum?: string[] | null;
  },
): NativeProfilePhotos => {
  const legacy = curateLegacyNativeProfilePhotos(fallback?.avatarUrl ?? null, fallback?.socialAlbum ?? null);
  if (!value || typeof value !== "object" || Array.isArray(value)) return legacy;

  const record = value as Record<string, unknown>;
  const normalized = emptyNativeProfilePhotos();

  for (const slot of NATIVE_PROFILE_PHOTO_SLOTS) {
    normalized[slot] = cleanString(record[slot]) ?? legacy[slot];
  }

  normalized.establishing_caption = cleanCaption(record.establishing_caption);
  normalized.pack_caption = cleanCaption(record.pack_caption);
  normalized.solo_caption = cleanCaption(record.solo_caption);
  normalized.closer_caption = cleanCaption(record.closer_caption);
  normalized.solo_aspect = normalizeNativeSoloAspect(record.solo_aspect) ?? legacy.solo_aspect;

  return normalized;
};

export const isNativeProfilePhotoStoragePath = (value: string | null | undefined): value is string => (
  NATIVE_PROFILE_PHOTO_STORAGE_PATH_REGEX.test(String(value || "").trim())
);

export const isNativePersistableStoragePath = (value: string | null | undefined): boolean => {
  const path = String(value || "").trim();
  if (!path) return false;
  if (/^(blob:|data:|https?:\/\/)/i.test(path)) return false;
  return true;
};

export const isNativePersistableImageUrl = (value: string | null | undefined): boolean => (
  /^https?:\/\//i.test(String(value || "").trim())
);

export const isNativePersistableProfilePhotoValue = (value: string | null | undefined): boolean => {
  if (!value) return true;
  return isNativePersistableStoragePath(value) || isNativePersistableImageUrl(value);
};

export const sanitizeNativeProfilePhotosForDraft = (photos: NativeProfilePhotos): NativeProfilePhotos => ({
  cover: isNativePersistableProfilePhotoValue(photos.cover) ? photos.cover : null,
  establishing: isNativePersistableProfilePhotoValue(photos.establishing) ? photos.establishing : null,
  pack: isNativePersistableProfilePhotoValue(photos.pack) ? photos.pack : null,
  solo: isNativePersistableProfilePhotoValue(photos.solo) ? photos.solo : null,
  closer: isNativePersistableProfilePhotoValue(photos.closer) ? photos.closer : null,
  establishing_caption: photos.establishing_caption,
  pack_caption: photos.pack_caption,
  solo_caption: photos.solo_caption,
  closer_caption: photos.closer_caption,
  solo_aspect: photos.solo_aspect,
});

export const hasAnyNativeProfilePhoto = (photos: NativeProfilePhotos) => (
  NATIVE_PROFILE_PHOTO_SLOTS.some((slot) => Boolean(photos[slot]))
);

const publicStorageUrlCache = new Map<string, string | null>();

export const clearNativeProfilePhotoPublicUrlCache = (bucket?: string, path?: string) => {
  if (!bucket && !path) {
    publicStorageUrlCache.clear();
    return;
  }
  const prefix = bucket ? `${bucket}:` : "";
  for (const key of publicStorageUrlCache.keys()) {
    if (bucket && path && key === `${bucket}:${path}`) publicStorageUrlCache.delete(key);
    else if (bucket && !path && key.startsWith(prefix)) publicStorageUrlCache.delete(key);
  }
};

const publicStorageUrl = (bucket: string, path: string) => {
  const cacheKey = `${bucket}:${path}`;
  if (publicStorageUrlCache.has(cacheKey)) {
    return publicStorageUrlCache.get(cacheKey) ?? null;
  }

  if (__DEV__) {
    console.log("STORAGE_URL_GET_PUBLIC", { bucket, path });
  }

  const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl || null;
  publicStorageUrlCache.set(cacheKey, publicUrl);
  return publicUrl;
};

export const getNativeProfilePhotoPublicUrl = (value: string | null | undefined): string | null => {
  const cleanValue = cleanString(value);
  if (!cleanValue) return null;
  if (/^https?:\/\//i.test(cleanValue) || cleanValue.startsWith("data:") || cleanValue.startsWith("blob:")) {
    return cleanValue;
  }
  const ref = parseNativeProfileImageStorageRef(cleanValue, { defaultBucket: "profile_photos" });
  if (ref?.kind === "storage" && ref.bucket === PROFILE_PHOTOS_BUCKET) return publicStorageUrl(PROFILE_PHOTOS_BUCKET, ref.objectPath);
  return cleanValue;
};

export const resolveNativeProfilePhotoDisplayUrl = async (
  value: string | null | undefined,
  ttlSeconds = 60 * 60,
): Promise<string | null> => {
  const cleanValue = cleanString(value);
  if (!cleanValue) return null;
  if (cleanValue.startsWith("data:") || cleanValue.startsWith("blob:")) {
    return cleanValue;
  }

  return resolveNativeProfileImageUrlAsync(cleanValue, ttlSeconds, { defaultBucket: "profile_photos" });
};

export const resolveNativeProfilePhotos = async (photos: NativeProfilePhotos) => {
  const entries = await Promise.all(
    NATIVE_PROFILE_PHOTO_SLOTS.map(async (slot) => [slot, await resolveNativeProfilePhotoDisplayUrl(photos[slot])] as const),
  );
  return entries.reduce<Record<NativeProfilePhotoSlot, string | null>>(
    (acc, [slot, url]) => ({ ...acc, [slot]: url }),
    { cover: null, establishing: null, pack: null, solo: null, closer: null },
  );
};

export const getNativeProfilePhotoUploadPath = (
  userId: string,
  slot: NativeProfilePhotoSlot,
  extension = "jpg",
) => `${PROFILE_PHOTOS_BUCKET}/${userId}/${slot}-${Date.now()}.${extension}`;

export const validateNativeProfilePhotoAsset = (asset: NativeProfileUploadAsset) => {
  const size = typeof asset.fileSize === "number" ? asset.fileSize : 0;
  if (size > NATIVE_PROFILE_PHOTO_RAW_MAX_BYTES) {
    return "That file's too big. Try a photo under 25MB.";
  }
  const mime = String(asset.mimeType || "").toLowerCase();
  if (mime && !["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"].includes(mime)) {
    return "That file type's not supported. Try JPG, PNG, or HEIC.";
  }
  if (!asset.uri) return "That file type's not supported. Try JPG, PNG, or HEIC.";
  return null;
};

const extensionForAsset = (asset: NativeProfileUploadAsset) => {
  const mime = String(asset.mimeType || "").toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  const fromName = String(asset.fileName || asset.uri || "").split(".").pop()?.split("?")[0]?.toLowerCase();
  if (fromName && ["jpg", "jpeg", "png", "webp"].includes(fromName)) return fromName === "jpeg" ? "jpg" : fromName;
  return "jpg";
};

const clampCropRect = (
  crop: NativeProfilePhotoCropRect,
  imageWidth: number,
  imageHeight: number,
) => {
  const width = Math.min(Math.max(1, Math.round(crop.width)), imageWidth);
  const height = Math.min(Math.max(1, Math.round(crop.height)), imageHeight);
  const originX = Math.min(Math.max(0, Math.round(crop.originX)), Math.max(0, imageWidth - width));
  const originY = Math.min(Math.max(0, Math.round(crop.originY)), Math.max(0, imageHeight - height));
  return { originX, originY, width, height };
};

const getFileSize = async (uri: string) => {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && typeof info.size === "number" ? info.size : null;
};

export const normalizeNativeProfilePhotoAsset = async (
  asset: NativeProfileUploadAsset & { height?: number | null; width?: number | null },
  crop: NativeProfilePhotoCropRect,
  transform: NativeProfilePhotoTransform = {},
): Promise<NativeProfileUploadAsset> => {
  const validation = validateNativeProfilePhotoAsset(asset);
  if (validation) throw new Error(validation);

  const imageWidth = typeof asset.width === "number" && asset.width > 0 ? asset.width : null;
  const imageHeight = typeof asset.height === "number" && asset.height > 0 ? asset.height : null;
  if (!imageWidth || !imageHeight) {
    throw new Error("Couldn't read that photo. Try another image.");
  }

  const rotationDegrees = typeof transform.rotationDegrees === "number" ? transform.rotationDegrees : 0;
  const rotatedWidth = typeof transform.rotatedWidth === "number" && transform.rotatedWidth > 0 ? transform.rotatedWidth : imageWidth;
  const rotatedHeight = typeof transform.rotatedHeight === "number" && transform.rotatedHeight > 0 ? transform.rotatedHeight : imageHeight;
  const safeCrop = clampCropRect(crop, rotatedWidth, rotatedHeight);
  const resizeScale = Math.min(1, NATIVE_PROFILE_PHOTO_LONG_EDGE / Math.max(safeCrop.width, safeCrop.height));
  const resizeWidth = Math.max(1, Math.round(safeCrop.width * resizeScale));
  const resizeHeight = Math.max(1, Math.round(safeCrop.height * resizeScale));
  const actions: Action[] = [
    ...(Math.abs(rotationDegrees) > 0.1 ? [{ rotate: rotationDegrees } as Action] : []),
    { crop: safeCrop },
    { resize: { width: resizeWidth, height: resizeHeight } },
  ];

  const qualities = [0.82, 0.72, 0.62, 0.52];
  try {
    for (const quality of qualities) {
      const result = await manipulateAsync(asset.uri as string, actions, {
        compress: quality,
        format: SaveFormat.WEBP,
      });
      const size = await getFileSize(result.uri);
      if (!size || size <= NATIVE_PROFILE_PHOTO_FINAL_MAX_BYTES || quality === qualities[qualities.length - 1]) {
        return {
          uri: result.uri,
          fileName: "profile-photo.webp",
          fileSize: size,
          mimeType: "image/webp",
        };
      }
    }
  } catch {
    const result = await manipulateAsync(asset.uri as string, actions, {
      compress: 0.85,
      format: SaveFormat.JPEG,
    });
    return {
      uri: result.uri,
      fileName: "profile-photo.jpg",
      fileSize: await getFileSize(result.uri),
      mimeType: "image/jpeg",
    };
  }

  throw new Error("profile_photo_normalize_failed");
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  return bytes.buffer;
};

const shouldRetryStorageUpload = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return true;
  const status = Number((error as { statusCode?: unknown; status?: unknown }).statusCode ?? (error as { status?: unknown }).status);
  return ![401, 403, 409].includes(status);
};

export const uploadNativeProfilePhotoAsset = async (
  userId: string,
  slot: NativeProfilePhotoSlot,
  asset: NativeProfileUploadAsset,
  accessToken?: string | null,
) => {
  const cleanAccessToken = cleanString(accessToken);
  if (!cleanAccessToken) throw new Error("Please sign in again to upload photos.");
  const validation = validateNativeProfilePhotoAsset(asset);
  if (validation) throw new Error(validation);
  const uri = asset.uri as string;
  const extension = extensionForAsset(asset);
  const path = getNativeProfilePhotoUploadPath(userId, slot, extension);
  const objectPath = path.replace(/^profile_photos\/+/i, "");
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const body = base64ToArrayBuffer(base64);
  const contentType = asset.mimeType || (extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg");
  let lastError: unknown = null;
  const retryDelays = [250, 1000];
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    const { error } = await supabase.storage.from(PROFILE_PHOTOS_BUCKET).upload(objectPath, body, {
      contentType,
      headers: { Authorization: `Bearer ${cleanAccessToken}`, apikey: supabaseAnonKey },
      upsert: false,
    });
    if (!error) {
      try {
        await registerNativeMediaAsset({
          accessToken: cleanAccessToken,
          bucket: PROFILE_PHOTOS_BUCKET,
          contentType: "profile_photo",
          objectPath,
        });
      } catch (registrationError) {
        const cleanupResult = await requestNativeStorageCleanupResult(PROFILE_PHOTOS_BUCKET, objectPath, "profile_photo_registration_failed", cleanAccessToken);
        throw createNativeProtectedActionError({
          ok: false,
          stage: "register",
          originalError: registrationError instanceof Error ? registrationError : new Error("profile_photo_registration_failed"),
          cleanupAttempted: true,
          cleanupResult,
        });
      }
      return path;
    }
    lastError = error;
    if (!shouldRetryStorageUpload(error)) break;
    const retryDelay = retryDelays[attempt];
    if (retryDelay) await delay(retryDelay);
  }
  throw createNativeProtectedActionError({
    ok: false,
    stage: "upload",
    originalError: lastError instanceof Error ? lastError : new Error("profile_photo_upload_failed"),
    cleanupAttempted: false,
    cleanupResult: "not_needed",
  });
};

export const deleteNativeProfilePhotoPath = async (path: string | null | undefined) => {
  const cleanPath = cleanString(path);
  if (!cleanPath) return;
  if (cleanPath.startsWith(`${PROFILE_PHOTOS_BUCKET}/`)) {
    const cleanupResult = await requestNativeStorageCleanupResult(PROFILE_PHOTOS_BUCKET, cleanPath.replace(/^profile_photos\//, ""), "delete_profile_photo");
    if (cleanupResult === "failed") {
      throw createNativeProtectedActionError({
        ok: false,
        stage: "delete",
        originalError: new Error("profile_photo_delete_cleanup_failed"),
        cleanupAttempted: true,
        cleanupResult,
      });
    }
    return;
  }
  if (cleanPath.startsWith(`${LEGACY_PROFILE_PHOTOS_BUCKET}/`)) {
    const cleanupResult = await requestNativeStorageCleanupResult(PROFILE_PHOTOS_BUCKET, cleanPath.replace(/^Profiles\//, ""), "delete_profile_photo");
    if (cleanupResult === "failed") {
      throw createNativeProtectedActionError({
        ok: false,
        stage: "delete",
        originalError: new Error("legacy_profile_photo_delete_cleanup_failed"),
        cleanupAttempted: true,
        cleanupResult,
      });
    }
  }
};
