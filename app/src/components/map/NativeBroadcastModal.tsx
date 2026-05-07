import { useEffect, useMemo, useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent, type GestureResponderEvent } from "react-native";
import {
  createNativeBroadcastNoMedia,
  getNativeBroadcastPinColor,
  getNativeBroadcastActiveConcurrentLimit,
  NATIVE_BROADCAST_CAPS_BY_TIER,
  NATIVE_BROADCAST_DURATION_STEPS,
  NATIVE_BROADCAST_RANGE_STEPS,
  NATIVE_BROADCAST_ACTIVE_CONCURRENT_CAPS_BY_TIER,
  NATIVE_SUPER_BROADCAST_CAPS,
  normalizeNativeBroadcastAlertType,
  normalizeNativeBroadcastTier,
  uploadNativeBroadcastImage,
  type NativeBroadcastAlertType,
} from "../../lib/nativeBroadcast";
import { lookupNativeMapAddress } from "../../lib/nativeMapMutations";
import type { NativeMapAlert } from "../../lib/nativeMapData";
import { fetchNativeProfileSummary, type NativeProfileSummary } from "../../lib/nativeProfileSummary";
import { useLanguage } from "../../lib/nativeLanguage";
import { supabase } from "../../lib/supabase";
import { huddleColors, huddleFieldStates, huddleFormFields, huddleLayout, huddleMapBroadcastFooter, huddleRadii, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";
import { AppBottomSheet, AppBottomSheetFooter, AppBottomSheetHeader, AppBottomSheetScroll, AppModalCloseButton } from "../nativeModalPrimitives";
import { nativeModalStyles } from "../nativeModalPrimitives.styles";

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
  alertType: NativeBroadcastAlertType;
  centerCoordinate: [number, number];
  mapRestricted?: boolean;
  onAlertTypeChange: (next: NativeBroadcastAlertType) => void;
  onClearLocation: () => void;
  onClose: () => void;
  onCreated: (created?: { alertId: string; threadId: string | null; alert: NativeMapAlert }) => Promise<void> | void;
  onOpenPremium?: () => void;
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

export function NativeBroadcastModal({
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
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [rangeTrackWidth, setRangeTrackWidth] = useState(1);
  const [durationTrackWidth, setDurationTrackWidth] = useState(1);
  const [focusedField, setFocusedField] = useState<"title" | "description" | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ title?: string; description?: string }>({});
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(userId);
  const [creatorProfile, setCreatorProfile] = useState<NativeProfileSummary | null>(null);

  const baseCaps = NATIVE_BROADCAST_CAPS_BY_TIER[tier];
  const capRangeKm = extraBroadcast72h > 0 ? NATIVE_SUPER_BROADCAST_CAPS.radiusKm : baseCaps.radiusKm;
  const capDurationHours = extraBroadcast72h > 0 ? NATIVE_SUPER_BROADCAST_CAPS.durationHours : baseCaps.durationHours;
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
    return row?.is_verified === true || String(row?.verification_status || "").trim().toLowerCase() === "verified";
  };

  useEffect(() => {
    if (userId) {
      setResolvedUserId(userId);
      return undefined;
    }
    if (!visible) return undefined;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setResolvedUserId(data.session?.user.id ?? null);
    }).catch(() => {
      if (active) setResolvedUserId(null);
    });
    return () => {
      active = false;
    };
  }, [userId, visible]);

  useEffect(() => {
    if (!visible) return;
    setErrorText(null);
    if (!effectiveUserId) return;
    void fetchNativeProfileSummary(effectiveUserId, { force: true }).then(({ profile, quota }) => {
      setCreatorProfile(profile);
      const nextTier = normalizeNativeBroadcastTier(String(profile?.effective_tier || profile?.tier || quota?.effective_tier || quota?.tier || "free"));
      const nextIsVerified = isUserVerified(profile);
      const snapshotLimit = coerceQuotaNumber((quota as Record<string, unknown> | null)?.broadcast_active_limit);
      const snapshotUsed = coerceQuotaNumber((quota as Record<string, unknown> | null)?.broadcast_active_used);
      const fallbackLimit = getNativeBroadcastActiveConcurrentLimit(nextTier, nextIsVerified);
      const extra = typeof (quota as Record<string, unknown> | null)?.extra_broadcast_72h === "number"
        ? ((quota as Record<string, unknown>).extra_broadcast_72h as number)
        : 0;
      setTier(nextTier);
      setActiveBroadcastLimit(snapshotLimit > 0 ? snapshotLimit : fallbackLimit);
      setActiveBroadcastUsed(snapshotUsed);
      setExtraBroadcast72h(extra);
      setRangeKm((current) => Math.min(current, NATIVE_BROADCAST_CAPS_BY_TIER[nextTier].radiusKm));
      setDurationHours((current) => Math.min(current, NATIVE_BROADCAST_CAPS_BY_TIER[nextTier].durationHours));
    }).catch(() => undefined);
  }, [effectiveUserId, visible]);

  useEffect(() => {
    if (!visible) return;
    setRangeKm((current) => Math.min(current, capRangeKm));
    setDurationHours((current) => Math.min(current, capDurationHours));
  }, [capDurationHours, capRangeKm, visible]);

  const resetComposer = () => {
    setTitle("");
    setDescription("");
    setMediaFiles([]);
    setPostOnThreads(false);
    setIsSensitive(false);
    setRangeKm(baseCaps.radiusKm);
    setDurationHours(baseCaps.durationHours);
    setErrorText(null);
    setShowUpsell(false);
    setUpsellLocked(false);
  };

  const pickMedia = async () => {
    if (!effectiveUserId || creating) return;
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
    const uploadOne = async (item: NativeBroadcastMedia) => {
      const asset = result.assets.find((candidate) => candidate.uri === item.uri);
      setMediaFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "uploading", error: null } : entry));
      try {
        const uploadedUrl = await uploadNativeBroadcastImage(effectiveUserId, item.uri, asset?.fileName, asset?.mimeType);
        setMediaFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "uploaded", uploadedUrl, error: null } : entry));
      } catch (error) {
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

  const showUpsellOncePerDrag = () => {
    if (upsellLocked) return;
    setUpsellLocked(true);
    setShowUpsell(true);
    setTimeout(() => setUpsellLocked(false), 1000);
  };

  const handleRangeChange = (nextValue: number) => {
    if (nextValue > capRangeKm) {
      setRangeKm(capRangeKm);
      showUpsellOncePerDrag();
      return;
    }
    setRangeKm(nextValue);
  };

  const handleDurationChange = (nextValue: number) => {
    if (nextValue > capDurationHours) {
      setDurationHours(capDurationHours);
      showUpsellOncePerDrag();
      return;
    }
    setDurationHours(nextValue);
  };

  const handleClose = () => {
    if (creating) return;
    onClose();
  };

  const handleCreate = async () => {
    if (!effectiveUserId || !selectedLocation) {
      setErrorText("Pin location first");
      return;
    }
    setValidationErrors({});
    if (mapRestricted) {
      onRestricted?.();
      return;
    }
    if (rangeKm > capRangeKm || durationHours > capDurationHours) {
      setErrorText("Adjust range or duration to continue.");
      return;
    }
    if (!hasActiveBroadcastSlot) {
      setErrorText("All broadcast slots are in use. Wait for one to expire.");
      return;
    }
    if (mediaFiles.some((item) => item.status === "queued" || item.status === "uploading")) {
      setErrorText("Please wait for image upload to finish.");
      return;
    }
    if (mediaFiles.some((item) => item.status === "error")) {
      setErrorText("One or more images failed to upload. Remove them or retry.");
      return;
    }
    const images = mediaFiles.map((item) => item.uploadedUrl).filter((value): value is string => Boolean(value));
    if (images.length !== mediaFiles.length) {
      setErrorText("Some uploaded images are missing. Please reselect them.");
      return;
    }
    setCreating(true);
    setErrorText(null);
    try {
      let resolvedAddress = selectedAddress ?? null;
      if (!resolvedAddress) {
        resolvedAddress = await lookupNativeMapAddress(selectedLocation.lat, selectedLocation.lng);
      }
      const created = await createNativeBroadcastNoMedia({
        address: resolvedAddress,
        alertType,
        description: description || null,
        durationHours,
        images,
        isSensitive,
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
        postOnThreads,
        rangeKm,
        title: title || null,
      });
      const createdAt = new Date().toISOString();
      const createdAlert: NativeMapAlert = {
        id: created.alertId,
        latitude: selectedLocation.lat,
        longitude: selectedLocation.lng,
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
      setActiveBroadcastUsed((current) => current + 1);
      onClose();
    } catch (error) {
      const message = humanBroadcastError(error);
      const normalizedMessage = message.toLowerCase();
      const isCapError = normalizedMessage.includes("active broadcast")
        || normalizedMessage.includes("quota_exceeded")
        || normalizedMessage.includes("active_broadcast_limit_reached")
        || normalizedMessage.includes("slot");
      if (isCapError && effectiveUserId) {
        // Re-fetch snapshot to sync actual active count after race
        void fetchNativeProfileSummary(effectiveUserId, { force: true }).then(({ quota }) => {
          const snapshotLimit = coerceQuotaNumber((quota as Record<string, unknown> | null)?.broadcast_active_limit);
          const snapshotUsed = coerceQuotaNumber((quota as Record<string, unknown> | null)?.broadcast_active_used);
          if (snapshotLimit > 0) setActiveBroadcastLimit(snapshotLimit);
          setActiveBroadcastUsed(snapshotUsed);
        }).catch(() => undefined);
      }
      setErrorText(isCapError
        ? "All broadcast slots are in use. Wait for one to expire."
        : `Broadcast failed: ${message}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal presentationStyle="overFullScreen" animationType="slide" onRequestClose={handleClose} transparent visible={visible}>
      <View style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close broadcast composer" accessibilityRole="button" onPress={handleClose} style={StyleSheet.absoluteFill} />
        <AppBottomSheet large>
          <AppBottomSheetHeader>
            <Text style={styles.title}>{t("Broadcast Alert")}</Text>
            <AppModalCloseButton onPress={handleClose} />
          </AppBottomSheetHeader>
          <AppBottomSheetScroll>
            <View style={styles.topComposerRow}>
              <View style={styles.compoundRow}>
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
            {!selectedLocation ? <Text style={styles.pinHint}>Tap the Pin icon to place your alert.</Text> : null}

            <View style={styles.rangeCard}>
              <View style={styles.quotaChipRow}>
                <Text style={styles.quotaChipText}>Active broadcasts</Text>
                <Text style={styles.quotaChipValue}>
                  {activeBroadcastUsed} / {activeBroadcastLimit}
                </Text>
              </View>
              <SliderControl
                label="Reach"
                onLayout={(event) => setRangeTrackWidth(event.nativeEvent.layout.width)}
                onChange={handleRangeChange}
                suffix="km"
                value={rangeKm}
                values={NATIVE_BROADCAST_RANGE_STEPS}
                width={rangeTrackWidth}
              />
              <SliderControl
                label="Duration"
                onLayout={(event) => setDurationTrackWidth(event.nativeEvent.layout.width)}
                onChange={handleDurationChange}
                suffix="hrs"
                value={durationHours}
                values={NATIVE_BROADCAST_DURATION_STEPS}
                width={durationTrackWidth}
              />
              {activeBroadcastUsed >= activeBroadcastLimit ? (
                <View style={styles.upsellRow}>
                  <Text style={styles.upsellText}>
                    {tier === "gold" ? "All broadcast slots in use. Wait for one to expire." : "More slots available with Plus or Gold."}
                  </Text>
                  {tier !== "gold" ? (
                    <Pressable accessibilityRole="button" onPress={onOpenPremium} style={styles.upsellButton}>
                      <Text style={styles.upsellButtonText}>See plans</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : showUpsell && extraBroadcast72h <= 0 ? (
                <View style={styles.upsellRow}>
                  <Text style={styles.upsellText}>Wider reach & longer duration with Plus or Gold.</Text>
                  <Pressable accessibilityRole="button" onPress={onOpenPremium} style={styles.upsellButton}>
                    <Text style={styles.upsellButtonText}>See plans</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <View style={[styles.field, focusedField === "title" ? styles.inputFocused : null, validationErrors.title ? styles.inputError : null]}>
              <TextInput
                maxLength={100}
                onBlur={() => {
                  setFocusedField(null);
                  setValidationErrors((current) => ({ ...current, title: title.trim() ? "" : current.title }));
                }}
                onChangeText={(nextTitle) => {
                  setTitle(nextTitle);
                  if (nextTitle.trim()) setValidationErrors((current) => ({ ...current, title: "" }));
                }}
                onFocus={() => setFocusedField("title")}
                placeholder={t("Describe the situation")}
                placeholderTextColor={huddleColors.mutedText}
                style={styles.input}
                value={title}
              />
            </View>
            <View style={[styles.field, styles.textArea, focusedField === "description" ? styles.inputFocused : null, validationErrors.description ? styles.inputError : null]}>
              <TextInput
                maxLength={500}
                multiline
                onBlur={() => {
                  setFocusedField(null);
                  setValidationErrors((current) => ({ ...current, description: description.trim() ? "" : current.description }));
                }}
                onChangeText={(nextDescription) => {
                  setDescription(nextDescription);
                  if (nextDescription.trim()) setValidationErrors((current) => ({ ...current, description: "" }));
                }}
                onFocus={() => setFocusedField("description")}
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
                    <Image source={{ uri: item.uri }} style={styles.mediaThumb} />
                    {item.status === "uploading" ? (
                      <View pointerEvents="none" style={styles.mediaUploadingOverlay}>
                        <ActivityIndicator color={huddleColors.onPrimary} size="small" />
                        <Text style={styles.mediaUploadingText}>Uploading {uploadProgress}%</Text>
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
          <View style={styles.footerRow}>
            <Pressable accessibilityLabel="Add image" accessibilityRole="button" onPress={() => void pickMedia()} style={styles.mediaButton}>
              <Feather color={huddleColors.mutedText} name="camera" size={16} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={creating || !selectedLocation || !hasActiveBroadcastSlot}
              onPress={() => void handleCreate()}
              style={[
                styles.createButton,
                { backgroundColor: selectedLocation && !creating && hasActiveBroadcastSlot ? pinColor : huddleColors.mutedCanvas },
              ]}
            >
              {creating ? (
                <ActivityIndicator color={huddleColors.onPrimary} size="small" />
              ) : (
                <>
                  <MaterialCommunityIcons color={selectedLocation && hasActiveBroadcastSlot ? huddleColors.onPrimary : huddleColors.mutedText} name="alert" size={20} />
                  <Text style={[
                    styles.createButtonText,
                    selectedLocation && hasActiveBroadcastSlot ? null : styles.createButtonTextDisabled,
                  ]}>{t(`Broadcast ${alertType} Alert`)}</Text>
                </>
              )}
            </Pressable>
          </View>
          </AppBottomSheetFooter>
        </AppBottomSheet>
      </View>
    </Modal>
  );
}

function SliderControl({
  label,
  onLayout,
  onChange,
  suffix,
  value,
  values,
  width,
}: {
  label: string;
  onLayout: (event: LayoutChangeEvent) => void;
  onChange: (value: number) => void;
  suffix: string;
  value: number;
  values: readonly number[];
  width: number;
}) {
  const currentIndex = Math.max(0, values.indexOf(value));
  const progress = values.length > 1 ? currentIndex / (values.length - 1) : 0;
  const handlePress = (event: GestureResponderEvent) => {
    const x = Math.max(0, Math.min(width, event.nativeEvent.locationX));
    const nextIndex = Math.max(0, Math.min(values.length - 1, Math.round((x / Math.max(width, 1)) * (values.length - 1))));
    onChange(values[nextIndex] ?? value);
  };
  return (
    <View style={styles.sliderBlock}>
      <View style={styles.sliderHeader}>
        <Text style={styles.stepLabel}>{label}</Text>
        <Text style={styles.stepValue}>{value} {suffix}</Text>
      </View>
      <Pressable accessibilityLabel={`${label} slider`} accessibilityRole="adjustable" onLayout={onLayout} onPress={handlePress} style={styles.sliderTrack}>
        <View style={styles.sliderTrackBase} />
        <View style={[styles.sliderFill, { width: `${progress * 100}%` }]} />
        <View style={[styles.sliderThumb, { left: `${progress * 100}%` }]} />
      </Pressable>
    </View>
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
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    paddingHorizontal: huddleSpacing.x3,
    backgroundColor: huddleColors.lime,
  },
  upsellText: {
    flex: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: 16,
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
    paddingHorizontal: huddleMapBroadcastFooter.horizontalPadding,
    paddingTop: huddleMapBroadcastFooter.topPadding,
    paddingBottom: huddleMapBroadcastFooter.bottomPadding,
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
});
