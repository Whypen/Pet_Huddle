import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createNativeHumanDetectionState,
  hasNativeHumanLivenessPass,
  NATIVE_HUMAN_SIDE_YAW_MIN_DEGREES,
  processNativeHumanDetectorFrame,
  type NativeHumanDetectionState,
  type NativeHumanDetectorConfig,
  type NativeHumanPoseStep,
} from "./nativeVerifyIdentityHumanDetector";

const config: NativeHumanDetectorConfig = {
  centerHoldMs: 1_500,
  centerYawMax: 8,
  faceMaxPitch: 24,
  faceMaxRoll: 24,
  faceMaxWidthRatio: 0.78,
  faceMinWidthRatio: 0.16,
  ovalHeight: 310,
  ovalWidth: 230,
  sideHoldMs: 800,
  sideYawMin: NATIVE_HUMAN_SIDE_YAW_MIN_DEGREES,
};

const preview = { width: 360, height: 360 };
const frame = { width: 360, height: 360 };
const face = (yawAngle: number) => ({
  bounds: { x: 120, y: 85, width: 120, height: 190 },
  pitchAngle: 0,
  rollAngle: 0,
  yawAngle,
});

const detect = (
  state: NativeHumanDetectionState,
  yawAngle: number,
  poseStep: NativeHumanPoseStep,
  nowMs: number,
) => processNativeHumanDetectorFrame(state, [face(yawAngle)], frame, preview, poseStep, config, nowMs);

describe("native human detector contract", () => {
  it("passes the low-friction center, left, and right sequence at the displayed threshold", () => {
    let state = createNativeHumanDetectionState();

    state = detect(state, 0, "center", 1_000).state;
    const center = detect(state, 0, "center", 2_501);
    expect(center.debug.stepPassed).toBe(true);
    expect(center.nextPoseStep).toBe("left");

    state = detect(center.state, -NATIVE_HUMAN_SIDE_YAW_MIN_DEGREES, "left", 3_000).state;
    const left = detect(state, -NATIVE_HUMAN_SIDE_YAW_MIN_DEGREES, "left", 3_801);
    expect(left.debug.stepPassed).toBe(true);
    expect(left.nextPoseStep).toBe("right");

    state = detect(left.state, NATIVE_HUMAN_SIDE_YAW_MIN_DEGREES, "right", 4_300).state;
    const right = detect(state, NATIVE_HUMAN_SIDE_YAW_MIN_DEGREES, "right", 5_101);
    expect(right.debug.stepPassed).toBe(true);
    expect(right.nextPoseStep).toBe("done");
    expect(hasNativeHumanLivenessPass(right.state, config)).toBe(true);
  });

  it("does not complete a side step below the displayed threshold", () => {
    const result = detect(
      createNativeHumanDetectionState(),
      NATIVE_HUMAN_SIDE_YAW_MIN_DEGREES - 1,
      "left",
      1_000,
    );

    expect(result.debug.stepPassed).not.toBe(true);
    expect(result.nextPoseStep).toBe("left");
  });

  it("requires the second turn to be in the opposite direction", () => {
    let state = createNativeHumanDetectionState();
    state = detect(state, -NATIVE_HUMAN_SIDE_YAW_MIN_DEGREES, "left", 1_000).state;
    state = detect(state, -NATIVE_HUMAN_SIDE_YAW_MIN_DEGREES, "left", 1_801).state;

    const repeatedDirection = detect(
      state,
      -NATIVE_HUMAN_SIDE_YAW_MIN_DEGREES,
      "right",
      2_000,
    );

    expect(repeatedDirection.debug.stepPassed).not.toBe(true);
    expect(repeatedDirection.nextPoseStep).toBe("right");
    expect(repeatedDirection.status).toBe("Turn the other way.");
  });

  it("keeps the deployed edge threshold aligned with the mobile threshold", () => {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const edgeSource = readFileSync(
      resolve(currentDir, "../../../supabase/functions/verify-human-challenge/index.ts"),
      "utf8",
    );

    expect(edgeSource).toContain(
      `const HUMAN_SIDE_YAW_MIN_DEGREES = ${NATIVE_HUMAN_SIDE_YAW_MIN_DEGREES};`,
    );
    expect(edgeSource).toContain(
      "const HUMAN_HORIZONTAL_SHIFT_MIN = (HUMAN_SIDE_YAW_MIN_DEGREES * 2) / 90;",
    );
    expect(edgeSource).toContain(
      "const HUMAN_SIDE_TRAVEL_MIN = HUMAN_SIDE_YAW_MIN_DEGREES / 45;",
    );
  });
});
