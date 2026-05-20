import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  CORS_HEADERS,
  bunnyConfig,
  constantTimeEqual,
  hmacSha256Hex,
  json,
  normalizeBunnyVideo,
} from "../_shared/socialVideo.ts";

const serviceClient = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = (Deno.env.get("HUDDLE_SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) || "";
  if (!supabaseUrl || !serviceKey) throw new Error("Supabase configuration missing");
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const rawBody = await req.text();
    const webhookSecret = Deno.env.get("BUNNY_STREAM_WEBHOOK_SECRET") || "";
    if (!webhookSecret) return json({ error: "Webhook secret is not configured." }, 503);
    const signature = req.headers.get("x-bunnystream-signature") || "";
    const version = req.headers.get("x-bunnystream-signature-version") || "";
    const algorithm = req.headers.get("x-bunnystream-signature-algorithm") || "";
    if (version !== "v1" || algorithm !== "hmac-sha256") return json({ error: "Unauthorized" }, 401);
    const expectedSignature = await hmacSha256Hex(webhookSecret, rawBody);
    if (!/^[0-9a-f]{64}$/.test(signature) || !constantTimeEqual(signature, expectedSignature)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const payload = JSON.parse(rawBody || "{}") as Record<string, unknown>;
    const rawVideo = (payload.video || payload.Video || payload.data || payload) as Record<string, unknown>;
    const videoId = String(rawVideo.guid || rawVideo.videoId || rawVideo.id || payload.videoId || payload.VideoGuid || "").trim();
    if (!videoId) return json({ ok: true, ignored: true });

    const { libraryId } = bunnyConfig();
    const normalized = normalizeBunnyVideo(libraryId, videoId, rawVideo);
    const status = normalized.status;
    const duration = normalized.duration;

    const supabase = serviceClient();
    const { data: uploadRow, error: uploadError } = await supabase
      .from("social_video_uploads")
      .select("id,thread_id")
      .eq("provider", "bunny_stream")
      .eq("provider_video_id", videoId)
      .maybeSingle();
    if (uploadError) throw uploadError;
    if (!uploadRow) return json({ ok: true, ignored: true });

    const updatePayload = {
      playback_url: normalized.playbackUrl,
      embed_url: normalized.embedUrl,
      thumbnail_url: normalized.thumbnailUrl,
      preview_url: normalized.previewUrl,
      duration_seconds: duration,
      status,
      provider_payload: payload,
      finalized_at: status === "ready" ? new Date().toISOString() : undefined,
    };

    await supabase.from("social_video_uploads").update(updatePayload).eq("id", uploadRow.id);

    if (uploadRow.thread_id) {
      await supabase
        .from("threads")
        .update({
          video_playback_url: normalized.playbackUrl,
          video_embed_url: normalized.embedUrl,
          video_thumbnail_url: normalized.thumbnailUrl,
          video_preview_url: normalized.previewUrl,
          video_duration_seconds: duration,
          video_status: status,
        })
        .eq("id", uploadRow.thread_id);
    }

    return json({ ok: true, videoId, status });
  } catch (err) {
    console.error("[social-video-webhook]", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
