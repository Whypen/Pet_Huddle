import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  CORS_HEADERS,
  bunnyConfig,
  bunnyHeaders,
  json,
  normalizeBunnyVideo,
  requireGold,
  requireUser,
  sha256Hex,
} from "../_shared/socialVideo.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { user, service } = await requireUser(req);
    await requireGold(service, user.id);

    const body = await req.json().catch(() => ({}));
    const durationSeconds = Number(body.durationSeconds ?? 0);
    const fileSize = Number(body.fileSize ?? 0);
    const fileName = String(body.fileName || "social-video.mp4").slice(0, 180);
    const fileType = String(body.fileType || "video/mp4").slice(0, 80);
    const title = String(body.title || fileName || "Social video").slice(0, 160);

    if (!fileType.startsWith("video/")) return json({ error: "Only video uploads are accepted." }, 400);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return json({ error: "Video duration is required." }, 400);
    if (durationSeconds > 15.5) return json({ error: "Video must be trimmed to 15 seconds before upload." }, 400);
    if (!Number.isFinite(fileSize) || fileSize <= 0) return json({ error: "Video file size is required." }, 400);

    const { libraryId, apiKey, collectionId } = bunnyConfig();
    const createPayload: Record<string, unknown> = {
      title,
      thumbnailTime: Math.max(0, Math.min(1000, Math.floor(durationSeconds * 200))),
    };
    if (collectionId) createPayload.collectionId = collectionId;

    const createResponse = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
      method: "POST",
      headers: bunnyHeaders(apiKey),
      body: JSON.stringify(createPayload),
    });
    if (!createResponse.ok) {
      console.error("[social-video-create-upload] Bunny create failed", createResponse.status, await createResponse.text());
      return json({ error: "Failed to create video upload." }, 502);
    }

    const bunnyVideo = await createResponse.json() as Record<string, unknown>;
    const videoId = String(bunnyVideo.guid || bunnyVideo.videoId || bunnyVideo.id || "");
    if (!videoId) return json({ error: "Bunny did not return a video ID." }, 502);

    const expirationTime = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
    const signature = await sha256Hex(`${libraryId}${apiKey}${expirationTime}${videoId}`);
    const normalized = normalizeBunnyVideo(libraryId, videoId, bunnyVideo);

    const { error: insertError } = await service.from("social_video_uploads").insert({
      user_id: user.id,
      provider: "bunny_stream",
      provider_video_id: videoId,
      playback_url: normalized.playbackUrl,
      embed_url: normalized.embedUrl,
      thumbnail_url: normalized.thumbnailUrl,
      preview_url: normalized.previewUrl,
      duration_seconds: durationSeconds,
      status: "created",
      title,
      file_name: fileName,
      file_type: fileType,
      file_size: Math.round(fileSize),
      upload_expires_at: new Date(expirationTime * 1000).toISOString(),
      provider_payload: bunnyVideo,
    });
    if (insertError) throw insertError;

    return json({
      provider: "bunny_stream",
      videoId,
      libraryId,
      expirationTime,
      signature,
      tusEndpoint: "https://video.bunnycdn.com/tusupload",
      collectionId: collectionId || null,
      playbackUrl: normalized.playbackUrl,
      embedUrl: normalized.embedUrl,
      thumbnailUrl: normalized.thumbnailUrl,
      previewUrl: normalized.previewUrl,
      status: "created",
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[social-video-create-upload]", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
