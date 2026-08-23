export const NATIVE_CHAT_MEDIA_MAX_BYTES = 25 * 1024 * 1024;
export const NATIVE_SOCIAL_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

type NativeMediaKind = "image" | "video";

const isKnownPositiveSize = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export const assertNativeMediaSize = (
  size: number | null | undefined,
  maximumBytes: number,
  message: string,
) => {
  if (isKnownPositiveSize(size) && size > maximumBytes) throw new Error(message);
};

export const assertNativeMediaKind = (contentType: string, allowedKinds: readonly NativeMediaKind[]) => {
  const normalized = String(contentType || "").trim().toLowerCase();
  if (!allowedKinds.some((kind) => normalized.startsWith(`${kind}/`))) {
    throw new Error(allowedKinds.length === 1 && allowedKinds[0] === "video"
      ? "Choose a video file."
      : "Choose a photo or video file.");
  }
};

export const validateNativeSocialVideoSelection = (media: {
  durationSeconds?: number | null;
  mimeType?: string | null;
  size?: number | null;
}) => {
  const mimeType = String(media.mimeType || "").trim().toLowerCase();
  if (mimeType && !mimeType.startsWith("video/")) throw new Error("Choose a video file.");
  assertNativeMediaSize(
    media.size,
    NATIVE_SOCIAL_VIDEO_MAX_BYTES,
    "Choose a 15 seconds or shorter video.",
  );
};
