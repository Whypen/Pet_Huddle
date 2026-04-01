import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import { getExpectedTurnstileHostnames, validateTurnstile } from "../_shared/turnstile.ts";

type ChangePasswordBody = {
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

const extractToken = (req: Request) => {
  const bearerToken = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const huddleToken = (req.headers.get("x-huddle-access-token") ?? "").replace(/^Bearer\s+/i, "").trim();
  return [bearerToken, huddleToken].find((token) => token.split(".").length === 3) ?? null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  if (!supabaseUrl || !anonKey) return json(500, { error: "server_misconfigured" });

  let body: ChangePasswordBody;
  try {
    body = (await req.json()) as ChangePasswordBody;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const password = String(body.password || "").trim();
  if (password.length < 8) {
    return json(400, { error: "password_min_8_chars" });
  }

  const accessToken = extractToken(req);
  if (!accessToken) return json(401, { error: "unauthorized" });

  const turnstile = await validateTurnstile(
    body.turnstile_token ?? null,
    clientIp(req),
    "change_password",
    getExpectedTurnstileHostnames(),
  );
  if (!turnstile.valid) {
    return json(403, { error: "human_verification_failed", turnstile_reason: turnstile.reason });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const authUser = await userClient.auth.getUser();
  if (authUser.error || !authUser.data.user?.id) {
    return json(401, { error: "unauthorized" });
  }

  const update = await userClient.auth.updateUser({ password });
  if (update.error) {
    return json(400, { error: update.error.message || "password_change_failed" });
  }

  return json(200, { data: null });
});

