import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto("https://huddle.pet/signup/name", { waitUntil: "networkidle" });
const result = await page.evaluate(() => ({
  path: location.pathname,
  hasTurnstileWidget: !!document.querySelector('[data-testid="signup-name-turnstile-hidden"], iframe[src*="challenges.cloudflare.com"], input[name="cf-turnstile-response"]'),
  body: document.body.innerText,
}));
console.log(JSON.stringify(result, null, 2));
await browser.close();
