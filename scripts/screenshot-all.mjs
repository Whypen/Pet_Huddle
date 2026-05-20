/**
 * screenshot-all.mjs
 * Visual-proof captures for every page touched in the UI revamp.
 *
 * Usage:
 *   node scripts/screenshot-all.mjs
 *
 * Env (optional — only needed for protected-route captures):
 *   SCREENSHOT_EMAIL     e.g. test@example.com
 *   SCREENSHOT_PASSWORD  e.g. password123
 *   BASE_URL             default http://localhost:8080
 *
 * Output: screenshots/proof/{01-auth.png … 12-premium.png}
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL        = process.env.BASE_URL       || "http://localhost:8080";
const SUPABASE_URL    = "https://ztrbourwcnhrpmzwlrcn.supabase.co";
const SUPABASE_ANON   = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_DCn7OKhJ15mzHz1xcfTmsw_wxJh5zKd";
const PROJECT_REF     = "ztrbourwcnhrpmzwlrcn";
const AUTH_TOKEN_KEY  = `sb-${PROJECT_REF}-auth-token`;

const SCREENSHOT_EMAIL    = process.env.SCREENSHOT_EMAIL;
const SCREENSHOT_PASSWORD = process.env.SCREENSHOT_PASSWORD;

// iPhone 14 viewport
const VIEWPORT = { width: 390, height: 844 };

const OUT_DIR = path.resolve("screenshots/proof");

// ─── Route manifest ───────────────────────────────────────────────────────────

const PUBLIC_ROUTES = [
  { file: "01-auth.png",              path: "/auth",                 waitFor: ".text-\\[28px\\],.text-xl,h1", settle: 600 },
  { file: "02-signup-dob.png",        path: "/signup/dob",           waitFor: "select,[role=combobox]",       settle: 500 },
  { file: "03-signup-credentials.png",path: "/signup/credentials",   waitFor: "input,form",                   settle: 500 },
  { file: "04-signup-name.png",       path: "/signup/name",          waitFor: "input,form",                   settle: 500 },
  { file: "05-signup-verify.png",     path: "/signup/verify",        waitFor: "form,h1",                      settle: 500 },
];

const PROTECTED_ROUTES = [
  { file: "06-discover.png",     path: "/",                        settle: 800 },
  { file: "07-ai-vet.png",       path: "/ai-vet",                  settle: 700 },
  { file: "08-chat-dm.png",      path: "/chat-dialogue?type=dm",   settle: 700 },
  { file: "09-chat-group.png",   path: "/chat-dialogue?type=group",settle: 700 },
  { file: "10-marketplace.png",  path: "/marketplace",             settle: 700 },
  { file: "11-settings.png",     path: "/settings",                settle: 800 },
  { file: "12-premium.png",      path: "/premium",                 settle: 700 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function waitForHttp(url, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const attempt = () => {
      http.get(url, (res) => { res.resume(); resolve(); })
        .on("error", () => {
          if (Date.now() - started > timeoutMs) {
            reject(new Error(`Timeout waiting for dev server at ${url}`));
          } else {
            setTimeout(attempt, 500);
          }
        });
    };
    attempt();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function injectSession(page, session) {
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: AUTH_TOKEN_KEY, value: JSON.stringify(session) },
  );
}

async function shoot(page, file, settle) {
  await sleep(settle);
  const dest = path.join(OUT_DIR, file);
  await page.screenshot({ path: dest, fullPage: false });
  console.log(`  ✓ ${file}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  // 1. Ensure output directory exists
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`\n📸 Pet Huddle — screenshot proof\n   out: ${OUT_DIR}\n`);

  // 2. Wait for dev server
  console.log(`⏳ Waiting for dev server at ${BASE_URL}…`);
  await waitForHttp(BASE_URL);
  console.log("   Dev server ready.\n");

  // 3. Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();

  // 4. Public routes ────────────────────────────────────────────────────────────
  console.log("── Public routes ──────────────────────────────────────────────");
  for (const route of PUBLIC_ROUTES) {
    try {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "networkidle" });
      if (route.waitFor) {
        await page.waitForSelector(route.waitFor, { timeout: 5000 }).catch(() => {});
      }
      await shoot(page, route.file, route.settle ?? 500);
    } catch (err) {
      console.warn(`  ⚠ ${route.file} — ${err.message}`);
    }
  }

  // 5. Protected routes ─────────────────────────────────────────────────────────
  console.log("\n── Protected routes ───────────────────────────────────────────");

  let session = null;

  if (SCREENSHOT_EMAIL && SCREENSHOT_PASSWORD) {
    console.log(`   Signing in as ${SCREENSHOT_EMAIL}…`);
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: SCREENSHOT_EMAIL,
      password: SCREENSHOT_PASSWORD,
    });
    if (error) {
      console.warn(`   ⚠ Auth failed: ${error.message}`);
      console.warn("   Protected screenshots will be skipped.\n");
    } else {
      session = data.session;
      console.log("   Auth OK.\n");
    }
  } else {
    console.log("   SCREENSHOT_EMAIL / SCREENSHOT_PASSWORD not set.");
    console.log("   Capturing protected routes without auth (will show redirect/auth).\n");
  }

  for (const route of PROTECTED_ROUTES) {
    try {
      // Navigate to base first so we can inject localStorage on the right origin
      if (session) {
        await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
        await injectSession(page, session);
      }

      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "networkidle" });
      await shoot(page, route.file, route.settle ?? 700);
    } catch (err) {
      console.warn(`  ⚠ ${route.file} — ${err.message}`);
    }
  }

  await browser.close();

  // 6. Summary
  const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".png")).sort();
  console.log(`\n✅ Done — ${files.length} screenshot(s) in ${OUT_DIR}:`);
  for (const f of files) {
    const size = (fs.statSync(path.join(OUT_DIR, f)).size / 1024).toFixed(0);
    console.log(`   ${f}  (${size} KB)`);
  }
  console.log();
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
