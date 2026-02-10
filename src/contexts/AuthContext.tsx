import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface Profile {
  id: string;
  user_id?: string | null;
  display_name: string | null;
  legal_name: string | null;
  phone: string | null;
  prefs?: Record<string, unknown> | null;
  verification_status?: string | null;
  verification_comment?: string | null;
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
  is_verified: boolean;
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
  return profile?.user_role === "admin";
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
        "id, user_id, display_name, legal_name, phone, avatar_url, bio, gender_genre, orientation, dob, height, weight, weight_unit, degree, school, major, affiliation, occupation, pet_experience, experience_years, relationship_status, has_car, languages, location_name, location_country, location_district, is_verified, user_role, tier, subscription_status, stars_count, mesh_alert_count, media_credits, family_slots, onboarding_completed, owns_pets, social_availability, availability_status, show_gender, show_orientation, show_age, show_height, show_weight, show_academic, show_affiliation, show_occupation, show_bio, last_lat, last_lng, care_circle, verification_status, verification_comment, show_relationship_status, social_album, prefs, map_visible" as "*"
      )
      .eq("id", userId)
      .maybeSingle();

    if (!error && data) {
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
    console.log("Attempting Signup to:", supabaseUrl);
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
      await supabase
        .from("profiles")
        .upsert({
          id: data.user.id,
          display_name: displayName || email.split("@")[0],
          phone,
        });

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
    }

    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string, phone?: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "");
    console.log("Attempting Login to:", supabaseUrl);
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
