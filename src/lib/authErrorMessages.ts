type ErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: unknown;
};

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

function detailsContainVerificationFailure(details: unknown): boolean {
  if (!details || typeof details !== "object") return false;
  const record = details as Record<string, unknown>;
  return [
    normalize(record.error),
    normalize(record.message),
    normalize(record.code),
    normalize(record.turnstile_reason),
  ].some((value) => value.includes("verification") || value.includes("turnstile") || value.includes("invalid_token"));
}

export function mapAuthFailureMessage(error: ErrorLike | string | null | undefined): string {
  const rawMessage = typeof error === "string" ? error : String(error?.message || "");
  const rawCode = typeof error === "string" ? "" : String(error?.code || "");
  const details = typeof error === "string" ? null : error?.details;
  const normalizedMessage = normalize(rawMessage);
  const normalizedCode = normalize(rawCode);

  if (!normalizedMessage && !normalizedCode) {
    return "Verification is temporarily unavailable. Please try again later.";
  }

  if (
    normalizedMessage.includes("human_verification_failed") ||
    normalizedMessage.includes("turnstile") ||
    normalizedCode.includes("human_verification_failed") ||
    detailsContainVerificationFailure(details)
  ) {
    return "Verification is temporarily unavailable. Please try again later.";
  }

  if (
    normalizedMessage.includes("load failed") ||
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("networkerror") ||
    normalizedMessage.includes("network_error") ||
    normalizedMessage.includes("timeout") ||
    normalizedMessage.includes("fetch")
  ) {
    return "Sign in is taking too long. Please try again.";
  }

  if (normalizedMessage === "complete human verification first.") {
    return "Please complete verification first.";
  }

  if (normalizedMessage.includes("reset_password_failed") || normalizedCode.includes("reset_password_failed")) {
    return "We couldn't send that reset email just now. Please try again in a moment.";
  }

  if (normalizedMessage.includes("password_min_8_chars") || normalizedCode.includes("password_min_8_chars")) {
    return "Password must be at least 8 characters.";
  }
  if (normalizedMessage.includes("password_missing_uppercase") || normalizedCode.includes("password_missing_uppercase")) {
    return "Password must include an uppercase letter.";
  }
  if (normalizedMessage.includes("password_missing_number") || normalizedCode.includes("password_missing_number")) {
    return "Password must include a number.";
  }
  if (normalizedMessage.includes("password_missing_special") || normalizedCode.includes("password_missing_special")) {
    return "Password must include a special character.";
  }
  if (normalizedMessage.includes("password_found_in_breach") || normalizedCode.includes("password_found_in_breach")) {
    return "This password has appeared in a data breach. Choose a different one.";
  }
  if (normalizedMessage.includes("password_breach_check_unavailable") || normalizedCode.includes("password_breach_check_unavailable")) {
    return "We couldn't check this password against known breaches. Please try again.";
  }

  return rawMessage || "Couldn't sign you in.";
}

export function shouldResetTurnstileForAuthError(error: ErrorLike | string | null | undefined): boolean {
  const rawMessage = typeof error === "string" ? error : String(error?.message || "");
  const normalizedMessage = normalize(rawMessage);
  const normalizedCode = normalize(typeof error === "string" ? "" : error?.code);
  const details = typeof error === "string" ? null : error?.details;

  return (
    normalizedMessage.includes("human_verification_failed") ||
    normalizedMessage.includes("turnstile") ||
    normalizedMessage.includes("load failed") ||
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("networkerror") ||
    normalizedMessage.includes("network_error") ||
    normalizedMessage.includes("timeout") ||
    normalizedCode.includes("human_verification_failed") ||
    detailsContainVerificationFailure(details)
  );
}
