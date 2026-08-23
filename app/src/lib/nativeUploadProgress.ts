export const NATIVE_UPLOAD_PROGRESS_START = 1;
export const NATIVE_UPLOAD_PROGRESS_READ_READY = 12;
export const NATIVE_UPLOAD_PROGRESS_UPLOAD_READY = 35;
export const NATIVE_UPLOAD_PROGRESS_MAX_PENDING = 92;

export const clampNativeUploadProgress = (value: number, uploading = true) => {
  const max = uploading ? 99 : 100;
  if (!Number.isFinite(value)) return uploading ? NATIVE_UPLOAD_PROGRESS_START : 0;
  return Math.max(uploading ? NATIVE_UPLOAD_PROGRESS_START : 0, Math.min(max, Math.round(value)));
};

export const nextNativeUploadProgress = (current: number) => {
  const value = clampNativeUploadProgress(current);
  if (value < 70) return Math.min(NATIVE_UPLOAD_PROGRESS_MAX_PENDING, value + 6);
  if (value < 90) return Math.min(NATIVE_UPLOAD_PROGRESS_MAX_PENDING, value + 2);
  return Math.min(NATIVE_UPLOAD_PROGRESS_MAX_PENDING, value);
};

export const averageNativeUploadProgress = <T extends { progress?: number; status?: string }>(
  items: T[],
  isUploadItem: (item: T) => boolean = () => true,
) => {
  const uploadItems = items.filter(isUploadItem);
  if (uploadItems.length === 0) return null;
  const active = uploadItems.some((item) => item.status === "queued" || item.status === "uploading");
  if (!active) return null;
  const total = uploadItems.reduce((sum, item) => {
    if (item.status === "uploaded") return sum + 100;
    if (item.status === "uploading" || item.status === "queued") return sum + clampNativeUploadProgress(item.progress ?? NATIVE_UPLOAD_PROGRESS_START);
    return sum + Math.max(0, Math.min(100, Math.round(item.progress ?? 0)));
  }, 0);
  return Math.max(NATIVE_UPLOAD_PROGRESS_START, Math.min(99, Math.round(total / uploadItems.length)));
};
