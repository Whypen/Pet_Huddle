import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildNativeHumanResultPayload,
  classifyNativeHumanDetectorTimeout,
  createNativeHumanDetectionState,
  mapNativeHumanFaceBoundsToPreview,
  processNativeHumanDetectorFrame,
} from "../src/lib/nativeVerifyIdentityHumanDetector.ts";
import { getNativeHumanScanVisualState } from "../src/lib/nativeVerifyIdentityHumanVisualState.ts";
import { resolveNativeSettingsDrawerNavigation } from "../src/lib/nativeVerifyIdentityRouteOwnership.ts";

const config = {
  centerHoldMs: 1500,
  centerYawMax: 8,
  faceMaxPitch: 24,
  faceMaxRoll: 24,
  faceMaxWidthRatio: 0.78,
  faceMinWidthRatio: 0.16,
  ovalHeight: 260,
  ovalWidth: 210,
  sideHoldMs: 1000,
  sideYawMin: 12,
};

const frame = { width: 1000, height: 1000 };
const preview = { width: 360, height: 360 };
const face = (yawAngle, bounds = { x: 375, y: 300, width: 250, height: 320 }) => ({
  bounds,
  pitchAngle: 0,
  rollAngle: 0,
  yawAngle,
});

const repoRoot = resolve(import.meta.dirname, "../..");
const rootNavigatorSource = readFileSync(resolve(repoRoot, "app/src/navigation/RootNavigator.tsx"), "utf8");
const verifyIdentitySource = readFileSync(resolve(repoRoot, "app/src/screens/NativeVerifyIdentityScreen.tsx"), "utf8");
const editProfileSource = readFileSync(resolve(repoRoot, "app/src/screens/NativeEditProfileScreen.tsx"), "utf8");
const nativeFunctionClientSource = readFileSync(resolve(repoRoot, "app/src/lib/nativeFunctionClient.ts"), "utf8");
const nativePhoneOtpSource = readFileSync(resolve(repoRoot, "app/src/lib/nativePhoneOtp.ts"), "utf8");
const nativeVerifyIdentityPhoneOtpSource = readFileSync(resolve(repoRoot, "app/src/lib/nativeVerifyIdentityPhoneOtpModel.ts"), "utf8");
const nativeVerifyIdentitySource = readFileSync(resolve(repoRoot, "app/src/lib/nativeVerifyIdentity.ts"), "utf8");
const nativeCardModelSource = readFileSync(resolve(repoRoot, "app/src/lib/nativeVerifyIdentityCardModel.ts"), "utf8");
const createIdentitySetupIntentSource = readFileSync(resolve(repoRoot, "supabase/functions/create-identity-setup-intent/index.ts"), "utf8");
const reactNativeConfigSource = readFileSync(resolve(repoRoot, "app/react-native.config.js"), "utf8");
const metroConfigSource = readFileSync(resolve(repoRoot, "app/metro.config.js"), "utf8");
const podfileProperties = readFileSync(resolve(repoRoot, "app/ios/Podfile.properties.json"), "utf8");

// PHONE OTP: Verify Identity must wrap the same shared native OTP config as Edit Profile.
assert.match(editProfileSource, /requestNativePhoneOtp\(phone, phoneOtpTurnstileToken\)/);
assert.match(editProfileSource, /verifyNativePhoneOtp\(phone, phoneOtpCode\)/);
assert.match(nativeVerifyIdentityPhoneOtpSource, /requestNativePhoneOtp\(phone, turnstileToken\)/);
assert.match(nativeVerifyIdentityPhoneOtpSource, /verifyNativePhoneOtp\(state\.phone, code\)/);
assert.match(nativePhoneOtpSource, /createNativeFunctionHeaders\(accessToken\)/);
assert.match(nativeFunctionClientSource, /headers\["x-huddle-access-token"\]/);
assert.match(nativePhoneOtpSource, /isNativePhoneCountryAllowed\(normalized\)/);
assert.match(nativePhoneOtpSource, /turnstile_action:\s*"send_pre_signup_verify"/);
assert.match(nativePhoneOtpSource, /challenge_id:\s*challenge\.challengeId/);
assert.match(nativePhoneOtpSource, /mapVerifyOtpFailure/);
assert.match(nativeVerifyIdentityPhoneOtpSource, /case "send_succeeded":[\s\S]*state: "sent"/);
assert.match(nativeVerifyIdentityPhoneOtpSource, /case "verify_succeeded":[\s\S]*state: "verified"[\s\S]*cooldownSeconds: 0/);
assert.match(verifyIdentitySource, /setActiveCard\(next\.error \? "phone" : null\)/);

// VERIFY CARD: SetupIntent, 3DS return, backend status, timeout, and sanitized function errors.
assert.match(nativeVerifyIdentitySource, /"create-identity-setup-intent"[\s\S]*action:\s*"create"/);
assert.match(nativeVerifyIdentitySource, /"create-identity-setup-intent"[\s\S]*action:\s*"status"/);
assert.match(verifyIdentitySource, /await initStripe\(\{ publishableKey: next\.publishableKey \}\)/);
assert.match(verifyIdentitySource, /confirmSetupIntent\(started\.clientSecret/);
assert.match(verifyIdentitySource, /paymentMethodType:\s*"Card"/);
assert.match(verifyIdentitySource, /paymentMethodData:[\s\S]*billingDetails:[\s\S]*name: started\.legalName\.trim\(\) \|\| undefined/);
assert.match(verifyIdentitySource, /withNativeVerifyIdentityTimeout\([\s\S]*confirmSetupIntent/);
assert.match(verifyIdentitySource, /CARD_BACKEND_TIMEOUT_MS = 8000/);
assert.match(verifyIdentitySource, /Card verification is taking too long\. Please try again\./);
assert.match(nativeCardModelSource, /status === "succeeded" \|\| status === "processing"/);
assert.match(nativeCardModelSource, /state: "checking_card"/);
assert.match(nativeCardModelSource, /result\.cardStatus === "passed"/);
assert.match(nativeCardModelSource, /state: "passed"/);
assert.match(createIdentitySetupIntentSource, /sanitizeSetupIntentError/);
assert.match(createIdentitySetupIntentSource, /public_message: sanitized\.publicMessage/);
assert.doesNotMatch(createIdentitySetupIntentSource, /json\(\{ error: message \|\| "unknown_error" \}/);
assert.match(nativeCardModelSource, /case "setup_succeeded":[\s\S]*state: "collecting"/);
assert.match(nativeCardModelSource, /state: "ready"/);
assert.match(nativeCardModelSource, /case "submit_started":[\s\S]*state: "opening_3ds"/);
assert.match(nativeCardModelSource, /case "stripe_returned":[\s\S]*mapStripeReturn/);
assert.match(nativeCardModelSource, /status === "succeeded" \|\| status === "processing"[\s\S]*state: "checking_card"/);
assert.match(nativeCardModelSource, /result\.cardStatus === "passed"[\s\S]*state: "passed"/);
assert.match(verifyIdentitySource, /shouldStopNativeVerifyIdentityCardPolling\(pendingCardPolls\)[\s\S]*Card verification is taking too long\. Please try again\./);

// A. ROUTE OWNERSHIP
const fromSettings = resolveNativeSettingsDrawerNavigation("/verify-identity?from=settings");
assert.equal(fromSettings.path, "/verify-identity?from=settings");
assert.equal(fromSettings.overlay, null);
assert.equal(fromSettings.closeSettings, true);
assert.equal(fromSettings.returnToSettings, true);

// B. OVERLAY REGRESSION
assert.equal(rootNavigatorSource.includes('settingsOverlay === "verifyIdentity"'), false);
assert.equal(rootNavigatorSource.includes('setSettingsOverlay("verifyIdentity")'), false);
assert.match(rootNavigatorSource, /settingsOverlayHost:[\s\S]*backgroundColor:\s*huddleColors\.canvas/);
assert.match(podfileProperties, /"newArchEnabled":\s*"false"/);
assert.doesNotMatch(reactNativeConfigSource, /platforms:\s*\{\s*ios:\s*null/);
assert.doesNotMatch(reactNativeConfigSource, /HUDDLE_SIMULATOR_UI_BUILD/);
assert.match(metroConfigSource, /normalizeEncodedRelativeAssetPath/);
assert.match(metroConfigSource, /replace\(\/%2F\/gi/);

// C. DETECTOR STATE CLASSIFICATION
assert.equal(classifyNativeHumanDetectorTimeout(createNativeHumanDetectionState()), "detector_unavailable");
let state = createNativeHumanDetectionState();
let result = processNativeHumanDetectorFrame(state, [], frame, preview, "center", config);
assert.equal(result.reason, "no_face");
assert.equal(classifyNativeHumanDetectorTimeout(result.state), "no_face");
result = processNativeHumanDetectorFrame(state, [face(0, { x: 0, y: 0, width: 250, height: 260 })], frame, preview, "center", config);
assert.equal(result.reason, "face_outside_frame");
state = createNativeHumanDetectionState();
let pose = "center";
let nowMs = 1000;
result = processNativeHumanDetectorFrame(state, [face(0)], frame, preview, pose, config, nowMs);
assert.equal(result.debug.stepPassed, false);
assert.equal(result.debug.stepStableMs, 0);
state = result.state;
nowMs += 300;
for (let index = 1; index < 6; index += 1) {
  result = processNativeHumanDetectorFrame(state, [face(0)], frame, preview, pose, config, nowMs);
  state = result.state;
  pose = result.nextPoseStep;
  nowMs += 300;
}
assert.equal(pose, "left");
assert.equal(result.debug.stepPassed, true);
assert.ok(Number(result.debug.stepStableMs) >= config.centerHoldMs);

// C. DEVICE MAPPING: iOS reports landscape frame dimensions while MLKit bounds are portrait-oriented.
const deviceFrame = { width: 1920, height: 1080 };
const devicePreview = { width: 327, height: 360 };
const centeredDeviceFace = face(0, { x: 58, y: 510, width: 951, height: 951 });
const mappedDeviceFace = mapNativeHumanFaceBoundsToPreview(centeredDeviceFace, deviceFrame, devicePreview);
assert.match(String(mappedDeviceFace.mappingVariant), /^landscape_reported_portrait_coords/);
assert.ok(Math.abs(mappedDeviceFace.x + mappedDeviceFace.width / 2 - devicePreview.width / 2) < 8);
assert.ok(Math.abs(mappedDeviceFace.y + mappedDeviceFace.height / 2 - devicePreview.height / 2) < 12);
result = processNativeHumanDetectorFrame(createNativeHumanDetectionState(), [centeredDeviceFace], deviceFrame, devicePreview, "center", config);
assert.equal(result.reason, null);
assert.match(String(result.debug.mappingVariant), /^landscape_reported_portrait_coords/);
assert.equal(result.debug.faceCenterInsideOval, true);
assert.ok(Number(result.debug.ovalOverlapRatio) >= 0.70);
assert.ok(Number(result.debug.faceWidthRatio) > 0.45 && Number(result.debug.faceWidthRatio) < 0.55);

const highDeviceFace = face(0, { x: 58, y: -200, width: 951, height: 951 });
result = processNativeHumanDetectorFrame(createNativeHumanDetectionState(), [highDeviceFace], deviceFrame, devicePreview, "center", config);
assert.equal(result.reason, "face_outside_frame");
assert.match(String(result.debug.mappingVariant), /^landscape_reported_portrait_coords/);

const offOvalDeviceFace = face(0, { x: 500, y: 510, width: 951, height: 951 });
result = processNativeHumanDetectorFrame(createNativeHumanDetectionState(), [offOvalDeviceFace], deviceFrame, devicePreview, "center", config);
assert.equal(result.reason, "face_outside_frame");
assert.match(String(result.debug.mappingVariant), /^landscape_reported_portrait_coords/);

const tooCloseDeviceFace = face(0, { x: -310, y: 160, width: 1700, height: 1700 });
result = processNativeHumanDetectorFrame(createNativeHumanDetectionState(), [tooCloseDeviceFace], deviceFrame, devicePreview, "center", config);
assert.equal(result.reason, "face_size_invalid");
assert.ok(result.debug.mappingVariant);

const tooFarDeviceFace = face(0, { x: 480, y: 900, width: 120, height: 120 });
result = processNativeHumanDetectorFrame(createNativeHumanDetectionState(), [tooFarDeviceFace], deviceFrame, devicePreview, "center", config);
assert.equal(result.reason, "face_size_invalid");
assert.ok(result.debug.mappingVariant);

// D. LIVENESS SEQUENCE: Center -> Left -> Right.
state = createNativeHumanDetectionState();
pose = "center";
nowMs = 5000;
for (let index = 0; index < 6; index += 1) {
  result = processNativeHumanDetectorFrame(state, [face(0)], frame, preview, pose, config, nowMs);
  state = result.state;
  pose = result.nextPoseStep;
  nowMs += 300;
}
assert.equal(result.debug.stepPassed, true);
assert.ok(Number(result.debug.stepStableMs) >= config.sideHoldMs);
for (let index = 0; index < 3; index += 1) {
  result = processNativeHumanDetectorFrame(state, [face(-16)], frame, preview, pose, config, nowMs);
  if (index === 0) assert.equal(result.debug.stepPassed, false);
  state = result.state;
  pose = result.nextPoseStep;
  nowMs += 500;
}
assert.equal(state.firstYawSign, -1);
assert.equal(pose, "right");
assert.equal(result.debug.stepPassed, true);
assert.ok(Number(result.debug.stepStableMs) >= config.sideHoldMs);
result = processNativeHumanDetectorFrame(state, [face(-16)], frame, preview, pose, config, nowMs);
assert.equal(result.reason, "same_side_repeat");
assert.match(verifyIdentitySource, /result\.reason === "same_side_repeat"[\s\S]*failHumanCapture/);
for (let index = 0; index < 3; index += 1) {
  result = processNativeHumanDetectorFrame(state, [face(16)], frame, preview, pose, config, nowMs);
  state = result.state;
  pose = result.nextPoseStep;
  nowMs += 500;
}
assert.equal(result.passed, true);
assert.equal(result.debug.stepPassed, true);
assert.equal(pose, "done");
const passedLivenessState = state;

// D. LIVENESS SEQUENCE: right before left does not advance.
state = createNativeHumanDetectionState();
pose = "center";
nowMs = 10000;
for (let index = 0; index < 6; index += 1) {
  result = processNativeHumanDetectorFrame(state, [face(0)], frame, preview, pose, config, nowMs);
  state = result.state;
  pose = result.nextPoseStep;
  nowMs += 300;
}
for (let index = 0; index < 3; index += 1) {
  result = processNativeHumanDetectorFrame(state, [face(16)], frame, preview, pose, config, nowMs);
  state = result.state;
  pose = result.nextPoseStep;
  nowMs += 500;
}
assert.equal(state.firstYawSign, 0);
assert.equal(state.sideOneFrames, 0);
assert.equal(pose, "left");

// E. BACKEND PAYLOAD
const passPayload = buildNativeHumanResultPayload({
  challengeType: "turn_left_right",
  instruction: "Slowly turn your head left, then right.",
  state: passedLivenessState,
  completed: true,
});
assert.equal(passPayload.verifier, "native_mlkit_face_detector");
assert.equal(passPayload.challengeType, "turn_left_right");
assert.ok(Number(passPayload.detectedFrames) >= 6);
assert.ok(Number(passPayload.requiredDurationMs) >= 3000);
assert.ok(0.92 >= 0.7);
assert.ok(Number(passPayload.qualityScore) >= 0.7);
assert.ok(Number(passPayload.leftTravel) >= 0.12);
assert.ok(Number(passPayload.rightTravel) >= 0.12);
assert.ok(Number(passPayload.firstYawSign) !== 0);

const failPayload = buildNativeHumanResultPayload({
  challengeType: "turn_left_right",
  instruction: "Slowly turn your head left, then right.",
  reason: "no_face",
  state: createNativeHumanDetectionState(),
  completed: false,
});
assert.equal(failPayload.challengeType, "turn_left_right");
assert.equal(failPayload.reason, "no_face");

assert.doesNotMatch(verifyIdentitySource, /SIMULATOR_UI_BUILD/);
assert.doesNotMatch(verifyIdentitySource, /capture_blocked/);
assert.match(verifyIdentitySource, /const pending = humanState\.state === "pending"/);
assert.match(verifyIdentitySource, /const completedOrFinishing = passed \|\| poseStep === "done" \|\| pending/);
assert.match(verifyIdentitySource, /const showDetectorCamera = capturing && !completedOrFinishing && cameraGranted && Boolean\(device\) && detectorReady/);
assert.match(verifyIdentitySource, /styles\.humanOvalCenterRing/);
assert.match(verifyIdentitySource, /styles\.humanOvalLeftClip/);
assert.match(verifyIdentitySource, /styles\.humanOvalRightClip/);
assert.match(verifyIdentitySource, /Center full ring/);
assert.match(verifyIdentitySource, /Left half arc/);
assert.match(verifyIdentitySource, /Right half arc/);
assert.match(verifyIdentitySource, /captureOverlay: dark scrim only exists while the live detector camera is active/);
assert.match(verifyIdentitySource, /const centerPassed = completedSteps\.center \|\| passed/);
assert.match(verifyIdentitySource, /const leftPassed = completedSteps\.left \|\| passed/);
assert.match(verifyIdentitySource, /const rightPassed = completedSteps\.right \|\| passed/);
assert.match(verifyIdentitySource, /getNativeHumanScanVisualState/);
assert.match(verifyIdentitySource, /const showLeftScanArc = showScanOverlay && scanVisual\.showLeftArc/);
assert.match(verifyIdentitySource, /const showRightScanArc = showScanOverlay && scanVisual\.showRightArc/);
assert.match(verifyIdentitySource, /\{showLeftScanArc \? \(/);
assert.match(verifyIdentitySource, /\{showRightScanArc \? \(/);
assert.match(verifyIdentitySource, /scanVisual\.leftColor === "done" \? styles\.humanOvalSegmentDone : styles\.humanOvalSegmentActive/);
assert.match(verifyIdentitySource, /scanVisual\.rightColor === "done" \? styles\.humanOvalSegmentDone : styles\.humanOvalSegmentActive/);
assert.doesNotMatch(verifyIdentitySource, /leftPassed \|\| leftConfirmed \? styles\.humanOvalSegmentDone/);
assert.doesNotMatch(verifyIdentitySource, /rightPassed \|\| rightConfirmed \? styles\.humanOvalSegmentDone/);
assert.doesNotMatch(verifyIdentitySource, /const completedStep =/);
assert.match(verifyIdentitySource, /const HUMAN_SETTLE_MS = 420/);
assert.match(verifyIdentitySource, /const HUMAN_STEP_YAW_START_GRACE_MS = 500/);
assert.match(verifyIdentitySource, /humanSettleRef\.current/);
assert.match(verifyIdentitySource, /nativeHumanDevLog\("frame_settle"/);
assert.match(verifyIdentitySource, /nativeHumanDevLog\("frame_step_start_grace"/);
assert.match(verifyIdentitySource, /yawEvaluationEnabled: false/);
assert.match(verifyIdentitySource, /stepAgeMs < HUMAN_SETTLE_MS \+ HUMAN_STEP_YAW_START_GRACE_MS/);
assert.match(verifyIdentitySource, /if \(settle && nowMs < settle\.until\)/);
assert.match(verifyIdentitySource, /resetHumanStepEvaluation\(target, "step"\)/);
assert.match(verifyIdentitySource, /setHumanFaceStatus\(target === "left" \? "Now turn left\." : "Now turn right\."\)/);
assert.match(verifyIdentitySource, /const retryHumanCurrentStep = useCallback/);
assert.match(verifyIdentitySource, /retryHumanCurrentStep\(\)/);
assert.match(verifyIdentitySource, /resetHumanRuntimeState\(\)/);
assert.match(verifyIdentitySource, /showDetectorCamera \? <View pointerEvents="none" style=\{styles\.humanOvalScrim\} \/> : null/);
assert.match(verifyIdentitySource, /function HumanPendingBrandLoader/);
assert.match(verifyIdentitySource, /useVideoPlayer\(huddleVideo/);
assert.match(verifyIdentitySource, /Image source=\{huddleVideoFallback\}/);
assert.match(verifyIdentitySource, /VideoView/);
assert.match(verifyIdentitySource, /const showPendingBrandLoader = pending/);
assert.match(verifyIdentitySource, /const showScanOverlay = !showPendingBrandLoader && !passed/);
assert.match(verifyIdentitySource, /\{showPendingBrandLoader \? <HumanPendingBrandLoader \/> : null\}/);
assert.match(verifyIdentitySource, /!showDetectorCamera && showScanOverlay \? <View pointerEvents="none" style=\{\[styles\.humanOvalBase, styles\.humanOvalBaseIdle\]\} \/> : null/);
assert.match(verifyIdentitySource, /const showCenterScanRing = showScanOverlay &&/);
assert.match(verifyIdentitySource, /humanStateNameRef\.current = "pending"[\s\S]*setHumanDwell\(null\)[\s\S]*setHumanSettlePhase\(null\)[\s\S]*setHumanState\(captured\)/);
assert.match(verifyIdentitySource, /humanStateNameRef\.current !== "capturing"/);
assert.match(verifyIdentitySource, /Confirming your check… Almost done\./);
assert.match(verifyIdentitySource, /Completed ✓/);
assert.match(verifyIdentitySource, /Let's try again with better lighting and slower turns\./);
assert.match(verifyIdentitySource, /Connection dropped before we could finish\. Let's try again\?/);
assert.match(verifyIdentitySource, /humanState\.state === "failed"[\s\S]*\? "Try again"/);
assert.match(verifyIdentitySource, /UI: humanPoseStep === "center" \? "center_full_ring"/);
assert.match(verifyIdentitySource, /nextSnapshot\.humanStatus === "passed" \|\| nextProfile\.humanStatus === "passed"[\s\S]*setHumanState/);
assert.match(verifyIdentitySource, /setActiveCard\(\(current\) => current === "human" \? null : current\)/);
assert.match(verifyIdentitySource, /nextSnapshot\.cardStatus === "passed" \|\| nextProfile\.cardStatus === "passed" \|\| nextProfile\.cardVerified[\s\S]*setCardState/);
assert.match(verifyIdentitySource, /active=\{!identityFullyVerified && activeCard === "human"\}/);
assert.doesNotMatch(verifyIdentitySource, /active=\{!identityFullyVerified && \(activeCard === "human" \|\| humanPassed\)\}/);
assert.match(verifyIdentitySource, /if \(!identityFullyVerified \|\| !activeCard\) return;[\s\S]*setActiveCard\(null\)/);
assert.match(verifyIdentitySource, /const effectiveHumanState/);
assert.match(verifyIdentitySource, /const effectiveCardState/);
assert.match(verifyIdentitySource, /void refreshAll\("manual"\);[\s\S]*setActiveCard\(\(current\) => current === "card" \? null : "card"\)/);
assert.match(verifyIdentitySource, /Keyboard\.addListener\("keyboardDidShow"/);
assert.match(verifyIdentitySource, /scrollRef\.current\?\.scrollTo\(\{ y: CARD_SCROLL_INPUT_Y, animated: true \}\)/);
assert.match(verifyIdentitySource, /contentContainerStyle=\{\[styles\.content, \{ paddingBottom: insets\.bottom \+ huddleSpacing\.x7 \+ keyboardHeight \}\]\}/);
assert.match(verifyIdentitySource, /showLegalNameError=\{cardSubmitAttempted\}/);
assert.match(verifyIdentitySource, /showLegalNameError && !cardState\.legalName\.trim\(\)/);
assert.doesNotMatch(verifyIdentitySource, /\{!cardState\.legalName\.trim\(\) \? <Text style=\{styles\.fieldErrorSubtext\}>Legal name is required before card verification\.<\/Text> : null\}/);
assert.match(verifyIdentitySource, /UI: `\$\{step\}_green_confirmation`/);
assert.match(verifyIdentitySource, /UI: `\$\{target\}_prompt`/);
assert.match(verifyIdentitySource, /humanDwellGenerationRef\.current \+= 1/);
assert.match(verifyIdentitySource, /clearTimeout\(humanDwellTimerRef\.current\)/);
assert.match(verifyIdentitySource, /activeCardRef\.current !== "human"/);
assert.match(verifyIdentitySource, /humanStateNameRef\.current !== "capturing"/);
assert.match(verifyIdentitySource, /humanConfirmationDwellRef\.current !== dwell/);
assert.match(verifyIdentitySource, /return \(\) => \{/);
assert.match(verifyIdentitySource, /class HumanDetectorBoundary/);
assert.match(verifyIdentitySource, /camera_runtime_error/);
assert.match(verifyIdentitySource, /preview_layout_unavailable/);
assert.doesNotMatch(verifyIdentitySource, /Camera as VisionCamera/);
assert.doesNotMatch(verifyIdentitySource, /centerFrames >=/);
assert.doesNotMatch(verifyIdentitySource, /sideOneFrames >=/);
assert.doesNotMatch(verifyIdentitySource, /sideTwoFrames >=/);

const visualTruthTable = [
  {
    name: "center-active",
    input: { currentStep: "center", confirmationDwellStep: null, settleTarget: null, failed: false },
    expected: { showCenterRing: true, showLeftArc: false, showRightArc: false, centerColor: "active", leftColor: "hidden", rightColor: "hidden" },
  },
  {
    name: "center-dwell",
    input: { currentStep: "center", confirmationDwellStep: "center", settleTarget: null, failed: false },
    expected: { showCenterRing: true, showLeftArc: false, showRightArc: false, centerColor: "done", leftColor: "hidden", rightColor: "hidden" },
  },
  {
    name: "settle-to-left",
    input: { currentStep: "left", confirmationDwellStep: null, settleTarget: "left", failed: false },
    expected: { showCenterRing: false, showLeftArc: false, showRightArc: false, centerColor: "hidden", leftColor: "hidden", rightColor: "hidden" },
  },
  {
    name: "left-active-after-center",
    input: { currentStep: "left", confirmationDwellStep: null, settleTarget: null, failed: false },
    expected: { showCenterRing: false, showLeftArc: true, showRightArc: false, centerColor: "hidden", leftColor: "active", rightColor: "hidden" },
  },
  {
    name: "left-dwell",
    input: { currentStep: "left", confirmationDwellStep: "left", settleTarget: null, failed: false },
    expected: { showCenterRing: false, showLeftArc: true, showRightArc: false, centerColor: "hidden", leftColor: "done", rightColor: "hidden" },
  },
  {
    name: "settle-to-right",
    input: { currentStep: "right", confirmationDwellStep: null, settleTarget: "right", failed: false },
    expected: { showCenterRing: false, showLeftArc: false, showRightArc: false, centerColor: "hidden", leftColor: "hidden", rightColor: "hidden" },
  },
  {
    name: "right-active-after-left",
    input: { currentStep: "right", confirmationDwellStep: null, settleTarget: null, failed: false },
    expected: { showCenterRing: false, showLeftArc: false, showRightArc: true, centerColor: "hidden", leftColor: "hidden", rightColor: "active" },
  },
  {
    name: "right-dwell",
    input: { currentStep: "right", confirmationDwellStep: "right", settleTarget: null, failed: false },
    expected: { showCenterRing: false, showLeftArc: false, showRightArc: true, centerColor: "hidden", leftColor: "hidden", rightColor: "done" },
  },
  {
    name: "failed-right",
    input: { currentStep: "right", confirmationDwellStep: null, settleTarget: null, failed: true },
    expected: { showCenterRing: false, showLeftArc: false, showRightArc: false, centerColor: "hidden", leftColor: "hidden", rightColor: "hidden" },
  },
];

for (const row of visualTruthTable) {
  assert.deepEqual(
    getNativeHumanScanVisualState(row.input),
    {
      ...row.expected,
      centerConfirmed: row.input.confirmationDwellStep === "center",
      leftConfirmed: row.input.confirmationDwellStep === "left",
      rightConfirmed: row.input.confirmationDwellStep === "right",
      visualActiveStep: row.input.failed
        ? null
        : row.input.confirmationDwellStep
          ? row.input.confirmationDwellStep
          : row.input.settleTarget
            ? row.input.settleTarget === "submit" ? "checking" : "settle"
            : row.input.currentStep === "done" ? "checking" : row.input.currentStep,
    },
    row.name,
  );
}

console.log("verifyIdentityHarness: PASS");
