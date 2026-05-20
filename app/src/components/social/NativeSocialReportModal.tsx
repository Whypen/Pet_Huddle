import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ImageStyle } from "react-native";
import { AppBottomSheet, AppBottomSheetFooter, AppBottomSheetHeader, AppBottomSheetScroll, AppModalCloseButton, SlideToConfirm } from "../nativeModalPrimitives";
import { nativeModalStyles } from "../nativeModalPrimitives.styles";
import { useShakeAnimation } from "../../lib/nativeAnimations";
import { haptic } from "../../lib/nativeHaptics";
import { NativeFormTextField } from "../NativeFormField";
import {
  areNativeSocialUsersBlocked,
  cleanupNativeSocialStorageImages,
  reportNativeSocialUser,
  uploadNativeSocialImage,
  type NativeSocialAuthor,
  type NativeSocialComposerMedia,
} from "../../lib/nativeSocial";
import { createNativeProtectedActionError, getNativeProtectedActionResult, logNativeProtectedActionFailure, type NativeProtectedActionCleanupResult } from "../../lib/nativeStorageCleanup";
import {
  huddleColors,
  huddleFieldStates,
  huddleMapBroadcastFooter,
  huddleRadii,
  huddleSpacing,
  huddleType,
} from "../../theme/huddleDesignTokens";
import {
  NATIVE_SOCIAL_REPORT_CATEGORIES,
  NATIVE_SOCIAL_REPORT_COPY,
  NATIVE_SOCIAL_REPORT_MAX_ATTACHMENTS,
  NATIVE_SOCIAL_REPORT_SOURCE,
  NATIVE_SOCIAL_REPORT_SOURCE_ORIGIN,
  nativeSocialReportTokens,
  type NativeReportSource,
  type NativeReportSourceOrigin,
} from "./nativeSocialReportConfig";

type NativeSocialReportTarget = {
  author: NativeSocialAuthor;
  userId: string;
};

type NativeReportInputField = "details" | "other";

const toggleSetValue = (set: Set<string>, value: string) => {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
};

export function NativeSocialReportModal({
  accessToken,
  currentUserId,
  chatRoomId,
  onClose,
  onNotice,
  onSubmitFailure,
  onSubmitStart,
  onSubmitSuccess,
  open,
  source = NATIVE_SOCIAL_REPORT_SOURCE,
  sourceOrigin = NATIVE_SOCIAL_REPORT_SOURCE_ORIGIN,
  target,
}: {
  accessToken?: string | null;
  currentUserId: string | null;
  chatRoomId?: string | null;
  onClose: () => void;
  onNotice: (message: string) => void;
  onSubmitFailure?: () => Promise<void> | void;
  onSubmitStart?: () => Promise<void> | void;
  onSubmitSuccess?: () => Promise<void> | void;
  open: boolean;
  source?: NativeReportSource;
  sourceOrigin?: NativeReportSourceOrigin;
  target: NativeSocialReportTarget | null;
}) {
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState("");
  const [otherText, setOtherText] = useState("");
  const [uploads, setUploads] = useState<NativeSocialComposerMedia[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [reportShakeAnim, triggerReportShake] = useShakeAnimation();
  // Broadcast-style: slide always enabled; on commit, validate; if invalid, mark category error + scroll to top + reset slider + shake
  const [categoryError, setCategoryError] = useState(false);
  const [reportSliderResetKey, setReportSliderResetKey] = useState(0);
  const reportScrollRef = useRef<ScrollView | null>(null);
  const fieldOffsetsRef = useRef<Record<NativeReportInputField, number>>({ details: 0, other: 0 });
  const lastFocusedFieldRef = useRef<NativeReportInputField | null>(null);

  useEffect(() => {
    if (!open) {
      setCategories(new Set());
      setDetails("");
      setOtherText("");
      setUploads([]);
      lastFocusedFieldRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !currentUserId || !target?.userId) return;
    let active = true;
    void areNativeSocialUsersBlocked(currentUserId, target.userId, accessToken).then((blocked) => {
      if (!active || !blocked) return;
      onNotice(NATIVE_SOCIAL_REPORT_COPY.blocked);
      onClose();
    });
    return () => {
      active = false;
    };
  }, [currentUserId, onClose, onNotice, open, target?.userId]);

  const pickImages = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      orderedSelection: true,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 0.86,
      selectionLimit: Math.max(1, NATIVE_SOCIAL_REPORT_MAX_ATTACHMENTS - uploads.length),
    });
    if (result.canceled) return;
    const incoming: NativeSocialComposerMedia[] = result.assets.map((asset) => ({
      durationSeconds: null,
      height: asset.height,
      kind: "image",
      mimeType: asset.mimeType,
      name: asset.fileName,
      size: asset.fileSize,
      uri: asset.uri,
      width: asset.width,
    }));
    setUploads((current) => [...current, ...incoming].slice(0, NATIVE_SOCIAL_REPORT_MAX_ATTACHMENTS));
  }, [uploads.length]);

  const scrollFieldIntoView = useCallback((field: NativeReportInputField) => {
    lastFocusedFieldRef.current = field;
    const scroll = () => {
      reportScrollRef.current?.scrollTo({
        y: Math.max(0, fieldOffsetsRef.current[field] - huddleSpacing.x3),
        animated: true,
      });
    };
    requestAnimationFrame(scroll);
    setTimeout(scroll, 220);
  }, []);

  const submit = useCallback(async () => {
    if (!currentUserId) {
      onNotice(NATIVE_SOCIAL_REPORT_COPY.missingAuth);
      return;
    }
    if (!target?.userId) {
      onNotice(NATIVE_SOCIAL_REPORT_COPY.missingTarget);
      return;
    }
    if (submitting) return;
    if (categories.size === 0) {
      setCategoryError(true);
      haptic.error();
      triggerReportShake();
      setReportSliderResetKey((current) => current + 1);
      onNotice(NATIVE_SOCIAL_REPORT_COPY.selectReason);
      reportScrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setSubmitting(true);
    const uploadedAttachmentUrls: string[] = [];
    try {
      await onSubmitStart?.();
      const attachmentUrls: string[] = [];
      for (const media of uploads) {
        const uploadedUrl = await uploadNativeSocialImage(currentUserId, media, "report", accessToken);
        uploadedAttachmentUrls.push(uploadedUrl);
        attachmentUrls.push(uploadedUrl);
      }
      await reportNativeSocialUser({
        accessToken,
        attachmentUrls,
        categories: Array.from(categories),
        details: details.trim() || null,
        other: categories.has("Others") ? otherText.trim() : "",
        chatRoomId: chatRoomId ?? null,
        reporterId: currentUserId,
        source,
        sourceOrigin,
        targetName: target.author.displayName || target.author.socialId,
        targetUserId: target.userId,
      });
      await onSubmitSuccess?.();
      onNotice(NATIVE_SOCIAL_REPORT_COPY.success);
      onClose();
    } catch (error) {
      if (currentUserId && uploadedAttachmentUrls.length > 0) {
        const cleanupResult: NativeProtectedActionCleanupResult = await cleanupNativeSocialStorageImages(uploadedAttachmentUrls, currentUserId, accessToken, "social_report_orphan_upload").catch(() => "failed" as const);
        logNativeProtectedActionFailure("[native.socialReport] orphan_cleanup", createNativeProtectedActionError({
          ok: false,
          stage: getNativeProtectedActionResult(error)?.stage || "domain_save",
          originalError: getNativeProtectedActionResult(error)?.originalError || error,
          cleanupAttempted: true,
          cleanupResult,
        }));
      }
      logNativeProtectedActionFailure("[native.socialReport] submit_failed", error);
      await onSubmitFailure?.();
      onNotice(NATIVE_SOCIAL_REPORT_COPY.missingTarget);
    } finally {
      setSubmitting(false);
    }
  }, [accessToken, categories, chatRoomId, currentUserId, details, onClose, onNotice, onSubmitFailure, onSubmitStart, onSubmitSuccess, otherText, source, sourceOrigin, submitting, target, triggerReportShake, uploads]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="overFullScreen" transparent visible={open}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <AppBottomSheet mode="autoMax" onClose={onClose}>
          <AppBottomSheetHeader>
            <View style={styles.sheetTitleBlock}>
              <Text style={styles.sheetTitle}>{NATIVE_SOCIAL_REPORT_COPY.title}</Text>
              <Text style={styles.reportIntro}>{NATIVE_SOCIAL_REPORT_COPY.intro}</Text>
            </View>
            <AppModalCloseButton onPress={onClose} />
          </AppBottomSheetHeader>
          <AppBottomSheetScroll contentContainerStyle={styles.sheetContent} scrollRef={reportScrollRef}>
            {categoryError ? (
              <Text style={styles.categoryErrorText}>{NATIVE_SOCIAL_REPORT_COPY.selectReason}</Text>
            ) : null}
            {NATIVE_SOCIAL_REPORT_CATEGORIES.map((category) => (
              <Pressable
                key={category}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: categories.has(category) }}
                onPress={() => {
                  setCategories((current) => toggleSetValue(current, category));
                  if (categoryError) setCategoryError(false);
                }}
                style={({ pressed }) => [styles.reportCategoryRow, categoryError ? styles.reportCategoryRowError : null, pressed ? styles.pressed : null]}
              >
                <View style={[styles.checkboxBox, categories.has(category) ? styles.checkboxBoxActive : null]}>{categories.has(category) ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}</View>
                <Text style={styles.reportCategoryText}>{category}</Text>
              </Pressable>
            ))}
            {categories.has("Others") ? (
              <View
                onLayout={(event) => {
                  fieldOffsetsRef.current.other = event.nativeEvent.layout.y;
                }}
              >
                <NativeFormTextField
                  accessibilityLabel={NATIVE_SOCIAL_REPORT_COPY.otherPlaceholder}
                  label=""
                  onChangeText={setOtherText}
                  onFocus={() => scrollFieldIntoView("other")}
                  placeholder={NATIVE_SOCIAL_REPORT_COPY.otherPlaceholder}
                  value={otherText}
                />
              </View>
            ) : null}
            <View
              onLayout={(event) => {
                fieldOffsetsRef.current.details = event.nativeEvent.layout.y;
              }}
            >
              <NativeFormTextField
                accessibilityLabel={NATIVE_SOCIAL_REPORT_COPY.detailsLabel}
                label=""
                multiline
                onChangeText={setDetails}
                onFocus={() => scrollFieldIntoView("details")}
                placeholder={NATIVE_SOCIAL_REPORT_COPY.addDetailsPlaceholder}
                value={details}
              />
            </View>
            {uploads.length > 0 ? (
              <View style={styles.uploadGrid}>
                {uploads.map((upload, index) => (
                  <View key={`${upload.uri}-${index}`} style={styles.uploadPreview}>
                    <Image accessibilityLabel={`${NATIVE_SOCIAL_REPORT_COPY.uploadAltPrefix} ${index + 1}`} accessibilityIgnoresInvertColors source={{ uri: upload.uri }} style={styles.uploadPreviewImage as ImageStyle} />
                  </View>
                ))}
              </View>
            ) : null}
          </AppBottomSheetScroll>
          <AppBottomSheetFooter>
            <View style={styles.reportFooterRow}>
              <Pressable accessibilityLabel={NATIVE_SOCIAL_REPORT_COPY.imagePickerLabel} accessibilityRole="button" onPress={pickImages} style={({ pressed }) => [styles.imageButton, pressed ? styles.pressed : null]}>
                <Feather color={huddleColors.mutedText} name="camera" size={16} />
              </Pressable>
              <Animated.View style={{ flex: 1, transform: [{ translateX: reportShakeAnim }] }}>
                <SlideToConfirm
                  busy={submitting}
                  label="Slide to Report"
                  onCommit={submit}
                  resetKey={reportSliderResetKey}
                  tone="destructive"
                />
              </Animated.View>
            </View>
          </AppBottomSheetFooter>
        </AppBottomSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  checkboxBox: {
    alignItems: "center",
    backgroundColor: huddleColors.canvas,
    borderColor: huddleColors.fieldBorderStrong,
    borderRadius: nativeSocialReportTokens.checkboxBorderRadius,
    borderWidth: 1,
    height: nativeSocialReportTokens.checkboxSize,
    justifyContent: "center",
    width: nativeSocialReportTokens.checkboxSize,
  },
  checkboxBoxActive: {
    backgroundColor: huddleColors.blue,
    borderColor: huddleColors.blue,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.76,
  },
  reportCategoryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: nativeSocialReportTokens.categoryGap,
    minHeight: nativeSocialReportTokens.categoryMinHeight,
  },
  reportCategoryRowError: {
    ...huddleFieldStates.error,
    borderRadius: 8,
    paddingHorizontal: 6,
    backgroundColor: huddleColors.validationSoft,
  },
  categoryErrorText: {
    color: huddleColors.validationRed,
    fontFamily: "Urbanist-600",
    fontSize: 13,
    marginBottom: 4,
  },
  reportCategoryText: {
    color: nativeSocialReportTokens.categoryTextColor,
    flex: 1,
    fontFamily: nativeSocialReportTokens.categoryTextFamily,
    fontSize: nativeSocialReportTokens.categoryTextSize,
    lineHeight: nativeSocialReportTokens.categoryTextLineHeight,
  },
  reportIntro: {
    color: nativeSocialReportTokens.introColor,
    fontFamily: nativeSocialReportTokens.introFamily,
    fontSize: nativeSocialReportTokens.introSize,
    lineHeight: nativeSocialReportTokens.introLineHeight,
  },
  sheetContent: {
    gap: nativeSocialReportTokens.contentGap,
  },
  sheetTitle: {
    color: nativeSocialReportTokens.titleColor,
    fontFamily: nativeSocialReportTokens.titleFamily,
    fontSize: nativeSocialReportTokens.titleSize,
    lineHeight: nativeSocialReportTokens.titleLineHeight,
  },
  sheetTitleBlock: {
    flex: 1,
    gap: huddleSpacing.x1,
    paddingVertical: huddleSpacing.x2,
  },
  reportFooterRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleMapBroadcastFooter.gap,
  },
  imageButton: {
    alignItems: "center",
    borderColor: huddleMapBroadcastFooter.cameraButtonBorderColor,
    borderRadius: huddleMapBroadcastFooter.cameraButtonSize / 2,
    borderWidth: 1,
    backgroundColor: huddleMapBroadcastFooter.cameraButtonBackground,
    height: huddleMapBroadcastFooter.cameraButtonSize,
    justifyContent: "center",
    width: huddleMapBroadcastFooter.cameraButtonSize,
  },
  uploadGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: nativeSocialReportTokens.attachmentGridGap,
    marginTop: huddleSpacing.x3,
  },
  uploadPreview: {
    backgroundColor: huddleColors.mutedCanvas,
    borderRadius: nativeSocialReportTokens.attachmentRadius,
    height: nativeSocialReportTokens.attachmentPreviewSize,
    overflow: "hidden",
    width: nativeSocialReportTokens.attachmentPreviewSize,
  },
  uploadPreviewImage: {
    height: "100%",
    width: "100%",
  },
});
