import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import { getExpectedTurnstileHostnames, validateTurnstile } from "../_shared/turnstile.ts";

type ResetBody = {
  email?: string;
  redirectTo?: string;
  turnstile_token?: string;
  turnstile_action?: string;
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

const DEFAULT_RESET_REDIRECT =
  "https://huddle.pet/auth/callback?type=recovery&next=/update-password";

const normalizeRedirectTo = (value: string) => {
  try {
    const url = new URL(value);
    if (url.pathname === "/update-password") {
      url.pathname = "/auth/callback";
      url.searchParams.set("type", "recovery");
      url.searchParams.set("next", "/update-password");
      return url.toString();
    }
    return value;
  } catch {
    return value;
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  if (!supabaseUrl || !anonKey) return json(500, { error: "server_misconfigured" });

  let body: ResetBody;
  try {
    body = (await req.json()) as ResetBody;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const redirectTo = normalizeRedirectTo(String(body.redirectTo || "").trim() || DEFAULT_RESET_REDIRECT);
  if (!email) return json(400, { error: "email_required" });

  const turnstile = await validateTurnstile(
    body.turnstile_token ?? null,
    clientIp(req),
    "reset_password",
    getExpectedTurnstileHostnames(),
  );
  if (!turnstile.valid) {
    return json(403, { error: "human_verification_failed", turnstile_reason: turnstile.reason });
  }

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const res = await authClient.auth.resetPasswordForEmail(email, { redirectTo });
  if (res.error) {
    console.warn("[auth-reset-password] resetPasswordForEmail returned error", {
      email_domain: email.includes("@") ? email.split("@").slice(-1)[0] : "invalid",
      redirectTo,
      message: res.error.message || "reset_failed",
    });
    // Keep the browser-facing response generic for password reset requests.
    // This avoids leaking reset delivery state and prevents UX dead-ends on
    // provider-side send errors after we have already validated the address.
    return json(200, { data: null });
  }

  return json(200, { data: null });
});
