export const isNativeVerifiedProfile = (
  value: unknown,
  boolKey = "is_verified",
  statusKey = "verification_status",
): boolean => {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const status = row[statusKey];
  if (typeof status === "string" && status.trim()) return status.trim().toLowerCase() === "verified";
  return row[boolKey] === true;
};
