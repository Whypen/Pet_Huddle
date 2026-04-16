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
    return "There's something wrong with your verification. Please try again later.";
  }

  if (
    normalizedMessage.includes("load failed") ||
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("networkerror") ||
    normalizedMessage.includes("network_error") ||
    normalizedMessage.includes("fetch")
  ) {
    return "Verification is temporarily unavailable. Please try again later.";
  }

  if (normalizedMessage === "complete human verification first.") {
    return "Please complete verification first.";
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
    normalizedCode.includes("human_verification_failed") ||
    detailsContainVerificationFailure(details)
  );
}
