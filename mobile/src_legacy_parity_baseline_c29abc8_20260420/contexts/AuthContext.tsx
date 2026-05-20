import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { Platform } from "react-native";
import type { Session, User } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
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
  const [appleSignInAvailable, setAppleSignInAvailable] = useState(false);
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

  const signInWithApple = useCallback(async () => {
    if (Platform.OS !== "ios") {
      return { ok: false, error: "Sign in with Apple is only available on iOS." };
    }

    try {
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        throw new Error("Apple sign-in did not return an identity token.");
      }

      const authResult = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
        nonce: rawNonce,
      });

      if (authResult.error) {
        throw authResult.error;
      }

      if (credential.fullName) {
        const formattedFullName = AppleAuthentication.formatFullName(credential.fullName) || null;
        const givenName = credential.fullName.givenName ?? null;
        const familyName = credential.fullName.familyName ?? null;

        try {
          await supabase.auth.updateUser({
            data: {
              full_name: formattedFullName,
              given_name: givenName,
              family_name: familyName,
            },
          });
        } catch {
          // Best-effort only. Session sign-in already succeeded.
        }

        if (authResult.data.user?.id && formattedFullName) {
          try {
            await supabase
              .from("profiles")
              .update({
                display_name: formattedFullName,
                legal_name: formattedFullName,
              })
              .eq("id", authResult.data.user.id);
          } catch {
            // Best-effort only. Profile row may not exist yet.
          }
        }
      }

      return { ok: true, error: null };
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "The user canceled the authorization attempt") {
        return { ok: false, error: "Sign in canceled." };
      }

      const message = error instanceof Error ? error.message : "Apple sign-in failed.";
      return { ok: false, error: message };
    }
  }, []);

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
      if (Platform.OS !== "ios") {
        if (mounted) setAppleSignInAvailable(false);
        return;
      }
      try {
        const available = await AppleAuthentication.isAvailableAsync();
        if (mounted) setAppleSignInAvailable(available);
      } catch {
        if (mounted) setAppleSignInAvailable(false);
      }
    })();

    return () => {
      mounted = false;
    };
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
      appleSignInAvailable,
      refreshingProfile,
      refreshProfile,
      signInWithApple,
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
      appleSignInAvailable,
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
      signInWithApple,
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
