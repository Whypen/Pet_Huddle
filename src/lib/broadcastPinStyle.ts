export type BroadcastAlertType = "Stray" | "Lost" | "Others";
export type BroadcastIconKey = "paw" | "alert" | "info";

export interface BroadcastPinStyle {
  color: string;
  icon: BroadcastIconKey;
}

const STYLE_BY_TYPE: Record<BroadcastAlertType, BroadcastPinStyle> = {
  Stray: { color: "#EAB308", icon: "paw" },
  Lost: { color: "#EF4444", icon: "alert" },
  Others: { color: "#A1A4A9", icon: "info" },
};

export function normalizeBroadcastAlertType(value: string | null | undefined): BroadcastAlertType {
  if (!value) return "Stray";
  const normalized = value.toLowerCase();
  if (normalized === "lost") return "Lost";
  if (normalized === "others" || normalized === "other") return "Others";
  return "Stray";
}

export function getBroadcastPinStyle(value: string | null | undefined): BroadcastPinStyle {
  return STYLE_BY_TYPE[normalizeBroadcastAlertType(value)];
}
