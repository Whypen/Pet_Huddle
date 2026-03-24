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
      .eq("actor_id", targetUserId)
      .eq("target_id", actorId)
      .limit(1);
    if (unmatchError) throw unmatchError;
    if (Array.isArray(unmatchRows) && unmatchRows.length > 0) {
      return new Response(JSON.stringify({ error: "unmatched_by_target" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: actorMemberships, error: actorMembershipErr } = await supabase
      .from("chat_room_members")
      .select("chat_id")
      .eq("user_id", actorId);
    if (actorMembershipErr) throw actorMembershipErr;
    const actorRoomIds = [...new Set((actorMemberships || []).map((row: { chat_id: string }) => row.chat_id).filter(Boolean))];

    if (actorRoomIds.length > 0) {
      const { data: targetMemberships, error: targetMembershipErr } = await supabase
        .from("chat_room_members")
        .select("chat_id")
        .eq("user_id", targetUserId)
        .in("chat_id", actorRoomIds);
      if (targetMembershipErr) throw targetMembershipErr;
      const overlapIds = [...new Set((targetMemberships || []).map((row: { chat_id: string }) => row.chat_id).filter(Boolean))];
      if (overlapIds.length > 0) {
        const { data: overlapChats, error: overlapChatsErr } = await supabase
          .from("chats")
          .select("id, type")
          .in("id", overlapIds)
          .eq("type", "direct")
          .limit(1);
        if (overlapChatsErr) throw overlapChatsErr;
        const existingId = String((overlapChats || [])[0]?.id || "");
        if (existingId) {
          return new Response(JSON.stringify({ roomId: existingId }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
    }

    const { data: chatRow, error: chatErr } = await supabase
      .from("chats")
      .insert({ name: targetName, type: "direct", created_by: actorId })
      .select("id")
      .single();
    if (chatErr) throw chatErr;
    const roomId = String(chatRow?.id || "");
    if (!roomId) throw new Error("chat_room_not_created");

    const { error: memberErr } = await supabase
      .from("chat_room_members")
      .insert([
        { chat_id: roomId, user_id: actorId },
        { chat_id: roomId, user_id: targetUserId },
      ] as Record<string, unknown>[]);
    if (memberErr) throw memberErr;

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
