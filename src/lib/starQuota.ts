import { getQuotaCapsForTier, normalizeQuotaTier } from "@/config/quotaConfig";

type StarQuotaSnapshot = {
  tier?: string | null;
  stars_used_cycle?: number | null;
  extra_stars?: number | null;
};

export const resolveStarQuotaTier = (
  profileTier?: string | null,
  _snapshotTier?: string | null,
) => normalizeQuotaTier(profileTier || "free");

export const getRemainingStarsFromSnapshot = (
  profileTier?: string | null,
  snapshot?: StarQuotaSnapshot | null,
) => {
  const tier = resolveStarQuotaTier(profileTier, snapshot?.tier);
  const cap = getQuotaCapsForTier(tier).starsPerMonth;
  const used = Number(snapshot?.stars_used_cycle || 0);
  const extra = Number(snapshot?.extra_stars || 0);
  return Math.max(0, cap - used) + Math.max(0, extra);
};
