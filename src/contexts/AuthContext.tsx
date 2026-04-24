import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getAuthenticatorAssurance, listTotpFactors } from "@/lib/mfa";
import { trackDeviceFingerprint } from "@/lib/deviceFingerprint";
import { getAuthRuntimeEnv } from "@/lib/authRuntimeEnv";
import {
  clearSignupScopedStorage,
  SIGNUP_PASSWORD_SESSION_KEY,
  SIGNUP_STORAGE_KEY,
  buildScopedStorageKey,
  normalizeStorageOwner,
} from "@/lib/signupOnboarding";
import { fetchLivePrices, resolvePricingHints } from "@/lib/stripePrices";
import { normalizeMembershipTier } from "@/lib/membership";
import { authLogin, authSignup } from "@/lib/publicAuthApi";
import { mapAuthFailureMessage } from "@/lib/authErrorMessages";

export interface Profile {
  id: string;
  user_id?: string | null;
  email?: string | null;
  display_name: string | null;
  legal_name: string | null;
  social_id?: string | null;
  phone: string | null;
  phone_verification_status?: "unverified" | "pending" | "verified" | null;
  phone_verified_at?: string | null;
  prefs?: Record<string, unknown> | null;
  verification_status?: string | null;
  is_verified?: boolean | null;
  verification_comment?: string | null;
  human_verification_status?: string | null;
  human_verified_at?: string | null;
  card_verification_status?: string | null;
  card_verified?: boolean | null;
  card_brand?: string | null;
  card_last4?: string | null;
  verification_rejection_code?: string | null;
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
  stripe_subscription_id?: string | null;
  subscription_current_period_end?: string | null;
  subscription_cancel_at_period_end?: boolean | null;
  subscription_cancel_requested_at?: string | null;
  subscription_cancel_reason?: string | null;
  subscription_cancel_reason_other?: string | null;
  share_perks_subscription_id?: string | null;
  share_perks_subscription_status?: string | null;
  share_perks_subscription_current_period_end?: string | null;
  share_perks_cancel_at_period_end?: boolean | null;
  share_perks_cancel_requested_at?: string | null;
  share_perks_cancel_reason?: string | null;
  share_perks_cancel_reason_other?: string | null;
  stars_count?: number | null;
  mesh_alert_count?: number | null;
  media_credits?: number | null;
  family_slots?: number | null;
  onboarding_completed: boolean;
  email_verified: boolean;
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

type AuthUiError = Error & { details?: unknown };
const AUTH_FLOW_TIMEOUT_MS = 12000;

const buildAuthUiError = (message: string, details?: unknown): AuthUiError => {
  const error = new Error(message) as AuthUiError;
  if (details !== undefined) error.details = details;
  return error;
};

const withTimeout = async <T,>(promise: Promise<T>, message: string, timeoutMs = AUTH_FLOW_TIMEOUT_MS): Promise<T> => {
  let timeoutId: number | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** True while a new session is being hydrated (user→profile async gap). */
  hydrating: boolean;
  mfaPending: boolean;
  signUp: (
    email: string,
    password: string,
    displayName: string,
    phone: string,
    consent?: { acceptedAtIso: string; version: string },
    turnstileToken?: string,
  ) => Promise<{ error: Error | null }>;
  signIn: (
    email: string,
    password: string,
    phone?: string,
    turnstileToken?: string,
  ) => Promise<{ error: Error | null; mfaRequired: boolean; mfaFactorId: string | null; mfaMethod: "totp" | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const ACTIVITY_TOUCH_KEY = "huddle_last_activity_touch_at";
const EXPIRE_RESTRICTIONS_SESSION_KEY = "huddle:expire-restrictions-ts";
const EXPIRE_RESTRICTIONS_TTL_MS = 10 * 60 * 1000; // 10 minutes per tab session

const PROFILE_COLUMNS = [
  "id", "user_id", "email", "display_name", "legal_name", "social_id",
  "phone", "phone_verification_status", "phone_verified_at",
  "avatar_url", "bio", "gender_genre", "orientation", "dob",
  "height", "weight", "weight_unit", "degree", "school", "major",
  "affiliation", "occupation", "pet_experience", "experience_years",
  "relationship_status", "has_car", "languages", "location_name",
  "location_country", "location_district", "is_admin", "user_role",
  "tier", "effective_tier",
  "subscription_status", "stripe_subscription_id",
  "subscription_current_period_end", "subscription_cancel_at_period_end",
  "subscription_cancel_requested_at", "subscription_cancel_reason",
  "subscription_cancel_reason_other",
  "share_perks_subscription_id", "share_perks_subscription_status",
  "share_perks_subscription_current_period_end",
  "share_perks_cancel_at_period_end", "share_perks_cancel_requested_at",
  "share_perks_cancel_reason", "share_perks_cancel_reason_other",
  "stars_count", "mesh_alert_count", "media_credits", "family_slots",
  "onboarding_completed", "email_verified", "owns_pets", "non_social",
  "availability_status", "show_gender", "show_orientation", "show_age",
  "show_height", "show_weight", "show_academic", "show_affiliation",
  "show_occupation", "show_bio", "show_relationship_status",
  "last_lat", "last_lng", "care_circle",
  "verification_status", "is_verified", "verification_comment",
  "human_verification_status", "human_verified_at",
  "card_verification_status", "card_verified", "card_brand", "card_last4",
  "verification_rejection_code", "social_album", "prefs",
  "hide_from_map", "last_active_at",
  "family_owner_id",
  "subscription_cancel_reason_other",
  "share_perks_cancel_reason_other",
] as const;
const PROFILE_SELECT = PROFILE_COLUMNS.join(", ");

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`);
  return `{${entries.join(",")}}`;
};

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
  const [hydrating, setHydrating] = useState(false);
  const [mfaPending, setMfaPending] = useState(false);

  const lastPriceHintsRef = useRef("");
  const previousUserIdRef = useRef<string | null>(null);
  const hydrationRunRef = useRef(0);

  const beginHydrationRun = useCallback(() => {
    hydrationRunRef.current += 1;
    return hydrationRunRef.current;
  }, []);

  const isHydrationRunCurrent = useCallback((runId: number) => {
    return hydrationRunRef.current === runId;
  }, []);

  const clearTransientUserStorage = useCallback((options?: { preserveSignupFlow?: boolean }) => {
    const preserveSignupFlow = options?.preserveSignupFlow === true;
    const scopedPrefixes = [
      ...(
        preserveSignupFlow
          ? []
          : [
              "huddle_signup_v2:",
              "huddle_signup_password_v1:",
              "signup_pending_verification_v1:",
              "setprofile_prefill:",
              "setpet_prefill:",
            ] as const
      ),
      "discovery_handled_",
      "discovery_passed_",
      "discovery_passed_session_",
      "discovery_matched_",
      "discovery_filters_",
      "discovery_session_",
      "chat_room_seen_",
      "chat_direct_peer_by_room_",
      "chats_unread_",
      "chats_unread_seen_",
      "chats_unread_ack_",
      "huddle_pin:",
      "huddle_social_pins:",
      "huddle_social_saves:",
      "huddle_offline_actions:",
    ] as const;
    const globalUnsafeKeys = [
      ...(
        preserveSignupFlow
          ? []
          : [
              "huddle_signup_v2",
              "huddle_signup_password_v1",
              "signup_pending_verification_v1",
              "signup_verify_submitted_v1",
              "signup_verify_docs_submitted",
              "huddle_vi_status",
              "setprofile_prefill",
              "setpet_prefill",
            ] as const
      ),
      "huddle_pin",
      "huddle_social_pins",
      "huddle_social_saves",
      "huddle_offline_actions",
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
        if (globalUnsafeKeys.includes(key as (typeof globalUnsafeKeys)[number])) {
          sessionStorage.removeItem(key);
          return;
        }
        if (scopedPrefixes.some((prefix) => key.startsWith(prefix))) {
          sessionStorage.removeItem(key);
        }
      });
    } catch {
      // best-effort cleanup only
    }
  }, []);

  const resetAuthBoundary = useCallback((runId?: number, options?: { preserveSignupFlow?: boolean }) => {
    if (typeof runId === "number" && !isHydrationRunCurrent(runId)) return;
    supabase.realtime.setAuth(null);
    setSession(null);
    setUser(null);
    setProfile(null);
    setMfaPending(false);
    previousUserIdRef.current = null;
    clearTransientUserStorage({ preserveSignupFlow: options?.preserveSignupFlow });
    if (!options?.preserveSignupFlow) {
      clearSignupScopedStorage([]);
    }
  }, [clearTransientUserStorage, isHydrationRunCurrent]);

  const fetchProfile = useCallback(async (
    userId: string,
    runId: number,
    _options: { preserveExisting?: boolean } = {},
  ) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("id", userId)
        .maybeSingle();
      if (!isHydrationRunCurrent(runId)) return;
      if (error) throw error;
      if (!data) {
        // Never preserve stale in-memory profile state when the row is missing.
        setProfile(null);
        return;
      }

      const resolveFamilyOwnerId = async (seedUserId: string): Promise<string> => {
        let current = seedUserId;
        const seen = new Set<string>([seedUserId]);
        for (let depth = 0; depth < 8; depth += 1) {
          const { data: parentRow } = await supabase
            .from("family_members")
            .select("inviter_user_id")
            .eq("invitee_user_id", current)
            .eq("status", "accepted")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle() as unknown as { data: { inviter_user_id?: string } | null };
          if (!isHydrationRunCurrent(runId)) return seedUserId;
          const parent = String(parentRow?.inviter_user_id || "").trim();
          if (!parent || seen.has(parent)) break;
          seen.add(parent);
          current = parent;
        }
        return current;
      };
      const ownerId = await resolveFamilyOwnerId(userId);
      if (!isHydrationRunCurrent(runId)) return;
      const familyOwnerId = ownerId !== userId ? ownerId : null;
      const effectiveTier = normalizeMembershipTier(String(data.effective_tier ?? data.tier ?? "free"));

      // Auto-expire any restriction/suspension that has passed its deadline.
      // Rate-limited to once per 10 min per tab session to avoid firing on every realtime/focus tick.
      try {
        const lastRan = Number(sessionStorage.getItem(EXPIRE_RESTRICTIONS_SESSION_KEY) || 0);
        if (!Number.isFinite(lastRan) || Date.now() - lastRan > EXPIRE_RESTRICTIONS_TTL_MS) {
          sessionStorage.setItem(EXPIRE_RESTRICTIONS_SESSION_KEY, String(Date.now()));
          void (supabase.rpc as unknown as (fn: string) => Promise<unknown>)("expire_account_restrictions");
        }
      } catch {
        // best-effort only
      }

      const nextProfile = { ...(data as Profile), effective_tier: effectiveTier, family_owner_id: familyOwnerId };
      const nextProfileKey = stableStringify(nextProfile);
      setProfile((prev) => {
        if (prev && stableStringify(prev) === nextProfileKey) {
          return prev;
        }
        return nextProfile;
      });

      // Warm pricing cache in the background so Premium / upsell UI can
      // render the user's resolved currency without a visible flash.
      // Deduplicated: skip if same country+currency hints as last call.
      void (async () => {
        const profilePrefs = (data as Profile).prefs as Record<string, unknown> | null | undefined;
        const savedPricingCurrency = typeof profilePrefs?.pricing_currency === "string"
          ? profilePrefs.pricing_currency
          : null;
        const hints = await resolvePricingHints({
          userId,
          profileCountry: (data as Profile).location_country ?? null,
          profileCurrency: savedPricingCurrency,
        });
        const hintsKey = `${hints.country ?? ""}:${hints.currency ?? ""}`;
        if (lastPriceHintsRef.current === hintsKey) return;
        lastPriceHintsRef.current = hintsKey;
        await fetchLivePrices({
          country: hints.country,
          currency: hints.currency,
        });
      })();
    } catch (error) {
      if (!isHydrationRunCurrent(runId)) return;
      console.error("[AuthContext] fetchProfile failed", error);
      setProfile(null);
    }
  }, [isHydrationRunCurrent]);

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
    const runId = beginHydrationRun();
    if (!candidateSession) {
      resetAuthBoundary(runId, { preserveSignupFlow: true });
      setLoading(false);
      setHydrating(false);
      return;
    }

    // Do NOT call setLoading(true) here. Loading starts as `true` and is only
    // ever set to `false` — re-raising it on subsequent auth state changes
    // (e.g. after signInWithPassword) causes PublicRoute to unmount the Auth
    // component, destroying modal state like emailModalOpen.
    // Instead, set `hydrating` to signal that user→profile is in flight.
    setHydrating(true);
    const { data, error } = await supabase.auth.getUser();
    if (!isHydrationRunCurrent(runId)) return;
    if (error || !data.user) {
      if (import.meta.env.DEV) {
        console.warn("[AuthContext] clearing stale local session", {
          error: error?.message ?? null,
        });
      }
      await supabase.auth.signOut({ scope: "local" });
      if (!isHydrationRunCurrent(runId)) return;
      resetAuthBoundary(runId, { preserveSignupFlow: true });
      setLoading(false);
      setHydrating(false);
      return;
    }

    const effectiveSession = candidateSession;
    supabase.realtime.setAuth(effectiveSession.access_token ?? null);
    const aal = await getAuthenticatorAssurance(supabase);
    if (!isHydrationRunCurrent(runId)) return;
    const isMfaPending = aal.nextLevel === "aal2" && aal.currentLevel !== "aal2";
    setSession(effectiveSession);
    if (isMfaPending) {
      setMfaPending(true);
      // Keep public routes visible until MFA challenge is completed.
      setUser(null);
      setProfile(null);
      previousUserIdRef.current = data.user.id;
      setLoading(false);
      setHydrating(false);
      return;
    }
    setMfaPending(false);

    if (previousUserIdRef.current && previousUserIdRef.current !== data.user.id) {
      clearTransientUserStorage();
      clearSignupScopedStorage([previousUserIdRef.current, data.user.email, data.user.id]);
    }

    const sameUserAsCurrent = previousUserIdRef.current === data.user.id;
    const preserveExistingProfile = sameUserAsCurrent && Boolean(profile);
    previousUserIdRef.current = data.user.id;
    if (!preserveExistingProfile) {
      setProfile(null);
    }
    setUser(data.user);
    await fetchProfile(data.user.id, runId, { preserveExisting: preserveExistingProfile });
    if (!isHydrationRunCurrent(runId)) return;
    // Repair older rows that were created without profiles.email.
    if (data.user.email) {
      const currentProfileEmail = String((profile as { email?: string | null } | null)?.email || "").trim().toLowerCase();
      const authEmail = String(data.user.email || "").trim().toLowerCase();
      if (!currentProfileEmail && authEmail) {
        const { error: repairError } = await supabase
          .from("profiles")
          .update({ email: authEmail } as Record<string, unknown>)
          .eq("id", data.user.id);
        if (repairError) {
          console.warn("[AuthContext] profile email repair failed", repairError.message);
        } else {
          await fetchProfile(data.user.id, runId);
          if (!isHydrationRunCurrent(runId)) return;
        }
      }
    }
    void touchProfileActivity();
    setLoading(false);
    setHydrating(false);
  }, [
    beginHydrationRun,
    clearTransientUserStorage,
    fetchProfile,
    isHydrationRunCurrent,
    profile,
    resetAuthBoundary,
    touchProfileActivity,
  ]);

  useEffect(() => {
    if (!user) return;
    void touchProfileActivity();
  }, [touchProfileActivity, user]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`profile-live-sync:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        () => {
          const runId = beginHydrationRun();
          void fetchProfile(user.id, runId);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [beginHydrationRun, fetchProfile, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const onVerificationUpdated = () => {
      const runId = beginHydrationRun();
      void fetchProfile(user.id, runId);
    };
    window.addEventListener("huddle:verification-updated", onVerificationUpdated);
    return () => {
      window.removeEventListener("huddle:verification-updated", onVerificationUpdated);
    };
  }, [beginHydrationRun, fetchProfile, user?.id]);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      void hydrateValidatedSession(data.session ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      void hydrateValidatedSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [hydrateValidatedSession]);

  const signUp = useCallback(async (
    email: string,
    password: string,
    displayName: string,
    phone: string,
    consent?: { acceptedAtIso: string; version: string },
    turnstileToken?: string,
  ) => {
    const runtimeEnv = getAuthRuntimeEnv();
    if (import.meta.env.DEV) {
      console.debug("[auth.signup] runtime", {
        mode: runtimeEnv.mode,
        host: runtimeEnv.host,
        supabaseUrl: runtimeEnv.supabaseUrl,
      });
    }
    const redirectUrl = `${window.location.origin}/`;
    const turnstile = String(turnstileToken || "").trim();
    if (!turnstile) {
      return { error: new Error("Complete human verification first.") };
    }

    let data: { user: { id: string } | null } | null = null;
    let error: { message?: string } | null = null;
    try {
      const res = await authSignup({
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
        turnstile_token: turnstile,
        turnstile_action: "signup",
      });
      data = { user: (res.user as { id: string } | null) ?? null };
      error = res.error as { message?: string } | null;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(async (email: string, password: string, phone?: string, turnstileToken?: string) => {
    const runtimeEnv = getAuthRuntimeEnv();
    if (import.meta.env.DEV) {
      console.debug("[auth.signin] runtime", {
        mode: runtimeEnv.mode,
        host: runtimeEnv.host,
        supabaseUrl: runtimeEnv.supabaseUrl,
        email: (email || "").toLowerCase(),
        hasPhone: Boolean(phone),
      });
    }
    try {
      const loginResult = await withTimeout(authLogin({
        email: phone ? undefined : email,
        phone: phone || undefined,
        password,
        turnstile_token: String(turnstileToken || "").trim() || undefined,
        turnstile_action: String(turnstileToken || "").trim() ? "login" : undefined,
      }), "sign_in_timeout");
      if (loginResult.error) {
        return {
          error: buildAuthUiError(mapAuthFailureMessage(loginResult.error), loginResult.error.details),
          mfaRequired: false,
          mfaFactorId: null,
          mfaMethod: null,
        };
      }

      const [aal, factors] = await withTimeout(
        Promise.all([
          getAuthenticatorAssurance(supabase),
          listTotpFactors(supabase),
        ]),
        "sign_in_timeout",
      );
      const verifiedTotp = factors.find((factor) => factor.status === "verified") || null;
      const mfaRequired = aal.nextLevel === "aal2" && aal.currentLevel !== "aal2";
      if (mfaRequired) {
        setMfaPending(true);
        if (verifiedTotp?.id) {
          return { error: null, mfaRequired: true, mfaFactorId: verifiedTotp.id, mfaMethod: "totp" };
        }
        await supabase.auth.signOut({ scope: "local" });
        return {
          error: buildAuthUiError("Two-factor authentication is required, but no usable authenticator is available. Please use your enrolled device or recover your account."),
          mfaRequired: false,
          mfaFactorId: null,
          mfaMethod: null,
        };
      }

      const uid = loginResult.userId;
      if (uid) {
        void supabase
          .from("profiles")
          .update({ last_login: new Date().toISOString() } as Record<string, unknown>)
          .eq("id", uid);
        void trackDeviceFingerprint("login");
      }

      return { error: null, mfaRequired: false, mfaFactorId: null, mfaMethod: null };
    } catch (e: unknown) {
      console.error("[AuthContext] signIn network error", e);
      return {
        error: buildAuthUiError(mapAuthFailureMessage(e instanceof Error ? e.message : String(e))),
        mfaRequired: false,
        mfaFactorId: null,
        mfaMethod: null,
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = useCallback(async () => {
    const emailOwner = normalizeStorageOwner(session?.user?.email || profile?.phone || "");
    const scopedSignupKey = buildScopedStorageKey(SIGNUP_STORAGE_KEY, emailOwner);
    const scopedSignupPasswordKey = buildScopedStorageKey(SIGNUP_PASSWORD_SESSION_KEY, emailOwner);
    await supabase.auth.signOut();
    beginHydrationRun();
    resetAuthBoundary();
    // Clear local storage stale records
    localStorage.removeItem("rememberedIdentifier");
    localStorage.removeItem("auth_login_identifier");
    localStorage.removeItem("huddle_stay_logged_in");
    localStorage.removeItem(scopedSignupKey);
    localStorage.removeItem(SIGNUP_STORAGE_KEY);
    sessionStorage.removeItem(scopedSignupPasswordKey);
    sessionStorage.removeItem(SIGNUP_PASSWORD_SESSION_KEY);
    sessionStorage.removeItem("huddle_vi_status");
    sessionStorage.removeItem("signup_verify_submitted_v1");
    sessionStorage.removeItem("signup_verify_docs_submitted");
    localStorage.removeItem("huddle_offline_actions");
    localStorage.removeItem("pending_addon");
  }, [beginHydrationRun, profile?.phone, resetAuthBoundary, session?.user?.email]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      const runId = beginHydrationRun();
      await fetchProfile(user.id, runId);
    }
  }, [beginHydrationRun, fetchProfile, user]);

  const contextValue = useMemo(() => ({
    user,
    session,
    profile,
    loading,
    hydrating,
    mfaPending,
    signUp,
    signIn,
    signOut,
    refreshProfile,
  }), [user, session, profile, loading, hydrating, mfaPending, signUp, signIn, signOut, refreshProfile]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
