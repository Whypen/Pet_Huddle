import fs from "node:fs";
import assert from "node:assert/strict";

const root = new URL("./", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");
const readJson = (path) => JSON.parse(read(path));

const walletSource = read("app/src/components/wallet/NativeStripeConnectOnboarding.tsx");
const carerSource = read("app/src/screens/NativeCarerProfileScreen.tsx");
const supabaseSource = read("app/src/lib/supabase.ts");
const linkFunctionSource = read("supabase/functions/create-stripe-connect-link/index.ts");
const refreshFunctionSource = read("supabase/functions/refresh-stripe-account-status/index.ts");
const appJson = readJson("app/app.json").expo;
const appleAssociation = readJson("public/.well-known/apple-app-site-association");
const supabaseUrl = supabaseSource.match(/FALLBACK_SUPABASE_URL = "([^"]+)"/)?.[1];
assert(supabaseUrl, "could not resolve native Supabase URL");

const requiredPaths = [
  "/auth/callback*",
  "/carerprofile/stripe-return*",
  "/carerprofile/stripe-refresh*",
];

const applePaths = appleAssociation.applinks.details.flatMap((detail) =>
  detail.components.map((component) => component["/"]),
);
for (const path of requiredPaths) {
  assert(applePaths.includes(path), `missing apple associated path: ${path}`);
}

const androidPaths = appJson.android.intentFilters.flatMap((filter) =>
  filter.data.map((entry) => entry.pathPrefix),
);
for (const path of ["/auth/callback", "/carerprofile/stripe-return", "/carerprofile/stripe-refresh"]) {
  assert(androidPaths.includes(path), `missing android intent path: ${path}`);
}

assert(appJson.ios.associatedDomains.includes("applinks:huddle.pet"), "missing iOS associated domain");
assert(walletSource.includes("https://huddle.pet/carerprofile/stripe-return"), "native wallet return URL not configured");
assert(walletSource.includes("https://huddle.pet/carerprofile/stripe-refresh"), "native wallet refresh URL not configured");
assert(walletSource.includes("Linking.openURL(data.url)"), "native wallet does not open Stripe link");
assert(walletSource.includes('Linking.addEventListener("url"'), "native wallet does not listen for return links");
assert(walletSource.includes("AppState.addEventListener"), "native wallet does not refresh on app resume");
assert(walletSource.includes("refresh-stripe-account-status"), "native wallet does not refresh Stripe account status");
assert(carerSource.includes("accessToken={effectiveAccessToken}"), "carer profile does not pass user token to wallet");
assert(linkFunctionSource.includes("returnUrl and refreshUrl required"), "connect link function does not require return URLs");
assert(linkFunctionSource.includes('type: "account_onboarding"'), "connect link function does not create onboarding links");
assert(refreshFunctionSource.includes("stripe.accounts.retrieve"), "refresh function does not retrieve Stripe account");

const endpoints = [
  "https://huddle.pet/.well-known/apple-app-site-association",
  "https://huddle.pet/carerprofile/stripe-return",
  `${supabaseUrl}/functions/v1/create-stripe-connect-link`,
  `${supabaseUrl}/functions/v1/refresh-stripe-account-status`,
];

for (const endpoint of endpoints) {
  const response = await fetch(endpoint, { method: endpoint.includes("/functions/") ? "OPTIONS" : "GET" });
  assert(response.ok, `endpoint failed smoke check: ${endpoint} ${response.status}`);
}

for (const functionName of ["create-stripe-connect-link", "refresh-stripe-account-status"]) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 401, `${functionName} should reject unauthenticated wallet calls`);
}

const smokeToken = String(process.env.HUDDLE_STRIPE_WALLET_SMOKE_TOKEN || "").trim();
if (smokeToken) {
  const authHeaders = {
    "Content-Type": "application/json",
    "x-huddle-access-token": smokeToken,
  };

  const linkResponse = await fetch(`${supabaseUrl}/functions/v1/create-stripe-connect-link`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      action: "create_link",
      returnUrl: "https://huddle.pet/carerprofile/stripe-return",
      refreshUrl: "https://huddle.pet/carerprofile/stripe-refresh",
    }),
  });
  const linkBody = await linkResponse.json().catch(() => ({}));
  assert(linkResponse.ok, `authenticated connect link failed: ${linkResponse.status} ${linkBody.code || linkBody.error || ""}`);
  assert.equal(typeof linkBody.url, "string", "authenticated connect link did not return a URL");
  assert(linkBody.url.startsWith("https://connect.stripe.com/"), "connect link URL is not a Stripe Connect URL");

  const refreshResponse = await fetch(`${supabaseUrl}/functions/v1/refresh-stripe-account-status`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({}),
  });
  const refreshBody = await refreshResponse.json().catch(() => ({}));
  assert(refreshResponse.ok, `authenticated wallet refresh failed: ${refreshResponse.status} ${refreshBody.code || refreshBody.error || ""}`);
  assert(["pending", "needs_action", "complete"].includes(String(refreshBody.status || "")), "wallet refresh returned an unexpected status");
}

console.log("stripe wallet smoke checks passed");
