const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = [];
  const push = (type, data) => logs.push({ ts: new Date().toISOString(), type, ...data });

  page.on('request', (req) => {
    const url = req.url();
    if (
      url.includes('api.huddle.pet/functions/v1') ||
      url.includes('ztrbourwcnhrpmzwlrcn.supabase.co/functions/v1') ||
      url.includes('challenges.cloudflare.com')
    ) {
      push('request', { method: req.method(), url });
    }
  });

  page.on('response', async (res) => {
    const url = res.url();
    if (
      url.includes('api.huddle.pet/functions/v1') ||
      url.includes('ztrbourwcnhrpmzwlrcn.supabase.co/functions/v1') ||
      url.includes('challenges.cloudflare.com')
    ) {
      let body = '';
      try {
        body = (await res.text()).slice(0, 400);
      } catch {}
      push('response', { url, status: res.status(), body });
    }
  });

  await page.goto('https://huddle.pet/auth', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  await page.fill('input[type="email"]', 'qa+huddle@example.com').catch(() => {});
  await page.fill('input[type="password"]', 'not-a-real-password').catch(() => {});

  const widgetInfoBefore = await page.evaluate(() => {
    const el = document.querySelector('input[name="cf-turnstile-response"], textarea[name="cf-turnstile-response"]');
    return {
      hasField: Boolean(el),
      tokenLen: String(el?.value || el?.textContent || '').trim().length,
      iframeCount: document.querySelectorAll('iframe[src*="challenges.cloudflare.com"]').length,
      hasTurnstileObject: Boolean(window.turnstile),
    };
  });

  const submitBtn = page.getByRole('button', { name: /^sign in$/i }).first();
  const disabled = await submitBtn.isDisabled().catch(() => null);
  if (disabled === false) {
    await submitBtn.click().catch(() => {});
    await page.waitForTimeout(3000);
  }

  const widgetInfoAfter = await page.evaluate(() => {
    const el = document.querySelector('input[name="cf-turnstile-response"], textarea[name="cf-turnstile-response"]');
    return {
      hasField: Boolean(el),
      tokenLen: String(el?.value || el?.textContent || '').trim().length,
      iframeCount: document.querySelectorAll('iframe[src*="challenges.cloudflare.com"]').length,
      hasTurnstileObject: Boolean(window.turnstile),
      humanVerificationTextPresent: document.body.innerText.toLowerCase().includes('human verification'),
    };
  });

  const latestWrapperResponse = [...logs]
    .reverse()
    .find((x) => x.type === 'response' && (x.url.includes('/auth-login') || x.url.includes('/auth-signup') || x.url.includes('/auth-reset-password') || x.url.includes('/auth-change-password') || x.url.includes('/send-pre-signup-verify') || x.url.includes('/send-phone-otp')));

  console.log(JSON.stringify({
    url: page.url(),
    disabled,
    widgetInfoBefore,
    widgetInfoAfter,
    latestWrapperResponse: latestWrapperResponse || null,
    logs,
  }, null, 2));

  await browser.close();
})();
