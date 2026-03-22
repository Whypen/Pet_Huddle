import type { SupabaseClient } from "@supabase/supabase-js";

export type MfaAal = {
  currentLevel: string | null;
  nextLevel: string | null;
};

export type TotpFactorSummary = {
  id: string;
  status: "verified" | "unverified" | string;
};

export type TotpEnrollment = {
  factorId: string | null;
  secret: string | null;
  uri: string | null;
  qrCode: string | null;
  status: string | null;
};

type MfaErrorLike = { message?: string; status?: number; code?: string } | null | undefined;
const TOTP_HINT_KEY = "huddle_totp_emails";

const normalizeHintEmail = (email: string): string => email.toLowerCase().trim();

export const hasTotpHint = (email: string): boolean => {
  try {
    const arr: string[] = JSON.parse(localStorage.getItem(TOTP_HINT_KEY) ?? "[]");
    return arr.includes(normalizeHintEmail(email));
  } catch {
    return false;
  }
};

export const addTotpHint = (email: string): void => {
  try {
    const arr: string[] = JSON.parse(localStorage.getItem(TOTP_HINT_KEY) ?? "[]");
    const normalized = normalizeHintEmail(email);
    if (!normalized) return;
    if (!arr.includes(normalized)) {
      if (arr.length >= 20) arr.shift();
      arr.push(normalized);
      localStorage.setItem(TOTP_HINT_KEY, JSON.stringify(arr));
    }
  } catch {
    // best-effort only
  }
};

export const removeTotpHint = (email: string): void => {
  try {
    const arr: string[] = JSON.parse(localStorage.getItem(TOTP_HINT_KEY) ?? "[]");
    const normalized = normalizeHintEmail(email);
    const filtered = arr.filter((item) => item !== normalized);
    localStorage.setItem(TOTP_HINT_KEY, JSON.stringify(filtered));
  } catch {
    // best-effort only
  }
};

export const mapMfaError = (error: MfaErrorLike, fallback: string): string => {
  const raw = String(error?.message || "").toLowerCase();
  if (!raw) return fallback;
  if (raw.includes("invalid") && raw.includes("otp")) return "Incorrect code. Check your authenticator app and try again.";
  if (raw.includes("expired")) return "This code expired. Use the latest code and try again.";
  if (raw.includes("challenge")) return "Couldn't start verification. Please try again.";
  if (raw.includes("factor")) return "Two-factor setup is incomplete. Please set up authenticator again.";
  if (raw.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
  if (raw.includes("network") || raw.includes("fetch")) return "Network issue. Check your connection and try again.";
  return fallback;
};

export const getAuthenticatorAssurance = async (supabase: SupabaseClient): Promise<MfaAal> => {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const currentLevel = typeof data?.currentLevel === "string" ? data.currentLevel : null;
  const nextLevel = typeof data?.nextLevel === "string" ? data.nextLevel : null;
  return { currentLevel, nextLevel };
};

export const listTotpFactors = async (supabase: SupabaseClient): Promise<TotpFactorSummary[]> => {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const all = Array.isArray((data as { all?: unknown[] } | null)?.all)
    ? ((data as { all?: unknown[] }).all as Array<Record<string, unknown>>)
    : [];
  return all
    .filter((row) => String(row.factor_type || "").toLowerCase() === "totp" && typeof row.id === "string")
    .map((row) => ({
      id: String(row.id),
      status: String(row.status || "unverified"),
    }));
};

export const clearUnverifiedTotpFactors = async (supabase: SupabaseClient): Promise<void> => {
  const factors = await listTotpFactors(supabase);
  const stale = factors.filter((factor) => factor.status !== "verified");
  for (const factor of stale) {
    try {
      await unenrollFactor(supabase, factor.id);
    } catch {
      // best effort cleanup; caller continues with fresh enroll attempt
    }
  }
};

export const enrollTotp = async (supabase: SupabaseClient): Promise<TotpEnrollment> => {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (error) throw error;
  const totp = (data as { totp?: Record<string, unknown> } | null)?.totp || {};
  return {
    factorId: typeof (data as { id?: unknown } | null)?.id === "string" ? String((data as { id: string }).id) : null,
    secret: typeof totp.secret === "string" ? totp.secret : null,
    uri: typeof totp.uri === "string" ? totp.uri : null,
    qrCode: typeof totp.qr_code === "string" ? totp.qr_code : null,
    status: typeof (data as { status?: unknown } | null)?.status === "string" ? String((data as { status: string }).status) : null,
  };
};

export const challengeAndVerifyTotp = async (
  supabase: SupabaseClient,
  factorId: string,
  code: string
): Promise<void> => {
  const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError) throw challengeError;
  const challengeId = typeof challengeData?.id === "string" ? challengeData.id : "";
  if (!challengeId) throw new Error("challenge_unavailable");
  const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
  if (verifyError) throw verifyError;
};

export const unenrollFactor = async (supabase: SupabaseClient, factorId: string): Promise<void> => {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
};
