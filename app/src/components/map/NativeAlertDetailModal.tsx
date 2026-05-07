import Feather from "@expo/vector-icons/Feather";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image as RNImage, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import {
  areNativeUsersBlocked,
  blockNativeAlertCreator,
  countNativeAlertSupports,
  deleteNativeBroadcastAlert,
  enqueueNativeAlertSupportNotification,
  loadNativeAlertSupported,
  removeNativeAlertSupport,
  reportNativeAlert,
  supportNativeAlert,
  updateNativeBroadcastAlert,
} from "../../lib/nativeMapAlertInteractions";
import type { NativeMapAlert } from "../../lib/nativeMapData";
import { uploadNativeBroadcastImage } from "../../lib/nativeBroadcast";
import { useLanguage } from "../../lib/nativeLanguage";
import { fetchNativeSocialShareTargets, recordNativeSocialShare, type NativeSocialShareTarget } from "../../lib/nativeSocial";
import { resolveNativeAvatarUrl } from "../../lib/nativeStorageUrlCache";
import { supabase } from "../../lib/supabase";
import { NativeLoadingState } from "../NativeLoadingState";
import { NativeSocialMediaCarousel } from "../social/NativeSocialFeedPrimitives";
import { NativeSocialReportModal } from "../social/NativeSocialReportModal";
import { huddleColors, huddleRadii, huddleShadows, huddleSocial, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";
import { AppActionMenu, AppBottomSheet, AppBottomSheetFooter, AppBottomSheetHeader, AppBottomSheetScroll, AppModalActionRow, AppModalButton, AppModalCard } from "../nativeModalPrimitives";
import { nativeModalStyles } from "../nativeModalPrimitives.styles";

type NativeAlertDetailModalProps = {
  alert: NativeMapAlert | null;
  onClose: () => void;
  onHidden: (alertId: string) => void;
  onOpenProfile?: (userId: string) => void;
  onOpenSocial?: (threadId: string) => void;
  onRefresh: () => Promise<void> | void;
  userId: string | null;
};

type EditAlertImage = {
  id: string;
  uri: string;
  uploadedUrl: string | null;
  status: "uploaded" | "uploading" | "error";
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

const MIN_MEDIA_ASPECT = 4 / 5;
const MAX_MEDIA_ASPECT = 16 / 9;
const NATIVE_SENSITIVE_TAP_SEEN_KEY = "huddle_sensitive_tap_seen";
const clampNativeSocialMediaAspect = (aspect: number) => Math.min(Math.max(aspect || 1, MIN_MEDIA_ASPECT), MAX_MEDIA_ASPECT);
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

export function NativeAlertDetailModal({ alert, onClose, onHidden, onOpenProfile, onOpenSocial, onRefresh, userId }: NativeAlertDetailModalProps) {
  const { t } = useLanguage();
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
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [activeEditMediaIndex, setActiveEditMediaIndex] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTargets, setShareTargets] = useState<NativeSocialShareTarget[]>([]);
  const [shareTargetKey, setShareTargetKey] = useState("");
  const [shareTargetsLoading, setShareTargetsLoading] = useState(false);
  const [shareSending, setShareSending] = useState(false);
  const [sensitiveRevealed, setSensitiveRevealed] = useState(false);
  const [tapHintDismissed, setTapHintDismissed] = useState(false);
  const [aspectByUri, setAspectByUri] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const detailMediaRef = useRef<ScrollView | null>(null);
  const editMediaRef = useRef<ScrollView | null>(null);
  const { width } = useWindowDimensions();
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
  const contentWidth = Math.max(0, width - huddleSpacing.x8 - huddleSocial.avatarSize - huddleSpacing.x4);
  const mediaSlideWidth = Math.max(contentWidth - huddleSocial.mediaPeekWidth, contentWidth * huddleSocial.mediaPeekRatio);
  const activeUri = media[activeMediaIndex]?.uri || media[0]?.uri || "";
  const displayAspect = clampNativeSocialMediaAspect(aspectByUri[activeUri] || huddleSocial.mediaFrameAspectRatio);
  const fallbackMediaFrameHeight = (mediaSlideWidth || huddleSocial.mediaWidth) / displayAspect;
  const editMediaSlideWidth = Math.max(132, Math.min(width - huddleSpacing.x6 * 2 - huddleSocial.mediaPeekWidth, 180));

  const makeExistingEditImages = (alertMedia: NativeMapAlert | null): EditAlertImage[] => {
    const urls = alertMedia?.media_urls.length ? alertMedia.media_urls : alertMedia?.photo_url ? [alertMedia.photo_url] : [];
    return urls.map((uri) => ({ id: uri, uri, uploadedUrl: uri, status: "uploaded" }));
  };

  useEffect(() => {
    let active = true;
    setMenuOpen(false);
    setConfirmRemove(false);
    setConfirmBlock(false);
    setReportOpen(false);
    setEditing(false);
    setActiveMediaIndex(0);
    setActiveEditMediaIndex(0);
    setSensitiveRevealed(false);
    setMessage(null);
    if (!alert) return undefined;
    setSupportCount(alert.support_count || 0);
    setEditTitle(alert.title || "");
    setEditDescription(alert.description || "");
    setEditImages(makeExistingEditImages(alert));
    if (!effectiveUserId) {
      setLiked(false);
      return undefined;
    }
    void loadNativeAlertSupported(alert.id, effectiveUserId).then((next) => {
      if (active) setLiked(next);
    });
    return () => {
      active = false;
    };
  }, [alert, effectiveUserId]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(NATIVE_SENSITIVE_TAP_SEEN_KEY).then((value) => {
      if (active) setTapHintDismissed(value === "1");
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    media.forEach((item) => {
      if (!item.uri || aspectByUri[item.uri]) return;
      RNImage.getSize(
        item.uri,
        (imageWidth, imageHeight) => {
          if (!imageWidth || !imageHeight) return;
          setAspectByUri((current) => {
            if (current[item.uri]) return current;
            return { ...current, [item.uri]: clampNativeSocialMediaAspect(imageWidth / imageHeight) };
          });
        },
        () => undefined,
      );
    });
  }, [aspectByUri, media]);

  useEffect(() => {
    if (userId) {
      setResolvedUserId(userId);
      return undefined;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setResolvedUserId(data.session?.user.id ?? null);
    }).catch(() => {
      if (active) setResolvedUserId(null);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!shareOpen || !effectiveUserId) {
      setShareTargets([]);
      setShareTargetKey("");
      return;
    }
    let active = true;
    setShareTargetsLoading(true);
    void fetchNativeSocialShareTargets(effectiveUserId)
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
  }, [effectiveUserId, shareOpen]);

  const syncSupportCount = async () => {
    if (!alert) return;
    const next = await countNativeAlertSupports(alert.id);
    setSupportCount(next);
  };

  const resolveEffectiveUserId = async () => {
    if (effectiveUserId) return effectiveUserId;
    const { data } = await supabase.auth.getSession();
    const nextUserId = data.session?.user.id ?? null;
    setResolvedUserId(nextUserId);
    return nextUserId;
  };

  const resolveActorName = async (nextUserId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("display_name").limit(20)
      .eq("id", nextUserId)
      .maybeSingle();
    const displayName = typeof data?.display_name === "string" ? data.display_name.trim() : "";
    return displayName || "Someone";
  };

  const handleSupport = async () => {
    if (!alert || busy) return;
    const nextUserId = await resolveEffectiveUserId();
    if (!nextUserId) {
      setMessage("Please login to support alerts");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (alert.creator_id) {
        const blocked = await areNativeUsersBlocked(nextUserId, alert.creator_id);
        if (blocked) {
          setMessage("You cannot support this user.");
          return;
        }
      }
      if (liked) {
        await removeNativeAlertSupport(alert.id, nextUserId);
        setLiked(false);
      } else {
        await supportNativeAlert(alert.id, nextUserId);
        setLiked(true);
        const actorName = await resolveActorName(nextUserId);
        await enqueueNativeAlertSupportNotification({
          actorName,
          alertId: alert.id,
          creatorId: alert.creator_id,
          userId: nextUserId,
        });
      }
      await syncSupportCount();
      await onRefresh();
    } catch {
      setMessage(liked ? "Failed to remove support" : "Failed to support alert");
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
    setMenuOpen(false);
    setMessage(null);
    try {
      if (!alert.creator_id) {
        setMessage("Unable to submit report right now.");
        return;
      }
      const blocked = await areNativeUsersBlocked(nextUserId, alert.creator_id);
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
    await reportNativeAlert(alert.id, nextUserId);
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
      await blockNativeAlertCreator(creatorId);
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
      await deleteNativeBroadcastAlert(alert.id);
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
    if (!nextUserId) {
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
      quality: 0.9,
      selectionLimit: availableSlots,
    });
    if (result.canceled) return;
    setMessage(null);
    const selectedAssets = result.assets.slice(0, availableSlots);
    const optimisticImages = selectedAssets.map((asset, index) => ({
      id: `${asset.uri}-${Date.now()}-${index}`,
      uri: asset.uri,
      uploadedUrl: null,
      status: "uploading" as const,
    }));
    setEditImages((current) => [...current, ...optimisticImages]);
    setBusy(true);
    try {
      for (const [index, asset] of selectedAssets.entries()) {
        const uploadedUrl = await uploadNativeBroadcastImage(nextUserId, asset.uri, asset.fileName, asset.mimeType);
        const imageId = optimisticImages[index]?.id;
        setEditImages((current) => current.map((image) => image.id === imageId ? { ...image, uri: uploadedUrl, uploadedUrl, status: "uploaded" } : image));
      }
    } catch (error) {
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
      });
      setEditing(false);
      await onRefresh();
    } catch (error) {
      setMessage(humanNativeAlertError(error));
    } finally {
      setBusy(false);
    }
  };

  const shareUrl = alert ? `https://huddle.pet/map?alert=${encodeURIComponent(alert.id)}` : "https://huddle.pet/map";

  const handleNativeShare = async () => {
    if (!alert) return;
    if (socialThreadId) void recordNativeSocialShare(String(socialThreadId));
    await Share.share({
      message: `${alert.title || alert.description || "Huddle map alert"}\n${shareUrl}`,
      title: alert.title || "Huddle map alert",
      url: shareUrl,
    });
  };

  const handleShareToChat = async () => {
    if (!alert || !effectiveUserId || shareSending) return;
    const selectedTarget = shareTargets.find((target) => target.chatId === shareTargetKey) || null;
    if (!selectedTarget?.chatId) {
      setMessage("No chat selected.");
      return;
    }
    setShareSending(true);
    setMessage(null);
    try {
      await handleNativeShare();
      setMessage(`Share sheet opened for ${selectedTarget.label}.`);
      setShareOpen(false);
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

  const revealSensitive = () => {
    setSensitiveRevealed((current) => !current);
    if (!tapHintDismissed) {
      setTapHintDismissed(true);
      void AsyncStorage.setItem(NATIVE_SENSITIVE_TAP_SEEN_KEY, "1");
    }
  };

  if (!alert) return null;
  const color = alertColor(alert.alert_type);

  const scrollDetailMediaToIndex = (index: number) => {
    const next = Math.max(0, Math.min(media.length - 1, index));
    setActiveMediaIndex(next);
    detailMediaRef.current?.scrollTo({ animated: true, x: next * ((mediaSlideWidth || huddleSocial.mediaWidth) + huddleSpacing.x2) });
  };

  const scrollEditMediaToIndex = (index: number) => {
    const next = Math.max(0, Math.min(editImages.length - 1, index));
    setActiveEditMediaIndex(next);
    editMediaRef.current?.scrollTo({ animated: true, x: next * (editMediaSlideWidth + huddleSpacing.x2) });
  };

  return (
    <Modal presentationStyle="overFullScreen" animationType="slide" onRequestClose={onClose} transparent visible={Boolean(alert)}>
      <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={onClose}>
        <Pressable onPress={(event) => event.stopPropagation()} style={styles.bottomSheetBoundary}>
          <AppBottomSheet mode="content">
          <AppBottomSheetHeader>
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
          </AppBottomSheetHeader>
          <AppBottomSheetScroll>

            {alert.title ? <Text style={styles.title}>{alert.title}</Text> : null}
            {alert.description ? <Text style={styles.body}>{alert.description}</Text> : null}

            {media.length > 0 ? (
              <NativeSocialMediaCarousel
                contentWidth={Math.max(1, width - huddleSpacing.x8)}
                isSensitive={alert.is_sensitive}
                items={media}
                onPress={alert.is_sensitive ? revealSensitive : undefined}
              />
            ) : null}

            <View style={styles.creatorRow}>
              <Pressable
                accessibilityLabel="Open creator profile"
                accessibilityRole="button"
                disabled={!alert.creator_id || !onOpenProfile}
                onPress={() => alert.creator_id && onOpenProfile?.(alert.creator_id)}
                style={styles.creatorPressable}
              >
                <View style={styles.creatorAvatar}>
                  {creatorAvatarUrl ? (
                    <RNImage source={{ uri: creatorAvatarUrl }} style={styles.creatorAvatarImage} />
                  ) : (
                    <Text style={styles.creatorInitial}>{alert.creator.display_name?.charAt(0) || "?"}</Text>
                  )}
                </View>
                <Text style={styles.creatorName}>{alert.creator.display_name || t("Anonymous")}</Text>
              </Pressable>
            </View>

            {message ? <Text style={styles.messageText}>{message}</Text> : null}
          </AppBottomSheetScroll>

          <View style={styles.detailFooterShell}>
          <View style={styles.footer}>
            {isSocial && (!alert.is_demo) ? (
              <Pressable accessibilityRole="button" onPress={handleSocial} style={styles.socialLink}>
                <Text style={styles.socialLinkText}>{t("See on Social")}</Text>
              </Pressable>
            ) : <View style={styles.socialSpacer} />}
            <View style={styles.footerActions}>
              <Pressable accessibilityLabel="Support" accessibilityRole="button" onPress={() => void handleSupport()} style={[styles.footerButton, liked ? styles.supportActive : null]}>
                {busy ? <ActivityIndicator color={huddleColors.iconMuted} size="small" /> : <Feather color={liked ? huddleColors.validationRed : huddleColors.iconMuted} name="heart" size={20} />}
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
          </View>
          </AppBottomSheet>
        </Pressable>
      </Pressable>

      <Modal presentationStyle="overFullScreen" animationType="fade" onRequestClose={() => setConfirmRemove(false)} transparent visible={confirmRemove}>
        <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]} onPress={() => setConfirmRemove(false)}>
          <Pressable onPress={(event) => event.stopPropagation()}>
          <AppModalCard>
          <View style={styles.confirmContent}>
            <Text style={styles.confirmTitle}>{t("Remove Broadcast?")}</Text>
            <Text style={styles.confirmBody}>{t("This alert will be removed from the map.")}</Text>
            <AppModalActionRow>
              <AppModalButton variant="secondary" onPress={() => setConfirmRemove(false)}>
                <Text style={styles.confirmCancelText}>{t("Cancel")}</Text>
              </AppModalButton>
              <AppModalButton variant="destructive" onPress={() => void handleDelete()}>
                <Text style={styles.confirmDeleteText}>{t("Remove")}</Text>
              </AppModalButton>
            </AppModalActionRow>
          </View>
          </AppModalCard>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal presentationStyle="overFullScreen" animationType="fade" onRequestClose={() => setConfirmBlock(false)} transparent visible={confirmBlock}>
        <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]} onPress={() => setConfirmBlock(false)}>
          <Pressable onPress={(event) => event.stopPropagation()}>
          <AppModalCard>
          <View style={styles.confirmContent}>
            <Text style={styles.confirmTitle}>{t("Block")} {alert.creator.display_name ?? t("this user")}?</Text>
            <Text style={styles.confirmBody}>{t("You will no longer see their posts or alerts, and they won't be able to interact with you.")}</Text>
            <AppModalActionRow>
              <AppModalButton variant="secondary" onPress={() => setConfirmBlock(false)}>
                <Text style={styles.confirmCancelText}>{t("Cancel")}</Text>
              </AppModalButton>
              <AppModalButton variant="destructive" onPress={() => void confirmBlockUser()}>
                <Text style={styles.confirmDeleteText}>{t("Block")}</Text>
              </AppModalButton>
            </AppModalActionRow>
          </View>
          </AppModalCard>
          </Pressable>
        </Pressable>
      </Modal>

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
            lastLat: null,
            lastLng: null,
            isVerified: false,
            nonSocial: false,
            socialId: alert.creator.social_id,
          },
        } : null}
      />

      <Modal presentationStyle="overFullScreen" animationType="slide" onRequestClose={() => setShareOpen(false)} transparent visible={shareOpen}>
        <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={() => setShareOpen(false)}>
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.bottomSheetBoundary}>
            <AppBottomSheet mode="content">
            <AppBottomSheetHeader>
              <Text style={styles.shareTitle}>{t("Share")}</Text>
              <Pressable accessibilityLabel="Close share" accessibilityRole="button" onPress={() => setShareOpen(false)} style={styles.iconButton}>
                <Feather color={huddleColors.iconMuted} name="x" size={22} />
              </Pressable>
            </AppBottomSheetHeader>
            <View style={styles.shareContent}>
              <View style={styles.shareTargetsBlock}>
                {shareTargetsLoading ? <NativeLoadingState variant="inline" /> : shareTargets.length === 0 ? <Text style={styles.shareEmptyText}>No chats found.</Text> : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shareTargetRow}>
                    {shareTargets.map((target) => {
                      const selected = target.chatId === shareTargetKey;
                      return (
                        <Pressable key={target.chatId} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setShareTargetKey(target.chatId)} style={({ pressed }) => [styles.shareTarget, pressed ? styles.pressed : null]}>
                          <View style={[styles.shareTargetAvatar, selected ? styles.shareTargetAvatarSelected : null]}>
                            {target.avatarUrl ? <RNImage source={{ uri: target.avatarUrl }} style={styles.shareTargetAvatarImage} /> : <Text style={styles.shareTargetInitial}>{target.label.charAt(0).toUpperCase()}</Text>}
                          </View>
                          <Text numberOfLines={1} style={styles.shareTargetName}>{target.label}</Text>
                          <Text numberOfLines={1} style={styles.shareTargetSubtitle}>{target.subtitle || "Chat"}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
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
            </View>
            </AppBottomSheet>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal presentationStyle="overFullScreen" animationType="slide" onRequestClose={() => setEditing(false)} transparent visible={editing}>
        <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={() => setEditing(false)}>
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.bottomSheetBoundary}>
            <AppBottomSheet large>
            <AppBottomSheetHeader>
                <Text style={styles.editHeading}>Edit Alert</Text>
                <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={() => setEditing(false)} style={styles.iconButton}>
                  <Feather color={huddleColors.text} name="x" size={24} />
                </Pressable>
            </AppBottomSheetHeader>
            <AppBottomSheetScroll>
              <View style={styles.editField}>
                <TextInput
                  maxLength={100}
                  onChangeText={setEditTitle}
                  placeholder="Describe the situation"
                  placeholderTextColor={huddleColors.mutedText}
                  style={styles.editInput}
                  value={editTitle}
                />
              </View>
              <View style={[styles.editField, styles.editTextAreaField]}>
                <TextInput
                  maxLength={500}
                  multiline
                  onChangeText={setEditDescription}
                  placeholder="Details help everyone stay connected"
                  placeholderTextColor={huddleColors.mutedText}
                  style={[styles.editInput, styles.editTextArea]}
                  textAlignVertical="top"
                  value={editDescription}
                />
              </View>
              {editImages.length > 0 ? (
                <View style={styles.editMediaBlock}>
                  <ScrollView
                    ref={editMediaRef}
                    horizontal
                    nestedScrollEnabled
                    decelerationRate="fast"
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.mediaRow}
                    scrollEventThrottle={16}
                    onMomentumScrollEnd={(event) => {
                      const stride = editMediaSlideWidth + huddleSpacing.x2;
                      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / stride);
                      setActiveEditMediaIndex(Math.max(0, Math.min(editImages.length - 1, nextIndex)));
                    }}
                  >
                    {editImages.map((image) => (
                      <View key={image.id} style={[styles.editImageFrame, { width: editMediaSlideWidth }]}>
                        <RNImage accessibilityIgnoresInvertColors resizeMode="cover" source={{ uri: image.uri }} style={styles.editImage} />
                        {image.status !== "uploaded" ? (
                          <View style={styles.editImageStatus}>
                            {image.status === "uploading" ? <ActivityIndicator color={huddleColors.onPrimary} size="small" /> : <Feather color={huddleColors.onPrimary} name="alert-triangle" size={16} />}
                          </View>
                        ) : null}
                        <Pressable accessibilityLabel="Remove image" accessibilityRole="button" onPress={() => setEditImages((current) => current.filter((entry) => entry.id !== image.id))} style={styles.mediaRemoveButton}>
                          <Feather color={huddleColors.onPrimary} name="x" size={14} />
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                  {editImages.length > 1 ? (
                    <View style={styles.carouselControls}>
                      <Pressable accessibilityLabel="Previous image" accessibilityRole="button" disabled={activeEditMediaIndex <= 0} onPress={() => scrollEditMediaToIndex(activeEditMediaIndex - 1)} style={({ pressed }) => [styles.carouselButton, activeEditMediaIndex <= 0 ? styles.carouselButtonDisabled : null, pressed ? styles.pressed : null]}>
                        <Feather color={huddleColors.iconSubtle} name="chevron-left" size={huddleSocial.actionIconSize} />
                      </Pressable>
                      {editImages.map((image, index) => (
                        <View key={`${image.id}-dot`} style={[styles.carouselDot, index === activeEditMediaIndex ? styles.carouselDotActive : null]} />
                      ))}
                      <Pressable accessibilityLabel="Next image" accessibilityRole="button" disabled={activeEditMediaIndex >= editImages.length - 1} onPress={() => scrollEditMediaToIndex(activeEditMediaIndex + 1)} style={({ pressed }) => [styles.carouselButton, activeEditMediaIndex >= editImages.length - 1 ? styles.carouselButtonDisabled : null, pressed ? styles.pressed : null]}>
                        <Feather color={huddleColors.iconSubtle} name="chevron-right" size={huddleSocial.actionIconSize} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {message ? <Text style={styles.messageText}>{message}</Text> : null}
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
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: huddleColors.backdrop,
  },
  sheet: {
    maxHeight: "88%",
    overflow: "hidden",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: huddleColors.canvas,
  },
  content: {
    padding: huddleSpacing.x6,
    paddingBottom: huddleSpacing.x4,
  },
  bottomSheetBoundary: {
    width: "100%",
    alignSelf: "stretch",
    justifyContent: "flex-end",
  },
  confirmContent: {
    gap: huddleSpacing.x3,
  },
  headerRow: {
    marginBottom: huddleSpacing.x4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  mediaBlock: {
    marginBottom: huddleSpacing.x4,
  },
  mediaRow: {
    alignItems: "center",
    gap: huddleSpacing.x2,
    paddingRight: huddleSpacing.x4,
  },
  mediaFrame: {
    overflow: "hidden",
    borderRadius: huddleRadii.field,
    backgroundColor: huddleColors.mutedCanvas,
  },
  mediaImageContainBox: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: huddleColors.mutedCanvas,
  },
  mediaImage: {
    width: "100%",
    height: "100%",
    backgroundColor: huddleColors.mutedCanvas,
  },
  mediaFallback: {
    width: "100%",
    height: "100%",
    backgroundColor: huddleColors.mutedCanvas,
  },
  sensitiveOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x1,
    backgroundColor: huddleColors.backdrop,
  },
  sensitiveText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
  carouselControls: {
    marginTop: huddleSpacing.x2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x2,
  },
  carouselButton: {
    width: huddleSocial.carouselButtonSize,
    height: huddleSocial.carouselButtonSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  carouselButtonDisabled: {
    opacity: 0.35,
  },
  carouselDot: {
    width: huddleSocial.carouselDotSize,
    height: huddleSocial.carouselDotSize,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.tabActive,
  },
  carouselDotActive: {
    width: huddleSocial.carouselActiveDotWidth,
    backgroundColor: huddleColors.blue,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.45,
  },
  creatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
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
  detailFooterShell: {
    width: "100%",
    paddingHorizontal: huddleSpacing.x6,
    paddingTop: huddleSpacing.x2,
    paddingBottom: huddleSpacing.x4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: huddleColors.divider,
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
  confirmBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x6,
    backgroundColor: huddleColors.backdrop,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 18,
    padding: huddleSpacing.x6,
    backgroundColor: huddleColors.canvas,
  },
  confirmTitle: {
    marginBottom: huddleSpacing.x2,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  confirmBody: {
    marginBottom: huddleSpacing.x5,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
  },
  confirmActions: {
    flexDirection: "row",
    gap: huddleSpacing.x3,
  },
  confirmCancel: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: huddleColors.mutedCanvas,
  },
  confirmDelete: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: huddleColors.validationRed,
  },
  confirmCancelText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    color: huddleColors.text,
  },
  confirmDeleteText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    color: huddleColors.onPrimary,
  },
  shareBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: huddleColors.backdrop,
  },
  shareSheet: {
    maxHeight: "76%",
    overflow: "hidden",
    borderTopLeftRadius: huddleRadii.modal,
    borderTopRightRadius: huddleRadii.modal,
    backgroundColor: huddleColors.glassOverlay,
    ...huddleShadows.glassElevation2,
  },
  shareDragHandle: {
    alignSelf: "center",
    width: huddleSpacing.x7,
    height: huddleSpacing.x1,
    marginTop: huddleSpacing.x2,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.divider,
  },
  shareHeader: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: huddleSpacing.x6,
  },
  shareTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  shareContent: {
    gap: huddleSpacing.x5,
    paddingHorizontal: huddleSpacing.x6,
    paddingTop: huddleSpacing.x1,
    paddingBottom: huddleSpacing.x8,
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
    gap: huddleSpacing.x3,
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
  editField: {
    minHeight: 52,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    borderRadius: huddleRadii.field,
    paddingHorizontal: huddleSpacing.x4,
    backgroundColor: huddleColors.canvas,
  },
  editTextAreaField: {
    minHeight: 112,
    marginTop: huddleSpacing.x3,
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
  editMediaBlock: {
    marginTop: huddleSpacing.x4,
  },
  editImageFrame: {
    height: 180,
    overflow: "hidden",
    borderRadius: 20,
    backgroundColor: huddleColors.mutedCanvas,
  },
  editImage: {
    width: "100%",
    height: "100%",
  },
  editImageStatus: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.backdrop,
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
  editFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x6,
    paddingTop: huddleSpacing.x3,
    paddingBottom: huddleSpacing.x6,
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
