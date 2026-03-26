// supabase/functions/confirm-signup-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    let body: { token?: string; uid?: string };
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

    const { token, uid } = body;
    if (!token || !uid) return json({ error: "token and uid required" }, 400);

    // Fetch and validate the token
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, email_verify_token, email_verify_token_expires_at, email_verified")
      .eq("id", uid)
      .single();

    if (error || !profile) {
      console.error("[confirm-signup-email] profile not found", uid);
      return json({ ok: false, error: "not_found" }, 404);
    }

    if (profile.email_verified) {
      // Already verified — idempotent success
      return json({ ok: true, already_verified: true });
    }

    if (
      profile.email_verify_token !== token ||
      !profile.email_verify_token_expires_at ||
      new Date(profile.email_verify_token_expires_at) < new Date()
    ) {
      console.warn("[confirm-signup-email] invalid or expired token", uid);
      return json({ ok: false, error: "invalid_token" }, 400);
    }

    // Mark verified, clear token
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        email_verified: true,
        email_verify_token: null,
        email_verify_token_expires_at: null,
      })
      .eq("id", uid);

    if (updateError) {
      console.error("[confirm-signup-email] update failed", updateError.message);
      return json({ error: "server error" }, 500);
    }

    return json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[confirm-signup-email] unexpected error", msg);
    return json({ error: "server error" }, 500);
  }
});
