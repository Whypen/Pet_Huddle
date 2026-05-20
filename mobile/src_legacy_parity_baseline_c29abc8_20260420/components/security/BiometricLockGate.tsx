import { View, Pressable } from "react-native";
import { HText } from "../HText";
import { COLORS } from "../../theme/tokens";
import { useAuth } from "../../contexts/useAuth";

export function BiometricLockGate() {
  const {
    session,
    biometricUnlockEnabled,
    biometricUnlockLabel,
    unlockConfigReady,
    unlockRequired,
    privacyCovered,
    unlockError,
    unlockApp,
    signInAgainFromLock,
  } = useAuth();

  if (!session) return null;
  const shouldHoldCover = privacyCovered && !unlockConfigReady;
  const shouldShowUnlock = biometricUnlockEnabled && unlockRequired;
  if (!shouldHoldCover && !shouldShowUnlock) return null;

  return (
    <View
      pointerEvents="auto"
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: COLORS.white,
        zIndex: 9999,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
      }}
    >
      <HText variant="heading" style={{ fontSize: 24, fontWeight: "800", color: COLORS.brandText }}>
        Unlock Huddle
      </HText>
      {shouldHoldCover ? (
        <HText variant="body" style={{ marginTop: 16, color: COLORS.brandSubtext, textAlign: "center" }}>
          Checking security…
        </HText>
      ) : null}
      {shouldShowUnlock ? (
        <>
          <Pressable
            onPress={() => {
              void unlockApp();
            }}
            style={{
              marginTop: 24,
              backgroundColor: COLORS.brandBlue,
              borderRadius: 12,
              minWidth: 220,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 20,
            }}
          >
            <HText variant="body" style={{ color: COLORS.white, fontWeight: "700" }}>
              {biometricUnlockLabel}
            </HText>
          </Pressable>

          {unlockError ? (
            <HText variant="body" style={{ marginTop: 10, color: COLORS.brandError, textAlign: "center" }}>
              {unlockError}
            </HText>
          ) : null}
        </>
      ) : null}

      {shouldShowUnlock ? (
        <Pressable
          onPress={() => {
            void signInAgainFromLock();
          }}
          style={{
            marginTop: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: `${COLORS.brandText}55`,
            minWidth: 220,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 20,
          }}
        >
          <HText variant="body" style={{ color: COLORS.brandText, fontWeight: "700" }}>
            Sign in again
          </HText>
        </Pressable>
      ) : null}
    </View>
  );
}
