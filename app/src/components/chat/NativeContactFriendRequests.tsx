import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { getMyNativeContactFriendRequests, respondNativeContactFriendRequest, type NativeContactFriendRequest, type NativeContactFriendResponse } from "../../lib/nativeContactFriends";
import { haptic } from "../../lib/nativeHaptics";
import { createSingleRealtimeChannel } from "../../lib/realtimeChannelManager";
import { huddleColors, huddleRadii, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";

export function NativeContactFriendRequests({ accessToken, active, onAccepted, onError, refreshKey, userId, visible = true }: { accessToken?: string | null; active: boolean; onAccepted: (result: NativeContactFriendResponse) => void; onError: (message: string) => void; refreshKey: number; userId?: string | null; visible?: boolean }) {
  const [requests, setRequests] = useState<NativeContactFriendRequest[]>([]);
  const [busyRequestIds, setBusyRequestIds] = useState<Set<string>>(() => new Set());
  const busyRequestIdsRef = useRef<Set<string>>(new Set());
  const onAcceptedRef = useRef(onAccepted);
  const onErrorRef = useRef(onError);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  onAcceptedRef.current = onAccepted;
  onErrorRef.current = onError;

  const setRequestBusy = (requestId: string, busy: boolean) => {
    const next = new Set(busyRequestIdsRef.current);
    if (busy) next.add(requestId);
    else next.delete(requestId);
    busyRequestIdsRef.current = next;
    setBusyRequestIds(next);
  };

  const removeRequest = (requestId: string) => {
    setRequests((current) => {
      const next = current.filter((item) => item.requestId !== requestId);
      return next;
    });
  };

  const loadRequests = useCallback(async () => {
    const rows = await getMyNativeContactFriendRequests(accessToken);
    setRequests(rows);
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;
    if (!active) return () => { cancelled = true; };
    void getMyNativeContactFriendRequests(accessToken)
      .then((rows) => {
        if (cancelled) return;
        setRequests(rows);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // A session that has not hydrated yet is not a failure the user can act on --
        // the effect re-runs with the real token. Toasting it puts "Could not load
        // requests. Try again." on whatever tab happens to be open at launch.
        if (String((error as { message?: unknown })?.message || "") === "missing_access_token") return;
        onErrorRef.current("Couldn't load requests. Try again.");
      });
    return () => { cancelled = true; };
  }, [accessToken, active, refreshKey]);

  useEffect(() => {
    if (!active || !userId) return;
    const refresh = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        void loadRequests().catch(() => undefined);
      }, 150);
    };
    const handle = createSingleRealtimeChannel(`native-friend-requests-${userId}`, (channel) =>
      channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, refresh));
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
      void handle.dispose();
    };
  }, [active, loadRequests, userId]);

  if (!active || !visible || requests.length === 0) return null;
  return <View style={{ gap: huddleSpacing.x3, marginTop: huddleSpacing.x4 }}>
    {/* Without this the user sees an unexplained name asking for something. Saying
        where it came from is what makes the request read as recognition. */}
    <Text style={{ color: huddleColors.mutedText, fontFamily: "Urbanist-700", fontSize: huddleType.helper, textTransform: "uppercase" }}>Friend requests</Text>
    {requests.map((request) => {
      const busy = busyRequestIds.has(request.requestId);
      return <View key={request.requestId} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x4, minHeight: 44 }}>
        <Text numberOfLines={1} style={{ color: huddleColors.text, flex: 1, fontFamily: "Urbanist-600", fontSize: huddleType.label }}>{`${request.displayName} (${request.source === "qr_code" ? "from QR code" : "from contact list"})`}</Text>
        <Pressable disabled={busy} onPress={async () => {
          if (busyRequestIdsRef.current.has(request.requestId)) return;
          setRequestBusy(request.requestId, true);
          try {
            await respondNativeContactFriendRequest(request.requestId, false, accessToken);
            removeRequest(request.requestId);
          } catch {
            haptic.error();
            onErrorRef.current("Couldn't decline. Try again.");
          } finally {
            setRequestBusy(request.requestId, false);
          }
        }} accessibilityLabel={`Decline ${request.displayName}'s friend request`} hitSlop={8} style={{ alignItems: "center", backgroundColor: huddleColors.validationSoft, borderRadius: huddleRadii.pill, height: 36, justifyContent: "center", width: 36 }}><Feather color={huddleColors.validationRed} name="x" size={19} /></Pressable>
        <Pressable disabled={busy} onPress={async () => {
          if (busyRequestIdsRef.current.has(request.requestId)) return;
          setRequestBusy(request.requestId, true);
          try {
            const result = await respondNativeContactFriendRequest(request.requestId, true, accessToken);
            haptic.success();
            removeRequest(request.requestId);
            onAcceptedRef.current(result);
          } catch {
            haptic.error();
            onErrorRef.current("Couldn't accept. Try again.");
          } finally {
            setRequestBusy(request.requestId, false);
          }
        }} accessibilityLabel={`Accept ${request.displayName}'s friend request`} style={({ pressed }) => [{ alignItems: "center", backgroundColor: huddleColors.successSoft, borderRadius: huddleRadii.pill, height: 36, justifyContent: "center", opacity: busy ? 0.6 : 1, width: 36 }, pressed && { opacity: 0.85 }]}><Feather color={huddleColors.success} name="check" size={19} /></Pressable>
      </View>;
    })}
  </View>;
}
