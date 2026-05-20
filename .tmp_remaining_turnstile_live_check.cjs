const { chromium } = require('playwright');
const { createClient } = require('/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/node_modules/@supabase/supabase-js');

const SUPABASE_URL = 'https://ztrbourwcnhrpmzwlrcn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DCn7OKhJ15mzHz1xcfTmsw_wxJh5zKd';
const STORAGE_KEY = 'sb-ztrbourwcnhrpmzwlrcn-auth-token';
const EMAIL = 'testaccount4@huddle.test';
const ORIGINAL_PASSWORD = 'TestHuddle123!';
const SETTINGS_PASSWORD = 'TestHuddle123!A';
const RECOVERY_PASSWORD = ORIGINAL_PASSWORD;
const TEST_PHONE = '+15005550006';

async function signIn(email, password) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return JSON.stringify(data.session);
}

async function diagFromPage(page) {
  return page.evaluate(() => {
    const labels = ['widget rendered', 'callback fired', 'error callback fired', 'expired callback fired', 'token length', 'widget id'];
    const rows = [...document.querySelectorAll('div')]
      .map((node) => {
        const first = (node.firstElementChild?.textContent || '').trim();
        const last = (node.lastElementChild?.textContent || '').trim();
        return labels.includes(first) ? [first, last] : null;
      })
      .filter(Boolean);
    return Object.fromEntries(rows);
  });
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext();
  const setSession = async (sessionJson) => {
    await context.addInitScript(({ key, value }) => {
      window.localStorage.setItem(key, value);
    }, { key: STORAGE_KEY, value: sessionJson });
  };

  const results = {};
  await setSession(await signIn(EMAIL, ORIGINAL_PASSWORD));
  const page = await context.newPage();

  await page.goto('https://huddle.pet/verify-identity?turnstile_diag=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(12000);
  results.verifyIdentityDiag = await diagFromPage(page);
  results.verifyIdentityUrl = page.url();
  results.phoneOtp = { success: false, responseStatus: null, responseBody: null };
  if (Number(results.verifyIdentityDiag['token length'] || 0) > 0) {
    const tel = page.locator('input[type="tel"], input[inputmode="tel"], input').first();
    await tel.fill(TEST_PHONE);
    const responsePromise = page.waitForResponse((resp) => resp.url().includes('/functions/v1/send-phone-otp') && resp.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
    await page.getByRole('button', { name: /send otp|resend/i }).click();
    const response = await responsePromise;
    if (response) {
      results.phoneOtp.responseStatus = response.status();
      try { results.phoneOtp.responseBody = await response.text(); } catch {}
      results.phoneOtp.success = response.ok();
    }
  }

  await page.goto('https://huddle.pet/settings?turnstile_diag=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(12000);
  results.settingsDiag = await diagFromPage(page);
  results.settingsUrl = page.url();
  results.settingsChangePassword = { success: false, responseStatus: null, responseBody: null };
  if (Number(results.settingsDiag['token length'] || 0) > 0) {
    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.nth(0).fill(SETTINGS_PASSWORD);
    await passwordInputs.nth(1).fill(SETTINGS_PASSWORD);
    const responsePromise = page.waitForResponse((resp) => resp.url().includes('/functions/v1/auth-change-password') && resp.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
    await page.getByRole('button', { name: /^Update$/ }).click();
    const response = await responsePromise;
    if (response) {
      results.settingsChangePassword.responseStatus = response.status();
      try { results.settingsChangePassword.responseBody = await response.text(); } catch {}
      results.settingsChangePassword.success = response.ok();
    }
  }

  await setSession(await signIn(EMAIL, results.settingsChangePassword.success ? SETTINGS_PASSWORD : ORIGINAL_PASSWORD));
  await page.goto('https://huddle.pet/auth/callback?type=recovery&turnstile_diag=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(12000);
  results.recoveryDiag = await diagFromPage(page);
  results.recoveryUrl = page.url();
  results.recoveryChangePassword = { success: false, responseStatus: null, responseBody: null };
  if (Number(results.recoveryDiag['token length'] || 0) > 0) {
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(RECOVERY_PASSWORD);
    const responsePromise = page.waitForResponse((resp) => resp.url().includes('/functions/v1/auth-change-password') && resp.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
    await page.getByRole('button', { name: /Update password/i }).click();
    const response = await responsePromise;
    if (response) {
      results.recoveryChangePassword.responseStatus = response.status();
      try { results.recoveryChangePassword.responseBody = await response.text(); } catch {}
      results.recoveryChangePassword.success = response.ok();
    }
  }

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
