import Feather from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as ImagePicker from "expo-image-picker";
import { launchNativeImageLibraryAsync } from "../../lib/nativeMediaPermissions";
import { Image as ExpoImage } from "expo-image";
import { openNativeShareSheet } from "../../lib/nativeShareSheet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated as RNAnimated, Image as RNImage, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { NativeSpinner } from "../NativeSpinner";
import { GestureDetector, Gesture, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from "react-native-reanimated";
import {
  areNativeUsersBlocked,
  blockNativeAlertCreator,
  clearNativeAlertInteractionCache,
  countNativeAlertSupports,
  deleteNativeBroadcastAlert,
  markNativeBroadcastAlertFound,
  enqueueNativeAlertSupportNotification,
  createNativeBroadcastAlertShareToken,
  loadNativeMapActorName,
  loadNativeBroadcastVerifiedOnly,
  loadNativeAlertSupported,
  recordNativeMapAlertShare,
  removeNativeAlertSupport,
  reportNativeAlert,
  supportNativeAlert,
  updateNativeBroadcastAlert,
} from "../../lib/nativeMapAlertInteractions";
import type { NativeMapAlert } from "../../lib/nativeMapData";
import { cleanupNativeBroadcastImages, uploadNativeBroadcastImage } from "../../lib/nativeBroadcast";
import { nativeFreshImageKey, nativeFreshImageUri } from "../../lib/nativeImageFreshness";
import { createNativeProtectedActionError, getNativeProtectedActionResult, logNativeProtectedActionFailure, type NativeProtectedActionCleanupResult } from "../../lib/nativeStorageCleanup";
import { useLanguage } from "../../lib/nativeLanguage";
import { haptic } from "../../lib/nativeHaptics";
import { nativeSafeErrorCopy } from "../../lib/nativeSafeErrorCopy";
import { getFreshNativeAccessToken } from "../../lib/nativeFunctionClient";
import {
  extractCompletedNativeSocialPreviewUrl,
  fetchNativeSocialLinkPreviews,
  fetchNativeSocialShareTargets,
  formatNativeShareChatActionLabel,
  sendNativeMapAlertShareToChat,
  stripNativeSocialExternalUrlFromText,
  type NativeSocialLinkPreview,
  type NativeSocialShareTarget,
} from "../../lib/nativeSocial";
import { resolveNativeAvatarUrl } from "../../lib/nativeStorageUrlCache";
import { createSingleRealtimeChannel } from "../../lib/realtimeChannelManager";
import { NativeLoadingState } from "../NativeLoadingState";
import { NativeNavIcon } from "../NativeNavIcons";
import { NativeShimmerSkeleton } from "../NativeShimmerSkeleton";
import { NativeSocialExternalLinkPreview, NativeSocialMediaCarousel } from "../social/NativeSocialFeedPrimitives";
import { NativeSocialReportModal } from "../social/NativeSocialReportModal";
import { huddleButtons, huddleColors, huddleFormFields, huddleGlassControls, huddleLayout, huddleMotion, huddleRadii, huddleShadows, huddleSocial, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";
import { AppActionMenu, AppBottomSheet, AppBottomSheetFooter, AppBottomSheetHeader, AppBottomSheetScroll, AppConfirmModal, AppDestructiveSlideConfirm, AppKeyboardAvoidingView as KeyboardAvoidingView } from "../nativeModalPrimitives";
import { nativeModalStyles } from "../nativeModalPrimitives.styles";

type NativeAlertDetailModalProps = {
  accessToken?: string | null;
  alert: NativeMapAlert | null;
  onClose: () => void;
  onHidden: (alertId: string) => void;
  onOpenProfile?: (userId: string) => void;
  onOpenSocial?: (threadId: string) => void;
  onRefresh: () => Promise<void> | void;
  onSheetHeightChange?: (height: number) => void;
  onShareCountUpdated?: (alert: NativeMapAlert) => void;
  onUpdated?: (alert: NativeMapAlert) => void;
  sessionKey?: string | null;
  userId: string | null;
};

type EditAlertImage = {
  height?: number | null;
  id: string;
  uri: string;
  uploadedUrl: string | null;
  status: "uploaded" | "uploading" | "error";
  width?: number | null;
};

const extractCompletedAlertPreviewUrl = (value: string) => {
  return extractCompletedNativeSocialPreviewUrl(value);
};

const timeAgo = (iso: string) => {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const alertColor = (type: string) => {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "lost") return huddleColors.alertLost;
  if (normalized === "caution") return huddleColors.blue;
  if (normalized === "others" || normalized === "other") return huddleColors.alertOther;
  return huddleColors.alertStray;
};

const MIN_EDIT_ALERT_THUMB_ASPECT = 9 / 16;
const MAX_EDIT_ALERT_THUMB_ASPECT = 1.91;
const HEART_BURST_SIZE = 68;
// Outer bound for Mark as found. Sits above the 10s RPC transport timeout so a normal
// slow request still surfaces its own error, while a stalled pre-RPC session refresh
// can never strand the confirm sheet in a permanent busy state.
const MARK_FOUND_TIMEOUT_MS = 15000;
const editAlertThumbAspect = (media: EditAlertImage) => Math.min(Math.max(
  typeof media.width === "number" && typeof media.height === "number" && media.width > 0 && media.height > 0
    ? media.width / media.height
    : 1,
  MIN_EDIT_ALERT_THUMB_ASPECT,
), MAX_EDIT_ALERT_THUMB_ASPECT);
const humanNativeAlertError = (error: unknown) => {
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

export function NativeAlertDetailModal({ accessToken, alert, onClose, onHidden, onOpenProfile, onOpenSocial, onRefresh, onShareCountUpdated, onSheetHeightChange, onUpdated, sessionKey, userId }: NativeAlertDetailModalProps) {
  const { t } = useLanguage();
  // SS4: pull-down-to-dismiss
  const dragY = useSharedValue(0);
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));

  // Tapping a second pin while this sheet is open swaps `alert` in place -- the sheet
  // never unmounts. Without this the new title/photo/description simply snap in, which
  // reads as a close-and-reopen. Cross-fade only the content that actually changed; the
  // sheet frame stays put and the map recenters behind it.
  const contentOpacity = useSharedValue(1);
  const contentFadeStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));
  const fadedAlertIdRef = useRef<string | null>(null);
  useEffect(() => {
    const nextId = alert?.id ?? null;
    if (!nextId) {
      fadedAlertIdRef.current = null;
      contentOpacity.value = 1;
      return;
    }
    // Only cross-fade an alert-to-alert swap. A first open already has the sheet's
    // own slide-in animation, so fading there would double up.
    if (fadedAlertIdRef.current && fadedAlertIdRef.current !== nextId) {
      contentOpacity.value = 0;
      contentOpacity.value = withTiming(1, { duration: huddleMotion.durations.base });
    } else {
      contentOpacity.value = 1;
    }
    fadedAlertIdRef.current = nextId;
  }, [alert?.id, contentOpacity]);

  // Heart support animation — ported from social paw burst:
  // double-tap a media item → coral-red heart pops at tap point, holds, then flies
  // to the footer heart button, which punches in scale on landing.
  const cardRef = useRef<View | null>(null);
  const sheetHeightRef = useRef(0);
  const heartWrapperRef = useRef<View | null>(null);
  const cardOriginRef = useRef({ x: 0, y: 0 });
  const heartCenterRef = useRef({ x: 0, y: 0 });
  const burstScale = useRef(new RNAnimated.Value(0.35)).current;
  const burstOpacity = useRef(new RNAnimated.Value(0)).current;
  const burstRotation = useRef(new RNAnimated.Value(0)).current;
  const burstX = useRef(new RNAnimated.Value(-HEART_BURST_SIZE)).current;
  const burstY = useRef(new RNAnimated.Value(-HEART_BURST_SIZE)).current;
  const heartScale = useRef(new RNAnimated.Value(1)).current;

  const handleCardLayout = useCallback(() => {
    cardRef.current?.measureInWindow((x, y) => {
      cardOriginRef.current = { x, y };
    });
  }, []);

  const handleSheetLayout = useCallback((event: import("react-native").LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    if (Math.abs(nextHeight - sheetHeightRef.current) < 2) return;
    sheetHeightRef.current = nextHeight;
    onSheetHeightChange?.(nextHeight);
  }, [onSheetHeightChange]);

  const handleHeartLayout = useCallback(() => {
    heartWrapperRef.current?.measureInWindow((x, y, w, h) => {
      heartCenterRef.current = {
        x: x + w / 2 - cardOriginRef.current.x,
        y: y + h / 2 - cardOriginRef.current.y,
      };
    });
  }, []);

  const runHeartBurst = useCallback((localX: number, localY: number, target: { x: number; y: number }) => {
    burstX.setValue(localX);
    burstY.setValue(localY);
    burstScale.setValue(0.35);
    burstOpacity.setValue(0);
    burstRotation.setValue(0);
    RNAnimated.parallel([
      RNAnimated.sequence([
        RNAnimated.spring(burstScale, { toValue: 1.25, useNativeDriver: true, damping: 8, stiffness: 240, mass: 0.45 }),
        RNAnimated.spring(burstScale, { toValue: 1.0, useNativeDriver: true, damping: 14, stiffness: 200, mass: 0.45 }),
        RNAnimated.delay(120),
        RNAnimated.timing(burstScale, { toValue: 0.18, duration: 300, useNativeDriver: true }),
      ]),
      RNAnimated.sequence([
        RNAnimated.timing(burstOpacity, { toValue: 1, duration: 80, useNativeDriver: true }),
        RNAnimated.delay(380),
        RNAnimated.timing(burstOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]),
      RNAnimated.sequence([
        RNAnimated.timing(burstRotation, { toValue: -1, duration: 100, useNativeDriver: true }),
        RNAnimated.spring(burstRotation, { toValue: 0, useNativeDriver: true, damping: 9, stiffness: 220, mass: 0.4 }),
      ]),
      RNAnimated.sequence([
        RNAnimated.delay(400),
        RNAnimated.parallel([
          RNAnimated.timing(burstX, { toValue: target.x, duration: 300, useNativeDriver: true }),
          RNAnimated.timing(burstY, { toValue: target.y, duration: 300, useNativeDriver: true }),
        ]),
      ]),
    ]).start(() => {
      // Punch the footer heart on receipt.
      RNAnimated.sequence([
        RNAnimated.spring(heartScale, { toValue: 1.22, useNativeDriver: true, damping: 8, stiffness: 240, mass: 0.4 }),
        RNAnimated.spring(heartScale, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 200, mass: 0.4 }),
      ]).start();
    });
  }, [burstOpacity, burstRotation, burstScale, burstX, burstY, heartScale]);

  const handleHeartDoubleTapAt = useCallback((pageX: number, pageY: number) => {
    // Re-measure on each tap — sheet may have shifted or content may have scrolled.
    cardRef.current?.measureInWindow((cx, cy) => {
      cardOriginRef.current = { x: cx, y: cy };
      heartWrapperRef.current?.measureInWindow((hx, hy, hw, hh) => {
        const target = {
          x: hx + hw / 2 - cx,
          y: hy + hh / 2 - cy,
        };
        heartCenterRef.current = target;
        runHeartBurst(pageX - cx, pageY - cy, target);
      });
    });
  }, [runHeartBurst]);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(userId);
  const alertId = alert?.id || null;
  const alertType = alert?.alert_type;
  const [liked, setLiked] = useState(false);
  const [supportCount, setSupportCount] = useState(0);
  const [shareCount, setShareCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const deleteInFlightRef = useRef<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmFound, setConfirmFound] = useState(false);
  const [foundBusy, setFoundBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLinkPreviews, setEditLinkPreviews] = useState<Record<string, NativeSocialLinkPreview>>({});
  const [editLockedPreviewUrl, setEditLockedPreviewUrl] = useState<string | null>(null);
  const [editDismissedPreviewUrls, setEditDismissedPreviewUrls] = useState<Set<string>>(new Set());
  const [editImages, setEditImages] = useState<EditAlertImage[]>([]);
  const [editIsSensitive, setEditIsSensitive] = useState(false);
  const [editVerifiedOnly, setEditVerifiedOnly] = useState(false);
  const [savedVerifiedOnly, setSavedVerifiedOnly] = useState(false);
  // Focus indicator for edit fields. IMPORTANT: only swap borderColor on focus —
  // never toggle shadow props on these wrappers (that rebuilds the iOS layer and
  // resigns first-responder, killing the keyboard).
  const [editFocusedField, setEditFocusedField] = useState<"title" | "description" | null>(null);
  const editDescriptionInputRef = useRef<TextInput | null>(null);
  const [detailCarouselWidth, setDetailCarouselWidth] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTargets, setShareTargets] = useState<NativeSocialShareTarget[]>([]);
  const [shareTargetKeys, setShareTargetKeys] = useState<Set<string>>(() => new Set());
  const [shareTargetsLoading, setShareTargetsLoading] = useState(false);
  const [shareSending, setShareSending] = useState(false);
  const [shareSearchQuery, setShareSearchQuery] = useState("");
  const [failedShareTargetAvatars, setFailedShareTargetAvatars] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const { width, height } = useWindowDimensions();
  const openSharePage = useCallback(() => {
    setShareOpen(true);
  }, []);
  const closeSharePage = useCallback(() => {
    setShareOpen(false);
  }, []);
  const effectiveUserId = userId ?? resolvedUserId;
  const isCreator = Boolean(effectiveUserId && alert?.creator_id === effectiveUserId);
  const socialThreadId = alert?.thread_id || alert?.social_post_id || null;
  const editTypedPreviewUrl = extractCompletedAlertPreviewUrl(editDescription);
  const editActivePreviewUrl = editLockedPreviewUrl || (editTypedPreviewUrl && !editDismissedPreviewUrls.has(editTypedPreviewUrl) ? editTypedPreviewUrl : null);
  const isSocial = Boolean(alert?.post_on_social || alert?.posted_to_threads || alert?.has_thread || alert?.social_post_id || alert?.thread_id || alert?.social_url);
  const images = useMemo(() => {
    const rawImages = alert?.media_urls.length ? alert.media_urls : alert?.photo_url ? [alert.photo_url] : [];
    return rawImages.map((uri) => String(uri || "").trim()).filter(Boolean);
  }, [alert?.media_urls, alert?.photo_url]);
  const media = useMemo(() => images.map((uri) => ({ uri, kind: "image" as const })), [images]);
  const creatorAvatarUrl = useMemo(() => resolveNativeAvatarUrl(alert?.creator.avatar_url), [alert?.creator.avatar_url]);
  const creatorName = String(alert?.creator.display_name || "").trim();
  const creatorNameIsPlaceholder = !creatorName || creatorName === "?" || creatorName.toLowerCase() === "anonymous";
  const creatorDisplayName = creatorNameIsPlaceholder ? "" : creatorName;
  const shellAlertPendingDetail = Boolean(alert && !alert.creator_id && !alert.title && !alert.description && images.length === 0);
  const creatorLoading = Boolean(shellAlertPendingDetail || (alert?.creator_id && creatorNameIsPlaceholder));
  const alertDetailSheetMaxHeight = height * 0.82;
  const detailBodyBudgetHeight = Math.max(
    240,
    alertDetailSheetMaxHeight - 64 - 57 - 76,
  );
  const detailCarouselRightInset = huddleSpacing.x3;
  const detailFallbackCarouselWidth = Math.max(1, width - huddleSpacing.x6 * 4);
  const detailCarouselContentWidth = Math.max(1, (detailCarouselWidth || detailFallbackCarouselWidth) - detailCarouselRightInset);
  // Cap media so the detail modal never needs to scroll: never exceed the body
  // budget, the 4:5 aspect clamp (Instagram-style), or 42% of the screen height.
  const alertDetailMediaMaxHeight = Math.min(
    detailBodyBudgetHeight - huddleSpacing.x6,
    detailCarouselContentWidth * 1.25,
    height * 0.42,
  );
  const filteredShareTargets = useMemo(() => {
    const query = shareSearchQuery.trim().toLowerCase();
    if (!query) return shareTargets;
    return shareTargets.filter((target) => `${target.label} ${target.subtitle || ""}`.toLowerCase().includes(query));
  }, [shareSearchQuery, shareTargets]);

  const makeExistingEditImages = (alertMedia: NativeMapAlert | null): EditAlertImage[] => {
    const urls = alertMedia?.media_urls.length ? alertMedia.media_urls : alertMedia?.photo_url ? [alertMedia.photo_url] : [];
    return urls.map((uri) => ({ id: uri, uri, uploadedUrl: uri, status: "uploaded" }));
  };

  const hydrateExistingEditImageDimensions = (imagesToHydrate: EditAlertImage[]) => {
    imagesToHydrate.forEach((image) => {
      if (!image.uri || (image.width && image.height)) return;
      RNImage.getSize(
        image.uri,
        (imageWidth, imageHeight) => {
          if (!imageWidth || !imageHeight) return;
          setEditImages((current) => current.map((entry) => (
            entry.id === image.id
              ? { ...entry, width: imageWidth, height: imageHeight }
              : entry
          )));
        },
        () => undefined,
      );
    });
  };

  useEffect(() => {
    setMenuOpen(false);
    setConfirmRemove(false);
    setConfirmBlock(false);
    setReportOpen(false);
    setEditing(false);
    setShareOpen(false);
    setDetailCarouselWidth(0);
    setMessage(null);
    setEditMessage(null);
    if (!alert) return;
    setSupportCount(alert.support_count || 0);
    setShareCount(alert.share_count || 0);
    setEditTitle(alert.title || "");
    setEditDescription(alert.description || "");
    setEditLockedPreviewUrl(null);
    setEditDismissedPreviewUrls(new Set());
    const existingEditImages = makeExistingEditImages(alert);
    setEditImages(existingEditImages);
    hydrateExistingEditImageDimensions(existingEditImages);
    setEditIsSensitive(alert.is_sensitive === true);
    setEditVerifiedOnly(alert.verified_only === true);
    setSavedVerifiedOnly(alert.verified_only === true);
    setLiked(false);
    // Deliberately keyed to identity, not the full alert object. Realtime/cache
    // refreshes often replace an alert with an equivalent object and must not
    // dismiss an open editor or share sheet.
  }, [alertId, effectiveUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!alertId || !effectiveUserId) {
      setLiked(false);
      return undefined;
    }
    let active = true;
    void Promise.all([
      loadNativeAlertSupported(alertId, effectiveUserId, { accessToken, force: true }),
      countNativeAlertSupports(alertId, { accessToken, force: true }),
    ]).then(([nextLiked, nextCount]) => {
      if (active) setLiked(nextLiked);
      if (active) setSupportCount(nextCount);
    }).catch(() => {
      if (active) setLiked(false);
    });
    return () => {
      active = false;
    };
  }, [accessToken, alertId, effectiveUserId]);

  useEffect(() => {
    if (!alertId || !effectiveUserId || !alertType || !["Lost", "Stray"].includes(alertType)) return;
    let active = true;
    void loadNativeBroadcastVerifiedOnly(alertId, {
      accessToken,
      sessionKey,
      userId: effectiveUserId,
    }).then((value) => {
      if (active) {
        setEditVerifiedOnly(value);
        setSavedVerifiedOnly(value);
      }
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [accessToken, alertId, alertType, effectiveUserId, sessionKey]);

  useEffect(() => {
    setResolvedUserId(userId);
  }, [userId]);

  const applyShareCount = useCallback((count: number | null) => {
    if (!alert) return;
      const nextCount = count ?? shareCount + 1;
      setShareCount(nextCount);
      onShareCountUpdated?.({ ...alert, share_count: nextCount });
  }, [alert, onShareCountUpdated, shareCount]);

  useEffect(() => {
    if (!editActivePreviewUrl || editLinkPreviews[editActivePreviewUrl]) return;
    void fetchNativeSocialLinkPreviews([editActivePreviewUrl], accessToken).then((previews) => {
      setEditLinkPreviews((current) => ({ ...current, ...previews }));
    });
  }, [accessToken, editActivePreviewUrl, editLinkPreviews]);

  useEffect(() => {
    if (!editTypedPreviewUrl || editDismissedPreviewUrls.has(editTypedPreviewUrl)) return;
    const preview = editLinkPreviews[editTypedPreviewUrl];
    if (!preview || preview.loading) return;
    setEditLockedPreviewUrl(editTypedPreviewUrl);
    setEditDescription((current) => stripNativeSocialExternalUrlFromText(current, editTypedPreviewUrl));
  }, [editDismissedPreviewUrls, editLinkPreviews, editTypedPreviewUrl]);

  useEffect(() => {
    if (!shareOpen || !effectiveUserId) {
      setShareTargets([]);
      setShareTargetKeys(new Set());
      setShareSearchQuery("");
      setFailedShareTargetAvatars(new Set());
      return;
    }
    let active = true;
    setShareTargetsLoading(true);
    setFailedShareTargetAvatars(new Set());
    void getFreshNativeAccessToken(accessToken)
      .then((freshAccessToken) => {
        if (!freshAccessToken) throw new Error("auth_required");
        return fetchNativeSocialShareTargets(effectiveUserId, freshAccessToken);
      })
      .then((targets) => {
        if (!active) return;
        setShareTargets(targets);
      })
      .catch(() => {
        if (active) setMessage("Unable to load chats right now.");
      })
      .finally(() => {
        if (active) setShareTargetsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, effectiveUserId, shareOpen]);

  const syncSupportCount = useCallback(async () => {
    if (!alertId) return;
    const next = await countNativeAlertSupports(alertId, { accessToken, force: true });
    setSupportCount(next);
  }, [accessToken, alertId]);

  const syncSupportState = useCallback(async (nextUserId: string) => {
    if (!alertId) return;
    await clearNativeAlertInteractionCache(alertId, nextUserId);
    const [nextLiked, nextCount] = await Promise.all([
      loadNativeAlertSupported(alertId, nextUserId, { accessToken, force: true }),
      countNativeAlertSupports(alertId, { accessToken, force: true }),
    ]);
    setLiked(nextLiked);
    setSupportCount(nextCount);
  }, [accessToken, alertId]);

  useEffect(() => {
    if (!alertId) return undefined;

    const handle = createSingleRealtimeChannel(`native-alert-interactions:${alertId}`, (channel) =>
      channel
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "broadcast_alert_interactions", filter: `alert_id=eq.${alertId}` },
          () => {
            void clearNativeAlertInteractionCache(alertId, effectiveUserId || undefined).then(async () => {
              await syncSupportCount();
              if (effectiveUserId) {
                const nextLiked = await loadNativeAlertSupported(alertId, effectiveUserId, { accessToken, force: true });
                setLiked(nextLiked);
              }
            });
          },
        )
    );

    return () => {
      void handle.dispose();
    };
  }, [accessToken, alertId, effectiveUserId, syncSupportCount]);

  const resolveEffectiveUserId = async () => {
    if (effectiveUserId) return effectiveUserId;
    return null;
  };

  const resolveActorName = async (nextUserId: string) => {
    return loadNativeMapActorName(nextUserId, { accessToken });
  };

  const handleSupport = async () => {
    if (!alert || busy) return;
    const nextUserId = effectiveUserId;
    const previousLiked = liked;
    const previousSupportCount = supportCount;
    const nextLiked = !previousLiked;
    if (__DEV__) console.log("NATIVE_MAP_SUPPORT_TAP", {
      alertId: alert.id,
      hasAccessToken: Boolean(accessToken),
      nextSupported: !liked,
    });
    if (!nextUserId) {
      setMessage("Please login to support alerts");
      return;
    }
    setBusy(true);
    setMessage(null);
    setLiked(nextLiked);
    setSupportCount((current) => Math.max(0, current + (nextLiked ? 1 : -1)));
    if (nextLiked) haptic.selectTab(); // SO5 parity: light tick on like-on, no haptic on like-off
    try {
      // Toggle: if currently liked, remove support; otherwise add it
      if (previousLiked) {
        await removeNativeAlertSupport(alert.id, nextUserId, { accessToken, sessionKey });
        await syncSupportState(nextUserId);
        await Promise.resolve(onRefresh()).catch((refreshError) => {
          if (__DEV__) console.warn("NATIVE_MAP_UNSUPPORT_REFRESH_NON_FATAL", {
            alertId: alert.id,
            message: refreshError instanceof Error ? refreshError.message : String(refreshError),
          });
        });
        return;
      }
      if (alert.creator_id) {
        const blocked = await areNativeUsersBlocked(nextUserId, alert.creator_id, { accessToken });
        if (blocked) {
          setLiked(previousLiked);
          setSupportCount(previousSupportCount);
          setMessage("You cannot support this user.");
          return;
        }
      }
      const supportResult = await supportNativeAlert(alert.id, nextUserId, { accessToken, sessionKey });
      setLiked(supportResult.supported);
      setSupportCount(supportResult.supportCount);
      try {
        const actorName = await resolveActorName(nextUserId);
        await enqueueNativeAlertSupportNotification({
          actorName,
          alertId: alert.id,
          accessToken,
          creatorId: alert.creator_id,
          sessionKey,
          userId: nextUserId,
        });
      } catch (notificationError) {
        if (__DEV__) console.warn("NATIVE_MAP_SUPPORT_NOTIFICATION_NON_FATAL", {
          alertId: alert.id,
          message: notificationError instanceof Error ? notificationError.message : String(notificationError),
        });
      }
      await Promise.resolve(onRefresh()).catch((refreshError) => {
        if (__DEV__) console.warn("NATIVE_MAP_SUPPORT_REFRESH_NON_FATAL", {
          alertId: alert.id,
          message: refreshError instanceof Error ? refreshError.message : String(refreshError),
        });
      });
    } catch (error) {
      if (__DEV__) console.warn("NATIVE_MAP_SUPPORT_ROLLBACK", {
        alertId: alert.id,
        message: error instanceof Error ? error.message : String(error),
        rollbackHappened: true,
      });
      setLiked(previousLiked);
      setSupportCount(previousSupportCount);
      setMessage(previousLiked ? "Couldn't remove your support." : "Couldn't support this alert right now.");
    } finally {
      setBusy(false);
    }
  };

  const openReportModal = async () => {
    if (!alert || busy) return;
    const nextUserId = await resolveEffectiveUserId();
    if (!nextUserId) {
      setMessage("Please login to report alerts");
      return;
    }
    haptic.warning(); // MP9: serious-action tick before report sheet opens
    setMenuOpen(false);
    setMessage(null);
    try {
      if (!alert.creator_id) {
        setMessage("Unable to submit report right now.");
        return;
      }
      const blocked = await areNativeUsersBlocked(nextUserId, alert.creator_id, { accessToken });
      if (blocked) {
        setMessage("You cannot report this user.");
        return;
      }
      setReportOpen(true);
    } catch {
      setMessage("Unable to submit report right now.");
    }
  };

  const handleReportSubmitSuccess = async () => {
    if (!alert) return;
    const nextUserId = await resolveEffectiveUserId();
    if (!nextUserId) throw new Error("Missing session");
    await reportNativeAlert(alert.id, nextUserId, { accessToken, sessionKey });
    await onRefresh();
  };

  const handleHide = () => {
    if (!alert) return;
    setMenuOpen(false);
    onHidden(alert.id);
    onClose();
  };

  const handleBlock = () => {
    if (!alert?.creator_id || busy) return;
    setMenuOpen(false);
    setConfirmBlock(true);
  };

  const openEditAlert = () => {
    setMenuOpen(false);
    setEditMessage(null);
    setShareOpen(false);
    // Single-modal swap: the detail Modal stays mounted/presented and only its
    // body switches to the edit form. No second native <Modal> is presented, so
    // iOS keeps the same key window and the edit TextInputs can become first
    // responder (keyboard shows). A separate edit modal caused a present/dismiss
    // handoff that iOS rejected keyboard focus during.
    setEditing(true);
  };

  const closeEditAlert = () => {
    setEditing(false);
  };

  useEffect(() => {
    setConfirmRemove(false);
    setDeleteBusy(false);
    setConfirmFound(false);
    setFoundBusy(false);
    deleteInFlightRef.current = null;
  }, [alert?.id]);

  const openRemoveAlert = () => {
    if (deleteBusy) return;
    setMenuOpen(false);
    setMessage(null);
    setConfirmRemove(true);
  };

  const openMarkFound = () => {
    if (foundBusy) return;
    setMenuOpen(false);
    setMessage(null);
    setConfirmFound(true);
  };

  // Same map outcome as Remove -- the pin goes away for good. The difference is the
  // cross-posted Social thread survives and is stamped Found, so anyone who saw the
  // original appeal learns it ended well instead of being left searching.
  const handleMarkFound = async () => {
    if (!alert || busy || foundBusy || deleteBusy) return;
    const alertId = alert.id;
    setFoundBusy(true);
    setMessage(null);
    try {
      // The RPC transport is already bounded, but the session refresh that runs before
      // it is not. Without an outer bound a stalled refresh leaves foundBusy true
      // forever, and because the sheet's dismiss is gated on !foundBusy the user is
      // left with a frozen, undismissable sheet and no error.
      await Promise.race([
        markNativeBroadcastAlertFound(alertId, alert.media_urls?.length ? alert.media_urls : alert.photo_url ? [alert.photo_url] : [], alert.creator_id, { accessToken, sessionKey, userId: effectiveUserId }),
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error("request_timeout")), MARK_FOUND_TIMEOUT_MS)),
      ]);
      setConfirmFound(false);
      setFoundBusy(false);
      onHidden(alertId);
      onClose();
      void Promise.resolve(onRefresh()).catch((refreshError) => {
        if (__DEV__) {
          console.warn("[map.found_alert_refresh.failed]", {
            alertId,
            error: refreshError instanceof Error ? refreshError.message : String(refreshError),
          });
        }
      });
    } catch (error) {
      setMessage(humanNativeAlertError(error));
      setFoundBusy(false);
    }
  };

  const confirmBlockUser = async () => {
    if (!alert?.creator_id || busy) return;
    const creatorId = alert.creator_id;
    const alertId = alert.id;
    setBusy(true);
    setMenuOpen(false);
    setConfirmBlock(false);
    setMessage(null);
    try {
      await blockNativeAlertCreator(creatorId, { accessToken, sessionKey, userId: effectiveUserId });
      onHidden(alertId);
      await Promise.resolve(onRefresh());
      onClose();
    } catch (error) {
      setMessage(humanNativeAlertError(error));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!alert || busy || deleteBusy || deleteInFlightRef.current) return;
    const alertId = alert.id;
    deleteInFlightRef.current = alertId;
    setDeleteBusy(true);
    setMessage(null);
    try {
      await deleteNativeBroadcastAlert(alertId, alert.media_urls?.length ? alert.media_urls : alert.photo_url ? [alert.photo_url] : [], alert.creator_id, { accessToken, sessionKey, userId: effectiveUserId });
      setConfirmRemove(false);
      setDeleteBusy(false);
      deleteInFlightRef.current = null;
      onHidden(alertId);
      onClose();
      void Promise.resolve(onRefresh()).catch((refreshError) => {
        if (__DEV__) {
          console.warn("[map.delete_alert_refresh.failed]", {
            alertId,
            error: refreshError instanceof Error ? refreshError.message : String(refreshError),
          });
        }
      });
    } catch (error) {
      setMessage(humanNativeAlertError(error));
      deleteInFlightRef.current = null;
      setDeleteBusy(false);
    }
  };

  const pickEditMedia = async () => {
    if (!alert || busy) return;
    const nextUserId = await resolveEffectiveUserId();
    const freshAccessToken = await getFreshNativeAccessToken(accessToken);
    if (!nextUserId || !freshAccessToken) {
      setEditMessage("Please login to edit alerts");
      return;
    }
    const availableSlots = Math.max(0, 10 - editImages.length);
    if (availableSlots <= 0) {
      setEditMessage("You can upload up to 10 photos.");
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
      setEditMessage(nativeSafeErrorCopy(error, "Couldn't open your photo library. Try again."));
      return;
    }
    if (result.canceled) return;
    setEditMessage(null);
    const selectedAssets = result.assets.slice(0, availableSlots);
    const optimisticImages = selectedAssets.map((asset, index) => ({
      height: asset.height,
      id: `${asset.uri}-${Date.now()}-${index}`,
      uri: asset.uri,
      uploadedUrl: null,
      status: "uploading" as const,
      width: asset.width,
    }));
    setEditImages((current) => [...current, ...optimisticImages]);
    setBusy(true);
    try {
      for (const [index, asset] of selectedAssets.entries()) {
        const uploadedUrl = await uploadNativeBroadcastImage(nextUserId, asset.uri, asset.fileName, asset.mimeType, freshAccessToken, sessionKey);
        const imageId = optimisticImages[index]?.id;
        setEditImages((current) => current.map((image) => image.id === imageId ? { ...image, uri: uploadedUrl, uploadedUrl, status: "uploaded" } : image));
      }
    } catch (error) {
      logNativeProtectedActionFailure("[map.alertDetail] upload_media_failed", error);
      const failedIds = new Set(optimisticImages.map((image) => image.id));
      setEditImages((current) => current.map((image) => failedIds.has(image.id) && image.status === "uploading" ? { ...image, status: "error" } : image));
      setEditMessage(nativeSafeErrorCopy(error, `Couldn't upload that image. ${humanNativeAlertError(error)}`));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!alert || busy) return;
    const nextTitle = editTitle.trim();
    const nextDescription = editActivePreviewUrl
      ? [stripNativeSocialExternalUrlFromText(editDescription, editActivePreviewUrl), editActivePreviewUrl].filter(Boolean).join("\n").trim()
      : editDescription.trim();
    if (!nextTitle) {
      setEditMessage("Don't skip this one!");
      return;
    }
    if (nextTitle.length > 100 || nextDescription.length > 500) {
      setEditMessage("Please shorten the alert details");
      return;
    }
    const hasPendingUpload = editImages.some((image) => image.status === "uploading");
    const failedUpload = editImages.some((image) => image.status === "error");
    if (hasPendingUpload) {
      setEditMessage("Please wait for image upload to finish.");
      return;
    }
    if (failedUpload) {
      setEditMessage("Remove failed images before saving.");
      return;
    }
    const uploadedImages = editImages.map((image) => image.uploadedUrl).filter((uri): uri is string => Boolean(uri));
    const freshAccessToken = await getFreshNativeAccessToken(accessToken);
    if (!freshAccessToken) {
      setEditMessage("Please login to edit alerts");
      return;
    }
    setBusy(true);
    setEditMessage(null);
    try {
      await updateNativeBroadcastAlert(alert.id, {
        title: nextTitle,
        description: nextDescription || null,
        photo_url: uploadedImages[0] || null,
        images: uploadedImages,
        is_sensitive: editIsSensitive,
        verified_only: editVerifiedOnly,
        previousImages: alert.media_urls?.length ? alert.media_urls : alert.photo_url ? [alert.photo_url] : [],
        ownerUserId: alert.creator_id,
      }, { accessToken: freshAccessToken, sessionKey, userId: effectiveUserId });
      const updatedAlert: NativeMapAlert = {
        ...alert,
        description: nextDescription || null,
        is_sensitive: editIsSensitive,
        verified_only: editVerifiedOnly,
        has_thread: editVerifiedOnly ? false : alert.has_thread,
        thread_id: editVerifiedOnly ? null : alert.thread_id,
        posted_to_threads: editVerifiedOnly ? false : alert.posted_to_threads,
        post_on_social: editVerifiedOnly ? false : alert.post_on_social,
        social_post_id: editVerifiedOnly ? null : alert.social_post_id,
        social_status: editVerifiedOnly ? null : alert.social_status,
        social_url: editVerifiedOnly ? null : alert.social_url,
        media_urls: uploadedImages,
        photo_url: uploadedImages[0] || null,
        title: nextTitle,
      };
      await onUpdated?.(updatedAlert);
      haptic.success(); // MP9: confirm alert edit saved
      closeEditAlert();
      await onRefresh();
    } catch (error) {
      const previousImages = alert.media_urls?.length ? alert.media_urls : alert.photo_url ? [alert.photo_url] : [];
      const orphanImages = uploadedImages.filter((uri) => !previousImages.includes(uri));
      if (orphanImages.length > 0) {
        const cleanupResult: NativeProtectedActionCleanupResult = await cleanupNativeBroadcastImages(orphanImages, alert.creator_id, freshAccessToken, sessionKey).catch(() => "failed" as const);
        logNativeProtectedActionFailure("[map.alertDetail] update_alert_orphan_cleanup", createNativeProtectedActionError({
          ok: false,
          stage: getNativeProtectedActionResult(error)?.stage || "domain_save",
          originalError: getNativeProtectedActionResult(error)?.originalError || error,
          cleanupAttempted: true,
          cleanupResult,
        }));
      }
      logNativeProtectedActionFailure("[map.alertDetail] update_alert_failed", error);
      setEditMessage(humanNativeAlertError(error));
    } finally {
      setBusy(false);
    }
  };

  /**
   * EVERY alert share goes through `/share/alert_{id}`, verified-only included.
   *
   * The old token-bound `/map?alert=...&access=...` route is the SPA: it serves
   * no Open Graph tags at all, so those links unfurled as a bare URL with no
   * picture, no title and no context — the one share in the app guaranteed to
   * look broken. `/share/` renders a REDACTED card for a restricted alert (type
   * and area only, no photo, no headline), and the token rides along as a query
   * param that `nativePathForHuddleWebPath` hands back to the Map route.
   */
  const buildAlertShareUrl = async (freshAccessToken: string) => {
    if (!alert) return "https://huddle.pet/share";
    const sharePath = `https://huddle.pet/share/alert_${encodeURIComponent(alert.id)}`;
    const existingShareToken = String(alert.share_access_token || "").trim();
    if (existingShareToken) {
      return `${sharePath}?access=${encodeURIComponent(existingShareToken)}`;
    }
    if (!savedVerifiedOnly && alert.verified_only !== true) return sharePath;
    const shareToken = await createNativeBroadcastAlertShareToken(alert.id, {
      accessToken: freshAccessToken,
      sessionKey,
      userId: effectiveUserId,
    });
    return `${sharePath}?access=${encodeURIComponent(shareToken)}`;
  };

  const handleNativeShare = async () => {
    if (!alert || !effectiveUserId) return;
    const freshAccessToken = await getFreshNativeAccessToken(accessToken);
    if (!freshAccessToken) {
      setMessage("Please login again to share alerts.");
      return;
    }
    setMessage(null);
    try {
      const shareUrl = await buildAlertShareUrl(freshAccessToken);
      // The alert photo widens the app roster to the image-only socials, and the
      // link still travels with it — exactly once. A photoless alert simply
      // shares the link, which is the behaviour that shipped before.
      const shareText = alert.title || alert.description || "huddle map alert";
      await openNativeShareSheet({
        imageUrl: alert.media_urls?.[0] || alert.photo_url || null,
        text: shareText,
        title: alert.title || "huddle map alert",
        url: shareUrl,
      });
      const count = await recordNativeMapAlertShare(alert.id, effectiveUserId, { accessToken: freshAccessToken, sessionKey });
      if (count === null) {
        applyShareCount(null);
        setMessage("Shared, but the share count could not be updated.");
      } else {
        applyShareCount(count);
      }
    } catch {
      setMessage("Unable to share this alert right now.");
    }
  };

  const handleShareToChat = async () => {
    if (!alert || !effectiveUserId || shareSending) return;
    const freshAccessToken = await getFreshNativeAccessToken(accessToken);
    if (!freshAccessToken) {
      setMessage("Please login again to share alerts.");
      return;
    }
    const selectedTargets = shareTargets.filter((target) => shareTargetKeys.has(target.chatId));
    if (selectedTargets.length === 0) {
      setMessage("No chat selected.");
      return;
    }
    setShareSending(true);
    setMessage(null);
    try {
      const shareUrl = await buildAlertShareUrl(freshAccessToken);
      const results = await Promise.allSettled(selectedTargets.map((target) => (
        sendNativeMapAlertShareToChat(alert, target, effectiveUserId, freshAccessToken, shareUrl)
      )));
      const sharedCount = results.filter((result) => result.status === "fulfilled").length;
      const failedCount = results.length - sharedCount;
      if (sharedCount === 0) throw new Error("share_failed");
      const count = await recordNativeMapAlertShare(alert.id, effectiveUserId, { accessToken: freshAccessToken, sessionKey });
      applyShareCount(count);
      setMessage(failedCount > 0
        ? `Shared in ${sharedCount} chat${sharedCount === 1 ? "" : "s"}. ${failedCount} couldn't be sent.`
        : `Shared in ${sharedCount} chat${sharedCount === 1 ? "" : "s"}.`);
      closeSharePage();
      setShareSearchQuery("");
      setShareTargetKeys(new Set());
    } catch {
      setMessage("Unable to share in chat right now.");
    } finally {
      setShareSending(false);
    }
  };

  const handleSocial = () => {
    if (socialThreadId) {
      onOpenSocial?.(String(socialThreadId));
      return;
    }
    if (alert?.social_url?.startsWith("/")) {
      try {
        const [, rawQuery = ""] = alert.social_url.split("?");
        const params = new URLSearchParams(rawQuery);
        const focus = params.get("focus") || params.get("thread");
        if (focus) onOpenSocial?.(focus);
        else if (alert.social_url.startsWith("/threads")) onOpenSocial?.("");
      } catch {
        setMessage("That post is no longer available.");
      }
      return;
    }
    setMessage("That post is no longer available.");
  };

  if (!alert) return null;
  const color = alertColor(alert.alert_type);

  const detailBody = (
    <Animated.View style={[styles.detailBody, contentFadeStyle]}>
      <View>
        {alert.title ? <Text ellipsizeMode="tail" numberOfLines={2} style={styles.title}>{alert.title}</Text> : null}
        {alert.description ? <Text style={styles.body}>{alert.description}</Text> : null}
      </View>

      {media.length > 0 ? (
        <View
          onLayout={(event) => setDetailCarouselWidth(event.nativeEvent.layout.width)}
          style={styles.detailCarouselMeasure}
        >
          <NativeSocialMediaCarousel
            contentWidth={detailCarouselContentWidth}
            deferImageUntilMeasured
            heightAnimationMs={20}
            maxFrameHeight={alertDetailMediaMaxHeight}
            isSensitive={alert.is_sensitive}
            items={media}
            onDoubleTap={() => { if (!liked) void handleSupport(); }}
            onDoubleTapAt={handleHeartDoubleTapAt}
          />
        </View>
      ) : null}

      {message ? <Text style={styles.messageText}>{message}</Text> : null}
    </Animated.View>
  );

  const detailCreatorDock = (
    <Animated.View style={[styles.creatorDock, contentFadeStyle]}>
      <Pressable
        accessibilityLabel="View creator"
        accessibilityRole="button"
        disabled={!alert.creator_id || !onOpenProfile}
        onPress={() => alert.creator_id && onOpenProfile?.(alert.creator_id)}
        style={styles.creatorPressable}
      >
        <View style={styles.creatorAvatar}>
          {creatorLoading ? (
            <NativeShimmerSkeleton style={StyleSheet.absoluteFillObject} />
          ) : creatorAvatarUrl ? (
            <ExpoImage cachePolicy="memory-disk" contentFit="cover" key={nativeFreshImageKey(creatorAvatarUrl, creatorAvatarUrl)} source={{ uri: nativeFreshImageUri(creatorAvatarUrl, creatorAvatarUrl) }} style={styles.creatorAvatarImage} transition={120} />
          ) : (
            <Text style={styles.creatorInitial}>{creatorDisplayName.charAt(0) || "?"}</Text>
          )}
        </View>
        {creatorLoading ? <NativeShimmerSkeleton style={styles.creatorNameSkeleton} /> : <Text style={styles.creatorName}>{creatorDisplayName || t("Anonymous")}</Text>}
      </Pressable>
    </Animated.View>
  );

  // SS4: pull-down-to-dismiss gesture
  const pullDownGesture = Gesture.Pan()
    .activeOffsetY([-9999, 28])
    .failOffsetX([-24, 24])
    .onUpdate((e) => { dragY.value = Math.max(0, e.translationY); })
    .onEnd((event) => {
      const shouldClose = dragY.value > 180 || (dragY.value > 96 && event.velocityY > 1200);
      if (shouldClose) {
        dragY.value = 0;
        runOnJS(onClose)();
      } else {
        dragY.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  // Edit form is rendered as the detail Modal's body when `editing` (one modal,
  // no handoff). It is intentionally a plain View tree — NO vertical ScrollView
  // and NO AppBottomSheet wrapper. A ScrollView around these TextInputs caused
  // iOS to immediately resign first-responder on focus (keyboard flashed and
  // died); a bare/plain layout focuses normally. Content is short (title +
  // description + optional media) so it does not need to scroll.
  const editSheet = (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
      style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}
    >
      <Pressable accessibilityLabel="Close edit" onPress={closeEditAlert} style={StyleSheet.absoluteFill} />
      <View style={styles.editSheetCard}>
        <View style={styles.editHeaderRow}>
          <Text style={styles.editHeading}>Edit Alert</Text>
          <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={closeEditAlert} style={styles.iconButton}>
            <Feather color={huddleColors.text} name="x" size={24} />
          </Pressable>
        </View>
        <ScrollView
          style={styles.editBodyScroll}
          contentContainerStyle={styles.editBody}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Focus indicator: borderColor-only swap (styles.editFieldFocused).
              Never add shadow props on focus — that rebuilds the iOS layer and
              drops the keyboard. */}
          <View style={[styles.editField, editFocusedField === "title" ? styles.editFieldFocused : null]}>
            <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
              maxLength={100}
              onBlur={() => setEditFocusedField((current) => (current === "title" ? null : current))}
              onChangeText={setEditTitle}
              onFocus={() => setEditFocusedField("title")}
              onSubmitEditing={() => editDescriptionInputRef.current?.focus()}
              placeholder="Describe the situation"
              placeholderTextColor={huddleColors.mutedText}
              returnKeyType="next"
              style={styles.editInput}
              value={editTitle}
            />
          </View>
          <View style={[styles.editField, styles.editTextAreaField, editFocusedField === "description" ? styles.editFieldFocused : null]}>
            <TextInput
              ref={editDescriptionInputRef}
              maxLength={500}
              multiline
              onBlur={() => setEditFocusedField((current) => (current === "description" ? null : current))}
              onChangeText={setEditDescription}
              onFocus={() => setEditFocusedField("description")}
              placeholder="Details help everyone stay connected"
              placeholderTextColor={huddleColors.mutedText}
              scrollEnabled
              style={[styles.editInput, styles.editTextArea]}
              textAlignVertical="top"
              value={editDescription}
            />
          </View>
          {editActivePreviewUrl ? (
            <NativeSocialExternalLinkPreview
              linkPreview={editLinkPreviews[editActivePreviewUrl] || null}
              url={editActivePreviewUrl}
              onOpen={() => undefined}
              onRemove={() => {
                setEditDescription((current) => stripNativeSocialExternalUrlFromText(current, editActivePreviewUrl));
                setEditDismissedPreviewUrls((current) => {
                  const next = new Set(current);
                  next.add(editActivePreviewUrl);
                  return next;
                });
                if (editLockedPreviewUrl === editActivePreviewUrl) setEditLockedPreviewUrl(null);
              }}
            />
          ) : null}
          {editImages.length > 0 ? (
            <>
              <View style={styles.editMediaPickerBlock}>
                <ScrollView
                  bounces={false}
                  directionalLockEnabled
                  horizontal
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.editMediaThumbRow}
                  style={styles.editMediaRail}
                >
                  {editImages.map((item) => (
                    <View key={item.id} style={[styles.editMediaThumbWrap, { aspectRatio: editAlertThumbAspect(item) }]}>
                      <ExpoImage accessibilityIgnoresInvertColors cachePolicy="memory-disk" contentFit="cover" key={nativeFreshImageKey(item.uri, item.id)} source={{ uri: nativeFreshImageUri(item.uri, item.id) }} style={styles.editMediaThumb} transition={120} />
                      {item.status !== "uploaded" ? (
                        <View pointerEvents="none" style={styles.editMediaUploadingOverlay}>
                          {item.status === "uploading" ? <NativeSpinner tone="primary" /> : <Feather color={huddleColors.onPrimary} name="alert-triangle" size={16} />}
                          <Text style={styles.editMediaUploadingText}>{item.status === "uploading" ? "Uploading" : "Upload failed"}</Text>
                        </View>
                      ) : null}
                      <Pressable
                        accessibilityLabel="Remove image"
                        accessibilityRole="button"
                        onPress={() => setEditImages((current) => current.filter((entry) => entry.id !== item.id))}
                        style={styles.mediaRemoveButton}
                      >
                        <Feather color={huddleColors.onPrimary} name="x" size={14} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </View>

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: editIsSensitive }}
                onPress={() => setEditIsSensitive((value) => !value)}
                style={styles.editSensitiveRow}
              >
                <View style={[styles.editCheckboxBox, editIsSensitive ? styles.editCheckboxBoxChecked : null]}>
                  {editIsSensitive ? <Feather color={huddleColors.onPrimary} name="check" size={12} /> : null}
                </View>
                <Text style={styles.editSensitiveText}>This photo contains injury, blood, sensitive or disturbing content</Text>
              </Pressable>
            </>
          ) : null}
          {["Lost", "Stray"].includes(alert?.alert_type || "") ? (
            <>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: editVerifiedOnly }}
                onPress={() => setEditVerifiedOnly((value) => !value)}
                style={styles.editAudienceRow}
              >
                <Text style={styles.editAudienceText}>Visible to verified users only</Text>
                <View style={[styles.editVerifiedSwitchTrack, editVerifiedOnly ? styles.editVerifiedSwitchTrackOn : null]}>
                  {editVerifiedOnly ? <Feather color={huddleColors.onPrimary} name="check-circle" size={14} style={styles.editVerifiedSwitchBadge} /> : null}
                  <View style={[styles.editVerifiedSwitchThumb, editVerifiedOnly ? styles.editVerifiedSwitchThumbOn : null]} />
                </View>
              </Pressable>
              {editVerifiedOnly && !savedVerifiedOnly && isSocial ? (
                <Text style={styles.editAudienceHint}>Your Community post stays up, visible to verified users only. Unverified users will no longer see this alert on the Map.</Text>
              ) : null}
            </>
          ) : null}
          {editMessage ? <Text style={styles.messageText}>{editMessage}</Text> : null}
        </ScrollView>
        <View style={styles.editFooter}>
          <Pressable accessibilityLabel="Add image" accessibilityRole="button" onPress={() => void pickEditMedia()} style={styles.editCameraButton}>
            <Feather color={huddleColors.iconMuted} name="camera" size={16} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void handleSaveEdit()} style={styles.editSaveButton}>
            {busy ? <NativeSpinner tone="primary" /> : <Text style={styles.editSaveText}>Save Changes</Text>}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );

  const sharePage = (
      <View style={styles.sharePageSurface}>
            <AppBottomSheetHeader>
              <Text style={styles.shareTitle}>{t("Share")}</Text>
              <Pressable accessibilityLabel="Back to alert" accessibilityRole="button" onPress={closeSharePage} style={styles.iconButton}>
                <Feather color={huddleColors.iconMuted} name="chevron-left" size={24} />
              </Pressable>
            </AppBottomSheetHeader>
            <AppBottomSheetScroll edgeToEdge>
              <View style={styles.shareContent}>
                <View style={styles.shareSearchField}>
                  <Feather color={huddleColors.iconSubtle} name="search" size={huddleSocial.actionIconSize} />
                  <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                    accessibilityLabel="Search share targets"
                    autoCorrect={false}
                    onChangeText={setShareSearchQuery}
                    placeholder="Search name or Social ID"
                    placeholderTextColor={huddleColors.mutedText}
                    style={styles.shareSearchInput}
                    value={shareSearchQuery}
                  />
                </View>
                <View style={styles.shareTargetsBlock}>
                  {shareTargetsLoading ? <NativeLoadingState variant="inline" /> : filteredShareTargets.length === 0 ? <Text style={styles.shareEmptyText}>No chats found.</Text> : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shareTargetRow}>
                      {filteredShareTargets.map((target) => {
                        const selected = shareTargetKeys.has(target.chatId);
                        return (
                          <Pressable key={target.chatId} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setShareTargetKeys((current) => {
                            const next = new Set(current);
                            if (next.has(target.chatId)) next.delete(target.chatId);
                            else next.add(target.chatId);
                            return next;
                          })} style={({ pressed }) => [styles.shareTarget, pressed ? styles.pressed : null]}>
                            <View style={[styles.shareTargetAvatar, selected ? styles.shareTargetAvatarSelected : null]}>
                              {target.avatarUrl && !failedShareTargetAvatars.has(target.avatarUrl) ? <ExpoImage cachePolicy="memory-disk" contentFit="cover" key={nativeFreshImageKey(target.avatarUrl, target.avatarUrl)} onError={() => setFailedShareTargetAvatars((current) => new Set([...current, target.avatarUrl as string]))} source={{ uri: nativeFreshImageUri(target.avatarUrl, target.avatarUrl) }} style={styles.shareTargetAvatarImage} transition={120} /> : <Text style={styles.shareTargetInitial}>{target.label.charAt(0).toUpperCase()}</Text>}
                            </View>
                            <Text numberOfLines={1} style={styles.shareTargetName}>{target.label}</Text>
                            <Text numberOfLines={1} style={styles.shareTargetSubtitle}>{target.subtitle || "Chat"}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>
              </View>
            </AppBottomSheetScroll>
            <AppBottomSheetFooter>
              <View style={styles.shareActionRow}>
                <Pressable accessibilityRole="button" disabled={shareTargetKeys.size === 0 || shareSending || shareTargetsLoading} onPress={() => void handleShareToChat()} style={({ pressed }) => [styles.shareSecondaryButton, shareTargetKeys.size === 0 || shareSending || shareTargetsLoading ? styles.disabled : null, pressed ? styles.pressed : null]}>
                  {shareSending ? <NativeSpinner tone="accent" /> : <NativeNavIcon color={huddleColors.blue} size={19} tab="chats" />}
                  <Text style={styles.shareSecondaryButtonText}>{formatNativeShareChatActionLabel(shareTargetKeys.size)}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => { void handleNativeShare().then(closeSharePage); }} style={({ pressed }) => [styles.shareSecondaryButton, pressed ? styles.pressed : null]}>
                  <Feather color={huddleColors.blue} name="share-2" size={18} />
                  <Text style={styles.shareSecondaryButtonText}>Share</Text>
                </Pressable>
              </View>
            </AppBottomSheetFooter>
      </View>
  );

  return (
    <>
    <Modal
      presentationStyle="overFullScreen"
      animationType="slide"
      onRequestClose={shareOpen ? closeSharePage : editing ? closeEditAlert : onClose}
      transparent
      visible={Boolean(alert) && !confirmRemove && !confirmFound && !confirmBlock && !reportOpen}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
      {editing ? editSheet : (
      <View style={styles.inlinePageHost}>
      <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={shareOpen ? closeSharePage : onClose}>
        <Pressable onPress={(event) => event.stopPropagation()} style={[styles.bottomSheetBoundary, { maxHeight: alertDetailSheetMaxHeight }]}>
          <Animated.View ref={cardRef} onLayout={(event) => { handleCardLayout(); handleSheetLayout(event); }} style={dragStyle}>
          <AppBottomSheet disableSwipeToClose={!shareOpen} mode="autoMax" onClose={shareOpen ? closeSharePage : onClose} style={{ maxHeight: alertDetailSheetMaxHeight }}>
          {shareOpen ? sharePage : (
            <>
          <GestureDetector gesture={pullDownGesture}>
            <View collapsable={false}>
          <View style={nativeModalStyles.appBottomSheetHandleArea}>
            <View style={nativeModalStyles.appBottomSheetHandle} />
          </View>
          <AppBottomSheetHeader>
            <View style={styles.detailHeaderMeasure}>
              <View style={[styles.typePill, { backgroundColor: color }]}>
                <Text style={styles.typePillText}>{alert.alert_type} · {timeAgo(alert.created_at)}</Text>
              </View>
              {savedVerifiedOnly || alert.verified_only === true ? (
                <View style={styles.verifiedAudienceBadge}>
                  <Feather color={huddleColors.success} name="check-circle" size={13} />
                  <Text style={styles.verifiedAudienceBadgeText}>Verified User only</Text>
                </View>
              ) : null}
              <View style={styles.headerActions}>
                <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
                  <Feather color={huddleColors.text} name="x" size={24} />
                </Pressable>
              </View>
            </View>
          </AppBottomSheetHeader>
            </View>
          </GestureDetector>
          <View style={{ maxHeight: detailBodyBudgetHeight }}>
            <AppBottomSheetScroll>{detailBody}</AppBottomSheetScroll>
          </View>
          <View>
            {detailCreatorDock}
          </View>

          <AppBottomSheetFooter>
          <View style={styles.footer}>
            {isSocial && (!alert.is_demo) ? (
              <Pressable accessibilityRole="button" onPress={handleSocial} style={styles.socialLink}>
                <Text style={styles.socialLinkText}>{t("See on Social")}</Text>
              </Pressable>
            ) : <View style={styles.socialSpacer} />}
            <View style={styles.footerActions}>
              <Pressable accessibilityLabel={liked ? "Remove support" : "Support alert"} accessibilityRole="button" accessibilityState={{ selected: liked }} onPress={() => void handleSupport()} style={({ pressed }) => [styles.footerButton, liked ? styles.supportActive : null, pressed ? styles.pressed : null]}>
                <RNAnimated.View ref={heartWrapperRef} onLayout={handleHeartLayout} style={{ transform: [{ scale: heartScale }] }}>
                  <FontAwesome color={liked ? huddleColors.coral : huddleColors.iconMuted} name={liked ? "heart" : "heart-o"} size={20} />
                </RNAnimated.View>
                <Text style={styles.supportCount}>{supportCount}</Text>
              </Pressable>
              <Pressable accessibilityLabel="Share" accessibilityRole="button" onPress={openSharePage} style={styles.footerButton}>
                <Feather color={huddleColors.iconMuted} name="send" size={18} />
                {shareCount > 0 ? <Text style={styles.supportCount}>{shareCount}</Text> : null}
              </Pressable>
              <View>
                <Pressable accessibilityLabel="More" accessibilityRole="button" onPress={() => setMenuOpen((value) => !value)} style={styles.footerButton}>
                  <Feather color={huddleColors.iconMuted} name="more-horizontal" size={20} />
                </Pressable>
                {menuOpen ? (
                  <View style={styles.menu}>
                    <AppActionMenu items={isCreator ? [
                        { label: t("Edit alert"), icon: "edit-2", onPress: openEditAlert },
                        // Only a Lost alert can be "found" -- a Stray/Caution/Others sighting has
                        // no such resolution, so the action is not offered there.
                        ...(alert.alert_type === "Lost"
                          ? [{ label: t("Mark as found"), icon: "check-circle" as const, onPress: openMarkFound }]
                          : []),
                        { label: t("Remove alert"), icon: "trash-2", destructive: true, onPress: openRemoveAlert },
                      ] : [
                        { label: t("Report"), icon: "flag", onPress: () => void openReportModal() },
                        { label: t("Hide alert"), icon: "eye-off", onPress: handleHide },
                        { label: t("Block User"), icon: "slash", destructive: true, onPress: handleBlock },
                      ]} />
                  </View>
                ) : null}
              </View>
            </View>
          </View>
          </AppBottomSheetFooter>
            </>
          )}
          </AppBottomSheet>
          {/* Heart-support fly-to-button burst — sheet-relative absolute positioning. */}
          <RNAnimated.View
            pointerEvents="none"
            style={[
              styles.heartBurst,
              {
                opacity: burstOpacity,
                transform: [
                  { translateX: RNAnimated.subtract(burstX, HEART_BURST_SIZE / 2) },
                  { translateY: RNAnimated.subtract(burstY, HEART_BURST_SIZE / 2) },
                  { scale: burstScale },
                  { rotate: burstRotation.interpolate({ inputRange: [-1, 1], outputRange: ["-9deg", "9deg"] }) },
                ],
              },
            ]}
          >
            <FontAwesome color={huddleColors.coral} name="heart" size={HEART_BURST_SIZE} />
          </RNAnimated.View>
          </Animated.View>
        </Pressable>
      </Pressable>
      </View>
      )}
      </GestureHandlerRootView>
    </Modal>

      <AppConfirmModal
        body={t("Your pin comes off the map and your post is marked Found, so nobody keeps looking.")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Mark as found")}
        loading={foundBusy}
        message={message}
        onCancel={() => { if (!foundBusy) setConfirmFound(false); }}
        onConfirm={() => void handleMarkFound()}
        open={confirmFound}
        title={t("Call off the search?")}
      />

      <AppDestructiveSlideConfirm
        body={t("This alert will be removed from the map.")}
        busy={deleteBusy}
        message={message}
        onClose={() => {
          if (!deleteBusy) setConfirmRemove(false);
        }}
        onConfirm={() => void handleDelete()}
        open={confirmRemove}
        slideLabel={`${t("Slide to")} ${t("Remove")}`}
        title={t("Remove Broadcast?")}
      />

      <AppDestructiveSlideConfirm
        body={t("You will no longer see their posts or alerts, and they won't be able to interact with you.")}
        onClose={() => setConfirmBlock(false)}
        onConfirm={() => void confirmBlockUser()}
        open={confirmBlock}
        slideLabel={`${t("Slide to")} ${t("Block")}`}
        title={`${t("Block")} ${alert.creator.display_name ?? t("this user")}?`}
      />

      <NativeSocialReportModal
        currentUserId={effectiveUserId}
        onClose={() => setReportOpen(false)}
        onNotice={setMessage}
        onSubmitSuccess={handleReportSubmitSuccess}
        open={reportOpen}
        source="Map"
        sourceOrigin="maps"
        subject={alert?.id ? { type: "map_alert", id: alert.id, label: alert.title || "Alert" } : null}
        target={alert.creator_id ? {
          userId: alert.creator_id,
          author: {
            avatarUrl: creatorAvatarUrl,
            displayName: alert.creator.display_name,
            verificationStatus: null,
            locationCountry: null,
            isVerified: false,
            nonSocial: false,
            socialId: alert.creator.social_id,
          },
        } : null}
      />

    </>
  );
}


const styles = StyleSheet.create({
  // A Modal presents outside the app's root gesture handler, so this sheet needs its
  // own root or its pull-down recognizer never attaches to the responder chain.
  gestureRoot: {
    flex: 1,
  },
  inlinePageHost: {
    flex: 1,
  },
  sharePageSurface: {
    minHeight: 0,
    backgroundColor: huddleColors.canvas,
  },
  // This Pressable exists only to stop taps on the CARD from reaching the backdrop's
  // close handler. It must therefore wrap the card and nothing else. With flex:1 it
  // stretched over the whole backdrop, so every tap in the empty space above the sheet
  // hit this stopPropagation handler instead of the backdrop -- tap-to-close looked
  // broken, and a deep-linked alert became an undismissable full-screen touch trap.
  // The parent (appModalBottomSafeArea) already bottom-aligns it.
  bottomSheetBoundary: {
    width: "100%",
    alignSelf: "stretch",
  },
  typePill: {
    borderRadius: huddleRadii.pill,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: 4,
  },
  typePillText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
  verifiedAudienceBadge: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x1,
    borderWidth: 1,
    borderColor: huddleColors.success,
    borderRadius: huddleRadii.pill,
    paddingHorizontal: huddleSpacing.x2,
    backgroundColor: huddleColors.successSoft,
  },
  verifiedAudienceBadgeText: {
    fontFamily: "Urbanist-600",
    fontSize: 12,
    lineHeight: 16,
    color: huddleColors.success,
  },
  headerActions: {
    marginLeft: "auto",
    flexDirection: "row",
    gap: huddleSpacing.x2,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginBottom: huddleSpacing.x2,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  body: {
    marginBottom: huddleSpacing.x4,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: 23,
    color: huddleColors.text,
  },
  detailBody: {
    paddingHorizontal: huddleSpacing.x6,
    paddingTop: huddleSpacing.x2,
  },
  detailCarouselMeasure: {
    alignSelf: "stretch",
    paddingRight: huddleSpacing.x3,
  },
  detailHeaderMeasure: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.45,
  },
  creatorDock: {
    paddingHorizontal: huddleSpacing.x6,
    paddingVertical: huddleSpacing.x3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: huddleColors.divider,
    backgroundColor: huddleColors.canvas,
  },
  creatorPressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  creatorAvatar: {
    width: 32,
    height: 32,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: huddleColors.mutedCanvas,
  },
  creatorAvatarImage: {
    width: "100%",
    height: "100%",
  },
  creatorInitial: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    color: huddleColors.text,
  },
  creatorName: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  creatorNameSkeleton: {
    width: 128,
    height: huddleType.labelLine,
    borderRadius: huddleRadii.pill,
  },
  messageText: {
    marginTop: huddleSpacing.x3,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.validationRed,
  },
  footer: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: huddleColors.canvas,
  },
  socialLink: {
    minHeight: 42,
    justifyContent: "center",
  },
  socialLinkText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.blue,
    textDecorationLine: "underline",
  },
  socialSpacer: {
    flex: 1,
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: huddleSpacing.x2,
  },
  footerButton: {
    minWidth: huddleSocial.actionButtonSize,
    minHeight: huddleSocial.actionButtonSize,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    paddingHorizontal: huddleSpacing.x2,
  },
  supportActive: {
    // Match social paw treatment — no background fill; only the icon color flips.
  },
  heartBurst: {
    position: "absolute",
    left: 0,
    top: 0,
    width: HEART_BURST_SIZE,
    height: HEART_BURST_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  supportCount: {
    marginLeft: 2,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    color: huddleColors.mutedText,
  },
  menu: {
    position: "absolute",
    right: 0,
    bottom: 48,
    zIndex: 30,
    elevation: 30,
  },
  shareTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  shareContent: {
    gap: huddleSpacing.x4,
    paddingTop: huddleSpacing.x1,
  },
  shareSearchField: {
    minHeight: huddleLayout.fieldHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    borderWidth: 1,
    borderColor: huddleColors.cardBorderSoft,
    borderRadius: huddleRadii.field,
    marginHorizontal: huddleSpacing.x4,
    paddingHorizontal: huddleSpacing.x3,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  shareSearchInput: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    minHeight: huddleLayout.fieldHeight - huddleSpacing.x2,
    padding: 0,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
    overflow: "hidden",
  },
  shareTargetsBlock: {
    minHeight: 126,
    justifyContent: "center",
  },
  shareTargetRow: {
    gap: huddleSpacing.x4,
    paddingLeft: huddleSpacing.x2,
    paddingRight: 0,
  },
  shareTarget: {
    width: 88,
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  shareTargetAvatar: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    borderRadius: 32,
    backgroundColor: huddleColors.canvas,
  },
  shareTargetAvatarSelected: {
    borderColor: huddleColors.blue,
    borderWidth: 2,
  },
  shareTargetAvatarImage: {
    width: "100%",
    height: "100%",
  },
  shareTargetInitial: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    color: huddleColors.text,
  },
  shareTargetName: {
    width: "100%",
    textAlign: "center",
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.text,
  },
  shareTargetSubtitle: {
    width: "100%",
    textAlign: "center",
    fontFamily: "Urbanist-500",
    fontSize: huddleType.meta,
    lineHeight: huddleType.metaLine,
    color: huddleColors.caption,
  },
  shareEmptyText: {
    textAlign: "center",
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    color: huddleColors.caption,
  },
  shareActionRow: {
    flexDirection: "row",
    gap: huddleSpacing.x3,
  },
  shareSecondaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.secondary,
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: huddleSpacing.x2,
  },
  shareSecondaryButtonText: {
    ...huddleButtons.label,
    color: huddleColors.blue,
  },
  editHeading: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  editSheetCard: {
    width: "100%",
    alignSelf: "stretch",
    maxHeight: "88%",
    overflow: "hidden",
    borderTopLeftRadius: huddleRadii.sheet,
    borderTopRightRadius: huddleRadii.sheet,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation2,
  },
  editHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: huddleSpacing.x6,
    paddingTop: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x2,
  },
  editBodyScroll: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  editBody: {
    paddingHorizontal: huddleSpacing.x6,
    paddingTop: huddleSpacing.x2,
    paddingBottom: huddleSpacing.x4,
    gap: huddleSpacing.x3,
  },
  editField: {
    minHeight: 52,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    borderRadius: huddleRadii.field,
    paddingHorizontal: huddleSpacing.x4,
    backgroundColor: huddleColors.canvas,
  },
  // Focus indicator: ONLY borderColor changes (same borderWidth, no shadow) so
  // the iOS layer is updated in place and the keyboard is not torn down.
  editFieldFocused: {
    borderColor: huddleColors.fieldFocusBorder,
  },
  editTextAreaField: {
    height: huddleFormFields.multilineHeight,
    maxHeight: huddleFormFields.multilineHeight,
    paddingVertical: huddleSpacing.x3,
  },
  editInput: {
    flexShrink: 1,
    minWidth: 0,
    padding: 0,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    // No explicit lineHeight: on iOS a tight lineHeight clips descenders (g/y/p).
    // Let the font's natural metrics apply (applies to both fields).
    color: huddleColors.text,
    overflow: "hidden",
  },
  editTextArea: {
    height: huddleFormFields.multilineHeight - huddleSpacing.x6,
    maxHeight: huddleFormFields.multilineHeight - huddleSpacing.x6,
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
  editMediaPickerBlock: {
    gap: huddleSpacing.x3,
  },
  editMediaRail: {
    alignSelf: "stretch",
    flexGrow: 0,
    flexShrink: 0,
    maxWidth: "100%",
    overflow: "hidden",
    width: "100%",
  },
  editMediaThumbRow: {
    gap: huddleSpacing.x2,
    marginTop: huddleSpacing.x4,
    paddingRight: huddleSpacing.x6,
  },
  editMediaThumbWrap: {
    backgroundColor: huddleColors.mutedCanvas,
    borderRadius: huddleRadii.card,
    height: huddleSpacing.x10 + huddleSpacing.x8,
    overflow: "hidden",
  },
  editMediaThumb: {
    height: "100%",
    width: "100%",
  },
  editMediaUploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x1,
    backgroundColor: huddleColors.backdrop,
  },
  editMediaUploadingText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.onPrimary,
  },
  editSensitiveRow: {
    marginTop: huddleSpacing.x3,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x2,
  },
  editCheckboxBox: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    borderRadius: 4,
  },
  editCheckboxBoxChecked: {
    borderColor: huddleColors.blue,
    backgroundColor: huddleColors.blue,
  },
  editSensitiveText: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.mutedText,
  },
  editAudienceRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x3,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    borderRadius: huddleRadii.field,
    paddingHorizontal: huddleSpacing.x4,
    backgroundColor: huddleColors.glassChrome,
  },
  editAudienceText: {
    flex: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  editAudienceHint: {
    marginTop: -huddleSpacing.x1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.mutedText,
  },
  editVerifiedSwitchTrack: {
    ...huddleGlassControls.toggleSurface,
    width: 50,
    height: 28,
    flexShrink: 0,
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    paddingHorizontal: 3,
    backgroundColor: huddleColors.tabActive,
  },
  editVerifiedSwitchTrackOn: {
    backgroundColor: huddleColors.success,
  },
  editVerifiedSwitchBadge: {
    position: "absolute",
    left: 5,
  },
  editVerifiedSwitchThumb: {
    width: 22,
    height: 22,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.canvas,
  },
  editVerifiedSwitchThumbOn: {
    transform: [{ translateX: 22 }],
  },
  editFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x6,
    paddingTop: huddleSpacing.x2,
    paddingBottom: huddleSpacing.x4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: huddleColors.divider,
  },
  editCameraButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    borderRadius: 20,
    backgroundColor: huddleColors.divider,
  },
  editSaveButton: {
    minHeight: 48,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: huddleColors.blue,
  },
  editSaveText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
});
