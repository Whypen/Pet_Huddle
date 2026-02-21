import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type SignupData = {
  dob: string;
  display_name: string;
  social_id: string;
  email: string;
  phone: string;
  password: string;
  legal_name: string;
  otp_verified: boolean;
};

type SignupContextValue = {
  data: SignupData;
  update: (next: Partial<SignupData>) => void;
  reset: () => void;
  startVerificationSignup: (legalName?: string) => Promise<{ ok: boolean; error?: string }>;
};

const STORAGE_KEY = "huddle_signup_v2";

const defaultData: SignupData = {
  dob: "",
  display_name: "",
  social_id: "",
  email: "",
  phone: "",
  password: "",
  legal_name: "",
  otp_verified: false,
};

const SignupContext = createContext<SignupContextValue | undefined>(undefined);

export const SignupProvider = ({ children }: { children: React.ReactNode }) => {
  const [data, setData] = useState<SignupData>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData;
      const parsed = JSON.parse(raw) as Partial<SignupData>;
      return { ...defaultData, ...parsed };
    } catch {
      return defaultData;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const update = useCallback((next: Partial<SignupData>) => {
    setData((prev) => {
      let changed = false;
      const merged = { ...prev };
      (Object.keys(next) as Array<keyof SignupData>).forEach((key) => {
        const nextValue = next[key];
        if (typeof nextValue !== "undefined" && prev[key] !== nextValue) {
          merged[key] = nextValue as SignupData[typeof key];
          changed = true;
        }
      });
      return changed ? merged : prev;
    });
  }, []);

  const reset = useCallback(() => {
    setData(defaultData);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const startVerificationSignup = useCallback(
    async (legalName?: string) => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const existingUser = sessionData.session?.user;
        if (existingUser?.id) {
          return { ok: true };
        }

        const { data: authData, error } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
          options: {
            data: {
              display_name: data.display_name,
              legal_name: legalName || data.legal_name || "",
              dob: data.dob,
              phone: data.phone,
              social_id: data.social_id,
            },
          },
        });
        if (error) throw error;

        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    [data],
  );

  const value = useMemo(
    () => ({ data, update, reset, startVerificationSignup }),
    [data, update, reset, startVerificationSignup],
  );

  return <SignupContext.Provider value={value}>{children}</SignupContext.Provider>;
};

export const useSignup = () => {
  const ctx = useContext(SignupContext);
  if (!ctx) throw new Error("useSignup must be used within SignupProvider");
  return ctx;
};
