import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as ImagePicker from "expo-image-picker";
import { launchNativeImageLibraryAsync } from "../../lib/nativeMediaPermissions";
import { Image as ExpoImage } from "expo-image";
import { AccessibilityInfo, Animated as RNAnimated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { NativeSpinner } from "../NativeSpinner";
import { NativeNavIcon } from "../NativeNavIcons";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from "react-native-reanimated";
import {
  createNativeBroadcastNoMedia,
  getNativeBroadcastPinColor,
  getNativeBroadcastActiveConcurrentLimit,
  NATIVE_BROADCAST_CAPS_BY_TIER,
  NATIVE_BROADCAST_ACTIVE_CONCURRENT_CAPS_BY_TIER,
  NATIVE_SUPER_BROADCAST_CAPS,
  cleanupNativeBroadcastImages,
  nativeBroadcastRequiresPetType,
  normalizeNativeBroadcastAlertType,
  normalizeNativeBroadcastTier,
  uploadNativeBroadcastImage,
  type NativeBroadcastAlertType,
} from "../../lib/nativeBroadcast";
import { createNativeProtectedActionError, getNativeProtectedActionResult, logNativeProtectedActionFailure, type NativeProtectedActionCleanupResult } from "../../lib/nativeStorageCleanup";
import { lookupNativeMapAddress } from "../../lib/nativeMapMutations";
import { haptic } from "../../lib/nativeHaptics";
import { nativeSafeErrorCopy } from "../../lib/nativeSafeErrorCopy";
import { nativeFreshImageKey, nativeFreshImageUri } from "../../lib/nativeImageFreshness";
import type { NativeMapAlert } from "../../lib/nativeMapData";
import {
  extractCompletedNativeSocialPreviewUrl,
  buildNativeSocialImageMetadata,
  fetchNativeSocialLinkPreviews,
  stripNativeSocialExternalUrlFromText,
  type NativeSocialLinkPreview,
} from "../../lib/nativeSocial";
import { fetchNativeProfileSummary, subscribeNativeProfileSummary, type NativeProfileSummary } from "../../lib/nativeProfileSummary";
import { getFreshNativeAccessToken } from "../../lib/nativeFunctionClient";
import { isNativeVerifiedProfile } from "../../lib/nativeVerificationGate";
import { useLanguage } from "../../lib/nativeLanguage";
import { nativePetEmojiForLabel, nativePetFocusLabels, normalizeNativePetFocusLabel } from "../../lib/nativePetTaxonomy";
import { huddleColors, huddleFieldStates, huddleFormControls, huddleFormFields, huddleGlassControls, huddleLayout, huddleMapBroadcastFooter, huddleRadii, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";
import { springTab } from "../../lib/nativeAnimations";
import {
  averageNativeUploadProgress,
  NATIVE_UPLOAD_PROGRESS_READ_READY,
  NATIVE_UPLOAD_PROGRESS_START,
  nextNativeUploadProgress,
} from "../../lib/nativeUploadProgress";
import { AppBottomSheet, AppBottomSheetFooter, AppBottomSheetHeader, AppBottomSheetScroll, AppConfirmModal, AppKeyboardAvoidingView as KeyboardAvoidingView, AppModalCloseButton } from "../nativeModalPrimitives";
import { nativeModalStyles } from "../nativeModalPrimitives.styles";
import { NativeSocialExternalLinkPreview } from "../social/NativeSocialFeedPrimitives";
import { NativeFormChoiceField } from "../NativeFormField";
import { HuddleSingleRangeControl } from "../HuddleRangeControl";
import { useErrorShake } from "../motion/useErrorShake";
import { formatNativeAddonPrice, loadNativeStoreProducts, nativeMembershipPriceDisplay, type NativeStoreProductId, type NativeStoreProductState } from "../../lib/nativeStoreSubscriptions";

type NativeBroadcastLocation = {
  lat: number;
  lng: number;
};

type NativeBroadcastMedia = {
  error: string | null;
  height?: number | null;
  id: string;
  progress: number;
  status: "queued" | "uploading" | "uploaded" | "error";
  uploadedUrl: string | null;
  uri: string;
  width?: number | null;
};

type NativeBroadcastModalProps = {
  accessToken?: string | null;
  alertType: NativeBroadcastAlertType;
  centerCoordinate: [number, number];
  mapRestricted?: boolean;
  onAlertTypeChange: (next: NativeBroadcastAlertType) => void;
  onClearLocation: () => void;
  onClose: () => void;
  onCreated: (created?: { alertId: string; threadId: string | null; alert: NativeMapAlert }) => Promise<void> | void;
  onOpenPremium?: (target?: "plus" | "gold" | "addons" | "super") => void;
  onOpenSupport?: () => void;
  onPetTypeChange?: (next: string | null) => void;
  onRequestPinLocation: () => void;
  onRestricted?: () => void;
  selectedAddress?: string | null;
  selectedLocation: NativeBroadcastLocation | null;
  selectedPetType?: string | null;
  sessionKey?: string | null;
  userId: string | null;
  visible: boolean;
};

const ALERT_TYPES: NativeBroadcastAlertType[] = ["Stray", "Lost", "Caution", "Others"];
const MAX_BROADCAST_MEDIA = 10;
const DEFAULT_BROADCAST_RANGE_KM = 1;
const DEFAULT_BROADCAST_DURATION_HOURS = 1;
const MIN_BROADCAST_THUMB_ASPECT = 9 / 16;
const MAX_BROADCAST_THUMB_ASPECT = 1.91;
const broadcastThumbAspect = (media: NativeBroadcastMedia) => Math.min(Math.max(
  typeof media.width === "number" && typeof media.height === "number" && media.width > 0 && media.height > 0
    ? media.width / media.height
    : 1,
  MIN_BROADCAST_THUMB_ASPECT,
), MAX_BROADCAST_THUMB_ASPECT);

const extractCompletedBroadcastPreviewUrl = (value: string) => {
  return extractCompletedNativeSocialPreviewUrl(value);
};

const humanBroadcastError = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) return nativeSafeErrorCopy(error, "Please try again.");
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = [record.message, record.error_description, record.details, record.hint]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .find(Boolean);
    if (message) return nativeSafeErrorCopy(message, "Please try again.");
  }
  if (typeof error === "string" && error.trim()) return nativeSafeErrorCopy(error, "Please try again.");
  return "Please try again.";
};

function SlideToPublish({
  busy,
  disabled,
  onCommit,
  resetKey,
}: {
  busy: boolean;
  disabled: boolean;
  onCommit: () => Promise<void>;
  resetKey: number;
}) {
  const THUMB_SIZE = 48;
  const [trackWidth, setTrackWidth] = useState(0);
  const maxTranslate = Math.max(0, trackWidth - THUMB_SIZE - 8);
  const translateX = useSharedValue(0);
  const hitMid = useSharedValue(false);
  const committedRef = useRef(false);
  const prevBusyRef = useRef(false);
  const onCommitRef = useRef(onCommit);

  useEffect(() => { onCommitRef.current = onCommit; }, [onCommit]);

  useEffect(() => {
    if (prevBusyRef.current && !busy && committedRef.current) {
      committedRef.current = false;
      translateX.value = withSpring(0, springTab);
    }
    prevBusyRef.current = busy;
  }, [busy, translateX]);

  useEffect(() => {
    committedRef.current = false;
    translateX.value = withSpring(0, springTab);
  }, [resetKey, translateX]);

  const handleCommit = useCallback(() => {
    committedRef.current = true;
    void onCommitRef.current();
  }, []);

  const panGesture = useMemo(() =>
    Gesture.Pan()
      .activeOffsetX([12, 9999])
      .failOffsetY([-12, 12])
      .enabled(!disabled && !busy)
      .onBegin(() => {
        "worklet";
        hitMid.value = false;
        runOnJS(haptic.selectTab)();
      })
      .onUpdate((e) => {
        "worklet";
        translateX.value = Math.max(0, Math.min(e.translationX, maxTranslate));
        if (!hitMid.value && translateX.value >= maxTranslate * 0.5) {
          hitMid.value = true;
          runOnJS(haptic.selectTab)();
        }
      })
      .onEnd(() => {
        "worklet";
        if (translateX.value >= maxTranslate * 0.92) {
          runOnJS(haptic.primaryConfirm)();
          runOnJS(handleCommit)();
        } else {
          translateX.value = withSpring(0, springTab);
          runOnJS(haptic.swipeReturn)();
        }
      }),
    [disabled, busy, maxTranslate, hitMid, translateX, handleCommit],
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <View
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        style={[slideToPublishStyles.track, disabled ? slideToPublishStyles.trackDisabled : null]}
      >
        <Text style={[slideToPublishStyles.label, disabled ? slideToPublishStyles.labelDisabled : null]}>Slide to publish</Text>
        <Animated.View style={[slideToPublishStyles.thumb, thumbStyle]}>
          {busy ? (
            <NativeSpinner tone="muted" />
          ) : (
            <MaterialCommunityIcons color={huddleColors.premiumGold} name="alert" size={20} />
          )}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const slideToPublishStyles = StyleSheet.create({
  track: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: huddleColors.blue,
  },
  trackDisabled: {
    backgroundColor: huddleColors.mutedCanvas,
  },
  label: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
  labelDisabled: {
    color: huddleColors.mutedText,
  },
  thumb: {
    position: "absolute",
    left: 4,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: huddleColors.canvas,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: huddleColors.premiumGold,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
});

function BroadcastPetTypeSelect({
  error,
  focused,
  onFocus,
  onSelect,
  open,
  selectedPetType,
}: {
  error?: string;
  focused: boolean;
  onFocus: () => void;
  onSelect: (value: string) => void;
  open: boolean;
  selectedPetType: string | null;
}) {
  const selectedLabel = normalizeNativePetFocusLabel(selectedPetType);
  return (
    <View style={open ? styles.petTypeDropdownLayer : null}>
      <NativeFormChoiceField error={error} focused={focused || open} label="">
        <Pressable
          accessibilityRole="button"
          onPress={onFocus}
          style={styles.petTypeSelectTrigger}
        >
          <View style={styles.petTypeSelectValueRow}>
            {selectedLabel ? <Text style={styles.petTypeEmoji}>{nativePetEmojiForLabel(selectedLabel)}</Text> : null}
            <Text numberOfLines={1} style={[styles.petTypeSelectValue, !selectedLabel ? styles.petTypePlaceholder : null]}>
              {selectedLabel || "Pet Type"}
            </Text>
          </View>
          <Feather color={huddleColors.iconMuted} name={open ? "chevron-up" : "chevron-down"} size={16} />
        </Pressable>
        {open ? (
          <ScrollView nestedScrollEnabled style={styles.petTypeSelectMenu}>
            {nativePetFocusLabels.map((option) => {
              const selected = selectedLabel === option;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ checked: selected }}
                  key={option}
                  onPress={() => onSelect(option)}
                  style={({ pressed }) => [
                    styles.petTypeSelectOption,
                    pressed ? styles.petTypeSelectOptionPressed : null,
                  ]}
                >
                  <View style={styles.petTypeOptionLabelRow}>
                    <Text style={styles.petTypeEmoji}>{nativePetEmojiForLabel(option)}</Text>
                    <Text ellipsizeMode="tail" numberOfLines={1} style={styles.petTypeSelectOptionText}>{option}</Text>
                  </View>
                  {selected ? <Feather color={huddleColors.blue} name="check" size={16} /> : <View style={styles.petTypeSelectCheckSlot} />}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </NativeFormChoiceField>
    </View>
  );
}

export function NativeBroadcastModal({
  accessToken,
  alertType,
  centerCoordinate,
  mapRestricted = false,
  onAlertTypeChange,
  onClearLocation,
  onClose,
  onCreated,
  onOpenPremium,
  onOpenSupport,
  onPetTypeChange,
  onRequestPinLocation,
  onRestricted,
  selectedAddress,
  selectedLocation,
  selectedPetType,
  sessionKey,
  userId,
  visible,
}: NativeBroadcastModalProps) {
  const { t } = useLanguage();
  const { height } = useWindowDimensions();
  const broadcastSheetMaxHeight = height * 0.82;
  const { shake: triggerCreateShake, shakeStyle: createShakeStyle } = useErrorShake();
  // SS4: pull-down-to-dismiss — shared values (hooks must be at top level)
  const dragY = useSharedValue(0);
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [linkPreviews, setLinkPreviews] = useState<Record<string, NativeSocialLinkPreview>>({});
  const [lockedPreviewUrl, setLockedPreviewUrl] = useState<string | null>(null);
  const [dismissedPreviewUrls, setDismissedPreviewUrls] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [mediaFiles, setMediaFiles] = useState<NativeBroadcastMedia[]>([]);
  const [postOnThreads, setPostOnThreads] = useState(true);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [isSensitive, setIsSensitive] = useState(false);
  const [extraBroadcast72h, setExtraBroadcast72h] = useState(0);
  const [activeBroadcastLimit, setActiveBroadcastLimit] = useState(NATIVE_BROADCAST_ACTIVE_CONCURRENT_CAPS_BY_TIER.free);
  const [activeBroadcastUsed, setActiveBroadcastUsed] = useState(0);
  const [tier, setTier] = useState<"free" | "plus" | "gold">("free");
  const [showUpsell, setShowUpsell] = useState(false);
  const [broadcastUpsellTarget, setBroadcastUpsellTarget] = useState<"plus" | "gold" | "super" | null>(null);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [petTypeMenuOpen, setPetTypeMenuOpen] = useState(false);
  const [focusedField, setFocusedField] = useState<"title" | "description" | "petType" | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ description?: boolean; location?: boolean; petType?: boolean }>({});
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(userId);
  const [creatorProfile, setCreatorProfile] = useState<NativeProfileSummary | null>(null);
  const composerScrollRef = useRef<ScrollView | null>(null);
  const composerFieldOffsetsRef = useRef<Record<"title" | "description" | "petType", number>>({ title: 0, description: 0, petType: 0 });
  const lastFocusedComposerFieldRef = useRef<"title" | "description" | "petType" | null>(null);
  const publishBusy = useRef(false);
  const upsellShownThisOpenRef = useRef(false);
  const descriptionInputRef = useRef<TextInput | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [screenReaderOn, setScreenReaderOn] = useState(false);
  const [accessibilityConfirmOpen, setAccessibilityConfirmOpen] = useState(false);
  const [sliderResetKey, setSliderResetKey] = useState(0);

  const baseCaps = NATIVE_BROADCAST_CAPS_BY_TIER[tier];
  const capRangeKm = extraBroadcast72h > 0 ? NATIVE_SUPER_BROADCAST_CAPS.radiusKm : baseCaps.radiusKm;
  const capDurationHours = extraBroadcast72h > 0 ? NATIVE_SUPER_BROADCAST_CAPS.durationHours : baseCaps.durationHours;
  const visualRangeMaxKm = extraBroadcast72h > 0 ? NATIVE_SUPER_BROADCAST_CAPS.radiusKm : NATIVE_BROADCAST_CAPS_BY_TIER.gold.radiusKm;
  const visualDurationMaxHours = extraBroadcast72h > 0 ? NATIVE_SUPER_BROADCAST_CAPS.durationHours : NATIVE_BROADCAST_CAPS_BY_TIER.gold.durationHours;
  const [rangeKm, setRangeKm] = useState(DEFAULT_BROADCAST_RANGE_KM);
  const [durationHours, setDurationHours] = useState(DEFAULT_BROADCAST_DURATION_HOURS);
  const pinColor = useMemo(() => getNativeBroadcastPinColor(alertType), [alertType]);
  const uploadProgress = useMemo(() => averageNativeUploadProgress(mediaFiles) ?? 0, [mediaFiles]);
  const effectiveUserId = userId ?? resolvedUserId;
  const typedPreviewUrl = extractCompletedBroadcastPreviewUrl(description);
  const activePreviewUrl = lockedPreviewUrl || (typedPreviewUrl && !dismissedPreviewUrls.has(typedPreviewUrl) ? typedPreviewUrl : null);
  const hasActiveBroadcastSlot = activeBroadcastLimit <= 0 || activeBroadcastUsed < activeBroadcastLimit;
  const oneBroadcastRemaining = activeBroadcastLimit > 0 && activeBroadcastLimit - activeBroadcastUsed === 1;
  const isGoldMember = tier === "gold";
  const isVerified = isNativeVerifiedProfile(creatorProfile);
  const petTypeRequired = nativeBroadcastRequiresPetType(alertType);
  const normalizedSelectedPetType = normalizeNativePetFocusLabel(selectedPetType);

  const coerceQuotaNumber = (value: unknown) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.floor(parsed));
  };

  const isUserVerified = (row: NativeProfileSummary | null) => {
    return isNativeVerifiedProfile(row);
  };

  useEffect(() => {
    setResolvedUserId(userId);
  }, [userId, visible]);

  useEffect(() => {
    if (!visible) return;
    upsellShownThisOpenRef.current = false;
    setShowUpsell(false);
    setBroadcastUpsellTarget(null);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setErrorText(null);
    if (!effectiveUserId) return;
    void fetchNativeProfileSummary(effectiveUserId, { force: true, accessToken }).then(({ profile, quota }) => {
      setCreatorProfile(profile);
      const nextTier = normalizeNativeBroadcastTier(String(profile?.effective_tier || profile?.tier || quota?.effective_tier || quota?.tier || "free"));
      const nextIsVerified = isUserVerified(profile);
      const snapshotLimit = coerceQuotaNumber((quota as Record<string, unknown> | null)?.broadcast_active_limit);
      const snapshotUsed = coerceQuotaNumber((quota as Record<string, unknown> | null)?.broadcast_active_used);
      const fallbackLimit = getNativeBroadcastActiveConcurrentLimit(nextTier, nextIsVerified);
      const extra = typeof (quota as Record<string, unknown> | null)?.extra_broadcast_72h === "number"
        ? ((quota as Record<string, unknown>).extra_broadcast_72h as number)
        : 0;
      const entitledCaps = extra > 0 ? NATIVE_SUPER_BROADCAST_CAPS : NATIVE_BROADCAST_CAPS_BY_TIER[nextTier];

      setTier(nextTier);
      setActiveBroadcastLimit(snapshotLimit > 0 ? snapshotLimit : fallbackLimit);
      setActiveBroadcastUsed(snapshotUsed);
      setExtraBroadcast72h(extra);
      setRangeKm((current) => Math.min(current, entitledCaps.radiusKm));
      setDurationHours((current) => Math.min(current, entitledCaps.durationHours));
    }).catch(() => undefined);
  }, [accessToken, effectiveUserId, visible]);

  useEffect(() => {
    if (!visible || !effectiveUserId) return undefined;
    return subscribeNativeProfileSummary(effectiveUserId, ({ profile, quota }) => {
      setCreatorProfile(profile);
      const nextTier = normalizeNativeBroadcastTier(String(profile?.effective_tier || profile?.tier || quota?.effective_tier || quota?.tier || "free"));
      const nextIsVerified = isNativeVerifiedProfile(profile);
      setTier(nextTier);
      setActiveBroadcastLimit((current) => Math.max(current, getNativeBroadcastActiveConcurrentLimit(nextTier, nextIsVerified)));
    }, { sessionKey });
  }, [effectiveUserId, sessionKey, visible]);

  useEffect(() => {
    if (!visible) return;
    setRangeKm((current) => Math.min(current, capRangeKm));
    setDurationHours((current) => Math.min(current, capDurationHours));
  }, [capDurationHours, capRangeKm, visible]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    void AccessibilityInfo.isScreenReaderEnabled().then(setScreenReaderOn);
  }, []);

  const resetComposer = () => {
    setTitle("");
    setDescription("");
    setLockedPreviewUrl(null);
    setDismissedPreviewUrls(new Set());
    setMediaFiles([]);
    setPostOnThreads(true);
    setVerifiedOnly(false);
    setIsSensitive(false);
    setRangeKm(DEFAULT_BROADCAST_RANGE_KM);
    setDurationHours(DEFAULT_BROADCAST_DURATION_HOURS);
    setErrorText(null);
    setValidationErrors({});
    setShowUpsell(false);
    setBroadcastUpsellTarget(null);
    setPetTypeMenuOpen(false);
    onPetTypeChange?.(null);
    lastFocusedComposerFieldRef.current = null;
  };

  useEffect(() => {
    if (petTypeRequired) return;
    setVerifiedOnly(false);
    setPetTypeMenuOpen(false);
    setValidationErrors((current) => ({ ...current, petType: false }));
    onPetTypeChange?.(null);
  }, [onPetTypeChange, petTypeRequired]);

  const scrollComposerFieldIntoView = useCallback((field: "title" | "description" | "petType") => {
    lastFocusedComposerFieldRef.current = field;
    const scroll = () => {
      composerScrollRef.current?.scrollTo({
        y: Math.max(0, (composerFieldOffsetsRef.current[field] || 0) - huddleSpacing.x2),
        animated: true,
      });
    };
    requestAnimationFrame(scroll);
    setTimeout(scroll, 180);
  }, []);

  const scrollComposerToTop = useCallback(() => {
    const scroll = () => composerScrollRef.current?.scrollTo({ y: 0, animated: true });
    requestAnimationFrame(scroll);
    setTimeout(scroll, 180);
  }, []);

  useEffect(() => {
    if (!activePreviewUrl || linkPreviews[activePreviewUrl]) return;
    void fetchNativeSocialLinkPreviews([activePreviewUrl], accessToken).then((previews) => {
      setLinkPreviews((current) => ({ ...current, ...previews }));
    });
  }, [accessToken, activePreviewUrl, linkPreviews]);

  useEffect(() => {
    if (!typedPreviewUrl || dismissedPreviewUrls.has(typedPreviewUrl)) return;
    const preview = linkPreviews[typedPreviewUrl];
    if (!preview || preview.loading) return;
    setLockedPreviewUrl(typedPreviewUrl);
    setDescription((current) => stripNativeSocialExternalUrlFromText(current, typedPreviewUrl));
  }, [dismissedPreviewUrls, linkPreviews, typedPreviewUrl]);

  const pickMedia = async () => {
    if (creating) return;
    const freshAccessToken = await getFreshNativeAccessToken(accessToken);
    if (!effectiveUserId || !freshAccessToken) {
      setErrorText("Please login to upload images.");
      return;
    }
    setErrorText(null);
    const availableSlots = Math.max(0, MAX_BROADCAST_MEDIA - mediaFiles.length);
    if (availableSlots <= 0) {
      setErrorText(`You can upload up to ${MAX_BROADCAST_MEDIA} photos.`);
      return;
    }
    let result: Awaited<ReturnType<typeof ImagePicker.launchImageLibraryAsync>>;
    try {
      // Best-effort request; PHPicker presents regardless, so never hard-block.
      result = await launchNativeImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ["images"],
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 0.9,
        selectionLimit: availableSlots,
      });
    } catch (error) {
      setErrorText(nativeSafeErrorCopy(error, "Couldn't open your photo library. Try again."));
      return;
    }
    if (result.canceled) return;
    const prepared = result.assets.slice(0, availableSlots).map((asset) => ({
      error: null,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      height: asset.height,
      progress: 0,
      status: "queued" as const,
      uploadedUrl: null,
      uri: asset.uri,
      width: asset.width,
    }));
    if (result.assets.length > availableSlots) {
      setErrorText(`Only the first ${MAX_BROADCAST_MEDIA} photos are kept.`);
    }
    setMediaFiles((current) => [...current, ...prepared]);
    requestAnimationFrame(() => {
      const focusedField = lastFocusedComposerFieldRef.current;
      if (focusedField) {
        scrollComposerFieldIntoView(focusedField);
        return;
      }
      composerScrollRef.current?.scrollToEnd({ animated: true });
    });
    const uploadOne = async (item: NativeBroadcastMedia) => {
      const asset = result.assets.find((candidate) => candidate.uri === item.uri);
      setMediaFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, progress: Math.max(entry.progress, NATIVE_UPLOAD_PROGRESS_START), status: "uploading", error: null } : entry));
      let progressTimer: ReturnType<typeof setInterval> | null = null;
      try {
        progressTimer = setInterval(() => {
          setMediaFiles((current) => current.map((entry) => (
            entry.id === item.id && entry.status === "uploading"
              ? { ...entry, progress: nextNativeUploadProgress(entry.progress) }
              : entry
          )));
        }, 450);
        setMediaFiles((current) => current.map((entry) => entry.id === item.id && entry.status === "uploading" ? { ...entry, progress: Math.max(entry.progress, NATIVE_UPLOAD_PROGRESS_READ_READY) } : entry));
        const uploadedUrl = await uploadNativeBroadcastImage(effectiveUserId, item.uri, asset?.fileName, asset?.mimeType, freshAccessToken, sessionKey);
        setMediaFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, progress: 100, status: "uploaded", uploadedUrl, error: null } : entry));
      } catch (error) {
        logNativeProtectedActionFailure("[map.broadcastModal] upload_media_failed", error);
        const message = humanBroadcastError(error);
        setMediaFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, progress: 0, status: "error", uploadedUrl: null, error: message } : entry));
        setErrorText(nativeSafeErrorCopy(error, `Couldn't upload that image. ${message}`));
      } finally {
        if (progressTimer) clearInterval(progressTimer);
      }
    };
    const uploadQueue = async () => {
      const queue = [...prepared];
      await Promise.all(Array.from({ length: Math.min(2, queue.length) }, async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (next) await uploadOne(next);
        }
      }));
    };
    requestAnimationFrame(() => {
      void uploadQueue();
    });
  };

  const removeMediaAt = (index: number) => {
    setMediaFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const requestLocation = async () => {
    if (mapRestricted) {
      onRestricted?.();
      return;
    }
    setErrorText(null);
    onRequestPinLocation();
  };

  const upsellTargetForTier = (): "plus" | "gold" | "super" | null => {
    if (extraBroadcast72h > 0) return null;
    if (tier === "free") return "plus";
    if (tier === "plus") return "gold";
    return "super";
  };

  const triggerUpsellForLimit = (target: "plus" | "gold" | "super" | null) => {
    if (!target) return;
    if (upsellShownThisOpenRef.current) {
      setShowUpsell(true);
      return;
    }
    upsellShownThisOpenRef.current = true;
    setBroadcastUpsellTarget(target);
  };

  const handleRangeChange = (nextValue: number) => {
    if (nextValue >= capRangeKm && extraBroadcast72h <= 0) {
      setRangeKm(capRangeKm);
      triggerUpsellForLimit(upsellTargetForTier());
      return;
    }
    setRangeKm(Math.min(nextValue, capRangeKm));
  };

  const handleDurationChange = (nextValue: number) => {
    if (nextValue >= capDurationHours && extraBroadcast72h <= 0) {
      setDurationHours(capDurationHours);
      triggerUpsellForLimit(upsellTargetForTier());
      return;
    }
    setDurationHours(Math.min(nextValue, capDurationHours));
  };

  const handleClose = () => {
    if (creating) return;
    onClose();
  };

  // SS4: pull-down-to-dismiss gesture (defined after handleClose so closure captures it)
  const pullDownGesture = Gesture.Pan()
    .activeOffsetY([-9999, 28])
    .failOffsetX([-24, 24])
    .onUpdate((e) => { dragY.value = Math.max(0, e.translationY); })
    .onEnd((event) => {
      const shouldClose = dragY.value > 180 || (dragY.value > 96 && event.velocityY > 1200);
      if (shouldClose) {
        dragY.value = 0;
        runOnJS(handleClose)();
      } else {
        dragY.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const handleCreate = async (): Promise<boolean> => {
    const freshAccessToken = await getFreshNativeAccessToken(accessToken);
    if (!effectiveUserId || !freshAccessToken) {
      setErrorText("Please login to broadcast alerts.");
      return false;
    }
    const nextValidationErrors = {
      location: !selectedLocation,
      petType: petTypeRequired && !normalizedSelectedPetType,
      description: !description.trim() && !activePreviewUrl,
    };
    setValidationErrors(nextValidationErrors);
    if (nextValidationErrors.location || nextValidationErrors.petType || nextValidationErrors.description) {
      triggerCreateShake();
      if (nextValidationErrors.location) scrollComposerToTop();
      else if (nextValidationErrors.petType) scrollComposerFieldIntoView("petType");
      else scrollComposerFieldIntoView("description");
      return false;
    }
    if (mapRestricted) {
      onRestricted?.();
      return false;
    }
    if (rangeKm > capRangeKm || durationHours > capDurationHours) {
      setErrorText("Adjust range or duration to continue.");
      return false;
    }
    if (!hasActiveBroadcastSlot) {
      setErrorText("All broadcast slots are in use. Wait for one to expire.");
      return false;
    }
    if (mediaFiles.some((item) => item.status === "queued" || item.status === "uploading")) {
      setErrorText("Please wait for image upload to finish.");
      return false;
    }
    if (mediaFiles.some((item) => item.status === "error")) {
      setErrorText("One or more images failed to upload. Remove them or retry.");
      return false;
    }
    const images = mediaFiles.map((item) => item.uploadedUrl).filter((value): value is string => Boolean(value));
    if (images.length !== mediaFiles.length) {
      setErrorText("Some uploaded images are missing. Please reselect them.");
      return false;
    }
    const imageMetadata = buildNativeSocialImageMetadata(mediaFiles.map((item) => ({ ...item, uri: item.uploadedUrl || item.uri })));
    const publishLocation = selectedLocation;
    if (!publishLocation) return false;
    setCreating(true);
    setErrorText(null);
    try {
      let resolvedAddress = selectedAddress ?? null;
      if (!resolvedAddress) {
        resolvedAddress = await lookupNativeMapAddress(publishLocation.lat, publishLocation.lng);
      }
      const created = await createNativeBroadcastNoMedia({
        accessToken: freshAccessToken,
        address: resolvedAddress,
        alertType,
        description: activePreviewUrl ? [stripNativeSocialExternalUrlFromText(description, activePreviewUrl), activePreviewUrl].filter(Boolean).join("\n") || null : description || null,
        durationHours,
        imageMetadata,
        images,
        isSensitive,
        lat: publishLocation.lat,
        lng: publishLocation.lng,
        petType: normalizedSelectedPetType,
        postOnThreads,
        verifiedOnly,
        rangeKm,
        sessionKey,
        title: title || null,
        userId: effectiveUserId,
      });
      const createdAt = new Date().toISOString();
      const createdAlert: NativeMapAlert = {
        id: created.alertId,
        latitude: publishLocation.lat,
        longitude: publishLocation.lng,
        alert_type: alertType,
        pet_type: petTypeRequired ? normalizedSelectedPetType : null,
        title: title.trim() || null,
        description: activePreviewUrl ? [stripNativeSocialExternalUrlFromText(description, activePreviewUrl), activePreviewUrl].filter(Boolean).join("\n") || null : description.trim() || null,
        photo_url: images[0] || null,
        media_urls: images,
        support_count: 0,
        share_count: 0,
        report_count: 0,
        created_at: createdAt,
        expires_at: created.expiresAt,
        duration_hours: created.durationHours,
        range_meters: created.rangeMeters,
        range_km: created.rangeKm,
        creator_id: effectiveUserId,
        has_thread: Boolean(created.threadId),
        thread_id: created.threadId,
        posted_to_threads: postOnThreads,
        post_on_social: postOnThreads,
        social_post_id: created.threadId,
        social_status: created.threadId ? "posted" : null,
        social_url: created.threadId ? `/threads?focus=${created.threadId}` : null,
        is_sensitive: isSensitive,
        verified_only: verifiedOnly,
        is_demo: false,
        location_street: resolvedAddress,
        location_district: null,
        creator: {
          avatar_url: creatorProfile?.avatar_url ?? null,
          display_name: creatorProfile?.display_name ?? null,
          social_id: creatorProfile?.social_id ?? null,
        },
        marker_state: "active",
      };
      resetComposer();
      await onCreated({ alertId: created.alertId, threadId: created.threadId, alert: createdAlert });
      return true;
    } catch (error) {
      haptic.error();
      logNativeProtectedActionFailure("[map.broadcastModal] create_alert_failed", error);
      if (images.length > 0) {
        const cleanupResult: NativeProtectedActionCleanupResult = await cleanupNativeBroadcastImages(images, effectiveUserId, freshAccessToken, sessionKey).catch(() => "failed" as const);
        logNativeProtectedActionFailure("[map.broadcastModal] create_alert_orphan_cleanup", createNativeProtectedActionError({
          ok: false,
          stage: getNativeProtectedActionResult(error)?.stage || "domain_save",
          originalError: getNativeProtectedActionResult(error)?.originalError || error,
          cleanupAttempted: true,
          cleanupResult,
        }));
      }
      const message = humanBroadcastError(error);
      const normalizedMessage = message.toLowerCase();
      const isCapError = normalizedMessage.includes("active broadcast")
        || normalizedMessage.includes("quota_exceeded")
        || normalizedMessage.includes("active_broadcast_limit_reached")
        || normalizedMessage.includes("slot");
      if (isCapError && effectiveUserId) {
        // Re-fetch snapshot to sync actual active count after race
        void fetchNativeProfileSummary(effectiveUserId, { force: true, accessToken }).then(({ quota }) => {
          const snapshotLimit = coerceQuotaNumber((quota as Record<string, unknown> | null)?.broadcast_active_limit);
          const snapshotUsed = coerceQuotaNumber((quota as Record<string, unknown> | null)?.broadcast_active_used);
          if (snapshotLimit > 0) setActiveBroadcastLimit(snapshotLimit);
          setActiveBroadcastUsed(snapshotUsed);
        }).catch(() => undefined);
      }
      setErrorText(isCapError
        ? "All broadcast slots are in use. Wait for one to expire."
        : `Broadcast failed: ${message}`);
      throw error;
    } finally {
      setCreating(false);
    }
  };

  const handleCommit = async () => {
    publishBusy.current = true;
    try {
      const created = await handleCreate();
      publishBusy.current = false;
      if (!created) {
        setSliderResetKey((current) => current + 1);
        return;
      }
      haptic.success();
      setActiveBroadcastUsed((current) => current + 1);
      onClose();
    } catch {
      // errorText already set by handleCreate.
      setSliderResetKey((current) => current + 1);
    }
  };

  const useAccessibilityFallback = reducedMotion || screenReaderOn;
  const isSliderDisabled = creating || !hasActiveBroadcastSlot
    || mediaFiles.some((item) => item.status === "queued" || item.status === "uploading");

  return (
    <Modal presentationStyle="overFullScreen" animationType="slide" onRequestClose={handleClose} transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close broadcast composer" accessibilityRole="button" onPress={handleClose} style={StyleSheet.absoluteFill} />
        <Animated.View style={[styles.bottomSheetBoundary, { maxHeight: broadcastSheetMaxHeight }, dragStyle]}>
          <AppBottomSheet disableSwipeToClose mode="autoMax" onClose={handleClose} style={{ maxHeight: broadcastSheetMaxHeight }}>
          <GestureDetector gesture={pullDownGesture}>
            <View collapsable={false}>
              <AppBottomSheetHeader>
                <View style={styles.titleBlock}>
                  <Text style={styles.title}>{t("Broadcast Alert")}</Text>
                </View>
                <AppModalCloseButton onPress={handleClose} />
              </AppBottomSheetHeader>
            </View>
          </GestureDetector>
          <AppBottomSheetScroll scrollRef={composerScrollRef}>
            <View style={styles.topComposerRow}>
              <View style={[styles.compoundRow, validationErrors.location ? styles.compoundRowError : null]}>
                <Pressable
                  accessibilityLabel={selectedLocation ? "Clear pinned location" : "Pin location"}
                  accessibilityRole="button"
                  onPress={() => selectedLocation ? onClearLocation() : void requestLocation()}
                  style={[styles.pinFieldButton, { backgroundColor: selectedLocation ? huddleColors.divider : `${pinColor}1A` }]}
                >
                  {selectedLocation ? (
                    <Feather color={huddleColors.iconMuted} name="x" size={15} />
                  ) : (
                    <Feather color={pinColor} name="map-pin" size={15} />
                  )}
                </Pressable>
                <View style={styles.compoundDivider} />
                <View style={styles.typeSelectWrap}>
                  <Pressable accessibilityRole="button" onPress={() => setTypeMenuOpen((value) => !value)} style={styles.typeSelect}>
                    <Text style={[styles.typeSelectText, { color: pinColor }]}>{alertType}</Text>
                    <Feather color={huddleColors.mutedText} name="chevron-down" size={16} />
                  </Pressable>
                  {typeMenuOpen ? (
                    <View style={styles.typeMenu}>
                      {ALERT_TYPES.map((type) => (
                        <Pressable
                          accessibilityRole="button"
                          key={type}
                          onPress={() => {
                            onAlertTypeChange(normalizeNativeBroadcastAlertType(type));
                            setTypeMenuOpen(false);
                          }}
                          style={styles.typeMenuItem}
                        >
                          <Text style={[styles.typeMenuItemText, { color: getNativeBroadcastPinColor(type) }]}>{type}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
            {typeMenuOpen ? <View pointerEvents="none" style={styles.typeMenuSpacer} /> : null}
            {!selectedLocation && !validationErrors.location ? <Text style={styles.pinHint}>Tap the Pin icon to place your alert.</Text> : null}

            {petTypeRequired ? (
              <View
                onLayout={(event) => {
                  composerFieldOffsetsRef.current.petType = event.nativeEvent.layout.y;
                }}
                style={styles.petTypeFieldWrap}
              >
                <BroadcastPetTypeSelect
                  error={validationErrors.petType ? "Select a pet type for lost or stray alerts." : undefined}
                  focused={focusedField === "petType"}
                  open={petTypeMenuOpen}
                  selectedPetType={normalizedSelectedPetType}
                  onFocus={() => {
                    const nextOpen = !petTypeMenuOpen;
                    setFocusedField(nextOpen ? "petType" : null);
                    setPetTypeMenuOpen(nextOpen);
                    if (nextOpen) scrollComposerFieldIntoView("petType");
                  }}
                  onSelect={(option) => {
                    const normalized = normalizeNativePetFocusLabel(option);
                    onPetTypeChange?.(normalized);
                    setValidationErrors((current) => ({ ...current, petType: false }));
                    setPetTypeMenuOpen(false);
                    setFocusedField(null);
                  }}
                />
              </View>
            ) : null}

            <View style={styles.rangeCard}>
              <View style={styles.sliderRow}>
                <View style={styles.sliderLabelCol}>
                  <Feather color={huddleColors.blue} name="radio" size={18} />
                  <Text style={styles.sliderInlineLabel}>Reach</Text>
                </View>
                <View style={styles.sliderInlineTrack}>
                  <HuddleSingleRangeControl
                    max={visualRangeMaxKm}
                    min={1}
                    step={1}
                    suffix=" km"
                    showValue={false}
                    thumbSize={16}
                    value={rangeKm}
                    onChange={handleRangeChange}
                  />
                </View>
                <Text style={styles.sliderInlineValue}>{rangeKm} km</Text>
              </View>
              <View style={styles.sliderRow}>
                <View style={styles.sliderLabelCol}>
                  <Feather color={huddleColors.blue} name="zap" size={18} />
                  <Text style={styles.sliderInlineLabel}>Boost</Text>
                </View>
                <View style={styles.sliderInlineTrack}>
                  <HuddleSingleRangeControl
                    max={visualDurationMaxHours}
                    min={1}
                    step={1}
                    suffix={durationHours === 1 ? " hr" : " hrs"}
                    showValue={false}
                    thumbSize={16}
                    value={durationHours}
                    onChange={handleDurationChange}
                  />
                </View>
                <Text style={styles.sliderInlineValue}>{durationHours} {durationHours === 1 ? "hr" : "hrs"}</Text>
              </View>
              <Text style={styles.boostSubtext}>Live on the map for 7 days after the priority boost ends.</Text>
              {activeBroadcastUsed >= activeBroadcastLimit ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={tier === "gold"}
                  onPress={tier === "gold" ? undefined : () => setBroadcastUpsellTarget(tier === "free" ? "plus" : "gold")}
                  style={styles.upsellRow}
                >
                  <Text style={styles.upsellText}>
                    {tier === "gold" ? "All broadcast slots in use. Wait for one to expire." : "Upgrade for wider reach + longer boost"}
                  </Text>
                </Pressable>
              ) : showUpsell ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    const target = upsellTargetForTier();
                    if (target) onOpenPremium?.(target === "super" ? "addons" : target);
                  }}
                  style={styles.upsellRow}
                >
                  <Text style={styles.upsellText}>Upgrade for wider reach + longer boost</Text>
                </Pressable>
              ) : null}
            </View>

            <View
              onLayout={(event) => {
                composerFieldOffsetsRef.current.title = event.nativeEvent.layout.y;
              }}
              style={[styles.field, focusedField === "title" ? styles.inputFocused : null]}
            >
              <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                maxLength={100}
                onBlur={() => {
                  setFocusedField(null);
                }}
                onChangeText={(nextTitle) => {
                  setTitle(nextTitle);
                }}
                onFocus={() => {
                  setFocusedField("title");
                  scrollComposerFieldIntoView("title");
                }}
                onSubmitEditing={() => descriptionInputRef.current?.focus()}
                placeholder={t("Describe the situation")}
                placeholderTextColor={huddleColors.mutedText}
                returnKeyType="next"
                style={styles.input}
                value={title}
              />
            </View>
            <View
              onLayout={(event) => {
                composerFieldOffsetsRef.current.description = event.nativeEvent.layout.y;
              }}
              style={[styles.field, styles.textArea, focusedField === "description" ? styles.inputFocused : null, validationErrors.description ? styles.inputError : null]}
            >
              <TextInput
                ref={descriptionInputRef}
                maxLength={500}
                multiline
                onBlur={() => {
                  setFocusedField(null);
                  setValidationErrors((current) => ({ ...current, description: description.trim() || activePreviewUrl ? false : current.description }));
                }}
                onChangeText={(nextDescription) => {
                  setDescription(nextDescription);
                  if (nextDescription.trim() || activePreviewUrl) setValidationErrors((current) => ({ ...current, description: false }));
                }}
                onFocus={() => {
                  setFocusedField("description");
                  scrollComposerFieldIntoView("description");
                }}
                placeholder={t("Details help everyone stay connected")}
                placeholderTextColor={huddleColors.mutedText}
                scrollEnabled
                style={[styles.input, styles.textAreaInput]}
                textAlignVertical="top"
                value={description}
              />
            </View>
            {petTypeRequired ? (
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: verifiedOnly }}
                onPress={() => setVerifiedOnly((value) => !value)}
                style={styles.socialToggle}
              >
                <Text style={styles.socialToggleText}>Visible to verified users only</Text>
                <View style={[styles.verifiedSwitchTrack, verifiedOnly ? styles.verifiedSwitchTrackOn : null]}>
                  {verifiedOnly ? <Feather color={huddleColors.onPrimary} name="check-circle" size={14} style={styles.verifiedSwitchBadge} /> : null}
                  <View style={[styles.switchThumb, verifiedOnly ? styles.verifiedSwitchThumbOn : null]} />
                </View>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="switch" accessibilityState={{ checked: postOnThreads }} onPress={() => setPostOnThreads((value) => !value)} style={styles.socialToggle}>
              <View style={styles.socialToggleCopy}>
                <View style={styles.socialToggleTitleRow}>
                  <Text style={styles.socialToggleText}>Post on</Text>
                  <NativeNavIcon color={huddleColors.text} size={19} tab="social" />
                </View>
              </View>
              <View style={[styles.switchTrack, postOnThreads ? styles.switchTrackOn : null]}>
                <View style={[styles.switchThumb, postOnThreads ? styles.switchThumbOn : null]} />
              </View>
            </Pressable>
            {activePreviewUrl ? (
              <NativeSocialExternalLinkPreview
                linkPreview={linkPreviews[activePreviewUrl] || null}
                url={activePreviewUrl}
                onOpen={() => undefined}
                onRemove={() => {
                  setDescription((current) => stripNativeSocialExternalUrlFromText(current, activePreviewUrl));
                  setDismissedPreviewUrls((current) => {
                    const next = new Set(current);
                    next.add(activePreviewUrl);
                    return next;
                  });
                  if (lockedPreviewUrl === activePreviewUrl) setLockedPreviewUrl(null);
                }}
              />
            ) : null}

            {mediaFiles.length > 0 ? (
              <ScrollView bounces={false} directionalLockEnabled horizontal keyboardShouldPersistTaps="handled" nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaThumbRow}>
                {mediaFiles.map((item, index) => (
                  <View key={item.id} style={[styles.mediaThumbWrap, { aspectRatio: broadcastThumbAspect(item) }]}>
                    <ExpoImage cachePolicy="memory-disk" contentFit="cover" key={nativeFreshImageKey(item.uri, item.id)} source={{ uri: nativeFreshImageUri(item.uri, item.id) }} style={styles.mediaThumb} transition={120} />
                    {item.status === "uploading" ? (
                      <View pointerEvents="none" style={styles.mediaUploadingOverlay}>
                        <NativeSpinner tone="primary" />
                        <Text style={styles.mediaUploadingText}>{uploadProgress}%</Text>
                      </View>
                    ) : null}
                    <Pressable accessibilityLabel="Remove image" accessibilityRole="button" onPress={() => removeMediaAt(index)} style={styles.mediaRemoveButton}>
                      <Feather color={huddleColors.onPrimary} name="x" size={14} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}

            {mediaFiles.length > 0 ? (
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: isSensitive }} onPress={() => setIsSensitive((value) => !value)} style={styles.sensitiveRow}>
                <View style={[styles.checkboxBox, isSensitive ? styles.checkboxBoxChecked : null]}>
                  {isSensitive ? <Feather color={huddleColors.onPrimary} name="check" size={12} /> : null}
                </View>
                <Text style={styles.sensitiveText}>This photo contains injury, blood, sensitive or disturbing content</Text>
              </Pressable>
            ) : null}

            {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
          </AppBottomSheetScroll>

          <AppBottomSheetFooter>
            <RNAnimated.View style={[styles.footerRow, createShakeStyle]}>
              <Pressable accessibilityLabel="Add image" accessibilityRole="button" onPress={() => void pickMedia()} style={styles.mediaButton}>
                <Feather color={huddleColors.mutedText} name="camera" size={16} />
              </Pressable>
              {useAccessibilityFallback ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={isSliderDisabled}
                  onPress={() => setAccessibilityConfirmOpen(true)}
                  style={[
                    styles.createButton,
                    { backgroundColor: !isSliderDisabled ? pinColor : huddleColors.mutedCanvas },
                  ]}
                >
                  {creating ? (
                    <NativeSpinner tone="primary" />
                  ) : (
                    <>
                      <MaterialCommunityIcons color={!isSliderDisabled ? huddleColors.onPrimary : huddleColors.mutedText} name="alert" size={20} />
                      <Text style={[styles.createButtonText, isSliderDisabled ? styles.createButtonTextDisabled : null]}>
                        {t(`Broadcast ${alertType} Alert`)}
                      </Text>
                    </>
                  )}
                </Pressable>
              ) : (
                  <SlideToPublish
                    busy={creating}
                    disabled={isSliderDisabled}
                    resetKey={sliderResetKey}
                    onCommit={handleCommit}
                  />
              )}
            </RNAnimated.View>
            {oneBroadcastRemaining ? (
              <View style={styles.broadcastRemainingNotice}>
                <Text style={styles.broadcastRemainingText}>You have 1 broadcast remaining.</Text>
                {!isGoldMember ? (
                  <Text style={styles.broadcastRemainingText}>
                    Need more? {isVerified ? "Upgrade your membership." : "Verify your identity or upgrade your membership."}
                  </Text>
                ) : null}
                <View style={styles.broadcastSupportRow}>
                  <Text style={styles.broadcastRemainingText}>From a charity or volunteer group? </Text>
                  <Pressable accessibilityRole="link" onPress={onOpenSupport}>
                    <Text style={styles.broadcastSupportLink}>Contact Support</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </AppBottomSheetFooter>
          </AppBottomSheet>
        </Animated.View>
      </KeyboardAvoidingView>

      <BroadcastUpsellModal
        onClose={() => setBroadcastUpsellTarget(null)}
        onUpgrade={(target) => {
          setBroadcastUpsellTarget(null);
          onOpenPremium?.(target === "super" ? "addons" : target);
        }}
        target={broadcastUpsellTarget}
      />
      {useAccessibilityFallback ? (
        <AppConfirmModal
          confirm="Publish"
          loading={creating}
          onCancel={() => setAccessibilityConfirmOpen(false)}
          onConfirm={() => {
            setAccessibilityConfirmOpen(false);
            void handleCommit();
          }}
          open={accessibilityConfirmOpen}
          title={t(`Broadcast ${alertType} Alert`)}
        />
      ) : null}
    </Modal>
  );
}


function BroadcastUpsellModal({
  onClose,
  onUpgrade,
  target,
}: {
  onClose: () => void;
  onUpgrade?: (target: "plus" | "gold" | "super") => void;
  target: "plus" | "gold" | "super" | null;
}) {
  const [storeProducts, setStoreProducts] = useState<Record<NativeStoreProductId, NativeStoreProductState> | null>(null);
  useEffect(() => {
    if (!target) return undefined;
    let active = true;
    void loadNativeStoreProducts({ allowCache: true }).then((products) => {
      if (active) setStoreProducts(products);
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [target]);
  if (!target) return null;

  const isGold = target === "gold";
  const isSuper = target === "super";
  const themeColor = isSuper ? huddleColors.lime : isGold ? huddleColors.membershipUpgradeGold : huddleColors.membershipUpgradePlus;
  const title = isSuper ? "Super Broadcast (50km．72h)" : isGold ? "Upgrade to huddle＊" : "Upgrade to huddle+";
  const meta = isSuper
    ? formatNativeAddonPrice("huddle_super_broadcast", storeProducts?.huddle_super_broadcast)
    : `${nativeMembershipPriceDisplay(isGold ? "gold" : "plus", "monthly", storeProducts).price}/mo`;
  const features = isSuper
    ? ["50km broadcast reach", "72h alert visibility", "Built for urgent wide-area searches"]
    : isGold
      ? ["20km broadcast reach", "48h alert visibility", "huddle＊ discovery and profile perks"]
      : ["10km broadcast reach", "24h alert visibility", "More ways to reach nearby members"];

  return (
    <Modal animationType="fade" onRequestClose={onClose} presentationStyle="overFullScreen" transparent visible={Boolean(target)}>
      <Pressable accessibilityLabel="Close broadcast upsell" onPress={onClose} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]}>
        <Pressable onPress={(event) => event.stopPropagation()} style={[nativeModalStyles.appModalCard, styles.broadcastUpsellCard]}>
          <View style={[styles.broadcastUpsellStripe, { backgroundColor: themeColor }]}>
            <Feather color={huddleColors.onPrimary} name="radio" size={18} />
            <Text ellipsizeMode="tail" numberOfLines={2} style={styles.broadcastUpsellTitle}>{title}</Text>
            <Text ellipsizeMode="tail" numberOfLines={1} style={styles.broadcastUpsellMeta}>{meta}</Text>
          </View>
          <View style={styles.broadcastUpsellBody}>
            {features.map((feature) => (
              <View key={feature} style={styles.broadcastUpsellFeature}>
                <View style={[styles.broadcastUpsellCheck, { backgroundColor: themeColor }]}>
                  <Feather color={huddleColors.onPrimary} name="check" size={10} />
                </View>
                <Text ellipsizeMode="tail" numberOfLines={2} style={styles.broadcastUpsellFeatureText}>{feature}</Text>
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                onUpgrade?.(target);
              }}
              style={[styles.broadcastUpsellPrimary, { backgroundColor: themeColor, shadowColor: themeColor }]}
            >
              <Text style={styles.broadcastUpsellPrimaryText}>{isSuper ? "View Add-ons" : "See plans"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.broadcastUpsellSecondary}>
              <Text style={styles.broadcastUpsellSecondaryText}>Maybe later</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}


const styles = StyleSheet.create({
  bottomSheetBoundary: {
    width: "100%",
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "flex-end",
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  topComposerRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    zIndex: 20,
  },
  typeMenuSpacer: {
    height: 132,
  },
  compoundRow: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    borderRadius: huddleRadii.field,
    backgroundColor: huddleColors.canvas,
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: huddleFormFields.shadowOpacity,
    shadowRadius: 6,
    shadowOffset: { width: huddleFormFields.shadowOffset, height: huddleFormFields.shadowOffset },
    elevation: 1,
  },
  compoundRowError: {
    ...huddleFieldStates.error,
  },
  pinFieldButton: {
    marginLeft: 4,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  compoundDivider: {
    width: 1,
    height: 18,
    marginHorizontal: huddleSpacing.x2,
    backgroundColor: huddleColors.fieldBorder,
  },
  typeSelectWrap: {
    flex: 1,
    zIndex: 3,
  },
  socialToggle: {
    alignSelf: "stretch",
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
    marginTop: huddleSpacing.x3,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    borderRadius: huddleRadii.field,
    paddingHorizontal: huddleSpacing.x4,
    backgroundColor: huddleColors.glassChrome,
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: huddleFormFields.shadowOpacity,
    shadowRadius: 6,
    shadowOffset: { width: huddleFormFields.shadowOffset, height: huddleFormFields.shadowOffset },
    elevation: 1,
  },
  socialToggleCopy: {
    flex: 1,
    minWidth: 0,
  },
  socialToggleTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleSpacing.x1,
  },
  socialToggleText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  switchTrack: {
    ...huddleGlassControls.toggleSurface,
    width: 50,
    height: 28,
    flexShrink: 0,
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    paddingHorizontal: 3,
  },
  switchTrackOn: {
    backgroundColor: huddleColors.blue,
  },
  verifiedSwitchTrack: {
    ...huddleGlassControls.toggleSurface,
    width: 50,
    height: 28,
    flexShrink: 0,
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    paddingHorizontal: 3,
  },
  verifiedSwitchTrackOn: {
    backgroundColor: huddleColors.success,
  },
  verifiedSwitchBadge: {
    position: "absolute",
    left: 5,
  },
  verifiedSwitchThumbOn: {
    transform: [{ translateX: 22 }],
  },
  socialToggleDisabled: {
    opacity: 0.5,
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.canvas,
  },
  switchThumbOn: {
    transform: [{ translateX: 22 }],
  },
  typeSelect: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: huddleSpacing.x4,
  },
  typeSelectText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    lineHeight: 22,
  },
  typeMenu: {
    position: "absolute",
    top: 44,
    left: 0,
    right: huddleSpacing.x2,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    borderRadius: huddleRadii.field,
    backgroundColor: huddleColors.canvas,
    zIndex: 10,
    elevation: 8,
  },
  typeMenuItem: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x3,
  },
  typeMenuItemText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  pinHint: {
    marginTop: huddleSpacing.x2,
    marginBottom: huddleSpacing.x3,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.caption,
  },
  petTypeFieldWrap: {
    marginTop: huddleSpacing.x3,
    zIndex: 18,
  },
  petTypeDropdownLayer: {
    zIndex: 30,
    elevation: 8,
  },
  petTypeSelectTrigger: {
    minHeight: huddleLayout.fieldHeight - 2,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  petTypeSelectValueRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  petTypeEmoji: {
    fontSize: 17,
    lineHeight: 20,
  },
  petTypeSelectValue: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: 15,
    lineHeight: huddleFormFields.valueLine,
    color: huddleColors.text,
  },
  petTypePlaceholder: {
    color: huddleColors.mutedText,
  },
  petTypeSelectMenu: {
    marginTop: huddleSpacing.x2,
    maxHeight: huddleFormControls.select.menuMaxHeight,
    borderRadius: huddleFormControls.select.menuRadius,
    backgroundColor: huddleColors.canvas,
    padding: huddleFormControls.select.menuPadding,
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  petTypeSelectOption: {
    minHeight: huddleFormControls.select.optionMinHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
    borderRadius: huddleFormControls.select.optionRadius,
    paddingHorizontal: huddleFormControls.select.optionPaddingHorizontal,
    paddingVertical: huddleFormControls.select.optionPaddingVertical,
  },
  petTypeSelectOptionPressed: {
    opacity: 0.78,
  },
  petTypeOptionLabelRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  petTypeSelectOptionText: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: 14,
    lineHeight: 18,
    color: huddleColors.text,
  },
  petTypeSelectCheckSlot: {
    width: huddleFormControls.select.checkSlot,
    height: huddleFormControls.select.checkSlot,
  },
  rangeCard: {
    gap: huddleSpacing.x3,
    marginTop: huddleSpacing.x4,
    marginBottom: huddleSpacing.x4,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    borderRadius: 12,
    padding: huddleSpacing.x4,
    backgroundColor: huddleColors.canvas,
  },
  upsellRow: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.card,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x3,
    backgroundColor: huddleColors.lime,
  },
  upsellText: {
    textAlign: "center",
    fontFamily: "Urbanist-800",
    fontSize: huddleType.helper,
    lineHeight: 18,
    color: huddleColors.blue,
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    minHeight: 44,
  },
  sliderLabelCol: {
    width: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  sliderInlineTrack: {
    flex: 1,
  },
  sliderInlineLabel: {
    fontFamily: "Urbanist-800",
    fontSize: huddleType.body,
    lineHeight: huddleType.body,
    color: huddleColors.blue,
  },
  sliderInlineValue: {
    minWidth: 56,
    textAlign: "right",
    fontFamily: "Urbanist-800",
    fontSize: huddleType.body,
    lineHeight: huddleType.body,
    color: huddleColors.blue,
  },
  boostSubtext: {
    marginTop: -huddleSpacing.x1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.mutedText,
  },
  field: {
    minHeight: huddleLayout.fieldHeight,
    marginTop: huddleSpacing.x3,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: 0,
    justifyContent: "center",
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: huddleFormFields.shadowOpacity,
    shadowRadius: 6,
    shadowOffset: { width: huddleFormFields.shadowOffset, height: huddleFormFields.shadowOffset },
    elevation: 1,
  },
  inputFocused: {
    ...huddleFieldStates.focused,
  },
  inputError: {
    ...huddleFieldStates.error,
  },
  textArea: {
    height: huddleFormFields.multilineHeight,
    maxHeight: huddleFormFields.multilineHeight,
    justifyContent: "flex-start",
    backgroundColor: huddleColors.canvas,
    paddingTop: huddleSpacing.x2,
  },
  input: {
    flexShrink: 1,
    minWidth: 0,
    height: huddleLayout.fieldHeight - 2,
    padding: 0,
    fontFamily: "Urbanist-500",
    fontSize: 15,
    lineHeight: huddleFormFields.valueLine,
    includeFontPadding: false,
    textAlignVertical: "center",
    color: huddleColors.text,
    overflow: "hidden",
  },
  textAreaInput: {
    height: huddleFormFields.multilineHeight - huddleSpacing.x3,
    maxHeight: huddleFormFields.multilineHeight - huddleSpacing.x3,
    paddingTop: 0,
    textAlignVertical: "top",
  },
  mediaThumbRow: {
    gap: huddleSpacing.x2,
    marginTop: huddleSpacing.x4,
    paddingRight: huddleSpacing.x6,
  },
  mediaThumbWrap: {
    backgroundColor: huddleColors.mutedCanvas,
    borderRadius: huddleRadii.card,
    height: huddleSpacing.x10 + huddleSpacing.x8,
    overflow: "hidden",
  },
  mediaThumb: {
    height: "100%",
    width: "100%",
  },
  mediaUploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x1,
    backgroundColor: huddleColors.backdrop,
  },
  mediaUploadingText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.onPrimary,
  },
  mediaRemoveButton: {
    position: "absolute",
    top: huddleSpacing.x2,
    right: huddleSpacing.x2,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: huddleColors.backdrop,
  },
  sensitiveRow: {
    marginTop: huddleSpacing.x3,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x2,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    borderRadius: 4,
  },
  checkboxBoxChecked: {
    borderColor: huddleColors.blue,
    backgroundColor: huddleColors.blue,
  },
  sensitiveText: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.mutedText,
  },
  errorText: {
    marginTop: huddleSpacing.x3,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.validationRed,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleMapBroadcastFooter.gap,
  },
  broadcastRemainingNotice: {
    gap: 2,
    marginTop: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x1,
  },
  broadcastRemainingText: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: 16,
  },
  broadcastSupportRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  broadcastSupportLink: {
    color: huddleColors.blue,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: 16,
  },
  mediaButton: {
    width: huddleMapBroadcastFooter.cameraButtonSize,
    height: huddleMapBroadcastFooter.cameraButtonSize,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: huddleMapBroadcastFooter.cameraButtonBorderColor,
    borderRadius: huddleMapBroadcastFooter.cameraButtonSize / 2,
    backgroundColor: huddleMapBroadcastFooter.cameraButtonBackground,
  },
  createButton: {
    minHeight: huddleMapBroadcastFooter.ctaHeight,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x2,
    borderRadius: huddleMapBroadcastFooter.ctaRadius,
  },
  createButtonText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
  createButtonTextDisabled: {
    color: huddleColors.mutedText,
  },
  broadcastUpsellCard: {
    overflow: "hidden",
    padding: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x5,
  },
  broadcastUpsellStripe: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    marginTop: -huddleSpacing.x5,
    marginHorizontal: -huddleSpacing.x4,
    marginBottom: huddleSpacing.x4,
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x5,
    paddingBottom: huddleSpacing.x4,
  },
  broadcastUpsellTitle: {
    fontFamily: "Urbanist-700",
    fontSize: 15,
    color: huddleColors.onPrimary,
  },
  broadcastUpsellMeta: {
    marginLeft: "auto",
    fontFamily: "Urbanist-600",
    fontSize: 12,
    color: huddleColors.onPrimary,
  },
  broadcastUpsellBody: {
    width: "100%",
  },
  broadcastUpsellFeature: {
    marginTop: huddleSpacing.x2,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  broadcastUpsellCheck: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  broadcastUpsellFeatureText: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: 13,
    color: huddleColors.text,
  },
  broadcastUpsellPrimary: {
    width: "100%",
    minHeight: 48,
    borderRadius: huddleRadii.button,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    marginTop: huddleSpacing.x5,
  },
  broadcastUpsellPrimaryText: {
    fontFamily: "Urbanist-600",
    fontSize: 15,
    lineHeight: 20,
    color: huddleColors.onPrimary,
  },
  broadcastUpsellSecondary: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: huddleSpacing.x2,
  },
  broadcastUpsellSecondaryText: {
    fontFamily: "Urbanist-600",
    fontSize: 15,
    lineHeight: 20,
    color: huddleColors.mutedText,
  },

});
