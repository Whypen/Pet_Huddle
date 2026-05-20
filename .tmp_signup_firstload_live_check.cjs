const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({ viewport: { width: 430, height: 1100 } });
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  page.on('console', msg => consoleMessages.push(msg.text()));
  page.on('pageerror', err => pageErrors.push(String(err)));

  const url = 'https://huddle.pet/signup/credentials?turnstile_diag=1';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {});

  async function readDiag() {
    return page.evaluate(() => {
      const text = document.body.innerText || '';
      const read = (label) => {
        const lines = text.split('\n');
        const idx = lines.findIndex((line) => line.trim().toLowerCase() === label.toLowerCase());
        if (idx >= 0 && lines[idx + 1]) return lines[idx + 1].trim();
        const prefixed = lines.find((line) => line.toLowerCase().startsWith(label.toLowerCase()));
        if (!prefixed) return null;
        return prefixed.slice(label.length).replace(/^\s*:?\s*/, '').trim() || null;
      };
      return {
        widgetRendered: read('Widget rendered'),
        callbackFired: read('Callback fired'),
        errorCallbackFired: read('Error callback fired'),
        expiredCallbackFired: read('Expired callback fired'),
        tokenLength: read('Token length'),
        widgetId: read('Widget id'),
        renderCount: read('Render count'),
        resetCount: read('Reset count'),
        removeCount: read('Remove count')
      };
    });
  }

  let diag = await readDiag();
  const start = Date.now();
  while ((!diag || !diag.tokenLength || diag.tokenLength === '0') && (Date.now() - start) < 90000) {
    await page.waitForTimeout(1500);
    diag = await readDiag();
  }

  const email = `codex.signup.${Date.now()}@example.com`;
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="tel"]').first().fill('+852 9777 1650');
  const passwordInputs = page.locator('input[type="password"]');
  await passwordInputs.nth(0).fill('Huddle123!');
  await passwordInputs.nth(1).fill('Huddle123!');

  const continueButton = page.getByRole('button', { name: 'Continue' });
  const continueDisabledBefore = await continueButton.isDisabled();
  if (!continueDisabledBefore) {
    await continueButton.click();
  }

  await page.waitForTimeout(5000);
  const afterUrl = page.url();
  const finalDiag = await readDiag();

  console.log(JSON.stringify({
    diagBeforeSubmit: diag,
    diagAfterSubmit: finalDiag,
    continueDisabledBefore,
    afterUrl,
    navigatedToVerifyEmail: afterUrl.includes('/signup/verify-email'),
    console600010: consoleMessages.filter((line) => line.includes('600010')).length,
    unableToLoadTurnstile: consoleMessages.filter((line) => /unable to load turnstile/i.test(line)).length,
    relevantConsole: consoleMessages.filter((line) => /600010|unable to load turnstile|turnstile/i.test(line)).slice(-20),
    pageErrors
  }, null, 2));

  await browser.close();
})();
