/**
 * group-invite — serve OG-tagged HTML for private group invite links.
 *
 * URL shape:  /functions/v1/group-invite?code=ABC123
 *
 * Social crawlers (WhatsApp, iMessage, Telegram, Twitter) hit this URL and
 * receive rich meta tags so the preview card shows the group name and a
 * friendly description. Real users are immediately redirected to the app's
 * /join/:code route via meta-refresh + JS redirect.
 *
 * Environment variables (set in Supabase project secrets):
 *   SUPABASE_URL            — injected automatically
 *   SUPABASE_SERVICE_ROLE_KEY — injected automatically
 *   APP_URL                 — production frontend URL (default: https://huddle.pet)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl        = Deno.env.get("SUPABASE_URL")             as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const APP_URL            = Deno.env.get("APP_URL")                  ?? "https://huddle.pet";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ── Helpers ───────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const html = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url  = new URL(req.url);
  const code = url.searchParams.get("code")?.trim().toUpperCase() ?? "";

  if (!code || code.length !== 6) {
    return html(redirectPage("Invalid Code", "This invite link is invalid.", `${APP_URL}/chats?tab=groups`));
  }

  // Look up group by room_code
  const { data: chat, error } = await supabase
    .from("chats")
    .select("id, name, description, pet_focus, location_label")
    .eq("room_code", code)
    .eq("visibility", "private")
    .maybeSingle();

  if (error || !chat) {
    return html(
      redirectPage(
        "Group not found",
        "This invite link may have expired or the group no longer exists.",
        `${APP_URL}/chats?tab=groups`,
      ),
      404,
    );
  }

  const groupName   = String(chat.name ?? "Pet Group");
  const description = chat.description
    ? String(chat.description)
    : chat.pet_focus?.length
    ? `A private Huddle group for ${(chat.pet_focus as string[]).join(", ").toLowerCase()} lovers${chat.location_label ? ` in ${chat.location_label}` : ""}.`
    : `Join ${groupName} on Huddle — the pet community app.`;

  const deepLink = `${APP_URL}/join/${encodeURIComponent(code)}`;

  return html(
    ogPage({
      title:       `Join ${groupName} on Huddle`,
      description,
      appUrl:      deepLink,
      groupName,
    }),
  );
});

// ── Page builders ─────────────────────────────────────────────────────────────

interface OgPageOptions {
  title:       string;
  description: string;
  appUrl:      string;
  groupName:   string;
}

function ogPage({ title, description, appUrl, groupName }: OgPageOptions): string {
  const t = escape(title);
  const d = escape(description);
  const g = escape(groupName);
  const u = escape(appUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${t}</title>

  <!-- Standard meta -->
  <meta name="description" content="${d}" />

  <!-- Open Graph -->
  <meta property="og:type"        content="website" />
  <meta property="og:title"       content="${t}" />
  <meta property="og:description" content="${d}" />
  <meta property="og:url"         content="${u}" />
  <meta property="og:image"       content="https://huddle.pet/og-default.png" />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name"   content="Huddle" />

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image"       content="https://huddle.pet/og-default.png" />

  <!-- Redirect real users immediately -->
  <meta http-equiv="refresh" content="0; url=${u}" />
</head>
<body>
  <p>Joining <strong>${g}</strong> on Huddle…</p>
  <p><a href="${u}">Tap here if you are not redirected</a></p>
  <script>window.location.replace("${u}");</script>
</body>
</html>`;
}

function redirectPage(title: string, message: string, fallback: string): string {
  const t = escape(title);
  const m = escape(message);
  const f = escape(fallback);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${t} — Huddle</title>
  <meta http-equiv="refresh" content="3; url=${f}" />
</head>
<body>
  <p>${m}</p>
  <p><a href="${f}">Back to Huddle</a></p>
  <script>setTimeout(() => window.location.replace("${f}"), 3000);</script>
</body>
</html>`;
}
