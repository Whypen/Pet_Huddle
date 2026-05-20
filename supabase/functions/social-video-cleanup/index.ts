import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { CORS_HEADERS, bunnyConfig, deleteBunnyVideo, json } from "../_shared/socialVideo.ts";

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
    const cleanupSecret = Deno.env.get("SOCIAL_VIDEO_CLEANUP_SECRET") || "";
    if (!cleanupSecret) return json({ error: "Cleanup secret is not configured." }, 503);
    if (req.headers.get("x-cleanup-secret") !== cleanupSecret) return json({ error: "Unauthorized" }, 401);

    const supabase = serviceClient();
    const { libraryId, apiKey } = bunnyConfig();
    const cutoff = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await supabase
      .from("social_video_uploads")
      .select("id,provider_video_id,status,upload_expires_at,created_at")
      .is("thread_id", null)
      .is("deleted_at", null)
      .in("status", ["created", "uploading", "uploaded", "processing", "failed", "abandoned"])
      .or(`upload_expires_at.lt.${new Date().toISOString()},created_at.lt.${cutoff}`)
      .limit(25);
    if (error) throw error;

    const cleaned: string[] = [];
    for (const row of rows || []) {
      const videoId = String(row.provider_video_id || "");
      if (!videoId) continue;
      try {
        await deleteBunnyVideo(libraryId, apiKey, videoId);
        await supabase
          .from("social_video_uploads")
          .update({ status: "abandoned", deleted_at: new Date().toISOString() })
          .eq("id", row.id);
        cleaned.push(videoId);
      } catch (err) {
        console.error("[social-video-cleanup] failed", videoId, err);
      }
    }

    return json({ ok: true, cleaned });
  } catch (err) {
    console.error("[social-video-cleanup]", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
