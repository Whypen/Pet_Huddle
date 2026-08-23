import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat, type Action } from "expo-image-manipulator";
import { supabase, supabaseUrl } from "./supabase";
import { createNativeProtectedActionError, requestNativeStorageCleanupResult, type NativeProtectedActionStage } from "./nativeStorageCleanup";
import { createFreshNativeFunctionHeaders, getFreshNativeAccessToken, refreshNativeSessionOnce } from "./nativeFunctionClient";
import { fetchNativeResponseWithTimeout, NATIVE_MEDIA_UPLOAD_TIMEOUT_MS } from "./nativeTimeout";
import {
  parseNativeProfileImageStorageRef,
  resolveNativeProfileImageUrlAsync,
} from "./nativeStorageUrlCache";

export type NativeProfilePhotoSlot = "cover" | "establishing" | "pack" | "solo" | "closer";
export type NativeSoloAspect = "1:1" | "4:5" | "16:9";
export type NativeProfilePhotoPresentationCrop = { centerX: number; centerY: number; widthPct: number; sourceAspect?: number };

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
  avatar_presentation: NativeProfilePhotoPresentationCrop | null;
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
const NATIVE_PROFILE_PHOTO_STORAGE_PATH_REGEX = /^profile_photos\/[^/]+\/(?:cover|establishing|pack|solo|closer)(?:-[A-Za-z0-9][A-Za-z0-9_-]*)?\.(?:webp|jpg|jpeg|png)$/;
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
  avatar_presentation: null,
});

export const normalizeNativeProfilePhotoPresentationCrop = (value: unknown): NativeProfilePhotoPresentationCrop | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const centerX = Number(record.centerX);
  const centerY = Number(record.centerY);
  const widthPct = Number(record.widthPct);
  if (![centerX, centerY, widthPct].every(Number.isFinite)) return null;
  const sourceAspect = Number(record.sourceAspect);
  return {
    centerX: Math.min(Math.max(centerX, 0), 100),
    centerY: Math.min(Math.max(centerY, 0), 100),
    widthPct: Math.min(Math.max(widthPct, 1), 100),
    ...(Number.isFinite(sourceAspect) && sourceAspect > 0 ? { sourceAspect } : {}),
  };
};

export const normalizeNativeSoloAspect = (value: unknown): NativeSoloAspect | null => (
  typeof value === "string" && (NATIVE_SOLO_ASPECTS as string[]).includes(value)
    ? value as NativeSoloAspect
    : null
);

export const curateLegacyNativeProfilePhotos = (
  avatarUrl: string | null | undefined,
  legacyAlbum: string[] | null | undefined,
): NativeProfilePhotos => {
  const cleanAvatarUrl = cleanString(avatarUrl);
  const album = Array.isArray(legacyAlbum)
    ? legacyAlbum.map(cleanString).filter((item): item is string => Boolean(item))
      .filter((item) => item !== cleanAvatarUrl)
    : [];

  return {
    cover: cleanAvatarUrl,
    establishing: album[0] ?? null,
    pack: album[1] ?? null,
    solo: album[2] ?? null,
    closer: album[3] ?? null,
    establishing_caption: null,
    pack_caption: null,
    solo_caption: null,
    closer_caption: null,
    solo_aspect: album[2] ? "4:5" : null,
    avatar_presentation: null,
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
  normalized.avatar_presentation = normalizeNativeProfilePhotoPresentationCrop(record.avatar_presentation);

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
  avatar_presentation: normalizeNativeProfilePhotoPresentationCrop(photos.avatar_presentation),
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

export const validateNativeProfilePhotoAsset = (asset: NativeProfileUploadAsset) => {
  const size = typeof asset.fileSize === "number" && Number.isFinite(asset.fileSize) && asset.fileSize > 0 ? asset.fileSize : null;
  if (!size) {
    return "Couldn't verify that photo's size. Try another image.";
  }
  if (size > NATIVE_PROFILE_PHOTO_RAW_MAX_BYTES) {
    return "That file's too big. Try a photo under 25MB.";
  }
  const mime = String(asset.mimeType || "").toLowerCase();
  const supportedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
  const extension = String(asset.fileName || asset.uri || "").split(".").pop()?.split("?")[0]?.toLowerCase() ?? "";
  const supportedExtensions = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
  if ((mime && !supportedMimes.includes(mime)) || (!mime && extension && !supportedExtensions.includes(extension))) {
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

const deleteNativeProfilePhotoTemporaryFile = async (uri: string | null | undefined) => {
  const cleanUri = cleanString(uri);
  if (!cleanUri || !cleanUri.startsWith("file://")) return;
  await FileSystem.deleteAsync(cleanUri, { idempotent: true }).catch(() => undefined);
};

export const cleanupNativeProfilePhotoTemporaryAsset = async (asset: NativeProfileUploadAsset | null | undefined) => {
  const fileName = cleanString(asset?.fileName);
  if (!fileName || !/^(?:profile-photo\.(?:webp|jpe?g)|huddle-photo-edit-\d+\.(?:webp|jpe?g|png|heic|heif))$/i.test(fileName)) return;
  await deleteNativeProfilePhotoTemporaryFile(asset?.uri);
};

export const isNativeProfilePhotoFinalSizeAllowed = (size: number | null | undefined) => (
  typeof size === "number" && Number.isFinite(size) && size > 0 && size <= NATIVE_PROFILE_PHOTO_FINAL_MAX_BYTES
);

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
  const qualities = [0.82, 0.68, 0.54, 0.4];
  const outputScales = [1, 0.8, 0.6];
  const formats = [
    { extension: "webp", format: SaveFormat.WEBP, mimeType: "image/webp" },
    { extension: "jpg", format: SaveFormat.JPEG, mimeType: "image/jpeg" },
  ] as const;
  for (const outputScale of outputScales) {
    const actions: Action[] = [
      ...(Math.abs(rotationDegrees) > 0.1 ? [{ rotate: rotationDegrees } as Action] : []),
      { crop: safeCrop },
      { resize: {
        width: Math.max(1, Math.round(resizeWidth * outputScale)),
        height: Math.max(1, Math.round(resizeHeight * outputScale)),
      } },
    ];
    for (const output of formats) {
      for (const quality of qualities) {
        try {
          const result = await manipulateAsync(asset.uri as string, actions, {
            compress: quality,
            format: output.format,
          });
          const finalSize = await getFileSize(result.uri);
          if (!isNativeProfilePhotoFinalSizeAllowed(finalSize)) {
            await deleteNativeProfilePhotoTemporaryFile(result.uri);
            continue;
          }
          return {
            uri: result.uri,
            fileName: `profile-photo.${output.extension}`,
            fileSize: finalSize,
            mimeType: output.mimeType,
          };
        } catch {
          // Try the next quality/format/size. No candidate is returned without a
          // verified file size at or below the client upload ceiling.
        }
      }
    }
  }

  throw new Error("Couldn't make that photo small enough to upload. Try a different image.");
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const cleanAccessToken = await getFreshNativeAccessToken(accessToken);
  if (!cleanAccessToken) throw new Error("Please sign in again to upload photos.");
  const validation = validateNativeProfilePhotoAsset(asset);
  if (validation) throw new Error(validation);
  const uri = asset.uri as string;
  try {
    const extension = extensionForAsset(asset);
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const contentType = asset.mimeType || (extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg");
    let activeAccessToken = cleanAccessToken;
    let lastError: unknown = null;
    const retryDelays = [250, 1000];
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      const response = await fetchNativeResponseWithTimeout(`${supabaseUrl}/functions/v1/native-profile-photo-upload`, {
      method: "POST",
      headers: await createFreshNativeFunctionHeaders(activeAccessToken, { functionName: "native-profile-photo-upload", routeToken: cleanAccessToken }),
      body: JSON.stringify({
        extension,
        file_base64: base64,
        mime_type: contentType,
        slot,
      }),
    }, NATIVE_MEDIA_UPLOAD_TIMEOUT_MS);
      if (response.ok) {
        const payload = await response.json().catch(() => null) as { data?: { path?: string } } | null;
        const uploadedPath = String(payload?.data?.path || "").trim();
        if (uploadedPath) return uploadedPath;
        throw new Error("profile_photo_upload_missing_path");
      }
      const parsed = await response.json().catch(() => null) as { error?: string; stage?: NativeProtectedActionStage } | null;
      const raw = parsed?.error || `profile_photo_upload_failed_${response.status}`;
      lastError = new Error(raw);
      (lastError as Error & { status?: number }).status = response.status;
      if (response.status === 401 && attempt === 0) {
        const refreshed = await refreshNativeSessionOnce().then((session) => session?.access_token || "").catch(() => "");
        if (refreshed) {
          activeAccessToken = refreshed;
          continue;
        }
      }
      if (!shouldRetryStorageUpload(lastError)) break;
      const retryDelay = retryDelays[attempt];
      if (retryDelay) await delay(retryDelay);
    }
    throw createNativeProtectedActionError({
      ok: false,
      stage: "upload",
      userMessage: "We couldn't upload your profile photo. Please check the photo and try again.",
      originalError: lastError instanceof Error ? lastError : new Error("profile_photo_upload_failed"),
      cleanupAttempted: false,
      cleanupResult: "not_needed",
    });
  } catch (error) {
    await cleanupNativeProfilePhotoTemporaryAsset(asset);
    throw error;
  }
};

export const deleteNativeProfilePhotoPath = async (path: string | null | undefined, accessToken?: string | null) => {
  const cleanPath = cleanString(path);
  if (!cleanPath) return;
  if (cleanPath.startsWith(`${PROFILE_PHOTOS_BUCKET}/`)) {
    const cleanupResult = await requestNativeStorageCleanupResult(PROFILE_PHOTOS_BUCKET, cleanPath.replace(/^profile_photos\//, ""), "delete_profile_photo", accessToken);
    if (cleanupResult === "failed") {
      console.warn("[native.profilePhotos] profile_photo_delete_cleanup_failed", {
        cleanupResult,
        path: cleanPath,
      });
    }
    return;
  }
};
