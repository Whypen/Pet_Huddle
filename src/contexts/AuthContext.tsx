import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface Profile {
  id: string;
  display_name: string | null;
  legal_name: string | null;
  phone: string | null;
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
  is_verified: boolean;
  user_role: string;
  tier?: string | null;
  subscription_status?: string | null;
  stars_count?: number | null;
  mesh_alert_count?: number | null;
  media_credits?: number | null;
  family_slots?: number | null;
  onboarding_completed: boolean;
  owns_pets: boolean;
  social_availability: boolean;
  availability_status: string[];
  show_gender: boolean;
  show_orientation: boolean;
  show_age: boolean;
  show_height: boolean;
  show_weight: boolean;
  show_academic: boolean;
  show_affiliation: boolean;
  show_occupation: boolean;
  show_bio: boolean;
  last_lat?: number | null;
  last_lng?: number | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>;
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select(`
        id, display_name, legal_name, phone, avatar_url, bio,
        gender_genre, orientation, dob, height, weight, weight_unit,
        degree, school, major, affiliation, occupation,
        pet_experience, experience_years, relationship_status,
        has_car, languages, location_name,
        is_verified, user_role, tier, subscription_status,
        stars_count, mesh_alert_count, media_credits, family_slots,
        onboarding_completed, owns_pets,
        social_availability, availability_status,
        show_gender, show_orientation, show_age, show_height, show_weight,
        show_academic, show_affiliation, show_occupation, show_bio,
        last_lat, last_lng
      `)
      .eq("id", userId)
      .maybeSingle();

    if (!error && data) {
      setProfile(data as Profile);
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

  const signUp = async (email: string, password: string, displayName?: string) => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          display_name: displayName || email.split("@")[0],
        },
      },
    });

    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string, phone?: string) => {
    // Support both email and phone login
    if (phone) {
      const { error } = await supabase.auth.signInWithPassword({
        phone,
        password,
      });
      return { error: error as Error | null };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error: error as Error | null };
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
