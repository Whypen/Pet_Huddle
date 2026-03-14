import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  SIGNUP_PASSWORD_SESSION_KEY,
  SIGNUP_STORAGE_KEY,
  buildScopedStorageKey,
  normalizeStorageOwner,
} from "@/lib/signupOnboarding";

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

type PersistedSignupData = Omit<SignupData, "password">;

type SignupContextValue = {
  data: SignupData;
  update: (next: Partial<SignupData>) => void;
  reset: () => void;
};

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

const defaultPersistedData: PersistedSignupData = {
  dob: "",
  display_name: "",
  social_id: "",
  email: "",
  phone: "",
  legal_name: "",
  otp_verified: false,
};

const SignupContext = createContext<SignupContextValue | undefined>(undefined);

export const SignupProvider = ({ children }: { children: React.ReactNode }) => {
  const resolveRememberedOwner = () =>
    normalizeStorageOwner(
      localStorage.getItem("auth_login_identifier") ||
        localStorage.getItem("rememberedIdentifier") ||
        "",
    );

  const [data, setData] = useState<SignupData>(() => {
    try {
      const rememberedOwner = resolveRememberedOwner();
      const scopedDraftKey = buildScopedStorageKey(SIGNUP_STORAGE_KEY, rememberedOwner);
      const scopedPasswordKey = buildScopedStorageKey(SIGNUP_PASSWORD_SESSION_KEY, rememberedOwner);
      const raw = localStorage.getItem(scopedDraftKey);
      const password = sessionStorage.getItem(scopedPasswordKey) || "";
      if (!raw) return { ...defaultData, password };
      const parsed = JSON.parse(raw) as Partial<PersistedSignupData>;
      return { ...defaultData, ...parsed, password };
    } catch {
      return defaultData;
    }
  });

  useEffect(() => {
    const owner = normalizeStorageOwner(data.email || resolveRememberedOwner());
    const draftKey = buildScopedStorageKey(SIGNUP_STORAGE_KEY, owner);
    const passwordKey = buildScopedStorageKey(SIGNUP_PASSWORD_SESSION_KEY, owner);
    const persisted: PersistedSignupData = {
      ...defaultPersistedData,
      dob: data.dob,
      display_name: data.display_name,
      social_id: data.social_id,
      email: data.email,
      phone: data.phone,
      legal_name: data.legal_name,
      otp_verified: data.otp_verified,
    };
    localStorage.setItem(draftKey, JSON.stringify(persisted));
    if (draftKey !== SIGNUP_STORAGE_KEY) {
      localStorage.removeItem(SIGNUP_STORAGE_KEY);
    }
    if (data.password) {
      sessionStorage.setItem(passwordKey, data.password);
      if (passwordKey !== SIGNUP_PASSWORD_SESSION_KEY) {
        sessionStorage.removeItem(SIGNUP_PASSWORD_SESSION_KEY);
      }
    } else {
      sessionStorage.removeItem(passwordKey);
      sessionStorage.removeItem(SIGNUP_PASSWORD_SESSION_KEY);
    }
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
    const owner = normalizeStorageOwner(data.email || resolveRememberedOwner());
    const draftKey = buildScopedStorageKey(SIGNUP_STORAGE_KEY, owner);
    const passwordKey = buildScopedStorageKey(SIGNUP_PASSWORD_SESSION_KEY, owner);
    setData(defaultData);
    localStorage.removeItem(draftKey);
    localStorage.removeItem(SIGNUP_STORAGE_KEY);
    sessionStorage.removeItem(passwordKey);
    sessionStorage.removeItem(SIGNUP_PASSWORD_SESSION_KEY);
  }, [data.email]);

  const value = useMemo(() => ({ data, update, reset }), [data, reset, update]);

  return <SignupContext.Provider value={value}>{children}</SignupContext.Provider>;
};

export const useSignup = () => {
  const ctx = useContext(SignupContext);
  if (!ctx) throw new Error("useSignup must be used within SignupProvider");
  return ctx;
};
