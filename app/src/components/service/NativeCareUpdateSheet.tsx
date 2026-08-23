import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { CareUpdatePolaroid } from "./CareUpdatePolaroid";
import {
  AppBottomSheet,
  AppBottomSheetFooter,
  AppBottomSheetHeader,
  AppBottomSheetScroll,
  AppKeyboardAvoidingView,
  AppModalCloseButton,
  SlideToConfirm,
} from "../nativeModalPrimitives";
import { nativeModalStyles } from "../nativeModalPrimitives.styles";
import { haptic } from "../../lib/nativeHaptics";
import { getNativeCameraPermissionDetail, launchNativeCameraAsync, requestNativeCameraPermissionDetail } from "../../lib/nativeMediaPermissions";
import { openNativeAppSettings } from "../../lib/nativeLocation";
import {
  careUpdateCopy,
  careUpdateNoteRequired,
  careUpdatePhotoRequired,
  formatCareUpdateStamp,
  submitNativeCareUpdate,
  type CareUpdateKind,
  type SubmitCareUpdateResult,
} from "../../lib/nativeCareUpdates";
import { type NativeSocialComposerMedia } from "../../lib/nativeSocial";
import { nativeSafeErrorCopy } from "../../lib/nativeSafeErrorCopy";
import { huddleCareUpdate, huddleColors, huddleFieldStates, huddleFormFields, huddleGlassControls, huddleLayout, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";

export function NativeCareUpdateSheet({
  accessToken,
  currentUserId,
  onClose,
  onError,
  onSent,
  open,
  ownerName,
  petName,
  petNames,
  serviceChatId,
  sessionKey,
  updateKind,
}: {
  accessToken?: string | null;
  currentUserId: string | null;
  onClose: () => void;
  onError: (message: string) => void;
  onSent: (result: Extract<SubmitCareUpdateResult, { ok: true }>) => void | Promise<void>;
  open: boolean;
  ownerName?: string | null;
  petName?: string | null;
  petNames?: string[] | null;
  serviceChatId: string | null;
  sessionKey?: string | null;
  updateKind: CareUpdateKind;
}) {
  const [media, setMedia] = useState<NativeSocialComposerMedia | null>(null);
  const [capturedAt, setCapturedAt] = useState<Date | null>(null);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [noteFocused, setNoteFocused] = useState(false);
  const [selectedPetLabels, setSelectedPetLabels] = useState<string[]>([]);
  const [slideResetKey, setSlideResetKey] = useState(0);

  const copy = useMemo(() => careUpdateCopy(updateKind), [updateKind]);
  const petOptions = useMemo(() => {
    const names = Array.from(new Set((petNames || []).map((name) => String(name || "").trim()).filter(Boolean)));
    return names;
  }, [petNames]);
  const effectiveSelectedPetLabels = selectedPetLabels.length > 0 ? selectedPetLabels : petOptions[0] ? [petOptions[0]] : [];
  const resolvedPetLabel = effectiveSelectedPetLabels.join(", ") || petName || "";
  const ownerFamilyName = String(ownerName || "").trim() || "Pet";
  const photoRequired = careUpdatePhotoRequired(updateKind);
  const noteRequired = careUpdateNoteRequired(updateKind);
  const stamp = formatCareUpdateStamp(capturedAt || new Date());
  const noteVisible = true;

  const photoShake = useSharedValue(0);
  const noteShake = useSharedValue(0);
  const develop = useSharedValue(0);
  const photoShakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: photoShake.value }] }));
  const noteShakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: noteShake.value }] }));
  const developStyle = useAnimatedStyle(() => ({ opacity: develop.value }));
  const runShake = useCallback((value: typeof photoShake) => {
    value.value = withSequence(
      withTiming(-6, { duration: 45 }),
      withTiming(6, { duration: 45 }),
      withTiming(-4, { duration: 45 }),
      withTiming(4, { duration: 45 }),
      withTiming(0, { duration: 45 }),
    );
  }, []);
  useEffect(() => {
    if (!open) return;
    setMedia(null);
    setCapturedAt(null);
    setNote("");
    setShowNote(false);
    setAttempted(false);
    setUploading(false);
    setNoteFocused(false);
    setSelectedPetLabels([]);
    setSlideResetKey((value) => value + 1);
  }, [open]);

  const applyCapturedPhoto = useCallback((asset: ImagePicker.ImagePickerAsset) => {
    setCapturedAt(new Date());
    setMedia({
      durationSeconds: typeof asset.duration === "number" ? asset.duration / 1000 : null,
      height: asset.height ?? null,
      kind: "image",
      mimeType: asset.mimeType || "image/jpeg",
      name: asset.fileName || `care-update-${Date.now()}.jpg`,
      size: asset.fileSize ?? null,
      uri: asset.uri,
      width: asset.width ?? null,
    });
    // Polaroid "develop": start with a flat tone overlay, then fade it away.
    develop.value = 1;
    develop.value = withTiming(0, { duration: 1100 });
    setSelectedPetLabels((current) => current.length > 0 || !petOptions[0] ? current : [petOptions[0]]);
  }, [develop, petOptions]);

  const togglePetLabel = useCallback((option: string) => {
    setSelectedPetLabels((current) => {
      if (current.includes(option)) {
        const next = current.filter((item) => item !== option);
        return next.length > 0 ? next : [option];
      }
      return [...current, option];
    });
  }, []);

  const openCareCamera = useCallback(async () => {
    let asset: ImagePicker.ImagePickerAsset;
    try {
      const current = await getNativeCameraPermissionDetail();
      if (current.state !== "granted" && !current.canAskAgain) {
        onError("Turn on Camera for huddle in Settings.");
        await openNativeAppSettings();
        return;
      }
      const permission = await requestNativeCameraPermissionDetail();
      if (permission.state !== "granted") {
        onError("Camera access is needed for a live care update.");
        return;
      }
      const result = await launchNativeCameraAsync({
        allowsMultipleSelection: false,
        mediaTypes: ["images"],
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 0.86,
      });
      if (result.canceled || !result.assets[0]) return;
      asset = result.assets[0];
    } catch (error) {
      onError(nativeSafeErrorCopy(error, "Couldn't open your camera. Try again."));
      return;
    }
    haptic.toggleControl();
    applyCapturedPhoto(asset);
  }, [applyCapturedPhoto, onError]);

  const submit = useCallback(async () => {
    setAttempted(true);
    const trimmedNote = note.trim();
    if (photoRequired && !media) {
      haptic.error();
      runShake(photoShake);
      setSlideResetKey((value) => value + 1);
      return;
    }
    if (noteRequired && !trimmedNote) {
      haptic.error();
      setShowNote(true);
      runShake(noteShake);
      setSlideResetKey((value) => value + 1);
      return;
    }
    if (!photoRequired && !noteRequired && !media && !trimmedNote) {
      haptic.error();
      runShake(photoShake);
      setSlideResetKey((value) => value + 1);
      return;
    }
    if (!currentUserId || !serviceChatId) {
      onError("Unable to find this care chat. Please reopen the booking and try again.");
      setSlideResetKey((value) => value + 1);
      return;
    }
    setUploading(true);
    const result = await submitNativeCareUpdate({
      accessToken,
      media,
      note: trimmedNote || null,
      petName: resolvedPetLabel || petName || null,
      serviceChatId,
      sessionKey,
      userId: currentUserId,
    });
    setUploading(false);
    if (!result.ok) {
      haptic.error();
      onError(result.message);
      setSlideResetKey((value) => value + 1);
      return;
    }
    haptic.success();
    await Promise.resolve(onSent(result));
    onClose();
  }, [accessToken, currentUserId, media, note, noteRequired, noteShake, onClose, onError, onSent, petName, photoRequired, photoShake, resolvedPetLabel, runShake, serviceChatId, sessionKey]);

  const photoError = attempted && photoRequired && !media;
  const noteError = attempted && noteRequired && !note.trim();
  const polaroidPreview = media ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Retake photo" onPress={openCareCamera}>
      <Animated.View entering={FadeIn.duration(220)}>
        <CareUpdatePolaroid
          actionOverlay={(
            <>
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.developOverlay, developStyle]} />
              <View style={styles.retakeButtonWrap}>
                <View style={styles.retakeGlassButton}>
                  <Feather color={huddleColors.text} name="camera" size={16} />
                </View>
              </View>
            </>
          )}
          capturedAt={capturedAt || new Date()}
          imageUri={media.uri}
          ownerName={ownerFamilyName}
          petName={resolvedPetLabel || petName}
        />
      </Animated.View>
    </Pressable>
  ) : null;
  const openCareCameraButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={media ? "Retake photo" : "Add a live photo"}
      onPress={openCareCamera}
      style={({ pressed }) => [
        styles.footerImageButton,
        photoRequired && !media ? styles.footerImageButtonRequired : null,
        photoError ? styles.footerImageButtonError : null,
        pressed ? nativeModalStyles.pressed : null,
      ]}
    >
      <Feather color={photoRequired && !media ? huddleColors.onPrimary : huddleColors.blue} name="camera" size={18} />
    </Pressable>
  );
  const photoPreview = (
    <Animated.View style={photoShakeStyle}>
      {media && petOptions.length > 1 ? (
        <Animated.View entering={FadeIn.duration(220)} style={styles.photoSubjectCard}>
          <View style={styles.photoSubjectLeft}>
            <Text style={styles.photoSubjectTitle}>Who is in this photo?</Text>
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.photoSubjectScroll} contentContainerStyle={styles.photoSubjectOptions}>
              {petOptions.map((option) => {
                const selected = effectiveSelectedPetLabels.includes(option);
                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    key={option}
                    onPress={() => togglePetLabel(option)}
                    style={({ pressed }) => [styles.photoSubjectOption, pressed ? nativeModalStyles.pressed : null]}
                  >
                    <View style={[styles.photoSubjectRadio, selected ? styles.photoSubjectRadioSelected : null]}>
                      {selected ? <View style={styles.photoSubjectRadioDot} /> : null}
                    </View>
                    <Text ellipsizeMode="tail" numberOfLines={1} style={styles.photoSubjectOptionText}>{option}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <View style={styles.photoSubjectPolaroid}>{polaroidPreview}</View>
        </Animated.View>
      ) : polaroidPreview}
      {photoError ? <Text style={styles.fieldError}>Add a live photo to continue.</Text> : null}
    </Animated.View>
  );
  const noteAction = (
    <Animated.View style={noteShakeStyle}>
      {noteVisible ? (
        <Animated.View entering={FadeIn.duration(180)}>
          <View style={[styles.noteField, noteFocused ? styles.noteFieldFocused : null, noteError ? styles.noteFieldError : null]}>
            <TextInput
              autoFocus={showNote && !note}
              multiline
              onBlur={() => setNoteFocused(false)}
              onChangeText={setNote}
              onFocus={() => setNoteFocused(true)}
              placeholder={copy.notePlaceholder}
              placeholderTextColor={huddleColors.mutedText}
              scrollEnabled
              style={styles.noteInput}
              textAlignVertical="top"
              value={note}
            />
          </View>
        </Animated.View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a short note"
          onPress={() => setShowNote(true)}
          style={({ pressed }) => [styles.noteIconButton, noteError ? styles.noteIconButtonError : null, pressed ? nativeModalStyles.pressed : null]}
        >
          <Feather color={huddleColors.mutedText} name="edit-3" size={18} />
        </Pressable>
      )}
      {noteError ? <Text style={styles.fieldError}>Add a short note to continue.</Text> : null}
    </Animated.View>
  );

  return (
    <>
    <Modal animationType="slide" transparent visible={open} onRequestClose={onClose}>
      <AppKeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
        style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea, nativeModalStyles.appBottomSheetEventBoundary]}
      >
        <Pressable accessibilityLabel="Close care update sheet" onPress={onClose} style={StyleSheet.absoluteFill} />
        <AppBottomSheet mode="content" onClose={onClose}>
          <AppBottomSheetHeader>
            <View style={styles.titleBlock}>
              <Text style={nativeModalStyles.appModalSheetTitle}>Care Updates</Text>
              <Text style={styles.subtitle}>{copy.sheetSubtitle}</Text>
            </View>
            <AppModalCloseButton onPress={onClose} />
          </AppBottomSheetHeader>

          <AppBottomSheetScroll contentContainerStyle={styles.body}>
            {noteAction}
            {photoPreview}
          </AppBottomSheetScroll>

          <AppBottomSheetFooter>
            <View style={styles.footerRow}>
              {openCareCameraButton}
              <View style={styles.footerSliderWrap}>
                <SlideToConfirm busy={uploading} label="Slide to send update" onCommit={() => void submit()} resetKey={slideResetKey} />
              </View>
            </View>
          </AppBottomSheetFooter>
        </AppBottomSheet>
      </AppKeyboardAvoidingView>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 0,
  },
  subtitle: {
    marginTop: 0,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.mutedText,
  },
  body: {
    gap: huddleSpacing.x3,
    paddingBottom: huddleSpacing.x4,
  },
  retakeButtonWrap: {
    position: "absolute",
    right: huddleSpacing.x2,
    top: huddleSpacing.x2,
  },
  retakeGlassButton: {
    alignItems: "center",
    justifyContent: "center",
    width: huddleCareUpdate.retakeButtonSize,
    height: huddleCareUpdate.retakeButtonSize,
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    borderColor: huddleColors.membershipUpgradeBorder,
    backgroundColor: huddleColors.glassControl,
    ...huddleShadows.photoControl,
  },
  developOverlay: {
    backgroundColor: huddleColors.photoSlotEmptyStart,
  },
  photoSubjectCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x3,
    borderRadius: huddleRadii.card,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.canvas,
    padding: huddleSpacing.x3,
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: huddleFormFields.shadowOpacity,
    shadowRadius: huddleFormFields.shadowRadius,
    shadowOffset: { width: huddleFormFields.shadowOffset, height: huddleFormFields.shadowOffset },
    elevation: 1,
  },
  photoSubjectLeft: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: huddleCareUpdate.subjectLabelMinWidth,
    gap: huddleSpacing.x2,
  },
  photoSubjectPolaroid: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: huddleCareUpdate.polaroidMinWidth,
    alignItems: "stretch",
  },
  photoSubjectTitle: {
    fontFamily: "Urbanist-800",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  photoSubjectScroll: {
    maxHeight: huddleCareUpdate.subjectScrollMaxHeight,
  },
  photoSubjectOptions: {
    gap: huddleSpacing.x2,
  },
  photoSubjectOption: {
    minHeight: huddleCareUpdate.subjectOptionMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  photoSubjectRadio: {
    alignItems: "center",
    justifyContent: "center",
    width: huddleCareUpdate.subjectRadioSize,
    height: huddleCareUpdate.subjectRadioSize,
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.canvas,
  },
  photoSubjectRadioSelected: {
    borderColor: huddleColors.blue,
  },
  photoSubjectRadioDot: {
    width: huddleCareUpdate.subjectRadioDotSize,
    height: huddleCareUpdate.subjectRadioDotSize,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.blue,
  },
  photoSubjectOptionText: {
    flex: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  noteField: {
    height: huddleFormFields.multilineHeight,
    maxHeight: huddleFormFields.multilineHeight,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x2,
    justifyContent: "flex-start",
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: huddleFormFields.shadowOpacity,
    shadowRadius: huddleFormFields.shadowRadius,
    shadowOffset: { width: huddleFormFields.shadowOffset, height: huddleFormFields.shadowOffset },
    elevation: 1,
  },
  noteFieldFocused: {
    ...huddleFieldStates.focused,
  },
  noteFieldError: {
    ...huddleFieldStates.error,
  },
  noteInput: {
    flexShrink: 1,
    minWidth: 0,
    height: huddleFormFields.multilineHeight - huddleSpacing.x2 - 2,
    maxHeight: huddleFormFields.multilineHeight - huddleSpacing.x2 - 2,
    padding: 0,
    fontFamily: "Urbanist-500",
    fontSize: huddleFormFields.valueSize,
    lineHeight: huddleFormFields.valueLine,
    includeFontPadding: false,
    color: huddleColors.text,
    overflow: "hidden",
  },
  fieldError: {
    marginTop: huddleSpacing.x1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.validationRed,
  },
  fieldErrorInline: {
    textAlign: "left",
  },
  footerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleSpacing.x3,
    paddingBottom: huddleSpacing.x1,
  },
  footerSliderWrap: {
    flex: 1,
  },
  footerImageButton: {
    ...huddleGlassControls.borderlessSurface,
    alignItems: "center",
    borderRadius: huddleRadii.pill,
    height: huddleCareUpdate.actionCircleSize,
    justifyContent: "center",
    width: huddleCareUpdate.actionCircleSize,
  },
  footerImageButtonRequired: {
    backgroundColor: huddleColors.blue,
    borderColor: huddleColors.blue,
  },
  footerImageButtonError: {
    borderColor: huddleColors.fieldErrorBorder,
  },
  noteIconButton: {
    alignItems: "center",
    backgroundColor: huddleColors.divider,
    borderColor: huddleColors.fieldBorder,
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    height: huddleCareUpdate.actionCircleSize,
    justifyContent: "center",
    width: huddleCareUpdate.actionCircleSize,
  },
  noteIconButtonError: {
    borderColor: huddleColors.fieldErrorBorder,
  },
});
