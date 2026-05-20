import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  evaluateTurnstileResult,
  getExpectedTurnstileHostnames,
  validateTurnstile,
} from "../_shared/turnstile.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expectedHostnames = getExpectedTurnstileHostnames();
  const secretPresent = Boolean(String(Deno.env.get("TURNSTILE_SECRET_KEY") || "").trim());
  const siteverifyProbe = await validateTurnstile("__healthcheck_invalid__", "127.0.0.1", "health_probe", expectedHostnames);

  const actionMismatch = evaluateTurnstileResult(
    {
      success: true,
      action: "wrong_action",
      hostname: expectedHostnames[0] || "huddle.pet",
      challenge_ts: new Date().toISOString(),
      "error-codes": [],
    },
    "expected_action",
    expectedHostnames,
  );

  const hostnameMismatch = evaluateTurnstileResult(
    {
      success: true,
      action: "expected_action",
      hostname: "evil.example",
      challenge_ts: new Date().toISOString(),
      "error-codes": [],
    },
    "expected_action",
    expectedHostnames,
  );

  return json({
    ok: true,
    config: {
      secret_present: secretPresent,
      expected_hostnames: expectedHostnames,
    },
    probe: {
      siteverify_reachable: siteverifyProbe.reason !== "siteverify_unreachable",
      invalid_token_rejected: siteverifyProbe.reason === "invalid_token",
      probe_reason: siteverifyProbe.reason,
    },
    simulated: {
      action_mismatch_rejected: actionMismatch.reason === "action_mismatch",
      hostname_mismatch_rejected: hostnameMismatch.reason === "hostname_mismatch",
    },
  });
});
