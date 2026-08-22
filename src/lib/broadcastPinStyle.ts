export type BroadcastAlertType = "Stray" | "Lost" | "Caution" | "Others";
export type BroadcastIconKey = "paw" | "alert" | "info";

export interface BroadcastPinStyle {
  /** Composer chrome — type chips, buttons, the type menu. */
  color: string;
  /**
   * The colour used on the MAP itself. Identical to `color` for every type
   * except Caution, which native deliberately splits.
   *
   * Native, verified in source:
   *   huddleDesignTokens.ts:590-592
   *     // Caution is intentionally neutral so it does not read as friend presence.
   *     alertCaution: huddleColors.alertOther   → #A1A4A9
   *   nativeBroadcast.ts:110  Caution → #2145CF — and getNativeBroadcastPinColor
   *     is consumed ONLY by NativeBroadcastModal, i.e. composer chrome.
   *
   * Web's verified friend pins are #2145CF (FriendMarkersOverlay.tsx:216), which
   * is the exact collision that comment guards against. Serving both surfaces
   * from one value is what caused it.
   */
  markerColor: string;
  icon: BroadcastIconKey;
}

const STYLE_BY_TYPE: Record<BroadcastAlertType, BroadcastPinStyle> = {
  Stray:   { color: "#EAB308", markerColor: "#EAB308", icon: "paw" },
  Lost:    { color: "#EF4444", markerColor: "#EF4444", icon: "paw" },
  Caution: { color: "#2145CF", markerColor: "#A1A4A9", icon: "alert" },
  Others:  { color: "#A1A4A9", markerColor: "#A1A4A9", icon: "info" },
};

export function normalizeBroadcastAlertType(value: string | null | undefined): BroadcastAlertType {
  if (!value) return "Stray";
  const normalized = value.toLowerCase();
  if (normalized === "lost") return "Lost";
  if (normalized === "caution") return "Caution";
  if (normalized === "others" || normalized === "other") return "Others";
  return "Stray";
}

export function getBroadcastPinStyle(value: string | null | undefined): BroadcastPinStyle {
  return STYLE_BY_TYPE[normalizeBroadcastAlertType(value)];
}
