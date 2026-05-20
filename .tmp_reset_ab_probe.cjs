const { chromium } = require('playwright');

const routes = ['/reset-password', '/reset-password-direct', '/reset-password-inline'];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
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
    await page.waitForTimeout(4000);

    const tokenLengthBefore = await page.evaluate(() => {
      const input = document.querySelector('input[name="cf-turnstile-response"]');
      return input && typeof input.value === 'string' ? input.value.length : 0;
    });

    const buttonStateBefore = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const submit = buttons.find((button) => /send reset link/i.test((button.textContent || '').trim()));
      return submit ? { disabled: !!submit.disabled, text: (submit.textContent || '').trim() } : null;
    });

    const emailInput = page.locator('input[type="email"]').first();
    if (await emailInput.count()) {
      await emailInput.fill('turnstile-reset-test@example.com');
    }
    await page.waitForTimeout(1000);

    const tokenLengthAfterFill = await page.evaluate(() => {
      const input = document.querySelector('input[name="cf-turnstile-response"]');
      return input && typeof input.value === 'string' ? input.value.length : 0;
    });

    const button = page.getByRole('button', { name: /send reset link/i });
    if (await button.count()) {
      const disabled = await button.isDisabled();
      if (!disabled) {
        await button.click();
        await page.waitForTimeout(2500);
      }
    }

    const buttonStateAfter = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const submit = buttons.find((button) => /send reset link/i.test((button.textContent || '').trim()));
      return submit ? { disabled: !!submit.disabled, text: (submit.textContent || '').trim() } : null;
    });

    const tokenLengthAfterClick = await page.evaluate(() => {
      const input = document.querySelector('input[name="cf-turnstile-response"]');
      return input && typeof input.value === 'string' ? input.value.length : 0;
    });

    results.push({
      route,
      tokenLengthBefore,
      tokenLengthAfterFill,
      tokenLengthAfterClick,
      buttonStateBefore,
      buttonStateAfter,
      postSuccess: responses.some((r) => r.status >= 200 && r.status < 300),
      responses,
    });
  }

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
