import { Feather } from "@expo/vector-icons";
import { BlurView as RNBlurView } from "@react-native-community/blur";
import { Image as ExpoImage } from "expo-image";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { Image as RNImage, Modal, Pressable, StyleSheet, Text, View, type DimensionValue } from "react-native";
import { captureRef } from "react-native-view-shot";
import { raceWithTimeoutFallback } from "../../lib/nativeAsyncRace";
import { formatCareUpdateStamp } from "../../lib/nativeCareUpdates";
import { haptic } from "../../lib/nativeHaptics";
import { huddleButtons, huddleCareUpdate, huddleColors, huddlePolaroid, huddleRadii, huddleShadows, huddleSpacing } from "../../theme/huddleDesignTokens";
import { NativePolaroidCard, nativePolaroidStyles } from "../NativePolaroidCard";
import { AppConfirmModal } from "../nativeModalPrimitives";
import { nativeModalStyles } from "../nativeModalPrimitives.styles";
import { getNativeMediaLibrarySavePermissionDetail, requestNativeMediaLibrarySavePermission } from "../../lib/nativeMediaPermissions";
import { NativeZoomableMedia } from "../social/NativeSocialFeedPrimitives";
import { openNativeAppSettings } from "../../lib/nativeLocation";
import huddleStampLogo from "../../../assets/huddle-coral-shadow.png";

export const careUpdateCaptionLabels = (petName?: string | null, ownerName?: string | null) => {
  const labels = String(petName || "")
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
  // Product rule: three or more selected pets are intentionally summarized as
  // two centered caption lines, e.g. "Kurio’s" / "pet family".
  if (labels.length > 2) {
    const owner = String(ownerName || "").trim() || "Pet";
    return [`${owner}’s`, "pet family"];
  }
  return labels.length > 0 ? labels : ["Care update"];
};

export function CareUpdatePolaroid({
  actionOverlay,
  capturedAt,
  imageUri,
  includeLogo = false,
  ownerName,
  petName,
  width,
}: {
  actionOverlay?: ReactNode;
  capturedAt?: Date | string | null;
  imageUri: string | null;
  includeLogo?: boolean;
  ownerName?: string | null;
  petName?: string | null;
  width?: DimensionValue;
}) {
  const captionLabels = useMemo(() => careUpdateCaptionLabels(petName, ownerName), [ownerName, petName]);
  const stamp = formatCareUpdateStamp(capturedAt || new Date());

  return (
    <View style={[styles.previewWrap, width ? { width } : null]}>
      <NativePolaroidCard
        captionAlign="center"
        captionPrimary={captionLabels.join(" ") || "Care update"}
        captionPrimaryLines={captionLabels}
        captionSecondary={(
          <View style={styles.previewCaptionSecondaryWrap}>
            <Text numberOfLines={1} style={styles.previewCaptionSecondaryToken}>{stamp}</Text>
          </View>
        )}
        photo={imageUri ? (
          <ExpoImage accessibilityIgnoresInvertColors contentFit="cover" source={{ uri: imageUri }} style={nativePolaroidStyles.photo} />
        ) : (
          <View style={nativePolaroidStyles.photoPlaceholder}>
            <Feather color={huddleColors.iconSubtle} name="image" size={30} />
          </View>
        )}
        photoOverlay={(
          <>
            {includeLogo ? (
              <View pointerEvents="none" style={styles.logoBadge}>
                <RNImage accessibilityIgnoresInvertColors resizeMode="contain" source={huddleStampLogo} style={styles.logoImage} />
              </View>
            ) : null}
            {actionOverlay}
          </>
        )}
      />
    </View>
  );
}

export function CareUpdateDetailPolaroid({
  capturedAt,
  imageUri,
  includeLogo = false,
  ownerName,
  petName,
}: {
  capturedAt?: Date | string | null;
  imageUri: string | null;
  includeLogo?: boolean;
  ownerName?: string | null;
  petName?: string | null;
}) {
  const captionLabels = useMemo(() => careUpdateCaptionLabels(petName, ownerName), [ownerName, petName]);
  const stamp = formatCareUpdateStamp(capturedAt || new Date());
  const captionPrimary = captionLabels.join(" ") || "Care update";

  return (
    <NativePolaroidCard
      captionPrimary={captionPrimary}
      captionPrimaryLines={captionLabels}
      captionSecondary={(
        <View style={nativePolaroidStyles.captionSecondaryWrapDetail}>
          <Text numberOfLines={1} style={nativePolaroidStyles.captionSecondaryTokenDetail}>{stamp}</Text>
        </View>
      )}
      photo={imageUri ? (
        <ExpoImage accessibilityIgnoresInvertColors contentFit="cover" source={{ uri: imageUri }} style={nativePolaroidStyles.photo} />
      ) : (
        <View style={nativePolaroidStyles.photoPlaceholder}>
          <Feather color={huddleColors.iconSubtle} name="image" size={34} />
        </View>
      )}
      photoOverlay={includeLogo ? (
        <View pointerEvents="none" style={styles.detailLogoBadge}>
          <RNImage accessibilityIgnoresInvertColors resizeMode="contain" source={huddleStampLogo} style={styles.logoImage} />
        </View>
      ) : null}
      variant="detail"
    />
  );
}

export function CareUpdatePolaroidViewer({
  capturedAt,
  imageUri,
  onClose,
  onSaved,
  open,
  ownerName,
  petName,
}: {
  capturedAt?: Date | string | null;
  imageUri: string | null;
  onClose: () => void;
  onSaved?: (message: string) => void;
  open: boolean;
  ownerName?: string | null;
  petName?: string | null;
}) {
  const [saving, setSaving] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const exportRef = useRef<View>(null);

  const saveImage = async () => {
    if (saving || !imageUri) return;
    setSaving(true);
    try {
      const MediaLibrary = await import("expo-media-library");
      const current = await getNativeMediaLibrarySavePermissionDetail();
      if (current.state !== "granted" && !current.canAskAgain) {
        haptic.error();
        onSaved?.("Turn on Photos for huddle in Settings.");
        await openNativeAppSettings();
        return;
      }
      const permission = await requestNativeMediaLibrarySavePermission();
      if (permission.state !== "granted") {
        haptic.error();
        onSaved?.("Photo access is needed to save this polaroid.");
        return;
      }
      const uri = await raceWithTimeoutFallback(
        captureRef(exportRef, { format: "png", quality: 1, result: "tmpfile" }),
        "",
        5000,
      );
      if (!uri) throw new Error("capture_timeout");
      await MediaLibrary.saveToLibraryAsync(uri);
      haptic.success();
      onSaved?.("Saved to Photos");
      onClose();
    } catch {
      haptic.error();
      onSaved?.("Couldn't save this polaroid. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={open}>
      <View style={styles.viewerBackdrop}>
        <RNBlurView blurAmount={18} blurType="light" pointerEvents="none" style={StyleSheet.absoluteFill} />
        <Pressable accessibilityLabel="Close polaroid viewer" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.viewerContent}>
          <NativeZoomableMedia onLongPress={() => setSaveConfirmOpen(true)} onZoomChange={() => undefined}>
            <View ref={exportRef} collapsable={false} style={styles.viewerExportFrame}>
              <CareUpdateDetailPolaroid capturedAt={capturedAt} imageUri={imageUri} includeLogo ownerName={ownerName} petName={petName} />
            </View>
          </NativeZoomableMedia>
          <Pressable accessibilityRole="button" disabled={saving || !imageUri} onPress={() => setSaveConfirmOpen(true)} style={({ pressed }) => [styles.viewerMenu, pressed ? nativeModalStyles.pressed : null]}>
            <Feather color={huddleColors.blue} name="download" size={18} />
            <Text style={styles.viewerMenuText}>{saving ? "Saving..." : "Save image"}</Text>
          </Pressable>
        </View>
        <AppConfirmModal
          body="Save this image to your photo library?"
          confirmLabel="Save Image"
          loading={saving}
          onCancel={() => { if (!saving) setSaveConfirmOpen(false); }}
          onConfirm={() => void saveImage()}
          open={saveConfirmOpen}
          title="Save image"
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  previewWrap: {
    width: "100%",
    alignSelf: "center",
    alignItems: "center",
  },
  previewPolaroid: {
    width: "100%",
    overflow: "hidden",
    borderRadius: huddlePolaroid.frame.radius,
    backgroundColor: huddlePolaroid.frame.backgroundColor,
    ...huddleShadows.polaroidFrame,
  },
  previewPhoto: {
    position: "relative",
    width: "90%",
    aspectRatio: 1.13,
    alignSelf: "center",
    marginTop: "5%",
    overflow: "hidden",
    borderRadius: huddlePolaroid.photo.radius,
    borderWidth: 1,
    borderColor: huddleColors.cardBorderSoft,
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.canvas,
  },
  previewCaption: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "24%",
    paddingHorizontal: huddleCareUpdate.polaroidCaptionPadding,
  },
  previewPetName: {
    width: "100%",
    fontFamily: "Georgia",
    fontStyle: "italic",
    fontWeight: "700",
    fontSize: huddlePolaroid.caption.nameSize,
    lineHeight: huddlePolaroid.caption.nameLine,
    color: huddleColors.text,
    textAlign: "center",
  },
  previewStamp: {
    width: "100%",
    fontFamily: "Urbanist-500",
    fontSize: huddlePolaroid.caption.serviceSize,
    lineHeight: huddlePolaroid.caption.serviceLine,
    color: huddleColors.mutedText,
    textAlign: "center",
  },
  logoBadge: {
    position: "absolute",
    right: huddleSpacing.x3,
    bottom: huddleSpacing.x3,
  },
  logoImage: {
    width: huddleCareUpdate.stampLogoWidth,
    height: huddleCareUpdate.stampLogoHeight,
  },
  detailLogoBadge: {
    position: "absolute",
    right: huddleSpacing.x3,
    bottom: huddleSpacing.x3,
  },
  previewCaptionSecondaryWrap: {
    width: "100%",
    minHeight: huddlePolaroid.caption.serviceLine,
    alignItems: "center",
    justifyContent: "center",
  },
  previewCaptionSecondaryToken: {
    fontFamily: "Urbanist-500",
    fontSize: huddlePolaroid.caption.serviceSize,
    lineHeight: huddlePolaroid.caption.serviceLine,
    color: huddleColors.text,
    textAlign: "center",
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: huddleColors.chatEditScrim,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x6,
  },
  viewerContent: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
  },
  viewerExportFrame: {
    width: "100%",
    paddingTop: huddleSpacing.x1,
    paddingHorizontal: huddleSpacing.x3,
  },
  viewerMenu: {
    marginTop: huddleSpacing.x3,
    minHeight: 46,
    paddingHorizontal: huddleSpacing.x4,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.canvas,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x2,
    ...huddleShadows.photoControl,
  },
  viewerMenuText: {
    ...huddleButtons.label,
    color: huddleColors.blue,
  },
});
