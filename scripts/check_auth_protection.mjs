#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^"(.*)"$/, "$1");
    out[key] = value;
  }
  return out;
}

const cwd = process.cwd();
const envFile = path.join(cwd, ".env");
const envLocalFile = path.join(cwd, ".env.local");
const fileEnv = { ...loadEnvFile(envFile), ...loadEnvFile(envLocalFile) };
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || fileEnv.SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
const explicitPublicBase =
  process.env.PUBLIC_AUTH_BASE_URL ||
  process.env.VITE_PUBLIC_AUTH_BASE_URL ||
  process.env.VITE_API_URL ||
  fileEnv.PUBLIC_AUTH_BASE_URL ||
  fileEnv.VITE_PUBLIC_AUTH_BASE_URL ||
  fileEnv.VITE_API_URL ||
  "";
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || fileEnv.SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  console.error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY");
  process.exit(1);
}

const normalizeBase = (raw) => {
  const clean = String(raw || "").trim().replace(/\/+$/, "");
  if (!clean) return "";
  if (clean.endsWith("/functions/v1")) return clean;
  return `${clean}/functions/v1`;
};

const base = normalizeBase(explicitPublicBase) || `${supabaseUrl.replace(/\/+$/, "")}/functions/v1`;

async function post(name, body) {
  const res = await fetch(`${base}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(body),
  });
  const cfRay = res.headers.get("cf-ray");
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, cf_ray: cfRay, json };
}

async function options(name) {
  const res = await fetch(`${base}/${name}`, {
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
}

const results = {
  base,
  cloudflare_traversal_detected: base.includes("huddle.pet"),
  health: await post("auth-protection-health", {}),
  options: {
    sendPhoneOtp: await options("send-phone-otp"),
    preSignup: await options("send-pre-signup-verify"),
    authLogin: await options("auth-login"),
    authSignup: await options("auth-signup"),
    authResetPassword: await options("auth-reset-password"),
    authChangePassword: await options("auth-change-password"),
  },
  sendPhoneOtp_missing: await post("send-phone-otp", { phone: "+85291234567" }),
  sendPhoneOtp_invalid: await post("send-phone-otp", {
    phone: "+85291234567",
    turnstile_token: "__invalid__",
    turnstile_action: "send_phone_otp",
  }),
  preSignup_missing: await post("send-pre-signup-verify", {
    email: "smoke@example.com",
    token: "smoke-token",
  }),
  preSignup_invalid: await post("send-pre-signup-verify", {
    email: "smoke@example.com",
    token: "smoke-token",
    turnstile_token: "__invalid__",
    turnstile_action: "send_pre_signup_verify",
  }),
};

console.log(JSON.stringify(results, null, 2));
