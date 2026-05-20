import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as ImagePicker from "expo-image-picker";
import { Image as ExpoImage } from "expo-image";
import { AccessibilityInfo, ActivityIndicator, Animated as RNAnimated, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from "react-native-reanimated";
import {
  createNativeBroadcastNoMedia,
  getNativeBroadcastPinColor,
  getNativeBroadcastActiveConcurrentLimit,
  NATIVE_BROADCAST_CAPS_BY_TIER,
  NATIVE_BROADCAST_DURATION_STEPS,
  NATIVE_BROADCAST_RANGE_STEPS,
  NATIVE_BROADCAST_ACTIVE_CONCURRENT_CAPS_BY_TIER,
  NATIVE_SUPER_BROADCAST_CAPS,
  cleanupNativeBroadcastImages,
  normalizeNativeBroadcastAlertType,
  normalizeNativeBroadcastTier,
  uploadNativeBroadcastImage,
  type NativeBroadcastAlertType,
} from "../../lib/nativeBroadcast";
import { createNativeProtectedActionError, getNativeProtectedActionResult, logNativeProtectedActionFailure, type NativeProtectedActionCleanupResult } from "../../lib/nativeStorageCleanup";
import { lookupNativeMapAddress } from "../../lib/nativeMapMutations";
import { haptic } from "../../lib/nativeHaptics";
import type { NativeMapAlert } from "../../lib/nativeMapData";
import { fetchNativeProfileSummary, type NativeProfileSummary } from "../../lib/nativeProfileSummary";
import { isNativeVerifiedProfile } from "../../lib/nativeVerificationGate";
import { useLanguage } from "../../lib/nativeLanguage";
import { huddleColors, huddleFieldStates, huddleFormFields, huddleLayout, huddleMapBroadcastFooter, huddleRadii, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";
import { springTab, useShakeAnimation } from "../../lib/nativeAnimations";
import { AppBottomSheet, AppBottomSheetFooter, AppBottomSheetHeader, AppBottomSheetScroll, AppConfirmModal, AppModalCloseButton } from "../nativeModalPrimitives";
import { nativeModalStyles } from "../nativeModalPrimitives.styles";
import { HuddleSingleRangeControl } from "../HuddleRangeControl";
import { quotaConfig } from "../../lib/quotaConfig_v1";

type NativeBroadcastLocation = {
  lat: number;
  lng: number;
};

type NativeBroadcastMedia = {
  error: string | null;
  height?: number | null;
  id: string;
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
  onRequestPinLocation: () => void;
  onRestricted?: () => void;
  selectedAddress?: string | null;
  selectedLocation: NativeBroadcastLocation | null;
  userId: string | null;
  visible: boolean;
};

const ALERT_TYPES: NativeBroadcastAlertType[] = ["Stray", "Lost", "Caution", "Others"];
const MAX_BROADCAST_MEDIA = 10;
const MIN_BROADCAST_THUMB_ASPECT = 9 / 16;
const MAX_BROADCAST_THUMB_ASPECT = 1.91;
const SUPER_BROADCAST_FALLBACK_PRICE = 4.99;
const SUPER_BROADCAST_FALLBACK_CURRENCY = "USD$";
const broadcastThumbAspect = (media: NativeBroadcastMedia) => Math.min(Math.max(
  typeof media.width === "number" && typeof media.height === "number" && media.width > 0 && media.height > 0
    ? media.width / media.height
    : 1,
  MIN_BROADCAST_THUMB_ASPECT,
), MAX_BROADCAST_THUMB_ASPECT);

const humanBroadcastError = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = [record.message, record.error_description, record.details, record.hint]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .find(Boolean);
    if (message) return message;
  }
  if (typeof error === "string" && error.trim()) return error.trim();
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
            <ActivityIndicator color={huddleColors.premiumGold} size="small" />
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
  onRequestPinLocation,
  onRestricted,
  selectedAddress,
  selectedLocation,
  userId,
  visible,
}: NativeBroadcastModalProps) {
  const { t } = useLanguage();
  const [createShakeAnim, triggerCreateShake] = useShakeAnimation();
  // SS4: pull-down-to-dismiss — shared values (hooks must be at top level)
  const dragY = useSharedValue(0);
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [mediaFiles, setMediaFiles] = useState<NativeBroadcastMedia[]>([]);
  const [postOnThreads, setPostOnThreads] = useState(false);
  const [isSensitive, setIsSensitive] = useState(false);
  const [extraBroadcast72h, setExtraBroadcast72h] = useState(0);
  const [activeBroadcastLimit, setActiveBroadcastLimit] = useState(NATIVE_BROADCAST_ACTIVE_CONCURRENT_CAPS_BY_TIER.free);
  const [activeBroadcastUsed, setActiveBroadcastUsed] = useState(0);
  const [tier, setTier] = useState<"free" | "plus" | "gold">("free");
  const [showUpsell, setShowUpsell] = useState(false);
  const [upsellLocked, setUpsellLocked] = useState(false);
  const [broadcastUpsellTarget, setBroadcastUpsellTarget] = useState<"plus" | "gold" | "super" | null>(null);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [focusedField, setFocusedField] = useState<"title" | "description" | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ description?: boolean; location?: boolean }>({});
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(userId);
  const [creatorProfile, setCreatorProfile] = useState<NativeProfileSummary | null>(null);
  const composerScrollRef = useRef<ScrollView | null>(null);
  const composerFieldOffsetsRef = useRef<Record<"title" | "description", number>>({ title: 0, description: 0 });
  const lastFocusedComposerFieldRef = useRef<"title" | "description" | null>(null);
  const publishBusy = useRef(false);
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
  const [rangeKm, setRangeKm] = useState(baseCaps.radiusKm);
  const [durationHours, setDurationHours] = useState(baseCaps.durationHours);
  const pinColor = useMemo(() => getNativeBroadcastPinColor(alertType), [alertType]);
  const uploadProgress = useMemo(() => {
    if (mediaFiles.length === 0) return 0;
    const uploaded = mediaFiles.filter((item) => item.status === "uploaded").length;
    return Math.round((uploaded / mediaFiles.length) * 100);
  }, [mediaFiles]);
  const effectiveUserId = userId ?? resolvedUserId;
  const hasActiveBroadcastSlot = activeBroadcastLimit <= 0 || activeBroadcastUsed < activeBroadcastLimit;

  const coerceQuotaNumber = (value: unknown) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.floor(parsed));
  };

  const isUserVerified = (row: { is_verified?: boolean | null; verification_status?: unknown } | null) => {
    return isNativeVerifiedProfile(row);
  };

  useEffect(() => {
    setResolvedUserId(userId);
  }, [userId, visible]);

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
    setMediaFiles([]);
    setPostOnThreads(false);
    setIsSensitive(false);
    setRangeKm(baseCaps.radiusKm);
    setDurationHours(baseCaps.durationHours);
    setErrorText(null);
    setValidationErrors({});
    setShowUpsell(false);
    setUpsellLocked(false);
    setBroadcastUpsellTarget(null);
    lastFocusedComposerFieldRef.current = null;
  };

  const scrollComposerFieldIntoView = useCallback((field: "title" | "description") => {
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

  const pickMedia = async () => {
    if (creating) return;
    if (!effectiveUserId || !accessToken) {
      setErrorText("Please login to upload images.");
      return;
    }
    setErrorText(null);
    const availableSlots = Math.max(0, MAX_BROADCAST_MEDIA - mediaFiles.length);
    if (availableSlots <= 0) {
      setErrorText(`You can upload up to ${MAX_BROADCAST_MEDIA} photos.`);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErrorText("Photo library permission is required to add images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 0.9,
      selectionLimit: availableSlots,
    });
    if (result.canceled) return;
    const prepared = result.assets.slice(0, availableSlots).map((asset) => ({
      error: null,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      height: asset.height,
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
      setMediaFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "uploading", error: null } : entry));
      try {
        const uploadedUrl = await uploadNativeBroadcastImage(effectiveUserId, item.uri, asset?.fileName, asset?.mimeType, accessToken);
        setMediaFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "uploaded", uploadedUrl, error: null } : entry));
      } catch (error) {
        logNativeProtectedActionFailure("[map.broadcastModal] upload_media_failed", error);
        const message = humanBroadcastError(error);
        setMediaFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "error", uploadedUrl: null, error: message } : entry));
        setErrorText(`Image upload failed: ${message}`);
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

  const showUpsellOncePerDrag = () => {
    const target = upsellTargetForTier();
    if (!target || upsellLocked) return;
    setUpsellLocked(true);
    setShowUpsell(true);
    setBroadcastUpsellTarget(target);
    setTimeout(() => setUpsellLocked(false), 1000);
  };

  const handleRangeChange = (nextValue: number) => {
    if (nextValue >= capRangeKm && extraBroadcast72h <= 0) {
      setRangeKm(capRangeKm);
      showUpsellOncePerDrag();
      return;
    }
    setRangeKm(Math.min(nextValue, capRangeKm));
  };

  const handleDurationChange = (nextValue: number) => {
    if (nextValue >= capDurationHours && extraBroadcast72h <= 0) {
      setDurationHours(capDurationHours);
      showUpsellOncePerDrag();
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
    .activeOffsetY([4, 9999])
    .onUpdate((e) => { dragY.value = Math.max(0, e.translationY); })
    .onEnd(() => {
      if (dragY.value > 120) {
        dragY.value = withSpring(600, { damping: 20, stiffness: 300 });
        runOnJS(handleClose)();
      } else {
        dragY.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const handleCreate = async (): Promise<boolean> => {
    if (!effectiveUserId || !accessToken) {
      setErrorText("Please login to broadcast alerts.");
      return false;
    }
    const nextValidationErrors = {
      location: !selectedLocation,
      description: !description.trim(),
    };
    setValidationErrors(nextValidationErrors);
    if (nextValidationErrors.location || nextValidationErrors.description) {
      haptic.error();
      triggerCreateShake();
      if (nextValidationErrors.location) scrollComposerToTop();
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
        accessToken,
        address: resolvedAddress,
        alertType,
        description: description || null,
        durationHours,
        images,
        isSensitive,
        lat: publishLocation.lat,
        lng: publishLocation.lng,
        postOnThreads,
        rangeKm,
        title: title || null,
      });
      const createdAt = new Date().toISOString();
      const createdAlert: NativeMapAlert = {
        id: created.alertId,
        latitude: publishLocation.lat,
        longitude: publishLocation.lng,
        alert_type: alertType,
        title: title.trim() || null,
        description: description.trim() || null,
        photo_url: images[0] || null,
        media_urls: images,
        support_count: 0,
        report_count: 0,
        created_at: createdAt,
        expires_at: created.expiresAt,
        duration_hours: durationHours,
        range_meters: created.rangeMeters,
        range_km: rangeKm,
        creator_id: effectiveUserId,
        has_thread: Boolean(created.threadId),
        thread_id: created.threadId,
        posted_to_threads: postOnThreads,
        post_on_social: postOnThreads,
        social_post_id: created.threadId,
        social_status: created.threadId ? "posted" : null,
        social_url: created.threadId ? `/threads?focus=${created.threadId}` : null,
        is_sensitive: isSensitive,
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
        const cleanupResult: NativeProtectedActionCleanupResult = await cleanupNativeBroadcastImages(images, effectiveUserId, accessToken).catch(() => "failed" as const);
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
        <Animated.View style={[nativeModalStyles.appBottomSheetEventBoundary, dragStyle]}>
        <AppBottomSheet mode="autoMax" onClose={handleClose}>
          <GestureDetector gesture={pullDownGesture}>
            <View collapsable={false}>
              <AppBottomSheetHeader>
                <Text style={styles.title}>{t("Broadcast Alert")}</Text>
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
              <Pressable accessibilityRole="switch" accessibilityState={{ checked: postOnThreads }} onPress={() => setPostOnThreads((value) => !value)} style={styles.socialToggle}>
                <Text style={styles.socialToggleText}>On Social</Text>
                <View style={[styles.switchTrack, postOnThreads ? styles.switchTrackOn : null]}>
                  <View style={[styles.switchThumb, postOnThreads ? styles.switchThumbOn : null]} />
                </View>
              </Pressable>
            </View>
            {typeMenuOpen ? <View pointerEvents="none" style={styles.typeMenuSpacer} /> : null}
            {!selectedLocation && !validationErrors.location ? <Text style={styles.pinHint}>Tap the Pin icon to place your alert.</Text> : null}

            <View style={styles.rangeCard}>
              <View style={styles.quotaChipRow}>
                <Text style={styles.quotaChipText}>Active broadcasts</Text>
                <Text style={styles.quotaChipValue}>
                  {activeBroadcastUsed} / {activeBroadcastLimit}
                </Text>
              </View>
              <View style={styles.sharedSliderControl}>
                <View style={styles.sliderHeader}>
                  <Text style={styles.stepLabel}>Reach</Text>
                </View>
                <HuddleSingleRangeControl
                  max={visualRangeMaxKm}
                  min={1}
                  step={1}
                  suffix=" km"
                  value={rangeKm}
                  onChange={handleRangeChange}
                />
              </View>
              <View style={styles.sharedSliderControl}>
                <View style={styles.sliderHeader}>
                  <Text style={styles.stepLabel}>Duration</Text>
                </View>
                <HuddleSingleRangeControl
                  max={visualDurationMaxHours}
                  min={1}
                  step={1}
                  suffix=" hrs"
                  value={durationHours}
                  onChange={handleDurationChange}
                />
              </View>
              {activeBroadcastUsed >= activeBroadcastLimit ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={tier === "gold"}
                  onPress={tier === "gold" ? undefined : () => setBroadcastUpsellTarget(tier === "free" ? "plus" : "gold")}
                  style={styles.upsellRow}
                >
                  <Text style={styles.upsellText}>
                    {tier === "gold" ? "All broadcast slots in use. Wait for one to expire." : "See plans to get wider reach and longer duration!"}
                  </Text>
                </Pressable>
              ) : showUpsell ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setBroadcastUpsellTarget(upsellTargetForTier())}
                  style={styles.upsellRow}
                >
                  <Text style={styles.upsellText}>See plans to get wider reach and longer duration!</Text>
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
                  setValidationErrors((current) => ({ ...current, description: description.trim() ? false : current.description }));
                }}
                onChangeText={(nextDescription) => {
                  setDescription(nextDescription);
                  if (nextDescription.trim()) setValidationErrors((current) => ({ ...current, description: false }));
                }}
                onFocus={() => {
                  setFocusedField("description");
                  scrollComposerFieldIntoView("description");
                }}
                placeholder={t("Details help everyone stay connected")}
                placeholderTextColor={huddleColors.mutedText}
                style={[styles.input, styles.textAreaInput]}
                textAlignVertical="top"
                value={description}
              />
            </View>

            {mediaFiles.length > 0 ? (
              <ScrollView bounces={false} directionalLockEnabled horizontal keyboardShouldPersistTaps="handled" nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaThumbRow}>
                {mediaFiles.map((item, index) => (
                  <View key={item.id} style={[styles.mediaThumbWrap, { aspectRatio: broadcastThumbAspect(item) }]}>
                    <ExpoImage cachePolicy="memory-disk" contentFit="cover" source={{ uri: item.uri }} style={styles.mediaThumb} transition={120} />
                    {item.status === "uploading" ? (
                      <View pointerEvents="none" style={styles.mediaUploadingOverlay}>
                        <ActivityIndicator color={huddleColors.onPrimary} size="small" />
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
            <RNAnimated.View style={[styles.footerRow, { transform: [{ translateX: createShakeAnim }] }]}>
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
                    <ActivityIndicator color={huddleColors.onPrimary} size="small" />
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
  if (!target) return null;

  const isGold = target === "gold";
  const isSuper = target === "super";
  const themeColor = isSuper ? huddleColors.lime : isGold ? huddleColors.membershipUpgradeGold : huddleColors.membershipUpgradePlus;
  const title = isSuper ? "Super Broadcast (50km．72h)" : isGold ? "Upgrade to Huddle Gold" : "Upgrade to Huddle+";
  const meta = isSuper
    ? `${SUPER_BROADCAST_FALLBACK_CURRENCY}${SUPER_BROADCAST_FALLBACK_PRICE.toFixed(2)}/mo`
    : `USD$${quotaConfig.stripePlans[isGold ? "gold" : "plus"].monthly.amount.toFixed(2)}/mo`;
  const features = isSuper
    ? ["50km broadcast reach", "72h alert visibility", "Built for urgent wide-area searches"]
    : isGold
      ? ["20km broadcast reach", "48h alert visibility", "Gold discovery and profile perks"]
      : ["10km broadcast reach", "24h alert visibility", "More ways to reach nearby members"];

  return (
    <Modal animationType="fade" onRequestClose={onClose} presentationStyle="overFullScreen" transparent visible={Boolean(target)}>
      <Pressable accessibilityLabel="Close broadcast upsell" onPress={onClose} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]}>
        <Pressable onPress={(event) => event.stopPropagation()} style={[nativeModalStyles.appModalCard, styles.broadcastUpsellCard]}>
          <View style={[styles.broadcastUpsellStripe, { backgroundColor: themeColor }]}>
            <Feather color={huddleColors.onPrimary} name="radio" size={18} />
            <Text style={styles.broadcastUpsellTitle}>{title}</Text>
            <Text style={styles.broadcastUpsellMeta}>{meta}</Text>
          </View>
          <View style={styles.broadcastUpsellBody}>
            {features.map((feature) => (
              <View key={feature} style={styles.broadcastUpsellFeature}>
                <View style={[styles.broadcastUpsellCheck, { backgroundColor: themeColor }]}>
                  <Feather color={huddleColors.onPrimary} name="check" size={10} />
                </View>
                <Text style={styles.broadcastUpsellFeatureText}>{feature}</Text>
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
    borderColor: huddleColors.fieldBorderSoft,
    borderRadius: huddleRadii.field,
    backgroundColor: huddleColors.canvas,
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
    flexShrink: 0,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    borderRadius: huddleRadii.field,
    paddingHorizontal: huddleSpacing.x3,
    backgroundColor: huddleColors.divider,
  },
  socialToggleText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  switchTrack: {
    width: 38,
    height: 22,
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: huddleColors.tabActive,
  },
  switchTrackOn: {
    backgroundColor: huddleColors.blue,
  },
  switchThumb: {
    width: 18,
    height: 18,
    marginLeft: 2,
    borderRadius: 9,
    backgroundColor: huddleColors.canvas,
  },
  switchThumbOn: {
    marginLeft: 18,
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
  quotaChipRow: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: huddleSpacing.x2,
  },
  quotaChipText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.mutedText,
  },
  quotaChipValue: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.blue,
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
  upsellButton: {
    minHeight: 28,
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    paddingHorizontal: huddleSpacing.x3,
    backgroundColor: huddleColors.blue,
  },
  upsellButtonText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.meta,
    lineHeight: 13,
    color: huddleColors.onPrimary,
  },
  sharedSliderControl: {
    minHeight: 56,
    justifyContent: "center",
  },
  sliderBlock: {
    minHeight: 56,
    justifyContent: "center",
  },
  sliderHeader: {
    marginBottom: huddleSpacing.x2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepLabel: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.mutedText,
  },
  stepValue: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.blue,
  },

  sliderTrack: {
    height: 22,
    justifyContent: "center",
  },
  sliderFill: {
    position: "absolute",
    left: 0,
    height: 8,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.blue,
  },
  sliderTrackBase: {
    height: 8,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.mutedCanvas,
  },
  sliderThumb: {
    position: "absolute",
    width: 36,
    height: 36,
    marginLeft: -18,
    borderRadius: 18,
    backgroundColor: huddleColors.canvas,
    shadowColor: huddleColors.text,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
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
    minHeight: huddleLayout.fieldHeight * 2,
    justifyContent: "flex-start",
    backgroundColor: huddleColors.canvas,
    paddingTop: huddleSpacing.x2,
  },
  input: {
    height: huddleLayout.fieldHeight - 2,
    padding: 0,
    fontFamily: "Urbanist-500",
    fontSize: 15,
    lineHeight: huddleFormFields.valueLine,
    includeFontPadding: false,
    textAlignVertical: "center",
    color: huddleColors.text,
  },
  textAreaInput: {
    height: undefined,
    minHeight: huddleLayout.fieldHeight * 2 - huddleSpacing.x3,
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
