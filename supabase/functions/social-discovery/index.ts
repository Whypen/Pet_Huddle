import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req: Request) => {
  try {
    const { userId, lat, lng, radiusKm, minAge, maxAge } = await req.json();
    if (!userId || lat == null || lng == null) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const radiusM = Math.max(1000, Math.round((radiusKm || 5) * 1000));
    const minAgeSafe = Math.max(16, minAge || 18);
    const maxAgeSafe = Math.min(99, maxAge || 99);

    const { data, error } = await supabase.rpc("social_discovery", {
      p_user_id: userId,
      p_lat: lat,
      p_lng: lng,
      p_radius_m: radiusM,
      p_min_age: minAgeSafe,
      p_max_age: maxAgeSafe,
    });

    if (error) throw error;

    return new Response(JSON.stringify({ profiles: data || [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[social-discovery]", err);
    const message = `${err?.message || ""}`.toLowerCase();
    if (message.includes("quota") || message.includes("rate limit")) {
      return new Response(JSON.stringify({ error: "Quota Exceeded" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
