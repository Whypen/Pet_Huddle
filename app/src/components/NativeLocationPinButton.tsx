import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import {
  getNativeForegroundLocationPermissionDetail,
  openNativeAppSettings,
  openNativeLocationSettings,
  requestNativeLocationForPin,
  reverseGeocodeNativeLocationComponents,
  type NativeResolvedLocation,
} from "../lib/nativeLocation";
import { nativeSafeErrorCopy } from "../lib/nativeSafeErrorCopy";
import { huddleColors, huddleLayout, huddleRadii } from "../theme/huddleDesignTokens";

type NativeLocationPinButtonProps = {
  /** Called with the GPS-resolved, coordinate-backed location. */
  onResolved: (location: NativeResolvedLocation) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  retainedCoordinates?: { lat: number; lng: number } | null;
  style?: StyleProp<ViewStyle>;
};

/**
 * Shared "use current location" control placed at the left of every location
 * search field. Resolves real GPS coordinates + reverse-geocoded district/country,
 * so every location entry can fall back to a legitimate, coordinate-backed place
 * without manual free-text.
 */
export function NativeLocationPinButton({ onResolved, onError, disabled, retainedCoordinates, style }: NativeLocationPinButtonProps) {
  const [busy, setBusy] = useState(false);
  const handlePress = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const before = await getNativeForegroundLocationPermissionDetail();
      const result = await requestNativeLocationForPin({ retainedCoordinates });
      if (result.status === "settings_required") {
        const permanentlyDenied = result.reason === "permission" && before.state !== "granted" && !before.canAskAgain;
        if (result.reason === "services" || permanentlyDenied) {
          onError?.(result.reason === "services" ? "Turn on Location Services in Settings." : "Turn on Location for huddle in Settings.");
          await (result.reason === "services" ? openNativeLocationSettings() : openNativeAppSettings());
          return;
        }
        onError?.("Location access is needed to use your current area.");
        return;
      }
      if (result.status === "unavailable") throw new Error("Couldn't get your current location. Search instead.");
      const components = await reverseGeocodeNativeLocationComponents(result.coords.lat, result.coords.lng);
      const country = components?.countryName || components?.countryCode || "";
      const district = components?.district || components?.city || "";
      const resolved = {
        adminArea: components?.adminArea ?? null,
        country,
        countryCode: components?.countryCode ?? null,
        countryName: components?.countryName ?? (country || null),
        district,
        city: components?.city ?? null,
        label: `${district}${country ? `, ${country}` : ""}`.trim(),
        lat: result.coords.lat,
        lng: result.coords.lng,
      } satisfies NativeResolvedLocation;
      onResolved(resolved);
    } catch (error) {
      onError?.(nativeSafeErrorCopy(error, "Couldn't get your current location. Search instead."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable
      accessibilityLabel="Use current location"
      accessibilityRole="button"
      disabled={busy || disabled}
      hitSlop={8}
      onPress={() => void handlePress()}
      style={({ pressed }) => [styles.button, pressed ? styles.pressed : null, style]}
    >
      {busy ? (
        <ActivityIndicator color={huddleColors.blue} size="small" />
      ) : (
        <Feather color={huddleColors.blue} name="navigation" size={18} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
  },
  pressed: {
    opacity: 0.6,
  },
});
