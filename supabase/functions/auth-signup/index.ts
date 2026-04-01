import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import { getExpectedTurnstileHostnames, validateTurnstile } from "../_shared/turnstile.ts";

type SignupBody = {
  email?: string;
  password?: string;
  options?: {
    emailRedirectTo?: string;
    data?: Record<string, unknown>;
  };
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  if (!supabaseUrl || !anonKey) return json(500, { error: "server_misconfigured" });

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

  const turnstile = await validateTurnstile(
    body.turnstile_token ?? null,
    clientIp(req),
    "signup",
    getExpectedTurnstileHostnames(),
  );
  if (!turnstile.valid) {
    return json(403, { error: "human_verification_failed", turnstile_reason: turnstile.reason });
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
    return json(400, { error: signUp.error.message || "signup_failed" });
  }

  const session = signUp.data.session
    ? {
        access_token: signUp.data.session.access_token,
        refresh_token: signUp.data.session.refresh_token,
      }
    : null;

  return json(200, {
    data: {
      session,
      user: signUp.data.user ?? null,
    },
  });
});
