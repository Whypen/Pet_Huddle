import * as FileSystem from "expo-file-system/legacy";
import { supabaseAnonKey, supabaseUrl } from "./supabase";
import { createNativeAuthenticatedHeaders, getFreshNativeAccessToken } from "./nativeFunctionClient";
import { fetchNativeResponseWithTimeout, NATIVE_MEDIA_UPLOAD_TIMEOUT_MS } from "./nativeTimeout";
import { assertNativeMediaKind, assertNativeMediaSize } from "./nativeMediaPolicy";

export type NativeLocalMediaMeta = {
  fileName?: string | null;
  mimeType?: string | null;
};

export type NativeLocalMediaFile = {
  body: ArrayBuffer;
  contentType: string;
  extension: string;
  size: number;
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

  return bytes.buffer;
};

export const nativeMediaExtension = (uri: string, meta: NativeLocalMediaMeta | null, fallback = "jpg") => {
  const mime = String(meta?.mimeType || "").toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("heic")) return "heic";
  if (mime.includes("heif")) return "heif";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("quicktime")) return "mov";

  const fromName = String(meta?.fileName || uri || "").split(".").pop()?.split("?")[0]?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,8}$/.test(fromName)) return fromName === "jpeg" ? "jpg" : fromName;
  return fallback;
};

export const nativeMediaContentType = (extension: string, meta: NativeLocalMediaMeta | null, fallback = "application/octet-stream") => {
  const mime = String(meta?.mimeType || "").toLowerCase();
  if (/^(image|video)\//.test(mime)) return mime;
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  if (extension === "mp4") return "video/mp4";
  if (extension === "mov") return "video/quicktime";
  return fallback;
};

export const readNativeLocalMediaFile = async (
  uri: string,
  meta: NativeLocalMediaMeta | null = null,
  options: {
    allowedKinds?: readonly ("image" | "video")[];
    fallbackExtension?: string;
    fallbackContentType?: string;
    maxBytes?: number;
    oversizedMessage?: string;
  } = {},
): Promise<NativeLocalMediaFile> => {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error("Selected file is unavailable.");
  assertNativeMediaSize(
    typeof info.size === "number" ? info.size : null,
    options.maxBytes ?? Number.POSITIVE_INFINITY,
    options.oversizedMessage || "Selected file is too large.",
  );
  const extension = nativeMediaExtension(uri, meta, options.fallbackExtension || "jpg");
  const contentType = nativeMediaContentType(extension, meta, options.fallbackContentType || "application/octet-stream");
  if (options.allowedKinds) assertNativeMediaKind(contentType, options.allowedKinds);
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const body = base64ToArrayBuffer(base64);
  if (body.byteLength === 0) throw new Error("Selected file is empty.");
  assertNativeMediaSize(
    body.byteLength,
    options.maxBytes ?? Number.POSITIVE_INFINITY,
    options.oversizedMessage || "Selected file is too large.",
  );
  return { body, contentType, extension, size: typeof info.size === "number" ? info.size : body.byteLength };
};

const encodeStorageObjectPath = (bucket: string, path: string) =>
  `${encodeURIComponent(bucket)}/${path.split("/").map((part) => encodeURIComponent(part)).join("/")}`;

export const uploadNativeLocalMediaToSupabase = async (options: {
  accessToken: string;
  bucket: string;
  contentType: string;
  path: string;
  body: ArrayBuffer | Uint8Array;
  upsert?: boolean;
}) => {
  const accessToken = await getFreshNativeAccessToken(options.accessToken);
  if (!accessToken) throw new Error("auth_required");
  const response = await fetchNativeResponseWithTimeout(`${supabaseUrl}/storage/v1/object/${encodeStorageObjectPath(options.bucket, options.path)}`, {
    method: "POST",
    headers: createNativeAuthenticatedHeaders(accessToken, {
      "cache-control": "3600",
      "content-type": options.contentType,
      "x-upsert": options.upsert === true ? "true" : "false",
    }),
    body: options.body as BodyInit,
  }, NATIVE_MEDIA_UPLOAD_TIMEOUT_MS);

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(raw || `storage_upload_failed_${response.status}`);
  }
};
