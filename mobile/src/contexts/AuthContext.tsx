import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { AuthContext, type AuthContextValue } from "./authContextValue";

export type VerificationStatus = "Pending" | "Verified" | "Rejected";

export type Profile = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  legal_name: string | null;
  phone: string | null;
  dob: string | null;
  verification_status: VerificationStatus | null;
  social_album: string[] | null;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [refreshingProfile, setRefreshingProfile] = useState(false);

  const user = session?.user ?? null;

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    setRefreshingProfile(true);
    try {
      const res = await supabase
        .from("profiles")
        .select("id,user_id,display_name,legal_name,phone,dob,verification_status,social_album")
        .eq("id", user.id)
        .maybeSingle();
      if (res.error) throw res.error;
      setProfile(res.data as Profile | null);
    } finally {
      setRefreshingProfile(false);
    }
  }, [user]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(res.data.session ?? null);
    })();
    const { data } = supabase.auth.onAuthStateChange((_evt, next) => {
      setSession(next);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    refreshProfile().catch(() => {
      // no-op, errors are surfaced on screens where needed
    });
  }, [refreshProfile, user?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      refreshingProfile,
      refreshProfile,
    }),
    [profile, refreshProfile, refreshingProfile, session, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
