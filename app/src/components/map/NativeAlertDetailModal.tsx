import Feather from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { Image as ExpoImage } from "expo-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image as RNImage, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from "react-native-reanimated";
import {
  areNativeUsersBlocked,
  blockNativeAlertCreator,
  clearNativeAlertInteractionCache,
  countNativeAlertSupports,
  deleteNativeBroadcastAlert,
  enqueueNativeAlertSupportNotification,
  loadNativeMapActorName,
  loadNativeAlertSupported,
  removeNativeAlertSupport,
  reportNativeAlert,
  supportNativeAlert,
  updateNativeBroadcastAlert,
} from "../../lib/nativeMapAlertInteractions";
import type { NativeMapAlert } from "../../lib/nativeMapData";
import { cleanupNativeBroadcastImages, uploadNativeBroadcastImage } from "../../lib/nativeBroadcast";
import { createNativeProtectedActionError, getNativeProtectedActionResult, logNativeProtectedActionFailure, type NativeProtectedActionCleanupResult } from "../../lib/nativeStorageCleanup";
import { useLanguage } from "../../lib/nativeLanguage";
import { haptic } from "../../lib/nativeHaptics";
import { fetchNativeSocialShareTargets, recordNativeSocialShare, sendNativeMapAlertShareToChat, type NativeSocialShareTarget } from "../../lib/nativeSocial";
import { resolveNativeAvatarUrl } from "../../lib/nativeStorageUrlCache";
import { createSingleRealtimeChannel } from "../../lib/realtimeChannelManager";
import { NativeLoadingState } from "../NativeLoadingState";
import { NativeShimmerSkeleton } from "../NativeShimmerSkeleton";
import { NativeSocialMediaCarousel } from "../social/NativeSocialFeedPrimitives";
import { NativeSocialReportModal } from "../social/NativeSocialReportModal";
import { huddleColors, huddleFieldStates, huddleRadii, huddleShadows, huddleSocial, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";
import { AppActionMenu, AppBottomSheet, AppBottomSheetFooter, AppBottomSheetHeader, AppBottomSheetScroll, AppConfirmModal, AppDestructiveSlideConfirm } from "../nativeModalPrimitives";
import { nativeModalStyles } from "../nativeModalPrimitives.styles";

type NativeAlertDetailModalProps = {
  accessToken?: string | null;
  alert: NativeMapAlert | null;
  onClose: () => void;
  onHidden: (alertId: string) => void;
  onOpenProfile?: (userId: string) => void;
  onOpenSocial?: (threadId: string) => void;
  onRefresh: () => Promise<void> | void;
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
const editAlertThumbAspect = (media: EditAlertImage) => Math.min(Math.max(
  typeof media.width === "number" && typeof media.height === "number" && media.width > 0 && media.height > 0
    ? media.width / media.height
    : 1,
  MIN_EDIT_ALERT_THUMB_ASPECT,
), MAX_EDIT_ALERT_THUMB_ASPECT);
const humanNativeAlertError = (error: unknown) => {
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

export function NativeAlertDetailModal({ accessToken, alert, onClose, onHidden, onOpenProfile, onOpenSocial, onRefresh, userId }: NativeAlertDetailModalProps) {
  const { t } = useLanguage();
  // SS4: pull-down-to-dismiss
  const dragY = useSharedValue(0);
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(userId);
  const [liked, setLiked] = useState(false);
  const [supportCount, setSupportCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editImages, setEditImages] = useState<EditAlertImage[]>([]);
  const [editIsSensitive, setEditIsSensitive] = useState(false);
  const [editFocusedField, setEditFocusedField] = useState<"title" | "description" | null>(null);
  const editDescriptionInputRef = useRef<TextInput | null>(null);
  const [detailHeaderHeight, setDetailHeaderHeight] = useState(0);
  const [detailCreatorDockHeight, setDetailCreatorDockHeight] = useState(0);
  const [detailFooterHeight, setDetailFooterHeight] = useState(0);
  const [detailMediaFrameHeight, setDetailMediaFrameHeight] = useState(0);
  const [detailCarouselBlockHeight, setDetailCarouselBlockHeight] = useState(0);
  const [detailCarouselWidth, setDetailCarouselWidth] = useState(0);
  const [detailTextHeight, setDetailTextHeight] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTargets, setShareTargets] = useState<NativeSocialShareTarget[]>([]);
  const [shareTargetKey, setShareTargetKey] = useState("");
  const [shareTargetsLoading, setShareTargetsLoading] = useState(false);
  const [shareSending, setShareSending] = useState(false);
  const [shareSearchQuery, setShareSearchQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const { width, height } = useWindowDimensions();
  const effectiveUserId = userId ?? resolvedUserId;
  const isCreator = Boolean(effectiveUserId && alert?.creator_id === effectiveUserId);
  const socialThreadId = alert?.thread_id || alert?.social_post_id || null;
  const isSocial = Boolean(alert?.post_on_social || alert?.posted_to_threads || alert?.has_thread || alert?.social_post_id || alert?.thread_id || alert?.social_url);
  const images = useMemo(() => {
    const rawImages = alert?.media_urls.length ? alert.media_urls : alert?.photo_url ? [alert.photo_url] : [];
    return rawImages.map((uri) => String(uri || "").trim()).filter(Boolean);
  }, [alert?.media_urls, alert?.photo_url]);
  const media = useMemo(() => images.map((uri) => ({ uri, kind: "image" as const })), [images]);
  const creatorAvatarUrl = useMemo(() => resolveNativeAvatarUrl(alert?.creator.avatar_url) ?? alert?.creator.avatar_url ?? null, [alert?.creator.avatar_url]);
  const creatorName = String(alert?.creator.display_name || "").trim();
  const creatorNameIsPlaceholder = !creatorName || creatorName === "?" || creatorName.toLowerCase() === "anonymous";
  const creatorDisplayName = creatorNameIsPlaceholder ? "" : creatorName;
  const shellAlertPendingDetail = Boolean(alert && !alert.creator_id && !alert.title && !alert.description && images.length === 0);
  const creatorLoading = Boolean(shellAlertPendingDetail || (alert?.creator_id && creatorNameIsPlaceholder));
  const alertDetailSheetMaxHeight = height * 0.82;
  const measuredDetailHeaderHeight = detailHeaderHeight || 64;
  const measuredCreatorDockHeight = detailCreatorDockHeight || 57;
  const measuredDetailFooterHeight = detailFooterHeight || 76;
  const detailBodyBudgetHeight = Math.max(
    240,
    alertDetailSheetMaxHeight - measuredDetailHeaderHeight - measuredCreatorDockHeight - measuredDetailFooterHeight,
  );
  const alertDetailMediaMaxHeight = Math.max(220, detailBodyBudgetHeight - huddleSpacing.x6);
  const detailCarouselRightInset = huddleSpacing.x3;
  const detailFallbackCarouselWidth = Math.max(1, width - huddleSpacing.x6 * 4);
  const detailCarouselContentWidth = Math.max(1, (detailCarouselWidth || detailFallbackCarouselWidth) - detailCarouselRightInset);
  const measuredDetailTextHeight = detailTextHeight || (alert?.title || alert?.description ? 96 : 0);
  const detailFallbackMediaHeight = Math.min(
    alertDetailMediaMaxHeight,
    detailCarouselContentWidth / huddleSocial.mediaFrameAspectRatio,
  );
  const measuredDetailMediaHeight = media.length > 0 ? (detailCarouselBlockHeight || detailMediaFrameHeight || detailFallbackMediaHeight) : 0;
  const detailBodyTargetHeight = Math.min(
    detailBodyBudgetHeight,
    measuredDetailTextHeight + measuredDetailMediaHeight + huddleSpacing.x6,
  );
  const detailSheetTargetHeight = Math.min(
    alertDetailSheetMaxHeight,
    measuredDetailHeaderHeight + detailBodyTargetHeight + measuredCreatorDockHeight + measuredDetailFooterHeight,
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
    let active = true;
    setMenuOpen(false);
    setConfirmRemove(false);
    setConfirmBlock(false);
    setReportOpen(false);
    setEditing(false);
    setEditFocusedField(null);
    setDetailMediaFrameHeight(0);
    setDetailCarouselBlockHeight(0);
    setDetailCarouselWidth(0);
    setDetailTextHeight(0);
    setMessage(null);
    if (!alert) return undefined;
    setSupportCount(alert.support_count || 0);
    setEditTitle(alert.title || "");
    setEditDescription(alert.description || "");
    const existingEditImages = makeExistingEditImages(alert);
    setEditImages(existingEditImages);
    hydrateExistingEditImageDimensions(existingEditImages);
    setEditIsSensitive(alert.is_sensitive === true);
    if (!effectiveUserId) {
      setLiked(false);
      return undefined;
    }
    void Promise.all([
      loadNativeAlertSupported(alert.id, effectiveUserId, { accessToken, force: true }),
      countNativeAlertSupports(alert.id, { accessToken, force: true }),
    ]).then(([nextLiked, nextCount]) => {
      if (active) setLiked(nextLiked);
      if (active) setSupportCount(nextCount);
    }).catch(() => {
      if (active) setLiked(false);
    });
    return () => {
      active = false;
    };
  }, [accessToken, alert, effectiveUserId]);

  useEffect(() => {
    setResolvedUserId(userId);
  }, [userId]);

  useEffect(() => {
    if (!shareOpen || !effectiveUserId) {
      setShareTargets([]);
      setShareTargetKey("");
      setShareSearchQuery("");
      return;
    }
    if (!accessToken) {
      setShareTargets([]);
      setShareTargetKey("");
      setShareTargetsLoading(false);
      setMessage("Please login again to share alerts.");
      return;
    }
    let active = true;
    setShareTargetsLoading(true);
    void fetchNativeSocialShareTargets(effectiveUserId, accessToken)
      .then((targets) => {
        if (!active) return;
        setShareTargets(targets);
        setShareTargetKey(targets[0]?.chatId || "");
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

  useEffect(() => {
    if (!shareOpen) return;
    if (filteredShareTargets.length > 0 && !filteredShareTargets.some((target) => target.chatId === shareTargetKey)) {
      setShareTargetKey(filteredShareTargets[0]?.chatId || "");
    }
  }, [filteredShareTargets, shareOpen, shareTargetKey]);

  const syncSupportCount = useCallback(async () => {
    if (!alert) return;
    const next = await countNativeAlertSupports(alert.id, { accessToken, force: true });
    setSupportCount(next);
  }, [accessToken, alert]);

  const syncSupportState = useCallback(async (nextUserId: string) => {
    if (!alert) return;
    await clearNativeAlertInteractionCache(alert.id, nextUserId);
    const [nextLiked, nextCount] = await Promise.all([
      loadNativeAlertSupported(alert.id, nextUserId, { accessToken, force: true }),
      countNativeAlertSupports(alert.id, { accessToken, force: true }),
    ]);
    setLiked(nextLiked);
    setSupportCount(nextCount);
  }, [accessToken, alert]);

  useEffect(() => {
    if (!alert) return undefined;

    const handle = createSingleRealtimeChannel(`native-alert-interactions:${alert.id}`, (channel) =>
      channel
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "broadcast_alert_interactions", filter: `alert_id=eq.${alert.id}` },
          () => {
            void clearNativeAlertInteractionCache(alert.id, effectiveUserId || undefined).then(async () => {
              await syncSupportCount();
              if (effectiveUserId) {
                const nextLiked = await loadNativeAlertSupported(alert.id, effectiveUserId, { accessToken, force: true });
                setLiked(nextLiked);
              }
            });
          },
        )
    );

    return () => {
      void handle.dispose();
    };
  }, [accessToken, alert, effectiveUserId, syncSupportCount]);

  const resolveEffectiveUserId = async () => {
    if (effectiveUserId) return effectiveUserId;
    return null;
  };

  const resolveActorName = async (nextUserId: string) => {
    return loadNativeMapActorName(nextUserId, { accessToken });
  };

  const handleSupport = async () => {
    if (!alert || busy) return;
    const nextUserId = await resolveEffectiveUserId();
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
    try {
      // Toggle: if currently liked, remove support; otherwise add it
      if (previousLiked) {
        await removeNativeAlertSupport(alert.id, nextUserId, { accessToken });
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
          setMessage("You cannot support this user.");
          return;
        }
      }
      await supportNativeAlert(alert.id, nextUserId, { accessToken });
      await syncSupportState(nextUserId);
      try {
        const actorName = await resolveActorName(nextUserId);
        await enqueueNativeAlertSupportNotification({
          actorName,
          alertId: alert.id,
          accessToken,
          creatorId: alert.creator_id,
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
      setMessage(previousLiked ? "Failed to remove support" : "Failed to support alert");
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
    await reportNativeAlert(alert.id, nextUserId, { accessToken });
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

  const confirmBlockUser = async () => {
    if (!alert?.creator_id || busy) return;
    const creatorId = alert.creator_id;
    const alertId = alert.id;
    setBusy(true);
    setMenuOpen(false);
    setConfirmBlock(false);
    setMessage(null);
    try {
      await blockNativeAlertCreator(creatorId, { accessToken });
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
    if (!alert || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteNativeBroadcastAlert(alert.id, alert.media_urls?.length ? alert.media_urls : alert.photo_url ? [alert.photo_url] : [], alert.creator_id, { accessToken });
      setConfirmRemove(false);
      onHidden(alert.id);
      await onRefresh();
      onClose();
    } catch (error) {
      setMessage(humanNativeAlertError(error));
    } finally {
      setBusy(false);
    }
  };

  const pickEditMedia = async () => {
    if (!alert || busy) return;
    const nextUserId = await resolveEffectiveUserId();
    if (!nextUserId || !accessToken) {
      setMessage("Please login to edit alerts");
      return;
    }
    const availableSlots = Math.max(0, 10 - editImages.length);
    if (availableSlots <= 0) {
      setMessage("You can upload up to 10 photos.");
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("Photo library permission is required to add images.");
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
    setMessage(null);
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
        const uploadedUrl = await uploadNativeBroadcastImage(nextUserId, asset.uri, asset.fileName, asset.mimeType, accessToken);
        const imageId = optimisticImages[index]?.id;
        setEditImages((current) => current.map((image) => image.id === imageId ? { ...image, uri: uploadedUrl, uploadedUrl, status: "uploaded" } : image));
      }
    } catch (error) {
      logNativeProtectedActionFailure("[map.alertDetail] upload_media_failed", error);
      const failedIds = new Set(optimisticImages.map((image) => image.id));
      setEditImages((current) => current.map((image) => failedIds.has(image.id) && image.status === "uploading" ? { ...image, status: "error" } : image));
      setMessage(`Image upload failed: ${humanNativeAlertError(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!alert || busy) return;
    const nextTitle = editTitle.trim();
    const nextDescription = editDescription.trim();
    if (!nextTitle) {
      setMessage("Title is required");
      return;
    }
    if (nextTitle.length > 100 || nextDescription.length > 500) {
      setMessage("Please shorten the alert details");
      return;
    }
    const hasPendingUpload = editImages.some((image) => image.status === "uploading");
    const failedUpload = editImages.some((image) => image.status === "error");
    if (hasPendingUpload) {
      setMessage("Please wait for image upload to finish.");
      return;
    }
    if (failedUpload) {
      setMessage("Remove failed images before saving.");
      return;
    }
    const uploadedImages = editImages.map((image) => image.uploadedUrl).filter((uri): uri is string => Boolean(uri));
    setBusy(true);
    setMessage(null);
    try {
      await updateNativeBroadcastAlert(alert.id, {
        title: nextTitle,
        description: nextDescription || null,
        photo_url: uploadedImages[0] || null,
        images: uploadedImages,
        is_sensitive: editIsSensitive,
        previousImages: alert.media_urls?.length ? alert.media_urls : alert.photo_url ? [alert.photo_url] : [],
        ownerUserId: alert.creator_id,
      }, { accessToken });
      haptic.success(); // MP9: confirm alert edit saved
      setEditing(false);
      await onRefresh();
    } catch (error) {
      const previousImages = alert.media_urls?.length ? alert.media_urls : alert.photo_url ? [alert.photo_url] : [];
      const orphanImages = uploadedImages.filter((uri) => !previousImages.includes(uri));
      if (orphanImages.length > 0) {
        const cleanupResult: NativeProtectedActionCleanupResult = await cleanupNativeBroadcastImages(orphanImages, alert.creator_id, accessToken).catch(() => "failed" as const);
        logNativeProtectedActionFailure("[map.alertDetail] update_alert_orphan_cleanup", createNativeProtectedActionError({
          ok: false,
          stage: getNativeProtectedActionResult(error)?.stage || "domain_save",
          originalError: getNativeProtectedActionResult(error)?.originalError || error,
          cleanupAttempted: true,
          cleanupResult,
        }));
      }
      logNativeProtectedActionFailure("[map.alertDetail] update_alert_failed", error);
      setMessage(humanNativeAlertError(error));
    } finally {
      setBusy(false);
    }
  };

  const shareUrl = alert ? `https://huddle.pet/map?alert=${encodeURIComponent(alert.id)}` : "https://huddle.pet/map";

  const handleNativeShare = async () => {
    if (!alert) return;
    if (socialThreadId && !accessToken) {
      setMessage("Please login again to share alerts.");
      return;
    }
    setMessage(null);
    try {
      await Share.share({
        message: `${alert.title || alert.description || "Huddle map alert"}\n${shareUrl}`,
        title: alert.title || "Huddle map alert",
        url: shareUrl,
      });
      if (socialThreadId) {
        const count = await recordNativeSocialShare(String(socialThreadId), accessToken);
        if (count === null) setMessage("Shared, but the share count could not be updated.");
      }
    } catch {
      setMessage("Unable to share this alert right now.");
    }
  };

  const handleShareToChat = async () => {
    if (!alert || !effectiveUserId || shareSending) return;
    if (!accessToken) {
      setMessage("Please login again to share alerts.");
      return;
    }
    const selectedTarget = shareTargets.find((target) => target.chatId === shareTargetKey) || null;
    if (!selectedTarget?.chatId) {
      setMessage("No chat selected.");
      return;
    }
    setShareSending(true);
    setMessage(null);
    try {
      await sendNativeMapAlertShareToChat(alert, selectedTarget, effectiveUserId, accessToken);
      if (socialThreadId) await recordNativeSocialShare(String(socialThreadId), accessToken);
      setMessage(`Shared to ${selectedTarget.label}.`);
      setShareOpen(false);
      setShareSearchQuery("");
    } catch {
      setMessage("Unable to share to Huddle Chats.");
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
    <View style={styles.detailBody}>
      <View onLayout={(event) => setDetailTextHeight(event.nativeEvent.layout.height)}>
        {alert.title ? <Text style={styles.title}>{alert.title}</Text> : null}
        {alert.description ? <Text style={styles.body}>{alert.description}</Text> : null}
      </View>

      {media.length > 0 ? (
        <View
          onLayout={(event) => {
            setDetailCarouselBlockHeight(event.nativeEvent.layout.height);
            setDetailCarouselWidth(event.nativeEvent.layout.width);
          }}
          style={styles.detailCarouselMeasure}
        >
          <NativeSocialMediaCarousel
            contentWidth={detailCarouselContentWidth}
            heightAnimationMs={20}
            maxFrameHeight={alertDetailMediaMaxHeight}
            onFrameHeightChange={setDetailMediaFrameHeight}
            isSensitive={alert.is_sensitive}
            items={media}
            onDoubleTap={() => { if (!liked) void handleSupport(); }}
            popIconVariant="heart"
          />
        </View>
      ) : null}

      {message ? <Text style={styles.messageText}>{message}</Text> : null}
    </View>
  );

  const detailCreatorDock = (
    <View style={styles.creatorDock}>
      <Pressable
        accessibilityLabel="Open creator profile"
        accessibilityRole="button"
        disabled={!alert.creator_id || !onOpenProfile}
        onPress={() => alert.creator_id && onOpenProfile?.(alert.creator_id)}
        style={styles.creatorPressable}
      >
        <View style={styles.creatorAvatar}>
          {creatorLoading ? (
            <NativeShimmerSkeleton style={StyleSheet.absoluteFillObject} />
          ) : creatorAvatarUrl ? (
            <ExpoImage cachePolicy="memory-disk" contentFit="cover" source={{ uri: creatorAvatarUrl }} style={styles.creatorAvatarImage} transition={120} />
          ) : (
            <Text style={styles.creatorInitial}>{creatorDisplayName.charAt(0) || "?"}</Text>
          )}
        </View>
        {creatorLoading ? <NativeShimmerSkeleton style={styles.creatorNameSkeleton} /> : <Text style={styles.creatorName}>{creatorDisplayName || t("Anonymous")}</Text>}
      </Pressable>
    </View>
  );

  // SS4: pull-down-to-dismiss gesture
  const pullDownGesture = Gesture.Pan()
    .activeOffsetY([4, 9999])
    .onUpdate((e) => { dragY.value = Math.max(0, e.translationY); })
    .onEnd(() => {
      if (dragY.value > 120) {
        dragY.value = withSpring(600, { damping: 20, stiffness: 300 });
        runOnJS(onClose)();
      } else {
        dragY.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  return (
    <Modal presentationStyle="overFullScreen" animationType="slide" onRequestClose={onClose} transparent visible={Boolean(alert)}>
      <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={onClose}>
        <Pressable onPress={(event) => event.stopPropagation()} style={[styles.bottomSheetBoundary, { maxHeight: alertDetailSheetMaxHeight }]}>
          <Animated.View style={dragStyle}>
          <AppBottomSheet mode="autoMax" onClose={onClose} style={{ height: detailSheetTargetHeight, maxHeight: alertDetailSheetMaxHeight }}>
          <GestureDetector gesture={pullDownGesture}>
            <View collapsable={false}>
          <AppBottomSheetHeader onLayout={(event) => setDetailHeaderHeight(event.nativeEvent.layout.height)}>
            <View style={styles.detailHeaderMeasure}>
              <View style={[styles.typePill, { backgroundColor: color }]}>
                <Text style={styles.typePillText}>{alert.alert_type} · {timeAgo(alert.created_at)}</Text>
              </View>
              <View style={styles.headerActions}>
                {isCreator ? (
                  <>
                    <Pressable accessibilityLabel="Edit alert" accessibilityRole="button" onPress={() => setEditing(true)} style={styles.iconButton}>
                      <Feather color={huddleColors.text} name="edit-2" size={17} />
                    </Pressable>
                    <Pressable accessibilityLabel="Remove alert" accessibilityRole="button" onPress={() => setConfirmRemove(true)} style={styles.iconButton}>
                      <Feather color={huddleColors.validationRed} name="trash-2" size={18} />
                    </Pressable>
                  </>
                ) : null}
                <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
                  <Feather color={huddleColors.text} name="x" size={24} />
                </Pressable>
              </View>
            </View>
          </AppBottomSheetHeader>
            </View>
          </GestureDetector>
          <View style={{ height: detailBodyTargetHeight }}>
            <AppBottomSheetScroll fill>{detailBody}</AppBottomSheetScroll>
          </View>
          <View onLayout={(event) => setDetailCreatorDockHeight(event.nativeEvent.layout.height)}>
            {detailCreatorDock}
          </View>

          <AppBottomSheetFooter onLayout={(event) => setDetailFooterHeight(event.nativeEvent.layout.height)}>
          <View style={styles.footer}>
            {isSocial && (!alert.is_demo) ? (
              <Pressable accessibilityRole="button" onPress={handleSocial} style={styles.socialLink}>
                <Text style={styles.socialLinkText}>{t("See on Social")}</Text>
              </Pressable>
            ) : <View style={styles.socialSpacer} />}
            <View style={styles.footerActions}>
              <Pressable accessibilityLabel="Support" accessibilityRole="button" onPress={() => void handleSupport()} style={[styles.footerButton, liked ? styles.supportActive : null]}>
                {busy ? <ActivityIndicator color={huddleColors.iconMuted} size="small" /> : <FontAwesome color={liked ? huddleColors.validationRed : huddleColors.iconMuted} name={liked ? "heart" : "heart-o"} size={20} />}
                <Text style={styles.supportCount}>{supportCount}</Text>
              </Pressable>
              <Pressable accessibilityLabel="Share" accessibilityRole="button" onPress={() => setShareOpen(true)} style={styles.footerButton}>
                <Feather color={huddleColors.iconMuted} name="send" size={18} />
              </Pressable>
              {!isCreator ? (
                <View>
                  <Pressable accessibilityLabel="More" accessibilityRole="button" onPress={() => setMenuOpen((value) => !value)} style={styles.footerButton}>
                    <Feather color={huddleColors.iconMuted} name="more-horizontal" size={20} />
                  </Pressable>
                  {menuOpen ? (
                    <View style={styles.menu}>
                      <AppActionMenu items={[
                        { label: t("Report"), icon: "flag", onPress: () => void openReportModal() },
                        { label: t("Hide alert"), icon: "eye-off", onPress: handleHide },
                        { label: t("Block User"), icon: "slash", destructive: true, onPress: handleBlock },
                      ]} />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
          </AppBottomSheetFooter>
          </AppBottomSheet>
          </Animated.View>
        </Pressable>
      </Pressable>

      <AppDestructiveSlideConfirm
        body={t("This alert will be removed from the map.")}
        onClose={() => setConfirmRemove(false)}
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

      <Modal presentationStyle="overFullScreen" animationType="slide" onRequestClose={() => setShareOpen(false)} transparent visible={shareOpen}>
        <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={() => setShareOpen(false)}>
          <Pressable onPress={(event) => event.stopPropagation()} style={[styles.bottomSheetBoundary, { maxHeight: alertDetailSheetMaxHeight }]}>
            <AppBottomSheet mode="autoMax" onClose={() => setShareOpen(false)}>
            <AppBottomSheetHeader>
              <Text style={styles.shareTitle}>{t("Share")}</Text>
              <Pressable accessibilityLabel="Close share" accessibilityRole="button" onPress={() => setShareOpen(false)} style={styles.iconButton}>
                <Feather color={huddleColors.iconMuted} name="x" size={22} />
              </Pressable>
            </AppBottomSheetHeader>
            <AppBottomSheetScroll fill>
            <View style={styles.shareContent}>
              <View style={styles.shareSearchField}>
                <Feather color={huddleColors.iconSubtle} name="search" size={huddleSocial.actionIconSize} />
                <TextInput
                  accessibilityLabel="Search share targets"
                  autoCorrect={false}
                  onChangeText={setShareSearchQuery}
                  placeholder="Search User name or Social ID"
                  placeholderTextColor={huddleColors.mutedText}
                  style={styles.shareSearchInput}
                  value={shareSearchQuery}
                />
              </View>
              <View style={styles.shareTargetsBlock}>
                {shareTargetsLoading ? <NativeLoadingState variant="inline" /> : filteredShareTargets.length === 0 ? <Text style={styles.shareEmptyText}>No chats found.</Text> : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shareTargetRow}>
                    {filteredShareTargets.map((target) => {
                      const selected = target.chatId === shareTargetKey;
                      return (
                        <Pressable key={target.chatId} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setShareTargetKey(target.chatId)} style={({ pressed }) => [styles.shareTarget, pressed ? styles.pressed : null]}>
                          <View style={[styles.shareTargetAvatar, selected ? styles.shareTargetAvatarSelected : null]}>
                            {target.avatarUrl ? <ExpoImage cachePolicy="memory-disk" contentFit="cover" source={{ uri: target.avatarUrl }} style={styles.shareTargetAvatarImage} transition={120} /> : <Text style={styles.shareTargetInitial}>{target.label.charAt(0).toUpperCase()}</Text>}
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
                <Pressable accessibilityRole="button" disabled={!shareTargetKey || shareSending || shareTargetsLoading} onPress={() => void handleShareToChat()} style={({ pressed }) => [styles.shareSecondaryButton, !shareTargetKey || shareSending || shareTargetsLoading ? styles.disabled : null, pressed ? styles.pressed : null]}>
                  {shareSending ? <ActivityIndicator color={huddleColors.blue} /> : <Feather color={huddleColors.blue} name="send" size={18} />}
                  <Text style={styles.shareSecondaryButtonText}>Huddle Chats</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => { void handleNativeShare().then(() => setShareOpen(false)); }} style={({ pressed }) => [styles.shareSecondaryButton, pressed ? styles.pressed : null]}>
                  <Feather color={huddleColors.blue} name="share-2" size={18} />
                  <Text style={styles.shareSecondaryButtonText}>Share</Text>
                </Pressable>
              </View>
            </AppBottomSheetFooter>
            </AppBottomSheet>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal presentationStyle="overFullScreen" animationType="slide" onRequestClose={() => setEditing(false)} transparent visible={editing}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
          <Pressable accessibilityLabel="Close edit" onPress={() => setEditing(false)} style={StyleSheet.absoluteFill} />
          <Pressable onPress={(event) => event.stopPropagation()} style={[styles.bottomSheetBoundary, { maxHeight: alertDetailSheetMaxHeight }]}>
            <AppBottomSheet mode="autoMax" onClose={() => setEditing(false)} style={{ maxHeight: alertDetailSheetMaxHeight }}>
            <AppBottomSheetHeader>
                <Text style={styles.editHeading}>Edit Alert</Text>
                <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={() => setEditing(false)} style={styles.iconButton}>
                  <Feather color={huddleColors.text} name="x" size={24} />
                </Pressable>
            </AppBottomSheetHeader>
            <AppBottomSheetScroll contentContainerStyle={styles.editScrollContent}>
              <View style={styles.editContentStack}>
                <View style={[styles.editField, editFocusedField === "title" ? styles.editFieldFocused : null]}>
                  <TextInput
                    maxLength={100}
                    onBlur={() => setEditFocusedField(null)}
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
                    onBlur={() => setEditFocusedField(null)}
                    onChangeText={setEditDescription}
                    onFocus={() => setEditFocusedField("description")}
                    placeholder="Details help everyone stay connected"
                    placeholderTextColor={huddleColors.mutedText}
                    style={[styles.editInput, styles.editTextArea]}
                    textAlignVertical="top"
                    value={editDescription}
                  />
                </View>
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
                          <ExpoImage accessibilityIgnoresInvertColors cachePolicy="memory-disk" contentFit="cover" source={{ uri: item.uri }} style={styles.editMediaThumb} transition={120} />
                          {item.status !== "uploaded" ? (
                            <View pointerEvents="none" style={styles.editMediaUploadingOverlay}>
                              {item.status === "uploading" ? <ActivityIndicator color={huddleColors.onPrimary} size="small" /> : <Feather color={huddleColors.onPrimary} name="alert-triangle" size={16} />}
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
                {message ? <Text style={styles.messageText}>{message}</Text> : null}
              </View>
            </AppBottomSheetScroll>
            <AppBottomSheetFooter>
            <View style={styles.editFooter}>
              <Pressable accessibilityLabel="Add image" accessibilityRole="button" onPress={() => void pickEditMedia()} style={styles.editCameraButton}>
                <Feather color={huddleColors.iconMuted} name="camera" size={16} />
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => void handleSaveEdit()} style={styles.editSaveButton}>
                {busy ? <ActivityIndicator color={huddleColors.onPrimary} size="small" /> : <Text style={styles.editSaveText}>Save Changes</Text>}
              </Pressable>
            </View>
            </AppBottomSheetFooter>
            </AppBottomSheet>
          </Pressable>
        </KeyboardAvoidingView>
	      </Modal>
	    </Modal>
  );
}


const styles = StyleSheet.create({
  bottomSheetBoundary: {
    width: "100%",
    alignSelf: "stretch",
    justifyContent: "flex-end",
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
  headerActions: {
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
    justifyContent: "space-between",
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
    backgroundColor: huddleColors.mutedCanvas,
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
  },
  shareTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  shareContent: {
    gap: huddleSpacing.x4,
    paddingHorizontal: huddleSpacing.x6,
    paddingTop: huddleSpacing.x1,
  },
  shareSearchField: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    borderWidth: 1,
    borderColor: huddleColors.cardBorderSoft,
    borderRadius: 22,
    paddingHorizontal: huddleSpacing.x3,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  shareSearchInput: {
    flex: 1,
    minWidth: 0,
    height: 42,
    padding: 0,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  shareTargetsBlock: {
    minHeight: 126,
    justifyContent: "center",
  },
  shareTargetRow: {
    gap: huddleSpacing.x4,
    paddingRight: huddleSpacing.x4,
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
    alignItems: "center",
    gap: huddleSpacing.x3,
    minHeight: 56,
  },
  shareSecondaryButton: {
    minHeight: 46,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x2,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    borderRadius: huddleRadii.button,
    backgroundColor: huddleColors.canvas,
  },
  shareSecondaryButtonText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.blue,
  },
  editHeading: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  editScrollContent: {
    paddingBottom: 0,
  },
  editContentStack: {
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
  editFieldFocused: {
    ...huddleFieldStates.focused,
  },
  editTextAreaField: {
    minHeight: 112,
    paddingVertical: huddleSpacing.x3,
  },
  editInput: {
    padding: 0,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  editTextArea: {
    minHeight: 88,
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
  editFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
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
