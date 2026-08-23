import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Dimensions, Modal, NativeModules, PanResponder, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { captureRef } from "react-native-view-shot";
import * as MediaLibrary from "expo-media-library";
import huddleWordmark from "../../../assets/huddle-wordmark-white.png";
import { NativeGlassSurface } from "../NativeGlassSurface";
import { huddleColors, huddleShadows, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";
import { haptic } from "../../lib/nativeHaptics";
import { getNativeMediaLibrarySavePermissionDetail, requestNativeMediaLibrarySavePermission } from "../../lib/nativeMediaPermissions";
import { openNativeAppSettings } from "../../lib/nativeLocation";
import { NativeShareCard, type ShareCardData } from "./NativeShareCard";

// Presenter for the shareable card. Standard sheet dim, elevated card, 360°
// fingertip spin with momentum + face-snap, tap-to-flip, and a Save / Share
// action row BELOW the card:
//   Share → captures front + back as two story-format images and hands both to
//           the OS share flow (front first, back queued right after).
//   Save  → writes both images straight to the camera roll.
//
// 3D structure: each face carries ITS OWN animated rotateY (front = θ, back =
// θ+180) with backfaceVisibility hidden — the canonical RN flip; a single
// rotating wrapper shows a mirrored front instead of the back on iOS.

const { width: SCREEN_W } = Dimensions.get("window");

export function NativeShareCardModal({ data, visible, onClose, showActions = true }: {
  data: ShareCardData;
  visible: boolean;
  onClose: () => void;
  showActions?: boolean;
}) {
  const cardWidth = Math.min(310, SCREEN_W - 80);
  const cardHeight = cardWidth * 1.5;

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setReduceMotion(v); });
    return () => { alive = false; };
  }, []);

  const rotY = useRef(-12);
  const rotX = useRef(5);
  const anim = useRef(new Animated.ValueXY({ x: -12, y: 5 })).current;
  const vy = useRef(0);
  const raf = useRef<number | null>(null);
  const flipTarget = useRef<number | null>(null);
  const lastDx = useRef(0);
  const lastDy = useRef(0);
  const lastMoveTs = useRef(0);
  const captureFront = useRef<View>(null);
  const captureBack = useRef<View>(null);
  const [busy, setBusy] = useState<"share" | "save" | null>(null);
  const [savedTick, setSavedTick] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");

  useEffect(() => { if (!visible) setSaveNotice(""); }, [visible]);

  const push = () => anim.setValue({ x: rotY.current, y: rotX.current });

  const tick = () => {
    raf.current = null;
    if (flipTarget.current !== null) {
      rotY.current += (flipTarget.current - rotY.current) * 0.16;
      if (Math.abs(flipTarget.current - rotY.current) < 0.3) { rotY.current = flipTarget.current; flipTarget.current = null; push(); return; }
      push(); raf.current = requestAnimationFrame(tick); return;
    }
    rotY.current += vy.current; vy.current *= 0.95; rotX.current *= 0.92;
    if (Math.abs(vy.current) < 0.08) {
      const t = Math.round(rotY.current / 180) * 180;
      const pose = t + (((t / 180) % 2 === 0) ? -12 : 12);
      rotY.current += (pose - rotY.current) * 0.09;
      if (Math.abs(pose - rotY.current) < 0.1) { rotY.current = pose; push(); return; }
    }
    push(); raf.current = requestAnimationFrame(tick);
  };
  const kick = () => { if (raf.current == null) raf.current = requestAnimationFrame(tick); };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
    onPanResponderGrant: () => {
      vy.current = 0; flipTarget.current = null; lastDx.current = 0; lastDy.current = 0; lastMoveTs.current = performance.now();
      if (raf.current) { cancelAnimationFrame(raf.current); raf.current = null; }
    },
    onPanResponderMove: (_e, g) => {
      // Per-event deltas — cumulative g.dx into an accumulator compounds
      // quadratically (the earlier over-sensitivity bug).
      const now = performance.now();
      const dt = Math.max(1, now - lastMoveTs.current);
      const dx = g.dx - lastDx.current;
      const dy = g.dy - lastDy.current;
      lastDx.current = g.dx; lastDy.current = g.dy; lastMoveTs.current = now;
      rotY.current += dx * 0.55;
      rotX.current = Math.max(-12, Math.min(12, rotX.current - dy * 0.15));
      vy.current = (dx * 0.55) / (dt / 16.7);
      push();
    },
    onPanResponderRelease: (_e, g) => {
      const moved = Math.abs(g.dx) + Math.abs(g.dy);
      if (moved < 8) {
        const cur = ((Math.round(rotY.current / 180)) % 2 + 2) % 2;
        flipTarget.current = Math.round(rotY.current / 180) * 180 + (cur === 0 ? 180 : -180);
        vy.current = 0;
        haptic.reveal();
      }
      if (reduceMotion && flipTarget.current === null) vy.current = 0;
      kick();
    },
  }), [reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  const frontRotate = anim.x.interpolate({ inputRange: [-360, 360], outputRange: ["-360deg", "360deg"] });
  const backRotate = anim.x.interpolate({ inputRange: [-360, 360], outputRange: ["-180deg", "540deg"] });
  const tilt = anim.y.interpolate({ inputRange: [-90, 90], outputRange: ["-90deg", "90deg"] });
  // Belt-and-braces for Android: backfaceVisibility has historically been
  // unreliable there, so each face ALSO snaps to opacity 0 while it faces away
  // (cos θ < 0). The switch happens edge-on, where the card is invisible anyway.
  const frontOpacity = anim.x.interpolate({
    inputRange: [-360, -270.01, -270, -90.01, -90, 89.99, 90, 269.99, 270, 360],
    outputRange: [1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
  });
  const backOpacity = anim.x.interpolate({
    inputRange: [-360, -270.01, -270, -90.01, -90, 89.99, 90, 269.99, 270, 360],
    outputRange: [0, 0, 1, 1, 0, 0, 1, 1, 0, 0],
  });

  const captureBoth = async (): Promise<[string, string]> => {
    // JPEG, not PNG: the story stage has a solid gradient bg (no alpha needed),
    // and a 1080×1920 photo-heavy PNG is ~15 MB each (the 30 MB you saw). JPEG
    // at 0.92 is ~0.6–1 MB with no visible loss.
    const opts = { format: "jpg" as const, quality: 0.92, result: "tmpfile" as const, width: 1080, height: 1920 };
    const front = await captureRef(captureFront, opts);
    const back = await captureRef(captureBack, opts);
    const norm = (u: string) => (u.startsWith("file://") ? u : `file://${u}`);
    return [norm(front), norm(back)];
  };

  const onShare = async () => {
    if (busy) return;
    setBusy("share");
    try {
      const [front, back] = await captureBoth();
      // react-native-share carries BOTH faces in ONE sheet (iOS: two activity
      // items; Android: ACTION_SEND_MULTIPLE) — no double-sheet bounce. The
      // message carries the /share link, which unfurls as a rich card
      // (avatar + name + description) wherever links preview — same pattern
      // as map-alert sharing.
      const message = data.deepLink ? `${data.name} on huddle\n${data.deepLink}` : `${data.name} on huddle`;
      if (NativeModules.RNShare) {
        // Load the optional native package only after confirming that this
        // installed binary contains it. A Metro update must never make the
        // whole app fail at boot when the native shell predates RNShare.
        const { default: nativeShare } = await import("react-native-share") as {
          default: {
          open: (options: { urls: string[]; type: string; message: string; failOnCancel: boolean }) => Promise<unknown>;
          };
        };
        await nativeShare.open({ urls: [front, back], type: "image/jpeg", message, failOnCancel: false });
      } else {
        // The platform share sheet remains available on an older development
        // shell. It shares the front card plus the profile link; Save both
        // continues to preserve both generated faces.
        await Share.share({ message, url: front });
      }
    } catch {
      // sheet dismissed or capture failed — nothing to clean up
    } finally {
      setBusy(null);
    }
  };

  const onSave = async () => {
    if (busy) return;
    setBusy("save");
    setSaveNotice("");
    try {
      const current = await getNativeMediaLibrarySavePermissionDetail();
      if (current.state !== "granted" && !current.canAskAgain) {
        haptic.error();
        setSaveNotice("Turn on Photos for huddle in Settings.");
        await openNativeAppSettings();
        return;
      }
      const permission = await requestNativeMediaLibrarySavePermission();
      if (permission.state !== "granted") {
        setSaveNotice("Photo access is needed to save both images.");
        return;
      }
      const [front, back] = await captureBoth();
      await MediaLibrary.saveToLibraryAsync(front);
      await MediaLibrary.saveToLibraryAsync(back);
      haptic.success();
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1600);
    } catch {
      haptic.error();
    } finally {
      setBusy(null);
    }
  };

  const face = (which: "front" | "back") => (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.face,
        {
          opacity: which === "front" ? frontOpacity : backOpacity,
          transform: [{ perspective: 1350 }, { rotateX: tilt }, { rotateY: which === "front" ? frontRotate : backRotate }],
        },
      ]}
    >
      <NativeShareCard data={data} face={which} spin={anim.x} width={cardWidth} />
    </Animated.View>
  );

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close share card" />

        <View style={styles.stage} pointerEvents="box-none">
          <View {...pan.panHandlers} style={{ width: cardWidth, height: cardHeight }}>
            {face("back")}
            {face("front")}
          </View>

          {/* Save / Share action row below the card */}
          {showActions ? <View style={styles.actions}>
            <Pressable accessibilityLabel="Save card images" onPress={onSave} disabled={busy !== null} style={styles.actionBtn}>
              <NativeGlassSurface style={styles.actionGlass}>
                <Feather color={huddleColors.text} name={savedTick ? "check" : "download"} size={19} />
              </NativeGlassSurface>
              <Text style={styles.actionLabel}>{savedTick ? "Saved ×2" : "Save both"}</Text>
            </Pressable>
            <Pressable accessibilityLabel="Share card" onPress={onShare} disabled={busy !== null} style={styles.actionBtn}>
              <NativeGlassSurface style={styles.actionGlass}>
                <Feather color={huddleColors.text} name="share" size={19} />
              </NativeGlassSurface>
              <Text style={styles.actionLabel}>Share</Text>
            </Pressable>
          </View> : null}
          {saveNotice ? <Text accessibilityLiveRegion="polite" style={styles.permissionNotice}>{saveNotice}</Text> : null}
        </View>

        {/* Off-screen capture: each face centered on a branded 9:16 story stage. */}
        <View style={styles.captureHost} pointerEvents="none">
          <View ref={captureFront} collapsable={false} style={styles.captureStage}>
            <LinearGradient colors={["#101B4D", "#06091C"]} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={StyleSheet.absoluteFill} />
            <NativeShareCard data={data} face="front" width={300} />
            <View style={styles.captureFoot}><Animated.Image source={huddleWordmark} resizeMode="contain" style={styles.captureWordmark} /></View>
          </View>
          <View ref={captureBack} collapsable={false} style={styles.captureStage}>
            <LinearGradient colors={["#101B4D", "#06091C"]} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={StyleSheet.absoluteFill} />
            <NativeShareCard data={data} face="back" width={300} />
            <View style={styles.captureFoot}><Animated.Image source={huddleWordmark} resizeMode="contain" style={styles.captureWordmark} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Same dim as the app's standard modal/sheet backdrop.
  backdrop: { flex: 1, backgroundColor: huddleColors.backdrop, alignItems: "center", justifyContent: "center" },
  stage: { alignItems: "center", justifyContent: "center" },
  face: {
    borderRadius: 22,
    backfaceVisibility: "hidden",
    shadowColor: "#010414", shadowOpacity: 0.5, shadowRadius: 46, shadowOffset: { width: 0, height: 30 }, elevation: 20,
  },
  actions: { flexDirection: "row", gap: 28, marginTop: 26, alignItems: "flex-start" },
  actionBtn: { alignItems: "center", gap: 6 },
  actionGlass: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: huddleColors.glassBorder, ...huddleShadows.glassElevation1 },
  actionLabel: { fontFamily: "Urbanist-700", fontSize: 12, lineHeight: 16, color: huddleColors.canvas },
  permissionNotice: { color: huddleColors.canvas, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, marginTop: huddleSpacing.x2, textAlign: "center" },
  // 1×1 clip window, NOT off-screen coordinates: Android's view-shot can
  // return blank images for views translated off-screen, but a view that is
  // attached, laid out, and merely CLIPPED by an ancestor still draws its own
  // full canvas during capture. Works identically on iOS.
  captureHost: { position: "absolute", top: 0, left: 0, width: 1, height: 1, overflow: "hidden" },
  captureStage: { width: 360, height: 640, alignItems: "center", justifyContent: "center" },
  captureFoot: { position: "absolute", bottom: 26, left: 0, right: 0, alignItems: "center" },
  captureWordmark: { width: 84, height: 20, opacity: 0.85 },
});
