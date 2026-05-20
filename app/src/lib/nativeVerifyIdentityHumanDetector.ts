export type NativeHumanPoseStep = "center" | "left" | "right" | "done";
export type NativeHumanDetectorFailure =
  | "detector_unavailable"
  | "face_outside_frame"
  | "face_size_invalid"
  | "face_quality_invalid"
  | "multiple_faces"
  | "movement_failed"
  | "no_face"
  | "same_side_repeat"
  | "timeout";

export type NativeHumanDetectorFaceBounds = {
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
};

export type NativeHumanDetectorFace = {
  bounds?: NativeHumanDetectorFaceBounds | null;
  pitchAngle?: number | null;
  rollAngle?: number | null;
  yawAngle?: number | null;
};

export type NativeHumanDetectorFrame = {
  height?: number | null;
  width?: number | null;
};

export type NativeHumanDetectorPreview = {
  height: number;
  width: number;
};

export type NativeHumanDetectorBounds = {
  height: number;
  mappingVariant?: string;
  width: number;
  x: number;
  y: number;
};

export type NativeHumanDetectionState = {
  callbackFrames: number;
  centerFrames: number;
  centerPassedAtMs: number;
  centerValidSinceMs: number;
  firstYawSign: -1 | 0 | 1;
  finishing: boolean;
  lastRejectReason: NativeHumanDetectorFailure | null;
  maxSideOneYaw: number;
  maxSideTwoYaw: number;
  maxYaw: number;
  minYaw: number;
  noFaceFrames: number;
  rejectedFrames: number;
  sideOneFrames: number;
  sideOnePassedAtMs: number;
  sideOneValidSinceMs: number;
  sideTwoFrames: number;
  sideTwoPassedAtMs: number;
  sideTwoValidSinceMs: number;
  stableFaceFrames: number;
  stepStableMs: number;
  totalFrames: number;
};

export type NativeHumanDetectorConfig = {
  centerHoldMs: number;
  centerYawMax: number;
  faceMaxPitch: number;
  faceMaxRoll: number;
  faceMaxWidthRatio: number;
  faceMinWidthRatio: number;
  ovalHeight: number;
  ovalWidth: number;
  sideHoldMs: number;
  sideYawMin: number;
};

export type NativeHumanDetectorDebugFrame = {
  faceCenterX?: number;
  faceCenterY?: number;
  faceHeight?: number;
  faceWidth?: number;
  faceCenterInsideOval?: boolean;
  faceWidthRatio?: number;
  facesCount: number;
  frameHeight?: number;
  frameWidth?: number;
  mappingVariant?: string;
  ovalOverlapRatio?: number;
  pitch?: number;
  previewHeight?: number;
  previewWidth?: number;
  poseStep: NativeHumanPoseStep;
  rawBounds?: NativeHumanDetectorFaceBounds | null;
  reason?: NativeHumanDetectorFailure | null;
  requiredHoldMs?: number;
  roll?: number;
  stableFrames?: number;
  stepPassedAtMs?: number;
  stepPassed?: boolean;
  stepStableMs?: number;
  stepValidSinceMs?: number;
  yaw?: number;
};

export type NativeHumanDetectorResult = {
  debug: NativeHumanDetectorDebugFrame;
  nextPoseStep: NativeHumanPoseStep;
  passed: boolean;
  reason: NativeHumanDetectorFailure | null;
  state: NativeHumanDetectionState;
  status: string;
};

export const createNativeHumanDetectionState = (): NativeHumanDetectionState => ({
  callbackFrames: 0,
  centerFrames: 0,
  centerValidSinceMs: 0,
  centerPassedAtMs: 0,
  sideOneFrames: 0,
  sideOneValidSinceMs: 0,
  sideOnePassedAtMs: 0,
  sideTwoFrames: 0,
  sideTwoValidSinceMs: 0,
  sideTwoPassedAtMs: 0,
  firstYawSign: 0,
  finishing: false,
  totalFrames: 0,
  stableFaceFrames: 0,
  rejectedFrames: 0,
  noFaceFrames: 0,
  minYaw: 0,
  maxYaw: 0,
  maxSideOneYaw: 0,
  maxSideTwoYaw: 0,
  stepStableMs: 0,
  lastRejectReason: null,
});

const cloneState = (state: NativeHumanDetectionState): NativeHumanDetectionState => ({ ...state });

const getMonotonicNowMs = () => {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  return Date.now();
};

export const mapNativeHumanFaceBoundsToPreview = (
  face: NativeHumanDetectorFace,
  frame: NativeHumanDetectorFrame | null | undefined,
  preview: NativeHumanDetectorPreview,
): NativeHumanDetectorBounds => {
  const rawBounds = face.bounds || { x: 0, y: 0, width: 0, height: 0 };
  const previewWidth = Math.max(preview.width, 1);
  const previewHeight = Math.max(preview.height, 1);
  const frameWidth = Math.max(Number(frame?.width || 0), 1);
  const frameHeight = Math.max(Number(frame?.height || 0), 1);
  const rawX = Number(rawBounds.x || 0);
  const rawY = Number(rawBounds.y || 0);
  const rawWidth = Number(rawBounds.width || 0);
  const rawHeight = Number(rawBounds.height || 0);

  const projectBounds = ({
    height,
    variant,
    width,
    x,
    y,
  }: {
    height: number;
    variant: string;
    width: number;
    x: number;
    y: number;
  }): NativeHumanDetectorBounds => {
    const sourceWidth = Math.max(width, 1);
    const sourceHeight = Math.max(height, 1);
    const scale = Math.max(previewWidth / sourceWidth, previewHeight / sourceHeight);
    const renderedWidth = sourceWidth * scale;
    const renderedHeight = sourceHeight * scale;
    const cropX = (renderedWidth - previewWidth) / 2;
    const cropY = (renderedHeight - previewHeight) / 2;

    return {
      x: x * scale - cropX,
      y: y * scale - cropY,
      width: Math.max(rawWidth, 0) * scale,
      height: Math.max(rawHeight, 0) * scale,
      mappingVariant: variant,
    };
  };

  const projectRotatedBounds = ({
    faceHeight,
    faceWidth,
    height,
    variant,
    width,
    x,
    y,
  }: {
    faceHeight: number;
    faceWidth: number;
    height: number;
    variant: string;
    width: number;
    x: number;
    y: number;
  }): NativeHumanDetectorBounds => {
    const sourceWidth = Math.max(width, 1);
    const sourceHeight = Math.max(height, 1);
    const scale = Math.max(previewWidth / sourceWidth, previewHeight / sourceHeight);
    const renderedWidth = sourceWidth * scale;
    const renderedHeight = sourceHeight * scale;
    const cropX = (renderedWidth - previewWidth) / 2;
    const cropY = (renderedHeight - previewHeight) / 2;

    return {
      x: x * scale - cropX,
      y: y * scale - cropY,
      width: Math.max(faceWidth, 0) * scale,
      height: Math.max(faceHeight, 0) * scale,
      mappingVariant: variant,
    };
  };

  const projectNormalizedBounds = ({
    height,
    variant,
    width,
    x = rawX,
    y = rawY,
  }: {
    height: number;
    variant: string;
    width: number;
    x?: number;
    y?: number;
  }): NativeHumanDetectorBounds => {
    const sourceWidth = Math.max(width, 1);
    const sourceHeight = Math.max(height, 1);
    const centerX = ((x + rawWidth / 2) / sourceWidth) * previewWidth;
    const centerY = ((y + rawHeight / 2) / sourceHeight) * previewHeight;
    const mappedWidth = (rawWidth / sourceHeight) * previewWidth;
    const mappedHeight = (rawHeight / sourceHeight) * previewHeight;
    return {
      x: centerX - mappedWidth / 2,
      y: centerY - mappedHeight / 2,
      width: mappedWidth,
      height: mappedHeight,
      mappingVariant: variant,
    };
  };

  const frameIsLandscape = frameWidth > frameHeight;
  const portraitDirect = projectBounds({
    height: frameHeight,
    variant: "portrait_direct",
    width: frameWidth,
    x: rawX,
    y: rawY,
  });
  const portraitMirrorX = projectBounds({
    height: frameHeight,
    variant: "portrait_mirror_x",
    width: frameWidth,
    x: frameWidth - rawX - rawWidth,
    y: rawY,
  });

  const candidates = [portraitDirect, portraitMirrorX];

  if (frameIsLandscape) {
    candidates.push(
      projectNormalizedBounds({
        height: frameWidth,
        variant: "landscape_reported_portrait_coords",
        width: frameHeight,
      }),
      projectNormalizedBounds({
        height: frameWidth,
        variant: "landscape_reported_portrait_coords_mirror_x",
        width: frameHeight,
        x: frameHeight - rawX - rawWidth,
      }),
      projectRotatedBounds({
        faceHeight: rawWidth,
        faceWidth: rawHeight,
        height: frameWidth,
        variant: "landscape_swap",
        width: frameHeight,
        x: rawY,
        y: rawX,
      }),
      projectRotatedBounds({
        faceHeight: rawWidth,
        faceWidth: rawHeight,
        height: frameWidth,
        variant: "landscape_swap_mirror_x",
        width: frameHeight,
        x: frameHeight - rawY - rawHeight,
        y: rawX,
      }),
      projectRotatedBounds({
        faceHeight: rawWidth,
        faceWidth: rawHeight,
        height: frameWidth,
        variant: "landscape_rotate_cw",
        width: frameHeight,
        x: frameHeight - rawY - rawHeight,
        y: rawX,
      }),
      projectRotatedBounds({
        faceHeight: rawWidth,
        faceWidth: rawHeight,
        height: frameWidth,
        variant: "landscape_rotate_ccw",
        width: frameHeight,
        x: rawY,
        y: frameWidth - rawX - rawWidth,
      }),
    );
  }

  const scoreCandidate = (candidate: NativeHumanDetectorBounds) => {
    const centerX = candidate.x + candidate.width / 2;
    const centerY = candidate.y + candidate.height / 2;
    const normalizedCenterDistance =
      Math.abs(centerX - previewWidth / 2) / previewWidth +
      Math.abs(centerY - previewHeight / 2) / previewHeight;
    const widthRatio = candidate.width / previewWidth;
    const visible =
      centerX >= 0 &&
      centerX <= previewWidth &&
      centerY >= 0 &&
      centerY <= previewHeight;
    const sizePenalty =
      widthRatio < 0.12
        ? 2
        : widthRatio > 0.86
          ? 2
          : Math.abs(widthRatio - 0.44);
    return normalizedCenterDistance + sizePenalty + (visible ? 0 : 3);
  };

  return candidates.reduce((best, candidate) => (
    scoreCandidate(candidate) < scoreCandidate(best) ? candidate : best
  ));
};

const rejectFrame = (
  state: NativeHumanDetectionState,
  poseStep: NativeHumanPoseStep,
  facesCount: number,
  reason: NativeHumanDetectorFailure,
  status: string,
  debug: Partial<NativeHumanDetectorDebugFrame> = {},
): NativeHumanDetectorResult => {
  const next = cloneState(state);
  next.rejectedFrames += 1;
  next.lastRejectReason = reason;
  return {
    state: next,
    nextPoseStep: poseStep,
    passed: false,
    reason,
    status,
    debug: {
      facesCount,
      poseStep,
      reason,
      ...debug,
    },
  };
};

const estimateFaceOvalOverlapRatio = ({
  faceBounds,
  ovalCenterX,
  ovalCenterY,
  ovalHeight,
  ovalWidth,
}: {
  faceBounds: NativeHumanDetectorBounds;
  ovalCenterX: number;
  ovalCenterY: number;
  ovalHeight: number;
  ovalWidth: number;
}) => {
  const samplesPerAxis = 7;
  let inside = 0;
  let total = 0;

  for (let row = 0; row < samplesPerAxis; row += 1) {
    for (let column = 0; column < samplesPerAxis; column += 1) {
      const x = faceBounds.x + (faceBounds.width * (column + 0.5)) / samplesPerAxis;
      const y = faceBounds.y + (faceBounds.height * (row + 0.5)) / samplesPerAxis;
      const normalizedX = (x - ovalCenterX) / (ovalWidth / 2);
      const normalizedY = (y - ovalCenterY) / (ovalHeight / 2);
      if (normalizedX * normalizedX + normalizedY * normalizedY <= 1) inside += 1;
      total += 1;
    }
  }

  return total > 0 ? inside / total : 0;
};

const resetStepTimer = (state: NativeHumanDetectionState, poseStep: NativeHumanPoseStep) => {
  if (poseStep === "center") state.centerValidSinceMs = 0;
  if (poseStep === "left") state.sideOneValidSinceMs = 0;
  if (poseStep === "right") state.sideTwoValidSinceMs = 0;
  state.stepStableMs = 0;
};

const markStepValid = (
  state: NativeHumanDetectionState,
  poseStep: NativeHumanPoseStep,
  nowMs: number,
) => {
  if (poseStep === "center") {
    if (!state.centerValidSinceMs) state.centerValidSinceMs = nowMs;
    state.stepStableMs = nowMs - state.centerValidSinceMs;
    return { stepStableMs: state.stepStableMs, stepValidSinceMs: state.centerValidSinceMs };
  }
  if (poseStep === "left") {
    if (!state.sideOneValidSinceMs) state.sideOneValidSinceMs = nowMs;
    state.stepStableMs = nowMs - state.sideOneValidSinceMs;
    return { stepStableMs: state.stepStableMs, stepValidSinceMs: state.sideOneValidSinceMs };
  }
  if (poseStep === "right") {
    if (!state.sideTwoValidSinceMs) state.sideTwoValidSinceMs = nowMs;
    state.stepStableMs = nowMs - state.sideTwoValidSinceMs;
    return { stepStableMs: state.stepStableMs, stepValidSinceMs: state.sideTwoValidSinceMs };
  }
  state.stepStableMs = 0;
  return { stepStableMs: 0, stepValidSinceMs: 0 };
};

export const processNativeHumanDetectorFrame = (
  state: NativeHumanDetectionState,
  faces: NativeHumanDetectorFace[],
  frame: NativeHumanDetectorFrame | null | undefined,
  preview: NativeHumanDetectorPreview,
  poseStep: NativeHumanPoseStep,
  config: NativeHumanDetectorConfig,
  nowMs = getMonotonicNowMs(),
): NativeHumanDetectorResult => {
  const next = cloneState(state);
  next.callbackFrames += 1;

  if (faces.length > 1) {
    resetStepTimer(next, poseStep);
    return rejectFrame(next, poseStep, faces.length, "multiple_faces", "Only one face should be visible.");
  }

  const face = faces[0];
  if (!face) {
    next.noFaceFrames += 1;
    next.lastRejectReason = "no_face";
    resetStepTimer(next, poseStep);
    return {
      state: next,
      nextPoseStep: poseStep,
      passed: false,
      reason: "no_face",
      status: "No face detected. Move closer and center your face.",
      debug: {
        facesCount: faces.length,
        poseStep,
        reason: "no_face",
      },
    };
  }

  next.totalFrames += 1;

  const yaw = Number(face.yawAngle || 0);
  const absYaw = Math.abs(yaw);
  const faceBounds = mapNativeHumanFaceBoundsToPreview(face, frame ?? null, preview);
  const faceCenterX = Number(faceBounds.x || 0) + Number(faceBounds.width || 0) / 2;
  const faceCenterY = Number(faceBounds.y || 0) + Number(faceBounds.height || 0) / 2;
  const previewWidth = Math.max(preview.width, 1);
  const previewHeight = Math.max(preview.height, 1);
  const ovalCenterX = previewWidth / 2;
  const ovalCenterY = previewHeight / 2;
  const normalizedX = (faceCenterX - ovalCenterX) / (config.ovalWidth / 2);
  const normalizedY = (faceCenterY - ovalCenterY) / (config.ovalHeight / 2);
  const faceWidthRatio = Number(faceBounds.width || 0) / previewWidth;
  const faceCenterInsideOval = normalizedX * normalizedX + normalizedY * normalizedY <= 1;
  const ovalOverlapRatio = estimateFaceOvalOverlapRatio({
    faceBounds,
    ovalCenterX,
    ovalCenterY,
    ovalHeight: config.ovalHeight,
    ovalWidth: config.ovalWidth,
  });
  const faceInsideOval = faceCenterInsideOval && ovalOverlapRatio >= 0.70;
  const faceSizeValid = faceWidthRatio >= config.faceMinWidthRatio && faceWidthRatio <= config.faceMaxWidthRatio;
  const roll = Math.abs(Number(face.rollAngle || 0));
  const pitch = Math.abs(Number(face.pitchAngle || 0));
  const faceQualityValid = roll <= config.faceMaxRoll && pitch <= config.faceMaxPitch;
  const debug = {
    faceCenterX,
    faceCenterY,
    faceHeight: faceBounds.height,
    faceWidth: faceBounds.width,
    faceCenterInsideOval,
    faceWidthRatio,
    facesCount: faces.length,
    frameHeight: Number(frame?.height || 0),
    frameWidth: Number(frame?.width || 0),
    mappingVariant: faceBounds.mappingVariant,
    ovalOverlapRatio,
    pitch,
    previewHeight,
    previewWidth,
    poseStep,
    rawBounds: face.bounds ?? null,
    requiredHoldMs: poseStep === "center" ? config.centerHoldMs : poseStep === "left" || poseStep === "right" ? config.sideHoldMs : 0,
    roll,
    stableFrames: next.stableFaceFrames,
    stepPassed: false,
    stepStableMs: next.stepStableMs,
    stepValidSinceMs: 0,
    yaw,
  };

  if (!faceSizeValid) {
    resetStepTimer(next, poseStep);
    return rejectFrame(
      next,
      poseStep,
      faces.length,
      "face_size_invalid",
      faceWidthRatio < config.faceMinWidthRatio ? "Move closer to the camera." : "Move back slightly.",
      debug,
    );
  }

  if (!faceInsideOval) {
    resetStepTimer(next, poseStep);
    return rejectFrame(next, poseStep, faces.length, "face_outside_frame", "Keep your face inside the oval.", debug);
  }

  if (!faceQualityValid) {
    resetStepTimer(next, poseStep);
    return rejectFrame(next, poseStep, faces.length, "face_quality_invalid", "Keep your face upright in the oval.", debug);
  }

  next.stableFaceFrames += 1;
  next.minYaw = Math.min(next.minYaw, yaw);
  next.maxYaw = Math.max(next.maxYaw, yaw);
  next.lastRejectReason = null;

  if (poseStep === "center") {
    if (absYaw <= config.centerYawMax) {
      next.centerFrames += 1;
      const stepTiming = markStepValid(next, poseStep, nowMs);
      const stepDebug = {
        ...debug,
        requiredHoldMs: config.centerHoldMs,
        stableFrames: next.stableFaceFrames,
        stepPassed: stepTiming.stepStableMs >= config.centerHoldMs,
        stepPassedAtMs: stepTiming.stepStableMs >= config.centerHoldMs ? nowMs : 0,
        stepStableMs: stepTiming.stepStableMs,
        stepValidSinceMs: stepTiming.stepValidSinceMs,
      };
      if (stepTiming.stepStableMs >= config.centerHoldMs) {
        next.centerPassedAtMs = nowMs;
        resetStepTimer(next, "left");
        return {
          state: next,
          nextPoseStep: "left",
          passed: false,
          reason: null,
          status: "Center confirmed. Turn left slowly.",
          debug: stepDebug,
        };
      }
      return {
        state: next,
        nextPoseStep: poseStep,
        passed: false,
        reason: null,
        status: "Hold still in the center.",
        debug: stepDebug,
      };
    }

    next.centerFrames = Math.max(0, next.centerFrames - 1);
    resetStepTimer(next, poseStep);
    return {
      state: next,
      nextPoseStep: poseStep,
      passed: false,
      reason: null,
        status: "Hold still for a moment.",
      debug,
    };
  }

  if (poseStep === "left") {
    if (yaw >= config.sideYawMin) {
      resetStepTimer(next, poseStep);
      return {
        state: next,
        nextPoseStep: poseStep,
        passed: false,
        reason: null,
        status: "Turn the other way.",
        debug,
      };
    }

    if (yaw > -config.sideYawMin) {
      resetStepTimer(next, poseStep);
      return {
        state: next,
        nextPoseStep: poseStep,
        passed: false,
        reason: null,
        status: "Turn a bit more left.",
        debug,
      };
    }

    next.sideOneFrames += 1;
    next.maxSideOneYaw = Math.max(next.maxSideOneYaw, absYaw);
    if (next.firstYawSign === 0) next.firstYawSign = -1;
    const stepTiming = markStepValid(next, poseStep, nowMs);
    const stepDebug = {
      ...debug,
      requiredHoldMs: config.sideHoldMs,
      stableFrames: next.stableFaceFrames,
      stepPassed: stepTiming.stepStableMs >= config.sideHoldMs,
      stepPassedAtMs: stepTiming.stepStableMs >= config.sideHoldMs ? nowMs : 0,
      stepStableMs: stepTiming.stepStableMs,
      stepValidSinceMs: stepTiming.stepValidSinceMs,
    };

    if (stepTiming.stepStableMs >= config.sideHoldMs) {
      next.sideOnePassedAtMs = nowMs;
      resetStepTimer(next, "right");
      return {
        state: next,
        nextPoseStep: "right",
        passed: false,
        reason: null,
        status: "Left confirmed. Turn right slowly.",
        debug: stepDebug,
      };
    }

    return {
      state: next,
      nextPoseStep: poseStep,
      passed: false,
      reason: null,
      status: "Hold still for a moment.",
      debug: stepDebug,
    };
  }

  if (poseStep === "right") {
    if (yaw <= -config.sideYawMin) {
      next.lastRejectReason = "same_side_repeat";
      resetStepTimer(next, poseStep);
      return {
        state: next,
        nextPoseStep: poseStep,
        passed: false,
        reason: "same_side_repeat",
        status: "Now turn the other way.",
        debug: {
          ...debug,
          reason: "same_side_repeat",
        },
      };
    }

    if (yaw < config.sideYawMin) {
      resetStepTimer(next, poseStep);
      return {
        state: next,
        nextPoseStep: poseStep,
        passed: false,
        reason: null,
        status: "Turn a bit more right.",
        debug,
      };
    }

    next.sideTwoFrames += 1;
    next.maxSideTwoYaw = Math.max(next.maxSideTwoYaw, absYaw);
    const stepTiming = markStepValid(next, poseStep, nowMs);
    const stepDebug = {
      ...debug,
      requiredHoldMs: config.sideHoldMs,
      stableFrames: next.stableFaceFrames,
      stepPassed: stepTiming.stepStableMs >= config.sideHoldMs,
      stepPassedAtMs: stepTiming.stepStableMs >= config.sideHoldMs ? nowMs : 0,
      stepStableMs: stepTiming.stepStableMs,
      stepValidSinceMs: stepTiming.stepValidSinceMs,
    };

    if (stepTiming.stepStableMs >= config.sideHoldMs) {
      next.sideTwoPassedAtMs = nowMs;
      return {
        state: next,
        nextPoseStep: "done",
        passed: true,
        reason: null,
        status: "Finishing verification...",
        debug: stepDebug,
      };
    }

    return {
      state: next,
      nextPoseStep: poseStep,
      passed: false,
      reason: null,
      status: "Hold still for a moment.",
      debug: stepDebug,
    };
  }

  return {
    state: next,
    nextPoseStep: poseStep,
    passed: false,
    reason: null,
    status: "Center your face in the oval.",
    debug,
  };
};

export const classifyNativeHumanDetectorTimeout = (
  state: NativeHumanDetectionState,
): NativeHumanDetectorFailure => {
  if (state.callbackFrames <= 0) return "detector_unavailable";
  if (state.stableFaceFrames <= 0 && state.noFaceFrames > 0) return "no_face";
  return "timeout";
};

export const getNativeHumanMovementMetrics = (state: NativeHumanDetectionState) => {
  const minYaw = Math.min(state.minYaw, 0);
  const maxYaw = Math.max(state.maxYaw, 0);
  const horizontalShift = (maxYaw - minYaw) / 90;
  const leftTravel = Math.abs(minYaw) / 45;
  const rightTravel = maxYaw / 45;

  return {
    horizontalShift,
    leftTravel,
    maxYaw,
    minYaw,
    rightTravel,
    verticalShift: 0,
    upTravel: 0,
    downTravel: 0,
  };
};

export const hasNativeHumanLivenessPass = (
  state: NativeHumanDetectionState,
  _config?: NativeHumanDetectorConfig,
) => {
  const movement = getNativeHumanMovementMetrics(state);
  return (
    state.centerPassedAtMs > 0 &&
    state.sideOnePassedAtMs > 0 &&
    state.sideTwoPassedAtMs > 0 &&
    movement.horizontalShift >= 0.36 &&
    movement.leftTravel >= 0.12 &&
    movement.rightTravel >= 0.12
  );
};

export const buildNativeHumanResultPayload = ({
  challengeType,
  completed,
  instruction,
  reason,
  state,
}: {
  challengeType: string;
  completed: boolean;
  instruction: string;
  reason?: NativeHumanDetectorFailure | "movement_threshold_not_met" | null;
  state: NativeHumanDetectionState;
}) => {
  const movement = getNativeHumanMovementMetrics(state);
  return {
    challengeType,
    instruction,
    runtime: "native",
    verifier: "native_mlkit_face_detector",
    reason: completed ? undefined : reason || "movement_threshold_not_met",
    detectedFrames: state.stableFaceFrames,
    totalFrames: state.totalFrames,
    rejectedFrames: state.rejectedFrames,
    qualityScore: completed ? 0.92 : 0.22,
    centerFrames: state.centerFrames,
    leftFrames: state.sideOneFrames,
    rightFrames: state.sideTwoFrames,
    firstYawSign: state.firstYawSign,
    maxSideOneYaw: state.maxSideOneYaw,
    maxSideTwoYaw: state.maxSideTwoYaw,
    ...movement,
    requiredDurationMs: 3000,
    movementScore: Math.min(1, movement.horizontalShift),
    completedSteps: completed ? ["center", "left", "right"] : undefined,
    completedAt: completed ? new Date().toISOString() : undefined,
  };
};
