import { supabase } from "./supabase";
import { fetchWithNativeTimeout, withNativeTimeout } from "./nativeTimeout";

const SIGNED_URL_CREATE_TIMEOUT_MS = 6000;
const PUBLIC_URL_HEAD_CHECK_TIMEOUT_MS = 3000;

const signedUrlCache = new Map<string, { value: string | null; expiresAt: number }>();
const inFlightSignedUrlRequests = new Map<string, Promise<string | null>>();
const publicProfilePhotoUrlCache = new Map<string, string | null>();
const publicProfilePhotoUrlInFlight = new Map<string, Promise<string | null>>();

const cacheKey = (bucket: string, path: string) => `${bucket}:${path}`;

const normalizeTtlSeconds = (ttlSeconds: number) => Math.max(30, Math.floor(ttlSeconds));

const cacheLifetimeMs = (ttlSeconds: number) => {
  const ttlMs = normalizeTtlSeconds(ttlSeconds) * 1000;
  return Math.max(5_000, Math.min(ttlMs, 60 * 60 * 1000));
};

export const resetSignedStorageCache = () => {
  signedUrlCache.clear();
  inFlightSignedUrlRequests.clear();
  publicProfilePhotoUrlCache.clear();
  publicProfilePhotoUrlInFlight.clear();
};

export const invalidateCachedSignedStorageUrl = (bucket?: string | null, path?: string | null) => {
  const cleanBucket = String(bucket || "").trim();
  const cleanPath = String(path || "").trim().replace(/^\/+/, "");
  if (!cleanBucket && !cleanPath) {
    resetSignedStorageCache();
    return;
  }
  const exactKey = cleanBucket && cleanPath ? cacheKey(cleanBucket, cleanPath) : null;
  const prefix = cleanBucket ? `${cleanBucket}:` : "";
  for (const key of Array.from(signedUrlCache.keys())) {
    if (exactKey ? key === exactKey : key.startsWith(prefix)) signedUrlCache.delete(key);
  }
  for (const key of Array.from(inFlightSignedUrlRequests.keys())) {
    if (exactKey ? key === exactKey : key.startsWith(prefix)) inFlightSignedUrlRequests.delete(key);
  }
};

export const getCachedSignedStorageUrl = async (bucket: string, path: string, ttlSeconds: number): Promise<string | null> => {
  const cleanBucket = String(bucket || "").trim();
  const cleanPath = String(path || "").trim();
  if (!cleanBucket || !cleanPath) return null;

  const ttl = normalizeTtlSeconds(ttlSeconds);
  const key = cacheKey(cleanBucket, cleanPath);
  const now = Date.now();

  const cached = signedUrlCache.get(key);
  if (cached && cached.expiresAt > now) {
    if (__DEV__) {
      console.log("STORAGE_URL_HIT", {
        bucket: cleanBucket,
        path: cleanPath,
        ttl: ttl,
        expiresAt: cached.expiresAt,
        cacheTtlSeconds: cacheLifetimeMs(ttl),
      });
    }
    return cached.value;
  }

  if (cached) {
    if (__DEV__) {
      console.log("STORAGE_URL_MISS", {
        bucket: cleanBucket,
        path: cleanPath,
        ttl: ttl,
        reason: cached.expiresAt <= now ? "expired" : "cache_invalidation",
      });
    }
  } else if (__DEV__) {
    console.log("STORAGE_URL_MISS", {
      bucket: cleanBucket,
      path: cleanPath,
      ttl: ttl,
      reason: "cold",
    });
  }

  const inFlight = inFlightSignedUrlRequests.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    if (__DEV__) {
      console.log("STORAGE_URL_CREATE_SIGNED", {
        bucket: cleanBucket,
        path: cleanPath,
        ttl: ttl,
      });
    }
    // A stalled connection here (nw_read_request_report "Operation timed out")
    // must reject rather than hang forever, or every caller sharing this
    // in-flight promise (inFlightSignedUrlRequests) is wedged permanently —
    // this was the root cause of Chats' forever-loading spinner.
    const createSignedUrlPromise = supabase.storage.from(cleanBucket).createSignedUrl(cleanPath, ttl);
    const { data, error } = await withNativeTimeout(
      createSignedUrlPromise,
      SIGNED_URL_CREATE_TIMEOUT_MS,
      { data: null, error: new Error("signed_url_timeout") } as Awaited<typeof createSignedUrlPromise>,
    );
    if (error) throw error;
    const value = data?.signedUrl ?? null;
    signedUrlCache.set(key, { value, expiresAt: now + cacheLifetimeMs(ttl) });
    if (__DEV__) {
      console.log("STORAGE_URL_CREATE_SIGNED_SUCCESS", {
        bucket: cleanBucket,
        path: cleanPath,
        ttl: ttl,
        hasValue: Boolean(value),
      });
    }
    return value;
  })();

  inFlightSignedUrlRequests.set(key, promise);
  promise.finally(() => {
    inFlightSignedUrlRequests.delete(key);
  });

  return promise;
};

export const resolveNativeStoragePublicUrl = (bucket: string, value: unknown): string | null => {
  const cleanBucket = String(bucket || "").trim();
  const raw = typeof value === "string" ? value.trim() : "";
  if (!cleanBucket || !raw) return null;

  const publicMarker = `/storage/v1/object/public/${cleanBucket}/`;
  const markerIndex = raw.indexOf(publicMarker);
  if (/^https?:\/\//i.test(raw) && markerIndex < 0) return raw;
  const path = markerIndex >= 0
    ? raw.slice(markerIndex + publicMarker.length)
    : raw.replace(/^\/+/, "").replace(new RegExp(`^${cleanBucket}/`), "");

  if (!path || path.includes("..")) return null;
  const { data } = supabase.storage.from(cleanBucket).getPublicUrl(path);
  return data.publicUrl || null;
};

export type NativeProfileImageStorageBucket = "profile_photos";
export type NativePetImageStorageBucket = "pets" | "private_pet_photos";

export type NativeProfileImageStorageRef =
  | { kind: "external"; url: string }
  | { kind: "storage"; bucket: NativeProfileImageStorageBucket; objectPath: string; sourceHadBucketPrefix?: boolean };

export type NativePetImageStorageRef =
  | { kind: "external"; url: string }
  | { kind: "storage"; bucket: NativePetImageStorageBucket; objectPath: string; sourceUrl?: string; sourceVisibility?: "public" | "signed" };

export type NativeProfileImageResolverOptions = {
  defaultBucket?: NativeProfileImageStorageBucket;
};

const PROFILE_IMAGE_BUCKETS: NativeProfileImageStorageBucket[] = ["profile_photos"];

const sanitizeNativeStoragePath = (value: string) => {
  try {
    return decodeURIComponent(String(value || "").split("#")[0].split("?")[0]).replace(/^\/+/, "");
  } catch {
    return String(value || "").split("#")[0].split("?")[0].replace(/^\/+/, "");
  }
};

const stripNativeBucketPrefix = (value: string, bucket: string) => (
  value.replace(new RegExp(`^${bucket}/+`, "i"), "")
);

const getNativeStoragePublicUrlForObjectPath = (bucket: string, objectPath: string): string | null => {
  const cleanBucket = String(bucket || "").trim();
  const cleanPath = String(objectPath || "").trim().replace(/^\/+/, "");
  if (!cleanBucket || !cleanPath || cleanPath.includes("..")) return null;
  const { data } = supabase.storage.from(cleanBucket).getPublicUrl(cleanPath);
  return data.publicUrl || null;
};

export const parseNativeProfileImageStorageRef = (
  value: unknown,
  options: NativeProfileImageResolverOptions = {},
): NativeProfileImageStorageRef | null => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.includes("..")) return null;
  if (/^(data:|blob:)/i.test(raw)) return { kind: "external", url: raw };
  const defaultBucket = options.defaultBucket ?? "profile_photos";

  if (/^https?:\/\//i.test(raw)) {
    try {
      const pathname = decodeURIComponent(new URL(raw).pathname || "");
      const legacyMatch = pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/(?:Profiles|social_album)\/(.+)$/);
      if (legacyMatch) return null;
      const match = pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/(profile_photos)\/(.+)$/);
      if (!match?.[1] || !match?.[2]) return { kind: "external", url: raw };
      const bucket = match[1] as NativeProfileImageStorageBucket;
      const objectPath = sanitizeNativeStoragePath(match[2]);
      return objectPath && !objectPath.includes("..") ? { kind: "storage", bucket, objectPath: stripNativeBucketPrefix(objectPath, bucket), sourceHadBucketPrefix: true } : null;
    } catch {
      return { kind: "external", url: raw };
    }
  }

  const path = sanitizeNativeStoragePath(raw);
  if (/^(Profiles|social_album|social-album)\//i.test(path)) return null;
  const bucket = PROFILE_IMAGE_BUCKETS.find((candidate) => path.toLowerCase().startsWith(`${candidate.toLowerCase()}/`));
  if (bucket) {
    const objectPath = stripNativeBucketPrefix(path, bucket);
    return objectPath && !objectPath.includes("..") ? { kind: "storage", bucket, objectPath, sourceHadBucketPrefix: true } : null;
  }
  return path && !path.includes("..") ? { kind: "storage", bucket: defaultBucket, objectPath: path } : null;
};

export const parseNativePetImageStorageRef = (value: unknown): NativePetImageStorageRef | null => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.includes("..")) return null;
  if (/^(data:|blob:|file:|content:)/i.test(raw)) return { kind: "external", url: raw };

  if (/^https?:\/\//i.test(raw)) {
    try {
      const pathname = decodeURIComponent(new URL(raw).pathname || "");
      const match = pathname.match(/\/storage\/v1\/object\/(public|sign)\/(pets|private_pet_photos)\/(.+)$/i);
      if (!match?.[1] || !match?.[2]) return { kind: "external", url: raw };
      const bucket = match[2].toLowerCase() as NativePetImageStorageBucket;
      const objectPath = sanitizeNativeStoragePath(match[3]);
      return objectPath && !objectPath.includes("..")
        ? { kind: "storage", bucket, objectPath: stripNativeBucketPrefix(objectPath, bucket), sourceUrl: raw, sourceVisibility: match[1].toLowerCase() === "public" ? "public" : "signed" }
        : null;
    } catch {
      return { kind: "external", url: raw };
    }
  }

  const path = sanitizeNativeStoragePath(raw);
  const bucket: NativePetImageStorageBucket = path.toLowerCase().startsWith("private_pet_photos/") ? "private_pet_photos" : "pets";
  const objectPath = stripNativeBucketPrefix(path, bucket);
  return objectPath && !objectPath.includes("..") ? { kind: "storage", bucket, objectPath } : null;
};

const publicUrlExists = async (url: string) => {
  const result = await fetchWithNativeTimeout(url, { method: "HEAD" }, PUBLIC_URL_HEAD_CHECK_TIMEOUT_MS);
  return result.ok ? result.response.ok : false;
};

const resolveProfilePhotosPublicUrlAsync = async (objectPath: string, sourceHadBucketPrefix?: boolean): Promise<string | null> => {
  const cleanPath = String(objectPath || "").trim().replace(/^\/+/, "");
  if (!cleanPath || cleanPath.includes("..")) return null;
  const cacheKey = `${sourceHadBucketPrefix === true ? "prefixed" : "plain"}:${cleanPath}`;
  const settled = publicProfilePhotoUrlCache.get(cacheKey);
  if (settled !== undefined) return settled;
  const inFlight = publicProfilePhotoUrlInFlight.get(cacheKey);
  if (inFlight) return inFlight;
  const promise = (async () => {
    const primary = getNativeStoragePublicUrlForObjectPath("profile_photos", cleanPath);
    if (!primary || sourceHadBucketPrefix !== true || cleanPath.toLowerCase().startsWith("profile_photos/")) return primary;
    if (await publicUrlExists(primary)) return primary;
    const legacyDoublePrefixed = getNativeStoragePublicUrlForObjectPath("profile_photos", `profile_photos/${cleanPath}`);
    return legacyDoublePrefixed || primary;
  })();
  publicProfilePhotoUrlInFlight.set(cacheKey, promise);
  try {
    // Only a settled value is cached. Caching the promise itself meant one
    // stalled HEAD request poisoned this key for the whole process lifetime,
    // so every later caller joined the same dead promise and hung with it.
    const value = await promise;
    publicProfilePhotoUrlCache.set(cacheKey, value);
    return value;
  } finally {
    if (publicProfilePhotoUrlInFlight.get(cacheKey) === promise) publicProfilePhotoUrlInFlight.delete(cacheKey);
  }
};

const invalidateProfilePhotoPublicUrlCache = (objectPath?: string | null) => {
  const cleanPath = String(objectPath || "").trim().replace(/^\/+/, "");
  if (!cleanPath) {
    publicProfilePhotoUrlCache.clear();
    return;
  }
  publicProfilePhotoUrlCache.delete(`plain:${cleanPath}`);
  publicProfilePhotoUrlCache.delete(`prefixed:${cleanPath}`);
};

export const resolveNativeProfileImageUrlAsync = async (
  value: unknown,
  ttlSeconds = 60 * 60,
  options: NativeProfileImageResolverOptions = {},
): Promise<string | null> => {
  const ref = parseNativeProfileImageStorageRef(value, options);
  if (!ref) return null;
  if (ref.kind === "external") return ref.url;
  if (ref.bucket === "profile_photos") {
    return resolveProfilePhotosPublicUrlAsync(ref.objectPath, ref.sourceHadBucketPrefix);
  }
  return getCachedSignedStorageUrl(ref.bucket, ref.objectPath, ttlSeconds);
};

export const resolveNativePetImageUrlAsync = async (
  value: unknown,
  ttlSeconds = 60 * 60,
): Promise<string | null> => {
  const ref = parseNativePetImageStorageRef(value);
  if (!ref) return null;
  if (ref.kind === "external") return ref.url;
  if (ref.sourceVisibility === "public" && ref.sourceUrl) return ref.sourceUrl;
  if (ref.bucket === "private_pet_photos") {
    return getCachedSignedStorageUrl(ref.bucket, ref.objectPath, ttlSeconds);
  }
  const publicUrl = getNativeStoragePublicUrlForObjectPath(ref.bucket, ref.objectPath);
  if (publicUrl) return publicUrl;
  return getCachedSignedStorageUrl(ref.bucket, ref.objectPath, ttlSeconds).catch((error) => {
    if (ref.sourceUrl) return ref.sourceUrl;
    throw error;
  });
};

export const resolveNativePetImageUrl = (value: unknown): string | null => {
  const ref = parseNativePetImageStorageRef(value);
  if (!ref) return null;
  if (ref.kind === "external") return ref.url;
  if (ref.bucket === "private_pet_photos") return null;
  return ref.sourceUrl || getNativeStoragePublicUrlForObjectPath(ref.bucket, ref.objectPath);
};

export const invalidateNativeProfileImageResolverCache = (
  value?: unknown,
  options: NativeProfileImageResolverOptions = {},
) => {
  if (value === undefined) {
    invalidateCachedSignedStorageUrl();
    return;
  }
  const ref = parseNativeProfileImageStorageRef(value, options);
  if (ref?.kind === "storage" && ref.bucket === "profile_photos") {
    invalidateProfilePhotoPublicUrlCache(ref.objectPath);
    return;
  }
  if (ref?.kind === "storage") {
    invalidateCachedSignedStorageUrl(ref.bucket, ref.objectPath);
  }
};

export const resolveNativeProfileImageUrl = (value: unknown): string | null => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (/^(data:|blob:)/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const pathname = decodeURIComponent(new URL(raw).pathname || "");
      if (/\/storage\/v1\/object\/(?:public|sign)\/(?:Profiles|social_album)\//i.test(pathname)) return null;
    } catch {
      return raw;
    }
    return raw;
  }
  if (raw.includes("..")) return null;

  const path = raw.replace(/^\/+/, "");
  if (/^(Profiles|social_album|social-album)\//i.test(path)) return null;
  const bucket = (["profile_photos", "avatars"] as const)
    .find((candidate) => path.toLowerCase().startsWith(`${candidate.toLowerCase()}/`));
  if (bucket) return resolveNativeStoragePublicUrl(bucket, path);

  return resolveNativeStoragePublicUrl("avatars", path);
};

export const resolveNativeAvatarUrl = (value: unknown): string | null => resolveNativeProfileImageUrl(value);

export const resolveNativeGroupAvatarUrl = (value: unknown): string | null => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.includes("..")) return null;
  if (/^(data:|blob:)/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const pathname = decodeURIComponent(new URL(raw).pathname || "");
      const match = pathname.match(/\/storage\/v1\/object\/public\/avatars\/(groups\/[^?#]+)$/i);
      if (!match?.[1]) return null;
      return resolveNativeStoragePublicUrl("avatars", match[1]);
    } catch {
      return null;
    }
  }

  const path = raw.replace(/^\/+/, "");
  const objectPath = path.replace(/^avatars\/+/i, "");
  if (!/^groups\/[^/]+\/cover-[^/]+\.(?:webp|jpg|jpeg|png)$/i.test(objectPath)) return null;
  return resolveNativeStoragePublicUrl("avatars", objectPath);
};
