const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  const events = [];

  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('challenges.cloudflare.com') || u.includes('/functions/v1/')) events.push({ t: 'req', m: r.method(), u });
  });
  page.on('response', async (r) => {
    const u = r.url();
    if (u.includes('challenges.cloudflare.com') || u.includes('/functions/v1/')) {
      let b = '';
      try { b = (await r.text()).slice(0, 160); } catch {}
      events.push({ t: 'res', s: r.status(), u, b });
    }
  });

  await page.addInitScript(() => {
    window.__ts = { hooked: 0, renders: 0, callback: 0, error: 0, expired: 0, lastTokenLen: 0, actions: [] };
    const patch = (obj) => {
      if (!obj || obj.__patched_turnstile) return obj;
      const originalRender = typeof obj.render === 'function' ? obj.render.bind(obj) : null;
      if (originalRender) {
        obj.render = (container, opts = {}) => {
          window.__ts.renders += 1;
          window.__ts.actions.push(opts.action || null);
          const next = { ...opts };
          const cb = opts.callback;
          const ecb = opts['error-callback'];
          const xcb = opts['expired-callback'];
          next.callback = (token) => {
            window.__ts.callback += 1;
            window.__ts.lastTokenLen = String(token || '').length;
            if (typeof cb === 'function') cb(token);
          };
          next['error-callback'] = () => {
            window.__ts.error += 1;
            if (typeof ecb === 'function') ecb();
          };
          next['expired-callback'] = () => {
            window.__ts.expired += 1;
            if (typeof xcb === 'function') xcb();
          };
          return originalRender(container, next);
        };
      }
      obj.__patched_turnstile = true;
      window.__ts.hooked += 1;
      return obj;
    };

    let internalTurnstile;
    Object.defineProperty(window, 'turnstile', {
      configurable: true,
      get() { return internalTurnstile; },
      set(v) { internalTurnstile = patch(v); }
    });

    const poll = setInterval(() => {
      if (window.turnstile) {
        internalTurnstile = patch(window.turnstile);
        clearInterval(poll);
      }
    }, 50);
    setTimeout(() => clearInterval(poll), 30000);
  });

  await page.goto('https://huddle.pet/auth', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: 'Continue with Email' }).click().catch(() => {});
  await page.waitForTimeout(1400);
  await page.getByRole('button', { name: /^Sign in$/i }).click().catch(() => {});
  await page.waitForTimeout(15000);

  const state = await page.evaluate(() => {
    const f = document.querySelector('input[name="cf-turnstile-response"],textarea[name="cf-turnstile-response"]');
    return {
      ts: window.__ts,
      hasTurnstileObj: Boolean(window.turnstile),
      iframeCount: document.querySelectorAll('iframe[src*="challenges.cloudflare.com"]').length,
      fieldPresent: Boolean(f),
      tokenLen: String(f?.value || f?.textContent || '').trim().length,
    };
  });

  console.log(JSON.stringify({ state, events: events.slice(-80) }, null, 2));
  await browser.close();
})();
