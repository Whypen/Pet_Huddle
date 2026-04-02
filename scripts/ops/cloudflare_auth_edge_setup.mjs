#!/usr/bin/env node

const CF_API_BASE = "https://api.cloudflare.com/client/v4";
const TAG = "[huddle-auth-edge]";

const required = (name) => {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
};

const apiToken = required("CF_API_TOKEN");
const zoneId = required("CF_ZONE_ID");
const apiHost = String(process.env.CF_API_HOST || "api.huddle.pet").trim().toLowerCase();
const supabaseOrigin = String(
  process.env.SUPABASE_FUNCTIONS_ORIGIN || "https://ztrbourwcnhrpmzwlrcn.supabase.co",
).trim();

const originHost = (() => {
  try {
    return new URL(supabaseOrigin).host;
  } catch {
    throw new Error("SUPABASE_FUNCTIONS_ORIGIN must be a full URL, e.g. https://<project>.supabase.co");
  }
})();

const call = async (method, path, body) => {
  const res = await fetch(`${CF_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.success === false) {
    const msg = JSON.stringify(payload?.errors || payload || {}, null, 2);
    throw new Error(`Cloudflare API ${method} ${path} failed (${res.status}): ${msg}`);
  }
  return payload;
};

const protectedPaths = [
  "/functions/v1/send-phone-otp",
  "/functions/v1/send-pre-signup-verify",
  "/functions/v1/auth-login",
  "/functions/v1/auth-signup",
  "/functions/v1/auth-reset-password",
  "/functions/v1/auth-change-password",
];

const ensureDnsRecord = async () => {
  const search = await call("GET", `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(apiHost)}`);
  const existing = search?.result?.[0] ?? null;
  const payload = {
    type: "CNAME",
    name: apiHost,
    content: originHost,
    proxied: true,
    ttl: 1,
  };

  if (existing) {
    await call("PUT", `/zones/${zoneId}/dns_records/${existing.id}`, payload);
    return { action: "updated", id: existing.id, content: originHost };
  }
  const created = await call("POST", `/zones/${zoneId}/dns_records`, payload);
  return { action: "created", id: created?.result?.id ?? null, content: originHost };
};

const ensureRateLimitRules = async () => {
  const entry = await call("GET", `/zones/${zoneId}/rulesets/phases/http_ratelimit/entrypoint`);
  const entryId = entry?.result?.id;
  if (!entryId) throw new Error("Unable to resolve http_ratelimit entrypoint ruleset id");

  const existingRules = Array.isArray(entry?.result?.rules) ? entry.result.rules : [];
  const keepRules = existingRules.filter((rule) => !String(rule?.description || "").startsWith(TAG));

  // Some plans allow only one rule in http_ratelimit. Combine all protected
  // auth/OTP routes into one expression to stay within plan limits.
  const combinedExpression = `(http.host eq "${apiHost}" and http.request.uri.path in {${protectedPaths.map((p) => `"${p}"`).join(" ")}})`;
  const managedRules = [{
    action: "block",
    description: `${TAG} protected-auth-otp`,
    enabled: true,
    expression: combinedExpression,
    ratelimit: {
      characteristics: ["cf.colo.id", "ip.src"],
      period: 10,
      requests_per_period: 60,
      mitigation_timeout: 10,
    },
  }];

  const updated = await call("PUT", `/zones/${zoneId}/rulesets/${entryId}`, {
    description: entry?.result?.description || "Zone-level rate limiting rules",
    kind: entry?.result?.kind || "zone",
    name: entry?.result?.name || "Zone-level rate limiting rules",
    phase: "http_ratelimit",
    rules: [...keepRules, ...managedRules],
  });

  return {
    entrypoint_ruleset_id: entryId,
    managed_rules: managedRules.map((r) => ({ description: r.description, expression: r.expression })),
    total_rules: updated?.result?.rules?.length ?? null,
  };
};

const main = async () => {
  const dns = await ensureDnsRecord();
  const ratelimit = await ensureRateLimitRules();
  const output = {
    ok: true,
    api_host: apiHost,
    origin_host: originHost,
    dns,
    ratelimit,
  };
  console.log(JSON.stringify(output, null, 2));
};

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
});
