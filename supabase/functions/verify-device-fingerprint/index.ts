import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const supabase = createClient(supabaseUrl, serviceRoleKey);

type RequestPayload = {
  visitorId?: string;
  source?: "signup" | "login" | "verify_identity_entry" | "other";
  userAgent?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const corsPreflightResponse = () =>
  new Response("ok", {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });

const withCors = (_req: Request, response: Response) => {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "*");
  return response;
};

serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return corsPreflightResponse();
    }
    if (req.method !== "POST") {
      return withCors(req, json({ error: "method_not_allowed" }, 405));
    }

    // Prefer x-huddle-access-token (user JWT sent by invokeAuthedFunction).
    // Authorization header carries the gateway anon key, not the user token.
    const huddleToken = req.headers.get("x-huddle-access-token") || "";
    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = huddleToken || authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return withCors(req, json({ error: "missing_token" }, 401));

    const authUser = await supabase.auth.getUser(accessToken);
    const userId = authUser.data?.user?.id;
    if (!userId) return withCors(req, json({ error: "unauthorized" }, 401));

    const payload = (await req.json().catch(() => ({}))) as RequestPayload;
    const visitorId = String(payload.visitorId || "").trim();
    if (!visitorId) return withCors(req, json({ error: "missing_visitor_id" }, 400));

    const source = payload.source || "other";
    const metadata = {
      source,
      user_agent: payload.userAgent || req.headers.get("user-agent") || null,
      captured_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from("device_fingerprint_history")
      .upsert(
        {
          user_id: userId,
          visitor_id: visitorId,
          last_seen_at: new Date().toISOString(),
          metadata,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,visitor_id" },
      );
    if (upsertError) throw upsertError;

    const { data: row } = await supabase
      .from("device_fingerprint_history")
      .select("id,first_seen_at,last_seen_at,risk_flag,review_flag,matched_banned_user_id")
      .eq("user_id", userId)
      .eq("visitor_id", visitorId)
      .maybeSingle();

    const { data: statusData, error: statusError } = await supabase
      .rpc("refresh_identity_verification_status", { p_user_id: userId });
    if (statusError && !String(statusError.message || "").includes("profile_not_found")) {
      throw statusError;
    }

    return withCors(req, json({
      ok: true,
      verificationStatus: statusData ?? "unverified",
      fingerprint: row ?? null,
    }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[verify-device-fingerprint]", message);
    return withCors(req, json({ error: message || "unknown_error" }, 500));
  }
});
