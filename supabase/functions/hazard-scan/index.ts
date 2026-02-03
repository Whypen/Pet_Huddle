// Hazard Scan Edge Function - server-authoritative cache + rate limit

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req: Request) => {
  try {
    const { userId, imageUrl, imageHash } = await req.json();

    if (!userId || !imageUrl || !imageHash) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Enforce rate limit
    const { data: canScan, error: rateErr } = await supabase
      .rpc("check_scan_rate_limit", { user_uuid: userId });

    if (rateErr) {
      return new Response(JSON.stringify({ error: rateErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!canScan) {
      return new Response(JSON.stringify({ error: "rate_limit_exceeded" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Cache check
    const { data: cached } = await supabase
      .from("triage_cache")
      .select("*")
      .eq("image_hash", imageHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (cached) {
      await supabase
        .from("triage_cache")
        .update({
          hit_count: (cached.hit_count || 0) + 1,
          last_accessed_at: new Date().toISOString(),
        })
        .eq("id", cached.id);

      return new Response(
        JSON.stringify({
          cached: true,
          result: {
            object: cached.object_identified,
            category: cached.hazard_type,
            toxicity_level: cached.toxicity_level,
            immediate_action: cached.immediate_action,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Mock AI response (placeholder)
    const mockResult = {
      object: "Chocolate bar",
      category: "TOXIC_FOOD",
      toxicity_level: "HIGH",
      immediate_action:
        "Contact your vet immediately. Do NOT induce vomiting. Monitor for symptoms including vomiting, diarrhea, increased heart rate, and seizures.",
    };

    await supabase.from("triage_cache").insert({
      image_hash: imageHash,
      object_identified: mockResult.object,
      is_hazard: mockResult.category !== "INERT",
      hazard_type: mockResult.category,
      toxicity_level: mockResult.toxicity_level,
      immediate_action: mockResult.immediate_action,
      ai_response: mockResult,
      hit_count: 1,
    });

    await supabase.from("scan_rate_limits").insert({
      user_id: userId,
      scan_timestamp: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ cached: false, result: mockResult }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
