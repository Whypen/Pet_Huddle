import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getAuthenticatorAssurance, listTotpFactors } from "@/lib/mfa";
import { isPasskeySupportedBrowser, listPasskeyFactors } from "@/lib/passkey";
import { trackDeviceFingerprint } from "@/lib/deviceFingerprint";
import {
  SIGNUP_PASSWORD_SESSION_KEY,
  SIGNUP_STORAGE_KEY,
  buildScopedStorageKey,
  normalizeStorageOwner,
} from "@/lib/signupOnboarding";

export interface Profile {
  id: string;
  user_id?: string | null;
  display_name: string | null;
  legal_name: string | null;
  social_id?: string | null;
  phone: string | null;
  prefs?: Record<string, unknown> | null;
  verification_status?: string | null;
  is_verified?: boolean | null;
  verification_comment?: string | null;
  is_admin?: boolean | null;
  avatar_url: string | null;
  bio: string | null;
  gender_genre: string | null;
  orientation: string | null;
  dob: string | null;
  height: number | null;
  weight: number | null;
  weight_unit: string | null;
  degree: string | null;
  school: string | null;
  major: string | null;
  affiliation: string | null;
  occupation: string | null;
  pet_experience: string[] | null;
  experience_years: number | null;
  relationship_status: string | null;
  has_car: boolean;
  languages: string[] | null;
  location_name: string | null;
  location_country?: string | null;
  location_district?: string | null;
  user_role: string;
  tier?: string | null;
  effective_tier?: string | null;
  family_owner_id?: string | null;
  subscription_status?: string | null;
  stars_count?: number | null;
  mesh_alert_count?: number | null;
  media_credits?: number | null;
  family_slots?: number | null;
  onboarding_completed: boolean;
  owns_pets: boolean;
  non_social?: boolean | null;
  availability_status: string[];
  social_album?: string[] | null;
  show_gender: boolean;
  show_orientation: boolean;
  show_age: boolean;
  show_height: boolean;
  show_weight: boolean;
  show_academic: boolean;
  show_affiliation: boolean;
  show_occupation: boolean;
  show_bio: boolean;
  show_relationship_status?: boolean;
  last_lat?: number | null;
  last_lng?: number | null;
  hide_from_map?: boolean | null;
  care_circle?: string[] | null;
  last_active_at?: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    displayName: string,
    phone: string,
    consent?: { acceptedAtIso: string; version: string }
  ) => Promise<{ error: Error | null }>;
  signIn: (
    email: string,
    password: string,
    phone?: string
  ) => Promise<{ error: Error | null; mfaRequired: boolean; mfaFactorId: string | null; mfaMethod: "totp" | "passkey" | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const useIsAdmin = () => {
  const { profile } = useAuth();
  return profile?.is_admin === true;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const profileColumns = [
    "id",
    "user_id",
    "display_name",
    "legal_name",
    "social_id",
    "phone",
    "avatar_url",
    "bio",
    "gender_genre",
    "orientation",
    "dob",
    "height",
    "weight",
    "weight_unit",
    "degree",
    "school",
    "major",
    "affiliation",
    "occupation",
    "pet_experience",
    "experience_years",
    "relationship_status",
    "has_car",
    "languages",
    "location_name",
    "location_country",
    "location_district",
    "is_admin",
    "user_role",
    "tier",
    "effective_tier",
    "subscription_status",
    "stars_count",
    "mesh_alert_count",
    "media_credits",
    "family_slots",
    "onboarding_completed",
    "owns_pets",
    "non_social",
    "availability_status",
    "show_gender",
    "show_orientation",
    "show_age",
    "show_height",
    "show_weight",
    "show_academic",
    "show_affiliation",
    "show_occupation",
    "show_bio",
    "show_relationship_status",
    "last_lat",
    "last_lng",
    "care_circle",
    "verification_status",
    "is_verified",
    "verification_comment",
    "social_album",
    "prefs",
    "hide_from_map",
    "last_active_at",
  ] as const;
  const profileSelect = profileColumns.join(", ");
  const activityTouchKey = "huddle_last_activity_touch_at";
  const previousUserIdRef = useRef<string | null>(null);

  const clearTransientUserStorage = useCallback(() => {
    const scopedPrefixes = [
      "discovery_handled_",
      "discovery_passed_",
      "discovery_passed_session_",
      "discovery_matched_",
      "discovery_filters_",
      "discovery_session_",
      "chat_room_seen_",
      "chat_direct_peer_by_room_",
      "seen_match_modal_",
      "chats_unread_",
      "chats_unread_seen_",
      "chats_unread_ack_",
      "setprofile_prefill:",
      "setpet_prefill:",
      "huddle_pin:",
      "huddle_social_pins:",
      "huddle_social_saves:",
      "huddle_offline_actions:",
    ] as const;
    const globalUnsafeKeys = [
      "huddle_pin",
      "huddle_social_pins",
      "huddle_social_saves",
      "huddle_offline_actions",
      "seen_match_modal",
    ] as const;
    try {
      const localKeys = Object.keys(localStorage);
      localKeys.forEach((key) => {
        if (globalUnsafeKeys.includes(key as (typeof globalUnsafeKeys)[number])) {
          localStorage.removeItem(key);
          return;
        }
        if (scopedPrefixes.some((prefix) => key.startsWith(prefix))) {
          localStorage.removeItem(key);
        }
      });
      const sessionKeys = Object.keys(sessionStorage);
      sessionKeys.forEach((key) => {
        if (scopedPrefixes.some((prefix) => key.startsWith(prefix))) {
          sessionStorage.removeItem(key);
        }
      });
    } catch {
      // best-effort cleanup only
    }
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(profileSelect)
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setProfile(null);
        return;
      }

      let effectiveTier = data.tier || "free";
      let familyOwnerId: string | null = null;
      const { data: family } = await supabase
        .from("family_members" as "profiles")
        .select("inviter_user_id" as "*")
        .eq("invitee_user_id" as "id", userId)
        .eq("status" as "id", "accepted")
        .maybeSingle() as unknown as { data: { inviter_user_id?: string } | null };

      if (family?.inviter_user_id) {
        familyOwnerId = family.inviter_user_id;
        const { data: inviter } = await supabase
          .from("profiles")
          .select("tier")
          .eq("id", family.inviter_user_id)
          .maybeSingle() as unknown as { data: { tier?: string } | null };
        if (inviter?.tier) {
          effectiveTier = inviter.tier;
        }
      }

      setProfile({ ...(data as Profile), effective_tier: effectiveTier, family_owner_id: familyOwnerId });
    } catch (error) {
      console.error("[AuthContext] fetchProfile failed", error);
      setProfile(null);
    }
  }, [profileSelect]);

  const touchProfileActivity = useCallback(async () => {
    try {
      const now = Date.now();
      const raw = localStorage.getItem(activityTouchKey);
      const lastTouched = raw ? Number(raw) : 0;
      if (Number.isFinite(lastTouched) && now - lastTouched < 5 * 60 * 1000) {
        return;
      }
      const { error } = await supabase.rpc("touch_profile_activity");
      if (!error) {
        localStorage.setItem(activityTouchKey, String(now));
      }
    } catch {
      // best-effort heartbeat only
    }
  }, []);

  const hydrateValidatedSession = useCallback(async (candidateSession: Session | null) => {
    if (!candidateSession) {
      supabase.realtime.setAuth(null);
      setSession(null);
      setUser(null);
      setProfile(null);
      previousUserIdRef.current = null;
      clearTransientUserStorage();
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      if (import.meta.env.DEV) {
        console.warn("[AuthContext] clearing stale local session", {
          error: error?.message ?? null,
        });
      }
      await supabase.auth.signOut({ scope: "local" });
      supabase.realtime.setAuth(null);
      setSession(null);
      setUser(null);
      setProfile(null);
      previousUserIdRef.current = null;
      clearTransientUserStorage();
      setLoading(false);
      return;
    }

    supabase.realtime.setAuth(candidateSession.access_token ?? null);
    const aal = await getAuthenticatorAssurance(supabase);
    const isMfaPending = aal.nextLevel === "aal2" && aal.currentLevel !== "aal2";
    setSession(candidateSession);
    if (isMfaPending) {
      // Keep public routes visible until MFA challenge is completed.
      setUser(null);
      setProfile(null);
      previousUserIdRef.current = data.user.id;
      setLoading(false);
      return;
    }
    if (previousUserIdRef.current && previousUserIdRef.current !== data.user.id) {
      clearTransientUserStorage();
    }
    previousUserIdRef.current = data.user.id;
    setUser(data.user);
    await fetchProfile(data.user.id);
    void touchProfileActivity();
    setLoading(false);
  }, [clearTransientUserStorage, fetchProfile, touchProfileActivity]);

  useEffect(() => {
    if (!user) return;
    void touchProfileActivity();
  }, [touchProfileActivity, user]);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        void hydrateValidatedSession(session);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      void hydrateValidatedSession(session);
    });

    return () => subscription.unsubscribe();
  }, [hydrateValidatedSession]);

  const signUp = async (
    email: string,
    password: string,
    displayName: string,
    phone: string,
    consent?: { acceptedAtIso: string; version: string }
  ) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "");
    if (import.meta.env.DEV) console.debug("Attempting Signup to:", supabaseUrl);
    const redirectUrl = `${window.location.origin}/`;

    let data: { user: { id: string } | null } | null = null;
    let error: { message?: string } | null = null;
    try {
      const res = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            display_name: displayName || email.split("@")[0],
            phone,
            ...(consent?.acceptedAtIso
              ? {
                  consent_terms_privacy_at: consent.acceptedAtIso,
                  consent_version: consent.version,
                }
              : {}),
          },
        },
      });
      data = res.data as unknown as { user: { id: string } | null };
      error = res.error as unknown as { message?: string } | null;
    } catch (e: unknown) {
      console.error("[AuthContext] signUp network error", e);
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }

    if (!error && data?.user?.id) {
      // Best-effort consent audit log. This will succeed when a session exists.
      if (consent?.acceptedAtIso) {
        await supabase
          .from("consent_logs" as "profiles")
          .insert({
            user_id: data.user.id,
            consent_type: "terms_privacy",
            consent_version: consent.version,
            accepted_at: consent.acceptedAtIso,
            metadata: { source: "web_signup" },
          } as Record<string, unknown>)
          .throwOnError()
          .catch(() => {
            // If email confirmation is required, the user may not have an active session yet.
          });
      }

      void trackDeviceFingerprint("signup");
    }

    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string, phone?: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "");
    if (import.meta.env.DEV) console.debug("Attempting Login to:", supabaseUrl);
    try {
      const signInResult = phone
        ? await supabase.auth.signInWithPassword({ phone, password })
        : await supabase.auth.signInWithPassword({ email, password });
      const error = signInResult.error as Error | null;
      if (error) {
        return { error, mfaRequired: false, mfaFactorId: null, mfaMethod: null };
      }

      const aal = await getAuthenticatorAssurance(supabase);
      const verifiedPasskeys = (await listPasskeyFactors(supabase)).filter((factor) => factor.status === "verified");
      const factors = await listTotpFactors(supabase);
      const verifiedTotp = factors.find((factor) => factor.status === "verified") || null;
      const hasVerifiedFactor = verifiedPasskeys.length > 0 || Boolean(verifiedTotp?.id);
      if (aal.currentLevel !== "aal2" && hasVerifiedFactor) {
        const passkeySupported = await isPasskeySupportedBrowser();
        if (verifiedPasskeys.length > 0 && passkeySupported) {
          return {
            error: null,
            mfaRequired: true,
            mfaFactorId: verifiedPasskeys[0].id,
            mfaMethod: "passkey",
          };
        }
        if (verifiedTotp?.id) {
          return { error: null, mfaRequired: true, mfaFactorId: verifiedTotp.id, mfaMethod: "totp" };
        }
        await supabase.auth.signOut({ scope: "local" });
        return {
          error: new Error("Two-factor authentication is required but no compatible authenticator is available on this device."),
          mfaRequired: false,
          mfaFactorId: null,
          mfaMethod: null,
        };
      }

      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id;
      if (uid) {
        await supabase.from("profiles").update({ last_login: new Date().toISOString() } as Record<string, unknown>).eq("id", uid);
        void trackDeviceFingerprint("login");
      }

      return { error: null, mfaRequired: false, mfaFactorId: null, mfaMethod: null };
    } catch (e: unknown) {
      console.error("[AuthContext] signIn network error", e);
      return { error: e instanceof Error ? e : new Error(String(e)), mfaRequired: false, mfaFactorId: null, mfaMethod: null };
    }
  };

  const signOut = async () => {
    const emailOwner = normalizeStorageOwner(session?.user?.email || profile?.phone || "");
    const scopedSignupKey = buildScopedStorageKey(SIGNUP_STORAGE_KEY, emailOwner);
    const scopedSignupPasswordKey = buildScopedStorageKey(SIGNUP_PASSWORD_SESSION_KEY, emailOwner);
    await supabase.auth.signOut();
    supabase.realtime.setAuth(null);
    setProfile(null);
    previousUserIdRef.current = null;
    clearTransientUserStorage();
    // Clear local storage stale records
    localStorage.removeItem("rememberedIdentifier");
    localStorage.removeItem("auth_login_identifier");
    localStorage.removeItem("huddle_stay_logged_in");
    localStorage.removeItem(scopedSignupKey);
    localStorage.removeItem(SIGNUP_STORAGE_KEY);
    sessionStorage.removeItem(scopedSignupPasswordKey);
    sessionStorage.removeItem(SIGNUP_PASSWORD_SESSION_KEY);
    localStorage.removeItem("huddle_offline_actions");
    localStorage.removeItem("pending_addon");
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signUp,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
