import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { NativeSpinner } from "../NativeSpinner";
import { AppConfirmModal } from "../nativeModalPrimitives";
import {
  normalizeNativeProfilePhotoAsset,
  type NativeProfilePhotoCropRect,
  type NativeProfilePhotoPresentationCrop,
  type NativeProfileUploadAsset,
  type NativeSoloAspect,
} from "../../lib/nativeProfilePhotos";
import { nativeSafeErrorCopy } from "../../lib/nativeSafeErrorCopy";
import { haptic } from "../../lib/nativeHaptics";
import {
  huddleButtons,
  huddleColors,
  huddleLayout,
  huddleProfilePhotoCropper,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../../theme/huddleDesignTokens";
import { nativeProfileAspectLabels, type NativeProfileSlotAspect } from "./nativeProfilePhotoSlotBriefs";

export type NativeMediaImageCropperAspect = "1:1" | "3/2" | "4/5" | "4:5" | "16:9";
export type NativePresentationCrop = NativeProfilePhotoPresentationCrop;

type NativeProfilePhotoCropperProps = {
  asset: (NativeProfileUploadAsset & { height?: number | null; width?: number | null }) | null;
  aspect: NativeProfileSlotAspect;
  onCancel: () => void;
  onError?: (message: string) => void;
  onSave: (asset: NativeProfileUploadAsset, soloAspect: NativeSoloAspect | null, presentationCrop?: NativePresentationCrop) => Promise<void>;
  onSoloAspectChange?: (aspect: NativeSoloAspect) => void;
  soloAspect: NativeSoloAspect;
  avatarCrop?: boolean;
  initialPresentationCrop?: NativePresentationCrop | null;
};

type NativeMediaImageCropperProps = {
  asset: (NativeProfileUploadAsset & { height?: number | null; width?: number | null }) | null;
  aspect: NativeMediaImageCropperAspect;
  aspectOptions?: NativeMediaImageCropperAspect[];
  onAspectChange?: (aspect: NativeMediaImageCropperAspect) => void;
  onCancel: () => void;
  onError?: (message: string) => void;
  onSave: (asset: NativeProfileUploadAsset, aspect: NativeMediaImageCropperAspect | null, presentationCrop?: NativePresentationCrop) => Promise<void>;
  /** When present, a draggable presentation crop is exported alongside the main portrait crop. */
  presentationCropAspect?: number;
  initialPresentationCrop?: NativePresentationCrop | null;
  presentationCropLabel?: string;
  presentation?: "modal" | "inline";
  previewOverlayAspect?: number;
  previewOverlayLabel?: string;
  title?: string;
};

const mediaAspectLabels: Record<NativeMediaImageCropperAspect, string> = {
  "1:1": nativeProfileAspectLabels["1:1"],
  "3/2": "3:2",
  "4/5": nativeProfileAspectLabels["4:5"],
  "4:5": nativeProfileAspectLabels["4:5"],
  "16:9": nativeProfileAspectLabels["16:9"],
};

const aspectToNumber = (aspect: NativeMediaImageCropperAspect) => {
  if (aspect === "3/2") return 3 / 2;
  if (aspect === "1:1") return 1;
  if (aspect === "16:9") return 16 / 9;
  return 4 / 5;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const initialCropZoom: number = huddleProfilePhotoCropper.minZoom;
const AnimatedMaskPath = Animated.createAnimatedComponent(Path);

export function NativeMediaImageCropper({
  asset,
  aspect,
  aspectOptions,
  onAspectChange,
  onCancel,
  onError,
  onSave,
  presentationCropAspect,
  initialPresentationCrop,
  presentationCropLabel = "Home banner",
  presentation = "modal",
  previewOverlayAspect,
  previewOverlayLabel = "Banner preview",
  title = "Crop photo",
}: NativeMediaImageCropperProps) {
  const window = useWindowDimensions();
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(initialCropZoom);
  const [cropEdited, setCropEdited] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentAspect, setCurrentAspect] = useState<NativeMediaImageCropperAspect>(aspect);
  const [presentationSelected, setPresentationSelected] = useState(false);
  const livePanRef = useRef(pan);
  const liveZoomRef = useRef(initialCropZoom);
  const panBoundsRef = useRef({ x: 0, y: 0 });
  const liveRotationRef = useRef(0);
  const panX = useSharedValue<number>(0);
  const panY = useSharedValue<number>(0);
  const scale = useSharedValue<number>(initialCropZoom);
  const rotation = useSharedValue<number>(0);
  const presentationCropX = useSharedValue<number>(0);
  const presentationCropY = useSharedValue<number>(0);
  const presentationCropWidth = useSharedValue<number>(0);
  const presentationStartX = useSharedValue<number>(0);
  const presentationStartY = useSharedValue<number>(0);
  const presentationStartWidth = useSharedValue<number>(0);
  const gestureStartPanX = useSharedValue<number>(0);
  const gestureStartPanY = useSharedValue<number>(0);
  const gestureStartScale = useSharedValue<number>(initialCropZoom);
  const gestureStartRotation = useSharedValue<number>(0);

  const imageWidth = asset?.width && asset.width > 0 ? asset.width : null;
  const imageHeight = asset?.height && asset.height > 0 ? asset.height : null;
  const effectiveAspect = aspectOptions && aspectOptions.length > 0 ? currentAspect : aspect;
  const numericAspect = aspectToNumber(effectiveAspect);
  const frameWidth = Math.min(
    window.width - huddleSpacing.x4 * 2,
    huddleProfilePhotoCropper.maxFrameWidth,
  );
  const frameHeight = Math.min(
    frameWidth / numericAspect,
    window.height * huddleProfilePhotoCropper.frameMaxViewportRatio,
  );
  const finalFrameWidth = Math.min(frameWidth, frameHeight * numericAspect);
  const finalFrameHeight = finalFrameWidth / numericAspect;
  const overlayAspect = presentationCropAspect ?? previewOverlayAspect;
  const previewOverlayFrame = useMemo(() => {
    if (!overlayAspect || overlayAspect <= 0) return null;
    const cropAspect = finalFrameWidth / finalFrameHeight;
    const width = overlayAspect >= cropAspect ? finalFrameWidth : finalFrameHeight * overlayAspect;
    const height = overlayAspect >= cropAspect ? finalFrameWidth / overlayAspect : finalFrameHeight;
    const maxLeft = Math.max(0, finalFrameWidth - width);
    const maxTop = Math.max(0, finalFrameHeight - height);
    return {
      height,
      left: maxLeft / 2,
      maxLeft,
      maxTop,
      top: maxTop / 2,
      width,
    };
  }, [finalFrameHeight, finalFrameWidth, overlayAspect]);
  const presentationMinWidth = Math.min(finalFrameWidth, Math.max(120, finalFrameWidth * 0.42));
  const presentationCropHeight = useSharedValue<number>(0);
  const animatedPresentationFrameStyle = useAnimatedStyle(() => ({
    height: presentationCropHeight.value,
    left: presentationCropX.value,
    top: presentationCropY.value,
    width: presentationCropWidth.value,
  }));
  const animatedMaskTopStyle = useAnimatedStyle(() => ({ height: presentationCropY.value }));
  const animatedMaskBottomStyle = useAnimatedStyle(() => ({ top: presentationCropY.value + presentationCropHeight.value }));
  const animatedMaskLeftStyle = useAnimatedStyle(() => ({
    height: presentationCropHeight.value,
    top: presentationCropY.value,
    width: presentationCropX.value,
  }));
  const animatedMaskRightStyle = useAnimatedStyle(() => ({
    height: presentationCropHeight.value,
    left: presentationCropX.value + presentationCropWidth.value,
    top: presentationCropY.value,
  }));
  const animatedAvatarMaskProps = useAnimatedProps(() => {
    const radius = presentationCropWidth.value / 2;
    const centerX = presentationCropX.value + radius;
    const centerY = presentationCropY.value + radius;
    return {
      d: `M0 0 H${finalFrameWidth} V${finalFrameHeight} H0 Z M${centerX - radius} ${centerY} A${radius} ${radius} 0 1 0 ${centerX + radius} ${centerY} A${radius} ${radius} 0 1 0 ${centerX - radius} ${centerY} Z`,
    };
  });

  const baseScale = imageWidth && imageHeight
    ? Math.max(finalFrameWidth / imageWidth, finalFrameHeight / imageHeight)
    : 1;
  const imageCenter = {
    x: (imageWidth ?? finalFrameWidth) / 2,
    y: (imageHeight ?? finalFrameHeight) / 2,
  };
  const baseDisplayWidth = (imageWidth ?? finalFrameWidth) * baseScale;
  const baseDisplayHeight = (imageHeight ?? finalFrameHeight) * baseScale;
  const displayWidth = baseDisplayWidth * zoom;
  const displayHeight = baseDisplayHeight * zoom;
  const maxPanX = Math.max(0, (displayWidth - finalFrameWidth) / 2);
  const maxPanY = Math.max(0, (displayHeight - finalFrameHeight) / 2);

  const clampedPan = useMemo(() => ({
    x: clamp(pan.x, -maxPanX, maxPanX),
    y: clamp(pan.y, -maxPanY, maxPanY),
  }), [maxPanX, maxPanY, pan.x, pan.y]);

  const rotatedSizeFor = (degrees: number, width = imageWidth ?? finalFrameWidth, height = imageHeight ?? finalFrameHeight) => {
    const radians = Math.abs(degrees) * Math.PI / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    return {
      height: width * sin + height * cos,
      width: width * cos + height * sin,
    };
  };

  const minZoomForRotation = (degrees: number) => {
    const radians = degrees * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const halfFrameWidth = finalFrameWidth / 2;
    const halfFrameHeight = finalFrameHeight / 2;
    const corners = [
      { x: -halfFrameWidth, y: -halfFrameHeight },
      { x: halfFrameWidth, y: -halfFrameHeight },
      { x: -halfFrameWidth, y: halfFrameHeight },
      { x: halfFrameWidth, y: halfFrameHeight },
    ];
    const requiredZoom = corners.reduce<number>((maxZoom, corner) => {
      const localX = corner.x * cos + corner.y * sin;
      const localY = -corner.x * sin + corner.y * cos;
      return Math.max(
        maxZoom,
        Math.abs(localX) * 2 / baseDisplayWidth,
        Math.abs(localY) * 2 / baseDisplayHeight,
      );
    }, huddleProfilePhotoCropper.minZoom as number);
    return clamp(requiredZoom, huddleProfilePhotoCropper.minZoom, huddleProfilePhotoCropper.maxZoom);
  };

  const boundsForTransform = (nextZoom: number, nextRotation = liveRotationRef.current) => {
    const rotated = rotatedSizeFor(nextRotation);
    return {
      x: Math.max(0, (rotated.width * baseScale * nextZoom - finalFrameWidth) / 2),
      y: Math.max(0, (rotated.height * baseScale * nextZoom - finalFrameHeight) / 2),
    };
  };

  const clampPoint = (point: { x: number; y: number }, bounds = panBoundsRef.current) => {
    return {
      x: clamp(point.x, -bounds.x, bounds.x),
      y: clamp(point.y, -bounds.y, bounds.y),
    };
  };

  const syncCropTransform = (nextPan: { x: number; y: number }, nextZoom: number, nextRotation = liveRotationRef.current) => {
    const normalizedRotation = ((nextRotation % 360) + 360) % 360;
    const signedRotation = normalizedRotation > 180 ? normalizedRotation - 360 : normalizedRotation;
    const safeZoom = Math.max(nextZoom, minZoomForRotation(signedRotation));
    const bounds = boundsForTransform(safeZoom, signedRotation);
    const safePan = clampPoint(nextPan, bounds);
    livePanRef.current = safePan;
    liveZoomRef.current = safeZoom;
    liveRotationRef.current = signedRotation;
    panBoundsRef.current = bounds;
    setPan(safePan);
    setZoom(safeZoom);
    setCropEdited(true);
  };

  const applyCropTransform = (nextPan: { x: number; y: number }, nextZoom: number, nextRotation = liveRotationRef.current) => {
    const safeZoom = Math.max(nextZoom, minZoomForRotation(nextRotation));
    const bounds = boundsForTransform(safeZoom, nextRotation);
    const safePan = clampPoint(nextPan, bounds);
    panX.value = safePan.x;
    panY.value = safePan.y;
    scale.value = safeZoom;
    rotation.value = nextRotation;
    syncCropTransform(safePan, safeZoom, nextRotation);
  };

  useEffect(() => {
    panBoundsRef.current = { x: maxPanX, y: maxPanY };
    const current = livePanRef.current;
    const next = {
      x: clamp(current.x, -maxPanX, maxPanX),
      y: clamp(current.y, -maxPanY, maxPanY),
    };
    livePanRef.current = next;
    panX.value = next.x;
    panY.value = next.y;
    setPan((current) => {
      return next.x === current.x && next.y === current.y ? current : next;
    });
  }, [maxPanX, maxPanY, panX, panY]);

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: panX.value },
      { translateY: panY.value },
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  const selectPresentationFrame = useCallback(() => {
    setPresentationSelected(true);
    setCropEdited(true);
    haptic.reveal();
  }, []);
  const presentationCropGesture = useMemo(() => {
    const frameTap = Gesture.Tap()
      .onEnd(() => {
        runOnJS(selectPresentationFrame)();
      });
    const framePan = Gesture.Pan()
      .onBegin(() => {
        presentationStartX.value = presentationCropX.value;
        presentationStartY.value = presentationCropY.value;
        runOnJS(selectPresentationFrame)();
      })
      .onUpdate((event) => {
        const maxX = finalFrameWidth - presentationCropWidth.value;
        const maxY = finalFrameHeight - presentationCropHeight.value;
        presentationCropX.value = Math.min(Math.max(presentationStartX.value + event.translationX, 0), maxX);
        presentationCropY.value = Math.min(Math.max(presentationStartY.value + event.translationY, 0), maxY);
      });
    const framePinch = Gesture.Pinch()
      .onBegin(() => {
        presentationStartWidth.value = presentationCropWidth.value;
        runOnJS(selectPresentationFrame)();
      })
      .onUpdate((event) => {
        if (!overlayAspect) return;
        const centerX = presentationCropX.value + presentationCropWidth.value / 2;
        const centerY = presentationCropY.value + presentationCropHeight.value / 2;
        const maxWidth = Math.min(finalFrameWidth, finalFrameHeight * overlayAspect);
        const nextWidth = Math.min(Math.max(presentationStartWidth.value * event.scale, presentationMinWidth), maxWidth);
        const nextHeight = nextWidth / overlayAspect;
        presentationCropWidth.value = nextWidth;
        presentationCropHeight.value = nextHeight;
        presentationCropX.value = Math.min(Math.max(centerX - nextWidth / 2, 0), finalFrameWidth - nextWidth);
        presentationCropY.value = Math.min(Math.max(centerY - nextHeight / 2, 0), finalFrameHeight - nextHeight);
      });
    return Gesture.Simultaneous(frameTap, framePan, framePinch);
  }, [finalFrameHeight, finalFrameWidth, overlayAspect, presentationCropHeight, presentationCropWidth, presentationCropX, presentationCropY, presentationMinWidth, presentationStartWidth, presentationStartX, presentationStartY, selectPresentationFrame]);
  const presentationResizeGesture = useMemo(() => Gesture.Pan()
    .onBegin(() => {
      presentationStartWidth.value = presentationCropWidth.value;
      runOnJS(selectPresentationFrame)();
    })
    .onUpdate((event) => {
      if (!overlayAspect) return;
      const maxWidth = Math.min(
        finalFrameWidth - presentationCropX.value,
        (finalFrameHeight - presentationCropY.value) * overlayAspect,
      );
      const diagonalDelta = (event.translationX + event.translationY * overlayAspect) / 2;
      const nextWidth = Math.min(
        Math.max(presentationStartWidth.value + diagonalDelta, presentationMinWidth),
        maxWidth,
      );
      presentationCropWidth.value = nextWidth;
      presentationCropHeight.value = nextWidth / overlayAspect;
    }), [finalFrameHeight, finalFrameWidth, overlayAspect, presentationCropHeight, presentationCropWidth, presentationCropX, presentationCropY, presentationMinWidth, presentationStartWidth, selectPresentationFrame]);

  const cropGesture = useMemo(() => {
    const clampWorklet = (value: number, min: number, max: number) => {
      "worklet";
      return Math.min(Math.max(value, min), max);
    };
    const boundsForTransformWorklet = (nextScale: number, nextRotation: number) => {
      "worklet";
      const radians = Math.abs(nextRotation) * Math.PI / 180;
      const cos = Math.abs(Math.cos(radians));
      const sin = Math.abs(Math.sin(radians));
      const rotatedWidth = baseDisplayWidth * cos + baseDisplayHeight * sin;
      const rotatedHeight = baseDisplayWidth * sin + baseDisplayHeight * cos;
      return {
        x: Math.max(0, (rotatedWidth * nextScale - finalFrameWidth) / 2),
        y: Math.max(0, (rotatedHeight * nextScale - finalFrameHeight) / 2),
      };
    };
    const minZoomForRotationWorklet = (nextRotation: number) => {
      "worklet";
      const radians = nextRotation * Math.PI / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const halfFrameWidth = finalFrameWidth / 2;
      const halfFrameHeight = finalFrameHeight / 2;
      const corners = [
        { x: -halfFrameWidth, y: -halfFrameHeight },
        { x: halfFrameWidth, y: -halfFrameHeight },
        { x: -halfFrameWidth, y: halfFrameHeight },
        { x: halfFrameWidth, y: halfFrameHeight },
      ];
      let requiredZoom: number = huddleProfilePhotoCropper.minZoom;
      for (let index = 0; index < corners.length; index += 1) {
        const corner = corners[index];
        const localX = corner.x * cos + corner.y * sin;
        const localY = -corner.x * sin + corner.y * cos;
        requiredZoom = Math.max(
          requiredZoom,
          Math.abs(localX) * 2 / baseDisplayWidth,
          Math.abs(localY) * 2 / baseDisplayHeight,
        );
      }
      return clampWorklet(
        requiredZoom,
        huddleProfilePhotoCropper.minZoom,
        huddleProfilePhotoCropper.maxZoom,
      );
    };
    const commitTransform = () => {
      "worklet";
      runOnJS(syncCropTransform)({ x: panX.value, y: panY.value }, scale.value, rotation.value);
    };
    const finalizeTransform = (_event: unknown, success: boolean) => {
      "worklet";
      if (success) commitTransform();
    };

    const panGesture = Gesture.Pan()
      .onBegin(() => {
        gestureStartPanX.value = panX.value;
        gestureStartPanY.value = panY.value;
      })
      .onUpdate((event) => {
        const bounds = boundsForTransformWorklet(scale.value, rotation.value);
        panX.value = clampWorklet(gestureStartPanX.value + event.translationX, -bounds.x, bounds.x);
        panY.value = clampWorklet(gestureStartPanY.value + event.translationY, -bounds.y, bounds.y);
      })
      .onFinalize(finalizeTransform);
    const pinchGesture = Gesture.Pinch()
      .onBegin(() => {
        gestureStartScale.value = scale.value;
      })
      .onUpdate((event) => {
        const nextScale = clampWorklet(
          gestureStartScale.value * event.scale,
          minZoomForRotationWorklet(rotation.value),
          huddleProfilePhotoCropper.maxZoom,
        );
        const bounds = boundsForTransformWorklet(nextScale, rotation.value);
        scale.value = nextScale;
        panX.value = clampWorklet(panX.value, -bounds.x, bounds.x);
        panY.value = clampWorklet(panY.value, -bounds.y, bounds.y);
      })
      .onFinalize(finalizeTransform);

    const rotateGesture = Gesture.Rotation()
      .enabled(!presentationCropAspect)
      .onBegin(() => {
        gestureStartRotation.value = rotation.value;
      })
      .onUpdate((event) => {
        const nextRotation = gestureStartRotation.value + event.rotation * 180 / Math.PI;
        const nextScale = Math.max(scale.value, minZoomForRotationWorklet(nextRotation));
        const bounds = boundsForTransformWorklet(nextScale, nextRotation);
        rotation.value = nextRotation;
        scale.value = nextScale;
        panX.value = clampWorklet(panX.value, -bounds.x, bounds.x);
        panY.value = clampWorklet(panY.value, -bounds.y, bounds.y);
      })
      .onFinalize(finalizeTransform);

    const resetGesture = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd(() => {
        panX.value = 0;
        panY.value = 0;
        scale.value = huddleProfilePhotoCropper.minZoom;
        rotation.value = 0;
        runOnJS(syncCropTransform)({ x: 0, y: 0 }, huddleProfilePhotoCropper.minZoom, 0);
      });

    return Gesture.Simultaneous(panGesture, pinchGesture, rotateGesture, resetGesture);
  // This dependency list intentionally matches the known-good cropper: keeping
  // the gesture graph stable prevents active native pinch/pan gestures resetting.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseDisplayHeight, baseDisplayWidth, finalFrameHeight, finalFrameWidth, gestureStartPanX, gestureStartPanY, gestureStartRotation, gestureStartScale, panX, panY, presentationCropAspect, presentationCropGesture, rotation, scale]);

  useEffect(() => {
    setCurrentAspect(aspect);
  }, [aspect]);

  useEffect(() => {
    const nextPan = { x: 0, y: 0 };
    livePanRef.current = nextPan;
    liveZoomRef.current = initialCropZoom;
    liveRotationRef.current = 0;
    panX.value = 0;
    panY.value = 0;
    scale.value = initialCropZoom;
    rotation.value = 0;
    setPan(nextPan);
    setZoom(initialCropZoom);
    setCropEdited(false);
  }, [asset?.uri, effectiveAspect, panX, panY, rotation, scale]);

  useEffect(() => {
    if (!presentationCropAspect || !previewOverlayFrame) return;
    const maxWidth = Math.min(finalFrameWidth, finalFrameHeight * presentationCropAspect);
    const requestedWidth = initialPresentationCrop?.widthPct
      ? (imageWidth ?? finalFrameWidth) * baseScale * initialPresentationCrop.widthPct / 100
      : maxWidth;
    const width = clamp(requestedWidth, presentationMinWidth, maxWidth);
    const height = width / presentationCropAspect;
    const overflowX = (baseDisplayWidth - finalFrameWidth) / 2;
    const overflowY = (baseDisplayHeight - finalFrameHeight) / 2;
    const centerX = initialPresentationCrop
      ? (imageWidth ?? finalFrameWidth) * baseScale * initialPresentationCrop.centerX / 100 - overflowX
      : finalFrameWidth / 2;
    const centerY = initialPresentationCrop
      ? (imageHeight ?? finalFrameHeight) * baseScale * initialPresentationCrop.centerY / 100 - overflowY
      : finalFrameHeight / 2;
    presentationCropWidth.value = width;
    presentationCropHeight.value = height;
    presentationCropX.value = clamp(centerX - width / 2, 0, finalFrameWidth - width);
    presentationCropY.value = clamp(centerY - height / 2, 0, finalFrameHeight - height);
    setPresentationSelected(false);
  }, [asset?.uri, baseDisplayHeight, baseDisplayWidth, baseScale, effectiveAspect, finalFrameHeight, finalFrameWidth, imageHeight, imageWidth, initialPresentationCrop, presentationCropAspect, presentationCropHeight, presentationCropWidth, presentationCropX, presentationCropY, presentationMinWidth, previewOverlayFrame]);

  const changeZoom = (delta: number) => {
    const nextZoom = clamp(
      Number((liveZoomRef.current + delta).toFixed(2)),
      huddleProfilePhotoCropper.minZoom,
      huddleProfilePhotoCropper.maxZoom,
    );
    applyCropTransform(livePanRef.current, nextZoom, liveRotationRef.current);
  };

  const buildCropRect = (frame = { left: 0, top: 0, width: finalFrameWidth, height: finalFrameHeight }): NativeProfilePhotoCropRect | null => {
    if (!imageWidth || !imageHeight) return null;
    const liveZoom = liveZoomRef.current;
    const livePan = livePanRef.current;
    const rotationDegrees = liveRotationRef.current;
    const rotatedSize = rotatedSizeFor(rotationDegrees, imageWidth, imageHeight);
    const displayWidthForSave = rotatedSize.width * baseScale * liveZoom;
    const displayHeightForSave = rotatedSize.height * baseScale * liveZoom;
    const cropScale = baseScale * liveZoom;
    return {
      originX: ((displayWidthForSave - finalFrameWidth) / 2 - livePan.x + frame.left) / cropScale,
      originY: ((displayHeightForSave - finalFrameHeight) / 2 - livePan.y + frame.top) / cropScale,
      width: frame.width / cropScale,
      height: frame.height / cropScale,
    };
  };

  const buildPresentationCrop = (): NativePresentationCrop | undefined => {
    if (!presentationCropAspect || !previewOverlayFrame) return undefined;
    const frame = {
      width: presentationCropWidth.value || previewOverlayFrame.width,
      height: presentationCropHeight.value || previewOverlayFrame.height,
      left: presentationCropX.value,
      top: presentationCropY.value,
    };
    const sourceCrop = buildCropRect(frame);
    if (!sourceCrop || !imageWidth || !imageHeight) return undefined;
    return {
      centerX: ((sourceCrop.originX + sourceCrop.width / 2) / imageWidth) * 100,
      centerY: ((sourceCrop.originY + sourceCrop.height / 2) / imageHeight) * 100,
      widthPct: sourceCrop.width / imageWidth * 100,
      sourceAspect: imageWidth / imageHeight,
    };
  };

  const handleSave = async () => {
    if (!asset) return;
    // Presentation frames are metadata only. Never bake avatar/banner framing
    // into the canonical image asset.
    const crop = presentationCropAspect && imageWidth && imageHeight
      ? { originX: 0, originY: 0, width: imageWidth, height: imageHeight }
      : buildCropRect();
    if (!crop) {
      onError?.("Couldn't read that photo. Try another image.");
      return;
    }
    setSaving(true);
    try {
      if (presentationCropAspect) {
        await onSave(asset, aspectOptions && aspectOptions.length > 0 ? currentAspect : null, buildPresentationCrop());
        return;
      }
      const rotationDegrees = presentationCropAspect ? 0 : liveRotationRef.current;
      const rotatedSize = rotatedSizeFor(rotationDegrees, imageWidth ?? undefined, imageHeight ?? undefined);
      const normalized = await normalizeNativeProfilePhotoAsset(asset, crop, {
        rotationDegrees,
        rotatedHeight: rotatedSize.height,
        rotatedWidth: rotatedSize.width,
      });
      await onSave(normalized, aspectOptions && aspectOptions.length > 0 ? currentAspect : null, buildPresentationCrop());
    } catch (error) {
      onError?.(nativeSafeErrorCopy(error, "Couldn't save that photo. Try again in a moment."));
    } finally {
      setSaving(false);
    }
  };

  const requestCancel = () => {
    if (saving) return;
    if (cropEdited) {
      setCancelConfirmOpen(true);
      return;
    }
    onCancel();
  };

  const cropperContent = (
    <Pressable onPress={presentation === "inline" ? undefined : requestCancel} style={presentation === "inline" ? [styles.backdrop, styles.inlineBackdrop] : styles.backdrop}>
        <Pressable onPress={(event) => event.stopPropagation()} style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable accessibilityLabel="Close crop photo" accessibilityRole="button" onPress={requestCancel} style={styles.closeButton}>
              <Feather color={huddleColors.text} name="x" size={24} />
            </Pressable>
          </View>

          {aspectOptions && aspectOptions.length > 0 ? (
            <View style={styles.aspectRow}>
              {aspectOptions.map((option) => (
                <Pressable
                  accessibilityRole="button"
                  key={option}
                  onPress={() => {
                    setCurrentAspect(option);
                    setCropEdited(true);
                    onAspectChange?.(option);
                  }}
                  style={[styles.aspectPill, currentAspect === option ? styles.aspectPillActive : null]}
                >
                  <Text style={[styles.aspectPillText, currentAspect === option ? styles.aspectPillTextActive : null]}>
                    {mediaAspectLabels[option]}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <GestureDetector gesture={cropGesture}>
            <View
              accessibilityHint={previewOverlayFrame
                ? "Drag and zoom to compose the full Polaroid photo. Keep your pet inside the banner preview rectangle."
                : "Drag the photo to choose the crop position. Pinch to zoom, twist to rotate, and double tap to fit."}
              style={[
                styles.cropFrame,
                {
                  height: finalFrameHeight,
                  width: finalFrameWidth,
                },
              ]}
            >
              {asset?.uri ? (
                <Animated.Image
                  accessibilityIgnoresInvertColors
                  resizeMode="stretch"
                  source={{ uri: asset.uri }}
                  style={[
                    styles.cropImage,
                    {
                      height: baseDisplayHeight,
                      width: baseDisplayWidth,
                    },
                    animatedImageStyle,
                  ]}
                />
              ) : null}
              {previewOverlayFrame && !presentationCropAspect ? (
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <View style={[styles.previewScrim, { height: previewOverlayFrame.top, left: 0, right: 0, top: 0 }]} />
                  <View style={[styles.previewScrim, { bottom: 0, left: 0, right: 0, top: previewOverlayFrame.top + previewOverlayFrame.height }]} />
                  <View style={[styles.previewScrim, { height: previewOverlayFrame.height, left: 0, top: previewOverlayFrame.top, width: previewOverlayFrame.left }]} />
                  <View style={[styles.previewScrim, { height: previewOverlayFrame.height, left: previewOverlayFrame.left + previewOverlayFrame.width, right: 0, top: previewOverlayFrame.top }]} />
                  <View style={[styles.previewOverlay, previewOverlayFrame]} />
                  <View style={[styles.previewOverlayLabel, { left: previewOverlayFrame.left + huddleSpacing.x2, top: previewOverlayFrame.top + huddleSpacing.x2 }]}>
                    <Text style={styles.previewOverlayLabelText}>{previewOverlayLabel}</Text>
                  </View>
                </View>
              ) : null}
              {presentationCropAspect && previewOverlayFrame ? (
                <>
                  {presentationSelected ? (
                    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                      {presentationCropAspect === 1 ? (
                        <Svg height="100%" width="100%">
                          <AnimatedMaskPath animatedProps={animatedAvatarMaskProps} fill="rgba(7, 13, 34, 0.46)" fillRule="evenodd" />
                        </Svg>
                      ) : (
                        <>
                          <Animated.View style={[styles.focusMask, styles.focusMaskTop, animatedMaskTopStyle]} />
                          <Animated.View style={[styles.focusMask, styles.focusMaskBottom, animatedMaskBottomStyle]} />
                          <Animated.View style={[styles.focusMask, styles.focusMaskLeft, animatedMaskLeftStyle]} />
                          <Animated.View style={[styles.focusMask, styles.focusMaskRight, animatedMaskRightStyle]} />
                        </>
                      )}
                    </View>
                  ) : null}
                  <GestureDetector gesture={presentationCropGesture}>
                    <Animated.View
                      accessibilityLabel={presentationCropLabel}
                      accessibilityRole="adjustable"
                      style={[
                        styles.previewOverlay,
                        presentationCropAspect === 1 ? styles.avatarCropFrame : null,
                        presentationSelected ? styles.previewOverlaySelected : null,
                        animatedPresentationFrameStyle,
                      ]}
                    >
                      <View pointerEvents="none" style={styles.previewOverlayLabel}>
                        <Text style={styles.previewOverlayLabelText}>{presentationCropLabel}</Text>
                      </View>
                      <GestureDetector gesture={presentationResizeGesture}>
                        <View accessibilityLabel={`Resize ${presentationCropLabel}`} accessibilityRole="adjustable" style={styles.resizeHandle} />
                      </GestureDetector>
                    </Animated.View>
                  </GestureDetector>
                </>
              ) : null}
            </View>
          </GestureDetector>

          <View style={styles.controls}>
            <Text style={styles.aspectText}>{mediaAspectLabels[effectiveAspect]}</Text>
            <View style={styles.zoomControls}>
              <Pressable accessibilityLabel="Zoom out" accessibilityRole="button" onPress={() => changeZoom(-huddleProfilePhotoCropper.zoomStep)} style={styles.zoomButton}>
                <Feather color={huddleColors.text} name="minus" size={20} />
              </Pressable>
              <Text style={styles.zoomText}>{zoom.toFixed(1)}x</Text>
              <Pressable accessibilityLabel="Zoom in" accessibilityRole="button" onPress={() => changeZoom(huddleProfilePhotoCropper.zoomStep)} style={styles.zoomButton}>
                <Feather color={huddleColors.text} name="plus" size={20} />
              </Pressable>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={saving} onPress={requestCancel} style={[styles.actionButton, styles.cancelButton, saving ? styles.disabled : null]}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={saving} onPress={handleSave} style={[styles.actionButton, styles.saveButton, saving ? styles.disabled : null]}>
              {saving ? <NativeSpinner tone="primary" /> : <Text style={styles.saveText}>Save</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
  );

  if (presentation === "inline") {
    return asset ? cropperContent : null;
  }

  return (
    <Modal animationType="fade" onRequestClose={requestCancel} transparent visible={Boolean(asset)}>
      <GestureHandlerRootView style={styles.gestureRoot}>
        {cropperContent}
        <AppConfirmModal
          body="Your crop, zoom, and rotation changes will be lost."
          cancel="Keep editing"
          confirm="Confirm"
          destructive
          onCancel={() => setCancelConfirmOpen(false)}
          onConfirm={() => {
            setCancelConfirmOpen(false);
            onCancel();
          }}
          open={cancelConfirmOpen}
          presentation="inline"
          showClose
          title="Discard photo edits?"
        />
      </GestureHandlerRootView>
    </Modal>
  );
}

export function NativeProfilePhotoCropper({
  asset,
  aspect,
  onCancel,
  onError,
  onSave,
  onSoloAspectChange,
  soloAspect,
  avatarCrop = false,
  initialPresentationCrop,
}: NativeProfilePhotoCropperProps) {
  const resolvedAspect = aspect === "free" ? soloAspect : aspect;
  return (
    <NativeMediaImageCropper
      asset={asset}
      aspect={resolvedAspect}
      aspectOptions={aspect === "free" ? ["1:1", "4:5", "16:9"] : undefined}
      onAspectChange={(nextAspect) => {
        if (nextAspect === "1:1" || nextAspect === "4:5" || nextAspect === "16:9") {
          onSoloAspectChange?.(nextAspect);
        }
      }}
      onCancel={onCancel}
      onError={onError}
      onSave={(nextAsset, selectedAspect, presentationCrop) => onSave(nextAsset, aspect === "free" && (selectedAspect === "1:1" || selectedAspect === "4:5" || selectedAspect === "16:9") ? selectedAspect : null, presentationCrop)}
      presentationCropAspect={avatarCrop ? 1 : undefined}
      initialPresentationCrop={initialPresentationCrop}
      presentationCropLabel="Avatar"
      title="Crop photo"
    />
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.backdrop,
    paddingHorizontal: huddleSpacing.x4,
  },
  inlineBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  card: {
    width: "100%",
    maxWidth: huddleProfilePhotoCropper.maxFrameWidth + huddleSpacing.x4 * 2,
    borderRadius: huddleRadii.modal,
    backgroundColor: huddleColors.canvas,
    padding: huddleSpacing.x4,
    ...huddleShadows.glassElevation2,
  },
  header: {
    minHeight: huddleLayout.minTouch,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: huddleSpacing.x3,
  },
  title: {
    flex: 1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  closeButton: {
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
  },
  cropFrame: {
    alignSelf: "center",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.glass,
    backgroundColor: huddleColors.text,
  },
  aspectRow: {
    flexDirection: "row",
    gap: huddleSpacing.x2,
    marginBottom: huddleSpacing.x3,
  },
  aspectPill: {
    minHeight: huddleLayout.minTouch,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.primarySoftFill,
  },
  aspectPillActive: {
    backgroundColor: huddleColors.blue,
  },
  aspectPillText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    color: huddleColors.text,
  },
  aspectPillTextActive: {
    color: huddleColors.onPrimary,
  },
  cropImage: {
    position: "absolute",
  },
  previewScrim: {
    position: "absolute",
    backgroundColor: huddleColors.backdrop,
  },
  previewOverlay: {
    position: "absolute",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: huddleColors.mutedText,
    borderRadius: huddleRadii.card,
  },
  previewOverlaySelected: {
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: huddleColors.blue,
    ...huddleShadows.photoControl,
  },
  avatarCropFrame: {
    borderRadius: huddleRadii.pill,
    overflow: "visible",
  },
  focusMask: {
    position: "absolute",
    backgroundColor: "rgba(7, 13, 34, 0.46)",
  },
  focusMaskTop: { left: 0, right: 0, top: 0 },
  focusMaskBottom: { bottom: 0, left: 0, right: 0 },
  focusMaskLeft: { left: 0 },
  focusMaskRight: { right: 0 },
  resizeHandle: {
    position: "absolute",
    right: 5,
    bottom: 5,
    width: 14,
    height: 14,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.glassChrome,
    borderWidth: 1,
    borderColor: huddleColors.blue,
  },
  previewOverlayLabel: {
    position: "absolute",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.backdrop,
    paddingHorizontal: huddleSpacing.x2,
    paddingVertical: huddleSpacing.x1,
  },
  previewOverlayLabelText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.meta,
    lineHeight: huddleType.metaLine,
    color: huddleColors.onPrimary,
  },
  controls: {
    marginTop: huddleSpacing.x4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x3,
  },
  aspectText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  zoomControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  zoomButton: {
    width: huddleProfilePhotoCropper.zoomButtonSize,
    height: huddleProfilePhotoCropper.zoomButtonSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.primarySoftFill,
  },
  zoomText: {
    minWidth: huddleLayout.minTouch,
    textAlign: "center",
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    color: huddleColors.text,
  },
  actions: {
    flexDirection: "row",
    gap: huddleSpacing.x3,
    marginTop: huddleSpacing.x5,
  },
  actionButton: {
    flex: 1,
    ...huddleButtons.base,
  },
  cancelButton: {
    ...huddleButtons.secondary,
  },
  saveButton: {
    ...huddleButtons.primary,
  },
  cancelText: {
    ...huddleButtons.label,
    color: huddleColors.blue,
  },
  saveText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  disabled: {
    ...huddleButtons.disabled,
  },
});
