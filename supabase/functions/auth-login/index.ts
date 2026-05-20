import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import { getExpectedTurnstileHostnames, validateTurnstile } from "../_shared/turnstile.ts";

type LoginBody = {
  email?: string;
  phone?: string;
  password?: string;
  turnstile_token?: string;
  turnstile_action?: string;
};

type ProfileAuthRepairState = {
  canRepair: boolean;
  reason: string;
  userId: string | null;
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

const isEmailNotConfirmedError = (message: string) => {
  const normalized = message.toLowerCase();
  return normalized.includes("email not confirmed") || normalized.includes("email_not_confirmed");
};

const findAuthUserIdByEmail = async (
  serviceClient: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  email: string,
): Promise<{ userId: string | null; error: string | null }> => {
  const normalized = email.toLowerCase();

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

const getProfileAuthRepairState = async (
  serviceClient: ReturnType<typeof createClient>,
  userId: string | null,
  email: string,
): Promise<ProfileAuthRepairState> => {
  const normalizedEmail = email.toLowerCase();
  if (!userId) {
    return { canRepair: false, reason: "auth_user_missing", userId: null };
  }

  const { data: profileById, error: profileByIdError } = await serviceClient
    .from("profiles")
    .select("id,email,email_verified,onboarding_completed,account_status")
    .eq("id", userId)
    .maybeSingle();

  if (profileByIdError) {
    return { canRepair: false, reason: "profile_lookup_failed", userId };
  }

  const profile = profileById || (await (async () => {
    const { data: profileByEmail, error: profileByEmailError } = await serviceClient
      .from("profiles")
      .select("id,email,email_verified,onboarding_completed,account_status")
      .ilike("email", normalizedEmail)
      .maybeSingle();
    if (profileByEmailError) return null;
    if (profileByEmail && String(profileByEmail.id || "") !== userId) return null;
    return profileByEmail;
  })());

  if (!profile) return { canRepair: false, reason: "profile_missing", userId };
  if (String(profile.account_status || "").trim() === "removed") {
    return { canRepair: false, reason: "profile_removed", userId };
  }
  if (String(profile.email || "").trim().toLowerCase() !== normalizedEmail) {
    return { canRepair: false, reason: "profile_email_mismatch", userId };
  }
  if (profile.email_verified !== true && profile.onboarding_completed !== true) {
    return { canRepair: false, reason: "profile_not_verified", userId };
  }

  return { canRepair: true, reason: "profile_proves_confirmed_account", userId };
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const serviceRoleKey = String(Deno.env.get("HUDDLE_SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!supabaseUrl || !anonKey) return json(500, { error: "server_misconfigured" });

  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const email = String(body.email || "").trim();
  const phone = String(body.phone || "").trim();
  const password = String(body.password || "").trim();
  if (!password || (!email && !phone)) {
    return json(400, { error: "email_or_phone_and_password_required" });
  }

  const turnstileToken = String(body.turnstile_token || "").trim();
  if (turnstileToken) {
    const turnstile = await validateTurnstile(
      turnstileToken,
      clientIp(req),
      "login",
      getExpectedTurnstileHostnames(),
    );
    if (!turnstile.valid) {
      return json(403, {
        error: "human_verification_failed",
        turnstile_reason: turnstile.reason,
        turnstile_error_codes: turnstile.error_codes,
      });
    }
  }

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  let signIn = phone
    ? await authClient.auth.signInWithPassword({ phone, password })
    : await authClient.auth.signInWithPassword({ email, password });

  if (signIn.error) {
    const originalError = signIn.error.message || "login_failed";
    if (email && isEmailNotConfirmedError(originalError) && serviceRoleKey) {
      const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
      const { userId, error: lookupError } = await findAuthUserIdByEmail(
        serviceClient,
        supabaseUrl,
        serviceRoleKey,
        email,
      );
      if (lookupError) return json(500, { error: "auth_user_lookup_failed" });

      const repairState = await getProfileAuthRepairState(serviceClient, userId, email);
      if (repairState.canRepair && repairState.userId) {
        const confirm = await serviceClient.auth.admin.updateUserById(repairState.userId, {
          email_confirm: true,
        });
        if (confirm.error) return json(500, { error: "auth_email_confirm_repair_failed" });

        signIn = await authClient.auth.signInWithPassword({ email, password });
        if (!signIn.error) {
          const { error: profileUpdateError } = await serviceClient
            .from("profiles")
            .update({ email_verified: true })
            .eq("id", repairState.userId);
          if (profileUpdateError) {
            console.warn("[auth-login] profile email_verified repair failed", repairState.userId, profileUpdateError.message);
          }
        }
      }

      if (!signIn.error) {
        // Continue to normal successful response below.
      } else {
        return json(400, {
          error: signIn.error.message || originalError,
          code: "email_confirmation_inconsistent",
          repair_reason: repairState.reason,
        });
      }
    } else {
      return json(400, { error: originalError });
    }
  }

  if (signIn.error) {
    return json(400, { error: signIn.error.message || "login_failed" });
  }

  const session = signIn.data.session
    ? {
        access_token: signIn.data.session.access_token,
        refresh_token: signIn.data.session.refresh_token,
      }
    : null;

  return json(200, {
    data: {
      session,
      user: signIn.data.user ?? null,
    },
  });
});
