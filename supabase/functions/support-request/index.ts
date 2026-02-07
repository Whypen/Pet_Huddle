import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const resendApiKey = Deno.env.get("RESEND_API_KEY") as string | undefined;
const supportEmailTo = Deno.env.get("SUPPORT_EMAIL_TO") || "kuriocollectives";
const supportEmailFrom = Deno.env.get("SUPPORT_EMAIL_FROM") || "support@huddle.app";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { userId, subject, message, email } = await req.json();
    if (!userId || !message) {
      return json({ error: "Missing required parameters" }, 400);
    }

    await supabase.from("support_requests").insert({
      user_id: userId,
      subject: subject || null,
      message,
      email: email || null,
    });

    if (resendApiKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: supportEmailFrom,
          to: supportEmailTo,
          subject: subject || "Huddle Support Request",
          text: `User: ${userId}\nEmail: ${email || ""}\n\n${message}`,
        }),
      });
    }

    return json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message || "Server error" }, 500);
  }
});
