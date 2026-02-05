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

async function consumeToken(userId: string) {
  const tier = await getTier(userId);
  if (tier === "premium" || tier === "gold") {
    return { allowed: true, remaining: null };
  }

  const { data: existing } = await supabase
    .from("ai_vet_rate_limits")
    .select("tokens,last_refill")
    .eq("user_id", userId)
    .maybeSingle();

  const now = new Date();
  const refillWindowMs = 24 * 60 * 60 * 1000;

  if (!existing) {
    await supabase.from("ai_vet_rate_limits").insert({ user_id: userId, tokens: 49, last_refill: now.toISOString() });
    return { allowed: true, remaining: 49 };
  }

  const lastRefill = new Date(existing.last_refill);
  let tokens = existing.tokens;
  if (now.getTime() - lastRefill.getTime() >= refillWindowMs) {
    tokens = 50;
  }

  if (tokens <= 0) {
    return { allowed: false, remaining: 0 };
  }

  const newTokens = tokens - 1;
  await supabase
    .from("ai_vet_rate_limits")
    .update({ tokens: newTokens, last_refill: now.toISOString() })
    .eq("user_id", userId);

  return { allowed: true, remaining: newTokens };
}

async function callGemini({ message, petProfile, imageBase64 }: { message: string; petProfile?: any; imageBase64?: string }) {
  const model = imageBase64 ? IMAGE_MODEL : TEXT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

  const prompt = petProfile
    ? `Pet Profile:\nName: ${petProfile.name}\nSpecies: ${petProfile.species}\nBreed: ${petProfile.breed || ""}\nWeight: ${petProfile.weight || ""} ${petProfile.weight_unit || ""}\n\nUser Question: ${message}`
    : message;

  const contents: any[] = [{ parts: [{ text: prompt }] }];

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

  const data = await res.json();
  if (!res.ok) {
    const msg = (data?.error?.message || "").toLowerCase();
    if (msg.includes("quota") || msg.includes("rate")) {
      return { quota: true };
    }
    throw new Error(data?.error?.message || "Gemini request failed");
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("\n");
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

    const { data } = await supabase
      .from("ai_vet_rate_limits")
      .select("tokens")
      .eq("user_id", userId)
      .maybeSingle();

    return json({ data: { remaining: data?.tokens ?? 50, tier } }, 200);
  }

  if (req.method === "POST" && path.endsWith("/chat")) {
    const { conversationId, message, petProfile, userId, imageBase64 } = await req.json();
    if (!userId || !message) return json({ error: "Missing userId or message" }, 400);

    const bucket = await consumeToken(userId);
    if (!bucket.allowed) return json({ error: "Quota Exceeded" }, 429);

    try {
      const gem = await callGemini({ message, petProfile, imageBase64 });
      if (gem?.quota) return json({ error: "Quota Exceeded" }, 429);

      const aiMessage = gem.text || "";

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

      return json({ data: { message: aiMessage, remaining: bucket.remaining } }, 200);
    } catch (err: any) {
      const msg = `${err?.message || ""}`.toLowerCase();
      if (msg.includes("quota") || msg.includes("rate")) {
        return json({ error: "Quota Exceeded" }, 429);
      }
      return json({ error: err.message || "Gemini error" }, 500);
    }
  }

  return json({ error: "Not found" }, 404);
});
