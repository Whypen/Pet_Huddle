import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { Profile } from "./AuthContext";

export type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  refreshingProfile: boolean;
  refreshProfile: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

