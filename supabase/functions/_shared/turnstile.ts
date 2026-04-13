export type TurnstileSiteverifyResponse = {
  success?: boolean;
  "error-codes"?: string[];
  action?: string;
  hostname?: string;
  challenge_ts?: string;
};

export type TurnstileValidationResult = {
  valid: boolean;
  reason:
    | "ok"
    | "missing_secret"
    | "missing_token"
    | "siteverify_unreachable"
    | "invalid_token"
    | "action_mismatch"
    | "hostname_mismatch";
  error_codes: string[];
  action: string | null;
  hostname: string | null;
  challenge_ts: string | null;
};

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.+$/, "");
}

export function getExpectedTurnstileHostnames(): string[] {
  const values = [
    Deno.env.get("TURNSTILE_EXPECTED_HOSTNAME") || "",
    Deno.env.get("TURNSTILE_EXPECTED_HOSTNAME_ALT") || "",
    "huddle.pet",
    "www.huddle.pet",
    "api.huddle.pet",
  ]
    .map(normalizeHost)
    .filter(Boolean);
  return Array.from(new Set(values));
}

export function evaluateTurnstileResult(
  payload: TurnstileSiteverifyResponse,
  expectedAction: string,
  expectedHostnames: string[],
): TurnstileValidationResult {
  const action = String(payload.action || "").trim() || null;
  const hostname = normalizeHost(String(payload.hostname || ""));
  const errorCodes = Array.isArray(payload["error-codes"]) ? payload["error-codes"].map(String) : [];
  const challengeTs = String(payload.challenge_ts || "").trim() || null;

  if (payload.success !== true) {
    return {
      valid: false,
      reason: "invalid_token",
      error_codes: errorCodes,
      action,
      hostname: hostname || null,
      challenge_ts: challengeTs,
    };
  }

  if (action !== expectedAction) {
    return {
      valid: false,
      reason: "action_mismatch",
      error_codes: errorCodes,
      action,
      hostname: hostname || null,
      challenge_ts: challengeTs,
    };
  }

  if (!hostname || !expectedHostnames.includes(hostname)) {
    return {
      valid: false,
      reason: "hostname_mismatch",
      error_codes: errorCodes,
      action,
      hostname: hostname || null,
      challenge_ts: challengeTs,
    };
  }

  return {
    valid: true,
    reason: "ok",
    error_codes: errorCodes,
    action,
    hostname,
    challenge_ts: challengeTs,
  };
}

export async function validateTurnstile(
  token: string | null | undefined,
  remoteip: string,
  expectedAction: string,
  expectedHostnames: string[],
): Promise<TurnstileValidationResult> {
  const secret = String(Deno.env.get("TURNSTILE_SECRET_KEY") || "").trim();
  if (!secret) {
    return {
      valid: false,
      reason: "missing_secret",
      error_codes: [],
      action: null,
      hostname: null,
      challenge_ts: null,
    };
  }

  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    return {
      valid: false,
      reason: "missing_token",
      error_codes: [],
      action: null,
      hostname: null,
      challenge_ts: null,
    };
  }

  try {
    const body = new URLSearchParams({
      secret,
      response: normalizedToken,
      remoteip,
    });
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload = (await response.json()) as TurnstileSiteverifyResponse;
    return evaluateTurnstileResult(payload, expectedAction, expectedHostnames);
  } catch {
    return {
      valid: false,
      reason: "siteverify_unreachable",
      error_codes: [],
      action: null,
      hostname: null,
      challenge_ts: null,
    };
  }
}
