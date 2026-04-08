import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

type BanBody = {
  action: "ban" | "unban" | "flag_abuse_signal";
  user_id?: string;
  reason_internal?: string;
  public_message?: string;
  block_email?: boolean;
  block_phone?: boolean;
  clear_identifiers?: boolean;
  signal_type?: "device" | "install";
  signal_value?: string;
  risk_level?: "low" | "medium" | "high";
  review_required?: boolean;
  cooldown_seconds?: number;
  metadata?: Record<string, unknown>;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-moderation-secret",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  const moderationSecret = String(Deno.env.get("MODERATION_API_KEY") || "").trim();
  if (!supabaseUrl || !serviceRoleKey || !moderationSecret) {
    return json(500, { error: "server_misconfigured" });
  }

  const requestSecret = String(req.headers.get("x-moderation-secret") || "").trim();
  if (!requestSecret || requestSecret !== moderationSecret) {
    return json(401, { error: "unauthorized" });
  }

  let body: BanBody;
  try {
    body = (await req.json()) as BanBody;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const action = body.action;
  if (action !== "ban" && action !== "unban" && action !== "flag_abuse_signal") {
    return json(400, { error: "invalid_action" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  if (action === "flag_abuse_signal") {
    const signalType = String(body.signal_type || "").trim();
    const signalValue = String(body.signal_value || "").trim();
    const riskLevel = String(body.risk_level || "medium").trim();
    if (!signalType || !signalValue) return json(400, { error: "signal_type_and_value_required" });
    const cooldownSeconds = Number(body.cooldown_seconds || 0);
    const cooldownUntil = cooldownSeconds > 0
      ? new Date(Date.now() + cooldownSeconds * 1000).toISOString()
      : null;
    const { data, error } = await admin.rpc("admin_upsert_abuse_signal", {
      p_signal_type: signalType,
      p_signal_value: signalValue,
      p_risk_level: riskLevel,
      p_review_required: body.review_required !== false,
      p_cooldown_until: cooldownUntil,
      p_reason_internal: String(body.reason_internal || "").trim() || null,
      p_source_user_id: String(body.user_id || "").trim() || null,
      p_metadata: body.metadata ?? {},
    });
    if (error) return json(500, { error: "abuse_signal_upsert_failed", details: error.message || null });
    return json(200, { ok: true, action: "flag_abuse_signal", data, cooldown_until: cooldownUntil });
  }

  const userId = String(body.user_id || "").trim();
  if (!userId) return json(400, { error: "user_id_required" });

  if (action === "ban") {
    const { data, error } = await admin.rpc("admin_ban_user", {
      p_user_id: userId,
      p_reason_internal: String(body.reason_internal || "").trim() || null,
      p_public_message: String(body.public_message || "").trim() || null,
      p_block_email: body.block_email !== false,
      p_block_phone: body.block_phone !== false,
      p_metadata: body.metadata ?? {},
    });
    if (error) return json(500, { error: "ban_rpc_failed", details: error.message || null });

    const banRes = await admin.auth.admin.updateUserById(userId, {
      ban_duration: "876000h",
    });
    if (banRes.error) {
      return json(500, { error: "auth_ban_failed", details: banRes.error.message || null, data });
    }

    return json(200, { ok: true, action: "ban", data });
  }

  const { data, error } = await admin.rpc("admin_unban_user", {
    p_user_id: userId,
    p_clear_identifiers: body.clear_identifiers === true,
    p_metadata: body.metadata ?? {},
  });
  if (error) return json(500, { error: "unban_rpc_failed", details: error.message || null });

  const unbanRes = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });
  if (unbanRes.error) {
    return json(500, { error: "auth_unban_failed", details: unbanRes.error.message || null, data });
  }

  return json(200, { ok: true, action: "unban", data });
});
