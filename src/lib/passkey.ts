import type { SupabaseClient } from "@supabase/supabase-js";

// ── Passkey hint (localStorage) ───────────────────────────────────────────────
// Tracks which emails have a passkey on this device so the sign-in screen can
// show "Continue with passkey" instead of the standard "Sign in" button.
const PASSKEY_HINT_KEY = "huddle_passkey_emails";

export const hasPasskeyHint = (email: string): boolean => {
  try {
    const arr: string[] = JSON.parse(localStorage.getItem(PASSKEY_HINT_KEY) ?? "[]");
    return arr.includes(email.toLowerCase().trim());
  } catch { return false; }
};

export const addPasskeyHint = (email: string): void => {
  try {
    const arr: string[] = JSON.parse(localStorage.getItem(PASSKEY_HINT_KEY) ?? "[]");
    const e = email.toLowerCase().trim();
    if (!arr.includes(e)) {
      if (arr.length >= 20) arr.shift();
      arr.push(e);
      localStorage.setItem(PASSKEY_HINT_KEY, JSON.stringify(arr));
    }
  } catch { /* best-effort */ }
};

export const removePasskeyHint = (email: string): void => {
  try {
    const arr: string[] = JSON.parse(localStorage.getItem(PASSKEY_HINT_KEY) ?? "[]");
    const e = email.toLowerCase().trim();
    const filtered = arr.filter((x) => x !== e);
    localStorage.setItem(PASSKEY_HINT_KEY, JSON.stringify(filtered));
  } catch { /* best-effort */ }
};

export type PasskeyFactorSummary = {
  id: string;
  status: "verified" | "unverified" | string;
  friendlyName: string | null;
  createdAt: string | null;
};

type PasskeyErrorLike = { message?: string; status?: number; code?: string } | null | undefined;
type WebAuthnConfig = { rpId: string; rpOrigins: string[] };

const resolveWebAuthnConfig = (): WebAuthnConfig => {
  if (typeof window === "undefined") {
    return { rpId: "huddle.pet", rpOrigins: ["https://huddle.pet", "https://www.huddle.pet"] };
  }
  const host = window.location.hostname.toLowerCase();
  const origin = window.location.origin;
  if (host === "huddle.pet" || host === "www.huddle.pet") {
    return { rpId: "huddle.pet", rpOrigins: ["https://huddle.pet", "https://www.huddle.pet"] };
  }
  if (host === "localhost") {
    return { rpId: "localhost", rpOrigins: [origin] };
  }
  return { rpId: host, rpOrigins: [origin] };
};

export const isPasskeySupportedBrowser = async (): Promise<boolean> => {
  if (typeof window === "undefined") return false;
  if (typeof window.PublicKeyCredential !== "function") return false;
  if (!navigator.credentials) return false;
  const host = window.location.hostname;
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const isIpv6 = host.includes(":");
  if (isIpv4 || isIpv6) return false;
  const uvpaa = window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable;
  if (typeof uvpaa === "function") {
    try {
      return await uvpaa.call(window.PublicKeyCredential);
    } catch {
      return true;
    }
  }
  return true;
};

export const mapPasskeyError = (error: PasskeyErrorLike, fallback: string): string => {
  const raw = String(error?.message || "").toLowerCase();
  if (!raw) return fallback;
  if (raw.includes("passkey_api_unavailable")) return "Passkey API is unavailable in this build. Please update and retry.";
  if (raw.includes("not supported")) return "Passkeys aren't available on this device/browser.";
  if (raw.includes("domain") || raw.includes("origin") || raw.includes("rp_id") || raw.includes("rp id")) {
    return "Passkeys require a valid web origin. Open the app on localhost (not 127.0.0.1) and try again.";
  }
  if (raw.includes("aborted")) return "Passkey setup was cancelled.";
  if (raw.includes("timeout")) return "Passkey request timed out. Please try again.";
  if (raw.includes("already exists")) return "This passkey is already registered.";
  if (raw.includes("mfa") && raw.includes("disabled")) return "Passkey is not enabled in authentication settings.";
  if (raw.includes("network") || raw.includes("fetch")) return "Network issue. Check your connection and try again.";
  return fallback;
};

export const listPasskeyFactors = async (supabase: SupabaseClient): Promise<PasskeyFactorSummary[]> => {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const all = Array.isArray((data as { all?: unknown[] } | null)?.all)
    ? ((data as { all?: unknown[] }).all as Array<Record<string, unknown>>)
    : [];
  return all
    .filter((row) => String(row.factor_type || "").toLowerCase() === "webauthn" && typeof row.id === "string")
    .map((row) => ({
      id: String(row.id),
      status: String(row.status || "unverified"),
      friendlyName: typeof row.friendly_name === "string" ? row.friendly_name : null,
      createdAt: typeof row.created_at === "string" ? row.created_at : null,
    }));
};

export const clearUnverifiedPasskeyFactors = async (supabase: SupabaseClient): Promise<void> => {
  const factors = await listPasskeyFactors(supabase);
  const stale = factors.filter((factor) => factor.status !== "verified");
  for (const factor of stale) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) {
      // best-effort cleanup
    }
  }
};

export const enrollPasskey = async (supabase: SupabaseClient, friendlyName: string): Promise<void> => {
  const webauthn = resolveWebAuthnConfig();
  const api = (
    supabase.auth as unknown as {
      mfa?: {
        webauthn?: {
          register: (args: { friendlyName: string; webauthn?: WebAuthnConfig }) => Promise<{ error: Error | null }>;
        };
      };
    }
  ).mfa?.webauthn;
  if (!api?.register) throw new Error("passkey_api_unavailable");
  const { error } = await api.register({ friendlyName, webauthn });
  if (error) throw error;
};

export const verifyPasskeyFactor = async (supabase: SupabaseClient, factorId: string): Promise<void> => {
  const webauthn = resolveWebAuthnConfig();
  const api = (
    supabase.auth as unknown as {
      mfa?: {
        webauthn?: {
          authenticate: (args: { factorId: string; webauthn?: WebAuthnConfig }) => Promise<{ error: Error | null }>;
        };
      };
    }
  ).mfa?.webauthn;
  if (!api?.authenticate) throw new Error("passkey_api_unavailable");
  const { error } = await api.authenticate({ factorId, webauthn });
  if (error) throw error;
};
