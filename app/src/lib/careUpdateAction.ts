export type CareUpdateActionKind = "optional" | "photo" | "photo_note" | "summary";

export function requiredCareUpdateActionLabel(kind: CareUpdateActionKind, submitted: number, required: number): string {
  const total = Math.max(1, Math.floor(Number.isFinite(required) ? required : 1));
  const progress = Math.min(total, Math.max(0, Math.floor(Number.isFinite(submitted) ? submitted : 0)));
  const action = kind === "photo_note"
    ? "Share a photo + summary update"
    : kind === "photo"
      ? "Share a photo update"
      : "Share a care summary";
  return `${action} (${progress}/${total})`;
}
