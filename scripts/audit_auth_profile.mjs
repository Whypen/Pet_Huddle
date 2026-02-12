import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const base = process.env.BASE_URL || "http://127.0.0.1:8081";
const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

function uniqueEmail() {
  const ts = Date.now();
  return `codex_audit_${ts}@example.com`;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const logs = [];
  page.on("console", (m) => logs.push(m.text()));
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  const email = uniqueEmail();
  const password = "Password123!";

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const signUp = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: "Audit User",
        full_name: "Audit User",
        phone: "+1234567890",
      },
    },
  });
  if (signUp.error) {
    console.error("[AUDIT] signUp error", signUp.error);
    process.exit(1);
  }

  const signIn = await supabase.auth.signInWithPassword({ email, password });
  const session = signIn.data.session;
  if (!session) {
    console.error("[AUDIT] signIn failed, no session");
    process.exit(1);
  }

  const sessionPayload = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: session.token_type,
    user: session.user,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
  };

  const storageKeys = [
    "sb-127-auth-token",
    "sb-127.0.0.1-auth-token",
    "sb-localhost-auth-token",
    "sb-ztrbourwcnhrpmzwlrcn-auth-token",
  ];

  await ctx.addInitScript(([keys, payload]) => {
    keys.forEach((k) => {
      localStorage.setItem(k, JSON.stringify(payload));
    });
  }, [storageKeys, sessionPayload]);

  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const sessionId = session.user.id;
  console.log("[AUDIT] session.user.id", sessionId);
  console.log("[AUDIT] page errors", pageErrors);
  console.log("[AUDIT] console log tail", logs.slice(-40));

  await browser.close();

  console.log("[AUDIT] profile query:");
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, legal_name, phone, onboarding_completed")
    .eq("id", sessionId)
    .single();
  if (profileError) {
    console.error(profileError);
  } else {
    console.log(profile);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
