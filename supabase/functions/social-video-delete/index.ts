import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  CORS_HEADERS,
  bunnyConfig,
  deleteBunnyVideo,
  json,
  requireUser,
} from "../_shared/socialVideo.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { user, service } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const videoId = String(body.videoId || "").trim();
    const threadId = body.threadId ? String(body.threadId).trim() : "";
    if (!videoId && !threadId) return json({ error: "Missing video or post ID." }, 400);

    let query = service
      .from("social_video_uploads")
      .select("*")
      .eq("provider", "bunny_stream")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .limit(1);
    query = videoId ? query.eq("provider_video_id", videoId) : query.eq("thread_id", threadId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return json({ ok: true, deleted: false });

    const { libraryId, apiKey } = bunnyConfig();
    await deleteBunnyVideo(libraryId, apiKey, String(data.provider_video_id));

    await service
      .from("social_video_uploads")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .eq("id", data.id);

    if (data.thread_id) {
      await service
        .from("threads")
        .update({ video_status: "deleted" })
        .eq("id", data.thread_id)
        .eq("user_id", user.id);
    }

    return json({ ok: true, deleted: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[social-video-delete]", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
