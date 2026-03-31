// =============================================================================
// phoneCountry — shared phone country resolution for Deno edge functions
// =============================================================================
// Source of truth for the business allowlist:
//   ALLOWED_SMS_COUNTRY_CODES  (Supabase project secret)
//   Format: comma-separated ISO 3166-1 alpha-2 codes, e.g.
//           "AU,BE,CA,DK,FI,FR,DE,HK,IE,JP,LU,NL,NZ,NO,KR,SG,SE,CH,TW,GB,US"
//
// Derived from: Twilio Verify UI geographic permissions (verified 2026-03-31).
//
// +1 (NANP) handling:
//   libphonenumber-js resolves each +1 number to a specific ISO country code:
//   US for US numbers, CA for Canadian numbers, JM for Jamaican (+1-876), etc.
//   Only 'US' and 'CA' are in the approved set. All other NANP territories
//   (JM, TT, DO, BB, KY, and others) are blocked by the ISO check below.
//   No special NANP bucket logic is used — parsed.country is the sole gate.
//
// +44 (UK) handling:
//   libphonenumber-js returns 'GB' for most UK numbers but 'GG'/'JE'/'IM' for
//   Channel Islands / Isle of Man. Only 'GB' is in the approved set; GG/JE/IM
//   will be blocked. Add them explicitly if needed.
// =============================================================================

import { parsePhoneNumber } from "https://esm.sh/libphonenumber-js@1.12.27/min";

// ── parseAllowedIsos ─────────────────────────────────────────────────────────
// Parses ALLOWED_SMS_COUNTRY_CODES env var into a Set<string>.
// Returns null if the value is absent or empty — callers must treat null as
// misconfiguration and fail-closed (500), not as "allow all".

export function parseAllowedIsos(
  envValue: string | undefined,
): Set<string> | null {
  if (!envValue?.trim()) return null;
  const codes = envValue
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  return codes.length > 0 ? new Set(codes) : null;
}

// ── isPhoneCountryAllowed ─────────────────────────────────────────────────────
// Returns true iff the phone number's ISO country is in the allowedIsos set.
//
// Algorithm:
//   1. Parse with libphonenumber-js/min (throws on invalid input).
//   2. Reject if parsed.isValid() is false.
//   3. Allow iff parsed.country is in allowedIsos.
//
// This applies uniformly to all calling codes including +1. A Jamaican number
// (+1-876) yields parsed.country = 'JM'; since 'JM' is not in the allowlist
// it is blocked. A US number yields 'US'; a Canadian number yields 'CA' —
// both are in the allowlist and pass.

export function isPhoneCountryAllowed(
  phone: string,
  allowedIsos: Set<string>,
): boolean {
  try {
    const parsed = parsePhoneNumber(phone);
    if (!parsed.isValid()) return false;
    return parsed.country != null && allowedIsos.has(parsed.country);
  } catch {
    return false;
  }
}
