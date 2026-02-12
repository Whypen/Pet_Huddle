export function humanError(e: unknown): string {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message || "Unknown error";
  const anyE = e as { message?: unknown; error_description?: unknown };
  if (typeof anyE?.message === "string") return anyE.message;
  if (typeof anyE?.error_description === "string") return anyE.error_description;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
