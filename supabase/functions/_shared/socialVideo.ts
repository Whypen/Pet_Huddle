import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, bunny-webhook-signature, x-bunnystream-signature, x-bunnystream-signature-version, x-bunnystream-signature-algorithm",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

export const getSupabaseClients = (req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = (Deno.env.get("HUDDLE_SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  if (!supabaseUrl || !serviceKey || !anonKey) throw new Error("Supabase configuration missing");

  const authorization = req.headers.get("Authorization") || "";
  const authed = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  return { authed, service };
};

export const requireUser = async (req: Request) => {
  const { authed, service } = getSupabaseClients(req);
  const { data, error } = await authed.auth.getUser();
  if (error || !data.user) throw new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
  return { user: data.user, service };
};

export const requireGold = async (service: ReturnType<typeof createClient>, userId: string) => {
  const { data, error } = await service
    .from("profiles")
    .select("id,tier,effective_tier")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  const tier = String(data?.effective_tier || data?.tier || "free").toLowerCase();
  if (tier !== "gold") {
    throw new Response(JSON.stringify({ error: "Video upload is available for Gold members only." }), {
      status: 403,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
};

export const bunnyConfig = () => {
  const libraryId = Deno.env.get("BUNNY_STREAM_LIBRARY_ID") || "";
  const apiKey = Deno.env.get("BUNNY_STREAM_API_KEY") || "";
  const collectionId = Deno.env.get("BUNNY_STREAM_COLLECTION_SOCIAL") || "";
  if (!libraryId || !apiKey) throw new Error("Bunny Stream is not configured");
  return { libraryId, apiKey, collectionId };
};

export const bunnyHeaders = (apiKey: string) => ({
  Accept: "application/json",
  "Content-Type": "application/json",
  AccessKey: apiKey,
});

export const sha256Hex = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const hmacSha256Hex = async (secret: string, rawBody: string) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const constantTimeEqual = (a: string, b: string) => {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
};

export const normalizeBunnyVideo = (libraryId: string, videoId: string, payload: Record<string, unknown> = {}) => {
  const thumbnailFileName = typeof payload.thumbnailFileName === "string" ? payload.thumbnailFileName : "";
  const pullZoneUrl = String(payload.pullZoneUrl || payload.pullZone || payload.cdnUrl || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const thumbnailUrl =
    typeof payload.thumbnailUrl === "string"
      ? payload.thumbnailUrl
      : pullZoneUrl && thumbnailFileName
        ? `https://${pullZoneUrl}/${videoId}/${thumbnailFileName}`
        : null;
  const previewUrl =
    typeof payload.previewUrl === "string"
      ? payload.previewUrl
      : pullZoneUrl
        ? `https://${pullZoneUrl}/${videoId}/preview.webp`
        : null;
  const durationRaw = payload.length ?? payload.duration ?? payload.durationSeconds;
  const duration = typeof durationRaw === "number" ? durationRaw : Number(durationRaw || 0);
  const numericStatusRaw = payload.Status ?? payload.statusCode;
  const numericStatus = typeof numericStatusRaw === "number" ? numericStatusRaw : Number(numericStatusRaw);
  const statusRaw = String(payload.status ?? payload.videoStatus ?? payload.StatusName ?? "").toLowerCase();
  const encodeProgress = Number(payload.encodeProgress ?? 0);
  const status =
    numericStatus === 5 || numericStatus === 8 ? "failed" :
    numericStatus === 3 || numericStatus === 4 ? "ready" :
    numericStatus === 0 || numericStatus === 1 || numericStatus === 2 || numericStatus === 6 || numericStatus === 7 ? "processing" :
    statusRaw.includes("fail") ? "failed" :
    statusRaw.includes("finish") || statusRaw.includes("ready") || encodeProgress >= 100 ? "ready" :
    statusRaw.includes("process") || statusRaw.includes("encoding") ? "processing" :
    "uploaded";

  return {
    provider: "bunny_stream",
    providerVideoId: videoId,
    playbackUrl: `https://video.bunnycdn.com/play/${libraryId}/${videoId}`,
    embedUrl: `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}?autoplay=false&preload=false&responsive=true`,
    thumbnailUrl,
    previewUrl,
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    status,
  };
};

export const deleteBunnyVideo = async (libraryId: string, apiKey: string, videoId: string) => {
  const response = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`, {
    method: "DELETE",
    headers: { AccessKey: apiKey },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Bunny delete failed: ${response.status} ${await response.text()}`);
  }
};
