const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const routes = [
    '/auth?turnstile_diag=1',
    '/signup/credentials?turnstile_diag=1',
    '/reset-password?turnstile_diag=1',
  ];
  const results = [];

  for (const route of routes) {
    const responses = [];
    page.removeAllListeners('response');
    page.on('response', async (response) => {
      const url = response.url();
      if (!url.includes('/functions/v1/auth-login') && !url.includes('/functions/v1/auth-reset-password') && !url.includes('/functions/v1/send-pre-signup-verify')) return;
      let body = '';
      try { body = await response.text(); } catch {}
      responses.push({ url, status: response.status(), body });
    });

    await page.goto(`https://huddle.pet${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);

    const diagnostics = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('div')).filter((el) => {
        const text = (el.textContent || '').trim();
        return text.includes('widget rendered') && text.includes('token length');
      });
      const panel = rows[0];
      return panel ? panel.textContent || '' : '';
    });

    let tokenLength = 0;
    let action = route.split('?')[0];
    let postSuccess = false;

    if (route.startsWith('/auth')) {
      await page.locator('input[name="email"]').first().fill('turnstile-auth-test@example.com');
      await page.locator('input[name="password"]').first().fill('password123');
      await page.waitForTimeout(1500);
      tokenLength = await page.evaluate(() => {
        const t = document.querySelector('input[name="cf-turnstile-response"]');
        return t && typeof t.value === 'string' ? t.value.length : 0;
      });
      const submit = page.getByRole('button', { name: /^sign in$/i }).first();
      if (!(await submit.isDisabled())) {
        await submit.click();
        await page.waitForTimeout(2500);
      }
    } else if (route.startsWith('/signup/credentials')) {
      await page.locator('input[type="email"]').first().fill('turnstile-signup-test@example.com');
      const phone = page.locator('input[type="tel"]').first();
      if (await phone.count()) await phone.fill('+85297711650');
      const pw = page.locator('input[type="password"]').first();
      if (await pw.count()) await pw.fill('password123');
      const cpw = page.locator('input[type="password"]').nth(1);
      if (await cpw.count()) await cpw.fill('password123');
      await page.waitForTimeout(1500);
      tokenLength = await page.evaluate(() => {
        const t = document.querySelector('input[name="cf-turnstile-response"]');
        return t && typeof t.value === 'string' ? t.value.length : 0;
      });
      const submit = page.getByRole('button', { name: /continue/i }).first();
      if (!(await submit.isDisabled())) {
        await submit.click();
        await page.waitForTimeout(3000);
      }
    } else {
      await page.locator('input[type="email"]').first().fill('turnstile-reset-test@example.com');
      await page.waitForTimeout(1500);
      tokenLength = await page.evaluate(() => {
        const t = document.querySelector('input[name="cf-turnstile-response"]');
        return t && typeof t.value === 'string' ? t.value.length : 0;
      });
      const submit = page.getByRole('button', { name: /send reset link/i }).first();
      if (!(await submit.isDisabled())) {
        await submit.click();
        await page.waitForTimeout(2500);
      }
    }

    postSuccess = responses.some((r) => r.status >= 200 && r.status < 300);
    results.push({ route, diagnostics, tokenLength, postSuccess, responses });
  }

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
