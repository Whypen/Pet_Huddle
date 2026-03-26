/**
 * brevo-webhook — Brevo → app DB unsubscribe/blocklist mirror
 *
 * Guardrail: this function only mirrors unsubscribe/blocklist events
 * back to app DB. It is NEVER a source of truth. App DB is canonical.
 *
 * Handles Brevo event types:
 *   - unsubscribed
 *   - hardBounce  (treat as suppressed)
 *   - blocked     (Brevo blocklist)
 *
 * On any of these: set profiles.marketing_consent = false
 *                  set profiles.marketing_unsubscribed_at = now()
 *
 * Auth: Brevo Token Authentication. Token is checked from:
 *   1. ?token=<value> query parameter (Brevo appends this when Token Auth is configured)
 *   2. Authorization: Bearer <value> header (fallback)
 * Set BREVO_WEBHOOK_SECRET to the token value configured in Brevo.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const BREVO_WEBHOOK_SECRET = Deno.env.get("BREVO_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SUPPRESSION_EVENTS = new Set(["unsubscribed", "hardBounce", "blocked"]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const rawBody = await req.text();

  // Token authentication: check ?token= query param (Brevo Token Auth) or Authorization header
  if (BREVO_WEBHOOK_SECRET) {
    const url = new URL(req.url);
    const queryToken = url.searchParams.get("token") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const receivedToken = queryToken || bearerToken;
    if (!receivedToken || receivedToken !== BREVO_WEBHOOK_SECRET) {
      console.warn("[brevo-webhook] token mismatch — rejecting");
      return json({ error: "unauthorized" }, 401);
    }
  } else {
    console.warn("[brevo-webhook] BREVO_WEBHOOK_SECRET not set — skipping auth check");
  }

  let events: Array<{ event?: string; email?: string }>;
  try {
    const parsed = JSON.parse(rawBody);
    // Brevo sends either an array or a single object
    events = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  let mirrored = 0;
  for (const ev of events) {
    const eventType = ev.event ?? "";
    const email = (ev.email ?? "").toLowerCase().trim();

    if (!SUPPRESSION_EVENTS.has(eventType)) continue;
    if (!email) continue;

    // Find profile by email. Auth email is the canonical identifier.
    const { data: profile, error: findError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (findError) {
      console.error("[brevo-webhook] profile lookup failed", email, findError);
      continue;
    }

    if (!profile) {
      // Try auth.users lookup via service role RPC
      const { data: authUser } = await supabase.rpc("find_user_id_by_email", { p_email: email });
      if (!authUser) {
        console.warn("[brevo-webhook] no profile found for email", email);
        continue;
      }
      // Update by auth user id
      await supabase
        .from("profiles")
        .update({
          marketing_consent:         false,
          marketing_subscribed:      false,
          marketing_unsubscribed_at: new Date().toISOString(),
        })
        .eq("id", authUser);
      mirrored++;
      console.log("[brevo-webhook] mirrored suppression via auth lookup", email, eventType);
      continue;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        marketing_consent:         false,
        marketing_subscribed:      false,
        marketing_unsubscribed_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    if (updateError) {
      console.error("[brevo-webhook] update failed", email, updateError);
      continue;
    }

    mirrored++;
    console.log("[brevo-webhook] mirrored suppression", email, eventType);
  }

  return json({ ok: true, mirrored });
});
