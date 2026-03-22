import { supabase } from "@/integrations/supabase/client";

const SOCIAL_ALBUM_BUCKET = "social_album";

const isDataOrBlob = (value: string) => value.startsWith("data:") || value.startsWith("blob:");

const sanitizePathLike = (value: string) =>
  decodeURIComponent(value.split("#")[0].split("?")[0]).replace(/^\/+/, "");

const extractBucketKeyFromUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname || "");
    const signMatch = pathname.match(/\/storage\/v1\/object\/sign\/social_album\/(.+)$/);
    if (signMatch?.[1]) return sanitizePathLike(signMatch[1]);
    const publicMatch = pathname.match(/\/storage\/v1\/object\/public\/social_album\/(.+)$/);
    if (publicMatch?.[1]) return sanitizePathLike(publicMatch[1]);
    const genericMatch = pathname.match(/\/social_album\/(.+)$/);
    if (genericMatch?.[1]) return sanitizePathLike(genericMatch[1]);
    return null;
  } catch {
    return null;
  }
};

const toBucketKey = (value: string): string | null => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (isDataOrBlob(raw)) return null;
  if (/^https?:\/\//i.test(raw)) {
    const extracted = extractBucketKeyFromUrl(raw);
    return extracted ? sanitizePathLike(extracted).replace(/^(social_album\/)+/i, "") : null;
  }
  // Keep only bucket-like keys (folder/file). Plain labels like "Hyphen 4" are invalid.
  if (!raw.includes("/")) return null;
  const normalized = sanitizePathLike(raw).replace(/^(social_album\/)+/i, "");
  return normalized || null;
};

const expandCandidateKeys = (value: string): string[] => {
  const raw = String(value || "").trim();
  if (!raw) return [];
  const extractedFromUrl = /^https?:\/\//i.test(raw) ? (extractBucketKeyFromUrl(raw) || "") : raw;
  const normalizedRaw = sanitizePathLike(extractedFromUrl);
  const normalizedDerived = sanitizePathLike(toBucketKey(raw) || "");
  const withoutBucketPrefixRaw = normalizedRaw.replace(/^(social_album\/)+/i, "");
  const withoutBucketPrefixDerived = normalizedDerived.replace(/^(social_album\/)+/i, "");
  return Array.from(
    new Set(
      [normalizedRaw, normalizedDerived, withoutBucketPrefixRaw, withoutBucketPrefixDerived]
        .map((candidate) => sanitizePathLike(candidate))
        .filter(Boolean)
    )
  );
};

export const canonicalizeSocialAlbumEntries = (entries: string[]): string[] => {
  const unique = new Set<string>();
  for (const item of entries) {
    const raw = String(item || "").trim();
    if (!raw) continue;
    if (isDataOrBlob(raw)) {
      unique.add(raw);
      continue;
    }
    if (/^https?:\/\//i.test(raw)) {
      const key = toBucketKey(raw);
      unique.add(key || raw);
      continue;
    }
    const key = toBucketKey(raw);
    if (key) unique.add(key);
  }
  return Array.from(unique);
};

export const resolveSocialAlbumUrlMap = async (
  entries: string[],
  ttlSeconds = 60 * 60,
): Promise<Record<string, string>> => {
  const result: Record<string, string> = {};
  if (!entries.length) return result;

  const resolveByCandidates = async (candidateKeys: string[]): Promise<string | null> => {
    for (const candidate of candidateKeys) {
      const signed = await supabase.storage.from(SOCIAL_ALBUM_BUCKET).createSignedUrl(candidate, ttlSeconds);
      if (signed.data?.signedUrl) return signed.data.signedUrl;
    }
    for (const candidate of candidateKeys) {
      const publicUrl = supabase.storage.from(SOCIAL_ALBUM_BUCKET).getPublicUrl(candidate).data.publicUrl;
      if (publicUrl) return publicUrl;
    }
    return null;
  };

  await Promise.all(
    entries.map(async (original) => {
      const raw = String(original || "").trim();
      if (!raw) return;
      if (isDataOrBlob(raw)) {
        result[original] = raw;
        return;
      }
      if (/^https?:\/\//i.test(raw)) {
        const candidateKeys = expandCandidateKeys(raw);
        if (candidateKeys.length === 0) {
          result[original] = raw;
          return;
        }
        const resolved = await resolveByCandidates(candidateKeys);
        if (resolved) {
          result[original] = resolved;
        }
        return;
      }
      const candidateKeys = expandCandidateKeys(raw);
      if (candidateKeys.length === 0) return;
      const resolved = await resolveByCandidates(candidateKeys);
      if (resolved) {
        result[original] = resolved;
      }
    }),
  );

  return result;
};

export const resolveSocialAlbumUrlList = async (
  entries: string[],
  ttlSeconds = 60 * 60,
): Promise<string[]> => {
  const map = await resolveSocialAlbumUrlMap(entries, ttlSeconds);
  return entries.map((entry) => map[entry] || "").filter(Boolean);
};
