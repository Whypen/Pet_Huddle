import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { Profile } from "./AuthContext";

export type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  refreshingProfile: boolean;
  refreshProfile: () => Promise<void>;
  biometricUnlockSupported: boolean;
  biometricUnlockEnabled: boolean;
  biometricUnlockLabel: string;
  unlockConfigReady: boolean;
  unlockRequired: boolean;
  privacyCovered: boolean;
  unlockError: string | null;
  refreshBiometricUnlock: () => Promise<void>;
  setBiometricUnlockEnabled: (next: boolean) => Promise<{ ok: boolean; error: string | null }>;
  unlockApp: () => Promise<{ ok: boolean; error: string | null }>;
  signInAgainFromLock: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
