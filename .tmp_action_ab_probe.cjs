const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const routes = [
    '/turnstile-health',
    '/turnstile-health-resetaction',
    '/reset-password-inline',
    '/reset-password-inline-healthaction',
  ];
  const results = [];

  for (const route of routes) {
    const responses = [];
    page.removeAllListeners('response');
    page.on('response', async (response) => {
      const url = response.url();
      if (!url.includes('/functions/v1/auth-reset-password')) return;
      let body = '';
      try { body = await response.text(); } catch {}
      responses.push({ status: response.status(), body });
    });

    await page.goto(`https://huddle.pet${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4500);

    const base = await page.evaluate(() => {
      const tokenField = document.querySelector('input[name="cf-turnstile-response"]');
      return {
        tokenLength: tokenField && typeof tokenField.value === 'string' ? tokenField.value.length : 0,
        hiddenFieldPresent: !!tokenField,
      };
    });

    let callbackFired = null;
    if (route === '/turnstile-health') {
      callbackFired = await page.evaluate(() => window.__huddleTurnstileHealth?.callbackFired ?? null);
    } else if (route === '/turnstile-health-resetaction') {
      callbackFired = await page.evaluate(() => window.__huddleTurnstileHealthResetAction?.callbackFired ?? null);
    } else {
      const emailInput = page.locator('input[type="email"]').first();
      if (await emailInput.count()) {
        await emailInput.fill('turnstile-reset-test@example.com');
      }
      await page.waitForTimeout(1500);
      const submit = page.getByRole('button', { name: /send reset link/i });
      const disabled = await submit.isDisabled();
      callbackFired = !disabled;
      if (!disabled) {
        await submit.click();
        await page.waitForTimeout(2500);
      }
      base.tokenLength = await page.evaluate(() => {
        const tokenField = document.querySelector('input[name="cf-turnstile-response"]');
        return tokenField && typeof tokenField.value === 'string' ? tokenField.value.length : 0;
      });
    }

    results.push({
      route,
      tokenLength: base.tokenLength,
      callbackFired,
      postSuccess: responses.some((r) => r.status >= 200 && r.status < 300),
      responses,
    });
  }

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
