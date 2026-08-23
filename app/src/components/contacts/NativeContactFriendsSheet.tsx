import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { huddleButtons, huddleColors, huddleRadii, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";
import { findNativeContactFriends, sendNativeContactFriendRequest, setNativeContactDiscovery, type NativeContactFriend } from "../../lib/nativeContactFriends";
import { applyNativeContactsToggleIntent, readNativeContactsToggleEnabled, resolveNativeContactsToggleIntent } from "../../lib/nativeContactsToggle";
import { getNativeContactPermissionDetail } from "../../lib/nativeContactPermissions";

const NO_CONTACT_FRIENDS: NativeContactFriend[] = [];

// Bare glyph, no tinted disc: DrawerRow renders its icons exactly this way, and
// this panel hangs off that same drawer list.
function ContactsSettingRow({ enabled, icon, label, onPress }: { enabled: boolean; icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, pressed && huddleButtons.pressed]}
    >
      <Feather color={huddleColors.iconMuted} name={icon} size={17} />
      <Text numberOfLines={1} style={styles.actionLabel}>{label}</Text>
      <View style={[styles.toggleTrack, enabled && styles.toggleTrackOn]}>
        <View style={[styles.toggleThumb, enabled && styles.toggleThumbOn]} />
      </View>
    </Pressable>
  );
}

export function NativeContactFriendsPanel({
  accessToken,
  active,
  defaultCountry,
  discoverableInitially = false,
  onDiscoveryChanged,
  onInvite,
  onNeedsPhoneVerification,
  userId,
}: {
  accessToken?: string | null;
  active: boolean;
  defaultCountry?: string | null;
  discoverableInitially?: boolean;
  onDiscoveryChanged: (enabled: boolean) => void;
  onInvite: () => void;
  onNeedsPhoneVerification: () => void;
  userId?: string | null;
}) {
  const [contactsOn, setContactsOn] = useState(false);
  const [discoverable, setDiscoverable] = useState(discoverableInitially);
  const [friends, setFriends] = useState<NativeContactFriend[]>(NO_CONTACT_FRIENDS);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const scannedRef = useRef(false);

  useEffect(() => { setDiscoverable(discoverableInitially); }, [discoverableInitially]);

  const scan = useCallback(async () => {
    setBusy(true);
    setStatus("");
    try {
      const result = await findNativeContactFriends(accessToken, defaultCountry);
      setFriends(result.friends);
      scannedRef.current = result.permission === "granted";
    } catch {
      setStatus("Couldn't check your contacts. Try again.");
    } finally {
      setBusy(false);
    }
  }, [accessToken, defaultCountry]);

  // Contacts access can be revoked in system settings while huddle is in the
  // background, so the toggle re-derives from the OS on mount and on every
  // foreground rather than trusting its own last known value.
  const syncFromSystem = useCallback(async () => {
    const enabled = await readNativeContactsToggleEnabled(userId);
    setContactsOn(enabled);
    if (!enabled) {
      setFriends(NO_CONTACT_FRIENDS);
      scannedRef.current = false;
      return;
    }
    if (!scannedRef.current) void scan();
  }, [scan, userId]);

  useEffect(() => {
    if (!active) return;
    void syncFromSystem();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncFromSystem();
    });
    return () => { subscription.remove(); };
  }, [active, syncFromSystem]);

  const toggleContacts = useCallback(async () => {
    setStatus("");
    const permission = await getNativeContactPermissionDetail();
    const intent = resolveNativeContactsToggleIntent(contactsOn, {
      canAskAgain: permission.canAskAgain,
      state: permission.status === "granted" ? "granted" : "denied",
    });
    if (intent === "open-settings") setStatus("Turn on Contacts for huddle in Settings.");
    const enabled = await applyNativeContactsToggleIntent(intent, userId);
    setContactsOn(enabled);
    if (!enabled) {
      setFriends(NO_CONTACT_FRIENDS);
      scannedRef.current = false;
      return;
    }
    void scan();
  }, [contactsOn, scan, userId]);

  const toggleDiscoverable = useCallback(async (value: boolean) => {
    setDiscoverable(value);
    setStatus("");
    try {
      await setNativeContactDiscovery(value, accessToken);
      onDiscoveryChanged(value);
    } catch (error) {
      setDiscoverable(!value);
      // Turning this on requires a verified phone, so send the user to the one
      // place that can unblock it instead of stopping at a generic failure.
      if (String((error as { message?: unknown })?.message || "").includes("verified_phone_required")) {
        onNeedsPhoneVerification();
        return;
      }
      setStatus("Couldn't save that. Try again.");
    }
  }, [accessToken, onDiscoveryChanged, onNeedsPhoneVerification]);

  if (!active) return null;

  const scanned = contactsOn && scannedRef.current;
  return (
    <View>
      <ContactsSettingRow enabled={contactsOn} icon="book-open" label="Find friends from contacts" onPress={() => void toggleContacts()} />

      {busy ? <Text style={styles.hint}>Finding…</Text> : null}

      {friends.map((friend) => (
        <View key={friend.userId} style={styles.matchRow}>
          <Text numberOfLines={1} style={styles.matchName}>{friend.localName}</Text>
          <Pressable
            disabled={friend.requestSent}
            onPress={async () => {
              setStatus("");
              try {
                await sendNativeContactFriendRequest(friend.userId, friend.contactKey, accessToken);
                setFriends((current) => current.map((item) => item.userId === friend.userId ? { ...item, requestSent: true } : item));
              } catch {
                setStatus("Couldn't send that request. Try again.");
              }
            }}
            style={({ pressed }) => [pressed && !friend.requestSent && huddleButtons.pressed]}
          >
            <Text style={[styles.matchAction, friend.requestSent && styles.matchActionDone]}>
              {friend.requestSent ? "Requested" : "Add"}
            </Text>
          </Pressable>
        </View>
      ))}

      {/* Sits directly under the toggle it belongs to, before the unrelated
          discoverability row. */}
      {!busy && scanned && friends.length === 0 ? (
        <View style={styles.matchRow}>
          <Text style={styles.emptyText}>Your contacts are not on huddle yet.</Text>
          <Pressable
            accessibilityLabel="Invite contacts to huddle"
            onPress={onInvite}
            style={({ pressed }) => [pressed && huddleButtons.pressed]}
          >
            <Text style={styles.matchAction}>Invite</Text>
          </Pressable>
        </View>
      ) : null}

      <ContactsSettingRow enabled={discoverable} icon="hash" label="Let people find me by number" onPress={() => void toggleDiscoverable(!discoverable)} />

      {status ? <Text style={styles.hint}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actionRow: { alignItems: "center", flexDirection: "row", gap: huddleSpacing.x3, minHeight: 52 },
  actionLabel: {
    color: huddleColors.text,
    flex: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
  },
  toggleTrack: {
    backgroundColor: huddleColors.mutedCanvas,
    borderRadius: huddleRadii.pill,
    height: 24,
    justifyContent: "center",
    paddingHorizontal: 3,
    width: 42,
  },
  toggleTrackOn: { backgroundColor: huddleColors.blue },
  toggleThumb: { backgroundColor: huddleColors.canvas, borderRadius: 9, height: 18, width: 18 },
  toggleThumbOn: { transform: [{ translateX: 18 }] },
  // Indented to the label gutter so results read as owned by the row above them.
  matchRow: { alignItems: "center", flexDirection: "row", gap: huddleSpacing.x3, marginLeft: 29, minHeight: 38 },
  matchName: { color: huddleColors.text, flex: 1, fontFamily: "Urbanist-500", fontSize: huddleType.label },
  matchAction: { color: huddleColors.blue, fontFamily: "Urbanist-600", fontSize: huddleType.label },
  matchActionDone: { color: huddleColors.mutedText },
  emptyText: { color: huddleColors.mutedText, flex: 1, fontFamily: "Urbanist-500", fontSize: huddleType.label },
  hint: { color: huddleColors.mutedText, fontFamily: "Urbanist-500", fontSize: huddleType.label, marginLeft: 29 },
});
