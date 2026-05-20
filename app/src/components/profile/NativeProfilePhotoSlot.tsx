import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useEffect, useRef, useState } from "react";
import {
  resolveNativeProfilePhotoDisplayUrl,
  uploadNativeProfilePhotoAsset,
  type NativeProfilePhotoSlot as NativeProfilePhotoSlotName,
  type NativeProfileUploadAsset,
  type NativeSoloAspect,
} from "../../lib/nativeProfilePhotos";
import { logNativeProtectedActionFailure } from "../../lib/nativeStorageCleanup";
import { huddleButtons, huddleColors, huddleFieldStates, huddleLayout, huddleProfilePhotoSlots, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";
import { NativeProfilePhotoCropper } from "./NativeProfilePhotoCropper";
import { pickNativeProfilePhoto } from "./NativeProfilePhotoPicker";
import { nativeProfileSlotBriefs } from "./nativeProfilePhotoSlotBriefs";

const CAPTION_LINE_HEIGHT = 20;
const CAPTION_LINES = 2;
const CAPTION_INPUT_HEIGHT = CAPTION_LINE_HEIGHT * CAPTION_LINES;
const CAPTION_FONT_SIZE = 14;
const CAPTION_WIDTH_FUDGE = 0.98;

type NativeProfilePhotoSlotProps = {
  captionValue?: string | null;
  onCaptionChange?: (value: string | null) => void;
  onCaptionCommit?: (value: string | null) => void;
  onError?: (message: string) => void;
  onRemoved: (slot: NativeProfilePhotoSlotName, previousPath: string | null) => void;
  onUploaded: (slot: NativeProfilePhotoSlotName, path: string, soloAspect: NativeSoloAspect | null, previousPath: string | null) => void;
  accessToken?: string | null;
  error?: boolean;
  slot: NativeProfilePhotoSlotName;
  soloAspect: NativeSoloAspect | null;
  userId: string | null;
  value: string | null;
};

export function NativeProfilePhotoSlot({
  captionValue,
  onCaptionChange,
  onCaptionCommit,
  onError,
  onRemoved,
  onUploaded,
  accessToken,
  error = false,
  slot,
  soloAspect,
  userId,
  value,
}: NativeProfilePhotoSlotProps) {
  const brief = nativeProfileSlotBriefs[slot];
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [cropAsset, setCropAsset] = useState<(NativeProfileUploadAsset & { height?: number | null; width?: number | null }) | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedSoloAspect, setSelectedSoloAspect] = useState<NativeSoloAspect>(soloAspect ?? "4:5");
  const [captionDraft, setCaptionDraft] = useState(captionValue ?? "");
  const [captionInputWidth, setCaptionInputWidth] = useState(0);
  const acceptedCaptionDraft = useRef(captionValue ?? "");
  const pendingCaptionDraft = useRef(captionValue ?? "");
  const pendingCaptionIsAddition = useRef(false);
  const hasPhoto = Boolean(value);
  const allowCaption = hasPhoto && slot !== "cover";

  useEffect(() => {
    let cancelled = false;
    setDisplayUrl(null);
    void resolveNativeProfilePhotoDisplayUrl(value).then((url) => {
      if (!cancelled) setDisplayUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  useEffect(() => {
    const nextCaption = captionValue ?? "";
    acceptedCaptionDraft.current = nextCaption;
    pendingCaptionDraft.current = nextCaption;
    pendingCaptionIsAddition.current = false;
    setCaptionDraft(nextCaption);
  }, [captionValue]);

  useEffect(() => {
    if (slot === "solo") setSelectedSoloAspect(soloAspect ?? "4:5");
  }, [slot, soloAspect]);

  const handlePickAndUpload = async () => {
    try {
      setConfirmingRemove(false);
      const picked = await pickNativeProfilePhoto({ soloAspect: selectedSoloAspect });
      setActionsOpen(false);
      if (!picked) return;
      if (!userId) {
        onError?.("Please sign in to upload photos.");
        return;
      }
      setCropAsset(picked.asset);
    } catch (error) {
      onError?.(error instanceof Error && error.message ? error.message : "Couldn't save that photo. Try again in a moment.");
    }
  };

  const estimateCaptionLines = (text: string) => {
    if (captionInputWidth <= 0) return 1;
    const maxLineWidth = captionInputWidth * CAPTION_WIDTH_FUDGE;
    const widthFor = (char: string) => {
      if (char === " ") return CAPTION_FONT_SIZE * 0.3;
      if (/[il.,'!|]/.test(char)) return CAPTION_FONT_SIZE * 0.26;
      if (/[mwMW@#%&]/.test(char)) return CAPTION_FONT_SIZE * 0.8;
      if (/[A-Z0-9]/.test(char)) return CAPTION_FONT_SIZE * 0.6;
      return CAPTION_FONT_SIZE * 0.5;
    };
    let lines = 1;
    let lineWidth = 0;
    for (const char of text.replace(/\r/g, "")) {
      if (char === "\n") {
        lines += 1;
        lineWidth = 0;
        continue;
      }
      const charWidth = widthFor(char);
      if (lineWidth > 0 && lineWidth + charWidth > maxLineWidth) {
        lines += 1;
        lineWidth = char === " " ? 0 : charWidth;
      } else {
        lineWidth += charWidth;
      }
      if (lines > CAPTION_LINES) return lines;
    }
    return lines;
  };

  const updateCaptionDraft = (text: string) => {
    const nextCaption = text.replace(/\r/g, "").split("\n").slice(0, CAPTION_LINES).join("\n");
    const isAddition = nextCaption.length > acceptedCaptionDraft.current.length;
    if (isAddition && estimateCaptionLines(nextCaption) > CAPTION_LINES) {
      setCaptionDraft(acceptedCaptionDraft.current);
      onCaptionChange?.(acceptedCaptionDraft.current);
      return;
    }
    pendingCaptionDraft.current = nextCaption;
    pendingCaptionIsAddition.current = isAddition;
    setCaptionDraft(nextCaption);
    onCaptionChange?.(nextCaption);
  };

  const handleCaptionLineMeasure = (lineCount: number) => {
    if (lineCount > CAPTION_LINES) {
      setCaptionDraft(acceptedCaptionDraft.current);
      pendingCaptionDraft.current = acceptedCaptionDraft.current;
      pendingCaptionIsAddition.current = false;
      onCaptionChange?.(acceptedCaptionDraft.current);
      return;
    }
    acceptedCaptionDraft.current = pendingCaptionDraft.current;
    pendingCaptionIsAddition.current = false;
  };

  const handleCroppedSave = async (asset: NativeProfileUploadAsset, nextSoloAspect: NativeSoloAspect | null) => {
    if (!userId) {
      onError?.("Please sign in to upload photos.");
      return;
    }
    setUploading(true);
    try {
      if (__DEV__) {
        console.log("NATIVE_PROFILE_UPLOAD_SESSION", {
          propUserId: userId,
          hasAccessToken: Boolean(accessToken),
          matched: Boolean(userId && accessToken),
        });
      }
      const path = await uploadNativeProfilePhotoAsset(userId, slot, asset, accessToken);
      onUploaded(slot, path, nextSoloAspect, value);
      onError?.(`Photo uploaded to ${brief.label}`);
      setCropAsset(null);
    } catch (error) {
      logNativeProtectedActionFailure("[native.profilePhotoSlot] upload_failed", error);
      onError?.(error instanceof Error && error.message ? error.message : "Couldn't save that photo. Try again in a moment.");
      setCropAsset(null);
      setActionsOpen(false);
      setConfirmingRemove(false);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.slotShell}>
      <Pressable
        accessibilityLabel={`${brief.label}, ${brief.helper}`}
        accessibilityRole="button"
        onPress={handlePickAndUpload}
        style={({ pressed }) => [styles.card, !hasPhoto ? styles.emptyCard : null, error ? styles.errorCard : null, pressed ? styles.pressed : null]}
      >
        {!hasPhoto ? (
          <LinearGradient
            colors={[huddleColors.photoSlotEmptyStart, huddleColors.photoSlotEmptyEnd]}
            pointerEvents="none"
            style={styles.emptyGradient}
          />
        ) : null}
        {slot === "cover" ? (
          <View style={styles.coverBadge}>
            <Text style={styles.coverBadgeText}>Profile Image</Text>
          </View>
        ) : null}
        {hasPhoto ? (
          <>
            {displayUrl ? (
              <ExpoImage accessibilityIgnoresInvertColors cachePolicy="memory-disk" contentFit="cover" source={{ uri: displayUrl }} style={styles.photo} transition={120} />
            ) : (
              <View style={styles.photoPlaceholder} />
            )}
            <Pressable
              accessibilityLabel={`Replace ${brief.label} photo`}
              accessibilityRole="button"
              onPress={handlePickAndUpload}
              style={({ pressed }) => [styles.replaceButton, pressed ? styles.pressed : null]}
            >
              <Feather color={huddleColors.text} name="image" size={17} />
            </Pressable>
            <Pressable
              accessibilityLabel={`Remove ${brief.label} photo`}
              accessibilityRole="button"
              onPress={() => onRemoved(slot, value)}
              style={({ pressed }) => [styles.photoRemoveButton, pressed ? styles.pressed : null]}
            >
              <Feather color={huddleColors.text} name="x" size={17} />
            </Pressable>
            {allowCaption ? (
              <View style={styles.captionWrap}>
                <TextInput
                  autoCapitalize="none"
                  multiline
                  numberOfLines={CAPTION_LINES}
                  onBlur={() => {
                    const next = captionDraft.trim() || null;
                    onCaptionChange?.(next);
                    onCaptionCommit?.(next);
                  }}
                  onChangeText={updateCaptionDraft}
                  placeholder={brief.label}
                  placeholderTextColor={huddleColors.profileCaptionPlaceholder}
                  onLayout={(event) => setCaptionInputWidth(event.nativeEvent.layout.width)}
                  scrollEnabled={false}
                  style={styles.captionInput}
                  value={captionDraft}
                />
                <Text
                  aria-hidden
                  onTextLayout={(event) => handleCaptionLineMeasure(event.nativeEvent.lines.length)}
                  style={[styles.captionMeasure, captionInputWidth > 0 ? { width: captionInputWidth } : null]}
                >
                  {captionDraft ? Array.from(captionDraft).map((char) => char === "\n" ? "\n" : `${char}\u200B`).join("") : " "}
                </Text>
              </View>
            ) : null}
            {uploading ? (
              <View style={styles.uploading}>
                <Text style={styles.uploadingText}>Uploading</Text>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.emptyInner}>
            <View style={styles.emptyIcon}>
              <Feather color={huddleColors.blue} name="plus" size={26} />
            </View>
            <Text style={styles.emptyTitle}>{brief.label}</Text>
            <Text style={styles.emptyHelper}>{brief.helper}</Text>
          </View>
        )}
      </Pressable>

      <Modal animationType="fade" onRequestClose={() => setActionsOpen(false)} transparent visible={actionsOpen}>
        <View style={styles.sheetBackdrop}>
          <Pressable accessibilityLabel="Close photo options" accessibilityRole="button" onPress={() => setActionsOpen(false)} style={StyleSheet.absoluteFill} />
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.sheet}>
            <Text style={styles.sheetTitle}>Photo options</Text>
            <Pressable accessibilityRole="button" onPress={handlePickAndUpload} style={styles.sheetRow}>
              <Feather color={huddleColors.blue} name="refresh-cw" size={18} />
              <Text style={styles.sheetRowText}>Replace photo</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setActionsOpen(false);
                setConfirmingRemove(true);
              }}
              style={styles.sheetRow}
            >
              <Feather color={huddleColors.validationRed} name="trash-2" size={18} />
              <Text style={[styles.sheetRowText, styles.removeText]}>Remove photo</Text>
            </Pressable>
          </Pressable>
        </View>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setConfirmingRemove(false)} transparent visible={confirmingRemove}>
        <Pressable onPress={() => setConfirmingRemove(false)} style={styles.sheetBackdrop}>
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Remove this photo?</Text>
            <Text style={styles.confirmBody}>It'll disappear from your profile right away.</Text>
            <View style={styles.confirmActions}>
              <Pressable accessibilityRole="button" onPress={() => setConfirmingRemove(false)} style={[styles.confirmButton, styles.keepButton]}>
                <Text style={styles.keepButtonText}>Keep it</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setConfirmingRemove(false);
                  setActionsOpen(false);
                  onRemoved(slot, value);
                }}
                style={[styles.confirmButton, styles.confirmRemoveButton]}
              >
                <Text style={styles.removeButtonText}>Remove</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <NativeProfilePhotoCropper
        asset={cropAsset}
        aspect={brief.aspect}
        onCancel={() => setCropAsset(null)}
        onError={onError}
        onSoloAspectChange={slot === "solo" ? setSelectedSoloAspect : undefined}
        onSave={handleCroppedSave}
        soloAspect={selectedSoloAspect}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slotShell: {
    width: huddleProfilePhotoSlots.slotWidth,
    flexShrink: 0,
  },
  card: {
    aspectRatio: 4 / 5,
    width: "100%",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.glass,
    backgroundColor: huddleColors.mutedCanvas,
    ...huddleShadows.glassElevation1,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    backgroundColor: huddleColors.photoSlotEmptyStart,
  },
  errorCard: {
    ...huddleFieldStates.error,
  },
  emptyGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  photoPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: huddleColors.primarySoftFill,
  },
  coverBadge: {
    position: "absolute",
    top: huddleSpacing.x3,
    alignSelf: "center",
    zIndex: 2,
    borderRadius: huddleRadii.field,
    backgroundColor: huddleColors.glassChrome,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x2,
  },
  coverBadgeText: {
    fontFamily: "Urbanist-800",
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 1.76,
    textTransform: "uppercase",
    color: huddleColors.text,
  },
  replaceButton: {
    position: "absolute",
    top: huddleSpacing.x3,
    left: huddleSpacing.x3,
    zIndex: 2,
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.glassChrome,
    ...huddleShadows.photoControl,
  },
  photoRemoveButton: {
    position: "absolute",
    top: huddleSpacing.x3,
    right: huddleSpacing.x3,
    zIndex: 3,
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.glassChrome,
    ...huddleShadows.photoControl,
  },
  captionWrap: {
    position: "absolute",
    left: huddleSpacing.x3,
    right: huddleSpacing.x3,
    bottom: huddleSpacing.x3,
    height: CAPTION_INPUT_HEIGHT + huddleSpacing.x2 * 2,
    justifyContent: "center",
    borderRadius: huddleRadii.field,
    backgroundColor: huddleColors.profileCaptionOverlay,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x2,
  },
  captionInput: {
    height: CAPTION_INPUT_HEIGHT,
    padding: 0,
    backgroundColor: "transparent",
    fontFamily: "Urbanist-600",
    fontSize: CAPTION_FONT_SIZE,
    lineHeight: CAPTION_LINE_HEIGHT,
    includeFontPadding: false,
    textAlignVertical: "center",
    color: huddleColors.onPrimary,
  },
  captionMeasure: {
    position: "absolute",
    left: huddleSpacing.x3,
    right: huddleSpacing.x3,
    top: huddleSpacing.x2,
    opacity: 0,
    fontFamily: "Urbanist-600",
    fontSize: CAPTION_FONT_SIZE,
    lineHeight: CAPTION_LINE_HEIGHT,
    includeFontPadding: false,
    color: huddleColors.onPrimary,
  },
  uploading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.profileHeroScrimMid,
  },
  uploadingText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    color: huddleColors.onPrimary,
  },
  emptyInner: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x5,
  },
  emptyIcon: {
    width: huddleProfilePhotoSlots.emptyIconSize,
    height: huddleProfilePhotoSlots.emptyIconSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.primarySoftFill,
    marginBottom: huddleSpacing.x3,
  },
  emptyTitle: {
    textAlign: "center",
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  emptyHelper: {
    marginTop: huddleSpacing.x1,
    textAlign: "center",
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: 18,
    color: huddleColors.subtext,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: huddleColors.backdrop,
  },
  sheet: {
    borderTopLeftRadius: huddleRadii.modal,
    borderTopRightRadius: huddleRadii.modal,
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x5,
    paddingBottom: huddleSpacing.x8,
    ...huddleShadows.glassElevation2,
  },
  sheetTitle: {
    marginBottom: huddleSpacing.x3,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  sheetRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    borderRadius: huddleRadii.card,
    paddingHorizontal: huddleSpacing.x4,
  },
  sheetRowText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  removeText: {
    color: huddleColors.validationRed,
  },
  confirmCard: {
    marginHorizontal: huddleSpacing.x4,
    marginBottom: huddleSpacing.x8,
    borderRadius: huddleRadii.modal,
    backgroundColor: huddleColors.canvas,
    padding: huddleSpacing.x5,
    ...huddleShadows.glassElevation2,
  },
  confirmTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  confirmBody: {
    marginTop: huddleSpacing.x2,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: 22,
    color: huddleColors.subtext,
  },
  confirmActions: {
    flexDirection: "row",
    gap: huddleSpacing.x3,
    marginTop: huddleSpacing.x5,
  },
  confirmButton: {
    flex: 1,
    ...huddleButtons.base,
  },
  keepButton: {
    ...huddleButtons.secondary,
  },
  confirmRemoveButton: {
    ...huddleButtons.destructive,
  },
  keepButtonText: {
    ...huddleButtons.label,
    color: huddleColors.text,
  },
  removeButtonText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  pressed: {
    opacity: 0.78,
  },
});
