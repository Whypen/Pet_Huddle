import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(dir, path), "utf8");
const sheet = () => read("./NativeHuddleFriendsSheet.tsx");
const drawer = () => read("../NativeSettingsDrawer.tsx");
const panel = () => read("../contacts/NativeContactFriendsSheet.tsx");

describe("huddle friends sheet", () => {
  it("replaces the two drawer rows and both old sheets with one entry point", () => {
    const text = drawer();
    expect(text).toContain('{ label: "huddle friends", icon: "user-plus", onPress: () => openHuddleFriends("code") }');
    expect(text).not.toContain("My huddle Code");
    expect(text).not.toContain("NativeMyHuddleCodeSheet");
    expect(text).not.toContain("NativeAddFriendCodeSheet");
  });

  it("opens the scan segment when an add-friend deep link carries a code", () => {
    expect(drawer()).toContain('openHuddleFriends("scan", code, invite)');
    expect(sheet()).toContain('setCode(normalizeHuddleCode(initialCode || ""))');
  });

  it("carries three segments and drops the dismissible intro banner", () => {
    const text = sheet();
    expect(text).toMatch(/\{ key: "code", label: "My code" \}/);
    expect(text).toMatch(/\{ key: "scan", label: "Scan" \}/);
    expect(text).toMatch(/\{ key: "friends", label: "Friends" \}/);
    expect(text).not.toContain("Add a new pet friend you met in person");
    expect(text).not.toContain("huddle_code_intro");
    expect(text).not.toContain("Show this when you meet someone in person");
  });

  it("confirms before rotating and makes the change legible on the digits", () => {
    const text = sheet();
    expect(text).toContain('"Create a new code?"');
    expect(text).toContain('"Your old code will stop working."');
    expect(text).toMatch(/onPress: \(\) => void rotateCode\(\)/);
    expect(text).toContain("const flashCode = useCallback");
    expect(text).toContain("codeFlashStyle");
  });

  it("keeps the code quiet next to the QR rather than competing with it", () => {
    const text = sheet();
    expect(text).toMatch(/codeText: \{[^}]*fontSize: huddleType\.label/s);
    expect(text).toMatch(/codeText: \{[^}]*color: huddleColors\.mutedText/s);
    expect(text).toContain("accessibilityLabel=\"Copy huddle code\"");
  });

  it("routes both blocked toggles to where the user can unblock them", () => {
    expect(panel()).toContain("verified_phone_required");
    expect(panel()).toContain("onNeedsPhoneVerification()");
    expect(panel()).toContain("resolveNativeContactsToggleIntent");
    expect(panel()).toContain("applyNativeContactsToggleIntent");
    expect(panel()).toContain("Turn on Contacts for huddle in Settings.");
  });

  it("re-derives contacts access on foreground so the toggle cannot go stale", () => {
    const text = panel();
    expect(text).toContain('AppState.addEventListener("change"');
    expect(text).toContain("readNativeContactsToggleEnabled");
    expect(text).toContain("subscription.remove()");
  });

  it("uses the app's settings switch, not the in-modal consent checkbox", () => {
    const text = panel();
    expect(text).not.toContain("AppModalToggleRow");
    expect(text).toMatch(/toggleTrack: \{[^}]*width: 42/s);
    expect(text).toMatch(/toggleThumb: \{[^}]*width: 18/s);
    expect(text).toContain("toggleTrackOn: { backgroundColor: huddleColors.blue }");
  });

  it("keeps every label at the 14px settings size the drawer uses", () => {
    expect(panel()).not.toMatch(/fontSize: huddleType\.body/);
    expect(sheet()).not.toMatch(/fontSize: huddleType\.body/);
  });

  it("lets the bottom sheet own scrolling instead of nesting a second scroller", () => {
    const text = sheet();
    expect(text).toContain("styles.friendsFixed");
    // AppBottomSheetScroll is already a vertical ScrollView; a nested one would
    // fight the same gesture on iOS.
    expect(text).not.toContain("<ScrollView");
    expect(text).not.toContain("nestedScrollEnabled");
    expect(text).not.toContain("friendsScroll");
  });

  it("hands the dialogue its row so the header does not flash a fallback", () => {
    const text = drawer();
    // Chats writes this before navigating; without it the dialogue mounts with no
    // peer data and swaps the avatar to the placeholder once the fetch lands.
    expect(text).toContain("writeNativeChatSelectedRowHandoff({ row, sessionKey, userId })");
    expect(text).toMatch(/const row = matchedSummaryToInboxRow\(peer\);[\s\S]*writeNativeChatSelectedRowHandoff/);
  });

  it("reuses the Chats link for chat and the shared profile modal for avatars", () => {
    const text = drawer();
    expect(text).toContain("resolveNativeChatInboxRowNavigation(");
    expect(text).toContain("ensureNativeDirectChatRoom(targetUserId, targetName");
    expect(text).toContain('setProfileSheetSource("friend")');
    expect(text).toContain('hideActions={profileSheetSource === "family"}');
  });

  it("closes the sheet and drawer before navigating to a conversation", () => {
    expect(drawer()).toMatch(/setHuddleFriendsOpen\(false\);\s*onClose\(\);\s*onNavigate\(path\)/s);
  });

  it("sits on the app's bottom sheet chrome, not a centred alert card", () => {
    const text = sheet();
    expect(text).toContain("<AppBottomSheet mode=\"autoMax\"");
    expect(text).toContain("AppBottomSheetHeader");
    // The sheet's parent must have a definite height, otherwise AppBottomSheet's
    // percentage maxHeight never resolves and the content runs off screen.
    expect(text).toMatch(/backdrop: \{[^}]*justifyContent: "flex-end"/s);
    expect(text).toMatch(/sheetDock: \{ flex: 1, justifyContent: "flex-end" \}/);
    // AppBottomSheetHeader is already a row with space-between.
    expect(text).not.toMatch(/header: \{[^}]*flexDirection: "row"/s);
    expect(text).not.toMatch(/card: \{[^}]*borderRadius: huddleRadii\.sheet/s);
    expect(text).not.toMatch(/overlay: \{[^}]*justifyContent: "center"/s);
  });

  it("uses the shared CTA rather than a bespoke button", () => {
    const text = sheet();
    expect(text).toContain("<AppModalButton accessibilityLabel=\"Share code\"");
    expect(text).toContain("<AppModalButton accessibilityLabel=\"Send request\"");
    expect(text).not.toMatch(/primary: \{[^}]*height: huddleLayout\.ctaHeight/s);
  });

  it("drops the tinted icon disc the drawer rows never use", () => {
    const text = panel();
    expect(text).not.toContain('backgroundColor: "rgba(33, 69, 207, 0.07)"');
    expect(text).not.toMatch(/rowIcon: \{/);
    expect(text).toContain("<Feather color={huddleColors.iconMuted} name={icon} size={17} />");
  });

  it("puts the empty state under its own toggle, above the unrelated one", () => {
    const text = panel();
    const contactsRow = text.indexOf('label="Find friends from contacts"');
    const empty = text.indexOf("Your contacts are not on huddle yet.");
    const discoverRow = text.indexOf('label="Let people find me by number"');
    expect(contactsRow).toBeGreaterThan(-1);
    expect(empty).toBeGreaterThan(contactsRow);
    expect(discoverRow).toBeGreaterThan(empty);
  });

  it("makes the whole friend row a chat target with press feedback", () => {
    const text = sheet();
    expect(text).toMatch(/<Pressable\s+accessibilityLabel=\{`Message \$\{peer\.displayName \|\| "friend"\}`\}/s);
    expect(text).toContain("pressed && styles.peerRowPressed");
    expect(text).toContain("peerRowPressed: { opacity: 0.92, transform: [{ scale: 0.975 }] }");
  });

  it("mints a single-use link on share and auto-connects when one is opened", () => {
    const text = sheet();
    expect(text).toContain("createNativeAddFriendInviteToken({ accessToken })");
    expect(text).toContain("redeemNativeAddFriendInviteToken(invite, { accessToken })");
    // A new friendship is one of only two outcomes that changed state, so it
    // floats; "already connected" changed nothing and stays as helper text.
    expect(text).toContain('setToast("You\'re now friends.")');
    expect(text).toContain('setNotice("You\'re already connected.")');
  });

  it("reads camera state from the permission, never from scannerOpen", () => {
    const text = sheet();
    // scannerOpen only mounts the camera. Deriving the blocked copy from it showed
    // a Settings prompt while permission was still loading, and on every scan.
    expect(text).toContain("scannerOpen && permission?.granted");
    // Denied-but-askable gets the ask; only a hard denial routes to Settings,
    // using the same wording every other permission callsite uses.
    expect(text).toContain("permission?.canAskAgain === false");
    expect(text).toContain("Allow camera to scan a code.");
    expect(text).toContain("Turn on Camera for huddle in Settings.");
    expect(text).toContain("requestingCamera");
    // Returning from Settings must recover instead of stranding the user.
    expect(text).toContain('AppState.addEventListener("change"');
  });

  it("only redeems a real huddle code and can retry after a failure", () => {
    const text = sheet();
    // Stripping digits out of any payload turned unrelated QRs into a six-digit
    // "code" and fired a request at whoever happened to own it.
    expect(text).toContain("nativePathForHuddleWebPath(raw)");
    expect(text).toMatch(/\/\^\\d\{6\}\$\//);
    expect(text).not.toContain('url.searchParams.get("code") || raw');
    // A failed attempt must not make the same QR permanently unreadable.
    expect(text).toContain('lastScannedRef.current = "";');
    // The camera stays live so a group can be scanned one after another.
    expect(text).not.toMatch(/lastScannedRef\.current = parsed;\s*setScannerOpen\(false\)/);
  });

  it("hands CameraView stable props so the preview cannot blink", () => {
    const text = sheet();
    // An inline object or a fresh callback makes CameraView reconfigure the capture
    // session on every render: the preview blinks and Fig logs err=-17281.
    expect(text).toContain("const QR_SCANNER_SETTINGS: BarcodeSettings =");
    expect(text).toContain("barcodeScannerSettings={QR_SCANNER_SETTINGS}");
    expect(text).not.toMatch(/barcodeScannerSettings=\{\{/);
    // redeem() changes identity with `code`, so handleBarcode reads it via a ref.
    expect(text).toContain("redeemRef.current = redeem;");
    expect(text).toMatch(/void redeemRef\.current\(parsed\);\s*\}, \[\]\);/);
  });

  it("floats only the outcomes that changed something", () => {
    const text = sheet();
    expect(text).toContain("<NativeToast message={toast}");
    expect(text).toContain('setToast("Request sent.")');
    // Nothing-changed outcomes stay beside the control that produced them.
    expect(text).toContain('setNotice("You\'re already connected.")');
    expect(text).toContain('return "You\'ve already sent a request.";');
  });
});
