import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isMinorDob, buildProfileShareCard, normalizeNativeAvailabilityStatus } from "@/lib/profileShareCardData";
import type { ProfileShareCardProfile } from "@/lib/profileShareCardData";

type RpcResult = { data: unknown; error: { message?: string } | null };

const boundRpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  params: Record<string, unknown>,
) => Promise<RpcResult>;
const rpc = (name: string, args: Record<string, unknown>): Promise<RpcResult> => boundRpc(name, args);

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const positiveIntegerOrNull = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
};

const nullableCount = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
};

const firstRow = (value: unknown): Record<string, unknown> => (
  Array.isArray(value) ? asRecord(value[0]) : asRecord(value)
);

export type ProfileShareCardResource = {
  profile: ProfileShareCardProfile;
  restricted: boolean;
};

export const loadProfileShareCard = async (profileId: string): Promise<ProfileShareCardResource | null> => {
  const [snapshotResult, statsResult, tierResult] = await Promise.all([
    rpc("get_native_public_profile_snapshot", { p_user_id: profileId }),
    rpc("get_native_profile_engagement_stats", { p_user_id: profileId }),
    rpc("get_user_engagement_tiers", { p_user_ids: [profileId] }),
  ]);

  if (snapshotResult.error) throw new Error(snapshotResult.error.message || "Unable to load profile");
  const snapshot = asRecord(snapshotResult.data);
  const row = asRecord(snapshot.profile);
  if (!row.id) return null;

  const stats = statsResult.error ? {} : firstRow(statsResult.data);
  const tier = tierResult.error ? {} : firstRow(tierResult.data);
  const petHeads = Array.isArray(row.pet_heads) ? row.pet_heads : [];
  const profile = buildProfileShareCard({
    id: String(row.id),
    displayName: typeof row.display_name === "string" ? row.display_name : "huddle member",
    socialId: typeof row.social_id === "string" ? row.social_id : null,
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    tier: typeof row.effective_tier === "string" ? row.effective_tier : typeof row.tier === "string" ? row.tier : null,
    isVerified: typeof row.verification_status === "string" && row.verification_status.trim()
      ? row.verification_status.trim().toLowerCase() === "verified"
      : row.is_verified === true,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    memberNumber: positiveIntegerOrNull(snapshot.member_number),
    engagementTier: tier.engagement_tier === "trusted" || tier.engagement_tier === "pillar" ? tier.engagement_tier : null,
    experienceYears: typeof row.experience_years === "number" || typeof row.experience_years === "string" ? row.experience_years : null,
    petExperience: Array.isArray(row.pet_experience) ? row.pet_experience.filter((value): value is string => typeof value === "string") : [],
    roleLabels: normalizeNativeAvailabilityStatus(row),
    groupCount: nullableCount(stats.groups_count),
    friendCount: nullableCount(stats.friends_count),
    pets: petHeads
      .map(asRecord)
      .filter((pet) => pet.is_public === true && pet.is_active !== false)
      .map((pet) => ({
        name: typeof pet.name === "string" ? pet.name : "",
        species: typeof pet.species === "string" ? pet.species : null,
        photoUri: typeof pet.photo_url === "string" ? pet.photo_url : null,
      })),
  });

  return { profile, restricted: isMinorDob(typeof row.dob === "string" ? row.dob : null) };
};

export const useProfileShareCard = (profileId: string | null, enabled: boolean) => {
  const [state, setState] = useState<{
    data: ProfileShareCardResource | null;
    loading: boolean;
    failed: boolean;
  }>({ data: null, loading: Boolean(profileId && enabled), failed: false });

  useEffect(() => {
    if (!profileId || !enabled) {
      setState({ data: null, loading: false, failed: false });
      return;
    }
    let cancelled = false;
    setState({ data: null, loading: true, failed: false });
    void loadProfileShareCard(profileId)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, failed: !data });
      })
      .catch(() => {
        if (!cancelled) setState({ data: null, loading: false, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, profileId]);

  return state;
};
