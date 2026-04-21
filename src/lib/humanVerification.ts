import { pickFiles } from "@/lib/nativeShell";

export type HumanChallenge = {
  challengeType: string;
  instruction: string;
  issuedAt: string;
  expiresInSec: number;
};

export type HumanVerificationRunResult = {
  passed: boolean;
  score: number;
  resultPayload: Record<string, unknown>;
  evidenceBlob: Blob | null;
};

type HumanVerificationRunOptions = {
  minDurationMs?: number;
  onPreviewStream?: (stream: MediaStream | null) => void;
};

type FrameStats = {
  meanDiff: number;
  maxDiff: number;
};

const computeFrameDiff = (prev: Uint8ClampedArray, next: Uint8ClampedArray): FrameStats => {
  const step = 4; // RGBA
  let accum = 0;
  let max = 0;
  let count = 0;
  for (let i = 0; i < prev.length && i < next.length; i += step) {
    const dr = Math.abs(prev[i] - next[i]);
    const dg = Math.abs(prev[i + 1] - next[i + 1]);
    const db = Math.abs(prev[i + 2] - next[i + 2]);
    const diff = (dr + dg + db) / 3;
    accum += diff;
    if (diff > max) max = diff;
    count += 1;
  }
  return {
    meanDiff: count > 0 ? accum / count : 0,
    maxDiff: max,
  };
};

type MediaPipeFaceLandmarker = {
  detectForVideo: (
    video: HTMLVideoElement,
    timestampMs: number,
  ) => {
    faceLandmarks?: Array<Array<{ x: number; y: number; z?: number }>>;
  };
  close?: () => void;
};

const MEDIAPIPE_VERSION = "0.10.14";
const MEDIAPIPE_WASM_URLS = [
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`,
  `https://unpkg.com/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`,
];
const MEDIAPIPE_MODULE_URLS = [
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`,
  `https://unpkg.com/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`,
];
const MEDIAPIPE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let mediaPipeImportPromise: Promise<unknown> | null = null;
let mediaPipeModuleUrl: string | null = null;

async function importWithTimeout(url: string, timeoutMs = 12000): Promise<unknown> {
  const timeout = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(new Error(`mediapipe_import_timeout:${url}`));
    }, timeoutMs);
  });
  return Promise.race([import(/* @vite-ignore */ url), timeout]);
}

async function loadMediaPipeFaceLandmarker(): Promise<MediaPipeFaceLandmarker> {
  if (!mediaPipeImportPromise) {
    mediaPipeImportPromise = (async () => {
      let lastError: unknown = null;
      for (const url of MEDIAPIPE_MODULE_URLS) {
        try {
          const mod = await importWithTimeout(url);
          mediaPipeModuleUrl = url;
          return mod;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError instanceof Error ? lastError : new Error("mediapipe_import_failed");
    })();
  }
  const vision = (await mediaPipeImportPromise) as {
    FilesetResolver: { forVisionTasks: (url: string) => Promise<unknown> };
    FaceLandmarker: {
      createFromOptions: (resolver: unknown, options: Record<string, unknown>) => Promise<unknown>;
    };
  };
  let lastError: unknown = null;
  const wasmCandidates =
    mediaPipeModuleUrl && mediaPipeModuleUrl.includes("unpkg")
      ? [MEDIAPIPE_WASM_URLS[1], MEDIAPIPE_WASM_URLS[0]]
      : [MEDIAPIPE_WASM_URLS[0], MEDIAPIPE_WASM_URLS[1]];
  for (const wasmUrl of wasmCandidates) {
    try {
      const filesetResolver = await vision.FilesetResolver.forVisionTasks(wasmUrl);
      const landmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath: MEDIAPIPE_MODEL_URL },
        runningMode: "VIDEO",
        numFaces: 1,
      });
      return landmarker as MediaPipeFaceLandmarker;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("mediapipe_wasm_unavailable");
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadMediaPipeWithRetry(maxAttempts = 3): Promise<MediaPipeFaceLandmarker | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await loadMediaPipeFaceLandmarker();
    } catch {
      if (attempt === maxAttempts) return null;
      await wait(250 * attempt);
    }
  }
  return null;
}

export async function prewarmHumanVerificationEngine(): Promise<boolean> {
  const detector = await loadMediaPipeWithRetry(2);
  try {
    detector?.close?.();
  } catch {
    // no-op
  }
  return Boolean(detector);
}

/**
 * MediaPipe-ready local runner.
 * This keeps capture + challenge orchestration in-browser so stricter landmark checks
 * can be swapped in later without changing the verify-identity backend contract.
 */
export async function runHumanVerificationChallenge(
  challenge: HumanChallenge,
  options: HumanVerificationRunOptions = {},
): Promise<HumanVerificationRunResult> {
  let stream: MediaStream | null = null;
  let previewUrl: string | null = null;
  let detector: MediaPipeFaceLandmarker | null = null;
  const video = document.createElement("video");

  try {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      options.onPreviewStream?.(stream);
      video.srcObject = stream;
    } catch (cameraError) {
      options.onPreviewStream?.(null);
      const picked = await pickFiles({
        accept: "video/*,image/*",
        multiple: false,
        source: "camera",
      });
      const fallbackFile = picked[0] || null;
      if (!fallbackFile) throw cameraError;
      if (!fallbackFile.type.startsWith("video/")) {
        throw new Error("native_camera_still_image_only");
      }
      previewUrl = URL.createObjectURL(fallbackFile);
      video.src = previewUrl;
    }

    video.playsInline = true;
    video.muted = true;
    await video.play();
    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("camera_preview_unavailable");
    }

    const requiredDurationMs = Math.max(3000, options.minDurationMs ?? 5000);
    const pollMs = 250;
    const startAt = Date.now();
    const centers: Array<{ x: number; y: number; w: number; h: number; t: number }> = [];
    const motionScores: number[] = [];
    const fallbackCanvas = document.createElement("canvas");
    fallbackCanvas.width = 112;
    fallbackCanvas.height = 84;
    const fallbackCtx = fallbackCanvas.getContext("2d", { willReadFrequently: true });
    let previousFrame: Uint8ClampedArray | null = null;

    detector = await loadMediaPipeWithRetry(3);

    while (Date.now() - startAt < requiredDurationMs) {
      if (detector) {
        const detections = detector.detectForVideo(video, performance.now());
        const face = detections?.faceLandmarks?.[0];
        if (face && face.length > 0) {
          let minX = 1;
          let maxX = 0;
          let minY = 1;
          let maxY = 0;
          for (const point of face) {
            if (point.x < minX) minX = point.x;
            if (point.x > maxX) maxX = point.x;
            if (point.y < minY) minY = point.y;
            if (point.y > maxY) maxY = point.y;
          }
          const wNorm = Math.max(maxX - minX, 0);
          const hNorm = Math.max(maxY - minY, 0);
          if (wNorm > 0.01 && hNorm > 0.01) {
            centers.push({
              x: ((minX + maxX) / 2) * video.videoWidth,
              y: ((minY + maxY) / 2) * video.videoHeight,
              w: wNorm * video.videoWidth,
              h: hNorm * video.videoHeight,
              t: Date.now(),
            });
          }
        }
      } else if (fallbackCtx) {
        fallbackCtx.drawImage(video, 0, 0, fallbackCanvas.width, fallbackCanvas.height);
        const frame = fallbackCtx.getImageData(0, 0, fallbackCanvas.width, fallbackCanvas.height).data;
        if (previousFrame) {
          const stats = computeFrameDiff(previousFrame, frame);
          motionScores.push(stats.meanDiff);
        }
        previousFrame = new Uint8ClampedArray(frame);
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      if (!stream && video.ended) break;
    }

    const width = Math.max(320, video.videoWidth || 320);
    const height = Math.max(240, video.videoHeight || 240);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, width, height);
    }

    const evidenceBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.82),
    );

    if (!detector) {
      // Never soft-pass when robust face detection is unavailable.
      // This avoids fake approvals on camera noise or frame jitter.
      const avgMotion =
        motionScores.length > 0
          ? motionScores.reduce((sum, value) => sum + value, 0) / motionScores.length
          : 0;
      return {
        passed: false,
        score: 0.12,
        resultPayload: {
          challengeType: challenge.challengeType,
          instruction: challenge.instruction,
          runtime: "browser",
          verifier: "mediapipe_face_landmarker",
          reason: "mediapipe_unavailable",
          requiredDurationMs,
          sampledFrames: motionScores.length,
          averageMotion: avgMotion,
        },
        evidenceBlob,
      };
    }

    // Keep browser pass criteria aligned with the verify-human-challenge backend.
    // If the client soft-passes with looser thresholds than the server accepts,
    // completion fails with "invalid_verification_result" and the user sees a
    // generic "couldn't complete verification" error after doing the challenge.
    const minSamples = 6;
    if (centers.length < minSamples) {
      return {
        passed: false,
        score: 0.1,
        resultPayload: {
          verifier: "mediapipe_face_landmarker",
          reason: "face_not_stably_detected",
          detectedFrames: centers.length,
          challengeType: challenge.challengeType,
          requiredFrames: minSamples,
        },
        evidenceBlob,
      };
    }

    const xs = centers.map((point) => point.x);
    const ys = centers.map((point) => point.y);
    const ws = centers.map((point) => point.w);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const avgW = ws.reduce((sum, v) => sum + v, 0) / ws.length;
    const baseWindow = Math.min(3, centers.length);
    const baseX = centers.slice(0, baseWindow).reduce((sum, p) => sum + p.x, 0) / baseWindow;
    const baseY = centers.slice(0, baseWindow).reduce((sum, p) => sum + p.y, 0) / baseWindow;
    const relXs = xs.map((x) => (x - baseX) / Math.max(avgW, 1));
    const relYs = ys.map((y) => (y - baseY) / Math.max(avgW, 1));
    const horizontalShift = (maxX - minX) / Math.max(avgW, 1);
    const verticalShift = (maxY - minY) / Math.max(avgW, 1);
    const leftTravel = Math.abs(Math.min(...relXs, 0));
    const rightTravel = Math.max(...relXs, 0);
    const upTravel = Math.abs(Math.min(...relYs, 0));
    const downTravel = Math.max(...relYs, 0);

    let passed = false;
    if (challenge.challengeType === "turn_left_right") {
      passed = horizontalShift >= 0.36 && leftTravel >= 0.12 && rightTravel >= 0.12;
    } else if (challenge.challengeType === "look_up_down") {
      passed = verticalShift >= 0.30 && upTravel >= 0.10 && downTravel >= 0.10;
    } else {
      passed =
        (horizontalShift >= 0.36 && leftTravel >= 0.12 && rightTravel >= 0.12)
        || (verticalShift >= 0.30 && upTravel >= 0.10 && downTravel >= 0.10);
    }

    return {
      passed,
      score: passed ? 0.92 : 0.22,
      resultPayload: {
        challengeType: challenge.challengeType,
        instruction: challenge.instruction,
        runtime: "browser",
        verifier: "mediapipe_face_landmarker",
        detectedFrames: centers.length,
        horizontalShift,
        verticalShift,
        leftTravel,
        rightTravel,
        upTravel,
        downTravel,
        requiredDurationMs,
      },
      evidenceBlob,
    };
  } finally {
    try {
      detector?.close?.();
    } catch {
      // no-op
    }
    options.onPreviewStream?.(null);
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
  }
}
