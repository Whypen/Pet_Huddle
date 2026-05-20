import {
  completeNativeHumanChallenge,
  startNativeHumanChallenge,
  type NativeCompleteHumanChallengePayload,
  type NativeHumanChallenge,
} from "./nativeVerifyIdentity";

export type NativeVerifyIdentityHumanStateName =
  | "idle"
  | "ready"
  | "capturing"
  | "pending"
  | "passed"
  | "failed";

export type NativeVerifyIdentityHumanFailure =
  | "permission_denied"
  | "no_camera"
  | "no_face"
  | "poor_lighting"
  | "movement_failed"
  | "timeout"
  | "detector_unavailable"
  | "retry"
  | "challenge_expired"
  | "session_expired"
  | "network"
  | "unknown";

export type NativeVerifyIdentityHumanCaptureResult = {
  passed: boolean;
  score: number;
  resultPayload: NativeVerifyIdentityHumanResultPayload;
  evidencePath?: string | null;
};

export type NativeVerifyIdentityHumanResultPayload = {
  reason?: NativeVerifyIdentityHumanFailure | string;
  detectedFrames?: number;
  totalFrames?: number;
  lightingScore?: number;
  movementScore?: number;
  challengeType?: string;
  [key: string]: unknown;
};

export type NativeVerifyIdentityHumanState = {
  state: NativeVerifyIdentityHumanStateName;
  loading: boolean;
  error: string | null;
  failure: NativeVerifyIdentityHumanFailure | null;
  attemptId: string | null;
  challenge: NativeHumanChallenge | null;
  score: number | null;
  resultPayload: NativeVerifyIdentityHumanResultPayload | null;
  evidencePath: string | null;
};

export type NativeVerifyIdentityHumanAction =
  | { type: "start_requested" }
  | { type: "start_succeeded"; attemptId: string; challenge: NativeHumanChallenge }
  | { type: "start_failed"; error: string; failure: NativeVerifyIdentityHumanFailure }
  | { type: "capture_started" }
  | { type: "capture_failed"; error: string; failure: NativeVerifyIdentityHumanFailure; resultPayload?: NativeVerifyIdentityHumanResultPayload | null }
  | { type: "capture_succeeded"; result: NativeVerifyIdentityHumanCaptureResult }
  | { type: "complete_started"; result: NativeVerifyIdentityHumanCaptureResult }
  | { type: "complete_succeeded"; passed: boolean }
  | { type: "complete_failed"; error: string; failure: NativeVerifyIdentityHumanFailure }
  | { type: "retry" }
  | { type: "reset" };

export const createNativeVerifyIdentityHumanState = (): NativeVerifyIdentityHumanState => ({
  state: "idle",
  loading: false,
  error: null,
  failure: null,
  attemptId: null,
  challenge: null,
  score: null,
  resultPayload: null,
  evidencePath: null,
});

const humanFailureCopy: Record<NativeVerifyIdentityHumanFailure, string> = {
  permission_denied: "Camera access is required for human verification.",
  no_camera: "We couldn't find a camera on this device.",
  no_face: "Center your face in the frame and try again.",
  poor_lighting: "Move to a brighter area and try again.",
  movement_failed: "We couldn't confirm the requested movement. Please try again.",
  timeout: "The check took too long. Please start again.",
  detector_unavailable: "This device does not support the camera verification check.",
  retry: "We couldn't confirm your human check. Please try again.",
  challenge_expired: "Your verification challenge expired. Start a new check.",
  session_expired: "Your session expired. Please sign in again.",
  network: "Verification service is temporarily unavailable. Please retry in a moment.",
  unknown: "We couldn't complete verification. Please retry.",
};

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

export const describeNativeHumanFailure = (
  failure: NativeVerifyIdentityHumanFailure,
): string => humanFailureCopy[failure] ?? humanFailureCopy.unknown;

export const describeNativeHumanResultFailure = (
  resultPayload: NativeVerifyIdentityHumanResultPayload | null | undefined,
  challengeInstruction?: string | null,
): string => {
  const payload = resultPayload || {};
  const reason = normalize(payload.reason);
  const detectedFrames = Number(payload.detectedFrames ?? 0);
  const horizontalShift = Number(payload.horizontalShift ?? 0);
  const verticalShift = Number(payload.verticalShift ?? 0);
  const leftTravel = Number(payload.leftTravel ?? 0);
  const rightTravel = Number(payload.rightTravel ?? 0);
  const upTravel = Number(payload.upTravel ?? 0);
  const downTravel = Number(payload.downTravel ?? 0);
  const challengeType = normalize(payload.challengeType);

  if (reason.includes("permission")) return humanFailureCopy.permission_denied;
  if (reason.includes("no_camera")) return humanFailureCopy.no_camera;
  if (reason.includes("face_detector_unsupported") || reason.includes("detector") || reason.includes("mediapipe")) {
    return "We couldn't initialize face detection. Check camera permission and internet connection, then try again.";
  }
  if (reason.includes("lighting")) return humanFailureCopy.poor_lighting;
  if (reason.includes("timeout")) return humanFailureCopy.timeout;
  if (reason.includes("movement")) return humanFailureCopy.movement_failed;
  if (reason.includes("no_face") || reason === "face_not_stably_detected" || detectedFrames < 6) {
    return "We couldn't detect your face steadily. Keep your whole face inside the oval in a well-lit place.";
  }
  if (reason.includes("retry") || reason.includes("unclear")) return humanFailureCopy.retry;
  if (challengeType === "turn_left_right" && (leftTravel < 0.12 || rightTravel < 0.12 || horizontalShift < 0.36)) {
    return "Move your head left and right while staying inside the oval.";
  }
  if (challengeType === "look_up_down" && (upTravel < 0.10 || downTravel < 0.10 || verticalShift < 0.30)) {
    return "Move your head up and down while staying inside the oval.";
  }
  return challengeInstruction
    ? `Please try again and follow: ${challengeInstruction}.`
    : "Face verification failed. Keep your face centered in the oval and try again.";
};

const mapHumanError = (raw: string | null | undefined): { error: string; failure: NativeVerifyIdentityHumanFailure } => {
  const code = normalize(raw);
  if (code.includes("permission") || code.includes("notallowederror")) return { error: humanFailureCopy.permission_denied, failure: "permission_denied" };
  if (code.includes("no_camera") || code.includes("camera_not_found")) return { error: humanFailureCopy.no_camera, failure: "no_camera" };
  if (code.includes("no_face")) return { error: humanFailureCopy.no_face, failure: "no_face" };
  if (code.includes("lighting")) return { error: humanFailureCopy.poor_lighting, failure: "poor_lighting" };
  if (code.includes("movement")) return { error: humanFailureCopy.movement_failed, failure: "movement_failed" };
  if (code.includes("timeout")) return { error: humanFailureCopy.timeout, failure: "timeout" };
  if (code.includes("face_detector_unsupported") || code.includes("detector")) return { error: humanFailureCopy.detector_unavailable, failure: "detector_unavailable" };
  if (code.includes("challenge_expired") || code.includes("attempt_not_found") || code.includes("invalid_transition")) return { error: humanFailureCopy.challenge_expired, failure: "challenge_expired" };
  if (code.includes("auth") || code.includes("session") || code.includes("unauthorized")) return { error: humanFailureCopy.session_expired, failure: "session_expired" };
  if (code.includes("network") || code.includes("fetch") || code.includes("503") || code.includes("service temporarily unavailable")) return { error: humanFailureCopy.network, failure: "network" };
  return { error: humanFailureCopy.unknown, failure: "unknown" };
};

const classifyCaptureFailure = (
  resultPayload: NativeVerifyIdentityHumanResultPayload | null | undefined,
): NativeVerifyIdentityHumanFailure => {
  const reason = normalize(resultPayload?.reason);
  if (reason.includes("permission")) return "permission_denied";
  if (reason.includes("no_camera")) return "no_camera";
  if (reason.includes("detector")) return "detector_unavailable";
  if (reason.includes("lighting")) return "poor_lighting";
  if (reason.includes("movement")) return "movement_failed";
  if (reason.includes("timeout")) return "timeout";
  if (reason.includes("no_face") || Number(resultPayload?.detectedFrames || 0) <= 0) return "no_face";
  return "retry";
};

export const reduceNativeVerifyIdentityHumanState = (
  state: NativeVerifyIdentityHumanState,
  action: NativeVerifyIdentityHumanAction,
): NativeVerifyIdentityHumanState => {
  switch (action.type) {
    case "start_requested":
      return { ...state, state: "idle", loading: true, error: null, failure: null };
    case "start_succeeded":
      return {
        ...state,
        state: "ready",
        loading: false,
        error: null,
        failure: null,
        attemptId: action.attemptId,
        challenge: action.challenge,
        score: null,
        resultPayload: null,
        evidencePath: null,
      };
    case "start_failed":
      return { ...state, state: "failed", loading: false, error: action.error, failure: action.failure };
    case "capture_started":
      if (!state.attemptId || !state.challenge) {
        return { ...state, state: "failed", loading: false, error: humanFailureCopy.challenge_expired, failure: "challenge_expired" };
      }
      return { ...state, state: "capturing", loading: true, error: null, failure: null };
    case "capture_failed":
      return {
        ...state,
        state: "failed",
        loading: false,
        error: action.error,
        failure: action.failure,
        resultPayload: action.resultPayload ?? state.resultPayload,
      };
    case "capture_succeeded": {
      const failure = action.result.passed ? null : classifyCaptureFailure(action.result.resultPayload);
      return {
        ...state,
        state: action.result.passed ? "pending" : "failed",
        loading: action.result.passed,
        error: failure ? describeNativeHumanResultFailure(action.result.resultPayload, state.challenge?.instruction ?? null) : null,
        failure,
        score: action.result.score,
        resultPayload: action.result.resultPayload,
        evidencePath: action.result.evidencePath ?? null,
      };
    }
    case "complete_started":
      return {
        ...state,
        state: "pending",
        loading: true,
        error: null,
        failure: null,
        score: action.result.score,
        resultPayload: action.result.resultPayload,
        evidencePath: action.result.evidencePath ?? null,
      };
    case "complete_succeeded":
      if (!action.passed) {
        const failure = classifyCaptureFailure(state.resultPayload);
        return {
          ...state,
          state: "failed",
          loading: false,
          error: describeNativeHumanResultFailure(state.resultPayload, state.challenge?.instruction ?? null),
          failure,
        };
      }
      return {
        ...state,
        state: "passed",
        loading: false,
        error: null,
        failure: null,
      };
    case "complete_failed":
      return { ...state, state: "failed", loading: false, error: action.error, failure: action.failure };
    case "retry":
      return createNativeVerifyIdentityHumanState();
    case "reset":
      return createNativeVerifyIdentityHumanState();
    default:
      return state;
  }
};

export const startNativeVerifyIdentityHumanModel = async (
  state: NativeVerifyIdentityHumanState,
): Promise<NativeVerifyIdentityHumanState> => {
  const started = reduceNativeVerifyIdentityHumanState(state, { type: "start_requested" });
  try {
    const result = await startNativeHumanChallenge();
    return reduceNativeVerifyIdentityHumanState(started, {
      type: "start_succeeded",
      attemptId: result.attemptId,
      challenge: result.challenge,
    });
  } catch (error) {
    const mapped = mapHumanError(error instanceof Error ? error.message : "unknown");
    return reduceNativeVerifyIdentityHumanState(started, { type: "start_failed", ...mapped });
  }
};

export const beginNativeVerifyIdentityHumanCapture = (
  state: NativeVerifyIdentityHumanState,
): NativeVerifyIdentityHumanState => reduceNativeVerifyIdentityHumanState(state, { type: "capture_started" });

export const applyNativeVerifyIdentityHumanCaptureResult = (
  state: NativeVerifyIdentityHumanState,
  result: NativeVerifyIdentityHumanCaptureResult,
): NativeVerifyIdentityHumanState => reduceNativeVerifyIdentityHumanState(state, { type: "capture_succeeded", result });

export const failNativeVerifyIdentityHumanCapture = (
  state: NativeVerifyIdentityHumanState,
  failure: NativeVerifyIdentityHumanFailure,
  resultPayload?: NativeVerifyIdentityHumanResultPayload | null,
): NativeVerifyIdentityHumanState => reduceNativeVerifyIdentityHumanState(state, {
  type: "capture_failed",
  error: describeNativeHumanFailure(failure),
  failure,
  resultPayload,
});

export const completeNativeVerifyIdentityHumanModel = async (
  state: NativeVerifyIdentityHumanState,
  result: NativeVerifyIdentityHumanCaptureResult,
): Promise<NativeVerifyIdentityHumanState> => {
  if (!state.attemptId) {
    return reduceNativeVerifyIdentityHumanState(state, {
      type: "complete_failed",
      error: humanFailureCopy.challenge_expired,
      failure: "challenge_expired",
    });
  }
  const started = reduceNativeVerifyIdentityHumanState(state, { type: "complete_started", result });
  const payload: NativeCompleteHumanChallengePayload = {
    attemptId: state.attemptId,
    status: result.passed ? "passed" : "failed",
    score: result.score,
    resultPayload: result.resultPayload,
    evidencePath: result.evidencePath ?? null,
  };
  try {
    const completed = await completeNativeHumanChallenge(payload);
    return reduceNativeVerifyIdentityHumanState(started, {
      type: "complete_succeeded",
      passed: completed.humanStatus === "passed",
    });
  } catch (error) {
    const mapped = mapHumanError(error instanceof Error ? error.message : "unknown");
    return reduceNativeVerifyIdentityHumanState(started, { type: "complete_failed", ...mapped });
  }
};
