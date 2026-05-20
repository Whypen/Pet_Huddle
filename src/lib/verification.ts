export const isVerifiedStatus = (status: unknown): boolean =>
  typeof status === "string" && status.trim().toLowerCase() === "verified";

export const isVerifiedProfile = (profile: unknown, statusKey = "verification_status", boolKey = "is_verified"): boolean => {
  if (!profile || typeof profile !== "object") return false;
  const row = profile as Record<string, unknown>;
  const status = row[statusKey];
  if (typeof status === "string" && status.trim()) return isVerifiedStatus(status);
  return row[boolKey] === true;
};
