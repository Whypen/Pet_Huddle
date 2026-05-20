import { supabase } from "./supabase";

const RESTRICTIONS_CACHE_TTL_MS = 30_000;
let restrictionsCache: { data: unknown; cachedAt: number } | null = null;
let restrictionsInFlight: Promise<unknown> | null = null;

export const clearNativeRestrictionsCache = () => {
  restrictionsCache = null;
  restrictionsInFlight = null;
};

export const fetchNativeRestrictionsSnapshot = async (options: { force?: boolean } = {}) => {
  if (!options.force && restrictionsCache && Date.now() - restrictionsCache.cachedAt <= RESTRICTIONS_CACHE_TTL_MS) {
    return restrictionsCache.data;
  }

  if (!options.force && restrictionsInFlight) return restrictionsInFlight;

  restrictionsInFlight = (async () => {
    const { data, error } = await (supabase.rpc as unknown as (
      fn: string,
    ) => Promise<{ data: unknown; error: unknown }>)("get_my_active_restrictions");
    if (error) return null;
    restrictionsCache = { data, cachedAt: Date.now() };
    return data;
  })();

  try {
    return await restrictionsInFlight;
  } finally {
    restrictionsInFlight = null;
  }
};

export type NativeRestrictionKey =
  | "chat_disabled"
  | "discovery_hidden"
  | "social_posting_disabled"
  | "marketplace_hidden"
  | "service_disabled"
  | "map_hidden"
  | "map_disabled";

export async function isNativeRestrictionActive(key: NativeRestrictionKey): Promise<boolean> {
  const data = await fetchNativeRestrictionsSnapshot();
  if (!data || typeof data !== "object") return false;
  const state = data as Partial<Record<NativeRestrictionKey, { active?: boolean }>>;
  return state[key]?.active === true;
}
