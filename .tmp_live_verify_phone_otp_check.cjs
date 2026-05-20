const { chromium } = require('playwright');

const STORAGE_KEY = 'sb-ztrbourwcnhrpmzwlrcn-auth-token';
const sessionJson = process.env.HUDDLE_SESSION_JSON;
if (!sessionJson) throw new Error('Missing HUDDLE_SESSION_JSON');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  await context.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, value);
  }, { key: STORAGE_KEY, value: sessionJson });
  const page = await context.newPage();
  const report = { finalUrl: null, tokenLen: 0, reqBody: null, response: null, console: [], pageErrors: [] };
  page.on('console', (msg) => report.console.push(`${msg.type()}:${msg.text()}`));
  page.on('pageerror', (err) => report.pageErrors.push(err.message));
  await page.goto('https://huddle.pet/verify-identity?turnstile_diag=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(12000);
  report.finalUrl = page.url();
  report.tokenLen = await page.evaluate(() => {
    const el = document.querySelector('input[name="cf-turnstile-response"], textarea[name="cf-turnstile-response"]');
    return String(el?.value || '').trim().length;
  });
  const tel = page.locator('input[type="tel"], input[inputmode="tel"]').first();
  if (await tel.count()) await tel.fill('+85264148332');
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/functions/v1/send-phone-otp') && r.request().method() === 'POST', { timeout: 20000 }).catch(() => null),
    page.getByRole('button', { name: /send otp/i }).first().click().catch(() => null),
  ]);
  if (resp) {
    report.reqBody = resp.request().postData();
    report.response = { status: resp.status(), body: await resp.text().catch(() => '') };
  }
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
