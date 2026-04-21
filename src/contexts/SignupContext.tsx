import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  clearSignupScopedStorage,
  loadSignupDraft,
  SETPROFILE_PREFILL_KEY,
  SIGNUP_PASSWORD_SESSION_KEY,
  SIGNUP_PROOF_STORAGE_KEY,
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
  signup_proof: string;
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
  signup_proof: "",
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
const SIGNUP_PROOF_SESSION_KEY = SIGNUP_PROOF_STORAGE_KEY;

export const SignupProvider = ({ children }: { children: React.ReactNode }) => {
  const resolveRememberedOwner = () =>
    normalizeStorageOwner(
      localStorage.getItem("auth_login_identifier") ||
        localStorage.getItem("rememberedIdentifier") ||
        "",
    );

  const restoreFromDraft = useCallback((ownerHint?: string | null) => {
    const draft = loadSignupDraft(ownerHint);
    if (!draft) return false;
    const parsed = draft.data as Partial<PersistedSignupData>;
    setData({
      ...defaultData,
      ...parsed,
      password: draft.password,
      signup_proof: draft.signupProof || "",
    });
    return true;
  }, []);

  const hasMeaningfulDraftData = useCallback((value: SignupData) => {
    return Boolean(
      value.email ||
      value.phone ||
      value.dob ||
      value.display_name ||
      value.social_id ||
      value.legal_name ||
      value.password ||
      value.signup_proof,
    );
  }, []);

  const [data, setData] = useState<SignupData>(() => {
    try {
      const signupProof =
        localStorage.getItem(SIGNUP_PROOF_SESSION_KEY) ||
        sessionStorage.getItem(SIGNUP_PROOF_SESSION_KEY) ||
        "";
      const draft = loadSignupDraft(resolveRememberedOwner());
      if (!draft) return { ...defaultData, signup_proof: signupProof };
      const parsed = draft.data as Partial<PersistedSignupData>;
      return {
        ...defaultData,
        ...parsed,
        password: draft.password,
        signup_proof: draft.signupProof || signupProof,
      };
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
  const resolveStoredSignupOwner = useCallback((ownerHints: Array<string | null | undefined>) => {
    for (const ownerHint of ownerHints) {
      const normalizedOwner = normalizeStorageOwner(ownerHint);
      if (!normalizedOwner) continue;
      const scopedDraftKey = buildScopedStorageKey(SIGNUP_STORAGE_KEY, normalizedOwner);
      const scopedPrefillKey = buildScopedStorageKey(SETPROFILE_PREFILL_KEY, normalizedOwner);
      try {
        if (localStorage.getItem(scopedDraftKey) || localStorage.getItem(scopedPrefillKey)) {
          return normalizedOwner;
        }
      } catch {
        // best-effort only
      }
      const restoredDraft = loadSignupDraft(normalizedOwner);
      if (restoredDraft?.owner) return normalizeStorageOwner(restoredDraft.owner);
    }
    return "";
  }, []);
  const shouldKeepDraftForSession = useCallback((sessionEmail?: string | null, sessionUserId?: string | null) => {
    if (flowState !== "idle") return true;
    // sessionStorage is written synchronously by setFlowState — use it as an
    // authoritative fallback for the race where React state hasn't committed yet
    // when onAuthStateChange fires during authSignup → applySession → setSession.
    try {
      const raw = sessionStorage.getItem(SIGNUP_FLOW_STATE_KEY);
      if (raw === "signup" || raw === "verify_identity") return true;
    } catch {
      // best-effort only
    }
    const draftOwner = resolveStoredSignupOwner([
      data.email,
      resolveRememberedOwner(),
      sessionEmail,
      sessionUserId,
    ]);
    const emailOwner = normalizeStorageOwner(sessionEmail || "");
    const idOwner = normalizeStorageOwner(sessionUserId || "");
    const matchingDraft = loadSignupDraft(sessionEmail || sessionUserId || draftOwner);
    if (!draftOwner) return false;
    if ((emailOwner && draftOwner === emailOwner) || (idOwner && draftOwner === idOwner)) return true;
    if (!matchingDraft) return false;
    return (emailOwner && matchingDraft.owner === emailOwner) || (idOwner && matchingDraft.owner === idOwner);
  }, [data.email, flowState, resolveStoredSignupOwner]);

  const resetDraftState = useCallback((ownerHints: Array<string | null | undefined> = []) => {
    setData(defaultData);
    setFlowStateInternal("idle");
    try {
      sessionStorage.removeItem(SIGNUP_FLOW_STATE_KEY);
      sessionStorage.removeItem(SIGNUP_PROOF_SESSION_KEY);
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
        if (!hasMeaningfulDraftData(data)) {
          restoreFromDraft(sessionData.session?.user?.email || sessionData.session?.user?.id || null);
        }
        if (!shouldKeepDraftForSession(sessionData.session?.user?.email, sessionData.session?.user?.id)) {
          resetDraftState([sessionData.session?.user?.id, sessionData.session?.user?.email, data.email]);
        }
      }
    });
    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextAuthenticated = Boolean(session?.user?.id);
      setIsAuthenticated(nextAuthenticated);
      if (nextAuthenticated) {
        if (!hasMeaningfulDraftData(data)) {
          restoreFromDraft(session?.user?.email || session?.user?.id || null);
        }
        if (!shouldKeepDraftForSession(session?.user?.email, session?.user?.id)) {
          resetDraftState([session?.user?.id, session?.user?.email, data.email]);
        }
      }
    });
    return () => {
      mounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, [data, hasMeaningfulDraftData, resetDraftState, restoreFromDraft, shouldKeepDraftForSession]);

  useEffect(() => {
    const shouldPersistWhileAuthenticated = flowState !== "idle";
    if (isAuthenticated && !shouldPersistWhileAuthenticated) return;
    const owner = normalizeStorageOwner(data.email || resolveRememberedOwner());
    const draftKey = buildScopedStorageKey(SIGNUP_STORAGE_KEY, owner);
    const passwordKey = buildScopedStorageKey(SIGNUP_PASSWORD_SESSION_KEY, owner);
    const signupProofKey = buildScopedStorageKey(SIGNUP_PROOF_STORAGE_KEY, owner);
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
      localStorage.setItem(passwordKey, data.password);
      if (passwordKey !== SIGNUP_PASSWORD_SESSION_KEY) {
        sessionStorage.removeItem(SIGNUP_PASSWORD_SESSION_KEY);
        localStorage.removeItem(SIGNUP_PASSWORD_SESSION_KEY);
      }
    } else {
      sessionStorage.removeItem(passwordKey);
      localStorage.removeItem(passwordKey);
      sessionStorage.removeItem(SIGNUP_PASSWORD_SESSION_KEY);
      localStorage.removeItem(SIGNUP_PASSWORD_SESSION_KEY);
    }
    if (data.signup_proof) {
      sessionStorage.setItem(SIGNUP_PROOF_SESSION_KEY, data.signup_proof);
      localStorage.setItem(SIGNUP_PROOF_SESSION_KEY, data.signup_proof);
      sessionStorage.setItem(signupProofKey, data.signup_proof);
      localStorage.setItem(signupProofKey, data.signup_proof);
    } else {
      sessionStorage.removeItem(SIGNUP_PROOF_SESSION_KEY);
      localStorage.removeItem(SIGNUP_PROOF_SESSION_KEY);
      sessionStorage.removeItem(signupProofKey);
      localStorage.removeItem(signupProofKey);
    }
  }, [data, flowState, isAuthenticated]);

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
