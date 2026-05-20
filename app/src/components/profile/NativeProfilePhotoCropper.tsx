import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import {
  normalizeNativeProfilePhotoAsset,
  type NativeProfilePhotoCropRect,
  type NativeProfileUploadAsset,
  type NativeSoloAspect,
} from "../../lib/nativeProfilePhotos";
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

type NativeProfilePhotoCropperProps = {
  asset: (NativeProfileUploadAsset & { height?: number | null; width?: number | null }) | null;
  aspect: NativeProfileSlotAspect;
  onCancel: () => void;
  onError?: (message: string) => void;
  onSave: (asset: NativeProfileUploadAsset, soloAspect: NativeSoloAspect | null) => Promise<void>;
  onSoloAspectChange?: (aspect: NativeSoloAspect) => void;
  soloAspect: NativeSoloAspect;
};

type NativeMediaImageCropperProps = {
  asset: (NativeProfileUploadAsset & { height?: number | null; width?: number | null }) | null;
  aspect: NativeMediaImageCropperAspect;
  aspectOptions?: NativeMediaImageCropperAspect[];
  onAspectChange?: (aspect: NativeMediaImageCropperAspect) => void;
  onCancel: () => void;
  onError?: (message: string) => void;
  onSave: (asset: NativeProfileUploadAsset, aspect: NativeMediaImageCropperAspect | null) => Promise<void>;
  presentation?: "modal" | "inline";
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

export function NativeMediaImageCropper({
  asset,
  aspect,
  aspectOptions,
  onAspectChange,
  onCancel,
  onError,
  onSave,
  presentation = "modal",
  title = "Crop photo",
}: NativeMediaImageCropperProps) {
  const window = useWindowDimensions();
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(initialCropZoom);
  const [saving, setSaving] = useState(false);
  const [currentAspect, setCurrentAspect] = useState<NativeMediaImageCropperAspect>(aspect);
  const livePanRef = useRef(pan);
  const liveZoomRef = useRef(initialCropZoom);
  const panBoundsRef = useRef({ x: 0, y: 0 });
  const liveRotationRef = useRef(0);
  const panX = useSharedValue<number>(0);
  const panY = useSharedValue<number>(0);
  const scale = useSharedValue<number>(initialCropZoom);
  const rotation = useSharedValue<number>(0);
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
    setPan((current) => {
      const next = {
        x: clamp(current.x, -maxPanX, maxPanX),
        y: clamp(current.y, -maxPanY, maxPanY),
      };
      livePanRef.current = next;
      panX.value = next.x;
      panY.value = next.y;
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
      .onEnd(commitTransform)
      .onFinalize(commitTransform);

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
      .onEnd(commitTransform)
      .onFinalize(commitTransform);

    const rotateGesture = Gesture.Rotation()
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
      .onEnd(commitTransform)
      .onFinalize(commitTransform);

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
  }, [baseDisplayHeight, baseDisplayWidth, finalFrameHeight, finalFrameWidth, gestureStartPanX, gestureStartPanY, gestureStartRotation, gestureStartScale, panX, panY, rotation, scale]);

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
  }, [asset?.uri, effectiveAspect, panX, panY, rotation, scale]);

  const changeZoom = (delta: number) => {
    const nextZoom = clamp(
      Number((liveZoomRef.current + delta).toFixed(2)),
      huddleProfilePhotoCropper.minZoom,
      huddleProfilePhotoCropper.maxZoom,
    );
    applyCropTransform(livePanRef.current, nextZoom, liveRotationRef.current);
  };

  const buildCropRect = (): NativeProfilePhotoCropRect | null => {
    if (!imageWidth || !imageHeight) return null;
    const liveZoom = liveZoomRef.current;
    const livePan = livePanRef.current;
    const rotationDegrees = liveRotationRef.current;
    const rotatedSize = rotatedSizeFor(rotationDegrees, imageWidth, imageHeight);
    const displayWidthForSave = rotatedSize.width * baseScale * liveZoom;
    const displayHeightForSave = rotatedSize.height * baseScale * liveZoom;
    const cropScale = baseScale * liveZoom;
    return {
      originX: ((displayWidthForSave - finalFrameWidth) / 2 - livePan.x) / cropScale,
      originY: ((displayHeightForSave - finalFrameHeight) / 2 - livePan.y) / cropScale,
      width: finalFrameWidth / cropScale,
      height: finalFrameHeight / cropScale,
    };
  };

  const handleSave = async () => {
    if (!asset) return;
    const crop = buildCropRect();
    if (!crop) return;
    setSaving(true);
    try {
      const rotationDegrees = liveRotationRef.current;
      const rotatedSize = rotatedSizeFor(rotationDegrees, imageWidth ?? undefined, imageHeight ?? undefined);
      const normalized = await normalizeNativeProfilePhotoAsset(asset, crop, {
        rotationDegrees,
        rotatedHeight: rotatedSize.height,
        rotatedWidth: rotatedSize.width,
      });
      await onSave(normalized, aspectOptions && aspectOptions.length > 0 ? currentAspect : null);
    } catch (error) {
      onError?.(error instanceof Error && error.message ? error.message : "Couldn't save that photo. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  };

  const cropperContent = (
    <Pressable onPress={presentation === "inline" ? undefined : onCancel} style={presentation === "inline" ? [styles.backdrop, styles.inlineBackdrop] : styles.backdrop}>
        <Pressable onPress={(event) => event.stopPropagation()} style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable accessibilityLabel="Close crop photo" accessibilityRole="button" onPress={onCancel} style={styles.closeButton}>
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
              accessibilityHint="Drag the photo to choose the crop position. Pinch to zoom, twist to rotate, and double tap to fit."
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
              <View pointerEvents="none" style={styles.gridHorizontalTop} />
              <View pointerEvents="none" style={styles.gridHorizontalBottom} />
              <View pointerEvents="none" style={styles.gridVerticalLeft} />
              <View pointerEvents="none" style={styles.gridVerticalRight} />
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
            <Pressable accessibilityRole="button" disabled={saving} onPress={onCancel} style={[styles.actionButton, styles.cancelButton, saving ? styles.disabled : null]}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={saving} onPress={handleSave} style={[styles.actionButton, styles.saveButton, saving ? styles.disabled : null]}>
              {saving ? <ActivityIndicator color={huddleColors.onPrimary} /> : <Text style={styles.saveText}>Save</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
  );

  if (presentation === "inline") {
    return asset ? cropperContent : null;
  }

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={Boolean(asset)}>
      {cropperContent}
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
      onSave={(nextAsset, selectedAspect) => onSave(nextAsset, aspect === "free" && (selectedAspect === "1:1" || selectedAspect === "4:5" || selectedAspect === "16:9") ? selectedAspect : null)}
      title="Crop photo"
    />
  );
}

const styles = StyleSheet.create({
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
  gridHorizontalTop: {
    position: "absolute",
    top: "33.333%",
    left: 0,
    right: 0,
    height: huddleProfilePhotoCropper.cropGridLineWidth,
    backgroundColor: huddleColors.glassBorder,
  },
  gridHorizontalBottom: {
    position: "absolute",
    top: "66.666%",
    left: 0,
    right: 0,
    height: huddleProfilePhotoCropper.cropGridLineWidth,
    backgroundColor: huddleColors.glassBorder,
  },
  gridVerticalLeft: {
    position: "absolute",
    left: "33.333%",
    top: 0,
    bottom: 0,
    width: huddleProfilePhotoCropper.cropGridLineWidth,
    backgroundColor: huddleColors.glassBorder,
  },
  gridVerticalRight: {
    position: "absolute",
    left: "66.666%",
    top: 0,
    bottom: 0,
    width: huddleProfilePhotoCropper.cropGridLineWidth,
    backgroundColor: huddleColors.glassBorder,
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
