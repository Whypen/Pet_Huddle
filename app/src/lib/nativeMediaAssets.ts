import { nativeExactTokenRpc } from "./nativeExactTokenRequest";
import { createNativeProtectedActionError, type NativeProtectedActionResult } from "./nativeStorageCleanup";

export async function registerNativeMediaAsset(options: {
  accessToken?: string | null;
  bucket: string;
  contentId?: string | null;
  contentType?: string | null;
  expiresAt?: string | null;
  objectPath: string;
}) {
  const bucket = String(options.bucket || "").trim();
  const objectPath = String(options.objectPath || "").trim().replace(/^\/+/, "");
  if (!bucket || !objectPath || objectPath.includes("..")) {
    throw createNativeProtectedActionError({
      ok: false,
      stage: "register",
      originalError: new Error("invalid_media_asset_registration"),
      cleanupAttempted: false,
      cleanupResult: "not_needed",
    } satisfies NativeProtectedActionResult<never>);
  }

  const { error } = await nativeExactTokenRpc("register_native_media_asset", {
    p_bucket: bucket,
    p_content_id: options.contentId ?? null,
    p_content_type: options.contentType ?? null,
    p_expires_at: options.expiresAt ?? null,
    p_object_path: objectPath,
  }, options.accessToken);
  if (error) {
    throw createNativeProtectedActionError({
      ok: false,
      stage: "register",
      originalError: error,
      cleanupAttempted: false,
      cleanupResult: "not_needed",
    } satisfies NativeProtectedActionResult<never>);
  }
}
