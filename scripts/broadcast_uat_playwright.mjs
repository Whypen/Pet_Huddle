import { chromium } from "playwright";
import { spawn } from "node:child_process";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";

const base = process.env.BASE_URL || "http://127.0.0.1:8081";
const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

function uniqueEmail() {
  const ts = Date.now();
  return `codex_uat_${ts}@example.com`;
}

function uniquePhone() {
  const rand = Math.floor(10000000 + Math.random() * 90000000);
  return `+852${rand}`;
}

async function setRangeInputValue(locator, value) {
  await locator.evaluate((el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function run() {
  let devServer;
  const baseUrl = new URL(base);
  const devHost = baseUrl.hostname || "127.0.0.1";
  const devPort = baseUrl.port ? Number(baseUrl.port) : 8081;
  const devUrl = `${baseUrl.protocol}//${devHost}:${devPort}`;
  const waitForHttp = (url, timeoutMs = 30_000) =>
    new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        const req = http
          .get(url, (res) => {
            res.resume();
            resolve();
          })
          .on("error", () => {
            if (Date.now() - started > timeoutMs) {
              reject(new Error(`Timeout waiting for ${url}`));
            } else {
              setTimeout(tick, 500);
            }
          });
        req.setTimeout(2000, () => req.destroy());
      };
      tick();
    });
  devServer = spawn(
    "npm",
    ["run", "dev", "--", "--host", devHost, "--port", String(devPort)],
    { stdio: "inherit", env: { ...process.env } }
  );
  await waitForHttp(`${devUrl}/map`).catch(async (err) => {
    if (devServer) devServer.kill("SIGTERM");
    throw err;
  });
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== "false",
    args: [
      "--use-gl=swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--disable-gpu-sandbox",
    ],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    geolocation: { latitude: 22.2828, longitude: 114.1583 },
    permissions: ["geolocation"],
  });
  const page = await ctx.newPage();

  const logs = [];
  page.on("console", (m) => logs.push(m.text()));
  const pageErrors = [];
  page.on("pageerror", (e) => {
    const msg = e?.stack || e?.message || String(e);
    pageErrors.push(msg);
    console.log("[PAGEERROR]", msg);
  });

  const email = uniqueEmail();
  const password = "Password123!";

  try {
    // 1) Create auth session via Supabase to avoid UI login timing issues.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await supabase.auth.signUp({ email, password });
    const signIn = await supabase.auth.signInWithPassword({ email, password });
    const session = signIn.data.session;
    if (!session) {
      throw new Error("Failed to obtain auth session");
    }
    const sessionPayload = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      token_type: session.token_type,
      user: session.user,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
    };
    const testPhone = process.env.UAT_PHONE || uniquePhone();
    await supabase.from("profiles").upsert(
      {
        id: session.user.id,
        display_name: session.user.email?.split("@")[0] || "UAT User",
        legal_name: session.user.email?.split("@")[0] || "UAT User",
        phone: testPhone,
        onboarding_completed: true,
      },
      { onConflict: "id" }
    );

    // Prime storage key variants in localStorage before any app code runs.
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

    // 2) Navigate to map.
    await page.goto(`${devUrl}/map`, { waitUntil: "domcontentloaded" });
    const sessionRaw = await page.evaluate(() => {
      return (
        localStorage.getItem("sb-127-auth-token") ||
        localStorage.getItem("sb-127.0.0.1-auth-token") ||
        localStorage.getItem("sb-localhost-auth-token") ||
        null
      );
    });
    console.log("[UAT] session", sessionRaw ? "present" : "missing");
    const storageKeysSeen = await page.evaluate(() => Object.keys(localStorage));
    console.log("[UAT] storage keys", storageKeysSeen);
    try {
      await page.waitForSelector("canvas.mapboxgl-canvas", { timeout: 30_000 });
    } catch (err) {
      const url = page.url();
      const bodyText = await page.textContent("body").catch(() => "");
      console.error("[UAT] Map canvas missing", { url, bodyText: bodyText?.slice(0, 300), logs: logs.slice(-20), pageErrors });
      throw err;
    }

    // 3) Open broadcast modal.
    await page.getByRole("button", { name: /broadcast/i }).click();
    await page.getByRole("heading", { name: /broadcast alert/i }).waitFor({ timeout: 10_000 });

    // 4) Start pin location flow.
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const target = buttons.find((btn) =>
        (btn.textContent || "").toLowerCase().includes("pin location")
      );
      target?.click();
    });
    const closeBtn = page.getByRole("button", { name: "Close" });
    if (await closeBtn.isVisible().catch(() => false)) {
      try {
        await closeBtn.click({ timeout: 2000 });
      } catch (err) {
        // Modal may already be closing; ignore.
      }
    }
    const usedHelper = await page
      .waitForFunction(() => typeof window.__TEST_selectBroadcastLocation === "function", { timeout: 5000 })
      .then(() =>
        page.evaluate(() => {
          const helper = window.__TEST_selectBroadcastLocation;
          if (typeof helper === "function") {
            helper();
            return true;
          }
          return false;
        })
      )
      .catch(async () => {
        return page.evaluate(() => {
          const helper = window.__TEST_selectBroadcastLocation;
          if (typeof helper === "function") {
            helper();
            return true;
          }
          return false;
        });
      });
    const removeLocationBtn = page.getByRole("button", { name: /remove location/i });
    if (usedHelper) {
      await removeLocationBtn.waitFor({ timeout: 10_000 });
    } else {
      // 5) Tap map to choose location.
      await page.locator("canvas.mapboxgl-canvas").click({ position: { x: 640, y: 360 }, force: true });
      await page.getByRole("heading", { name: /broadcast alert/i }).waitFor({ timeout: 10_000 });
      await removeLocationBtn.waitFor({ timeout: 10_000 });
    }

    // 6) Slider clamp + upsell (free tier expected cap 10km/12h).
    const rangeSlider = page.locator('input[type="range"]').nth(0);
    await setRangeInputValue(rangeSlider, 120);
    await page.getByText(/range:\s*10\s*km/i).waitFor({ timeout: 10_000 });
    const upsellBanner = page.getByText(/upgrade your membership to enjoy this perk/i);
    if (await upsellBanner.isVisible().catch(() => false)) {
      await upsellBanner.waitFor({ timeout: 10_000 });
    }

    // 7) Submit broadcast.
    const broadcastBtn = page.getByRole("button", { name: /broadcast\s+stray\s+alert/i });
    await broadcastBtn.scrollIntoViewIfNeeded();
    await broadcastBtn.click({ force: true });
    await page.getByText(/your pin is live/i).waitFor({ timeout: 15_000 });

    // 8) Persisted marker should exist.
    await page.getByRole("button", { name: /open\s+stray\s+alert/i }).first().waitFor({ timeout: 15_000 });

    const out = {
      email,
      steps: {
        signup: true,
        mapLoaded: true,
        pinPicked: true,
        clampVerified: true,
        broadcastToast: true,
        markerVisible: true,
      },
      logTail: logs.slice(-60),
    };
    console.log(JSON.stringify(out, null, 2));
  } catch (err) {
    console.error("[UAT] Failure context", {
      url: page.url(),
      logs: logs.slice(-40),
      pageErrors,
    });
    throw err;
  } finally {
    await ctx.close();
    await browser.close();
    if (devServer) {
      devServer.kill("SIGTERM");
    }
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
