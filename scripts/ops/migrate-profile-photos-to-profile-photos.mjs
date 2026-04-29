import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const PROFILE_PHOTOS_BUCKET = "profile_photos";
const LEGACY_PROFILE_PHOTOS_BUCKET = "Profiles";
const LEGACY_AVATARS_BUCKET = "avatars";
const LEGACY_SOCIAL_ALBUM_BUCKET = "social_album";
const PROFILE_SLOTS = ["cover", "establishing", "pack", "solo", "closer"];
const ALBUM_SLOTS = ["establishing", "pack", "solo", "closer"];

const argv = new Set(process.argv.slice(2));
const dryRun = !argv.has("--write");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;

const stripQuotes = (value) => {
  let next = String(value || "").trim();
  for (let i = 0; i < 3; i += 1) {
    if (
      (next.startsWith('"') && next.endsWith('"')) ||
      (next.startsWith("'") && next.endsWith("'"))
    ) {
      next = next.slice(1, -1).trim();
    }
  }
  return next;
};

const loadEnvFile = (relativePath) => {
  const envPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = stripQuotes(trimmed.slice(index + 1));
    const existing = stripQuotes(process.env[key]);
    const shouldPreferSecretKey =
      key === "SUPABASE_SERVICE_ROLE_KEY" &&
      value.startsWith("sb_secret_") &&
      existing &&
      !existing.startsWith("sb_secret_");
    if (key && value && (!existing || shouldPreferSecretKey)) process.env[key] = value;
  }
};

loadEnvFile(".env");
loadEnvFile(".env.local");
loadEnvFile(".vercel/.env.production.local");

const explicitSupabaseUrl = stripQuotes(process.env.SUPABASE_URL);
const viteSupabaseUrl = stripQuotes(process.env.VITE_SUPABASE_URL);
const supabaseUrl =
  explicitSupabaseUrl && !explicitSupabaseUrl.includes("127.0.0.1") && !explicitSupabaseUrl.includes("localhost")
    ? explicitSupabaseUrl
    : viteSupabaseUrl;
const secretKeys = stripQuotes(process.env.SUPABASE_SECRET_KEYS);
const secretKey = stripQuotes(process.env.SUPABASE_SECRET_KEY) || secretKeys.match(/sb_secret_[A-Za-z0-9_.-]+/)?.[0] || "";
const serviceRoleKey = secretKey || stripQuotes(process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL/VITE_SUPABASE_URL and a current SUPABASE_SECRET_KEY/SUPABASE_SECRET_KEYS/SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const PROFILE_PHOTOS_PUBLIC_BASE = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${PROFILE_PHOTOS_BUCKET}/`;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const cleanString = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const normalizeSoloAspect = (value) =>
  typeof value === "string" && ["1:1", "4:5", "16:9"].includes(value) ? value : null;

const emptyProfilePhotos = () => ({
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

const normalizeProfilePhotos = (value, fallback) => {
  const normalized = emptyProfilePhotos();
  const album = Array.isArray(fallback.socialAlbum)
    ? fallback.socialAlbum.map(cleanString).filter(Boolean)
    : [];
  normalized.cover = cleanString(fallback.avatarUrl);
  normalized.establishing = album[0] || null;
  normalized.pack = album[1] || null;
  normalized.solo = album[2] || null;
  normalized.closer = album[3] || null;
  normalized.solo_aspect = album[2] ? "4:5" : null;

  if (!value || typeof value !== "object" || Array.isArray(value)) return normalized;
  for (const slot of PROFILE_SLOTS) {
    normalized[slot] = cleanString(value[slot]) || normalized[slot];
  }
  normalized.establishing_caption = cleanString(value.establishing_caption);
  normalized.pack_caption = cleanString(value.pack_caption);
  normalized.solo_caption = cleanString(value.solo_caption);
  normalized.closer_caption = cleanString(value.closer_caption);
  normalized.solo_aspect = normalizeSoloAspect(value.solo_aspect) || normalized.solo_aspect;
  return normalized;
};

const sanitizePathLike = (value) =>
  decodeURIComponent(String(value || "").split("#")[0].split("?")[0]).replace(/^\/+/, "");

const extractStorageRefFromUrl = (value) => {
  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname || "");
    const match = pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
    if (!match?.[1] || !match?.[2]) return null;
    return {
      bucket: match[1],
      key: sanitizePathLike(match[2]),
    };
  } catch {
    return null;
  }
};

const inferRef = (value, slot) => {
  const raw = cleanString(value);
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return null;
  if (/^https?:\/\//i.test(raw)) {
    const fromUrl = extractStorageRefFromUrl(raw);
    if (!fromUrl) return { externalUrl: raw };
    return fromUrl;
  }
  const clean = sanitizePathLike(raw);
  if (clean.startsWith(`${PROFILE_PHOTOS_BUCKET}/`)) {
    return { bucket: PROFILE_PHOTOS_BUCKET, key: clean };
  }
  if (clean.startsWith(`${LEGACY_PROFILE_PHOTOS_BUCKET}/`)) {
    return { bucket: LEGACY_PROFILE_PHOTOS_BUCKET, key: clean };
  }
  return {
    bucket: slot === "cover" ? LEGACY_AVATARS_BUCKET : LEGACY_SOCIAL_ALBUM_BUCKET,
    key: clean.replace(/^(avatars|social_album)\//, ""),
  };
};

const isCanonicalRef = (ref) =>
  ref?.bucket === PROFILE_PHOTOS_BUCKET && ref.key?.startsWith(`${PROFILE_PHOTOS_BUCKET}/`);

const isBrowserReadyUrl = (value) => {
  const raw = cleanString(value);
  return Boolean(raw && (/^https?:\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")));
};

const toProfileAvatarUrl = (value, fallbackValue = null) => {
  const raw = cleanString(value);
  if (!raw) return null;
  if (isBrowserReadyUrl(raw)) return raw;
  if (raw.startsWith(`${PROFILE_PHOTOS_BUCKET}/`)) return `${PROFILE_PHOTOS_PUBLIC_BASE}${encodeURI(raw)}`;
  return isBrowserReadyUrl(fallbackValue) ? cleanString(fallbackValue) : null;
};

const extensionFor = (key, contentType) => {
  const lower = String(key || "").toLowerCase();
  const ext = lower.match(/\.([a-z0-9]+)$/)?.[1];
  if (ext && ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/heic") return "heic";
  if (contentType === "image/heif") return "heif";
  return "jpg";
};

const targetKeyFor = (profileId, slot, ref, contentType) => {
  if (ref.bucket === LEGACY_PROFILE_PHOTOS_BUCKET && ref.key.startsWith(`${LEGACY_PROFILE_PHOTOS_BUCKET}/`)) {
    return ref.key.replace(new RegExp(`^${LEGACY_PROFILE_PHOTOS_BUCKET}/`), `${PROFILE_PHOTOS_BUCKET}/`);
  }
  const hash = crypto.createHash("sha1").update(`${ref.bucket}:${ref.key}`).digest("hex").slice(0, 12);
  const ext = extensionFor(ref.key, contentType);
  return `${PROFILE_PHOTOS_BUCKET}/${profileId}/${slot}-legacy-${hash}.${ext}`;
};

const downloadLegacyObject = async (ref) => {
  const { data, error } = await supabase.storage.from(ref.bucket).download(ref.key);
  if (error || !data) {
    return { blob: null, error: error?.message || "download_failed" };
  }
  return { blob: data, error: null };
};

const copyToCanonical = async (profileId, slot, value, stats) => {
  const ref = inferRef(value, slot);
  if (!ref) return null;
  if (ref.externalUrl) {
    stats.external += 1;
    return ref.externalUrl;
  }
  if (isCanonicalRef(ref)) {
    stats.alreadyCanonical += 1;
    return ref.key;
  }

  const { blob, error: downloadError } = await downloadLegacyObject(ref);
  if (!blob) {
    stats.failed.push({ profileId, slot, source: `${ref.bucket}/${ref.key}`, error: downloadError });
    return cleanString(value);
  }

  const contentType = blob.type || "image/jpeg";
  const targetKey = targetKeyFor(profileId, slot, ref, contentType);
  if (dryRun) {
    stats.toCopy += 1;
    return targetKey;
  }

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .upload(targetKey, blob, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    stats.failed.push({ profileId, slot, source: `${ref.bucket}/${ref.key}`, target: targetKey, error: uploadError.message });
    return cleanString(value);
  }

  stats.copied += 1;
  return targetKey;
};

const fetchProfiles = async () => {
  const rows = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, avatar_url, social_album, photos")
      .order("created_at", { ascending: true })
      .range(from, to);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize || (limit && rows.length >= limit)) break;
  }
  return limit ? rows.slice(0, limit) : rows;
};

const hasLegacyValue = (value) => {
  const raw = cleanString(value);
  if (!raw) return false;
  if (/^https?:\/\//i.test(raw)) {
    const ref = extractStorageRefFromUrl(raw);
    return Boolean(ref && ref.bucket !== PROFILE_PHOTOS_BUCKET);
  }
  return !raw.startsWith(`${PROFILE_PHOTOS_BUCKET}/`);
};

const migrateProfile = async (profile, stats) => {
  const current = normalizeProfilePhotos(profile.photos, {
    avatarUrl: profile.avatar_url,
    socialAlbum: profile.social_album,
  });
  const next = { ...current };
  for (const slot of PROFILE_SLOTS) {
    next[slot] = await copyToCanonical(profile.id, slot, current[slot], stats);
  }

  const nextAlbum = ALBUM_SLOTS.map((slot) => next[slot]).filter(Boolean);
  const nextAvatarUrl = toProfileAvatarUrl(next.cover, profile.avatar_url);
  const needsUpdate =
    PROFILE_SLOTS.some((slot) => next[slot] !== current[slot]) ||
    JSON.stringify(nextAlbum) !== JSON.stringify(Array.isArray(profile.social_album) ? profile.social_album : []) ||
    nextAvatarUrl !== (profile.avatar_url || null);

  if (!needsUpdate) return;
  stats.profilesToUpdate += 1;
  if (dryRun) return;

  const { error } = await supabase
    .from("profiles")
    .update({
      photos: next,
      avatar_url: nextAvatarUrl,
      social_album: nextAlbum,
      profile_photos_migrated_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (error) {
    stats.failed.push({ profileId: profile.id, error: error.message });
  } else {
    stats.profilesUpdated += 1;
  }
};

const main = async () => {
  const stats = {
    profilesScanned: 0,
    profilesWithLegacy: 0,
    profilesToUpdate: 0,
    profilesUpdated: 0,
    alreadyCanonical: 0,
    toCopy: 0,
    copied: 0,
    external: 0,
    failed: [],
  };

  const profiles = await fetchProfiles();
  for (const profile of profiles) {
    stats.profilesScanned += 1;
    const current = normalizeProfilePhotos(profile.photos, {
      avatarUrl: profile.avatar_url,
      socialAlbum: profile.social_album,
    });
    if (
      PROFILE_SLOTS.some((slot) => hasLegacyValue(current[slot])) ||
      hasLegacyValue(profile.avatar_url) ||
      (Array.isArray(profile.social_album) && profile.social_album.some(hasLegacyValue))
    ) {
      stats.profilesWithLegacy += 1;
    }
    await migrateProfile(profile, stats);
  }

  console.log(JSON.stringify({
    mode: dryRun ? "dry-run" : "write",
    ...stats,
    failed: stats.failed.slice(0, 25),
    failedCount: stats.failed.length,
  }, null, 2));

  if (stats.failed.length > 0) process.exitCode = 2;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
