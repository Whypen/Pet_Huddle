// =============================================================================
// verify-phone-otp — SMS OTP verify gate
// =============================================================================
// Single canonical path for all OTP verifications.
// Enforces a hard cap of 3 verify attempts per phone per 24 h (DB-side).
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
  otp_type:  "phone_change" | "sms";
  device_id?:  string;
  session_id?: string;
}

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

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
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
  const deviceId  = body.device_id  ?? null;
  const sessionId = body.session_id ?? null;

  // ── Input validation (no DB log for empty inputs — no phone to hash) ──────
  if (!rawPhone || !rawToken) {
    return new Response(
      JSON.stringify({ error: "Phone and verification code are required" }),
      { status: 400, headers: CORS },
    );
  }

  if (otpType !== "phone_change" && otpType !== "sms") {
    return new Response(
      JSON.stringify({ error: "otp_type must be 'phone_change' or 'sms'" }),
      { status: 400, headers: CORS },
    );
  }

  // ── Hash phone — raw number never reaches any DB call ────────────────────
  const phoneHash = await sha256Hex(rawPhone);

  // ── JWT extraction (same pattern as send-phone-otp and connect-link) ──────
  const bearerToken = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const huddleToken = (req.headers.get("x-huddle-access-token") ?? "").replace(/^Bearer\s+/i, "").trim();
  const accessToken = [bearerToken, huddleToken].find(
    (t) => t.split(".").length === 3,
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

  // phone_change requires a valid JWT — the auth server needs the user context
  // to know whose phone_confirmed_at to update.
  if (otpType === "phone_change" && !userId) {
    return new Response(
      JSON.stringify({ error: "Unauthorized: phone_change verification requires authentication" }),
      { status: 401, headers: CORS },
    );
  }

  // ── Verify attempt cap: 3 per phone per 24 h (DB-enforced) ───────────────
  // Uses count: "exact" — PostgREST returns the count in response.count,
  // not in data. head: true suppresses row bodies.
  const { count: verifyCount, error: countErr } = await serviceClient
    .from("phone_otp_attempts")
    .select("id", { count: "exact", head: true })
    .eq("phone_hash", phoneHash)
    .eq("attempt_type", "verify")
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (countErr) {
    console.error("[verify-phone-otp] count query error:", countErr.message);
    // Block on error — do not silently allow
    await logAttempt(serviceClient, {
      phoneHash, ip: clientIp, status: "failed",
      userId, deviceId, sessionId,
      reason: "count_query_error", error: countErr.message,
    });
    return new Response(JSON.stringify({ error: "Could not process request" }), {
      status: 500, headers: CORS,
    });
  }

  if ((verifyCount ?? 0) >= 3) {
    const logId = await logAttempt(serviceClient, {
      phoneHash, ip: clientIp, status: "rate_limited",
      userId, deviceId, sessionId,
      reason: "verify_daily_cap",
    });
    return new Response(
      JSON.stringify({
        error: "Too many attempts. Please request a new code.",
        log_id: logId,
        retry_after: 86400,
      }),
      { status: 429, headers: { ...CORS, "Retry-After": "86400" } },
    );
  }

  // ── Call Supabase Auth verifyOtp ──────────────────────────────────────────
  //
  // phone_change: user-scoped client with the validated JWT.
  //   Supabase Auth identifies the user via the Authorization header,
  //   confirms the OTP, writes phone_confirmed_at. No new session.
  //
  // sms: anon client (no user context required).
  //   Supabase Auth validates OTP for the phone-login user,
  //   creates and returns a new session.

  let verifyData: { user: object | null; session: object | null } | null = null;
  let verifyError: string | null = null;

  if (otpType === "phone_change") {
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data, error } = await userClient.auth.verifyOtp({
      phone: rawPhone,
      token: rawToken,
      type:  "phone_change",
    });
    if (error) verifyError = error.message;
    else verifyData = { user: data.user, session: data.session };

  } else {
    // sms path — anon client
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anonClient.auth.verifyOtp({
      phone: rawPhone,
      token: rawToken,
      type:  "sms",
    });
    if (error) verifyError = error.message;
    else verifyData = { user: data.user, session: data.session };
  }

  // ── Log and respond ───────────────────────────────────────────────────────

  if (verifyError) {
    const isInvalid = /invalid|expired|not found/i.test(verifyError);
    const logId = await logAttempt(serviceClient, {
      phoneHash, ip: clientIp,
      status: isInvalid ? "invalid_otp" : "failed",
      userId, deviceId, sessionId,
      reason: isInvalid ? "invalid_or_expired" : "verify_error",
      error: verifyError,
    });
    return new Response(
      JSON.stringify({
        error: isInvalid
          ? "Invalid or expired code. Please try again."
          : "Verification failed. Please try again.",
        log_id: logId,
      }),
      { status: 401, headers: CORS },
    );
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
      user:    verifyData?.user    ?? null,
      session: verifyData?.session ?? null,
    }),
    { status: 200, headers: CORS },
  );
});
