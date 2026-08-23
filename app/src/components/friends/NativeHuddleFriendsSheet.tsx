import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, type BarcodeSettings } from "expo-camera";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, KeyboardAvoidingView, Modal, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import QRCode from "react-native-qrcode-svg";
import { AppBottomSheet, AppBottomSheetHeader, AppBottomSheetScroll, AppModalButton, AppModalCloseButton } from "../nativeModalPrimitives";
import { NativeSpinner } from "../NativeSpinner";
import { NativeToast } from "../NativeToast";
import { NativeProfileAvatar } from "../NativeProfileAvatar";
import { NativeContactFriendRequests } from "../chat/NativeContactFriendRequests";
import { NativeContactFriendsPanel } from "../contacts/NativeContactFriendsSheet";
import { createNativeAddFriendInviteToken, getOrCreateNativeAddCode, redeemNativeAddCode, redeemNativeAddFriendInviteToken, rotateNativeAddCode, fetchNativeMatchedRailSummary, type NativeAddCodeResult, type NativeMatchedRailSummary } from "../../lib/nativeChat";
import { haptic } from "../../lib/nativeHaptics";
import { isNativeVerifiedProfile } from "../../lib/nativeVerificationGate";
import { normalizeNativeProfilePhotoPresentationCrop } from "../../lib/nativeProfilePhotos";
import { openNativeAppSettings } from "../../lib/nativeLocation";
import { nativePathForHuddleWebPath } from "../../lib/nativeInternalLinks";
import type { NativeProfileSummary as NativeProfile } from "../../lib/nativeProfileSummary";
import { huddleButtons, huddleColors, huddleLayout, huddleRadii, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";

export type NativeHuddleFriendsSegment = "code" | "scan" | "friends";

const SEGMENTS: Array<{ key: NativeHuddleFriendsSegment; label: string }> = [
  { key: "code", label: "My code" },
  { key: "scan", label: "Scan" },
  { key: "friends", label: "Friends" },
];

// Module scope on purpose. An inline object here is a new identity every render,
// and CameraView reconfigures the capture session when it changes -- which reads
// as the preview blinking, with Fig capture errors behind it.
const QR_SCANNER_SETTINGS: BarcodeSettings = { barcodeTypes: ["qr"] };

const normalizeHuddleCode = (value: string) => String(value || "").replace(/\D/g, "").slice(0, 6);
const formatHuddleCode = (value: string) => normalizeHuddleCode(value).replace(/(\d{3})(\d{0,3})/, (_, left, right) => right ? `${left} ${right}` : left);

// An invite link is tapped, never typed, so "that code looks wrong" is the wrong
// story for the same underlying error.
const addFriendErrorCopy = (error: unknown, source: "code" | "invite" = "code") => {
  const message = String((error as Error)?.message || error || "");
  if (message.includes("rate_limited")) return "Too many tries. Wait a moment.";
  if (message.includes("request_pending")) return "You've already sent a request.";
  if (message.includes("incoming_request_exists")) return "They've already asked you. Check your requests.";
  if (message.includes("self_code")) return source === "invite" ? "That's your own invite link." : "That's your own code.";
  if (message.includes("blocked")) return "This person can't be added.";
  if (message.includes("already")) return "You're already connected.";
  if (message.includes("invalid")) return source === "invite" ? "This invite link has expired or was already used." : "That code doesn't look right.";
  if (message.includes("target_unavailable")) return source === "invite" ? "This invite is no longer available." : "That code is no longer available.";
  if (message.includes("actor_unavailable")) return "Your account is restricted. Contact support.";
  if (message.includes("not_authenticated") || message.includes("missing_access_token")) return "Please sign in again.";
  return "Something went wrong. Try again.";
};

export function NativeHuddleFriendsSheet({
  accessToken,
  currentProfile,
  currentUserId,
  initialCode,
  initialInviteToken,
  initialSegment = "code",
  isOpen,
  onClose,
  onDiscoveryChanged,
  onNeedsPhoneVerification,
  onOpenChatRoom,
  onOpenPeerChat,
  onOpenPeerProfile,
  openNonce,
}: {
  accessToken?: string | null;
  currentProfile: NativeProfile | null;
  currentUserId: string | null;
  initialCode?: string;
  initialInviteToken?: string;
  initialSegment?: NativeHuddleFriendsSegment;
  isOpen: boolean;
  onClose: () => void;
  onDiscoveryChanged: (enabled: boolean) => void;
  onNeedsPhoneVerification: () => void;
  onOpenChatRoom: (roomId: string, peerUserId: string) => void;
  onOpenPeerChat: (peer: NativeMatchedRailSummary) => void;
  onOpenPeerProfile: (peer: NativeMatchedRailSummary) => void;
  openNonce?: number;
}) {
  const [segment, setSegment] = useState<NativeHuddleFriendsSegment>(initialSegment);
  const [codeState, setCodeState] = useState<NativeAddCodeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"rotate" | "share" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [requestingCamera, setRequestingCamera] = useState(false);
  const [toast, setToast] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  const unknownCodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [peers, setPeers] = useState<NativeMatchedRailSummary[]>([]);
  const [requestsRefreshKey, setRequestsRefreshKey] = useState(0);
  const lastScannedRef = useRef("");
  const codeFlash = useSharedValue(0);

  const displayName = currentProfile?.display_name || "Your profile";

  const loadCode = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCodeState(await getOrCreateNativeAddCode({ accessToken }));
    } catch {
      setError("Couldn't load your code. Try again.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!isOpen) {
      setNotice("");
      setError("");
      setToast("");
      setBusy(null);
      setRedeeming(false);
      setScannerOpen(false);
      lastScannedRef.current = "";
      return;
    }
    setSegment(initialSegment);
    setCode(normalizeHuddleCode(initialCode || ""));
    void loadCode();
    // A single-use token is already proof the inviter shared it, so opening the
    // link is the acceptance: connect straight away instead of asking again.
    const invite = String(initialInviteToken || "");
    if (!invite) return;
    setRedeeming(true);
    void redeemNativeAddFriendInviteToken(invite, { accessToken })
      .then((result) => {
        haptic.success();
        if (result.alreadyMatched) setNotice("You're already connected.");
        else setToast("You're now friends.");
        setSegment("friends");
      })
      .catch((nextError: unknown) => {
        haptic.error();
        setError(addFriendErrorCopy(nextError, "invite"));
      })
      .finally(() => setRedeeming(false));
  }, [accessToken, initialCode, initialInviteToken, initialSegment, isOpen, loadCode, openNonce]);

  const loadPeers = useCallback(async () => {
    try {
      setPeers(await fetchNativeMatchedRailSummary({ accessToken, userId: currentUserId }));
    } catch {
      setPeers([]);
    }
  }, [accessToken, currentUserId]);

  useEffect(() => {
    if (!isOpen || segment !== "friends") return;
    void loadPeers();
  }, [isOpen, loadPeers, segment]);

  // A redrawn QR looks identical to a human, so the digits carry the proof that
  // a refresh actually happened.
  const flashCode = useCallback(() => {
    codeFlash.value = withSequence(withTiming(1, { duration: 160 }), withTiming(0, { duration: 520 }));
  }, [codeFlash]);

  const codeFlashStyle = useAnimatedStyle(() => ({
    backgroundColor: codeFlash.value > 0 ? huddleColors.primarySoftFill : "transparent",
    opacity: 0.55 + (codeFlash.value * 0.45),
  }));

  const rotateCode = useCallback(async () => {
    setBusy("rotate");
    setNotice("");
    setError("");
    try {
      setCodeState(await rotateNativeAddCode({ accessToken }));
      haptic.success();
      flashCode();
      setNotice("New code ready.");
    } catch {
      haptic.error();
      setError("Couldn't make a new code. Try again.");
    } finally {
      setBusy(null);
    }
  }, [accessToken, flashCode]);

  const confirmRotate = useCallback(() => {
    Alert.alert(
      "Create a new code?",
      "Your old code will stop working.",
      [
        { style: "cancel", text: "Cancel" },
        { onPress: () => void rotateCode(), style: "destructive", text: "Create new code" },
      ],
    );
  }, [rotateCode]);

  const copyCode = useCallback(async () => {
    if (!codeState?.code) return;
    await Clipboard.setStringAsync(formatHuddleCode(codeState.code));
    haptic.success();
    setNotice("Code copied.");
  }, [codeState?.code]);

  const shareCode = useCallback(async () => {
    if (!codeState?.code) return;
    setBusy("share");
    setNotice("");
    try {
      // Each share mints its own single-use link, so a forwarded invite cannot
      // be reused by a third person. Falls back to the code link if minting fails.
      const link = await createNativeAddFriendInviteToken({ accessToken })
        .then((result) => result.deepLink)
        .catch(() => codeState.deepLink);
      // iOS appends `url` itself, so the link stays out of the iOS message body.
      const message = "I'm on huddle — tap to add me.";
      await Share.share({
        title: "Add me on huddle",
        message: Platform.OS === "ios" ? message : `${message}\n${link}`,
        url: link,
      });
    } catch {
      setError("Couldn't open sharing. Try again.");
    } finally {
      setBusy(null);
    }
  }, [accessToken, codeState?.code, codeState?.deepLink]);

  const redeem = useCallback(async (nextCode = code) => {
    const cleanCode = normalizeHuddleCode(nextCode);
    setCode(cleanCode);
    setNotice("");
    setError("");
    if (cleanCode.length !== 6) {
      setError("Enter all 6 digits.");
      return;
    }
    setRedeeming(true);
    try {
      const result = await redeemNativeAddCode(cleanCode, { accessToken, userId: currentUserId });
      if (result.alreadyMatched) {
        // Already friends is a fact, not a failure. Red text and an error buzz
        // scold someone for scanning a friend's code.
        setNotice("You're already connected.");
        return;
      }
      haptic.success();
      // Sending a request is the one thing here that changes state, so it is the
      // one thing that earns a toast. Everything else stays as helper text.
      setToast("Request sent.");
    } catch (nextError) {
      haptic.error();
      // A failed attempt must not poison the scanner: without this the same QR
      // can never be read again for the life of the sheet.
      lastScannedRef.current = "";
      setError(addFriendErrorCopy(nextError));
    } finally {
      setRedeeming(false);
    }
  }, [accessToken, code, currentUserId]);

  // The Scan tab IS the camera. Asking someone to tap a placeholder to reach a
  // viewfinder they already chose is a wasted step.
  const openScanner = useCallback(async () => {
    if (permission?.granted) {
      setScannerOpen(true);
      return;
    }
    if (permission?.canAskAgain === false) return;
    setRequestingCamera(true);
    try {
      const next = await requestPermission();
      if (next.granted) setScannerOpen(true);
    } finally {
      setRequestingCamera(false);
    }
  }, [permission?.canAskAgain, permission?.granted, requestPermission]);

  // Held in a ref so a new permission object cannot re-fire the effect below.
  const openScannerRef = useRef(openScanner);
  openScannerRef.current = openScanner;

  useEffect(() => {
    // Keep the camera mounted only while its own tab is visible.
    if (!isOpen || segment !== "scan") {
      setScannerOpen(false);
      return;
    }
    void openScannerRef.current();
  }, [isOpen, segment]);

  useEffect(() => {
    // Granting access in Settings leaves the app suspended; without this the user
    // returns to the same blocked screen they just fixed.
    if (!isOpen || segment !== "scan") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void openScannerRef.current();
    });
    return () => subscription.remove();
  }, [isOpen, segment]);

  // redeem() changes identity whenever `code` does. Reading it through a ref keeps
  // handleBarcode stable, so CameraView never sees a new onBarcodeScanned.
  const redeemRef = useRef(redeem);
  redeemRef.current = redeem;

  const handleBarcode = useCallback((event: { data?: string }) => {
    const raw = String(event.data || "").trim();
    // Only a real huddle code counts. Stripping digits out of any payload used to
    // turn an unrelated QR into a six-digit "code" and fire a request at whoever
    // happened to own it.
    const parsed = (() => {
      if (/^\d{6}$/.test(raw)) return raw;
      const nativePath = nativePathForHuddleWebPath(raw);
      if (!nativePath || !nativePath.startsWith("/add-friend")) return "";
      const value = new URLSearchParams(nativePath.split("?")[1] || "").get("code") || "";
      return /^\d{6}$/.test(value) ? value : "";
    })();
    if (!parsed) {
      // Say something, but only once the user has clearly been holding a wrong
      // code up to the lens rather than sweeping past one.
      if (unknownCodeTimerRef.current) return;
      unknownCodeTimerRef.current = setTimeout(() => {
        unknownCodeTimerRef.current = null;
        setError("That's not a huddle code.");
      }, 1500);
      return;
    }
    if (unknownCodeTimerRef.current) {
      clearTimeout(unknownCodeTimerRef.current);
      unknownCodeTimerRef.current = null;
    }
    if (lastScannedRef.current === parsed) return;
    lastScannedRef.current = parsed;
    // The camera stays live: people scan a group of friends in a row, not one.
    // A light tick lands the moment the code reads, before the network answers.
    haptic.selectTab();
    setCode(parsed);
    void redeemRef.current(parsed);
  }, []);

  useEffect(() => () => {
    if (unknownCodeTimerRef.current) clearTimeout(unknownCodeTimerRef.current);
  }, []);

  const avatarCrop = useMemo(
    () => normalizeNativeProfilePhotoPresentationCrop((currentProfile?.photos as Record<string, unknown> | null)?.avatar_presentation),
    [currentProfile?.photos],
  );

  if (!isOpen) return null;

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={styles.backdrop}>
        {/* Dismiss layer sits BEHIND the sheet, so sheet taps never need to stop
            propagation, and the sheet's parent keeps a definite height for
            AppBottomSheet's percentage maxHeight to resolve against. */}
        <Pressable accessibilityLabel="Close huddle friends" onPress={onClose} style={StyleSheet.absoluteFill} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetDock}>
        <AppBottomSheet mode="autoMax" onClose={onClose} swipeToCloseArea="header">
          {/* AppBottomSheetHeader is already a row with space-between; wrapping
              another row inside it collapsed to content width and stacked. */}
          <AppBottomSheetHeader>
            <Text style={styles.title}>huddle friends</Text>
            <AppModalCloseButton onPress={onClose} />
          </AppBottomSheetHeader>
          <AppBottomSheetScroll>

          <View style={styles.segmentTrack}>
            {SEGMENTS.map((item) => (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: segment === item.key }}
                key={item.key}
                onPress={() => { setSegment(item.key); setNotice(""); setError(""); }}
                style={[styles.segment, segment === item.key && styles.segmentActive]}
              >
                <Text style={[styles.segmentLabel, segment === item.key && styles.segmentLabelActive]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>

          {segment === "code" ? (
            loading ? (
              <View style={styles.loading}><NativeSpinner tone="primary" /></View>
            ) : codeState?.code ? (
              <>
                {/* One tinted panel holds the code and its actions. A white card
                    on a white sheet reads as a stray shadow, not a surface. */}
                <View style={styles.codePanel}>
                  <Pressable
                    accessibilityLabel="Create a new huddle code"
                    disabled={Boolean(busy)}
                    onPress={confirmRotate}
                    style={({ pressed }) => [styles.refresh, pressed && huddleButtons.pressed]}
                  >
                    {busy === "rotate" ? <NativeSpinner tone="primary" /> : <Feather color={huddleColors.iconSubtle} name="refresh-cw" size={16} />}
                  </Pressable>

                  <View style={styles.qrFrame}>
                    <QRCode ecl="H" value={codeState.deepLink || codeState.code} size={168} backgroundColor="transparent" color={huddleColors.text} />
                    <View style={styles.qrAvatar}>
                      <NativeProfileAvatar
                        name={displayName}
                        presentationCrop={avatarCrop}
                        ringWidth={0}
                        size={42}
                        uri={currentProfile?.avatar_url}
                        userId={currentProfile?.id}
                        verified={isNativeVerifiedProfile(currentProfile)}
                        version={currentProfile?.updated_at}
                      />
                    </View>
                  </View>

                  <Pressable
                    accessibilityLabel="Copy huddle code"
                    onPress={() => void copyCode()}
                    style={({ pressed }) => [styles.codeRow, pressed && huddleButtons.pressed]}
                  >
                    <Animated.View style={[styles.codeFlash, codeFlashStyle]} />
                    <Text selectable style={styles.codeText}>{formatHuddleCode(codeState.code)}</Text>
                    <Feather color={huddleColors.iconSubtle} name="copy" size={14} />
                  </Pressable>
                </View>

                {notice ? <Text style={styles.notice}>{notice}</Text> : null}
                {error ? <Text style={styles.error}>{error}</Text> : null}

                <View style={styles.cta}>
                  <AppModalButton accessibilityLabel="Share code" disabled={Boolean(busy)} loading={busy === "share"} onPress={() => void shareCode()}>Share code</AppModalButton>
                </View>
              </>
            ) : null
          ) : null}

          {segment === "scan" ? (
            <>
              {/* Permission decides the copy; scannerOpen only decides whether the
                  camera is mounted. Reading the blocked state off scannerOpen showed
                  a Settings prompt while permission was still loading, and again on
                  every successful scan. */}
              {scannerOpen && permission?.granted ? (
                <View style={styles.viewfinder}>
                  <CameraView barcodeScannerSettings={QR_SCANNER_SETTINGS} onBarcodeScanned={handleBarcode} style={StyleSheet.absoluteFill} />
                  <View pointerEvents="none" style={styles.viewfinderReticle} />
                  {redeeming ? (
                    <View pointerEvents="none" style={styles.viewfinderBusy}><NativeSpinner tone="primary" /></View>
                  ) : null}
                </View>
              ) : !permission || requestingCamera || permission.granted ? (
                // Loading, asking, or granted-but-not-yet-mounted. Same frame as the
                // live viewfinder so granting access does not resize the sheet under
                // the user's thumb, and so an approved camera never flashes a prompt.
                <View style={styles.viewfinder}><NativeSpinner tone="primary" /></View>
              ) : permission?.canAskAgain === false ? (
                <View style={styles.viewfinderBlocked}>
                  <Feather color={huddleColors.mutedText} name="camera-off" size={22} />
                  <Text style={styles.viewfinderBlockedText}>Turn on Camera for huddle in Settings.</Text>
                  <Pressable onPress={() => void openNativeAppSettings()} style={({ pressed }) => [pressed && huddleButtons.pressed]}>
                    <Text style={styles.viewfinderBlockedAction}>Open Settings</Text>
                  </Pressable>
                </View>
              ) : (
                // Denied but still askable: iOS will not re-prompt on its own, so
                // give them the ask rather than sending them to Settings for nothing.
                <View style={styles.viewfinderBlocked}>
                  <Feather color={huddleColors.mutedText} name="camera-off" size={22} />
                  <Text style={styles.viewfinderBlockedText}>Allow camera to scan a code.</Text>
                  <Pressable onPress={() => void openScanner()} style={({ pressed }) => [pressed && huddleButtons.pressed]}>
                    <Text style={styles.viewfinderBlockedAction}>Allow camera</Text>
                  </Pressable>
                </View>
              )}

              {notice ? <Text style={styles.notice}>{notice}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Text style={styles.scanDivider}>or enter their code</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  multiline={false}
                  scrollEnabled
                  numberOfLines={1}
                  lineBreakModeIOS="tail"
                  lineBreakStrategyIOS="none"
                  textBreakStrategy="simple"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="number-pad"
                  maxLength={7}
                  onChangeText={(value) => setCode(normalizeHuddleCode(value))}
                  onSubmitEditing={() => void redeem()}
                  placeholder="123 456"
                  placeholderTextColor={huddleColors.mutedText}
                  returnKeyType="done"
                  style={styles.input}
                  value={formatHuddleCode(code)}
                />
              </View>
              <View style={styles.cta}>
                <AppModalButton accessibilityLabel="Send request" disabled={redeeming} loading={redeeming} onPress={() => void redeem()}>Send request</AppModalButton>
              </View>
            </>
          ) : null}

          {segment === "friends" ? (
            <>
              <View style={styles.friendsFixed}>
                <NativeContactFriendsPanel
                  accessToken={accessToken}
                  active
                  defaultCountry={currentProfile?.location_country}
                  discoverableInitially={currentProfile?.contact_discovery_enabled === true}
                  onDiscoveryChanged={onDiscoveryChanged}
                  onInvite={() => void shareCode()}
                  onNeedsPhoneVerification={onNeedsPhoneVerification}
                  userId={currentUserId}
                />
                <NativeContactFriendRequests
                  accessToken={accessToken}
                  active
                  onAccepted={() => {
                    setRequestsRefreshKey((value) => value + 1);
                    void loadPeers();
                  }}
                  onError={(message) => setError(message)}
                  refreshKey={requestsRefreshKey}
                  userId={currentUserId}
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
              </View>
              {peers.length > 0 ? (
                <>
                  <Text style={styles.sectionLabel}>{`All friends · ${peers.length}`}</Text>
                  {/* The sheet itself scrolls (AppBottomSheetScroll), so this stays a
                      plain View: a nested vertical ScrollView would fight that gesture. */}
                  <View>
                    {peers.map((peer) => (
                      <Pressable
                        accessibilityLabel={`Message ${peer.displayName || "friend"}`}
                        key={peer.peerUserId}
                        onPress={() => onOpenPeerChat(peer)}
                        style={({ pressed }) => [styles.peerRow, pressed && styles.peerRowPressed]}
                      >
                        <Pressable
                          accessibilityLabel={`Open ${peer.displayName || "friend"} profile`}
                          onPress={() => onOpenPeerProfile(peer)}
                          style={({ pressed }) => [pressed && huddleButtons.pressed]}
                        >
                          <NativeProfileAvatar name={peer.displayName} ringWidth={0} size={36} uri={peer.avatarUrl} userId={peer.peerUserId} verified={peer.isVerified} />
                        </Pressable>
                        <View style={styles.peerCopy}>
                          <Text numberOfLines={1} style={styles.peerName}>{peer.displayName || "Someone"}</Text>
                          {peer.socialId ? <Text numberOfLines={1} style={styles.peerHandle}>{`@${String(peer.socialId).replace(/^@/, "")}`}</Text> : null}
                        </View>
                        <Feather color={huddleColors.iconSubtle} name="message-circle" size={17} />
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
            </>
          ) : null}

          </AppBottomSheetScroll>
        </AppBottomSheet>
        </KeyboardAvoidingView>
      </View>

      {/* Only outcomes that actually changed something float. Everything else is
          helper text beside the control that caused it. */}
      {toast ? <NativeToast message={toast} onDismiss={() => setToast("")} /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: huddleColors.backdrop, justifyContent: "flex-end" },
  sheetDock: { flex: 1, justifyContent: "flex-end" },
  title: { color: huddleColors.text, fontFamily: "Urbanist-700", fontSize: huddleType.h4, lineHeight: huddleType.h4Line },
  segmentTrack: {
    backgroundColor: huddleColors.mutedCanvas,
    borderRadius: huddleRadii.pill,
    flexDirection: "row",
    padding: 3,
  },
  segment: { alignItems: "center", borderRadius: huddleRadii.pill, flex: 1, paddingVertical: huddleSpacing.x2 },
  segmentActive: {
    backgroundColor: huddleColors.canvas,
    shadowColor: huddleColors.neutralShadow,
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 3,
  },
  segmentLabel: { color: huddleColors.mutedText, fontFamily: "Urbanist-500", fontSize: huddleType.label },
  segmentLabelActive: { color: huddleColors.blue, fontFamily: "Urbanist-700" },
  loading: { alignItems: "center", justifyContent: "center", paddingVertical: huddleSpacing.x8 },
  codePanel: {
    alignItems: "center",
    backgroundColor: huddleColors.mutedCanvas,
    borderRadius: huddleRadii.sheet,
    marginTop: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x5,
    paddingTop: huddleSpacing.x5,
  },
  qrFrame: {
    alignItems: "center",
    backgroundColor: huddleColors.canvas,
    borderRadius: huddleRadii.glass,
    justifyContent: "center",
    padding: huddleSpacing.x4,
  },
  qrAvatar: {
    alignItems: "center",
    backgroundColor: huddleColors.canvas,
    borderRadius: 30,
    height: 60,
    justifyContent: "center",
    position: "absolute",
    width: 60,
  },
  refresh: {
    alignItems: "center",
    borderRadius: huddleRadii.pill,
    height: 34,
    justifyContent: "center",
    position: "absolute",
    right: huddleSpacing.x3,
    top: huddleSpacing.x3,
    width: 34,
    zIndex: 1,
  },
  codeRow: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: huddleRadii.pill,
    flexDirection: "row",
    gap: huddleSpacing.x2,
    marginTop: huddleSpacing.x4,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x1,
  },
  codeFlash: { ...StyleSheet.absoluteFillObject, borderRadius: huddleRadii.pill },
  codeText: { color: huddleColors.mutedText, fontFamily: "Urbanist-500", fontSize: huddleType.label, letterSpacing: 2 },
  cta: { marginTop: huddleSpacing.x3 },
  viewfinder: {
    aspectRatio: 1,
    alignItems: "center",
    backgroundColor: huddleColors.text,
    borderRadius: huddleRadii.sheet,
    justifyContent: "center",
    marginTop: huddleSpacing.x4,
    overflow: "hidden",
    width: "100%",
  },
  viewfinderReticle: {
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: huddleRadii.glass,
    borderWidth: 2,
    height: "62%",
    width: "62%",
  },
  viewfinderBusy: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
  },
  viewfinderBlocked: {
    alignItems: "center",
    aspectRatio: 1.6,
    backgroundColor: huddleColors.mutedCanvas,
    borderRadius: huddleRadii.sheet,
    gap: huddleSpacing.x2,
    justifyContent: "center",
    marginTop: huddleSpacing.x4,
    width: "100%",
  },
  viewfinderBlockedText: { color: huddleColors.mutedText, fontFamily: "Urbanist-500", fontSize: huddleType.label },
  viewfinderBlockedAction: { color: huddleColors.blue, fontFamily: "Urbanist-700", fontSize: huddleType.label },
  scanDivider: { color: huddleColors.mutedText, fontFamily: "Urbanist-500", fontSize: huddleType.label, marginTop: huddleSpacing.x4, textAlign: "center" },
  inputWrap: {
    backgroundColor: huddleColors.canvas,
    borderColor: huddleColors.fieldBorder,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    marginTop: huddleSpacing.x2,
  },
  input: {
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h3,
    height: huddleLayout.fieldHeight,
    letterSpacing: 3,
    textAlign: "center",
  },
  friendsFixed: { marginTop: huddleSpacing.x4 },
  sectionLabel: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    marginTop: huddleSpacing.x4,
    textTransform: "uppercase",
  },
  peerRow: { alignItems: "center", flexDirection: "row", gap: huddleSpacing.x3, minHeight: 54 },
  peerRowPressed: { opacity: 0.92, transform: [{ scale: 0.975 }] },
  peerCopy: { flex: 1, minWidth: 0 },
  peerName: { color: huddleColors.text, fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine },
  peerHandle: { color: huddleColors.mutedText, fontFamily: "Urbanist-500", fontSize: huddleType.helper },
  notice: { color: huddleColors.mutedText, fontFamily: "Urbanist-500", fontSize: huddleType.label, marginTop: huddleSpacing.x3, textAlign: "center" },
  error: { color: huddleColors.validationRed, fontFamily: "Urbanist-500", fontSize: huddleType.label, marginTop: huddleSpacing.x3, textAlign: "center" },
});
