const { chromium } = require('playwright');
(async () => {
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-blink-features=AutomationControlled'] });
  } catch (err) {
    console.error('LAUNCH_FAIL', err.message);
    process.exit(2);
  }
  const page = await browser.newPage();
  await page.goto('https://huddle.pet/turnstile-health', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(12000);
  const text = await page.locator('body').innerText();
  console.log(text);
  await browser.close();
})();
