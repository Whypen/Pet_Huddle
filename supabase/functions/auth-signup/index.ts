import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import { getExpectedTurnstileHostnames, validateTurnstile } from "../_shared/turnstile.ts";
import { hasUsableSignupProof } from "../_shared/signupProof.ts";

type SignupBody = {
  email?: string;
  phone?: string;
  password?: string;
  options?: {
    emailRedirectTo?: string;
    data?: Record<string, unknown>;
  };
  turnstile_token?: string;
  turnstile_action?: string;
  signup_proof?: string;
  device_id?: string;
  install_id?: string;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-huddle-access-token, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
  "Access-Control-Max-Age": "86400",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
  req.headers.get("x-real-ip") ||
  "unknown";

const ACCOUNT_UNAVAILABLE_MESSAGE =
  "Your Huddle account is unavailable. Contact support@huddle.pet if you think this is a mistake.";
const SIGNUP_REVIEW_MESSAGE =
  "Signup is temporarily unavailable. Please try again later.";

const isAlreadyRegisteredError = (message: string) => {
  const text = message.toLowerCase();
  return text.includes("already registered") || text.includes("user already exists");
};

const findAuthUserIdByEmail = async (
  serviceClient: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  email: string,
): Promise<{ userId: string | null; error: string | null }> => {
  const normalized = email.toLowerCase();

  // Prefer direct admin email lookup to avoid pagination misses on large user sets.
  try {
    const response = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(normalized)}`,
      {
        method: "GET",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (response.ok) {
      const payload = (await response.json()) as { users?: Array<{ id?: string; email?: string }> };
      const users = payload.users || [];
      const match = users.find((user) => String(user.email || "").trim().toLowerCase() === normalized);
      if (match?.id) return { userId: match.id, error: null };
      if (users.length === 0) return { userId: null, error: null };
    }
  } catch {
    // Fall through to paginated lookup.
  }

  const perPage = 200;
  const maxPages = 200;

  for (let page = 1; page <= maxPages; page += 1) {
    const listed = await serviceClient.auth.admin.listUsers({ page, perPage });
    if (listed.error) return { userId: null, error: listed.error.message || "auth_user_lookup_failed" };
    const users = listed.data?.users || [];
    const match = users.find((user) => String(user.email || "").trim().toLowerCase() === normalized);
    if (match?.id) return { userId: match.id, error: null };
    if (users.length < perPage) break;
  }

  return { userId: null, error: null };
};

const fireBrevoProfileCompleted = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string | null | undefined,
) => {
  const uid = String(userId || "").trim();
  if (!uid) return;
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/brevo-sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event: "profile_completed",
        user_id: uid,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn("[auth-signup] brevo profile_completed sync returned non-ok", response.status, text);
    }
  } catch (error) {
    console.warn("[auth-signup] brevo profile_completed sync failed", error);
  }
};

const repairProfileEmail = async (
  serviceClient: ReturnType<typeof createClient>,
  userId: string | null | undefined,
  email: string,
) => {
  const uid = String(userId || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!uid || !normalizedEmail) return;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data: row, error: readError } = await serviceClient
      .from("profiles")
      .select("id,email")
      .eq("id", uid)
      .maybeSingle();
    if (readError) {
      console.warn("[auth-signup] profile email read failed", uid, readError.message);
      return;
    }
    if (!row) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }
    if (String(row.email || "").trim().toLowerCase() === normalizedEmail) return;
    const { error: updateError } = await serviceClient
      .from("profiles")
      .update({ email: normalizedEmail })
      .eq("id", uid);
    if (updateError) {
      console.warn("[auth-signup] profile email repair failed", uid, updateError.message);
    }
    return;
  }

  console.warn("[auth-signup] profile row not ready for email repair", uid);
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json(500, { error: "server_misconfigured" });

  let body: SignupBody;
  try {
    body = (await req.json()) as SignupBody;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const email = String(body.email || "").trim();
  const password = String(body.password || "").trim();
  if (!email || !password) {
    return json(400, { error: "email_and_password_required" });
  }
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const phoneFromBody = String(body.phone || "").trim();
  const phoneFromOptions = String(body.options?.data?.phone || "").trim();
  const phone = phoneFromBody || phoneFromOptions || null;

  const { data: blockStatus, error: blockStatusError } = await serviceClient.rpc("lookup_signup_blocks", {
    p_email: email,
    p_phone: phone,
    p_device_id: String(body.device_id || "").trim() || null,
    p_install_id: String(body.install_id || "").trim() || null,
  });
  if (blockStatusError) {
    return json(500, { error: "signup_block_check_failed" });
  }
  const blocked = Boolean((blockStatus as { blocked?: unknown } | null)?.blocked);
  if (blocked) {
    return json(403, {
      error: "account_unavailable",
      public_message:
        String((blockStatus as { public_message?: unknown } | null)?.public_message || "").trim() ||
        ACCOUNT_UNAVAILABLE_MESSAGE,
    });
  }
  const reviewRequired = Boolean((blockStatus as { review_required?: unknown } | null)?.review_required);
  const cooldownUntil =
    String((blockStatus as { cooldown_until?: unknown } | null)?.cooldown_until || "").trim() || null;
  if (reviewRequired) {
    return json(429, {
      error: "signup_temporarily_unavailable",
      public_message: SIGNUP_REVIEW_MESSAGE,
      cooldown_until: cooldownUntil,
    });
  }

  const signupProof = String(body.signup_proof || "").trim();

  if (signupProof) {
    const { data: row, error } = await serviceClient
      .from("presignup_tokens")
      .select("token,email,verified,expires_at,signup_proof,signup_proof_expires_at,signup_proof_used_at")
      .eq("signup_proof", signupProof)
      .maybeSingle();

    if (error) return json(500, { error: "signup_proof_lookup_failed" });
    if (!row) return json(403, { error: "signup_proof_invalid" });
    if (String(row.email || "").trim().toLowerCase() !== email.toLowerCase()) {
      return json(403, { error: "signup_proof_email_mismatch" });
    }
    if (!row.verified) return json(403, { error: "signup_proof_not_verified" });
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return json(403, { error: "signup_proof_parent_expired" });
    }
    if (!hasUsableSignupProof(row)) {
      return json(403, { error: row.signup_proof_used_at ? "signup_proof_reused" : "signup_proof_expired" });
    }
  } else {
    const turnstile = await validateTurnstile(
      body.turnstile_token ?? null,
      clientIp(req),
      "signup",
      getExpectedTurnstileHostnames(),
    );
    if (!turnstile.valid) {
      return json(403, { error: "human_verification_failed", turnstile_reason: turnstile.reason });
    }
  }

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const signUp = await authClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: body.options?.emailRedirectTo,
      data: body.options?.data,
    },
  });

  if (signUp.error) {
    const originalError = signUp.error.message || "signup_failed";
    if (!isAlreadyRegisteredError(originalError)) {
      return json(400, { error: originalError });
    }

    // Recovery path for orphan auth users:
    // email exists in auth.users but no profile row (deleted/abandoned account).
    const { userId, error: lookupError } = await findAuthUserIdByEmail(
      serviceClient,
      supabaseUrl,
      serviceRoleKey,
      email,
    );
    if (lookupError) return json(500, { error: "auth_user_lookup_failed" });

    let resolvedUserId = userId;
    if (!resolvedUserId) {
      const { data: profileByEmail, error: profileByEmailError } = await serviceClient
        .from("profiles")
        .select("id,account_status,email")
        .ilike("email", email)
        .maybeSingle();
      if (profileByEmailError) return json(500, { error: "profile_email_lookup_failed" });
      if (profileByEmail?.id && profileByEmail.account_status === "removed") {
        resolvedUserId = profileByEmail.id;
      } else if (profileByEmail?.id) {
        return json(400, { error: originalError });
      }
    }

    if (!resolvedUserId) return json(400, { error: originalError });

    const { data: profileRow, error: profileLookupError } = await serviceClient
      .from("profiles")
      .select("id,account_status")
      .eq("id", resolvedUserId)
      .maybeSingle();
    if (profileLookupError) return json(500, { error: "profile_lookup_failed" });
    const isRemovedProfile = Boolean(profileRow && profileRow.account_status === "removed");
    if (profileRow && !isRemovedProfile) return json(400, { error: originalError });

    const deleteResult = await serviceClient.auth.admin.deleteUser(resolvedUserId);
    if (deleteResult.error) return json(500, { error: "orphan_auth_cleanup_failed" });

    if (isRemovedProfile) {
      const { error: profileDeleteError } = await serviceClient
        .from("profiles")
        .delete()
        .eq("id", resolvedUserId);
      if (profileDeleteError) return json(500, { error: "removed_profile_cleanup_failed" });
    }

    const retrySignUp = await authClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: body.options?.emailRedirectTo,
        data: body.options?.data,
      },
    });
    if (retrySignUp.error) {
      return json(400, { error: retrySignUp.error.message || "signup_failed" });
    }

    if (signupProof) {
      await serviceClient
        .from("presignup_tokens")
        .update({ signup_proof_used_at: new Date().toISOString() })
        .eq("signup_proof", signupProof);
    }

    const retrySession = retrySignUp.data.session
      ? {
          access_token: retrySignUp.data.session.access_token,
          refresh_token: retrySignUp.data.session.refresh_token,
        }
      : null;

    await repairProfileEmail(serviceClient, retrySignUp.data.user?.id, email);
    void fireBrevoProfileCompleted(supabaseUrl, serviceRoleKey, retrySignUp.data.user?.id);

    return json(200, {
      data: {
        session: retrySession,
        user: retrySignUp.data.user ?? null,
      },
    });
  }

  if (signupProof) {
    await serviceClient
      .from("presignup_tokens")
      .update({ signup_proof_used_at: new Date().toISOString() })
      .eq("signup_proof", signupProof);
  }

  const session = signUp.data.session
    ? {
        access_token: signUp.data.session.access_token,
        refresh_token: signUp.data.session.refresh_token,
      }
    : null;

  await repairProfileEmail(serviceClient, signUp.data.user?.id, email);
  void fireBrevoProfileCompleted(supabaseUrl, serviceRoleKey, signUp.data.user?.id);

  return json(200, {
    data: {
      session,
      user: signUp.data.user ?? null,
    },
  });
});
