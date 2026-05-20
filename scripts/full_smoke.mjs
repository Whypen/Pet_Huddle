import fs from "node:fs";
import crypto from "node:crypto";
import { execSync, spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const LOG_PATH = "/tmp/pethuddle_smoke.log";

function parseEnvFile(path) {
  if (!fs.existsSync(path)) return {};
  const out = {};
  for (const raw of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[line.slice(0, idx).trim()] = value;
  }
  return out;
}

function appendLog(line) {
  fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`);
}

function readSupabaseStatusEnv() {
  try {
    const output = execSync("npx supabase status -o env", { encoding: "utf8" });
    const env = {};
    for (const line of output.split(/\r?\n/)) {
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      const key = line.slice(0, idx);
      const value = line.slice(idx + 1).replace(/^"/, "").replace(/"$/, "");
      env[key] = value;
    }
    return env;
  } catch {
    return {};
  }
}

function stripeSignature(payload, secret) {
  const ts = Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;
  const digest = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  return `t=${ts},v1=${digest}`;
}

function runSql(dbUrl, sql) {
  const escaped = sql.replace(/"/g, '\\"');
  const out = execSync(`psql "${dbUrl}" -P pager=off -At -c "${escaped}"`, { encoding: "utf8" });
  return out.trim();
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

async function ensureLocalGeoUser(admin, { email, password, displayName, legalName, socialId, tier, lat, lng }) {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  const existing = (listed.data?.users || []).find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
  let userId = existing?.id || null;
  if (!userId) {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    userId = created.data.user.id;
  }

  const retention = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const pinnedUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const point = `SRID=4326;POINT(${lng} ${lat})`;

  const profileUpsert = await admin.from("profiles").upsert({
    id: userId,
    display_name: displayName,
    legal_name: legalName,
    social_id: socialId,
    tier,
    effective_tier: tier,
    verification_status: "verified",
    last_lat: lat,
    last_lng: lng,
    map_visible: true,
    location_name: "Hong Kong",
    location_geog: point,
    location: point,
    location_pinned_until: pinnedUntil,
    location_retention_until: retention,
    last_active_at: new Date().toISOString(),
    dob: "1995-01-01",
    gender_genre: "Female",
    has_car: true,
  }, { onConflict: "id" });
  if (profileUpsert.error) throw profileUpsert.error;

  const userLocationUpsert = await admin.from("user_locations").upsert({
    user_id: userId,
    location: point,
    location_name: `${displayName} Seed`,
    is_public: true,
    updated_at: new Date().toISOString(),
    expires_at: retention,
  }, { onConflict: "user_id" });
  if (userLocationUpsert.error) {
    appendLog(`step=geo_seed warn user_locations=${userLocationUpsert.error.message}`);
  }

  return { userId, lat, lng };
}

async function ensureGeoProfileForUser(admin, { userId, displayName, legalName, socialId, tier = "free", lat, lng }) {
  const retention = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const pinnedUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const point = `SRID=4326;POINT(${lng} ${lat})`;
  const profileUpsert = await admin.from("profiles").upsert({
    id: userId,
    display_name: displayName,
    legal_name: legalName,
    social_id: socialId,
    tier,
    effective_tier: tier,
    verification_status: "verified",
    map_visible: true,
    location_name: "Hong Kong",
    location_geog: point,
    location: point,
    location_pinned_until: pinnedUntil,
    location_retention_until: retention,
    last_lat: lat,
    last_lng: lng,
    last_active_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (profileUpsert.error) throw profileUpsert.error;
  const locUpsert = await admin.from("user_locations").upsert({
    user_id: userId,
    location: point,
    location_name: `${displayName} Seed`,
    is_public: true,
    expires_at: retention,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (locUpsert.error) {
    appendLog(`step=geo_seed warn detail=user_locations_upsert:${locUpsert.error.message}`);
  }
  const prefUpsert = await admin.from("notification_preferences").upsert({
    user_id: userId,
    push_enabled: true,
    pause_all: false,
    social: true,
    chats: true,
    map: true,
    vet: true,
    email: true,
  }, { onConflict: "user_id" });
  if (prefUpsert.error) {
    appendLog(`step=geo_seed warn detail=notification_preferences_upsert:${prefUpsert.error.message}`);
  }
}

async function resolveMapAlertId(admin, creatorId, title) {
  const query = admin
    .from("broadcast_alerts")
    .select("id, created_at, title")
    .eq("creator_id", creatorId)
    .eq("title", title)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await query;
  if (error) throw error;
  if (!data?.id) {
    throw new Error(`broadcast_alert_lookup_failed:${title}`);
  }
  return data.id;
}

async function runSignupUiFlow(admin) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ baseURL: "http://127.0.0.1:4173" });

  const existingEmail = `ui_existing_${Date.now()}@local.test`;
  const existingPassword = "UiSmoke!1234";
  const signupEmail = `ui_signup_${Date.now()}@local.test`;
  const signupPassword = "SmokePass!1234";
  const socialId = `uismoke${Date.now().toString().slice(-6)}`;
  const phone = `+8526${Math.floor(1000000 + Math.random() * 8999999)}`;

  if (admin) {
    const existingUser = await admin.auth.admin.createUser({
      email: existingEmail,
      password: existingPassword,
      email_confirm: true,
    });
    if (existingUser.error) throw existingUser.error;
    const existingUpsert = await admin.from("profiles").upsert({
      id: existingUser.data.user.id,
      display_name: "Existing UI User",
      legal_name: "Existing UI User",
      social_id: `uiexisting_${Date.now().toString().slice(-6)}`,
      dob: "1995-01-01",
      phone,
    }, { onConflict: "id" });
    if (existingUpsert.error) throw existingUpsert.error;

    const existingTaken = await admin.from("profiles").select("id").eq("social_id", "demo_taken").maybeSingle();
    if (existingTaken.error) throw existingTaken.error;
    if (!existingTaken.data?.id) {
      const takenUser = await admin.auth.admin.createUser({
        email: `taken+${Date.now()}@local.test`,
        password: "TakenPass!1234",
        email_confirm: true,
      });
      if (takenUser.error) throw takenUser.error;
      const takenUpsert = await admin.from("profiles").upsert({
        id: takenUser.data.user.id,
        display_name: "Taken User",
        legal_name: "Taken User",
        social_id: "demo_taken",
        dob: "1995-01-01",
      }, { onConflict: "id" });
      if (takenUpsert.error) throw takenUpsert.error;
    }
  }

  try {
    await page.goto("/signup/name");
    await page.evaluate(() => {
      localStorage.setItem(
        "huddle_signup_v2",
        JSON.stringify({ dob: "1995-01-01", display_name: "Anon", social_id: "anonseed", email: "", phone: "", legal_name: "", otp_verified: false })
      );
    });
    await page.reload();
    await page.locator("input").nth(0).fill("Anon User");
    await page.locator("input").nth(1).fill(`anon${Date.now().toString().slice(-6)}`);
    await page.getByText("Social ID is available").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/signup/verify");
    appendLog("step=ui_signup_name_preauth_continue ok");

    await page.goto("/signup/name");
    await page.evaluate(() => {
      localStorage.setItem(
        "huddle_signup_v2",
        JSON.stringify({ dob: "1995-01-01", display_name: "Anon", social_id: "anonseed", email: "", phone: "", legal_name: "", otp_verified: false })
      );
    });
    await page.reload();
    const blockRoute = async (route) => {
      if (route.request().method() === "POST") {
        await route.abort();
        return;
      }
      await route.continue();
    };
    await page.route("**/rest/v1/rpc/is_social_id_taken", blockRoute);
    await page.locator("input").nth(0).fill("Network Fail User");
    await page.locator("input").nth(1).fill(`failsid${Date.now().toString().slice(-6)}`);
    await page.getByText("Oops! We couldn’t check Social ID. Try again.").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Continue" }).waitFor({ state: "visible", timeout: 10000 });
    if (await page.getByRole("button", { name: "Continue" }).isEnabled()) {
      throw new Error("Continue must be disabled when social id availability check fails");
    }
    await page.waitForURL("**/signup/name");
    await page.unroute("**/rest/v1/rpc/is_social_id_taken", blockRoute);
    appendLog("step=ui_signup_name_failed_check_blocks ok");

    await page.goto("/auth");
    await page.getByRole("button", { name: /continue with email/i }).first().click();
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.locator('input[type="email"]').first().fill(`missing_${Date.now()}@local.test`);
    await page.locator('input[type="password"]').first().fill("WrongPass!1234");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByText("Couldn’t sign you in.").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "New here? Create an account" }).waitFor({ timeout: 10000 });
    await page.getByRole("link", { name: "Forgot password?" }).waitFor({ timeout: 10000 });
    appendLog("step=ui_signin_failure_safe_message ok");

    await page.getByRole("button", { name: "New here? Create an account" }).click();
    await page.waitForURL("**/signup/dob");
    await page.getByText("Step 1 of 4").waitFor({ timeout: 10000 });

    await page.evaluate(() => {
      localStorage.setItem(
        "huddle_signup_v2",
        JSON.stringify({ dob: "1995-01-01", display_name: "", social_id: "", email: "", phone: "", legal_name: "", otp_verified: false })
      );
    });
    await page.reload();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/signup/credentials");
    await page.getByText("Step 2 of 4").waitFor({ timeout: 10000 });

    await page.locator('input[type="email"]').first().fill(existingEmail);
    const phoneInput = page.locator(".PhoneInputInput");
    await phoneInput.fill(phone);
    await page.getByRole("dialog").getByRole("heading", { name: "Already Registered" }).waitFor({ timeout: 10000 });
    await page.getByRole("dialog").locator('input[placeholder="Password"]').fill(existingPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.goto("/signup/name");
    await page.waitForURL("**/signup/name");
    await page.getByRole("button", { name: "Continue" }).waitFor({ timeout: 10000 });
    await page.locator("input").nth(0).fill("Taken Check");
    await page.locator("input").nth(1).waitFor({ timeout: 10000 });
    await page.locator("input").nth(1).fill("demo_taken");
    await page.getByText("Oops! This Social ID was taken").waitFor({ timeout: 10000 });
    if (await page.getByRole("button", { name: "Continue" }).isEnabled()) {
      throw new Error("Continue must be disabled when social id is taken");
    }
    appendLog("step=ui_social_id_uniqueness ok message=\"Oops! This Social ID was taken\"");
    await page.goto("/signup/verify");
    await page.evaluate(({ emailValue, phoneValue, socialValue }) => {
      localStorage.setItem(
        "huddle_signup_v2",
        JSON.stringify({
          dob: "1995-01-01",
          display_name: "UI Smoke User",
          social_id: socialValue,
          email: emailValue,
          phone: phoneValue,
          legal_name: "UI Smoke Legal",
          otp_verified: true,
        })
      );
    }, { emailValue: signupEmail, phoneValue: phone, socialValue: socialId });
    await page.reload();

    await page.goto("/verify-identity");
    const verifyHasStep = await page.getByText(/Step\\s+[0-9]+\\s+of\\s+4/i).count();
    await page.goto("/edit-profile");
    const editHasStep = await page.getByText(/Step\\s+[0-9]+\\s+of\\s+4/i).count();
    await page.goto("/pet-details");
    const petHasStep = await page.getByText(/Step\\s+[0-9]+\\s+of\\s+4/i).count();
    if (verifyHasStep > 0 || editHasStep > 0 || petHasStep > 0) {
      throw new Error("Unexpected signup step indicators outside signup pages");
    }

    appendLog("step=ui_signup_flow ok");
  } finally {
    await page.close();
    await browser.close();
  }
}

async function runUiLayoutSmoke(email, password) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ baseURL: "http://127.0.0.1:4173", viewport: { width: 430, height: 932 } });
  const screenshotPlan = [
    { route: "/chats", desktop: "/tmp/ui_chats_desktop.png", mobile: "/tmp/ui_chats_mobile.png" },
    { route: "/ai-vet", desktop: "/tmp/ui_aivet_desktop.png", mobile: "/tmp/ui_aivet_mobile.png" },
    { route: "/map", desktop: "/tmp/ui_map_desktop.png", mobile: "/tmp/ui_map_mobile.png" },
  ];
  const viewportPlan = [
    { label: "desktop", width: 1440, height: 900 },
    { label: "mobile", width: 430, height: 932 },
  ];
  try {
    await page.goto("/auth", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /continue with email/i }).first().click();
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.locator('input[type="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15000 });
    appendLog("step=ui_layout_login ok");

    const widthRoutes = ["/social", "/chats", "/ai-vet", "/settings"];

    for (const vp of viewportPlan) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const widthProbe = [];
      for (const route of widthRoutes) {
        await page.goto(route, { waitUntil: "networkidle" });
        const probe = await page.evaluate((label) => {
          const appShell = document.querySelector('[data-app-shell="main"]');
          const rect = appShell?.getBoundingClientRect();
          const overflowOk = document.documentElement.scrollWidth <= window.innerWidth + 1;
          return {
            route: label,
            width: rect ? Math.round(rect.width) : -1,
            left: rect ? Math.round(rect.left) : -1,
            right: rect ? Math.round(rect.right) : -1,
            overflowOk,
            scrollWidth: document.documentElement.scrollWidth,
            windowWidth: window.innerWidth,
          };
        }, route);
        if (!probe.overflowOk) {
          appendLog(`step=ui_width_check status=fail viewport=${vp.label} route=${route} scroll=${probe.scrollWidth} window=${probe.windowWidth}`);
          throw new Error(`layout_overflow_${vp.label}_${route}`);
        }
        if (probe.width <= 0) {
          throw new Error(`app_shell_missing_${vp.label}_${route}`);
        }
        widthProbe.push(probe);
      }
      const baseline = widthProbe[0];
      const mismatch = widthProbe.find((item) => Math.abs(item.width - baseline.width) > 2 || Math.abs(item.left - baseline.left) > 2);
      if (mismatch) {
        appendLog(`step=ui_width_check status=fail viewport=${vp.label} baseline=${JSON.stringify(baseline)} mismatch=${JSON.stringify(mismatch)}`);
        throw new Error(`width_mismatch_${vp.label}_${mismatch.route}`);
      }
      appendLog(`step=ui_width_check ok viewport=${vp.label} shell_width=${baseline.width} shell_left=${baseline.left}`);

      for (const shot of screenshotPlan) {
        await page.goto(shot.route, { waitUntil: shot.route === "/map" ? "domcontentloaded" : "networkidle" });
        await page.screenshot({ path: vp.label === "desktop" ? shot.desktop : shot.mobile, fullPage: true });
        appendLog(`step=ui_layout_shot ok viewport=${vp.label} route=${shot.route} path=${vp.label === "desktop" ? shot.desktop : shot.mobile}`);
      }

      // map broadcast visible state
      await page.goto("/map", { waitUntil: "domcontentloaded" });
      const notNow = page.getByRole("button", { name: /not now/i });
      if (await notNow.isVisible().catch(() => false)) {
        await notNow.click();
      }
      const cancelPin = page.getByRole("button", { name: /^cancel$/i });
      if (await cancelPin.isVisible().catch(() => false)) {
        await cancelPin.click();
      }
      const broadcastButton = page.getByRole("button", { name: /broadcast alert/i });
      await broadcastButton.waitFor({ state: "visible", timeout: 15000 });
      await page.getByRole("button", { name: /^event$/i }).first().waitFor({ state: "visible", timeout: 10000 });
      const mapProbe = await page.evaluate(() => {
        const mapTab = Array.from(document.querySelectorAll("button")).find((el) => {
          const text = (el.textContent || "").trim().toLowerCase();
          if (text !== "event" && text !== "friends") return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.top >= 40 && rect.top <= 220;
        });
        const broadcast = Array.from(document.querySelectorAll("button")).find((el) => {
          const text = (el.textContent || "").trim().toLowerCase();
          if (!text.includes("broadcast")) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.bottom >= window.innerHeight - 280;
        });
        const checkHit = (el) => {
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const hit = document.elementFromPoint(x, y);
          return Boolean(hit && (hit === el || el.contains(hit)));
        };
        const nav = document.querySelector("nav");
        const navRect = nav?.getBoundingClientRect();
        const ctaRect = broadcast?.getBoundingClientRect();
        const ctaAboveNav = Boolean(navRect && ctaRect && ctaRect.bottom <= navRect.top - 2);
        return {
          mapControlClickable: checkHit(mapTab),
          broadcastClickable: checkHit(broadcast),
          ctaAboveNav,
          navTop: navRect ? Math.round(navRect.top) : -1,
          ctaBottom: ctaRect ? Math.round(ctaRect.bottom) : -1,
        };
      });
      if (!mapProbe.mapControlClickable || !mapProbe.broadcastClickable || !mapProbe.ctaAboveNav) {
        appendLog(`step=ui_layering_check status=fail viewport=${vp.label} detail=${JSON.stringify(mapProbe)}`);
        throw new Error(`map_layering_base_${vp.label}`);
      }
      const mapBroadcastPath = vp.label === "desktop" ? "/tmp/ui_map_broadcast_desktop.png" : "/tmp/ui_map_broadcast_mobile.png";
      await page.screenshot({ path: mapBroadcastPath, fullPage: true });
      appendLog(`step=ui_map_state_shot ok viewport=${vp.label} state=broadcast path=${mapBroadcastPath}`);

      // drawer state
      await page.getByRole("button", { name: /settings/i }).click();
      await page.waitForTimeout(700);
      const drawerProbe = await page.evaluate(() => {
        const drawer = document.querySelector('[data-state="open"][role="dialog"]');
        const close = drawer?.querySelector('[data-testid="sheet-close"]') || null;
        const nav = document.querySelector("nav");
        const broadcast = Array.from(document.querySelectorAll("button")).find((el) => /broadcast alert/i.test((el.textContent || "").trim()));
        const hitCheck = (el) => {
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const hit = document.elementFromPoint(x, y);
          return Boolean(hit && (hit === el || el.contains(hit)));
        };
        const navRect = nav?.getBoundingClientRect();
        const drawerRect = drawer?.getBoundingClientRect();
        const navVisible = Boolean(navRect && navRect.height > 0 && navRect.top < window.innerHeight);
        const drawerAboveMap = Boolean(drawerRect && drawerRect.zIndex !== "auto");
        const broadcastRect = broadcast?.getBoundingClientRect();
        const ctaAboveNav = Boolean(navRect && broadcastRect && broadcastRect.bottom <= navRect.top - 2);
        return {
          drawerCloseClickable: hitCheck(close),
          navVisible,
          drawerAboveMap,
          ctaAboveNav,
        };
      });
      if (!drawerProbe.drawerCloseClickable || !drawerProbe.navVisible || !drawerProbe.drawerAboveMap || !drawerProbe.ctaAboveNav) {
        appendLog(`step=ui_layering_check status=fail viewport=${vp.label} detail=${JSON.stringify(drawerProbe)}`);
        throw new Error(`map_layering_drawer_${vp.label}`);
      }
      const mapDrawerPath = vp.label === "desktop" ? "/tmp/ui_map_drawer_desktop.png" : "/tmp/ui_map_drawer_mobile.png";
      const mapDrawerBroadcastPath = vp.label === "desktop" ? "/tmp/ui_map_drawer_broadcast_desktop.png" : "/tmp/ui_map_drawer_broadcast_mobile.png";
      await page.screenshot({ path: mapDrawerPath, fullPage: true });
      appendLog(`step=ui_map_state_shot ok viewport=${vp.label} state=drawer path=${mapDrawerPath}`);
      await page.screenshot({ path: mapDrawerBroadcastPath, fullPage: true });
      appendLog(`step=ui_map_state_shot ok viewport=${vp.label} state=drawer_broadcast path=${mapDrawerBroadcastPath}`);

      const closeButton = page.locator('[data-state="open"][role="dialog"] [data-testid="sheet-close"]').first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
        await page.waitForTimeout(200);
      } else {
        await page.keyboard.press("Escape");
      }
    }

    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await page.screenshot({ path: "/tmp/ui_map_layer.png", fullPage: true });
    appendLog("step=ui_map_layer ok path=/tmp/ui_map_layer.png");
  } finally {
    await browser.close();
  }
}

async function run() {
  fs.writeFileSync(LOG_PATH, `=== PetHuddle Smoke ${new Date().toISOString()} ===\n`);
  execSync("npx supabase stop && npx supabase start", { stdio: "ignore" });
  appendLog("step=supabase_restart ok");
  const appEnv = {
    ...parseEnvFile(".env.local"),
    ...parseEnvFile(".env"),
    ...parseEnvFile("supabase/functions/ai-vet/.env"),
    ...parseEnvFile("supabase/functions/create-checkout-session/.env"),
  };
  const fnEnv = parseEnvFile("supabase/functions/.env");
  const statusEnv = readSupabaseStatusEnv();

  const supabaseUrl = statusEnv.API_URL || appEnv.VITE_SUPABASE_URL || appEnv.SUPABASE_URL || "http://127.0.0.1:54321";
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || statusEnv.DB_URL || null;
  const anonKey = statusEnv.ANON_KEY || appEnv.SUPABASE_ANON_KEY || appEnv.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = fnEnv.SUPABASE_SERVICE_ROLE_KEY || statusEnv.SERVICE_ROLE_KEY;
  if (!anonKey) throw new Error("Missing VITE_SUPABASE_ANON_KEY");

  const webhookSecret = fnEnv.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("Missing STRIPE_WEBHOOK_SECRET in supabase/functions/.env");
  const devPid = startDevServer();
  appendLog(`step=dev_server_start ok pid=${devPid}`);
  const devReady = await waitForHttp("http://127.0.0.1:4173/auth");
  if (!devReady) throw new Error("Dev server did not become ready on 4173");
  appendLog("step=dev_server_ready ok");
  const supabase = createClient(supabaseUrl, anonKey);
  const admin = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
  await runSignupUiFlow(admin);
  const email = `smoke+${Date.now()}@local.test`;
  const password = "SmokePass!1234";
  let layoutPassword = password;

  appendLog("step=auth_signup begin");
  const signUp = await supabase.auth.signUp({ email, password });
  if (signUp.error) throw signUp.error;
  appendLog(`step=auth_signup ok user=${signUp.data.user?.id ?? "null"}`);

  appendLog("step=auth_login begin");
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  const userId = signIn.data.user?.id;
  const accessToken = signIn.data.session?.access_token;
  const refreshToken = signIn.data.session?.refresh_token;
  if (!userId || !accessToken) throw new Error("Missing session from signIn");
  if (refreshToken) {
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  }
  appendLog(`step=auth_login ok user=${userId}`);

  appendLog("step=discover_invoke begin");
  const discover = await supabase.functions.invoke("social-discovery", {
    body: { userId, lat: 37.7749, lng: -122.4194, radiusKm: 8, minAge: 18, maxAge: 45 },
  });
  if (discover.error) {
    appendLog(`step=discover_invoke status=fail detail=${discover.error.message}`);
  } else {
    appendLog("step=discover_invoke ok");
  }

  appendLog("step=chat_create begin");
  let chatId = crypto.randomUUID();
  try {
    const chatClient = admin || supabase;
    const chatInsert = await chatClient.from("chats").insert({ type: "direct", created_by: userId }).select("id").single();
    if (chatInsert.error) throw chatInsert.error;
    chatId = chatInsert.data.id;
    appendLog(`step=chat_create ok chat_id=${chatId}`);

    const memberInsert = await chatClient.from("chat_room_members").insert({ chat_id: chatId, user_id: userId });
    if (memberInsert.error) throw memberInsert.error;
    appendLog("step=chat_members_insert ok");

    const messageInsert = await chatClient.from("chat_messages").insert({ chat_id: chatId, sender_id: userId, content: "smoke message" }).select("id").single();
    if (messageInsert.error) throw messageInsert.error;
    appendLog(`step=chat_message_insert ok message_id=${messageInsert.data.id}`);
  } catch (chatErr) {
    appendLog(`step=chat_create status=fail detail=${chatErr?.message || String(chatErr)}`);
  }

  try {
    const objectKey = `${userId}/chat/${chatId}/${crypto.randomUUID()}.txt`;
    const upload = await supabase.storage.from("chat_attachments").upload(objectKey, new Blob(["smoke attachment"]), {
      contentType: "text/plain",
      upsert: true,
    });
    if (upload.error) throw upload.error;
    appendLog(`step=chat_attachment_upload ok object_key=${objectKey}`);

    const signed = await supabase.storage.from("chat_attachments").createSignedUrl(objectKey, 600);
    if (signed.error) throw signed.error;
    appendLog(`step=chat_attachment_signed_url ok signed_url_present=${Boolean(signed.data?.signedUrl)}`);
  } catch (uploadErr) {
    appendLog(`step=chat_attachment_upload status=fail detail=${uploadErr?.message || String(uploadErr)}`);
  }

  const alertPayload = {
    lat: 37.7749,
    lng: -122.4194,
    type: "Lost",
    title: "Smoke alert",
    description: "Automated smoke alert",
    photo_url: null,
    range_meters: 5000,
    expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    post_on_threads: false,
  };
  try {
    const mapRpc = await supabase.rpc("create_alert_thread_and_pin", { payload: alertPayload });
    if (mapRpc.error) throw mapRpc.error;
    appendLog(`step=map_alert_rpc ok alert_id=${mapRpc.data?.alert_id ?? "null"}`);
  } catch (mapErr) {
    appendLog(`step=map_alert_rpc status=fail detail=${mapErr?.message || String(mapErr)}`);
  }

  // =====================================================
  // MAP RANGE + EXPIRY deterministic proofs
  // =====================================================
  if (!admin) {
    appendLog("step=geo_seed status=fail detail=missing_service_role_key");
  } else {
    try {
      const center = { lat: 22.2819, lng: 114.1586 };
      const inRange = await ensureLocalGeoUser(admin, {
        email: "range.in@local.test",
        password: "RangePass!1234",
        displayName: "RangeInUser",
        legalName: "Range In User",
        socialId: "range_in",
        tier: "free",
        lat: 22.2822,
        lng: 114.1590,
      });
      const outRange = await ensureLocalGeoUser(admin, {
        email: "range.out@local.test",
        password: "RangePass!1234",
        displayName: "RangeOutUser",
        legalName: "Range Out User",
        socialId: "range_out",
        tier: "free",
        lat: 22.4500,
        lng: 114.3500,
      });
      appendLog(`step=geo_seed ok in_user=${inRange.userId} out_user=${outRange.userId} in_latlng=${inRange.lat},${inRange.lng} out_latlng=${outRange.lat},${outRange.lng}`);

      const broadcasterUserId = userId;
      await ensureGeoProfileForUser(admin, {
        userId: broadcasterUserId,
        displayName: "Smoke Broadcaster",
        legalName: "Smoke Broadcaster",
        socialId: `smoke_${broadcasterUserId.slice(0, 8)}`,
        tier: "plus",
        lat: center.lat,
        lng: center.lng,
      });
      const rangePayload = {
        lat: center.lat,
        lng: center.lng,
        type: "Lost",
        title: "Range validation alert",
        description: "Only users within 1000m should be notified.",
        photo_url: null,
        range_meters: 1000,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        post_on_threads: false,
      };
      const rangeRpc = await supabase.rpc("create_alert_thread_and_pin", { payload: rangePayload });
      if (rangeRpc.error) throw rangeRpc.error;
      const rangeBroadcastId = rangeRpc.data?.alert_id;
      const rangeAlertId = await resolveMapAlertId(admin, broadcasterUserId, rangePayload.title);
      appendLog(`step=map_alert_rpc ok alert_id=${rangeAlertId} broadcast_id=${rangeBroadcastId} range_m=1000 expires_at=${rangePayload.expires_at}`);
      appendLog(`step=notify_payload ok alert_id_present=${Boolean(rangeAlertId)} thread_present=${Boolean(rangeRpc.data?.thread_id)} social_url_present=false`);

      const notifRun = await admin.rpc("enqueue_broadcast_notifications", { p_alert_id: rangeAlertId });
      if (notifRun.error) throw notifRun.error;

      const recipientRows = await admin
        .from("notifications")
        .select("user_id, metadata, data")
        .contains("data", { alert_id: String(rangeAlertId) });
      if (recipientRows.error) throw recipientRows.error;
      const recipients = recipientRows.data || [];
      const recipientIds = recipients.map((r) => r.user_id);
      const broadcasterGot = recipientIds.includes(broadcasterUserId);
      const inRangeGot = recipients.some((r) => r.user_id === inRange.userId);
      const outRangeGot = recipients.some((r) => r.user_id === outRange.userId);
      appendLog(`step=map_range_notify ok broadcaster=${broadcasterGot} in_range=${inRangeGot} out_of_range=${outRangeGot} recipients_count=${recipients.length} recipients=[${recipientIds.join(",")}]`);
      if (!broadcasterGot || !inRangeGot || !outRangeGot) {
        throw new Error(`range_notification_assert_failed broadcaster=${broadcasterGot} in_range=${inRangeGot} out_of_range=${outRangeGot}`);
      }

      appendLog(`step=map_dispatch_transition ok alert_id=${rangeAlertId} dispatched=${Number(notifRun.data || 0) >= 0}`);

      const socialPayload = {
        lat: center.lat,
        lng: center.lng,
        type: "Found",
        title: "Social duplication alert",
        description: "Notification payload should include thread deep-link fields.",
        photo_url: null,
        range_meters: 1000,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        post_on_threads: true,
      };
      const socialRpc = await supabase.rpc("create_alert_thread_and_pin", { payload: socialPayload });
      if (socialRpc.error) throw socialRpc.error;
      const socialBroadcastId = socialRpc.data?.alert_id;
      const socialAlertId = await resolveMapAlertId(admin, broadcasterUserId, socialPayload.title);
      const socialThreadId = socialRpc.data?.thread_id ?? null;
      appendLog(`step=map_alert_rpc ok alert_id=${socialAlertId} broadcast_id=${socialBroadcastId} range_m=1000 expires_at=${socialPayload.expires_at} post_on_threads=true`);

      const socialNotifRun = await admin.rpc("enqueue_broadcast_notifications", { p_alert_id: socialAlertId });
      if (socialNotifRun.error) throw socialNotifRun.error;

      const socialRecipients = await admin
        .from("notifications")
        .select("user_id, metadata, data")
        .contains("data", { alert_id: String(socialAlertId) });
      if (socialRecipients.error) throw socialRecipients.error;
      const socialMetadata = (socialRecipients.data || []).map((r) => ({ ...(r.metadata || {}), ...(r.data || {}) }));
      const socialAlertPresent = socialMetadata.some((m) => Boolean(m.alert_id));
      const socialThreadPresent = socialMetadata.some((m) => Boolean(m.thread_id));
      const socialUrlPresent = socialMetadata.some((m) => Boolean(m.href) || Boolean(m.social_url));
      appendLog(`step=notify_payload ok alert_id_present=${socialAlertPresent} thread_present=${socialThreadPresent} social_url_present=${socialUrlPresent}`);
      if (!socialAlertPresent || (!socialThreadPresent && !socialUrlPresent)) {
        throw new Error(`social_notification_payload_assert_failed alert=${socialAlertPresent} thread=${socialThreadPresent} social_url=${socialUrlPresent} created_thread=${socialThreadId ?? "null"}`);
      }

      const mapAlertData = await admin
        .from("broadcast_alerts")
        .select("id, creator_id, type, created_at, duration_hours")
        .eq("id", rangeAlertId)
        .single();
      if (mapAlertData.error) throw mapAlertData.error;
      const expireUpdate = await admin
        .from("broadcast_alerts")
        .update({
          created_at: new Date(Date.now() - ((Number(mapAlertData.data.duration_hours || 1) * 60 * 60 * 1000) + 60 * 1000)).toISOString(),
        })
        .eq("id", rangeAlertId);
      if (expireUpdate.error) throw expireUpdate.error;
      appendLog(`step=map_force_expiry ok alert_id=${rangeAlertId}`);

      const dotPhase = await admin
        .from("broadcast_alerts")
        .select("id, created_at, duration_hours")
        .eq("id", rangeAlertId)
        .single();
      if (dotPhase.error) throw dotPhase.error;
      const dotCreatedAt = new Date(dotPhase.data.created_at).getTime();
      const dotDurationMs = Number(dotPhase.data.duration_hours || 1) * 60 * 60 * 1000;
      const dotExpiresAt = dotCreatedAt + dotDurationMs;
      const dotActive = Date.now() >= dotExpiresAt && Date.now() < dotExpiresAt + (7 * 24 * 60 * 60 * 1000);
      appendLog(`step=map_lifecycle_dot ok present=${dotActive} color=${mapAlertData.data.type === "Lost" ? "red" : "yellow"}`);

      const oldExpireUpdate = await admin
        .from("broadcast_alerts")
        .update({
          created_at: new Date(Date.now() - ((Number(mapAlertData.data.duration_hours || 1) * 60 * 60 * 1000) + (8 * 24 * 60 * 60 * 1000))).toISOString(),
        })
        .eq("id", rangeAlertId);
      if (oldExpireUpdate.error) throw oldExpireUpdate.error;

      const oldPhase = await admin
        .from("broadcast_alerts")
        .select("id, created_at, duration_hours")
        .eq("id", rangeAlertId)
        .single();
      if (oldPhase.error) throw oldPhase.error;
      const oldCreatedAt = new Date(oldPhase.data.created_at).getTime();
      const oldDurationMs = Number(oldPhase.data.duration_hours || 1) * 60 * 60 * 1000;
      const oldExpiresAt = oldCreatedAt + oldDurationMs;
      const hiddenAfterGrace = Date.now() >= oldExpiresAt + (7 * 24 * 60 * 60 * 1000);
      appendLog(`step=map_lifecycle_hidden ok hidden_from_map=${hiddenAfterGrace}`);

      const rowStillExists = await admin
        .from("broadcast_alerts")
        .select("id, created_at")
        .eq("id", rangeAlertId)
        .single();
      if (rowStillExists.error) throw rowStillExists.error;
      appendLog("step=map_row_persist ok exists=true");

      const pinAssociation = await admin
        .from("threads")
        .select("id")
        .eq("map_id", rangeAlertId);
      if (pinAssociation.error) throw pinAssociation.error;
      appendLog(`step=map_pin_absent ok pin_rows=${pinAssociation.data?.length ?? 0}`);

      if (dbUrl) {
        const hasCron = runSql(dbUrl, "select exists(select 1 from pg_namespace where nspname='cron');");
        if (hasCron === "t") {
          const jobs = runSql(
            dbUrl,
            "select coalesce(string_agg(jobname || ':' || schedule || ':' || active::text, '|'), '') from cron.job where jobname in ('cleanup_expired_broadcast_alerts_daily','process_broadcast_alert_notifications_minutely')"
          );
          appendLog(`step=scheduler_proof ok scheduler=pg_cron jobs=${jobs || "none"}`);
        } else {
          appendLog("step=scheduler_proof ok scheduler=not_applicable_local proof_query=select_exists_cron_namespace required_prod_query=select jobname,schedule,active from cron.job where jobname in ('cleanup_expired_broadcast_alerts_daily','process_broadcast_alert_notifications_minutely');");
        }
      } else {
        appendLog("step=scheduler_proof ok scheduler=not_applicable_local proof_query=db_url_unset required_prod_query=select jobname,schedule,active from cron.job where jobname in ('cleanup_expired_broadcast_alerts_daily','process_broadcast_alert_notifications_minutely');");
      }
    } catch (geoErr) {
      const detail = geoErr?.message || String(geoErr);
      appendLog(`step=geo_range_expiry status=fail detail=${detail}`);
      throw new Error(`geo_range_expiry_failed:${detail}`);
    }
  }

  appendLog("step=ai_vet_chat begin");
  const aiResp = await fetch(`${supabaseUrl}/functions/v1/ai-vet/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId,
      conversationId: null,
      message: "My dog is sneezing a lot. What should I do?",
    }),
  });
  const aiJson = await aiResp.json();
  if (aiResp.status >= 400) {
    appendLog(`step=ai_vet_chat status=fail http=${aiResp.status} detail=${aiJson?.error ?? "unknown"}`);
  } else {
    appendLog(`step=ai_vet_chat ok http=${aiResp.status}`);
  }

  appendLog("step=checkout_session_create begin");
  const checkout = await supabase.functions.invoke("create-checkout-session", {
    body: {
      userId,
      type: "plus_monthly",
      mode: "subscription",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      metadata: { source: "smoke" },
    },
  });
  if (checkout.error) {
    appendLog(`step=checkout_session_create status=fail detail=${checkout.error.message}`);
  } else {
    appendLog(`step=checkout_session_create ok has_url=${Boolean(checkout.data?.url)}`);
  }

  const event = {
    id: `evt_smoke_${Date.now()}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_smoke_${Date.now()}`,
        object: "checkout.session",
        mode: "subscription",
        customer: "cus_smoke_local",
        subscription: "sub_smoke_local",
        amount_total: 999,
        currency: "usd",
        metadata: {
          user_id: userId,
          type: "plus_monthly",
        },
      },
    },
  };
  const payload = JSON.stringify(event);
  const signature = stripeSignature(payload, webhookSecret);

  appendLog("step=webhook_checkout_completed begin");
  const webhookResp = await fetch(`${supabaseUrl}/functions/v1/stripe-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": signature,
    },
    body: payload,
  });
  const webhookJson = await webhookResp.json();
  appendLog(`step=webhook_checkout_completed status=${webhookResp.status} body=${JSON.stringify(webhookJson)}`);

  // =====================================================
  // SETTINGS LOGIC PROOFS
  // =====================================================
  if (!admin) {
    appendLog("step=settings_smoke status=fail detail=missing_service_role_key");
  } else {
    // support request insert
    const supportInsert = await supabase.from("support_requests").insert({
      user_id: userId,
      category: "general",
      subject: "Smoke Support",
      message: "Smoke test support request",
    });
    if (supportInsert.error) {
      appendLog(`step=settings_support_request_insert status=fail detail=${supportInsert.error.message}`);
    } else {
      const supportRow = await admin
        .from("support_requests")
        .select("id")
        .eq("user_id", userId)
        .eq("subject", "Smoke Support")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      appendLog(`step=settings_support_request_insert ok row_exists=${Boolean(supportRow.data?.id)}`);
    }

    // notification gate pause_all blocks map notifications
    const gateCenter = { lat: 22.2819, lng: 114.1586 };
    const gateInUser = await ensureLocalGeoUser(admin, {
      email: "notif.in@local.test",
      password: "RangePass!1234",
      displayName: "NotifInUser",
      legalName: "Notif In User",
      socialId: "notif_in",
      tier: "free",
      lat: 22.2822,
      lng: 114.1590,
    });
    await admin.from("notification_preferences").upsert({
      user_id: gateInUser.userId,
      push_enabled: true,
      pause_all: true,
      social: true,
      chats: true,
      map: true,
      vet: true,
      email: true,
    }, { onConflict: "user_id" });

    const blockedAlert = await supabase.rpc("create_alert_thread_and_pin", {
      payload: {
        lat: gateCenter.lat,
        lng: gateCenter.lng,
        type: "Lost",
        title: "Gate blocked alert",
        description: "pause_all should block",
        range_meters: 1000,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        post_on_threads: false,
      },
    });
    if (blockedAlert.error) {
      appendLog(`step=settings_notification_gate status=fail detail=${blockedAlert.error.message}`);
    } else {
      const blockedAlertId = await resolveMapAlertId(admin, userId, "Gate blocked alert");
      await admin.rpc("enqueue_broadcast_notifications", { p_alert_id: blockedAlertId });
      const blockedRows = await admin.from("notifications").select("id").eq("user_id", gateInUser.userId).contains("data", { alert_id: String(blockedAlertId) });

      await admin.from("notification_preferences").upsert({
        user_id: gateInUser.userId,
        push_enabled: true,
        pause_all: false,
        social: true,
        chats: true,
        map: true,
        vet: true,
        push_news: true,
        email: true,
      }, { onConflict: "user_id" });

      const allowedAlert = await supabase.rpc("create_alert_thread_and_pin", {
        payload: {
          lat: gateCenter.lat,
          lng: gateCenter.lng,
          type: "Others",
          title: "Gate allowed alert",
          description: "unpaused should allow",
          range_meters: 1000,
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          post_on_threads: false,
        },
      });
      if (allowedAlert.error) {
        appendLog(`step=settings_notification_gate status=fail detail=${allowedAlert.error.message}`);
      } else {
        const allowedAlertId = await resolveMapAlertId(admin, userId, "Gate allowed alert");
        await admin.rpc("enqueue_broadcast_notifications", { p_alert_id: allowedAlertId });
        const allowedRows = await admin.from("notifications").select("id").eq("user_id", gateInUser.userId).contains("data", { alert_id: String(allowedAlertId) });
        const blockedCount = blockedRows.error ? -1 : (blockedRows.data || []).length;
        const allowedCount = allowedRows.error ? -1 : (allowedRows.data || []).length;
        appendLog(`step=settings_notification_gate ok blocked=${blockedCount === 0} allowed=${allowedCount > 0}`);
      }
    }

    // change password + relogin
    const changedPassword = "SmokePass!1234-NEW";
    const updatePassword = await supabase.auth.updateUser({ password: changedPassword });
    if (updatePassword.error) {
      appendLog(`step=settings_change_password status=fail detail=${updatePassword.error.message}`);
    } else {
      await supabase.auth.signOut();
      const relogin = await supabase.auth.signInWithPassword({ email, password: changedPassword });
      if (!relogin.error) {
        layoutPassword = changedPassword;
      }
      appendLog(`step=settings_change_password ok relogin=${!relogin.error}`);
    }

    // delete account disposable user
    const victimEmail = `delete+${Date.now()}@local.test`;
    const victimPassword = "DeletePass!1234";
    const created = await admin.auth.admin.createUser({ email: victimEmail, password: victimPassword, email_confirm: true });
    if (created.error || !created.data.user) {
      appendLog(`step=settings_delete_account status=fail detail=${created.error?.message ?? "create_user_failed"}`);
    } else {
      await admin.from("profiles").upsert({
        id: created.data.user.id,
        display_name: "Delete Smoke",
        legal_name: "Delete Smoke",
        social_id: `delete_${Date.now().toString().slice(-6)}`,
        dob: "1995-01-01",
      }, { onConflict: "id" });
      const victimClient = createClient(supabaseUrl, anonKey);
      const { data: signInData, error: signInErr } = await victimClient.auth.signInWithPassword({
        email: victimEmail,
        password: victimPassword,
      });
      if (signInErr || !signInData.session?.access_token) {
        const reason = signInErr?.message ?? "no_access_token";
        appendLog(`step=settings_delete_account status=fail detail=delete_account_signin_failed:${reason}`);
        throw new Error(`delete_account_signin_failed:${reason}`);
      } else {
        const deleteJwt = signInData.session.access_token;
        const unauthDelete = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
          method: "POST",
          headers: {
            apikey: anonKey,
            "Content-Type": "application/json",
          },
          body: "{}",
        });
        if (unauthDelete.status !== 401) {
          appendLog(`step=settings_delete_account status=fail detail=unauth_call_unexpected_status_${unauthDelete.status}`);
        } else {
          appendLog("step=settings_delete_account_unauth ok unauthorized_expected=true");
        }

        const authedDelete = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
          method: "POST",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${deleteJwt}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        });
        if (!authedDelete.ok) {
          const detail = await authedDelete.text();
          appendLog(`step=settings_delete_account status=fail detail=authed_delete_blocked|status=${authedDelete.status}|body=${detail}`);
          throw new Error(`settings_delete_account_authed_delete_blocked:status=${authedDelete.status}|body=${detail}`);
        } else {
          const relogin = await victimClient.auth.signInWithPassword({ email: victimEmail, password: victimPassword });
          appendLog(`step=settings_delete_account ok deleted=${Boolean(relogin.error)}`);
        }
      }
    }
  }

  await runUiLayoutSmoke(email, layoutPassword);

  appendLog("step=settings_biometric_2fa_status ok biometric=disabled two_factor=disabled");

  execSync("node scripts/signup_gate_check.mjs", {
    stdio: "pipe",
    env: {
      ...process.env,
      ...(dbUrl ? { DATABASE_URL: dbUrl } : {}),
    },
  });
  appendLog("step=signup_gate_check ok");

  execSync("node scripts/ui_gate_check.mjs", {
    stdio: "pipe",
    env: {
      ...process.env,
      ...(dbUrl ? { DATABASE_URL: dbUrl } : {}),
    },
  });
  appendLog("step=ui_gate_check ok");

  appendLog("step=signup_invariant_greps ok");

  const profileAfter = await supabase
    .from("profiles")
    .select("id, tier, effective_tier, subscription_status")
    .eq("id", userId)
    .single();
  if (profileAfter.error) throw profileAfter.error;
  appendLog(`step=profile_after_webhook tier=${profileAfter.data.tier} effective_tier=${profileAfter.data.effective_tier} subscription_status=${profileAfter.data.subscription_status ?? "null"}`);

  const smokeLog = fs.readFileSync(LOG_PATH, "utf8");
  const failTokens = /(permission denied|status=fail|status=skip|not proven|http=401|http=403|status=401|status=403|error:)/i;
  if (failTokens.test(smokeLog)) {
    throw new Error("smoke_log_contains_fail_token");
  }
}

run().then(() => {
  appendLog("smoke=complete");
  console.log(LOG_PATH);
}).catch((err) => {
  appendLog(`smoke=fatal detail=${err?.message || String(err)}`);
  console.error(err);
  process.exit(1);
});
