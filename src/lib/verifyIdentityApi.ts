import { supabase } from "@/integrations/supabase/client";
import type { HumanChallenge } from "@/lib/humanVerification";
import { invokeAuthedFunction } from "@/lib/invokeAuthedFunction";

export type BackendVerificationStatus = "unverified" | "pending" | "verified";
export type HumanStatus = "not_started" | "pending" | "passed" | "failed";
export type CardStatus = "not_started" | "pending" | "passed" | "failed";

export type VerifyIdentitySnapshot = {
  verificationStatus: BackendVerificationStatus;
  humanStatus: HumanStatus;
  cardStatus: CardStatus;
  cardVerified: boolean;
  cardBrand: string | null;
  cardLast4: string | null;
  cardLastError: { message?: string | null; code?: string | null } | null;
  setupIntentId: string | null;
  publishableKey: string | null;
  humanAttemptId: string | null;
  humanAttemptCompletedAt: string | null;
  humanChallenge: HumanChallenge | null;
};

export class VerifyIdentityError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const resolveLocalStripeMode = (): "live" | "test" | null => {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  const isPrivateIpv4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
  const isLocal =
    host === "localhost"
    || host.endsWith(".localhost")
    || host.endsWith(".local")
    || host === "127.0.0.1"
    || host === "0.0.0.0"
    || host === "::1"
    || isPrivateIpv4;
  if (!isLocal) return null;
  const override = String(import.meta.env.VITE_STRIPE_LOCAL_MODE || "").trim().toLowerCase();
  if (override === "live") return "live";
  if (override === "test") return "test";
  // Default local behavior stays test to avoid HTTP + live-key issues.
  return "test";
};

function mapError(raw: string | null | undefined): VerifyIdentityError {
  const code = String(raw || "unknown_error").toLowerCase();
  if (code.includes("auth_required") || code.includes("missing_token") || code.includes("auth_user_missing")) {
    return new VerifyIdentityError(code, "Your session expired. Please sign in again.");
  }
  if (code.includes("missing_stripe_publishable_key")) {
    return new VerifyIdentityError(code, "Card verification is not configured yet. Please contact support.");
  }
  if (code.includes("missing_stripe_secret_key")) {
    return new VerifyIdentityError(code, "Card verification is temporarily unavailable.");
  }
  if (code.includes("missing_stripe_test_keys")) {
    return new VerifyIdentityError(code, "Card verification needs Stripe test keys for local HTTP. Please configure STRIPE_TEST_SECRET_KEY and STRIPE_TEST_PUBLISHABLE_KEY.");
  }
  if (code.includes("your request was in test mode")) {
    return new VerifyIdentityError(code, "This card only works in live mode. In local testing, use a Stripe test card.");
  }
  if (code.includes("test mode, but used a non test card")) {
    return new VerifyIdentityError(code, "This card only works in live mode. In local testing, use a Stripe test card.");
  }
  if (code.includes("missing_stripe_keys")) {
    return new VerifyIdentityError(code, "Card verification keys are not configured.");
  }
  if (code.includes("missing_visitor_id")) {
    return new VerifyIdentityError(code, "We couldn't read your device signature. Please refresh and try again.");
  }
  if (code.includes("profile_not_ready")) {
    return new VerifyIdentityError(code, "Finish profile setup first, then continue verification.");
  }
  if (code.includes("challenge_expired")) {
    return new VerifyIdentityError(code, "Your verification challenge expired. Start a new check.");
  }
  if (code.includes("invalid_transition")) {
    return new VerifyIdentityError(code, "Verification session is no longer active. Please start again.");
  }
  if (code.includes("invalid_verification_result")) {
    return new VerifyIdentityError(code, "We couldn't confirm your human check. Please try again with your face centered in the oval.");
  }
  if (code.includes("face_detector_unsupported")) {
    return new VerifyIdentityError(code, "This browser does not support the camera verification check.");
  }
  if (code.includes("attempt_not_found")) {
    return new VerifyIdentityError(code, "Verification session expired. Please start again.");
  }
  if (code.includes("card_setup_timeout") || code.includes("stripe_timeout")) {
    return new VerifyIdentityError(code, "Card setup is taking too long. Please try again.");
  }
  if (code.includes("http_503") || code.includes("service temporarily unavailable") || code.includes("503")) {
    return new VerifyIdentityError(code, "Verification service is temporarily busy. Please retry in a moment.");
  }
  if (code.includes("notallowederror") || code.includes("permission")) {
    return new VerifyIdentityError(code, "Camera access is required for human verification.");
  }
  if (code.includes("unauthorized")) {
    return new VerifyIdentityError(code, "Your session expired. Please sign in again.");
  }
  return new VerifyIdentityError(code, "We couldn't complete verification. Please retry.");
}

const isTransient503 = (error: Error | null) => {
  if (!error) return false;
  const msg = String(error.message || "").toLowerCase();
  return msg.includes("http_503") || msg.includes("service temporarily unavailable");
};

async function invokeWithTransient503Retry<T>(
  fn: string,
  body: Record<string, unknown>,
  retries = 1,
): Promise<{ data: T | null; error: Error | null }> {
  let attempt = 0;
  let latest = await invokeAuthedFunction<T>(fn, { body });
  while (attempt < retries && isTransient503(latest.error)) {
    attempt += 1;
    const backoffMs = 350 * Math.pow(2, attempt) + Math.floor(Math.random() * 120);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    latest = await invokeAuthedFunction<T>(fn, { body });
  }
  return latest;
}

const asStatus = (value: unknown, fallback: BackendVerificationStatus = "unverified"): BackendVerificationStatus => {
  const v = String(value || "").toLowerCase();
  return v === "pending" || v === "verified" || v === "unverified" ? v : fallback;
};

const asHuman = (value: unknown): HumanStatus => {
  const v = String(value || "").toLowerCase();
  return v === "pending" || v === "passed" || v === "failed" || v === "not_started" ? v : "not_started";
};

const asCard = (value: unknown): CardStatus => {
  const v = String(value || "").toLowerCase();
  return v === "pending" || v === "passed" || v === "failed" || v === "not_started" ? v : "not_started";
};

export async function fetchVerifyIdentitySnapshot(): Promise<VerifyIdentitySnapshot> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw mapError("auth_required");

  const stripeMode = resolveLocalStripeMode();
  const [humanRes, cardRes] = await Promise.all([
    invokeWithTransient503Retry("verify-human-challenge", { action: "get" }),
    invokeWithTransient503Retry("create-identity-setup-intent", { action: "status", stripeMode }),
  ]);

  const humanError = humanRes.error ? mapError(humanRes.error.message) : null;
  const cardError = cardRes.error ? mapError(cardRes.error.message) : null;
  if (humanError) throw humanError;

  const humanData = humanRes.data || {};
  let cardData = cardRes.data || {};
  if (cardError) {
    const { data: fallbackProfile, error: fallbackProfileError } = await supabase
      .from("profiles")
      .select("verification_status, card_verification_status, card_verified, card_brand, card_last4, stripe_setup_intent_id")
      .eq("id", session.user.id)
      .maybeSingle();
    if (!fallbackProfileError && fallbackProfile) {
      cardData = {
        verificationStatus: fallbackProfile.verification_status ?? "unverified",
        cardStatus: fallbackProfile.card_verification_status ?? "not_started",
        cardVerified: Boolean(fallbackProfile.card_verified),
        cardBrand: fallbackProfile.card_brand ?? null,
        cardLast4: fallbackProfile.card_last4 ?? null,
        setupIntentId: fallbackProfile.stripe_setup_intent_id ?? null,
        publishableKey: null,
      };
    } else {
      throw cardError;
    }
  }
  const humanAttempt = (humanData?.attempt || null) as
    | { id?: string; completed_at?: string | null; challenge_payload?: HumanChallenge | null }
    | null;

  return {
    verificationStatus: asStatus(humanData.verificationStatus ?? cardData.verificationStatus),
    humanStatus: asHuman(humanData.humanStatus),
    cardStatus: asCard(cardData.cardStatus),
    cardVerified: Boolean(cardData.cardVerified),
    cardBrand: (cardData.cardBrand ?? null) as string | null,
    cardLast4: (cardData.cardLast4 ?? null) as string | null,
    cardLastError: (cardData.lastSetupError ?? null) as { message?: string | null; code?: string | null } | null,
    setupIntentId: (cardData.setupIntentId ?? null) as string | null,
    publishableKey: typeof cardData.publishableKey === "string" ? cardData.publishableKey : null,
    humanAttemptId: humanAttempt?.id ? String(humanAttempt.id) : null,
    humanAttemptCompletedAt: humanAttempt?.completed_at ?? null,
    humanChallenge: (humanAttempt?.challenge_payload ?? null) as HumanChallenge | null,
  };
}

export async function startHumanChallenge(): Promise<{ attemptId: string; challenge: HumanChallenge; verificationStatus: BackendVerificationStatus }> {
  const { data, error } = await invokeWithTransient503Retry("verify-human-challenge", { action: "start" });
  if (error) throw mapError(error.message);
  const attemptId = String(data?.attempt?.id || "");
  const challenge = data?.attempt?.challenge_payload as HumanChallenge | undefined;
  if (!attemptId || !challenge) throw mapError("invalid_human_challenge_response");
  return {
    attemptId,
    challenge,
    verificationStatus: asStatus(data?.verificationStatus),
  };
}

export async function completeHumanChallenge(params: {
  attemptId: string;
  status: "passed" | "failed";
  score?: number;
  resultPayload?: Record<string, unknown>;
  evidencePath?: string | null;
}): Promise<{ verificationStatus: BackendVerificationStatus; humanStatus: HumanStatus }> {
  const { data, error } = await invokeWithTransient503Retry("verify-human-challenge", {
    action: "complete",
    attemptId: params.attemptId,
    status: params.status,
    score: params.score ?? null,
    resultPayload: params.resultPayload || {},
    evidencePath: params.evidencePath ?? null,
  });
  if (error) throw mapError(error.message);
  return {
    verificationStatus: asStatus(data?.verificationStatus),
    humanStatus: asHuman(data?.humanStatus),
  };
}

export async function createCardSetupIntent(attemptId?: string): Promise<{
  publishableKey: string;
  clientSecret: string;
  setupIntentId: string;
  stripeMode?: string | null;
  verificationStatus: BackendVerificationStatus;
}> {
  const stripeMode = resolveLocalStripeMode();
  const { data, error } = await invokeWithTransient503Retry("create-identity-setup-intent", {
    action: "create",
    stripeMode,
    attemptId: attemptId || null,
  });
  if (error) throw mapError(error.message);
  const publishableKey = String(data?.publishableKey || "");
  const clientSecret = String(data?.clientSecret || "");
  const setupIntentId = String(data?.setupIntentId || "");
  if (!publishableKey || !clientSecret || !setupIntentId) throw mapError("invalid_setup_intent_payload");
  return {
    publishableKey,
    clientSecret,
    setupIntentId,
    stripeMode: typeof data?.stripeMode === "string" ? data.stripeMode : null,
    verificationStatus: asStatus(data?.verificationStatus),
  };
}

export async function fetchCardStatus(): Promise<{ cardStatus: CardStatus; verificationStatus: BackendVerificationStatus; cardBrand: string | null; cardLast4: string | null; setupIntentId: string | null; cardLastError: { message?: string | null; code?: string | null } | null }> {
  const stripeMode = resolveLocalStripeMode();
  const { data, error } = await invokeWithTransient503Retry("create-identity-setup-intent", { action: "status", stripeMode });
  if (error) throw mapError(error.message);
  return {
    cardStatus: asCard(data?.cardStatus),
    verificationStatus: asStatus(data?.verificationStatus),
    cardBrand: (data?.cardBrand ?? null) as string | null,
    cardLast4: (data?.cardLast4 ?? null) as string | null,
    setupIntentId: (data?.setupIntentId ?? null) as string | null,
    cardLastError: (data?.lastSetupError ?? null) as { message?: string | null; code?: string | null } | null,
  };
}
