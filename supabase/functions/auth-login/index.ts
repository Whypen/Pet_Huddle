import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import { getExpectedTurnstileHostnames, validateTurnstile } from "../_shared/turnstile.ts";

type LoginBody = {
  email?: string;
  phone?: string;
  password?: string;
  turnstile_token?: string;
  turnstile_action?: string;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-huddle-access-token, x-client-info, apikey, content-type",
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
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
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

  const turnstile = await validateTurnstile(
    body.turnstile_token ?? null,
    clientIp(req),
    "login",
    getExpectedTurnstileHostnames(),
  );
  if (!turnstile.valid) {
    return json(403, { error: "human_verification_failed", turnstile_reason: turnstile.reason });
  }

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const signIn = phone
    ? await authClient.auth.signInWithPassword({ phone, password })
    : await authClient.auth.signInWithPassword({ email, password });

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

