#!/usr/bin/env node

const base = String(process.env.PUBLIC_AUTH_BASE_URL || "https://api.huddle.pet/functions/v1")
  .trim()
  .replace(/\/+$/, "");
const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim();

if (!anonKey) {
  console.error("Missing SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY)");
  process.exit(1);
}

const post = async (route, body) => {
  const res = await fetch(`${base}/${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Origin: "https://huddle.pet",
    },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  return {
    status: res.status,
    cf_ray: res.headers.get("cf-ray"),
    allow_origin: res.headers.get("access-control-allow-origin"),
    payload,
  };
};

const options = async (route) => {
  const res = await fetch(`${base}/${route}`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://huddle.pet",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,apikey,content-type",
    },
  });
  return {
    status: res.status,
    cf_ray: res.headers.get("cf-ray"),
    allow_origin: res.headers.get("access-control-allow-origin"),
    allow_methods: res.headers.get("access-control-allow-methods"),
    allow_headers: res.headers.get("access-control-allow-headers"),
  };
};

const run = async () => {
  const results = {
    base,
    options: {
      login: await options("auth-login"),
      signup: await options("auth-signup"),
      reset: await options("auth-reset-password"),
      change: await options("auth-change-password"),
      sendPhoneOtp: await options("send-phone-otp"),
      preSignup: await options("send-pre-signup-verify"),
    },
    invalid: {
      login: await post("auth-login", { email: "smoke@example.com", password: "x", turnstile_token: "__invalid__", turnstile_action: "login" }),
      signup: await post("auth-signup", { email: "smoke@example.com", password: "12345678", turnstile_token: "__invalid__", turnstile_action: "signup" }),
      reset: await post("auth-reset-password", { email: "smoke@example.com", redirectTo: "https://huddle.pet/auth/callback", turnstile_token: "__invalid__", turnstile_action: "reset_password" }),
      change: await post("auth-change-password", { password: "12345678", turnstile_token: "__invalid__", turnstile_action: "change_password" }),
      sendPhoneOtp: await post("send-phone-otp", { phone: "+85291234567", turnstile_token: "__invalid__", turnstile_action: "send_phone_otp" }),
      preSignup: await post("send-pre-signup-verify", { email: "smoke@example.com", token: "smoke-token", turnstile_token: "__invalid__", turnstile_action: "send_pre_signup_verify" }),
    },
  };

  console.log(JSON.stringify(results, null, 2));
};

run().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
});
