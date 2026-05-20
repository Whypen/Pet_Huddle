import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  CORS_HEADERS,
  bunnyConfig,
  bunnyHeaders,
  json,
  normalizeBunnyVideo,
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
    const clientDuration = Number(body.durationSeconds ?? 0);
    if (!videoId) return json({ error: "Missing video ID." }, 400);
    if (Number.isFinite(clientDuration) && clientDuration > 15.5) {
      return json({ error: "Video must be 15 seconds or shorter." }, 400);
    }

    const { data: uploadRow, error: uploadError } = await service
      .from("social_video_uploads")
      .select("*")
      .eq("provider", "bunny_stream")
      .eq("provider_video_id", videoId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (uploadError) throw uploadError;
    if (!uploadRow) return json({ error: "Upload not found." }, 404);

    const { libraryId, apiKey } = bunnyConfig();
    const bunnyResponse = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`, {
      method: "GET",
      headers: bunnyHeaders(apiKey),
    });
    const bunnyPayload = bunnyResponse.ok ? await bunnyResponse.json() as Record<string, unknown> : {};
    if (!bunnyResponse.ok) {
      console.error("[social-video-finalize] Bunny get failed", bunnyResponse.status, await bunnyResponse.text());
    }

    const normalized = normalizeBunnyVideo(libraryId, videoId, bunnyPayload);
    const duration = normalized.duration ?? (Number.isFinite(clientDuration) && clientDuration > 0 ? clientDuration : uploadRow.duration_seconds);
    if (Number(duration || 0) > 15.5) {
      await service
        .from("social_video_uploads")
        .update({ status: "failed", duration_seconds: duration, provider_payload: bunnyPayload })
        .eq("id", uploadRow.id);
      return json({ error: "Video exceeds the 15 second limit." }, 400);
    }

    const status = normalized.status === "ready" ? "ready" : "processing";
    const updatePayload = {
      thread_id: threadId || uploadRow.thread_id,
      playback_url: normalized.playbackUrl,
      embed_url: normalized.embedUrl,
      thumbnail_url: normalized.thumbnailUrl,
      preview_url: normalized.previewUrl,
      duration_seconds: duration,
      status,
      finalized_at: new Date().toISOString(),
      attached_at: threadId ? new Date().toISOString() : uploadRow.attached_at,
      provider_payload: bunnyPayload,
    };

    const { error: updateError } = await service
      .from("social_video_uploads")
      .update(updatePayload)
      .eq("id", uploadRow.id);
    if (updateError) throw updateError;

    if (threadId) {
      const { error: threadError } = await service
        .from("threads")
        .update({
          video_provider: "bunny_stream",
          provider_video_id: videoId,
          video_playback_url: normalized.playbackUrl,
          video_embed_url: normalized.embedUrl,
          video_thumbnail_url: normalized.thumbnailUrl,
          video_preview_url: normalized.previewUrl,
          video_duration_seconds: duration,
          video_status: status,
        })
        .eq("id", threadId)
        .eq("user_id", user.id);
      if (threadError) throw threadError;
    }

    return json({
      provider: "bunny_stream",
      providerVideoId: videoId,
      playbackUrl: normalized.playbackUrl,
      embedUrl: normalized.embedUrl,
      thumbnailUrl: normalized.thumbnailUrl,
      previewUrl: normalized.previewUrl,
      duration,
      status,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[social-video-finalize]", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
