// supabase/functions/confirm-marketing-doi/index.ts
//
// Handles the DOI confirmation link click.
// Validates token → sets marketing_subscribed = true → fires brevo-sync.
// Idempotent: already-confirmed users return ok immediately.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")          ?? "";
const SUPABASE_SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

    // Fetch profile
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, marketing_doi_token, marketing_doi_token_expires_at, marketing_doi_confirmed")
      .eq("id", uid)
      .single();

    if (error || !profile) {
      console.error("[confirm-marketing-doi] profile not found", uid);
      return json({ ok: false, error: "not_found" }, 404);
    }

    // Idempotent — already confirmed
    if (profile.marketing_doi_confirmed) {
      return json({ ok: true, already_confirmed: true });
    }

    // Validate token + expiry
    if (
      profile.marketing_doi_token !== token ||
      !profile.marketing_doi_token_expires_at ||
      new Date(profile.marketing_doi_token_expires_at) < new Date()
    ) {
      console.warn("[confirm-marketing-doi] invalid or expired token", uid);
      return json({ ok: false, error: "invalid_token" }, 400);
    }

    const now = new Date().toISOString();

    // Mark DOI confirmed + set subscribed (mirror to marketing_consent for brevo-sync compat)
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        marketing_doi_confirmed:        true,
        marketing_doi_confirmed_at:     now,
        marketing_subscribed:           true,
        // Mirror legacy field so brevo-sync keeps working without changes
        marketing_consent:              true,
        marketing_consent_at:           now,
        // Clear token
        marketing_doi_token:            null,
        marketing_doi_token_expires_at: null,
      })
      .eq("id", uid);

    if (updateError) {
      console.error("[confirm-marketing-doi] update failed", updateError.message);
      return json({ error: "server error" }, 500);
    }

    // Fire brevo-sync marketing_doi_confirmed event (fail-open)
    void fetch(`${SUPABASE_URL}/functions/v1/brevo-sync`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ event: "marketing_doi_confirmed", user_id: uid }),
    }).catch((err) =>
      console.warn("[confirm-marketing-doi] brevo-sync fire failed", err)
    );

    return json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[confirm-marketing-doi] unexpected error", msg);
    return json({ error: "server error" }, 500);
  }
});
