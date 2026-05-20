const { chromium } = require('playwright');

const siteKey = '0x4AAAAAACzF2iMqVjoiYHny';

async function mintToken(action) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto('https://huddle.pet/auth', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    const token = await page.evaluate(async ({ siteKey, action }) => {
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
      return await new Promise((resolve, reject) => {
        const mount = document.createElement('div');
        mount.style.position = 'fixed';
        mount.style.top = '24px';
        mount.style.left = '24px';
        mount.style.zIndex = '2147483647';
        mount.style.background = '#fff';
        mount.style.padding = '8px';
        document.body.appendChild(mount);
        const timeout = setTimeout(() => reject(new Error('token_timeout')), 45000);
        window.turnstile.render(mount, {
          sitekey: siteKey,
          action,
          theme: 'light',
          callback: (token) => {
            clearTimeout(timeout);
            resolve(token);
          },
          'error-callback': () => {
            clearTimeout(timeout);
            reject(new Error('turnstile_error'));
          },
          'expired-callback': () => {
            clearTimeout(timeout);
            reject(new Error('turnstile_expired'));
          },
        });
      });
    }, { siteKey, action });
    console.log(JSON.stringify({ ok: true, action, tokenLength: String(token).length, token }));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, action, error: String(error && error.message || error) }));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

mintToken(process.argv[2] || 'send_pre_signup_verify');
