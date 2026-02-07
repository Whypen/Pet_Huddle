import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const geminiKey = Deno.env.get("GEMINI_API_KEY") as string;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TEXT_MODEL = "gemini-1.5-flash";
const IMAGE_MODEL = "gemini-1.5-pro";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function getTier(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("tier")
    .eq("id", userId)
    .maybeSingle();
  return data?.tier || "free";
}

async function getTokenBucket(userId: string) {
  const now = new Date();
  const { data } = await supabase
    .from("ai_vet_rate_limits")
    .select("tokens, last_refill")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) {
    await supabase.from("ai_vet_rate_limits").insert({ user_id: userId, tokens: 50 });
    return { tokens: 50 };
  }
  const lastRefill = new Date(data.last_refill);
  if (now.getTime() - lastRefill.getTime() >= 24 * 60 * 60 * 1000) {
    await supabase
      .from("ai_vet_rate_limits")
      .update({ tokens: 50, last_refill: now.toISOString() })
      .eq("user_id", userId);
    return { tokens: 50 };
  }
  return { tokens: data.tokens ?? 0 };
}

async function consumeTokenBucket(userId: string) {
  const bucket = await getTokenBucket(userId);
  if (bucket.tokens <= 0) return { allowed: false, remaining: 0 };
  const remaining = bucket.tokens - 1;
  await supabase
    .from("ai_vet_rate_limits")
    .update({ tokens: remaining })
    .eq("user_id", userId);
  return { allowed: true, remaining };
}

async function consumeToken(userId: string, actionType: string) {
  const { data, error } = await supabase.rpc("check_and_increment_quota", {
    action_type: actionType,
  });
  if (error) {
    return { allowed: true, remaining: null };
  }
  return { allowed: data === true, remaining: null };
}

type PetProfileContext = {
  name?: string;
  species?: string;
  breed?: string | null;
  age?: string | number | null;
  weight?: string | number | null;
  weight_unit?: string | null;
  history?: string | null;
};

async function callGemini({ message, petProfile, imageBase64 }: { message: string; petProfile?: PetProfileContext; imageBase64?: string }) {
  const model = imageBase64 ? IMAGE_MODEL : TEXT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

  const prompt = petProfile
    ? `You are Dr. Huddle, an empathetic, calm, jargon-free AI vet assistant. Provide concise, pet-centric, actionable guidance and list clear next steps. If symptoms suggest emergency care, say so.\n\nPet Profile:\nName: ${petProfile.name}\nSpecies: ${petProfile.species}\nBreed: ${petProfile.breed || ""}\nAge: ${petProfile.age || ""}\nWeight: ${petProfile.weight || ""} ${petProfile.weight_unit || ""}\nHistory: ${petProfile.history || ""}\n\nUser Question: ${message}`
    : `You are Dr. Huddle, an empathetic, calm, jargon-free AI vet assistant. Provide concise, pet-centric, actionable guidance and list clear next steps.\n\nUser Question: ${message}`;

  const contents: Array<{
    parts: Array<
      | { text: string }
      | { inline_data: { mime_type: string; data: string } }
    >;
  }> = [{ parts: [{ text: prompt }] }];

  if (imageBase64) {
    contents[0].parts.push({
      inline_data: {
        mime_type: "image/jpeg",
        data: imageBase64,
      },
    });
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents }),
  });

  if (res.status === 429) {
    return { quota: true };
  }

  const data: unknown = await res.json();
  if (!res.ok) {
    const rec = (typeof data === "object" && data !== null) ? (data as Record<string, unknown>) : {};
    const err = (typeof rec.error === "object" && rec.error !== null) ? (rec.error as Record<string, unknown>) : {};
    const msg = String(err.message || "").toLowerCase();
    if (msg.includes("quota") || msg.includes("rate")) {
      return { quota: true };
    }
    throw new Error(String(err.message || "Gemini request failed"));
  }

  const root = (typeof data === "object" && data !== null) ? (data as Record<string, unknown>) : {};
  const candidates = Array.isArray(root.candidates) ? (root.candidates as unknown[]) : [];
  const c0 = (typeof candidates[0] === "object" && candidates[0] !== null) ? (candidates[0] as Record<string, unknown>) : {};
  const content = (typeof c0.content === "object" && c0.content !== null) ? (c0.content as Record<string, unknown>) : {};
  const parts = Array.isArray(content.parts) ? (content.parts as unknown[]) : [];
  const text = parts
    .map((p) => (typeof p === "object" && p !== null) ? String((p as Record<string, unknown>).text || "") : "")
    .filter(Boolean)
    .join("\n");
  return { text: text || "" };
}

serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "POST" && path.endsWith("/conversations")) {
    const { userId, petId } = await req.json();
    if (!userId) return json({ error: "Missing userId" }, 400);

    const { data, error } = await supabase
      .from("ai_vet_conversations")
      .insert({ user_id: userId, pet_id: petId })
      .select()
      .single();

    if (error) return json({ error: error.message }, 500);
    return json({ data }, 200);
  }

  if (req.method === "GET" && path.endsWith("/usage")) {
    const userId = url.searchParams.get("userId");
    if (!userId) return json({ error: "Missing userId" }, 400);

    const tier = await getTier(userId);
    if (tier === "premium" || tier === "gold") {
      return json({ data: { remaining: null, tier } }, 200);
    }

    const bucket = await getTokenBucket(userId);
    return json({ data: { remaining: bucket.tokens ?? 0, tier } }, 200);
  }

  if (req.method === "POST" && path.endsWith("/chat")) {
    const { conversationId, message, petProfile, userId, imageBase64 } = await req.json();
    if (!userId || !message) return json({ error: "Missing userId or message" }, 400);

    const tier = await getTier(userId);
    let remaining: number | null = null;
    if (tier !== "premium" && tier !== "gold") {
      const bucket = await consumeTokenBucket(userId);
      if (!bucket.allowed) return json({ error: "Quota Exceeded" }, 429);
      remaining = bucket.remaining;
    }

    if (imageBase64) {
      const vision = await consumeToken(userId, "ai_vision");
      if (!vision.allowed) return json({ error: "Quota Exceeded" }, 429);
    }

    try {
      const gem = await callGemini({ message, petProfile, imageBase64 });
      if (gem?.quota) return json({ error: "Quota Exceeded" }, 429);

      const aiMessage = gem.text || "";
      const triageKeywords = ["emergency", "bleeding", "seizure", "poison", "choking", "unconscious", "not breathing"];
      const triage = triageKeywords.some((k) => message.toLowerCase().includes(k));

      if (conversationId) {
        const { data: convo } = await supabase
          .from("ai_vet_conversations")
          .select("messages")
          .eq("id", conversationId)
          .maybeSingle();

        const messages = Array.isArray(convo?.messages) ? convo?.messages : [];
        messages.push({ role: "user", content: message });
        messages.push({ role: "assistant", content: aiMessage });

        await supabase
          .from("ai_vet_conversations")
          .update({ messages, updated_at: new Date().toISOString() })
          .eq("id", conversationId);
      }

      return json({ data: { message: aiMessage, triage, remaining } }, 200);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const msg = message.toLowerCase();
      if (msg.includes("quota") || msg.includes("rate")) {
        return json({ error: "Quota Exceeded" }, 429);
      }
      return json({ error: message || "Gemini error" }, 500);
    }
  }

  return json({ error: "Not found" }, 404);
});
