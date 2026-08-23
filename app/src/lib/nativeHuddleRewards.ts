import AsyncStorage from "@react-native-async-storage/async-storage";
import { nativeExactTokenRpc } from "./nativeExactTokenRequest";

export type NativeHuddleRewardTier = "plus" | "gold";

export type NativeHuddleRewardMilestone = {
  id: string;
  required_friends: number;
  reward_tier: NativeHuddleRewardTier;
  reward_months: number;
  display_order?: number;
};

export type NativeHuddleRewardGrant = {
  milestone_id: string;
  required_friends: number;
  reward_tier: NativeHuddleRewardTier;
  reward_months: number;
  grant_ends_at: string;
  status: "active" | "expired" | "revoked";
};

export type NativeHuddleRewardProgress = {
  visible: boolean;
  state: "inactive" | "paid" | "progress" | "completed";
  campaign?: {
    id: string;
    name: string;
    goal_type?: NativeHuddlePromoGoal;
    start_at?: string;
    end_at?: string;
    start_local_date?: string;
    end_local_date?: string;
    config_version?: number;
  } | null;
  goal_type?: NativeHuddlePromoGoal;
  title?: string;
  drawer_headline?: string;
  body?: string;
  cta_label?: string;
  eligibility_terms?: string;
  accent_template?: "automatic" | "lime" | "orange";
  friend_target?: number;
  friend_progress_start?: number;
  reward_tier?: NativeHuddleRewardTier;
  reward_months?: number;
  participant_role?: "owner" | "carer" | null;
  grant?: Record<string, unknown> | null;
  cycle_number?: number;
  friend_count?: number;
  next_milestone?: NativeHuddleRewardMilestone | null;
  milestones?: NativeHuddleRewardMilestone[];
  grants?: NativeHuddleRewardGrant[];
  contributors?: NativeHuddleRewardContributor[];
  contributor_total?: number;
  celebration_headline?: string;
  celebration_pill?: string;
  celebration_subheadline?: string;
};

export type NativeHuddleRewardContributor = {
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  updated_at?: string | null;
};

export type NativeHuddlePromoGoal =
  | "add_friend"
  | "get_verified"
  | "complete_profile"
  | "add_first_pet"
  | "become_listed_carer"
  | "complete_care_booking";

type CachedProgress = {
  cachedAt: number;
  sessionKey: string;
  userId: string;
  progress: NativeHuddleRewardProgress;
};

const CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_VERSION = "v2";
const memoryCache = new Map<string, CachedProgress>();
const inFlight = new Map<string, Promise<NativeHuddleRewardProgress>>();

const cacheSessionKey = (userId: string, sessionKey?: string | null) => String(sessionKey || userId);
const cacheKey = (userId: string, sessionKey?: string | null) => `huddle_native_rewards:${CACHE_VERSION}:${userId}:${cacheSessionKey(userId, sessionKey)}`;
const validTier = (value: unknown): value is NativeHuddleRewardTier => value === "plus" || value === "gold";
const validGoal = (value: unknown): value is NativeHuddlePromoGoal => [
  "add_friend",
  "get_verified",
  "complete_profile",
  "add_first_pet",
  "become_listed_carer",
  "complete_care_booking",
].includes(String(value));

const isProgress = (value: unknown): value is NativeHuddleRewardProgress => {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.visible === "boolean"
    && (row.state === "inactive" || row.state === "paid" || row.state === "progress" || row.state === "completed");
};

const normalizeMilestone = (value: unknown): NativeHuddleRewardMilestone | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.required_friends !== "number" || typeof row.reward_months !== "number" || !validTier(row.reward_tier)) return null;
  return {
    id: row.id,
    required_friends: row.required_friends,
    reward_tier: row.reward_tier,
    reward_months: row.reward_months,
    display_order: typeof row.display_order === "number" ? row.display_order : undefined,
  };
};

const normalizeProgress = (value: unknown): NativeHuddleRewardProgress => {
  if (!isProgress(value)) return { visible: false, state: "inactive" };
  const row = value as Record<string, unknown>;
  const milestones = Array.isArray(row.milestones) ? row.milestones.map(normalizeMilestone).filter((item): item is NativeHuddleRewardMilestone => Boolean(item)) : [];
  const nextMilestone = normalizeMilestone(row.next_milestone);
  const grants = Array.isArray(row.grants)
    ? row.grants.filter((item): item is NativeHuddleRewardGrant => Boolean(item && typeof item === "object" && typeof (item as Record<string, unknown>).milestone_id === "string" && validTier((item as Record<string, unknown>).reward_tier))) as NativeHuddleRewardGrant[]
    : [];
  return {
    visible: row.visible === true,
    state: row.state as NativeHuddleRewardProgress["state"],
    campaign: row.campaign && typeof row.campaign === "object" ? row.campaign as NativeHuddleRewardProgress["campaign"] : null,
    goal_type: validGoal(row.goal_type) ? row.goal_type : undefined,
    title: typeof row.title === "string" ? row.title : undefined,
    drawer_headline: typeof row.drawer_headline === "string" ? row.drawer_headline : undefined,
    body: typeof row.body === "string" ? row.body : undefined,
    cta_label: typeof row.cta_label === "string" ? row.cta_label : undefined,
    eligibility_terms: typeof row.eligibility_terms === "string" ? row.eligibility_terms : undefined,
    accent_template: row.accent_template === "lime" || row.accent_template === "orange" ? row.accent_template : "automatic",
    friend_target: typeof row.friend_target === "number" ? row.friend_target : undefined,
    friend_progress_start: typeof row.friend_progress_start === "number" ? row.friend_progress_start : 0,
    reward_tier: validTier(row.reward_tier) ? row.reward_tier : undefined,
    reward_months: typeof row.reward_months === "number" ? row.reward_months : undefined,
    participant_role: row.participant_role === "owner" || row.participant_role === "carer" ? row.participant_role : null,
    grant: row.grant && typeof row.grant === "object" ? row.grant as Record<string, unknown> : null,
    cycle_number: typeof row.cycle_number === "number" ? row.cycle_number : undefined,
    friend_count: typeof row.friend_count === "number" ? row.friend_count : 0,
    next_milestone: nextMilestone,
    milestones,
    grants,
    contributors: Array.isArray(row.contributors)
      ? row.contributors.filter((item): item is NativeHuddleRewardContributor => Boolean(
        item && typeof item === "object" && typeof (item as Record<string, unknown>).user_id === "string",
      ))
      : [],
    contributor_total: typeof row.contributor_total === "number" ? row.contributor_total : 0,
    celebration_headline: typeof row.celebration_headline === "string" ? row.celebration_headline : undefined,
    celebration_pill: typeof row.celebration_pill === "string" ? row.celebration_pill : undefined,
    celebration_subheadline: typeof row.celebration_subheadline === "string" ? row.celebration_subheadline : undefined,
  };
};

export const readCachedNativeHuddleRewardProgress = async (userId: string, options: { sessionKey?: string | null } = {}): Promise<NativeHuddleRewardProgress | null> => {
  const key = cacheKey(userId, options.sessionKey);
  const memory = memoryCache.get(key);
  if (memory && Date.now() - memory.cachedAt <= CACHE_TTL_MS) return memory.progress;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedProgress>;
    if (parsed.userId !== userId || parsed.sessionKey !== cacheSessionKey(userId, options.sessionKey) || typeof parsed.cachedAt !== "number" || Date.now() - parsed.cachedAt > CACHE_TTL_MS || !isProgress(parsed.progress)) return null;
    const cached: CachedProgress = { userId, sessionKey: parsed.sessionKey, cachedAt: parsed.cachedAt, progress: normalizeProgress(parsed.progress) };
    memoryCache.set(key, cached);
    return cached.progress;
  } catch {
    return null;
  }
};

const persist = async (userId: string, progress: NativeHuddleRewardProgress, sessionKey?: string | null) => {
  const key = cacheKey(userId, sessionKey);
  const cached: CachedProgress = { userId, sessionKey: cacheSessionKey(userId, sessionKey), cachedAt: Date.now(), progress };
  memoryCache.set(key, cached);
  await AsyncStorage.setItem(key, JSON.stringify(cached)).catch(() => undefined);
};

export const refreshNativeHuddleRewardProgress = async (userId: string, options: { accessToken?: string | null; force?: boolean; sessionKey?: string | null } = {}): Promise<NativeHuddleRewardProgress> => {
  const key = cacheKey(userId, options.sessionKey);
  if (!options.force) {
    const cached = await readCachedNativeHuddleRewardProgress(userId, options);
    if (cached) return cached;
  }
  if (options.force) inFlight.delete(key);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const request = (async () => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const { data, error } = await nativeExactTokenRpc<unknown>("refresh_huddle_promo_progress_v9", { p_time_zone: timeZone }, options.accessToken);
    if (error) throw new Error(error.message);
    const progress = normalizeProgress(data);
    await persist(userId, progress, options.sessionKey);
    return progress;
  })();
  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
};
