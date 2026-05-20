const { chromium } = require('playwright');

(async () => {
  const base = 'http://127.0.0.1:4176';
  const routes = [
    { name: '/auth', path: '/auth' },
    { name: '/signup/name', path: '/signup/name' },
    { name: '/reset-password', path: '/reset-password' },
    { name: '/auth/callback?type=recovery', path: '/auth/callback?type=recovery' },
  ];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];
  for (const r of routes) {
    const hit = [];
    page.removeAllListeners('request');
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('/functions/v1/auth-login') || u.includes('/functions/v1/auth-signup') || u.includes('/functions/v1/auth-reset-password') || u.includes('/functions/v1/auth-change-password')) {
        hit.push({ method: req.method(), url: u });
      }
    });

    await page.goto(base + r.path, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);

    if (r.name === '/auth') {
      await page.getByRole('button', { name: 'Continue with Email' }).click().catch(() => {});
      await page.waitForTimeout(800);
    }

    const turnstileDivCount = await page.locator('div.min-h-\\[65px\\]').count().catch(() => 0);
    const iframeCount = await page.locator('iframe[src*="challenges.cloudflare.com"]').count().catch(() => 0);
    const hasMissingText = await page.locator('text=Turnstile site key is missing').count().catch(() => 0);

    if (r.name === '/reset-password') {
      await page.fill('input[type="email"]', 'test@example.com').catch(() => {});
      await page.getByRole('button', { name: 'Send reset link' }).click().catch(() => {});
      await page.waitForTimeout(1200);
    }

    if (r.name === '/auth/callback?type=recovery') {
      await page.fill('input[type="password"]', 'password1234').catch(() => {});
      await page.getByRole('button', { name: 'Update' }).click().catch(() => {});
      await page.waitForTimeout(1200);
    }

    if (r.name === '/signup/name') {
      await page.fill('input[placeholder="Display name"]', 'Test User').catch(() => {});
      await page.fill('input[placeholder="Social ID"]', 'testuser1').catch(() => {});
      await page.getByRole('button', { name: 'Continue' }).click().catch(() => {});
      await page.waitForTimeout(1200);
    }

    results.push({ route: r.name, turnstileDivCount, iframeCount, hasMissingText, wrapperRequests: [...hit], finalUrl: page.url() });
  }

  await page.goto(base + '/settings', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(()=>{});
  await page.waitForTimeout(1200);
  const settingsTurnstileDivCount = await page.locator('div.min-h-\\[65px\\]').count().catch(() => 0);
  const settingsIframes = await page.locator('iframe[src*="challenges.cloudflare.com"]').count().catch(() => 0);
  results.push({ route: '/settings', turnstileDivCount: settingsTurnstileDivCount, iframeCount: settingsIframes, finalUrl: page.url(), note: 'protected route; dialog not reachable unauthenticated in automated probe' });

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
