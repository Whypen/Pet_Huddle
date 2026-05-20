import { Feather, FontAwesome } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { isValidPhoneNumber } from "libphonenumber-js";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";
import profilePlaceholder from "../../huddle Design System/assets/ProfilePlaceholder.png";
import serviceImage from "../../assets/Notifications/Service.jpg";
import { NativeLoadingState } from "../components/NativeLoadingState";
import { NativePhoneField } from "../components/NativePhoneField";
import { NativePublicProfileModal } from "../components/profile/NativePublicProfileModal";
import {
  AppBottomSheet,
  AppBottomSheetFooter,
  AppBottomSheetHeader,
  AppBottomSheetScroll,
  AppActionMenu,
  type AppActionMenuItem,
  AppDestructiveSlideConfirm,
  AppSlideConfirm,
  AppConfirmModal,
  AppModalActionRow,
  AppModalButton,
  AppModalField,
  AppModalIconButton,
  SlideToConfirm,
} from "../components/nativeModalPrimitives";
import { NativeSocialReportModal } from "../components/social/NativeSocialReportModal";
import { NativeSocialMediaCarousel, type NativeSocialCarouselItem } from "../components/social/NativeSocialFeedPrimitives";
import { NativeCarerProfileContent } from "../components/service/NativeCarerProfileContent";
import { NativePolaroidCard, nativePolaroidStyles } from "../components/NativePolaroidCard";
import { NativePetDetailsModal } from "../components/NativePetDetailsModal";
import { formatMedicationSummary, mapPetRow, type MedicationRecord, type NativePetDetailsData } from "../components/NativePetDetailsContent";
import { nativeModalStyles } from "../components/nativeModalPrimitives.styles";
import { getNativeLegalPage } from "../content/nativeLegalPages";
import { createSingleRealtimeChannel } from "../lib/realtimeChannelManager";
import { invalidateNativeBlockCascade } from "../lib/nativeBlockCascade";
import { invalidateNativeChatReadCaches, readCachedNativeChatMessages, writeCachedNativeChatMessages, clearCachedNativeChatMessages, type NativeChatMessage } from "../lib/nativeChat";
import { createNativeServiceChat, fetchNativeServiceProviderDetail, incrementNativeServiceProviderView, type NativeServiceProvider } from "../lib/nativeService";
import { ALL_SKILLS } from "../lib/nativeCarerProfile";
import { nativeExactTokenRpc } from "../lib/nativeExactTokenRequest";
import { haptic } from "../lib/nativeHaptics";
import { fetchNativeLocationSuggestions, type NativeLocationSuggestion } from "../lib/nativeLocation";
import { uploadNativeSocialImage, type NativeSocialComposerMedia } from "../lib/nativeSocial";
import { useShakeAnimation } from "../lib/nativeAnimations";
import { resolveNativeAvatarUrl } from "../lib/nativeStorageUrlCache";
import { supabase } from "../lib/supabase";
import { huddleButtons, huddleColors, huddleFieldStates, huddleFormControls, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";

type ServiceStatus = "pending" | "booked" | "in_progress" | "completed" | "disputed";
type ServiceCareStatus = "awaiting_handoff" | "pin_shared" | "in_progress" | "handoff_issue_review" | "not_started_refunded" | "under_dispute" | "completed";
type ServiceRole = "requester" | "provider";

type ServiceRequestCard = {
  serviceType: string;
  serviceTypes?: string[];
  petId: string;
  petIds?: string[];
  petName?: string;
  petType: string;
  dogSize?: string;
  requestedDates?: string[];
  requestedDate?: string;
  startTime: string;
  endTime: string;
  locationStyles?: string[];
  locationArea: string;
  suggestedCurrency?: string;
  suggestedPrice?: string;
  suggestedRate?: string;
  additionalNotes?: string;
  allowProfileAccess?: boolean;
  petPhotoUrl?: string;
  petSpecies?: string;
  petDob?: string;
  petIsPublic?: boolean;
  pets?: ServiceRequestPet[];
};

type ServiceRequestPet = {
  dogSize?: string;
  petDob?: string;
  petId: string;
  petIsPublic?: boolean;
  petName?: string;
  petPhotoUrl?: string;
  petSpecies?: string;
  petType?: string;
};

type ServiceQuoteCard = {
  serviceType?: string;
  serviceTypes?: string[];
  petId?: string;
  petIds?: string[];
  petName?: string;
  petType?: string;
  dogSize?: string;
  pets?: ServiceRequestPet[];
  requestedDates?: string[];
  startTime?: string;
  endTime?: string;
  locationStyles?: string[];
  locationArea?: string;
  currency: string;
  finalPrice: string;
  rate: string;
  note?: string;
};

type ServiceChatRow = {
  id: string;
  chat_id: string;
  requester_id: string;
  provider_id: string;
  status: ServiceStatus;
  care_status?: ServiceCareStatus | null;
  booking_snapshot?: CareBookingSnapshot | null;
  request_card: ServiceRequestCard | null;
  quote_card: ServiceQuoteCard | null;
  request_sent_at: string | null;
  quote_sent_at: string | null;
  booked_at: string | null;
  in_progress_at?: string | null;
  pin_shared_at?: string | null;
  checkin_submitted_at?: string | null;
  checkin_photo_url?: string | null;
  completed_at: string | null;
  disputed_at?: string | null;
  payout_released_at?: string | null;
  requester_mark_finished: boolean;
  provider_mark_finished: boolean;
  dispute_status?: string | null;
  dispute_final_provider_receives_amount?: number | null;
  dispute_final_customer_refund_amount?: number | null;
  dispute_resolved_at?: string | null;
};

type CachedServiceChatRow = {
  cachedAt: number;
  row: ServiceChatRow;
  roomId: string;
  sessionKey: string;
  userId: string;
  version: 1;
};

type CareBookingSnapshot = {
  serviceType: string;
  petId: string;
  startAt: string;
  endAt: string;
  handoffMethod: string;
  emergencyContact: string;
  careInstructions: string;
  medicationAllergyNotes: string;
  behaviorEscapeRisk: string;
  emergencyVetContact?: string;
  emergencyVetPermission: boolean;
  price: {
    currency: string;
    providerQuote: number;
    requesterTotal: number;
  };
  cancellationTerms?: string;
  disputeIssueWindow?: string;
  requesterId: string;
  providerId: string;
  createdAt: string;
};

type ServicePaymentResult = {
  ok: boolean;
  checkoutSessionId?: string;
  error?: string;
};

type ServicePaymentTrace = (step: string, details?: Record<string, unknown>) => void;

type ChatMessageRow = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  localStatus?: "pending" | "failed";
};

type ServiceChatAttachment = {
  mime?: string | null;
  url: string | null;
};

const serviceRowToNativeChatMessage = (row: ChatMessageRow, roomId: string): NativeChatMessage => ({
  id: row.id,
  chatId: roomId,
  senderId: row.sender_id,
  content: row.content,
  createdAt: row.created_at,
  updatedAt: row.created_at,
});

const nativeChatMessageToServiceRow = (message: NativeChatMessage): ChatMessageRow => ({
  id: message.id,
  sender_id: message.senderId,
  content: message.content,
  created_at: message.createdAt,
});

const mergeServiceMessageRows = (current: ChatMessageRow[], incoming: ChatMessageRow[]) => {
  const byId = new Map<string, ChatMessageRow>();
  [...current, ...incoming].forEach((message) => {
    if (!message.id) return;
    byId.set(message.id, message);
  });
  return Array.from(byId.values()).sort((a, b) => Date.parse(a.created_at || "") - Date.parse(b.created_at || ""));
};

type ServiceChatUpload = NativeSocialComposerMedia & {
  progress: number;
  status: "queued" | "uploading" | "uploaded" | "error";
  uploadedUrl?: string | null;
};

type Counterpart = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  stripePayoutStatus: string | null;
  stripeAccountId: string | null;
  skills: string[];
  providerServices: string[];
  providerLocationStyles: string[];
  providerAreaName: string;
  providerCurrency: string;
  providerCountry: string | null;
};

type PetOption = Partial<NativePetDetailsData> & {
  id: string;
  name: string;
  species: string | null;
  weight: number | null;
  weight_unit: string | null;
  photo_url?: string | null;
  dob?: string | null;
  is_public?: boolean | null;
};

type ActiveSheet = "request" | "quote" | "payment" | "review" | "startCare" | "completion" | "issue" | null;

const STATUS_LABEL: Record<ServiceStatus, string> = {
  pending: "Pending",
  booked: "Booked",
  in_progress: "Care in progress",
  completed: "Completed",
  disputed: "Under Dispute",
};

const DOG_SIZES = ["Small", "Medium", "Large", "Giant"] as const;
const CURRENCIES = ["USD", "HKD", "GBP", "EUR", "AUD", "SGD", "CAD", "JPY"] as const;
const RATE_OPTIONS = ["Per hour", "Per day", "Per session", "Per night", "Per visit"] as const;
const normalizeRateLabel = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower === "hour") return "Per hour";
  if (lower === "day") return "Per day";
  if (lower === "session") return "Per session";
  if (lower === "night") return "Per night";
  if (lower === "visit") return "Per visit";
  return raw;
};
const SERVICE_UNDER_REVIEW_NOTICE = "This session is under review. Please keep all communication here while our team investigates.";
const SERVICE_HANDOFF_REVIEW_NOTICE = "Handoff issue under review.\nCare has not officially started. huddle may review handoff records, messages, and booking activity before deciding next steps.";
const SERVICE_SAFETY_REVIEW_COPY = "Safety reports are reviewed by huddle’s Trust & Safety team. Submitting a report may temporarily place the booking, payment, and related conversation activity under review while we investigate.";
const OWNER_SERVICE_ISSUE_REASONS = [
  "Carer didn't arrive",
  "Late or early handoff",
  "Pet safety concern",
  "Pet injury or illness",
  "Care didn't match Care Scope",
  "No/poor updates",
  "Location or access issue",
  "Property damage or loss",
  "Unprofessional conduct",
  "Other",
];
const CARER_SERVICE_ISSUE_REASONS = [
  "Owner didn't show up",
  "Pet was aggressive or unmanageable",
  "Late pick up",
  "Undisclosed health or behavior needs",
  "Pet/access not handed off",
  "Pre-existing pet illness or injury",
  "Location or access issue",
  "Payment or communication issue",
  "Unsafe environment",
  "Other",
];

const clean = (value: unknown) => String(value || "").trim();
const numberOrNull = (value: unknown) => {
  if (value == null || value === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};
const isResolvedServiceDisputeStatus = (status: unknown) => clean(status).toLowerCase().startsWith("resolved");
const serviceDisputeNoProviderPayout = (chat: Pick<ServiceChatRow, "dispute_status" | "dispute_final_provider_receives_amount" | "dispute_final_customer_refund_amount">) => {
  const disputeStatus = clean(chat.dispute_status).toLowerCase();
  if (!isResolvedServiceDisputeStatus(disputeStatus)) return false;
  const providerReceives = numberOrNull(chat.dispute_final_provider_receives_amount);
  const customerRefund = numberOrNull(chat.dispute_final_customer_refund_amount);
  return disputeStatus === "resolved_refund_full" || (providerReceives !== null && providerReceives <= 0 && (customerRefund ?? 0) > 0);
};
const serviceDisputeResolvesWithProviderPayout = (chat: Pick<ServiceChatRow, "dispute_status" | "dispute_final_provider_receives_amount">) => {
  const disputeStatus = clean(chat.dispute_status).toLowerCase();
  if (!isResolvedServiceDisputeStatus(disputeStatus)) return false;
  if (disputeStatus === "resolved_release_full" || disputeStatus === "resolved_partial_refund") return true;
  return (numberOrNull(chat.dispute_final_provider_receives_amount) ?? 0) > 0;
};
const attachServiceDisputeResolution = (row: ServiceChatRow, disputeRow: unknown): ServiceChatRow => {
  const dispute = disputeRow && typeof disputeRow === "object" ? disputeRow as Record<string, unknown> : null;
  if (!dispute) return row;
  const disputeStatus = clean(dispute.status) || null;
  return {
    ...row,
    dispute_status: disputeStatus,
    dispute_final_provider_receives_amount: numberOrNull(dispute.final_provider_receives_amount),
    dispute_final_customer_refund_amount: numberOrNull(dispute.final_customer_refund_amount),
    dispute_resolved_at: isResolvedServiceDisputeStatus(disputeStatus)
      ? clean(dispute.executed_at) || clean(dispute.decision_at) || clean(dispute.updated_at) || row.completed_at
      : null,
  };
};
const resolveNativeCountryCodeFromLabel = (countryName?: string | null) => {
  const target = clean(countryName).toLowerCase();
  if (!target) return "";
  if (target === "hong kong" || target === "hong kong sar" || target === "hong kong sar china" || target === "hk") return "HK";
  if (target === "united states" || target === "united states of america" || target === "us" || target === "usa") return "US";
  if (/^[a-z]{2}$/i.test(target)) return target.toUpperCase();
  const displayNamesFactory = typeof Intl !== "undefined" && "DisplayNames" in Intl ? Intl.DisplayNames : null;
  if (!displayNamesFactory) return "";
  const countryDisplayNames = new displayNamesFactory(["en"], { type: "region" });
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = `${String.fromCharCode(first)}${String.fromCharCode(second)}`;
      const label = countryDisplayNames.of(code);
      if (label && label.toLowerCase() === target) return code;
    }
  }
  return "";
};
const SERVICE_CHAT_START_ERROR_COPY = "Unable to start a conversation right now. Please try again later";
const PAYMENT_BLOCKERS = {
  invalidQuote: "Quote price is missing or invalid.",
  invalidEmergencyContact: "Add a valid emergency contact before payment.",
  missingCareInstructions: "Add care instructions before payment.",
  missingTerms: "Accept the booking terms before payment.",
  incompleteBooking: "Booking details are incomplete.",
  missingPaymentDetails: "Payment details are incomplete. Please reopen the booking and try again.",
  missingCheckoutUrl: "Stripe Checkout did not return a checkout URL.",
  unableToOpenCheckout: "Unable to open Stripe Checkout.",
} as const;
const SERVICE_PAYMENT_TIMEOUT_MS = 20000;
const paymentDraftKey = (requesterId: string, providerId: string, petIds: string[], serviceType: string) =>
  `huddle_native_confirm_booking_draft_v1:${requesterId || "unknown"}:${providerId || "unknown"}:${petIds.join(",") || "no-pet"}:${serviceType || "care"}`;
const pendingServicePaymentKey = (userId: string, roomId: string) =>
  `huddle_native_service_payment_pending_v1:${userId}:${roomId}`;
const serviceChatRowCacheKey = (userId: string, sessionKey: string, roomId: string) =>
  `huddle_native_service_chat_row_v1:${userId}:${sessionKey}:${roomId}`;
const serviceStartPinCacheKey = (userId: string, roomId: string) =>
  `huddle_native_service_start_pin_v1:${userId}:${roomId}`;
const serviceMidCareReminderNotificationKey = (userId: string, roomId: string) =>
  `huddle_native_service_midcare_photo_reminder_notified_v1:${userId}:${roomId}`;
const serviceHistoryHiddenKey = (userId: string, serviceChatId: string) =>
  `huddle_native_service_history_hidden_v1:${userId}:${serviceChatId}`;
const SERVICE_HISTORY_AUTO_HIDE_MS = 14 * 24 * 60 * 60 * 1000;
const SERVICE_PIN_SENT_MESSAGE = "Your PIN is sent! The carer will now complete the check-in for your Care Session.";
const PASSCODE_LOCK_ICON_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 11V8.2C22 7.0799 22 6.51984 21.782 6.09202C21.5903 5.71569 21.2843 5.40973 20.908 5.21799C20.4802 5 19.9201 5 18.8 5H5.2C4.0799 5 3.51984 5 3.09202 5.21799C2.71569 5.40973 2.40973 5.71569 2.21799 6.09202C2 6.51984 2 7.0799 2 8.2V11.8C2 12.9201 2 13.4802 2.21799 13.908C2.40973 14.2843 2.71569 14.5903 3.09202 14.782C3.51984 15 4.0799 15 5.2 15H11M12 10H12.005M17 10H17.005M7 10H7.005M19.25 17V15.25C19.25 14.2835 18.4665 13.5 17.5 13.5C16.5335 13.5 15.75 14.2835 15.75 15.25V17M12.25 10C12.25 10.1381 12.1381 10.25 12 10.25C11.8619 10.25 11.75 10.1381 11.75 10C11.75 9.86193 11.8619 9.75 12 9.75C12.1381 9.75 12.25 9.86193 12.25 10ZM17.25 10C17.25 10.1381 17.1381 10.25 17 10.25C16.8619 10.25 16.75 10.1381 16.75 10C16.75 9.86193 16.8619 9.75 17 9.75C17.1381 9.75 17.25 9.86193 17.25 10ZM7.25 10C7.25 10.1381 7.13807 10.25 7 10.25C6.86193 10.25 6.75 10.1381 6.75 10C6.75 9.86193 6.86193 9.75 7 9.75C7.13807 9.75 7.25 9.86193 7.25 10ZM15.6 21H19.4C19.9601 21 20.2401 21 20.454 20.891C20.6422 20.7951 20.7951 20.6422 20.891 20.454C21 20.2401 21 19.9601 21 19.4V18.6C21 18.0399 21 17.7599 20.891 17.546C20.7951 17.3578 20.6422 17.2049 20.454 17.109C20.2401 17 19.9601 17 19.4 17H15.6C15.0399 17 14.7599 17 14.546 17.109C14.3578 17.2049 14.2049 17.3578 14.109 17.546C14 17.7599 14 18.0399 14 18.6V19.4C14 19.9601 14 20.2401 14.109 20.454C14.2049 20.6422 14.3578 20.7951 14.546 20.891C14.7599 21 15.0399 21 15.6 21Z" stroke="${huddleColors.blue}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const createPaymentTraceId = () => `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const bodyKeys = (value: unknown) => value && typeof value === "object" ? Object.keys(value as Record<string, unknown>) : [];
const functionErrorStatus = (error: unknown) => {
  const context = error && typeof error === "object" && "context" in error ? (error as { context?: unknown }).context : null;
  if (context && typeof context === "object" && "status" in context) return (context as { status?: unknown }).status;
  if (error && typeof error === "object" && "status" in error) return (error as { status?: unknown }).status;
  return null;
};
const safePaymentErrorMessage = (error: unknown, fallback: string) => {
  const message = clean((error as { message?: unknown })?.message);
  if (!message) return fallback;
  if (message === "create_service_payment_timeout") return "Stripe Checkout took too long to start. Please check your connection and try again.";
  if (/jwt|token|authorization|auth/i.test(message)) return "Payment authorization failed. Please sign in again and try payment.";
  if (/network|fetch|timeout|failed to fetch/i.test(message)) return "Stripe Checkout could not be reached. Please check your connection and try again.";
  if (/^[a-z0-9_]+$/i.test(message)) return message.replaceAll("_", " ");
  return message.slice(0, 160);
};
const withTimeout = async <T,>(promise: PromiseLike<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};
const safeCareErrorMessage = (error: unknown, fallback: string) => {
  const message = clean((error as { message?: unknown })?.message);
  const code = clean((error as { code?: unknown })?.code);
  const raw = (message || code).toLowerCase();
  if (!raw) return fallback;
  if (raw.includes("safety_review_text_required")) return "Please add a few details before reporting a safety issue.";
  if (raw.includes("service_dispute_already_reported_by_user")) return "You have already reported this booking.";
  if (raw.includes("invalid_rating")) return "Please choose a rating before submitting your review.";
  if (raw.includes("service_not_completed")) return "Reviews open after the booking is completed.";
  if (raw.includes("duplicate") || raw.includes("already")) return "You have already reviewed this booking.";
  if (/^[a-z0-9_]+$/.test(raw) || raw.includes("_required") || raw.includes("_not_")) return fallback;
  return message || fallback;
};
const selectableSkillSet = new Set<string>(ALL_SKILLS as readonly string[]);
const normalizeServiceSkillLabels = (skills: unknown) => {
  const values = Array.isArray(skills) ? skills.map(clean).filter(Boolean) : [];
  const hasLegacySeedSkill = values.some((item) => item === "Daily Walks" || item === "Behavioral support");
  return Array.from(new Set(values.map((item) => {
    if (item === "Daily Walks") return "Professional pet-carer";
    if (item === "Behavioral support") return "Behaviorist / Trainer";
    if (hasLegacySeedSkill && item === "Emergency / Life support") return "Medical support";
    return selectableSkillSet.has(item) ? item : "";
  }).filter(Boolean)));
};
const parseParams = (search?: string) => {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  return {
    room: clean(params.get("room") || params.get("roomId")),
    name: clean(params.get("name")),
    avatar: clean(params.get("avatar")),
    peerId: clean(params.get("with") || params.get("peerId")),
    providerId: clean(params.get("provider") || params.get("providerId")),
    paid: clean(params.get("paid") || params.get("payment")),
    checkoutSessionId: clean(params.get("checkout_session_id") || params.get("session_id") || params.get("checkoutSessionId")),
    request: clean(params.get("request")),
    returnTo: clean(params.get("returnTo")),
    skills: clean(params.get("skills")).split("|").map(clean).filter(Boolean),
  };
};

const parseServiceMessage = (content: string) => {
  try {
    const parsed = JSON.parse(content) as { attachments?: unknown; text?: unknown; kind?: unknown; pin?: unknown; startPin?: unknown };
    const attachments = Array.isArray(parsed.attachments)
      ? parsed.attachments.map((item) => {
        const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return {
          mime: clean(value.mime || value.mimeType) || "image/jpeg",
          url: clean(value.url),
        };
      }).filter((item) => item.url)
      : [];
    return { attachments, text: clean(parsed.text), kind: clean(parsed.kind), pin: sanitizeStartPin(parsed.pin || parsed.startPin) };
  } catch {
    return { attachments: [] as ServiceChatAttachment[], text: content, kind: "", pin: "" };
  }
};

const readCachedServiceChatRow = async (userId: string, sessionKey: string | null, roomId: string) => {
  const cacheSessionKey = sessionKey || `${userId}:0`;
  try {
    const raw = await AsyncStorage.getItem(serviceChatRowCacheKey(userId, cacheSessionKey, roomId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedServiceChatRow>;
    if (
      parsed.version !== 1 ||
      parsed.userId !== userId ||
      parsed.sessionKey !== cacheSessionKey ||
      parsed.roomId !== roomId ||
      !parsed.row ||
      parsed.row.chat_id !== roomId
    ) {
      return null;
    }
    return parsed.row as ServiceChatRow;
  } catch {
    return null;
  }
};

const sanitizeStartPin = (value: unknown) => {
  const digits = clean(value).replace(/\D/g, "");
  return digits.length === 4 ? digits : "";
};

const readCachedStartPin = async (userId: string, roomId: string) => {
  const pin = await AsyncStorage.getItem(serviceStartPinCacheKey(userId, roomId)).catch(() => null);
  return sanitizeStartPin(pin);
};

const writeCachedStartPin = async (userId: string, roomId: string, pin: string) => {
  const safePin = sanitizeStartPin(pin);
  if (!safePin) return;
  await AsyncStorage.setItem(serviceStartPinCacheKey(userId, roomId), safePin).catch(() => undefined);
};

const writeCachedServiceChatRow = async (userId: string, sessionKey: string | null, row: ServiceChatRow) => {
  const cacheSessionKey = sessionKey || `${userId}:0`;
  const payload: CachedServiceChatRow = {
    cachedAt: Date.now(),
    row,
    roomId: row.chat_id,
    sessionKey: cacheSessionKey,
    userId,
    version: 1,
  };
  await AsyncStorage.setItem(serviceChatRowCacheKey(userId, cacheSessionKey, row.chat_id), JSON.stringify(payload)).catch(() => undefined);
};

const clearCachedServiceChatRow = async (userId: string, sessionKey: string | null, roomId: string) => {
  const cacheSessionKey = sessionKey || `${userId}:0`;
  await AsyncStorage.removeItem(serviceChatRowCacheKey(userId, cacheSessionKey, roomId)).catch(() => undefined);
};

const formatMessageTime = (iso: string) => {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(dt);
};

const formatDividerLabel = (iso: string) => {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  const now = new Date();
  const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMessage = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const days = Math.floor((startNow.getTime() - startMessage.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(dt);
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
};

const formatDateRange = (rawDates: unknown, fallbackDate: unknown) => {
  const dates = Array.isArray(rawDates) ? rawDates.map(clean).filter(Boolean) : [];
  const sorted = dates.length > 0 ? [...dates].sort() : [clean(fallbackDate)].filter(Boolean);
  if (sorted.length === 0) return "—";
  const format = (iso: string) => {
    const [year, month, day] = iso.split("-");
    if (!year || !month || !day) return iso;
    return `${day}-${month}-${year}`;
  };
  return `From ${format(sorted[0])} to ${format(sorted[sorted.length - 1])}`;
};

const formatDateRangeBare = (rawDates: unknown, fallbackDate: unknown) => {
  const dates = Array.isArray(rawDates) ? rawDates.map(clean).filter(Boolean) : [];
  const sorted = dates.length > 0 ? [...dates].sort() : [clean(fallbackDate)].filter(Boolean);
  if (sorted.length === 0) return "—";
  const format = (iso: string) => {
    const [year, month, day] = iso.split("-");
    if (!year || !month || !day) return iso;
    return `${day}-${month}-${year}`;
  };
  return `${format(sorted[0])} to ${format(sorted[sorted.length - 1])}`;
};

// "19 - 20 May" / "30 May - 2 Jun" / "31 Dec 2026 - 2 Jan 2027"
const formatShortDateRange = (rawDates: unknown, fallbackDate: unknown) => {
  const dates = Array.isArray(rawDates) ? rawDates.map(clean).filter(Boolean) : [];
  const sorted = dates.length > 0 ? [...dates].sort() : [clean(fallbackDate)].filter(Boolean);
  if (sorted.length === 0) return "";
  const parse = (iso: string) => {
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) return null;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (Number.isNaN(date.getTime())) return null;
    return date;
  };
  const start = parse(sorted[0]);
  const end = parse(sorted[sorted.length - 1]);
  if (!start) return "";
  const monthShort = (date: Date) => date.toLocaleString("en-US", { month: "short" });
  const currentYear = new Date().getFullYear();
  if (!end || start.getTime() === end.getTime()) {
    const sameYear = start.getFullYear() === currentYear;
    return sameYear ? `${start.getDate()} ${monthShort(start)}` : `${start.getDate()} ${monthShort(start)} ${start.getFullYear()}`;
  }
  const sameYearAsCurrent = start.getFullYear() === currentYear && end.getFullYear() === currentYear;
  if (start.getFullYear() !== end.getFullYear()) {
    return `${start.getDate()} ${monthShort(start)} ${start.getFullYear()} - ${end.getDate()} ${monthShort(end)} ${end.getFullYear()}`;
  }
  if (start.getMonth() === end.getMonth()) {
    return sameYearAsCurrent
      ? `${start.getDate()} - ${end.getDate()} ${monthShort(end)}`
      : `${start.getDate()} - ${end.getDate()} ${monthShort(end)} ${end.getFullYear()}`;
  }
  return sameYearAsCurrent
    ? `${start.getDate()} ${monthShort(start)} - ${end.getDate()} ${monthShort(end)}`
    : `${start.getDate()} ${monthShort(start)} - ${end.getDate()} ${monthShort(end)} ${end.getFullYear()}`;
};

const formatTimelineStepDate = (iso: string | null | undefined) => {
  const raw = clean(iso);
  if (!raw) return "";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(dt);
};

const formatMoney = (currency: string | null | undefined, amount: number | string | null | undefined) => {
  const numeric = typeof amount === "number" ? amount : Number(clean(amount));
  const curr = clean(currency) || "HKD";
  if (!Number.isFinite(numeric)) return `${curr} —`;
  const rounded = Math.round(numeric * 100) / 100;
  return `${curr} ${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)}`;
};

const formatRateUnit = (value: string | null | undefined) => {
  const raw = clean(value);
  if (!raw) return "";
  const normalized = raw.toLowerCase();
  return normalized.startsWith("per ") ? normalized : `per ${normalized}`;
};

const normalizePetType = (species: string | null): string => {
  const source = clean(species);
  if (!source) return "";
  const singular = source.toLowerCase().endsWith("s") ? source.slice(0, -1) : source;
  return singular.replace(/\b\w/g, (char) => char.toUpperCase());
};

const normalizeRequesterLocationStyle = (value: string) => {
  const item = clean(value).toLowerCase();
  if (!item) return "";
  if (item === "flexible") return "Flexible";
  if (item === "at owner's place" || item === "owner's place") return "Owner's Place";
  if (item === "at my place" || item === "carer's place") return "Carer's Place";
  if (item === "meet-up / outdoor" || item === "outdoor") return "Outdoor";
  return "";
};

const getRequesterLocationOptions = (providerLocationStyles: string[]) => {
  const mapped = providerLocationStyles.map(normalizeRequesterLocationStyle).filter(Boolean);
  if (mapped.includes("Flexible")) return ["Owner's Place", "Carer's Place", "Outdoor"];
  return Array.from(new Set(mapped.filter((item) => item !== "Flexible")));
};

const providerEditableLocationStyles = new Set(["Carer's Place", "Flexible", "Outdoor"]);
const providerCanEditCareScopeLocation = (requestCard: ServiceRequestCard | null | undefined) =>
  Boolean(Array.isArray(requestCard?.locationStyles) && requestCard.locationStyles.some((item) => providerEditableLocationStyles.has(clean(item))));

const requestCardWithCareScopeUpdates = (requestCard: ServiceRequestCard | null | undefined, quoteCard: ServiceQuoteCard | null | undefined): ServiceRequestCard | null => {
  if (!requestCard) return null;
  if (!quoteCard) return requestCard;
  return {
    ...requestCard,
    serviceType: clean(quoteCard.serviceType) || requestCard.serviceType,
    serviceTypes: quoteCard.serviceTypes?.length ? quoteCard.serviceTypes : requestCard.serviceTypes,
    petId: clean(quoteCard.petId) || requestCard.petId,
    petIds: quoteCard.petIds?.length ? quoteCard.petIds : requestCard.petIds,
    petName: clean(quoteCard.petName) || requestCard.petName,
    petType: clean(quoteCard.petType) || requestCard.petType,
    dogSize: clean(quoteCard.dogSize) || requestCard.dogSize,
    pets: quoteCard.pets?.length ? quoteCard.pets : requestCard.pets,
    requestedDates: quoteCard.requestedDates?.length ? quoteCard.requestedDates : requestCard.requestedDates,
    startTime: clean(quoteCard.startTime) || requestCard.startTime,
    endTime: clean(quoteCard.endTime) || requestCard.endTime,
    locationStyles: quoteCard.locationStyles?.length ? quoteCard.locationStyles : requestCard.locationStyles,
    locationArea: clean(quoteCard.locationArea) || requestCard.locationArea,
    suggestedCurrency: clean(quoteCard.currency) || requestCard.suggestedCurrency,
    suggestedPrice: clean(quoteCard.finalPrice) || requestCard.suggestedPrice,
    suggestedRate: clean(quoteCard.rate) || requestCard.suggestedRate,
  };
};

const parseProviderRateServices = (rawRates: unknown, fallbackServices: unknown) => {
  const services: string[] = [];
  if (Array.isArray(rawRates)) {
    rawRates.forEach((entry) => {
      try {
        const parsed = typeof entry === "string" ? JSON.parse(entry) as unknown : entry;
        if (parsed && typeof parsed === "object" && Array.isArray((parsed as { services?: unknown }).services)) {
          (parsed as { services: unknown[] }).services.forEach((service) => {
            const label = clean(service);
            if (label) services.push(label);
          });
        }
      } catch {
        // Legacy rates can be plain text; fallback services cover those rows.
      }
    });
  }
  if (Array.isArray(fallbackServices)) {
    fallbackServices.forEach((service) => {
      const label = clean(service);
      if (label) services.push(label);
    });
  }
  return Array.from(new Set(services));
};

const formatPetCaption = (pet: { species?: string | null; dob?: string | null }) => {
  const species = clean(pet.species) || "Pet";
  const dob = clean(pet.dob);
  if (!dob) return species;
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return species;
  const today = new Date();
  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  if (today.getDate() < birthDate.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const age = years > 0 ? `${years}` : months > 0 ? `${months} mo` : "";
  return [species, age].filter(Boolean).join(" · ");
};

const inferDogSize = (weight: number | null, unit: string | null): string => {
  if (weight == null || Number.isNaN(weight)) return "";
  const normalizedUnit = clean(unit).toLowerCase();
  const kg = normalizedUnit === "lb" || normalizedUnit === "lbs" ? weight * 0.45359237 : weight;
  if (kg <= 10) return "Small";
  if (kg <= 25) return "Medium";
  if (kg <= 40) return "Large";
  return "Giant";
};

const hasServicePeriodPassed = (request: ServiceRequestCard | null | undefined) => {
  if (!request) return true;
  const requestedDates = Array.isArray(request.requestedDates) ? request.requestedDates : [];
  const firstDate = requestedDates.length > 0 ? [...requestedDates].sort()[requestedDates.length - 1] : clean(request.requestedDate);
  const endTime = clean(request.endTime);
  if (!firstDate || !endTime) return true;
  const endAt = new Date(`${firstDate}T${endTime}:00`).getTime();
  if (!Number.isFinite(endAt)) return true;
  return Date.now() >= endAt;
};

const isCareOfficiallyStarted = (chat: ServiceChatRow | null | undefined) =>
  Boolean(chat?.checkin_submitted_at && (chat.care_status === "in_progress" || chat.care_status === "completed" || chat.status === "in_progress" || chat.status === "completed"));

const getServicePeriodBounds = (request: ServiceRequestCard | null | undefined) => {
  if (!request) return null;
  const requestedDates = Array.isArray(request.requestedDates) ? request.requestedDates.map(clean).filter(Boolean).sort() : [];
  const firstDate = requestedDates[0] || clean(request.requestedDate);
  const lastDate = requestedDates[requestedDates.length - 1] || clean(request.requestedDate);
  const startTime = clean(request.startTime);
  const endTime = clean(request.endTime);
  if (!firstDate || !lastDate || !startTime || !endTime) return null;
  const startAt = new Date(`${firstDate}T${startTime}:00`).getTime();
  const endAt = new Date(`${lastDate}T${endTime}:00`).getTime();
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) return null;
  return { startAt, endAt };
};

const getServiceMidpointAt = (chat: ServiceChatRow | null | undefined) => {
  const bounds = getServicePeriodBounds(chat?.request_card);
  if (!bounds) return null;
  return bounds.startAt + (bounds.endAt - bounds.startAt) / 2;
};
const shouldShowMidCarePrompt = (chat: ServiceChatRow | null | undefined, hasImageAfterMidpoint: boolean) => {
  if (!chat || hasImageAfterMidpoint || chat.care_status !== "in_progress") return false;
  const bounds = getServicePeriodBounds(chat.request_card);
  if (!bounds) return false;
  const durationMs = bounds.endAt - bounds.startAt;
  if (durationMs <= 4 * 60 * 60 * 1000) return false;
  return Date.now() >= bounds.startAt + durationMs / 2 && Date.now() <= bounds.endAt;
};

function ServiceSystemPill({ actorName, createdAt, isRequester, kind }: { actorName: string; createdAt?: string | null; isRequester: boolean; kind: string }) {
  const startedTime = createdAt ? new Date(createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  const labels: Record<string, string> = {
    service_request_sent: isRequester ? "Your booking request has been sent." : "You have received a booking request.",
    service_request_updated: `Care Scope has been updated by ${actorName}.`,
    service_request_withdrawn: "Request withdrawn",
    service_quote_sent: `Care Scope has been updated by ${actorName}.`,
    service_booked: "All set! Your care session is locked in.",
    service_pin_shared: isRequester ? "You Start PIN is sent." : "You've received the Start PIN.",
    service_check_in: `Care session started${startedTime ? ` at ${startedTime}` : ""}.`,
    service_in_progress: `Care session started${startedTime ? ` at ${startedTime}` : ""}.`,
    service_completed: "The care session is now complete.",
    service_dispute_resolved: "Review completed. This booking is now closed.",
    service_disputed: "Issue flagged. Our team is looking into this.",
    service_issue_reported: "Issue flagged. Our team is looking into this.",
  };
  const tone: Record<string, "neutral" | "muted" | "info" | "success" | "warning"> = {
    service_request_sent: "neutral",
    service_request_updated: "neutral",
    service_request_withdrawn: "muted",
    service_quote_sent: "info",
    service_booked: "success",
    service_pin_shared: "info",
    service_check_in: "success",
    service_in_progress: "success",
    service_completed: "success",
    service_dispute_resolved: "success",
    service_disputed: "warning",
    service_issue_reported: "warning",
  };
  const toneStyle = tone[kind] || "neutral";
  return (
    <Text
      style={[
        styles.systemPill,
        toneStyle === "muted" ? styles.systemPillMuted : null,
        toneStyle === "info" ? styles.systemPillInfo : null,
        toneStyle === "success" ? styles.systemPillSuccess : null,
        toneStyle === "warning" ? styles.systemPillWarning : null,
      ]}
    >
      {labels[kind] || "Care update"}
    </Text>
  );
}

function ServiceChatAttachmentCarousel({ attachments }: { attachments: ServiceChatAttachment[] }) {
  const mediaItems: NativeSocialCarouselItem[] = attachments
    .filter((attachment) => Boolean(attachment.url) && String(attachment.mime || "image/jpeg").startsWith("image/"))
    .map((attachment) => ({
      kind: "image",
      uri: String(attachment.url),
    }));
  if (mediaItems.length === 0) return null;
  return <NativeSocialMediaCarousel contentWidth={260} fixedFrameHeight={210} items={mediaItems} maxFrameHeight={210} minFrameWidth={160} thumbnailFit="cover" />;
}

function MultiSelectChips({ options, selected, onChange }: { options: readonly string[]; selected: string[]; onChange: (next: string[]) => void }) {
  return (
    <View style={styles.chipWrap}>
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <Pressable
            accessibilityRole="button"
            key={option}
            onPress={() => onChange(active ? selected.filter((item) => item !== option) : [...selected, option])}
            style={({ pressed }) => [styles.chip, active ? styles.chipActive : null, pressed ? nativeModalStyles.pressed : null]}
          >
            <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ReviewSelectChips({ options, selected, onChange }: { options: readonly string[]; selected: string[]; onChange: (next: string[]) => void }) {
  const rows = options.length === 7
    ? [options.slice(0, 3), options.slice(3, 5), options.slice(5, 7)]
    : [options.slice(0, 2), options.slice(2, 4), options.slice(4, 7)];
  return (
    <View style={styles.reviewChipStack}>
      {rows.map((row, rowIndex) => (
        <View key={`review-chip-row-${rowIndex}`} style={styles.reviewChipRow}>
          {row.map((option) => {
            const active = selected.includes(option);
            return (
              <Pressable
                accessibilityRole="button"
                key={option}
                onPress={() => onChange(active ? selected.filter((item) => item !== option) : [...selected, option])}
                style={({ pressed }) => [styles.reviewChip, active ? styles.chipActive : null, pressed ? nativeModalStyles.pressed : null]}
              >
                <Text numberOfLines={1} style={[styles.reviewChipText, active ? styles.chipTextActive : null]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const OWNER_REVIEW_TAGS = [
  "My pets love them",
  "Frequent updates",
  "Safe and secure",
  "Extra patient",
  "Very professional",
  "Highly responsive",
  "Punctual and reliable",
] as const;

const PROVIDER_REVIEW_TAGS = [
  "Amazing pets",
  "Accurate profile",
  "Highly responsive",
  "Easy handoff",
  "Respectful",
  "Safe to handle",
  "Flexible and understanding",
] as const;

const OWNER_NEGATIVE_REVIEW_TAGS = [
  "Poor communication",
  "Late for booking",
  "Missed care routine",
  "Unsafe environment",
  "Unprofessional setup",
  "Rushed the booking",
  "Poor pet handling",
] as const;

const PROVIDER_NEGATIVE_REVIEW_TAGS = [
  "Hard to reach",
  "Inaccurate profile",
  "Late for handoff",
  "Behavioral issues",
  "Unclear instructions",
  "Lacked clean gear",
  "Disrespectful communication",
] as const;

type ReviewSubmitResult = "positive" | "negative" | "reported";

const MAX_REVIEW_MEDIA = 6;
const MIN_REVIEW_MEDIA_ASPECT = 9 / 16;
const MAX_REVIEW_MEDIA_ASPECT = 1.91;

type ReviewUploadMedia = NativeSocialComposerMedia & {
  error?: string | null;
  status: "queued" | "uploading" | "uploaded" | "error";
  uploadedUrl: string | null;
};

const clampReviewMediaAspect = (value: number) => Math.max(MIN_REVIEW_MEDIA_ASPECT, Math.min(MAX_REVIEW_MEDIA_ASPECT, value));
const reviewMediaPreviewAspect = (media: NativeSocialComposerMedia) => clampReviewMediaAspect(
  typeof media.width === "number" && typeof media.height === "number" && media.width > 0 && media.height > 0
    ? media.width / media.height
    : 1,
);

const requestMonthOptions = Array.from({ length: 12 }, (_, index) => new Date(2000, index, 1).toLocaleDateString("en-US", { month: "long" }));
const requestWeekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const requestIsoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const requestCalendarCells = (monthDate: Date) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ iso: string | null; key: string; label: string }> = [];
  for (let index = 0; index < first.getDay(); index += 1) cells.push({ iso: null, key: `blank-${index}`, label: "" });
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    cells.push({ iso: requestIsoDate(date), key: requestIsoDate(date), label: String(day) });
  }
  return cells;
};

const requestDateLabel = (dates: string[]) => {
  const sorted = [...dates].sort();
  if (sorted.length === 0) return "Select dates";
  if (sorted.length === 1) return sorted[0];
  return `${sorted[0]} - ${sorted[sorted.length - 1]} (${sorted.length})`;
};

function RequestQuoteSelect({
  error,
  label,
  onToggle,
  open,
  placeholder,
  value,
  children,
}: {
  children: ReactNode;
  error?: boolean;
  label: string;
  onToggle: () => void;
  open: boolean;
  placeholder: string;
  value: string;
}) {
  return (
    <View style={nativeModalStyles.appModalFieldBlock}>
      <Text style={styles.requestCreateLabel}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={onToggle} style={[nativeModalStyles.appModalSelectTrigger, styles.requestFieldHeight, open ? nativeModalStyles.appModalFieldFocused : null, error ? nativeModalStyles.appModalFieldError : null]}>
        <Text numberOfLines={1} style={[nativeModalStyles.appModalSelectText, !value ? nativeModalStyles.appModalSelectPlaceholder : null]}>{value || placeholder}</Text>
        <Feather color={huddleColors.mutedText} name={open ? "chevron-up" : "chevron-down"} size={16} />
      </Pressable>
      {open ? <View style={styles.requestSelectMenu}>{children}</View> : null}
    </View>
  );
}

function RequestPetCarousel({
  error,
  onSelect,
  pets,
  selectedPetIds,
}: {
  error?: boolean;
  onSelect: (pet: PetOption) => void;
  pets: PetOption[];
  selectedPetIds: string[];
}) {
  const selectedCount = selectedPetIds.length;
  return (
    <View style={styles.petSelectSection}>
      <Text style={styles.requestCreateLabel}>Pets{selectedCount > 0 ? ` (${selectedCount})` : ""}</Text>
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.petSelectRail}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.petSelectRailViewport}
      >
        {pets.map((pet) => {
          const selected = selectedPetIds.includes(pet.id);
          return (
            <View key={pet.id} style={[styles.petSelectTile, error ? styles.petSelectTileError : null]}>
              <NativePolaroidCard
                accessibilityLabel={`${selected ? "Remove" : "Select"} ${pet.name || "pet"}`}
                captionPrimary={pet.name || "Pet"}
                captionSecondary={<Text numberOfLines={2} style={nativePolaroidStyles.captionSecondaryToken}>{formatPetCaption(pet)}</Text>}
                onPress={() => onSelect(pet)}
                photo={pet.photo_url ? (
                  <Image resizeMode="cover" source={{ uri: pet.photo_url }} style={nativePolaroidStyles.photo} />
                ) : (
                  <View style={nativePolaroidStyles.photoPlaceholder}>
                    <Feather color={huddleColors.iconSubtle} name="image" size={30} />
                  </View>
                )}
                photoOverlay={(
                  <View pointerEvents="none" style={[styles.petSelectCircle, selected ? styles.petSelectCircleActive : null]}>
                    {selected ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}
                  </View>
                )}
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function requestCardPets(requestCard: ServiceRequestCard | ServiceQuoteCard): ServiceRequestPet[] {
  if (Array.isArray(requestCard.pets) && requestCard.pets.length > 0) {
    return requestCard.pets
      .map((pet) => ({ ...pet, petId: clean(pet.petId), petName: clean(pet.petName) }))
      .filter((pet) => pet.petId || pet.petName);
  }
  const petId = clean(requestCard.petId);
  const petName = clean(requestCard.petName);
  if (!petId && !petName) return [];
  return [{
    dogSize: clean(requestCard.dogSize),
    petDob: "petDob" in requestCard ? clean(requestCard.petDob) : "",
    petId,
    petIsPublic: "petIsPublic" in requestCard ? requestCard.petIsPublic : undefined,
    petName,
    petPhotoUrl: "petPhotoUrl" in requestCard ? clean(requestCard.petPhotoUrl) : "",
    petSpecies: "petSpecies" in requestCard ? clean(requestCard.petSpecies) : clean(requestCard.petType),
    petType: clean(requestCard.petType),
  }];
}

function SelectedPetPolaroid({ requestCard, onOpenPet }: { requestCard: ServiceRequestCard | ServiceQuoteCard; onOpenPet?: (petId: string) => void }) {
  const selectedPets = requestCardPets(requestCard);
  if (selectedPets.length === 0) return null;
  return (
    <ScrollView bounces={false} contentContainerStyle={styles.summaryPetRail} horizontal showsHorizontalScrollIndicator={false}>
      {selectedPets.map((pet, index) => (
        <View key={pet.petId || `${pet.petName}-${index}`} style={styles.summaryPetTile}>
          <NativePolaroidCard
            accessibilityLabel={`Open ${pet.petName || "pet"} profile`}
            captionPrimary={pet.petName || "Pet"}
            captionSecondary={<Text numberOfLines={2} style={nativePolaroidStyles.captionSecondaryToken}>{formatPetCaption({ species: pet.petSpecies || pet.petType || null, dob: pet.petDob || null })}</Text>}
            onPress={pet.petId ? () => onOpenPet?.(pet.petId) : undefined}
            photo={pet.petPhotoUrl ? (
              <Image resizeMode="cover" source={{ uri: pet.petPhotoUrl || "" }} style={nativePolaroidStyles.photo} />
            ) : (
              <View style={nativePolaroidStyles.photoPlaceholder}>
                <Feather color={huddleColors.iconSubtle} name="image" size={30} />
              </View>
            )}
          />
        </View>
      ))}
    </ScrollView>
  );
}

function RequestOptionRow({ active, label, onPress }: { active?: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.requestSelectOption, pressed ? nativeModalStyles.pressed : null]}>
      <Text style={[styles.requestSelectOptionText, active ? styles.requestSelectOptionTextActive : null]}>{label}</Text>
      {active ? <Feather color={huddleColors.blue} name="check" size={16} /> : <View style={styles.requestCheckSlot} />}
    </Pressable>
  );
}

function RequestMultiSelect({
  error,
  label,
  onChange,
  onOpen,
  open,
  options,
  placeholder,
  selected,
}: {
  error?: boolean;
  label: string;
  onChange: (next: string[]) => void;
  onOpen?: () => void;
  open: boolean;
  options: readonly string[];
  placeholder: string;
  selected: string[];
}) {
  const value = selected.length > 0 ? selected.join(", ") : "";
  return (
    <RequestQuoteSelect error={error} label={label} onToggle={onOpen || (() => undefined)} open={open} placeholder={placeholder} value={value}>
      {options.map((option) => {
        const active = selected.includes(option);
        return <RequestOptionRow key={option} active={active} label={option} onPress={() => onChange(active ? selected.filter((item) => item !== option) : [...selected, option])} />;
      })}
    </RequestQuoteSelect>
  );
}

function RequestSheet({
  countryLabel,
  initialCard,
  onClose,
  onSubmit,
  open,
  pets,
  providerAreaName,
  providerCurrency,
  providerLocationStyles,
  providerServices,
  submitLabel,
}: {
  countryLabel?: string | null;
  initialCard?: ServiceRequestCard | null;
  onClose: () => void;
  onSubmit: (card: ServiceRequestCard) => Promise<void>;
  open: boolean;
  pets: PetOption[];
  providerAreaName?: string;
  providerCurrency?: string;
  providerLocationStyles?: string[];
  providerServices?: string[];
  submitLabel: "Send" | "Update";
}) {
  const scrollRef = useRef<ScrollView | null>(null);
  const fieldLayoutsRef = useRef<Record<string, { height: number; y: number }>>({});
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [petIds, setPetIds] = useState<string[]>([]);
  const [petType, setPetType] = useState("");
  const [dogSize, setDogSize] = useState("");
  const [requestedDates, setRequestedDates] = useState<string[]>([]);
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [locationStyles, setLocationStyles] = useState<string[]>([]);
  const [locationArea, setLocationArea] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<NativeLocationSuggestion[]>([]);
  const [locationSearchOpen, setLocationSearchOpen] = useState(false);
  const [locationSearching, setLocationSearching] = useState(false);
  const [suggestedCurrency, setSuggestedCurrency] = useState("HKD");
  const [suggestedPrice, setSuggestedPrice] = useState("");
  const [suggestedRate, setSuggestedRate] = useState("Per visit");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [dateDropdown, setDateDropdown] = useState<"month" | "year" | null>(null);
  const [locationStyleMenuOpen, setLocationStyleMenuOpen] = useState(false);
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const [rateMenuOpen, setRateMenuOpen] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [slideResetKey, setSlideResetKey] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const acceptedLocationRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const dates = Array.isArray(initialCard?.requestedDates) ? initialCard?.requestedDates || [] : initialCard?.requestedDate ? [initialCard.requestedDate] : [];
    const initialPetIds = Array.from(new Set([
      ...(Array.isArray(initialCard?.petIds) ? initialCard.petIds : []),
      ...(Array.isArray(initialCard?.pets) ? initialCard.pets.map((pet) => pet.petId) : []),
      clean(initialCard?.petId),
    ].map(clean).filter(Boolean)));
    setServiceTypes(Array.isArray(initialCard?.serviceTypes) ? initialCard?.serviceTypes || [] : initialCard?.serviceType ? [initialCard.serviceType] : []);
    setPetIds(initialPetIds);
    setPetType(clean(initialCard?.petType));
    setDogSize(clean(initialCard?.dogSize));
    setRequestedDates(dates.map(clean).filter(Boolean));
    setMonthDate(dates[0] ? new Date(`${dates[0]}T00:00:00`) : new Date());
    setStartTime(clean(initialCard?.startTime) || "09:00");
    setEndTime(clean(initialCard?.endTime) || "17:00");
    setLocationStyles(Array.isArray(initialCard?.locationStyles) ? initialCard?.locationStyles || [] : []);
    setLocationArea(clean(initialCard?.locationArea));
    acceptedLocationRef.current = clean(initialCard?.locationArea) || null;
    setSuggestedCurrency(clean(initialCard?.suggestedCurrency) || clean(providerCurrency) || "HKD");
    setSuggestedPrice(clean(initialCard?.suggestedPrice));
    setSuggestedRate(clean(initialCard?.suggestedRate) || "Per visit");
    setAdditionalNotes(clean(initialCard?.additionalNotes));
    setServiceMenuOpen(false);
    setDatePickerOpen(false);
    setDateDropdown(null);
    setLocationStyleMenuOpen(false);
    setCurrencyMenuOpen(false);
    setRateMenuOpen(false);
    setLocationSearchOpen(false);
    setAttempted(false);
    setSlideResetKey((value) => value + 1);
  }, [initialCard, open, providerCurrency]);

  const selectedPets = pets.filter((item) => petIds.includes(item.id));
  const primaryPet = selectedPets[0] || null;
  const fallbackInitialPets = initialCard ? requestCardPets(initialCard) : [];
  const requestPets: ServiceRequestPet[] = selectedPets.length > 0
    ? selectedPets.map((item) => {
      const nextPetType = normalizePetType(item.species || null);
      return {
        dogSize: nextPetType.toLowerCase() === "dog" ? inferDogSize(item.weight ?? null, item.weight_unit ?? null) : "",
        petDob: clean(item.dob),
        petId: item.id,
        petIsPublic: item.is_public !== false,
        petName: item.name || "Pet",
        petPhotoUrl: clean(item.photo_url),
        petSpecies: clean(item.species),
        petType: nextPetType,
      };
    })
    : fallbackInitialPets.filter((pet) => petIds.includes(pet.petId));
  const petId = clean(primaryPet?.id) || clean(requestPets[0]?.petId);
  const petName = clean(primaryPet?.name) || clean(requestPets[0]?.petName) || clean(initialCard?.petName);
  const primaryPetType = clean(requestPets[0]?.petType) || petType;
  const primaryDogSize = clean(requestPets[0]?.dogSize) || dogSize;
  const providerServiceOptions = useMemo(() => Array.from(new Set((providerServices || []).map(clean).filter(Boolean))), [providerServices]);
  const locationStyleOptions = useMemo(() => getRequesterLocationOptions(providerLocationStyles || []), [providerLocationStyles]);
  const providerOnlyCarerPlace = locationStyleOptions.length === 1 && locationStyleOptions[0] === "Carer's Place";
  const selectedLocationAllowsAreaInput = locationStyles.some((item) => ["Flexible", "Outdoor", "Carer's Place"].includes(item));
  const locationAreaLockedToProvider = providerOnlyCarerPlace && !selectedLocationAllowsAreaInput;
  const missing = {
    serviceType: serviceTypes.length === 0 || serviceTypes.some((item) => !providerServiceOptions.includes(item)),
    petId: petIds.length === 0,
    requestedDates: requestedDates.length === 0,
    startTime: !startTime,
    endTime: !endTime,
    locationStyles: locationStyles.length === 0 || locationStyles.some((item) => !locationStyleOptions.includes(item)),
    locationArea: !locationArea,
  };
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 4 }, (_, index) => String(current + index));
  }, []);
  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, [open]);
  const calendarCells = useMemo(() => requestCalendarCells(monthDate), [monthDate]);
  const monthIndex = monthDate.getMonth();
  const yearValue = monthDate.getFullYear();
  const registerField = (key: string) => (event: { nativeEvent: { layout: { height: number; y: number } } }) => {
    fieldLayoutsRef.current[key] = event.nativeEvent.layout;
  };
  const centerField = (key: string, extraOffset = 0) => {
    const scrollToTarget = () => {
      const layout = fieldLayoutsRef.current[key];
      if (!layout) return;
      const visibleHeight = Math.max(220, 620 - footerHeight - keyboardHeight - huddleSpacing.x6);
      const shouldTopAlign = extraOffset >= 160 || key === "requestedDates" || key === "petId";
      const nextY = shouldTopAlign
        ? Math.max(0, layout.y - huddleSpacing.x3)
        : Math.max(0, layout.y + layout.height + extraOffset - visibleHeight + huddleSpacing.x4);
      scrollRef.current?.scrollTo({ y: nextY, animated: true });
    };
    requestAnimationFrame(scrollToTarget);
    setTimeout(scrollToTarget, 180);
    setTimeout(scrollToTarget, 360);
  };
  const closeMenus = (except?: string) => {
    if (except !== "service") setServiceMenuOpen(false);
    if (except !== "dates") {
      setDatePickerOpen(false);
      setDateDropdown(null);
    }
    if (except !== "locationStyles") setLocationStyleMenuOpen(false);
    if (except !== "currency") setCurrencyMenuOpen(false);
    if (except !== "rate") setRateMenuOpen(false);
    if (except !== "location") setLocationSearchOpen(false);
  };

  useEffect(() => {
    if (!open) return undefined;
    const showSub = Keyboard.addListener("keyboardDidShow", (event) => setKeyboardHeight(event.endCoordinates.height));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (providerServiceOptions.length === 1 && serviceTypes.length === 0) {
      setServiceTypes([providerServiceOptions[0]]);
    }
  }, [open, providerServiceOptions, serviceTypes.length]);

  useEffect(() => {
    if (!open || locationStyleOptions.length === 0) return;
    setLocationStyles((current) => {
      const valid = current.filter((item) => locationStyleOptions.includes(item));
      if (providerOnlyCarerPlace) return ["Carer's Place"];
      return valid;
    });
    if (locationAreaLockedToProvider) {
      const providerArea = clean(providerAreaName);
      setLocationArea(providerArea);
      acceptedLocationRef.current = providerArea || null;
      setLocationSuggestions([]);
      setLocationSearchOpen(false);
    }
  }, [locationAreaLockedToProvider, locationStyleOptions, open, providerAreaName, providerOnlyCarerPlace]);

  useEffect(() => {
    if (!open) return undefined;
    const trimmed = locationArea.trim();
    if (acceptedLocationRef.current && acceptedLocationRef.current === trimmed) return undefined;
    if (locationAreaLockedToProvider) return undefined;
    if (trimmed.length < 2) {
      setLocationSuggestions([]);
      setLocationSearchOpen(false);
      setLocationSearching(false);
      return undefined;
    }
    let active = true;
    const timer = setTimeout(() => {
      setLocationSearching(true);
      void fetchNativeLocationSuggestions(trimmed, countryLabel)
        .then((results) => {
          if (!active) return;
          setLocationSuggestions(results);
          setLocationSearchOpen(results.length > 0);
        })
        .catch(() => {
          if (active) setLocationSuggestions([]);
        })
        .finally(() => {
          if (active) setLocationSearching(false);
        });
    }, 280);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [countryLabel, locationArea, locationAreaLockedToProvider, open]);

  const submit = async () => {
    setAttempted(true);
    const firstMissing = Object.entries(missing).find(([, value]) => value)?.[0] || "";
    if (firstMissing) {
      setSlideResetKey((value) => value + 1);
      centerField(firstMissing);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        serviceType: serviceTypes[0] || "",
        serviceTypes,
        petId,
        petIds,
        petName,
        petType: primaryPetType,
        dogSize: primaryDogSize,
        pets: requestPets,
        petPhotoUrl: clean(primaryPet?.photo_url) || clean(requestPets[0]?.petPhotoUrl),
        petSpecies: clean(primaryPet?.species) || clean(requestPets[0]?.petSpecies),
        petDob: clean(primaryPet?.dob) || clean(requestPets[0]?.petDob),
        petIsPublic: primaryPet ? primaryPet.is_public !== false : requestPets[0]?.petIsPublic,
        requestedDates,
        requestedDate: requestedDates[0] || "",
        startTime,
        endTime,
        locationStyles,
        locationArea: locationArea.trim(),
        suggestedCurrency: suggestedPrice.trim() ? suggestedCurrency.trim().toUpperCase() : "",
        suggestedPrice: suggestedPrice.trim(),
        suggestedRate: suggestedPrice.trim() ? suggestedRate.trim() : "",
        additionalNotes: additionalNotes.trim(),
        allowProfileAccess: true,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={open} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close request sheet" onPress={onClose} style={StyleSheet.absoluteFill} />
        <AppBottomSheet mode="large" onClose={onClose}>
          <AppBottomSheetHeader>
            <Text style={nativeModalStyles.appModalSheetTitle}>Book Care</Text>
            <AppModalIconButton accessibilityLabel="Close request sheet" onPress={onClose}>
              <Feather color={huddleColors.text} name="x" size={24} />
            </AppModalIconButton>
          </AppBottomSheetHeader>
          <AppBottomSheetScroll
            contentContainerStyle={styles.requestSheetScrollContent}
            scrollRef={scrollRef}
          >
            <View onLayout={registerField("serviceType")}>
              <RequestMultiSelect
                error={attempted && missing.serviceType}
                label="Care type"
                onChange={setServiceTypes}
                onOpen={() => { Keyboard.dismiss(); closeMenus("service"); setServiceMenuOpen((value) => !value); centerField("serviceType", 180); }}
                open={serviceMenuOpen}
                options={providerServiceOptions}
                placeholder="Select"
                selected={serviceTypes}
              />
            </View>

            <View onLayout={registerField("petId")}>
              <RequestPetCarousel
                error={attempted && missing.petId}
                onSelect={(item) => {
                  setPetIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]);
                  const nextPetType = normalizePetType(item.species || null);
                  setPetType(nextPetType);
                  setDogSize(nextPetType.toLowerCase() === "dog" ? inferDogSize(item.weight ?? null, item.weight_unit ?? null) : "");
                }}
                pets={pets}
                selectedPetIds={petIds}
              />
            </View>

            <View onLayout={registerField("requestedDates")}>
              <RequestQuoteSelect
                error={attempted && missing.requestedDates}
                label="Requested date(s)"
                onToggle={() => { Keyboard.dismiss(); closeMenus("dates"); setDatePickerOpen((value) => !value); centerField("requestedDates", 330); }}
                open={datePickerOpen}
                placeholder="Select dates"
                value={requestDateLabel(requestedDates)}
              >
                <View style={styles.requestDateStack}>
                  <View style={styles.requestDateHeaderRow}>
                    <Pressable accessibilityLabel="Previous month" onPress={() => setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} style={styles.requestDateArrowButton}>
                      <Feather color={huddleColors.iconMuted} name="chevron-left" size={18} />
                    </Pressable>
                    <View style={styles.requestDateSelectRow}>
                      <Pressable onPress={() => setDateDropdown((value) => value === "month" ? null : "month")} style={[styles.requestDateSelectButton, dateDropdown === "month" ? nativeModalStyles.appModalFieldFocused : null]}>
                        <Text numberOfLines={1} style={styles.requestDateSelectText}>{requestMonthOptions[monthIndex]}</Text>
                        <Feather color={huddleColors.iconSubtle} name="chevron-down" size={16} />
                      </Pressable>
                      <Pressable onPress={() => setDateDropdown((value) => value === "year" ? null : "year")} style={[styles.requestDateSelectButton, styles.requestYearSelectButton, dateDropdown === "year" ? nativeModalStyles.appModalFieldFocused : null]}>
                        <Text numberOfLines={1} style={styles.requestDateSelectText}>{yearValue}</Text>
                        <Feather color={huddleColors.iconSubtle} name="chevron-down" size={16} />
                      </Pressable>
                    </View>
                    <Pressable accessibilityLabel="Next month" onPress={() => setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} style={styles.requestDateArrowButton}>
                      <Feather color={huddleColors.iconMuted} name="chevron-right" size={18} />
                    </Pressable>
                  </View>
                  {dateDropdown === "month" ? (
                    <View style={styles.requestSelectMenuInline}>
                      {requestMonthOptions.map((month, index) => <RequestOptionRow key={month} active={index === monthIndex} label={month} onPress={() => { setMonthDate((prev) => new Date(prev.getFullYear(), index, 1)); setDateDropdown(null); }} />)}
                    </View>
                  ) : null}
                  {dateDropdown === "year" ? (
                    <View style={styles.requestSelectMenuInline}>
                      {yearOptions.map((year) => <RequestOptionRow key={year} active={Number(year) === yearValue} label={year} onPress={() => { setMonthDate((prev) => new Date(Number(year), prev.getMonth(), 1)); setDateDropdown(null); }} />)}
                    </View>
                  ) : null}
                  <View style={styles.requestWeekdayGrid}>
                    {requestWeekdayLabels.map((day) => <Text key={day} style={styles.requestWeekdayText}>{day}</Text>)}
                  </View>
                  <View style={styles.requestCalendarGrid}>
                    {calendarCells.map((cell) => {
                      if (!cell.iso) return <View key={cell.key} style={styles.requestCalendarCell} />;
                      const date = new Date(`${cell.iso}T00:00:00`);
                      const isPast = date < today;
                      const isToday = date.getTime() === today.getTime();
                      const active = requestedDates.includes(cell.iso);
                      return (
                        <Pressable
                          disabled={isPast}
                          key={cell.key}
                          onPress={() => setRequestedDates((prev) => prev.includes(cell.iso!) ? prev.filter((item) => item !== cell.iso) : [...prev, cell.iso!].sort())}
                          style={({ pressed }) => [styles.requestCalendarCell, active ? styles.requestCalendarCellActive : isToday ? styles.requestCalendarCellToday : styles.requestCalendarCellRest, isPast ? styles.requestCalendarCellDisabled : null, pressed && !isPast ? nativeModalStyles.pressed : null]}
                        >
                          <Text style={[styles.requestCalendarCellText, active ? styles.requestCalendarCellTextActive : null, isPast ? styles.requestCalendarCellTextDisabled : null]}>{cell.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </RequestQuoteSelect>
            </View>

            <View onLayout={registerField("startTime")} style={styles.requestTwoColumn}>
              <View style={styles.requestFlexField}>
                <Text style={styles.requestCreateLabel}>Start time</Text>
                <AppModalField error={attempted && missing.startTime} focused={focusedField === "startTime"} onBlur={() => setFocusedField(null)} onChangeText={setStartTime} onFocus={() => { closeMenus(); setFocusedField("startTime"); centerField("startTime"); }} placeholder="09:00" style={styles.requestFieldHeight} value={startTime} />
              </View>
              <View style={styles.requestFlexField}>
                <Text style={styles.requestCreateLabel}>End time</Text>
                <AppModalField error={attempted && missing.endTime} focused={focusedField === "endTime"} onBlur={() => setFocusedField(null)} onChangeText={setEndTime} onFocus={() => { closeMenus(); setFocusedField("endTime"); centerField("startTime"); }} placeholder="17:00" style={styles.requestFieldHeight} value={endTime} />
              </View>
            </View>

            <View onLayout={registerField("locationStyles")}>
              <RequestMultiSelect
                error={attempted && missing.locationStyles}
                label="Location style"
                onChange={setLocationStyles}
                onOpen={() => { Keyboard.dismiss(); closeMenus("locationStyles"); setLocationStyleMenuOpen((value) => !value); centerField("locationStyles", 180); }}
                open={locationStyleMenuOpen}
                options={locationStyleOptions}
                placeholder="Select"
                selected={locationStyles}
              />
            </View>

            <View onLayout={registerField("locationArea")} style={nativeModalStyles.appModalFieldBlock}>
              <Text style={styles.requestCreateLabel}>Location / area</Text>
              <AppModalField
                editable={!locationAreaLockedToProvider}
                error={attempted && missing.locationArea}
                focused={focusedField === "locationArea"}
                onBlur={() => setFocusedField(null)}
                onChangeText={(value) => {
                  acceptedLocationRef.current = null;
                  setLocationArea(value);
                }}
                onFocus={() => {
                  if (locationAreaLockedToProvider) return;
                  closeMenus("location");
                  setFocusedField("locationArea");
                  centerField("locationArea", 170);
                  if (locationSuggestions.length > 0) setLocationSearchOpen(true);
                }}
                placeholder={locationAreaLockedToProvider ? "Provider district" : "Search district or neighbourhood"}
                returnKeyType="search"
                style={[styles.requestFieldHeight, locationAreaLockedToProvider ? styles.requestReadOnlyField : null]}
                value={locationArea}
              />
              {locationSearchOpen && (locationSuggestions.length > 0 || locationSearching) ? (
                <View style={styles.locationSuggestionCard}>
                  {locationSearching && locationSuggestions.length === 0 ? <Text style={styles.locationSuggestionMeta}>Searching...</Text> : null}
                  {locationSuggestions.map((suggestion) => (
                    <Pressable
                      key={`${suggestion.label}:${suggestion.lat}:${suggestion.lng}`}
                      onPress={() => {
                        const selectedLocation = suggestion.district || suggestion.label;
                        acceptedLocationRef.current = selectedLocation;
                        setLocationArea(selectedLocation);
                        setLocationSearchOpen(false);
                        Keyboard.dismiss();
                      }}
                      style={styles.locationSuggestionRow}
                    >
                      <Text style={styles.locationSuggestionPrimary}>{suggestion.district || suggestion.label}</Text>
                      {suggestion.label ? <Text numberOfLines={1} style={styles.locationSuggestionMeta}>{suggestion.label}</Text> : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            <View onLayout={registerField("price")} style={styles.requestRateBlock}>
              <Text style={styles.requestCreateLabel}>Rate</Text>
              <View style={[styles.requestRateCompositeField, focusedField === "price" || currencyMenuOpen || rateMenuOpen ? nativeModalStyles.appModalFieldFocused : null]}>
                <Pressable onPress={() => { Keyboard.dismiss(); setFocusedField("price"); closeMenus("currency"); setCurrencyMenuOpen((value) => !value); centerField("price", 180); }} style={styles.requestRateCurrency}>
                  <Text style={styles.requestRateText}>{suggestedCurrency || "-"}</Text>
                </Pressable>
                <View style={styles.requestRatePrice}>
                  <AppModalField focused={focusedField === "price"} keyboardType="decimal-pad" onBlur={() => setFocusedField(null)} onChangeText={setSuggestedPrice} onFocus={() => { closeMenus(); setFocusedField("price"); centerField("price", 180); }} placeholder="0" style={styles.requestRateInput} value={suggestedPrice} />
                </View>
                <Pressable onPress={() => { Keyboard.dismiss(); setFocusedField("price"); closeMenus("rate"); setRateMenuOpen((value) => !value); centerField("price", 180); }} style={styles.requestRateUnit}>
                  <Text numberOfLines={1} style={styles.requestRateText}>{suggestedRate || "Rate"}</Text>
                </Pressable>
              </View>
              {currencyMenuOpen ? (
                <View style={styles.requestSelectMenu}>
                  {CURRENCIES.map((currency) => <RequestOptionRow key={currency} active={currency === suggestedCurrency} label={currency} onPress={() => { setSuggestedCurrency(currency); setCurrencyMenuOpen(false); }} />)}
                </View>
              ) : null}
              {rateMenuOpen ? (
                <View style={styles.requestSelectMenu}>
                  {RATE_OPTIONS.map((rate) => <RequestOptionRow key={rate} active={rate === suggestedRate} label={rate} onPress={() => { setSuggestedRate(rate); setRateMenuOpen(false); }} />)}
                </View>
              ) : null}
            </View>

            <View onLayout={registerField("additionalNotes")} style={nativeModalStyles.appModalFieldBlock}>
              <Text style={styles.requestCreateLabel}>Additional notes</Text>
              <AppModalField focused={focusedField === "additionalNotes"} multiline onBlur={() => setFocusedField(null)} onChangeText={setAdditionalNotes} onFocus={() => { closeMenus(); setFocusedField("additionalNotes"); centerField("additionalNotes", 80); }} placeholder="Share anything the provider should know" value={additionalNotes} />
            </View>
          </AppBottomSheetScroll>
          <AppBottomSheetFooter onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}>
            <SlideToConfirm busy={submitting} label={submitLabel === "Update" ? "Slide to Update" : "Slide to Send"} onCommit={() => void submit()} resetKey={slideResetKey} />
          </AppBottomSheetFooter>
        </AppBottomSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function QuoteSheet({
  countryLabel,
  initialCard,
  onClose,
  onOpenPet,
  onSubmit,
  open,
  requestCard,
}: {
  countryLabel?: string | null;
  initialCard?: ServiceQuoteCard | null;
  onClose: () => void;
  onOpenPet?: (petId: string) => void;
  onSubmit: (card: ServiceQuoteCard) => Promise<void>;
  open: boolean;
  requestCard: ServiceRequestCard | null;
}) {
  const scrollRef = useRef<ScrollView | null>(null);
  const fieldLayoutsRef = useRef<Record<string, { height: number; y: number }>>({});
  const [currency, setCurrency] = useState("HKD");
  const [finalPrice, setFinalPrice] = useState("");
  const [rate, setRate] = useState("Per visit");
  const [locationArea, setLocationArea] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<NativeLocationSuggestion[]>([]);
  const [locationSearchOpen, setLocationSearchOpen] = useState(false);
  const [locationSearching, setLocationSearching] = useState(false);
  const [note, setNote] = useState("");
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const [rateMenuOpen, setRateMenuOpen] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [slideResetKey, setSlideResetKey] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const acceptedLocationRef = useRef<string | null>(null);
  const canEditLocation = providerCanEditCareScopeLocation(requestCard);
  const quoteLocationStyles = initialCard?.locationStyles?.length ? initialCard.locationStyles : requestCard?.locationStyles || [];

  useEffect(() => {
    if (!open) return;
    setCurrency(clean(initialCard?.currency) || clean(requestCard?.suggestedCurrency) || "HKD");
    setFinalPrice(clean(initialCard?.finalPrice) || clean(requestCard?.suggestedPrice));
    setRate(normalizeRateLabel(initialCard?.rate) || normalizeRateLabel(requestCard?.suggestedRate) || "Per visit");
    const nextLocationArea = clean(initialCard?.locationArea) || clean(requestCard?.locationArea);
    setLocationArea(nextLocationArea);
    acceptedLocationRef.current = nextLocationArea || null;
    setLocationSuggestions([]);
    setLocationSearchOpen(false);
    setLocationSearching(false);
    setNote(clean(initialCard?.note));
    setCurrencyMenuOpen(false);
    setRateMenuOpen(false);
    setFocusedField(null);
    setAttempted(false);
    setSlideResetKey((value) => value + 1);
  }, [initialCard, open, requestCard?.locationArea, requestCard?.suggestedCurrency, requestCard?.suggestedPrice, requestCard?.suggestedRate]);

  useEffect(() => {
    if (!open) return undefined;
    const showSub = Keyboard.addListener("keyboardDidShow", (event) => setKeyboardHeight(event.endCoordinates.height));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [open]);

  const registerField = (key: string) => (event: { nativeEvent: { layout: { height: number; y: number } } }) => {
    fieldLayoutsRef.current[key] = event.nativeEvent.layout;
  };
  const centerField = (key: string, extraOffset = 0) => {
    const scrollToTarget = () => {
      const layout = fieldLayoutsRef.current[key];
      if (!layout) return;
      const visibleHeight = Math.max(220, 620 - footerHeight - keyboardHeight - huddleSpacing.x6);
      const nextY = Math.max(0, layout.y + layout.height + extraOffset - visibleHeight + huddleSpacing.x4);
      scrollRef.current?.scrollTo({ y: nextY, animated: true });
    };
    requestAnimationFrame(scrollToTarget);
    setTimeout(scrollToTarget, 180);
    setTimeout(scrollToTarget, 360);
  };
  const closeMenus = (except?: string) => {
    if (except !== "currency") setCurrencyMenuOpen(false);
    if (except !== "rate") setRateMenuOpen(false);
    if (except !== "location") setLocationSearchOpen(false);
  };

  useEffect(() => {
    if (!open || !canEditLocation) return undefined;
    const trimmed = locationArea.trim();
    if (acceptedLocationRef.current && acceptedLocationRef.current === trimmed) return undefined;
    if (trimmed.length < 2) {
      setLocationSuggestions([]);
      setLocationSearchOpen(false);
      setLocationSearching(false);
      return undefined;
    }
    let active = true;
    const timer = setTimeout(() => {
      setLocationSearching(true);
      void fetchNativeLocationSuggestions(trimmed, countryLabel)
        .then((results) => {
          if (!active) return;
          setLocationSuggestions(results);
          setLocationSearchOpen(results.length > 0);
        })
        .catch(() => {
          if (active) setLocationSuggestions([]);
        })
        .finally(() => {
          if (active) setLocationSearching(false);
        });
    }, 280);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [canEditLocation, countryLabel, locationArea, open]);

  const missingLocation = canEditLocation && !locationArea.trim();
  const missingRate = !currency.trim() || !finalPrice.trim() || !rate.trim();

  const submit = async () => {
    setAttempted(true);
    if (missingLocation) {
      setSlideResetKey((value) => value + 1);
      centerField("location", 120);
      return;
    }
    if (missingRate) {
      setSlideResetKey((value) => value + 1);
      centerField("rate", 180);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        serviceType: clean(requestCard?.serviceType),
        serviceTypes: requestCard?.serviceTypes || [],
        petId: clean(requestCard?.petId),
        petIds: requestCard?.petIds || [],
        petName: clean(requestCard?.petName),
        petType: clean(requestCard?.petType),
        dogSize: clean(requestCard?.dogSize),
        pets: requestCard?.pets || [],
        requestedDates: requestCard?.requestedDates || [],
        startTime: clean(requestCard?.startTime),
        endTime: clean(requestCard?.endTime),
        locationStyles: quoteLocationStyles,
        locationArea: canEditLocation ? locationArea.trim() : clean(initialCard?.locationArea) || clean(requestCard?.locationArea),
        currency: currency.trim().toUpperCase(),
        finalPrice: finalPrice.trim(),
        rate: rate.trim(),
        note: note.trim(),
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={open} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close care scope sheet" onPress={onClose} style={StyleSheet.absoluteFill} />
        <AppBottomSheet mode="large" onClose={onClose}>
          <AppBottomSheetHeader>
            <Text style={nativeModalStyles.appModalSheetTitle}>Update Care Scope</Text>
            <AppModalIconButton accessibilityLabel="Close care scope sheet" onPress={onClose}>
              <Feather color={huddleColors.text} name="x" size={24} />
            </AppModalIconButton>
          </AppBottomSheetHeader>
          <AppBottomSheetScroll contentContainerStyle={styles.requestSheetScrollContent} scrollRef={scrollRef}>
            {requestCard ? (
              <View style={styles.requestSummaryCard}>
                <Text style={styles.cardTitle}>{Array.isArray(requestCard.serviceTypes) && requestCard.serviceTypes.length > 0 ? requestCard.serviceTypes.join(" · ") : requestCard.serviceType}</Text>
                <SelectedPetPolaroid requestCard={requestCard} onOpenPet={onOpenPet} />
                <Text style={styles.cardMeta}>{Array.isArray(requestCard.requestedDates) ? requestCard.requestedDates.join(", ") : clean(requestCard.requestedDate) || "—"}</Text>
                <Text style={styles.cardMeta}>{requestCard.startTime} - {requestCard.endTime}</Text>
                <Text style={styles.cardMeta}>{requestCard.locationStyles?.length ? `${requestCard.locationStyles.join(", ")} · ` : ""}{requestCard.locationArea}</Text>
                {requestCard.suggestedPrice ? <Text style={styles.cardMeta}>Request rate: {requestCard.suggestedCurrency || "HKD"} {requestCard.suggestedPrice}{requestCard.suggestedRate ? ` ${requestCard.suggestedRate}` : ""}</Text> : null}
              </View>
            ) : null}
            {canEditLocation ? (
              <View onLayout={registerField("location")} style={nativeModalStyles.appModalFieldBlock}>
                <Text style={styles.requestCreateLabel}>Location / area</Text>
                <AppModalField
                  error={attempted && missingLocation}
                  focused={focusedField === "location" || locationSearchOpen}
                  onBlur={() => setFocusedField(null)}
                  onChangeText={(value) => {
                    acceptedLocationRef.current = null;
                    setLocationArea(value);
                    if (attempted && value.trim()) setAttempted(false);
                  }}
                  onFocus={() => {
                    closeMenus("location");
                    setFocusedField("location");
                    if (locationSuggestions.length > 0) setLocationSearchOpen(true);
                    centerField("location", 120);
                  }}
                  placeholder="Search district or neighbourhood"
                  style={styles.requestFieldHeight}
                  value={locationArea}
                />
                {locationSearchOpen || locationSearching ? (
                  <View style={styles.locationSuggestionCard}>
                    {locationSearching ? <Text style={styles.locationSuggestionMeta}>Searching...</Text> : null}
                    {locationSuggestions.map((suggestion) => (
                      <Pressable
                        key={`${suggestion.label}-${suggestion.district}`}
                        onPress={() => {
                          const selectedLocation = suggestion.district || suggestion.label;
                          acceptedLocationRef.current = selectedLocation;
                          setLocationArea(selectedLocation);
                          setLocationSearchOpen(false);
                          setLocationSuggestions([]);
                        }}
                        style={({ pressed }) => [styles.locationSuggestionRow, pressed ? nativeModalStyles.pressed : null]}
                      >
                        <Text style={styles.locationSuggestionPrimary}>{suggestion.district || suggestion.label}</Text>
                        {suggestion.district && suggestion.label !== suggestion.district ? <Text style={styles.locationSuggestionMeta}>{suggestion.label}</Text> : null}
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {attempted && missingLocation ? <Text style={styles.errorText}>Location is required.</Text> : null}
              </View>
            ) : null}
            <View onLayout={registerField("rate")} style={styles.requestRateBlock}>
              <Text style={styles.requestCreateLabel}>Rate</Text>
              <View style={[styles.requestRateCompositeField, focusedField === "rate" || currencyMenuOpen || rateMenuOpen ? nativeModalStyles.appModalFieldFocused : null, attempted && missingRate ? nativeModalStyles.appModalFieldError : null]}>
                <Pressable onPress={() => { Keyboard.dismiss(); setFocusedField("rate"); closeMenus("currency"); setCurrencyMenuOpen((value) => !value); centerField("rate", 180); }} style={styles.requestRateCurrency}>
                  <Text style={styles.requestRateText}>{currency || "-"}</Text>
                </Pressable>
                <View style={styles.requestRatePrice}>
                  <AppModalField
                    error={attempted && !finalPrice.trim()}
                    focused={focusedField === "rate"}
                    keyboardType="decimal-pad"
                    onBlur={() => setFocusedField(null)}
                    onChangeText={setFinalPrice}
                    onFocus={() => { closeMenus(); setFocusedField("rate"); centerField("rate", 180); }}
                    placeholder="Final price"
                    style={styles.requestRateInput}
                    value={finalPrice}
                  />
                </View>
                <Pressable onPress={() => { Keyboard.dismiss(); setFocusedField("rate"); closeMenus("rate"); setRateMenuOpen((value) => !value); centerField("rate", 180); }} style={styles.requestRateUnit}>
                  <Text numberOfLines={1} style={styles.requestRateText}>{rate || "Rate"}</Text>
                </Pressable>
              </View>
              {currencyMenuOpen ? (
                <View style={styles.requestSelectMenu}>
                  {CURRENCIES.map((item) => <RequestOptionRow key={item} active={item === currency} label={item} onPress={() => { setCurrency(item); setCurrencyMenuOpen(false); }} />)}
                </View>
              ) : null}
              {rateMenuOpen ? (
                <View style={styles.requestSelectMenu}>
                  {RATE_OPTIONS.map((item) => <RequestOptionRow key={item} active={item === rate} label={item} onPress={() => { setRate(item); setRateMenuOpen(false); }} />)}
                </View>
              ) : null}
            </View>
            {attempted && missingRate ? <Text style={styles.errorText}>Currency, final price and rate are required.</Text> : null}
            <View onLayout={registerField("note")} style={nativeModalStyles.appModalFieldBlock}>
              <Text style={styles.requestCreateLabel}>Optional note</Text>
              <AppModalField
                focused={focusedField === "note"}
                multiline
                onBlur={() => setFocusedField(null)}
                onChangeText={setNote}
                onFocus={() => { closeMenus(); setFocusedField("note"); centerField("note", 80); }}
                placeholder="Share anything helpful for the requester"
                value={note}
              />
            </View>
          </AppBottomSheetScroll>
          <AppBottomSheetFooter onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}>
            <SlideToConfirm busy={submitting} label="Slide to Update" onCommit={() => void submit()} resetKey={slideResetKey} />
          </AppBottomSheetFooter>
        </AppBottomSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function NativeServiceChatScreen({
  accessToken,
  search,
  sessionKey,
  userId,
  onNavigate,
}: {
  accessToken?: string | null;
  search?: string;
  sessionKey?: string | null;
  userId: string | null;
  onNavigate: (path: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const params = useMemo(() => parseParams(search), [search]);
  const roomId = params.room;
  const [serviceChat, setServiceChat] = useState<ServiceChatRow | null>(null);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const initialCounterpart = useMemo<Counterpart | null>(() => params.peerId || params.name || params.avatar ? ({
    id: params.peerId,
    displayName: params.name || "Care chat",
    avatarUrl: resolveNativeAvatarUrl(params.avatar) || params.avatar || null,
    stripePayoutStatus: null,
    stripeAccountId: null,
    skills: params.skills,
    providerServices: [],
    providerLocationStyles: [],
    providerAreaName: "",
    providerCurrency: "",
    providerCountry: null,
  }) : null, [params.avatar, params.name, params.peerId, params.skills]);
  const [counterpart, setCounterpart] = useState<Counterpart | null>(initialCounterpart);
  const [pets, setPets] = useState<PetOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [composer, setComposer] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const [uploads, setUploads] = useState<ServiceChatUpload[]>([]);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const nearBottomRef = useRef(true);
  const midCareReminderNotifyRef = useRef(false);
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [hasReportedServiceDispute, setHasReportedServiceDispute] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sharedStartPin, setSharedStartPin] = useState("");
  const [carePopup, setCarePopup] = useState<{ title: string; body: string } | null>(null);
  const [blockState, setBlockState] = useState<"none" | "blocked_by_me" | "blocked_by_them">("none");
  const [confirmBlockOpen, setConfirmBlockOpen] = useState(false);
  const [confirmWithdrawRequestOpen, setConfirmWithdrawRequestOpen] = useState(false);
  const [confirmHandoffOpen, setConfirmHandoffOpen] = useState(false);
  const [careHistoryOpen, setCareHistoryOpen] = useState(false);
  const [careHistoryLoading, setCareHistoryLoading] = useState(false);
  const [careHistoryRows, setCareHistoryRows] = useState<ServiceChatRow[]>([]);
  const [careHistoryManuallyHidden, setCareHistoryManuallyHidden] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(true);
  const [providerProfileOpen, setProviderProfileOpen] = useState(false);
  const [providerProfile, setProviderProfile] = useState<NativeServiceProvider | null>(null);
  const [providerProfileLoading, setProviderProfileLoading] = useState(false);
  const [providerProfileError, setProviderProfileError] = useState("");
  const [profileSheetUserId, setProfileSheetUserId] = useState<string | null>(null);
  const providerDragY = useRef(new Animated.Value(0)).current;
  const providerDragStyle = useMemo(() => ({ transform: [{ translateY: providerDragY }] }), [providerDragY]);
  const [petModalOpen, setPetModalOpen] = useState(false);
  const [petModalLoading, setPetModalLoading] = useState(false);
  const [petModalPet, setPetModalPet] = useState<NativePetDetailsData | null>(null);
  const [currentDisplayName, setCurrentDisplayName] = useState("");
  const [currentUserCountry, setCurrentUserCountry] = useState<string | null>(null);
  const autoOpenedRequestRef = useRef<string | null>(null);
  const paymentReturnConfirmRef = useRef<string | null>(null);
  const activeRoomRef = useRef(roomId);
  const activeSessionKeyRef = useRef(sessionKey || null);
  const loadSeqRef = useRef(0);
  const realtimeCareRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    console.warn("[native.service_chat.runtime] screen_mounted", {
      probe: "payment-ui-v3",
      hasRoomId: Boolean(roomId),
      hasUserId: Boolean(userId),
    });
  }, [roomId, userId]);

  useEffect(() => {
    if (!initialCounterpart) return;
    setCounterpart((current) => current?.id ? current : initialCounterpart);
  }, [initialCounterpart]);

  useEffect(() => {
    activeRoomRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    activeSessionKeyRef.current = sessionKey || null;
  }, [sessionKey]);

  useEffect(() => {
    let cancelled = false;
    setCareHistoryManuallyHidden(false);
    if (!userId || !serviceChat?.id) return () => { cancelled = true; };
    void AsyncStorage.getItem(serviceHistoryHiddenKey(userId, serviceChat.id))
      .then((value) => {
        if (!cancelled) setCareHistoryManuallyHidden(value === "1");
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [serviceChat?.id, userId]);

  useEffect(() => {
    let cancelled = false;
    setSharedStartPin("");
    if (!userId || !roomId) return () => { cancelled = true; };
    void readCachedStartPin(userId, roomId).then((pin) => {
      if (!cancelled) setSharedStartPin(pin);
    });
    return () => { cancelled = true; };
  }, [roomId, userId]);

  const isCurrentServiceChatRequest = useCallback((targetRoomId: string | null | undefined, requestSessionKey: string | null | undefined) => (
    Boolean(targetRoomId) && activeRoomRef.current === targetRoomId && (activeSessionKeyRef.current || null) === (requestSessionKey || null)
  ), []);

  const role: ServiceRole | null = useMemo(() => {
    if (!serviceChat || !userId) return null;
    if (serviceChat.requester_id === userId) return "requester";
    if (serviceChat.provider_id === userId) return "provider";
    return null;
  }, [serviceChat, userId]);
  const status = (serviceChat?.status || "pending") as ServiceStatus;
  const isRequester = role === "requester";
  const isProvider = role === "provider";
  const hasRequest = Boolean(serviceChat?.request_card);
  const hasQuote = Boolean(serviceChat?.quote_card);
  const providerStripeReady = Boolean(counterpart?.stripePayoutStatus === "complete" && counterpart?.stripeAccountId);
  const careStatus = serviceChat?.care_status || null;
  const messageDisputeState = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const kind = parseServiceMessage(messages[index]?.content || "").kind;
      if (kind === "service_dispute_resolved" || kind === "service_completed") return "resolved";
      if (kind === "service_disputed" || kind === "service_issue_reported") return "open";
    }
    return "none";
  }, [messages]);
  const disputeResolved = Boolean(isResolvedServiceDisputeStatus(serviceChat?.dispute_status) || messageDisputeState === "resolved");
  const rowHasOpenDisputeSignal = Boolean(status === "disputed" || careStatus === "under_dispute" || careStatus === "handoff_issue_review" || serviceChat?.disputed_at || messageDisputeState === "open");
  const rowResolved = Boolean(disputeResolved || (!rowHasOpenDisputeSignal && (status === "completed" || careStatus === "completed" || serviceChat?.completed_at)));
  const rowUnderReview = Boolean(!disputeResolved && rowHasOpenDisputeSignal);
  const underReview = rowUnderReview;
  const effectiveServiceChat = useMemo<ServiceChatRow | null>(() => {
    if (!serviceChat) return null;
    if (!underReview) return serviceChat;
    return {
      ...serviceChat,
      status: "disputed",
      care_status: "under_dispute",
      disputed_at: serviceChat.disputed_at || new Date().toISOString(),
    };
  }, [serviceChat, underReview]);
  const displayStatus = underReview ? "disputed" : rowResolved ? "completed" : status;
  const peerName = counterpart?.displayName || params.name || "Care chat";
  const peerAvatar = counterpart?.avatarUrl || resolveNativeAvatarUrl(params.avatar) || params.avatar || null;
  const skillsLabel = counterpart?.skills?.length ? counterpart.skills.slice(0, 3).join(" / ") : params.skills.length ? params.skills.slice(0, 3).join(" / ") : "Pet Carer";
  const noMessagesYet = messages.length === 0;
  const canLeaveReview = Boolean(!underReview && status === "completed" && (isRequester || isProvider) && !hasReviewed);
  const showReviewComposerCta = canLeaveReview;
  const canShowComposer = Boolean(hasRequest && !showReviewComposerCta && (status !== "completed" || underReview));
  const canBookCareFromMenu = Boolean(!underReview && isRequester && !canShowComposer);
  const visibleNotice = underReview ? SERVICE_UNDER_REVIEW_NOTICE : notice;
  const canReportBookingIssue = Boolean(!hasReportedServiceDispute && serviceChat && (isRequester || isProvider) && ["awaiting_handoff", "pin_shared", "in_progress", "completed", "under_dispute", "handoff_issue_review"].includes(careStatus || "") && status !== "pending");
  const allCareHistoryRows = useMemo(() => {
    const byId = new Map<string, ServiceChatRow>();
    if (effectiveServiceChat) byId.set(effectiveServiceChat.id, effectiveServiceChat);
    for (const row of careHistoryRows) byId.set(row.id, row);
    return Array.from(byId.values()).filter(isServiceChatHistoryMenuEligible);
  }, [careHistoryRows, effectiveServiceChat]);
  const canOpenCareHistory = Boolean(serviceChat && (isRequester || isProvider));
  const canHideCurrentCareHistory = Boolean(effectiveServiceChat && isServiceChatHistoryMenuEligible(effectiveServiceChat));
  const careHistoryAutoHidden = Boolean(effectiveServiceChat && isServiceChatAutoHiddenInHistory(effectiveServiceChat, isProvider));
  const careHistoryHiddenFromChat = Boolean((canHideCurrentCareHistory && careHistoryManuallyHidden) || careHistoryAutoHidden);
  const serviceMidpointAt = useMemo(() => getServiceMidpointAt(serviceChat), [serviceChat]);
  const providerImageAfterMidpoint = useMemo(() => {
    if (!serviceMidpointAt || !serviceChat?.provider_id) return false;
    return messages.some((message) => {
      if (message.sender_id !== serviceChat.provider_id) return false;
      const createdAt = Date.parse(message.created_at || "");
      if (!Number.isFinite(createdAt) || createdAt < serviceMidpointAt) return false;
      return parseServiceMessage(message.content).attachments.some((attachment) => clean(attachment.url) && String(attachment.mime || "").toLowerCase().startsWith("image/"));
    });
  }, [messages, serviceChat?.provider_id, serviceMidpointAt]);
  const showMidCareUpdatePrompt = Boolean(!underReview && isProvider && shouldShowMidCarePrompt(serviceChat, providerImageAfterMidpoint));
  useEffect(() => {
    if (!underReview) return;
    setActiveSheet(null);
    setCarePopup(null);
    setConfirmHandoffOpen(false);
    setConfirmBlockOpen(false);
    setConfirmWithdrawRequestOpen(false);
    setMenuOpen(false);
    setReportOpen(false);
    setProviderProfileOpen(false);
  }, [underReview]);
  useEffect(() => {
    if (!showMidCareUpdatePrompt || !roomId || !userId || midCareReminderNotifyRef.current) return;
    midCareReminderNotifyRef.current = true;
    const cacheKey = serviceMidCareReminderNotificationKey(userId, roomId);
    void AsyncStorage.getItem(cacheKey)
      .then(async (value) => {
        if (value === "sent") return;
        const { error } = await supabase.rpc("notify_service_midcare_photo_reminder", { p_chat_id: roomId });
        if (error) throw error;
        await AsyncStorage.setItem(cacheKey, "sent");
      })
      .catch((error) => {
        midCareReminderNotifyRef.current = false;
        console.warn("[native.service_midcare_reminder] notification_failed", {
          message: error instanceof Error ? error.message : "unknown",
        });
      });
  }, [roomId, showMidCareUpdatePrompt, userId]);
  const messageStartPin = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const parsed = parseServiceMessage(messages[index]?.content || "");
      if (parsed.kind === "service_pin_shared" && parsed.pin) return parsed.pin;
    }
    return "";
  }, [messages]);
  const activeStartPin = messageStartPin || sharedStartPin;
  useEffect(() => {
    if (!messageStartPin || !roomId || !userId) return;
    setSharedStartPin(messageStartPin);
    void writeCachedStartPin(userId, roomId, messageStartPin);
  }, [messageStartPin, roomId, userId]);
  const requesterEditableRequestCard = useMemo(
    () => requestCardWithCareScopeUpdates(serviceChat?.request_card, serviceChat?.quote_card),
    [serviceChat?.quote_card, serviceChat?.request_card],
  );
  const canConfirmCompletion = useMemo(() => {
    if (underReview) return false;
    if (!serviceChat || !role) return false;
    if (!isCareOfficiallyStarted(serviceChat)) return false;
    if (role === "requester" && serviceChat.requester_mark_finished) return false;
    if (role === "provider" && serviceChat.provider_mark_finished) return false;
    return serviceChat.care_status === "in_progress" || serviceChat.status === "in_progress";
  }, [role, serviceChat, underReview]);
  const completionCtaLabel = "Session Completed";
  const canOpenPeerCarerProfile = Boolean(serviceChat?.provider_id && counterpart?.id === serviceChat.provider_id);
  const canOpenPeerPublicProfile = Boolean(counterpart?.id && counterpart.id !== serviceChat?.provider_id);

  const hideCurrentCareHistory = useCallback(() => {
    if (!userId || !effectiveServiceChat?.id || !canHideCurrentCareHistory) return;
    setCareHistoryManuallyHidden(true);
    void AsyncStorage.setItem(serviceHistoryHiddenKey(userId, effectiveServiceChat.id), "1").catch(() => undefined);
  }, [canHideCurrentCareHistory, effectiveServiceChat?.id, userId]);

  const loadCareHistoryRows = useCallback(async () => {
    if (!serviceChat || !userId) {
      setCareHistoryRows([]);
      return;
    }
    setCareHistoryLoading(true);
    try {
      const { data: historyRowData, error: historyRowError } = await supabase
        .from("service_chats")
        .select("id,chat_id,requester_id,provider_id,status,care_status,booking_snapshot,request_card,quote_card,request_sent_at,quote_sent_at,booked_at,in_progress_at,pin_shared_at,checkin_submitted_at,checkin_photo_url,completed_at,disputed_at,payout_released_at,requester_mark_finished,provider_mark_finished")
        .eq("requester_id", serviceChat.requester_id)
        .eq("provider_id", serviceChat.provider_id)
        .or("completed_at.not.is.null,status.eq.completed,care_status.eq.completed,disputed_at.not.is.null")
        .order("completed_at", { ascending: false, nullsFirst: false })
        .limit(20);
      if (historyRowError) throw historyRowError;
      const rawHistoryRows = (Array.isArray(historyRowData) ? historyRowData : []) as unknown as ServiceChatRow[];
      const historyIds = rawHistoryRows.map((item) => item.id).filter(Boolean);
      const { data: historyDisputeRows, error: historyDisputeError } = historyIds.length > 0
        ? await supabase
          .from("service_disputes")
          .select("service_chat_id,status,final_provider_receives_amount,final_customer_refund_amount,executed_at,decision_at,updated_at")
          .in("service_chat_id", historyIds)
          .order("updated_at", { ascending: false })
        : { data: [], error: null };
      if (historyDisputeError) throw historyDisputeError;
      const disputeByServiceChatId = new Map<string, unknown>();
      for (const dispute of Array.isArray(historyDisputeRows) ? historyDisputeRows : []) {
        const serviceChatId = clean((dispute as { service_chat_id?: unknown }).service_chat_id);
        if (serviceChatId && !disputeByServiceChatId.has(serviceChatId)) disputeByServiceChatId.set(serviceChatId, dispute);
      }
      setCareHistoryRows(rawHistoryRows.map((item) => attachServiceDisputeResolution(item, disputeByServiceChatId.get(item.id) || null)));
    } catch (error) {
      console.warn("[native.service_history] load_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      setCareHistoryRows([]);
    } finally {
      setCareHistoryLoading(false);
    }
  }, [serviceChat, userId]);

  const closeProviderProfile = useCallback(() => {
    providerDragY.setValue(0);
    setProviderProfileOpen(false);
    setProviderProfile(null);
    setProviderProfileLoading(false);
    setProviderProfileError("");
  }, [providerDragY]);

  const providerPullDownResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 8 && Math.abs(gestureState.dx) < 18,
      onPanResponderMove: (_, gestureState) => {
        providerDragY.setValue(Math.max(0, gestureState.dy));
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 120 || gestureState.vy > 0.9) {
          Animated.spring(providerDragY, { toValue: 600, damping: 20, stiffness: 300, useNativeDriver: true }).start(closeProviderProfile);
          return;
        }
        Animated.spring(providerDragY, { toValue: 0, damping: 20, stiffness: 300, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(providerDragY, { toValue: 0, damping: 20, stiffness: 300, useNativeDriver: true }).start();
      },
    }),
    [closeProviderProfile, providerDragY],
  );

  const load = useCallback(async (silent = false) => {
    if (!roomId || !userId) {
      setLoading(false);
      return;
    }
    const requestRoomId = roomId;
    const requestSessionKey = sessionKey || null;
    const requestSeq = ++loadSeqRef.current;
    if (!silent) {
      setLoading(true);
      const cachedRow = await readCachedServiceChatRow(userId, requestSessionKey, requestRoomId);
      if (cachedRow && isCurrentServiceChatRequest(requestRoomId, requestSessionKey) && requestSeq === loadSeqRef.current) {
        setServiceChat(cachedRow);
      }
    }
    try {
      await supabase.rpc("refresh_service_chat_status", { p_chat_id: requestRoomId });
      if (!isCurrentServiceChatRequest(requestRoomId, requestSessionKey) || requestSeq !== loadSeqRef.current) return;
      const { data: rowData, error: rowError } = await supabase
        .from("service_chats")
        .select("id,chat_id,requester_id,provider_id,status,care_status,booking_snapshot,request_card,quote_card,request_sent_at,quote_sent_at,booked_at,in_progress_at,pin_shared_at,checkin_submitted_at,checkin_photo_url,completed_at,disputed_at,payout_released_at,requester_mark_finished,provider_mark_finished")
        .eq("chat_id", requestRoomId)
        .maybeSingle();
      if (!isCurrentServiceChatRequest(requestRoomId, requestSessionKey) || requestSeq !== loadSeqRef.current) return;
      if (rowError) throw rowError;
      if (!rowData) throw new Error("service_chat_not_found");
      const row = rowData as unknown as ServiceChatRow;
      const { data: disputeRows } = await supabase
        .from("service_disputes")
        .select("status,filed_by,final_provider_receives_amount,final_customer_refund_amount,executed_at,decision_at,updated_at")
        .eq("service_chat_id", row.id)
        .order("updated_at", { ascending: false })
        .limit(10);
      if (!isCurrentServiceChatRequest(requestRoomId, requestSessionKey) || requestSeq !== loadSeqRef.current) return;
      const disputeList = Array.isArray(disputeRows) ? disputeRows : [];
      const latestDisputeRow = disputeList[0] ?? null;
      setHasReportedServiceDispute(disputeList.some((item) => clean((item as { filed_by?: unknown }).filed_by) === userId));
      const resolvedRow = attachServiceDisputeResolution(row, latestDisputeRow);
      setServiceChat(resolvedRow);
      if (resolvedRow.care_status !== "pin_shared") setSharedStartPin("");
      void writeCachedServiceChatRow(userId, requestSessionKey, resolvedRow);
      if (!silent) {
        const cachedMessages = await readCachedNativeChatMessages(userId, requestRoomId, { accessChecked: true, sessionKey: requestSessionKey });
        if (cachedMessages.length > 0 && isCurrentServiceChatRequest(requestRoomId, requestSessionKey) && requestSeq === loadSeqRef.current) {
          setMessages(cachedMessages.map(nativeChatMessageToServiceRow));
        }
      }
      const [{ data: messageRows }, { data: petRows }, { data: reviewRow }, { data: currentProfileRow }] = await Promise.all([
        supabase.from("chat_messages").select("id,sender_id,content,created_at").eq("chat_id", requestRoomId).order("created_at", { ascending: true }).limit(100),
        supabase.from("pets").select("id,owner_id,name,species,breed,gender,neutered_spayed,dob,weight,weight_unit,bio,routine,vet_contact,microchip_id,temperament,vet_visit_records,set_reminder,medications,photo_url,is_active,is_public").eq("owner_id", userId).eq("is_active", true).order("created_at", { ascending: true }),
        resolvedRow.status === "completed" && (resolvedRow.requester_id === userId || resolvedRow.provider_id === userId)
          ? supabase.from("service_reviews").select("id").eq("service_chat_id", row.id).eq("reviewer_id", userId).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("profiles").select("display_name,location_country").eq("id", userId).maybeSingle(),
      ]);
      if (!isCurrentServiceChatRequest(requestRoomId, requestSessionKey) || requestSeq !== loadSeqRef.current) return;
      const nextMessages = ((messageRows || []) as ChatMessageRow[]).filter(Boolean);
      setMessages(nextMessages);
      if (nextMessages.length > 0) {
        void writeCachedNativeChatMessages(userId, requestRoomId, nextMessages.map((message) => serviceRowToNativeChatMessage(message, requestRoomId)), { dbConfirmedAt: Date.now(), sessionKey: requestSessionKey, source: "db" });
      }
      setPets(((petRows || []) as PetOption[]).filter(Boolean));
      setHasReviewed(Boolean((reviewRow as { id?: string } | null)?.id));
      setCurrentDisplayName(clean((currentProfileRow as { display_name?: unknown } | null)?.display_name));
      setCurrentUserCountry(clean((currentProfileRow as { location_country?: unknown } | null)?.location_country) || null);
      const counterpartId = row.requester_id === userId ? row.provider_id : row.requester_id;
      if (counterpartId) {
        const [{ data: publicProfile }, { data: profileRow }, { data: pcpRow }, { data: blockRows }] = await Promise.all([
          supabase.from("profiles_public").select("id,display_name,avatar_url,is_verified").eq("id", counterpartId).maybeSingle(),
          supabase.from("profiles").select("id,display_name,avatar_url,is_verified,verification_status,location_country").eq("id", counterpartId).maybeSingle(),
          supabase.from("pet_care_profiles").select("stripe_payout_status,stripe_account_id,skills,rates,services_offered,location_styles,area_name,currency").eq("user_id", row.provider_id).maybeSingle(),
          supabase.from("user_blocks").select("blocker_id,blocked_id").or(`and(blocker_id.eq.${userId},blocked_id.eq.${counterpartId}),and(blocker_id.eq.${counterpartId},blocked_id.eq.${userId})`).limit(1),
        ]);
        const merged = ({ ...(publicProfile || {}), ...(profileRow || {}) }) as Record<string, unknown>;
        const blockRelation = Array.isArray(blockRows) && blockRows.length > 0 ? blockRows[0] as Record<string, unknown> : null;
        if (blockRelation?.blocker_id === userId && blockRelation?.blocked_id === counterpartId) setBlockState("blocked_by_me");
        else if (blockRelation?.blocker_id === counterpartId && blockRelation?.blocked_id === userId) setBlockState("blocked_by_them");
        else setBlockState("none");
        setCounterpart({
          id: counterpartId,
          displayName: clean(merged.display_name) || "Care chat",
          avatarUrl: resolveNativeAvatarUrl(merged.avatar_url),
          stripePayoutStatus: clean((pcpRow as Record<string, unknown> | null)?.stripe_payout_status) || null,
          stripeAccountId: clean((pcpRow as Record<string, unknown> | null)?.stripe_account_id) || null,
          skills: normalizeServiceSkillLabels((pcpRow as Record<string, unknown> | null)?.skills),
          providerServices: parseProviderRateServices((pcpRow as Record<string, unknown> | null)?.rates, (pcpRow as Record<string, unknown> | null)?.services_offered),
          providerLocationStyles: Array.isArray((pcpRow as Record<string, unknown> | null)?.location_styles) ? ((pcpRow as Record<string, unknown>).location_styles as string[]).map(clean).filter(Boolean) : [],
          providerAreaName: clean((pcpRow as Record<string, unknown> | null)?.area_name),
          providerCurrency: clean((pcpRow as Record<string, unknown> | null)?.currency),
          providerCountry: clean(merged.location_country) || null,
        });
      }
    } catch (error) {
      const raw = String((error as { message?: unknown })?.message || "").toLowerCase();
      let providerId = clean(params.providerId || params.peerId);
      if (!providerId && roomId && userId) {
        const { data: memberRows } = await supabase
          .from("chat_room_members")
          .select("user_id")
          .eq("chat_id", requestRoomId)
          .neq("user_id", userId)
          .limit(1);
        providerId = clean(Array.isArray(memberRows) ? memberRows[0]?.user_id : "");
      }
      if (raw.includes("service_chat_not_found") && providerId && providerId !== userId && accessToken) {
        try {
          const nextChatId = await createNativeServiceChat(providerId, accessToken);
          onNavigate(`/service-chat?room=${encodeURIComponent(nextChatId)}&request=1&returnTo=${encodeURIComponent(params.returnTo || "/chats?tab=service")}`);
          return;
        } catch {
          // Fall through to the public-safe popup below.
        }
      }
      setCarePopup({ title: "Huddle Care", body: SERVICE_CHAT_START_ERROR_COPY });
    } finally {
      if (!silent && isCurrentServiceChatRequest(requestRoomId, requestSessionKey) && requestSeq === loadSeqRef.current) setLoading(false);
    }
  }, [accessToken, isCurrentServiceChatRequest, onNavigate, params.peerId, params.providerId, params.returnTo, roomId, sessionKey, userId]);

  const scheduleRealtimeCareRefresh = useCallback((targetRoomId: string, targetSessionKey: string | null, reason: string) => {
    if (!userId || !isCurrentServiceChatRequest(targetRoomId, targetSessionKey)) return;
    if (realtimeCareRefreshTimerRef.current) return;
    realtimeCareRefreshTimerRef.current = setTimeout(() => {
      realtimeCareRefreshTimerRef.current = null;
      if (!isCurrentServiceChatRequest(targetRoomId, targetSessionKey)) return;
      if (__DEV__) console.debug("[native.service_chat] realtime_refresh", { reason, roomId: targetRoomId });
      void invalidateNativeChatReadCaches(userId);
      void clearCachedServiceChatRow(userId, targetSessionKey, targetRoomId);
      void load(true);
    }, 250);
  }, [isCurrentServiceChatRequest, load, userId]);

  useEffect(() => () => {
    if (realtimeCareRefreshTimerRef.current) {
      clearTimeout(realtimeCareRefreshTimerRef.current);
      realtimeCareRefreshTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const confirmServicePayment = useCallback(async (checkoutSessionId: string, source: string) => {
    if (!roomId || !accessToken || !userId || !checkoutSessionId) return false;
    const { data, error } = await withTimeout(supabase.functions.invoke("confirm-service-payment", {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        service_chat_id: roomId,
        checkout_session_id: checkoutSessionId,
      },
    }), SERVICE_PAYMENT_TIMEOUT_MS, "confirm_service_payment_timeout");
    if (error) throw error;
    if ((data as { ok?: boolean } | null)?.ok !== true) {
      const responseError = clean((data as { error?: unknown } | null)?.error) || "payment_not_confirmed";
      throw new Error(responseError);
    }
    console.warn("[native.service_payment.runtime] payment_confirmed", {
      source,
      hasCheckoutSessionId: Boolean(checkoutSessionId),
    });
    await AsyncStorage.removeItem(pendingServicePaymentKey(userId, roomId)).catch(() => undefined);
    setNotice("Payment confirmed. Booking is ready for handoff.");
    await load(true);
    return true;
  }, [accessToken, load, roomId, userId]);

  const confirmPendingServicePayment = useCallback(async (source: string) => {
    if (!roomId || !userId) return false;
    const raw = await AsyncStorage.getItem(pendingServicePaymentKey(userId, roomId)).catch(() => null);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as { checkoutSessionId?: unknown; savedAt?: unknown };
      const checkoutSessionId = clean(parsed.checkoutSessionId);
      if (!checkoutSessionId) {
        await AsyncStorage.removeItem(pendingServicePaymentKey(userId, roomId)).catch(() => undefined);
        return false;
      }
      return await confirmServicePayment(checkoutSessionId, source);
    } catch (error) {
      console.warn("[native.service_payment] pending_confirm_failed", {
        source,
        message: error instanceof Error ? error.message : "unknown",
      });
      await load(true);
      return false;
    }
  }, [confirmServicePayment, load, roomId, userId]);

  useEffect(() => {
    if (!roomId || !accessToken || params.paid !== "1") return;
    const checkoutSessionId = params.checkoutSessionId;
    if (!checkoutSessionId) {
      void load(true);
      return;
    }
    const confirmKey = `${roomId}:${checkoutSessionId}`;
    if (paymentReturnConfirmRef.current === confirmKey) return;
    paymentReturnConfirmRef.current = confirmKey;
    setNotice("Confirming payment...");
    void (async () => {
      try {
        await confirmServicePayment(checkoutSessionId, "return_url");
      } catch (error) {
        haptic.error();
        setCarePopup({
          title: "Huddle Care",
          body: safePaymentErrorMessage(error, "Payment completed, but Huddle could not confirm the booking yet. Please reopen this chat in a moment."),
        });
        await load(true);
      }
    })();
  }, [accessToken, confirmServicePayment, load, params.checkoutSessionId, params.paid, roomId]);

  useEffect(() => {
    if (status !== "pending" && roomId && userId) {
      void AsyncStorage.removeItem(pendingServicePaymentKey(userId, roomId)).catch(() => undefined);
    }
  }, [roomId, status, userId]);

  useEffect(() => {
    if (!roomId || !userId || !accessToken) return;
    void confirmPendingServicePayment("mount");
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void confirmPendingServicePayment("foreground");
        void load(true);
      }
    });
    return () => {
      subscription.remove();
    };
  }, [accessToken, confirmPendingServicePayment, load, roomId, userId]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
      requestAnimationFrame(() => {
        if (nearBottomRef.current) scrollRef.current?.scrollToEnd({ animated: true });
      });
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!roomId || !userId) return;
    const subscriptionRoomId = roomId;
    const subscriptionSessionKey = sessionKey || null;
    const isCurrentRealtimeSubscription = () => isCurrentServiceChatRequest(subscriptionRoomId, subscriptionSessionKey);
    const messageHandle = createSingleRealtimeChannel(
      `native-service-chat-messages:${subscriptionRoomId}`,
      (channel) => channel.on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `chat_id=eq.${subscriptionRoomId}` }, (payload) => {
          if (!isCurrentRealtimeSubscription()) return;
          if (payload.eventType !== "INSERT") {
            void clearCachedNativeChatMessages(userId, subscriptionRoomId, { sessionKey: subscriptionSessionKey });
            scheduleRealtimeCareRefresh(subscriptionRoomId, subscriptionSessionKey, "message_mutation");
            return;
          }
          const row = payload.new as { id?: string; chat_id?: string; sender_id?: string; content?: string; created_at?: string } | null;
          if (!row?.id || row.chat_id !== subscriptionRoomId) return;
          const mapped: ChatMessageRow = {
            id: row.id,
            sender_id: String(row.sender_id || ""),
            content: String(row.content || ""),
            created_at: String(row.created_at || ""),
          };
          const kind = parseServiceMessage(mapped.content).kind;
          if (kind === "service_dispute_resolved" || kind === "service_completed") {
            void invalidateNativeChatReadCaches(userId);
            void clearCachedServiceChatRow(userId, subscriptionSessionKey, subscriptionRoomId);
            void clearCachedNativeChatMessages(userId, subscriptionRoomId, { sessionKey: subscriptionSessionKey });
            setServiceChat((current) => current ? {
              ...current,
              status: "completed",
              care_status: "completed",
              completed_at: current.completed_at || new Date().toISOString(),
            } : current);
            scheduleRealtimeCareRefresh(subscriptionRoomId, subscriptionSessionKey, kind);
          } else if (kind === "service_disputed" || kind === "service_issue_reported") {
            void invalidateNativeChatReadCaches(userId);
            void clearCachedServiceChatRow(userId, subscriptionSessionKey, subscriptionRoomId);
            void clearCachedNativeChatMessages(userId, subscriptionRoomId, { sessionKey: subscriptionSessionKey });
            setHasReportedServiceDispute((current) => current || mapped.sender_id === userId);
            setServiceChat((current) => current ? {
              ...current,
              status: "disputed",
              care_status: "under_dispute",
              disputed_at: current.disputed_at || new Date().toISOString(),
            } : current);
            scheduleRealtimeCareRefresh(subscriptionRoomId, subscriptionSessionKey, kind);
          }
          setMessages((current) => {
            if (!isCurrentRealtimeSubscription() || current.some((message) => message.id === mapped.id)) return current;
            const next = mergeServiceMessageRows(current, [mapped]);
            void writeCachedNativeChatMessages(userId, subscriptionRoomId, next.map((message) => serviceRowToNativeChatMessage(message, subscriptionRoomId)), { dbConfirmedAt: Date.now(), sessionKey: subscriptionSessionKey, source: "realtime" });
            if (nearBottomRef.current) {
              setTimeout(() => {
                if (isCurrentRealtimeSubscription()) scrollRef.current?.scrollToEnd({ animated: true });
              }, 80);
            }
            return next;
          });
        }),
      (status, error) => {
        if (__DEV__) console.debug("[native.service_chat] realtime_messages_status", { status, roomId: subscriptionRoomId, error: error ? String(error) : null });
      },
    );
    return () => {
      void messageHandle.dispose();
    };
  }, [isCurrentServiceChatRequest, roomId, scheduleRealtimeCareRefresh, sessionKey, userId]);

  useEffect(() => {
    if (!roomId || !userId) return;
    const subscriptionRoomId = roomId;
    const subscriptionSessionKey = sessionKey || null;
    const isCurrentRealtimeSubscription = () => isCurrentServiceChatRequest(subscriptionRoomId, subscriptionSessionKey);
    const stateHandle = createSingleRealtimeChannel(
      `native-service-chat-state:${subscriptionRoomId}`,
      (channel) => channel.on("postgres_changes", { event: "*", schema: "public", table: "service_chats", filter: `chat_id=eq.${subscriptionRoomId}` }, () => {
        if (isCurrentRealtimeSubscription()) {
          scheduleRealtimeCareRefresh(subscriptionRoomId, subscriptionSessionKey, "service_chats");
        }
      }),
      (status, error) => {
        if (__DEV__) console.debug("[native.service_chat] realtime_state_status", { status, roomId: subscriptionRoomId, error: error ? String(error) : null });
      },
    );
    return () => {
      void stateHandle.dispose();
    };
  }, [isCurrentServiceChatRequest, roomId, scheduleRealtimeCareRefresh, sessionKey, userId]);

  useEffect(() => {
    if (!roomId || !userId || !serviceChat?.id) return;
    const subscriptionRoomId = roomId;
    const subscriptionSessionKey = sessionKey || null;
    const subscriptionServiceChatId = serviceChat.id;
    const isCurrentRealtimeSubscription = () => isCurrentServiceChatRequest(subscriptionRoomId, subscriptionSessionKey);
    const disputesHandle = createSingleRealtimeChannel(
      `native-service-chat-disputes:${subscriptionServiceChatId}`,
      (channel) => channel.on("postgres_changes", { event: "*", schema: "public", table: "service_disputes", filter: `service_chat_id=eq.${subscriptionServiceChatId}` }, () => {
        if (isCurrentRealtimeSubscription()) {
          void clearCachedNativeChatMessages(userId, subscriptionRoomId, { sessionKey: subscriptionSessionKey });
          scheduleRealtimeCareRefresh(subscriptionRoomId, subscriptionSessionKey, "service_disputes");
        }
      }),
      (status, error) => {
        if (__DEV__) console.debug("[native.service_chat] realtime_disputes_status", { status, roomId: subscriptionRoomId, serviceChatId: subscriptionServiceChatId, error: error ? String(error) : null });
      },
    );
    return () => {
      void disputesHandle.dispose();
    };
  }, [isCurrentServiceChatRequest, roomId, scheduleRealtimeCareRefresh, serviceChat?.id, sessionKey, userId]);

  useEffect(() => {
    if (!roomId || !userId || !serviceChat?.id) return;
    const subscriptionRoomId = roomId;
    const subscriptionSessionKey = sessionKey || null;
    const subscriptionServiceChatId = serviceChat.id;
    const isCurrentRealtimeSubscription = () => isCurrentServiceChatRequest(subscriptionRoomId, subscriptionSessionKey);
    const careEventsHandle = createSingleRealtimeChannel(
      `native-service-chat-care-events:${subscriptionServiceChatId}`,
      (channel) => channel.on("postgres_changes", { event: "*", schema: "public", table: "service_care_events", filter: `service_chat_id=eq.${subscriptionServiceChatId}` }, () => {
        if (isCurrentRealtimeSubscription()) {
          scheduleRealtimeCareRefresh(subscriptionRoomId, subscriptionSessionKey, "service_care_events");
        }
      }),
      (status, error) => {
        if (__DEV__) console.debug("[native.service_chat] realtime_care_events_status", { status, roomId: subscriptionRoomId, serviceChatId: subscriptionServiceChatId, error: error ? String(error) : null });
      },
    );
    return () => {
      void careEventsHandle.dispose();
    };
  }, [isCurrentServiceChatRequest, roomId, scheduleRealtimeCareRefresh, serviceChat?.id, sessionKey, userId]);

  useEffect(() => {
    if (!serviceChat || !isRequester || hasRequest) return;
    if (params.request !== "1" && autoOpenedRequestRef.current === roomId) return;
    autoOpenedRequestRef.current = roomId;
    setActiveSheet("request");
  }, [hasRequest, isRequester, params.request, roomId, serviceChat]);

  const rpcVoid = useCallback(async (fn: string, paramsPayload: Record<string, unknown>, fallback: string) => {
    setSending(true);
    try {
      const { error } = await supabase.rpc(fn, paramsPayload);
      if (error) throw error;
      await load(true);
    } catch (error) {
      setCarePopup({ title: "Huddle Care", body: safeCareErrorMessage(error, fallback) });
      throw error;
    } finally {
      setSending(false);
    }
  }, [load]);

  const sendRequest = useCallback((card: ServiceRequestCard) => {
    haptic.primaryConfirm();
    return rpcVoid("send_service_request", { p_chat_id: roomId, p_request_card: card }, "Unable to send request.");
  }, [roomId, rpcVoid]);
  const sendQuote = useCallback((card: ServiceQuoteCard) => {
    haptic.primaryConfirm();
    return rpcVoid("send_service_quote", { p_chat_id: roomId, p_quote_card: card }, "Unable to send care scope.");
  }, [roomId, rpcVoid]);
  const withdrawRequest = useCallback(() => {
    haptic.destructive();
    return rpcVoid("withdraw_service_request", { p_chat_id: roomId }, "Unable to withdraw request.");
  }, [roomId, rpcVoid]);
  const performShareStartPin = useCallback(async () => {
    if (!roomId) return;
    haptic.primaryConfirm();
    setConfirmHandoffOpen(false);
    setSending(true);
    try {
      const { data, error } = await supabase.rpc("share_service_start_pin", { p_chat_id: roomId, p_requester_confirmed: true });
      if (error) throw error;
      const pin = sanitizeStartPin((data as { pin?: unknown } | null)?.pin);
      if (pin && userId) {
        setSharedStartPin(pin);
        void writeCachedStartPin(userId, roomId, pin);
      }
      setNotice(null);
      await load(true);
    } catch (error) {
      haptic.error();
      setCarePopup({ title: "Huddle Care", body: safeCareErrorMessage(error, "Unable to share Start PIN.") });
    } finally {
      setSending(false);
    }
  }, [load, roomId, userId]);
  const shareStartPin = useCallback(() => {
    setConfirmHandoffOpen(true);
  }, []);
  const submitCompletion = useCallback(async (note: string, providerChecks?: { confirmedCompleted: boolean; noUnresolvedSafetyConcerns: boolean; understandsReview: boolean }, requesterChecks?: { confirmedCompleted: boolean; understandsPayoutReview: boolean }) => {
    if (!roomId || !serviceChat) return;
    if (!isCareOfficiallyStarted(serviceChat)) {
      setCarePopup({ title: "Huddle Care", body: "Completion is available after the provider has started care with a valid PIN check-in." });
      return;
    }
    setSending(true);
    try {
      if (isProvider) {
        const { error } = await supabase.rpc("submit_provider_completion", {
          p_chat_id: roomId,
          p_confirmed_completed: providerChecks?.confirmedCompleted === true,
          p_no_unresolved_safety_concerns: providerChecks?.noUnresolvedSafetyConcerns === true,
          p_understands_review: providerChecks?.understandsReview === true,
          p_photo_url: null,
          p_note: note.trim() || null,
        });
        if (error) throw error;
      } else if (isRequester) {
        const { error } = await supabase.rpc("submit_requester_completion", {
          p_chat_id: roomId,
          p_confirmed_completed: requesterChecks?.confirmedCompleted === true,
          p_understands_payout_review: requesterChecks?.understandsPayoutReview === true,
          p_note: note.trim() || null,
        });
        if (error) throw error;
      }
      await supabase.rpc("complete_service_if_both_confirmed", { p_chat_id: roomId });
      haptic.success();
      setActiveSheet(null);
      setNotice(null);
      await load(true);
    } catch (error) {
      haptic.error();
      setCarePopup({ title: "Huddle Care", body: safeCareErrorMessage(error, "Unable to confirm completion.") });
    } finally {
      setSending(false);
    }
  }, [isProvider, isRequester, load, roomId, serviceChat]);
  const submitCheckin = useCallback(async (startPin: string, photoUrl: string) => {
    if (!roomId) return;
    setSending(true);
    try {
      const { error } = await supabase.rpc("submit_service_checkin", {
        p_chat_id: roomId,
        p_photo_url: photoUrl,
        p_provider_confirmed: true,
        p_start_pin: startPin,
      });
      if (error) throw error;
      haptic.success();
      setActiveSheet(null);
      setNotice(null);
      await load(true);
    } catch (error) {
      haptic.error();
      setCarePopup({ title: "Huddle Care", body: safeCareErrorMessage(error, "Unable to start care.") });
    } finally {
      setSending(false);
    }
  }, [load, roomId, serviceChat?.id, sessionKey, userId]);
  const submitIssueReport = useCallback(async (reason: string, note: string, evidenceUrls: string[]) => {
    if (!roomId) return;
    haptic.warning();
    setSending(true);
    try {
      const { error } = await supabase.rpc("submit_service_issue_report", {
        p_chat_id: roomId,
        p_reason: reason,
        p_note: note,
        p_acknowledged_review: true,
        p_evidence_urls: evidenceUrls,
      });
      if (error) throw error;
      setActiveSheet(null);
      setNotice(SERVICE_UNDER_REVIEW_NOTICE);
      setServiceChat((current) => current ? {
        ...current,
        status: "disputed",
        care_status: "under_dispute",
        disputed_at: current.disputed_at || new Date().toISOString(),
      } : current);
      setHasReportedServiceDispute(true);
      if (userId) {
        await invalidateNativeChatReadCaches(userId);
        await clearCachedServiceChatRow(userId, sessionKey || null, roomId);
      }
      await load(true);
    } catch (error) {
      haptic.error();
      setCarePopup({ title: "Huddle Care", body: safeCareErrorMessage(error, "Unable to submit issue report.") });
    } finally {
      setSending(false);
    }
  }, [load, roomId, sessionKey, userId]);
  const submitReview = useCallback(async (rating: number, tags: string[], text: string, mediaUrls: string[], safetyIncidentReported: boolean) => {
    haptic.primaryConfirm();
    await rpcVoid("submit_service_review_v2", {
      p_chat_id: roomId,
      p_media_urls: mediaUrls || [],
      p_rating: rating,
      p_review_text: text.trim(),
      p_safety_incident_reported: safetyIncidentReported,
      p_tags: tags || [],
    }, "Unable to submit review.");
    setHasReviewed(true);
    if (safetyIncidentReported) {
      setHasReportedServiceDispute(true);
      if (userId) await invalidateNativeChatReadCaches(userId);
      setNotice(SERVICE_UNDER_REVIEW_NOTICE);
    } else {
      haptic.success();
    }
  }, [roomId, rpcVoid, userId]);

  const toggleBlock = useCallback(async () => {
    if (!counterpart?.id || !accessToken) return;
    try {
      const fn = blockState === "blocked_by_me" ? "unblock_user" : "block_user";
      const { error } = await nativeExactTokenRpc(fn, { p_blocked_id: counterpart.id }, accessToken);
      if (error) throw error;
      await invalidateNativeBlockCascade({ userId, roomId, clearRoomMessages: blockState !== "blocked_by_me" });
      setBlockState(blockState === "blocked_by_me" ? "none" : "blocked_by_me");
      setConfirmBlockOpen(false);
    } catch {
      setNotice("Unable to update block status right now.");
    }
  }, [accessToken, blockState, counterpart?.id, userId]);

  const openProviderProfile = useCallback(async () => {
    const providerId = serviceChat?.provider_id;
    if (!providerId || !userId) return;
    setMenuOpen(false);
    setProviderProfileOpen(true);
    setProviderProfileLoading(true);
    setProviderProfileError("");
    try {
      const provider = await fetchNativeServiceProviderDetail({ userId, accessToken, sessionKey, providerUserId: providerId, force: true });
      setProviderProfile(provider);
      void incrementNativeServiceProviderView(providerId, userId, accessToken).catch(() => undefined);
    } catch {
      setProviderProfileError("Unable to load provider profile.");
    } finally {
      setProviderProfileLoading(false);
    }
  }, [accessToken, serviceChat?.provider_id, sessionKey, userId]);

  const openPeerProfile = useCallback(() => {
    if (!counterpart?.id) return;
    if (counterpart.id === serviceChat?.provider_id) {
      void openProviderProfile();
      return;
    }
    setProfileSheetUserId(counterpart.id);
  }, [counterpart?.id, openProviderProfile, serviceChat?.provider_id]);

  const openPetProfile = useCallback(async (petOrId: PetOption | string) => {
    const petIdToOpen = typeof petOrId === "string" ? petOrId : petOrId.id;
    if (!petIdToOpen) return;
    setPetModalOpen(true);
    const localPet = typeof petOrId === "string" ? pets.find((item) => item.id === petOrId) : petOrId;
    if (localPet) {
      setPetModalPet(mapPetRow(localPet as Record<string, unknown>));
    } else {
      setPetModalPet(null);
    }
    setPetModalLoading(true);
    try {
      const { data, error } = await supabase
        .from("pets")
        .select("id,owner_id,name,species,breed,gender,neutered_spayed,dob,weight,weight_unit,bio,routine,vet_contact,microchip_id,temperament,vet_visit_records,set_reminder,medications,photo_url,is_active,is_public")
        .eq("id", petIdToOpen)
        .maybeSingle();
      if (error) throw error;
      if (data) setPetModalPet(mapPetRow(data as Record<string, unknown>));
    } catch {
      setNotice("Unable to load pet profile.");
    } finally {
      setPetModalLoading(false);
    }
  }, [pets]);

  const sendMessage = useCallback(async () => {
    const text = composer.trim();
    const attachments = uploads.map((item) => ({ mime: item.mimeType || "image/jpeg", url: item.uploadedUrl || "" })).filter((item) => item.url);
    if (!roomId || !userId || (!text && attachments.length === 0)) return;
    if (uploads.some((item) => item.status !== "uploaded" || !item.uploadedUrl)) {
      setNotice("Wait for images to finish uploading before sending.");
      return;
    }
    setSending(true);
    const previousText = composer;
    const previousUploads = uploads;
    const pendingId = `pending:${roomId}:${Date.now()}`;
    const content = JSON.stringify({ text, attachments });
    const pendingMessage: ChatMessageRow = { id: pendingId, sender_id: userId, content, created_at: new Date().toISOString(), localStatus: "pending" };
    try {
      setComposer("");
      setUploads([]);
      setMessages((current) => [...current, pendingMessage]);
      const { error } = await supabase.from("chat_messages").insert({ chat_id: roomId, sender_id: userId, content });
      if (error) throw error;
      await supabase.from("chats").update({ last_message_at: new Date().toISOString() }).eq("id", roomId);
      await load(true);
    } catch {
      setComposer(previousText);
      setUploads(previousUploads);
      setMessages((current) => current.map((message) => message.id === pendingId ? { ...message, localStatus: "failed" } : message));
      setCarePopup({ title: "Huddle Care", body: "Unable to send message." });
    } finally {
      setSending(false);
    }
  }, [composer, load, roomId, uploads, userId]);

  const pickChatMedia = useCallback(async () => {
    if (!userId || sending || uploads.length >= 10) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      orderedSelection: true,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 0.86,
      selectionLimit: 10 - uploads.length,
    });
    if (result.canceled) return;
    const selected: ServiceChatUpload[] = result.assets.map((asset, index) => ({
      height: asset.height,
      kind: "image",
      mimeType: asset.mimeType || "image/jpeg",
      name: asset.fileName || `care-chat-${Date.now()}-${index}.jpg`,
      progress: 0,
      size: asset.fileSize ?? null,
      status: "queued",
      uri: asset.uri,
      width: asset.width,
    }));
    setUploads((current) => [...current, ...selected].slice(0, 10));
    selected.forEach((item) => {
      setUploads((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, progress: 12, status: "uploading" } : entry));
      void uploadNativeSocialImage(userId, item, "reply", accessToken)
        .then((uploadedUrl) => {
          setUploads((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, progress: 100, status: "uploaded", uploadedUrl } : entry));
        })
        .catch(() => {
          setUploads((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, progress: 0, status: "error" } : entry));
        });
    });
  }, [accessToken, sending, uploads.length, userId]);

  const pay = useCallback(async (bookingSnapshot: CareBookingSnapshot, traceId: string, trace: ServicePaymentTrace) => {
    trace("onPay called", { hasBookingSnapshot: Boolean(bookingSnapshot) });
    const quote = serviceChat?.quote_card;
    const amount = Number(clean(quote?.finalPrice));
    if (!roomId || !quote || !Number.isFinite(amount) || amount <= 0) {
      console.warn("[native.service_payment] blocked_before_function_call", {
        hasRoomId: Boolean(roomId),
        hasQuote: Boolean(quote),
        hasValidAmount: Number.isFinite(amount) && amount > 0,
      });
      trace("blocked before function call", {
        hasRoomId: Boolean(roomId),
        hasQuote: Boolean(quote),
        hasValidAmount: Number.isFinite(amount) && amount > 0,
      });
      return { ok: false, error: PAYMENT_BLOCKERS.missingPaymentDetails };
    }
    setSending(true);
    try {
      trace("create-service-payment request started", {
        hasAuthorization: Boolean(accessToken),
        traceId,
      });
      console.warn("[native.service_payment.runtime] invoke_create_service_payment", {
        hasRoomId: Boolean(roomId),
        hasQuote: Boolean(quote),
        hasBookingSnapshot: Boolean(bookingSnapshot),
      });
      const { data, error } = await withTimeout(supabase.functions.invoke("create-service-payment", {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        body: {
          service_chat_id: roomId,
          booking_snapshot: bookingSnapshot,
          success_url: `https://huddle.pet/service-chat?room=${encodeURIComponent(roomId)}&paid=1&checkout_session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `https://huddle.pet/service-chat?room=${encodeURIComponent(roomId)}&paid=0`,
        },
      }), SERVICE_PAYMENT_TIMEOUT_MS, "create_service_payment_timeout");
      trace("Edge response status/body keys", {
        status: error ? functionErrorStatus(error) || "error" : "ok",
        bodyKeys: bodyKeys(data),
        hasError: Boolean(error),
      });
      if (error) throw error;
      const checkoutUrl = clean((data as { url?: string } | null)?.url);
      const checkoutSessionId = clean((data as { checkoutSessionId?: string } | null)?.checkoutSessionId);
      trace("checkoutUrl present/empty", { hasCheckoutUrl: Boolean(checkoutUrl) });
      if (!checkoutUrl) {
        console.warn("[native.service_payment] checkout_url_missing", {
          hasResponse: Boolean(data),
          hasCheckoutSessionId: Boolean(checkoutSessionId),
        });
        return { ok: false, error: PAYMENT_BLOCKERS.missingCheckoutUrl };
      }
      console.warn("[native.service_payment.runtime] checkout_url_received", {
        hasCheckoutSessionId: Boolean(checkoutSessionId),
      });
      if (checkoutSessionId && userId && roomId) {
        await AsyncStorage.setItem(pendingServicePaymentKey(userId, roomId), JSON.stringify({
          checkoutSessionId,
          roomId,
          savedAt: Date.now(),
        })).catch(() => undefined);
      }
      try {
        let canOpen: boolean | "unavailable" | "error" = "unavailable";
        try {
          canOpen = typeof Linking.canOpenURL === "function" ? await Linking.canOpenURL(checkoutUrl) : "unavailable";
        } catch (canOpenError) {
          canOpen = "error";
          trace("Linking.canOpenURL error", {
            message: canOpenError instanceof Error ? canOpenError.message : "unknown",
          });
        }
        trace("Linking.canOpenURL result", { canOpen });
        if (canOpen === false) return { ok: false, error: PAYMENT_BLOCKERS.unableToOpenCheckout };
        trace("Linking.openURL started");
        await Linking.openURL(checkoutUrl);
        trace("Linking.openURL success");
        return { ok: true, checkoutSessionId };
      } catch (openError) {
        console.warn("[native.service_payment] checkout_open_failed", {
          message: openError instanceof Error ? openError.message : "unknown",
        });
        trace("Linking.openURL failure", {
          message: openError instanceof Error ? openError.message : "unknown",
        });
        return { ok: false, error: PAYMENT_BLOCKERS.unableToOpenCheckout };
      }
    } catch (error) {
      console.warn("[native.service_payment] create_service_payment_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      const message = safePaymentErrorMessage(error, "Unable to start payment.");
      trace("create-service-payment threw", {
        message: error instanceof Error ? error.message : "unknown",
        status: functionErrorStatus(error),
      });
      return { ok: false, error: message };
    } finally {
      setSending(false);
    }
  }, [accessToken, roomId, serviceChat?.quote_card]);

  const actionPrimary = useMemo(() => {
    if (underReview) return null;
    if (!serviceChat) return null;
    if (status === "pending") {
      if (isRequester && !hasRequest) return { label: "Book Care", onPress: () => setActiveSheet("request"), disabled: false };
      if (isProvider && hasRequest && !hasQuote) return { label: "Update Care Scope", onPress: () => setActiveSheet("quote"), disabled: false };
      if (isRequester && hasRequest && hasQuote) return { label: providerStripeReady ? "Accept & pay" : "Provider payout setup required", onPress: () => setActiveSheet("payment"), disabled: !providerStripeReady };
    }
    if (status === "booked") {
      if (isRequester) {
        return null;
      }
      if (isProvider) {
        return { label: "Start Care Session", onPress: () => setActiveSheet("startCare"), disabled: careStatus !== "pin_shared" };
      }
    }
    if (status === "in_progress" || careStatus === "in_progress") {
      if (!canConfirmCompletion) return null;
      return { label: completionCtaLabel, onPress: () => setActiveSheet("completion"), disabled: false };
    }
    if (canLeaveReview) return { label: "Leave a Review", onPress: () => setActiveSheet("review"), disabled: false };
    if (isRequester && status === "completed") return { label: "Book Care", onPress: () => setActiveSheet("request"), disabled: false };
    return null;
  }, [canConfirmCompletion, canLeaveReview, careStatus, completionCtaLabel, hasQuote, hasRequest, isProvider, isRequester, providerStripeReady, sending, serviceChat, shareStartPin, status, underReview]);

  const menuItems = useMemo<AppActionMenuItem[]>(() => {
    const items: AppActionMenuItem[] = [
      { label: "See Carer Profile", icon: "user", onPress: () => { void openProviderProfile(); } },
    ];
    if (canBookCareFromMenu) {
      items.push({ label: "Book Care", icon: "file-text", onPress: () => { setMenuOpen(false); setActiveSheet("request"); } });
    }
    if (canLeaveReview) {
      items.push({ label: "Leave a Review", icon: "star", onPress: () => { setMenuOpen(false); setActiveSheet("review"); } });
    }
    if (canOpenCareHistory) {
      items.push({ label: "Care History", icon: "clock", onPress: () => { setMenuOpen(false); setCareHistoryOpen(true); void loadCareHistoryRows(); } });
    }
    if (canReportBookingIssue) {
      items.push({ label: "Report Issue", icon: "alert-triangle", destructive: true, onPress: () => { setMenuOpen(false); setActiveSheet("issue"); } });
    }
    items.push(
      { label: "Report User", icon: "flag", onPress: () => { setMenuOpen(false); setReportOpen(true); } },
      { label: blockState === "blocked_by_me" ? "Unblock User" : "Block User", icon: "slash", destructive: blockState !== "blocked_by_me", onPress: () => { setMenuOpen(false); setConfirmBlockOpen(true); } },
    );
    return items;
  }, [blockState, canBookCareFromMenu, canLeaveReview, canOpenCareHistory, canReportBookingIssue, loadCareHistoryRows, openProviderProfile]);

  if (loading && !initialCounterpart) {
    return <NativeLoadingState style={styles.loadingFill} />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
      style={[styles.root, { paddingTop: insets.top + huddleSpacing.x2 }]}
    >
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => onNavigate(params.returnTo || "/chats?tab=service")} style={styles.headerBack}>
          <Feather color={huddleColors.text} name="arrow-left" size={20} />
        </Pressable>
        <Pressable
          accessibilityLabel={canOpenPeerCarerProfile ? "Open carer profile" : "Open profile"}
          accessibilityRole="button"
          disabled={!canOpenPeerCarerProfile && !canOpenPeerPublicProfile}
          onPress={openPeerProfile}
          style={({ pressed }) => [styles.peerAvatarButton, pressed ? nativeModalStyles.pressed : null]}
        >
          {peerAvatar ? (
            <ExpoImage cachePolicy="memory-disk" contentFit="contain" transition={150} source={{ uri: peerAvatar }} style={styles.peerAvatar} />
          ) : (
            <Image resizeMode="contain" source={profilePlaceholder} style={styles.peerAvatar} />
          )}
        </Pressable>
        <View style={styles.identityText}>
          <Text numberOfLines={1} style={styles.headerTitle}>{peerName}</Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>{skillsLabel}</Text>
        </View>
        <Text
          style={[
            styles.statusPill,
            displayStatus === "booked" || displayStatus === "in_progress" ? styles.statusBookedActive : null,
            displayStatus === "completed" ? styles.statusCompleted : null,
            displayStatus === "disputed" ? styles.statusDisputed : null,
          ]}
        >
          {STATUS_LABEL[displayStatus]}
        </Text>
        {!underReview || canOpenCareHistory ? (
          <Pressable accessibilityLabel="service-chat-more-button" hitSlop={huddleSpacing.x2} onPress={() => setMenuOpen(true)} style={styles.headerBack}>
            <Feather color={huddleColors.iconMuted} name="more-horizontal" size={20} />
          </Pressable>
        ) : (
          <View style={styles.headerBack} />
        )}
      </View>
      {effectiveServiceChat && !careHistoryHiddenFromChat ? (
        <View style={styles.timelineBannerWrap}>
          <BookingTimelineCard
            chat={effectiveServiceChat}
            collapsed={timelineCollapsed}
            canHide={canHideCurrentCareHistory}
            isProvider={isProvider}
            underReview={underReview}
            onHide={hideCurrentCareHistory}
            onToggle={() => setTimelineCollapsed((value) => !value)}
          />
          <BookingCards
            chat={effectiveServiceChat}
            canHide={canHideCurrentCareHistory}
            isProvider={isProvider}
            isRequester={isRequester}
            sending={sending}
            underReview={underReview}
            onHide={hideCurrentCareHistory}
            onOpenPet={openPetProfile}
            ownerName={isRequester ? currentDisplayName || "Owner" : peerName || "Owner"}
            onEditRequest={() => setActiveSheet("request")}
            onWithdrawRequest={() => setConfirmWithdrawRequestOpen(true)}
            onEditQuote={() => setActiveSheet("quote")}
            providerName={isProvider ? currentDisplayName || "Carer" : peerName || "Carer"}
            startPin={careStatus !== "completed" && status !== "completed" ? activeStartPin : ""}
          />
        </View>
      ) : null}

      {visibleNotice ? <View style={styles.notice}><Feather color={huddleColors.blue} name="info" size={16} /><Text style={styles.noticeText}>{visibleNotice}</Text></View> : null}
      {!underReview && status === "booked" && isRequester && careStatus !== "pin_shared" ? (
        <View style={styles.handoffBanner}>
          <View style={styles.handoffBannerCopy}>
            <View style={styles.handoffBannerTitleRow}>
              <SvgXml color={huddleColors.blue} height={18} width={18} xml={PASSCODE_LOCK_ICON_SVG} />
              <Text style={styles.handoffBannerTitle}>Share PIN Requiried</Text>
            </View>
            <Text style={styles.handoffBannerText}>Send PIN to your provider after handing over your pet or access to the care location.</Text>
          </View>
          <AppModalButton disabled={sending} onPress={() => void shareStartPin()}>Share PIN to Start Care</AppModalButton>
        </View>
      ) : null}
      {!underReview && status === "booked" && isProvider && careStatus !== "pin_shared" ? (
        <View style={styles.handoffBanner}>
          <View style={styles.handoffBannerCopy}>
            <View style={styles.handoffBannerTitleRow}>
              <SvgXml color={huddleColors.blue} height={18} width={18} xml={PASSCODE_LOCK_ICON_SVG} />
              <Text style={styles.handoffBannerTitle}>Start PIN required</Text>
            </View>
            <Text style={styles.handoffBannerText}>Collect the 4-digit PIN from the pet owner at handoff and upload a photo of the pet to begin the session.</Text>
          </View>
        </View>
      ) : null}
      {showMidCareUpdatePrompt ? (
        <View style={styles.handoffBanner}>
          <View style={styles.handoffBannerCopy}>
            <Text style={styles.handoffBannerTitle}>Send a quick update?</Text>
            <Text style={styles.handoffBannerText}>Pet parents love a photo during care.</Text>
          </View>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, keyboardVisible ? styles.contentKeyboard : null]}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (nearBottomRef.current) scrollRef.current?.scrollToEnd({ animated: false });
        }}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          nearBottomRef.current = contentSize.height - contentOffset.y - layoutMeasurement.height <= 120;
        }}
        scrollEventThrottle={80}
        showsVerticalScrollIndicator={false}
        style={styles.messagesScroll}
      >
        {loading ? (
          <NativeLoadingState style={styles.loadingInline} />
        ) : null}

        {!loading && isProvider && !hasRequest ? (
          <View style={styles.waitCard}><Text style={styles.waitText}>Waiting for requester to send a care request.</Text></View>
        ) : !loading && isRequester && !hasRequest && noMessagesYet ? (
          <View style={styles.emptyWrap}>
            <Image resizeMode="contain" source={serviceImage} style={styles.emptyImage} />
            <Text style={styles.emptyText}>Let’s get started. Book care to share details and start chatting with <Text style={styles.emptyName}>{peerName}</Text>.</Text>
          </View>
        ) : !loading && noMessagesYet ? (
          <Text style={styles.noMessagesText}>No messages yet</Text>
        ) : null}

        <View style={styles.messageStack}>
          {messages.map((message, index) => {
            const me = message.sender_id === userId;
            const parsed = parseServiceMessage(message.content);
            const previous = index > 0 ? messages[index - 1] : null;
            const divider = !previous || formatDividerLabel(previous.created_at) !== formatDividerLabel(message.created_at) ? formatDividerLabel(message.created_at) : "";
            if (parsed.kind?.startsWith("service_")) {
              const actorName = message.sender_id === userId ? currentDisplayName || "You" : peerName;
              return <View key={message.id}>{divider ? <Text style={styles.dayDivider}>{divider}</Text> : null}<ServiceSystemPill actorName={actorName} createdAt={message.created_at} isRequester={isRequester} kind={parsed.kind} /></View>;
            }
            const hasAttachments = parsed.attachments.length > 0;
            const hasImageOnlyContent = hasAttachments && !parsed.text;
            return (
              <View key={message.id} style={styles.messageBlock}>
                {divider ? <Text style={styles.dayDivider}>{divider}</Text> : null}
                <View style={[styles.messageRow, me ? styles.messageRowMine : null]}>
                  <View style={[styles.bubble, hasAttachments ? styles.messageBubbleRich : null, hasImageOnlyContent ? styles.messageBubbleMediaOnly : null, me ? styles.bubbleMine : styles.bubbleTheirs]}>
                    {hasAttachments ? <ServiceChatAttachmentCarousel attachments={parsed.attachments} /> : null}
                    {parsed.text ? <Text style={[styles.bubbleText, hasAttachments ? styles.messageTextRich : null, me ? styles.bubbleTextMine : null]}>{parsed.text}</Text> : null}
                  </View>
                </View>
                <View style={[styles.messageMeta, me ? styles.messageMetaMine : null]}>
                  <Text style={styles.messageTime}>{message.localStatus === "pending" ? "Sending" : message.localStatus === "failed" ? "Failed" : formatMessageTime(message.created_at)}</Text>
                  {me && !message.localStatus ? <Text style={styles.readMark}>✓</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View
        style={[
          nativeModalStyles.appModalComposerSurface,
          styles.dialogueComposerSurface,
          { paddingBottom: keyboardVisible ? huddleSpacing.x1 : Math.max(insets.bottom, huddleSpacing.x4) },
        ]}
      >
        {uploads.length > 0 ? (
          <ScrollView bounces={false} directionalLockEnabled horizontal keyboardShouldPersistTaps="handled" nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.uploadRail}>
            {uploads.map((item, index) => (
              <View key={`${item.uri}:${index}`} style={styles.uploadThumb}>
                <Image resizeMode="cover" source={{ uri: item.uri }} style={styles.uploadImage} />
                {item.status === "uploading" ? (
                  <View pointerEvents="none" style={styles.uploadingOverlay}>
                    <ActivityIndicator color={huddleColors.onPrimary} size="small" />
                    <Text style={styles.uploadingText}>{item.progress}%</Text>
                  </View>
                ) : null}
                {item.status === "error" ? (
                  <View pointerEvents="none" style={styles.uploadingOverlay}>
                    <Feather color={huddleColors.onPrimary} name="alert-triangle" size={16} />
                    <Text style={styles.uploadingText}>Upload failed</Text>
                  </View>
                ) : null}
                <Pressable onPress={() => setUploads((current) => current.filter((_, currentIndex) => currentIndex !== index))} style={styles.removeUpload}><Feather color={huddleColors.onPrimary} name="x" size={12} /></Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.actionRow}>
          {actionPrimary && !showReviewComposerCta ? (
            <View style={styles.primaryActionWrap}>
              <AppModalButton disabled={sending || actionPrimary.disabled} onPress={actionPrimary.onPress}>{actionPrimary.label}</AppModalButton>
            </View>
          ) : null}
        </View>
        {showReviewComposerCta ? (
          <View style={styles.completedReviewCtaWrap}>
            <AppModalButton disabled={sending} variant="secondary" onPress={() => setActiveSheet("review")}>Leave a Review</AppModalButton>
          </View>
        ) : null}
        {showReviewComposerCta && isRequester && !canShowComposer ? (
          <View style={styles.completedReviewCtaWrap}>
            <AppModalButton disabled={sending} onPress={() => setActiveSheet("request")}>Book Care</AppModalButton>
          </View>
        ) : null}
        {canShowComposer ? <View style={styles.composerRow}>
          <View style={[nativeModalStyles.appModalComposerTray, composerFocused ? nativeModalStyles.appModalComposerTrayFocused : null]}>
            <Pressable accessibilityLabel={hasRequest ? "Add images" : "Conversation locked"} disabled={!hasRequest || sending} onPress={pickChatMedia} style={styles.attachButton}>
              <Feather color={huddleColors.mutedText} name={hasRequest ? "image" : "lock"} size={16} />
            </Pressable>
            <AppModalField
              accessibilityLabel="native-service-chat-composer-input"
              editable={hasRequest && !sending}
              focused={composerFocused}
              multiline
              onBlur={() => setComposerFocused(false)}
              onChangeText={setComposer}
              onFocus={() => setComposerFocused(true)}
              placeholder={!hasRequest ? "Book care to start conversation" : underReview ? "Keep communication here" : isRequester ? "Ask a question" : ""}
              style={nativeModalStyles.appModalComposerInput}
              testID="native-service-chat-composer-input"
              value={composer}
            />
          </View>
          <Pressable accessibilityLabel="native-service-chat-send-button" disabled={!hasRequest || sending || (!composer.trim() && uploads.length === 0)} onPress={() => void sendMessage()} style={[styles.sendButton, (!hasRequest || sending || (!composer.trim() && uploads.length === 0)) ? huddleButtons.disabled : null]}>
            {sending ? <ActivityIndicator color={huddleColors.onPrimary} size="small" /> : <Feather color={huddleColors.onPrimary} name="send" size={18} />}
          </Pressable>
        </View> : null}
      </View>

      <RequestSheet
        countryLabel={counterpart?.providerCountry}
        initialCard={requesterEditableRequestCard}
        onClose={() => setActiveSheet(null)}
        onSubmit={sendRequest}
        open={activeSheet === "request"}
        pets={pets}
        providerAreaName={counterpart?.providerAreaName}
        providerCurrency={counterpart?.providerCurrency}
        providerLocationStyles={counterpart?.providerLocationStyles}
        providerServices={counterpart?.providerServices}
        submitLabel={serviceChat?.request_sent_at ? "Update" : "Send"}
      />
      <QuoteSheet
        countryLabel={counterpart?.providerCountry}
        initialCard={serviceChat?.quote_card}
        onClose={() => setActiveSheet(null)}
        onOpenPet={(petId) => void openPetProfile(petId)}
        onSubmit={sendQuote}
        open={activeSheet === "quote"}
        requestCard={serviceChat?.request_card || null}
      />
      <PaymentSheet
        open={activeSheet === "payment"}
        onBlocker={(body) => setCarePopup({ title: "Confirm booking", body })}
        onClose={() => setActiveSheet(null)}
        onPay={pay}
        quoteCard={serviceChat?.quote_card || null}
        requestCard={serviceChat?.request_card || null}
        requesterId={serviceChat?.requester_id || ""}
        providerId={serviceChat?.provider_id || ""}
        pets={pets}
        requesterCountry={currentUserCountry}
        requesterIdForPetUpdate={userId}
        sending={sending}
      />
      <StartCareSheet
        accessToken={accessToken}
        currentUserId={userId}
        initialPin={activeStartPin}
        open={activeSheet === "startCare"}
        onClose={() => setActiveSheet(null)}
        onError={(body) => setCarePopup({ title: "Huddle Care", body })}
        onOpenSupport={() => {
          setActiveSheet(null);
          onNavigate("/support");
        }}
        onSubmit={submitCheckin}
        sending={sending}
      />
      <CompletionSheet
        canReportIssue={canReportBookingIssue}
        ctaLabel={completionCtaLabel}
        isProvider={isProvider}
        isRequester={isRequester}
        onClose={() => setActiveSheet(null)}
        onReportIssue={() => {
          setActiveSheet(null);
          setActiveSheet("issue");
        }}
        onSubmit={submitCompletion}
        open={activeSheet === "completion"}
        sending={sending}
      />
      <IssueReportSheet
        accessToken={accessToken}
        currentUserId={userId}
        isRequester={isRequester}
        onClose={() => setActiveSheet(null)}
        onError={(body) => setCarePopup({ title: "Huddle Care", body })}
        onSubmit={submitIssueReport}
        open={activeSheet === "issue"}
        sending={sending}
      />
      <ReviewSheet accessToken={accessToken} currentUserId={userId} hasReportedServiceDispute={hasReportedServiceDispute} isRequester={isRequester} open={activeSheet === "review"} onClose={() => setActiveSheet(null)} onSubmit={submitReview} />
      <CareHistorySheet
        currentUserId={userId}
        loading={careHistoryLoading}
        rows={allCareHistoryRows}
        onClose={() => setCareHistoryOpen(false)}
        onOpenPet={openPetProfile}
        open={careHistoryOpen}
        ownerName={isRequester ? currentDisplayName || "Owner" : peerName || "Owner"}
        providerName={isProvider ? currentDisplayName || "Provider" : peerName || "Provider"}
      />
      <Modal presentationStyle="overFullScreen" transparent visible={menuOpen} animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalMenuSafeArea]} onPress={() => setMenuOpen(false)}>
          <AppActionMenu items={menuItems} />
        </Pressable>
      </Modal>
      <AppDestructiveSlideConfirm
        body={blockState === "blocked_by_me" ? "Allow this user to send you messages again?" : "You will no longer see their posts or alerts, and they won't be able to interact with you directly in Chats."}
        onClose={() => setConfirmBlockOpen(false)}
        onConfirm={() => void toggleBlock()}
        open={confirmBlockOpen}
        slideLabel={`Slide to ${blockState === "blocked_by_me" ? "Unblock" : "Block"}`}
        title={blockState === "blocked_by_me" ? `Unblock ${peerName}?` : `Block ${peerName}?`}
      />
      <AppDestructiveSlideConfirm
        body={`This will cancel your inquiry for ${clean(serviceChat?.request_card?.serviceType) || "care"} with ${peerName}. You can send a new request if your plans change.`}
        onClose={() => setConfirmWithdrawRequestOpen(false)}
        onConfirm={() => {
          setConfirmWithdrawRequestOpen(false);
          void withdrawRequest();
        }}
        open={confirmWithdrawRequestOpen}
        slideLabel="Slide to Withdraw"
        title="Withdraw this request?"
      />
      <AppSlideConfirm
        body="By sharing your PIN, you confirm the handoff of your pet or property. The carer will then use this PIN to begin the care session."
        busy={sending}
        onClose={() => setConfirmHandoffOpen(false)}
        onConfirm={() => void performShareStartPin()}
        open={confirmHandoffOpen}
        slideLabel="Share PIN"
        title="Start Care Session"
      />
      <AppConfirmModal
        body={carePopup?.body || ""}
        cancelLabel={null}
        confirmLabel="OK"
        onCancel={() => setCarePopup(null)}
        onConfirm={() => setCarePopup(null)}
        open={Boolean(carePopup)}
        title={carePopup?.title || "Huddle Care"}
      />
      <NativeSocialReportModal
        currentUserId={userId}
        chatRoomId={roomId || null}
        onClose={() => setReportOpen(false)}
        onNotice={setNotice}
        open={reportOpen}
        source="Chat"
        sourceOrigin="friends chats"
        target={counterpart ? { userId: counterpart.id, author: { displayName: counterpart.displayName, socialId: null, avatarUrl: counterpart.avatarUrl, verificationStatus: null, locationCountry: null, isVerified: false, nonSocial: false } } : null}
      />
      <NativePetDetailsModal
        loading={petModalLoading}
        onClose={() => setPetModalOpen(false)}
        open={petModalOpen}
        pet={petModalPet}
      />
      <NativePublicProfileModal
        accessToken={accessToken ?? null}
        currentUserId={userId}
        hideActions
        hideMatchedActions
        onClose={() => setProfileSheetUserId(null)}
        onNavigate={onNavigate}
        open={Boolean(profileSheetUserId)}
        sessionKey={sessionKey ?? null}
        userId={profileSheetUserId}
      />
      <Modal animationType="slide" presentationStyle="overFullScreen" transparent visible={providerProfileOpen} onRequestClose={closeProviderProfile}>
        <View style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea, styles.profileModalSafeArea, { paddingTop: insets.top + huddleSpacing.x6, paddingBottom: insets.bottom }]}>
          <Pressable accessibilityLabel="Close provider profile" accessibilityRole="button" onPress={closeProviderProfile} style={StyleSheet.absoluteFill} />
          <Animated.View style={[styles.profileModalCard, providerDragStyle]}>
            <View collapsable={false} style={styles.profileModalHeader} {...providerPullDownResponder.panHandlers}>
              <View style={styles.headerCopy}>
                <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={1} style={styles.detailTitle}>Pet Carer Profile</Text>
              </View>
              <View style={styles.headerActions}>
                <AppModalIconButton accessibilityLabel="Close provider profile" onPress={closeProviderProfile}>
                  <Feather color={huddleColors.text} name="x" size={24} />
                </AppModalIconButton>
              </View>
            </View>
            <ScrollView bounces={false} contentContainerStyle={styles.profileModalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.profileModalScroll}>
              {providerProfileError ? <View style={styles.detailState}><Text style={styles.waitText}>{providerProfileError}</Text></View> : providerProfile ? <NativeCarerProfileContent provider={providerProfile} /> : providerProfileLoading ? <View style={styles.detailState}><NativeLoadingState variant="inline" /></View> : null}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function BookingCards({
  canHide = false,
  chat,
  historyContent,
  hideActions = false,
  isProvider,
  isRequester,
  ownerName,
  sending,
  onHide,
  onOpenPet,
  onEditRequest,
  onWithdrawRequest,
  onEditQuote,
  providerName,
  startPin,
  underReview,
}: {
  canHide?: boolean;
  chat: ServiceChatRow;
  historyContent?: ReactNode;
  hideActions?: boolean;
  isProvider: boolean;
  isRequester: boolean;
  ownerName: string;
  sending: boolean;
  onHide?: () => void;
  onOpenPet?: (petId: string) => void;
  onEditRequest: () => void;
  onWithdrawRequest: () => void;
  onEditQuote: () => void;
  providerName: string;
  startPin?: string;
  underReview?: boolean;
}) {
  const [requestExpanded, setRequestExpanded] = useState(false);
  const expanded = requestExpanded;
  const requestCard = chat.request_card;
  const quoteCard = chat.quote_card;
  if (!requestCard && !quoteCard && chat.status !== "disputed") return null;
  const serviceLabel = Array.isArray(requestCard?.serviceTypes) && requestCard?.serviceTypes.length ? requestCard.serviceTypes.join("・") : clean(requestCard?.serviceType) || "—";
  const locationStyles = quoteCard?.locationStyles?.length ? quoteCard.locationStyles : requestCard?.locationStyles || [];
  const locationArea = clean(quoteCard?.locationArea) || clean(requestCard?.locationArea);
  const locationStyleLabel = locationStyles.length ? locationStyles.join(", ") : "";
  const quoteAmount = Number(clean(quoteCard?.finalPrice));
  const quoteCurrency = quoteCard?.currency || requestCard?.suggestedCurrency || "HKD";
  const quoteRate = quoteCard?.rate || requestCard?.suggestedRate || "Per visit";
  const requesterTotal = Number.isFinite(quoteAmount) ? quoteAmount * 1.1 : null;
  const providerPayout = Number.isFinite(quoteAmount) ? quoteAmount * 0.9 : null;
  const scopePets = requestCard ? requestCardPets(requestCard) : [];
  const collapsedShortDate = formatShortDateRange(requestCard?.requestedDates, requestCard?.requestedDate);
  const collapsedWhereLine = [collapsedShortDate || null, locationArea || null].filter(Boolean).join(" · ");
  const pinDigits = sanitizeStartPin(startPin).split("");
  return (
    <View>
      {requestCard ? (
        <View style={[styles.glassCard, !expanded ? styles.glassCardCollapsed : null]}>
          <LinearGradient
            colors={[huddleColors.glassOverlay, huddleColors.canvas]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={[styles.phaseStrip, { backgroundColor: underReview ? huddleColors.validationRed : huddleColors.blueLight }]} pointerEvents="none" />
          <Pressable
            accessibilityLabel={expanded ? "Collapse request details" : "Expand request details"}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            hitSlop={huddleSpacing.x1}
            onPress={() => {
              setRequestExpanded((value) => !value);
            }}
            style={({ pressed }) => [styles.glassCardInner, !expanded ? styles.careScopeCollapsedHeader : null, pressed ? nativeModalStyles.pressed : null]}
          >
            <View style={styles.scopeHeadlineBlock}>
              <View style={styles.scopeHeaderTopRow}>
                <View style={styles.scopeHeadlineCopy}>
                  <Text numberOfLines={1} style={styles.timelineCurrentLabel}>{serviceLabel || "Care Scope"} with </Text>
                  <PetAvatarStack pets={scopePets} size={22} />
                </View>
                <Feather color={huddleColors.iconMuted} name={expanded ? "chevron-up" : "chevron-down"} size={18} />
              </View>
              <View style={styles.scopeHeaderBottomRow}>
                <View style={styles.scopeSubtitleAndHideRow}>
                  {collapsedWhereLine ? (
                    <View style={styles.scopeSubtitleRow}>
                      <Text numberOfLines={1} style={styles.scopeSubtitle}>{collapsedWhereLine}</Text>
                    </View>
                  ) : <View style={styles.scopeSubtitleRow} />}
                  {canHide && onHide ? (
                    <Pressable
                      accessibilityLabel="Hide care scope from chat"
                      hitSlop={huddleSpacing.x1}
                      onPress={(event) => {
                        event.stopPropagation();
                        onHide();
                      }}
                      style={({ pressed }) => [styles.inlineHideButton, pressed ? nativeModalStyles.pressed : null]}
                    >
                      <Text style={styles.inlineHideText}>Hide</Text>
                    </Pressable>
                  ) : null}
                </View>
                {pinDigits.length > 0 && !(canHide && onHide) ? (
                  <View style={styles.scopePinSlot}>
                    <StartPinDetailCard digits={pinDigits} />
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>

          {expanded ? (
            <ScrollView
              bounces={false}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              style={styles.scopeExpandedScroll}
              contentContainerStyle={styles.scopeExpandedBody}
            >
              <View style={styles.scopeHairline} />

              <SelectedPetPolaroid requestCard={requestCard} onOpenPet={onOpenPet} />

              <View style={styles.scopeDetailGrid}>
                <ScopeDetailRow label="Time">
                  {requestCard.startTime || "—"} – {requestCard.endTime || "—"}
                </ScopeDetailRow>
                {locationStyleLabel ? (
                  <ScopeDetailRow label="Setting">{locationStyleLabel}</ScopeDetailRow>
                ) : null}
                {quoteCard ? (
                  <ScopeDetailRow label={isProvider ? "Payout" : "Payment"}>
                    {isProvider ? formatMoney(quoteCurrency, providerPayout) : formatMoney(quoteCurrency, requesterTotal)}
                  </ScopeDetailRow>
                ) : requestCard.suggestedPrice ? (
                  <ScopeDetailRow label="Offer">
                    {requestCard.suggestedCurrency || "HKD"} {requestCard.suggestedPrice} {formatRateUnit(requestCard.suggestedRate)}
                  </ScopeDetailRow>
                ) : null}
              </View>

              {quoteCard?.note ? (
                <>
                  <View style={styles.scopeHairline} />
                  <View style={styles.scopeNoteBlock}>
                    <Text style={styles.scopeEyebrowText}>Note</Text>
                    <Text style={styles.scopeNoteText}>{quoteCard.note}</Text>
                  </View>
                </>
              ) : null}

              {historyContent ? (
                <>
                  <View style={styles.scopeHairline} />
                  {historyContent}
                </>
              ) : null}

              {!hideActions && !underReview && ((isRequester || isProvider) && chat.status === "pending") ? (
                <View style={styles.scopeActionRow}>
                  {isRequester ? (
                    <Pressable
                      accessibilityLabel="Edit request"
                      hitSlop={huddleSpacing.x2}
                      onPress={onEditRequest}
                      style={({ pressed }) => [styles.scopeActionButton, pressed ? nativeModalStyles.pressed : null]}
                    >
                      <Feather color={huddleColors.blue} name="edit-2" size={14} />
                      <Text style={styles.scopeActionText}>Edit</Text>
                    </Pressable>
                  ) : null}
                  {isProvider && quoteCard ? (
                    <Pressable
                      accessibilityLabel="Edit care scope"
                      hitSlop={huddleSpacing.x2}
                      onPress={onEditQuote}
                      style={({ pressed }) => [styles.scopeActionButton, pressed ? nativeModalStyles.pressed : null]}
                    >
                      <Feather color={huddleColors.blue} name="edit-2" size={14} />
                      <Text style={styles.scopeActionText}>Edit</Text>
                    </Pressable>
                  ) : null}
                  {isRequester && !quoteCard ? (
                    <Pressable
                      accessibilityLabel="Withdraw request"
                      disabled={sending}
                      hitSlop={huddleSpacing.x2}
                      onPress={onWithdrawRequest}
                      style={({ pressed }) => [styles.scopeActionButton, styles.scopeActionDestructive, pressed ? nativeModalStyles.pressed : null, sending ? styles.disabledAction : null]}
                    >
                      <Feather color={huddleColors.validationRed} name="rotate-ccw" size={14} />
                      <Text style={[styles.scopeActionText, styles.scopeActionTextDestructive]}>Withdraw</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ScopeLine({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Text style={styles.scopeLine}>
      <Text style={styles.scopeLabel}>{label}:</Text> {children}
    </Text>
  );
}

function ScopeDetailRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View style={styles.scopeDetailRow}>
      <Text style={styles.scopeDetailLabel}>{label}</Text>
      <Text style={styles.scopeDetailValue}>{children}</Text>
    </View>
  );
}

function StartPinDigitBoxes({ digits }: { digits: string[] }) {
  if (digits.length !== 4) return null;
  return (
    <View accessibilityLabel={`Start PIN ${digits.join(" ")}`} style={styles.startPinDigits}>
      {digits.map((digit, index) => (
        <View key={`${digit}-${index}`} style={styles.startPinDigitBox}>
          <Text style={styles.startPinDigitText}>{digit}</Text>
        </View>
      ))}
    </View>
  );
}

function StartPinDetailCard({ digits }: { digits: string[] }) {
  if (digits.length !== 4) return null;
  return (
    <View accessibilityLabel={`Start PIN ${digits.join(" ")}`} style={styles.startPinDetailCard}>
      <View style={styles.startPinDetailDigits}>
        {digits.map((digit, index) => (
          <View key={`detail-${digit}-${index}`} style={styles.startPinDetailDigitBox}>
            <Text style={styles.startPinDetailDigitText}>{digit}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PaymentCareScopeSummary({ quoteCard, requestCard }: { quoteCard: ServiceQuoteCard | null; requestCard: ServiceRequestCard | null }) {
  if (!requestCard && !quoteCard) return null;
  const sourceDates = quoteCard?.requestedDates?.length ? quoteCard.requestedDates : requestCard?.requestedDates;
  const sourceDate = clean(requestCard?.requestedDate);
  const startTime = clean(quoteCard?.startTime) || clean(requestCard?.startTime) || "—";
  const endTime = clean(quoteCard?.endTime) || clean(requestCard?.endTime) || "—";
  const locationStyles = quoteCard?.locationStyles?.length ? quoteCard.locationStyles : requestCard?.locationStyles || [];
  const locationArea = clean(quoteCard?.locationArea) || clean(requestCard?.locationArea);
  const locationStyleLabel = locationStyles.length ? locationStyles.join(", ") : "";
  return (
    <View style={styles.paymentCareScopeCard}>
      {requestCard ? <SelectedPetPolaroid requestCard={requestCard} /> : null}
      <View style={styles.scopeBody}>
        <ScopeLine label="Period">{formatDateRangeBare(sourceDates, sourceDate)}</ScopeLine>
        <ScopeLine label="Time">{startTime} - {endTime}</ScopeLine>
        <ScopeLine label="Location">{locationStyleLabel ? `${locationStyleLabel}．` : ""}{locationArea || "—"}</ScopeLine>
      </View>
    </View>
  );
}

function PetAvatarStack({ pets, size = 24 }: { pets: ServiceRequestPet[]; size?: number }) {
  if (!pets || pets.length === 0) return null;
  const visible = pets.slice(0, 3);
  const extra = pets.length - 3;
  const ringBg = huddleColors.canvas;
  const overlap = Math.round(size * 0.34);
  return (
    <View style={styles.petStack}>
      {visible.map((pet, index) => {
        const photo = clean(pet.petPhotoUrl);
        const initial = clean(pet.petName).slice(0, 1).toUpperCase() || "·";
        return (
          <View
            key={pet.petId || `${pet.petName}-${index}`}
            style={[
              styles.petStackCircle,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                borderColor: ringBg,
                marginLeft: index === 0 ? 0 : -overlap,
                zIndex: index + 1,
                backgroundColor: photo ? ringBg : huddleColors.blue,
              },
            ]}
          >
            {photo ? (
              <ExpoImage source={{ uri: photo }} style={{ width: size - 3, height: size - 3, borderRadius: (size - 3) / 2 }} contentFit="cover" transition={120} />
            ) : (
              <Text style={[styles.petStackInitial, { fontSize: Math.round(size * 0.45), lineHeight: Math.round(size * 0.55) }]}>{initial}</Text>
            )}
          </View>
        );
      })}
      {extra > 0 ? (
        <View
          style={[
            styles.petStackCircle,
            styles.petStackExtra,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: ringBg,
              marginLeft: -overlap,
              zIndex: visible.length + 1,
            },
          ]}
        >
          <Text style={[styles.petStackExtraText, { fontSize: Math.round(size * 0.42), lineHeight: Math.round(size * 0.55) }]}>+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

type BookingTimelineItem = {
  dateLabel?: string;
  done: boolean;
  label: string;
  skipped?: boolean;
};

const buildBookingTimelineState = (chat: ServiceChatRow, isProvider: boolean, underReviewOverride?: boolean) => {
  const disputeResolved = isResolvedServiceDisputeStatus(chat.dispute_status);
  const checkInDone = Boolean(chat.checkin_submitted_at && (chat.checkin_photo_url || chat.care_status === "in_progress" || chat.care_status === "completed"));
  const completionDone = Boolean(chat.care_status === "completed" || chat.status === "completed" || chat.completed_at);
  const terminalDone = Boolean(completionDone || disputeResolved);
  const providerPayoutSkipped = Boolean(isProvider && serviceDisputeNoProviderPayout(chat));
  const providerPayoutDone = Boolean(chat.payout_released_at || serviceDisputeResolvesWithProviderPayout(chat));
  const underReview = Boolean(!terminalDone && (underReviewOverride || chat.status === "disputed" || chat.care_status === "under_dispute" || chat.care_status === "handoff_issue_review"));
  const oneSideComplete = !completionDone && (chat.requester_mark_finished || chat.provider_mark_finished);
  const currentUserMarkedComplete = isProvider ? chat.provider_mark_finished : chat.requester_mark_finished;
  const waitingCompletionLabel = currentUserMarkedComplete
    ? isProvider
      ? "Completed. Wait for Pet Owner's confirmation"
      : "Completed. Wait for Carer's confirmation"
    : "Awaiting confirmation to finish";
  const careInProgressDone = Boolean(terminalDone || oneSideComplete);
  const careInProgressActive = Boolean(!careInProgressDone && (chat.care_status === "in_progress" || chat.status === "in_progress"));
  const completionDate = chat.dispute_resolved_at || chat.completed_at;
  const items: BookingTimelineItem[] = [
    { label: "Request sent", dateLabel: formatTimelineStepDate(chat.request_sent_at), done: Boolean(chat.request_sent_at || chat.request_card) },
    { label: "Care scope accepted", dateLabel: formatTimelineStepDate(chat.quote_sent_at || chat.booked_at), done: Boolean(chat.quote_card) },
    { label: "Booking confirmed", dateLabel: formatTimelineStepDate(chat.booked_at), done: Boolean(chat.booked_at || chat.status === "booked" || chat.status === "in_progress" || terminalDone) },
    { label: "Check-in", dateLabel: formatTimelineStepDate(chat.checkin_submitted_at), done: checkInDone },
    { label: "Care in progress", dateLabel: formatTimelineStepDate(chat.in_progress_at || chat.checkin_submitted_at), done: careInProgressDone },
    { label: terminalDone ? "Booking completed" : oneSideComplete ? waitingCompletionLabel : "Completion", dateLabel: formatTimelineStepDate(completionDate), done: terminalDone },
  ];
  if (isProvider) {
    items.push({
      label: "Payment released",
      dateLabel: formatTimelineStepDate(chat.payout_released_at),
      done: Boolean(chat.payout_released_at),
      skipped: providerPayoutSkipped,
    });
  }
  const currentIndex = items.findIndex((item) => !item.done && !("skipped" in item && item.skipped));
  const disputeIndex = currentIndex >= 0 ? currentIndex : Math.max(0, items.length - 1);
  const currentLabel = underReview ? "Under Dispute" : terminalDone ? "All complete" : oneSideComplete ? waitingCompletionLabel : careInProgressActive ? "Care in progress" : currentIndex >= 0 ? items[currentIndex].label : items[items.length - 1].label;
  const phaseColor = (() => {
    if (underReview) return huddleColors.validationRed;
    if (terminalDone) return huddleColors.success;
    if (careInProgressDone || checkInDone) return huddleColors.blue;
    return huddleColors.primarySoftFill;
  })();
  return {
    careInProgressActive,
    careInProgressDone,
    checkInDone,
    currentIndex,
    currentLabel,
    disputeIndex,
    items,
    phaseColor,
    providerPayoutSkipped,
    terminalDone,
    underReview,
  };
};

const isServiceChatHistoryMenuEligible = (chat: ServiceChatRow) => (
  Boolean(
    chat.completed_at ||
    chat.status === "completed" ||
    chat.care_status === "completed" ||
    isResolvedServiceDisputeStatus(chat.dispute_status),
  )
);

const serviceChatHistoryTerminalAt = (chat: ServiceChatRow, isProvider: boolean) => {
  const state = buildBookingTimelineState(chat, isProvider);
  if (!state.terminalDone || state.underReview) return "";
  if (isProvider) {
    if (chat.payout_released_at) return chat.payout_released_at;
    if (state.providerPayoutSkipped && chat.dispute_resolved_at) return chat.dispute_resolved_at;
    return "";
  }
  return chat.dispute_resolved_at || chat.completed_at || "";
};

const isServiceChatAutoHiddenInHistory = (chat: ServiceChatRow, isProvider: boolean, nowMs = Date.now()) => {
  const terminalAt = serviceChatHistoryTerminalAt(chat, isProvider);
  if (!terminalAt) return false;
  const terminalMs = Date.parse(terminalAt);
  if (!Number.isFinite(terminalMs)) return false;
  return nowMs - terminalMs >= SERVICE_HISTORY_AUTO_HIDE_MS;
};

function BookingTimelineExpandedList({
  activeDotPulseStyle,
  currentIndex,
  disputeIndex,
  items,
  noTopBorder = false,
  showAllDates = false,
  terminalDone,
  underReview,
}: {
  activeDotPulseStyle?: object;
  currentIndex: number;
  disputeIndex: number;
  items: BookingTimelineItem[];
  noTopBorder?: boolean;
  showAllDates?: boolean;
  terminalDone: boolean;
  underReview: boolean;
}) {
  return (
    <View style={[styles.timelineExpandedList, noTopBorder ? styles.timelineExpandedListNoBorder : null]}>
      {items.map((item, index) => {
        const isCurrent = underReview ? index === disputeIndex : !item.done && !item.skipped && index === currentIndex;
        const isSkipped = "skipped" in item && item.skipped;
        const shouldShowDate = Boolean(item.dateLabel && (showAllDates || item.label === "Payment released"));
        return (
          <View key={`row-${item.label}-${index}`} style={styles.timelineItem}>
            <Animated.View style={[styles.timelineDot, item.done ? styles.timelineDotDone : null, item.done && terminalDone ? styles.timelineDotDoneTerminal : null, isSkipped ? styles.timelineDotSkipped : null, isCurrent ? styles.timelineDotCurrent : null, isCurrent && underReview ? styles.timelineDotCurrentDisputed : null, isCurrent && !terminalDone && !isSkipped && activeDotPulseStyle ? activeDotPulseStyle : null]}>
              {item.done && !isCurrent ? <Feather color={huddleColors.onPrimary} name="check" size={11} /> : null}
              {isSkipped ? <Feather color={huddleColors.mutedText} name="x" size={11} /> : null}
            </Animated.View>
            <Text
              style={[
                styles.timelineLabel,
                item.done ? styles.timelineLabelDone : null,
                item.done && terminalDone ? styles.timelineLabelDoneTerminal : null,
                isSkipped ? styles.timelineLabelSkipped : null,
                isCurrent ? styles.timelineLabelCurrent : null,
              ]}
            >
              {item.label}
              {shouldShowDate ? <Text style={styles.timelineLabelDate}> - {item.dateLabel}</Text> : null}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function BookingTimelineCard({
  canHide = false,
  chat,
  collapsed,
  isProvider,
  onHide,
  onToggle,
  underReview: underReviewOverride,
}: {
  canHide?: boolean;
  chat: ServiceChatRow;
  collapsed: boolean;
  isProvider: boolean;
  onHide?: () => void;
  onToggle: () => void;
  underReview?: boolean;
}) {
  const { currentIndex, currentLabel, disputeIndex, items, phaseColor, providerPayoutSkipped, terminalDone, underReview } = buildBookingTimelineState(chat, isProvider, underReviewOverride);
  const activeDotPulse = useRef(new Animated.Value(0)).current;
  const activeDotPulseStyle = {
    opacity: activeDotPulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
    transform: [{ scale: activeDotPulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] }) }],
  };
  useEffect(() => {
    if (terminalDone || providerPayoutSkipped || (!underReview && currentIndex < 0)) {
      activeDotPulse.stopAnimation();
      activeDotPulse.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(activeDotPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(activeDotPulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [activeDotPulse, currentIndex, providerPayoutSkipped, terminalDone, underReview]);
  return (
    <View style={[styles.glassCard, collapsed ? styles.glassCardCollapsed : null]}>
      <LinearGradient
        colors={[huddleColors.glassOverlay, huddleColors.canvas]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.phaseStrip, { backgroundColor: phaseColor }]} pointerEvents="none" />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        onPress={onToggle}
        style={({ pressed }) => [styles.glassCardInner, collapsed ? styles.timelineCollapsedHeader : null, pressed ? nativeModalStyles.pressed : null]}
      >
        <View style={styles.timelineTitleRow}>
          <Text numberOfLines={1} style={[styles.timelineCurrentLabel, terminalDone ? styles.timelineCurrentLabelTerminal : null]}>{currentLabel}</Text>
          <Feather color={huddleColors.iconMuted} name={collapsed ? "chevron-down" : "chevron-up"} size={18} />
        </View>
        <View style={styles.timelineTopRow}>
          <View style={styles.timelineProgressAndHideRow}>
            <View style={styles.stitchedRibbon}>
              {items.map((item, index) => {
                const isCurrent = underReview ? index === disputeIndex : !item.done && !item.skipped && index === currentIndex;
                const isSkipped = "skipped" in item && item.skipped;
                if (isCurrent) {
                  return (
                    <Animated.View
                      key={`current-${index}`}
                      style={[styles.ribbonCurrent, underReview ? styles.ribbonCurrentDisputed : null, activeDotPulseStyle]}
                    />
                  );
                }
                if (item.done) {
                  return (
                    <View key={`done-${index}`} style={styles.ribbonDone}>
                      <Feather color={terminalDone ? huddleColors.success : huddleColors.blue} name="check" size={11} strokeWidth={2.6} />
                    </View>
                  );
                }
                if (isSkipped) return <View key={`skipped-${index}`} style={styles.ribbonSkipped}><Feather color={huddleColors.mutedText} name="x" size={10} strokeWidth={2.6} /></View>;
                return <View key={`ahead-${index}`} style={styles.ribbonAhead} />;
              })}
            </View>
          </View>
          {canHide && onHide ? (
            <Pressable
              accessibilityLabel="Hide care progress from chat"
              hitSlop={huddleSpacing.x1}
              onPress={(event) => {
                event.stopPropagation();
                onHide();
              }}
              style={({ pressed }) => [styles.inlineHideButton, pressed ? nativeModalStyles.pressed : null]}
            >
              <Text style={styles.inlineHideText}>Hide</Text>
            </Pressable>
          ) : null}
        </View>
        {!collapsed ? (
          <BookingTimelineExpandedList
            activeDotPulseStyle={activeDotPulseStyle}
            currentIndex={currentIndex}
            disputeIndex={disputeIndex}
            items={items}
            terminalDone={terminalDone}
            underReview={underReview}
          />
        ) : null}
      </Pressable>
    </View>
  );
}

function CareHistorySheet({
  currentUserId,
  loading,
  onClose,
  onOpenPet,
  open,
  ownerName,
  providerName,
  rows,
}: {
  currentUserId: string | null;
  loading: boolean;
  onClose: () => void;
  onOpenPet?: (petId: string) => void;
  open: boolean;
  ownerName: string;
  providerName: string;
  rows: ServiceChatRow[];
}) {
  const historyRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const aTime = Date.parse(serviceChatHistoryTerminalAt(a, a.provider_id === currentUserId) || a.completed_at || a.dispute_resolved_at || a.booked_at || "");
      const bTime = Date.parse(serviceChatHistoryTerminalAt(b, b.provider_id === currentUserId) || b.completed_at || b.dispute_resolved_at || b.booked_at || "");
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
    return sorted;
  }, [currentUserId, rows]);
  if (!open) return null;
  return (
    <Modal animationType="slide" transparent visible={open} onRequestClose={onClose}>
      <View style={nativeModalStyles.appModalBackdrop}>
        <Pressable accessibilityLabel="Close care history" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={nativeModalStyles.appModalBottomSafeArea} pointerEvents="box-none">
          <AppBottomSheet mode="large" onClose={onClose} style={styles.careHistorySheet}>
            <AppBottomSheetHeader>
              <Text numberOfLines={1} style={nativeModalStyles.appModalSheetTitle}>Care History</Text>
              <AppModalIconButton accessibilityLabel="Close care history" onPress={onClose}>
                <Feather color={huddleColors.text} name="x" size={24} />
              </AppModalIconButton>
            </AppBottomSheetHeader>
            <AppBottomSheetScroll contentContainerStyle={styles.careHistoryContent} fill>
              {loading && historyRows.length === 0 ? (
                <NativeLoadingState variant="inline" />
              ) : historyRows.length > 0 ? (
                historyRows.map((chat) => {
                  const rowIsProvider = chat.provider_id === currentUserId;
                  const rowIsRequester = chat.requester_id === currentUserId;
                  const timelineState = buildBookingTimelineState(chat, rowIsProvider);
                  return (
                    <BookingCards
                      key={chat.id}
                      chat={chat}
                      hideActions
                      historyContent={(
                        <View style={styles.careHistoryTimelineBlock}>
                          <Text style={styles.scopeEyebrowText}>Progress</Text>
                          <BookingTimelineExpandedList
                            currentIndex={timelineState.currentIndex}
                            disputeIndex={timelineState.disputeIndex}
                            items={timelineState.items}
                            noTopBorder
                            showAllDates
                            terminalDone={timelineState.terminalDone}
                            underReview={timelineState.underReview}
                          />
                        </View>
                      )}
                      isProvider={rowIsProvider}
                      isRequester={rowIsRequester}
                      onEditQuote={() => undefined}
                      onEditRequest={() => undefined}
                      onOpenPet={onOpenPet}
                      onWithdrawRequest={() => undefined}
                      ownerName={ownerName}
                      providerName={providerName}
                      sending={false}
                    />
                  );
                })
              ) : (
                <Text style={styles.mutedLine}>No completed care history yet.</Text>
              )}
            </AppBottomSheetScroll>
          </AppBottomSheet>
        </View>
      </View>
    </Modal>
  );
}

function CompletionSheet({
  canReportIssue,
  ctaLabel,
  isProvider,
  isRequester,
  onClose,
  onReportIssue,
  onSubmit,
  open,
  sending,
}: {
  canReportIssue: boolean;
  ctaLabel: string;
  isProvider: boolean;
  isRequester: boolean;
  onClose: () => void;
  onReportIssue: () => void;
  onSubmit: (note: string, providerChecks?: { confirmedCompleted: boolean; noUnresolvedSafetyConcerns: boolean; understandsReview: boolean }, requesterChecks?: { confirmedCompleted: boolean; understandsPayoutReview: boolean }) => Promise<void>;
  open: boolean;
  sending: boolean;
}) {
  const [confirmedCompleted, setConfirmedCompleted] = useState(false);
  const [noUnresolvedSafetyConcerns, setNoUnresolvedSafetyConcerns] = useState(false);
  const [understandsReview, setUnderstandsReview] = useState(false);
  const [understandsPayoutReview, setUnderstandsPayoutReview] = useState(false);
  const [note, setNote] = useState("");
  const [noteFocused, setNoteFocused] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [slideResetKey, setSlideResetKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setConfirmedCompleted(false);
    setNoUnresolvedSafetyConcerns(false);
    setUnderstandsReview(false);
    setUnderstandsPayoutReview(false);
    setNote("");
    setNoteFocused(false);
    setAttempted(false);
    setSlideResetKey((key) => key + 1);
  }, [open]);

  const canSubmit = isProvider
    ? confirmedCompleted && noUnresolvedSafetyConcerns && understandsReview
    : isRequester && confirmedCompleted && understandsPayoutReview;
  const submit = () => {
    setAttempted(true);
    if (!canSubmit) {
      haptic.error();
      setSlideResetKey((key) => key + 1);
      return;
    }
    if (isProvider) {
      void onSubmit(note, { confirmedCompleted, noUnresolvedSafetyConcerns, understandsReview });
    } else {
      void onSubmit(note, undefined, { confirmedCompleted, understandsPayoutReview });
    }
  };

  return (
    <Modal animationType="slide" transparent visible={open} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close completion sheet" onPress={onClose} style={StyleSheet.absoluteFill} />
        <AppBottomSheet mode="content" onClose={onClose}>
          <AppBottomSheetHeader>
            <Text style={nativeModalStyles.appModalSheetTitle}>Complete Care Session</Text>
            <AppModalIconButton accessibilityLabel="Close complete care sheet" disabled={sending} onPress={onClose}>
              <Feather color={huddleColors.text} name="x" size={24} />
            </AppModalIconButton>
          </AppBottomSheetHeader>
          <AppBottomSheetScroll contentContainerStyle={styles.paymentBody}>
            <CompletionCheckbox
              attempted={attempted}
              checked={confirmedCompleted}
              label={isProvider ? "The pet has been returned, handed off, or care was completed as agreed." : "I confirm the pet was returned safely or care was completed as agreed."}
              onToggle={() => setConfirmedCompleted((value) => !value)}
            />
            {isProvider ? (
              <>
                <CompletionCheckbox attempted={attempted} checked={noUnresolvedSafetyConcerns} label="I confirm there are no unresolved safety concerns unless reported separately." onToggle={() => setNoUnresolvedSafetyConcerns((value) => !value)} />
                <CompletionCheckbox attempted={attempted} checked={understandsReview} label="I understand this completion may be used to support booking and payment review." onToggle={() => setUnderstandsReview((value) => !value)} />
              </>
            ) : (
              <CompletionCheckbox attempted={attempted} checked={understandsPayoutReview} label="I understand confirming completion may allow provider payout to proceed." onToggle={() => setUnderstandsPayoutReview((value) => !value)} />
            )}
            <Text style={styles.fieldLabel}>Add note</Text>
            <AppModalField focused={noteFocused} multiline onBlur={() => setNoteFocused(false)} onChangeText={setNote} onFocus={() => setNoteFocused(true)} placeholder="Optional" style={styles.completionNoteField} value={note} />
            {canReportIssue ? (
              <Pressable accessibilityRole="button" onPress={onReportIssue} style={({ pressed }) => [styles.reportIssueButton, pressed ? nativeModalStyles.pressed : null]}>
                <Feather color={huddleColors.validationRed} name="flag" size={16} />
                <Text style={styles.reportIssueText}>Report Issues</Text>
              </Pressable>
            ) : null}
          </AppBottomSheetScroll>
          <AppBottomSheetFooter>
            <SlideToConfirm busy={sending} label={ctaLabel || "Complete Care Session"} onCommit={submit} resetKey={slideResetKey} />
          </AppBottomSheetFooter>
        </AppBottomSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CompletionCheckbox({ attempted, checked, label, onToggle }: { attempted: boolean; checked: boolean; label: string; onToggle: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onToggle} style={styles.checkboxRowTop}>
      <View style={[styles.checkbox, attempted && !checked ? styles.checkboxError : null, checked ? styles.checkboxActive : null]}>{checked ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}</View>
      <Text style={styles.checkboxText}>{label}</Text>
    </Pressable>
  );
}

function PaymentSheet({
  open,
  onBlocker,
  onClose,
  onPay,
  quoteCard,
  requestCard,
  requesterId,
  providerId,
  pets,
  requesterCountry,
  requesterIdForPetUpdate,
  sending,
}: {
  open: boolean;
  onBlocker: (body: string) => void;
  onClose: () => void;
  onPay: (snapshot: CareBookingSnapshot, traceId: string, trace: ServicePaymentTrace) => Promise<ServicePaymentResult>;
  quoteCard: ServiceQuoteCard | null;
  requestCard: ServiceRequestCard | null;
  requesterId: string;
  providerId: string;
  pets: PetOption[];
  requesterCountry?: string | null;
  requesterIdForPetUpdate: string | null;
  sending: boolean;
}) {
  const quotePrice = Number(clean(quoteCard?.finalPrice));
  const hasValidPrice = Number.isFinite(quotePrice) && quotePrice > 0;
  const serviceFeeAmount = hasValidPrice ? Math.round(quotePrice * 0.1 * 100) / 100 : 0;
  const totalDue = hasValidPrice ? quotePrice + serviceFeeAmount : 0;
  const curr = clean(quoteCard?.currency) || "HKD";
  const serviceType = clean(quoteCard?.serviceType) || clean(requestCard?.serviceType) || "Care";
  const petId = clean(quoteCard?.petId) || clean(requestCard?.petId);
  const selectedPetIds = useMemo(() => {
    const ids = [
      ...(Array.isArray(quoteCard?.petIds) ? quoteCard.petIds : []),
      clean(quoteCard?.petId),
      ...(Array.isArray(requestCard?.petIds) ? requestCard.petIds : []),
      clean(requestCard?.petId),
    ].map(clean).filter(Boolean);
    return Array.from(new Set(ids));
  }, [quoteCard?.petId, quoteCard?.petIds, requestCard?.petId, requestCard?.petIds]);
  const selectedPets = useMemo(() => {
    const idSet = new Set(selectedPetIds);
    const matched = pets.filter((pet) => idSet.has(pet.id));
    return matched.length ? matched : petId ? pets.filter((pet) => pet.id === petId) : [];
  }, [petId, pets, selectedPetIds]);
  const startAt = clean(requestCard?.requestedDate || requestCard?.requestedDates?.[0]) || "";
  const endAt = clean(requestCard?.requestedDate || requestCard?.requestedDates?.[0]) || startAt;
  const defaultHandoff = [clean(requestCard?.locationStyles?.join(" / ")), clean(requestCard?.locationArea)].filter(Boolean).join(" - ");
  const phoneCountryCode = useMemo(() => resolveNativeCountryCodeFromLabel(requesterCountry), [requesterCountry]);
  const [handoffMethod, setHandoffMethod] = useState(defaultHandoff);
  const [emergencyContact, setEmergencyContact] = useState("");
  const [careInstructions, setCareInstructions] = useState(clean(requestCard?.additionalNotes));
  const [medicationAllergyNotes, setMedicationAllergyNotes] = useState("");
  const [behaviorEscapeRisk, setBehaviorEscapeRisk] = useState("");
  const [emergencyVetPermission, setEmergencyVetPermission] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsSheetVisible, setTermsSheetVisible] = useState(false);
  const [termsScrolled, setTermsScrolled] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [emergencyContactValid, setEmergencyContactValid] = useState(false);
  const [emergencyVetContact, setEmergencyVetContact] = useState("");
  const [petRefillTarget, setPetRefillTarget] = useState<{ field: "medications" | "vet"; petId: string | null } | null>(null);
  const [petRefillAttempted, setPetRefillAttempted] = useState(false);
  const [paymentTraceId, setPaymentTraceId] = useState("");
  const [paymentAttempting, setPaymentAttempting] = useState(false);
  const [vetClinicDraft, setVetClinicDraft] = useState("");
  const [vetNameDraft, setVetNameDraft] = useState("");
  const [vetPhoneDraft, setVetPhoneDraft] = useState("");
  const [medicationNameDraft, setMedicationNameDraft] = useState("");
  const [medicationDosageDraft, setMedicationDosageDraft] = useState("");
  const [medicationFrequencyDraft, setMedicationFrequencyDraft] = useState("");
  const [slideResetKey, setSlideResetKey] = useState(0);
  const scrollRef = useRef<ScrollView | null>(null);
  const paymentFieldOffsetsRef = useRef<Record<string, number>>({});
  const bookingTermsPage = useMemo(() => getNativeLegalPage("/booking-terms"), []);
  const draftKey = useMemo(() => paymentDraftKey(requesterId, providerId, selectedPetIds, serviceType), [providerId, requesterId, selectedPetIds, serviceType]);
  const termsSheetPanResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gestureState) => gestureState.dy > huddleSpacing.x5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.6,
      onPanResponderRelease: (_event, gestureState) => {
        if (gestureState.dy > 160 && gestureState.vy > 0.7) setTermsSheetVisible(false);
      },
    }),
    [],
  );
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const defaultDraft = {
      behaviorEscapeRisk: "",
      careInstructions: clean(requestCard?.additionalNotes),
      emergencyContact: "",
      emergencyVetContact: "",
      emergencyVetPermission: false,
      handoffMethod: defaultHandoff,
      medicationAllergyNotes: "",
      termsAccepted: false,
    };
    const applyDraft = (draft: typeof defaultDraft) => {
      setHandoffMethod(draft.handoffMethod);
      setEmergencyContact(draft.emergencyContact);
      setCareInstructions(draft.careInstructions);
      setMedicationAllergyNotes(draft.medicationAllergyNotes);
      setEmergencyVetContact(draft.emergencyVetContact);
      setBehaviorEscapeRisk(draft.behaviorEscapeRisk);
      setTermsAccepted(draft.termsAccepted);
      setEmergencyVetPermission(draft.emergencyVetPermission);
    };
    void AsyncStorage.getItem(draftKey).then((raw) => {
      if (cancelled) return;
      if (!raw) {
        applyDraft(defaultDraft);
        return;
      }
      try {
        const parsed = JSON.parse(raw) as Partial<typeof defaultDraft>;
        applyDraft({
          behaviorEscapeRisk: clean(parsed.behaviorEscapeRisk),
          careInstructions: clean(parsed.careInstructions) || defaultDraft.careInstructions,
          emergencyContact: clean(parsed.emergencyContact),
          emergencyVetContact: clean(parsed.emergencyVetContact),
          emergencyVetPermission: Boolean(parsed.emergencyVetPermission),
          handoffMethod: clean(parsed.handoffMethod) || defaultDraft.handoffMethod,
          medicationAllergyNotes: clean(parsed.medicationAllergyNotes),
          termsAccepted: Boolean(parsed.termsAccepted),
        });
      } catch {
        applyDraft(defaultDraft);
      }
    });
    setAttempted(false);
    setTermsSheetVisible(false);
    setTermsScrolled(false);
    setFocusedField(null);
    setPaymentTraceId("");
    setPaymentAttempting(false);
    setSlideResetKey((value) => value + 1);
    return () => {
      cancelled = true;
    };
  }, [defaultHandoff, draftKey, open, requestCard?.additionalNotes]);
  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => {
      void AsyncStorage.setItem(draftKey, JSON.stringify({
        behaviorEscapeRisk,
        careInstructions,
        emergencyContact,
        emergencyVetContact,
        emergencyVetPermission,
        handoffMethod,
        medicationAllergyNotes,
        termsAccepted,
        updatedAt: Date.now(),
      })).catch(() => undefined);
    }, 450);
    return () => clearTimeout(timeout);
  }, [behaviorEscapeRisk, careInstructions, draftKey, emergencyContact, emergencyVetContact, emergencyVetPermission, handoffMethod, medicationAllergyNotes, open, termsAccepted]);
  const normalizedEmergencyContact = emergencyContact.trim();
  const emergencyContactLooksValid = emergencyContactValid || (normalizedEmergencyContact.startsWith("+") && isValidPhoneNumber(normalizedEmergencyContact));
  const missingEmergency = !normalizedEmergencyContact || !emergencyContactLooksValid;
  const missingInstructions = !careInstructions.trim();
  const missingTerms = !termsAccepted;
  const canPay = hasValidPrice && !missingEmergency && !missingInstructions && !missingTerms && Boolean(petId && requesterId && providerId && startAt && endAt);
  const getPaymentBlocker = () => {
    if (!hasValidPrice) return PAYMENT_BLOCKERS.invalidQuote;
    if (missingEmergency) return PAYMENT_BLOCKERS.invalidEmergencyContact;
    if (missingInstructions) return PAYMENT_BLOCKERS.missingCareInstructions;
    if (missingTerms) return PAYMENT_BLOCKERS.missingTerms;
    if (!(petId && requesterId && providerId && startAt && endAt)) return PAYMENT_BLOCKERS.incompleteBooking;
    return "";
  };
  const appendPaymentTrace = useCallback((traceId: string, step: string, details: Record<string, unknown> = {}) => {
    const normalizedStep = clean(step);
    if (!normalizedStep) return;
    console.warn("[native.service_payment.trace]", { traceId, step: normalizedStep, ...details });
    setPaymentTraceId(traceId);
  }, []);
  useEffect(() => {
    if (!open) return;
    console.warn("[native.service_payment.runtime] sheet_open", {
      probe: "payment-ui-v3",
      hasQuote: Boolean(quoteCard),
      hasValidPrice,
      canPay,
      blocker: getPaymentBlocker() || "none",
    });
    const traceId = paymentTraceId || createPaymentTraceId();
    setPaymentTraceId(traceId);
    appendPaymentTrace(traceId, "sheet/modal open", { canPay, blocker: getPaymentBlocker() || "none" });
  }, [canPay, hasValidPrice, open, quoteCard]);
  const closePaymentSheet = () => {
    if (paymentTraceId) appendPaymentTrace(paymentTraceId, "sheet/modal closed", { sending, paymentAttempting });
    onClose();
  };
  const handlePaymentBlocked = (traceId?: string, source = "blocked") => {
    setAttempted(true);
    const blocker = getPaymentBlocker() || PAYMENT_BLOCKERS.incompleteBooking;
    if (traceId) appendPaymentTrace(traceId, "canPay result + blocker", { source, canPay: false, blocker });
    onBlocker(blocker);
    console.warn("[native.service_payment] blocked_before_create_service_payment", {
      hasValidPrice,
      missingEmergency,
      missingInstructions,
      missingTerms,
      hasPetId: Boolean(petId),
      hasRequesterId: Boolean(requesterId),
      hasProviderId: Boolean(providerId),
      hasStartAt: Boolean(startAt),
      hasEndAt: Boolean(endAt),
    });
    setSlideResetKey((value) => value + 1);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 260, animated: true }));
  };
  const registerPaymentField = (field: string) => (event: import("react-native").LayoutChangeEvent) => {
    paymentFieldOffsetsRef.current[field] = event.nativeEvent.layout.y;
  };
  const focusPaymentField = (field: string) => {
    setFocusedField(field);
    const scroll = () => {
      const y = paymentFieldOffsetsRef.current[field] ?? 0;
      scrollRef.current?.scrollTo({ animated: true, y: Math.max(0, y - huddleSpacing.x4) });
    };
    requestAnimationFrame(scroll);
    setTimeout(scroll, 180);
  };
  const selectedPetForRefill = petRefillTarget?.petId ? selectedPets.find((pet) => pet.id === petRefillTarget.petId) || null : selectedPets[0] || null;
  const resetPetRefillDraft = () => {
    setPetRefillAttempted(false);
    setVetClinicDraft("");
    setVetNameDraft("");
    setVetPhoneDraft("");
    setMedicationNameDraft("");
    setMedicationDosageDraft("");
    setMedicationFrequencyDraft("");
  };
  const closePetRefill = () => {
    setPetRefillTarget(null);
    resetPetRefillDraft();
  };
  const openTermsSheet = () => {
    setTermsScrolled(false);
    setTermsSheetVisible(true);
  };
  const acceptTermsFromSheet = () => {
    if (!termsScrolled) return;
    setTermsAccepted(true);
    setTermsSheetVisible(false);
  };
  const applyVetContactFromPet = () => {
    const withVet = selectedPets.find((pet) => clean(pet.vet_contact));
    if (withVet?.vet_contact) {
      setEmergencyVetContact(clean(withVet.vet_contact));
      return;
    }
    setPetRefillTarget({ field: "vet", petId: selectedPets.length === 1 ? selectedPets[0]?.id || null : null });
    resetPetRefillDraft();
  };
  const applyMedicationFromPet = () => {
    const withMedication = selectedPets.find((pet) => Array.isArray(pet.medications) && pet.medications.length > 0);
    if (withMedication?.medications?.length) {
      setMedicationAllergyNotes(withMedication.medications.map((medication) => [medication.name, formatMedicationSummary(medication)].filter(Boolean).join(": ")).join("\n"));
      return;
    }
    setPetRefillTarget({ field: "medications", petId: selectedPets.length === 1 ? selectedPets[0]?.id || null : null });
    resetPetRefillDraft();
  };
  const savePetRefill = async () => {
    if (!petRefillTarget || !requesterIdForPetUpdate) return;
    setPetRefillAttempted(true);
    const targetPet = petRefillTarget.petId ? selectedPets.find((pet) => pet.id === petRefillTarget.petId) : selectedPetForRefill;
    if (!targetPet?.id) return;
    if (petRefillTarget.field === "vet") {
      const clinicName = vetClinicDraft.trim();
      const preferredVet = vetNameDraft.trim();
      const phoneNo = vetPhoneDraft.trim();
      if (!clinicName || !preferredVet || !phoneNo) return;
      const nextValue = [clinicName, preferredVet, phoneNo].filter(Boolean).join(" | ");
      const { error } = await supabase
        .from("pets")
        .update({ clinic_name: clinicName || null, preferred_vet: preferredVet || null, phone_no: phoneNo || null, vet_contact: nextValue || null })
        .eq("id", targetPet.id)
        .eq("owner_id", requesterIdForPetUpdate);
      if (error) throw error;
      setEmergencyVetContact(nextValue);
    } else {
      const medicationName = medicationNameDraft.trim();
      const medicationDosage = medicationDosageDraft.trim();
      const medicationFrequency = medicationFrequencyDraft.trim();
      if (!medicationName || !medicationDosage || !medicationFrequency) return;
      const nextMedication: MedicationRecord = {
        name: medicationName,
        dose_amount: null,
        dose_unit: null,
        frequency_value: null,
        frequency_unit: null,
        dosage: medicationDosage,
        frequency: medicationFrequency,
      };
      const nextMedications = [...(Array.isArray(targetPet.medications) ? targetPet.medications : []), nextMedication];
      const { error } = await supabase.from("pets").update({ medications: nextMedications }).eq("id", targetPet.id).eq("owner_id", requesterIdForPetUpdate);
      if (error) throw error;
      setMedicationAllergyNotes(nextMedications.map((medication) => [medication.name, formatMedicationSummary(medication)].filter(Boolean).join(": ")).join("\n"));
    }
    closePetRefill();
  };
  const submit = async () => {
    const traceId = paymentTraceId || createPaymentTraceId();
    setPaymentTraceId(traceId);
    setAttempted(true);
    appendPaymentTrace(traceId, "slide commit fired");
    appendPaymentTrace(traceId, "canPay result + blocker", { canPay, blocker: getPaymentBlocker() || "none" });
    console.warn("[native.service_payment.runtime] submit_called", {
      canPay,
      blocker: getPaymentBlocker() || "none",
      emergencyContactLooksValid,
    });
    if (paymentAttempting || sending) {
      appendPaymentTrace(traceId, "duplicate submit prevented", { sending, paymentAttempting });
      return;
    }
    if (!canPay) {
      handlePaymentBlocked(traceId, "submit");
      return;
    }
    setPaymentAttempting(true);
    try {
      const snapshot = {
        serviceType,
        petId,
        startAt,
        endAt,
        handoffMethod: handoffMethod.trim() || defaultHandoff,
        emergencyContact: normalizedEmergencyContact,
        careInstructions: careInstructions.trim(),
        medicationAllergyNotes: medicationAllergyNotes.trim(),
        behaviorEscapeRisk: behaviorEscapeRisk.trim(),
        emergencyVetContact: emergencyVetContact.trim(),
        emergencyVetPermission,
        price: {
          currency: curr,
          providerQuote: Math.round(quotePrice * 100),
          requesterTotal: Math.round(totalDue * 100),
        },
        requesterId,
        providerId,
        createdAt: new Date().toISOString(),
      };
      appendPaymentTrace(traceId, "onPay called", {
        hasSnapshot: true,
        hasPetId: Boolean(snapshot.petId),
        hasRequesterId: Boolean(snapshot.requesterId),
        hasProviderId: Boolean(snapshot.providerId),
      });
      const result = await onPay(snapshot, traceId, (step, details) => appendPaymentTrace(traceId, step, details));
      if (!result.ok) {
        appendPaymentTrace(traceId, "payment failure recorded", { error: result.error || "Unable to start payment." });
        appendPaymentTrace(traceId, "sheet/modal still open after payment failure", { open: true });
      } else {
        void AsyncStorage.removeItem(draftKey).catch(() => undefined);
        appendPaymentTrace(traceId, "sheet/modal closed after URL open", { open: false });
        onClose();
      }
    } finally {
      setPaymentAttempting(false);
      appendPaymentTrace(traceId, "sheet/modal final state", { open });
    }
  };
  return (
    <Modal animationType="slide" transparent visible={open} onRequestClose={closePaymentSheet}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close payment sheet" onPress={closePaymentSheet} style={StyleSheet.absoluteFill} />
        <AppBottomSheet disableSwipeToClose mode="large" onClose={closePaymentSheet}>
          <AppBottomSheetHeader>
            <Text style={nativeModalStyles.appModalSheetTitle}>Confirm booking</Text>
            <AppModalIconButton accessibilityLabel="Close confirm booking" onPress={closePaymentSheet}>
              <Feather color={huddleColors.text} name="x" size={24} />
            </AppModalIconButton>
          </AppBottomSheetHeader>
          <AppBottomSheetScroll contentContainerStyle={styles.paymentBody} scrollRef={scrollRef}>
            <PaymentCareScopeSummary quoteCard={quoteCard} requestCard={requestCard} />
            <View style={styles.requestSummaryCard}>
              <View style={styles.paymentRow}><Text style={styles.paymentLabel}>Carer rate ({quoteCard?.rate || "visit"})</Text><Text style={styles.paymentValue}>{curr} {quoteCard?.finalPrice || "-"}</Text></View>
              <View style={styles.paymentRow}><Text style={styles.paymentLabel}>Platform care fee (10%)</Text><Text style={styles.paymentValue}>{curr} {serviceFeeAmount.toFixed(serviceFeeAmount % 1 === 0 ? 0 : 2)}</Text></View>
              <View style={styles.paymentDivider} />
              <View style={styles.paymentRow}><Text style={styles.cardTitle}>Total due</Text><Text style={styles.cardTitle}>{curr} {totalDue.toFixed(totalDue % 1 === 0 ? 0 : 2)}</Text></View>
            </View>

            <Text style={styles.fieldLabel}>Emergency contact</Text>
            <NativePhoneField
              defaultCountryCode={phoneCountryCode}
              error={attempted && missingEmergency}
              onChangeText={setEmergencyContact}
              onValidityChange={setEmergencyContactValid}
              placeholder="Phone number"
              showFormatWarning={attempted}
              value={emergencyContact}
            />

            <View onLayout={registerPaymentField("instructions")}>
              <Text style={styles.fieldLabel}>Care instructions</Text>
              <AppModalField error={attempted && missingInstructions} focused={focusedField === "instructions"} value={careInstructions} onBlur={() => setFocusedField(null)} onChangeText={setCareInstructions} onFocus={() => focusPaymentField("instructions")} multiline placeholder="Anything the provider must follow" />
            </View>

            <View onLayout={registerPaymentField("vet")}>
              <Text style={styles.fieldLabel}>Emergency vet contact</Text>
              <AppModalField focused={focusedField === "vet"} value={emergencyVetContact} onBlur={() => setFocusedField(null)} onChangeText={setEmergencyVetContact} onFocus={() => focusPaymentField("vet")} placeholder="Optional" />
            </View>
            <ImportCheckbox checked={Boolean(emergencyVetContact.trim())} label="Import vet contact from pet profile" onToggle={applyVetContactFromPet} />

            <View onLayout={registerPaymentField("medication")}>
              <Text style={styles.fieldLabel}>Medication / allergy notes</Text>
              <AppModalField focused={focusedField === "medication"} value={medicationAllergyNotes} onBlur={() => setFocusedField(null)} onChangeText={setMedicationAllergyNotes} onFocus={() => focusPaymentField("medication")} placeholder="Optional" />
            </View>
            <ImportCheckbox checked={Boolean(medicationAllergyNotes.trim())} label="Import medication record from pet profile" onToggle={applyMedicationFromPet} />

            <View onLayout={registerPaymentField("behavior")}>
              <Text style={styles.fieldLabel}>Behavior / escape risk</Text>
              <AppModalField focused={focusedField === "behavior"} value={behaviorEscapeRisk} onBlur={() => setFocusedField(null)} onChangeText={setBehaviorEscapeRisk} onFocus={() => focusPaymentField("behavior")} placeholder="Optional" />
            </View>

            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: emergencyVetPermission }} onPress={() => setEmergencyVetPermission((value) => !value)} style={styles.checkboxRowTop}>
              <View style={[styles.checkbox, emergencyVetPermission ? styles.checkboxActive : null]}>{emergencyVetPermission ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}</View>
              <Text style={styles.checkboxText}>Pre-approve emergency vet care and emergency contact.</Text>
            </Pressable>

            <View style={styles.paymentInfoBox}>
              <Text style={styles.paymentInfoTitle}>Start PIN</Text>
              <Text style={styles.paymentInfoText}>Share the Start PIN with the carer only <Text style={styles.paymentInfoTextBold}>after</Text> handing over your pet to begin care.</Text>
            </View>

            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: termsAccepted }} onPress={openTermsSheet} style={styles.checkboxRowTop}>
              <View style={[styles.checkbox, attempted && missingTerms ? styles.checkboxError : null, termsAccepted ? styles.checkboxActive : null]}>{termsAccepted ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}</View>
              <Text style={styles.checkboxText}>I agree to the booking details, <Text onPress={openTermsSheet} style={styles.checkboxLinkText}>terms</Text>, and PIN handoff process.</Text>
            </Pressable>
          </AppBottomSheetScroll>
          <AppBottomSheetFooter>
            <SlideToConfirm busy={sending || paymentAttempting} label="Slide to Pay" onCommit={submit} resetKey={slideResetKey} />
          </AppBottomSheetFooter>
        </AppBottomSheet>
        <AppConfirmModal
          body={(
            <View style={styles.petRefillBody}>
              <Text style={styles.paymentInfoText}>{petRefillTarget?.field === "vet" ? "Add a vet contact to this pet profile and use it for this booking." : "Add a medication record to this pet profile and use it for this booking."}</Text>
              {selectedPets.length > 1 && petRefillTarget?.field === "medications" ? (
                <View style={styles.petChoiceWrap}>
                  {selectedPets.map((pet) => (
                    <Pressable key={pet.id} accessibilityRole="button" onPress={() => setPetRefillTarget((current) => current ? { ...current, petId: pet.id } : current)} style={[styles.petChoiceChip, petRefillTarget.petId === pet.id ? styles.petChoiceChipActive : null]}>
                      <Text style={[styles.petChoiceText, petRefillTarget.petId === pet.id ? styles.petChoiceTextActive : null]}>{pet.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {petRefillTarget?.field === "vet" ? (
                <>
                  <AppModalField error={petRefillAttempted && !vetClinicDraft.trim()} onChangeText={setVetClinicDraft} placeholder="Clinic name" value={vetClinicDraft} />
                  <AppModalField error={petRefillAttempted && !vetNameDraft.trim()} onChangeText={setVetNameDraft} placeholder="Preferred vet" value={vetNameDraft} />
                  <NativePhoneField
                    defaultCountryCode={phoneCountryCode}
                    error={petRefillAttempted && !vetPhoneDraft.trim()}
                    onChangeText={setVetPhoneDraft}
                    placeholder="Phone number"
                    showFormatWarning={petRefillAttempted}
                    value={vetPhoneDraft}
                  />
                </>
              ) : (
                <>
                  <AppModalField error={petRefillAttempted && !medicationNameDraft.trim()} onChangeText={setMedicationNameDraft} placeholder="Medication name" value={medicationNameDraft} />
                  <AppModalField error={petRefillAttempted && !medicationDosageDraft.trim()} onChangeText={setMedicationDosageDraft} placeholder="Dosage" value={medicationDosageDraft} />
                  <AppModalField error={petRefillAttempted && !medicationFrequencyDraft.trim()} onChangeText={setMedicationFrequencyDraft} placeholder="Frequency" value={medicationFrequencyDraft} />
                </>
              )}
            </View>
          )}
          cancel="Cancel"
          confirm="Save"
          onCancel={closePetRefill}
          onConfirm={() => void savePetRefill()}
          open={Boolean(petRefillTarget)}
          title={petRefillTarget?.field === "vet" ? "Add vet contact" : "Add medication"}
        />
        <Modal animationType="fade" onRequestClose={() => setTermsSheetVisible(false)} transparent visible={termsSheetVisible}>
          <View style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]}>
            <Pressable accessibilityLabel="Close booking terms" onPress={() => setTermsSheetVisible(false)} style={StyleSheet.absoluteFill} />
            <View {...termsSheetPanResponder.panHandlers} style={styles.termsModalBoundary}>
              <View style={styles.termsModalCard}>
                <View style={styles.termsModalHeader}>
                  <Text style={styles.termsModalTitle}>Care Service Booking Terms</Text>
                  <AppModalIconButton accessibilityLabel="Close booking terms" onPress={() => setTermsSheetVisible(false)}>
                    <Feather color={huddleColors.text} name="x" size={24} />
                  </AppModalIconButton>
                </View>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  onContentSizeChange={(_width, height) => {
                    if (height <= 520) setTermsScrolled(true);
                  }}
                  onScroll={(event) => {
                    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
                    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - huddleSpacing.x3) setTermsScrolled(true);
                  }}
                  scrollEventThrottle={16}
                  style={styles.termsSheetScroll}
                  contentContainerStyle={styles.termsSheetContent}
                >
                  {bookingTermsPage ? (
                    <>
                      {bookingTermsPage.intro.map((paragraph, index) => (
                        <Text key={`booking-intro-${index}`} style={styles.termsSheetText}>{paragraph}</Text>
                      ))}
                      {bookingTermsPage.sections.map((section) => (
                        <View key={section.title} style={styles.termsLegalSection}>
                          <Text style={styles.termsLegalTitle}>{section.title}</Text>
                          {section.body.map((paragraph, index) => (
                            <Text key={`${section.title}-${index}`} style={styles.termsSheetText}>{paragraph}</Text>
                          ))}
                        </View>
                      ))}
                      <Text style={styles.termsSheetText}>{bookingTermsPage.effectiveDate}</Text>
                    </>
                  ) : null}
                </ScrollView>
                <View style={styles.termsModalFooter}>
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: termsAccepted, disabled: !termsScrolled }} onPress={acceptTermsFromSheet} style={[styles.termsConfirmRow, !termsScrolled ? styles.termsConfirmRowDisabled : null]}>
                    <View style={[styles.checkbox, termsAccepted ? styles.checkboxActive : null]}>
                      {termsAccepted ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}
                    </View>
                    <Text style={styles.checkboxText}>I have read and agree to the Care Service Booking Terms.</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ImportCheckbox({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onToggle} style={styles.importCheckboxRow}>
      <View style={[styles.checkbox, checked ? styles.checkboxActive : null]}>{checked ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}</View>
      <Text style={styles.checkboxText}>{label}</Text>
    </Pressable>
  );
}

function StartPinInput({ error, onChangeText, stacked = false, value }: { error: boolean; onChangeText: (value: string) => void; stacked?: boolean; value: string }) {
  const inputRef = useRef<TextInput | null>(null);
  const digits = Array.from({ length: 4 }, (_, index) => value[index] || "");
  return (
    <Pressable
      accessibilityLabel="Start PIN"
      accessibilityRole="button"
      onPress={() => inputRef.current?.focus()}
      style={[styles.startPinInputShell, stacked ? styles.startPinInputShellStacked : null, error ? styles.startPinInputShellError : null]}
    >
      {digits.map((digit, index) => (
        <View key={`pin-input-${index}`} style={[styles.startPinInputBox, error ? styles.startPinInputBoxError : null]}>
          <Text style={[styles.startPinInputDigit, !digit ? styles.startPinInputDigitEmpty : null]}>{digit || ""}</Text>
        </View>
      ))}
      <TextInput
        ref={inputRef}
        accessibilityLabel="4-digit Start PIN"
        autoComplete="one-time-code"
        keyboardType="number-pad"
        maxLength={4}
        onChangeText={onChangeText}
        style={styles.startPinHiddenInput}
        textContentType="oneTimeCode"
        value={value}
      />
    </Pressable>
  );
}

function StartCareSheet({
  accessToken,
  currentUserId,
  initialPin,
  open,
  onClose,
  onError,
  onOpenSupport,
  onSubmit,
  sending,
}: {
  accessToken?: string | null;
  currentUserId: string | null;
  initialPin?: string;
  open: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  onOpenSupport: () => void;
  onSubmit: (startPin: string, photoUrl: string) => Promise<void>;
  sending: boolean;
}) {
  const [media, setMedia] = useState<NativeSocialComposerMedia | null>(null);
  const [pin, setPin] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [agreementScrolled, setAgreementScrolled] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [slideResetKey, setSlideResetKey] = useState(0);
  const providerAgreementPage = useMemo(() => getNativeLegalPage("/service-provider-agreement"), []);
  useEffect(() => {
    if (!open) return;
    setMedia(null);
    setPin(sanitizeStartPin(initialPin));
    setConfirmed(false);
    setAgreementOpen(false);
    setAgreementScrolled(false);
    setAttempted(false);
    setSlideResetKey((value) => value + 1);
  }, [initialPin, open]);
  const openProviderAgreement = useCallback(() => {
    setAgreementScrolled(false);
    setAgreementOpen(true);
  }, []);
  const acceptProviderAgreement = useCallback(() => {
    if (!agreementScrolled) return;
    setConfirmed(true);
    setAgreementOpen(false);
  }, [agreementScrolled]);
  const pickPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ["images"],
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 0.86,
      selectionLimit: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setMedia({
      durationSeconds: typeof asset.duration === "number" ? asset.duration / 1000 : null,
      height: asset.height,
      kind: "image",
      mimeType: asset.mimeType,
      name: asset.fileName,
      size: asset.fileSize,
      uri: asset.uri,
      width: asset.width,
    });
  }, []);
  const submit = useCallback(async () => {
    setAttempted(true);
    if (!currentUserId || !media || !/^[0-9]{4}$/.test(pin) || !confirmed) {
      haptic.error();
      setSlideResetKey((value) => value + 1);
      return;
    }
    setUploading(true);
    try {
      const photoUrl = await uploadNativeSocialImage(currentUserId, media, "review", accessToken);
      await onSubmit(pin, photoUrl);
    } catch {
      onError("Unable to upload check-in photo.");
    } finally {
      setUploading(false);
    }
  }, [accessToken, confirmed, currentUserId, media, onError, onSubmit, pin]);
  return (
    <Modal animationType="slide" transparent visible={open} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close start care sheet" onPress={onClose} style={StyleSheet.absoluteFill} />
        <AppBottomSheet mode="content" onClose={onClose}>
          <View style={styles.startCareSheetHeader}>
            <View style={styles.sheetTitleBlock}>
              <Text style={[nativeModalStyles.appModalSheetTitle, styles.startCareSheetTitle]}>Start Care Session</Text>
              <Text style={styles.sheetSubtitle}>Please enter the PIN and upload a handoff photo to begin the session.</Text>
            </View>
            <AppModalIconButton accessibilityLabel="Close start care sheet" onPress={onClose}>
              <Feather color={huddleColors.text} name="x" size={24} />
            </AppModalIconButton>
          </View>
          <AppBottomSheetScroll contentContainerStyle={styles.paymentBody}>
            <View style={styles.startCareInputStack}>
              <Pressable accessibilityRole="button" onPress={pickPhoto} style={[styles.checkinPhotoButton, styles.checkinPhotoButtonStacked, attempted && !media ? styles.checkinPhotoButtonError : null]}>
                {media ? (
                  <ExpoImage contentFit="cover" source={{ uri: media.uri }} style={styles.checkinPhotoPreview} />
                ) : (
                  <>
                    <Feather color={huddleColors.blue} name="camera" size={22} />
                    <Text style={styles.checkinPhotoText}>Capture pet or handoff</Text>
                  </>
                )}
              </Pressable>
              <StartPinInput
                error={attempted && !/^[0-9]{4}$/.test(pin)}
                onChangeText={(value) => setPin(value.replace(/\D/g, "").slice(0, 4))}
                stacked
                value={pin}
              />
            </View>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }} onPress={openProviderAgreement} style={styles.checkboxRowTop}>
              <View style={[styles.checkbox, attempted && !confirmed ? styles.checkboxError : null, confirmed ? styles.checkboxActive : null]}>{confirmed ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}</View>
              <Text style={styles.checkboxText}>
                I confirm I've met the pet, reviewed care details, and agree to the{" "}
                <Text onPress={openProviderAgreement} style={styles.checkboxLinkText}>Care Provider Agreement</Text>
                . Submitting starts the booking.
              </Text>
            </Pressable>
            <Text style={styles.checkinWarningText}>
              If anything is off, document it in your chat with the owner with photos or contact{" "}
              <Text accessibilityRole="link" onPress={onOpenSupport} style={styles.checkboxLinkText}>Support</Text>
              {" "}before hitting start.
            </Text>
          </AppBottomSheetScroll>
          <AppBottomSheetFooter>
            <SlideToConfirm
              busy={sending || uploading}
              label="Start Care Session"
              onCommit={() => void submit()}
              resetKey={slideResetKey}
            />
          </AppBottomSheetFooter>
        </AppBottomSheet>
        <Modal animationType="fade" onRequestClose={() => setAgreementOpen(false)} transparent visible={agreementOpen}>
          <View style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]}>
            <Pressable accessibilityLabel="Close Care Provider Agreement" onPress={() => setAgreementOpen(false)} style={StyleSheet.absoluteFill} />
            <View style={styles.termsModalBoundary}>
              <View style={styles.termsModalCard}>
                <View style={styles.termsModalHeader}>
                  <Text style={styles.termsModalTitle}>Care Provider Agreement</Text>
                  <AppModalIconButton accessibilityLabel="Close Care Provider Agreement" onPress={() => setAgreementOpen(false)}>
                    <Feather color={huddleColors.text} name="x" size={24} />
                  </AppModalIconButton>
                </View>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  onContentSizeChange={(_width, height) => {
                    if (height <= 520) setAgreementScrolled(true);
                  }}
                  onScroll={(event) => {
                    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
                    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - huddleSpacing.x3) setAgreementScrolled(true);
                  }}
                  scrollEventThrottle={16}
                  style={styles.termsSheetScroll}
                  contentContainerStyle={styles.termsSheetContent}
                >
                  {providerAgreementPage ? (
                    <>
                      {providerAgreementPage.intro.map((paragraph, index) => (
                        <Text key={`provider-intro-${index}`} style={styles.termsSheetText}>{paragraph}</Text>
                      ))}
                      {providerAgreementPage.sections.map((section) => (
                        <View key={section.title} style={styles.termsLegalSection}>
                          <Text style={styles.termsLegalTitle}>{section.title}</Text>
                          {section.body.map((paragraph, index) => (
                            <Text key={`${section.title}-${index}`} style={styles.termsSheetText}>{paragraph}</Text>
                          ))}
                        </View>
                      ))}
                      <Text style={styles.termsSheetText}>{providerAgreementPage.effectiveDate}</Text>
                    </>
                  ) : null}
                </ScrollView>
                <View style={styles.termsModalFooter}>
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: confirmed, disabled: !agreementScrolled }} onPress={acceptProviderAgreement} style={[styles.termsConfirmRow, !agreementScrolled ? styles.termsConfirmRowDisabled : null]}>
                    <View style={[styles.checkbox, confirmed ? styles.checkboxActive : null]}>
                      {confirmed ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}
                    </View>
                    <Text style={styles.checkboxText}>I have read and agree to the Care Provider Agreement.</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function IssueReportSheet({
  accessToken,
  currentUserId,
  isRequester,
  open,
  onClose,
  onError,
  onSubmit,
  sending,
}: {
  accessToken?: string | null;
  currentUserId: string | null;
  isRequester: boolean;
  open: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  onSubmit: (reason: string, note: string, evidenceUrls: string[]) => Promise<void>;
  sending: boolean;
}) {
  const issueReasons = isRequester ? OWNER_SERVICE_ISSUE_REASONS : CARER_SERVICE_ISSUE_REASONS;
  const [reason, setReason] = useState(issueReasons[0]);
  const [note, setNote] = useState("");
  const [noteFocused, setNoteFocused] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [media, setMedia] = useState<NativeSocialComposerMedia | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [slideResetKey, setSlideResetKey] = useState(0);
  const reportScrollRef = useRef<ScrollView | null>(null);
  const reportNoteOffsetRef = useRef(0);
  useEffect(() => {
    if (!open) return;
    setReason(issueReasons[0]);
    setNote("");
    setNoteFocused(false);
    setAcknowledged(false);
    setMedia(null);
    setAttempted(false);
    setSlideResetKey((key) => key + 1);
  }, [issueReasons, open]);
  const pickEvidence = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ["images"],
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 0.86,
      selectionLimit: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setMedia({ durationSeconds: typeof asset.duration === "number" ? asset.duration / 1000 : null, height: asset.height, kind: "image", mimeType: asset.mimeType, name: asset.fileName, size: asset.fileSize, uri: asset.uri, width: asset.width });
  }, []);
  const submit = useCallback(async () => {
    setAttempted(true);
    if (!reason.trim() || !note.trim() || !acknowledged) {
      haptic.error();
      setSlideResetKey((key) => key + 1);
      return;
    }
    setUploading(true);
    try {
      const evidenceUrls = media && currentUserId ? [await uploadNativeSocialImage(currentUserId, media, "review", accessToken)] : [];
      await onSubmit(reason, note.trim(), evidenceUrls);
    } catch {
      onError("Unable to submit issue report.");
    } finally {
      setUploading(false);
    }
  }, [accessToken, acknowledged, currentUserId, media, note, onError, onSubmit, reason]);
  const focusReportNote = useCallback(() => {
    setNoteFocused(true);
    const scroll = () => {
      reportScrollRef.current?.scrollTo({
        animated: true,
        y: Math.max(0, reportNoteOffsetRef.current - huddleSpacing.x4),
      });
    };
    requestAnimationFrame(scroll);
    setTimeout(scroll, 180);
  }, []);
  return (
    <Modal animationType="slide" transparent visible={open} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close issue report sheet" onPress={onClose} style={StyleSheet.absoluteFill} />
        <AppBottomSheet mode="large" onClose={onClose}>
          <AppBottomSheetHeader>
            <Text style={nativeModalStyles.appModalSheetTitle}>Report Issues</Text>
            <AppModalIconButton accessibilityLabel="Close report issues sheet" disabled={sending || uploading} onPress={onClose}>
              <Feather color={huddleColors.text} name="x" size={24} />
            </AppModalIconButton>
          </AppBottomSheetHeader>
          <AppBottomSheetScroll contentContainerStyle={styles.paymentBody} scrollRef={reportScrollRef}>
            <View style={styles.paymentInfoBox}>
              <Text style={styles.paymentInfoText}>{SERVICE_SAFETY_REVIEW_COPY}</Text>
            </View>
            <Text style={styles.fieldLabel}>Reason</Text>
            <View style={styles.chipWrap}>{issueReasons.map((item) => <Pressable key={item} onPress={() => setReason(item)} style={[styles.chip, reason === item ? styles.chipActive : null]}><Text style={[styles.chipText, reason === item ? styles.chipTextActive : null]}>{item}</Text></Pressable>)}</View>
            <View onLayout={(event) => { reportNoteOffsetRef.current = event.nativeEvent.layout.y; }}>
              <Text style={styles.fieldLabel}>Short note</Text>
              <AppModalField error={attempted && !note.trim()} focused={noteFocused} multiline onBlur={() => setNoteFocused(false)} onChangeText={setNote} onFocus={focusReportNote} placeholder="Describe what happened" style={styles.completionNoteField} value={note} />
            </View>
            <Pressable accessibilityRole="button" onPress={pickEvidence} style={styles.checkinPhotoButton}>
              {media ? <ExpoImage contentFit="cover" source={{ uri: media.uri }} style={styles.checkinPhotoPreview} /> : <><Feather color={huddleColors.blue} name="camera" size={22} /><Text style={styles.checkinPhotoText}>Add optional evidence</Text></>}
            </Pressable>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: acknowledged }} onPress={() => setAcknowledged((value) => !value)} style={styles.checkboxRowTop}>
              <View style={[styles.checkbox, attempted && !acknowledged ? styles.checkboxError : null, acknowledged ? styles.checkboxActive : null]}>{acknowledged ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}</View>
              <Text style={styles.checkboxText}>I understand huddle may review the booking, payment status, Start PIN activity, check-in records, completion records, and related conversation activity.</Text>
            </Pressable>
          </AppBottomSheetScroll>
          <AppBottomSheetFooter>
            <SlideToConfirm busy={sending || uploading} label="Slide to Submit Report" onCommit={() => void submit()} resetKey={slideResetKey} tone="destructive" />
          </AppBottomSheetFooter>
        </AppBottomSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ReviewSheet({
  accessToken,
  currentUserId,
  hasReportedServiceDispute,
  isRequester,
  open,
  onClose,
  onSubmit,
}: {
  accessToken?: string | null;
  currentUserId: string | null;
  hasReportedServiceDispute: boolean;
  isRequester: boolean;
  open: boolean;
  onClose: () => void;
  onSubmit: (rating: number, tags: string[], text: string, mediaUrls: string[], safetyIncidentReported: boolean) => Promise<void>;
}) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [textFocused, setTextFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [media, setMedia] = useState<ReviewUploadMedia[]>([]);
  const [safetyIncidentReported, setSafetyIncidentReported] = useState(false);
  const [submitResult, setSubmitResult] = useState<ReviewSubmitResult | null>(null);
  const [sliderResetKey, setSliderResetKey] = useState(0);
  const [validationErrors, setValidationErrors] = useState<{ media?: boolean; rating?: boolean; text?: boolean }>({});
  const [shakeAnim, triggerShake] = useShakeAnimation();
  const [animatedRating, setAnimatedRating] = useState(0);
  const starScalesRef = useRef([1, 2, 3, 4, 5].map(() => new Animated.Value(1)));
  const starFillTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const reviewScrollRef = useRef<ScrollView | null>(null);
  const reviewInputOffsetRef = useRef(0);
  const lowRating = rating > 0 && rating <= 3;
  const tags = lowRating
    ? isRequester ? OWNER_NEGATIVE_REVIEW_TAGS : PROVIDER_NEGATIVE_REVIEW_TAGS
    : isRequester ? OWNER_REVIEW_TAGS : PROVIDER_REVIEW_TAGS;
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const hasMediaBlockingSubmit = media.some((item) => item.status === "queued" || item.status === "uploading" || item.status === "error");
  const uploadProgress = useMemo(() => {
    const imageMedia = media.filter((item) => item.kind === "image");
    if (imageMedia.length === 0) return null;
    const uploaded = imageMedia.filter((item) => item.status === "uploaded").length;
    return media.some((item) => item.status === "queued" || item.status === "uploading") ? Math.round((uploaded / imageMedia.length) * 100) : null;
  }, [media]);
  const ratingLabel = rating === 1
    ? "Very poor"
    : rating === 2
      ? "Poor"
      : rating === 3
        ? "Okay"
        : rating === 4
          ? "Good"
          : rating === 5
            ? "Excellent"
            : "";
  const successTitle = submitResult === "reported"
    ? "We’re stepping in."
    : submitResult === "negative"
      ? "We’re on it."
      : "SUCCESS!";
  const successBody = submitResult === "reported"
    ? "We’ve temporarily paused the booking payout while our Trust & Safety team reviews the situation and related conversation activity."
    : submitResult === "negative"
      ? "Sorry things didn’t go smoothly. We’ll review this carefully to help keep huddle safe and trustworthy."
      : "Thanks for your feedback. People like you make this community better for everyone.";

  const clearStarFillTimers = useCallback(() => {
    starFillTimersRef.current.forEach((timer) => clearTimeout(timer));
    starFillTimersRef.current = [];
  }, []);

  const scrollReviewInputIntoView = useCallback(() => {
    const scroll = () => {
      reviewScrollRef.current?.scrollTo({
        animated: true,
        y: Math.max(0, reviewInputOffsetRef.current - huddleSpacing.x5),
      });
    };
    requestAnimationFrame(scroll);
    setTimeout(scroll, 180);
  }, []);

  const selectRating = useCallback((value: number) => {
    haptic.primaryConfirm();
    setRating(value);
    setValidationErrors((current) => ({ ...current, rating: false }));
    setAnimatedRating(0);
    clearStarFillTimers();
    starFillTimersRef.current = Array.from({ length: value }, (_, index) => setTimeout(() => {
      setAnimatedRating(index + 1);
    }, index * 45));
    const scale = starScalesRef.current[value - 1];
    if (scale) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.18, duration: 90, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      ]).start();
    }
  }, [clearStarFillTimers]);

  useEffect(() => {
    if (!open) return;
    setRating(0);
    setAnimatedRating(0);
    setText("");
    setTextFocused(false);
    setMedia([]);
    setSafetyIncidentReported(false);
    setSubmitResult(null);
    setSelectedTags([]);
    setValidationErrors({});
    clearStarFillTimers();
  }, [clearStarFillTimers, open]);

  useEffect(() => () => clearStarFillTimers(), [clearStarFillTimers]);

  useEffect(() => {
    setSelectedTags([]);
    setValidationErrors((current) => ({ ...current, text: false }));
    if (!lowRating || hasReportedServiceDispute) setSafetyIncidentReported(false);
  }, [hasReportedServiceDispute, isRequester, lowRating]);

  useEffect(() => {
    if (!safetyIncidentReported || text.trim()) {
      setValidationErrors((current) => ({ ...current, text: false }));
    }
  }, [safetyIncidentReported, text]);

  const updateSelectedTags = useCallback((next: string[]) => {
    setSelectedTags(next);
  }, []);

  const pickMedia = useCallback(async () => {
    if (!currentUserId) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      orderedSelection: true,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 0.86,
      selectionLimit: Math.max(1, MAX_REVIEW_MEDIA - media.length),
    });
    if (result.canceled) return;
    setValidationErrors((current) => ({ ...current, media: false }));
    const accepted: ReviewUploadMedia[] = result.assets.map((asset) => ({
      durationSeconds: typeof asset.duration === "number" ? asset.duration / 1000 : null,
      height: asset.height,
      kind: "image" as const,
      mimeType: asset.mimeType,
      name: asset.fileName,
      size: asset.fileSize,
      status: "queued" as const,
      uploadedUrl: null,
      uri: asset.uri,
      width: asset.width,
    })).slice(0, Math.max(0, MAX_REVIEW_MEDIA - media.length));
    setMedia((current) => [...current, ...accepted].slice(0, MAX_REVIEW_MEDIA));
    const uploadOne = async (item: ReviewUploadMedia) => {
      setMedia((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, error: null, status: "uploading" } : entry));
      try {
        const uploadedUrl = await uploadNativeSocialImage(currentUserId, item, "review", accessToken);
        setMedia((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, error: null, status: "uploaded", uploadedUrl } : entry));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Image upload failed";
        setMedia((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, error: message, status: "error", uploadedUrl: null } : entry));
      }
    };
    const queue = [...accepted];
    requestAnimationFrame(() => {
      void Promise.all(Array.from({ length: Math.min(2, queue.length) }, async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (next) await uploadOne(next);
        }
      }));
    });
  }, [accessToken, currentUserId, media.length]);

  const submit = async () => {
    const nextErrors = {
      media: hasMediaBlockingSubmit,
      rating: rating <= 0,
      text: lowRating && safetyIncidentReported && text.trim().length === 0,
    };
    setValidationErrors(nextErrors);
    if (nextErrors.rating || nextErrors.media || nextErrors.text) {
      haptic.error();
      triggerShake();
      setSliderResetKey((current) => current + 1);
      return;
    }
    setSubmitting(true);
    try {
      const mediaUrls = media.map((item) => item.uploadedUrl).filter(Boolean) as string[];
      const reported = lowRating && safetyIncidentReported && !hasReportedServiceDispute;
      const result: ReviewSubmitResult = reported ? "reported" : lowRating ? "negative" : "positive";
      await onSubmit(rating, selectedTags, text, mediaUrls, reported);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSubmitResult(result);
      setTimeout(() => haptic.swipeReturn(), 220);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={open} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close review sheet" onPress={onClose} style={StyleSheet.absoluteFill} />
        <AppBottomSheet mode="autoMax" onClose={onClose} style={submitResult ? styles.reviewSuccessSheet : null}>
          <AppBottomSheetHeader>
            <View style={styles.reviewHeaderTitleWrap}>
              <Text style={nativeModalStyles.appModalSheetTitle}>{submitResult ? "" : "Leave a review"}</Text>
            </View>
            <AppModalIconButton accessibilityLabel="Close review sheet" onPress={onClose}>
              <Feather color={huddleColors.text} name="x" size={24} />
            </AppModalIconButton>
          </AppBottomSheetHeader>
          {submitResult ? (
            <View style={styles.reviewSuccessContent}>
              <Text style={styles.reviewSuccessTitle}>{successTitle}</Text>
              <Text style={styles.reviewSuccessBody}>{successBody}</Text>
            </View>
          ) : (
          <>
          <AppBottomSheetScroll scrollRef={reviewScrollRef}>
            <View style={styles.reviewRatingBlock}>
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Pressable key={value} onPress={() => selectRating(value)} style={styles.starButton}>
                    <Animated.View style={{ transform: [{ scale: starScalesRef.current[value - 1] }] }}>
                      <FontAwesome color={validationErrors.rating ? huddleColors.fieldErrorBorder : value <= animatedRating ? huddleColors.premiumGold : huddleColors.iconSubtle} name={value <= animatedRating ? "star" : "star-o"} size={30} />
                    </Animated.View>
                  </Pressable>
                ))}
              </View>
              {ratingLabel ? <Text style={[styles.reviewRatingLabel, rating >= 4 ? styles.reviewRatingLabelPositive : styles.reviewRatingLabelNegative]}>{`"${ratingLabel}"`}</Text> : null}
            </View>
            <ReviewSelectChips options={tags} selected={selectedTags} onChange={updateSelectedTags} />
            <View onLayout={(event) => { reviewInputOffsetRef.current = event.nativeEvent.layout.y; }}>
              <AppModalField
                focused={textFocused}
                error={validationErrors.text}
                multiline
                onBlur={() => setTextFocused(false)}
                onChangeText={(value) => {
                  setText(value);
                  if (value.trim()) setValidationErrors((current) => ({ ...current, text: false }));
                }}
                onFocus={() => { setTextFocused(true); scrollReviewInputIntoView(); }}
                placeholder="Share a few details"
                style={styles.reviewTextArea}
                textAlignVertical="top"
                value={text}
              />
            </View>
            {lowRating && !hasReportedServiceDispute ? (
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: safetyIncidentReported }} onPress={() => setSafetyIncidentReported((current) => !current)} style={({ pressed }) => [styles.reviewSafetyRow, pressed ? nativeModalStyles.pressed : null]}>
                <View style={[styles.reviewCheckboxBox, safetyIncidentReported ? styles.reviewCheckboxBoxActive : null]}>{safetyIncidentReported ? <Feather color={huddleColors.onPrimary} name="check" size={12} /> : null}</View>
                <View style={styles.reviewSafetyCopy}>
                  <Text style={styles.reviewSafetyTitle}>Report a safety issue</Text>
                  <Text style={styles.reviewSafetyText}>(Injury, neglect, aggression, missing pet, etc.)</Text>
                </View>
              </Pressable>
            ) : null}
            {lowRating && safetyIncidentReported && !hasReportedServiceDispute ? <Text style={styles.reviewSafetySubtext}>Submitting a report may temporarily place the booking, payment, and related conversation activity under review while we investigate.</Text> : null}
            {media.length > 0 ? (
              <ScrollView bounces={false} directionalLockEnabled horizontal keyboardShouldPersistTaps="handled" nestedScrollEnabled showsHorizontalScrollIndicator={false} style={[styles.reviewMediaRailViewport, validationErrors.media ? styles.reviewMediaRailError : null]} contentContainerStyle={styles.reviewMediaThumbRow}>
                {media.map((item, index) => (
                  <View key={`${item.uri}-${index}`} style={[styles.reviewMediaThumbWrap, { aspectRatio: reviewMediaPreviewAspect(item) }]}>
                    <ExpoImage cachePolicy="memory-disk" contentFit="cover" source={{ uri: item.uri }} style={styles.reviewMediaThumb} transition={120} />
                    {item.status === "uploading" && uploadProgress !== null ? (
                      <View pointerEvents="none" style={styles.reviewMediaUploadingOverlay}>
                        <ActivityIndicator color={huddleColors.onPrimary} size="small" />
                        <Text style={styles.reviewMediaUploadingText}>Uploading {uploadProgress}%</Text>
                      </View>
                    ) : null}
                    {item.status === "error" ? (
                      <View pointerEvents="none" style={styles.reviewMediaUploadingOverlay}>
                        <Feather color={huddleColors.onPrimary} name="alert-triangle" size={18} />
                        <Text style={styles.reviewMediaUploadingText}>Upload failed</Text>
                      </View>
                    ) : null}
                    <Pressable accessibilityLabel="Remove image" accessibilityRole="button" onPress={() => setMedia((current) => current.filter((_, idx) => idx !== index))} style={styles.reviewMediaRemoveButton}><Feather color={huddleColors.onPrimary} name="x" size={14} /></Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </AppBottomSheetScroll>
          <AppBottomSheetFooter>
            <View style={styles.reviewFooterRow}>
              <Pressable accessibilityLabel="Add review images" accessibilityRole="button" disabled={!currentUserId || media.length >= MAX_REVIEW_MEDIA} onPress={pickMedia} style={({ pressed }) => [styles.reviewFooterImageButton, (!currentUserId || media.length >= MAX_REVIEW_MEDIA) ? styles.disabledAction : null, pressed ? nativeModalStyles.pressed : null]}>
                <Feather color={huddleColors.mutedText} name="camera" size={20} />
              </Pressable>
              <Animated.View style={{ flex: 1, transform: [{ translateX: shakeAnim }] }}>
                <SlideToConfirm
                  busy={submitting}
                  label="Slide to Submit"
                  onCommit={() => void submit()}
                  resetKey={sliderResetKey}
                />
              </Animated.View>
            </View>
          </AppBottomSheetFooter>
          </>
          )}
        </AppBottomSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: huddleColors.canvas },
  loadingFill: { flex: 1 },
  loadingInline: { minHeight: 220 },
  header: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, borderBottomWidth: 1, borderBottomColor: huddleColors.divider, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x2, backgroundColor: huddleColors.glassOverlay },
  headerBack: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill },
  peerAvatarButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.canvas },
  peerAvatar: { width: 40, height: 40, borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas },
  identityText: { flex: 1, minWidth: 0 },
  headerTitle: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  headerSubtitle: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  statusPill: { overflow: "hidden", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x1, backgroundColor: huddleColors.mutedCanvas, fontFamily: "Urbanist-700", fontSize: huddleType.meta, lineHeight: huddleType.metaLine, color: huddleColors.mutedText },
  statusBookedActive: { backgroundColor: huddleColors.blueSoft, color: huddleColors.blue },
  statusCompleted: { backgroundColor: huddleColors.successSoft, color: huddleColors.success },
  statusDisputed: { backgroundColor: huddleColors.validationSoft, color: huddleColors.coral },
  timelineBannerWrap: { width: "100%", zIndex: 1 },
  content: { flexGrow: 1, gap: huddleSpacing.x3, paddingHorizontal: huddleSpacing.x4, paddingTop: huddleSpacing.x3, paddingBottom: huddleSpacing.x6 },
  contentKeyboard: { paddingBottom: huddleSpacing.x2 },
  messagesScroll: { flex: 1 },
  careScopeCard: { gap: huddleSpacing.x2, borderBottomWidth: 1, borderBottomColor: huddleColors.divider, backgroundColor: huddleColors.canvas, paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x3 },
  timelineCard: { gap: huddleSpacing.x2, borderBottomWidth: 1, borderBottomColor: huddleColors.divider, backgroundColor: huddleColors.canvas, paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x3 },
  timelineCardCollapsed: { paddingVertical: huddleSpacing.x1 },
  timelineHeader: { minHeight: huddleType.labelLine * 2, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  timelineHeaderCopy: { flex: 1, minWidth: 0 },
  timelineCollapsedTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.body, lineHeight: huddleType.labelLine, color: huddleColors.text },
  timelineSummary: { marginTop: 2, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  timelineProgressTrack: { height: 3, marginTop: huddleSpacing.x2, overflow: "hidden", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.divider },
  timelineProgressFill: { height: "100%", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blue },
  careScopeHeader: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  careScopeHeaderText: { flex: 1, minWidth: 0 },
  careScopeHeaderLine: { fontFamily: "Urbanist-800", fontSize: huddleType.body, lineHeight: huddleType.labelLine, color: huddleColors.text },
  careScopeCollapsedSummary: { marginTop: 2, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  // --- Editorial glass card (Care Scope + Booking Timeline) ---
  glassCard: { position: "relative", overflow: "hidden", marginHorizontal: huddleSpacing.x3, marginBottom: 0, borderRadius: huddleRadii.glass, borderWidth: 1, borderColor: huddleColors.glassBorder, backgroundColor: huddleColors.glassOverlay, ...huddleShadows.glassElevation1 },
  glassCardCollapsed: {},
  glassCardInner: { paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x4, gap: huddleSpacing.x2 },
  timelineCollapsedHeader: { paddingTop: huddleSpacing.x2, paddingBottom: huddleSpacing.x2 },
  careScopeCollapsedHeader: { paddingTop: huddleSpacing.x2, paddingBottom: huddleSpacing.x3 },
  phaseStrip: { position: "absolute", top: 0, bottom: 0, left: 0, width: 3, borderTopLeftRadius: huddleRadii.glass, borderBottomLeftRadius: huddleRadii.glass },
  // --- Booking Timeline (stitched ribbon) ---
  timelineTitleRow: { minHeight: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x3 },
  inlineHideButton: { width: 44, minHeight: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: huddleSpacing.x1 },
  inlineHideText: { fontFamily: "Urbanist-700", fontSize: huddleType.meta, lineHeight: huddleType.metaLine, color: huddleColors.mutedText },
  timelineTopRow: { minHeight: 18, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3 },
  timelineProgressAndHideRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" },
  stitchedRibbon: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  ribbonDone: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  ribbonSkipped: { width: 16, height: 16, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderStrong, backgroundColor: huddleColors.mutedCanvas },
  ribbonCurrent: { width: 10, height: 10, borderRadius: 5, backgroundColor: huddleColors.blue, shadowColor: huddleColors.blue, shadowOpacity: 0.45, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  ribbonCurrentDisputed: { backgroundColor: huddleColors.validationRed, shadowColor: huddleColors.validationRed },
  ribbonAhead: { width: 4, height: 4, borderRadius: 2, backgroundColor: huddleColors.fieldBorderStrong },
  timelineCurrentLabel: { fontFamily: "Urbanist-800", fontSize: huddleType.body, lineHeight: huddleType.body * huddleType.lineSnug, color: huddleColors.text, fontVariant: ["tabular-nums"] },
  timelineCurrentLabelTerminal: { color: huddleColors.success },
  timelineExpandedList: { marginTop: huddleSpacing.x2, paddingTop: huddleSpacing.x2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: huddleColors.sectionDividerStrong, gap: huddleSpacing.x2 },
  timelineExpandedListNoBorder: { marginTop: 0, paddingTop: 0, borderTopWidth: 0 },
  timelineDotCurrent: { borderColor: huddleColors.blue, backgroundColor: huddleColors.canvas, borderWidth: 2 },
  timelineDotCurrentDisputed: { borderColor: huddleColors.validationRed, backgroundColor: huddleColors.validationSoft },
  timelineLabelCurrent: { color: huddleColors.text, fontFamily: "Urbanist-700" },
  timelineLabelDate: { fontFamily: "Urbanist-600", color: huddleColors.mutedText },
  // --- Care Scope (editorial layout) ---
  scopeHeadlineBlock: { gap: 2 },
  scopeHeaderTopRow: { minHeight: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x3 },
  scopeHeaderBottomRow: { minHeight: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x3 },
  scopeSubtitleAndHideRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x3 },
  scopeHeadlineCopy: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: huddleSpacing.x1 },
  scopePinSlot: { flexShrink: 0, minHeight: 24, alignItems: "flex-end", justifyContent: "center" },
  scopeHeadlineMuted: { fontFamily: "Urbanist-500", fontSize: huddleType.body, lineHeight: huddleType.body * huddleType.lineSnug, color: huddleColors.mutedText },
  scopeSubtitleRow: { flex: 1, minWidth: 0, minHeight: 24, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: huddleSpacing.x2 },
  scopeSubtitle: { flexShrink: 1, minWidth: 0, fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text, fontVariant: ["tabular-nums"] },
  startPinDigits: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1, borderRadius: huddleRadii.card, borderWidth: 1, borderColor: huddleColors.fieldFocusBorder, backgroundColor: huddleColors.primarySoftFill, paddingHorizontal: huddleSpacing.x2, paddingVertical: huddleSpacing.x1 },
  startPinDigitBox: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.button - 4, borderWidth: 1, borderColor: huddleColors.fieldFocusBorder, backgroundColor: huddleColors.blueSoft },
  startPinDigitText: { fontFamily: "Urbanist-800", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.blue, fontVariant: ["tabular-nums"] },
  scopeMeta: { fontFamily: "Urbanist-500", fontSize: huddleType.helper + 1, lineHeight: (huddleType.helper + 1) * huddleType.lineNormal, color: huddleColors.mutedText, fontVariant: ["tabular-nums"] },
  scopeHairline: { height: StyleSheet.hairlineWidth, marginVertical: huddleSpacing.x2, backgroundColor: huddleColors.sectionDividerStrong },
  scopeExpandedScroll: { maxHeight: 520, paddingHorizontal: huddleSpacing.x4 },
  scopeExpandedBody: { gap: huddleSpacing.x3, paddingBottom: huddleSpacing.x4 },
  // detail rows (Time / Setting / Payment) — two-column with eyebrow label
  scopeDetailGrid: { flex: 1, minWidth: 0, gap: huddleSpacing.x2 },
  scopeDetailRow: { flexDirection: "row", alignItems: "flex-start", gap: huddleSpacing.x3 },
  scopeDetailLabel: { minWidth: 64, fontFamily: "Urbanist-700", fontSize: huddleType.meta, lineHeight: huddleType.metaLine + 4, letterSpacing: 0.8, color: huddleColors.mutedText, textTransform: "uppercase" },
  scopeDetailValue: { flex: 1, fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text, fontVariant: ["tabular-nums"] },
  startPinDetailCard: { flexShrink: 0, alignItems: "center" },
  startPinDetailLabel: { fontFamily: "Urbanist-800", fontSize: huddleType.meta, lineHeight: huddleType.metaLine + 4, letterSpacing: 0.8, color: huddleColors.blue, textTransform: "uppercase" },
  startPinDetailDigits: { flexDirection: "row", alignItems: "center", gap: 0 },
  startPinDetailDigitBox: { width: 20, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: huddleColors.fieldFocusBorder, backgroundColor: huddleColors.blueSoft },
  startPinDetailDigitText: { fontFamily: "Urbanist-800", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.blue, fontVariant: ["tabular-nums"] },
  // note block (full-width body)
  scopeEyebrowText: { fontFamily: "Urbanist-700", fontSize: huddleType.meta, lineHeight: huddleType.metaLine + 4, letterSpacing: 0.8, color: huddleColors.mutedText, textTransform: "uppercase" },
  scopeNoteBlock: { gap: huddleSpacing.x1 + 2 },
  scopeNoteText: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.label * huddleType.lineNormal, color: huddleColors.text },
  // actions
  scopeActionRow: { flexDirection: "row", flexWrap: "wrap", gap: huddleSpacing.x2, marginTop: huddleSpacing.x2 },
  scopeActionButton: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1, minHeight: 32, paddingHorizontal: huddleSpacing.x3, borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.primarySoftFill, backgroundColor: huddleColors.canvas },
  scopeActionDestructive: { borderColor: huddleColors.validationSoft },
  scopeActionText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.blue },
  scopeActionTextDestructive: { color: huddleColors.validationRed },
  // --- Pet avatar stack (reusable) ---
  petStack: { flexDirection: "row", alignItems: "center" },
  petStackCircle: { borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  petStackInitial: { fontFamily: "Urbanist-800", color: huddleColors.onPrimary, textAlign: "center" },
  petStackExtra: { backgroundColor: huddleColors.text },
  petStackExtraText: { fontFamily: "Urbanist-800", color: huddleColors.onPrimary, textAlign: "center" },
  timelineList: { gap: huddleSpacing.x2 },
  timelineItem: { minHeight: 24, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  timelineDot: { width: 20, height: 20, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas },
  timelineDotDone: { borderColor: huddleColors.blue, backgroundColor: huddleColors.blue },
  timelineDotDoneTerminal: { borderColor: huddleColors.success, backgroundColor: huddleColors.success },
  timelineDotSkipped: { borderColor: huddleColors.fieldBorderStrong, backgroundColor: huddleColors.mutedCanvas },
  timelineLabel: { flex: 1, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  timelineLabelDone: { color: huddleColors.text },
  timelineLabelDoneTerminal: { color: huddleColors.success },
  timelineLabelSkipped: { color: huddleColors.mutedText, textDecorationLine: "line-through" },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2 },
  cardCollapseHeader: { minHeight: 32, marginHorizontal: -huddleSpacing.x1, paddingHorizontal: huddleSpacing.x1, borderRadius: huddleRadii.card },
  cardCollapseButton: { flex: 1, minWidth: 0, minHeight: 32, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  cardTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  cardPrimary: { fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  cardPrice: { fontFamily: "Urbanist-800", fontSize: huddleType.h4, lineHeight: huddleType.h4Line, color: huddleColors.text },
  cardMeta: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  scopeBody: { gap: huddleSpacing.x1 },
  scopeLine: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  scopeLabel: { fontFamily: "Urbanist-800", color: huddleColors.text },
  mutedLine: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  inlineActions: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  iconBare: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill },
  iconPill: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft },
  disabledAction: { opacity: 0.5 },
  waitCard: { borderRadius: huddleRadii.glass, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, padding: huddleSpacing.x5, alignItems: "center" },
  waitText: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.mutedText, textAlign: "center" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: huddleSpacing.x2, paddingBottom: huddleSpacing.x10 },
  emptyImage: { width: "100%", maxWidth: 300, height: 220 },
  emptyText: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.mutedText, textAlign: "center" },
  emptyName: { fontFamily: "Urbanist-700", color: huddleColors.text },
  noMessagesText: { paddingVertical: huddleSpacing.x7, textAlign: "center", fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.mutedText },
  notice: { flexDirection: "row", gap: huddleSpacing.x2, margin: huddleSpacing.x3, padding: huddleSpacing.x3, borderRadius: huddleRadii.card, borderWidth: 1, borderColor: huddleColors.blue, backgroundColor: huddleColors.blueSoft },
  noticeText: { flex: 1, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  handoffBanner: { gap: huddleSpacing.x3, marginHorizontal: huddleSpacing.x3, marginBottom: huddleSpacing.x2, padding: huddleSpacing.x3, borderRadius: huddleRadii.card, borderWidth: 1, borderColor: huddleColors.blue, backgroundColor: huddleColors.blueSoft },
  handoffBannerCopy: { gap: huddleSpacing.x1 },
  handoffBannerTitleRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  handoffBannerTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.blue },
  handoffBannerText: { fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  messageStack: { gap: 0 },
  messageBlock: { marginVertical: huddleSpacing.x1 },
  systemPill: { alignSelf: "center", maxWidth: "86%", marginVertical: huddleSpacing.x2, overflow: "hidden", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x1, backgroundColor: huddleColors.mutedCanvas, fontFamily: "Urbanist-500", fontSize: 12, lineHeight: 16, color: huddleColors.text, textAlign: "center" },
  systemPillMuted: { backgroundColor: huddleColors.mutedCanvas, color: huddleColors.mutedText },
  systemPillInfo: { backgroundColor: huddleColors.primarySoftFill, color: huddleColors.blue },
  systemPillSuccess: { backgroundColor: huddleColors.successSoft, color: huddleColors.success },
  systemPillWarning: { backgroundColor: huddleColors.validationSoft, color: huddleColors.validationRed },
  dayDivider: { alignSelf: "center", marginVertical: huddleSpacing.x2, paddingHorizontal: 10, paddingVertical: 2, borderRadius: huddleRadii.pill, overflow: "hidden", backgroundColor: huddleColors.toggleOff, fontFamily: "Urbanist-500", fontSize: 11, lineHeight: 14, color: huddleColors.mutedText },
  messageRow: { flexDirection: "row", justifyContent: "flex-start" },
  messageRowMine: { justifyContent: "flex-end" },
  bubble: { maxWidth: "90%", borderRadius: huddleRadii.card, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x2 },
  messageBubbleRich: { paddingTop: 0, paddingHorizontal: 0, paddingBottom: huddleSpacing.x2 },
  messageBubbleMediaOnly: { overflow: "hidden", backgroundColor: "transparent", borderColor: "transparent", paddingBottom: 0 },
  bubbleMine: { backgroundColor: huddleColors.membershipUpgradePlus },
  bubbleTheirs: { backgroundColor: huddleColors.coral },
  bubbleText: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.onPrimary },
  bubbleTextMine: { color: huddleColors.onPrimary },
  messageTextRich: { paddingHorizontal: huddleSpacing.x3, paddingTop: huddleSpacing.x2 },
  messageMeta: { flexDirection: "row", gap: huddleSpacing.x1, marginTop: huddleSpacing.x1, paddingLeft: huddleSpacing.x1 },
  messageMetaMine: { justifyContent: "flex-end", paddingRight: huddleSpacing.x1 },
  messageTime: { fontFamily: "Urbanist-500", fontSize: 11, lineHeight: 14, color: huddleColors.mutedText },
  readMark: { fontFamily: "Urbanist-700", fontSize: 11, lineHeight: 14, color: huddleColors.mutedText },
  chatAttachmentRail: { gap: huddleSpacing.x1 },
  chatAttachmentFrame: { width: 220, height: 180, overflow: "hidden", borderRadius: huddleRadii.card, backgroundColor: huddleColors.primarySoftFill },
  chatAttachmentImage: { width: "100%", height: "100%" },
  uploadRail: { gap: huddleSpacing.x2, paddingRight: huddleSpacing.x6, paddingBottom: huddleSpacing.x1 },
  uploadThumb: { width: huddleSpacing.x9, height: huddleSpacing.x9, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: huddleRadii.button, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.mutedCanvas },
  uploadImage: { width: "100%", height: "100%" },
  uploadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: huddleSpacing.x1, backgroundColor: huddleColors.backdrop },
  uploadingText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: 16, color: huddleColors.onPrimary },
  removeUpload: { position: "absolute", top: 2, right: 2, width: 20, height: 20, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.backdrop },
  dialogueComposerSurface: { gap: huddleSpacing.x2, paddingTop: huddleSpacing.x2, zIndex: 4 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  primaryActionWrap: { flex: 1, minWidth: 0 },
  completedReviewCtaWrap: { width: "100%" },
  composerRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  attachButton: { width: 18, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 0, backgroundColor: "transparent" },
  sendButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blue },
  fieldLabel: { marginTop: huddleSpacing.x3, marginBottom: huddleSpacing.x1, fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  requestCreateLabel: { marginBottom: huddleSpacing.x1 + 2, paddingLeft: huddleSpacing.x1, fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  requestSheetScrollContent: { gap: huddleSpacing.x3, paddingBottom: huddleSpacing.x8 },
  requestFieldHeight: { height: 52, minHeight: 52, maxHeight: 52, paddingVertical: 0, textAlignVertical: "center" },
  requestReadOnlyField: { backgroundColor: huddleColors.mutedCanvas },
  requestSelectMenu: { marginTop: huddleSpacing.x2, borderRadius: huddleFormControls.select.menuRadius, borderWidth: 1, borderColor: huddleFormControls.select.menuBorderColor, padding: huddleFormControls.select.menuPadding, backgroundColor: huddleColors.canvas, ...huddleShadows.glassElevation1 },
  requestSelectMenuInline: { maxHeight: 190, borderRadius: huddleFormControls.select.menuRadius, borderWidth: 1, borderColor: huddleFormControls.select.menuBorderColor, padding: huddleFormControls.select.menuPadding, backgroundColor: huddleColors.canvas },
  requestSelectOption: { minHeight: huddleFormControls.select.optionMinHeight, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2, borderRadius: huddleFormControls.select.optionRadius, paddingHorizontal: huddleFormControls.select.optionPaddingHorizontal, paddingVertical: huddleFormControls.select.optionPaddingVertical },
  requestSelectOptionText: { flex: 1, minWidth: 0, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  requestSelectOptionTextActive: { fontFamily: "Urbanist-700", color: huddleColors.blue },
  requestCheckSlot: { width: huddleFormControls.select.checkSlot, height: huddleFormControls.select.checkSlot },
  requestTwoColumn: { flexDirection: "row", gap: huddleSpacing.x2 },
  requestFlexField: { flex: 1, minWidth: 0, gap: huddleSpacing.x1 + 2 },
  requestRateBlock: { gap: huddleSpacing.x1 + 2 },
  requestRateCompositeField: { minHeight: 52, flexDirection: "row", alignItems: "center", overflow: "hidden", borderRadius: huddleRadii.field, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas },
  requestRateCurrency: { alignSelf: "stretch", minWidth: 72, alignItems: "center", justifyContent: "center", borderRightWidth: 1, borderRightColor: huddleColors.divider, paddingHorizontal: huddleSpacing.x2 },
  requestRatePrice: { flex: 1, minWidth: 0 },
  requestRateInput: { minHeight: 50, height: 50, borderWidth: 0, shadowOpacity: 0, elevation: 0, backgroundColor: "transparent" },
  requestRateUnit: { alignSelf: "stretch", minWidth: 112, alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderLeftColor: huddleColors.divider, paddingHorizontal: huddleSpacing.x2 },
  requestRateText: { fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  requestDateStack: { gap: huddleSpacing.x3 },
  requestDateHeaderRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  requestDateArrowButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  requestDateSelectRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  requestDateSelectButton: { flex: 1, minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2, borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, paddingHorizontal: huddleSpacing.x3, backgroundColor: huddleColors.canvas, ...huddleShadows.glassElevation1 },
  requestYearSelectButton: { flex: 0, minWidth: 108 },
  requestDateSelectText: { flex: 1, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  requestWeekdayGrid: { flexDirection: "row", gap: 6 },
  requestWeekdayText: { flex: 1, textAlign: "center", fontFamily: "Urbanist-500", fontSize: 11, lineHeight: 14, color: huddleColors.mutedText },
  requestCalendarGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  requestCalendarCell: { width: "12.42%", height: 36, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill },
  requestCalendarCellRest: { backgroundColor: huddleColors.mutedCanvas },
  requestCalendarCellToday: { backgroundColor: huddleColors.primarySoftFill },
  requestCalendarCellActive: { backgroundColor: huddleColors.blue },
  requestCalendarCellDisabled: { opacity: 0.46 },
  requestCalendarCellText: { fontFamily: "Urbanist-500", fontSize: huddleType.label, color: huddleColors.text },
  requestCalendarCellTextActive: { color: huddleColors.onPrimary },
  requestCalendarCellTextDisabled: { color: huddleColors.mutedText },
  locationSuggestionCard: { marginTop: huddleSpacing.x2, overflow: "hidden", borderRadius: huddleRadii.card, borderWidth: 1, borderColor: huddleColors.cardBorderSoft, backgroundColor: huddleColors.canvas, ...huddleShadows.glassElevation1 },
  locationSuggestionRow: { minHeight: 48, justifyContent: "center", gap: 2, paddingHorizontal: huddleSpacing.x3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: huddleColors.divider },
  locationSuggestionPrimary: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  locationSuggestionMeta: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: huddleSpacing.x2 },
  chip: { minHeight: 32, justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas, paddingHorizontal: huddleSpacing.x3 },
  chipActive: { borderColor: huddleColors.blue, backgroundColor: huddleColors.blue },
  chipText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  chipTextActive: { color: huddleColors.onPrimary },
  reviewHeaderTitleWrap: { flex: 1, minHeight: 40, justifyContent: "center" },
  reviewSuccessSheet: { maxHeight: 330 },
  reviewSuccessContent: { gap: huddleSpacing.x3, paddingHorizontal: huddleSpacing.x6, paddingTop: huddleSpacing.x3, paddingBottom: huddleSpacing.x8 },
  reviewSuccessTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.h2, lineHeight: huddleType.h2Line, color: huddleColors.text },
  reviewSuccessBody: { fontFamily: "Urbanist-500", fontSize: huddleType.body, lineHeight: huddleType.body * huddleType.lineNormal, color: huddleColors.subtext },
  reviewChipStack: { gap: huddleSpacing.x2, marginBottom: huddleSpacing.x4, marginTop: huddleSpacing.x2, paddingVertical: huddleSpacing.x1 },
  reviewChipRow: { flexDirection: "row", justifyContent: "center", gap: huddleSpacing.x2 },
  reviewChip: { flexShrink: 1, minHeight: 32, justifyContent: "center", alignItems: "center", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas, paddingHorizontal: huddleSpacing.x3, paddingVertical: 0 },
  reviewChipText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text, textAlign: "center" },
  errorText: { marginTop: huddleSpacing.x1, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.validationRed },
  twoColumn: { flexDirection: "row", gap: huddleSpacing.x2 },
  threeColumn: { gap: huddleSpacing.x2 },
  flexField: { flex: 1 },
  priceFieldWrap: { gap: huddleSpacing.x1 },
  checkboxRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, marginTop: huddleSpacing.x2 },
  checkboxRowTop: { minHeight: 44, flexDirection: "row", alignItems: "flex-start", gap: huddleSpacing.x2, marginTop: huddleSpacing.x2 },
  importCheckboxRow: { minHeight: 44, flexDirection: "row", alignItems: "flex-start", gap: huddleSpacing.x2 },
  checkbox: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 9, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas, shadowColor: huddleColors.neutralShadow, shadowOpacity: 0.85, shadowRadius: 13, shadowOffset: { width: 5, height: 5 }, elevation: 1 },
  checkboxActive: { borderColor: huddleColors.blue, backgroundColor: huddleColors.blue },
  checkboxError: { ...huddleFieldStates.error },
  checkboxText: { flex: 1, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.mutedText },
  checkboxLinkText: { fontFamily: "Urbanist-700", color: huddleColors.blue, textDecorationLine: "underline" },
  termsModalBoundary: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x6 },
  termsModalCard: { width: "100%", maxHeight: "86%", overflow: "hidden", borderRadius: huddleRadii.sheet, backgroundColor: huddleColors.canvas },
  termsModalHeader: { minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x4, borderBottomWidth: 1, borderBottomColor: huddleColors.divider },
  termsModalTitle: { flex: 1, minWidth: 0, fontFamily: "Urbanist-800", fontSize: huddleType.h3, lineHeight: huddleType.h3Line, color: huddleColors.text },
  termsSheetScroll: { maxHeight: 520 },
  termsSheetContent: { gap: huddleSpacing.x3, paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x4 },
  termsSheetText: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.label * huddleType.lineNormal, color: huddleColors.text },
  termsLegalSection: { gap: huddleSpacing.x2, paddingTop: huddleSpacing.x1 },
  termsLegalTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.body, lineHeight: huddleType.body * huddleType.lineNormal, color: huddleColors.text },
  termsModalFooter: { paddingHorizontal: huddleSpacing.x4, paddingTop: huddleSpacing.x2, paddingBottom: huddleSpacing.x4, borderTopWidth: 1, borderTopColor: huddleColors.divider, backgroundColor: huddleColors.canvas },
  termsConfirmRow: { minHeight: 48, flexDirection: "row", alignItems: "flex-start", gap: huddleSpacing.x2 },
  termsConfirmRowDisabled: { opacity: 0.46 },
  petSelectSection: { gap: huddleSpacing.x1 + 2 },
  petSelectRailViewport: { marginRight: -huddleSpacing.x4 },
  petSelectRail: { gap: huddleSpacing.x3, paddingTop: huddleSpacing.x1, paddingRight: huddleSpacing.x4, paddingBottom: huddleSpacing.x2 },
  petSelectTile: { width: 170 },
  petSelectTileError: { borderRadius: huddleRadii.card, ...huddleFieldStates.error },
  petSelectCircle: { position: "absolute", top: huddleSpacing.x2, right: huddleSpacing.x2, width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 2, borderColor: huddleColors.blue, backgroundColor: huddleColors.canvas },
  petSelectCircleActive: { backgroundColor: huddleColors.blue },
  summaryPetRail: { gap: huddleSpacing.x2, paddingVertical: huddleSpacing.x1 },
  summaryPetTile: { width: 132, marginVertical: huddleSpacing.x2 },
  sheetFooter: { paddingHorizontal: huddleSpacing.x4, paddingTop: huddleSpacing.x2, paddingBottom: huddleSpacing.x4, borderTopWidth: 1, borderTopColor: huddleColors.divider },
  startCareSheetHeader: { minHeight: 98, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x4, paddingTop: huddleSpacing.x6, paddingBottom: huddleSpacing.x3 },
  startCareSheetTitle: { flex: 0 },
  sheetTitleBlock: { flex: 1, minWidth: 0, gap: huddleSpacing.x1 },
  sheetSubtitle: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  careHistorySheet: { height: "82%", maxHeight: "82%" },
  careHistoryContent: { gap: huddleSpacing.x3, paddingHorizontal: 0, paddingBottom: huddleSpacing.x6 },
  careHistoryTimelineBlock: { gap: huddleSpacing.x2 },
  requestSummaryCard: { gap: huddleSpacing.x1, borderRadius: huddleRadii.field, backgroundColor: huddleColors.mutedCanvas, padding: huddleSpacing.x4, marginBottom: huddleSpacing.x3 },
  paymentBody: { gap: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x3 },
  paymentServiceType: { fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  paymentRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x3 },
  paymentLabel: { flex: 1, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  paymentValue: { fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  paymentDivider: { height: 1, backgroundColor: huddleColors.divider, marginVertical: huddleSpacing.x1 },
  paymentInfoBox: { gap: huddleSpacing.x1, borderRadius: huddleRadii.field, borderWidth: 1, borderColor: huddleColors.blue, backgroundColor: huddleColors.blueSoft, padding: huddleSpacing.x3 },
  paymentInfoTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.blue },
  paymentInfoText: { fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  paymentInfoTextBold: { fontFamily: "Urbanist-800", color: huddleColors.text },
  paymentCareScopeCard: { gap: huddleSpacing.x2, borderRadius: huddleRadii.field, borderWidth: 1, borderColor: huddleColors.cardBorderSoft, backgroundColor: huddleColors.canvas, padding: huddleSpacing.x3 },
  petRefillBody: { gap: huddleSpacing.x3 },
  petChoiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: huddleSpacing.x2 },
  petChoiceChip: { minHeight: 36, justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, paddingHorizontal: huddleSpacing.x3, backgroundColor: huddleColors.canvas },
  petChoiceChipActive: { borderColor: huddleColors.blue, backgroundColor: huddleColors.blue },
  petChoiceText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  petChoiceTextActive: { color: huddleColors.onPrimary },
  completionNoteField: { minHeight: 96, textAlignVertical: "top" },
  reportIssueButton: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, alignSelf: "flex-start", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x3 },
  reportIssueText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.validationRed },
  startCareInputStack: { gap: 0 },
  checkinPhotoButton: { minHeight: 156, alignItems: "center", justifyContent: "center", gap: huddleSpacing.x2, overflow: "hidden", borderRadius: huddleRadii.card, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.blueSoft },
  checkinPhotoButtonStacked: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  checkinPhotoButtonError: { ...huddleFieldStates.error },
  checkinPhotoPreview: { width: "100%", height: 188 },
  checkinPhotoText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.blue },
  startPinInputShell: { position: "relative", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x2, minHeight: 58, borderRadius: huddleRadii.field, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x2 },
  startPinInputShellStacked: { borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  startPinInputShellError: { ...huddleFieldStates.error },
  startPinInputBox: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.button, borderWidth: 1, borderColor: huddleColors.fieldFocusBorder, backgroundColor: huddleColors.primarySoftFill },
  startPinInputBoxError: { borderColor: huddleColors.validationRed, backgroundColor: huddleColors.validationSoft },
  startPinInputDigit: { fontFamily: "Urbanist-800", fontSize: huddleType.h3, lineHeight: huddleType.h3Line, color: huddleColors.blue, fontVariant: ["tabular-nums"] },
  startPinInputDigitEmpty: { color: huddleColors.mutedText },
  startPinHiddenInput: { ...StyleSheet.absoluteFillObject, color: "transparent", opacity: 0.02 },
  checkinWarningText: { marginLeft: 28 + huddleSpacing.x2, fontFamily: "Urbanist-800", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  reviewRatingBlock: { alignItems: "center", gap: huddleSpacing.x1, paddingTop: huddleSpacing.x2, paddingBottom: huddleSpacing.x5, borderRadius: huddleRadii.field },
  ratingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x3 },
  reviewRatingLabel: { minHeight: 24, fontFamily: "Urbanist-800", fontSize: huddleType.body, lineHeight: huddleType.body * huddleType.lineNormal },
  reviewRatingLabelNegative: { color: huddleColors.validationRed },
  reviewRatingLabelPositive: { color: huddleColors.text },
  starButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill },
  reviewTextArea: { minHeight: 128, lineHeight: huddleType.body * huddleType.lineNormal },
  reviewSafetyRow: { minHeight: 52, flexDirection: "row", alignItems: "flex-start", gap: huddleSpacing.x2, marginTop: huddleSpacing.x5, paddingHorizontal: huddleSpacing.x1, paddingVertical: huddleSpacing.x2, borderRadius: huddleRadii.field },
  reviewCheckboxBox: { width: 20, height: 20, alignItems: "center", justifyContent: "center", borderRadius: 5, borderWidth: 1, borderColor: huddleColors.fieldBorder, backgroundColor: huddleColors.canvas, marginTop: 1 },
  reviewCheckboxBoxActive: { borderColor: huddleColors.blue, backgroundColor: huddleColors.blue },
  reviewSafetyCopy: { flex: 1, gap: 2 },
  reviewSafetyTitle: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  reviewSafetyText: { fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  reviewSafetySubtext: { marginTop: huddleSpacing.x1, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.validationRed },
  reviewMediaRailViewport: { alignSelf: "stretch", flexGrow: 0, flexShrink: 0, marginTop: huddleSpacing.x4, maxWidth: "100%", overflow: "hidden", width: "100%" },
  reviewMediaRailError: { borderRadius: huddleRadii.field, ...huddleFieldStates.error },
  reviewMediaThumbRow: { gap: huddleSpacing.x2, paddingRight: huddleSpacing.x6 },
  reviewMediaThumbWrap: { backgroundColor: huddleColors.mutedCanvas, borderRadius: huddleRadii.card, height: huddleSpacing.x10 + huddleSpacing.x8, overflow: "hidden" },
  reviewMediaThumb: { height: "100%", width: "100%" },
  reviewMediaUploadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", backgroundColor: huddleColors.backdrop, gap: huddleSpacing.x1, justifyContent: "center" },
  reviewMediaUploadingText: { color: huddleColors.onPrimary, fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine },
  reviewMediaRemoveButton: { alignItems: "center", backgroundColor: huddleColors.backdrop, borderRadius: huddleRadii.pill, height: 28, justifyContent: "center", position: "absolute", right: huddleSpacing.x2, top: huddleSpacing.x2, width: 28 },
  reviewFooterRow: { alignItems: "center", flexDirection: "row", gap: huddleSpacing.x3, paddingBottom: huddleSpacing.x1 },
  reviewFooterImageButton: { alignItems: "center", backgroundColor: huddleColors.divider, borderColor: huddleColors.fieldBorder, borderRadius: huddleRadii.pill, borderWidth: 1, height: 48, justifyContent: "center", width: 48 },
  profileModalSafeArea: { alignItems: "center", paddingHorizontal: 0 },
  profileModalCard: { width: "100%", height: "100%", maxHeight: "100%", flexShrink: 1, overflow: "hidden", borderWidth: 1.5, borderColor: huddleColors.glassBorder, borderRadius: huddleRadii.glass, backgroundColor: huddleColors.canvas, ...huddleShadows.glassElevation2 },
  profileModalHeader: { minHeight: 70, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x1, paddingHorizontal: huddleSpacing.x4, paddingTop: huddleSpacing.x4, paddingBottom: huddleSpacing.x3 },
  headerCopy: { flex: 1, minWidth: 0, gap: 2 },
  headerActions: { flexShrink: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: huddleSpacing.x1 },
  detailTitle: { flexShrink: 1, maxWidth: "86%", fontFamily: "Urbanist-700", fontSize: huddleType.body, lineHeight: huddleType.labelLine, color: huddleColors.text },
  profileModalScroll: { flex: 1, minHeight: 0 },
  profileModalScrollContent: { paddingBottom: huddleSpacing.x6 },
  detailState: { minHeight: 320, alignItems: "center", justifyContent: "center" },
});
