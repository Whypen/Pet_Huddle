import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const firstSecretKey = (value: string | null | undefined) => {
  const raw = String(value || "").trim().replace(/^['"]+|['"]+$/g, "");
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item || "").trim()).find(Boolean) || "";
    if (parsed && typeof parsed === "object") return Object.values(parsed).map((item) => String(item || "").trim()).find(Boolean) || "";
  } catch {
    // Fall through to delimited secret parsing.
  }
  return raw.split(/[\s,]+/).map((item) => item.trim().replace(/^['"]+|['"]+$/g, "")).find(Boolean) || "";
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey =
  firstSecretKey(Deno.env.get("SUPABASE_SECRET_KEYS")) ||
  firstSecretKey(Deno.env.get("SUPABASE_SECRET_KEY")) ||
  firstSecretKey(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return json({ error: "Unauthorized" }, 401);

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    const serviceChatId = String(payload.service_chat_id || "").trim();
    const bookingSnapshot = payload.booking_snapshot && typeof payload.booking_snapshot === "object"
      ? payload.booking_snapshot
      : null;
    if (!serviceChatId || !bookingSnapshot) return json({ error: "Missing required fields" }, 400);

    let serviceChatResult = await supabase
      .from("service_chats")
      .select("id,chat_id,requester_id,quote_card,status")
      .eq("id", serviceChatId)
      .maybeSingle();
    if (!serviceChatResult.error && !serviceChatResult.data) {
      const { data: canonicalId, error: canonicalIdErr } = await supabase.rpc("current_active_service_chat_id_for_room", { p_chat_id: serviceChatId });
      if (canonicalIdErr) return json({ error: "Service lookup failed" }, 500);
      serviceChatResult = await supabase
        .from("service_chats")
        .select("id,chat_id,requester_id,quote_card,status")
        .eq("id", canonicalId)
        .maybeSingle();
    }
    const { data: serviceChat, error: serviceChatErr } = serviceChatResult;
    if (serviceChatErr) return json({ error: "Service lookup failed" }, 500);
    if (!serviceChat) return json({ error: "Service chat not found" }, 404);
    if (serviceChat.requester_id !== user.id) return json({ error: "Forbidden" }, 403);
    if (serviceChat.status !== "pending") return json({ error: "Service is no longer pending" }, 409);
    const quote = serviceChat.quote_card && typeof serviceChat.quote_card === "object"
      ? serviceChat.quote_card as Record<string, unknown>
      : {};
    const amount = Number(String(quote.finalPrice || "").trim());
    if (quote.voluntary !== true || (Number.isFinite(amount) && amount > 0)) {
      return json({ error: "This booking is not a no-charge voluntary booking" }, 409);
    }

    const { error } = await supabase.rpc("confirm_voluntary_service_booking", {
      p_chat_id: serviceChat.id,
      p_requester_id: user.id,
      p_booking_snapshot: bookingSnapshot,
    });
    if (error) return json({ error: error.message || "Unable to confirm booking" }, 409);
    try {
      const { error: pdfError } = await supabase.functions.invoke("generate-care-agreement-pdf", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { service_chat_id: serviceChat.id, source: "voluntary_booking_confirmed" },
      });
      if (pdfError) console.warn("[confirm-voluntary-service-booking] agreement pdf generation deferred:", pdfError.message);
    } catch (pdfError) {
      console.warn("[confirm-voluntary-service-booking] agreement pdf generation deferred:", pdfError instanceof Error ? pdfError.message : String(pdfError));
    }
    return json({ ok: true });
  } catch (error) {
    console.error("[confirm-voluntary-service-booking] failed", error instanceof Error ? error.message : error);
    return json({ error: "internal_error" }, 500);
  }
});
