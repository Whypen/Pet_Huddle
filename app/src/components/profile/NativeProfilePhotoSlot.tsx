import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useEffect, useRef, useState } from "react";
import {
  resolveNativeProfilePhotoDisplayUrl,
  cleanupNativeProfilePhotoTemporaryAsset,
  uploadNativeProfilePhotoAsset,
  type NativeProfilePhotoSlot as NativeProfilePhotoSlotName,
  type NativeProfileUploadAsset,
  type NativeProfilePhotoPresentationCrop,
  type NativeSoloAspect,
} from "../../lib/nativeProfilePhotos";
import { nativeFreshImageKey, nativeFreshImageUri } from "../../lib/nativeImageFreshness";
import { logNativeProtectedActionFailure } from "../../lib/nativeStorageCleanup";
import { nativeSafeErrorCopy } from "../../lib/nativeSafeErrorCopy";
import { huddleButtons, huddleColors, huddleFieldStates, huddleGlassControls, huddleLayout, huddleProfilePhotoSlots, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";
import { NativeProfilePhotoCropper } from "./NativeProfilePhotoCropper";
import { loadNativeProfilePhotoForEditing, pickNativeProfilePhoto } from "./NativeProfilePhotoPicker";
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
  onUploaded: (slot: NativeProfilePhotoSlotName, path: string, soloAspect: NativeSoloAspect | null, previousPath: string | null, presentationCrop?: NativeProfilePhotoPresentationCrop) => void;
  accessToken?: string | null;
  error?: boolean;
  slot: NativeProfilePhotoSlotName;
  soloAspect: NativeSoloAspect | null;
  userId: string | null;
  value: string | null;
  version?: string | null;
  avatarPresentation?: NativeProfilePhotoPresentationCrop | null;
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
  version,
  avatarPresentation,
}: NativeProfilePhotoSlotProps) {
  const brief = nativeProfileSlotBriefs[slot];
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [displayFailed, setDisplayFailed] = useState(false);
  const [optimisticDisplayUrl, setOptimisticDisplayUrl] = useState<string | null>(null);
  // Monotonic cache-bust token. New uploads use unique paths, but legacy avatars
  // were stored at a deterministic path (e.g. cover.webp) whose URL never changes
  // across replacements, so expo-image and the Supabase CDN can serve stale bytes.
  // We bump this locally on upload and otherwise fall back to the profile-level
  // `version` (updated_at) passed from the parent.
  const [localVersion, setLocalVersion] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [cropAsset, setCropAsset] = useState<(NativeProfileUploadAsset & { height?: number | null; width?: number | null }) | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingExisting, setEditingExisting] = useState(false);
  const [selectedSoloAspect, setSelectedSoloAspect] = useState<NativeSoloAspect>(soloAspect ?? "4:5");
  const [captionDraft, setCaptionDraft] = useState(captionValue ?? "");
  const [captionInputWidth, setCaptionInputWidth] = useState(0);
  const acceptedCaptionDraft = useRef(captionValue ?? "");
  const pendingCaptionDraft = useRef(captionValue ?? "");
  const pendingCaptionIsAddition = useRef(false);
  const captionInputRef = useRef<TextInput>(null);
  const optimisticPathRef = useRef<string | null>(null);
  const optimisticTemporaryAssetRef = useRef<NativeProfileUploadAsset | null>(null);
  const [captioning, setCaptioning] = useState(false);
  const hasPhoto = Boolean(value);
  const allowCaption = hasPhoto && slot !== "cover";
  // Caption is optional and hidden until the user adds one: only render it while
  // actively editing (tapped the caption icon) or when a caption already exists.
  const showCaption = allowCaption && (captioning || captionDraft.trim().length > 0);

  useEffect(() => {
    let cancelled = false;
    setDisplayUrl(null);
    setDisplayFailed(false);
    if (!value || value !== optimisticPathRef.current) {
      optimisticPathRef.current = null;
      setOptimisticDisplayUrl(null);
      // A genuinely different path resolves to its own fresh URL, so drop the
      // local bump and let the parent-provided version drive cache-busting.
      setLocalVersion(null);
    }
    void resolveNativeProfilePhotoDisplayUrl(value).then((url) => {
      if (cancelled) return;
      setDisplayUrl(url);
      // Hand off from the local optimistic preview to the resolved remote URL once
      // it's ready for the just-uploaded path. Without this, the local crop URI
      // (which differs from the server-processed/resized image) stays pinned in
      // edit mode forever, because value === optimisticPathRef skips the reset above.
      if (url && value === optimisticPathRef.current) {
        optimisticPathRef.current = null;
        setOptimisticDisplayUrl(null);
        const temporaryAsset = optimisticTemporaryAssetRef.current;
        optimisticTemporaryAssetRef.current = null;
        void cleanupNativeProfilePhotoTemporaryAsset(temporaryAsset);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slot, value]);

  useEffect(() => () => {
    void cleanupNativeProfilePhotoTemporaryAsset(optimisticTemporaryAssetRef.current);
    optimisticTemporaryAssetRef.current = null;
  }, []);

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
      if (!picked) return;
      if (!userId) {
        onError?.("Please sign in to upload photos.");
        return;
      }
      setEditingExisting(false);
      setCropAsset(picked.asset);
    } catch (error) {
      onError?.(nativeSafeErrorCopy(error, "Couldn't open your photo library. Try again."));
    }
  };

  const handleEditCurrent = async () => {
    if (!value) {
      await handlePickAndUpload();
      return;
    }
    try {
      setEditingExisting(true);
      setCropAsset(await loadNativeProfilePhotoForEditing(value));
    } catch (error) {
      onError?.(nativeSafeErrorCopy(error, "Couldn't prepare that photo for editing. Try replacing it instead."));
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

  const handleCroppedSave = async (asset: NativeProfileUploadAsset, nextSoloAspect: NativeSoloAspect | null, presentationCrop?: NativeProfilePhotoPresentationCrop) => {
    if (!userId) {
      onError?.("Please sign in to upload photos.");
      return;
    }
    setUploading(true);
    try {
      if (editingExisting && slot === "cover" && value) {
        onUploaded(slot, value, nextSoloAspect, value, presentationCrop);
        await cleanupNativeProfilePhotoTemporaryAsset(asset);
        setCropAsset(null);
        return;
      }
      if (__DEV__) {
        console.log("NATIVE_PROFILE_UPLOAD_SESSION", {
          propUserId: userId,
          hasAccessToken: Boolean(accessToken),
          matched: Boolean(userId && accessToken),
        });
      }
      const path = await uploadNativeProfilePhotoAsset(userId, slot, asset, accessToken);
      optimisticPathRef.current = path;
      optimisticTemporaryAssetRef.current = asset;
      setOptimisticDisplayUrl(asset.uri || null);
      // Advance the cache-bust token so the resolved remote URL reloads fresh bytes
      // even when the storage path (and therefore the base URL) is unchanged.
      setLocalVersion(String(Date.now()));
      onUploaded(slot, path, nextSoloAspect, value, presentationCrop);
      onError?.(`Photo uploaded to ${brief.label}`);
      setCropAsset(null);
    } catch (error) {
      logNativeProtectedActionFailure("[native.profilePhotoSlot] upload_failed", error);
      // Drop the local preview so a failed replace falls back to the committed
      // value rather than stranding a stale/older local snapshot in edit mode.
      optimisticPathRef.current = null;
      setOptimisticDisplayUrl(null);
      onError?.(nativeSafeErrorCopy(error, "Couldn't save that photo. Try again in a moment."));
      setCropAsset(null);
      setConfirmingRemove(false);
    } finally {
      setUploading(false);
    }
  };

  // Cache-bust token for the resolved remote image: prefer the local upload bump,
  // then the parent profile version (updated_at), then fall back to the path.
  const freshnessVersion = localVersion || version || value || displayUrl;

  return (
    <View style={styles.slotShell}>
      <Pressable
        accessibilityLabel={hasPhoto ? `Edit ${brief.label} photo` : `${brief.label}, ${brief.helper}`}
        accessibilityRole="button"
        onPress={hasPhoto ? () => void handleEditCurrent() : handlePickAndUpload}
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
            {(optimisticDisplayUrl || displayUrl) && !displayFailed ? (
              <ExpoImage accessibilityIgnoresInvertColors cachePolicy={optimisticDisplayUrl ? "none" : "memory-disk"} contentFit="cover" key={nativeFreshImageKey(optimisticDisplayUrl || displayUrl, optimisticDisplayUrl || freshnessVersion)} onError={() => setDisplayFailed(true)} source={{ uri: optimisticDisplayUrl || nativeFreshImageUri(displayUrl, freshnessVersion) }} style={styles.photo} transition={120} />
            ) : (
              <View style={styles.photoPlaceholder} />
            )}
            {allowCaption ? (
              <Pressable
                accessibilityLabel={captionDraft.trim() ? `Edit caption for ${brief.label}` : `Add a caption to ${brief.label}`}
                accessibilityRole="button"
                onPress={() => {
                  setCaptioning(true);
                  setTimeout(() => captionInputRef.current?.focus(), 50);
                }}
                style={({ pressed }) => [styles.captionButton, pressed ? styles.pressed : null]}
              >
                <Feather color={huddleColors.text} name="edit-3" size={16} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel={`Choose a new ${brief.label} photo`}
              accessibilityRole="button"
              onPress={(event) => {
                event.stopPropagation();
                void handlePickAndUpload();
              }}
              style={({ pressed }) => [styles.changeButton, pressed ? styles.pressed : null]}
            >
              <Feather color={huddleColors.text} name="image" size={17} />
            </Pressable>
            <Pressable
              accessibilityLabel={`Remove ${brief.label} photo`}
              accessibilityRole="button"
              onPress={(event) => {
                event.stopPropagation();
                setConfirmingRemove(true);
              }}
              style={({ pressed }) => [styles.removePhotoButton, pressed ? styles.pressed : null]}
            >
              <Feather color={huddleColors.text} name="x" size={17} />
            </Pressable>
            {showCaption ? (
              <View style={styles.captionWrap}>
                <TextInput
                  ref={captionInputRef}
                  autoCapitalize="none"
                  multiline
                  numberOfLines={CAPTION_LINES}
                  onBlur={() => {
                    const next = captionDraft.trim() || null;
                    onCaptionChange?.(next);
                    onCaptionCommit?.(next);
                    setCaptioning(false);
                  }}
                  onChangeText={updateCaptionDraft}
                  placeholder="Add a caption"
                  placeholderTextColor={huddleColors.profileCaptionPlaceholder}
                  onLayout={(event) => setCaptionInputWidth(event.nativeEvent.layout.width)}
                  scrollEnabled
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
            <Text ellipsizeMode="tail" numberOfLines={2} style={styles.emptyTitle}>{brief.label}</Text>
            <Text ellipsizeMode="tail" numberOfLines={2} style={styles.emptyHelper}>{brief.helper}</Text>
          </View>
        )}
      </Pressable>

      <Modal animationType="fade" onRequestClose={() => setConfirmingRemove(false)} transparent visible={confirmingRemove}>
        <Pressable onPress={() => setConfirmingRemove(false)} style={[styles.sheetBackdrop, styles.confirmBackdrop]}>
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
        avatarCrop={slot === "cover"}
        asset={cropAsset}
        initialPresentationCrop={slot === "cover" ? avatarPresentation : null}
        aspect={brief.aspect}
        onCancel={() => {
          void cleanupNativeProfilePhotoTemporaryAsset(cropAsset);
          setCropAsset(null);
          setEditingExisting(false);
        }}
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
    backgroundColor: huddleColors.glassControl,
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
  captionButton: {
    position: "absolute",
    bottom: huddleSpacing.x3,
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
  changeButton: {
    position: "absolute",
    top: huddleSpacing.x3,
    left: huddleSpacing.x3,
    zIndex: 3,
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.glassChrome,
    ...huddleShadows.photoControl,
  },
  removePhotoButton: {
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
    ...huddleGlassControls.surface,
    width: huddleProfilePhotoSlots.emptyIconSize,
    height: huddleProfilePhotoSlots.emptyIconSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
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
    width: "100%",
    maxWidth: 360,
    borderRadius: huddleRadii.modal,
    backgroundColor: huddleColors.canvas,
    padding: huddleSpacing.x5,
    ...huddleShadows.glassElevation2,
  },
  confirmBackdrop: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x4,
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
