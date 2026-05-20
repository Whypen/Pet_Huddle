import fs from "node:fs";
import { execSync, spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

function parseEnvFile(path) {
  if (!fs.existsSync(path)) return {};
  const out = {};
  for (const raw of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[line.slice(0, idx).trim()] = value;
  }
  return out;
}

function readSupabaseStatusEnv() {
  try {
    const output = execSync("npx supabase status -o env", { encoding: "utf8" });
    const env = {};
    for (const line of output.split(/\r?\n/)) {
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      env[line.slice(0, idx)] = line.slice(idx + 1).replace(/^"/, "").replace(/"$/, "");
    }
    return env;
  } catch {
    return {};
  }
}

async function waitForHttp(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function startDevServer() {
  const proc = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4173"], {
    stdio: "ignore",
    detached: true,
  });
  proc.unref();
  return proc.pid;
}

async function login(page, email, password) {
  await page.goto("/auth", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /continue with email/i }).first().click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15000 });
}

async function main() {
  const fileEnv = {
    ...parseEnvFile(".env"),
    ...parseEnvFile(".env.local"),
    ...parseEnvFile("supabase/functions/.env"),
  };
  let supabaseUrl = fileEnv.VITE_SUPABASE_URL || fileEnv.SUPABASE_URL;
  let anonKey = fileEnv.VITE_SUPABASE_ANON_KEY || fileEnv.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    const statusEnv = readSupabaseStatusEnv();
    supabaseUrl = supabaseUrl || statusEnv.API_URL;
    anonKey = anonKey || statusEnv.ANON_KEY;
  }
  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing Supabase env for ui smoke");
  }

  const pid = startDevServer();
  console.log(`dev_server_pid=${pid}`);
  const ready = await waitForHttp("http://127.0.0.1:4173/auth");
  if (!ready) throw new Error("Dev server did not become ready");

  const anon = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const email = `ui-smoke-${Date.now()}@local.test`;
  const password = "UiSmoke!1234";
  const signUp = await anon.auth.signUp({ email, password });
  if (signUp.error) throw signUp.error;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ baseURL: "http://127.0.0.1:4173", viewport: { width: 430, height: 932 } });
  const consoleErrors = [];
  const isIgnorableConsoleError = (text) =>
    text.includes("[AuthContext] fetchProfile failed") ||
    text.includes("Failed to load resource: the server responded with a status of 401");
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!isIgnorableConsoleError(text)) consoleErrors.push(text);
    }
  });
  page.on("pageerror", (err) => {
    if (!isIgnorableConsoleError(err.message)) consoleErrors.push(err.message);
  });

  try {
    await login(page, email, password);
    console.log("login=ok");

    const routes = [
      "/social",
      "/ai-vet",
      "/map",
      "/pet-details",
      "/privacy",
      "/terms",
      "/premium",
      "/verify-identity",
      "/edit-profile",
      "/set-profile",
      "/edit-pet-profile",
      "/set-pet",
    ];

    for (const route of routes) {
      await page.goto(route, { waitUntil: route === "/map" ? "domcontentloaded" : "networkidle" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
      if (!overflow) {
        throw new Error(`horizontal_overflow:${route}`);
      }
      console.log(`route_ok=${route}`);
    }

    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const state = window.__HUDDLE_MAP__;
      return Boolean(state && typeof state.initialized === "boolean" && typeof state.fallback === "boolean");
    }, { timeout: 20000 });
    const mapState = await page.evaluate(() => ({
      hud: window.__HUDDLE_MAP__,
      rect: (() => {
        const canvas = document.querySelector(".mapboxgl-canvas");
        const rect = canvas?.getBoundingClientRect();
        return rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null;
      })(),
    }));
    const size = mapState.rect ? `${mapState.rect.width}x${mapState.rect.height}` : "none";
    console.log(`map=ok initialized=${mapState.hud.initialized} fallback=${mapState.hud.fallback} size=${size}`);

    if (consoleErrors.length) {
      throw new Error(`console_errors:${consoleErrors.join(" | ")}`);
    }

    console.log("ui_smoke=PASS");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`ui_smoke=FAIL ${error.message}`);
  process.exit(1);
});
