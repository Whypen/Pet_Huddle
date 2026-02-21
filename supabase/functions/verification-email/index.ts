import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const resendApiKey = Deno.env.get("RESEND_API_KEY") as string | undefined;
const emailFrom = Deno.env.get("VERIFICATION_EMAIL_FROM") || "support@huddle.app";

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
    const { userId, status, comment } = await req.json();
    if (!userId || !status) {
      return json({ error: "Missing required parameters" }, 400);
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("email, display_name")
      .eq("id", userId)
      .single();
    if (error) return json({ error: error.message }, 500);

    if (!resendApiKey || !profile?.email) {
      return json({ ok: true, skipped: true });
    }

    const subject =
      status === "verified" ? "Identity verification verified" : "Identity verification unverified";
    const text = [
      `Hi ${profile.display_name || "there"},`,
      "",
      status === "verified"
        ? "Your identity verification has been verified. You now have full access to Social and Chat features."
        : "Your identity verification was marked unverified. Please review the feedback below and resubmit your documents.",
      comment ? `\nReviewer note: ${comment}` : "",
      "",
      "If you have questions, reply to this email.",
      "",
      "— huddle Support",
    ].join("\n");

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: profile.email,
        subject,
        text,
      }),
    });

    return json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message || "Server error" }, 500);
  }
});
