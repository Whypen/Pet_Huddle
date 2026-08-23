import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { logVerifyIdentity as logNativeVerifyIdentity } from "expo-text-extractor";
import type { Camera as VisionCameraType, CameraDevice, CameraPermissionStatus } from "react-native-vision-camera";
import type { Face, FrameFaceDetectionOptions } from "react-native-vision-camera-face-detector";
import type { Session } from "@supabase/supabase-js";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type MutableRefObject, type ReactNode } from "react";
import { Animated, AppState, Image, Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type AppStateStatus, type LayoutChangeEvent } from "react-native";
import Svg, { G as SvgG, Path as SvgPath } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import verifyIllustration from "../../assets/Sign up/Verify_1.jpg";
import { NativeBrandMedia } from "../components/NativeBrandMedia";
import { NativeFormTextField } from "../components/NativeFormField";
import { NativePhoneField } from "../components/NativePhoneField";
import { NativeSpinner } from "../components/NativeSpinner";
import { AppConfirmModal } from "../components/nativeModalPrimitives";
import { NativeVerifyIntroSheet } from "../components/coachmarks/NativeVerifyIntroSheet";
import { isNativeCoachMarkSeen, markNativeCoachMarkSeen } from "../lib/nativeCoachMarks";
import { maskNativePhoneForOtpNotice } from "../lib/nativePhoneOtp";
import { openNativeAppSettings } from "../lib/nativeLocation";
import {
  applyNativeVerifyIdentityHumanCaptureResult,
  beginNativeVerifyIdentityHumanCapture,
  completeNativeVerifyIdentityHumanModel,
  createNativeVerifyIdentityHumanState,
  reduceNativeVerifyIdentityHumanState,
  startNativeVerifyIdentityHumanModel,
  type NativeVerifyIdentityHumanCaptureResult,
  type NativeVerifyIdentityHumanState,
} from "../lib/nativeVerifyIdentityHumanModel";
import {
  buildNativeHumanResultPayload,
  classifyNativeHumanDetectorTimeout,
  createNativeHumanDetectionState,
  getNativeHumanMovementMetrics,
  NATIVE_HUMAN_SIDE_YAW_MIN_DEGREES,
  hasNativeHumanLivenessPass,
  processNativeHumanDetectorFrame,
  type NativeHumanDetectionState,
  type NativeHumanDetectorFailure,
  type NativeHumanDetectorFrame,
} from "../lib/nativeVerifyIdentityHumanDetector";
import { getNativeHumanScanVisualState } from "../lib/nativeVerifyIdentityHumanVisualState";
import { haptic } from "../lib/nativeHaptics";
import { publishNativeCameraPermissionStatus } from "../lib/nativeMediaPermissions";
import { nativeSafeErrorCopy } from "../lib/nativeSafeErrorCopy";
import { patchNativeProfileSummaryCache } from "../lib/nativeProfileSummary";
import {
  createNativeVerifyIdentityPhoneOtpState,
  reduceNativeVerifyIdentityPhoneOtpState,
  resendNativeVerifyIdentityPhoneOtp,
  sendNativeVerifyIdentityPhoneOtp,
  verifyNativeVerifyIdentityPhoneOtpCode,
  type NativeVerifyIdentityPhoneOtpState,
} from "../lib/nativeVerifyIdentityPhoneOtpModel";
import {
  confirmNativeIdentityDocument,
  emitNativeVerifyIdentityUpdated,
  completeNativeHumanChallenge,
  fetchNativeVerifyIdentityRefreshState,
  formatNativeIdentityDocumentCountry,
  formatNativeIdentityDocumentGender,
  NATIVE_BLOCKED_IDENTITY_SUPPORT_INTENT,
  readCachedNativeVerifyIdentityProfileStatus,
  refreshNativeVerifyIdentityProfileCache,
  setNativeVerifyIdentitySessionFallback,
  subscribeNativeVerifyIdentityUpdated,
  type NativeCompleteHumanChallengePayload,
  type NativeIdentityDocumentType,
  type NativeIdentityExtractionMethod,
  type NativeVerifyIdentityProfileStatus,
  type NativeVerifyIdentitySnapshot,
} from "../lib/nativeVerifyIdentity";
import { extractNativeIdentityText, isNativeIdentityOcrSupported, normalizeNativeIdentityMrzCandidateText, type NativeIdentityOcrTextLine } from "../lib/nativeIdentityDocumentOcr";
import { findIdentityDocumentGenderFromGeometryOcr, findIdentityDocumentGenderFromOcr, getPassportGeometryNameDiagnostics, getPassportMrzCandidateDiagnostics, parsePassportMrz, resolvePassportDocumentCountryFromText, resolvePassportLegalNameFromGeometryOcr, resolvePassportLegalNameFromOcr } from "../lib/nativeIdentityDocumentMrz";
import {
  huddleButtons,
  huddleColors,
  huddleFieldStates,
  huddleFormFields,
  huddleLayout,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
  huddleVerifyIdentity,
} from "../theme/huddleDesignTokens";

const COMPLETE_BADGE = { label: "Complete", tone: "success" as const };

const AnimatedSvgPath = Animated.createAnimatedComponent(SvgPath);

type VisionCameraModule = typeof import("react-native-vision-camera");
type FaceDetectorModule = typeof import("react-native-vision-camera-face-detector");
type WorkletsModule = typeof import("react-native-worklets-core");

const getVisionCameraModule = (): VisionCameraModule => require("react-native-vision-camera") as VisionCameraModule;
const getFaceDetectorModule = (): FaceDetectorModule => require("react-native-vision-camera-face-detector") as FaceDetectorModule;
const getWorkletsModule = (): WorkletsModule => require("react-native-worklets-core") as WorkletsModule;
const getNativeCameraPermissionStatus = (): CameraPermissionStatus => {
  const status = getVisionCameraModule().Camera.getCameraPermissionStatus();
  publishNativeCameraPermissionStatus(status);
  return status;
};

type VerifyIdentityStep = "human" | "document" | "phone" | "final";
type ActiveCard = "phone" | "human" | "document" | null;
type HumanPoseStep = "center" | "left" | "right" | "done";
type HumanDetectorStartupState = "permission_not_requested" | "permission_denied" | "camera_mounting" | "preview_ready" | "warming_up" | "detecting" | "native_error";
type HumanCompletedSteps = { center: boolean; left: boolean; right: boolean };
type HumanConfirmationDwell = {
  durationMs: number;
  step: Exclude<HumanPoseStep, "done">;
  startedAt: number;
  target: HumanPoseStep | "submit";
} | null;
type HumanSettlePhase = {
  durationMs: number;
  startedAt: number;
  target: Exclude<HumanPoseStep, "done"> | "submit";
  until: number;
} | null;
const HUMAN_CENTER_YAW_MAX = 8;
const HUMAN_SIDE_YAW_MIN = NATIVE_HUMAN_SIDE_YAW_MIN_DEGREES;
const HUMAN_CENTER_HOLD_MS = 1500;
const HUMAN_SIDE_HOLD_MS = 800;
const HUMAN_FACE_MIN_WIDTH_RATIO = 0.16;
const HUMAN_FACE_MAX_WIDTH_RATIO = 0.78;
const HUMAN_FACE_MAX_ROLL = 24;
const HUMAN_FACE_MAX_PITCH = 24;
const HUMAN_OVAL_WIDTH = huddleVerifyIdentity.humanOvalWidth;
const HUMAN_OVAL_HEIGHT = huddleVerifyIdentity.humanOvalHeight;
const HUMAN_OVAL_RADIUS = huddleVerifyIdentity.humanOvalRadius;
const HUMAN_OVAL_BORDER_WIDTH = huddleVerifyIdentity.humanOvalBorderWidth;
const HUMAN_OVAL_SCRIM_WIDTH = huddleVerifyIdentity.humanOvalScrimWidth;
const HUMAN_DETECTOR_CALLBACK_TIMEOUT_MS = 3500;
const HUMAN_DETECTOR_CALLBACK_HARD_TIMEOUT_MS = 16000;
const HUMAN_CAPTURE_TIMEOUT_MS = 40000;
const HUMAN_STEP_TIMEOUT_MS = 12000;
const HUMAN_NO_FACE_TIMEOUT_MS = 10000;
const HUMAN_BACKEND_SUBMIT_TIMEOUT_MS = 8000;
const HUMAN_CONFIRMATION_DWELL_MS = 650;
const HUMAN_SETTLE_MS = 420;
const HUMAN_STEP_YAW_START_GRACE_MS = 500;
const CARD_SCROLL_TOP_Y = 560;
const PHONE_OTP_OPTIMISTIC_COOLDOWN_SECONDS = 90;
const HUMAN_GUIDE_VIEWBOX_WIDTH = 220;
const HUMAN_GUIDE_WIDTH = HUMAN_OVAL_WIDTH - 26;
const DOCUMENT_READING_MIN_VISIBLE_MS = 1200;
const DOCUMENT_CAMERA_SETTLE_MS = 850;
const DOCUMENT_CAMERA_CAPTURE_TIMEOUT_MS = 6000;
const DOCUMENT_DOB_MONTHS = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
] as const;
const DOCUMENT_COUNTRY_OPTIONS = [
  { code: "AUS", flag: "🇦🇺", label: "Australia" },
  { code: "CAN", flag: "🇨🇦", label: "Canada" },
  { code: "CHN", flag: "🇨🇳", label: "China" },
  { code: "FRA", flag: "🇫🇷", label: "France" },
  { code: "GBR", flag: "🇬🇧", label: "United Kingdom" },
  { code: "HKG", flag: "🇭🇰", label: "Hong Kong" },
  { code: "JPN", flag: "🇯🇵", label: "Japan" },
  { code: "KOR", flag: "🇰🇷", label: "South Korea" },
  { code: "PHL", flag: "🇵🇭", label: "Philippines" },
  { code: "SGP", flag: "🇸🇬", label: "Singapore" },
  { code: "THA", flag: "🇹🇭", label: "Thailand" },
  { code: "TWN", flag: "🇹🇼", label: "Taiwan" },
  { code: "USA", flag: "🇺🇸", label: "United States" },
] as const;
const DOCUMENT_TEST_COUNTRY_CODES = new Set(["UTO"]);
const ISO_ALPHA3_COUNTRY_CODES = new Set([
  "ABW", "AFG", "AGO", "AIA", "ALA", "ALB", "AND", "ARE", "ARG", "ARM", "ASM", "ATA", "ATF", "ATG", "AUS", "AUT", "AZE",
  "BDI", "BEL", "BEN", "BES", "BFA", "BGD", "BGR", "BHR", "BHS", "BIH", "BLM", "BLR", "BLZ", "BMU", "BOL", "BRA",
  "BRB", "BRN", "BTN", "BVT", "BWA", "CAF", "CAN", "CCK", "CHE", "CHL", "CHN", "CIV", "CMR", "COD", "COG", "COK",
  "COL", "COM", "CPV", "CRI", "CUB", "CUW", "CXR", "CYM", "CYP", "CZE", "DEU", "DJI", "DMA", "DNK", "DOM", "DZA",
  "ECU", "EGY", "ERI", "ESH", "ESP", "EST", "ETH", "FIN", "FJI", "FLK", "FRA", "FRO", "FSM", "GAB", "GBR", "GEO",
  "GGY", "GHA", "GIB", "GIN", "GLP", "GMB", "GNB", "GNQ", "GRC", "GRD", "GRL", "GTM", "GUF", "GUM", "GUY", "HKG",
  "HMD", "HND", "HRV", "HTI", "HUN", "IDN", "IMN", "IND", "IOT", "IRL", "IRN", "IRQ", "ISL", "ISR", "ITA", "JAM",
  "JEY", "JOR", "JPN", "KAZ", "KEN", "KGZ", "KHM", "KIR", "KNA", "KOR", "KWT", "LAO", "LBN", "LBR", "LBY", "LCA",
  "LIE", "LKA", "LSO", "LTU", "LUX", "LVA", "MAC", "MAF", "MAR", "MCO", "MDA", "MDG", "MDV", "MEX", "MHL", "MKD",
  "MLI", "MLT", "MMR", "MNE", "MNG", "MNP", "MOZ", "MRT", "MSR", "MTQ", "MUS", "MWI", "MYS", "MYT", "NAM", "NCL",
  "NER", "NFK", "NGA", "NIC", "NIU", "NLD", "NOR", "NPL", "NRU", "NZL", "OMN", "PAK", "PAN", "PCN", "PER", "PHL",
  "PLW", "PNG", "POL", "PRI", "PRK", "PRT", "PRY", "PSE", "PYF", "QAT", "REU", "ROU", "RUS", "RWA", "SAU", "SDN",
  "SEN", "SGP", "SGS", "SHN", "SJM", "SLB", "SLE", "SLV", "SMR", "SOM", "SPM", "SRB", "SSD", "STP", "SUR", "SVK",
  "SVN", "SWE", "SWZ", "SXM", "SYC", "SYR", "TCA", "TCD", "TGO", "THA", "TJK", "TKL", "TKM", "TLS", "TON", "TTO",
  "TUN", "TUR", "TUV", "TWN", "TZA", "UGA", "UKR", "UMI", "URY", "USA", "UZB", "VAT", "VCT", "VEN", "VGB", "VIR",
  "VNM", "VUT", "WLF", "WSM", "YEM", "ZAF", "ZMB", "ZWE",
]);

type IdentityDocumentValues = {
  legalName: string;
  documentCountry: string;
  dob: string;
  documentGender: string | null;
};

type DocumentIdentityState = {
  attemptCount: number;
  confidenceScore: number | null;
  confirmed: IdentityDocumentValues;
  documentType: NativeIdentityDocumentType;
  error: string | null;
  extractionMethod: NativeIdentityExtractionMethod;
  documentExpiresOn: string | null;
  documentLast4: string | null;
  documentNumber: string | null;
  extractedNameEvidence: string[];
  original: IdentityDocumentValues;
  state: "locked" | "idle" | "reading" | "review" | "confirmed";
};

type HumanInstructionCopy = {
  error: string | null;
  heading: string;
  helper: string | null;
};

const normalizeVerifyIdentityPhone = (value: string | null | undefined) => String(value || "").trim().replace(/[^\d+]/g, "");
const emptyDocumentValues = (): IdentityDocumentValues => ({ legalName: "", documentCountry: "", dob: "", documentGender: null });
const createDocumentIdentityState = (documentType: NativeIdentityDocumentType = "passport", state: DocumentIdentityState["state"] = "idle"): DocumentIdentityState => ({
  attemptCount: 0,
  confidenceScore: null,
  confirmed: emptyDocumentValues(),
  documentType,
  error: null,
  extractionMethod: documentType === "passport" ? "mrz" : "ocr",
  documentExpiresOn: null,
  documentLast4: null,
  documentNumber: null,
  extractedNameEvidence: [],
  original: emptyDocumentValues(),
  state,
});

const DATE_DISPLAY_FORMATTER = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const MINIMUM_HUDDLE_AGE = 13;

const padDatePart = (value: number) => String(value).padStart(2, "0");
const daysInDocumentMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const parseStrictDocumentDob = (value: string): { date: Date; display: string; iso: string } | null => {
  const normalized = value.trim().replace(/[./]/g, "-");
  const match = normalized.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!day || !month || !year) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return {
    date,
    display: DATE_DISPLAY_FORMATTER.format(date),
    iso: `${year}-${padDatePart(month)}-${padDatePart(day)}`,
  };
};

const normalizeDocumentDobInput = (value: string): string | null => {
  const normalized = value.trim().replace(/[./]/g, "-");
  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${padDatePart(Number(day))}-${padDatePart(Number(month))}-${year}`;
  }
  const displayMatch = normalized.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})$/);
  if (displayMatch) {
    const [, day, monthName, year] = displayMatch;
    const monthLookup: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
    const month = monthLookup[monthName.slice(0, 4).toLowerCase()] ?? monthLookup[monthName.slice(0, 3).toLowerCase()] ?? 0;
    if (month > 0) return `${padDatePart(Number(day))}-${padDatePart(month)}-${year}`;
  }
  const strictMatch = normalized.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  return strictMatch ? `${padDatePart(Number(strictMatch[1]))}-${padDatePart(Number(strictMatch[2]))}-${strictMatch[3]}` : null;
};

const validateDocumentDob = (value: string): { error: string | null; iso: string | null; display: string | null } => {
  const normalized = normalizeDocumentDobInput(value);
  if (!normalized) {
    return { error: "Use date of birth as DD-MM-YYYY.", iso: null, display: null };
  }
  const parsed = parseStrictDocumentDob(normalized);
  if (!parsed) {
    return { error: "Enter a valid date of birth.", iso: null, display: null };
  }
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  if (parsed.date.getTime() > todayUtc.getTime()) {
    return { error: "Date of birth can't be in the future.", iso: null, display: null };
  }
  const minDate = new Date(Date.UTC(today.getFullYear() - MINIMUM_HUDDLE_AGE, today.getMonth(), today.getDate()));
  if (parsed.date.getTime() > minDate.getTime()) {
    return { error: "You must be 13 or older to use huddle.", iso: null, display: null };
  }
  return { error: null, iso: parsed.iso, display: parsed.display };
};

const validateDocumentExpiry = (value: string | null | undefined): { error: string | null; iso: string | null } => {
  const normalized = normalizeDocumentDobInput(value || "");
  const parsed = normalized ? parseStrictDocumentDob(normalized) : null;
  if (!parsed) return { error: "invalid_document_expiry", iso: null };
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  if (parsed.date.getTime() < todayUtc.getTime()) {
    return { error: "expired_document", iso: null };
  }
  return { error: null, iso: parsed.iso };
};

const getDocumentDobParts = (value: string): { day: number | null; month: number | null; year: number | null } => {
  const normalized = normalizeDocumentDobInput(value);
  const parsed = normalized ? parseStrictDocumentDob(normalized) : null;
  if (!parsed) return { day: null, month: null, year: null };
  return {
    day: parsed.date.getUTCDate(),
    month: parsed.date.getUTCMonth() + 1,
    year: parsed.date.getUTCFullYear(),
  };
};

const formatDocumentDobFromParts = (parts: { day: number | null; month: number | null; year: number | null }) => {
  if (!parts.day || !parts.month || !parts.year) return "";
  return `${padDatePart(parts.day)}-${padDatePart(parts.month)}-${parts.year}`;
};

const getDocumentDobEligibilityCopy = (value: string): string | null => {
  const normalized = normalizeDocumentDobInput(value);
  const parsed = normalized ? parseStrictDocumentDob(normalized) : null;
  if (!parsed) return null;
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const sixteenDate = new Date(Date.UTC(todayUtc.getUTCFullYear() - 16, todayUtc.getUTCMonth(), todayUtc.getUTCDate()));
  const eighteenDate = new Date(Date.UTC(todayUtc.getUTCFullYear() - 18, todayUtc.getUTCMonth(), todayUtc.getUTCDate()));
  if (parsed.date.getTime() > sixteenDate.getTime()) return "You must be 16 or older to meet new friends in Chats.";
  if (parsed.date.getTime() > eighteenDate.getTime()) return "You must be 18 or older to become a Pet Carer in huddle.";
  return null;
};

const resolveDocumentCountry = (value: string, options?: { allowTestCountry?: boolean }): string => {
  const normalized = value.trim().toUpperCase();
  if (ISO_ALPHA3_COUNTRY_CODES.has(normalized)) return normalized;
  if (options?.allowTestCountry && DOCUMENT_TEST_COUNTRY_CODES.has(normalized)) return normalized;
  const direct = DOCUMENT_COUNTRY_OPTIONS.find((option) => option.code === normalized);
  if (direct) return direct.code;
  const byLabel = DOCUMENT_COUNTRY_OPTIONS.find((option) => option.label.toUpperCase() === normalized);
  return byLabel?.code ?? "";
};

const inferDocumentCountryFromOcr = (lines: string[]) => {
  const normalizedText = lines.join(" ").replace(/\s+/g, " ").trim().toUpperCase();
  if (
    normalizedText.includes("HONG KONG") ||
    normalizedText.includes("HKSAR") ||
    normalizedText.includes("SPECIAL ADMINISTRATIVE REGION") ||
    normalizedText.includes("香港")
  ) {
    return "HKG";
  }
  return DOCUMENT_COUNTRY_OPTIONS.find((option) => (
    normalizedText.includes(option.code) || normalizedText.includes(option.label.toUpperCase())
  ))?.code ?? "";
};

const inferPassportJurisdictionFromOcr = (mrzCountry: string, lines: string[]) => {
  const jurisdiction = resolvePassportDocumentCountryFromText(mrzCountry, lines);
  return resolveDocumentCountry(jurisdiction);
};

const resolveConfirmDocumentCountry = (value: string, proofMode: boolean) =>
  resolveDocumentCountry(value, { allowTestCountry: proofMode || __DEV__ });


const deleteLocalDocumentCapture = async (uri: string | null | undefined) => {
  const normalized = String(uri || "").trim();
  if (!normalized || /^https?:\/\//i.test(normalized)) return;
  if (normalized.startsWith("content://")) {
    await FileSystem.StorageAccessFramework.deleteAsync(normalized, { idempotent: true }).catch(() => undefined);
    return;
  }
  const fileUri = normalized.startsWith("file://") ? normalized : `file://${normalized}`;
  await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
};

const getUniqueIdentityNameEvidence = (...values: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  return values.map((value) => String(value || "").trim()).filter((value) => {
    const key = normalizeIdentityNameMatchToken(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const waitForMinimumVisibleTime = async (startedAt: number, minimumMs: number) => {
  const remaining = minimumMs - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
};

const formatDocumentRetryCopy = (attempt: number, copy: string) => {
  if (attempt >= 2) return `Still couldn't read your details. ${copy}`;
  return copy;
};

const findDocumentDobCandidate = (lines: string[]) => {
  const labeled = lines.find((line) => /\b(date\s+of\s+birth|birth|dob|出生日期)\b/i.test(line));
  const candidates = [labeled, ...lines].filter(Boolean) as string[];
  for (const line of candidates) {
    const match =
      line.match(/\b(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/) ??
      line.match(/\b\d{1,2}[-/.]\d{1,2}[-/.](19|20)\d{2}\b/) ??
      line.match(/\b\d{1,2}\s+[A-Za-z]{3,9}\s+(19|20)\d{2}\b/);
    if (match?.[0]) return match[0];
  }
  return "";
};

const ID_NAME_LABEL_PATTERN = /\b(name\s+in\s+english|english\s+name|full\s+name|surname|given\s+name|name)\b|英文姓名/i;
const ID_SURNAME_LABEL_PATTERN = /\b(sur\s*name|surname|family\s+name|last\s+name)\b/i;
const ID_GIVEN_NAME_LABEL_PATTERN = /\b(given\s+names?|given\s+name|first\s+names?|first\s+name|forenames?)\b/i;
const ID_NON_NAME_PATTERN = /\b(HONG\s*KONG|HONG|KONG|HKID|HKSAR|CHINA|CHINESE|PERMANENT|IDENTITY|IDENTIFICATION|CARD|REGION|REGIONAL|ADMINISTRATIVE|RATIVE|PEOPLE|REPUBL(?:IC|AC)|REPUBLIC|GOVERNMENT|IMMIGRATION|DEPARTMENT|DATE|BIRTH|DOB|SEX|NATIONALITY|COUNTRY|PASSPORT|EXPIRY|ISSUE|SIGNATURE|HOLDER|SYMBOL|RESIDENT|VALID|NUMBER|NO\.?)\b|香港|身份|姓名|出生|性別|國籍/;
type IdentityNameCandidateSource = "labeled_same_line" | "after_label" | "fallback" | "surname_given";
type IdentityNameCandidate = { name: string; score: number; source: IdentityNameCandidateSource };

const stripIdentityNameNoiseTokens = (value: string) => {
  const tokens = value.split(/[\s,]+/).filter(Boolean);
  const strongTokens = tokens.filter((token) => token.replace(/[^A-Za-z]/g, "").length >= 2);
  if (tokens.length < 3 || strongTokens.length < 2) return value;
  return tokens.filter((token) => token.replace(/[^A-Za-z]/g, "").length > 1).join(" ");
};

const normalizeOcrNameCandidate = (line: string) => {
  return stripIdentityNameNoiseTokens(line
    .replace(ID_NAME_LABEL_PATTERN, " ")
    .replace(/^[^A-Za-z]+/, "")
    .replace(/[^A-Za-z\s.'’,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim());
};

const scoreOcrLegalNameCandidate = (line: string, source: IdentityNameCandidateSource): IdentityNameCandidate | null => {
  const candidate = normalizeOcrNameCandidate(line);
  const upper = candidate.toUpperCase();
  const tokens = candidate.split(/[\s,]+/).filter(Boolean);
  const strongTokens = tokens.filter((token) => token.replace(/[^A-Za-z]/g, "").length >= 2);

  if (candidate.length < 5 || candidate.length > 70) return null;
  if (/\d/.test(candidate)) return null;
  if (!/^[A-Za-z][A-Za-z\s.'’,-]+$/.test(candidate)) return null;
  if (ID_NON_NAME_PATTERN.test(upper)) return null;
  if (strongTokens.length < 2) return null;
  if (tokens.length > 7) return null;

  let score = source === "surname_given" ? 115 : source === "labeled_same_line" ? 100 : source === "after_label" ? 90 : 45;
  if (candidate.includes(",")) score += 8;
  if (/^[A-Z][A-Z\s.'’,-]+$/.test(candidate)) score += 6;
  if (tokens.length >= 2 && tokens.length <= 4) score += 8;
  if (tokens.some((token) => token.length === 1)) score -= 12;
  if (upper === upper.replace(/[^A-Z]/g, " ").replace(/\s+/g, " ").trim()) score -= 4;

  return { name: candidate, score, source };
};

const isConstrainedHkidNameFallback = (candidate: IdentityNameCandidate) => {
  if (candidate.source !== "fallback") return false;
  const tokens = candidate.name.split(/[\s,]+/).filter(Boolean);
  if (tokens.length < 3 || tokens.length > 4) return false;
  if (ID_NON_NAME_PATTERN.test(candidate.name.toUpperCase())) return false;
  return tokens.every((token) => {
    const letters = token.replace(/[^A-Za-z]/g, "");
    return token === letters && /^[A-Za-z]{2,14}$/.test(letters) && !/^([A-Za-z])\1{3,}$/.test(letters);
  });
};

const normalizeIdentityNameEvidenceKey = (value: string) => value.replace(/[^A-Za-z]+/g, " ").trim().replace(/\s+/g, " ").toUpperCase();

const hasCorroboratedFallbackName = (candidate: IdentityNameCandidate, textLines?: NativeIdentityOcrTextLine[]) => {
  const expected = normalizeIdentityNameEvidenceKey(candidate.name);
  if (!expected || !textLines?.length) return false;
  const sourceLabels = new Set<string>();
  textLines.forEach((line) => {
    if (normalizeIdentityNameEvidenceKey(line.text) === expected) {
      sourceLabels.add(line.sourceLabel);
    }
  });
  return sourceLabels.size >= 2;
};

const normalizeOcrNameFieldValue = (line: string, labelPattern?: RegExp) => {
  const withoutLabel = labelPattern ? line.replace(labelPattern, " ") : line;
  const candidate = stripIdentityNameNoiseTokens(withoutLabel
    .replace(/^[^A-Za-z]+/, "")
    .replace(/[^A-Za-z\s.'’,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim());
  if (!candidate || candidate.length > 45 || /\d/.test(candidate)) return "";
  if (ID_NON_NAME_PATTERN.test(candidate.toUpperCase())) return "";
  if (!/^[A-Za-z][A-Za-z\s.'’,-]*$/.test(candidate)) return "";
  const tokens = candidate.split(/[\s,]+/).filter(Boolean);
  if (tokens.length > 4) return "";
  if (!tokens.some((token) => token.replace(/[^A-Za-z]/g, "").length >= 2)) return "";
  return candidate;
};

const findNameFieldValueNearLabel = (lines: string[], labelIndex: number, labelPattern: RegExp) => {
  const sameLineValue = normalizeOcrNameFieldValue(lines[labelIndex], labelPattern);
  if (sameLineValue) return sameLineValue;
  for (let index = labelIndex + 1; index < Math.min(lines.length, labelIndex + 4); index += 1) {
    const line = lines[index];
    if (ID_SURNAME_LABEL_PATTERN.test(line) || ID_GIVEN_NAME_LABEL_PATTERN.test(line)) {
      break;
    }
    const value = normalizeOcrNameFieldValue(line);
    if (value) return value;
    if (ID_NON_NAME_PATTERN.test(line.toUpperCase())) break;
  }
  return "";
};

const findSurnameGivenNameCandidate = (lines: string[]): IdentityNameCandidate | null => {
  for (let surnameIndex = 0; surnameIndex < lines.length; surnameIndex += 1) {
    if (!ID_SURNAME_LABEL_PATTERN.test(lines[surnameIndex])) continue;
    const surname = findNameFieldValueNearLabel(lines, surnameIndex, ID_SURNAME_LABEL_PATTERN);
    if (!surname) continue;
    const givenSearchEnd = Math.min(lines.length, surnameIndex + 8);
    for (let givenIndex = surnameIndex + 1; givenIndex < givenSearchEnd; givenIndex += 1) {
      if (!ID_GIVEN_NAME_LABEL_PATTERN.test(lines[givenIndex])) continue;
      const givenNames = findNameFieldValueNearLabel(lines, givenIndex, ID_GIVEN_NAME_LABEL_PATTERN);
      if (!givenNames) continue;
      const candidate = scoreOcrLegalNameCandidate(`${surname} ${givenNames}`, "surname_given");
      if (candidate) return candidate;
    }
  }
  return null;
};

const getOcrNameLineWindows = (lines: string[], startIndex: number, maxLines: number) => {
  const windows: string[] = [];
  for (let count = 1; count <= maxLines; count += 1) {
    const segment = lines.slice(startIndex, startIndex + count);
    if (segment.length !== count) break;
    if (segment.some((line) => ID_NON_NAME_PATTERN.test(line.toUpperCase()))) break;
    windows.push(segment.join(" "));
  }
  return windows;
};

const findIdentityLegalNameCandidate = (lines: string[], textLines?: NativeIdentityOcrTextLine[]) => {
  const candidates: IdentityNameCandidate[] = [];
  const surnameGivenCandidate = findSurnameGivenNameCandidate(lines);
  if (surnameGivenCandidate) candidates.push(surnameGivenCandidate);
  lines.forEach((line, index) => {
    if (ID_NAME_LABEL_PATTERN.test(line)) {
      const sameLine = scoreOcrLegalNameCandidate(line, "labeled_same_line");
      if (sameLine) candidates.push(sameLine);
      for (const nextCandidateText of getOcrNameLineWindows(lines, index + 1, 4)) {
        const nextCandidate = scoreOcrLegalNameCandidate(nextCandidateText, "after_label");
        if (nextCandidate) candidates.push(nextCandidate);
      }
    }
    const fallback = scoreOcrLegalNameCandidate(line, "fallback");
    if (fallback && isConstrainedHkidNameFallback(fallback)) candidates.push(fallback);
  });

  candidates.sort((left, right) => right.score - left.score);
  const strong = candidates.find((candidate) => candidate.score >= 70);
  if (strong) return strong.name;
  return candidates.find((candidate) => (
    isConstrainedHkidNameFallback(candidate) &&
    hasCorroboratedFallbackName(candidate, textLines)
  ))?.name ?? "";
};

const getUpperNameTokens = (value: string) => value
  .split(/[\s,]+/)
  .map((token) => token.replace(/[^A-Za-z]/g, "").toUpperCase())
  .filter(Boolean);

const hasWeakNameToken = (value: string) => getUpperNameTokens(value).some((token) => token.length === 1);

const normalizeIdentityNameMatchToken = (value: string) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^A-Za-z0-9]+/g, " ")
  .trim()
  .toUpperCase();

const getIdentityNameMatchTokens = (value: string) => normalizeIdentityNameMatchToken(value)
  .split(/\s+/)
  .map((token) => token.replace(/[^A-Z0-9]/g, ""))
  .filter((token) => token.length > 1);

const uniqueIdentityNameTokens = (tokens: string[]) => Array.from(new Set(tokens));
const countIdentityNameTokenOverlap = (left: string[], right: string[]) => {
  const rightSet = new Set(right);
  return uniqueIdentityNameTokens(left).filter((token) => rightSet.has(token)).length;
};

const evaluateIdentityLegalNameMatch = (enteredName: string, evidenceNames: string[], options?: { allowSubset?: boolean; allowTokenOrder?: boolean }) => {
  const enteredNormalized = normalizeIdentityNameMatchToken(enteredName);
  const evidenceNormalized = Array.from(new Set(evidenceNames.map(normalizeIdentityNameMatchToken).filter(Boolean)));
  const enteredTokens = uniqueIdentityNameTokens(getIdentityNameMatchTokens(enteredNormalized));
  if (enteredTokens.length < 2 || evidenceNormalized.length < 1) {
    return { matched: false, method: "insufficient_tokens", score: 0 };
  }
  let best = { matched: false, method: "clear_mismatch", score: 0 };
  for (const candidate of evidenceNormalized) {
    if (candidate === enteredNormalized) return { matched: true, method: "normalized_exact", score: 100 };
    if (!options?.allowTokenOrder && !options?.allowSubset) continue;

    const evidenceTokens = uniqueIdentityNameTokens(getIdentityNameMatchTokens(candidate));
    if (evidenceTokens.length < 2) continue;
    const overlap = countIdentityNameTokenOverlap(enteredTokens, evidenceTokens);
    const allEnteredTokensFound = overlap === enteredTokens.length;
    const allEvidenceTokensFound = overlap === evidenceTokens.length;

    if (options?.allowTokenOrder && allEnteredTokensFound && allEvidenceTokensFound) {
      best = { matched: true, method: "token_order_equivalent", score: Math.max(best.score, 96) };
      continue;
    }

    const subsetSafe =
      options?.allowSubset &&
      allEnteredTokensFound &&
      evidenceTokens.length <= 4 &&
      enteredTokens.length >= 2 &&
      overlap >= 2;
    if (subsetSafe && best.score < 84) {
      best = { matched: true, method: "entered_name_subset", score: 84 };
    }
  }
  return best;
};

const getDocumentNumberLast4 = (value: string | null | undefined) => {
  const normalized = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.length >= 4 ? normalized.slice(-4) : null;
};

const resolvePassportLegalName = (mrzLegalName: string, lines: string[], textLines?: NativeIdentityOcrTextLine[]) => {
  const cleaned = getIdentityOcrParseLines(lines, textLines);
  const geometryRepair = textLines?.length ? resolvePassportLegalNameFromGeometryOcr(mrzLegalName, textLines) : null;
  const repair = geometryRepair ?? resolvePassportLegalNameFromOcr(mrzLegalName, cleaned);
  const mrzTokens = getUpperNameTokens(mrzLegalName);
  const mrzNameInsufficient = mrzTokens.length < 2 || hasWeakNameToken(mrzLegalName);
  const geometryDiagnostics = textLines?.length
    ? getPassportGeometryNameDiagnostics(mrzLegalName, textLines)
    : null;
  nativeVerifyReleaseLog("passport_name_repair_result", {
    attempted: repair.attempted || mrzNameInsufficient,
    candidateCount: repair.candidateCount,
    fallbackUsed: repair.repaired,
    geometry: geometryDiagnostics,
    mrzNameInsufficient,
    nameSource: repair.repairSource,
    repaired: repair.repaired,
    sourceTokenCount: repair.sourceTokenCount,
  });
  return repair.legalName;
};

const describeIdentityNameCandidatesForLog = (lines: string[]) => {
  const candidates: Array<{ charCount: number; hasComma: boolean; masked?: string; score: number; source: string; tokenCount: number }> = [];
  let labelCount = 0;
  const maskNameCandidate = (name: string) => name.split(/(\s+|,|-)/).map((part) => {
    if (!/[A-Za-z]/.test(part)) return part;
    const letters = part.replace(/[^A-Za-z]/g, "");
    if (letters.length <= 1) return "*";
    return `${letters[0].toUpperCase()}${"*".repeat(Math.min(letters.length - 1, 4))}`;
  }).join("");
  const pushCandidate = (source: string, candidate: IdentityNameCandidate | null) => {
    if (!candidate) return;
    candidates.push({
      charCount: candidate.name.length,
      hasComma: candidate.name.includes(","),
      masked: maskNameCandidate(candidate.name),
      score: candidate.score,
      source,
      tokenCount: candidate.name.split(/[\s,]+/).filter(Boolean).length,
    });
  };

  pushCandidate("surname_given", findSurnameGivenNameCandidate(lines));
  lines.forEach((line, index) => {
    if (ID_NAME_LABEL_PATTERN.test(line)) {
      labelCount += 1;
      pushCandidate("labeled_same_line", scoreOcrLegalNameCandidate(line, "labeled_same_line"));
      for (const nextCandidateText of getOcrNameLineWindows(lines, index + 1, 4)) {
        pushCandidate("after_label", scoreOcrLegalNameCandidate(nextCandidateText, "after_label"));
      }
    }
    pushCandidate("fallback", scoreOcrLegalNameCandidate(line, "fallback"));
  });

  candidates.sort((left, right) => right.score - left.score);
  return {
    candidateCount: candidates.length,
    labelCount,
    topCandidates: candidates.slice(0, 6),
  };
};

const getIdentityOcrParseLines = (lines: string[], textLines?: NativeIdentityOcrTextLine[]) => {
  const combined = [
    ...lines,
    ...(textLines ?? []).map((line) => line.text),
  ];
  const seen = new Set<string>();
  return combined.map((line) => line.trim()).filter((line) => {
    const normalized = line.replace(/\s+/g, " ");
    if (normalized.length < 2 || seen.has(normalized.toUpperCase())) return false;
    seen.add(normalized.toUpperCase());
    return true;
  });
};

const inferIdentityDetailsFromOcr = (lines: string[], textLines?: NativeIdentityOcrTextLine[]): IdentityDocumentValues | null => {
  const cleaned = getIdentityOcrParseLines(lines, textLines);
  const dob = normalizeDocumentDobInput(findDocumentDobCandidate(cleaned)) ?? "";
  const legalName = findIdentityLegalNameCandidate(cleaned, textLines);
  if (!dob || !legalName) return null;
  return {
    legalName,
    documentCountry: inferDocumentCountryFromOcr(cleaned),
    dob,
    documentGender: findIdentityDocumentGenderFromOcr(cleaned),
  };
};

const isDefinitiveHumanSubmitRejection = (error: unknown): boolean => {
  const candidate = error as { code?: unknown; message?: unknown; status?: unknown } | null;
  const code = String(candidate?.code || candidate?.message || error || "").toLowerCase();
  return (
    code.includes("invalid_verification_result") ||
    code.includes("challenge_expired") ||
    code.includes("attempt_not_found") ||
    code.includes("invalid_transition") ||
    code.includes("missing_attempt_id")
  );
};

const withNativeVerifyIdentityTimeout = async <T,>(
  task: Promise<T>,
  timeoutMs: number,
  code: string,
): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(code)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const HUMAN_DETECTOR_CONFIG = {
  centerHoldMs: HUMAN_CENTER_HOLD_MS,
  centerYawMax: HUMAN_CENTER_YAW_MAX,
  faceMaxPitch: HUMAN_FACE_MAX_PITCH,
  faceMaxRoll: HUMAN_FACE_MAX_ROLL,
  faceMaxWidthRatio: HUMAN_FACE_MAX_WIDTH_RATIO,
  faceMinWidthRatio: HUMAN_FACE_MIN_WIDTH_RATIO,
  ovalHeight: HUMAN_OVAL_HEIGHT,
  ovalWidth: HUMAN_OVAL_WIDTH,
  sideHoldMs: HUMAN_SIDE_HOLD_MS,
  sideYawMin: HUMAN_SIDE_YAW_MIN,
};

const nativeHumanDevLog = (label: string, payload: Record<string, unknown>) => {
  if (!__DEV__) return;
  console.log(`[NativeVerifyIdentity.human.${label}]`, payload);
};

const nativeHumanStartupLog = (label: string, payload: Record<string, unknown>) => {
  if (!__DEV__) return;
  console.info(`[NativeVerifyIdentity.human.startup.${label}]`, payload);
};

const nativeVerifyReleaseLog = (label: string, payload?: Record<string, unknown>) => {
  if (!__DEV__) return;
  const nextPayload = payload ?? {};
  try {
    logNativeVerifyIdentity(label, JSON.stringify(nextPayload));
  } catch {
    // Console fallback still helps in dev clients where the native helper is unavailable.
  }
  console.warn(`[HUDDLE_VERIFY_IDENTITY] ${label}`, nextPayload);
};

const summarizeHumanDetectionForLog = (
  state: NativeHumanDetectionState,
  extra: Record<string, unknown> = {},
) => {
  const movement = getNativeHumanMovementMetrics(state);
  return {
    callbackFrames: state.callbackFrames,
    centerFrames: state.centerFrames,
    centerPassed: state.centerPassedAtMs > 0,
    firstYawSign: state.firstYawSign,
    horizontalShift: Number(movement.horizontalShift.toFixed(3)),
    lastRejectReason: state.lastRejectReason,
    leftFrames: state.sideOneFrames,
    leftPassed: state.sideOnePassedAtMs > 0,
    leftTravel: Number(movement.leftTravel.toFixed(3)),
    maxSideOneYaw: Number(state.maxSideOneYaw.toFixed(1)),
    maxSideTwoYaw: Number(state.maxSideTwoYaw.toFixed(1)),
    maxYaw: Number(state.maxYaw.toFixed(1)),
    minYaw: Number(state.minYaw.toFixed(1)),
    noFaceFrames: state.noFaceFrames,
    rejectedFrames: state.rejectedFrames,
    rightFrames: state.sideTwoFrames,
    rightPassed: state.sideTwoPassedAtMs > 0,
    rightTravel: Number(movement.rightTravel.toFixed(3)),
    stableFaceFrames: state.stableFaceFrames,
    totalFrames: state.totalFrames,
    ...extra,
  };
};

const shouldAllowRawDocumentCameraFallback = () => __DEV__ || process.env.EXPO_PUBLIC_IDENTITY_CAMERA_FALLBACK === "1";

const getNativeErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error || "unknown");
};

const describeDocumentCaptureUri = (uri: string) => ({
  hasUri: Boolean(uri),
  uriScheme: uri.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)?.[1] ?? "path",
});

const getHumanMonotonicNowMs = () => {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  return Date.now();
};

const withHumanSubmitTimeout = async <T,>(promise: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("human_submit_timeout")), HUMAN_BACKEND_SUBMIT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export function NativeVerifyIdentityScreen({
  initialActiveCard = null,
  initialSession = null,
  proofMode = false,
  hideProfileFooter = false,
  profileContinuePath = "/signup?resume=quickProfile",
  profileContinueLabel,
  sessionKey = null,
  userId = null,
  onBack,
  onCancelSignup,
  onNavigate,
  onOpenSupport,
}: {
  initialActiveCard?: ActiveCard;
  initialSession?: Session | null;
  proofMode?: boolean;
  hideProfileFooter?: boolean;
  profileContinuePath?: string;
  profileContinueLabel?: string;
  sessionKey?: string | null;
  userId?: string | null;
  onBack?: () => void;
  onCancelSignup?: () => void;
  onNavigate?: (path: string) => void;
  onOpenSupport?: (intent: typeof NATIVE_BLOCKED_IDENTITY_SUPPORT_INTENT) => void;
}) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const documentCameraRef = useRef<VisionCameraType | null>(null);
  const [humanCameraPermissionStatus, setHumanCameraPermissionStatus] = useState<CameraPermissionStatus>("not-determined");
  const [showVerifyIntro, setShowVerifyIntro] = useState(false);
  const faceDetectionOptions = useRef<FrameFaceDetectionOptions>({
    performanceMode: "fast",
    landmarkMode: "none",
    contourMode: "none",
    classificationMode: "none",
    minFaceSize: 0.1,
    trackingEnabled: false,
    cameraFacing: "front",
    autoMode: false,
  }).current;
  const humanDetectionRef = useRef<NativeHumanDetectionState>(createNativeHumanDetectionState());
  const humanPreviewLayoutRef = useRef({ width: 0, height: 0 });
  const humanStepStartedAtRef = useRef(getHumanMonotonicNowMs());
  const humanConfirmationDwellRef = useRef<HumanConfirmationDwell>(null);
  const humanSettleRef = useRef<HumanSettlePhase>(null);
  const humanDwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const humanSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const humanDwellGenerationRef = useRef(0);
  const humanPassSubmitInFlightRef = useRef(false);
  const documentCaptureUriRef = useRef<string | null>(null);
  const confirmingDocumentRef = useRef(false);
  const phoneVerifyInFlightRef = useRef(false);
  const currentScrollYRef = useRef(0);
  const documentLegalNameScreenYRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const seen = await isNativeCoachMarkSeen(userId, "verify_identity_intro");
      if (cancelled || seen) return;
      // This treatment belongs to the first page entry, rather than its
      // dismissal. Persist before presenting so a remount or app restart
      // cannot turn the same user into a second first visit.
      await markNativeCoachMarkSeen(userId, "verify_identity_intro");
      if (!cancelled) setShowVerifyIntro(true);
    })();
    return () => { cancelled = true; };
  }, [userId]);
  const documentEnteredLegalNameRef = useRef("");
  const activeCardRef = useRef<ActiveCard>(proofMode ? initialActiveCard : null);
  const humanStateNameRef = useRef<NativeVerifyIdentityHumanState["state"]>("idle");
  const [humanPoseStep, setHumanPoseStep] = useState<HumanPoseStep>("center");
  const [humanCompletedSteps, setHumanCompletedSteps] = useState<HumanCompletedSteps>({ center: false, left: false, right: false });
  const [humanConfirmationDwell, setHumanConfirmationDwell] = useState<HumanConfirmationDwell>(null);
  const [humanSettle, setHumanSettle] = useState<HumanSettlePhase>(null);
  const [humanDetectorStartupState, setHumanDetectorStartupState] = useState<HumanDetectorStartupState>("permission_not_requested");
  const [humanFaceStatus, setHumanFaceStatus] = useState("Center your face in the oval.");
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const prototypeEnabled = true;
  const [snapshot, setSnapshot] = useState<NativeVerifyIdentitySnapshot | null>(null);
  const [profileStatus, setProfileStatus] = useState<NativeVerifyIdentityProfileStatus | null>(null);
  // Never present the default local state as a real verification result. A
  // cached server result can render immediately; otherwise the header remains
  // Loading until the authoritative refresh returns.
  const [identityStatusReady, setIdentityStatusReady] = useState(proofMode);
  const [phone, setPhone] = useState(proofMode && initialActiveCard === "phone" ? "+1 555 012 3456" : "");
  const [otpCode, setOtpCode] = useState(proofMode && initialActiveCard === "phone" ? "123456" : "");
  const [phoneState, setPhoneState] = useState<NativeVerifyIdentityPhoneOtpState>(() => createProofPhoneState(proofMode, initialActiveCard));
  const [documentState, setDocumentState] = useState<DocumentIdentityState>(() => createDocumentIdentityState("passport", proofMode ? "review" : "idle"));
  const selectedDocumentTypeRef = useRef<NativeIdentityDocumentType>("passport");
  const [documentCameraOpen, setDocumentCameraOpen] = useState(false);
  const [humanState, setHumanState] = useState<NativeVerifyIdentityHumanState>(() => createProofHumanState(proofMode, initialActiveCard));
  const [humanStartPending, setHumanStartPending] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeCard, setActiveCard] = useState<ActiveCard>(proofMode ? initialActiveCard : null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [phoneChangePromptOpen, setPhoneChangePromptOpen] = useState(false);
  const [pendingPhoneValue, setPendingPhoneValue] = useState<string | null>(null);
  const [verifiedPhoneEditConfirmed, setVerifiedPhoneEditConfirmed] = useState(false);
  useEffect(() => {
    selectedDocumentTypeRef.current = documentState.documentType;
    documentEnteredLegalNameRef.current = documentState.confirmed.legalName;
  }, [documentState.confirmed.legalName, documentState.documentType]);

  useEffect(() => {
    setNativeVerifyIdentitySessionFallback(initialSession);
    nativeVerifyReleaseLog("screen_mounted", {
      hasInitialSession: Boolean(initialSession),
      proofMode,
    });
  }, [initialSession?.access_token, initialSession?.refresh_token, proofMode]);

  const prefillProfilePhone = String(profileStatus?.phone || "").trim();
  useEffect(() => {
    if (proofMode || !prefillProfilePhone || phone.trim()) return;
    setPhone(prefillProfilePhone);
    setPhoneState((current) => reduceNativeVerifyIdentityPhoneOtpState(current, {
      type: "phone_changed",
      phone: prefillProfilePhone,
    }));
  }, [phone, prefillProfilePhone, proofMode]);

  const locked = !prototypeEnabled;
  const currentPhoneKey = normalizeVerifyIdentityPhone(phone || phoneState.phone);
  const profilePhoneKey = normalizeVerifyIdentityPhone(profileStatus?.phone);
  const profilePhoneMatchesCurrent = Boolean(profilePhoneKey && (!currentPhoneKey || currentPhoneKey === profilePhoneKey));
  const phoneVerified = phoneState.state === "verified" || (profileStatus?.phoneVerificationStatus === "verified" && profilePhoneMatchesCurrent);
  // V9: haptic when phone becomes verified (catches AppState resume → background-verified case too)
  const phoneVerifiedRef = useRef(phoneVerified);
  useEffect(() => {
    if (!phoneVerifiedRef.current && phoneVerified) {
      haptic.success();
    }
    phoneVerifiedRef.current = phoneVerified;
  }, [phoneVerified]);
  const savedHumanPassed = snapshot?.humanStatus === "passed" || profileStatus?.humanStatus === "passed";
  const savedDocumentConfirmed = snapshot?.identityDocumentStatus === "confirmed" || profileStatus?.identityDocumentStatus === "confirmed";
  const humanPassed = humanState.state === "passed" || savedHumanPassed;
  const documentConfirmed = documentState.state === "confirmed" || savedDocumentConfirmed;
  const effectiveHumanState: NativeVerifyIdentityHumanState = savedHumanPassed && humanState.state !== "capturing"
    ? { ...humanState, state: "passed", loading: false, error: null, failure: null }
    : humanState;
  const blockedIdentity = snapshot?.blockedIdentity ?? null;
  // The refreshed snapshot invokes the server-side reconciler.  A profile
  // flag read on its own can be stale, so it must never outrank the three
  // persisted checks or that authoritative result.
  const localChecksComplete = phoneVerified && humanPassed && documentConfirmed;
  const serverVerified = snapshot?.verificationStatus === "verified";
  const identityFullyVerified = serverVerified || localChecksComplete;
  const effectiveHumanPassed = identityFullyVerified || humanPassed;
  const effectiveDocumentConfirmed = identityFullyVerified || documentConfirmed;
  const effectivePhoneVerified = identityFullyVerified || phoneVerified;
  const effectiveOverallStatus = identityFullyVerified
    ? "verified"
    : (phoneVerified || humanPassed || documentConfirmed ? "pending" : "unverified");
  const activeStep: VerifyIdentityStep = effectiveHumanPassed ? (effectiveDocumentConfirmed ? (effectivePhoneVerified ? "final" : "phone") : "document") : "human";
  const recommendedCard: Exclude<ActiveCard, null> = activeStep === "final" ? "phone" : activeStep;

  const setError = useCallback((message: string | null) => {
    setScreenError(message);
  }, []);

  useEffect(() => {
    if (!identityFullyVerified || activeCard !== "human") return;
    setActiveCard(null);
  }, [activeCard, identityFullyVerified]);

  const setHumanDwell = useCallback((next: HumanConfirmationDwell) => {
    if (!next && humanDwellTimerRef.current) {
      clearTimeout(humanDwellTimerRef.current);
      humanDwellTimerRef.current = null;
    }
    humanConfirmationDwellRef.current = next;
    setHumanConfirmationDwell(next);
  }, []);

  const setHumanSettlePhase = useCallback((next: HumanSettlePhase) => {
    if (!next && humanSettleTimerRef.current) {
      clearTimeout(humanSettleTimerRef.current);
      humanSettleTimerRef.current = null;
    }
    humanSettleRef.current = next;
    setHumanSettle(next);
  }, []);

  const resetHumanStepEvaluation = useCallback((step: HumanPoseStep, mode: "full" | "step" = "step") => {
    const detection = humanDetectionRef.current;
    detection.noFaceFrames = 0;
    detection.rejectedFrames = 0;
    detection.stepStableMs = 0;
    detection.lastRejectReason = null;
    if (mode === "full" || step === "center") {
      detection.centerFrames = 0;
      detection.centerValidSinceMs = 0;
      if (mode === "full") detection.centerPassedAtMs = 0;
    }
    if (mode === "full" || step === "left") {
      detection.sideOneFrames = 0;
      detection.sideOneValidSinceMs = 0;
      if (mode === "full") {
        detection.sideOnePassedAtMs = 0;
        detection.maxSideOneYaw = 0;
      }
      detection.firstYawSign = 0;
    }
    if (mode === "full" || step === "right") {
      detection.sideTwoFrames = 0;
      detection.sideTwoValidSinceMs = 0;
      if (mode === "full") {
        detection.sideTwoPassedAtMs = 0;
        detection.maxSideTwoYaw = 0;
      }
    }
  }, []);

  const resetHumanRuntimeState = useCallback(() => {
    humanDwellGenerationRef.current += 1;
    if (humanDwellTimerRef.current) {
      clearTimeout(humanDwellTimerRef.current);
      humanDwellTimerRef.current = null;
    }
    if (humanSettleTimerRef.current) {
      clearTimeout(humanSettleTimerRef.current);
      humanSettleTimerRef.current = null;
    }
    humanDetectionRef.current = createNativeHumanDetectionState();
    humanStepStartedAtRef.current = getHumanMonotonicNowMs();
    setHumanDwell(null);
    setHumanSettlePhase(null);
    setHumanCompletedSteps({ center: false, left: false, right: false });
    setHumanPoseStep("center");
  }, [setHumanDwell, setHumanSettlePhase]);

  useEffect(() => {
    activeCardRef.current = activeCard;
    if (activeCard !== "human") {
      humanDwellGenerationRef.current += 1;
      setHumanDwell(null);
      setHumanSettlePhase(null);
    }
  }, [activeCard, setHumanDwell, setHumanSettlePhase]);

  useEffect(() => {
    humanStateNameRef.current = humanState.state;
    if (humanState.state !== "capturing") {
      humanDwellGenerationRef.current += 1;
      setHumanDwell(null);
      setHumanSettlePhase(null);
    }
  }, [humanState.state, setHumanDwell, setHumanSettlePhase]);

  useEffect(() => () => {
    humanDwellGenerationRef.current += 1;
    void deleteLocalDocumentCapture(documentCaptureUriRef.current);
    documentCaptureUriRef.current = null;
    setDocumentCameraOpen(false);
    if (humanDwellTimerRef.current) {
      clearTimeout(humanDwellTimerRef.current);
      humanDwellTimerRef.current = null;
    }
    if (humanSettleTimerRef.current) {
      clearTimeout(humanSettleTimerRef.current);
      humanSettleTimerRef.current = null;
    }
    humanConfirmationDwellRef.current = null;
    humanSettleRef.current = null;
  }, []);

  useEffect(() => {
    if (proofMode) {
      setPhone(initialActiveCard === "phone" ? "+1 555 012 3456" : "");
      setOtpCode(initialActiveCard === "phone" ? "123456" : "");
      setPhoneState(createProofPhoneState(true, initialActiveCard));
      setHumanState(createProofHumanState(true, initialActiveCard));
      setDocumentState({
        ...createDocumentIdentityState("passport", "review"),
        original: { legalName: "Jane Adeline Doe", documentCountry: "UTO", dob: "1992-04-17", documentGender: "Woman" },
        confirmed: { legalName: "Jane Adeline Doe", documentCountry: "UTO", dob: "1992-04-17", documentGender: "Woman" },
      });
      setScreenError(null);
      resetHumanRuntimeState();
    }
    setActiveCard(initialActiveCard);
  }, [initialActiveCard, proofMode, resetHumanRuntimeState]);

  useEffect(() => {
    if (!activeCard) return;
    const scrollY = activeCard === "phone" ? 620 : activeCard === "human" ? 320 : CARD_SCROLL_TOP_Y;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: scrollY, animated: true });
    }, 120);
    return () => clearTimeout(timer);
  }, [activeCard]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardHeight(event.endCoordinates.height);
      if (activeCardRef.current === "document") {
        requestAnimationFrame(() => {
          const screenY = documentLegalNameScreenYRef.current;
          if (typeof screenY === "number" && Number.isFinite(screenY)) {
            const targetScreenY = insets.top + 92;
            const nextY = Math.max(0, currentScrollYRef.current + screenY - targetScreenY);
            scrollRef.current?.scrollTo({ y: nextY, animated: true });
            return;
          }
          scrollRef.current?.scrollTo({ y: CARD_SCROLL_TOP_Y, animated: true });
        });
      }
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.top]);

  const focusDocumentLegalNameInput = useCallback((screenY?: number | null) => {
    const measuredScreenY = typeof screenY === "number" && Number.isFinite(screenY)
      ? screenY
      : documentLegalNameScreenYRef.current;
    if (typeof measuredScreenY === "number" && Number.isFinite(measuredScreenY)) {
      documentLegalNameScreenYRef.current = measuredScreenY;
      const targetScreenY = insets.top + 92;
      const nextY = Math.max(0, currentScrollYRef.current + measuredScreenY - targetScreenY);
      scrollRef.current?.scrollTo({ y: nextY, animated: true });
      return;
    }
    scrollRef.current?.scrollTo({ y: CARD_SCROLL_TOP_Y, animated: true });
  }, [insets.top]);

  const refreshAll = useCallback(async (
    source: "snapshot" | "phone" | "human" | "document" | "device_fingerprint" | "manual" = "manual",
    options: { silent?: boolean } = {},
  ) => {
    if (!options.silent && !identityFullyVerified) setBusy(true);
    try {
      const { snapshot: nextSnapshot, profile: nextProfile } = await fetchNativeVerifyIdentityRefreshState({ sessionKey, userId });
      const nextIsFullyVerified = nextSnapshot.verificationStatus === "verified";
      const committedSnapshot = nextSnapshot;
      const committedProfile: NativeVerifyIdentityProfileStatus = {
        ...nextProfile,
        isVerified: nextIsFullyVerified,
        verificationStatus: nextSnapshot.verificationStatus,
      };
      // Warm only after the reconciler has completed, so the shared profile
      // cache cannot win a race with a stale verified flag.
      await refreshNativeVerifyIdentityProfileCache({ sessionKey, userId });
      // Keep Account and Identity on the same canonical profile truth. Document
      // confirmation owns legal name/DOB; whichever successful OTP runs last
      // owns the phone number and its verification timestamp.
      if (userId) {
        await patchNativeProfileSummaryCache(userId, {
          ...(nextProfile.legalName ? { legal_name: nextProfile.legalName } : {}),
          ...(nextProfile.identityDocumentDob ? { dob: nextProfile.identityDocumentDob } : {}),
          ...(nextProfile.phone ? { phone: nextProfile.phone } : {}),
          ...(nextProfile.phoneVerificationStatus ? { phone_verification_status: nextProfile.phoneVerificationStatus } : {}),
          ...(nextProfile.phoneVerifiedAt ? { phone_verified_at: nextProfile.phoneVerifiedAt } : {}),
        }, { sessionKey });
      }
      setSnapshot(committedSnapshot);
      setProfileStatus(committedProfile);
      setIdentityStatusReady(true);
      const nextProfilePhoneMatchesCurrent =
        Boolean(normalizeVerifyIdentityPhone(nextProfile.phone)) &&
        (!normalizeVerifyIdentityPhone(phone) || normalizeVerifyIdentityPhone(nextProfile.phone) === normalizeVerifyIdentityPhone(phone));
      if ((nextIsFullyVerified || nextProfile.phoneVerificationStatus === "verified") && (nextIsFullyVerified || nextProfilePhoneMatchesCurrent)) {
        if (nextProfile.phone) setPhone(nextProfile.phone);
        setPhoneState((current) => current.state === "verified"
          ? { ...current, phone: nextProfile.phone || current.phone, maskedPhoneHint: current.maskedPhoneHint || (nextProfile.phone ? maskNativePhoneForOtpNotice(nextProfile.phone) : current.maskedPhoneHint) }
          : reduceNativeVerifyIdentityPhoneOtpState(current, { type: "verify_succeeded" }));
        setActiveCard((current) => current === "phone" ? null : current);
      }
      if (nextIsFullyVerified || nextSnapshot.humanStatus === "passed" || nextProfile.humanStatus === "passed") {
        setHumanState((current) => current.state === "passed"
          ? current
          : { ...current, state: "passed", loading: false, error: null, failure: null });
        setHumanFaceStatus("Completed ✓");
        setHumanPoseStep("done");
        setHumanCompletedSteps({ center: true, left: true, right: true });
        setHumanDwell(null);
        setHumanSettlePhase(null);
        setActiveCard((current) => current === "human" ? null : current);
      }
      if (nextIsFullyVerified || nextSnapshot.identityDocumentStatus === "confirmed" || nextProfile.identityDocumentStatus === "confirmed") {
        setDocumentState((current) => ({
          ...current,
          state: "confirmed",
          documentType: nextProfile.identityDocumentType || nextSnapshot.identityDocumentType || current.documentType,
          error: null,
          confirmed: {
            ...current.confirmed,
            legalName: nextProfile.legalName || nextSnapshot.legalName || current.confirmed.legalName,
            documentCountry: nextProfile.identityDocumentCountry || nextSnapshot.identityDocumentCountry || current.confirmed.documentCountry,
            dob: nextProfile.identityDocumentDob || nextSnapshot.identityDocumentDob || current.confirmed.dob,
            documentGender: nextProfile.identityDocumentGender || nextSnapshot.identityDocumentGender || current.confirmed.documentGender,
          },
        }));
        setActiveCard((current) => current === "document" ? null : current);
      }
      if (nextIsFullyVerified) {
        // A server-authorised verified state represents one complete identity
        // result. Do not leave any individual step expanded with stale local
        // state while the three cards render as complete.
        setActiveCard(null);
      }
      emitNativeVerifyIdentityUpdated({ snapshot: committedSnapshot, source, userId, verified: nextIsFullyVerified });
      setError(null);
      return { profile: committedProfile, snapshot: committedSnapshot };
    } catch (error) {
      if (!options.silent) setError(nativeSafeErrorCopy(error, "We couldn't refresh verification status."));
      return null;
    } finally {
      if (!options.silent) setBusy(false);
    }
  }, [identityFullyVerified, phone, sessionKey, setError, setHumanDwell, setHumanSettlePhase, userId]);
  const refreshAllRef = useRef(refreshAll);
  useEffect(() => {
    refreshAllRef.current = refreshAll;
  }, [refreshAll]);

  const showHumanPassedConfirmed = useCallback(() => {
    haptic.success();
    humanStateNameRef.current = "passed";
    setHumanCompletedSteps({ center: true, left: true, right: true });
    setHumanPoseStep("done");
    setHumanDwell(null);
    setHumanSettlePhase(null);
    setHumanState((current) => ({ ...current, state: "passed", loading: false, error: null, failure: null }));
    setHumanFaceStatus("Completed ✓");
  }, [setHumanDwell, setHumanSettlePhase]);

  useEffect(() => {
    if (locked || proofMode) return undefined;
    const unsubscribe = subscribeNativeVerifyIdentityUpdated((event) => {
      if (event.snapshot) setSnapshot(event.snapshot);
    });
    void (async () => {
      const cached = await readCachedNativeVerifyIdentityProfileStatus({ sessionKey, userId });
      if (cached) {
        setProfileStatus((current) => current ?? cached);
        setIdentityStatusReady(true);
        return;
      }
      // Cold/session-changed entry needs authority once. Repeat entry is owned
      // by the committed memory snapshot and update events, not navigation.
      await refreshAllRef.current("snapshot", { silent: true });
    })();
    return unsubscribe;
  }, [locked, proofMode, sessionKey, userId]);

  useEffect(() => {
    if (locked) return undefined;
    const syncOnActive = (nextState: AppStateStatus) => {
      const wasInactive = appStateRef.current.match(/inactive|background/);
      appStateRef.current = nextState;
      if (nextState === "active" && (activeCardRef.current === "human" || humanStateNameRef.current === "capturing")) {
        setHumanCameraPermissionStatus(getNativeCameraPermissionStatus());
      }
      const verificationFlowNeedsResume =
        documentState.state === "reading" ||
        humanState.state === "pending";
      if (!wasInactive || nextState !== "active" || humanState.state === "capturing" || !verificationFlowNeedsResume) return;
      void refreshAllRef.current("manual");
    };
    const subscription = AppState.addEventListener("change", syncOnActive);
    return () => {
      subscription.remove();
    };
  }, [documentState.state, humanState.state, locked]);

  useEffect(() => {
    if (locked || (phoneState.state !== "sent" && phoneState.state !== "failed") || phoneState.cooldownSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setPhoneState((current) => {
        if ((current.state !== "sent" && current.state !== "failed") || current.cooldownSeconds <= 0) return current;
        return reduceNativeVerifyIdentityPhoneOtpState(current, {
          type: "cooldown_ticked",
          seconds: current.cooldownSeconds - 1,
        });
      });
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [locked, phoneState.cooldownSeconds, phoneState.state]);

  const applyPhoneValue = useCallback((value: string) => {
    setPhone(value);
    setOtpCode("");
    setPhoneState((current) => reduceNativeVerifyIdentityPhoneOtpState(current, { type: "phone_changed", phone: value }));
  }, []);

  const updatePhoneValue = useCallback((value: string) => {
    const nextPhoneKey = normalizeVerifyIdentityPhone(value);
    const changingVerifiedPhone =
      phoneVerified &&
      profilePhoneKey &&
      nextPhoneKey &&
      nextPhoneKey !== profilePhoneKey &&
      !verifiedPhoneEditConfirmed;
    if (changingVerifiedPhone) {
      setPendingPhoneValue(value);
      setPhoneChangePromptOpen(true);
      return;
    }
    applyPhoneValue(value);
  }, [applyPhoneValue, phoneVerified, profilePhoneKey, verifiedPhoneEditConfirmed]);

  const cancelVerifiedPhoneChange = useCallback(() => {
    setPendingPhoneValue(null);
    setPhoneChangePromptOpen(false);
  }, []);

  const confirmVerifiedPhoneChange = useCallback(() => {
    const next = pendingPhoneValue;
    setVerifiedPhoneEditConfirmed(true);
    setPendingPhoneValue(null);
    setPhoneChangePromptOpen(false);
    if (next != null) applyPhoneValue(next);
  }, [applyPhoneValue, pendingPhoneValue]);

  const sendOtp = useCallback(async (resend = false) => {
    const run = resend ? resendNativeVerifyIdentityPhoneOtp : sendNativeVerifyIdentityPhoneOtp;
    const optimisticPhone = phone.trim();
    setPhoneState((current) => reduceNativeVerifyIdentityPhoneOtpState(current, { type: "send_started", phone: optimisticPhone }));
    nativeVerifyReleaseLog("phone_otp_send_start", {
      hasToken: false,
      phoneDigitCount: optimisticPhone.replace(/\D/g, "").length,
      resend,
    });
    const next = await run(phoneState, phone, "");
    nativeVerifyReleaseLog("phone_otp_send_result", {
      errorKind: next.failure,
      hasError: Boolean(next.error),
      state: next.state,
    });
    setPhoneState(next);
    setError(null);
    if (next.error) {
      haptic.error(); // V4: OTP send failure
      setActiveCard("phone");
    } else {
      haptic.success(); // V4: OTP send success
      await refreshAll("phone");
    }
  }, [phone, phoneState, refreshAll, setError]);

  const verifyOtp = useCallback(async () => {
    if (phoneVerifyInFlightRef.current || phoneState.loading || phoneState.state === "verified") {
      nativeVerifyReleaseLog("phone_otp_verify_suppressed", {
        inFlight: phoneVerifyInFlightRef.current,
        loading: phoneState.loading,
        state: phoneState.state,
      });
      return;
    }
    phoneVerifyInFlightRef.current = true;
    try {
      nativeVerifyReleaseLog("phone_otp_verify_start", {
        codeLength: otpCode.trim().length,
        phoneDigitCount: phoneState.phone.replace(/\D/g, "").length,
      });
      const next = await verifyNativeVerifyIdentityPhoneOtpCode(phoneState, otpCode);
      nativeVerifyReleaseLog("phone_otp_verify_result", {
        errorKind: next.failure,
        hasError: Boolean(next.error),
        state: next.state,
      });
      setPhoneState(next);
      setError(null);
      if (next.error) {
        haptic.error(); // V4: OTP verify failure
        setActiveCard("phone");
      } else {
        setOtpCode("");
        haptic.success(); // V4: OTP verify success
        setActiveCard(null);
        await refreshAll("phone", { silent: true });
      }
    } finally {
      phoneVerifyInFlightRef.current = false;
    }
  }, [otpCode, phoneState, refreshAll, setError]);

  const processDocumentCapture = useCallback(async (captureUri: string, source: "camera" | "scanner" = "camera") => {
    const readingStartedAt = Date.now();
    const currentType = selectedDocumentTypeRef.current;
    setDocumentState((current) => ({ ...current, documentType: currentType, state: "reading", error: null }));
    documentCaptureUriRef.current = captureUri;
    try {
      if (currentType === "passport") {
        nativeVerifyReleaseLog("passport_ocr_start", {
          source,
          ...describeDocumentCaptureUri(captureUri),
        });
      }
      const ocr = await extractNativeIdentityText(captureUri, { documentType: currentType, source });
      nativeVerifyReleaseLog("document_ocr_result", {
        cropCount: ocr.diagnostics.cropCount,
        documentType: currentType,
        errorCode: ocr.errorCode ?? null,
        fileExists: ocr.diagnostics.fileExists,
        fileSize: ocr.diagnostics.fileSize,
        lineCount: ocr.lines.length,
        mrzLineCount: ocr.mrzLines.length,
        nativeCalls: ocr.diagnostics.nativeCalls.map((call) => ({
          error: call.error ? nativeSafeErrorCopy(call.error, "native_error") : null,
          label: call.label,
          lineCount: call.lineCount,
          ok: call.ok,
        })),
        normalizedHeight: ocr.diagnostics.normalizedHeight,
        normalizedWidth: ocr.diagnostics.normalizedWidth,
        ocrMode: currentType === "passport" ? "mrz" : "latin_chinese",
        passportVizCropCount: ocr.diagnostics.passportVizCropCount,
        preprocessError: ocr.diagnostics.preprocessError
          ? nativeSafeErrorCopy(ocr.diagnostics.preprocessError, "preprocess_error")
          : null,
        qualityIssue: ocr.qualityIssue ?? null,
        source,
        structuredLineCount: ocr.diagnostics.structuredLineCount,
        supported: ocr.supported,
        uriScheme: ocr.diagnostics.uriScheme,
      });
      if (currentType === "passport") {
        nativeVerifyReleaseLog("passport_ocr_result", {
          cropCount: ocr.diagnostics.cropCount,
          errorCode: ocr.errorCode ?? null,
          lineCount: ocr.lines.length,
          mrzLineCount: ocr.mrzLines.length,
          nativeCalls: ocr.diagnostics.nativeCalls.map((call) => ({
            error: call.error ? nativeSafeErrorCopy(call.error, "native_error") : null,
            label: call.label,
            lineCount: call.lineCount,
            ok: call.ok,
          })),
          passportVizCropCount: ocr.diagnostics.passportVizCropCount,
          source,
          supported: ocr.supported,
        });
      }
      if (!ocr.supported) {
        await waitForMinimumVisibleTime(readingStartedAt, DOCUMENT_READING_MIN_VISIBLE_MS);
        if (currentType === "passport") {
          nativeVerifyReleaseLog("passport_retry_required", { reason: "ocr_unsupported" });
        }
        setDocumentState((current) => ({ ...current, state: "idle", error: "Document reading is not available on this device." }));
        haptic.error();
        return;
      }
      if (ocr.qualityIssue === "too_small") {
        await waitForMinimumVisibleTime(readingStartedAt, DOCUMENT_READING_MIN_VISIBLE_MS);
        if (currentType === "passport") {
          nativeVerifyReleaseLog("passport_retry_required", { reason: "too_small" });
        }
        setDocumentState((current) => ({
          ...current,
          attemptCount: current.attemptCount + 1,
          state: "idle",
          error: "Move closer so the details fill the frame.",
        }));
        haptic.error();
        return;
      }
      if (ocr.errorCode === "ocr_file_unreadable" || ocr.errorCode === "ocr_native_rejected" || ocr.errorCode === "ocr_preprocess_failed") {
        await waitForMinimumVisibleTime(readingStartedAt, DOCUMENT_READING_MIN_VISIBLE_MS);
        if (currentType === "passport") {
          nativeVerifyReleaseLog("passport_retry_required", { reason: ocr.errorCode });
        }
        setDocumentState((current) => ({
          ...current,
          attemptCount: current.attemptCount + 1,
          state: "idle",
          error: "We couldn't read this capture. Please try again.",
        }));
        haptic.error();
        return;
      }
      if (currentType === "passport") {
        const mrzInputLines = Array.from(new Set([...ocr.mrzLines, ...ocr.lines]));
        const structuredMrzInputLines = ocr.mrzTextLines.map((line) => ({
          sourceLabel: line.sourceLabel,
          text: line.text,
        }));
        const exactStructuredMrzPairs = ocr.mrzTextLines
          .map((line) => ({
            normalizedLength: normalizeNativeIdentityMrzCandidateText(line.text).length,
            sourceLabel: line.sourceLabel,
          }))
          .filter((line) => line.normalizedLength >= 40 && line.normalizedLength <= 46);
        const hasOcrSuccess = ocr.supported && !ocr.errorCode && ocr.lines.length > 0;
        nativeVerifyReleaseLog("passport_mrz_candidate_summary", {
          exactStructuredMrzPairCount: exactStructuredMrzPairs.length,
          exactStructuredMrzPairSources: Array.from(new Set(exactStructuredMrzPairs.map((line) => line.sourceLabel))).slice(0, 8),
          fallbackLineCount: ocr.lines.length,
          inputLineCount: mrzInputLines.length,
          mrzLineCount: ocr.mrzLines.length,
          source,
        });
        nativeVerifyReleaseLog("passport_mrz_candidate_diagnostics", {
          candidates: getPassportMrzCandidateDiagnostics(
            [...structuredMrzInputLines, ...mrzInputLines.map((text) => ({ sourceLabel: "unique_text", text }))],
          ),
          exactStructuredMrzPairCount: exactStructuredMrzPairs.length,
          inputLineCount: mrzInputLines.length,
          mrzLineCount: ocr.mrzLines.length,
        });
        const mrz = parsePassportMrz(mrzInputLines);
        nativeVerifyReleaseLog("document_mrz_parse_result", {
          lineCount: ocr.lines.length,
          mrzLineCount: ocr.mrzLines.length,
          ok: mrz.ok,
          reason: mrz.ok ? null : mrz.reason,
        });
        nativeVerifyReleaseLog("passport_mrz_checksum_result", {
          ok: mrz.ok,
          reason: mrz.ok ? null : mrz.reason,
        });
        if (!mrz.ok) {
          await waitForMinimumVisibleTime(readingStartedAt, DOCUMENT_READING_MIN_VISIBLE_MS);
          const retryCopy = mrz.reason === "mrz_not_found"
            ? "Show the two code lines at the bottom of the passport photo page."
            : "The code lines weren't clear enough. Hold still and try again.";
          setDocumentState((current) => {
            const nextAttempt = current.attemptCount + 1;
            nativeVerifyReleaseLog("passport_retry_required", {
              attempt: nextAttempt,
              detectedTextLines: ocr.lines.length,
              mrzCandidateCount: ocr.mrzLines.length,
              reason: mrz.reason,
            });
            return {
              ...current,
              attemptCount: nextAttempt,
              state: "idle",
              error: formatDocumentRetryCopy(nextAttempt, retryCopy),
            };
          });
          haptic.error();
          return;
        }
        const expiryValidation = validateDocumentExpiry(mrz.expiryDate);
        if (expiryValidation.error || !expiryValidation.iso) {
          await waitForMinimumVisibleTime(readingStartedAt, DOCUMENT_READING_MIN_VISIBLE_MS);
          nativeVerifyReleaseLog("passport_expiry_check_failed", {
            error: expiryValidation.error,
            hasExpiryDate: Boolean(mrz.expiryDate),
            source,
          });
          setDocumentState((current) => ({
            ...current,
            attemptCount: current.attemptCount + 1,
            state: "idle",
            error: "This document has expired. Use a valid passport or ID.",
          }));
          haptic.error();
          return;
        }
        const documentCountry = inferPassportJurisdictionFromOcr(mrz.documentCountry, ocr.lines);
        const dobValidation = validateDocumentDob(mrz.dob);
        const extractedLegalName = resolvePassportLegalName(mrz.legalName, ocr.lines, ocr.textLines);
        const documentGender = mrz.documentGender ?? findIdentityDocumentGenderFromGeometryOcr(ocr.textLines) ?? findIdentityDocumentGenderFromOcr(getIdentityOcrParseLines(ocr.lines, ocr.textLines));
        const values = { legalName: extractedLegalName, documentCountry, dob: dobValidation.display ?? mrz.dob, documentGender };
        const requiredPassportFields = {
          dob: Boolean(dobValidation.display && dobValidation.iso),
          documentNumber: Boolean(mrz.documentNumber),
          expiryDate: Boolean(expiryValidation.iso),
          legalName: Boolean(values.legalName),
        };
        const documentLast4 = getDocumentNumberLast4(mrz.documentNumber);
        const passportGates = {
          expiryValid: Boolean(expiryValidation.iso),
          mrzChecksumValid: mrz.ok,
          ocrSuccess: hasOcrSuccess,
          requiredFields: Object.values(requiredPassportFields).every(Boolean),
        };
        nativeVerifyReleaseLog("passport_validation_gates", {
          gates: passportGates,
          requiredFields: requiredPassportFields,
          resolvedCountry: values.documentCountry,
          countryRepairedFromOcr: Boolean(values.documentCountry && values.documentCountry !== resolveDocumentCountry(mrz.documentCountry)),
          documentGender: values.documentGender,
          sourceCountry: mrz.documentCountry,
        });
        if (!passportGates.ocrSuccess || !passportGates.mrzChecksumValid || !passportGates.expiryValid || !passportGates.requiredFields) {
          await waitForMinimumVisibleTime(readingStartedAt, DOCUMENT_READING_MIN_VISIBLE_MS);
          setDocumentState((current) => {
            const nextAttempt = current.attemptCount + 1;
            const retryCopy = !passportGates.ocrSuccess
              ? "We couldn't read any text. Move closer and keep the document well lit."
              : "We couldn't verify your details. Please scan again with the full document visible";
            return {
              ...current,
              attemptCount: nextAttempt,
              state: "idle",
              error: formatDocumentRetryCopy(nextAttempt, retryCopy),
            };
          });
          haptic.error();
          return;
        }
        const enteredLegalName = documentEnteredLegalNameRef.current.trim();
        const extractedNameEvidence = getUniqueIdentityNameEvidence(mrz.legalName, values.legalName);
        const nameMatch = evaluateIdentityLegalNameMatch(enteredLegalName, extractedNameEvidence, {
          allowSubset: true,
          allowTokenOrder: true,
        });
        nativeVerifyReleaseLog("document_name_match_result", {
          documentType: currentType,
          evidenceCount: extractedNameEvidence.length,
          enteredTokenCount: getIdentityNameMatchTokens(enteredLegalName).length,
          matched: nameMatch.matched,
          method: nameMatch.method,
          scoreBucket: Math.floor(nameMatch.score / 10) * 10,
        });
        if (!nameMatch.matched) {
          await waitForMinimumVisibleTime(readingStartedAt, DOCUMENT_READING_MIN_VISIBLE_MS);
          setDocumentState((current) => ({
            ...current,
            attemptCount: current.attemptCount + 1,
            state: "idle",
            error: "Legal name does not match this document. Check Legal name or scan again.",
          }));
          haptic.error();
          return;
        }
        await waitForMinimumVisibleTime(readingStartedAt, DOCUMENT_READING_MIN_VISIBLE_MS);
        nativeVerifyReleaseLog("passport_review_ready", {
          hasDob: Boolean(values.dob),
          hasLegalName: Boolean(values.legalName),
          hasDocumentCountry: Boolean(values.documentCountry),
          documentGender: values.documentGender,
          hasDocumentNumber: Boolean(mrz.documentNumber),
          hasExpiryDate: Boolean(expiryValidation.iso),
        });
        setDocumentState((current) => ({
          ...current,
          state: "review",
          attemptCount: current.attemptCount + 1,
          extractionMethod: "mrz",
          confidenceScore: 0.95,
          documentExpiresOn: expiryValidation.iso,
          documentLast4,
          documentNumber: mrz.documentNumber,
          extractedNameEvidence,
          original: values,
          confirmed: { ...values, legalName: current.confirmed.legalName.trim() || values.legalName },
          error: null,
        }));
        haptic.success();
        return;
      }
      const values = inferIdentityDetailsFromOcr(ocr.lines, ocr.textLines);
      const documentGender = findIdentityDocumentGenderFromGeometryOcr(ocr.textLines) ?? findIdentityDocumentGenderFromOcr(getIdentityOcrParseLines(ocr.lines, ocr.textLines));
      nativeVerifyReleaseLog("document_id_parse_result", {
        lineCount: ocr.lines.length,
        nameCandidates: describeIdentityNameCandidatesForLog(getIdentityOcrParseLines(ocr.lines, ocr.textLines)),
        ok: Boolean(values),
        parsedFields: values ? {
          documentCountry: Boolean(values.documentCountry),
          documentGender,
          dob: Boolean(values.dob),
          legalName: Boolean(values.legalName),
        } : null,
      });
      if (!values) {
        await waitForMinimumVisibleTime(readingStartedAt, DOCUMENT_READING_MIN_VISIBLE_MS);
        const detectedDob = Boolean(findDocumentDobCandidate(ocr.lines));
        const retryCopy = ocr.lines.length < 2
          ? "We couldn't read any text. Move closer and keep the document well lit."
          : detectedDob
            ? "Make sure your full name is visible."
            : "Make sure your full name and date of birth are visible.";
        setDocumentState((current) => {
          const nextAttempt = current.attemptCount + 1;
          return {
            ...current,
            attemptCount: nextAttempt,
            state: "idle",
            error: formatDocumentRetryCopy(nextAttempt, retryCopy),
          };
        });
        haptic.error();
        return;
      }
      if (!values.dob || !values.legalName) {
        await waitForMinimumVisibleTime(readingStartedAt, DOCUMENT_READING_MIN_VISIBLE_MS);
        setDocumentState((current) => {
          const nextAttempt = current.attemptCount + 1;
          return {
            ...current,
            attemptCount: nextAttempt,
            state: "idle",
            error: formatDocumentRetryCopy(nextAttempt, "We couldn't verify your details. Please scan again with the full document visible"),
          };
        });
        haptic.error();
        return;
      }
      const enteredLegalName = documentEnteredLegalNameRef.current.trim();
      const nameMatch = evaluateIdentityLegalNameMatch(enteredLegalName, [values.legalName], { allowTokenOrder: true });
      nativeVerifyReleaseLog("document_name_match_result", {
        documentType: currentType,
        evidenceCount: [values.legalName].filter(Boolean).length,
        enteredTokenCount: getIdentityNameMatchTokens(enteredLegalName).length,
        matched: nameMatch.matched,
        method: nameMatch.method,
        scoreBucket: Math.floor(nameMatch.score / 10) * 10,
      });
      if (!nameMatch.matched) {
        await waitForMinimumVisibleTime(readingStartedAt, DOCUMENT_READING_MIN_VISIBLE_MS);
        setDocumentState((current) => ({
          ...current,
          attemptCount: current.attemptCount + 1,
          state: "idle",
          error: "Legal name does not match this document. Check Legal name or scan again.",
        }));
        haptic.error();
        return;
      }
      await waitForMinimumVisibleTime(readingStartedAt, DOCUMENT_READING_MIN_VISIBLE_MS);
      setDocumentState((current) => ({
        ...current,
        state: "review",
        attemptCount: current.attemptCount + 1,
        extractionMethod: "ocr",
        confidenceScore: 0.55,
        documentExpiresOn: null,
        documentLast4: null,
        documentNumber: null,
        extractedNameEvidence: [values.legalName].filter(Boolean),
        original: { ...values, documentGender, dob: validateDocumentDob(values.dob).display ?? values.dob },
        confirmed: {
          ...values,
          documentGender,
          dob: validateDocumentDob(values.dob).display ?? values.dob,
          legalName: current.confirmed.legalName.trim() || values.legalName,
        },
        error: null,
      }));
      haptic.success();
    } catch (error) {
      await waitForMinimumVisibleTime(readingStartedAt, DOCUMENT_READING_MIN_VISIBLE_MS);
      nativeVerifyReleaseLog("document_capture_exception", {
        documentType: selectedDocumentTypeRef.current,
        errorCategory: "document_capture_failed",
      });
      setDocumentState((current) => ({ ...current, state: "idle", error: "We couldn't read your details. Please try again with a clearer capture." }));
      haptic.error();
    } finally {
      await deleteLocalDocumentCapture(captureUri);
      if (documentCaptureUriRef.current === captureUri) documentCaptureUriRef.current = null;
    }
  }, []);

  const openDocumentCamera = useCallback(async () => {
    if (!humanPassed) return;
    if (getIdentityNameMatchTokens(documentState.confirmed.legalName).length < 2) {
      setDocumentState((current) => ({
        ...current,
        state: "idle",
        error: "Enter your legal name before scanning your document.",
      }));
      haptic.error();
      return;
    }
    if (!isNativeIdentityOcrSupported()) {
      setDocumentState((current) => ({
        ...current,
        state: "idle",
        error: "Document reading is not available on this device.",
      }));
      haptic.error();
      return;
    }
    const currentPermission = getNativeCameraPermissionStatus();
    const permission = currentPermission === "granted" ? "granted" : await getVisionCameraModule().Camera.requestCameraPermission();
    publishNativeCameraPermissionStatus(permission);
    if (permission !== "granted") {
      setDocumentState((current) => ({
        ...current,
        state: "idle",
        error: "Camera access is required to read your document.",
      }));
      haptic.error();
      return;
    }
    Keyboard.dismiss();
    setDocumentState((current) => ({ ...current, error: null }));
    const selectedDocumentType = selectedDocumentTypeRef.current;
    if (selectedDocumentType === "passport") {
      nativeVerifyReleaseLog("passport_capture_open", {
        captureMode: "framed_mrz_camera",
        documentType: selectedDocumentType,
      });
      setDocumentCameraOpen(true);
      return;
    }
    setDocumentCameraOpen(true);
  }, [documentState.confirmed.legalName, humanPassed]);

  const confirmDocument = useCallback(async () => {
    if (documentState.state !== "review") return;
    if (confirmingDocumentRef.current) return;
    confirmingDocumentRef.current = true;
    Keyboard.dismiss();
    try {
      nativeVerifyReleaseLog("document_confirm_pressed", {
        documentType: documentState.documentType,
        extractionMethod: documentState.extractionMethod,
        state: documentState.state,
      });
      if (!humanPassed) {
        nativeVerifyReleaseLog("document_confirm_gate_failed", { gate: "liveness_binding" });
        setDocumentState((current) => ({ ...current, error: "Complete the human check before confirming your document." }));
        haptic.error();
        return;
      }
      const legalName = documentState.confirmed.legalName.trim();
      const documentCountry = resolveConfirmDocumentCountry(documentState.confirmed.documentCountry, proofMode);
      const dobValidation = validateDocumentDob(documentState.confirmed.dob);
      const originalDobValidation = validateDocumentDob(documentState.original.dob);
      if (!legalName || !documentState.confirmed.dob.trim()) {
        nativeVerifyReleaseLog("document_confirm_gate_failed", {
          gate: "required_fields",
          hasDob: Boolean(documentState.confirmed.dob.trim()),
          hasDocumentCountry: Boolean(documentCountry),
          hasDocumentGender: Boolean(documentState.confirmed.documentGender),
          hasLegalName: Boolean(legalName),
        });
        setDocumentState((current) => ({ ...current, error: "Scan again so we can read your legal name and date of birth." }));
        haptic.error();
        return;
      }
      if (dobValidation.error || !dobValidation.iso || !dobValidation.display) {
        nativeVerifyReleaseLog("document_confirm_gate_failed", { gate: "dob", reason: dobValidation.error });
        setDocumentState((current) => ({ ...current, error: dobValidation.error || "Enter a valid date of birth." }));
        haptic.error();
        return;
      }
      if (documentState.documentType === "passport") {
        const passportConfirmGates = {
          documentHashReusableProofReady: Boolean(documentState.documentNumber),
          expiryProofReady: Boolean(documentState.documentExpiresOn),
          mrzExtraction: documentState.extractionMethod === "mrz",
        };
        nativeVerifyReleaseLog("passport_confirm_gates", passportConfirmGates);
        if (!passportConfirmGates.documentHashReusableProofReady || !passportConfirmGates.expiryProofReady || !passportConfirmGates.mrzExtraction) {
          setDocumentState((current) => ({ ...current, error: "We need a complete passport scan before confirming these details." }));
          haptic.error();
          return;
        }
      }
      const dobIso = dobValidation.iso;
      const dobDisplay = dobValidation.display;
      const readingStartedAt = Date.now();
      setDocumentState((current) => ({ ...current, state: "reading", error: null }));
      const confirmPayload = {
        documentType: documentState.documentType,
        extractionMethod: documentState.extractionMethod,
        confidenceScore: documentState.confidenceScore,
        documentExpiresOn: documentState.documentExpiresOn,
        documentLast4: documentState.documentLast4,
        documentNumber: documentState.documentNumber,
        extractedNameEvidence: documentState.extractedNameEvidence.length > 0
          ? documentState.extractedNameEvidence
          : [documentState.original.legalName].filter(Boolean),
        originalExtracted: {
          ...documentState.original,
          documentCountry: resolveConfirmDocumentCountry(documentState.original.documentCountry, proofMode) || documentCountry,
          dob: originalDobValidation.iso || dobIso,
        },
        confirmed: { legalName, documentCountry, dob: dobIso, documentGender: documentState.confirmed.documentGender },
      };
      try {
        const result = await confirmNativeIdentityDocument(confirmPayload);
        nativeVerifyReleaseLog("document_confirm_result", {
          documentStatus: result.documentStatus,
          ok: result.ok,
          verificationStatus: result.verificationStatus,
        });
        await waitForMinimumVisibleTime(readingStartedAt, DOCUMENT_READING_MIN_VISIBLE_MS);
        setDocumentState((current) => ({
          ...current,
          state: "confirmed",
          confirmed: { legalName, documentCountry, dob: dobDisplay, documentGender: documentState.confirmed.documentGender },
          error: null,
        }));
        setActiveCard(null);
        haptic.success();
        await refreshAll("document", { silent: true });
      } catch (error) {
        await waitForMinimumVisibleTime(readingStartedAt, DOCUMENT_READING_MIN_VISIBLE_MS);
        nativeVerifyReleaseLog("document_confirm_error", {
          code: error instanceof Error && "code" in error ? String((error as { code?: unknown }).code || "") : null,
          documentType: documentState.documentType,
          message: nativeSafeErrorCopy(error, "confirm_failed"),
          status: error instanceof Error && "status" in error ? Number((error as { status?: unknown }).status ?? 0) || null : null,
        });
        setDocumentState((current) => ({ ...current, state: "review", error: nativeSafeErrorCopy(error, "We couldn't confirm these document details.") }));
        haptic.error();
      }
    } finally {
      confirmingDocumentRef.current = false;
    }
  }, [documentState, proofMode, refreshAll]);

  const submitDocumentAgain = useCallback(() => {
    setDocumentState((current) => ({
      ...createDocumentIdentityState(current.documentType, "idle"),
      attemptCount: current.attemptCount,
      confirmed: {
        ...emptyDocumentValues(),
        legalName: current.confirmed.legalName,
      },
    }));
  }, []);

  const updateDocumentType = useCallback((documentType: NativeIdentityDocumentType) => {
    selectedDocumentTypeRef.current = documentType;
    setDocumentState((current) => ({
      ...createDocumentIdentityState(documentType, humanPassed ? "idle" : "locked"),
      attemptCount: current.attemptCount,
      confirmed: {
        ...emptyDocumentValues(),
        legalName: current.confirmed.legalName,
      },
    }));
  }, [humanPassed]);

  const startHuman = useCallback(async () => {
    setHumanStartPending(true);
    nativeVerifyReleaseLog("human_start_requested", {
      currentState: humanState.state,
      hasAttempt: Boolean(humanState.attemptId),
      hasChallenge: Boolean(humanState.challenge),
      savedHumanPassed,
    });
    try {
      setActiveCard("human");
      const currentPermission = getNativeCameraPermissionStatus();
      setHumanCameraPermissionStatus(currentPermission);
      setHumanDetectorStartupState(currentPermission === "granted" ? "camera_mounting" : "permission_not_requested");
      setHumanFaceStatus(currentPermission === "granted" ? "Starting camera..." : "Camera permission is needed to start.");
      nativeHumanDevLog("permission_status_before_request", {
        status: currentPermission,
      });
      nativeHumanStartupLog("permission_before_request", {
        status: currentPermission,
      });
      const nextPermission = currentPermission === "granted"
        ? "granted"
        : await getVisionCameraModule().Camera.requestCameraPermission().catch(() => "denied" as const);
      publishNativeCameraPermissionStatus(nextPermission);
      setHumanCameraPermissionStatus(nextPermission);
      nativeHumanDevLog("permission_status_after_request", {
        status: nextPermission,
      });
      nativeHumanStartupLog("permission_after_request", {
        status: nextPermission,
      });
      const granted = nextPermission === "granted";

      if (!granted) {
        nativeVerifyReleaseLog("human_start_permission_denied", {
          previousStatus: currentPermission,
          status: nextPermission,
        });
        setHumanDetectorStartupState("permission_denied");
        const denied = reduceNativeVerifyIdentityHumanState(humanState, {
          type: "start_failed",
          error: "Please enable camera access to continue verification.",
          failure: "permission_denied",
        });
        setHumanState(denied);
        setHumanFaceStatus("Please enable camera access to continue verification.");
        setError(null);
        return;
      }

      const next = await startNativeVerifyIdentityHumanModel(humanState);
      resetHumanRuntimeState();
      setHumanDetectorStartupState("warming_up");
      setHumanFaceStatus("Starting camera...");
      setError(null);
      nativeHumanStartupLog("capture_starting", {
        hasAttempt: Boolean(next.attemptId),
        hasChallenge: Boolean(next.challenge),
        permissionStatus: nextPermission,
      });
      if (next.error) {
        nativeVerifyReleaseLog("human_start_failed", {
          error: next.error,
          failure: next.failure,
          hasAttempt: Boolean(next.attemptId),
          hasChallenge: Boolean(next.challenge),
        });
        setHumanState(next);
        setActiveCard("human");
        return;
      }
      nativeVerifyReleaseLog("human_start_succeeded", {
        challengeType: next.challenge?.challengeType ?? null,
        hasAttempt: Boolean(next.attemptId),
        permissionStatus: nextPermission,
      });
      setHumanState(beginNativeVerifyIdentityHumanCapture(next));
      void refreshAll("human");
    } finally {
      setHumanStartPending(false);
    }
  }, [humanState, refreshAll, resetHumanRuntimeState, savedHumanPassed, setError]);

  const beginHumanCapture = useCallback(async () => {
    nativeVerifyReleaseLog("human_capture_begin_requested", {
      currentState: humanState.state,
      hasAttempt: Boolean(humanState.attemptId),
      hasChallenge: Boolean(humanState.challenge),
    });
    const currentPermission = getNativeCameraPermissionStatus();
    setHumanCameraPermissionStatus(currentPermission);
    if (currentPermission !== "granted") {
      void startHuman();
      return;
    }
    resetHumanRuntimeState();
    const next = beginNativeVerifyIdentityHumanCapture(humanState);
    setHumanState(next);
    setHumanDetectorStartupState("warming_up");
    setHumanFaceStatus("Starting camera...");
    setError(next.error ? nativeSafeErrorCopy(next.error, "We couldn't verify this detail right now. Check back later or contact Support.") : null);
  }, [humanState, resetHumanRuntimeState, setError, startHuman]);

  const retryHumanCurrentStep = useCallback(async () => {
    nativeVerifyReleaseLog("human_retry_requested", {
      currentState: humanState.state,
      hasAttempt: Boolean(humanState.attemptId),
      hasChallenge: Boolean(humanState.challenge),
      poseStep: humanPoseStep,
    });
    if (!humanState.attemptId || !humanState.challenge) {
      void startHuman();
      return;
    }
    const retryStep = humanPoseStep === "done"
      ? humanCompletedSteps.left ? "right" : humanCompletedSteps.center ? "left" : "center"
      : humanPoseStep;
    const currentPermission = getNativeCameraPermissionStatus();
    setHumanCameraPermissionStatus(currentPermission);
    if (currentPermission !== "granted") {
      void startHuman();
      return;
    }
    humanDwellGenerationRef.current += 1;
    if (humanDwellTimerRef.current) {
      clearTimeout(humanDwellTimerRef.current);
      humanDwellTimerRef.current = null;
    }
    if (humanSettleTimerRef.current) {
      clearTimeout(humanSettleTimerRef.current);
      humanSettleTimerRef.current = null;
    }
    setHumanDwell(null);
    setHumanSettlePhase(null);
    resetHumanStepEvaluation(retryStep, "step");
    humanStepStartedAtRef.current = getHumanMonotonicNowMs();
    setHumanPoseStep(retryStep);
    setHumanFaceStatus(
      retryStep === "center"
        ? "Center your face."
        : retryStep === "left"
          ? "Turn left slowly."
          : "Turn right slowly.",
    );
    setHumanState((current) => reduceNativeVerifyIdentityHumanState(current, { type: "capture_started" }));
    setHumanDetectorStartupState("warming_up");
    setError(null);
    nativeHumanStartupLog("retry_capture_starting", {
      permissionStatus: currentPermission,
    });
    nativeHumanDevLog("retry_step", {
      centerPassed: humanCompletedSteps.center,
      currentStep: retryStep,
      leftPassed: humanCompletedSteps.left,
      reason: "retry_current_step",
      rightPassed: humanCompletedSteps.right,
      visualActiveStep: retryStep,
    });
  }, [humanCompletedSteps.center, humanCompletedSteps.left, humanCompletedSteps.right, humanPoseStep, humanState.attemptId, humanState.challenge, resetHumanStepEvaluation, setError, setHumanDwell, setHumanSettlePhase, startHuman]);


  const openBlockedSupportPath = useCallback(() => {
    const intent = NATIVE_BLOCKED_IDENTITY_SUPPORT_INTENT;
    if (onOpenSupport) {
      try {
        onOpenSupport(intent);
        return;
      } catch {
        // Fall through to mailto when the native support modal cannot be opened.
      }
    }
    const subject = encodeURIComponent(intent.subject);
    const body = encodeURIComponent(intent.initialMessage);
    void Linking.openURL(`mailto:support@huddle.pet?subject=${subject}&body=${body}`).catch(() => {
      setError("Open Support and send the prepared identity verification request.");
    });
  }, [onOpenSupport, setError]);

  const retryHumanStepLocally = useCallback(({
    error,
    faceStatus,
    poseStep,
    reason,
    score = 0.18,
  }: {
    error: string;
    faceStatus: string;
    poseStep: Exclude<HumanPoseStep, "done">;
    reason: NativeHumanDetectorFailure | "movement_threshold_not_met" | null;
    score?: number;
  }) => {
    const detection = humanDetectionRef.current;
    const challengeType = humanState.challenge?.challengeType || "turn_left_right";
    const instruction = humanState.challenge?.instruction || "Slowly turn your head left, then right.";
    const resultPayload = buildNativeHumanResultPayload({
      challengeType,
      instruction,
      reason,
      state: detection,
      completed: false,
    });
    nativeVerifyReleaseLog("human_local_retry", summarizeHumanDetectionForLog(detection, {
      faceStatus,
      poseStep,
      reason,
      score,
    }));
    humanDwellGenerationRef.current += 1;
    if (humanDwellTimerRef.current) {
      clearTimeout(humanDwellTimerRef.current);
      humanDwellTimerRef.current = null;
    }
    if (humanSettleTimerRef.current) {
      clearTimeout(humanSettleTimerRef.current);
      humanSettleTimerRef.current = null;
    }
    humanDetectionRef.current.finishing = false;
    setHumanDwell(null);
    setHumanSettlePhase(null);
    setHumanPoseStep(poseStep);
    setHumanFaceStatus(faceStatus);
    setHumanState((current) => reduceNativeVerifyIdentityHumanState(current, {
      type: "capture_failed",
      error,
      failure: "movement_failed",
      resultPayload: {
        ...resultPayload,
        score,
        retryStep: poseStep,
        localRetryOnly: true,
      },
    }));
  }, [humanState.challenge?.challengeType, humanState.challenge?.instruction, setHumanDwell, setHumanSettlePhase]);

  const failHumanCapture = useCallback(async ({
    error,
    failure,
    faceStatus,
    poseStep,
    reason,
    score = 0.1,
  }: {
    error: string;
    failure: "detector_unavailable" | "movement_failed" | "no_face" | "timeout";
    faceStatus: string;
    poseStep: HumanPoseStep;
    reason: NativeHumanDetectorFailure | "movement_threshold_not_met" | null;
    score?: number;
  }) => {
    if (humanDetectionRef.current.finishing) return;
    haptic.error();
    humanDetectionRef.current.finishing = true;
    const detection = humanDetectionRef.current;
    const challengeType = humanState.challenge?.challengeType || "turn_left_right";
    const instruction = humanState.challenge?.instruction || "Slowly turn your head left, then right.";
    const resultPayload = buildNativeHumanResultPayload({
      challengeType,
      instruction,
      reason,
      state: detection,
      completed: false,
    });
    nativeVerifyReleaseLog("human_capture_failed", summarizeHumanDetectionForLog(detection, {
      failure,
      faceStatus,
      poseStep,
      reason,
      score,
    }));
    const captureResult = {
      attemptId: String(humanState.attemptId || ""),
      passed: false,
      score,
      resultPayload,
      evidencePath: null,
    } as never;
    setHumanDwell(null);
    setHumanPoseStep(poseStep);
    setHumanFaceStatus(faceStatus);
    setHumanState((current) => reduceNativeVerifyIdentityHumanState(current, {
      type: "capture_failed",
      error,
      failure,
      resultPayload,
    }));
    try {
      const completed = await withHumanSubmitTimeout(completeNativeVerifyIdentityHumanModel(humanState, captureResult));
      if (completed.state === "failed") setHumanState(completed);
      await refreshAll("human");
    } catch {
      setError("Connection issue. Your check wasn't submitted.");
    }
    humanDetectionRef.current.finishing = false;
  }, [humanState, refreshAll, setError, setHumanDwell]);

  useEffect(() => {
    if (humanPassed || activeCard === "human" || humanState.state !== "capturing" || humanDetectionRef.current.finishing) return;
    void failHumanCapture({
      error: "Facial detection was closed before it finished.",
      failure: "timeout",
      faceStatus: "Facial detection was closed before it finished.",
      poseStep: humanPoseStep === "done" ? "right" : humanPoseStep,
      reason: "timeout",
      score: 0.12,
    });
  }, [activeCard, failHumanCapture, humanPassed, humanPoseStep, humanState.state]);

  const finishHumanCapture = useCallback(async () => {
    if (humanDetectionRef.current.finishing) return;
    nativeVerifyReleaseLog("human_finish_requested", summarizeHumanDetectionForLog(humanDetectionRef.current, {
      currentState: humanState.state,
      hasAttempt: Boolean(humanState.attemptId),
      poseStep: humanPoseStep,
    }));
    const detection = humanDetectionRef.current;
    const challengeType = humanState.challenge?.challengeType || "turn_left_right";
    const instruction = humanState.challenge?.instruction || "Slowly turn your head left, then right.";

    if (!hasNativeHumanLivenessPass(detection, HUMAN_DETECTOR_CONFIG)) {
      humanDetectionRef.current.finishing = true;
      const resultPayload = buildNativeHumanResultPayload({
        challengeType,
        instruction,
        reason: "movement_threshold_not_met",
        state: detection,
        completed: false,
      });
      const captureResult = {
        attemptId: String(humanState.attemptId || ""),
        passed: false,
        score: 0.22,
        resultPayload,
        evidencePath: null,
      } as never;
      nativeVerifyReleaseLog("human_liveness_gate_failed", summarizeHumanDetectionForLog(detection, {
        challengeType,
        requiredHorizontalShift: 0.36,
        requiredLeftTravel: 0.12,
        requiredRightTravel: 0.12,
      }));
      setHumanFaceStatus("We couldn't complete verification. Please retry.");
      const captured = reduceNativeVerifyIdentityHumanState(humanState, {
        type: "capture_failed",
        error: "We couldn't complete verification. Please retry.",
        failure: "movement_failed",
        resultPayload,
      });
      setHumanState(captured);
      try {
        const completed = await withHumanSubmitTimeout(completeNativeVerifyIdentityHumanModel(humanState, captureResult));
        if (completed.state === "failed") setHumanState(completed);
        await refreshAll("human");
      } catch {
        setError("Connection issue. Your check wasn't submitted.");
      }
      humanDetectionRef.current.finishing = false;
      return;
    }

    humanDetectionRef.current.finishing = true;

    const captureResult: NativeVerifyIdentityHumanCaptureResult = {
      passed: true,
      score: 0.92,
      resultPayload: buildNativeHumanResultPayload({
        challengeType,
        instruction,
        state: detection,
        completed: true,
      }),
      evidencePath: null,
    } as NativeVerifyIdentityHumanCaptureResult;
    nativeVerifyReleaseLog("human_liveness_gate_passed", summarizeHumanDetectionForLog(detection, {
      challengeType,
      score: captureResult.score,
    }));
    const passPayload: NativeCompleteHumanChallengePayload = {
      attemptId: String(humanState.attemptId || ""),
      evidencePath: captureResult.evidencePath ?? null,
      resultPayload: captureResult.resultPayload,
      score: captureResult.score,
      status: "passed",
    };
    humanPassSubmitInFlightRef.current = true;

    humanDwellGenerationRef.current += 1;
    humanStateNameRef.current = "pending";
    setHumanDwell(null);
    setHumanSettlePhase(null);
    const captured = applyNativeVerifyIdentityHumanCaptureResult(humanState, captureResult);
    setHumanState(captured);
    setHumanFaceStatus("Confirming your check… Almost done.");

    try {
      const completed = await withHumanSubmitTimeout(completeNativeHumanChallenge(passPayload));
      nativeVerifyReleaseLog("human_submit_response", {
        humanStatus: completed.humanStatus,
        verificationStatus: completed.verificationStatus,
      });
      if (completed.humanStatus === "passed") {
        humanDetectionRef.current.finishing = false;
        humanPassSubmitInFlightRef.current = false;
        showHumanPassedConfirmed();
        void refreshAll("human");
        return;
      }
      const freshAfterSubmit = await refreshAll("human");
      if (freshAfterSubmit?.snapshot.humanStatus === "passed" || freshAfterSubmit?.profile.humanStatus === "passed") {
        humanDetectionRef.current.finishing = false;
        humanPassSubmitInFlightRef.current = false;
        showHumanPassedConfirmed();
        return;
      }
      humanDetectionRef.current.finishing = false;
      humanPassSubmitInFlightRef.current = false;
      humanStateNameRef.current = "pending";
      setHumanState({
        ...captured,
        state: "pending",
        loading: false,
        error: "We're finishing your check. Please stay on this screen.",
        failure: "network",
      });
      setHumanFaceStatus("We're finishing your check. Please stay on this screen.");
      return;
    } catch (error) {
      nativeVerifyReleaseLog("human_submit_error", summarizeHumanDetectionForLog(detection, {
        errorCategory: "human_submit_failed",
        isDefinitive: isDefinitiveHumanSubmitRejection(error),
      }));
      const freshAfterSubmit = await refreshAll("human");
      if (freshAfterSubmit?.snapshot.humanStatus === "passed" || freshAfterSubmit?.profile.humanStatus === "passed") {
        humanDetectionRef.current.finishing = false;
        humanPassSubmitInFlightRef.current = false;
        showHumanPassedConfirmed();
        return;
      }
      humanDetectionRef.current.finishing = false;
      humanPassSubmitInFlightRef.current = false;
      if (isDefinitiveHumanSubmitRejection(error)) {
        humanStateNameRef.current = "failed";
        setHumanState(reduceNativeVerifyIdentityHumanState(captured, {
          type: "complete_failed",
          error: nativeSafeErrorCopy(error, "We need one more facial detection attempt to finish this."),
          failure: "retry",
        }));
        setHumanPoseStep("right");
        setHumanFaceStatus("We need one more facial detection attempt to finish this.");
        return;
      }
      humanStateNameRef.current = "pending";
      setHumanState({
        ...captured,
        state: "pending",
        loading: false,
        error: nativeSafeErrorCopy(error, "We're finishing your check. Please stay on this screen."),
        failure: "network",
      });
      setHumanFaceStatus("We're finishing your check. Please stay on this screen.");
      return;
    }
  }, [
    humanState,
    humanPoseStep,
    refreshAll,
    setHumanDwell,
    setHumanSettlePhase,
    showHumanPassedConfirmed,
  ]);

  const scheduleHumanConfirmationDwell = useCallback(({
    actualHoldMs,
    requiredHoldMs,
    result,
    step,
    target,
    yaw,
  }: {
    actualHoldMs: number;
    requiredHoldMs: number;
    result: ReturnType<typeof processNativeHumanDetectorFrame>;
    step: Exclude<HumanPoseStep, "done">;
    target: Exclude<HumanPoseStep, "done"> | "submit";
    yaw?: number;
  }) => {
    if (humanDwellTimerRef.current) clearTimeout(humanDwellTimerRef.current);
    if (humanSettleTimerRef.current) clearTimeout(humanSettleTimerRef.current);
    humanSettleRef.current = null;
    setHumanSettle(null);

    humanDwellGenerationRef.current += 1;
    const dwellGeneration = humanDwellGenerationRef.current;
    const startedAt = getHumanMonotonicNowMs();
    const dwell: HumanConfirmationDwell = {
      durationMs: HUMAN_CONFIRMATION_DWELL_MS,
      startedAt,
      step,
      target,
    };
    humanConfirmationDwellRef.current = dwell;
    setHumanConfirmationDwell(dwell);
    haptic.primaryConfirm();
    setHumanCompletedSteps((current) => ({ ...current, [step]: true }));
    setHumanFaceStatus(
      step === "center"
        ? "Center confirmed."
        : step === "left"
          ? "Left confirmed."
          : "Right confirmed.",
    );

    nativeHumanDevLog("step_confirmed", {
      UI: `${step}_green_confirmation`,
      actualHoldMs,
      confirmationDwellMs: HUMAN_CONFIRMATION_DWELL_MS,
      currentStep: step,
      firstValidAt: result.debug.stepValidSinceMs || 0,
      reason: result.reason,
      requiredHoldMs,
      stepEnteredAt: humanStepStartedAtRef.current,
      stepPassedAt: result.debug.stepPassedAtMs || startedAt,
      transitionToNextStepAt: startedAt + HUMAN_CONFIRMATION_DWELL_MS,
      yaw,
    });

    humanDwellTimerRef.current = setTimeout(() => {
      if (
        humanDwellGenerationRef.current !== dwellGeneration ||
        humanConfirmationDwellRef.current !== dwell ||
        activeCardRef.current !== "human" ||
        humanStateNameRef.current !== "capturing" ||
        humanDetectionRef.current.finishing
      ) {
        return;
      }
      const transitionAt = getHumanMonotonicNowMs();
      setHumanDwell(null);
      const settleUntil = transitionAt + HUMAN_SETTLE_MS;
      const settle: HumanSettlePhase = {
        durationMs: HUMAN_SETTLE_MS,
        startedAt: transitionAt,
        target,
        until: settleUntil,
      };
      humanSettleRef.current = settle;
      setHumanSettle(settle);
      if (target === "submit") {
        resetHumanStepEvaluation("right", "step");
        setHumanFaceStatus("Get ready...");
        nativeHumanDevLog("step_transition", {
          UI: "settle_before_checking",
          confirmationDwellMs: transitionAt - startedAt,
          currentStep: step,
          reason: null,
          settleMs: HUMAN_SETTLE_MS,
          transitionToNextStepAt: transitionAt,
          visualActiveStep: "right",
          yawEvaluationEnabled: false,
          yaw,
        });
        humanSettleTimerRef.current = setTimeout(() => {
          if (
            humanDwellGenerationRef.current !== dwellGeneration ||
            humanSettleRef.current !== settle ||
            activeCardRef.current !== "human" ||
            humanStateNameRef.current !== "capturing" ||
            humanDetectionRef.current.finishing
          ) {
            return;
          }
          setHumanSettlePhase(null);
          setHumanPoseStep("done");
          setHumanFaceStatus("Validating");
          void finishHumanCapture();
        }, HUMAN_SETTLE_MS);
        return;
      }

      humanStepStartedAtRef.current = transitionAt - HUMAN_STEP_YAW_START_GRACE_MS;
      resetHumanStepEvaluation(target, "step");
      setHumanPoseStep(target);
      setHumanFaceStatus(target === "left" ? "Now turn left." : "Now turn right.");
      nativeHumanDevLog("step_transition", {
        UI: `${target}_prompt`,
        confirmationDwellMs: transitionAt - startedAt,
        currentStep: step,
        nextStep: target,
        reason: null,
        settleMs: HUMAN_SETTLE_MS,
        stepEnteredAt: humanStepStartedAtRef.current,
        transitionToNextStepAt: transitionAt,
        visualActiveStep: target,
        yawEvaluationEnabled: false,
        yaw,
      });
      humanSettleTimerRef.current = setTimeout(() => {
        if (
          humanDwellGenerationRef.current !== dwellGeneration ||
          humanSettleRef.current !== settle ||
          activeCardRef.current !== "human" ||
          humanStateNameRef.current !== "capturing" ||
          humanDetectionRef.current.finishing
        ) {
          return;
        }
        setHumanSettlePhase(null);
        setHumanFaceStatus(target === "left" ? "Turn left slowly." : "Turn right slowly.");
      }, HUMAN_SETTLE_MS);
    }, HUMAN_CONFIRMATION_DWELL_MS);
  }, [finishHumanCapture, resetHumanStepEvaluation, setHumanDwell, setHumanSettlePhase]);

  const handleDetectedFaces = useCallback((faces: Face[], frame?: NativeHumanDetectorFrame) => {
    if (activeCard !== "human" || humanState.state !== "capturing" || humanStateNameRef.current !== "capturing" || humanDetectionRef.current.finishing) return;
    if (humanDetectionRef.current.callbackFrames === 0) {
      nativeHumanStartupLog("first_face_callback", {
        faces: faces.length,
        hasFrame: Boolean(frame),
      });
      nativeVerifyReleaseLog("human_first_face_callback", {
        faces: faces.length,
        frameHeight: Number(frame?.height || 0),
        frameWidth: Number(frame?.width || 0),
        hasFrame: Boolean(frame),
      });
    }
    setHumanDetectorStartupState("detecting");
    if (humanConfirmationDwellRef.current) return;
    const nowMs = getHumanMonotonicNowMs();
    const settle = humanSettleRef.current;
    if (settle && nowMs < settle.until) {
      nativeHumanDevLog("frame_settle", {
        centerPassed: humanCompletedSteps.center,
        confirmationDwellMs: 0,
        currentStep: humanPoseStep,
        leftPassed: humanCompletedSteps.left,
        reason: "settling",
        rightPassed: humanCompletedSteps.right,
        settleMs: settle.until - nowMs,
        stepEnteredAt: humanStepStartedAtRef.current,
        visualActiveStep: settle.target,
        yawEvaluationEnabled: false,
      });
      return;
    }
    if (settle) setHumanSettlePhase(null);
    const stepAgeMs = nowMs - humanStepStartedAtRef.current;
    if ((humanPoseStep === "left" || humanPoseStep === "right") && stepAgeMs < HUMAN_SETTLE_MS + HUMAN_STEP_YAW_START_GRACE_MS) {
      nativeHumanDevLog("frame_step_start_grace", {
        centerPassed: humanCompletedSteps.center,
        confirmationDwellMs: 0,
        currentStep: humanPoseStep,
        leftPassed: humanCompletedSteps.left,
        reason: "step_start_grace",
        rightPassed: humanCompletedSteps.right,
        settleMs: Math.max(0, HUMAN_SETTLE_MS + HUMAN_STEP_YAW_START_GRACE_MS - stepAgeMs),
        stepEnteredAt: humanStepStartedAtRef.current,
        visualActiveStep: humanPoseStep,
        yawEvaluationEnabled: false,
      });
      return;
    }
    const preview = humanPreviewLayoutRef.current;
    if (preview.width <= 0 || preview.height <= 0) {
      humanDetectionRef.current.callbackFrames += 1;
      humanDetectionRef.current.lastRejectReason = "timeout";
      nativeHumanDevLog("frame_rejected", {
        callbackFired: true,
        reason: "preview_layout_unavailable",
        currentStep: humanPoseStep,
        stepEnteredAt: humanStepStartedAtRef.current,
      });
      return;
    }

    const result = processNativeHumanDetectorFrame(
      humanDetectionRef.current,
      faces,
      frame ?? null,
      preview,
      humanPoseStep,
      HUMAN_DETECTOR_CONFIG,
      nowMs,
    );
    humanDetectionRef.current = result.state;
    setHumanFaceStatus(result.status);
    if (
      result.debug.stepPassed ||
      Boolean(result.reason) ||
      result.state.callbackFrames === 1 ||
      result.state.callbackFrames % 20 === 0
    ) {
      nativeVerifyReleaseLog("human_frame_summary", summarizeHumanDetectionForLog(result.state, {
        currentStep: humanPoseStep,
        faceWidthRatio: result.debug.faceWidthRatio ? Number(result.debug.faceWidthRatio.toFixed(3)) : null,
        frameHeight: result.debug.frameHeight ?? null,
        frameWidth: result.debug.frameWidth ?? null,
        mappingVariant: result.debug.mappingVariant ?? null,
        nextStep: result.nextPoseStep,
        ovalOverlapRatio: result.debug.ovalOverlapRatio ? Number(result.debug.ovalOverlapRatio.toFixed(3)) : null,
        poseStep: result.debug.poseStep,
        reason: result.reason,
        requiredHoldMs: result.debug.requiredHoldMs ?? null,
        status: result.status,
        stepPassed: Boolean(result.debug.stepPassed),
        stepStableMs: result.debug.stepStableMs ? Math.round(result.debug.stepStableMs) : 0,
        yaw: typeof result.debug.yaw === "number" ? Number(result.debug.yaw.toFixed(1)) : null,
      }));
    }
    nativeHumanDevLog("frame", {
      UI: humanPoseStep === "center" ? "center_full_ring" : humanPoseStep === "left" ? "left_half_arc" : humanPoseStep === "right" ? "right_half_arc" : "checking",
      callbackFired: true,
      ...result.debug,
      actualHoldMs: result.debug.stepStableMs || 0,
      confirmationDwellMs: 0,
      currentStep: humanPoseStep,
      firstValidAt: result.debug.stepValidSinceMs || 0,
      centerPassed: humanCompletedSteps.center,
      leftPassed: humanCompletedSteps.left,
      nextStep: result.nextPoseStep,
      requiredHoldMs: result.debug.requiredHoldMs || 0,
      rightPassed: humanCompletedSteps.right,
      settleMs: 0,
      stableFaceFrames: result.state.stableFaceFrames,
      centerFrames: result.state.centerFrames,
      sideOneFrames: result.state.sideOneFrames,
      sideTwoFrames: result.state.sideTwoFrames,
      firstYawSign: result.state.firstYawSign,
      stepEnteredAt: humanStepStartedAtRef.current,
      stepPassedAt: result.debug.stepPassedAtMs || 0,
      transitionToNextStepAt: 0,
      visualActiveStep: humanPoseStep,
      yawEvaluationEnabled: true,
    });
    if (result.reason === "same_side_repeat") {
      void failHumanCapture({
        error: "Show the opposite side and try again.",
        failure: "movement_failed",
        faceStatus: "Show the opposite side and try again.",
        poseStep: humanPoseStep === "done" ? "right" : humanPoseStep,
        reason: "same_side_repeat",
        score: 0.18,
      });
      return;
    }
    if (result.debug.stepPassed && result.nextPoseStep !== humanPoseStep) {
      scheduleHumanConfirmationDwell({
        actualHoldMs: result.debug.stepStableMs || 0,
        requiredHoldMs: result.debug.requiredHoldMs || (humanPoseStep === "center" ? HUMAN_CENTER_HOLD_MS : HUMAN_SIDE_HOLD_MS),
        result,
        step: humanPoseStep === "done" ? "right" : humanPoseStep,
        target: result.passed ? "submit" : result.nextPoseStep as Exclude<HumanPoseStep, "done">,
        yaw: result.debug.yaw,
      });
    }
  }, [activeCard, failHumanCapture, humanCompletedSteps.center, humanCompletedSteps.left, humanCompletedSteps.right, humanPoseStep, humanState.state, scheduleHumanConfirmationDwell, setHumanSettlePhase]);

  const continueVerification = useCallback(async () => {
    if (busy) return;
    if (activeStep === "phone") {
      setActiveCard("phone");
      if (phoneState.state === "sent" && otpCode.trim()) {
        await verifyOtp();
        return;
      }
      await sendOtp(phoneState.state === "failed" || phoneState.state === "sent");
      return;
    }
    if (activeStep === "human") {
      setActiveCard("human");
      if (humanState.state === "failed") {
        await retryHumanCurrentStep();
        return;
      }
      if (humanState.state === "idle") {
        await startHuman();
        return;
      }
      if (humanState.state === "ready") {
        await beginHumanCapture();
        return;
      }
      if (humanState.state === "capturing") {
        setError("Live camera access is required before this check can be completed here.");
        return;
      }
      await refreshAll("human");
      return;
    }
    if (activeStep === "document") {
      setActiveCard("document");
      if (documentState.state === "review") {
        await confirmDocument();
        return;
      }
      await openDocumentCamera();
      return;
    }
    await refreshAll("manual");
  }, [
    activeStep,
    beginHumanCapture,
    busy,
    confirmDocument,
    documentState.state,
    humanState.state,
    openDocumentCamera,
    otpCode,
    phoneState.state,
    refreshAll,
    retryHumanCurrentStep,
    sendOtp,
    startHuman,
    verifyOtp,
    setError,
  ]);

  const headerStatus = useMemo(
    () => identityStatusReady ? describeOverallChip(effectiveOverallStatus) : { label: "Loading", tone: "muted" as const },
    [effectiveOverallStatus, identityStatusReady],
  );
  const phoneUnavailable = phoneState.state === "unavailable";
  const continueLabel = profileContinueLabel ?? (activeStep === "final" ? "Continue to Profile" : "Not now");

  useEffect(() => {
    if (activeCard !== "human" || humanState.state !== "passed") return undefined;
    const timer = setTimeout(() => {
      setActiveCard(null);
    }, 1100);
    return () => clearTimeout(timer);
  }, [activeCard, humanState.state]);

  useEffect(() => {
    if (activeCard !== "human" || humanState.state !== "capturing") return undefined;
    const timer = setTimeout(() => {
      if (humanDetectionRef.current.finishing) return;
      if (humanDetectionRef.current.callbackFrames > 0) return;
      const detection = humanDetectionRef.current;
      nativeVerifyReleaseLog("human_first_callback_waiting", summarizeHumanDetectionForLog(detection, {
        permissionStatus: getNativeCameraPermissionStatus(),
      }));
      nativeHumanStartupLog("first_callback_waiting", {
        callbackFrames: detection.callbackFrames,
        permissionStatus: getNativeCameraPermissionStatus(),
      });
      setHumanDetectorStartupState("warming_up");
      setHumanFaceStatus("Still loading camera...");
      nativeHumanDevLog("detector_startup_waiting", {
        callbackFrames: detection.callbackFrames,
        reason: "first callback grace elapsed",
      });
    }, HUMAN_DETECTOR_CALLBACK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [activeCard, humanState.state]);

  useEffect(() => {
    if (activeCard !== "human" || humanState.state !== "capturing") return undefined;
    const timer = setTimeout(() => {
      if (humanDetectionRef.current.finishing) return;
      if (humanDetectionRef.current.callbackFrames > 0) return;
      const detection = humanDetectionRef.current;
      nativeVerifyReleaseLog("human_first_callback_timeout", summarizeHumanDetectionForLog(detection, {
        finishing: detection.finishing,
        permissionStatus: getNativeCameraPermissionStatus(),
        startupState: humanDetectorStartupState,
      }));
      nativeHumanStartupLog("first_callback_timeout", {
        callbackFrames: detection.callbackFrames,
        finishing: detection.finishing,
        permissionStatus: getNativeCameraPermissionStatus(),
      });
      nativeHumanDevLog("detector_startup_timeout", {
        callbackFrames: detection.callbackFrames,
        reason: "first callback hard timeout",
      });
      if (humanDetectorStartupState === "native_error") {
        setHumanFaceStatus("There seems to be an issue with the facial detector. Please try again later.");
        return;
      }
      void failHumanCapture({
        error: "There seems to be an issue with the facial detector. Please try again later.",
        failure: "detector_unavailable",
        faceStatus: "There seems to be an issue with the facial detector. Please try again later.",
        poseStep: "center",
        reason: "detector_unavailable",
      });
    }, HUMAN_DETECTOR_CALLBACK_HARD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [activeCard, failHumanCapture, humanDetectorStartupState, humanState.state]);

  useEffect(() => {
    if (activeCard !== "human" || humanState.state !== "capturing") return undefined;
    const timer = setTimeout(() => {
      const detection = humanDetectionRef.current;
      if (detection.finishing) return;
      if (detection.noFaceFrames <= 0 || detection.stableFaceFrames > 0) return;
      nativeVerifyReleaseLog("human_no_face_timeout", summarizeHumanDetectionForLog(detection));
      void failHumanCapture({
        error: "No face detected. Make sure your face is visible and the lighting is clear.",
        failure: "no_face",
        faceStatus: "No face detected. Make sure your face is visible and the lighting is clear.",
        poseStep: "center",
        reason: "no_face",
      });
    }, HUMAN_NO_FACE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [activeCard, failHumanCapture, humanState.state]);

  useEffect(() => {
    if (activeCard !== "human" || humanState.state !== "capturing" || humanPoseStep === "done") return undefined;
    humanStepStartedAtRef.current = getHumanMonotonicNowMs();
    const timer = setTimeout(() => {
      if (humanConfirmationDwellRef.current) return;
      if (humanDetectionRef.current.finishing || humanState.state !== "capturing") return;
      const copy = humanPoseStep === "center"
        ? {
            error: "We couldn't center your face.",
            faceStatus: "Keep your face inside the oval.",
            poseStep: "center" as const,
          }
        : humanPoseStep === "left"
          ? {
              error: "We couldn't confirm the left turn.",
              faceStatus: "Turn your head slowly while keeping your face inside the oval.",
              poseStep: "left" as const,
            }
          : {
              error: "We couldn't confirm the right turn.",
              faceStatus: "Turn your head slowly while keeping your face inside the oval.",
              poseStep: "right" as const,
            };
      retryHumanStepLocally({
        error: copy.error,
        faceStatus: copy.faceStatus,
        poseStep: copy.poseStep,
        reason: "movement_failed",
        score: 0.18,
      });
    }, HUMAN_STEP_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [activeCard, humanPoseStep, humanState.state, retryHumanStepLocally]);

  useEffect(() => {
    if (activeCard !== "human" || humanState.state !== "capturing") return undefined;
    const timer = setTimeout(() => {
      if (humanDetectionRef.current.finishing) return;
      const detection = humanDetectionRef.current;
      const failure = classifyNativeHumanDetectorTimeout(detection);
      nativeVerifyReleaseLog("human_capture_timeout", summarizeHumanDetectionForLog(detection, {
        failure,
      }));
      nativeHumanDevLog("timeout", {
        callbackFrames: detection.callbackFrames,
        failure,
        noFaceFrames: detection.noFaceFrames,
        stableFaceFrames: detection.stableFaceFrames,
      });
      void failHumanCapture({
        error: failure === "no_face" ? "Center your face in the frame and try again." : "We couldn't complete verification. Please retry.",
        failure: failure === "no_face" ? "no_face" : "timeout",
        faceStatus: failure === "no_face" ? "No face detected. Make sure your face is visible and the lighting is clear." : "We couldn't complete verification. Please retry.",
        poseStep: failure === "no_face" ? "center" : "right",
        reason: failure,
      });
    }, HUMAN_CAPTURE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [activeCard, failHumanCapture, humanState.state]);

  if (locked) {
    return (
      <View style={[styles.lockedScreen, { paddingTop: huddleSpacing.x6 }]}>
        <Text style={styles.headerTitle}>Verify Identity</Text>
        <Text style={styles.lockedCopy}>Identity verification is temporarily unavailable. Please try again later.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <NativeVerifyIntroSheet
        onDismiss={() => {
          setShowVerifyIntro(false);
        }}
        visible={showVerifyIntro}
      />
      <View style={[styles.header, { paddingTop: insets.top + huddleSpacing.x2 }]}>
        <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={12} onPress={onBack ?? onCancelSignup ?? (() => { /* V10: no-op fallback to avoid deep-link self-call flash */ })} style={styles.backButton}>
          <Feather color={huddleColors.iconSubtle} name="arrow-left" size={huddleVerifyIdentity.headerIconSize} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>Verify Identity</Text>
        <StatusPill label={headerStatus.label} tone={headerStatus.tone} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + huddleSpacing.x7 + keyboardHeight }]}
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          currentScrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={styles.scroller}
      >
        <View style={styles.hero}>
          <Image accessibilityIgnoresInvertColors source={verifyIllustration} style={styles.illustration} />
          <Text style={[styles.introCopy, blockedIdentity?.blocked ? styles.introCopyBlocked : null]}>
            {blockedIdentity?.blocked
              ? nativeSafeErrorCopy(blockedIdentity.message, "We couldn't continue this verification because this account may already be linked to another account, device, or contact method.")
              : "We check that you're human, confirm your identity details, and verify a unique phone number before higher-trust actions like groups and care."}
          </Text>
        </View>

        {blockedIdentity?.blocked ? (
          <View style={styles.blockedPanel}>
            <Text style={styles.blockedText}>
              If you think this is a mistake, please contact{" "}
              <Text accessibilityRole="link" onPress={openBlockedSupportPath} style={styles.supportLinkInline}>Support</Text>.
            </Text>
          </View>
        ) : null}

        <VerificationCard
          active={!effectiveHumanPassed && activeCard === "human"}
          badge={effectiveHumanPassed ? COMPLETE_BADGE : getHumanBadge(effectiveHumanState)}
          disabled={effectiveHumanPassed}
          icon="user"
          recommended={recommendedCard === "human"}
          title="Verify You're Human"
          onToggle={() => setActiveCard((current) => current === "human" ? null : "human")}
        >
          <HumanPanel
            busy={busy}
            cameraGranted={humanCameraPermissionStatus === "granted"}
            cameraPermissionStatus={humanCameraPermissionStatus}
            faceDetectionOptions={faceDetectionOptions}
            faceStatus={humanFaceStatus}
            humanState={effectiveHumanState}
            humanStartPending={humanStartPending}
            startupState={humanDetectorStartupState}
            onCapture={beginHumanCapture}
            onCameraError={(error) => {
              setHumanDetectorStartupState("native_error");
              nativeVerifyReleaseLog("human_camera_runtime_error", {
                message: getNativeErrorMessage(error),
                permissionStatus: getNativeCameraPermissionStatus(),
              });
              nativeHumanStartupLog("camera_runtime_error", {
                message: getNativeErrorMessage(error),
                permissionStatus: getNativeCameraPermissionStatus(),
              });
              nativeHumanDevLog("camera_runtime_error", {
                message: getNativeErrorMessage(error),
              });
              void failHumanCapture({
                error: "There seems to be an issue with the facial detector. Please try again later.",
                failure: "timeout",
                faceStatus: "There seems to be an issue with the facial detector. Please try again later.",
                poseStep: "center",
                reason: "timeout",
              });
            }}
            onCameraInitialized={() => {
              nativeVerifyReleaseLog("human_camera_initialized", {
                permissionStatus: getNativeCameraPermissionStatus(),
              });
              nativeHumanStartupLog("camera_initialized", {
                permissionStatus: getNativeCameraPermissionStatus(),
              });
              setHumanDetectorStartupState("preview_ready");
              setHumanFaceStatus("Camera ready. Looking for your face...");
            }}
            onDetectorError={(error) => {
              setHumanDetectorStartupState("native_error");
              nativeVerifyReleaseLog("human_detector_render_error", {
                message: getNativeErrorMessage(error),
                permissionStatus: getNativeCameraPermissionStatus(),
              });
              nativeHumanStartupLog("detector_render_error", {
                message: getNativeErrorMessage(error),
                permissionStatus: getNativeCameraPermissionStatus(),
              });
              nativeHumanDevLog("detector_render_error", {
                message: getNativeErrorMessage(error),
              });
              setHumanFaceStatus("There seems to be an issue with the facial detector. Please try again later.");
            }}
            onFacesDetected={handleDetectedFaces}
            onLayoutCamera={(event) => {
              const { width, height } = event.nativeEvent.layout;
              humanPreviewLayoutRef.current = { width, height };
            }}
            onOpenSettings={() => void openNativeAppSettings()}
            onStart={() => humanState.state === "failed" ? retryHumanCurrentStep() : void startHuman()}
            completedSteps={humanCompletedSteps}
            confirmationDwell={humanConfirmationDwell}
            settlePhase={humanSettle}
            poseStep={humanPoseStep}
          />
        </VerificationCard>

        <VerificationCard
          active={!identityFullyVerified && activeCard === "document"}
          badge={effectiveDocumentConfirmed ? COMPLETE_BADGE : getDocumentBadge(documentState)}
          disabled={!effectiveHumanPassed || identityFullyVerified}
          icon="file-text"
          locked={!effectiveHumanPassed}
          recommended={recommendedCard === "document"}
          renderWhenDisabled={!effectiveHumanPassed}
          title="Confirm your identity"
          onToggle={() => setActiveCard((current) => current === "document" ? null : "document")}
        >
          <DocumentIdentityPanel
            documentConfirmed={documentConfirmed}
            humanPassed={humanPassed}
            onCapture={() => void openDocumentCamera()}
            onConfirm={() => void confirmDocument()}
            onLegalNameErrorFocus={focusDocumentLegalNameInput}
            onSubmitAgain={submitDocumentAgain}
            onUpdateConfirmed={(confirmed) => setDocumentState((current) => ({ ...current, confirmed }))}
            onUpdateType={updateDocumentType}
            state={documentState}
          />
        </VerificationCard>

        <VerificationCard
          active={!identityFullyVerified && (activeCard === "phone" || phoneUnavailable)}
          badge={effectivePhoneVerified ? COMPLETE_BADGE : getPhoneBadge(phoneState, profileStatus?.phoneVerificationStatus)}
          disabled={!effectiveDocumentConfirmed || identityFullyVerified || (phoneUnavailable && !effectivePhoneVerified)}
          icon="phone"
          locked={!effectiveDocumentConfirmed}
          recommended={recommendedCard === "phone"}
          renderWhenDisabled={!effectiveDocumentConfirmed || (phoneUnavailable && !effectivePhoneVerified)}
          title="Verify phone number"
          onToggle={() => setActiveCard((current) => current === "phone" ? null : "phone")}
        >
          <PhonePanel
            busy={busy}
            phoneVerified={phoneVerified}
            onSend={() => void sendOtp(phoneState.state === "sent" || phoneState.state === "failed")}
            onUpdateCode={(value) => setOtpCode(value.replace(/\D/g, "").slice(0, 6))}
            onUpdatePhone={updatePhoneValue}
            onVerify={() => void verifyOtp()}
            otpCode={otpCode}
            phone={phone}
            phoneState={phoneState}
          />
        </VerificationCard>

        <Text style={styles.lockCopy}>
          We don't upload or store your document capture or face scan. Only the details shown above are stored.
        </Text>

        {hideProfileFooter ? null : (
          <View style={styles.skipFooter}>
            <ActionButton label={continueLabel} onPress={() => onNavigate?.(profileContinuePath)} secondary={activeStep !== "final"} />
          </View>
        )}
      </ScrollView>
      <AppConfirmModal
        body="Changing your number will require verification."
        confirmLabel="Confirm"
        onCancel={cancelVerifiedPhoneChange}
        onConfirm={confirmVerifiedPhoneChange}
        open={phoneChangePromptOpen}
        title="Change phone number?"
      />
      {documentCameraOpen ? (
        <DocumentCameraOverlay
          cameraRef={documentCameraRef}
          documentType={documentState.documentType}
          onCancel={() => {
            setDocumentCameraOpen(false);
            setDocumentState((current) => ({ ...current, state: "idle", error: null }));
          }}
          onCaptured={(uri) => {
            setDocumentCameraOpen(false);
            void processDocumentCapture(uri, "camera");
          }}
        />
      ) : null}
    </View>
  );
}

function VerificationCard({
  active,
  badge,
  children,
  disabled,
  icon,
  locked,
  recommended,
  renderWhenDisabled,
  title,
  onToggle,
}: {
  active: boolean;
  badge: { label: string; tone: "success" | "error" | "muted" } | null;
  children: ReactNode;
  disabled?: boolean;
  icon: "phone" | "user" | "file-text";
  locked?: boolean;
  recommended: boolean;
  renderWhenDisabled?: boolean;
  title: string;
  onToggle: () => void;
}) {
  return (
    <View style={[styles.verifyCard, locked ? styles.verifyCardLocked : null, active ? styles.verifyCardExpanded : null]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(disabled), expanded: !disabled && active }}
        disabled={disabled}
        onPress={disabled ? undefined : onToggle}
        style={[styles.cardHeader, locked ? styles.cardHeaderLocked : null]}
      >
        <Feather color={locked ? huddleColors.iconMuted : badge?.tone === "success" ? huddleColors.success : huddleColors.iconMuted} name={locked ? "lock" : icon} size={huddleVerifyIdentity.cardIconSize} />
        <Text adjustsFontSizeToFit minimumFontScale={0.9} numberOfLines={1} style={[styles.cardTitle, locked ? styles.cardTitleLocked : null]}>{title}</Text>
        {badge ? <StatusPill label={badge.label} tone={badge.tone} /> : null}
      </Pressable>
      {active && (!disabled || renderWhenDisabled) ? (
        <View style={styles.expandedBody}>
          <View style={styles.cardDivider} />
          {children}
        </View>
      ) : null}
    </View>
  );
}

function DocumentCameraOverlay({
  cameraRef,
  documentType,
  onCancel,
  onCaptured,
}: {
  cameraRef: MutableRefObject<VisionCameraType | null>;
  documentType: NativeIdentityDocumentType;
  onCancel: () => void;
  onCaptured: (uri: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { Camera: VisionCamera, useCameraDevice } = getVisionCameraModule();
  const device = useCameraDevice("back");
  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [scrimSize, setScrimSize] = useState<{ width: number; height: number } | null>(null);
  const [frameRect, setFrameRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const captureInFlightRef = useRef(false);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capture = useCallback(async () => {
    if (captureInFlightRef.current || capturing || !cameraReady || !cameraRef.current) return;
    captureInFlightRef.current = true;
    setCapturing(true);
    try {
      nativeVerifyReleaseLog("document_camera_photo_start", { documentType });
      let capturePath = "";
      let captureMethod: "photo" | "snapshot" = "photo";
      try {
        const photo = await withNativeVerifyIdentityTimeout(
          cameraRef.current.takePhoto({
            enableShutterSound: false,
            flash: "off",
          }),
          DOCUMENT_CAMERA_CAPTURE_TIMEOUT_MS,
          "document_camera_photo_timeout",
        );
        capturePath = photo.path;
        nativeVerifyReleaseLog("document_camera_photo_success", {
          documentType,
          hasPath: Boolean(capturePath),
          height: photo.height,
          width: photo.width,
        });
      } catch (photoError) {
        captureMethod = "snapshot";
        nativeVerifyReleaseLog("document_camera_photo_fallback", {
          documentType,
          message: getNativeErrorMessage(photoError),
        });
        const snapshot = await withNativeVerifyIdentityTimeout(
          cameraRef.current.takeSnapshot({ quality: 100 }),
          DOCUMENT_CAMERA_CAPTURE_TIMEOUT_MS,
          "document_camera_snapshot_timeout",
        );
        capturePath = snapshot.path;
        nativeVerifyReleaseLog("document_camera_snapshot_success", {
          documentType,
          hasPath: Boolean(capturePath),
          height: snapshot.height,
          width: snapshot.width,
        });
      }
      if (!capturePath) throw new Error("document_camera_missing_capture_path");
      if (documentType === "passport") {
        nativeVerifyReleaseLog("passport_capture_taken", {
          captureMode: "framed_mrz_camera",
          captureMethod,
          hasPath: Boolean(capturePath),
        });
        nativeVerifyReleaseLog("passport_capture_single_image_confirmed", {
          imageCount: 1,
        });
      }
      haptic.success();
      if (documentType === "passport") {
        nativeVerifyReleaseLog("passport_capture_returned", {
          imageCount: 1,
        });
      }
      onCaptured(`file://${capturePath}`);
    } catch (error) {
      nativeVerifyReleaseLog("document_camera_capture_failed", {
        documentType,
        message: getNativeErrorMessage(error),
      });
      if (documentType === "passport") {
        nativeVerifyReleaseLog("passport_capture_rejected", {
          message: getNativeErrorMessage(error),
        });
        nativeVerifyReleaseLog("passport_retry_required", {
          reason: "capture_failed",
        });
      }
      haptic.error();
      setCapturing(false);
      captureInFlightRef.current = false;
    }
  }, [cameraReady, cameraRef, capturing, documentType, onCaptured]);

  useEffect(() => {
    captureInFlightRef.current = false;
    setCapturing(false);
    setCameraReady(false);
    setFrameRect(null);
    return () => {
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      readyTimerRef.current = null;
    };
  }, [documentType]);

  const frameLabel = documentType === "passport" ? "Passport photo page" : "ID / Resident card";
  const guidanceText = documentType === "passport"
    ? "Turn your phone sideways"
    : "Fit the front of your ID inside the frame";
  const readyHint = documentType === "passport"
    ? "Make the two code lines fully visible"
    : "Use the side with your photo and name";
  const handleScrimLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setScrimSize((current) => {
      if (current && Math.round(current.width) === Math.round(width) && Math.round(current.height) === Math.round(height)) return current;
      return { width, height };
    });
  }, []);
  const handleFrameLayout = useCallback((event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    setFrameRect((current) => {
      if (
        current &&
        Math.round(current.x) === Math.round(x) &&
        Math.round(current.y) === Math.round(y) &&
        Math.round(current.width) === Math.round(width) &&
        Math.round(current.height) === Math.round(height)
      ) {
        return current;
      }
      return { x, y, width, height };
    });
  }, []);
  const showMeasuredScrim = scrimSize && frameRect && frameRect.width > 0 && frameRect.height > 0;
  const measuredScrimPath = showMeasuredScrim
    ? buildDocumentCameraScrimPath(scrimSize.width, scrimSize.height, frameRect, 18)
    : "";

  return (
    <View style={styles.documentCameraOverlay}>
      <View style={[styles.documentCameraTopBar, { top: insets.top + huddleSpacing.x2 }]}>
        <Pressable accessibilityLabel="Close document camera" accessibilityRole="button" disabled={capturing} onPress={onCancel} style={styles.documentCameraClose}>
          <Feather color={huddleColors.onPrimary} name="x" size={24} />
        </Pressable>
        <Text style={styles.documentCameraMode}>{frameLabel}</Text>
      </View>
      {device ? (
        <VisionCamera
          ref={cameraRef}
          device={device}
	          isActive
          onInitialized={() => {
            setCameraReady(false);
            if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
            readyTimerRef.current = setTimeout(() => {
              readyTimerRef.current = null;
              setCameraReady(true);
              if (documentType === "passport") {
                nativeVerifyReleaseLog("passport_capture_ready", {
                  captureMode: "framed_mrz_camera",
                });
              }
            }, DOCUMENT_CAMERA_SETTLE_MS);
          }}
          onError={(error) => {
            nativeVerifyReleaseLog("document_camera_error", {
              documentType,
              message: getNativeErrorMessage(error),
            });
            if (documentType === "passport") {
              nativeVerifyReleaseLog("passport_capture_rejected", {
                message: getNativeErrorMessage(error),
              });
            }
          }}
	          photo
	          photoQualityBalance="quality"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View pointerEvents="none" style={styles.documentCameraScrim} onLayout={handleScrimLayout}>
        {showMeasuredScrim ? (
          <Svg
            height="100%"
            preserveAspectRatio="none"
            style={styles.documentCameraDimSvg}
            viewBox={`0 0 ${scrimSize.width} ${scrimSize.height}`}
            width="100%"
          >
            <SvgPath d={measuredScrimPath} fill="rgba(0,0,0,0.52)" fillRule="evenodd" />
          </Svg>
        ) : (
          <View style={styles.documentCameraDimLayerFallback} />
        )}
        <Text style={styles.documentCameraGuidance}>{guidanceText}</Text>
        <View
          onLayout={handleFrameLayout}
          style={[
            styles.documentCameraFrame,
            documentType === "passport" ? styles.documentCameraFramePassport : styles.documentCameraFrameId,
          ]}
        />
        <Text style={styles.documentCameraHint}>{capturing ? "Capturing..." : cameraReady ? readyHint : "Opening camera..."}</Text>
      </View>
      <Pressable
        accessibilityLabel="Capture document"
        accessibilityRole="button"
        disabled={capturing || !cameraReady}
        onPress={capture}
        style={({ pressed }) => [styles.documentCameraShutter, pressed ? huddleButtons.pressed : null, capturing || !cameraReady ? styles.documentCameraShutterDisabled : null]}
      >
        <View style={styles.documentCameraShutterInner} />
      </Pressable>
    </View>
  );
}

function buildDocumentCameraScrimPath(
  width: number,
  height: number,
  frame: { x: number; y: number; width: number; height: number },
  radius: number,
) {
  const x = Math.max(0, frame.x);
  const y = Math.max(0, frame.y);
  const w = Math.max(0, frame.width);
  const h = Math.max(0, frame.height);
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  return [
    `M0 0H${width}V${height}H0Z`,
    `M${x + r} ${y}`,
    `H${x + w - r}`,
    `Q${x + w} ${y} ${x + w} ${y + r}`,
    `V${y + h - r}`,
    `Q${x + w} ${y + h} ${x + w - r} ${y + h}`,
    `H${x + r}`,
    `Q${x} ${y + h} ${x} ${y + h - r}`,
    `V${y + r}`,
    `Q${x} ${y} ${x + r} ${y}`,
    "Z",
  ].join(" ");
}

function getHumanPhoneErrorMessage(message?: string | null) {
  const raw = String(message || "").trim();
  if (!raw) return "";

  const lower = raw.toLowerCase();
  if (lower.includes("verification_required")) {
    return "Complete your human and identity checks before verifying your phone.";
  }
  if (
    lower.includes("edge function") ||
    lower.includes("rpc") ||
    lower.includes("invalid") ||
    lower.includes("not configured") ||
    lower.includes("provider") ||
    lower.includes("native")
  ) {
    return "We couldn't start phone verification. Please try again.";
  }

  if (lower.includes("rate") || lower.includes("cooldown")) {
    return "Please wait a moment before requesting another code.";
  }

  if (lower.includes("expired")) return "That code expired. Please request a new one.";
  if (lower.includes("wrong") || lower.includes("incorrect")) return "That code looks wrong. Please try again.";
  return "We couldn't verify your phone just now. Please try again.";
}

// V3: 6-cell OTP input with per-cell refs, backspace navigation, and paste support
function OtpCellInput({ value, onChangeValue, onComplete }: { value: string; onChangeValue: (v: string) => void; onComplete?: () => void }) {
  const OTP_LENGTH = 6;
  const inputRefs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));
  const cells = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");

  const focusCell = (index: number) => {
    const clampedIndex = Math.max(0, Math.min(OTP_LENGTH - 1, index));
    inputRefs.current[clampedIndex]?.focus();
  };

  const handleChange = (text: string, index: number) => {
    // Handle paste: if multiple chars come in, distribute across cells
    const cleaned = text.replace(/\D/g, "").slice(0, OTP_LENGTH - index);
    if (cleaned.length > 1) {
      const newValue = (value.slice(0, index) + cleaned).slice(0, OTP_LENGTH);
      onChangeValue(newValue);
      const nextFocus = Math.min(index + cleaned.length, OTP_LENGTH - 1);
      focusCell(nextFocus);
      if (newValue.length === OTP_LENGTH) onComplete?.();
      return;
    }
    const digit = cleaned.slice(0, 1);
    const newValue = value.slice(0, index) + digit + value.slice(index + 1);
    onChangeValue(newValue);
    if (digit && index < OTP_LENGTH - 1) focusCell(index + 1);
    if (newValue.length === OTP_LENGTH && newValue.replace(/ /g, "").length === OTP_LENGTH) onComplete?.();
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === "Backspace") {
      if (value[index]) {
        const newValue = value.slice(0, index) + "" + value.slice(index + 1);
        onChangeValue(newValue);
      } else if (index > 0) {
        focusCell(index - 1);
        const newValue = value.slice(0, index - 1) + "" + value.slice(index);
        onChangeValue(newValue);
      }
    }
  };

  return (
    <View style={otpStyles.otpRow}>
      {cells.map((digit, i) => (
        <Pressable key={i} onPress={() => focusCell(i)} style={otpStyles.otpCellWrap}>
          <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
            ref={(ref) => { inputRefs.current[i] = ref; }}
            autoComplete="sms-otp"
            caretHidden
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            returnKeyType="done"
            selectionColor={huddleColors.blue}
            textContentType="oneTimeCode"
            value={digit}
            style={[otpStyles.otpCell, digit ? otpStyles.otpCellFilled : null]}
            onChangeText={(t) => handleChange(t, i)}
            onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
            onFocus={() => {
              // Move focus to first empty cell or last cell
              const firstEmpty = cells.findIndex((c) => !c);
              if (firstEmpty !== -1 && firstEmpty < i) focusCell(firstEmpty);
            }}
          />
        </Pressable>
      ))}
    </View>
  );
}

const otpStyles = StyleSheet.create({
  otpRow: {
    flexDirection: "row",
    gap: huddleSpacing.x2,
    justifyContent: "center",
    marginVertical: huddleSpacing.x2,
  },
  otpCellWrap: {
    flex: 1,
    maxWidth: 48,
  },
  otpCell: {
    borderWidth: 1.5,
    borderColor: huddleColors.divider,
    borderRadius: huddleRadii.field,
    backgroundColor: huddleColors.canvas,
    height: 52,
    textAlign: "center",
    fontFamily: "Urbanist-600",
    fontSize: 22,
    color: huddleColors.text,
  },
  otpCellFilled: {
    borderColor: huddleColors.blue,
    backgroundColor: "rgba(91,109,255,0.06)",
  },
});

function PhonePanel({
  busy,
  onSend,
  onUpdateCode,
  onUpdatePhone,
  onVerify,
  otpCode,
  phone,
  phoneVerified,
  phoneState,
}: {
  busy: boolean;
  onSend: () => void;
  onUpdateCode: (value: string) => void;
  onUpdatePhone: (value: string) => void;
  onVerify: () => void;
  otpCode: string;
  phone: string;
  phoneVerified: boolean;
  phoneState: NativeVerifyIdentityPhoneOtpState;
}) {
  if (phoneVerified || phoneState.state === "verified") {
    return (
      <View style={styles.panelStack}>
        <Text style={styles.panelFieldLabelLarge}>Mobile number</Text>
        <NativePhoneField defaultCountryCode="HK" editable={false} onChangeText={() => undefined} value={phoneState.phone || phone} />
      </View>
    );
  }

  const otpSent = phoneState.state === "sent" || phoneState.state === "failed";
  const sendDisabled = phoneState.loading || busy || phoneState.cooldownSeconds > 0 || phoneState.state === "unavailable";
  const sendLabel = phoneState.loading && !otpSent
    ? "Sending…"
    : phoneState.cooldownSeconds > 0
      ? `Sent ${phoneState.cooldownSeconds}s`
      : otpSent
        ? "Resend"
        : "Send OTP";
  const codeReady = otpSent && !phoneState.loading && !busy && otpCode.trim().length === 6;

  return (
    <View style={styles.panelStack}>
      <View style={styles.phoneFieldBlock}>
        <Text style={styles.panelFieldLabelLarge}>Mobile number</Text>
        <NativePhoneField
          defaultCountryCode="HK"
          error={Boolean(phoneState.error)}
          onChangeText={onUpdatePhone}
          rightAccessory={
            <Pressable
              disabled={sendDisabled}
              onPress={onSend}
              style={({ pressed }) => [styles.inlineOtpButton, sendDisabled ? styles.inlineOtpButtonDisabled : null, pressed && !sendDisabled ? { opacity: 0.82 } : null]}
            >
              <Text style={[styles.inlineOtpButtonText, sendDisabled ? styles.inlineOtpButtonTextDisabled : null]}>{sendLabel}</Text>
            </Pressable>
          }
          rightAccessoryWidth={96}
          value={phone}
        />
        {phoneState.error ? <Text style={styles.fieldErrorSubtext}>{getHumanPhoneErrorMessage(phoneState.error)}</Text> : null}
        {phoneState.cooldownSeconds > 0 ? (
          <View style={styles.cooldownBarTrack}>
            <View style={[styles.cooldownBarFill, { width: `${(phoneState.cooldownSeconds / PHONE_OTP_OPTIMISTIC_COOLDOWN_SECONDS) * 100}%` }]} />
          </View>
        ) : null}
      </View>
      {phoneState.maskedPhoneHint && otpSent ? (
        <Text style={styles.otpSentText}>Code sent to {phoneState.maskedPhoneHint}.</Text>
      ) : null}
      {otpSent ? (
        <>
          <OtpCellInput value={otpCode} onChangeValue={onUpdateCode} onComplete={codeReady ? onVerify : undefined} />
          <ActionButton disabled={!codeReady} label={phoneState.loading ? "Verifying…" : "Verify code"} onPress={onVerify} secondary={!codeReady} />
        </>
      ) : null}
    </View>
  );
}

class HumanDetectorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onError: (error: unknown) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function HumanPendingBrandLoader() {
  return (
    <View testID="human-pending-branded-loader" style={styles.humanPendingLoader}>
      <NativeBrandMedia size={156} windowHeight={156} />
    </View>
  );
}

function NativeHumanFaceDetectorCamera({
  device,
  faceDetectionOptions,
  onCameraError,
  onCameraInitialized,
  onFacesDetected,
}: {
  device: CameraDevice;
  faceDetectionOptions: FrameFaceDetectionOptions;
  onCameraError: (error: unknown) => void;
  onCameraInitialized: () => void;
  onFacesDetected: (faces: Face[], frame: NativeHumanDetectorFrame) => void;
}) {
  const { Camera: VisionCamera, runAtTargetFps, useFrameProcessor } = getVisionCameraModule();
  const { useFaceDetector } = getFaceDetectorModule();
  const { Worklets } = getWorkletsModule();
  const cameraRef = useRef<VisionCameraType | null>(null);
  const handleFacesDetected = useCallback((faces: Face[], frame: NativeHumanDetectorFrame) => {
    onFacesDetected(faces, { height: frame.height, width: frame.width });
  }, [onFacesDetected]);
  const runFacesDetectedOnJs = useMemo(
    () => Worklets.createRunOnJS(handleFacesDetected),
    [Worklets, handleFacesDetected],
  );
  const { detectFaces } = useFaceDetector(faceDetectionOptions);
  const frameProcessor = useFrameProcessor((frame) => {
    "worklet";
    runAtTargetFps(5, () => {
      "worklet";
      // Keep the native frame on the camera thread; only send serializable results to React.
      runFacesDetectedOnJs(detectFaces(frame), { height: frame.height, width: frame.width });
    });
  }, [detectFaces, runAtTargetFps, runFacesDetectedOnJs]);

  return (
    <VisionCamera
      ref={cameraRef}
      device={device}
      frameProcessor={frameProcessor}
      isActive
      onError={onCameraError}
      onInitialized={onCameraInitialized}
      pixelFormat="yuv"
      style={StyleSheet.absoluteFill}
    />
  );
}

function NativeHumanCameraPreview({
  device,
  onCameraError,
  onCameraInitialized,
}: {
  device: CameraDevice;
  onCameraError: (error: unknown) => void;
  onCameraInitialized: () => void;
}) {
  const { Camera: VisionCamera } = getVisionCameraModule();
  return (
    <VisionCamera
      device={device}
      isActive
      onError={onCameraError}
      onInitialized={onCameraInitialized}
      style={StyleSheet.absoluteFill}
    />
  );
}

function HumanCameraRuntime({
  faceDetectionOptions,
  humanAttemptId,
  onCameraError,
  onCameraInitialized,
  onDetectorError,
  onFacesDetected,
}: {
  faceDetectionOptions: FrameFaceDetectionOptions;
  humanAttemptId: string;
  onCameraError: (error: unknown) => void;
  onCameraInitialized: () => void;
  onDetectorError: (error: unknown) => void;
  onFacesDetected: (faces: Face[], frame: NativeHumanDetectorFrame) => void;
}) {
  const { useCameraDevice } = getVisionCameraModule();
  const device = useCameraDevice("front");

  if (!device) return null;

  return (
    <HumanDetectorBoundary
      key={humanAttemptId}
      fallback={(
        <NativeHumanCameraPreview
          device={device}
          onCameraError={onCameraError}
          onCameraInitialized={onCameraInitialized}
        />
      )}
      onError={onDetectorError}
    >
      <NativeHumanFaceDetectorCamera
        device={device}
        faceDetectionOptions={faceDetectionOptions}
        onCameraError={onCameraError}
        onCameraInitialized={onCameraInitialized}
        onFacesDetected={onFacesDetected}
      />
    </HumanDetectorBoundary>
  );
}

const getHumanInstructionCopy = ({
  detectorUnavailable,
  faceStatus,
  humanState,
  passed,
  pending,
  permissionDenied,
  poseStep,
  ready,
  startingCamera,
  startingHuman,
}: {
  detectorUnavailable: boolean;
  faceStatus: string;
  humanState: NativeVerifyIdentityHumanState;
  passed: boolean;
  pending: boolean;
  permissionDenied: boolean;
  poseStep: HumanPoseStep;
  ready: boolean;
  startingCamera: boolean;
  startingHuman: boolean;
}): HumanInstructionCopy => {
  if (permissionDenied) {
    return {
      error: null,
      heading: "Camera access needed",
      helper: "Turn on Camera for huddle in Settings.",
    };
  }
  if (detectorUnavailable) {
    return {
      error: null,
      heading: "Facial detection couldn't start",
      helper: "There seems to be an issue with the facial detector. Please try again later.",
    };
  }
  if (pending) {
    return {
      error: null,
      heading: "Confirming your check",
      helper: "Almost done.",
    };
  }
  if (startingHuman) {
    return {
      error: null,
      heading: "Center your face",
      helper: "Move into the oval, look at the camera, and hold steady.",
    };
  }
  if (passed) {
    return {
      error: null,
      heading: "You're verified",
      helper: null,
    };
  }
  if (humanState.state === "failed") {
    if (humanState.failure === "timeout" || humanState.failure === "detector_unavailable") {
      return {
        error: null,
        heading: "Facial detection couldn't start",
        helper: "There seems to be an issue with the facial detector. Please try again later.",
      };
    }
    return {
      error: getHumanRecoveryCopy(faceStatus || humanState.error),
      heading: "Let's try that again",
      helper: "Keep the motion slow and stay inside the oval.",
    };
  }
  if (startingCamera) {
    return {
      error: null,
      heading: "Center your face",
      helper: "Move into the oval, look at the camera, and hold steady.",
    };
  }
  if (ready || humanState.state === "idle") {
    return {
      error: null,
      heading: "Center your face",
      helper: "Center your face in the oval and hold steady for the camera.",
    };
  }
  if (poseStep === "left") {
    return {
      error: getHumanRecoveryCopy(faceStatus),
      heading: "Start by looking left",
      helper: "Slowly look to the left while keeping your face inside the oval.",
    };
  }
  if (poseStep === "right") {
    return {
      error: getHumanRecoveryCopy(faceStatus),
      heading: "Turn your head right now",
      helper: "Slowly look to the right while keeping your face inside the oval.",
    };
  }
  if (poseStep === "done") {
    return {
      error: null,
      heading: "Hold still",
      helper: "Checking your face position.",
    };
  }
  return {
    error: getHumanRecoveryCopy(faceStatus),
    heading: "Center your face",
    helper: "Move into the oval, look at the camera, and hold steady.",
  };
};

const getHumanRecoveryCopy = (raw: string | null | undefined): string | null => {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return null;
  if (value.includes("no face detected")) return "No face detected. Make sure your face is visible and the lighting is clear.";
  if (value.includes("turn a little more left")) return "Turn a little more left";
  if (value.includes("turn a little more right")) return "Turn a little more right";
  if (value.includes("turn the other way")) return "Turn the other way";
  if (value.includes("upright")) return "Keep your face upright";
  if (value.includes("closer") || value.includes("small")) return "Move your phone a little closer";
  if (value.includes("back slightly") || value.includes("too large")) return "Move your phone slightly back";
  if (value.includes("inside") || value.includes("frame") || value.includes("oval") || value.includes("visible") || value.includes("center")) return "Keep your face inside the oval";
  if (value.includes("slow") || value.includes("moment") || value.includes("steady") || value.includes("fast")) return "Slower - give the camera a moment";
  if (value.includes("multiple") || value.includes("alone") || value.includes("only one face")) return "Make sure only your face is in frame";
  if (value.includes("opposite")) return "Turn the other way this time";
  if (value.includes("no face") || value.includes("detect")) return "Keep your face inside the oval";
  return null;
};

function HumanTurnCue({ direction }: { direction: "left" | "right" }) {
  const left = direction === "left";
  const path = left ? "M146 72C116 42 75 48 55 80" : "M74 72C104 42 145 48 165 80";
  const head = left ? "M56 80L54 62M56 80L74 78" : "M164 80L166 62M164 80L146 78";
  const draw = useRef(new Animated.Value(0)).current;
  const dashOffset = draw.interpolate({ inputRange: [0, 1], outputRange: [160, 0] });

  useEffect(() => {
    draw.setValue(0);
    Animated.timing(draw, {
      duration: 380,
      toValue: 1,
      useNativeDriver: false,
    }).start();
  }, [direction, draw]);

  return (
    <View style={styles.humanTurnCue}>
      <Svg height={96} viewBox={`0 0 ${HUMAN_GUIDE_VIEWBOX_WIDTH} 120`} width={HUMAN_GUIDE_WIDTH}>
        <SvgG fill="none" stroke={huddleColors.blue} strokeLinecap="round" strokeLinejoin="round" opacity={0.5}>
          <AnimatedSvgPath d={path} strokeDasharray={160} strokeDashoffset={dashOffset} strokeWidth={2.5} />
          <AnimatedSvgPath d={head} strokeDasharray={60} strokeDashoffset={dashOffset} strokeWidth={2.5} />
        </SvgG>
      </Svg>
    </View>
  );
}

function HumanPanel({
  busy,
  cameraGranted,
  cameraPermissionStatus,
  completedSteps,
  confirmationDwell,
  faceDetectionOptions,
  faceStatus,
  humanState,
  humanStartPending,
  onCapture,
  onCameraError,
  onCameraInitialized,
  onDetectorError,
  onFacesDetected,
  onLayoutCamera,
  onOpenSettings,
  onStart,
  poseStep,
  settlePhase,
  startupState,
}: {
  busy: boolean;
  cameraGranted: boolean;
  cameraPermissionStatus: CameraPermissionStatus;
  completedSteps: HumanCompletedSteps;
  confirmationDwell: HumanConfirmationDwell;
  faceDetectionOptions: FrameFaceDetectionOptions;
  faceStatus: string;
  humanState: NativeVerifyIdentityHumanState;
  humanStartPending: boolean;
  onCapture: () => void;
  onCameraError: (error: unknown) => void;
  onCameraInitialized: () => void;
  onDetectorError: (error: unknown) => void;
  onFacesDetected: (faces: Face[], frame: NativeHumanDetectorFrame) => void;
  onLayoutCamera: (event: LayoutChangeEvent) => void;
  onOpenSettings: () => void;
  onStart: () => void;
  poseStep: HumanPoseStep;
  settlePhase: HumanSettlePhase;
  startupState: HumanDetectorStartupState;
}) {
  const permissionDenied = humanState.failure === "permission_denied" || humanState.failure === "no_camera" || cameraPermissionStatus === "denied" || cameraPermissionStatus === "restricted";
  const detectorUnavailable = humanState.failure === "detector_unavailable";
  const capturing = humanState.state === "capturing";
  const detectorPreviewOnly = capturing && startupState === "native_error";
  const startingCamera = capturing && startupState !== "detecting" && startupState !== "preview_ready";
  const startLoading = humanStartPending;
  const pending = humanState.state === "pending";
  const passed = humanState.state === "passed";
  const ready = humanState.state === "ready";
  const completedOrFinishing = passed || poseStep === "done" || pending;
  const centerPassed = completedSteps.center || passed;
  const leftPassed = completedSteps.left || passed;
  const rightPassed = completedSteps.right || passed;
  const centerActive = poseStep === "center" && !centerPassed;
  const leftActive = poseStep === "left" && !leftPassed;
  const rightActive = poseStep === "right" && !rightPassed;
  const showDetectorCamera = capturing && !completedOrFinishing && cameraGranted;
  const showCameraStartupOverlay = showDetectorCamera && startingCamera;
  const showFailedArc = humanState.state === "failed" && !capturing && !pending && !confirmationDwell;
  const scanVisual = getNativeHumanScanVisualState({
    confirmationDwellStep: confirmationDwell?.step ?? null,
    currentStep: poseStep,
    failed: showFailedArc || pending || passed,
    settleTarget: settlePhase?.target ?? null,
  });
  const showPendingBrandLoader = pending;
  const showScanOverlay = !showPendingBrandLoader && !passed;
  const showCenterScanRing = showScanOverlay && (scanVisual.showCenterRing || (!showFailedArc && (!showDetectorCamera || showCameraStartupOverlay) && !leftActive && !rightActive && scanVisual.visualActiveStep !== "settle"));
  const showLeftScanArc = showScanOverlay && scanVisual.showLeftArc;
  const showRightScanArc = showScanOverlay && scanVisual.showRightArc;
  const instructionCopy = getHumanInstructionCopy({
    detectorUnavailable,
    faceStatus,
    humanState,
    passed,
    pending,
    permissionDenied,
    poseStep,
    ready,
    startingCamera,
    startingHuman: startLoading,
  });

  const buttonLabel = permissionDenied
    ? "Open huddle Settings"
    : passed
      ? "Verified"
      : pending
        ? "Validating"
          : detectorUnavailable
          ? "Try Again"
          : detectorPreviewOnly
            ? "Try Again"
          : capturing
            ? startingCamera
              ? "Starting Camera"
              : "Detecting…"
            : startLoading
              ? ""
            : ready
              ? "Begin Check"
              : humanState.state === "failed"
                ? "Try again"
                : "Start Facial Detection";

  return (
    <View style={styles.panelStack}>
      <View onLayout={onLayoutCamera} style={[styles.humanCameraPreview, showDetectorCamera ? styles.humanCameraPreviewActive : null]}>
        {showDetectorCamera ? (
          <HumanCameraRuntime
            faceDetectionOptions={faceDetectionOptions}
            humanAttemptId={humanState.attemptId || "human-detector"}
            onCameraError={onCameraError}
            onCameraInitialized={onCameraInitialized}
            onDetectorError={onDetectorError}
            onFacesDetected={onFacesDetected}
          />
        ) : null}
        <View style={styles.humanCameraOverlay}>
          {/* captureOverlay: dark scrim only exists while the live detector camera is active. */}
          {showDetectorCamera ? <View pointerEvents="none" style={styles.humanOvalScrim} /> : null}

          {showPendingBrandLoader ? <HumanPendingBrandLoader /> : null}

          {!showDetectorCamera && showScanOverlay ? <View pointerEvents="none" style={[styles.humanOvalBase, styles.humanOvalBaseIdle]} /> : null}
          {showDetectorCamera && !confirmationDwell && (poseStep === "left" || poseStep === "right") ? <HumanTurnCue direction={poseStep} /> : null}
          {/* Center full ring */}
          {showCenterScanRing ? (
            <View pointerEvents="none" style={[
              styles.humanOvalSegment,
              styles.humanOvalCenterRing,
              scanVisual.centerColor === "done" || passed ? styles.humanOvalSegmentDone : scanVisual.centerColor === "active" ? styles.humanOvalSegmentActive : styles.humanOvalSegmentNeutral,
              permissionDenied || humanState.state === "failed" ? styles.humanOvalSegmentError : null,
            ]} />
          ) : null}
          {/* Left half arc */}
          {showLeftScanArc ? (
            <View pointerEvents="none" style={styles.humanOvalLeftClip}>
              <View style={[
                styles.humanOvalSegment,
                styles.humanOvalHalfRing,
                scanVisual.leftColor === "done" ? styles.humanOvalSegmentDone : styles.humanOvalSegmentActive,
                permissionDenied || humanState.state === "failed" ? styles.humanOvalSegmentError : null,
              ]} />
            </View>
          ) : null}
          {/* Right half arc */}
          {showRightScanArc ? (
            <View pointerEvents="none" style={styles.humanOvalRightClip}>
              <View style={[
                styles.humanOvalSegment,
                styles.humanOvalHalfRing,
                styles.humanOvalRightRing,
                scanVisual.rightColor === "done" ? styles.humanOvalSegmentDone : styles.humanOvalSegmentActive,
                permissionDenied || humanState.state === "failed" ? styles.humanOvalSegmentError : null,
              ]} />
            </View>
          ) : null}

          {!showDetectorCamera && showScanOverlay && !passed ? (
            <View style={styles.humanOvalEmptyIcon}>
              <Feather
                color={
                  passed
                    ? huddleColors.success
                    : permissionDenied || detectorUnavailable || humanState.state === "failed"
                      ? huddleColors.validationRed
                      : huddleColors.blue
                }
                name={passed ? "check" : "user"}
                size={34}
              />
            </View>
          ) : null}
        </View>
      </View>

      <HumanProgressDots
        activeStep={poseStep === "done" ? "right" : poseStep}
        completedSteps={completedSteps}
        passed={passed}
      />

      <HumanInstructionBlock
        copy={instructionCopy}
        transitionKey={`${poseStep}:${humanState.state}:${pending ? "pending" : ""}:${passed ? "passed" : ""}:${permissionDenied ? "permission" : ""}:${detectorUnavailable ? "detector" : ""}`}
      />
      <ActionButton
        disabled={busy || startLoading || (capturing && !detectorPreviewOnly) || pending || passed}
        label={buttonLabel}
        loading={startLoading}
        onPress={permissionDenied ? onOpenSettings : detectorUnavailable || detectorPreviewOnly ? onStart : ready ? onCapture : onStart}
      />
    </View>
  );
}

function HumanInstructionBlock({ copy, transitionKey }: { copy: HumanInstructionCopy; transitionKey: string }) {
  const fade = useRef(new Animated.Value(1)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const [displayCopy, setDisplayCopy] = useState(copy);
  const previousKeyRef = useRef(transitionKey);

  useEffect(() => {
    if (previousKeyRef.current === transitionKey) {
      setDisplayCopy((current) => (
        current.heading === copy.heading && current.helper === copy.helper && current.error === copy.error
          ? current
          : copy
      ));
      return undefined;
    }
    previousKeyRef.current = transitionKey;
    let active = true;
    Animated.timing(fade, {
      duration: 100,
      toValue: 0,
      useNativeDriver: true,
    }).start(() => {
      if (!active) return;
      setDisplayCopy(copy);
      slide.setValue(8);
      Animated.parallel([
        Animated.timing(fade, {
          duration: 200,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(slide, {
          duration: 200,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]).start();
    });
    return () => {
      active = false;
    };
  }, [copy.error, copy.heading, copy.helper, fade, slide, transitionKey]);

  return (
    <Animated.View style={[styles.humanInstructionBlock, { opacity: fade, transform: [{ translateY: slide }] }]}>
      <Text style={styles.humanInlineTitle}>{displayCopy.heading}</Text>
      {displayCopy.helper ? <Text style={styles.humanInlineHelper}>{displayCopy.helper}</Text> : null}
      {displayCopy.error ? <Text style={styles.humanGuidancePill}>{displayCopy.error}</Text> : null}
    </Animated.View>
  );
}

function HumanProgressDots({
  activeStep,
  completedSteps,
  passed,
}: {
  activeStep: Exclude<HumanPoseStep, "done">;
  completedSteps: HumanCompletedSteps;
  passed: boolean;
}) {
  const steps: Exclude<HumanPoseStep, "done">[] = ["center", "left", "right"];
  return (
    <View accessibilityLabel="Facial detection progress" style={styles.humanProgressDots}>
      {steps.map((step) => {
        const complete = passed || completedSteps[step];
        const active = !passed && activeStep === step && !complete;
        return (
          <View
            key={step}
            style={[
              styles.humanProgressDotShell,
              active ? styles.humanProgressDotShellActive : null,
              passed ? styles.humanProgressDotShellPassed : null,
            ]}
          >
            <View
              style={[
                styles.humanProgressDotCompact,
                complete ? styles.humanProgressDotCompactDone : null,
                active ? styles.humanProgressDotCompactActive : null,
                passed ? styles.humanProgressDotCompactPassed : null,
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

function HumanProgressStep({ active, done, label, passed }: { active: boolean; done: boolean; label: string; passed: boolean }) {
  return (
    <View style={[
      styles.humanProgressStep,
      active ? styles.humanProgressStepActive : null,
      done ? styles.humanProgressStepDone : null,
      passed && done ? styles.humanProgressStepPassed : null,
    ]}>
      <View style={[
        styles.humanProgressDot,
        active ? styles.humanProgressDotActive : null,
        done ? styles.humanProgressDotDone : null,
        passed && done ? styles.humanProgressDotPassed : null,
      ]}>
        {done ? <Feather color={huddleColors.onPrimary} name="check" size={10} /> : null}
      </View>
      <Text style={[
        styles.humanProgressLabel,
        active ? styles.humanProgressLabelActive : null,
        done ? styles.humanProgressLabelDone : null,
        passed && done ? styles.humanProgressLabelPassed : null,
      ]}>
        {label}
      </Text>
    </View>
  );
}

function SoftReadingArc() {
  const rotate = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 1100,
        isInteraction: false,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [rotate]);
  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View style={[styles.softReadingArc, { transform: [{ rotate: spin }] }]}>
      <View style={styles.softReadingArcGap} />
    </Animated.View>
  );
}

function DocumentIdentityPanel({
  documentConfirmed,
  humanPassed,
  onCapture,
  onConfirm,
  onLegalNameErrorFocus,
  onSubmitAgain,
  onUpdateConfirmed,
  onUpdateType,
  state,
}: {
  documentConfirmed: boolean;
  humanPassed: boolean;
  onCapture: () => void;
  onConfirm: () => void;
  onLegalNameErrorFocus: (screenY?: number | null) => void;
  onSubmitAgain: () => void;
  onUpdateConfirmed: (values: IdentityDocumentValues) => void;
  onUpdateType: (documentType: NativeIdentityDocumentType) => void;
  state: DocumentIdentityState;
}) {
  const dobEligibilityCopy = getDocumentDobEligibilityCopy(state.confirmed.dob);
  const legalNameInputRef = useRef<TextInput | null>(null);
  const legalNameFieldRef = useRef<View | null>(null);
  const legalNameError = state.state === "idle" && /legal name/i.test(state.error ?? "") ? state.error : null;

  useEffect(() => {
    if (!legalNameError) return;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    const timer = setTimeout(() => {
      legalNameFieldRef.current?.measureInWindow((_x, y) => {
        onLegalNameErrorFocus(y);
      });
      legalNameInputRef.current?.focus();
      settleTimer = setTimeout(() => {
        legalNameFieldRef.current?.measureInWindow((_x, y) => {
          onLegalNameErrorFocus(y);
        });
      }, 220);
    }, 120);
    return () => {
      clearTimeout(timer);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [legalNameError, onLegalNameErrorFocus]);

  const scrollLegalNameIntoView = useCallback(() => {
    requestAnimationFrame(() => {
      legalNameFieldRef.current?.measureInWindow((_x, y) => {
        onLegalNameErrorFocus(y);
      });
    });
  }, [onLegalNameErrorFocus]);

  if (!humanPassed) {
    return (
      <View style={styles.panelStack}>
        <Text style={styles.panelCopy}>Verify you're human first.</Text>
      </View>
    );
  }

  if (documentConfirmed || state.state === "confirmed") {
    const documentSex = formatNativeIdentityDocumentGender(state.confirmed.documentGender);
    const documentCountry = formatNativeIdentityDocumentCountry(state.confirmed.documentCountry);
    return (
      <View style={styles.panelStack}>
        <NativeFormTextField compact editable={false} label="Legal name" onChangeText={() => undefined} placeholder="Legal name" value={state.confirmed.legalName} />
        <NativeFormTextField compact editable={false} label="Date of birth" onChangeText={() => undefined} placeholder="01 Jan 2000" value={validateDocumentDob(state.confirmed.dob).display ?? state.confirmed.dob} />
        {documentCountry ? <NativeFormTextField compact editable={false} label="Nationality" onChangeText={() => undefined} placeholder="Nationality" value={documentCountry} /> : null}
        {documentSex ? <NativeFormTextField compact editable={false} label="Sex" onChangeText={() => undefined} placeholder="Sex" value={documentSex} /> : null}
      </View>
    );
  }

  if (state.state === "reading") {
    return (
      <View style={styles.documentReadingBox}>
        <SoftReadingArc />
        <Text style={styles.humanInlineTitle}>Reading your document...</Text>
        <Text style={styles.panelCopy}>This happens on your device. We don't upload or store your document capture.</Text>
      </View>
    );
  }

  if (state.state === "review") {
    const documentCountry = formatNativeIdentityDocumentCountry(state.confirmed.documentCountry);
    const documentSex = formatNativeIdentityDocumentGender(state.confirmed.documentGender);
    return (
      <View style={styles.panelStack}>
        <Text style={styles.humanInlineTitle}>Confirm your details</Text>
        <NativeFormTextField compact editable={false} label="Legal name" onChangeText={() => undefined} placeholder="Legal name" value={state.confirmed.legalName} />
        <NativeFormTextField compact editable={false} label="Date of birth" onChangeText={() => undefined} placeholder="01 Jan 2000" value={validateDocumentDob(state.confirmed.dob).display ?? state.confirmed.dob} />
        {documentCountry ? <NativeFormTextField compact editable={false} label="Nationality" onChangeText={() => undefined} placeholder="Nationality" value={documentCountry} /> : null}
        {documentSex ? <NativeFormTextField compact editable={false} label="Sex" onChangeText={() => undefined} placeholder="Sex" value={documentSex} /> : null}
        {dobEligibilityCopy ? <Text style={styles.fieldInfoSubtext}>{dobEligibilityCopy}</Text> : null}
        {state.error ? <Text style={styles.fieldErrorSubtext}>{state.error}</Text> : null}
        <ActionButton label="Confirm" onPress={onConfirm} />
        <ActionButton label="Scan again" onPress={onSubmitAgain} secondary />
      </View>
    );
  }

  return (
    <View style={styles.panelStack}>
      <Text style={styles.panelCopy}>Use your camera to confirm your identity details.</Text>
      <View ref={legalNameFieldRef}>
        <NativeFormTextField
          compact
          error={legalNameError ?? undefined}
          label="Legal name"
          onChangeText={(legalName) => onUpdateConfirmed({ ...state.confirmed, legalName })}
          onFocus={scrollLegalNameIntoView}
          placeholder="Enter your legal name"
          ref={legalNameInputRef}
          value={state.confirmed.legalName}
        />
      </View>
      {state.error && !legalNameError ? <Text style={styles.fieldErrorSubtext}>{state.error}</Text> : null}
      <View style={styles.segmentedRow}>
        <Pressable accessibilityLabel="Passport" accessibilityRole="button" accessibilityState={{ selected: state.documentType === "passport" }} onPress={() => onUpdateType("passport")} style={[styles.segmentedOption, styles.segmentedOptionPassport, state.documentType === "passport" ? styles.segmentedOptionActive : null]}>
          <Feather color={state.documentType === "passport" ? huddleColors.blue : huddleColors.iconMuted} name="book-open" size={24} />
          <Text style={[styles.segmentedText, state.documentType === "passport" ? styles.segmentedTextActive : null]}>Passport</Text>
        </Pressable>
        <Pressable accessibilityLabel="ID or resident card" accessibilityRole="button" accessibilityState={{ selected: state.documentType === "id" }} onPress={() => onUpdateType("id")} style={[styles.segmentedOption, styles.segmentedOptionId, state.documentType === "id" ? styles.segmentedOptionActive : null]}>
          <Feather color={state.documentType === "id" ? huddleColors.blue : huddleColors.iconMuted} name="credit-card" size={24} />
          <Text style={[styles.segmentedText, state.documentType === "id" ? styles.segmentedTextActive : null]}>ID/Resident Card</Text>
        </Pressable>
      </View>
      <ActionButton label="Open camera" onPress={onCapture} />
    </View>
  );
}

function DocumentDobPicker({ dob, onChange }: { dob: string; onChange: (dob: string) => void }) {
  const [open, setOpen] = useState(false);
  const parsedParts = getDocumentDobParts(dob);
  const display = validateDocumentDob(dob).display ?? "";
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1899 }, (_, index) => currentYear - index);
  const activeParts = parsedParts.year && parsedParts.month && parsedParts.day
    ? parsedParts
    : { day: 1, month: 1, year: currentYear - 18 };
  const days = Array.from({ length: daysInDocumentMonth(activeParts.year ?? currentYear - 18, activeParts.month ?? 1) }, (_, index) => index + 1);
  const updatePart = (next: Partial<typeof activeParts>) => {
    const merged = { ...activeParts, ...next };
    const dayMax = daysInDocumentMonth(merged.year ?? currentYear - 18, merged.month ?? 1);
    const formatted = formatDocumentDobFromParts({ ...merged, day: Math.min(merged.day ?? 1, dayMax) });
    if (formatted) onChange(formatted);
  };

  return (
    <View style={styles.documentPickerBlock}>
      <Text style={styles.panelFieldLabelLarge}>Date of birth</Text>
      <Pressable accessibilityLabel="Choose date of birth" accessibilityRole="button" onPress={() => setOpen((current) => !current)} style={({ pressed }) => [styles.documentDateField, open ? styles.documentDateFieldFocused : null, pressed ? huddleButtons.pressed : null]}>
        <Text style={[styles.documentPickerText, display ? null : styles.documentPickerPlaceholder]}>{display || "01 Jan 2000"}</Text>
        <Feather color={huddleColors.iconMuted} name="calendar" size={17} />
      </Pressable>
      {open ? (
        <View style={styles.documentInlineDatePopover}>
          <View style={styles.documentInlineDateColumns}>
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.documentInlineDateColumn}>
              {years.map((year) => (
                <Pressable key={year} onPress={() => updatePart({ year })} style={[styles.documentInlineDateOption, activeParts.year === year ? styles.documentInlineDateOptionActive : null]}>
                  <Text style={[styles.documentInlineDateOptionText, activeParts.year === year ? styles.documentInlineDateOptionTextActive : null]}>{year}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.documentInlineDateColumn}>
              {DOCUMENT_DOB_MONTHS.map((month) => (
                <Pressable key={month.value} onPress={() => updatePart({ month: month.value })} style={[styles.documentInlineDateOption, activeParts.month === month.value ? styles.documentInlineDateOptionActive : null]}>
                  <Text style={[styles.documentInlineDateOptionText, activeParts.month === month.value ? styles.documentInlineDateOptionTextActive : null]}>{padDatePart(month.value)}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.documentInlineDateColumn}>
              {days.map((day) => (
                <Pressable key={day} onPress={() => updatePart({ day })} style={[styles.documentInlineDateOption, activeParts.day === day ? styles.documentInlineDateOptionActive : null]}>
                  <Text style={[styles.documentInlineDateOptionText, activeParts.day === day ? styles.documentInlineDateOptionTextActive : null]}>{padDatePart(day)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function DocumentPickerMenu({ children }: { children: ReactNode }) {
  return (
    <View style={styles.documentPickerMenu}>
      <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.documentPickerScroll}>
        {children}
      </ScrollView>
    </View>
  );
}

function DocumentPickerOption({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.documentPickerOption, pressed ? huddleButtons.pressed : null]}>
      <Text style={[styles.documentPickerOptionText, active ? styles.documentPickerOptionTextActive : null]}>{label}</Text>
      {active ? <Feather color={huddleColors.blue} name="check" size={16} /> : null}
    </Pressable>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "success" | "error" | "muted" }) {
  return (
    <View style={[styles.statusPill, tone === "success" ? styles.statusSuccess : tone === "error" ? styles.statusError : styles.statusMuted]}>
      <Text style={[styles.statusLabel, tone === "success" ? styles.statusLabelSuccess : tone === "error" ? styles.statusLabelError : styles.statusLabelMuted]}>{label}</Text>
    </View>
  );
}

function ActionButton({ disabled, label, loading, onPress, secondary }: { disabled?: boolean; label: string; loading?: boolean; onPress: () => void; secondary?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [
      styles.actionButton,
      loading ? huddleButtons.primary : disabled || secondary ? styles.secondaryButton : huddleButtons.primary,
      pressed && !loading ? huddleButtons.pressed : null,
    ]}>
      {loading ? <NativeSpinner tone="primary" size="sm" /> : <Text style={[styles.actionButtonText, disabled || secondary ? styles.secondaryButtonText : null]}>{label}</Text>}
    </Pressable>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

function describeOverallChip(status: string | null | undefined): { label: string; tone: "success" | "error" | "muted" } {
  if (status === "verified") return { label: "Verified", tone: "success" };
  if (status === "pending") return { label: "Pending", tone: "muted" };
  return { label: "Unverified", tone: "muted" };
}

function getPhoneBadge(state: NativeVerifyIdentityPhoneOtpState, profileStatus?: string | null) {
  if (profileStatus === "verified" || state.state === "verified") return { label: "Complete", tone: "success" as const };
  if (state.state === "unavailable") return { label: "Unavailable", tone: "muted" as const };
  if (state.state === "failed") return { label: "Action needed", tone: "error" as const };
  if (state.state === "sent" || state.loading) return { label: "Pending", tone: "muted" as const };
  return null;
}

function getHumanBadge(state: NativeVerifyIdentityHumanState) {
  if (state.state === "passed") return { label: "Complete", tone: "success" as const };
  if (state.state === "failed") return { label: "Action needed", tone: "error" as const };
  if (state.state === "pending" || state.state === "ready" || state.state === "capturing") return { label: "Pending", tone: "muted" as const };
  return null;
}

function getDocumentBadge(state: DocumentIdentityState) {
  if (state.state === "confirmed") return { label: "Complete", tone: "success" as const };
  if (state.error) return { label: "Action needed", tone: "error" as const };
  if (state.state === "reading" || state.state === "review") return { label: "Pending", tone: "muted" as const };
  return null;
}

function createProofPhoneState(proofMode: boolean, activeCard: ActiveCard): NativeVerifyIdentityPhoneOtpState {
  if (!proofMode) return createNativeVerifyIdentityPhoneOtpState();
  if (activeCard === "phone") {
    return {
      ...createNativeVerifyIdentityPhoneOtpState("+1 555 012 3456"),
      state: "sent",
      cooldownSeconds: 42,
      maskedPhoneHint: "+1 •••• 3456",
    };
  }
  return {
    ...createNativeVerifyIdentityPhoneOtpState("+1 555 012 3456"),
    state: "verified",
    maskedPhoneHint: "+1 •••• 3456",
  };
}

function createProofHumanState(proofMode: boolean, activeCard: ActiveCard): NativeVerifyIdentityHumanState {
  const base = createNativeVerifyIdentityHumanState();
  if (!proofMode) return base;
  if (activeCard === "human") {
    return {
      ...base,
      state: "ready",
      attemptId: "proof-human-attempt",
      challenge: {
        challengeType: "turn_left_right",
        instruction: "Slowly turn your head left, then right.",
        issuedAt: new Date(0).toISOString(),
        expiresInSec: 120,
      },
    };
  }
  return { ...base, state: "passed" };
}

const styles = StyleSheet.create({
  skipFooter: {
    marginTop: huddleSpacing.x2,
  },
  screen: {
    flex: 1,
    backgroundColor: huddleColors.canvas,
  },
  lockedScreen: {
    flex: 1,
    paddingHorizontal: huddleSpacing.x5,
    gap: huddleSpacing.x3,
    backgroundColor: huddleColors.canvas,
  },
  lockedCopy: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body * huddleType.lineNormal,
    color: huddleColors.subtext,
  },
  header: {
    minHeight: huddleLayout.headerHeight + huddleSpacing.x6,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x2,
    backgroundColor: huddleColors.canvas,
    zIndex: 2,
  },
  backButton: {
    width: huddleVerifyIdentity.backButtonWidth,
    minHeight: huddleLayout.minTouch,
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Urbanist-700",
    fontSize: huddleType.nativeHeaderTitle,
    lineHeight: huddleType.nativeHeaderTitleLine,
    color: huddleColors.text,
  },
  scroller: {
    flex: 1,
  },
  content: {
    paddingHorizontal: huddleSpacing.x4,
    gap: huddleSpacing.x4,
  },
  hero: {
    alignItems: "center",
    gap: huddleSpacing.x4,
  },
  illustration: {
    width: huddleVerifyIdentity.illustrationWidth,
    height: huddleVerifyIdentity.illustrationHeight,
    resizeMode: "contain",
  },
  introCopy: {
    maxWidth: huddleVerifyIdentity.introMaxWidth,
    textAlign: "center",
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body * huddleType.lineNormal,
    color: huddleColors.subtext,
  },
  introCopyBlocked: {
    color: huddleColors.validationRed,
    fontFamily: "Urbanist-400",
  },
  blockedPanel: {
    borderRadius: huddleRadii.glass,
    backgroundColor: huddleColors.validationSoft,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x4,
    ...huddleShadows.glassElevation1,
    ...huddleFieldStates.error,
  },
  blockedText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  supportLink: {
    marginTop: huddleSpacing.x3,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.blue,
    textDecorationLine: "underline",
  },
  supportLinkInline: {
    fontFamily: "Urbanist-700",
    color: huddleColors.blue,
    textDecorationLine: "underline",
  },
  verifyCard: {
    borderRadius: huddleRadii.sheet,
    backgroundColor: huddleColors.canvas,
    borderWidth: 1,
    borderColor: huddleColors.blueSoft,
    ...huddleShadows.glassElevation1,
  },
  verifyCardLocked: {
    opacity: 0.6,
  },
  verifyCardExpanded: {
    borderRadius: huddleRadii.sheet,
  },
  cardHeader: {
    minHeight: huddleVerifyIdentity.cardHeaderMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x4,
  },
  cardHeaderLocked: {
    minHeight: huddleVerifyIdentity.cardHeaderMinHeight,
  },
  cardTitle: {
    flex: 1,
    ...huddleButtons.label,
    color: huddleColors.text,
  },
  cardTitleLocked: {
    color: huddleColors.subtext,
  },
  expandedBody: {
    paddingHorizontal: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x4,
    gap: huddleSpacing.x4,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: huddleColors.divider,
  },
  statusPill: {
    borderRadius: huddleRadii.pill,
    paddingHorizontal: huddleSpacing.x2,
    paddingVertical: huddleSpacing.x1,
    minHeight: huddleVerifyIdentity.statusMinHeight,
    justifyContent: "center",
  },
  statusSuccess: {
    backgroundColor: huddleColors.successSoft,
  },
  statusError: {
    backgroundColor: huddleColors.validationSoft,
  },
  statusMuted: {
    backgroundColor: huddleColors.glassOverlay,
    ...huddleShadows.glassElevation1,
  },
  statusLabel: {
    fontFamily: "Urbanist-700",
    fontSize: huddleFormFields.labelSize,
    lineHeight: huddleFormFields.labelLine,
  },
  statusLabelSuccess: {
    color: huddleColors.success,
  },
  statusLabelError: {
    color: huddleColors.validationRed,
  },
  statusLabelMuted: {
    color: huddleColors.text,
  },
  panelStack: {
    gap: huddleSpacing.x3,
  },
  phoneFieldBlock: {
    gap: huddleSpacing.x2,
  },
  panelFieldLabelLarge: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  fieldErrorSubtext: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.validationRed,
  },
  fieldInfoSubtext: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.blue,
  },
  inlineOtpButton: {
    minHeight: 34,
    borderRadius: huddleRadii.button,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x3,
    backgroundColor: huddleColors.blue,
  },
  inlineOtpButtonDisabled: {
    backgroundColor: huddleColors.mutedCanvas,
  },
  inlineOtpButtonText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.onPrimary,
  },
  inlineOtpButtonTextDisabled: {
    color: huddleColors.mutedText,
  },
  cooldownBarTrack: {
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: huddleColors.mutedCanvas,
  },
  cooldownBarFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: huddleColors.blue,
  },
  humanCameraPreview: {
    height: 360,
    overflow: "hidden",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    backgroundColor: huddleColors.canvas,
  },
  humanCameraPreviewActive: {
    backgroundColor: huddleColors.verifyCameraFallback,
    ...huddleFieldStates.focused,
  },
  humanCameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  humanTurnCue: {
    position: "absolute",
    top: 35,
    width: HUMAN_GUIDE_WIDTH,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
  },
  humanPendingLoader: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.canvas,
  },
  humanOvalScrim: {
    position: "absolute",
    width: HUMAN_OVAL_WIDTH + HUMAN_OVAL_SCRIM_WIDTH * 2,
    height: HUMAN_OVAL_HEIGHT + HUMAN_OVAL_SCRIM_WIDTH * 2,
    borderRadius: (HUMAN_OVAL_WIDTH + HUMAN_OVAL_SCRIM_WIDTH * 2) / 2,
    borderWidth: HUMAN_OVAL_SCRIM_WIDTH,
    borderColor: huddleColors.verifyCameraScrim,
    backgroundColor: "transparent",
  },
  humanOvalBase: {
    position: "absolute",
    width: HUMAN_OVAL_WIDTH,
    height: HUMAN_OVAL_HEIGHT,
    borderRadius: HUMAN_OVAL_RADIUS,
    borderWidth: 4,
    borderColor: huddleColors.verifyCameraBaseRing,
  },
  humanOvalBaseIdle: {
    backgroundColor: huddleColors.glassControl,
    ...huddleFieldStates.focused,
  },
  humanOvalSegment: {
    position: "absolute",
    width: HUMAN_OVAL_WIDTH,
    height: HUMAN_OVAL_HEIGHT,
    borderRadius: HUMAN_OVAL_RADIUS,
    borderWidth: HUMAN_OVAL_BORDER_WIDTH,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  humanOvalCenterRing: {
    opacity: 0.82,
  },
  humanOvalHalfRing: {
    left: 0,
    top: 0,
  },
  humanOvalRightRing: {
    left: -HUMAN_OVAL_WIDTH / 2,
  },
  humanOvalLeftClip: {
    position: "absolute",
    left: "50%",
    marginLeft: -HUMAN_OVAL_WIDTH / 2,
    width: HUMAN_OVAL_WIDTH / 2,
    height: HUMAN_OVAL_HEIGHT,
    overflow: "hidden",
  },
  humanOvalRightClip: {
    position: "absolute",
    left: "50%",
    width: HUMAN_OVAL_WIDTH / 2,
    height: HUMAN_OVAL_HEIGHT,
    overflow: "hidden",
  },
  humanOvalSegmentActive: {
    borderColor: huddleColors.blue,
    shadowColor: huddleColors.blue,
  },
  humanOvalSegmentNeutral: {
    borderColor: huddleColors.fieldBorderSoft,
    shadowColor: huddleColors.fieldBorderSoft,
  },
  humanOvalSegmentDone: {
    borderColor: huddleColors.success,
    shadowColor: huddleColors.success,
  },
  humanOvalSegmentError: {
    ...huddleFieldStates.error,
  },
  humanOvalEmptyIcon: {
    position: "absolute",
    width: HUMAN_OVAL_WIDTH,
    height: HUMAN_OVAL_HEIGHT,
    borderRadius: HUMAN_OVAL_RADIUS,
    alignItems: "center",
    justifyContent: "center",
  },
  humanInlineTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
    textAlign: "center",
  },
  humanInstructionBlock: {
    alignItems: "center",
    gap: huddleSpacing.x1,
    minHeight: 74,
  },
  humanInlineHelper: {
    maxWidth: 280,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.caption,
    textAlign: "center",
  },
  humanGuidancePill: {
    marginTop: huddleSpacing.x1,
    borderRadius: huddleRadii.pill,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: 6,
    overflow: "hidden",
    backgroundColor: huddleColors.coral,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.onPrimary,
    textAlign: "center",
  },
  humanProgressDots: {
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  humanProgressDotShell: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  humanProgressDotShellActive: {
    borderColor: "rgba(33,69,207,0.30)",
  },
  humanProgressDotShellPassed: {
    borderColor: "rgba(34,197,94,0.24)",
  },
  humanProgressDotCompact: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(66,73,101,0.18)",
  },
  humanProgressDotCompactActive: {
    backgroundColor: huddleColors.blue,
  },
  humanProgressDotCompactDone: {
    backgroundColor: huddleColors.blue,
  },
  humanProgressDotCompactPassed: {
    backgroundColor: huddleColors.success,
  },
  humanProgressRow: {
    flexDirection: "row",
    gap: huddleSpacing.x2,
  },
  humanProgressStep: {
    flex: 1,
    minHeight: 42,
    borderRadius: huddleRadii.button,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: huddleColors.mutedCanvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: huddleColors.fieldBorderSoft,
  },
  humanProgressStepActive: {
    backgroundColor: huddleColors.glassControl,
    borderColor: huddleColors.blue,
  },
  humanProgressStepDone: {
    backgroundColor: huddleColors.glassControl,
    borderColor: huddleColors.blue,
  },
  humanProgressStepPassed: {
    backgroundColor: huddleColors.successSoft,
    borderColor: huddleColors.success,
  },
  humanProgressDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  humanProgressDotActive: {
    borderColor: huddleColors.blue,
    backgroundColor: huddleColors.blue,
  },
  humanProgressDotDone: {
    borderColor: huddleColors.blue,
    backgroundColor: huddleColors.blue,
  },
  humanProgressDotPassed: {
    borderColor: huddleColors.success,
    backgroundColor: huddleColors.success,
  },
  humanProgressLabel: {
    fontFamily: "Urbanist-700",
    fontSize: 10,
    lineHeight: 12,
    color: huddleColors.mutedText,
  },
  humanProgressLabelActive: {
    color: huddleColors.blue,
  },
  humanProgressLabelDone: {
    color: huddleColors.blue,
  },
  humanProgressLabelPassed: {
    color: huddleColors.success,
  },
  humanOvalPassed: {
    borderColor: huddleColors.success,
    backgroundColor: huddleColors.successSoft,
  },
  humanOvalError: {
    ...huddleFieldStates.error,
    backgroundColor: huddleColors.validationSoft,
  },
  otpSentText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.subtext,
  },
  fieldHelper: {
    marginTop: -huddleSpacing.x2,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.caption,
  },
  documentPickerBlock: {
    gap: huddleSpacing.x2,
  },
  documentDateField: {
    minHeight: 52,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
  },
  documentDateFieldFocused: {
    ...huddleFieldStates.focused,
  },
  documentInlineDatePopover: {
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    backgroundColor: huddleColors.canvas,
    overflow: "hidden",
    ...huddleShadows.glassElevation1,
  },
  documentInlineDateColumns: {
    flexDirection: "row",
    gap: huddleSpacing.x2,
    padding: huddleSpacing.x2,
  },
  documentInlineDateColumn: {
    flex: 1,
    maxHeight: 180,
    borderRadius: huddleRadii.button,
    backgroundColor: huddleColors.mutedCanvas,
  },
  documentInlineDateOption: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.button,
  },
  documentInlineDateOptionActive: {
    backgroundColor: huddleColors.blue,
  },
  documentInlineDateOptionText: {
    fontFamily: "Urbanist-500",
    fontSize: 14,
    color: huddleColors.text,
  },
  documentInlineDateOptionTextActive: {
    color: huddleColors.onPrimary,
    fontFamily: "Urbanist-700",
  },
  documentPickerButton: {
    minHeight: 52,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  documentPickerText: {
    flex: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleFormFields.valueSize,
    lineHeight: huddleFormFields.valueLine,
    color: huddleColors.text,
  },
  documentPickerPlaceholder: {
    color: huddleColors.mutedText,
  },
  documentPickerMenu: {
    maxHeight: 220,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    backgroundColor: huddleColors.canvas,
    overflow: "hidden",
    ...huddleShadows.glassElevation1,
  },
  documentPickerScroll: {
    maxHeight: 220,
  },
  documentPickerOption: {
    minHeight: 42,
    paddingHorizontal: huddleSpacing.x3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  documentPickerOptionText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  documentPickerOptionTextActive: {
    color: huddleColors.blue,
    fontFamily: "Urbanist-700",
  },
  segmentedRow: {
    flexDirection: "row",
    gap: huddleSpacing.x2,
    alignItems: "center",
  },
  segmentedOption: {
    flex: 1,
    minHeight: 108,
    borderRadius: huddleRadii.button,
    borderWidth: 1.5,
    borderColor: huddleColors.fieldBorderSoft,
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x1,
    backgroundColor: huddleColors.canvas,
  },
  segmentedOptionPassport: {
  },
  segmentedOptionId: {
  },
  segmentedOptionActive: {
    borderColor: huddleColors.blue,
    backgroundColor: huddleColors.glassControl,
  },
  segmentedText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
    textAlign: "center",
  },
  segmentedTextActive: {
    color: huddleColors.blue,
  },
  documentReadingBox: {
    minHeight: 170,
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x2,
    borderRadius: huddleRadii.glass,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    backgroundColor: huddleColors.canvas,
    padding: huddleSpacing.x4,
  },
  softReadingArc: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: huddleColors.blueSoft,
    borderTopColor: huddleColors.blue,
  },
  softReadingArcGap: {
    width: 10,
    height: 10,
  },
  panelCopy: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
  },
  actionButton: {
    ...huddleButtons.base,
    flex: 1,
    minHeight: huddleVerifyIdentity.actionMinHeight,
    borderRadius: huddleVerifyIdentity.actionRadius,
    paddingHorizontal: huddleSpacing.x4,
  },
  secondaryButton: {
    ...huddleButtons.secondary,
  },
  actionButtonText: {
    ...huddleButtons.label,
    fontSize: huddleVerifyIdentity.actionLabelSize,
    lineHeight: huddleVerifyIdentity.actionLabelLine,
    color: huddleColors.onPrimary,
  },
  secondaryButtonText: {
    color: huddleColors.text,
  },
  errorBox: {
    borderRadius: huddleRadii.glass,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x4,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
    ...huddleFieldStates.error,
  },
  errorText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.validationRed,
  },
  pendingBox: {
    width: "100%",
    minHeight: huddleVerifyIdentity.pendingMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    borderRadius: huddleRadii.glass,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.glassControl,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x4,
    ...huddleShadows.glassElevation1,
  },
  pendingText: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
  },
  verifiedCardSummary: {
    minHeight: huddleVerifyIdentity.verifiedSummaryMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
  },
  verifiedSummaryCopy: {
    flex: 1,
    gap: huddleSpacing.x1,
  },
  verifiedName: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    lineHeight: huddleType.body * huddleType.lineNormal,
    color: huddleColors.text,
  },
  verifiedNumber: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.body,
    lineHeight: huddleType.body * huddleType.lineNormal,
    color: huddleColors.text,
  },
  lockCopy: {
    paddingHorizontal: huddleSpacing.x4,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
  },
  lockIcon: {
    color: huddleColors.text,
  },
  documentCameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    backgroundColor: huddleColors.verifyCameraFallback,
    alignItems: "center",
    justifyContent: "center",
  },
  documentCameraTopBar: {
    position: "absolute",
    left: huddleSpacing.x4,
    right: huddleSpacing.x4,
    zIndex: 3,
    minHeight: huddleLayout.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  documentCameraClose: {
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  documentCameraMode: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    color: huddleColors.onPrimary,
  },
  documentCameraScrim: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  documentCameraDimSvg: {
    ...StyleSheet.absoluteFillObject,
  },
  documentCameraDimLayer: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  documentCameraDimLayerFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  documentCameraGuidance: {
    width: "90%",
    marginBottom: huddleSpacing.x3,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h3,
    lineHeight: huddleType.h3Line,
    color: huddleColors.onPrimary,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    zIndex: 1,
  },
  documentCameraFrame: {
    borderWidth: 2,
    borderColor: huddleColors.onPrimary,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    zIndex: 1,
  },
  documentCameraFramePassport: {
    height: "48%",
    maxWidth: "70%",
    aspectRatio: 0.7,
  },
  documentCameraFrameId: {
    width: "88%",
    aspectRatio: 1.58,
  },
  documentCameraHint: {
    marginTop: huddleSpacing.x4,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    color: huddleColors.onPrimary,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    zIndex: 1,
  },
  documentCameraShutter: {
    position: "absolute",
    bottom: huddleSpacing.x8,
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: huddleColors.onPrimary,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  documentCameraShutterDisabled: {
    opacity: 0.55,
  },
  documentCameraShutterInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: huddleColors.onPrimary,
  },
});
