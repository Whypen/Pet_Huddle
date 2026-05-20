const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const out = { errors: [], requests: [], responses: [] };

  page.on('pageerror', (e) => out.errors.push(`pageerror:${e.message}`));
  page.on('console', (m) => {
    const t = m.text();
    if (/TypeError|getToken|signup failed|turnstile|600010|human_verification_failed/i.test(t)) {
      out.errors.push(`console:${m.type()}:${t}`);
    }
  });
  page.on('request', (r) => {
    if (r.url().includes('/functions/v1/')) {
      out.requests.push({ method: r.method(), url: r.url(), body: (r.postData() || '').slice(0, 180) });
    }
  });
  page.on('response', async (r) => {
    if (r.url().includes('/functions/v1/')) {
      let body = '';
      try { body = (await r.text()).slice(0, 220); } catch {}
      out.responses.push({ status: r.status(), url: r.url(), body });
    }
  });

  await page.goto('https://huddle.pet/signup/credentials', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(2500);

  const email = page.locator('input[type="email"]').first();
  if (await email.count()) await email.fill(`qa${Date.now()}@example.com`);

  const tel = page.locator('input[type="tel"]').first();
  if (await tel.count()) await tel.fill('+14155552671');

  const pw = page.locator('input[type="password"]');
  if (await pw.count() >= 1) await pw.nth(0).fill('Password123!');
  if (await pw.count() >= 2) await pw.nth(1).fill('Password123!');

  const continueBtn = page.getByRole('button', { name: /^continue$/i }).first();
  const disabledBefore = (await continueBtn.count()) ? await continueBtn.isDisabled() : null;
  if (await continueBtn.count()) {
    await continueBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(3500);
  }

  const bodyText = await page.textContent('body').catch(() => '');
  const responseLen = await page.locator('input[name="cf-turnstile-response"]').first().inputValue().then((v) => String(v || '').trim().length).catch(() => 0);
  const frameCount = await page.locator('iframe[src*="challenges.cloudflare.com"]').count();

  console.log(JSON.stringify({
    url: page.url(),
    continueDisabledBefore: disabledBefore,
    frameCount,
    cfTurnstileResponseLen: responseLen,
    bodyHasSomethingWrong: /something went wrong/i.test(bodyText || ''),
    errors: out.errors,
    requests: out.requests,
    responses: out.responses,
  }, null, 2));

  await browser.close();
})();
