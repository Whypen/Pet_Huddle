const { chromium } = require('playwright');
const siteKey = '0x4AAAAAACzF2iMqVjoiYHny';
(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto('https://huddle.pet/auth', { waitUntil: 'networkidle', timeout: 60000 });
    await page.evaluate(async ({ siteKey }) => {
      function loadScript() {
        return new Promise((resolve, reject) => {
          if (window.turnstile) return resolve();
          const script = document.createElement('script');
          script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
          script.async = true;
          script.defer = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('script_load_failed'));
          document.head.appendChild(script);
        });
      }
      await loadScript();
      const mount = document.createElement('div');
      mount.id = 'turnstile-mount';
      mount.style.position = 'fixed';
      mount.style.top = '24px';
      mount.style.left = '24px';
      mount.style.zIndex = '2147483647';
      mount.style.background = '#fff';
      mount.style.padding = '8px';
      document.body.appendChild(mount);
      window.__tsToken = null;
      window.turnstile.render(mount, {
        sitekey: siteKey,
        action: 'send_pre_signup_verify',
        theme: 'light',
        callback: (token) => { window.__tsToken = token; },
      });
    }, { siteKey });
    await page.waitForTimeout(3000);
    for (const frame of page.frames()) {
      try {
        const checkbox = frame.locator('input[type="checkbox"], #success[role="checkbox"], [role="checkbox"]');
        if (await checkbox.count()) {
          await checkbox.first().click({ timeout: 5000 });
          break;
        }
      } catch {}
    }
    await page.waitForTimeout(10000);
    const token = await page.evaluate(() => window.__tsToken || null);
    console.log(JSON.stringify({ ok: Boolean(token), tokenLength: token ? token.length : 0 }));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error && error.message || error) }));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
