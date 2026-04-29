import {
  PROFILE_PHOTO_SLOTS,
  SOLO_ASPECTS,
  type ProfilePhotoSlot,
  type ProfilePhotos,
  type SoloAspect,
} from "@/types/profilePhotos";
import { supabase } from "@/integrations/supabase/client";
import heic2any from "heic2any";

export const PROFILE_PHOTOS_BUCKET = "Profiles";
export const PROFILE_PHOTO_RAW_MAX_BYTES = 25 * 1024 * 1024;
export const PROFILE_PHOTO_FINAL_MAX_BYTES = 1.2 * 1024 * 1024;
export const PROFILE_PHOTO_LONG_EDGE = 1600;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export const emptyProfilePhotos = (): ProfilePhotos => ({
  cover: null,
  establishing: null,
  pack: null,
  solo: null,
  closer: null,
  cover_caption: null,
  establishing_caption: null,
  pack_caption: null,
  solo_caption: null,
  closer_caption: null,
  solo_aspect: null,
});

const cleanString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

export const normalizeSoloAspect = (value: unknown): SoloAspect | null => {
  return typeof value === "string" && (SOLO_ASPECTS as string[]).includes(value)
    ? (value as SoloAspect)
    : null;
};

export const curateLegacyProfilePhotos = (
  avatarUrl: string | null | undefined,
  legacyAlbum: string[] | null | undefined,
): ProfilePhotos => {
  const album = Array.isArray(legacyAlbum)
    ? legacyAlbum.map(cleanString).filter((item): item is string => Boolean(item))
    : [];

  return {
    cover: cleanString(avatarUrl),
    establishing: album[0] ?? null,
    pack: album[1] ?? null,
    solo: album[2] ?? null,
    closer: album[3] ?? null,
    cover_caption: null,
    establishing_caption: null,
    pack_caption: null,
    solo_caption: null,
    closer_caption: null,
    solo_aspect: album[2] ? "4:5" : null,
  };
};

export const normalizeProfilePhotos = (
  value: unknown,
  fallback?: {
    avatarUrl?: string | null;
    socialAlbum?: string[] | null;
  },
): ProfilePhotos => {
  const legacy = curateLegacyProfilePhotos(fallback?.avatarUrl ?? null, fallback?.socialAlbum ?? null);
  if (!value || typeof value !== "object" || Array.isArray(value)) return legacy;

  const record = value as Record<string, unknown>;
  const normalized = emptyProfilePhotos();

  for (const slot of PROFILE_PHOTO_SLOTS) {
    normalized[slot] = cleanString(record[slot]) ?? legacy[slot];
  }

  normalized.cover_caption = cleanString(record.cover_caption);
  normalized.establishing_caption = cleanString(record.establishing_caption);
  normalized.pack_caption = cleanString(record.pack_caption);
  normalized.solo_caption = cleanString(record.solo_caption);
  normalized.closer_caption = cleanString(record.closer_caption);
  normalized.solo_aspect = normalizeSoloAspect(record.solo_aspect) ?? legacy.solo_aspect;

  return normalized;
};

export const hasAnyProfilePhoto = (photos: ProfilePhotos): boolean => {
  return PROFILE_PHOTO_SLOTS.some((slot) => Boolean(photos[slot]));
};

const inferMime = (file: File): string => {
  const explicit = String(file.type || "").toLowerCase();
  if (explicit) return explicit;
  const name = file.name.toLowerCase();
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return "";
};

export const validateProfilePhotoFile = (file: File): string | null => {
  const mime = inferMime(file);
  if (file.size > PROFILE_PHOTO_RAW_MAX_BYTES) {
    return "That file's too big. Try a photo under 25MB.";
  }
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    return "That file type's not supported. Try JPG, PNG, or HEIC.";
  }
  return null;
};

export const prepareProfilePhotoFile = async (file: File): Promise<Blob> => {
  const mime = inferMime(file);
  if (mime !== "image/heic" && mime !== "image/heif") return file;
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });
  return Array.isArray(converted) ? converted[0] : converted;
};

export const getProfilePhotoUploadPath = (
  userId: string,
  slot: ProfilePhotoSlot,
  extension = "webp",
): string => `Profiles/${userId}/${slot}-${Date.now()}.${extension}`;

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export const uploadProfilePhotoBlob = async (
  userId: string,
  slot: ProfilePhotoSlot,
  blob: Blob,
): Promise<string> => {
  const extension = blob.type === "image/jpeg" ? "jpg" : "webp";
  const path = getProfilePhotoUploadPath(userId, slot, extension);
  let lastError: unknown = null;
  const retryDelays = [250, 1000];
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    const { error } = await supabase.storage
      .from(PROFILE_PHOTOS_BUCKET)
      .upload(path, blob, {
        contentType: blob.type || "image/webp",
        upsert: false,
      });
    if (!error) return path;
    lastError = error;
    const retryDelay = retryDelays[attempt];
    if (retryDelay) await delay(retryDelay);
  }
  throw lastError instanceof Error ? lastError : new Error("profile_photo_upload_failed");
};

export const deleteProfilePhotoPath = async (path: string | null | undefined): Promise<void> => {
  const cleanPath = cleanString(path);
  if (!cleanPath) return;
  await supabase.storage.from(PROFILE_PHOTOS_BUCKET).remove([cleanPath]);
};

export const resolveProfilePhotoDisplayUrl = async (
  value: string | null | undefined,
  ttlSeconds = 60 * 60,
): Promise<string | null> => {
  const cleanValue = cleanString(value);
  if (!cleanValue) return null;
  if (cleanValue.startsWith("data:") || cleanValue.startsWith("blob:") || /^https?:\/\//i.test(cleanValue)) {
    return cleanValue;
  }

  const profileSigned = await supabase.storage.from(PROFILE_PHOTOS_BUCKET).createSignedUrl(cleanValue, ttlSeconds);
  if (profileSigned.data?.signedUrl) return profileSigned.data.signedUrl;

  const legacySigned = await supabase.storage.from("social_album").createSignedUrl(cleanValue, ttlSeconds);
  if (legacySigned.data?.signedUrl) return legacySigned.data.signedUrl;

  return null;
};
