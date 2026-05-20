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
  defer_profile_seed?: boolean;
  device_id?: string;
  install_id?: string;
};

type SignupSeed = {
  email: string;
  display_name: string | null;
  legal_name: string | null;
  social_id: string | null;
  phone: string | null;
  dob: string | null;
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
  return text.includes("already registered") || text.includes("already been registered") || text.includes("user already exists");
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
): Promise<{ ok: boolean; error: string | null }> => {
  const uid = String(userId || "").trim();
  if (!uid) return { ok: false, error: "missing_user_id" };
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/brevo-sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
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
      return { ok: false, error: `brevo_sync_http_${response.status}:${text.slice(0, 500)}` };
    }
    return { ok: true, error: null };
  } catch (error) {
    console.warn("[auth-signup] brevo profile_completed sync failed", error);
    return { ok: false, error: error instanceof Error ? error.message : "brevo_sync_fetch_failed" };
  }
};

const explainBrevoFailure = (error: string | null) => {
  const detail = String(error || "Unknown Brevo sync failure").trim();
  const lower = detail.toLowerCase();
  if (lower.includes("wrong_list")) {
    return "The configured Brevo list is not the expected 'huddle users' list.";
  }
  if (lower.includes("not_found") || lower.includes("404")) {
    return "Brevo could not find the configured contact list or contact.";
  }
  if (lower.includes("api_key") || lower.includes("401") || lower.includes("403")) {
    return "Brevo rejected the API credentials.";
  }
  if (lower.includes("timeout") || lower.includes("fetch") || lower.includes("socket")) {
    return "Huddle could not reach Brevo due to a network or timeout issue.";
  }
  if (lower.includes("add-to-list") || lower.includes("list")) {
    return "The user contact was not successfully added to the Brevo list.";
  }
  return "The user contact could not be synced to Brevo.";
};

const markBrevoSyncPending = async (
  serviceClient: ReturnType<typeof createClient>,
  userId: string | null | undefined,
  reason: string,
) => {
  const uid = String(userId || "").trim();
  if (!uid) return;
  const { error } = await serviceClient
    .from("profiles")
    .update({
      brevo_sync_required: true,
      brevo_sync_reason: reason,
    })
    .eq("id", uid);
  if (error) {
    console.warn("[auth-signup] brevo pending flag update failed", uid, error.message);
  }
};

const createBrevoSyncSupportTicket = async (
  serviceClient: ReturnType<typeof createClient>,
  userId: string | null | undefined,
  email: string,
  attempts: number,
  error: string | null,
) => {
  const uid = String(userId || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const plainReason = explainBrevoFailure(error);
  const message = [
    "Automatic Brevo contact sync failed after 3 attempts.",
    "",
    `Affected user ID: ${uid || "unknown"}`,
    `Affected email: ${normalizedEmail || "unknown"}`,
    `Failure type: ${plainReason}`,
    `Technical detail: ${String(error || "unknown").slice(0, 1000)}`,
    "",
    "Plain English: A new Huddle user may not have been added to the Brevo 'huddle users' mailing list. Please check the Brevo list/API configuration and re-sync this user.",
  ].join("\n");

  const { error: insertError } = await serviceClient
    .from("support_tickets")
    .insert({
      ticket_number: "",
      user_id: uid || null,
      name: "Huddle system",
      email: "support@huddle.pet",
      subject: `Brevo sync failed after ${attempts} attempts`,
      message,
      wants_reply: false,
      status: "open",
    });
  if (insertError) {
    console.warn("[auth-signup] brevo support ticket insert failed", insertError.message);
  }
};

const syncBrevoProfileCompletedWithRetries = async (
  serviceClient: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string | null | undefined,
  email: string,
) => {
  await markBrevoSyncPending(serviceClient, userId, "profile_completed");
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await fireBrevoProfileCompleted(supabaseUrl, serviceRoleKey, userId);
    if (result.ok) return;
    lastError = result.error;
    await markBrevoSyncPending(serviceClient, userId, `profile_completed_failed:${attempt}:${lastError || "unknown"}`);
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  await createBrevoSyncSupportTicket(serviceClient, userId, email, 3, lastError);
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

const canonicalizeVerifiedSignupEmail = async (
  serviceClient: ReturnType<typeof createClient>,
  userId: string | null | undefined,
  email: string,
  signupProof: string,
): Promise<{ error: string | null }> => {
  const uid = String(userId || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!signupProof || !uid || !normalizedEmail) return { error: null };

  const confirm = await serviceClient.auth.admin.updateUserById(uid, {
    email_confirm: true,
  });
  if (confirm.error) {
    return { error: confirm.error.message || "signup_confirm_failed" };
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: row, error: readError } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("id", uid)
      .maybeSingle();
    if (readError) return { error: readError.message || "profile_lookup_failed" };
    if (!row) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }

    const { error: updateError } = await serviceClient
      .from("profiles")
      .update({ email: normalizedEmail, email_verified: true })
      .eq("id", uid);
    return { error: updateError ? updateError.message || "profile_email_verify_failed" : null };
  }

  return { error: "profile_row_not_ready" };
};

const ensureSessionForVerifiedSignup = async (
  authClient: ReturnType<typeof createClient>,
  serviceClient: ReturnType<typeof createClient>,
  userId: string | null | undefined,
  email: string,
  password: string,
  signupProof: string,
) => {
  if (!signupProof) return { session: null, error: null as string | null };
  const uid = String(userId || "").trim();
  if (!uid) return { session: null, error: "signup_user_missing" };

  const confirm = await serviceClient.auth.admin.updateUserById(uid, {
    email_confirm: true,
  });
  if (confirm.error) {
    return { session: null, error: confirm.error.message || "signup_confirm_failed" };
  }

  const signIn = await authClient.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.session) {
    return { session: null, error: signIn.error?.message || "signup_session_missing" };
  }

  return {
    session: {
      access_token: signIn.data.session.access_token,
      refresh_token: signIn.data.session.refresh_token,
    },
    error: null as string | null,
  };
};

const normalizeOptionalText = (value: unknown): string | null => {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
};

const normalizeOptionalDate = (value: unknown): string | null => {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
};

const createSignupUser = async (
  authClient: ReturnType<typeof createClient>,
  serviceClient: ReturnType<typeof createClient>,
  email: string,
  password: string,
  options: SignupBody["options"],
  signupProof: string,
) => {
  if (signupProof) {
    const created = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: options?.data ?? {},
    });
    return {
      data: {
        user: created.data.user ?? null,
        session: null,
      },
      error: created.error,
    };
  }

  return authClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: options?.emailRedirectTo,
      data: options?.data,
    },
  });
};

const seedIncompleteProfile = async (
  serviceClient: ReturnType<typeof createClient>,
  userId: string | null | undefined,
  seed: SignupSeed,
  options?: { emailVerified?: boolean },
) => {
  const uid = String(userId || "").trim();
  if (!uid) return;

  const payload: Record<string, unknown> = {
    id: uid,
    email: seed.email.toLowerCase(),
    onboarding_completed: false,
    updated_at: new Date().toISOString(),
  };
  if (options?.emailVerified === true) payload.email_verified = true;

  if (seed.display_name) payload.display_name = seed.display_name;
  if (seed.legal_name) payload.legal_name = seed.legal_name;
  if (seed.social_id) payload.social_id = seed.social_id.toLowerCase();
  if (seed.phone) payload.phone = seed.phone;
  if (seed.dob) payload.dob = seed.dob;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await serviceClient
      .from("profiles")
      .upsert(payload, { onConflict: "id" });
    if (!error) return;
    if (attempt === 7) {
      console.warn("[auth-signup] profile seed upsert failed", uid, error.message);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
};

const removeDeferredSignupProfile = async (
  serviceClient: ReturnType<typeof createClient>,
  userId: string | null | undefined,
) => {
  const uid = String(userId || "").trim();
  if (!uid) return;
  const { error } = await serviceClient
    .from("profiles")
    .delete()
    .eq("id", uid);
  if (error) {
    console.warn("[auth-signup] deferred profile cleanup failed", uid, error.message);
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const serviceRoleKey = String(Deno.env.get("HUDDLE_SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
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
  const signupSeed: SignupSeed = {
    email,
    display_name: normalizeOptionalText(body.options?.data?.display_name),
    legal_name: normalizeOptionalText(body.options?.data?.legal_name),
    social_id: normalizeOptionalText(body.options?.data?.social_id),
    phone,
    dob: normalizeOptionalDate(body.options?.data?.dob),
  };
  const deferProfileSeed = body.defer_profile_seed === true;

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
  const signUp = await createSignupUser(authClient, serviceClient, email, password, body.options, signupProof);

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

    const retrySignUp = await createSignupUser(authClient, serviceClient, email, password, body.options, signupProof);
    if (retrySignUp.error) {
      return json(400, { error: retrySignUp.error.message || "signup_failed" });
    }

    if (signupProof) {
      await serviceClient
        .from("presignup_tokens")
        .update({ signup_proof_used_at: new Date().toISOString() })
        .eq("signup_proof", signupProof);
    }

    let retrySession = retrySignUp.data.session
      ? {
          access_token: retrySignUp.data.session.access_token,
          refresh_token: retrySignUp.data.session.refresh_token,
        }
      : null;

    if (!retrySession && signupProof) {
      const recoveredSession = await ensureSessionForVerifiedSignup(
        authClient,
        serviceClient,
        retrySignUp.data.user?.id,
        email,
        password,
        signupProof,
      );
      if (recoveredSession.error) {
        return json(400, { error: recoveredSession.error });
      }
      retrySession = recoveredSession.session;
    }
    if (deferProfileSeed) {
      await removeDeferredSignupProfile(serviceClient, retrySignUp.data.user?.id);
    } else {
      await seedIncompleteProfile(serviceClient, retrySignUp.data.user?.id, signupSeed, { emailVerified: Boolean(signupProof) });
    }
    if (!deferProfileSeed) {
      const retryCanonicalEmail = await canonicalizeVerifiedSignupEmail(
        serviceClient,
        retrySignUp.data.user?.id,
        email,
        signupProof,
      );
      if (retryCanonicalEmail.error) return json(400, { error: retryCanonicalEmail.error });
    }
    if (!signupProof) await repairProfileEmail(serviceClient, retrySignUp.data.user?.id, email);
    if (!deferProfileSeed) {
      await syncBrevoProfileCompletedWithRetries(
        serviceClient,
        supabaseUrl,
        serviceRoleKey,
        retrySignUp.data.user?.id,
        email,
      );
    }

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

  let session = signUp.data.session
    ? {
        access_token: signUp.data.session.access_token,
        refresh_token: signUp.data.session.refresh_token,
      }
    : null;

  if (!session && signupProof) {
    const recoveredSession = await ensureSessionForVerifiedSignup(
      authClient,
      serviceClient,
      signUp.data.user?.id,
      email,
      password,
      signupProof,
    );
    if (recoveredSession.error) {
      return json(400, { error: recoveredSession.error });
    }
    session = recoveredSession.session;
  }
  if (deferProfileSeed) {
    await removeDeferredSignupProfile(serviceClient, signUp.data.user?.id);
  } else {
    await seedIncompleteProfile(serviceClient, signUp.data.user?.id, signupSeed, { emailVerified: Boolean(signupProof) });
  }
  if (!deferProfileSeed) {
    const canonicalEmail = await canonicalizeVerifiedSignupEmail(
      serviceClient,
      signUp.data.user?.id,
      email,
      signupProof,
    );
    if (canonicalEmail.error) return json(400, { error: canonicalEmail.error });
  }
  if (!signupProof) await repairProfileEmail(serviceClient, signUp.data.user?.id, email);
  if (!deferProfileSeed) {
    await syncBrevoProfileCompletedWithRetries(
      serviceClient,
      supabaseUrl,
      serviceRoleKey,
      signUp.data.user?.id,
      email,
    );
  }

  return json(200, {
    data: {
      session,
      user: signUp.data.user ?? null,
    },
  });
});
