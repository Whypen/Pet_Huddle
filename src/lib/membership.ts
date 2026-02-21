export type MembershipTier = "free" | "plus" | "gold";

const TIER_LABELS: Record<MembershipTier, string> = {
  free: "Free",
  plus: "Plus",
  gold: "Gold",
};

export const normalizeMembershipTier = (value?: string | null): MembershipTier => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "gold") return "gold";
  if (normalized === "plus") return "plus";
  return "free";
};

export const membershipTierLabel = (value?: string | null): string => TIER_LABELS[normalizeMembershipTier(value)];

export const resolveMembershipTier = (record?: Record<string, unknown> | null, fallback?: string | null): MembershipTier => {
  if (!record) return normalizeMembershipTier(fallback ?? "free");
  const candidate = record["effective_tier"] ?? record["tier"] ?? fallback ?? "free";
  return normalizeMembershipTier(String(candidate));
};
