export function lightHaptic() {
  // Web-safe haptic shim. RN/Expo version lives in mobile app.
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(10);
  }
}

