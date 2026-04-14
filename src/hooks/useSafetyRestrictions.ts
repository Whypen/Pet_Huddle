import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type RestrictionKey =
  | "chat_disabled"
  | "discovery_hidden"
  | "social_posting_disabled"
  | "marketplace_hidden"
  | "service_disabled"
  | "map_hidden"
  | "map_disabled";

export type RestrictionWindow = {
  active: boolean;
  enabled_at: string | null;
  expires_at: string | null;
  source: string | null;
  note: string | null;
};

export type RestrictionState = Partial<Record<RestrictionKey, RestrictionWindow>>;

const EMPTY_STATE: RestrictionState = {};

const normalizeState = (input: unknown): RestrictionState => {
  if (!input || typeof input !== "object") return EMPTY_STATE;
  const obj = input as Record<string, unknown>;
  const output: RestrictionState = {};
  const keys: RestrictionKey[] = [
    "chat_disabled",
    "discovery_hidden",
    "social_posting_disabled",
    "marketplace_hidden",
    "service_disabled",
    "map_hidden",
    "map_disabled",
  ];
  for (const key of keys) {
    const value = obj[key];
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    output[key] = {
      active: v.active === true,
      enabled_at: typeof v.enabled_at === "string" ? v.enabled_at : null,
      expires_at: typeof v.expires_at === "string" ? v.expires_at : null,
      source: typeof v.source === "string" ? v.source : null,
      note: typeof v.note === "string" ? v.note : null,
    };
  }
  return output;
};

export function useSafetyRestrictions() {
  const { user } = useAuth();
  const [restrictions, setRestrictions] = useState<RestrictionState>(EMPTY_STATE);
  const [loading, setLoading] = useState(false);

  const refreshRestrictions = useCallback(async () => {
    if (!user?.id) {
      setRestrictions(EMPTY_STATE);
      return EMPTY_STATE;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("get_my_active_restrictions" as never);
    setLoading(false);
    if (error) {
      return restrictions;
    }
    const next = normalizeState(data);
    setRestrictions(next);
    return next;
  }, [restrictions, user?.id]);

  useEffect(() => {
    void refreshRestrictions();
  }, [refreshRestrictions]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`safety-restrictions:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_moderation_restrictions",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void refreshRestrictions();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_moderation",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void refreshRestrictions();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshRestrictions, user?.id]);

  const isActive = useCallback(
    (key: RestrictionKey) => restrictions[key]?.active === true,
    [restrictions],
  );

  const expiryByKey = useMemo(() => {
    const output: Partial<Record<RestrictionKey, string | null>> = {};
    (Object.keys(restrictions) as RestrictionKey[]).forEach((key) => {
      output[key] = restrictions[key]?.expires_at ?? null;
    });
    return output;
  }, [restrictions]);

  return {
    restrictions,
    loading,
    isActive,
    expiryByKey,
    refreshRestrictions,
  };
}
