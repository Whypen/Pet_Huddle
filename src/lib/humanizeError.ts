export function humanizeError(e: unknown): string {
  if (!e) return "Something went wrong. Please try again.";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message || "Something went wrong. Please try again.";
  const anyE = e as Record<string, unknown>;
  return (
    (typeof anyE?.message === "string" && anyE.message) ||
    (typeof (anyE as { error_description?: string }).error_description === "string"
      ? (anyE as { error_description?: string }).error_description
      : "") ||
    (typeof (anyE as { error?: { message?: string } }).error?.message === "string"
      ? (anyE as { error?: { message?: string } }).error?.message
      : "") ||
    (typeof (anyE as { error?: string }).error === "string" ? (anyE as { error?: string }).error : "") ||
    (typeof (anyE as { msg?: string }).msg === "string" ? (anyE as { msg?: string }).msg : "") ||
    "Something went wrong. Please try again."
  );
}
