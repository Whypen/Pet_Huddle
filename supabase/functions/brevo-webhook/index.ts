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
 * Signature verification: Brevo signs webhook payloads with an HMAC-SHA256
 * signature in the X-Brevo-Signature header using the webhook secret.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { hmac } from "https://deno.land/x/hmac@v2.0.1/mod.ts";

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

  // Verify HMAC signature if secret is configured
  if (BREVO_WEBHOOK_SECRET) {
    const sig = req.headers.get("X-Brevo-Signature") ?? req.headers.get("x-brevo-signature") ?? "";
    const expected = hmac("sha256", BREVO_WEBHOOK_SECRET, rawBody, "utf8", "hex");
    if (sig !== expected) {
      console.warn("[brevo-webhook] signature mismatch — rejecting");
      return json({ error: "unauthorized" }, 401);
    }
  } else {
    console.warn("[brevo-webhook] BREVO_WEBHOOK_SECRET not set — skipping signature check");
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
