import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { AuthContext, type AuthContextValue } from "./authContextValue";
import {
  authenticateBiometricUnlock,
  disableBiometricUnlock,
  enableBiometricUnlock,
  getBiometricSupport,
  getBiometricUnlockEnabled,
} from "../lib/biometricUnlock";

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
  prefs?: Record<string, unknown> | null;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [refreshingProfile, setRefreshingProfile] = useState(false);
  const [biometricUnlockSupported, setBiometricUnlockSupported] = useState(false);
  const [biometricUnlockEnabled, setBiometricUnlockEnabledState] = useState(false);
  const [biometricUnlockLabel, setBiometricUnlockLabel] = useState("Use Biometrics");
  const [unlockConfigReady, setUnlockConfigReady] = useState(false);
  const [unlockRequired, setUnlockRequired] = useState(false);
  const [privacyCovered, setPrivacyCovered] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

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
        .select("id,user_id,display_name,legal_name,phone,dob,verification_status,social_album,prefs")
        .eq("id", user.id)
        .maybeSingle();
      if (res.error) throw res.error;
      setProfile(res.data as Profile | null);
    } finally {
      setRefreshingProfile(false);
    }
  }, [user]);

  const refreshBiometricUnlock = useCallback(async () => {
    if (!session) {
      setUnlockConfigReady(true);
      setBiometricUnlockSupported(false);
      setBiometricUnlockEnabledState(false);
      setUnlockRequired(false);
      setPrivacyCovered(false);
      return;
    }
    try {
      setPrivacyCovered(true);
      const [support, enabled] = await Promise.all([
        getBiometricSupport(),
        getBiometricUnlockEnabled(),
      ]);
      setBiometricUnlockSupported(support.supported);
      setBiometricUnlockLabel(support.label);
      const effectiveEnabled = support.supported && enabled;
      setBiometricUnlockEnabledState(effectiveEnabled);
      if (!support.supported) {
        setUnlockRequired(false);
        setPrivacyCovered(false);
      } else if (effectiveEnabled) {
        setUnlockRequired(true);
      } else {
        setUnlockRequired(false);
        setPrivacyCovered(false);
      }
    } catch {
      setBiometricUnlockSupported(false);
      setBiometricUnlockEnabledState(false);
      setBiometricUnlockLabel("Use Biometrics");
      setUnlockRequired(false);
      setPrivacyCovered(false);
    } finally {
      setUnlockConfigReady(true);
    }
  }, [session]);

  const setBiometricUnlockEnabled = useCallback(async (next: boolean) => {
    if (next) {
      const result = await enableBiometricUnlock(biometricUnlockLabel);
      if (!result.ok) {
        setUnlockError(result.error);
        setBiometricUnlockEnabledState(false);
        return { ok: false, error: result.error };
      }
      setUnlockError(null);
      setBiometricUnlockEnabledState(true);
      if (session) setUnlockRequired(true);
      return { ok: true, error: null };
    }
    await disableBiometricUnlock();
    setUnlockError(null);
    setBiometricUnlockEnabledState(false);
    setUnlockRequired(false);
    setPrivacyCovered(false);
    return { ok: true, error: null };
  }, [biometricUnlockLabel, session]);

  const unlockApp = useCallback(async () => {
    const result = await authenticateBiometricUnlock();
    if (!result.ok) {
      setUnlockError(result.error);
      return { ok: false, error: result.error };
    }
    setUnlockError(null);
    setUnlockRequired(false);
    setPrivacyCovered(false);
    return { ok: true, error: null };
  }, []);

  const signInAgainFromLock = useCallback(async () => {
    await supabase.auth.signOut();
    setUnlockConfigReady(true);
    setUnlockRequired(false);
    setPrivacyCovered(false);
    setUnlockError(null);
  }, []);

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
    if (!session) {
      setUnlockConfigReady(true);
      setUnlockRequired(false);
      setPrivacyCovered(false);
      return;
    }
    setUnlockConfigReady(false);
    setPrivacyCovered(true);
    void refreshBiometricUnlock();
  }, [refreshBiometricUnlock, session]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (!session) {
        setPrivacyCovered(false);
        return;
      }
      if (nextState === "inactive" || nextState === "background") {
        setPrivacyCovered(true);
        if (biometricUnlockEnabled) setUnlockRequired(true);
        return;
      }
      if (nextState === "active") {
        if (!biometricUnlockEnabled) {
          setPrivacyCovered(false);
        } else {
          setUnlockRequired(true);
        }
      }
    });
    return () => {
      subscription.remove();
    };
  }, [biometricUnlockEnabled, session]);

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
      biometricUnlockSupported,
      biometricUnlockEnabled,
      biometricUnlockLabel,
      unlockConfigReady,
      unlockRequired,
      privacyCovered,
      unlockError,
      refreshBiometricUnlock,
      setBiometricUnlockEnabled,
      unlockApp,
      signInAgainFromLock,
    }),
    [
      biometricUnlockEnabled,
      biometricUnlockLabel,
      biometricUnlockSupported,
      unlockConfigReady,
      profile,
      privacyCovered,
      refreshBiometricUnlock,
      refreshProfile,
      refreshingProfile,
      session,
      setBiometricUnlockEnabled,
      signInAgainFromLock,
      unlockApp,
      unlockError,
      unlockRequired,
      user,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
