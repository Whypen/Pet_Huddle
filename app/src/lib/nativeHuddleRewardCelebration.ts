import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NativeHuddleRewardContributor, NativeHuddleRewardGrant, NativeHuddleRewardProgress, NativeHuddleRewardTier } from "./nativeHuddleRewards";

// The promo engine rolls `state` straight back to "progress" once a higher
// friend milestone exists (see huddle_promo_stage_progress), so the completion
// moment cannot be driven off `state === "completed"`. It is driven off a grant
// appearing in `grants[]` that this device has not celebrated yet.
const LEDGER_VERSION = "v1";
const ledgerKey = (userId: string) => `huddle_native_reward_celebrated:${LEDGER_VERSION}:${userId}`;

export type NativeHuddleRewardCelebrationTarget = {
  key: string;
  rewardTier: NativeHuddleRewardTier;
  rewardMonths: number;
  requiredFriends: number;
  grantEndsAt: string;
  contributors: NativeHuddleRewardContributor[];
  contributorTotal: number;
  headline: string;
  pill: string;
  subheadline: string;
};

const grantKey = (grant: NativeHuddleRewardGrant) => `${grant.milestone_id}:${grant.grant_ends_at}`;

const activeGrants = (progress: NativeHuddleRewardProgress | null): NativeHuddleRewardGrant[] => (
  (progress?.grants || []).filter((grant) => grant.status === "active")
);

const readLedger = async (userId: string): Promise<string[] | null> => {
  try {
    const raw = await AsyncStorage.getItem(ledgerKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : null;
  } catch {
    return null;
  }
};

const writeLedger = async (userId: string, keys: string[]) => {
  // Keep the ledger bounded; a user only ever needs the recent grants to avoid
  // re-celebrating, and older ones can never come back as "new".
  await AsyncStorage.setItem(ledgerKey(userId), JSON.stringify(keys.slice(-40))).catch(() => undefined);
};

/**
 * Returns the grant that should be celebrated, or null.
 *
 * On the very first read for a user the ledger is seeded silently with whatever
 * grants already exist, so long-standing members are never shown a celebration
 * for a reward they earned weeks ago.
 */
export const resolveNativeHuddleRewardCelebration = async (
  userId: string,
  progress: NativeHuddleRewardProgress | null,
): Promise<NativeHuddleRewardCelebrationTarget | null> => {
  const grants = activeGrants(progress);
  const ledger = await readLedger(userId);
  if (ledger === null) {
    await writeLedger(userId, grants.map(grantKey));
    return null;
  }
  const seen = new Set(ledger);
  const fresh = grants.find((grant) => !seen.has(grantKey(grant)));
  if (!fresh) return null;
  return {
    key: grantKey(fresh),
    rewardTier: fresh.reward_tier,
    rewardMonths: Math.max(1, fresh.reward_months || 1),
    requiredFriends: Math.max(0, fresh.required_friends || 0),
    grantEndsAt: String(fresh.grant_ends_at || ""),
    contributors: progress?.contributors || [],
    contributorTotal: Math.max(0, progress?.contributor_total || 0),
    headline: progress?.celebration_headline || "Pack complete.",
    pill: progress?.celebration_pill || "{reward} · {months}",
    subheadline: progress?.celebration_subheadline || "Yours until {expiry}.",
  };
};

export const markNativeHuddleRewardCelebrated = async (userId: string, key: string) => {
  const ledger = (await readLedger(userId)) || [];
  if (ledger.includes(key)) return;
  await writeLedger(userId, [...ledger, key]);
};
