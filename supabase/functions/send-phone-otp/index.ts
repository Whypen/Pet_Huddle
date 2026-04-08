// =============================================================================
// send-phone-otp — SMS OTP send gate
// =============================================================================
// Single canonical path for all OTP sends in the VerifyIdentity flow.
// Enforces rate limits (DB-side) before triggering Supabase Auth SMS.
// Phone is SHA-256 hashed before any DB call — raw number never stored.
//
// Auth paths:
//   Authenticated (JWT in header) → user-scoped client → auth.updateUser({phone})
//     → Supabase Auth sends phone_change OTP; verified with type "phone_change"
//   Unauthenticated (no valid JWT) → service_role → signInWithOtp
//     → Supabase Auth sends sms OTP; verified with type "sms"
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import {
  parseAllowedIsos,
  isPhoneCountryAllowed,
} from "../_shared/phoneCountry.ts";
import {
  getExpectedTurnstileHostnames,
  validateTurnstile,
} from "../_shared/turnstile.ts";

// ── Types ────────────────────────────────────────────────────────────────────

interface RequestBody {
  phone: string;
  device_id?: string;   // FingerprintJS visitorId, optional
  session_id?: string;  // optional
  turnstile_token?: string;
  turnstile_action?: string;
}

interface RateLimitRow {
  is_limited: boolean;
  reason: string | null;
  phone_cnt: number;
  user_cnt: number;
  ip_cnt: number;
  seconds_until_allow: number;
}

type OtpSendReasonCode =
  | "provider_config_error"
  | "sms_region_blocked"
  | "rate_limited"
  | "user_not_found"
  | "provider_send_failed";

// ── CORS ─────────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-huddle-access-token, x-client-info, apikey, content-type",
};

const ALLOWED_TURNSTILE_ACTIONS = new Set([
  "send_phone_otp",
  "send_pre_signup_verify",
]);

// ── SHA-256 hash helper ───────────────────────────────────────────────────────
// Returns lowercase hex digest. Phone must already be E.164-normalised.

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Client IP extraction ──────────────────────────────────────────────────────

function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function classifyOtpSendError(raw: string): OtpSendReasonCode {
  const message = String(raw || "").toLowerCase();
  if (
    message.includes("provider") ||
    message.includes("twilio") ||
    message.includes("verify service") ||
    message.includes("sms is disabled") ||
    message.includes("phone provider is not configured")
  ) {
    return "provider_config_error";
  }
  if (
    message.includes("country") ||
    message.includes("region") ||
    message.includes("geo")
  ) {
    return "sms_region_blocked";
  }
  if (
    message.includes("too many requests") ||
    message.includes("rate limit") ||
    message.includes("too_many")
  ) {
    return "rate_limited";
  }
  if (
    message.includes("user not found") ||
    message.includes("user does not exist") ||
    message.includes("no user")
  ) {
    return "user_not_found";
  }
  return "provider_send_failed";
}

// ── Logger helper ─────────────────────────────────────────────────────────────
// Uses service_role client — bypasses RLS for insert.

async function logAttempt(
  serviceClient: ReturnType<typeof createClient>,
  opts: {
    phoneHash: string;
    ip: string;
    attemptType: "request" | "resend";
    status: "success" | "failed" | "rate_limited" | "suspicious";
    userId?: string | null;
    deviceId?: string | null;
    sessionId?: string | null;
    reason?: string | null;
    flags?: string[];
    error?: string | null;
  },
): Promise<number> {
  try {
    const { data, error } = await serviceClient.rpc("log_phone_otp_attempt", {
      p_phone_hash:   opts.phoneHash,
      p_ip:           opts.ip,
      p_attempt_type: opts.attemptType,
      p_status:       opts.status,
      p_user_id:      opts.userId   ?? null,
      p_device_id:    opts.deviceId ?? null,
      p_session_id:   opts.sessionId ?? null,
      p_reason:       opts.reason   ?? null,
      p_flags:        opts.flags    ?? [],
      p_error:        opts.error    ?? null,
    });
    if (error) {
      console.error("[send-phone-otp] log error:", error.message);
      return 0;
    }
    return (data as number) ?? 0;
  } catch (err) {
    console.error("[send-phone-otp] log threw:", err);
    return 0;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: CORS,
    });
  }

  // ── Env ───────────────────────────────────────────────────────────────────
  const supabaseUrl      = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey          = Deno.env.get("SUPABASE_ANON_KEY")!;
  // ALLOWED_SMS_COUNTRY_CODES: comma-separated Twilio geo-permission ISOs.
  // Single source of truth for the business allowlist — set as a Supabase
  // project secret. Required; missing → fail-closed (500).
  const allowedIsosRaw   = Deno.env.get("ALLOWED_SMS_COUNTRY_CODES");
  const allowedIsos      = parseAllowedIsos(allowedIsosRaw);

  if (!supabaseUrl || !serviceRoleKey || !anonKey || !allowedIsos) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500, headers: CORS,
    });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const clientIp = getClientIp(req);

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: CORS,
    });
  }

  const rawPhone = (body.phone ?? "").trim();
  const deviceId  = body.device_id  ?? null;
  const sessionId = body.session_id ?? null;
  const turnstileToken = body.turnstile_token ?? null;
  const turnstileAction = String(body.turnstile_action ?? "send_pre_signup_verify").trim() || "send_pre_signup_verify";

  if (!ALLOWED_TURNSTILE_ACTIONS.has(turnstileAction)) {
    return new Response(JSON.stringify({ error: "Invalid turnstile action" }), {
      status: 400,
      headers: CORS,
    });
  }

  if (!rawPhone) {
    return new Response(JSON.stringify({ error: "Phone number is required" }), {
      status: 400, headers: CORS,
    });
  }

  // ── Hash phone — never passes raw phone to DB ────────────────────────────
  const phoneHash = await sha256Hex(rawPhone);
  const turnstile = await validateTurnstile(
    turnstileToken,
    clientIp,
    turnstileAction,
    getExpectedTurnstileHostnames(),
  );
  if (!turnstile.valid) {
    await logAttempt(serviceClient, {
      phoneHash,
      ip: clientIp,
      attemptType: "request",
      status: "failed",
      userId: null,
      deviceId,
      sessionId,
      reason: `turnstile_${turnstile.reason}`,
      flags: [
        "turnstile_failed",
        `turnstile_action:${turnstile.action || "missing"}`,
        `turnstile_hostname:${turnstile.hostname || "missing"}`,
      ],
      error: turnstile.error_codes.join(",") || turnstile.reason,
    });
    return new Response(JSON.stringify({
      error: "Human verification failed.",
      turnstile_reason: turnstile.reason,
    }), {
      status: 403,
      headers: CORS,
    });
  }

  // ── Country allowlist gate ────────────────────────────────────────────────
  // Authoritative enforcement. Uses libphonenumber-js to validate and extract
  // the calling code, maps it to the Twilio geo-permission ISO, then checks
  // against the ALLOWED_SMS_COUNTRY_CODES secret (allowedIsos set above).
  // Checked before rate-limit query and Auth call so blocked countries consume
  // no OTP quota and no Supabase Auth resources. Logged for ops visibility.
  if (!isPhoneCountryAllowed(rawPhone, allowedIsos)) {
    await logAttempt(serviceClient, {
      phoneHash, ip: clientIp,
      attemptType: "request", status: "failed",
      userId: null, deviceId, sessionId,
      reason: "country_not_allowed",
    });
    return new Response(
      JSON.stringify({ error: "SMS verification is currently unavailable in your region." }),
      { status: 403, headers: CORS },
    );
  }

  // ── Resolve authenticated user from JWT (if present) ──────────────────────
  // x-huddle-access-token carries the user JWT when authenticated.
  // Authorization always carries the anon key (a valid 3-part JWT) so it must
  // not be checked first — the anon key is not a user JWT and would cause
  // getUser() to return an error, incorrectly triggering a 401.
  // Prefer huddleToken; fall back to bearerToken only if huddle is absent.
  const authHeader   = req.headers.get("Authorization") ?? "";
  const huddleHeader = req.headers.get("x-huddle-access-token") ?? "";
  const bearerToken  = authHeader.replace(/^Bearer\s+/i, "").trim();
  const huddleToken  = huddleHeader.replace(/^Bearer\s+/i, "").trim();
  const accessToken  = [huddleToken, bearerToken].find(
    (t) => t.split(".").length === 3,
  ) ?? null;

  let userId: string | null = null;

  if (accessToken) {
    const { data: { user }, error: authErr } =
      await serviceClient.auth.getUser(accessToken);
    if (authErr || !user) {
      // Invalid token — reject rather than fall through to unauthenticated path
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: CORS,
      });
    }
    userId = user.id;
  }

  // ── Rate limit gate (DB-enforced) ─────────────────────────────────────────
  const { data: limitRows, error: limitErr } = await serviceClient
    .rpc("check_phone_otp_rate_limit", {
      p_phone_hash: phoneHash,
      p_user_id:    userId,   // NULL for unauthenticated — DB skips user cap
      p_ip:         clientIp,
    });

  if (limitErr || !limitRows || (limitRows as RateLimitRow[]).length === 0) {
    console.error("[send-phone-otp] rate limit RPC error:", limitErr?.message);
    // Safe fallback: block rather than silently allow
    await logAttempt(serviceClient, {
      phoneHash, ip: clientIp,
      attemptType: "request", status: "failed",
      userId, deviceId, sessionId,
      reason: "rate_limit_rpc_error", error: limitErr?.message,
    });
    return new Response(JSON.stringify({ error: "Could not process request" }), {
      status: 500, headers: CORS,
    });
  }

  const limit = (limitRows as RateLimitRow[])[0];

  if (limit.is_limited) {
    await logAttempt(serviceClient, {
      phoneHash, ip: clientIp,
      attemptType: "request", status: "rate_limited",
      userId, deviceId, sessionId,
      reason: limit.reason,
      flags: ["rate_limited"],
    });
    return new Response(
      JSON.stringify({
        error: `Too many attempts. Please try again in ${limit.seconds_until_allow} seconds.`,
        retry_after: limit.seconds_until_allow,
      }),
      {
        status: 429,
        headers: { ...CORS, "Retry-After": String(limit.seconds_until_allow) },
      },
    );
  }

  // ── Suspicious pattern flags ──────────────────────────────────────────────
  const flags: string[] = [];
  if (limit.phone_cnt > 3) flags.push("high_request_count"); // 4th send of the day
  if (limit.ip_cnt    > 15) flags.push("high_ip_count");      // IP nearing cap

  // ── Send OTP via Supabase Auth ────────────────────────────────────────────
  //
  // Authenticated path: user-scoped client calls auth.updateUser({phone}).
  //   Supabase Auth sends a phone_change OTP. The verify step uses type
  //   "phone_change" (writes phone_confirmed_at on success, no session swap).
  //
  // Unauthenticated path: service_role client calls signInWithOtp.
  //   Supabase Auth sends an sms OTP. The verify step uses type "sms".

  let sendError: string | null = null;

  if (accessToken && userId) {
    // Call /auth/v1/user PUT directly with the user's JWT.
    // supabase-js auth.updateUser() throws "Auth session missing!" when
    // persistSession:false because it reads from internal session state,
    // not from global.headers.Authorization. The REST call is identical
    // to what auth.updateUser() does internally and avoids that check.
    const authResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "apikey": anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone: rawPhone }),
    });
    if (!authResp.ok) {
      const authBody = await authResp.json().catch(() => ({})) as Record<string, string>;
      sendError = authBody.msg || authBody.message || authBody.error_description || `auth_update_failed_${authResp.status}`;
    }
  } else {
    // Unauthenticated path (phone-login users whose phone is in auth.users.phone)
    const { error } = await serviceClient.auth.signInWithOtp({
      phone: rawPhone,
      options: { channel: "sms", shouldCreateUser: false },
    });
    if (error) sendError = error.message;
  }

  if (sendError) {
    const reasonCode = classifyOtpSendError(sendError);
    const statusCode = reasonCode === "rate_limited"
      ? 429
      : reasonCode === "sms_region_blocked"
        ? 403
        : 500;
    await logAttempt(serviceClient, {
      phoneHash, ip: clientIp,
      attemptType: "request", status: "failed",
      userId, deviceId, sessionId,
      reason: `otp_send_error:${reasonCode}`, error: sendError,
    });
    return new Response(
      JSON.stringify({
        error: reasonCode,
        reason_code: reasonCode,
      }),
      { status: statusCode, headers: CORS },
    );
  }

  // ── Log success ───────────────────────────────────────────────────────────
  const logId = await logAttempt(serviceClient, {
    phoneHash, ip: clientIp,
    attemptType: "request",
    status: flags.length > 0 ? "suspicious" : "success",
    userId, deviceId, sessionId,
    reason: flags.length > 0 ? flags.join(",") : "turnstile_ok",
    flags: [
      ...flags,
      "turnstile_success",
      `turnstile_action:${turnstile.action || "send_phone_otp"}`,
      `turnstile_hostname:${turnstile.hostname || "missing"}`,
      `turnstile_challenge_ts:${turnstile.challenge_ts || "missing"}`,
    ],
  });

  return new Response(
    JSON.stringify({
      ok: true,
      log_id: logId,
      attempt_count: limit.phone_cnt + 1,
      // otp_type tells the client which type to use in verifyOtp()
      otp_type: (accessToken && userId) ? "phone_change" : "sms",
    }),
    { status: 200, headers: CORS },
  );
});
