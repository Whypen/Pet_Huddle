import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

type ChangePasswordBody = {
  password?: string;
  access_token?: string;
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

const extractToken = (req: Request, body?: ChangePasswordBody | null) => {
  const huddleToken = (req.headers.get("x-huddle-access-token") ?? "").replace(/^Bearer\s+/i, "").trim();
  const bearerToken = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const bodyToken = String(body?.access_token || "").replace(/^Bearer\s+/i, "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const serviceRole = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  const isUserJwt = (token: string) =>
    token.split(".").length === 3 &&
    token !== anonKey &&
    token !== serviceRole;
  return [huddleToken, bearerToken, bodyToken].find(isUserJwt) ?? null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const serviceRole = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!supabaseUrl || !anonKey || !serviceRole) return json(500, { error: "server_misconfigured" });

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

  const accessToken = extractToken(req, body);
  if (!accessToken) return json(401, { error: "unauthorized" });

  // Validate the JWT and confirm the user exists before proceeding.
  const verifyClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
  });

  const authUser = await verifyClient.auth.getUser(accessToken);
  if (authUser.error || !authUser.data.user?.id) {
    return json(401, { error: "unauthorized" });
  }

  const updateRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  if (!updateRes.ok) {
    const payload = await updateRes.json().catch(() => null) as { msg?: string; error?: string } | null;
    return json(400, { error: payload?.msg || payload?.error || "password_change_failed" });
  }

  return json(200, { data: null });
});
