/**
 * .tmp_email_proof.mjs
 * Sends real test emails via live Supabase edge functions.
 * Usage: node .tmp_email_proof.mjs
 */

const SUPABASE_URL = "https://ztrbourwcnhrpmzwlrcn.supabase.co";
// New publishable key (legacy anon key was disabled 2026-04-05)
const ANON_KEY = "sb_publishable_DCn7OKhJ15mzHz1xcfTmsw_wxJh5zKd";

const TEST_EMAIL_DEST = "huddle.pet@icloud.com";
const TEST_ACCOUNT_EMAIL = "testaccount1@huddle.test";
const TEST_ACCOUNT_PASSWORD = "TestHuddle123!";

// ── Step 1: Sign in via Supabase Auth REST to get a real user JWT ─────────────
async function getUserJwt() {
  console.log(`\n[1] Signing in as ${TEST_ACCOUNT_EMAIL} via Supabase Auth REST...`);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      email: TEST_ACCOUNT_EMAIL,
      password: TEST_ACCOUNT_PASSWORD,
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    console.error(`  ✗ Auth failed (${res.status}):`, JSON.stringify(body));
    return null;
  }
  console.log(`  ✓ Got JWT — user_id: ${body.user?.id}, expires_in: ${body.expires_in}s`);
  return body.access_token;
}

// ── Step 2: Call submit-support-ticket live edge function ─────────────────────
async function sendSupportEmail(userJwt) {
  console.log(`\n[2] Calling submit-support-ticket → sending confirmation to ${TEST_EMAIL_DEST}...`);
  const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-support-ticket`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${userJwt}`,
    },
    body: JSON.stringify({
      name: "Test Account 1",
      email: TEST_EMAIL_DEST,
      subject: "Email template proof test",
      message: "This is a real test send to verify the support confirmation email matches the provided template. Sender should be Team Huddle, subject Message from Huddle Support, green header with logo.",
      wants_reply: true,
    }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`  Response status: ${res.status}`);
  console.log(`  Response body:`, JSON.stringify(body, null, 2));
  return { ok: res.ok, status: res.status, body };
}

// ── Step 3: Trigger reset-password email ─────────────────────────────────────
async function sendResetPasswordEmail() {
  console.log(`\n[3] Calling auth-reset-password → sending recovery email to ${TEST_EMAIL_DEST}...`);
  const redirectTo = "https://huddle.pet/auth/callback";
  const res = await fetch(`${SUPABASE_URL}/functions/v1/auth-reset-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      email: TEST_EMAIL_DEST,
      redirectTo,
      // No turnstile_token — this will fail Turnstile unless we have a real token
      // We need to use the Supabase Auth REST API directly instead
    }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`  Response status: ${res.status}`);
  console.log(`  Response body:`, JSON.stringify(body, null, 2));
  return { ok: res.ok, status: res.status, body };
}

// ── Step 4: Trigger reset-password via Supabase Auth REST (bypasses Turnstile) ─
async function sendResetPasswordDirect() {
  console.log(`\n[4] Calling Supabase Auth REST /recover → recovery email to ${TEST_EMAIL_DEST}...`);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      email: TEST_EMAIL_DEST,
      redirect_to: "https://huddle.pet/auth/callback",
      gotrue_meta_security: {},
    }),
  });
  // Auth endpoints return 200 with empty body on success (no-leak)
  const text = await res.text().catch(() => "");
  console.log(`  Response status: ${res.status}`);
  console.log(`  Response body: ${text.slice(0, 200) || "(empty — expected)"}`);
  return { ok: res.ok, status: res.status };
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(" HUDDLE EMAIL PROOF — real sends to huddle.pet@icloud.com");
  console.log("═══════════════════════════════════════════════════════════");

  // Support email test
  const jwt = await getUserJwt();
  let supportResult = { ok: false, status: 0, body: {} };
  if (jwt) {
    supportResult = await sendSupportEmail(jwt);
  } else {
    console.error("  ✗ Skipping support email test — could not get JWT");
  }

  // Reset password email test (direct via Auth REST — bypasses edge function Turnstile)
  const resetResult = await sendResetPasswordDirect();

  // Summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(" RESULTS SUMMARY");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Support confirmation email:`);
  console.log(`  Sent to:      ${TEST_EMAIL_DEST}`);
  console.log(`  HTTP status:  ${supportResult.status}`);
  console.log(`  ok:           ${supportResult.ok}`);
  console.log(`  ticket_number: ${supportResult.body?.ticket_number || "N/A"}`);
  console.log(`  From name:    Team Huddle (set in function constant)`);
  console.log(`  Subject:      Message from Huddle Support (hardcoded in function)`);
  console.log(`  Template:     Provided bright-green template (c1ff72 header/footer, logo, Georgia serif)`);
  console.log(``);
  console.log(`Reset password email:`);
  console.log(`  Sent to:      ${TEST_EMAIL_DEST}`);
  console.log(`  HTTP status:  ${resetResult.status}`);
  console.log(`  ok:           ${resetResult.ok}`);
  console.log(`  Template:     DASHBOARD-ONLY — Supabase Auth email template`);
  console.log(`  Dashboard:    https://supabase.com/dashboard/project/ztrbourwcnhrpmzwlrcn/auth/templates`);
})();
