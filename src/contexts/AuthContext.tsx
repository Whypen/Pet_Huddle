import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { MembershipTier, normalizeMembershipTier, resolveMembershipTier } from "@/lib/membership";

export interface Profile {
  id: string;
  user_id?: string | null;
  display_name: string | null;
  legal_name: string | null;
  phone: string | null;
  social_id?: string | null;
  prefs?: Record<string, unknown> | null;
  verification_status?: string | null;
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
  tier?: MembershipTier | null;
  effective_tier?: MembershipTier | null;
  last_active_at?: string | null;
  family_owner_id?: string | null;
  stars_count?: number | null;
  mesh_alert_count?: number | null;
  media_credits?: number | null;
  family_slots?: number | null;
  onboarding_completed: boolean;
  owns_pets: boolean;
  social_availability: boolean;
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
  map_visible?: boolean | null;
  care_circle?: string[] | null;
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
  signIn: (email: string, password: string, phone?: string) => Promise<{ error: Error | null }>;
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

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, display_name, legal_name, phone, dob, social_id, verification_status, verification_comment, is_admin, onboarding_completed, tier, effective_tier, last_active_at" as "*"
      )
      .eq("id", userId)
      .maybeSingle();

    if (!error && data) {
      const verificationStatus = String((data as Record<string, unknown>)?.verification_status ?? "")
        .trim()
        .toLowerCase();
      setProfile({
        ...(data as Profile),
        verification_status: verificationStatus || null,
        tier: normalizeMembershipTier((data as Record<string, unknown>)?.tier as string | null),
        effective_tier: resolveMembershipTier(data as Record<string, unknown>),
      });
      void supabase.rpc("touch_last_active_at").catch(() => {
        // Best-effort only; avoid blocking hydration on presence updates.
      });
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Defer profile fetch with setTimeout
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
        }

        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchProfile(session.user.id);
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (
    email: string,
    password: string,
    displayName: string,
    phone: string,
    consent?: { acceptedAtIso: string; version: string }
  ) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "");
    console.debug("Attempting Signup to:", supabaseUrl);
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

    if (!error && data?.user?.id && consent?.acceptedAtIso) {
      // Best-effort consent audit log. This will succeed when a session exists.
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

    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string, phone?: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "");
    console.debug("Attempting Login to:", supabaseUrl);
    // Support both email and phone login
    try {
      if (phone) {
        const { error } = await supabase.auth.signInWithPassword({
          phone,
          password,
        });
        if (!error) {
          const { data } = await supabase.auth.getUser();
          const uid = data?.user?.id;
          if (uid) {
            await supabase.from("profiles").update({ last_login: new Date().toISOString() } as Record<string, unknown>).eq("id", uid);
          }
        }
        return { error: error as Error | null };
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!error) {
        const sessionRes = await supabase.auth.getSession();
        const userRes = await supabase.auth.getUser();
        console.debug("[AUTH_AUDIT] session", sessionRes.data.session ?? null);
        console.debug("[AUTH_AUDIT] session.user.id", sessionRes.data.session?.user?.id ?? null);
        console.debug("[AUTH_AUDIT] getUser", userRes.data.user ?? null);
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id;
        if (uid) {
          await supabase.from("profiles").update({ last_login: new Date().toISOString() } as Record<string, unknown>).eq("id", uid);
        }
      }

      return { error: error as Error | null };
    } catch (e: unknown) {
      console.error("[AuthContext] signIn network error", e);
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    // Clear local storage stale records
    localStorage.removeItem("rememberedIdentifier");
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
