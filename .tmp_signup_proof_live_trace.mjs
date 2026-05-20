import { chromium } from "playwright";

const base = "https://huddle.pet";
const email = `signupproof_${Date.now()}@example.com`;
const phone = "+85297716501";
const password = "Passw0rd!";
const displayName = `Proof${Date.now().toString().slice(-6)}`;
const socialId = `proof${Date.now().toString().slice(-6)}`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const result = {
  email,
  credentials: {},
  verifyEmail: {},
  signupName: {},
  requests: [],
  consoleErrors: [],
};

page.on("console", (msg) => {
  if (msg.type() === "error") result.consoleErrors.push(msg.text());
});
page.on("response", async (response) => {
  const url = response.url();
  if (!url.includes("/functions/v1/")) return;
  const item = { url, status: response.status() };
  try {
    item.body = await response.text();
  } catch {
    item.body = "<unreadable>";
  }
  result.requests.push(item);
});

await page.goto(`${base}/signup/credentials?turnstile_diag=1`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', email);
await page.fill('input[name="phone"]', phone);
await page.fill('input[name="password"]', password);
await page.fill('input[name="confirmPassword"]', password);

await page.waitForFunction(() => {
  const body = document.body.innerText;
  const m = body.match(/Token length\s*(\d+)/i);
  return m && Number(m[1]) > 0;
}, { timeout: 60000 });

result.credentials = await page.evaluate(() => {
  const text = document.body.innerText;
  const tokenMatch = text.match(/Token length\s*(\d+)/i);
  const callbackMatch = text.match(/Callback fired\s*(yes|no)/i);
  const renderedMatch = text.match(/Widget rendered\s*(yes|no)/i);
  const disabled = !!document.querySelector('button[type="submit"]:disabled');
  return {
    rendered: renderedMatch?.[1] ?? null,
    callback: callbackMatch?.[1] ?? null,
    tokenLength: tokenMatch ? Number(tokenMatch[1]) : 0,
    disabled,
    path: location.pathname,
  };
});

await page.click('button[type="submit"]');
await page.waitForURL('**/signup/verify-email', { timeout: 30000 });

result.verifyEmail.beforeVerify = await page.evaluate(() => ({
  path: location.pathname,
  presignupToken: sessionStorage.getItem('huddle_presignup_token'),
  signupProofLength: String(sessionStorage.getItem('huddle_signup_proof_v1') || '').length,
  body: document.body.innerText,
}));

const presignupToken = result.verifyEmail.beforeVerify.presignupToken;
if (!presignupToken) throw new Error("missing presignup token");

await page.goto(`${base}/verify?token=${encodeURIComponent(presignupToken)}`, { waitUntil: "networkidle" });
await page.waitForURL('**/signup/name', { timeout: 30000 });

result.signupName.beforeSubmit = await page.evaluate(() => ({
  path: location.pathname,
  signupProofLength: String(sessionStorage.getItem('huddle_signup_proof_v1') || '').length,
  hasTurnstileWidget: !!document.querySelector('[data-testid="signup-name-turnstile-hidden"], iframe[src*="challenges.cloudflare.com"], input[name="cf-turnstile-response"]'),
  body: document.body.innerText,
}));

await page.fill('input[name="display_name"]', displayName);
await page.fill('input[name="social_id"]', socialId);
await page.click('button[type="submit"]');
await page.waitForLoadState("networkidle");
await page.waitForTimeout(5000);

result.signupName.afterSubmit = await page.evaluate(() => ({
  path: location.pathname,
  signupProofLength: String(sessionStorage.getItem('huddle_signup_proof_v1') || '').length,
  body: document.body.innerText,
}));

console.log(JSON.stringify(result, null, 2));
await browser.close();
