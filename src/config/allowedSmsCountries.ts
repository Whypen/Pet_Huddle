// =============================================================================
// SMS OTP — client-side country guard (UX mirror only)
// =============================================================================
// Source of truth: ALLOWED_SMS_COUNTRY_CODES Supabase project secret.
//   Aligned to: Twilio Console → Verify → Settings → Geo permissions
//   (the authoritative Verify Geo Permissions screen, not Voice Dialing
//    Permissions or Messaging Geo Permissions — those are separate systems).
//
// This file reads VITE_ALLOWED_SMS_COUNTRY_CODES, a Vite-build-time mirror of
// that secret, to surface early UX feedback without a round-trip.
//
// Secret name (Supabase project secret) : ALLOWED_SMS_COUNTRY_CODES
// Vite env var (must match exactly)     : VITE_ALLOWED_SMS_COUNTRY_CODES
// Format (both)                         : comma-separated ISO 3166-1 alpha-2
//                                         e.g. "AU,BE,CA,DK,FI,FR,DE,HK,IE,
//                                               JP,LU,NL,NZ,NO,KR,SG,SE,CH,
//                                               TW,GB,US"
//
// If VITE_ALLOWED_SMS_COUNTRY_CODES is absent or empty, isPhoneCountryAllowed()
// returns true (client guard disabled). The send-phone-otp edge function always
// reads ALLOWED_SMS_COUNTRY_CODES directly and enforces authoritatively.
//
// +1 (NANP) handling:
//   libphonenumber-js resolves each +1 number to its specific ISO country:
//   US → 'US', Canada → 'CA', Jamaica → 'JM', Trinidad → 'TT', etc.
//   Only 'US' and 'CA' are in the allowlist. All other NANP territories are
//   blocked. Mirrors supabase/functions/_shared/phoneCountry.ts exactly.
// =============================================================================

import { parsePhoneNumber } from "libphonenumber-js/min";

export const COUNTRY_NOT_ALLOWED_MESSAGE =
  "SMS verification is currently unavailable in your region.";

// ── Allowlist ─────────────────────────────────────────────────────────────────
// Populated from VITE_ALLOWED_SMS_COUNTRY_CODES at build time.
// Empty set → client guard disabled (server enforces authoritatively).

const _raw: string = import.meta.env.VITE_ALLOWED_SMS_COUNTRY_CODES ?? "";

export const ALLOWED_ISO_CODES: ReadonlySet<string> = new Set(
  _raw
    ? _raw.split(",").map((c: string) => c.trim().toUpperCase()).filter(Boolean)
    : [],
);

// ── isPhoneCountryAllowed ─────────────────────────────────────────────────────
// Client-side UX guard — NOT a security boundary.
//
// Algorithm (mirrors supabase/functions/_shared/phoneCountry.ts exactly):
//   1. If allowlist is empty: return true (client guard disabled).
//   2. Parse with libphonenumber-js; reject invalid numbers.
//   3. Allow iff parsed.country is in the allowlist.
//
// For +1 numbers: parsed.country distinguishes US, CA, JM, TT, DO, KY, etc.
// Only US and CA are in the allowlist; other NANP territories are blocked.

export function isPhoneCountryAllowed(phone: string): boolean {
  if (ALLOWED_ISO_CODES.size === 0) return true; // client guard disabled

  try {
    const parsed = parsePhoneNumber(phone);
    if (!parsed?.isValid()) return false;
    return parsed.country != null && ALLOWED_ISO_CODES.has(parsed.country);
  } catch {
    return false;
  }
}
