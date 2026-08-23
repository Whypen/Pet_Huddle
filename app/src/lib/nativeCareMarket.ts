import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { nativeExactTokenRpc } from "./nativeExactTokenRequest";

export type NativeCareMarketSnapshot = {
  market_id: string;
  country: string;
  city: string;
  is_active: boolean;
  has_interest: boolean;
  wants_to_be_carer: boolean;
  wants_to_book_care: boolean;
  updated_at?: string | null;
};

const emptySnapshot: NativeCareMarketSnapshot = {
  market_id: "",
  country: "",
  city: "",
  is_active: false,
  has_interest: false,
  wants_to_be_carer: false,
  wants_to_book_care: false,
};

export async function fetchNativeCareMarket(accessToken?: string | null) {
  const { data, error } = await nativeExactTokenRpc<NativeCareMarketSnapshot>("get_my_care_market", {}, accessToken);
  if (error) throw error;
  return { ...emptySnapshot, ...(data || {}) };
}

export async function saveNativeCareInterest(input: { wantsToBeCarer: boolean; wantsToBookCare: boolean; accessToken?: string | null }) {
  const { data, error } = await nativeExactTokenRpc("save_my_care_interest", {
    p_wants_to_be_carer: input.wantsToBeCarer,
    p_wants_to_book_care: input.wantsToBookCare,
  }, input.accessToken);
  if (error) throw error;
  return data;
}

export async function removeNativeCareInterest(accessToken?: string | null) {
  const { data, error } = await nativeExactTokenRpc("remove_my_care_interest", {}, accessToken);
  if (error) throw error;
  return data;
}

export function useNativeCareMarket({ accessToken, userId }: { accessToken?: string | null; userId?: string | null }) {
  const [snapshot, setSnapshot] = useState<NativeCareMarketSnapshot>(emptySnapshot);
  const [resolved, setResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    if (!userId || !accessToken) {
      setSnapshot(emptySnapshot);
      setResolved(true);
      return emptySnapshot;
    }
    try {
      const next = await fetchNativeCareMarket(accessToken);
      if (generation.current === current) { setSnapshot(next); setError(null); }
      return next;
    } catch (cause) {
      if (generation.current === current) { setSnapshot(emptySnapshot); setError(cause instanceof Error ? cause.message : "care_market_unavailable"); }
      return emptySnapshot;
    } finally {
      if (generation.current === current) setResolved(true);
    }
  }, [accessToken, userId]);

  useEffect(() => { setResolved(false); void refresh(); return () => { generation.current += 1; }; }, [refresh]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    return () => subscription.remove();
  }, [refresh]);
  return { ...snapshot, resolved, error, refresh };
}
