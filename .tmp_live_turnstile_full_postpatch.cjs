const { chromium } = require('playwright');

const routes = [
  '/auth',
  '/signup/credentials',
  '/reset-password',
  '/auth/callback?type=recovery',
  '/signup/verify-email',
  '/verify-identity',
  '/settings',
  '/signup/name',
];

const base = 'https://huddle.pet';

function classifyFailure(errors, responses) {
  const e = errors.join('\n').toLowerCase();
  const bodies = responses.map((r) => String(r.body || '').toLowerCase()).join('\n');
  if (e.includes('gettoken is not a function')) return 'frontend crash';
  if (bodies.includes('missing_token')) return 'missing token';
  if (bodies.includes('invalid_token')) return 'invalid token';
  if (bodies.includes('action_mismatch')) return 'action mismatch';
  if (bodies.includes('hostname_mismatch')) return 'hostname mismatch';
  if (bodies.includes('human_verification_failed')) return 'siteverify rejection';
  if (e.includes('600010')) return 'widget config/runtime failure';
  if (e.includes('cors') || e.includes('preflight')) return 'CSP/CORS';
  return 'other';
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const report = [];

  for (const path of routes) {
    const page = await context.newPage();
    const events = { errors: [], req: [], res: [] };

    page.on('pageerror', (err) => events.errors.push(`pageerror:${err.message}`));
    page.on('console', (msg) => {
      const t = msg.text();
      if (/turnstile|600010|gettoken|typeerror|human_verification|missing_token|invalid_token|action_mismatch|hostname_mismatch|something went wrong/i.test(t)) {
        events.errors.push(`console:${msg.type()}:${t}`);
      }
    });
    page.on('request', (req) => {
      if (req.url().includes('/functions/v1/')) {
        events.req.push({ method: req.method(), url: req.url(), body: (req.postData() || '').slice(0, 240) });
      }
    });
    page.on('response', async (res) => {
      if (res.url().includes('/functions/v1/')) {
        let body = '';
        try { body = (await res.text()).slice(0, 320); } catch {}
        events.res.push({ status: res.status(), url: res.url(), body });
      }
    });

    await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(2500);

    if (path === '/auth') {
      const btn1 = page.getByRole('button', { name: /continue with email/i }).first();
      if (await btn1.count()) { await btn1.click().catch(() => {}); await page.waitForTimeout(1000); }
      const btn2 = page.getByRole('button', { name: /^sign in$/i }).first();
      if (await btn2.count()) { await btn2.click().catch(() => {}); await page.waitForTimeout(1000); }
      const email = page.locator('input[type="email"]').first();
      if (await email.count()) await email.fill(`liveprobe${Date.now()}@example.com`).catch(() => {});
      const pw = page.locator('input[type="password"]').first();
      if (await pw.count()) await pw.fill('Password123!').catch(() => {});
    }

    if (path === '/signup/credentials') {
      const email = page.locator('input[type="email"]').first();
      if (await email.count()) await email.fill(`liveprobe${Date.now()}@example.com`).catch(() => {});
      const tel = page.locator('input[type="tel"]').first();
      if (await tel.count()) await tel.fill('+14155552671').catch(() => {});
      const pws = page.locator('input[type="password"]');
      if (await pws.count() >= 1) await pws.nth(0).fill('Password123!').catch(() => {});
      if (await pws.count() >= 2) await pws.nth(1).fill('Password123!').catch(() => {});
    }

    if (path === '/reset-password') {
      const email = page.locator('input[type="email"]').first();
      if (await email.count()) await email.fill(`liveprobe${Date.now()}@example.com`).catch(() => {});
    }

    const iframes = await page.locator('iframe[src*="challenges.cloudflare.com"]').count();
    const responseInputs = await page.locator('input[name="cf-turnstile-response"]').count();
    const responseLen = responseInputs
      ? await page.locator('input[name="cf-turnstile-response"]').first().inputValue().then((v) => String(v || '').trim().length).catch(() => 0)
      : 0;

    const ctas = [
      page.getByRole('button', { name: /^continue$/i }).first(),
      page.getByRole('button', { name: /^sign in$/i }).first(),
      page.getByRole('button', { name: /send reset link/i }).first(),
      page.getByRole('button', { name: /resend link/i }).first(),
      page.getByRole('button', { name: /send otp/i }).first(),
      page.getByRole('button', { name: /update password/i }).first(),
      page.getByRole('button', { name: /^update$/i }).first(),
      page.getByRole('button', { name: /open mail/i }).first(),
    ];
    for (const cta of ctas) {
      if (await cta.count()) {
        await cta.click({ force: true }).catch(() => {});
        await page.waitForTimeout(900);
        break;
      }
    }

    report.push({
      path,
      finalUrl: page.url(),
      visibleTurnstileBox: iframes > 0,
      turnstileIframeCount: iframes,
      turnstileInputCount: responseInputs,
      cfTurnstileResponseLength: responseLen,
      callbackLikelyFired: responseLen > 0,
      tokenGenerated: responseLen > 0,
      requests: events.req,
      responses: events.res,
      errors: events.errors,
      failureClassification: classifyFailure(events.errors, events.res),
    });

    await page.close();
  }

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
