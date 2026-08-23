import { nativeExactTokenRpc } from "./nativeExactTokenRequest";

export type NativeEngagementTier = "new" | "active" | "trusted" | "pillar";

export type NativeEngagementSummary = {
  tier: NativeEngagementTier;
  percentileRank: number | null;
  computedAt: string | null;
};

export type NativeEngagementFields = {
  engagementTier?: NativeEngagementTier | null;
  engagementPercentileRank?: number | null;
  engagementComputedAt?: string | null;
};

const VALID_TIERS = new Set<NativeEngagementTier>(["new", "active", "trusted", "pillar"]);

export const normalizeNativeEngagementTier = (value: unknown): NativeEngagementTier => {
  const clean = typeof value === "string" ? value.trim().toLowerCase() : "";
  return VALID_TIERS.has(clean as NativeEngagementTier) ? clean as NativeEngagementTier : "new";
};

export const nativeEngagementFromFields = (fields?: NativeEngagementFields | null): NativeEngagementSummary | null => {
  const tier = normalizeNativeEngagementTier(fields?.engagementTier);
  if (tier === "new") return null;
  const percentile = typeof fields?.engagementPercentileRank === "number"
    ? fields.engagementPercentileRank
    : fields?.engagementPercentileRank == null
      ? null
      : Number(fields.engagementPercentileRank);
  return {
    tier,
    percentileRank: Number.isFinite(percentile) ? percentile : null,
    computedAt: typeof fields?.engagementComputedAt === "string" ? fields.engagementComputedAt : null,
  };
};

export async function fetchNativeEngagementTiers(
  userIds: Array<string | null | undefined>,
  accessToken?: string | null,
): Promise<Map<string, NativeEngagementSummary>> {
  const ids = Array.from(new Set(userIds.map((id) => String(id || "").trim()).filter(Boolean)));
  const result = new Map<string, NativeEngagementSummary>();
  if (ids.length === 0) return result;

  const { data, error } = await nativeExactTokenRpc<Array<{
    user_id?: string | null;
    engagement_tier?: string | null;
    engagement_percentile_rank?: number | string | null;
    engagement_computed_at?: string | null;
  }>>("get_user_engagement_tiers", { p_user_ids: ids }, accessToken);
  if (error || !Array.isArray(data)) return result;

  for (const row of data) {
    const userId = String(row?.user_id || "").trim();
    const tier = normalizeNativeEngagementTier(row?.engagement_tier);
    if (!userId || tier === "new") continue;
    const percentile = typeof row?.engagement_percentile_rank === "number"
      ? row.engagement_percentile_rank
      : row?.engagement_percentile_rank == null
        ? null
        : Number(row.engagement_percentile_rank);
    result.set(userId, {
      tier,
      percentileRank: Number.isFinite(percentile) ? percentile : null,
      computedAt: typeof row?.engagement_computed_at === "string" ? row.engagement_computed_at : null,
    });
  }
  return result;
}
