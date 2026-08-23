import { Feather } from "@expo/vector-icons";
import { BlurView as RNBlurView } from "@react-native-community/blur";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { captureRef } from "react-native-view-shot";
import { CareUpdateDetailPolaroid, CareUpdatePolaroid, CareUpdatePolaroidViewer } from "./CareUpdatePolaroid";
import { raceWithTimeoutFallback } from "../../lib/nativeAsyncRace";
import { formatCareUpdateStamp } from "../../lib/nativeCareUpdates";
import { haptic } from "../../lib/nativeHaptics";
import { getCachedSignedStorageUrl } from "../../lib/nativeStorageUrlCache";
import { huddleCareUpdate, huddleColors, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";
import { nativeModalStyles } from "../nativeModalPrimitives.styles";
import { getNativeMediaLibrarySavePermissionDetail, requestNativeMediaLibrarySavePermission } from "../../lib/nativeMediaPermissions";
import { openNativeAppSettings } from "../../lib/nativeLocation";

type CareEvidenceDescriptor = { bucket?: string; path?: string };

const parsePhotoDescriptor = (value?: string | null): CareEvidenceDescriptor | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as CareEvidenceDescriptor;
    if (parsed && typeof parsed.path === "string" && parsed.path) return parsed;
  } catch {
    // Older or malformed payloads may store a bare URL — fall through.
    if (/^https?:\/\//i.test(value)) return { path: value };
  }
  return null;
};

export function ServiceCareUpdateCard({
  align = "start",
  animateIn = false,
  capturedAt,
  note,
  onSaved,
  ownerName,
  petName,
  photoDescriptor,
}: {
  align?: "start" | "end";
  animateIn?: boolean;
  capturedAt?: string | null;
  note?: string | null;
  onSaved?: (message: string) => void;
  ownerName?: string | null;
  petName?: string | null;
  photoDescriptor?: string | null;
}) {
  const descriptor = useMemo(() => parsePhotoDescriptor(photoDescriptor), [photoDescriptor]);
  const [signedUri, setSignedUri] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const actionExportRef = useRef<View>(null);

  useEffect(() => {
    let cancelled = false;
    if (!descriptor?.path) {
      setSignedUri(null);
      return;
    }
    if (/^https?:\/\//i.test(descriptor.path)) {
      setSignedUri(descriptor.path);
      return;
    }
    void getCachedSignedStorageUrl(descriptor.bucket || "service_care_evidence", descriptor.path, 60 * 60 * 24 * 7)
      .then((url) => { if (!cancelled) setSignedUri(url); })
      .catch(() => { if (!cancelled) setSignedUri(null); });
    return () => { cancelled = true; };
  }, [descriptor?.bucket, descriptor?.path]);

  const stamp = formatCareUpdateStamp(capturedAt);
  const trimmedNote = (note || "").trim();
  const hasPhoto = Boolean(descriptor?.path);
  const mine = align === "end";
  const Container = animateIn ? Animated.View : View;
  const containerProps = animateIn ? { entering: FadeInDown.springify().damping(16).stiffness(150) } : {};
  const saveFocusedPolaroid = async () => {
    if (saving || !signedUri) return;
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
        captureRef(actionExportRef, { format: "png", quality: 1, result: "tmpfile" }),
        "",
        5000,
      );
      if (!uri) throw new Error("capture_timeout");
      await MediaLibrary.saveToLibraryAsync(uri);
      haptic.success();
      onSaved?.("Saved to Photos");
      setActionsOpen(false);
    } catch {
      haptic.error();
      onSaved?.("Couldn't save this polaroid. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!hasPhoto) {
    return (
      <Container {...containerProps} style={[styles.wrap, mine ? styles.wrapEnd : styles.wrapStart]}>
        <View style={[styles.noteBubble, mine ? styles.noteBubbleMine : styles.noteBubbleTheirs]}>
          <Text style={styles.noteText}>{trimmedNote || "Care update"}</Text>
        </View>
        {stamp ? <Text style={[styles.noteStamp, mine ? styles.noteStampMine : styles.noteStampTheirs]}>{stamp}</Text> : null}
      </Container>
    );
  }

  return (
    <Container {...containerProps} style={[styles.wrap, mine ? styles.wrapEnd : styles.wrapStart]}>
      <View style={styles.mediaStack}>
        <Pressable
          accessibilityHint="Tap to enlarge. Hold for image actions."
          accessibilityLabel={`Care update for ${petName || "the pet"}`}
          accessibilityRole="button"
          delayLongPress={350}
          disabled={!signedUri}
          onLongPress={() => {
            haptic.toggleControl();
            setActionsOpen(true);
          }}
          onPress={() => setViewerOpen(true)}
          style={({ pressed }) => [styles.card, pressed && signedUri ? styles.cardPressed : null]}
        >
          <CareUpdatePolaroid capturedAt={capturedAt} imageUri={signedUri} ownerName={ownerName} petName={petName} width="100%" />
        </Pressable>
        {trimmedNote ? (
          <View style={[styles.noteBubble, mine ? styles.noteBubbleMine : styles.noteBubbleTheirs]}>
            <Text style={styles.noteText}>{trimmedNote}</Text>
          </View>
        ) : null}
      </View>
      <CareUpdatePolaroidViewer
        capturedAt={capturedAt}
        imageUri={signedUri}
        onClose={() => setViewerOpen(false)}
        onSaved={onSaved}
        open={viewerOpen}
        ownerName={ownerName}
        petName={petName}
      />
      <Modal animationType="fade" onRequestClose={() => setActionsOpen(false)} transparent visible={actionsOpen}>
        <View style={styles.focusBackdrop}>
          <RNBlurView blurAmount={18} blurType="light" pointerEvents="none" style={StyleSheet.absoluteFill} />
          <Pressable accessibilityLabel="Close image actions" onPress={() => setActionsOpen(false)} style={StyleSheet.absoluteFill} />
          <View style={styles.focusContent}>
            <View ref={actionExportRef} collapsable={false} style={styles.focusExportFrame}>
              <CareUpdateDetailPolaroid capturedAt={capturedAt} imageUri={signedUri} includeLogo ownerName={ownerName} petName={petName} />
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={saving || !signedUri}
              onPress={() => void saveFocusedPolaroid()}
              style={({ pressed }) => [styles.actionMenu, pressed ? nativeModalStyles.pressed : null]}
            >
              <Feather color={huddleColors.blue} name="download" size={18} />
              <Text style={styles.actionMenuText}>{saving ? "Saving..." : "Save image"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Container>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    marginBottom: huddleSpacing.x2,
  },
  wrapStart: {
    alignItems: "flex-start",
  },
  wrapEnd: {
    alignItems: "flex-end",
  },
  mediaStack: {
    width: huddleCareUpdate.polaroidWidth,
    gap: huddleSpacing.x1,
  },
  card: {
    width: "100%",
  },
  cardPressed: {
    opacity: 0.85,
  },
  summaryCard: {
    maxWidth: 264,
    backgroundColor: huddleColors.canvas,
    borderRadius: huddleRadii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: huddleColors.photoBorder,
    paddingVertical: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x4,
    ...huddleShadows.photoControl,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
  },
  summaryName: {
    flexShrink: 1,
    fontFamily: "Georgia",
    fontStyle: "italic",
    fontWeight: "700",
    fontSize: 16,
    lineHeight: 20,
    color: huddleColors.text,
  },
  summaryStamp: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.mutedText,
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: huddleColors.divider,
    marginVertical: huddleSpacing.x2,
  },
  summaryBody: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: 21,
    color: huddleColors.text,
  },
  noteBubble: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    paddingVertical: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x3,
    borderRadius: huddleRadii.card,
  },
  noteBubbleTheirs: {
    backgroundColor: huddleColors.coral,
    borderTopLeftRadius: huddleSpacing.x1,
  },
  noteBubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: huddleColors.membershipUpgradePlus,
    borderTopRightRadius: huddleSpacing.x1,
  },
  noteText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
  noteStamp: {
    marginTop: huddleSpacing.x1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.mutedText,
  },
  noteStampTheirs: {
    alignSelf: "flex-start",
  },
  noteStampMine: {
    alignSelf: "flex-end",
  },
  focusBackdrop: {
    flex: 1,
    backgroundColor: huddleColors.chatEditScrim,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x6,
  },
  focusContent: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
  },
  focusExportFrame: {
    width: "100%",
    paddingTop: huddleSpacing.x1,
    paddingHorizontal: huddleSpacing.x3,
  },
  actionMenu: {
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
  actionMenuText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.blue,
  },
});
