import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  clearSignupScopedStorage,
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
  email_opt_in: boolean;
};

type PersistedSignupData = Omit<SignupData, "password">;

type SignupContextValue = {
  data: SignupData;
  flowState: "idle" | "signup" | "verify_identity";
  update: (next: Partial<SignupData>) => void;
  setFlowState: (next: "idle" | "signup" | "verify_identity") => void;
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
  email_opt_in: false,
};

const defaultPersistedData: PersistedSignupData = {
  dob: "",
  display_name: "",
  social_id: "",
  email: "",
  phone: "",
  legal_name: "",
  otp_verified: false,
  email_opt_in: false,
};

const SignupContext = createContext<SignupContextValue | undefined>(undefined);
const SIGNUP_FLOW_STATE_KEY = "huddle_signup_flow_state_v1";

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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [flowState, setFlowStateInternal] = useState<"idle" | "signup" | "verify_identity">(() => {
    try {
      const raw = sessionStorage.getItem(SIGNUP_FLOW_STATE_KEY);
      if (raw === "signup" || raw === "verify_identity") return raw;
      return "idle";
    } catch {
      return "idle";
    }
  });
  const shouldKeepDraftForSession = useCallback((sessionEmail?: string | null, sessionUserId?: string | null) => {
    const draftOwner = normalizeStorageOwner(data.email || resolveRememberedOwner());
    const emailOwner = normalizeStorageOwner(sessionEmail || "");
    const idOwner = normalizeStorageOwner(sessionUserId || "");
    if (!draftOwner) return false;
    return (emailOwner && draftOwner === emailOwner) || (idOwner && draftOwner === idOwner);
  }, [data.email]);

  const resetDraftState = useCallback((ownerHints: Array<string | null | undefined> = []) => {
    setData(defaultData);
    setFlowStateInternal("idle");
    try {
      sessionStorage.removeItem(SIGNUP_FLOW_STATE_KEY);
    } catch {
      // best-effort only
    }
    clearSignupScopedStorage(ownerHints);
  }, []);

  const setFlowState = useCallback((next: "idle" | "signup" | "verify_identity") => {
    setFlowStateInternal(next);
    try {
      if (next === "idle") {
        sessionStorage.removeItem(SIGNUP_FLOW_STATE_KEY);
      } else {
        sessionStorage.setItem(SIGNUP_FLOW_STATE_KEY, next);
      }
    } catch {
      // best-effort only
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data: sessionData }) => {
      if (!mounted) return;
      const nextAuthenticated = Boolean(sessionData.session?.user?.id);
      setIsAuthenticated(nextAuthenticated);
      if (nextAuthenticated) {
        if (!shouldKeepDraftForSession(sessionData.session?.user?.email, sessionData.session?.user?.id)) {
          resetDraftState([sessionData.session?.user?.id, sessionData.session?.user?.email, data.email]);
        }
      }
    });
    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextAuthenticated = Boolean(session?.user?.id);
      setIsAuthenticated(nextAuthenticated);
      if (nextAuthenticated) {
        if (!shouldKeepDraftForSession(session?.user?.email, session?.user?.id)) {
          resetDraftState([session?.user?.id, session?.user?.email, data.email]);
        }
      }
    });
    return () => {
      mounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, [data.email, resetDraftState, shouldKeepDraftForSession]);

  useEffect(() => {
    if (isAuthenticated) return;
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
      email_opt_in: data.email_opt_in,
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
  }, [data, isAuthenticated]);

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
    resetDraftState([owner]);
  }, [data.email, resetDraftState]);

  const value = useMemo(
    () => ({ data, flowState, update, setFlowState, reset }),
    [data, flowState, reset, setFlowState, update]
  );

  return <SignupContext.Provider value={value}>{children}</SignupContext.Provider>;
};

export const useSignup = () => {
  const ctx = useContext(SignupContext);
  if (!ctx) throw new Error("useSignup must be used within SignupProvider");
  return ctx;
};
