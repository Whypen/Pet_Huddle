export const SIGNUP_STORAGE_KEY = "huddle_signup_v2";
export const SIGNUP_PASSWORD_SESSION_KEY = "huddle_signup_password_v1";
export const SIGNUP_PROOF_STORAGE_KEY = "huddle_signup_proof_v1";
export const SIGNUP_VERIFY_SUBMITTED_KEY = "signup_verify_docs_submitted";
export const SIGNUP_PENDING_VERIFICATION_KEY = "signup_pending_verification_v1";
export const SETPROFILE_PREFILL_KEY = "setprofile_prefill";
export const SETPET_PREFILL_KEY = "setpet_prefill";
export const MAP_PIN_STORAGE_KEY = "huddle_pin";
export const SIGNUP_VERIFY_STATUS_KEYS = [
  "huddle_vi_status",
  "signup_verify_submitted_v1",
  "signup_verify_docs_submitted",
] as const;

export type LoadedSignupDraft = {
  owner: string;
  data: Record<string, unknown>;
  password: string;
  signupProof: string;
};

export const normalizeStorageOwner = (owner: string | null | undefined): string => {
  const next = String(owner || "").trim().toLowerCase();
  return next.replace(/[^a-z0-9_.@-]/g, "");
};

export const buildScopedStorageKey = (base: string, owner: string | null | undefined): string => {
  const normalizedOwner = normalizeStorageOwner(owner);
  return normalizedOwner ? `${base}:${normalizedOwner}` : base;
};

export const loadSignupDraft = (ownerHint?: string | null): LoadedSignupDraft | null => {
  try {
    const candidates: string[] = [];
    const pushCandidate = (value?: string | null) => {
      const normalized = normalizeStorageOwner(value);
      if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
    };

    pushCandidate(ownerHint);
    pushCandidate(
      localStorage.getItem("auth_login_identifier") ||
      localStorage.getItem("rememberedIdentifier") ||
      "",
    );

    const scopedPrefix = `${SIGNUP_STORAGE_KEY}:`;
    const scopedOwners = Object.keys(localStorage)
      .filter((key) => key.startsWith(scopedPrefix))
      .map((key) => normalizeStorageOwner(key.slice(scopedPrefix.length)))
      .filter(Boolean);

    if (!candidates.length && scopedOwners.length === 1) {
      candidates.push(scopedOwners[0]);
    }

    for (const owner of candidates) {
      const draftKey = buildScopedStorageKey(SIGNUP_STORAGE_KEY, owner);
      const rawDraft = localStorage.getItem(draftKey);
      if (!rawDraft) continue;
      const passwordKey = buildScopedStorageKey(SIGNUP_PASSWORD_SESSION_KEY, owner);
      const password =
        sessionStorage.getItem(passwordKey) ||
        localStorage.getItem(passwordKey) ||
        sessionStorage.getItem(SIGNUP_PASSWORD_SESSION_KEY) ||
        localStorage.getItem(SIGNUP_PASSWORD_SESSION_KEY) ||
        "";
      const signupProofKey = buildScopedStorageKey(SIGNUP_PROOF_STORAGE_KEY, owner);
      const signupProof =
        localStorage.getItem(signupProofKey) ||
        sessionStorage.getItem(signupProofKey) ||
        localStorage.getItem(SIGNUP_PROOF_STORAGE_KEY) ||
        sessionStorage.getItem(SIGNUP_PROOF_STORAGE_KEY) ||
        "";
      return {
        owner,
        data: JSON.parse(rawDraft) as Record<string, unknown>,
        password,
        signupProof,
      };
    }

    const baseDraft = localStorage.getItem(SIGNUP_STORAGE_KEY);
    if (!baseDraft) return null;
    return {
      owner: "",
      data: JSON.parse(baseDraft) as Record<string, unknown>,
      password:
        sessionStorage.getItem(SIGNUP_PASSWORD_SESSION_KEY) ||
        localStorage.getItem(SIGNUP_PASSWORD_SESSION_KEY) ||
        "",
      signupProof:
        localStorage.getItem(SIGNUP_PROOF_STORAGE_KEY) ||
        sessionStorage.getItem(SIGNUP_PROOF_STORAGE_KEY) ||
        "",
    };
  } catch {
    return null;
  }
};

export const clearSignupScopedStorage = (ownerHints: Array<string | null | undefined>): void => {
  const owners = Array.from(new Set(ownerHints.map((owner) => normalizeStorageOwner(owner)).filter(Boolean)));
  const scopedBases = [
    SIGNUP_STORAGE_KEY,
    SIGNUP_PASSWORD_SESSION_KEY,
    SIGNUP_PENDING_VERIFICATION_KEY,
    SIGNUP_PROOF_STORAGE_KEY,
    SETPROFILE_PREFILL_KEY,
    SETPET_PREFILL_KEY,
  ] as const;
  try {
    owners.forEach((owner) => {
      scopedBases.forEach((base) => {
        const key = buildScopedStorageKey(base, owner);
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });
    });
    scopedBases.forEach((base) => {
      localStorage.removeItem(base);
      sessionStorage.removeItem(base);
    });
    SIGNUP_VERIFY_STATUS_KEYS.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // best-effort cleanup only
  }
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
