export const SIGNUP_STORAGE_KEY = "huddle_signup_v2";
export const SIGNUP_PASSWORD_SESSION_KEY = "huddle_signup_password_v1";
export const SIGNUP_VERIFY_SUBMITTED_KEY = "signup_verify_docs_submitted";
export const SIGNUP_PENDING_VERIFICATION_KEY = "signup_pending_verification_v1";
export const SETPROFILE_PREFILL_KEY = "setprofile_prefill";
export const SETPET_PREFILL_KEY = "setpet_prefill";
export const MAP_PIN_STORAGE_KEY = "huddle_pin";

export const normalizeStorageOwner = (owner: string | null | undefined): string => {
  const next = String(owner || "").trim().toLowerCase();
  return next.replace(/[^a-z0-9_.@-]/g, "");
};

export const buildScopedStorageKey = (base: string, owner: string | null | undefined): string => {
  const normalizedOwner = normalizeStorageOwner(owner);
  return normalizedOwner ? `${base}:${normalizedOwner}` : base;
};

export type PendingSignupVerification = {
  country: string;
  docType: "id" | "passport" | "drivers_license";
  selfieDataUrl: string;
  idDataUrl: string;
  createdAt: string;
};

export function hasSignupDraft(): boolean {
  try {
    const rememberedOwner = normalizeStorageOwner(
      localStorage.getItem("auth_login_identifier") ||
        localStorage.getItem("rememberedIdentifier") ||
        "",
    );
    if (!rememberedOwner) return false;
    const scopedKey = buildScopedStorageKey(SIGNUP_STORAGE_KEY, rememberedOwner);
    const raw = localStorage.getItem(scopedKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Boolean(
      typeof parsed.email === "string" &&
        parsed.email.trim() &&
        typeof parsed.phone === "string" &&
        parsed.phone.trim(),
    );
  } catch {
    return false;
  }
}

const resolvePendingVerificationKey = (owner?: string | null): string =>
  buildScopedStorageKey(SIGNUP_PENDING_VERIFICATION_KEY, owner || "");

export function loadPendingSignupVerification(owner?: string | null): PendingSignupVerification | null {
  try {
    const raw = sessionStorage.getItem(resolvePendingVerificationKey(owner));
    if (!raw) return null;
    return JSON.parse(raw) as PendingSignupVerification;
  } catch {
    return null;
  }
}

export function savePendingSignupVerification(payload: PendingSignupVerification, owner?: string | null): void {
  sessionStorage.setItem(resolvePendingVerificationKey(owner), JSON.stringify(payload));
}

export function clearPendingSignupVerification(owner?: string | null): void {
  sessionStorage.removeItem(resolvePendingVerificationKey(owner));
  sessionStorage.removeItem(SIGNUP_PENDING_VERIFICATION_KEY);
}
