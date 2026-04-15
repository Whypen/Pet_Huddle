// =============================================================================
// verify-phone-otp — SMS OTP verify gate
// =============================================================================
// Single canonical path for all OTP verifications.
// Each verification must reference an active OTP challenge created by
// send-phone-otp. Verify attempts are capped per challenge.
// Phone is SHA-256 hashed before any DB call — raw number never stored.
//
// Verify paths:
//   otp_type "phone_change" — JWT required
//     → user-scoped client → auth.verifyOtp({phone, token, type:"phone_change"})
//     → Supabase Auth writes phone_confirmed_at for the JWT's user
//     → returns updated user; no new session
//
//   otp_type "sms" — JWT optional
//     → anon client → auth.verifyOtp({phone, token, type:"sms"})
//     → Supabase Auth creates a session for the phone-login user
//     → returns user + session
//
// otp_type must match the type used in the preceding send-phone-otp call
// (returned as otp_type in that response). Mismatch → Supabase Auth error.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RequestBody {
  phone:     string;
  token:     string;
  otp_type:  "sms";
  challenge_id: string;
  device_id?:  string;
  session_id?: string;
}

type VerifyOtpReasonCode =
  | "invalid_code"
  | "expired_code"
  | "code_already_used"
  | "phone_mismatch"
  | "challenge_missing"
  | "challenge_expired"
  | "session_missing"
  | "too_many_incorrect_attempts"
  | "verify_failed";

type PhoneOtpChallengeRow = {
  id: string;
  user_id: string | null;
  phone_e164: string;
  otp_type: "sms";
  status: "sent" | "verified" | "expired" | "failed";
  verify_attempt_count: number;
  expires_at: string;
  created_at: string;
  provider_ref: string | null;
};

// ── CORS ──────────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-huddle-access-token, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
  "Access-Control-Max-Age": "86400",
};

// ── SHA-256 hash helper ───────────────────────────────────────────────────────

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

function classifyVerifyOtpError(raw: string): VerifyOtpReasonCode {
  const message = String(raw || "").toLowerCase();
  if (message.includes("expired")) return "expired_code";
  if (
    (message.includes("already") && message.includes("used")) ||
    message.includes("already verified")
  ) return "code_already_used";
  if (
    message.includes("match this phone") ||
    message.includes("phone mismatch") ||
    message.includes("phone number does not")
  ) return "phone_mismatch";
  if (
    message.includes("session") ||
    message.includes("unauthorized") ||
    message.includes("not authenticated") ||
    message.includes("jwt")
  ) return "session_missing";
  if (message.includes("invalid") || message.includes("not found")) return "invalid_code";
  return "verify_failed";
}

function normalizePhoneForCompare(value: string | null | undefined): string {
  return String(value || "").trim().replace(/\D/g, "");
}

async function checkTwilioVerification(opts: {
  accountSid: string;
  authToken: string;
  verifyServiceSid: string;
  phone: string;
  token: string;
}): Promise<{ sid: string; status: string; valid: boolean }> {
  const body = new URLSearchParams({
    To: opts.phone,
    Code: opts.token,
  });
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${opts.verifyServiceSid}/VerificationCheck`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${opts.accountSid}:${opts.authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      String(payload.message || payload.detail || payload.code || `twilio_verify_failed_${response.status}`),
    );
  }
  return {
    sid: String(payload.sid || "").trim(),
    status: String(payload.status || "").trim().toLowerCase(),
    valid: payload.valid === true,
  };
}

// ── Logger helper ─────────────────────────────────────────────────────────────

async function logAttempt(
  serviceClient: ReturnType<typeof createClient>,
  opts: {
    phoneHash:  string;
    ip:         string;
    status:     "success" | "failed" | "invalid_otp" | "rate_limited";
    userId?:    string | null;
    deviceId?:  string | null;
    sessionId?: string | null;
    reason?:    string | null;
    error?:     string | null;
  },
): Promise<number> {
  try {
    const { data, error } = await serviceClient.rpc("log_phone_otp_attempt", {
      p_phone_hash:   opts.phoneHash,
      p_ip:           opts.ip,
      p_attempt_type: "verify",
      p_status:       opts.status,
      p_user_id:      opts.userId    ?? null,
      p_device_id:    opts.deviceId  ?? null,
      p_session_id:   opts.sessionId ?? null,
      p_reason:       opts.reason    ?? null,
      p_flags:        [],
      p_error:        opts.error     ?? null,
    });
    if (error) {
      console.error("[verify-phone-otp] log error:", error.message);
      return 0;
    }
    return (data as number) ?? 0;
  } catch (err) {
    console.error("[verify-phone-otp] log threw:", err);
    return 0;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: CORS,
    });
  }

  // ── Env ───────────────────────────────────────────────────────────────────
  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey        = Deno.env.get("SUPABASE_ANON_KEY")!;
  const twilioAccountSid = String(Deno.env.get("TWILIO_ACCOUNT_SID") || "").trim();
  const twilioAuthToken = String(Deno.env.get("TWILIO_AUTH_TOKEN") || "").trim();
  const twilioVerifyServiceSid = String(Deno.env.get("TWILIO_VERIFY_SERVICE_SID") || "").trim();

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !anonKey ||
    !twilioAccountSid ||
    !twilioAuthToken ||
    !twilioVerifyServiceSid
  ) {
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
  try { body = await req.json() as RequestBody; }
  catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: CORS,
    });
  }

  const rawPhone  = (body.phone  ?? "").trim();
  const rawToken  = (body.token  ?? "").trim();
  const otpType   = body.otp_type;
  const challengeId = String(body.challenge_id ?? "").trim();
  const deviceId  = body.device_id  ?? null;
  const sessionId = body.session_id ?? null;

  // ── Input validation (no DB log for empty inputs — no phone to hash) ──────
  if (!rawPhone || !rawToken) {
    return new Response(
      JSON.stringify({ error: "Phone and verification code are required" }),
      { status: 400, headers: CORS },
    );
  }

  if (!challengeId) {
    return new Response(
      JSON.stringify({
        error: "Verification session missing. Request a new code.",
        reason_code: "challenge_missing",
      }),
      { status: 400, headers: CORS },
    );
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(challengeId)) {
    return new Response(
      JSON.stringify({
        error: "Verification session missing. Request a new code.",
        reason_code: "challenge_missing",
      }),
      { status: 400, headers: CORS },
    );
  }

  if (otpType !== "sms") {
    return new Response(
      JSON.stringify({ error: "otp_type must be 'sms'" }),
      { status: 400, headers: CORS },
    );
  }

  // ── Hash phone — raw number never reaches any DB call ────────────────────
  const phoneHash = await sha256Hex(rawPhone);

  // ── JWT extraction (same pattern as send-phone-otp and connect-link) ──────
  const bearerToken = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const huddleToken = (req.headers.get("x-huddle-access-token") ?? "").replace(/^Bearer\s+/i, "").trim();
  const accessToken = [huddleToken, bearerToken].find(
    (t) => t.split(".").length === 3 && t !== anonKey,
  ) ?? null;

  let userId: string | null = null;

  if (accessToken) {
    const { data: { user }, error: authErr } =
      await serviceClient.auth.getUser(accessToken);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: CORS,
      });
    }
    userId = user.id;
  }

  if (!userId) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized: phone verification requires authentication",
        reason_code: "session_missing",
      }),
      { status: 401, headers: CORS },
    );
  }

  const normalizedPhone = normalizePhoneForCompare(rawPhone);
  const { data: challengeData, error: challengeErr } = await serviceClient
    .from("phone_otp_challenges")
    .select("id,user_id,phone_e164,otp_type,status,verify_attempt_count,expires_at,created_at,provider_ref")
    .eq("id", challengeId)
    .maybeSingle();
  const challenge = challengeData as PhoneOtpChallengeRow | null;

  if (challengeErr) {
    console.error("[verify-phone-otp] challenge load error:", challengeErr.message);
    await logAttempt(serviceClient, {
      phoneHash, ip: clientIp, status: "failed",
      userId, deviceId, sessionId,
      reason: "challenge_query_error", error: challengeErr.message,
    });
    return new Response(JSON.stringify({ error: "Could not process request" }), {
      status: 500, headers: CORS,
    });
  }

  if (!challenge) {
    await logAttempt(serviceClient, {
      phoneHash, ip: clientIp, status: "failed",
      userId, deviceId, sessionId,
      reason: "challenge_missing",
    });
    return new Response(
      JSON.stringify({
        error: "Verification session missing. Request a new code.",
        reason_code: "challenge_missing",
      }),
      { status: 400, headers: CORS },
    );
  }

  const challengePhone = normalizePhoneForCompare(challenge.phone_e164);
  if (
    challengePhone !== normalizedPhone ||
    challenge.otp_type !== otpType ||
    (challenge.user_id !== null && challenge.user_id !== userId)
  ) {
    await logAttempt(serviceClient, {
      phoneHash, ip: clientIp, status: "failed",
      userId, deviceId, sessionId,
      reason: "challenge_phone_mismatch",
    });
    return new Response(
      JSON.stringify({
        error: "Verification session missing. Request a new code.",
        reason_code: "challenge_missing",
      }),
      { status: 400, headers: CORS },
    );
  }

  if (challenge.user_id === null) {
    const { error: adoptChallengeError } = await serviceClient
      .from("phone_otp_challenges")
      .update({
        user_id: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", challenge.id)
      .is("user_id", null);
    if (adoptChallengeError) {
      console.error("[verify-phone-otp] adopt challenge error:", adoptChallengeError.message);
      await logAttempt(serviceClient, {
        phoneHash, ip: clientIp, status: "failed",
        userId, deviceId, sessionId,
        reason: "challenge_adopt_failed",
        error: adoptChallengeError.message,
      });
      return new Response(
        JSON.stringify({
          error: "Verification session missing. Request a new code.",
          reason_code: "challenge_missing",
        }),
        { status: 400, headers: CORS },
      );
    }
  }

  if (challenge.status === "verified") {
    await logAttempt(serviceClient, {
      phoneHash, ip: clientIp, status: "failed",
      userId, deviceId, sessionId,
      reason: "challenge_already_verified",
    });
    return new Response(
      JSON.stringify({
        error: "Code already used. Request a new code.",
        reason_code: "code_already_used",
      }),
      { status: 409, headers: CORS },
    );
  }

  const expiresAtMs = Date.parse(String(challenge.expires_at || ""));
  if (challenge.status !== "sent" || (Number.isFinite(expiresAtMs) && expiresAtMs > 0 && Date.now() > expiresAtMs)) {
    await serviceClient
      .from("phone_otp_challenges")
      .update({
        status: "expired",
        updated_at: new Date().toISOString(),
      })
      .eq("id", challenge.id)
      .eq("status", "sent");
    await logAttempt(serviceClient, {
      phoneHash, ip: clientIp, status: "failed",
      userId, deviceId, sessionId,
      reason: "challenge_expired",
    });
    return new Response(
      JSON.stringify({
        error: "Code expired. Request a new code.",
        reason_code: "challenge_expired",
      }),
      { status: 410, headers: CORS },
    );
  }

  if ((challenge.verify_attempt_count ?? 0) >= 5) {
    await serviceClient
      .from("phone_otp_challenges")
      .update({
        status: "failed",
        error_reason: "verify_attempt_cap",
        updated_at: new Date().toISOString(),
      })
      .eq("id", challenge.id)
      .eq("status", "sent");
    const logId = await logAttempt(serviceClient, {
      phoneHash, ip: clientIp, status: "rate_limited",
      userId, deviceId, sessionId,
      reason: "verify_attempt_cap",
    });
    return new Response(
      JSON.stringify({
        error: "Too many attempts. Please request a new code.",
        log_id: logId,
        reason_code: "too_many_incorrect_attempts",
        retry_after: 0,
      }),
      { status: 429, headers: CORS },
    );
  }

  let verifyError: string | null = null;
  let verifyApproved = false;
  let verificationSid: string | null = null;

  try {
    const verification = await checkTwilioVerification({
      accountSid: twilioAccountSid,
      authToken: twilioAuthToken,
      verifyServiceSid: twilioVerifyServiceSid,
      phone: rawPhone,
      token: rawToken,
    });
    verificationSid = verification.sid || challenge.provider_ref || null;
    verifyApproved = verification.valid || verification.status === "approved";
    if (!verifyApproved) {
      verifyError = verification.status === "pending"
        ? "invalid verification code"
        : verification.status || "verify_failed";
    }
  } catch (error) {
    verifyError = error instanceof Error ? error.message : "verify_failed";
  }

  // ── Log and respond ───────────────────────────────────────────────────────

  if (verifyError) {
    const reasonCode = classifyVerifyOtpError(verifyError);
    const isInvalid = reasonCode !== "verify_failed" && reasonCode !== "session_missing";
    const nextAttemptCount = (challenge.verify_attempt_count ?? 0) + 1;
    const nextStatus = reasonCode === "expired_code" || reasonCode === "code_already_used"
      ? "expired"
      : nextAttemptCount >= 5
        ? "failed"
        : "sent";
    await serviceClient
      .from("phone_otp_challenges")
      .update({
        verify_attempt_count: nextAttemptCount,
        status: nextStatus,
        error_reason: verifyError,
        updated_at: new Date().toISOString(),
      })
      .eq("id", challenge.id);
    const logId = await logAttempt(serviceClient, {
      phoneHash, ip: clientIp,
      status: isInvalid ? "invalid_otp" : "failed",
      userId, deviceId, sessionId,
      reason: isInvalid ? "invalid_or_expired" : "verify_error",
      error: verifyError,
    });
    const userMessage = reasonCode === "session_missing"
      ? "Verification session missing. Request a new code."
      : reasonCode === "expired_code"
        ? "Code expired. Request a new code."
        : reasonCode === "code_already_used"
          ? "Code already used. Request a new code."
          : reasonCode === "phone_mismatch"
            ? "Code does not match this phone."
            : reasonCode === "invalid_code"
              ? "Incorrect code. Please try again."
              : "Verification failed. Please try again.";
    return new Response(
      JSON.stringify({
        error: userMessage,
        reason_code: reasonCode,
        log_id: logId,
      }),
      { status: reasonCode === "verify_failed" ? 500 : 401, headers: CORS },
    );
  }

  const verifiedAtIso = new Date().toISOString();
  const targetUserId = userId;

  await serviceClient
    .from("phone_otp_challenges")
    .update({
      status: "verified",
      verify_attempt_count: (challenge.verify_attempt_count ?? 0) + 1,
      verified_at: verifiedAtIso,
      error_reason: null,
      provider_ref: verificationSid,
      updated_at: verifiedAtIso,
    })
    .eq("id", challenge.id);

  if (targetUserId) {
    await serviceClient
      .from("profiles")
      .update({
        phone: rawPhone,
        phone_verification_status: "verified",
        phone_verified_at: verifiedAtIso,
        updated_at: verifiedAtIso,
      })
      .eq("id", targetUserId);

    const { error: verificationInsertError } = await serviceClient
      .from("verification_requests")
      .insert({
        user_id: targetUserId,
        request_type: "phone",
        status: "approved",
        provider: "supabase",
      submitted_data: { phone: rawPhone, challenge_id: challenge.id, otp_type: otpType },
      verification_result: { status: "approved", verified_at: verifiedAtIso, provider_ref: verificationSid },
    });
    if (verificationInsertError) {
      console.error("[verify-phone-otp] verification request insert error:", verificationInsertError.message);
    }

    const { error: phoneRefreshError } = await serviceClient.rpc("refresh_phone_verification_status", {
      p_user_id: targetUserId,
    });
    if (phoneRefreshError && !String(phoneRefreshError.message || "").includes("profile_not_found")) {
      console.error("[verify-phone-otp] refresh_phone_verification_status error:", phoneRefreshError.message);
    }

    const { error: refreshError } = await serviceClient.rpc("refresh_identity_verification_status", {
      p_user_id: targetUserId,
    });
    if (refreshError && !String(refreshError.message || "").includes("profile_not_found")) {
      console.error("[verify-phone-otp] refresh_identity_verification_status error:", refreshError.message);
    }
  }

  const logId = await logAttempt(serviceClient, {
    phoneHash, ip: clientIp, status: "success",
    userId, deviceId, sessionId,
    reason: "otp_verified",
  });

  return new Response(
    JSON.stringify({
      ok:      true,
      log_id:  logId,
      user:    null,
      session: null,
    }),
    { status: 200, headers: CORS },
  );
});
