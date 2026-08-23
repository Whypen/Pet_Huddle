import {
  huddleColors,
  huddleRadii,
  huddleSpacing,
  huddleType,
} from "../../theme/huddleDesignTokens";

export type NativeReportSource = "Chat" | "Group Chat" | "Social" | "Map";
export type NativeReportSourceOrigin = "friends chats" | "social" | "maps" | "other";

export const NATIVE_SOCIAL_REPORT_SOURCE: NativeReportSource = "Social";
export const NATIVE_SOCIAL_REPORT_SOURCE_ORIGIN: NativeReportSourceOrigin = "social";
export const NATIVE_SOCIAL_REPORT_MAX_ATTACHMENTS = 5;

export const NATIVE_SOCIAL_REPORT_COPY = {
  addDetailsPlaceholder: "Add details (optional)",
  blocked: "You cannot report this user from here.",
  detailsLabel: "Details",
  imagePickerLabel: "Upload image",
  intro: "Tell us what happened so we can protect the community.",
  missingAuth: "Please login to report.",
  missingTarget: "Unable to submit report right now.",
  otherPlaceholder: "Other reason",
  selectReason: "Select at least one reason.",
  submit: "Send report",
  submitting: "Sending...",
  success: "Report sent",
  title: "Report",
  uploadAltPrefix: "Upload",
} as const;

export const NATIVE_SOCIAL_REPORT_CATEGORIES = [
  "Unsafe behavior or Safety Incident or Threat",
  "Animal Welfare or Cruelty",
  "Privacy Violation",
  "Suspicious Behavior or Potential Scam",
  "False Information or \"Crying Wolf\" (Fake alerts)",
  "Inappropriate or Explicit Content",
  "Harassment or Hate Speech or Offensive Content",
  "Commercial Spam",
  "Others",
] as const;

export type NativeSocialReportCategory = (typeof NATIVE_SOCIAL_REPORT_CATEGORIES)[number];

export const nativeSocialReportTokens = {
  attachmentGridGap: huddleSpacing.x2,
  attachmentPreviewSize: 96,
  attachmentRadius: huddleRadii.card,
  attachmentRemoveButtonOffset: huddleSpacing.x1,
  attachmentRemoveButtonSize: 24,
  checkboxBorderRadius: huddleSpacing.x1,
  checkboxSize: 18,
  categoryGap: huddleSpacing.x1,
  categoryMinHeight: 28,
  categoryTextColor: huddleColors.text,
  categoryTextFamily: "Urbanist-500",
  categoryTextLineHeight: huddleType.labelLine,
  categoryTextSize: huddleType.label,
  contentGap: huddleSpacing.x2,
  introColor: huddleColors.caption,
  introFamily: "Urbanist-500",
  introLineHeight: huddleType.labelLine,
  introSize: huddleType.label,
  titleColor: huddleColors.text,
  titleFamily: "Urbanist-700",
  titleLineHeight: huddleType.h4Line,
  titleSize: huddleType.h4,
} as const;
