import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const authUser = await supabase.auth.getUser(accessToken);
    const actorId = authUser.data?.user?.id;
    if (!actorId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload = await req.json().catch(() => ({}));
    const targetUserId = String(payload?.targetUserId || payload?.target_user_id || "").trim();
    const targetName = String(payload?.targetName || payload?.target_name || "Conversation").trim() || "Conversation";

    if (!targetUserId || targetUserId === actorId) {
      return new Response(JSON.stringify({ error: "invalid_target_user" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: blockedRows, error: blockedError } = await supabase
      .from("user_blocks")
      .select("blocker_id, blocked_id")
      .or(`and(blocker_id.eq.${actorId},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${actorId})`)
      .limit(1);
    if (blockedError) throw blockedError;
    if (Array.isArray(blockedRows) && blockedRows.length > 0) {
      return new Response(JSON.stringify({ error: "chat_blocked" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: unmatchRows, error: unmatchError } = await supabase
      .from("user_unmatches")
      .select("id")
      .or(`and(actor_id.eq.${targetUserId},target_id.eq.${actorId}),and(actor_id.eq.${actorId},target_id.eq.${targetUserId})`)
      .limit(1);
    if (unmatchError) throw unmatchError;
    if (Array.isArray(unmatchRows) && unmatchRows.length > 0) {
      return new Response(JSON.stringify({ error: "unmatched_relationship" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const user1 = actorId < targetUserId ? actorId : targetUserId;
    const user2 = actorId < targetUserId ? targetUserId : actorId;
    const { data: matchRow, error: matchError } = await supabase
      .from("matches")
      .select("id")
      .eq("user1_id", user1)
      .eq("user2_id", user2)
      .eq("is_active", true)
      .maybeSingle();
    if (matchError) throw matchError;
    if (!matchRow) {
      return new Response(JSON.stringify({ error: "active_match_required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: roomData, error: roomError } = await supabase.rpc("ensure_direct_chat_room_for_users", {
      p_actor_user_id: actorId,
      p_target_user_id: targetUserId,
      p_target_name: targetName,
    });
    if (roomError) throw roomError;
    const roomId = String(roomData || "");
    if (!roomId) throw new Error("chat_room_not_created");

    return new Response(JSON.stringify({ roomId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ensure-direct-chat-room]", message);
    return new Response(JSON.stringify({ error: message || "unknown_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
