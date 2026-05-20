import { nativeExactTokenRpc } from "./nativeExactTokenRequest";

export type NativeStorageCleanupBucket = "notices" | "social_album" | "alerts" | "chat_attachments" | "service_care_evidence" | "profile_photos" | "pets" | "avatars";
export type NativeProtectedActionStage = "upload" | "register" | "domain_save" | "cleanup" | "delete" | "unknown";
export type NativeProtectedActionCleanupResult = "queued" | "not_needed" | "failed";

export type NativeProtectedActionResult<T> = {
  ok: boolean;
  data?: T;
  stage?: NativeProtectedActionStage;
  userMessage?: string;
  originalError?: unknown;
  cleanupAttempted?: boolean;
  cleanupResult?: NativeProtectedActionCleanupResult;
};

const normalizeObjectPath = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const withoutQuery = raw.split("?")[0] || "";
  const decodeSafe = (input: string) => {
    try {
      return decodeURIComponent(input);
    } catch {
      return input;
    }
  };
  const normalized = decodeSafe(withoutQuery).replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) return null;
  return normalized;
};

const stringifyNativeProtectedActionError = (value: unknown) => {
  if (value instanceof Error && value.message.trim()) return value.message.trim();
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const message = [record.message, record.error, record.details, record.hint]
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .find(Boolean);
    if (message) return message;
  }
  return "unknown_error";
};

export class NativeProtectedActionError<T = unknown> extends Error {
  readonly result: NativeProtectedActionResult<T>;

  constructor(result: NativeProtectedActionResult<T>) {
    super(result.userMessage || stringifyNativeProtectedActionError(result.originalError));
    this.name = "NativeProtectedActionError";
    this.result = result;
  }
}

export const createNativeProtectedActionError = <T>(result: NativeProtectedActionResult<T>) => (
  new NativeProtectedActionError(result)
);

export const getNativeProtectedActionResult = <T = unknown>(error: unknown): NativeProtectedActionResult<T> | null => (
  error instanceof NativeProtectedActionError ? error.result as NativeProtectedActionResult<T> : null
);

export const logNativeProtectedActionFailure = (scope: string, error: unknown) => {
  const result = getNativeProtectedActionResult(error);
  if (result) {
    console.warn(scope, {
      stage: result.stage || "unknown",
      cleanupAttempted: result.cleanupAttempted === true,
      cleanupResult: result.cleanupResult || "not_needed",
      originalError: stringifyNativeProtectedActionError(result.originalError),
    });
    return;
  }
  console.warn(scope, {
    stage: "unknown",
    cleanupAttempted: false,
    cleanupResult: "not_needed",
    originalError: stringifyNativeProtectedActionError(error),
  });
};

export async function requestNativeStorageCleanup(bucket: NativeStorageCleanupBucket, objectPath: string, reason: string, accessToken?: string | null) {
  const cleanBucket = String(bucket || "").trim().toLowerCase();
  const cleanPath = normalizeObjectPath(objectPath);
  const cleanReason = String(reason || "").trim();
  if (!cleanBucket || !cleanPath || !cleanReason) return;

  const { error } = await nativeExactTokenRpc("request_storage_cleanup", {
    p_bucket: cleanBucket,
    p_object_path: cleanPath,
    p_reason: cleanReason,
  }, accessToken);
  if (error) throw error;
}

export async function requestNativeStorageCleanupResult(bucket: NativeStorageCleanupBucket, objectPath: string | null | undefined, reason: string, accessToken?: string | null): Promise<NativeProtectedActionCleanupResult> {
  const cleanPath = normalizeObjectPath(String(objectPath || ""));
  if (!cleanPath) return "not_needed";
  try {
    await requestNativeStorageCleanup(bucket, cleanPath, reason, accessToken);
    return "queued";
  } catch {
    return "failed";
  }
}
