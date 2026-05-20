import {
  createNativeCardSetupIntent,
  fetchNativeCardStatus,
  type NativeCardSetupIntentResult,
  type NativeCardStatusResult,
} from "./nativeVerifyIdentity";

export type NativeVerifyIdentityCardStateName =
  | "idle"
  | "creating_setup_intent"
  | "collecting"
  | "ready"
  | "opening_3ds"
  | "checking_card"
  | "pending"
  | "passed"
  | "failed"
  | "cancelled"
  | "blocked";

export type NativeVerifyIdentityCardFailure =
  | "setup_intent_create_failed"
  | "stripe_not_ready"
  | "card_incomplete"
  | "legal_name_missing"
  | "postal_code_missing"
  | "stripe_cancelled"
  | "stripe_failed"
  | "stripe_timeout"
  | "blocked_identity"
  | "status_failed"
  | "network"
  | "unknown";

export type NativeStripeSetupIntentStatus =
  | "succeeded"
  | "processing"
  | "requires_payment_method"
  | "requires_confirmation"
  | "requires_action"
  | "canceled"
  | string;

export type NativeStripeSetupIntentResultBoundary = {
  setupIntent?: {
    id?: string | null;
    status?: NativeStripeSetupIntentStatus | null;
  } | null;
  error?: {
    code?: string | null;
    message?: string | null;
  } | null;
};

export type NativeVerifyIdentityCardReconciliationContext = {
  activeAttempt?: boolean;
  currentSetupIntentId?: string | null;
  localFailedOrCancelled?: boolean;
};

export type NativeVerifyIdentityCardPollingPolicy = {
  maxPendingPolls: number;
  slowPollAfter: number;
  normalDelayMs: number;
  slowDelayMs: number;
  pendingMessage: string;
};

export type NativeVerifyIdentityCardState = {
  state: NativeVerifyIdentityCardStateName;
  loading: boolean;
  error: string | null;
  failure: NativeVerifyIdentityCardFailure | null;
  legalName: string;
  postalCode: string;
  cardComplete: boolean;
  publishableKey: string | null;
  clientSecret: string | null;
  setupIntentId: string | null;
  attemptId: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  cardLastError: { message?: string | null; code?: string | null } | null;
  blockedMessage: string | null;
  supportPathRequired: boolean;
};

export type NativeVerifyIdentityCardAction =
  | { type: "legal_name_changed"; legalName: string }
  | { type: "postal_code_changed"; postalCode: string }
  | { type: "card_complete_changed"; cardComplete: boolean }
  | { type: "setup_started"; attemptId: string }
  | { type: "setup_succeeded"; result: NativeCardSetupIntentResult }
  | { type: "setup_failed"; error: string; failure: NativeVerifyIdentityCardFailure }
  | { type: "submit_started" }
  | { type: "stripe_returned"; result: NativeStripeSetupIntentResultBoundary }
  | { type: "status_started" }
  | { type: "status_succeeded"; result: NativeCardStatusResult; context?: NativeVerifyIdentityCardReconciliationContext }
  | { type: "status_failed"; error: string; failure: NativeVerifyIdentityCardFailure }
  | { type: "retry" }
  | { type: "reset" };

const BLOCKED_CARD_MESSAGE = "Card is already used by another account.";
export const NATIVE_VERIFY_IDENTITY_CARD_POLLING_POLICY: NativeVerifyIdentityCardPollingPolicy = {
  maxPendingPolls: 12,
  slowPollAfter: 10,
  normalDelayMs: 1000,
  slowDelayMs: 2000,
  pendingMessage: "Verification is still processing. Please check status.",
};

export const createNativeVerifyIdentityCardState = (
  initial: Partial<Pick<NativeVerifyIdentityCardState, "legalName" | "postalCode">> = {},
): NativeVerifyIdentityCardState => ({
  state: "idle",
  loading: false,
  error: null,
  failure: null,
  legalName: initial.legalName?.trim() ?? "",
  postalCode: initial.postalCode?.trim() ?? "",
  cardComplete: false,
  publishableKey: null,
  clientSecret: null,
  setupIntentId: null,
  attemptId: null,
  cardBrand: null,
  cardLast4: null,
  cardLastError: null,
  blockedMessage: null,
  supportPathRequired: false,
});

export const canSubmitNativeVerifyIdentityCard = (
  state: NativeVerifyIdentityCardState,
): boolean => (
  state.state === "ready" &&
  !state.loading &&
  state.cardComplete &&
  Boolean(state.legalName.trim()) &&
  Boolean(state.clientSecret) &&
  Boolean(state.setupIntentId)
);

const mapCardError = (raw: string | null | undefined): { error: string; failure: NativeVerifyIdentityCardFailure } => {
  const code = String(raw || "").trim().toLowerCase();
  if (code.includes("blocked_identity")) return { error: BLOCKED_CARD_MESSAGE, failure: "blocked_identity" };
  if (code.includes("timeout")) return { error: "Card setup is taking too long. Please try again.", failure: "stripe_timeout" };
  if (code.includes("network") || code.includes("fetch")) return { error: "Card verification is temporarily unavailable. Please try again.", failure: "network" };
  if (code.includes("missing_stripe") || code.includes("not configured")) return { error: "We couldn’t start card verification. Please try again soon.", failure: "setup_intent_create_failed" };
  return { error: "We couldn't verify your card. Please try again.", failure: "unknown" };
};

const mapStripeReturn = (
  result: NativeStripeSetupIntentResultBoundary,
): Pick<NativeVerifyIdentityCardState, "state" | "error" | "failure" | "loading"> => {
  const status = String(result.setupIntent?.status || "").trim().toLowerCase();
  const code = String(result.error?.code || "").trim().toLowerCase();

  if (code === "canceled" || code === "cancelled" || code.includes("cancel")) {
    return { state: "cancelled", loading: false, error: "Card check was cancelled. Try again when you're ready.", failure: "stripe_cancelled" };
  }
  if (result.error) {
    return { state: "failed", loading: false, error: "We couldn't verify your card. Please try again.", failure: "stripe_failed" };
  }
  if (status === "succeeded" || status === "processing") {
    return { state: "checking_card", loading: true, error: null, failure: null };
  }
  if (status === "canceled" || status === "cancelled") {
    return { state: "cancelled", loading: false, error: "Card check was cancelled. Try again when you're ready.", failure: "stripe_cancelled" };
  }
  return { state: "failed", loading: false, error: "We couldn't verify your card. Please try again.", failure: "stripe_failed" };
};

const mapBackendStatus = (
  result: NativeCardStatusResult,
): Pick<NativeVerifyIdentityCardState, "state" | "loading" | "error" | "failure" | "blockedMessage" | "supportPathRequired"> => {
  if (result.blockedIdentity.blocked || result.verificationRejectionCode === "blocked_identity") {
    return {
      state: "blocked",
      loading: false,
      error: result.blockedIdentity.message || BLOCKED_CARD_MESSAGE,
      failure: "blocked_identity",
      blockedMessage: result.blockedIdentity.message || BLOCKED_CARD_MESSAGE,
      supportPathRequired: true,
    };
  }
  if (result.cardStatus === "passed") {
    return { state: "passed", loading: false, error: null, failure: null, blockedMessage: null, supportPathRequired: false };
  }
  if (result.cardStatus === "pending") {
    return { state: "pending", loading: false, error: null, failure: null, blockedMessage: null, supportPathRequired: false };
  }
  if (result.cardStatus === "failed") {
    return { state: "failed", loading: false, error: "We couldn't verify your card. Please try again.", failure: "stripe_failed", blockedMessage: null, supportPathRequired: false };
  }
  return { state: "idle", loading: false, error: null, failure: null, blockedMessage: null, supportPathRequired: false };
};

const isProtectedCardReconciliation = (
  state: NativeVerifyIdentityCardState,
  result: NativeCardStatusResult,
  context: NativeVerifyIdentityCardReconciliationContext | undefined,
): boolean => {
  const backendPassed = result.cardStatus === "passed";
  const backendBlocked = result.blockedIdentity.blocked || result.verificationRejectionCode === "blocked_identity";
  if (backendPassed || backendBlocked) return false;

  const activeState =
    state.state === "creating_setup_intent" ||
    state.state === "collecting" ||
    state.state === "ready" ||
    state.state === "opening_3ds" ||
    state.state === "checking_card";
  const localFailedOrCancelled = context?.localFailedOrCancelled ?? (state.state === "failed" || state.state === "cancelled");
  const currentSetupIntentId = context?.currentSetupIntentId ?? state.setupIntentId;
  const differentSetupIntent =
    Boolean(currentSetupIntentId) &&
    Boolean(result.setupIntentId) &&
    currentSetupIntentId !== result.setupIntentId;

  return Boolean(context?.activeAttempt || activeState || localFailedOrCancelled || differentSetupIntent);
};

export const reduceNativeVerifyIdentityCardState = (
  state: NativeVerifyIdentityCardState,
  action: NativeVerifyIdentityCardAction,
): NativeVerifyIdentityCardState => {
  switch (action.type) {
    case "legal_name_changed":
      return { ...state, legalName: action.legalName, error: null, failure: null };
    case "postal_code_changed":
      return { ...state, postalCode: action.postalCode, error: null, failure: null };
    case "card_complete_changed":
      return { ...state, cardComplete: action.cardComplete, error: null, failure: null };
    case "setup_started":
      return {
        ...state,
        state: "creating_setup_intent",
        loading: true,
        error: null,
        failure: null,
        attemptId: action.attemptId,
        clientSecret: null,
        setupIntentId: null,
        publishableKey: null,
        blockedMessage: null,
        supportPathRequired: false,
      };
    case "setup_succeeded":
      return {
        ...state,
        state: "collecting",
        loading: false,
        error: null,
        failure: null,
        publishableKey: action.result.publishableKey,
        clientSecret: action.result.clientSecret,
        setupIntentId: action.result.setupIntentId,
      };
    case "setup_failed":
      return { ...state, state: "failed", loading: false, error: action.error, failure: action.failure };
    case "submit_started": {
      if (!state.clientSecret || !state.setupIntentId) {
        return { ...state, loading: false, error: "Please finish entering your card details first.", failure: "stripe_not_ready" };
      }
      if (!state.cardComplete) {
        return { ...state, loading: false, error: "Enter a complete card.", failure: "card_incomplete" };
      }
      if (!state.legalName.trim()) {
        return { ...state, loading: false, error: "Enter your legal name.", failure: "legal_name_missing" };
      }
      return { ...state, state: "opening_3ds", loading: true, error: null, failure: null };
    }
    case "stripe_returned":
      return { ...state, ...mapStripeReturn(action.result) };
    case "status_started":
      return { ...state, state: "checking_card", loading: true, error: null, failure: null };
    case "status_succeeded": {
      if (isProtectedCardReconciliation(state, action.result, action.context)) {
        return { ...state, loading: false };
      }
      const mapped = mapBackendStatus(action.result);
      return {
        ...state,
        ...mapped,
        cardBrand: action.result.cardBrand,
        cardLast4: action.result.cardLast4,
        cardLastError: action.result.cardLastError,
        setupIntentId: action.result.setupIntentId ?? state.setupIntentId,
        publishableKey: action.result.publishableKey ?? state.publishableKey,
      };
    }
    case "status_failed":
      return { ...state, state: "failed", loading: false, error: action.error, failure: action.failure };
    case "retry":
      return createNativeVerifyIdentityCardState({ legalName: state.legalName, postalCode: state.postalCode });
    case "reset":
      return createNativeVerifyIdentityCardState();
    default:
      return state;
  }
};

export const beginNativeVerifyIdentityCardSetup = (
  state: NativeVerifyIdentityCardState,
  attemptId: string,
) => reduceNativeVerifyIdentityCardState(state, { type: "setup_started", attemptId });

export const prepareNativeVerifyIdentityCardSetup = async (
  state: NativeVerifyIdentityCardState,
  attemptId: string,
): Promise<NativeVerifyIdentityCardState> => {
  const started = beginNativeVerifyIdentityCardSetup(state, attemptId);
  try {
    const result = await createNativeCardSetupIntent({
      attemptId,
      legalName: state.legalName.trim(),
      postalCode: state.postalCode.trim() || null,
    });
    return reduceNativeVerifyIdentityCardState(started, { type: "setup_succeeded", result });
  } catch (error) {
    const mapped = mapCardError(error instanceof Error ? error.message : "unknown");
    return reduceNativeVerifyIdentityCardState(started, { type: "setup_failed", ...mapped });
  }
};

export const markNativeVerifyIdentityCardReady = (
  state: NativeVerifyIdentityCardState,
): NativeVerifyIdentityCardState => {
  if (state.state !== "collecting" || !state.clientSecret || !state.setupIntentId) return state;
  return { ...state, state: "ready", error: null, failure: null };
};

export const beginNativeVerifyIdentityCardSubmit = (
  state: NativeVerifyIdentityCardState,
) => reduceNativeVerifyIdentityCardState(state, { type: "submit_started" });

export const applyNativeStripeSetupIntentReturn = (
  state: NativeVerifyIdentityCardState,
  result: NativeStripeSetupIntentResultBoundary,
) => reduceNativeVerifyIdentityCardState(state, { type: "stripe_returned", result });

export const reconcileNativeVerifyIdentityCardStatus = async (
  state: NativeVerifyIdentityCardState,
  context?: NativeVerifyIdentityCardReconciliationContext,
): Promise<NativeVerifyIdentityCardState> => {
  try {
    const result = await fetchNativeCardStatus();
    return reduceNativeVerifyIdentityCardState(state, { type: "status_succeeded", result, context });
  } catch (error) {
    const mapped = mapCardError(error instanceof Error ? error.message : "unknown");
    return reduceNativeVerifyIdentityCardState(state, { type: "status_failed", ...mapped });
  }
};

export const getNativeVerifyIdentityCardPollingDelayMs = (
  pendingPolls: number,
  policy = NATIVE_VERIFY_IDENTITY_CARD_POLLING_POLICY,
): number => (
  pendingPolls >= policy.slowPollAfter ? policy.slowDelayMs : policy.normalDelayMs
);

export const shouldStopNativeVerifyIdentityCardPolling = (
  pendingPolls: number,
  policy = NATIVE_VERIFY_IDENTITY_CARD_POLLING_POLICY,
): boolean => pendingPolls >= policy.maxPendingPolls;
