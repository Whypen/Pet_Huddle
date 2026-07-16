import { Feather, FontAwesome } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import { isValidPhoneNumber } from "libphonenumber-js";
import { captureRef } from "react-native-view-shot";
import type { MutableRefObject, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Image,
  Keyboard,
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
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Line, Path, SvgXml } from "react-native-svg";
import { launchNativeCameraAsync, launchNativeImageLibraryAsync, requestNativeCameraPermissionDetail } from "../lib/nativeMediaPermissions";
import { requestNativeForegroundLocationPermissionDetail } from "../lib/nativeLocation";
import profilePlaceholder from "../../assets/ProfilePlaceholder.png";
import serviceImage from "../../assets/Notifications/Service.jpg";
import huddleStampLogo from "../../assets/huddle-coral-shadow.png";
import { NativeLoadingState } from "../components/NativeLoadingState";
import { NativeSpinner } from "../components/NativeSpinner";
import { NativeToast } from "../components/NativeToast";
import { NativeLocationPinButton } from "../components/NativeLocationPinButton";
import { NativePhoneField } from "../components/NativePhoneField";
import { NativeLegalText } from "../components/NativeLegalText";
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
  AppNoticeModal,
  AppModalActionRow,
  AppModalButton,
  AppModalCloseButton,
  AppModalError,
  AppModalField,
  AppModalIconButton,
  AppModalSelectField,
  AppKeyboardAvoidingView as KeyboardAvoidingView,
  SlideToConfirm,
} from "../components/nativeModalPrimitives";
import { NativeSocialReportModal } from "../components/social/NativeSocialReportModal";
import { NativeSocialExternalLinkPreview, NativeSocialMediaCarousel, type NativeSocialCarouselItem } from "../components/social/NativeSocialFeedPrimitives";
import { NativeCarerProfileContent } from "../components/service/NativeCarerProfileContent";
import { NativeCareUpdateSheet } from "../components/service/NativeCareUpdateSheet";
import { endCareSessionActivity, updateCareSessionActivity } from "../lib/nativeActiveSessions";
import { ServiceCareUpdateCard } from "../components/service/ServiceCareUpdateCard";
import { NativePolaroidCard, nativePolaroidStyles } from "../components/NativePolaroidCard";
import { CARE_UPDATE_PREFERENCE_OPTIONS, careUpdateIsRequested, deriveCareUpdateKind, getNativeCareUpdateStatus, normalizeCareUpdatePreference, type CareUpdateKind, type CareUpdatePreference, type NativeCareUpdateStatus } from "../lib/nativeCareUpdates";
import { requiredCareUpdateActionLabel } from "../lib/careUpdateAction";
import { readNativeChatSelectedRowHandoff } from "../lib/nativeChatHandoff";
import { NativePetDetailsModal } from "../components/NativePetDetailsModal";
import { formatMedicationSummary, mapPetRow, type MedicationRecord, type NativePetDetailsData } from "../components/NativePetDetailsContent";
import { nativeModalStyles } from "../components/nativeModalPrimitives.styles";
import { getNativeLegalPage } from "../content/nativeLegalPages";
import { getNativeCarePaymentStatuses, type NativeCarePaymentMovement } from "../lib/nativeCarePayments";
import { presentCarePaymentMovement, presentMissingCarePayment } from "../lib/carePaymentPresentation";
import { createSingleRealtimeChannel } from "../lib/realtimeChannelManager";
import { invalidateNativeBlockCascade } from "../lib/nativeBlockCascade";
import { fetchNativeChatDialogueSnapshot, invalidateNativeChatReadCaches, markNativeChatRoomRead, markNativeServiceTabHasDialogues, readCachedNativeChatMessages, sendNativeChatMessage, writeCachedNativeChatMessages, clearCachedNativeChatMessages, type NativeChatMessage } from "../lib/nativeChat";
import { createNativeServiceChat, fetchNativeServiceProviderDetail, incrementNativeServiceProviderView, invalidateNativeServiceProviderCaches, type NativeServiceProvider } from "../lib/nativeService";
import {
  ALL_SKILLS,
  LOCATION_STYLES,
  SERVICES_OFFERED,
  deserializeRateRow,
  formatNativeCareCurrencySymbol,
  formatNativeCareLocationSummary,
  hasPaidNativeRateRows,
  hasVoluntaryNativeRateRows,
  isNativeCareLocationOutOfArea,
  isVolunteerOnlyNativeRateRows,
  nativeCarerServiceCurrencies,
  normalizeCareLocationAreas,
  normalizeNativeCarerCurrency,
  resolveCareScopeCurrencyDecision,
  resolveCareScopeCurrency,
  resolveNativeCarerCurrency,
  type NativeCareServiceArea,
  type NativeCarerCurrency,
  type NativeRateRow,
} from "../lib/nativeCarerProfile";
import { nativeExactTokenRpc } from "../lib/nativeExactTokenRequest";
import { createFreshNativeFunctionHeaders, getFreshNativeAccessToken } from "../lib/nativeFunctionClient";
import { haptic } from "../lib/nativeHaptics";
import { recordAppReviewInteraction, recordAppReviewNegativeSignal, requestAppReview } from "../lib/nativeAppReview";
import { nativeFreshImageKey, nativeFreshImageUri, nativeMutableImageVersion } from "../lib/nativeImageFreshness";
import { nativeSafeErrorCopy } from "../lib/nativeSafeErrorCopy";
import { useNativeModalTransition } from "../lib/nativeModalTransition";
import { formatPetSpecies, getBreedOptionsForSpecies, nativePetEmojiForLabel, PET_SPECIES_OPTIONS } from "../lib/nativePetTaxonomy";
import {
  averageNativeUploadProgress,
  NATIVE_UPLOAD_PROGRESS_START,
  nextNativeUploadProgress,
} from "../lib/nativeUploadProgress";
import { fetchNativeLocationSuggestions, type NativeLocationSuggestion, type NativeResolvedLocation } from "../lib/nativeLocation";
import { logNativeProtectedActionFailure, requestNativeStorageCleanupResult } from "../lib/nativeStorageCleanup";
import {
  extractCompletedNativeSocialPreviewUrl,
  extractNativeSocialFirstHttpUrl,
  fetchNativeSocialLinkPreviews,
  stripNativeSocialExternalUrlFromText,
  uploadNativeServiceCareAgreementSignatureImage,
  uploadNativeServiceCareEvidenceImage,
  uploadNativeServiceChatAttachmentImage,
  type NativeServiceChatAttachmentStorageRef,
  type NativeSocialComposerMedia,
  type NativeSocialLinkPreview,
} from "../lib/nativeSocial";
import { raceWithTimeoutFallback } from "../lib/nativeAsyncRace";
import { requireCurrentNativeSession } from "../lib/nativeSessionGuard";
import { useErrorShake } from "../components/motion/useErrorShake";
import { resolveNativeProfilePhotoDisplayUrl } from "../lib/nativeProfilePhotos";
import { fetchNativePublicProfile } from "../lib/nativePublicProfile";
import { parseChatShareMessage, type ShareModel } from "../lib/shareModel";
import { nativePathForSharedContent, navigateNativeHuddleLink } from "../lib/nativeInternalLinks";
import { deriveCareConversationState } from "../lib/careConversationState";
import { getCachedSignedStorageUrl, resolveNativeAvatarUrl, resolveNativePetImageUrlAsync } from "../lib/nativeStorageUrlCache";
import { supabase } from "../lib/supabase";
import { huddleButtons, huddleColors, huddleFieldStates, huddleFormControls, huddleGlassControls, huddlePolaroid, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";

type ServiceStatus = "pending" | "booked" | "in_progress" | "completed" | "disputed" | "cancelled";
type ServiceCareStatus = "awaiting_handoff" | "pin_shared" | "in_progress" | "handoff_issue_review" | "not_started_refunded" | "handoff_expired_manual_refund_required" | "under_dispute" | "completed" | "cancelled";
type StartCareResult = { ok: true } | { ok: false; error: string; attemptCount?: number; showHandoffProblem?: boolean };
type StartCareEvidence = {
  capturedAt?: string | null;
  locationAccuracyM?: number | null;
  locationPermissionDenied?: boolean;
  locationLat?: number | null;
  locationLng?: number | null;
  note?: string | null;
};
type ServiceRole = "requester" | "provider";

type ServiceRequestCard = {
  serviceType: string;
  serviceTypes?: string[];
  tzOffset?: string;
  startAtIso?: string;
  endAtIso?: string;
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
  locationCountry?: string;
  currencySelectedByRequester?: boolean;
  suggestedCurrency?: string;
  suggestedPrice?: string;
  suggestedRate?: string;
  voluntary?: boolean;
  updatePreference?: string;
  scopeFrequency?: string;
  scopeTasks?: string[];
  otherTasks?: string;
  additionalNotes?: string;
  allowProfileAccess?: boolean;
  petPhotoUrl?: string;
  petSpecies?: string;
  petBreed?: string;
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
  petBreed?: string;
  petPhotoUrl?: string;
  petSpecies?: string;
  petType?: string;
};

// A Care Scope version owns pet media once it is written. Quote edits may carry
// a compact pet object without the photo, so merge by pet id and never let that
// compact copy erase the frozen request-card image reference.
const mergeCareScopePets = (requestPets?: ServiceRequestPet[], quotePets?: ServiceRequestPet[]) => {
  const requestById = new Map<string, ServiceRequestPet>();
  for (const pet of requestPets || []) {
    const key = clean(pet.petId) || clean(pet.petName);
    if (key) requestById.set(key, pet);
  }
  if (!quotePets?.length) return requestPets || [];
  return quotePets.map((quotePet) => {
    const key = clean(quotePet.petId) || clean(quotePet.petName);
    const requestPet = key ? requestById.get(key) : undefined;
    return {
      ...requestPet,
      ...quotePet,
      // The profile image is evidence captured by the request card, not a live
      // profile lookup and not an optional quote display field.
      petPhotoUrl: clean(requestPet?.petPhotoUrl) || clean(quotePet.petPhotoUrl),
    };
  });
};

const normalizedCareScopeLocationText = (value: string) => clean(value).toLowerCase().replace(/[—–-]/g, " ").replace(/\s+/g, " ").trim();
const formatCareScopeSetting = (locationStyles?: string[] | null, locationArea?: string | null) => {
  const styles = (locationStyles || []).map(clean).filter(Boolean);
  const styleLabel = styles.join(", ");
  const area = clean(locationArea);
  if (!styleLabel) return area;
  if (!area) return styleLabel;
  const normalizedArea = normalizedCareScopeLocationText(area);
  const styleAlreadyContainsArea = styles.some((style) => {
    const normalizedStyle = normalizedCareScopeLocationText(style);
    return normalizedStyle === normalizedArea || normalizedStyle.includes(normalizedArea) || normalizedArea.includes(normalizedStyle);
  });
  return styleAlreadyContainsArea ? styleLabel : `${styleLabel} — ${area}`;
};

type ServiceQuoteCard = {
  serviceType?: string;
  serviceTypes?: string[];
  petId?: string;
  petIds?: string[];
  petName?: string;
  petSpecies?: string;
  petBreed?: string;
  dogSize?: string;
  petType?: string;
  pets?: ServiceRequestPet[];
  requestedDates?: string[];
  startTime?: string;
  endTime?: string;
  locationStyles?: string[];
  locationArea?: string;
  locationCountry?: string;
  currency?: string;
  finalPrice?: string;
  rate?: string;
  note?: string;
  scopeFrequency?: string;
  scopeTasks?: string[];
  otherTasks?: string;
  updatePreference?: string;
  voluntary?: boolean;
};

type ServiceChatRow = {
  id: string;
  chat_id: string;
  requester_id: string;
  provider_id: string;
  status: ServiceStatus;
  care_status?: ServiceCareStatus | null;
  booking_snapshot?: CareBookingSnapshot | null;
  care_agreement?: ServiceCareAgreementRecord | null;
  care_scope?: CareScopeSummary | null;
  request_card: ServiceRequestCard | null;
  quote_card: ServiceQuoteCard | null;
  request_sent_at: string | null;
  quote_sent_at: string | null;
  booked_at: string | null;
  updated_at?: string | null;
  early_start_allowed_at?: string | null;
  early_start_allowed_by?: string | null;
  in_progress_at?: string | null;
  pin_shared_at?: string | null;
  checkin_submitted_at?: string | null;
  checkin_photo_url?: string | null;
  completed_at: string | null;
  disputed_at?: string | null;
  payout_release_requested_at?: string | null;
  payout_released_at?: string | null;
  stripe_refund_id?: string | null;
  cancellation_status?: string | null;
  cancellation_provider_payout_cents?: number | null;
  no_start_resolved_at?: string | null;
  no_start_refund_cents?: number | null;
  no_start_retained_cents?: number | null;
  no_start_resolution_status?: string | null;
  requester_mark_finished: boolean;
  provider_mark_finished: boolean;
  dispute_status?: string | null;
  dispute_final_provider_receives_amount?: number | null;
  dispute_final_customer_refund_amount?: number | null;
  dispute_resolved_at?: string | null;
};

const SERVICE_CHAT_SELECT_FIELDS = "id,chat_id,requester_id,provider_id,status,care_status,booking_snapshot,request_card,quote_card,request_sent_at,quote_sent_at,booked_at,updated_at,early_start_allowed_at,early_start_allowed_by,in_progress_at,pin_shared_at,checkin_submitted_at,checkin_photo_url,completed_at,disputed_at,payout_release_requested_at,payout_released_at,stripe_refund_id,cancellation_status,cancellation_provider_payout_cents,no_start_resolved_at,no_start_refund_cents,no_start_retained_cents,no_start_resolution_status,requester_mark_finished,provider_mark_finished";

const serviceChatRowActivityTime = (row: ServiceChatRow) => {
  const candidates = [
    row.request_sent_at,
    row.quote_sent_at,
    row.booked_at,
    row.updated_at,
    row.completed_at,
    row.disputed_at,
  ];
  return candidates.reduce((latest, value) => {
    const time = Date.parse(String(value || ""));
    return Number.isFinite(time) ? Math.max(latest, time) : latest;
  }, 0);
};

const isTerminalServiceChatRow = (row: ServiceChatRow) => (
  Boolean(row.completed_at)
  || row.status === "completed"
  || row.status === "cancelled"
  || row.status === "disputed"
  || row.care_status === "completed"
  || row.care_status === "cancelled"
  || row.care_status === "under_dispute"
  || row.care_status === "handoff_issue_review"
);

const isCancelledServiceChatRow = (row: ServiceChatRow) => (
  row.status === "cancelled"
  || row.care_status === "cancelled"
);

const isActiveServiceChatRow = (row: ServiceChatRow) => (
  !isTerminalServiceChatRow(row)
  && (
    row.status === "pending"
    || row.status === "booked"
    || row.status === "in_progress"
    || ["awaiting_handoff", "pin_shared", "in_progress", "check_in", "booked"].includes(String(row.care_status || ""))
  )
);

// Adapts the strict active row to the shared live-conversation state machine.
// A terminal row can never enter here; no active row is a clean slate.
const deriveActiveCareConversationState = (
  activeServiceChat: ServiceChatRow | null,
  underReview: boolean,
): ReturnType<typeof deriveCareConversationState> => deriveCareConversationState(
  activeServiceChat ? {
    id: activeServiceChat.id,
    status: activeServiceChat.status,
    careStatus: activeServiceChat.care_status,
    mutualSigned: activeServiceChat.care_scope?.mutualSigned === true,
  } : null,
  underReview,
);

const activeServiceChatRowPriority = (row: ServiceChatRow, activeScopeServiceChatIds: Set<string>) => {
  if (!row.id || !row.chat_id) return -1;
  if (!isActiveServiceChatRow(row)) return -1;
  if (activeScopeServiceChatIds.has(row.id) && isActiveServiceChatRow(row)) return 60;
  return 50;
};

const selectActiveServiceChatRow = (rows: ServiceChatRow[], activeScopeServiceChatIds = new Set<string>()) => {
  const validRows = rows.filter((row) => row.id && row.chat_id && isActiveServiceChatRow(row));
  if (validRows.length === 0) return null;
  return [...validRows].sort((a, b) => {
    const priorityDiff = activeServiceChatRowPriority(b, activeScopeServiceChatIds) - activeServiceChatRowPriority(a, activeScopeServiceChatIds);
    if (priorityDiff !== 0) return priorityDiff;
    return serviceChatRowActivityTime(b) - serviceChatRowActivityTime(a);
  })[0] || null;
};

const selectServiceChatRowForRoute = (rows: ServiceChatRow[], activeScopeServiceChatIds: Set<string>, requestedServiceId?: string | null) => {
  const targetServiceId = clean(requestedServiceId);
  if (targetServiceId) {
    const exact = rows.find((row) => clean(row.id) === targetServiceId);
    if (exact && isActiveServiceChatRow(exact)) return exact;
  }
  return selectActiveServiceChatRow(rows, activeScopeServiceChatIds);
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
  petName?: string;
  petSpecies?: string;
  petBreed?: string;
  dogSize?: string;
  startAt: string;
  endAt: string;
  handoffMethod: string;
  locationCountry?: string;
  locationArea?: string;
  otherTasks?: string;
  scopeFrequency?: string;
  scopeTasks?: string[];
  carerContact?: string;
  contact?: string;
  ownerContact?: string;
  emergencyContact: string;
  handoffLocation?: string;
  careInstructions: string;
  medicationAllergyNotes: string;
  behaviorEscapeRisk: string;
  emergencyVetContact?: string;
  emergencyVetAuthorization?: {
    authorized: boolean;
    capMinor?: number;
    currency?: string;
  };
  emergencyVetPermission: boolean;
  price: {
    currency: string;
    providerQuote: number;
    requesterTotal: number;
  };
  noStartPolicy?: {
    version: string;
    minimumBookingMinutes: 60;
    scheduledEndCancellation: true;
    settlement: "no_start_responsibility_matrix_v2";
  };
  noStartPolicyAcknowledgement?: {
    ownerAcknowledgedAt: string;
    providerAcknowledgedAt: string;
    version: string;
  };
  cancellationTerms?: string;
  disputeIssueWindow?: string;
  agreedAt?: string;
  requesterSignature?: CareSignatureSnapshot;
  termsPath?: string;
  termsVersion?: string;
  requesterId: string;
  providerId: string;
  createdAt: string;
};

type SignaturePoint = { x: number; y: number };
type SignatureStroke = SignaturePoint[];
type CareSignatureSnapshot = {
  imageBucket?: "care_agreements";
  imageMime?: "image/png";
  imagePath?: string;
  height: number;
  path: string;
  pointCount: number;
  signedAt: string;
  strokeCount: number;
  width: number;
};

type ServiceCareAgreementRecord = {
  agreementVersion?: string | null;
  bookingSnapshot?: CareBookingSnapshot | null;
  pdfGeneratedAt?: string | null;
  pdfPath?: string | null;
  providerSignedAt?: string | null;
  requesterSignedAt?: string | null;
  scopeHash?: string | null;
  scopeVersionId?: string | null;
  status?: "owner_signed" | "provider_signed" | "finalized" | null;
};

type CareScopeSummary = {
  actorRole?: "owner" | "carer" | null;
  canPay: boolean;
  careDetails?: CareScopeCareDetails;
  carerSigned: boolean;
  mutualSigned: boolean;
  ownerPaymentConsentHash?: string | null;
  ownerSigned: boolean;
  paymentPendingExpiresAt?: string | null;
  paymentStatus?: string | null;
  scopeHash: string;
  scopeVersionId: string;
  versionNumber?: number | null;
};

type CareScopeCareDetails = {
  behaviorEscapeRisk?: string;
  careInstructions?: string;
  carerContact?: string;
  contact?: string;
  emergencyContact?: string;
  emergencyVetAuthorization?: {
    authorized: boolean;
    capMinor?: number;
    currency?: string;
  };
  emergencyVetContact?: string;
  handoffLocation?: string;
  handoffMethod?: string;
  medicationAllergyNotes?: string;
  ownerContact?: string;
  termsPath?: string;
  termsVersion?: string;
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

const SERVICE_MESSAGE_PAGE_SIZE = 50;

type ServiceChatAttachment = {
  bucket?: "care_attachments" | null;
  mime?: string | null;
  name?: string | null;
  path?: string | null;
  size?: number | null;
};

type ServiceParsedMessage = {
  attachments: ServiceChatAttachment[];
  careUpdate: {
    capturedAt: string;
    note: string;
    petName: string;
    photoUrl: string;
    updateKind: string;
  } | null;
  kind: string;
  policy: string;
  role: string;
  serviceChatId: string;
  scopeVersionId: string;
  linkPreviewUrl: string;
  pin: string;
  share: ShareModel | null;
  text: string;
};

const buildServiceShareHeadline = (share: ShareModel) => (
  clean(share.chatHeadline)
  || clean(share.title)
  || (share.surface === "Map" ? "Map alert on huddle" : "Social post on huddle")
);

const extractCompletedServicePreviewUrl = (value: string) => {
  return extractCompletedNativeSocialPreviewUrl(value);
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

const isPendingServiceMessage = (message: ChatMessageRow) => message.id.startsWith("pending:");

const isSamePendingServiceMessage = (pending: ChatMessageRow, confirmed: ChatMessageRow) => (
  isPendingServiceMessage(pending) &&
  pending.localStatus !== "failed" &&
  pending.sender_id === confirmed.sender_id &&
  pending.content === confirmed.content
);

const replacePendingServiceMessage = (current: ChatMessageRow[], pendingId: string, confirmed: ChatMessageRow) => mergeServiceMessageRows(
  current.filter((message) => message.id !== pendingId && !isSamePendingServiceMessage(message, confirmed)),
  [confirmed],
);

type ServiceChatUpload = NativeSocialComposerMedia & {
  attachmentRef?: NativeServiceChatAttachmentStorageRef | null;
  progress: number;
  status: "queued" | "uploading" | "uploaded" | "error";
};

type Counterpart = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  updatedAt?: string | null;
  stripePayoutStatus: string | null;
  stripeAccountId: string | null;
  skills: string[];
  providerServices: string[];
  providerLocationStyles: string[];
  providerAreaName: string;
  providerCurrency: string;
  providerHasPaidRates: boolean;
  providerHasVoluntaryRates: boolean;
  providerVolunteerOnly: boolean;
  providerCountry: string | null;
  providerServiceSearchCountry: string | null;
  providerAreaCountry: string | null;
  providerProfileCountry: string | null;
  providerServiceCurrencies: NativeCarerCurrency[];
  providerServiceAreas: NativeCareServiceArea[];
};

const counterpartToProfileFallback = (counterpart: Counterpart | null) => counterpart?.id ? {
  id: counterpart.id,
  display_name: counterpart.displayName,
  avatar_url: counterpart.avatarUrl,
  is_verified: false,
  location_name: counterpart.providerCountry,
  updated_at: counterpart.updatedAt,
} : null;

type PetOption = Partial<NativePetDetailsData> & {
  id: string;
  name: string;
  pet_size?: string | null;
  species: string | null;
  weight: number | null;
  weight_unit: string | null;
  photo_url?: string | null;
  updated_at?: string | null;
  dob?: string | null;
  is_public?: boolean | null;
};

type ManualPetDraft = {
  dogSize: string;
  id: string;
  name: string;
  species: string;
  breed: string;
};

type ActiveSheet = "request" | "quote" | "payment" | "review" | "startCare" | "careUpdate" | "completion" | "issue" | "handoffProblem" | "handoffRequesterProblem" | "handoffResponse" | "noStartReport" | null;

const STATUS_LABEL: Record<ServiceStatus, string> = {
  pending: "Pending",
  booked: "Booked",
  in_progress: "Care in progress",
  completed: "Completed",
  disputed: "Under Dispute",
  cancelled: "Cancelled",
};

const DOG_SIZES = ["Small", "Medium", "Large", "Giant"] as const;
// Times must reconcile with the backend, which only accepts 24h HH:MM. Coerce any
// entry ("9", "9:00", "1pm", "1:30 PM") to HH:MM; return "" when unparseable so the
// field flags as missing rather than sending an irreconcilable value like "1pm".
const isHHMM = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || "").trim());
const normalizeHHMM = (value: string): string => {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return "";
  const meridiem = raw.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (meridiem) {
    let h = Number(meridiem[1]) % 12;
    const min = meridiem[2] ? Number(meridiem[2]) : 0;
    if (meridiem[3] === "pm") h += 12;
    if (h <= 23 && min <= 59) return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    return "";
  }
  const h24 = raw.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (h24) {
    const h = Number(h24[1]);
    const min = h24[2] ? Number(h24[2]) : 0;
    if (h <= 23 && min <= 59) return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  return "";
};
const deviceTzOffset = (): string => {
  const minutesEastOfUtc = -new Date().getTimezoneOffset();
  const sign = minutesEastOfUtc < 0 ? "-" : "+";
  const abs = Math.abs(minutesEastOfUtc);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
};
const wallClockToIso = (date: string, time: string): string => {
  const d = String(date || "").trim();
  const t = String(time || "").trim();
  if (!d || !isHHMM(t)) return "";
  const parsed = new Date(`${d}T${t}:00${deviceTzOffset()}`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
};
const CARE_SCOPE_TOTAL_RATE_LABEL = "Total";
const STRIPE_MINIMUM_CHARGE_BY_CURRENCY: Partial<Record<NativeCarerCurrency, number>> = {
  AUD: 0.5,
  CAD: 0.5,
  EUR: 0.5,
  GBP: 0.3,
  HKD: 4,
  JPY: 50,
  SGD: 0.5,
  USD: 0.5,
};
const normalizeRateLabel = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower === "total" || lower === "per session") return CARE_SCOPE_TOTAL_RATE_LABEL;
  if (lower === "hour") return "Per hour";
  if (lower === "day") return "Per day";
  if (lower === "session") return CARE_SCOPE_TOTAL_RATE_LABEL;
  if (lower === "night") return "Per night";
  if (lower === "visit") return "Per visit";
  return raw;
};
const SERVICE_UNDER_REVIEW_NOTICE = "This session is under review. Please keep all communication here while our team investigates.";
// Mirrors REQUESTER_FEE_RATE / PROVIDER_FEE_RATE in supabase/functions/create-service-payment
// — the single backend source of truth for what Stripe actually charges. Keep these two
// values identical to that file; changing the platform's take rate is exactly these 4 numbers
// (2 here, 2 there), nothing else.
const CARE_REQUESTER_FEE_RATE = 0; // owner pays 0% on top of the agreed price
const CARE_NO_START_POLICY_VERSION = "13 July 2026";
const CARE_PROVIDER_FEE_RATE = 0.1; // carer's payout is still net of huddle's 10% (covers Stripe + platform costs)

// Status pills whose consecutive repeats are pure noise — during a scope/instruction
// negotiation only the latest in an unbroken run is worth showing.
const CONSOLIDATABLE_STATUS_KINDS = new Set(["service_care_scope_updated", "service_care_instruction_updated", "service_care_instruction_shared"]);

const SERVICE_HANDOFF_REVIEW_NOTICE = "Handoff issue under review.\nCare has not officially started. huddle may review handoff records, messages, and booking activity before deciding next steps.";
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
const HANDOFF_PROBLEM_REASONS = [
  "Owner no-show",
  "Late handoff",
  "Access problem",
  "Pet condition concern",
  "Safety concern",
  "Other",
];
const REQUESTER_HANDOFF_PROBLEM_REASONS = [
  "Carer no-show",
  "Carer late",
  "Unsafe handoff",
  "Access problem",
  "Safety concern",
  "Other",
];
const OWNER_NO_START_REASONS = ["Carer no-show", "Carer late", "Handoff issue", "Safety concern", "Other"];
const CARER_NO_START_REASONS = ["Owner unavailable", "Access problem", "Handoff issue", "Safety concern", "Other"];
const REPORT_ISSUE_REASONS = ["Safety", "Handoff issue", "No-show"];

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
const serviceCareAgreementFromRow = (row: unknown): ServiceCareAgreementRecord | null => {
  const record = row && typeof row === "object" ? row as Record<string, unknown> : null;
  if (!record) return null;
  return {
    agreementVersion: clean(record.agreement_version) || clean(record.agreementVersion) || null,
    bookingSnapshot: record.booking_snapshot && typeof record.booking_snapshot === "object"
      ? record.booking_snapshot as CareBookingSnapshot
      : record.bookingSnapshot && typeof record.bookingSnapshot === "object"
        ? record.bookingSnapshot as CareBookingSnapshot
        : null,
    pdfGeneratedAt: clean(record.pdf_generated_at) || clean(record.pdfGeneratedAt) || null,
    pdfPath: clean(record.pdf_path) || clean(record.pdfPath) || null,
    providerSignedAt: clean(record.provider_signed_at) || clean(record.providerSignedAt) || null,
    requesterSignedAt: clean(record.requester_signed_at) || clean(record.requesterSignedAt) || null,
    scopeHash: clean(record.scope_hash) || clean(record.scopeHash) || null,
    scopeVersionId: clean(record.scope_version_id) || clean(record.scopeVersionId) || null,
    status: clean(record.status) as ServiceCareAgreementRecord["status"] || null,
  };
};

const careAgreementHasSignedParties = (agreement?: ServiceCareAgreementRecord | null) => (
  Boolean(agreement?.requesterSignedAt && agreement.providerSignedAt)
);

const careAgreementHasPdf = (agreement?: ServiceCareAgreementRecord | null) => Boolean(clean(agreement?.pdfPath));
const careScopeSummaryFromRpc = (row: unknown): CareScopeSummary | null => {
  const record = row && typeof row === "object" ? row as Record<string, unknown> : null;
  if (!record) return null;
  const scopeVersionId = clean(record.scopeVersionId);
  const scopeHash = clean(record.scopeHash);
  if (!scopeVersionId || !scopeHash) return null;
  return {
    actorRole: clean(record.actorRole) === "owner" || clean(record.actorRole) === "carer" ? clean(record.actorRole) as "owner" | "carer" : null,
    canPay: record.canPay === true,
    careDetails: normalizeCareScopeCareDetails(record.careDetails),
    carerSigned: record.carerSigned === true,
    mutualSigned: record.mutualSigned === true,
    ownerPaymentConsentHash: clean(record.ownerPaymentConsentHash) || null,
    ownerSigned: record.ownerSigned === true,
    paymentPendingExpiresAt: clean(record.paymentPendingExpiresAt) || null,
    paymentStatus: clean(record.paymentStatus) || null,
    scopeHash,
    scopeVersionId,
    versionNumber: typeof record.versionNumber === "number" ? record.versionNumber : null,
  };
};

const hasCurrentCareScopeAgreement = (
  chat: Pick<ServiceChatRow, "care_scope"> | null | undefined,
) => Boolean(chat?.care_scope?.mutualSigned);

const bookingHasConfirmed = (chat?: Pick<ServiceChatRow, "booked_at" | "care_status" | "status"> | null) => (
  Boolean(clean(chat?.booked_at))
  || ["booked", "confirmed", "in_progress", "completed"].includes(clean(chat?.status).toLowerCase())
  || ["booked", "confirmed", "in_progress", "completed"].includes(clean(chat?.care_status).toLowerCase())
);

const normalizeCareScopeCareDetails = (value: unknown): CareScopeCareDetails => {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const authorization = record.emergencyVetAuthorization && typeof record.emergencyVetAuthorization === "object"
    ? record.emergencyVetAuthorization as Record<string, unknown>
    : null;
  const capMinor = Number(authorization?.capMinor);
  const ownerContact = clean(record.ownerContact) || clean(record.owner_contact) || clean(record.contact);
  const carerContact = clean(record.carerContact) || clean(record.carer_contact);
  return {
    behaviorEscapeRisk: clean(record.behaviorEscapeRisk),
    careInstructions: clean(record.careInstructions),
    carerContact,
    contact: ownerContact,
    emergencyContact: clean(record.emergencyContact),
    emergencyVetAuthorization: authorization && typeof authorization.authorized === "boolean"
      ? {
        authorized: authorization.authorized,
        ...(Number.isFinite(capMinor) && capMinor > 0 ? { capMinor } : {}),
        ...(clean(authorization.currency) ? { currency: clean(authorization.currency) } : {}),
      }
      : undefined,
    emergencyVetContact: clean(record.emergencyVetContact),
    handoffLocation: clean(record.handoffLocation),
    handoffMethod: clean(record.handoffMethod),
    medicationAllergyNotes: clean(record.medicationAllergyNotes),
    ownerContact,
    termsPath: clean(record.termsPath),
    termsVersion: clean(record.termsVersion),
  };
};
const ownerContactFromCareDetails = (details?: CareScopeCareDetails | null) => clean(details?.ownerContact) || clean(details?.contact);
const carerContactFromCareDetails = (details?: CareScopeCareDetails | null) => clean(details?.carerContact);
const hasCareInstructionDetails = (details?: CareScopeCareDetails | null) => Boolean(
  ownerContactFromCareDetails(details)
  || carerContactFromCareDetails(details)
  || clean(details?.emergencyContact)
  || clean(details?.handoffLocation)
  || clean(details?.careInstructions)
  || clean(details?.medicationAllergyNotes)
  || clean(details?.emergencyVetContact)
  || clean(details?.behaviorEscapeRisk)
  || typeof details?.emergencyVetAuthorization?.authorized === "boolean",
);
const hasMandatoryCareInstructionDetails = (details?: CareScopeCareDetails | null) => {
  if (!ownerContactFromCareDetails(details)) return false;
  if (!clean(details?.emergencyContact)) return false;
  if (!clean(details?.handoffLocation)) return false;
  const authorization = details?.emergencyVetAuthorization;
  if (!authorization || typeof authorization.authorized !== "boolean") return false;
  if (authorization.authorized) {
    const capMinor = Number(authorization.capMinor || 0);
    if (!Number.isFinite(capMinor) || capMinor <= 0) return false;
  }
  return true;
};
const comparableHandoffText = (value: unknown) => clean(value).toLowerCase().replace(/[—–-]/g, " ").replace(/\s+/g, " ").trim();
const isCareSettingValue = (value: unknown, requestCard?: ServiceRequestCard | null, quoteCard?: ServiceQuoteCard | null) => {
  const normalized = comparableHandoffText(value);
  if (!normalized) return false;
  const styles = quoteCard?.locationStyles?.length ? quoteCard.locationStyles : requestCard?.locationStyles || [];
  const area = clean(quoteCard?.locationArea) || clean(requestCard?.locationArea);
  return [
    area,
    styles.join(" / "),
    styles.join(", "),
    [styles.join(" / "), area].filter(Boolean).join(" - "),
    [styles.join(", "), area].filter(Boolean).join(" - "),
    [styles.join(" / "), area].filter(Boolean).join(" — "),
    [styles.join(", "), area].filter(Boolean).join(" — "),
  ].map(comparableHandoffText).filter(Boolean).includes(normalized);
};
const userEnteredHandoffLocation = (value: unknown, requestCard?: ServiceRequestCard | null, quoteCard?: ServiceQuoteCard | null) => (
  isCareSettingValue(value, requestCard, quoteCard) ? "" : clean(value)
);
const careInstructionVetAuthorizationLabel = (details?: CareScopeCareDetails | null) => {
  const authorization = details?.emergencyVetAuthorization;
  if (!authorization || typeof authorization.authorized !== "boolean") return "";
  if (!authorization.authorized) return "Not authorized";
  const capMinor = Number(authorization.capMinor || 0);
  const cap = Number.isFinite(capMinor) && capMinor > 0
    ? formatMoney(authorization.currency || "", fromStripeMinorUnitAmount(capMinor, authorization.currency || ""))
    : "";
  return cap ? `Authorized up to ${cap}` : "Authorized";
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
  invalidEmergencyContact: "Add a valid emergency contact before confirming.",
  invalidEmergencyVetAuthorization: "Choose whether emergency vet care is authorized before confirming.",
  invalidEmergencyVetCap: "Add a valid emergency vet care limit before confirming.",
  invalidEmergencyVetContact: "Add an emergency vet contact before confirming.",
  missingCareInstructions: "Add care instructions before confirming.",
  missingMedicationNotes: "Add medication and allergy notes before confirming.",
  missingSignature: "Draw your signature before confirming.",
  missingTerms: "Accept the booking terms before confirming.",
  invalidBookingDuration: "Care bookings must be at least 1 hour.",
  incompleteBooking: "Booking details are incomplete.",
  missingPaymentDetails: "Booking details are incomplete. Please reopen the booking and try again.",
  missingCheckoutUrl: "We couldn't start secure checkout. Please try again.",
  unableToOpenCheckout: "We couldn't open the secure checkout page. Please try again.",
  paymentInProgress: "A payment for this booking is already in progress. If you completed checkout, it will confirm shortly.",
} as const;
const PAYMENT_FAILED_COPY = "Payment could not be completed. Please try again.";
const CARE_SCOPE_CHANGED_COPY = "This Care Scope changed. Refresh and review the latest version.";
const CANCEL_BOOKING_ISSUES = ["Plans changed", "Schedule no longer works", "Booked another carer", "Safety or handoff issue", "No-show", "Other"] as const;
const SERVICE_PAYMENT_TIMEOUT_MS = 20000;
const MAX_CARE_REPORT_EVIDENCE = 10;
const paymentDraftKey = (requesterId: string, providerId: string, petIds: string[], serviceType: string) =>
  `huddle_native_confirm_booking_draft_v1:${requesterId || "unknown"}:${providerId || "unknown"}:${petIds.join(",") || "no-pet"}:${serviceType || "care"}`;
const pendingServicePaymentKey = (userId: string, roomId: string, serviceChatId?: string | null) =>
  `huddle_native_service_payment_pending_v2:${userId}:${roomId}:${serviceChatId || "room"}`;
const legacyPendingServicePaymentKey = (userId: string, roomId: string) =>
  `huddle_native_service_payment_pending_v1:${userId}:${roomId}`;
// Carer "Update Care Scope" auto-open is one-shot per request/scope version and
// must survive remount/reopen (contract §7.2: no auto-open after a prior
// dismissal/interaction). We persist the dismissed scope version per room.
const autoOpenQuoteDismissKey = (userId: string, roomId: string) =>
  `huddle_native_care_quote_autoopen_dismiss_v1:${userId}:${roomId}`;

const serviceCareEvidencePathFromDescriptor = (value: string | null | undefined) => {
  try {
    const parsed = JSON.parse(String(value || "")) as { bucket?: unknown; path?: unknown };
    return parsed?.bucket === "service_care_evidence" && typeof parsed.path === "string" ? parsed.path : null;
  } catch {
    return null;
  }
};
const serviceChatRowCacheKey = (userId: string, sessionKey: string, roomId: string) =>
  `huddle_native_service_chat_row_v1:${userId}:${sessionKey}:${roomId}`;
const serviceChatHistoryCacheKey = (userId: string, sessionKey: string, roomId: string) =>
  `huddle_native_service_chat_history_v1:${userId}:${sessionKey}:${roomId}`;
// A room is reused for later bookings; a Start PIN is valid for one service row only.
const serviceStartPinCacheKey = (userId: string, serviceChatId: string) =>
  `huddle_native_service_start_pin_v2:${userId}:${serviceChatId}`;
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const serviceHistoryHiddenKey = (userId: string, serviceChatId: string) =>
  `huddle_native_service_history_hidden_v1:${userId}:${serviceChatId}`;
const serviceReviewSubmittedKey = (userId: string, serviceChatId: string) =>
  `huddle_native_service_review_submitted_v1:${userId}:${serviceChatId}`;
const SERVICE_HISTORY_AUTO_HIDE_MS = 14 * 24 * 60 * 60 * 1000;
const SERVICE_PIN_SENT_MESSAGE = "Your Care Session PIN is ready.";
const PASSCODE_LOCK_ICON_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 11V8.2C22 7.0799 22 6.51984 21.782 6.09202C21.5903 5.71569 21.2843 5.40973 20.908 5.21799C20.4802 5 19.9201 5 18.8 5H5.2C4.0799 5 3.51984 5 3.09202 5.21799C2.71569 5.40973 2.40973 5.71569 2.21799 6.09202C2 6.51984 2 7.0799 2 8.2V11.8C2 12.9201 2 13.4802 2.21799 13.908C2.40973 14.2843 2.71569 14.5903 3.09202 14.782C3.51984 15 4.0799 15 5.2 15H11M12 10H12.005M17 10H17.005M7 10H7.005M19.25 17V15.25C19.25 14.2835 18.4665 13.5 17.5 13.5C16.5335 13.5 15.75 14.2835 15.75 15.25V17M12.25 10C12.25 10.1381 12.1381 10.25 12 10.25C11.8619 10.25 11.75 10.1381 11.75 10C11.75 9.86193 11.8619 9.75 12 9.75C12.1381 9.75 12.25 9.86193 12.25 10ZM17.25 10C17.25 10.1381 17.1381 10.25 17 10.25C16.8619 10.25 16.75 10.1381 16.75 10C16.75 9.86193 16.8619 9.75 17 9.75C17.1381 9.75 17.25 9.86193 17.25 10ZM7.25 10C7.25 10.1381 7.13807 10.25 7 10.25C6.86193 10.25 6.75 10.1381 6.75 10C6.75 9.86193 6.86193 9.75 7 9.75C7.13807 9.75 7.25 9.86193 7.25 10ZM15.6 21H19.4C19.9601 21 20.2401 21 20.454 20.891C20.6422 20.7951 20.7951 20.6422 20.891 20.454C21 20.2401 21 19.9601 21 19.4V18.6C21 18.0399 21 17.7599 20.891 17.546C20.7951 17.3578 20.6422 17.2049 20.454 17.109C20.2401 17 19.9601 17 19.4 17H15.6C15.0399 17 14.7599 17 14.546 17.109C14.3578 17.2049 14.2049 17.3578 14.109 17.546C14 17.7599 14 18.0399 14 18.6V19.4C14 19.9601 14 20.2401 14.109 20.454C14.2049 20.6422 14.3578 20.7951 14.546 20.891C14.7599 21 15.0399 21 15.6 21Z" stroke="${huddleColors.blue}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const createPaymentTraceId = () => `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const localDateKey = (value = new Date()) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const bodyKeys = (value: unknown) => value && typeof value === "object" ? Object.keys(value as Record<string, unknown>) : [];
const functionErrorStatus = (error: unknown) => {
  const context = error && typeof error === "object" && "context" in error ? (error as { context?: unknown }).context : null;
  if (context && typeof context === "object" && "status" in context) return (context as { status?: unknown }).status;
  if (error && typeof error === "object" && "status" in error) return (error as { status?: unknown }).status;
  return null;
};
// supabase.functions.invoke's error for a non-2xx response is a FunctionsHttpError whose
// .message is a generic "Edge Function returned a non-2xx status code" string — the actual
// { error, code } JSON body the function returned lives on error.context (the raw fetch
// Response), and was never being read. That silently discarded every specific backend
// rejection reason (e.g. care_scope_not_mutually_signed), always falling through to the
// generic fallback below instead of matching the regexes that already handle these cases.
const extractFunctionErrorBody = async (error: unknown): Promise<{ message: string; code: string }> => {
  const context = error && typeof error === "object" && "context" in error ? (error as { context?: unknown }).context : null;
  if (context && typeof context === "object" && "json" in context && typeof (context as { json?: unknown }).json === "function") {
    try {
      const body = await (context as { json: () => Promise<unknown> }).json();
      const bodyMessage = clean((body as { error?: unknown })?.error) || clean((body as { message?: unknown })?.message);
      const bodyCode = clean((body as { code?: unknown })?.code);
      if (bodyMessage || bodyCode) return { message: bodyMessage, code: bodyCode };
    } catch {
      // Body already consumed or not JSON — fall through to the generic error fields below.
    }
  }
  return {
    message: clean((error as { message?: unknown })?.message),
    code: clean((error as { code?: unknown })?.code),
  };
};
const safePaymentErrorMessage = async (error: unknown, fallback: string) => {
  const { message, code } = await extractFunctionErrorBody(error);
  const raw = `${message} ${code}`.toLowerCase().trim();
  if (!raw) return fallback;
  if (/timeout|took too long/.test(raw)) return "That took too long to start. Check your connection and try again.";
  // Provider payout / readiness
  if (/payout|provider_payout_setup|provider.*setup/.test(raw)) return "The carer is finishing payout setup. Please try again shortly.";
  // Scope changed / version mismatch
  if (/scope|version|hash|stale|changed/.test(raw)) return CARE_SCOPE_CHANGED_COPY;
  // Both sides must sign first
  if (/signature_required|not_mutually_signed|scope_signature|owner_scope|carer_scope/.test(raw)) return "Both sides need to sign the Care Scope agreement first.";
  // Missing/stale booking identity
  if (/service_chat_not_found|service_chat_missing|service_chat_id_required/.test(raw)) return "We couldn't find this booking. Close and reopen the chat, then try again.";
  // Payment already in progress
  if (/payment_pending|in progress|already.*pending/.test(raw)) return "A payment for this booking is already in progress. If you finished checkout, it will confirm shortly.";
  // Expired request
  if (/expired|care_request_expired/.test(raw)) return "This care date has passed. Update the date or withdraw this request.";
  // Auth
  if (/jwt|token|authorization|unauthorized|not_authenticated|auth/.test(raw)) return "Please sign in again, then try confirming.";
  // Network / generic edge failure (incl. the Supabase "non-2xx status code" message)
  if (/network|fetch|connection|non-?2xx|edge function|status code|internal_error|service is no longer pending/.test(raw)) return fallback;
  // Never surface a raw backend code or message — fall back to the friendly default.
  return fallback;
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
  // Check-in-specific: without these, every one of these distinct backend rejections collapsed
  // into the same generic fallback below, making a real failure indistinguishable from a hang.
  if (raw.includes("service_care_evidence_not_registered")) return "Your check-in photo didn't finish saving. Please try again.";
  if (raw.includes("invalid_service_care_evidence_path") || raw.includes("service_care_evidence_content_id_mismatch")) return "We couldn't verify your check-in photo. Please retake it and try again.";
  if (raw.includes("service_care_evidence_permission_denied") || raw.includes("invalid_service_care_evidence_bucket")) return "We couldn't confirm you have access to upload this photo. Please sign in again and retry.";
  if (raw.includes("care_start_too_early")) return "Care can only begin on the scheduled service date.";
  if (raw.includes("care_start_window_elapsed")) return "This booking passed its scheduled end time and can no longer be started.";
  if (raw.includes("no_start_report_too_early")) return "You can report a no-start issue after the significant-delay warning appears.";
  if (raw.includes("no_start_report_window_closed")) return "The reporting window closed at the scheduled end time.";
  if (raw.includes("no_start_report_already_submitted")) return "You have already reported a no-start issue for this booking.";
  if (raw.includes("no_start_policy_report_required")) return "Use Report no-start issue for this delayed booking.";
  if (raw.includes("no_start_evidence_limit_exceeded") || raw.includes("issue_evidence_limit_exceeded")) return "Add up to 10 supporting photos.";
  if (raw.includes("no_start_policy_acknowledgement_required")) return "Both parties must accept the no-start policy before confirming this booking.";
  if (raw.includes("start_pin_not_shared")) return "The owner hasn't shared the Start PIN yet.";
  if (raw.includes("care_already_started") || raw.includes("invalid_status")) return "This booking has already moved past check-in.";
  if (raw.includes("not_provider")) return "Only the carer on this booking can start care.";
  if (raw.includes("service_chat_not_found")) return "Couldn't find this booking. Close and reopen the chat, then try again.";
  if (/^[a-z0-9_]+$/.test(raw) || raw.includes("_required") || raw.includes("_not_")) return fallback;
  return message || fallback;
};
const isAlreadyReviewedError = (error: unknown) => {
  const raw = [
    clean((error as { message?: unknown })?.message),
    clean((error as { code?: unknown })?.code),
    clean((error as { details?: unknown })?.details),
    clean((error as { hint?: unknown })?.hint),
  ].join(" ").toLowerCase();
  return raw.includes("already")
    || raw.includes("duplicate")
    || raw.includes("23505")
    || raw.includes("service_reviews_service_chat_id_reviewer_id")
    || raw.includes("service_reviews_reviewer");
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
    service: clean(params.get("service") || params.get("serviceId")),
    historyService: clean(params.get("historyService") || params.get("history_service_id")),
    name: clean(params.get("name")),
    avatar: clean(params.get("avatar")),
    peerId: clean(params.get("with") || params.get("peerId")),
    providerId: clean(params.get("provider") || params.get("providerId")),
    paid: clean(params.get("paid") || params.get("payment")),
    checkoutSessionId: clean(params.get("checkout_session_id") || params.get("session_id") || params.get("checkoutSessionId")),
    request: clean(params.get("request")),
    returnTo: clean(params.get("returnTo")),
    sheet: clean(params.get("sheet")),
    notificationAction: clean(params.get("notificationAction")),
    skills: clean(params.get("skills")).split("|").map(clean).filter(Boolean),
  };
};

const resolveRouteParamAvatarUrl = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) && !raw.includes("/storage/v1/object/public/profile_photos/")) return null;
  return resolveNativeAvatarUrl(raw);
};

const serializeCareUpdatePhoto = (value: unknown) => {
  if (!value) return "";
  if (typeof value === "string") return clean(value);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
};

const parseServiceMessage = (content: string): ServiceParsedMessage => {
  const share = parseChatShareMessage(content);
  if (share) {
    return { attachments: [], text: "", kind: "huddle_share", policy: "", role: "", serviceChatId: "", scopeVersionId: "", linkPreviewUrl: "", pin: "", careUpdate: null, share };
  }
  try {
    const parsed = JSON.parse(content) as { attachments?: unknown; text?: unknown; kind?: unknown; policy?: unknown; role?: unknown; serviceChatId?: unknown; scopeVersionId?: unknown; linkPreviewUrl?: unknown; pin?: unknown; startPin?: unknown; photo?: unknown; photoUrl?: unknown; note?: unknown; petName?: unknown; capturedAt?: unknown; updateKind?: unknown };
    const attachments = Array.isArray(parsed.attachments)
      ? parsed.attachments.map((item): ServiceChatAttachment | null => {
        const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const bucket = clean(value.bucket);
        const path = clean(value.path);
        if (bucket !== "care_attachments" || !path || path.includes("..")) return null;
        return {
          bucket: "care_attachments" as const,
          mime: clean(value.mime || value.mimeType) || "image/jpeg",
          name: clean(value.name),
          path,
          size: typeof value.size === "number" && Number.isFinite(value.size) ? value.size : null,
        };
      }).filter((item): item is ServiceChatAttachment => Boolean(item?.path))
      : [];
    const text = clean(parsed.text);
    const parsedKind = clean(parsed.kind);
    const careUpdate = ["service_care_update", "service_check_in"].includes(parsedKind)
      ? {
        photoUrl: serializeCareUpdatePhoto(parsed.photo || parsed.photoUrl),
        note: parsedKind === "service_check_in" ? "Care session started." : clean(parsed.note) || text,
        petName: clean(parsed.petName),
        capturedAt: clean(parsed.capturedAt),
        updateKind: clean(parsed.updateKind),
      }
      : null;
    return { attachments, text, kind: parsedKind, policy: clean(parsed.policy), role: clean(parsed.role), serviceChatId: clean(parsed.serviceChatId), scopeVersionId: clean(parsed.scopeVersionId), linkPreviewUrl: clean(parsed.linkPreviewUrl) || extractNativeSocialFirstHttpUrl(text || "") || "", pin: sanitizeStartPin(parsed.pin || parsed.startPin), careUpdate, share: null };
  } catch {
    return { attachments: [] as ServiceChatAttachment[], text: content, kind: "", policy: "", role: "", serviceChatId: "", scopeVersionId: "", linkPreviewUrl: extractNativeSocialFirstHttpUrl(content) || "", pin: "", careUpdate: null, share: null };
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

const readCachedStartPin = async (userId: string, serviceChatId: string) => {
  const key = serviceStartPinCacheKey(userId, serviceChatId);
  const pin = await SecureStore.getItemAsync(key, secureStoreOptions).catch(() => null);
  if (pin) {
    await AsyncStorage.removeItem(key).catch(() => undefined);
    return sanitizeStartPin(pin);
  }
  const legacyPin = await AsyncStorage.getItem(key).catch(() => null);
  if (legacyPin) {
    await SecureStore.setItemAsync(key, legacyPin, secureStoreOptions).catch(() => undefined);
    await AsyncStorage.removeItem(key).catch(() => undefined);
  }
  return sanitizeStartPin(legacyPin);
};

const purgeCachedStartPin = async (userId: string, serviceChatId: string) => {
  const key = serviceStartPinCacheKey(userId, serviceChatId);
  await SecureStore.deleteItemAsync(key, secureStoreOptions).catch(() => undefined);
  await SecureStore.deleteItemAsync(key).catch(() => undefined);
  await AsyncStorage.removeItem(key).catch(() => undefined);
};

const writeCachedStartPin = async (userId: string, serviceChatId: string, pin: string) => {
  const safePin = sanitizeStartPin(pin);
  if (!safePin) return;
  await SecureStore.setItemAsync(serviceStartPinCacheKey(userId, serviceChatId), safePin, secureStoreOptions).catch(() => undefined);
  await AsyncStorage.removeItem(serviceStartPinCacheKey(userId, serviceChatId)).catch(() => undefined);
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

const readCachedServiceChatHistory = async (userId: string, sessionKey: string | null, roomId: string): Promise<ServiceChatRow[]> => {
  const cacheSessionKey = sessionKey || `${userId}:0`;
  try {
    const raw = await AsyncStorage.getItem(serviceChatHistoryCacheKey(userId, cacheSessionKey, roomId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { roomId?: unknown; rows?: unknown; sessionKey?: unknown; userId?: unknown; version?: unknown };
    if (parsed.version !== 1 || parsed.userId !== userId || parsed.sessionKey !== cacheSessionKey || parsed.roomId !== roomId || !Array.isArray(parsed.rows)) return [];
    return parsed.rows.filter((row): row is ServiceChatRow => Boolean(row && typeof row === "object" && clean((row as ServiceChatRow).id)));
  } catch {
    return [];
  }
};

const writeCachedServiceChatHistory = async (userId: string, sessionKey: string | null, roomId: string, rows: ServiceChatRow[]) => {
  const cacheSessionKey = sessionKey || `${userId}:0`;
  await AsyncStorage.setItem(serviceChatHistoryCacheKey(userId, cacheSessionKey, roomId), JSON.stringify({
    cachedAt: Date.now(),
    roomId,
    rows,
    sessionKey: cacheSessionKey,
    userId,
    version: 1,
  })).catch(() => undefined);
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

const formatCarePaymentDate = (iso: string | null | undefined) => {
  const raw = clean(iso);
  if (!raw) return "";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(dt);
};

const formatCarePaymentLastUpdated = (iso: string | null | undefined) => {
  const raw = clean(iso);
  if (!raw) return "";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return "";
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(dt);
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(dt);
  return `Last updated at ${time} on ${date}`;
};

// "2:28am on 2 Jul 2026" — used by the care-session started/completed system pills so the
// event is unambiguous days later, not just a bare time with no date.
const formatServiceEventDateTime = (iso: string | null | undefined) => {
  const raw = clean(iso);
  if (!raw) return "";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return "";
  const clockTime = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .format(dt)
    .replace(" ", "")
    .toLowerCase();
  const dateLabel = formatTimelineStepDate(raw);
  return clockTime && dateLabel ? `${clockTime} on ${dateLabel}` : clockTime || dateLabel;
};

const formatSignedAtCompact = (iso: string | null | undefined) => {
  const raw = clean(iso);
  if (!raw) return "";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return "";
  const now = new Date();
  const sameDay = dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth() && dt.getDate() === now.getDate();
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(dt);
  return sameDay ? `Signed today at ${time}` : `Signed ${formatTimelineStepDate(raw)}`;
};

const latestIso = (...values: Array<string | null | undefined>) => {
  const latest = values.reduce<{ iso: string; time: number } | null>((current, value) => {
    const iso = clean(value);
    const time = Date.parse(iso);
    if (!iso || !Number.isFinite(time)) return current;
    if (!current || time > current.time) return { iso, time };
    return current;
  }, null);
  return latest?.iso || "";
};

const paymentPendingExpiryMs = (scope?: CareScopeSummary | null) => {
  const raw = clean(scope?.paymentPendingExpiresAt);
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};
const isCarePaymentPendingActive = (scope?: CareScopeSummary | null, nowMs = Date.now()) => {
  if (scope?.paymentStatus !== "pending" && scope?.paymentStatus !== "creating") return false;
  const expiresAt = paymentPendingExpiryMs(scope);
  return !expiresAt || expiresAt > nowMs;
};
const formatPaymentRetryCountdown = (scope?: CareScopeSummary | null, nowMs = Date.now()) => {
  const expiresAt = paymentPendingExpiryMs(scope);
  if (!expiresAt) return "";
  const seconds = Math.max(0, Math.ceil((expiresAt - nowMs) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
};

const paymentSnapshotFromAgreedChat = (chat?: ServiceChatRow | null): CareBookingSnapshot | null => {
  const requestCard: ServiceRequestCard | null = requestCardWithCareScopeUpdates(chat?.request_card || null, chat?.quote_card || null, chat?.care_scope?.actorRole) || chat?.request_card || null;
  const quoteCard: ServiceQuoteCard = {} as ServiceQuoteCard;
  const details = chat?.care_scope?.careDetails || {};
  const quoteRequestedDates = (quoteCard as (ServiceQuoteCard & { requestedDates?: string[] }) | null)?.requestedDates;
  const requestDates = (Array.isArray(quoteRequestedDates) && quoteRequestedDates.length
    ? quoteRequestedDates
    : requestCard?.requestedDates || []).map(clean).filter(Boolean).sort();
  const firstRequestDate = requestDates[0] || clean(requestCard?.requestedDate);
  const lastRequestDate = requestDates[requestDates.length - 1] || firstRequestDate;
  const quoteOverridesSchedule = Boolean(
    (Array.isArray(quoteRequestedDates) && quoteRequestedDates.length)
    || clean(quoteCard?.startTime)
    || clean(quoteCard?.endTime),
  );
  const startAt = !quoteOverridesSchedule && clean(requestCard?.startAtIso)
    ? clean(requestCard?.startAtIso)
    : buildServiceBookingDateTime(firstRequestDate, clean(quoteCard?.startTime) || clean(requestCard?.startTime));
  const rawEndAt = !quoteOverridesSchedule && clean(requestCard?.endAtIso)
    ? clean(requestCard?.endAtIso)
    : buildServiceBookingDateTime(lastRequestDate, clean(quoteCard?.endTime) || clean(requestCard?.endTime));
  const startAtMs = Date.parse(startAt);
  const rawEndAtMs = Date.parse(rawEndAt);
  const endAtMs = Number.isFinite(startAtMs) && Number.isFinite(rawEndAtMs) && rawEndAtMs <= startAtMs ? rawEndAtMs + 24 * 60 * 60 * 1000 : rawEndAtMs;
  const endAt = Number.isFinite(endAtMs) ? new Date(endAtMs).toISOString() : rawEndAt;
  const curr = resolveCareScopeDisplayCurrency({ quoteCard, requestCard });
  const paymentBasePrice = careScopePaymentAmount(quoteCard, requestCard);
  const quoteMinor = paymentBasePrice > 0 ? toStripeMinorUnitAmount(paymentBasePrice, curr) : 0;
  const totalDueMinor = quoteMinor + (paymentBasePrice > 0 ? Math.round(quoteMinor * CARE_REQUESTER_FEE_RATE) : 0);
  // The booking_snapshot schema only has one flat `serviceType` string (see
  // validate_service_booking_snapshot), but a booking can have multiple selected
  // service types (e.g. "Boarding" + "Grooming"). Combine the full array here so
  // the Care Agreement PDF doesn't silently drop every service type past the first.
  const quoteServiceTypes = Array.isArray(quoteCard?.serviceTypes) ? quoteCard.serviceTypes.map(clean).filter(Boolean) : [];
  const requestServiceTypes = Array.isArray(requestCard?.serviceTypes) ? requestCard.serviceTypes.map(clean).filter(Boolean) : [];
  const combinedServiceTypes = quoteServiceTypes.length ? quoteServiceTypes : requestServiceTypes;
  const serviceType = combinedServiceTypes.join(" + ") || clean(quoteCard?.serviceType) || clean(requestCard?.serviceType) || "Care";
  const selectedPetIds = [
    ...(Array.isArray(quoteCard?.petIds) ? quoteCard.petIds : []),
    clean(quoteCard?.petId),
    ...(Array.isArray(requestCard?.petIds) ? requestCard.petIds : []),
    clean(requestCard?.petId),
  ].map(clean).filter(Boolean);
  const petId = selectedPetIds[0] || "";
  const petName = clean(quoteCard?.petName) || clean(requestCard?.petName) || clean(requestCard?.pets?.[0]?.petName) || clean(quoteCard?.pets?.[0]?.petName);
  const dogSize = clean(requestCard?.pets?.[0]?.dogSize) || clean(quoteCard?.pets?.[0]?.dogSize) || clean(requestCard?.dogSize) || clean(quoteCard?.dogSize);
  const defaultHandoff = [clean(requestCard?.locationStyles?.join(" / ")), clean(requestCard?.locationArea)].filter(Boolean).join(" - ");
  const base = chat?.booking_snapshot;
  const fallbackAgreedAt = clean(chat?.care_agreement?.requesterSignedAt) || clean(chat?.care_agreement?.providerSignedAt) || new Date().toISOString();
  const detailsHandoffLocation = userEnteredHandoffLocation(details.handoffLocation, requestCard, quoteCard);
  const baseHandoffLocation = userEnteredHandoffLocation((base as CareBookingSnapshot & { handoffLocation?: string } | null)?.handoffLocation, requestCard, quoteCard);
  const built: CareBookingSnapshot = {
    serviceType,
    petId,
    petName,
    petSpecies: clean(quoteCard?.petSpecies) || clean(requestCard?.petSpecies) || clean(quoteCard?.petType) || clean(requestCard?.petType),
    petBreed: clean(quoteCard?.petBreed) || clean(requestCard?.petBreed),
    dogSize,
    startAt,
    endAt,
    handoffMethod: clean(details.handoffMethod) || defaultHandoff,
    handoffLocation: detailsHandoffLocation,
    locationCountry: clean(quoteCard?.locationCountry) || clean(requestCard?.locationCountry),
    locationArea: clean(quoteCard?.locationArea) || clean(requestCard?.locationArea),
    otherTasks: clean(quoteCard?.otherTasks) || clean(requestCard?.otherTasks),
    scopeTasks: Array.isArray(quoteCard?.scopeTasks) && quoteCard.scopeTasks.length ? quoteCard.scopeTasks.map(clean).filter(Boolean) : Array.isArray(requestCard?.scopeTasks) ? requestCard.scopeTasks.map(clean).filter(Boolean) : [],
    scopeFrequency: clean(quoteCard?.scopeFrequency) || clean(requestCard?.scopeFrequency),
    carerContact: carerContactFromCareDetails(details),
    contact: ownerContactFromCareDetails(details),
    ownerContact: ownerContactFromCareDetails(details),
    emergencyContact: clean(details.emergencyContact),
    careInstructions: clean(details.careInstructions) || clean(requestCard?.additionalNotes),
    medicationAllergyNotes: clean(details.medicationAllergyNotes),
    behaviorEscapeRisk: clean(details.behaviorEscapeRisk),
    emergencyVetContact: clean(details.emergencyVetContact),
    emergencyVetAuthorization: details.emergencyVetAuthorization,
    emergencyVetPermission: details.emergencyVetAuthorization?.authorized === true,
    price: { currency: curr, providerQuote: quoteMinor, requesterTotal: totalDueMinor },
    noStartPolicy: {
      version: CARE_NO_START_POLICY_VERSION,
      minimumBookingMinutes: 60,
      scheduledEndCancellation: true,
      settlement: "no_start_responsibility_matrix_v2",
    },
    cancellationTerms: base?.cancellationTerms,
    disputeIssueWindow: base?.disputeIssueWindow,
    termsPath: clean(details.termsPath) || clean(base?.termsPath) || "/booking-terms",
    termsVersion: clean(details.termsVersion) || clean(base?.termsVersion) || CARE_NO_START_POLICY_VERSION,
    agreedAt: clean(base?.agreedAt) || fallbackAgreedAt,
    requesterSignature: base?.requesterSignature,
    requesterId: chat?.requester_id || "",
    providerId: chat?.provider_id || "",
    createdAt: clean(base?.createdAt) || new Date().toISOString(),
  };
  if (!base) return built;
  return {
    ...base,
    serviceType: built.serviceType,
    petId: built.petId,
    petName: built.petName,
    petSpecies: built.petSpecies,
    petBreed: built.petBreed,
    dogSize: built.dogSize,
    startAt: built.startAt,
    endAt: built.endAt,
    handoffMethod: built.handoffMethod,
    otherTasks: built.otherTasks,
    scopeFrequency: built.scopeFrequency,
    scopeTasks: built.scopeTasks,
    price: built.price,
    noStartPolicy: built.noStartPolicy,
    carerContact: built.carerContact || clean((base as CareBookingSnapshot & { carerContact?: string }).carerContact),
    contact: built.contact || clean((base as CareBookingSnapshot & { contact?: string; ownerContact?: string }).ownerContact) || clean((base as CareBookingSnapshot & { contact?: string }).contact),
    ownerContact: built.contact || clean((base as CareBookingSnapshot & { ownerContact?: string }).ownerContact),
    emergencyContact: clean(details.emergencyContact) || clean(base.emergencyContact),
    handoffLocation: detailsHandoffLocation || baseHandoffLocation,
    locationCountry: built.locationCountry || base.locationCountry,
    locationArea: built.locationArea || base.locationArea,
    careInstructions: clean(details.careInstructions) || clean(base.careInstructions),
    medicationAllergyNotes: clean(details.medicationAllergyNotes) || clean(base.medicationAllergyNotes),
    behaviorEscapeRisk: clean(details.behaviorEscapeRisk) || clean(base.behaviorEscapeRisk),
    emergencyVetContact: clean(details.emergencyVetContact) || clean(base.emergencyVetContact),
    emergencyVetAuthorization: details.emergencyVetAuthorization || base.emergencyVetAuthorization,
    emergencyVetPermission: typeof details.emergencyVetAuthorization?.authorized === "boolean"
      ? details.emergencyVetAuthorization.authorized
      : base.emergencyVetPermission,
  };
};

type CareHistorySnapshot = CareBookingSnapshot & {
  careDetails?: CareScopeCareDetails;
  quoteCard?: ServiceQuoteCard;
  requestCard?: ServiceRequestCard;
  scopeHash?: string;
  scopeVersionId?: string;
};

const serviceRequestCardFromBookingSnapshot = (snapshot?: CareHistorySnapshot | null): ServiceRequestCard | null => {
  if (!snapshot) return null;
  const nestedRequest = snapshot.requestCard && typeof snapshot.requestCard === "object" ? snapshot.requestCard : null;
  const nestedQuote = snapshot.quoteCard && typeof snapshot.quoteCard === "object" ? snapshot.quoteCard : null;
  if (nestedRequest) {
    // History is a frozen Care Scope. Keep the original request card intact (including
    // pet images) and apply only the final agreed quote fields over that same snapshot.
    return {
      ...nestedRequest,
      serviceType: clean(nestedQuote?.serviceType) || clean(nestedRequest.serviceType),
      serviceTypes: nestedQuote?.serviceTypes?.length ? nestedQuote.serviceTypes : nestedRequest.serviceTypes,
      petId: clean(nestedQuote?.petId) || clean(nestedRequest.petId),
      petIds: nestedQuote?.petIds?.length ? nestedQuote.petIds : nestedRequest.petIds,
      petName: clean(nestedQuote?.petName) || clean(nestedRequest.petName),
      petType: clean(nestedQuote?.petType) || clean(nestedRequest.petType),
      petSpecies: clean(nestedQuote?.petSpecies) || clean(nestedRequest.petSpecies),
      petBreed: clean(nestedQuote?.petBreed) || clean(nestedRequest.petBreed),
      dogSize: clean(nestedQuote?.dogSize) || clean(nestedRequest.dogSize),
      pets: mergeCareScopePets(nestedRequest.pets, nestedQuote?.pets),
      requestedDates: nestedQuote?.requestedDates?.length ? nestedQuote.requestedDates : nestedRequest.requestedDates,
      requestedDate: clean(nestedQuote?.requestedDates?.[0]) || clean(nestedRequest.requestedDate),
      startTime: clean(nestedQuote?.startTime) || clean(nestedRequest.startTime),
      endTime: clean(nestedQuote?.endTime) || clean(nestedRequest.endTime),
      locationStyles: nestedQuote?.locationStyles?.length ? nestedQuote.locationStyles : nestedRequest.locationStyles,
      locationArea: clean(nestedQuote?.locationArea) || clean(nestedRequest.locationArea),
      locationCountry: clean(nestedQuote?.locationCountry) || clean(nestedRequest.locationCountry),
      suggestedCurrency: clean(nestedQuote?.currency) || clean(nestedRequest.suggestedCurrency),
      suggestedPrice: clean(nestedQuote?.finalPrice) || clean(nestedRequest.suggestedPrice),
      suggestedRate: clean(nestedQuote?.rate) || clean(nestedRequest.suggestedRate),
      voluntary: nestedQuote?.voluntary === true || nestedRequest.voluntary === true,
      scopeFrequency: clean(nestedQuote?.scopeFrequency) || clean(nestedRequest.scopeFrequency),
      scopeTasks: nestedQuote?.scopeTasks?.length ? nestedQuote.scopeTasks : nestedRequest.scopeTasks,
      otherTasks: clean(nestedQuote?.otherTasks) || clean(nestedRequest.otherTasks),
    };
  }
  const dateKeyFromIso = (iso: string | null | undefined) => {
    const date = new Date(clean(iso));
    return Number.isNaN(date.getTime()) ? "" : localDateKey(date);
  };
  const startDate = dateKeyFromIso(snapshot.startAt);
  const endDate = dateKeyFromIso(snapshot.endAt) || startDate;
  const requestedDates = Array.from(new Set([startDate, endDate].filter(Boolean))).sort();
  const timeFromIso = (iso: string | null | undefined) => {
    const date = new Date(clean(iso));
    if (Number.isNaN(date.getTime())) return "";
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  };
  const providerQuote = Number(snapshot.price?.providerQuote);
  const currency = clean(snapshot.price?.currency);
  const petName = clean(snapshot.petName);
  const petSpecies = clean(snapshot.petSpecies);
  const petBreed = clean(snapshot.petBreed);
  const dogSize = clean(snapshot.dogSize);
  const petId = clean(snapshot.petId);
  const pet: ServiceRequestPet = {
    petId,
    petName,
    petSpecies,
    petBreed,
    dogSize,
    petType: petSpecies,
  };
  const handoffMethod = clean(snapshot.handoffMethod);
  const locationArea = clean(snapshot.locationArea);
  const handoffAlreadyContainsArea = Boolean(locationArea) && (
    handoffMethod === locationArea
    || handoffMethod.endsWith(` - ${locationArea}`)
    || handoffMethod.endsWith(` — ${locationArea}`)
  );
  return {
    serviceType: clean(snapshot.serviceType) || "Care",
    serviceTypes: clean(snapshot.serviceType).split("+").map(clean).filter(Boolean),
    petId,
    petIds: petId ? [petId] : [],
    petName,
    petType: petSpecies,
    petSpecies,
    petBreed,
    dogSize,
    pets: petName || petId ? [pet] : [],
    requestedDates,
    requestedDate: requestedDates[0] || "",
    startAtIso: clean(snapshot.startAt),
    endAtIso: clean(snapshot.endAt),
    startTime: timeFromIso(snapshot.startAt),
    endTime: timeFromIso(snapshot.endAt),
    locationStyles: handoffMethod ? [handoffMethod] : [],
    // Older flat snapshots stored the complete setting in handoffMethod and the
    // area again in locationArea. Do not render that frozen value twice.
    locationArea: handoffAlreadyContainsArea ? "" : locationArea || handoffMethod,
    locationCountry: clean(snapshot.locationCountry),
    suggestedCurrency: currency,
    suggestedPrice: Number.isFinite(providerQuote) && providerQuote > 0 ? String(fromStripeMinorUnitAmount(providerQuote, currency)) : "",
    suggestedRate: CARE_SCOPE_TOTAL_RATE_LABEL,
    voluntary: !(Number.isFinite(providerQuote) && providerQuote > 0),
    scopeFrequency: clean(snapshot.scopeFrequency),
    scopeTasks: normalizeCareTaskList(snapshot.scopeTasks),
    otherTasks: clean(snapshot.otherTasks),
  };
};

const frozenHistoryServiceChatRow = (row: ServiceChatRow): ServiceChatRow => {
  const frozenSnapshot = (row.care_agreement?.bookingSnapshot || row.booking_snapshot) as CareHistorySnapshot | null;
  const frozenRequestCard = serviceRequestCardFromBookingSnapshot(frozenSnapshot);
  if (!frozenRequestCard) return row;
  const frozenCareDetails = normalizeCareScopeCareDetails(frozenSnapshot?.careDetails);
  const frozenAgreement = row.care_agreement;
  return {
    ...row,
    booking_snapshot: frozenSnapshot,
    care_scope: {
      actorRole: null,
      canPay: frozenSnapshot?.price?.providerQuote ? Number(frozenSnapshot.price.providerQuote) > 0 : false,
      careDetails: frozenCareDetails,
      carerSigned: Boolean(frozenAgreement?.providerSignedAt),
      mutualSigned: careAgreementHasSignedParties(frozenAgreement),
      ownerPaymentConsentHash: null,
      ownerSigned: Boolean(frozenAgreement?.requesterSignedAt),
      paymentPendingExpiresAt: null,
      paymentStatus: null,
      scopeHash: clean(frozenAgreement?.scopeHash) || clean(frozenSnapshot?.scopeHash),
      scopeVersionId: clean(frozenAgreement?.scopeVersionId) || clean(frozenSnapshot?.scopeVersionId),
    },
    quote_card: null,
    request_card: frozenRequestCard,
  };
};

const formatMoney = (currency: string | null | undefined, amount: number | string | null | undefined) => {
  const numeric = typeof amount === "number" ? amount : Number(clean(amount));
  const symbol = formatNativeCareCurrencySymbol(currency);
  if (!Number.isFinite(numeric)) return `${symbol} —`;
  const rounded = Math.round(numeric * 100) / 100;
  return `${symbol}${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)}`;
};
const quoteHasPositivePrice = (quote: ServiceQuoteCard | null | undefined) => {
  const amount = Number(clean(quote?.finalPrice));
  return Number.isFinite(amount) && amount > 0;
};

const isNoChargeVoluntaryQuote = (quote: ServiceQuoteCard | null | undefined) =>
  Boolean(quote) && !quoteHasPositivePrice(quote);

// Once a booking has been paid, `booking_snapshot.price.requesterTotal` is the actual amount
// charged, frozen at payment time -- it must never be recomputed from the live
// CARE_REQUESTER_FEE_RATE constant, which can change after the fact (e.g. 0% -> 10%) and would
// otherwise silently reprice history that already happened. Falls back to a live estimate only
// for a booking that hasn't been paid/frozen yet (no snapshot exists).
const frozenOrLiveCarePayment = (
  bookingSnapshot: CareBookingSnapshot | null | undefined,
  quoteCard: ServiceQuoteCard | null | undefined,
  requestCard: ServiceRequestCard | null | undefined,
  isNoChargeVoluntary: boolean,
): { requesterTotal: number | null; providerPayout: number | null } => {
  const snapshotPrice = bookingSnapshot?.price;
  if (snapshotPrice && Number.isFinite(snapshotPrice.requesterTotal) && snapshotPrice.requesterTotal > 0) {
    const requesterTotal = fromStripeMinorUnitAmount(snapshotPrice.requesterTotal, snapshotPrice.currency);
    const providerQuote = fromStripeMinorUnitAmount(snapshotPrice.providerQuote, snapshotPrice.currency);
    return { requesterTotal, providerPayout: providerQuote * (1 - CARE_PROVIDER_FEE_RATE) };
  }
  const quoteAmount = Number(clean(quoteCard?.finalPrice));
  const requestAmount = Number(clean(requestCard?.suggestedPrice));
  const baseAmount = Number.isFinite(quoteAmount) && quoteAmount > 0 ? quoteAmount : requestAmount;
  if (isNoChargeVoluntary || !Number.isFinite(baseAmount) || baseAmount <= 0) return { requesterTotal: null, providerPayout: null };
  return {
    requesterTotal: baseAmount * (1 + CARE_REQUESTER_FEE_RATE),
    providerPayout: baseAmount * (1 - CARE_PROVIDER_FEE_RATE),
  };
};

const isNoChargeVisibleScope = (
  visibleScopeCard: ServiceRequestCard | null | undefined,
  quoteCard: ServiceQuoteCard | null | undefined,
  actorRole?: "owner" | "carer" | null,
) => {
  if (!visibleScopeCard && !quoteCard) return false;
  const visibleAmount = Number(clean(visibleScopeCard?.suggestedPrice));
  if (actorRole === "owner" || actorRole === "carer") return !(Number.isFinite(visibleAmount) && visibleAmount > 0);
  return isNoChargeVoluntaryQuote(quoteCard);
};

const stripeMinimumChargeForCurrency = (currency: string | null | undefined) =>
  STRIPE_MINIMUM_CHARGE_BY_CURRENCY[normalizeNativeCarerCurrency(currency) as NativeCarerCurrency] ?? 0;

const formatMinimumChargeHelper = (currency: string | null | undefined) => {
  const minimum = stripeMinimumChargeForCurrency(currency);
  if (minimum <= 0) return "";
  return `Minimum card payment is ${formatMoney(currency, minimum)} to go through our payment platform.`;
};

const normalizeCareScopePaymentInput = (amount: string | null | undefined, currency: string | null | undefined, rate: string | null | undefined) => {
  const priceText = clean(amount);
  if (!priceText) return { adjustedToMinimum: false, currency: "", finalPrice: "", invalid: false, minimum: 0, paid: false, rate: "", voluntary: true };
  if (!/^[0-9]+(\.[0-9]+)?$/.test(priceText)) return { adjustedToMinimum: false, currency: "", finalPrice: priceText, invalid: true, minimum: 0, paid: false, rate: clean(rate), voluntary: false };
  const numeric = Number(priceText);
  if (!Number.isFinite(numeric)) return { adjustedToMinimum: false, currency: "", finalPrice: priceText, invalid: true, minimum: 0, paid: false, rate: clean(rate), voluntary: false };
  if (numeric === 0) return { adjustedToMinimum: false, currency: "", finalPrice: "", invalid: false, minimum: 0, paid: false, rate: "", voluntary: true };
  const normalizedCurrency = normalizeNativeCarerCurrency(currency) || clean(currency);
  const minimum = stripeMinimumChargeForCurrency(normalizedCurrency);
  const adjusted = minimum > 0 && numeric > 0 && numeric < minimum ? minimum : numeric;
  return {
    adjustedToMinimum: adjusted !== numeric,
    currency: normalizedCurrency,
    finalPrice: String(Math.round(adjusted * 100) / 100),
    invalid: false,
    minimum,
    paid: true,
    rate: CARE_SCOPE_TOTAL_RATE_LABEL,
    voluntary: false,
  };
};

const careScopePaymentAmount = (quote: ServiceQuoteCard | null | undefined, request: ServiceRequestCard | null | undefined) => {
  const quoteAmount = Number(clean(quote?.finalPrice));
  if (quote) return Number.isFinite(quoteAmount) && quoteAmount > 0 ? quoteAmount : 0;
  const requestAmount = Number(clean(request?.suggestedPrice));
  return Number.isFinite(requestAmount) && requestAmount > 0 ? requestAmount : 0;
};

const ZERO_DECIMAL_STRIPE_CURRENCIES = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
const toStripeMinorUnitAmount = (amount: number, currency: string) =>
  ZERO_DECIMAL_STRIPE_CURRENCIES.has(clean(currency).toUpperCase())
    ? Math.round(amount)
    : Math.round(amount * 100);

const fromStripeMinorUnitAmount = (amount: number, currency: string) =>
  ZERO_DECIMAL_STRIPE_CURRENCIES.has(clean(currency).toUpperCase())
    ? amount
    : amount / 100;

const addHoursIso = (iso: string | null | undefined, hours: number) => {
  const raw = clean(iso);
  if (!raw) return "";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return "";
  return new Date(dt.getTime() + hours * 60 * 60 * 1000).toISOString();
};

const serviceScheduledEndIso = (requestCard: ServiceRequestCard | null | undefined, bookingSnapshot?: CareBookingSnapshot | null) => {
  const requestEnd = clean(requestCard?.endAtIso) || clean((requestCard as { endAt?: unknown } | null | undefined)?.endAt);
  if (requestEnd && Number.isFinite(Date.parse(requestEnd))) return new Date(requestEnd).toISOString();
  const bookingEnd = clean(bookingSnapshot?.endAt);
  if (bookingEnd && Number.isFinite(Date.parse(bookingEnd))) return new Date(bookingEnd).toISOString();
  const bounds = getServicePeriodBounds(requestCard);
  return bounds ? new Date(bounds.endAt).toISOString() : "";
};

const SIGNATURE_MIN_POINTS = 6;
const SIGNATURE_MIN_DISTANCE = 28;

const signatureDistance = (points: SignaturePoint[]) => points.reduce((total, point, index) => {
  if (index === 0) return total;
  const prev = points[index - 1];
  return total + Math.hypot(point.x - prev.x, point.y - prev.y);
}, 0);

const signaturePointCount = (strokes: SignatureStroke[]) => strokes.reduce((total, stroke) => total + stroke.length, 0);

const signatureHasInk = (strokes: SignatureStroke[]) =>
  signaturePointCount(strokes) >= SIGNATURE_MIN_POINTS &&
  strokes.some((stroke) => signatureDistance(stroke) >= SIGNATURE_MIN_DISTANCE);

const signatureStrokeToPath = (stroke: SignatureStroke) => {
  if (stroke.length === 0) return "";
  if (stroke.length === 1) {
    const point = stroke[0];
    return `M${point.x.toFixed(1)} ${point.y.toFixed(1)} l0.1 0`;
  }
  let path = `M${stroke[0].x.toFixed(1)} ${stroke[0].y.toFixed(1)}`;
  for (let index = 1; index < stroke.length - 1; index += 1) {
    const current = stroke[index];
    const next = stroke[index + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    path += ` Q${current.x.toFixed(1)} ${current.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }
  const last = stroke[stroke.length - 1];
  path += ` L${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return path;
};

const signatureStrokesToPath = (strokes: SignatureStroke[]) =>
  strokes.map(signatureStrokeToPath).filter(Boolean).join(" ");

const formatRateUnit = (value: string | null | undefined) => {
  const raw = clean(value);
  if (!raw || normalizeRateLabel(raw) === CARE_SCOPE_TOTAL_RATE_LABEL) return "";
  const normalized = raw.toLowerCase();
  return normalized.startsWith("per ") ? normalized : `per ${normalized}`;
};

const normalizePetType = (species: string | null): string => {
  const source = clean(species);
  if (!source) return "";
  const normalized = source.toLowerCase();
  if (normalized === "cats" || normalized === "cat") return "Cat";
  if (normalized === "dogs" || normalized === "dog") return "Dog";
  return source.replace(/\b\w/g, (char) => char.toUpperCase());
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

const UPDATE_PREFERENCE_DEFAULT: CareUpdatePreference = "Optional";
const UPDATE_PREFERENCE_OPTIONS = CARE_UPDATE_PREFERENCE_OPTIONS;
const CARE_SCOPE_TASK_OPTIONS = ["Feeding", "Fresh water", "Walk", "Playtime", "Medication", "Litter / clean-up", "Overnight stay"] as const;
const PAYOUT_AUTO_RELEASE_HOURS = 48;

const normalizeCareTaskList = (items: unknown): string[] => {
  if (!Array.isArray(items)) return [];
  return Array.from(new Set(items.map(clean).filter(Boolean))).sort((a, b) => a.localeCompare(b));
};

const normalizeCareScopeComparable = (value: {
  currency?: string | null;
  finalPrice?: string | null;
  locationArea?: string | null;
  note?: string | null;
  otherTasks?: string | null;
  rate?: string | null;
  scopeFrequency?: string | null;
  scopeTasks?: string[] | null;
  voluntary?: boolean | null;
}) => ({
  currency: normalizeNativeCarerCurrency(value.currency) || "",
  finalPrice: clean(value.finalPrice),
  locationArea: clean(value.locationArea),
  note: clean(value.note),
  otherTasks: clean(value.otherTasks),
  rate: normalizeRateLabel(value.rate) || "",
  scopeFrequency: clean(value.scopeFrequency),
  scopeTasks: normalizeCareTaskList(value.scopeTasks),
  voluntary: value.voluntary === true,
});

const normalizeServiceRequestComparable = (card?: ServiceRequestCard | null) => ({
  additionalNotes: clean(card?.additionalNotes),
  endTime: clean(card?.endTime),
  locationArea: clean(card?.locationArea),
  locationCountry: clean(card?.locationCountry),
  locationStyles: [...(card?.locationStyles || [])].map(clean).filter(Boolean).sort(),
  otherTasks: clean(card?.otherTasks),
  pets: card ? requestCardPets(card).map((pet) => ({
    dogSize: clean(pet.dogSize),
    petBreed: clean(pet.petBreed),
    petId: clean(pet.petId),
    petName: clean(pet.petName),
    petSpecies: normalizePetType(pet.petSpecies || pet.petType || null),
  })).sort((a, b) => `${a.petId}:${a.petName}`.localeCompare(`${b.petId}:${b.petName}`)) : [],
  requestedDates: [...(card?.requestedDates || [])].map(clean).filter(Boolean).sort(),
  scopeFrequency: clean(card?.scopeFrequency),
  scopeTasks: normalizeCareTaskList(card?.scopeTasks),
  serviceTypes: [...(card?.serviceTypes || (card?.serviceType ? [card.serviceType] : []))].map(clean).filter(Boolean).sort(),
  startTime: clean(card?.startTime),
  suggestedCurrency: normalizeNativeCarerCurrency(card?.suggestedCurrency) || "",
  suggestedPrice: clean(card?.suggestedPrice),
  suggestedRate: Number(clean(card?.suggestedPrice)) > 0 ? CARE_SCOPE_TOTAL_RATE_LABEL : "",
  updatePreference: normalizeUpdatePreference(card?.updatePreference),
  voluntary: card?.voluntary === true,
});

const careCurrencyFromScopeOnly = (quoteCard?: ServiceQuoteCard | null, requestCard?: ServiceRequestCard | null): NativeCarerCurrency | "" => (
  normalizeNativeCarerCurrency(quoteCard?.currency)
  || normalizeNativeCarerCurrency(requestCard?.suggestedCurrency)
  || ""
);

const resolveCareScopeDisplayCurrency = (input: {
  currencyCountries?: unknown[];
  providerCurrency?: unknown;
  quoteCard?: ServiceQuoteCard | null;
  requestCard?: ServiceRequestCard | null;
}): NativeCarerCurrency => (
  careCurrencyFromScopeOnly(input.quoteCard, input.requestCard)
  || resolveCareScopeCurrency({
    providerCurrency: input.providerCurrency,
    locationCountries: [input.requestCard?.locationCountry, ...(input.currencyCountries ?? [])],
  })
);

const normalizeUpdatePreference = normalizeCareUpdatePreference;

const providerEditableLocationStyles = new Set(["Carer's Place", "Flexible", "Outdoor"]);
const providerCanEditCareScopeLocation = (requestCard: ServiceRequestCard | null | undefined) =>
  Boolean(Array.isArray(requestCard?.locationStyles) && requestCard.locationStyles.some((item) => providerEditableLocationStyles.has(clean(item))));

const requestCardFromQuoteCard = (quoteCard: ServiceQuoteCard | null | undefined): ServiceRequestCard | null => {
  if (!quoteCard) return null;
  return {
    serviceType: clean(quoteCard.serviceType),
    serviceTypes: Array.isArray(quoteCard.serviceTypes) ? quoteCard.serviceTypes : [],
    petId: clean(quoteCard.petId),
    petIds: Array.isArray(quoteCard.petIds) ? quoteCard.petIds : [],
    petName: clean(quoteCard.petName),
    petType: clean(quoteCard.petType),
    dogSize: clean(quoteCard.dogSize),
    pets: Array.isArray(quoteCard.pets) ? quoteCard.pets : [],
    requestedDates: Array.isArray(quoteCard.requestedDates) ? quoteCard.requestedDates : [],
    requestedDate: Array.isArray(quoteCard.requestedDates) && quoteCard.requestedDates[0] ? quoteCard.requestedDates[0] : "",
    startTime: clean(quoteCard.startTime),
    endTime: clean(quoteCard.endTime),
    locationStyles: Array.isArray(quoteCard.locationStyles) ? quoteCard.locationStyles : [],
    locationArea: clean(quoteCard.locationArea),
    locationCountry: clean(quoteCard.locationCountry),
    suggestedCurrency: clean(quoteCard.currency),
    suggestedPrice: clean(quoteCard.finalPrice),
    suggestedRate: clean(quoteCard.rate),
    scopeFrequency: clean(quoteCard.scopeFrequency),
    scopeTasks: normalizeCareTaskList(quoteCard.scopeTasks),
    otherTasks: clean(quoteCard.otherTasks),
    updatePreference: normalizeUpdatePreference(quoteCard.updatePreference),
  };
};

const requestCardWithCareScopeUpdates = (
  requestCard: ServiceRequestCard | null | undefined,
  quoteCard: ServiceQuoteCard | null | undefined,
  actorRole?: "owner" | "carer" | null,
): ServiceRequestCard | null => {
  if (!requestCard) return requestCardFromQuoteCard(quoteCard);
  if (!quoteCard) return requestCard;

  const base: ServiceRequestCard = {
    ...requestCard,
    serviceType: requestCard.serviceType || clean(quoteCard.serviceType),
    serviceTypes: requestCard.serviceTypes?.length ? requestCard.serviceTypes : (quoteCard.serviceTypes?.length ? quoteCard.serviceTypes : requestCard.serviceTypes),
    petId: requestCard.petId || clean(quoteCard.petId),
    petIds: requestCard.petIds?.length ? requestCard.petIds : (quoteCard.petIds?.length ? quoteCard.petIds : requestCard.petIds),
    petName: requestCard.petName || clean(quoteCard.petName),
    petType: requestCard.petType || clean(quoteCard.petType),
    dogSize: requestCard.dogSize || clean(quoteCard.dogSize),
    pets: mergeCareScopePets(requestCard.pets, quoteCard.pets),
    requestedDates: requestCard.requestedDates?.length ? requestCard.requestedDates : quoteCard.requestedDates,
    startTime: requestCard.startTime || clean(quoteCard.startTime),
    endTime: requestCard.endTime || clean(quoteCard.endTime),
    locationStyles: requestCard.locationStyles?.length ? requestCard.locationStyles : quoteCard.locationStyles,
    locationArea: requestCard.locationArea || clean(quoteCard.locationArea),
    locationCountry: clean(requestCard.locationCountry) || clean(quoteCard.locationCountry),
  };

  const quoteOwnsCurrentTurn = actorRole === "carer";
  const paymentFieldsPresent = Boolean(
    clean(quoteCard.currency)
    || clean(quoteCard.finalPrice)
    || clean(quoteCard.rate)
    || quoteCard.voluntary === true,
  );

  return {
    ...base,
    serviceType: quoteOwnsCurrentTurn ? clean(quoteCard.serviceType) || base.serviceType : base.serviceType,
    serviceTypes: quoteOwnsCurrentTurn && quoteCard.serviceTypes?.length ? quoteCard.serviceTypes : base.serviceTypes,
    petId: quoteOwnsCurrentTurn ? clean(quoteCard.petId) || base.petId : base.petId,
    petIds: quoteOwnsCurrentTurn && quoteCard.petIds?.length ? quoteCard.petIds : base.petIds,
    petName: quoteOwnsCurrentTurn ? clean(quoteCard.petName) || base.petName : base.petName,
    petType: quoteOwnsCurrentTurn ? clean(quoteCard.petType) || base.petType : base.petType,
    dogSize: quoteOwnsCurrentTurn ? clean(quoteCard.dogSize) || base.dogSize : base.dogSize,
    pets: quoteOwnsCurrentTurn ? mergeCareScopePets(requestCard.pets, quoteCard.pets) : base.pets,
    requestedDates: quoteOwnsCurrentTurn && quoteCard.requestedDates?.length ? quoteCard.requestedDates : base.requestedDates,
    startTime: quoteOwnsCurrentTurn ? clean(quoteCard.startTime) || base.startTime : base.startTime,
    endTime: quoteOwnsCurrentTurn ? clean(quoteCard.endTime) || base.endTime : base.endTime,
    locationStyles: quoteOwnsCurrentTurn && quoteCard.locationStyles?.length ? quoteCard.locationStyles : base.locationStyles,
    locationArea: quoteOwnsCurrentTurn ? clean(quoteCard.locationArea) || base.locationArea : base.locationArea,
    locationCountry: quoteOwnsCurrentTurn ? clean(quoteCard.locationCountry) || clean(base.locationCountry) : clean(base.locationCountry),
    suggestedCurrency: quoteOwnsCurrentTurn && paymentFieldsPresent ? clean(quoteCard.currency) : clean(base.suggestedCurrency),
    suggestedPrice: quoteOwnsCurrentTurn && paymentFieldsPresent ? clean(quoteCard.finalPrice) : clean(base.suggestedPrice),
    suggestedRate: quoteOwnsCurrentTurn && paymentFieldsPresent ? clean(quoteCard.rate) : clean(base.suggestedRate),
    scopeFrequency: quoteOwnsCurrentTurn ? clean(quoteCard.scopeFrequency) || base.scopeFrequency : base.scopeFrequency,
    scopeTasks: quoteOwnsCurrentTurn && normalizeCareTaskList(quoteCard.scopeTasks).length
      ? normalizeCareTaskList(quoteCard.scopeTasks)
      : normalizeCareTaskList(base.scopeTasks),
    otherTasks: quoteOwnsCurrentTurn ? clean(quoteCard.otherTasks) || clean(base.otherTasks) : clean(base.otherTasks),
  };
};

const visibleCareScopeCardForChat = (chat: ServiceChatRow | null | undefined): ServiceRequestCard | null =>
  requestCardWithCareScopeUpdates(chat?.request_card, chat?.quote_card, chat?.care_scope?.actorRole);

const isNoChargeServiceChat = (chat: ServiceChatRow | null | undefined) =>
  isNoChargeVisibleScope(visibleCareScopeCardForChat(chat), chat?.quote_card, chat?.care_scope?.actorRole);

const serviceChatHasPositivePayment = (chat: ServiceChatRow | null | undefined) =>
  !isNoChargeServiceChat(chat) && careScopePaymentAmount(chat?.quote_card, visibleCareScopeCardForChat(chat)) > 0;

const parseProviderRateRows = (rawRates: unknown): NativeRateRow[] => {
  if (!Array.isArray(rawRates)) return [];
  return rawRates.map((entry) => {
    try {
      if (typeof entry === "string") return deserializeRateRow(entry);
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      return {
        price: clean(row.price),
        rate: clean(row.rate),
        services: Array.isArray(row.services) ? row.services.map(clean).filter(Boolean) : [],
        voluntary: row.voluntary === true,
      } satisfies NativeRateRow;
    } catch {
      return null;
    }
  }).filter((row): row is NativeRateRow => Boolean(row));
};

const parseProviderRateServices = (rateRows: NativeRateRow[], fallbackServices: unknown) => {
  const services: string[] = [];
  rateRows.forEach((row) => {
    row.services.forEach((service) => {
      const label = clean(service);
      if (label) services.push(label);
    });
  });
  if (Array.isArray(fallbackServices)) {
    fallbackServices.forEach((service) => {
      const label = clean(service);
      if (label) services.push(label);
    });
  }
  return Array.from(new Set(services));
};

const formatPetCaption = (pet: { species?: string | null; dob?: string | null; dogSize?: string | null; pet_size?: string | null }) => {
  const species = normalizePetType(pet.species || null) || "Pet";
  const dogSize = clean(pet.dogSize) || clean(pet.pet_size);
  const speciesWithSize = species === "Dog" && dogSize ? `Dog (${dogSize})` : species;
  const dob = clean(pet.dob);
  if (!dob) return speciesWithSize;
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return speciesWithSize;
  const today = new Date();
  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  if (today.getDate() < birthDate.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const age = years > 0 ? `${years}` : months > 0 ? `${months} mo` : "";
  return [speciesWithSize, age].filter(Boolean).join(" · ");
};

const hasServicePeriodPassed = (request: ServiceRequestCard | null | undefined) => {
  if (!request) return true;
  const bounds = getServicePeriodBounds(request);
  return bounds ? Date.now() >= bounds.endAt : true;
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
  const startAt = new Date(`${firstDate}T${startTime}:00+08:00`).getTime();
  const rawEndAt = new Date(`${lastDate}T${endTime}:00+08:00`).getTime();
  if (!Number.isFinite(startAt) || !Number.isFinite(rawEndAt)) return null;
  const endAt = rawEndAt <= startAt ? rawEndAt + 24 * 60 * 60 * 1000 : rawEndAt;
  if (endAt <= startAt) return null;
  return { startAt, endAt };
};

const getRequestedCareDayCount = (request: ServiceRequestCard | null | undefined) => {
  const dates = Array.isArray(request?.requestedDates) ? request.requestedDates.map(clean).filter(Boolean) : [];
  if (dates.length > 0) return dates.length;
  const requestedDate = clean(request?.requestedDate);
  return requestedDate ? 1 : 1;
};

// A pending care request is expired once its scheduled end has passed and it has
// not advanced to a booked/in-progress/completed/disputed state. Expired pending
// requests are not actionable for the carer (no auto-open, quote, sign, or pay);
// the requester is prompted to update the date or withdraw. Backend remains the
// final authority and rejects scope/sign/pay on expired requests.
const isPendingRequestExpired = (chat: ServiceChatRow | null | undefined) => {
  if (!chat || chat.status !== "pending" || !chat.request_card) return false;
  const bounds = getServicePeriodBounds(chat.request_card);
  if (!bounds) return false;
  return Date.now() > bounds.endAt;
};

const getServiceStartMs = (chat: ServiceChatRow | null | undefined) => {
  const snapshotStart = clean(chat?.booking_snapshot?.startAt);
  if (snapshotStart) {
    const parsed = new Date(snapshotStart).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return getServicePeriodBounds(chat?.request_card)?.startAt ?? null;
};

const isServiceScheduledToStart = (chat: ServiceChatRow | null | undefined, nowMs = Date.now()) => {
  const startMs = getServiceStartMs(chat);
  if (!startMs) return false;
  return nowMs >= startMs;
};

const canServiceStartNow = (chat: ServiceChatRow | null | undefined, nowMs = Date.now()) => (
  isServiceScheduledToStart(chat, nowMs)
  || chat?.care_status === "pin_shared"
  || Boolean(clean(chat?.early_start_allowed_at))
);

const getServiceHandoffGraceEndMs = (chat: ServiceChatRow | null | undefined) => {
  const startMs = getServiceStartMs(chat);
  const snapshotEnd = clean(chat?.booking_snapshot?.endAt);
  const endMs = snapshotEnd ? Date.parse(snapshotEnd) : NaN;
  if (!startMs || !Number.isFinite(endMs) || endMs <= startMs) return null;
  const durationMs = endMs - startMs;
  const graceMs = Math.min(60 * 60 * 1000, Math.max(30 * 60 * 1000, durationMs / 2));
  return startMs + graceMs;
};

const getServiceMidpointAt = (chat: ServiceChatRow | null | undefined) => {
  const bounds = getServicePeriodBounds(chat?.request_card);
  if (!bounds) return null;
  return bounds.startAt + (bounds.endAt - bounds.startAt) / 2;
};
// Single source of truth for the Cancel Booking sheet's info box + CTA label. Each tier is
// pinned to the exact backend behavior it describes: owner tiers mirror cancel-service-booking's
// refund math (>=72h full / >=24h half / <24h none), carer tiers mirror the >24h-vs-<=24h split
// in cancel_paid_booking_by_provider_after_refund (8% vs 20% trust penalty, immediate vs
// under_review). Carer cancellations always fully refund the owner regardless of timing -- only
// the consequence to the carer's own Care record changes -- so the copy must say that, not repeat
// a refund-tier message that doesn't apply to them.
const getCancelPolicy = (chat: ServiceChatRow | null | undefined, isProvider: boolean) => {
  if (isNoChargeServiceChat(chat)) {
    return {
      tier: "voluntary",
      confirmLabel: "Cancel booking",
      body: isProvider
        ? "This is a no-charge booking, so no payment or payout is involved. Cancelling still records the commitment and may affect your Care record or booking access."
        : "If you cancel now, the booking will be cancelled. No payment or refund is involved.",
    };
  }
  const startMs = getServiceStartMs(chat);
  const hours = startMs ? (startMs - Date.now()) / 3600000 : 0;
  if (isProvider) {
    // Matches cancel_paid_booking_by_provider_after_refund's `v_hours > 24` split exactly.
    // The carer doesn't need to know how the owner's refund works here -- only what cancelling
    // now costs them.
    if (hours > 24) {
      return {
        tier: "provider_early",
        confirmLabel: "Cancel booking",
        body: "Owners plan around your commitment. Cancelling now marks your Care record and may reduce how often your profile is shown.",
      };
    }
    return {
      tier: "provider_late",
      confirmLabel: "Cancel booking",
      body: "This is a last-minute cancellation. We require a reason and supporting evidence to justify it -- without this, your account may be suspended while huddle reviews what happened.",
    };
  }
  if (hours >= 72) {
    return {
      tier: "full",
      confirmLabel: "Cancel booking",
      body: "If you cancel now, you'll receive a full refund to your original payment method. Most refunds typically appear within 5–10 business days.",
    };
  }
  if (hours >= 24) {
    return {
      tier: "half",
      confirmLabel: "Cancel booking",
      body: "If you cancel now, you'll receive a 50% refund to your original payment method. huddle retains the remaining 50%.",
    };
  }
  return {
    tier: "none",
    confirmLabel: "Cancel without refund",
    body: "This booking is now non-refundable. If something went wrong, report an issue so huddle can review it before provider payout.",
  };
};
function ServiceSystemPill({ actorName, createdAt, isRequester, kind, mutualAgreed, policy }: { actorName: string; createdAt?: string | null; isRequester: boolean; kind: string; mutualAgreed?: boolean; policy?: string }) {
  const eventDateTime = formatServiceEventDateTime(createdAt);
  const labels: Record<string, string> = {
    service_request_sent: isRequester ? "Your booking request has been sent." : "You received a booking request.",
    service_request_updated: `${actorName} updated the care request.`,
    service_request_withdrawn: `${actorName} withdrew the care request.`,
    service_request_declined: `${actorName} declined the care request.`,
    service_quote_sent: `${actorName} shared the Care Scope.`,
    service_care_scope_updated: `${actorName} updated the Care Scope.`,
    service_care_scope_agreed: mutualAgreed ? "Both sides agreed to the Care Scope." : `${actorName} agreed to the Care Scope.`,
    service_care_instruction_shared: `${actorName} shared the Care Instruction.`,
    service_care_instruction_updated: `${actorName} updated the Care Instruction.`,
    service_booked: "All set! Your care session is locked in.",
    service_pin_shared: isRequester ? "Start PIN shared with your carer." : `${actorName} shared the Start PIN.`,
    service_early_start_allowed: isRequester ? "You allowed early start." : `${actorName} allowed early start.`,
    service_check_in: `Care session started${eventDateTime ? ` at ${eventDateTime}` : ""}.`,
    service_in_progress: `Care session started${eventDateTime ? ` at ${eventDateTime}` : ""}.`,
    service_completed: `Care session completed${eventDateTime ? ` at ${eventDateTime}` : ""}.`,
    service_dispute_resolved: "Review completed. This booking is now closed.",
    service_disputed: "Issue flagged. Our team is looking into this.",
    service_issue_reported: "Issue flagged. Our team is looking into this.",
    service_booking_cancelled: /lte_24h/.test(policy || "") ? `${actorName} cancelled close to the booking. huddle is reviewing this cancellation.` : `${actorName} cancelled the booking.`,
    service_handoff_problem_reported: `${actorName} reported a handoff issue.`,
    service_no_start_cancelled: "The care session is overdue and was cancelled under the no-start policy.",
  };
  const tone: Record<string, "neutral" | "muted" | "info" | "success" | "warning"> = {
    service_request_sent: "neutral",
    service_request_updated: "neutral",
    service_request_withdrawn: "muted",
    service_request_declined: "muted",
    service_quote_sent: "info",
    service_care_scope_updated: "info",
    service_care_scope_agreed: "success",
    service_care_instruction_shared: "info",
    service_care_instruction_updated: "info",
    service_booked: "success",
    service_pin_shared: "info",
    service_early_start_allowed: "info",
    service_check_in: "success",
    service_in_progress: "success",
    service_completed: "success",
    service_dispute_resolved: "success",
    service_disputed: "warning",
    service_issue_reported: "warning",
    service_booking_cancelled: "muted",
    service_handoff_problem_reported: "warning",
    service_no_start_cancelled: "warning",
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
  const [signedUrls, setSignedUrls] = useState<Record<string, string | null>>({});
  const imageAttachments = useMemo(() => attachments.filter((attachment) => (
    attachment.bucket === "care_attachments" &&
    Boolean(attachment.path) &&
    String(attachment.mime || "image/jpeg").startsWith("image/")
  )), [attachments]);

  useEffect(() => {
    let cancelled = false;
    const unresolved = imageAttachments
      .map((attachment) => attachment.path || "")
      .filter((path) => path && !(path in signedUrls));
    if (unresolved.length === 0) return;
    void Promise.all(unresolved.map(async (path) => {
      try {
        return [path, await getCachedSignedStorageUrl("care_attachments", path, 60 * 60 * 24 * 30)] as const;
      } catch {
        return [path, null] as const;
      }
    })).then((rows) => {
      if (cancelled) return;
      setSignedUrls((current) => {
        const next = { ...current };
        rows.forEach(([path, url]) => { next[path] = url; });
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [imageAttachments, signedUrls]);

  const mediaItems: NativeSocialCarouselItem[] = imageAttachments
    .map((attachment): NativeSocialCarouselItem | null => {
      const uri = attachment.path ? signedUrls[attachment.path] : null;
      return uri ? { kind: "image", uri } : null;
    })
    .filter((item): item is NativeSocialCarouselItem => Boolean(item));
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

function NativeSignaturePad({
  attempted,
  captureViewRef,
  onChange,
  onSigningChange,
}: {
  attempted: boolean;
  captureViewRef?: MutableRefObject<View | null>;
  onChange: (signature: CareSignatureSnapshot | null) => void;
  onSigningChange: (signing: boolean) => void;
}) {
  const [layout, setLayout] = useState({ width: 1, height: 148 });
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const strokesRef = useRef<SignatureStroke[]>([]);
  const frameRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const signingRef = useRef(false);

  const path = useMemo(() => signatureStrokesToPath(strokes), [strokes]);
  const hasInk = signatureHasInk(strokes);
  const hasAnyStroke = signaturePointCount(strokes) > 0;

  const emit = useCallback((nextStrokes: SignatureStroke[]) => {
    const nextPath = signatureStrokesToPath(nextStrokes);
    if (!signatureHasInk(nextStrokes)) {
      onChange(null);
      return;
    }
    onChange({
      height: Math.round(layout.height),
      path: nextPath,
      pointCount: signaturePointCount(nextStrokes),
      signedAt: new Date().toISOString(),
      strokeCount: nextStrokes.length,
      width: Math.round(layout.width),
    });
  }, [layout.height, layout.width, onChange]);

  const flush = useCallback((nextStrokes: SignatureStroke[], shouldEmit = false) => {
    strokesRef.current = nextStrokes;
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        setStrokes(strokesRef.current);
      });
    }
    if (shouldEmit) emit(nextStrokes);
  }, [emit]);

  const pointFromEvent = useCallback((event: GestureResponderEvent): SignaturePoint => {
    const { locationX, locationY } = event.nativeEvent;
    return {
      x: Math.max(0, Math.min(layout.width, locationX)),
      y: Math.max(0, Math.min(layout.height, locationY)),
    };
  }, [layout.height, layout.width]);

  const startStroke = useCallback((event: GestureResponderEvent) => {
    signingRef.current = true;
    onSigningChange(true);
    Keyboard.dismiss();
    flush([...strokesRef.current, [pointFromEvent(event)]]);
  }, [flush, onSigningChange, pointFromEvent]);

  const moveStroke = useCallback((event: GestureResponderEvent) => {
    if (!signingRef.current) return;
    const nextPoint = pointFromEvent(event);
    const nextStrokes = [...strokesRef.current];
    const currentStroke = [...(nextStrokes[nextStrokes.length - 1] || [])];
    const previous = currentStroke[currentStroke.length - 1];
    if (previous && Math.hypot(nextPoint.x - previous.x, nextPoint.y - previous.y) < 1.8) return;
    currentStroke.push(nextPoint);
    nextStrokes[nextStrokes.length - 1] = currentStroke;
    flush(nextStrokes);
  }, [flush, pointFromEvent]);

  const endStroke = useCallback(() => {
    if (!signingRef.current) return;
    signingRef.current = false;
    onSigningChange(false);
    flush(strokesRef.current, true);
  }, [flush, onSigningChange]);

  const signaturePanResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: startStroke,
      onPanResponderMove: moveStroke,
      onPanResponderRelease: endStroke,
      onPanResponderTerminate: endStroke,
      onShouldBlockNativeResponder: () => true,
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
    }),
    [endStroke, moveStroke, startStroke],
  );

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  const clear = () => {
    signingRef.current = false;
    onSigningChange(false);
    strokesRef.current = [];
    setStrokes([]);
    onChange(null);
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout({ width: Math.max(1, width), height: Math.max(1, height) });
  };

  return (
    <View style={[styles.signatureCard, attempted && !hasInk ? styles.signatureCardError : null]}>
      <View style={styles.signatureTopRow}>
        <Text style={styles.signatureTitle}>Signature</Text>
        <Pressable accessibilityRole="button" disabled={!hasAnyStroke} onPress={clear} style={({ pressed }) => [styles.signatureClearButton, !hasAnyStroke ? styles.signatureClearButtonDisabled : null, pressed && hasAnyStroke ? nativeModalStyles.pressed : null]}>
          <Text style={[styles.signatureClearText, !hasAnyStroke ? styles.signatureClearTextDisabled : null]}>Clear</Text>
        </Pressable>
      </View>
      <View
        accessibilityLabel="Draw signature"
        accessibilityRole="imagebutton"
        collapsable={false}
        ref={captureViewRef}
        onLayout={onLayout}
        style={styles.signatureInkArea}
        {...signaturePanResponder.panHandlers}
      >
        <Svg height="100%" pointerEvents="none" viewBox={`0 0 ${layout.width} ${layout.height}`} width="100%">
          <Line stroke={huddleColors.fieldBorderStrong} strokeLinecap="round" strokeWidth={1.5} x1={20} x2={layout.width - 20} y1={layout.height - 30} y2={layout.height - 30} />
          {path ? <Path d={path} fill="none" stroke={huddleColors.text} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.2} /> : null}
        </Svg>
        {!hasInk ? (
          <View pointerEvents="none" style={styles.signaturePlaceholder}>
            <Text style={styles.signaturePlaceholderText}>sign here</Text>
            <Feather color={huddleColors.mutedText} name="edit-3" size={15} />
          </View>
        ) : null}
      </View>
      {attempted && !hasInk ? <Text style={styles.signatureErrorText}>Draw your signature before confirming.</Text> : null}
    </View>
  );
}

function ReviewSelectChips({ options, selected, onChange }: { options: readonly string[]; selected: string[]; onChange: (next: string[]) => void }) {
  // Chips flex-wrap to their own natural width (same pattern as MultiSelectChips/chipWrap)
  // instead of being force-split into fixed rows of 3 — the old fixed-row-of-3 layout
  // shrank each chip to fit, silently truncating labels like "My pets love them" to
  // "My pets love t..." with no way to read the rest.
  return (
    <View style={styles.reviewChipStack}>
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <Pressable
            accessibilityRole="button"
            key={option}
            onPress={() => onChange(active ? selected.filter((item) => item !== option) : [...selected, option])}
            style={({ pressed }) => [styles.reviewChip, active ? styles.chipActive : null, pressed ? nativeModalStyles.pressed : null]}
          >
            <Text style={[styles.reviewChipText, active ? styles.chipTextActive : null]}>{option}</Text>
          </Pressable>
        );
      })}
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
  progress: number;
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
const CHECKIN_STAMP_WIDTH = 1440;

const formatCheckinStamp = (date: Date) => {
  const hours = date.getHours();
  const hour12 = hours % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const suffix = hours >= 12 ? "pm" : "am";
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" });
  return `${String(hour12).padStart(2, "0")}:${minutes}${suffix} ${day} ${month}, ${date.getFullYear()}`;
};

const buildServiceBookingDateTime = (date: string, time: string) => {
  const dateParts = clean(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeParts = clean(time).match(/^(\d{1,2}):(\d{2})$/);
  if (!dateParts || !timeParts) return clean(date);
  const year = Number(dateParts[1]);
  const month = Number(dateParts[2]);
  const day = Number(dateParts[3]);
  const hour = Number(timeParts[1]);
  const minute = Number(timeParts[2]);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return clean(date);
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
};

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
  label?: string;
  onToggle: () => void;
  open: boolean;
  placeholder: string;
  value: string;
}) {
  return (
    <View style={label ? nativeModalStyles.appModalFieldBlock : undefined}>
      {label ? <Text style={styles.requestCreateLabel}>{label}</Text> : null}
      <Pressable accessibilityRole="button" onPress={onToggle} style={[nativeModalStyles.appModalSelectTrigger, styles.requestFieldHeight, open ? nativeModalStyles.appModalFieldFocused : null, error ? nativeModalStyles.appModalFieldError : null]}>
        <Text numberOfLines={1} style={[nativeModalStyles.appModalSelectText, !value ? nativeModalStyles.appModalSelectPlaceholder : null]}>{value || placeholder}</Text>
        <Feather color={huddleColors.mutedText} name={open ? "chevron-up" : "chevron-down"} size={16} />
      </Pressable>
      {open ? <View style={styles.requestSelectMenu}>{children}</View> : null}
    </View>
  );
}

function RateFieldLabel({ optional }: { optional: boolean }) {
  if (!optional) return <Text style={styles.requestCreateLabel}>Total</Text>;
  return (
    <Text style={styles.requestCreateLabel}>
      Total
    </Text>
  );
}

function RequestPetCarousel({
  error,
  onAddManualPet,
  onSelect,
  pets,
  selectedPetIds,
}: {
  error?: boolean;
  onAddManualPet: () => void;
  onSelect: (pet: PetOption) => void;
  pets: PetOption[];
  selectedPetIds: string[];
}) {
  const visiblePets = pets;
  return (
    <View style={styles.petSelectSection}>
      {visiblePets.length > 0 || onAddManualPet ? (
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.petSelectRail}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.petSelectRailViewport}
        >
          {visiblePets.map((pet) => {
            const selected = selectedPetIds.includes(pet.id);
            return (
              <View key={pet.id} style={[styles.petSelectTile, error ? styles.petSelectTileError : null]}>
                <NativePolaroidCard
                  accessibilityLabel={`${selected ? "Remove" : "Select"} ${pet.name || "pet"}`}
                  captionPrimary={pet.name || "Pet"}
                  captionSecondary={<Text numberOfLines={2} style={nativePolaroidStyles.captionSecondaryToken}>{formatPetCaption(pet)}</Text>}
                  onPress={() => onSelect(pet)}
                  photo={pet.photo_url ? (() => {
                    const photoVersion = nativeMutableImageVersion(pet.photo_url, pet.updated_at);
                    return <Image key={nativeFreshImageKey(pet.photo_url, photoVersion)} resizeMode="cover" source={{ uri: nativeFreshImageUri(pet.photo_url, photoVersion) }} style={nativePolaroidStyles.photo} />;
                  })() : (
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
          <View style={styles.petSelectTile}>
            <Pressable accessibilityLabel="Input pet details" accessibilityRole="button" onPress={onAddManualPet} style={({ pressed }) => [styles.petAddTile, pressed ? nativeModalStyles.pressed : null]}>
              <Feather color={huddleColors.text} name="plus" size={22} />
              <Text style={styles.petAddTileText}>Input pet details</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : null}
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
    petBreed: "petBreed" in requestCard ? clean(requestCard.petBreed) : "",
    petPhotoUrl: "petPhotoUrl" in requestCard ? clean(requestCard.petPhotoUrl) : "",
    petSpecies: "petSpecies" in requestCard ? clean(requestCard.petSpecies) : clean(requestCard.petType),
    petType: clean(requestCard.petType),
  }];
}

function SelectedPetPolaroid({ requestCard, onOpenPet }: { requestCard: ServiceRequestCard | ServiceQuoteCard; onOpenPet?: (petId: string) => void }) {
  const selectedPets = requestCardPets(requestCard);
  if (selectedPets.length === 0) return null;
  const profilePets = selectedPets.filter((pet) => clean(pet.petId));
  const manualPets = selectedPets.filter((pet) => !clean(pet.petId));
  return (
    <View style={styles.summaryPetBlock}>
      {profilePets.length > 0 ? (
        <ScrollView bounces={false} contentContainerStyle={styles.summaryPetRail} horizontal showsHorizontalScrollIndicator={false}>
          {[...profilePets, ...manualPets].map((pet, index) => {
            const isProfilePet = Boolean(clean(pet.petId));
            return (
              <View key={pet.petId || `${pet.petName || "manual"}-${index}`} style={styles.summaryPetTile}>
                <NativePolaroidCard
                  accessibilityLabel={isProfilePet ? `Open ${pet.petName || "pet"} profile` : `${pet.petName || "manual pet"} details`}
                  captionPrimary={pet.petName || "Pet"}
                  captionSecondary={<Text numberOfLines={2} style={nativePolaroidStyles.captionSecondaryToken}>{formatPetCaption({ species: pet.petSpecies || pet.petType || null, dob: pet.petDob || null, dogSize: pet.dogSize })}</Text>}
                  onPress={isProfilePet && pet.petId ? () => onOpenPet?.(pet.petId) : undefined}
                  photo={pet.petPhotoUrl ? (
                    <Image key={nativeFreshImageKey(pet.petPhotoUrl, pet.petId || pet.petPhotoUrl)} resizeMode="cover" source={{ uri: nativeFreshImageUri(pet.petPhotoUrl, pet.petId || pet.petPhotoUrl) }} style={nativePolaroidStyles.photo} />
                  ) : (
                    <View style={[nativePolaroidStyles.photoPlaceholder, styles.summaryPetInitialPhoto]}>
                      <Text style={styles.summaryPetInitial}>{(pet.petName || "P").slice(0, 1).toUpperCase()}</Text>
                    </View>
                  )}
                />
              </View>
            );
          })}
        </ScrollView>
      ) : null}
      {profilePets.length === 0 ? manualPets.map((pet, index) => (
        <View key={`${pet.petName || "manual"}-${index}`} style={styles.manualPetSummaryGroup}>
          <ScopeDetailRow label="Pet name">{pet.petName || "—"}</ScopeDetailRow>
          <ScopeDetailRow label="Species">{formatPetCaption({ species: pet.petSpecies || pet.petType || null, dogSize: pet.dogSize })}</ScopeDetailRow>
          <ScopeDetailRow label="Breed">{pet.petBreed || "—"}</ScopeDetailRow>
        </View>
      )) : null}
    </View>
  );
}

function RequestOptionRow({ active, emoji, label, onPress }: { active?: boolean; emoji?: string; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.requestSelectOption, pressed ? nativeModalStyles.pressed : null]}>
      <View style={styles.requestSelectOptionLabelRow}>
        {emoji ? <Text style={styles.requestSelectOptionEmoji}>{emoji}</Text> : null}
        <Text style={[styles.requestSelectOptionText, active ? styles.requestSelectOptionTextActive : null]}>{label}</Text>
      </View>
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
  currencyOptions,
  initialCard,
  onClose,
  onReturnToPayment,
  onSubmit,
  currencyCountries,
  open,
  pets,
  providerAreaName,
  providerCurrency,
  providerVolunteerOnly,
  providerLocationStyles,
  providerServices,
  returnToPaymentAvailable,
  serviceAreas,
  submitLabel,
}: {
  countryLabel?: string | null;
  currencyCountries?: unknown[];
  currencyOptions?: NativeCarerCurrency[];
  initialCard?: ServiceRequestCard | null;
  onClose: () => void;
  onReturnToPayment?: () => void;
  onSubmit: (card: ServiceRequestCard) => Promise<void>;
  open: boolean;
  pets: PetOption[];
  providerAreaName?: string;
  providerCurrency?: string;
  providerVolunteerOnly?: boolean;
  providerLocationStyles?: string[];
  providerServices?: string[];
  returnToPaymentAvailable?: boolean;
  serviceAreas?: NativeCareServiceArea[];
  submitLabel: "Send" | "Update";
}) {
  const scrollRef = useRef<ScrollView | null>(null);
  const fieldLayoutsRef = useRef<Record<string, { height: number; y: number }>>({});
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [petIds, setPetIds] = useState<string[]>([]);
  const [petChoicesOpen, setPetChoicesOpen] = useState(false);
  const [manualPetDrafts, setManualPetDrafts] = useState<ManualPetDraft[]>([]);
  const [activeManualPetId, setActiveManualPetId] = useState<string | null>(null);
  const [manualPetEntryMode, setManualPetEntryMode] = useState(false);
  const [petType, setPetType] = useState("");
  const [dogSize, setDogSize] = useState("");
  const [requestedDates, setRequestedDates] = useState<string[]>([]);
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [locationStyles, setLocationStyles] = useState<string[]>([]);
  const [locationArea, setLocationArea] = useState("");
  const [locationCountry, setLocationCountry] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<NativeLocationSuggestion[]>([]);
  const [locationSearchOpen, setLocationSearchOpen] = useState(false);
  const [locationSearching, setLocationSearching] = useState(false);
  const [manualLocationAllowedQuery, setManualLocationAllowedQuery] = useState<string | null>(null);
  const [suggestedPrice, setSuggestedPrice] = useState("");
  const [suggestedRate, setSuggestedRate] = useState(CARE_SCOPE_TOTAL_RATE_LABEL);
  const [requestCurrencyOverride, setRequestCurrencyOverride] = useState("");
  const [requestCurrencyTouched, setRequestCurrencyTouched] = useState(false);
  const [updatePreference, setUpdatePreference] = useState<(typeof UPDATE_PREFERENCE_OPTIONS)[number]>(UPDATE_PREFERENCE_DEFAULT);
  const [scopeFrequency, setScopeFrequency] = useState("");
  const [scopeTasks, setScopeTasks] = useState<string[]>([]);
  const [otherTasks, setOtherTasks] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false);
  const [manualSpeciesMenuOpen, setManualSpeciesMenuOpen] = useState(false);
  const [manualBreedMenuOpen, setManualBreedMenuOpen] = useState(false);
  const [manualDogSizeMenuOpen, setManualDogSizeMenuOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [dateDropdown, setDateDropdown] = useState<"month" | "year" | null>(null);
  const [locationStyleMenuOpen, setLocationStyleMenuOpen] = useState(false);
  const [requestCurrencyMenuOpen, setRequestCurrencyMenuOpen] = useState(false);
  const [updatePreferenceMenuOpen, setUpdatePreferenceMenuOpen] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [slideResetKey, setSlideResetKey] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const acceptedLocationRef = useRef<string | null>(null);
  const [locationPinError, setLocationPinError] = useState("");
  // Country + coords of the location the requester actually picked (suggestion or GPS pin),
  // so we can advise when it's outside the carer's service area. Null = unknown (typed /
  // not resolved) → no advisory, never a guess.
  const [selectedLocationMeta, setSelectedLocationMeta] = useState<{ country: string; lat: number | null; lng: number | null } | null>(null);
  const initializedForOpenRef = useRef(false);

  useEffect(() => {
    // Reset the form exactly once per open session — on the closed→open transition.
    // The counterpart profile (currency, volunteer flag, offered services) often resolves
    // a beat AFTER the sheet opens; re-running this block on those late changes used to
    // wipe everything the requester had already typed (the "draft resets / can't input"
    // bug). Currency is reconciled in a dedicated effect below so a late carer load still
    // corrects the symbol without nuking the in-progress form.
    if (!open) {
      initializedForOpenRef.current = false;
      return;
    }
    if (initializedForOpenRef.current) return;
    initializedForOpenRef.current = true;
    const dates = Array.isArray(initialCard?.requestedDates) ? initialCard?.requestedDates || [] : initialCard?.requestedDate ? [initialCard.requestedDate] : [];
    const initialPetIds = Array.from(new Set([
      ...(Array.isArray(initialCard?.petIds) ? initialCard.petIds : []),
      ...(Array.isArray(initialCard?.pets) ? initialCard.pets.map((pet) => pet.petId) : []),
      clean(initialCard?.petId),
    ].map(clean).filter(Boolean)));
    setServiceTypes(Array.isArray(initialCard?.serviceTypes) ? initialCard?.serviceTypes || [] : initialCard?.serviceType ? [initialCard.serviceType] : []);
    setPetIds(initialPetIds);
    const initialManualPets = requestCardPets(initialCard || {} as ServiceRequestCard)
      .filter((pet) => !clean(pet.petId) && (clean(pet.petName) || clean(pet.petSpecies) || clean(pet.petBreed)))
      .map((pet, index) => ({
        dogSize: clean(pet.dogSize),
        id: `manual-${index}-${clean(pet.petName) || "pet"}`,
        name: clean(pet.petName),
        species: clean(pet.petSpecies || pet.petType),
        breed: clean(pet.petBreed),
      }));
    const singleLegacyManualPet = initialPetIds.length === 0 && initialManualPets.length === 0 && (clean(initialCard?.petName) || clean(initialCard?.petSpecies || initialCard?.petType) || clean(initialCard?.petBreed))
      ? [{
        dogSize: clean(initialCard?.dogSize),
        id: "manual-legacy",
        name: clean(initialCard?.petName),
        species: clean(initialCard?.petSpecies || initialCard?.petType),
        breed: clean(initialCard?.petBreed),
      }]
      : [];
    const seededManualPets = initialManualPets.length > 0 ? initialManualPets : singleLegacyManualPet;
    setManualPetDrafts(seededManualPets);
    setActiveManualPetId(seededManualPets[0]?.id || null);
    setManualPetEntryMode(seededManualPets.length > 0);
    setPetChoicesOpen(initialPetIds.length === 0 && seededManualPets.length === 0);
    setPetType(clean(initialCard?.petType));
    setDogSize(clean(initialCard?.dogSize));
    // Drop any dates that have fully passed — a past day is disabled in the grid, so if we
    // kept it selected it would be locked-on and un-deselectable. The user re-picks fresh dates.
    const todayIso = requestIsoDate(new Date());
    const seededDates = dates.map(clean).filter(Boolean).filter((iso) => iso >= todayIso);
    setRequestedDates(seededDates);
    setMonthDate(seededDates[0] ? new Date(`${seededDates[0]}T00:00:00`) : dates[0] ? new Date(`${dates[0]}T00:00:00`) : new Date());
    setStartTime(clean(initialCard?.startTime) || "09:00");
    setEndTime(clean(initialCard?.endTime) || "17:00");
    setLocationStyles(Array.isArray(initialCard?.locationStyles) ? initialCard?.locationStyles || [] : []);
    setLocationArea(clean(initialCard?.locationArea));
    setLocationCountry(clean(initialCard?.locationCountry));
    setSelectedLocationMeta(clean(initialCard?.locationCountry) ? { country: clean(initialCard?.locationCountry), lat: null, lng: null } : null);
    acceptedLocationRef.current = clean(initialCard?.locationArea) || null;
    setSuggestedPrice(clean(initialCard?.suggestedPrice));
    setSuggestedRate(providerVolunteerOnly ? "" : CARE_SCOPE_TOTAL_RATE_LABEL);
    // Legacy request cards did not store a location country, so their old currency can be
    // a stale viewer fallback. Only preserve a stored request currency when it was saved
    // with the booking-location signal; otherwise recompute from the service chain.
    setRequestCurrencyOverride(clean(initialCard?.locationCountry) || initialCard?.currencySelectedByRequester === true ? clean(initialCard?.suggestedCurrency) : "");
    setRequestCurrencyTouched(initialCard?.currencySelectedByRequester === true);
    setUpdatePreference(normalizeUpdatePreference(initialCard?.updatePreference));
    setScopeFrequency(clean(initialCard?.scopeFrequency));
    setScopeTasks(normalizeCareTaskList(initialCard?.scopeTasks));
    setOtherTasks(clean(initialCard?.otherTasks));
    setAdditionalNotes(clean(initialCard?.additionalNotes));
    setServiceMenuOpen(false);
    setManualSpeciesMenuOpen(false);
    setManualBreedMenuOpen(false);
    setManualDogSizeMenuOpen(false);
    setDatePickerOpen(false);
    setDateDropdown(null);
    setLocationStyleMenuOpen(false);
    setRequestCurrencyMenuOpen(false);
    setUpdatePreferenceMenuOpen(false);
    setLocationSearchOpen(false);
    setManualLocationAllowedQuery(null);
    setLocationPinError("");
    setAttempted(false);
    setSubmitError(null);
    setSlideResetKey((value) => value + 1);
  }, [initialCard, open, providerCurrency, providerVolunteerOnly]);

  // Request currency is proposal-only. The provider can revise it on the Care Scope; once a
  // quote/scope exists, downstream screens read the scope currency instead of live profile data.
  const currencyLocationCountries = [
    locationCountry,
    ...(currencyCountries && currencyCountries.length > 0 ? currencyCountries : [countryLabel]),
  ];
  const requestCurrencyDecision = resolveCareScopeCurrencyDecision({
    allowedCurrencies: currencyOptions,
    forceProviderCurrency: providerVolunteerOnly !== true,
    locationCountries: currencyLocationCountries,
    preferredCurrency: requestCurrencyOverride,
    providerCurrency,
    requestCurrency: clean(initialCard?.locationCountry) || initialCard?.currencySelectedByRequester === true ? initialCard?.suggestedCurrency : "",
  });
  const requestCurrency = requestCurrencyDecision.currency;
  const requestCanPickCurrency = providerVolunteerOnly === true && requestCurrencyDecision.canSelect;

  const selectedPets = pets.filter((item) => petIds.includes(item.id));
  const primaryPet = selectedPets[0] || null;
  const fallbackInitialPets = initialCard ? requestCardPets(initialCard) : [];
  const updateManualPetDraft = useCallback((id: string, patch: Partial<ManualPetDraft>) => {
    setManualPetDrafts((current) => current.map((pet) => pet.id === id ? { ...pet, ...patch } : pet));
  }, []);
  const addManualPetDraft = useCallback(() => {
    const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setManualPetDrafts((current) => [...current, { dogSize: "", id, name: "", species: "", breed: "" }]);
    setActiveManualPetId(id);
    setManualPetEntryMode(true);
    setPetChoicesOpen(false);
  }, []);
  const removeManualPetDraft = useCallback((id: string) => {
    setManualPetDrafts((current) => {
      const next = current.filter((pet) => pet.id !== id);
      if (next.length === 0) {
        setManualPetEntryMode(false);
        setActiveManualPetId(null);
        // Never strand a requester after removing their only manual pet.
        setPetChoicesOpen(true);
      } else {
        setActiveManualPetId((activeId) => activeId === id ? next[0]?.id || null : activeId);
      }
      return next;
    });
  }, []);
  const hasRegisteredPets = pets.length > 0;
  const registeredRequestPets: ServiceRequestPet[] = selectedPets.length > 0
    ? selectedPets.map((item) => {
      const nextPetType = normalizePetType(item.species || null);
      return {
        dogSize: nextPetType === "Dog" ? clean(item.pet_size) : "",
        petDob: clean(item.dob),
        petId: item.id,
        petIsPublic: item.is_public !== false,
        petName: item.name || "Pet",
        petPhotoUrl: clean(item.photo_url),
        petSpecies: clean(item.species),
        petType: nextPetType,
      };
    })
    : hasRegisteredPets
      ? fallbackInitialPets.filter((pet) => petIds.includes(pet.petId))
      : [];
  // Manual entry is additive, not exclusive -- a requester with registered pets can still add
  // one that isn't in their profile (e.g. a friend's or foster pet) alongside their own.
  const manualRequestPets = manualPetDrafts
    .map((draft): ServiceRequestPet | null => {
      const speciesOption = PET_SPECIES_OPTIONS.find((option) => (
        option.id === draft.species
        || option.value === draft.species
        || option.label === draft.species
        || formatPetSpecies(option.value) === draft.species
      )) || null;
      const speciesValue = speciesOption?.value || clean(draft.species);
      const speciesLabel = speciesOption?.label || clean(draft.species);
      const petTypeLabel = speciesValue ? formatPetSpecies(speciesValue) : "";
      return clean(draft.name) || petTypeLabel || clean(draft.breed) ? {
        dogSize: speciesValue === "dog" ? clean(draft.dogSize) : "",
        petBreed: clean(draft.breed),
        petId: "",
        petIsPublic: false,
        petName: clean(draft.name),
        petPhotoUrl: "",
        petSpecies: petTypeLabel,
        petType: petTypeLabel,
      } : null;
    })
    .filter(Boolean) as ServiceRequestPet[];
  const requestPets: ServiceRequestPet[] = [...registeredRequestPets, ...manualRequestPets];
  const petId = clean(primaryPet?.id) || clean(requestPets[0]?.petId);
  const petName = clean(primaryPet?.name) || clean(requestPets[0]?.petName) || clean(initialCard?.petName);
  const primaryPetType = clean(requestPets[0]?.petType) || petType;
  const primaryDogSize = clean(requestPets[0]?.dogSize) || dogSize;
  // A booking can only be created for a service the carer offers. The clean-slate
  // conversation loader hydrates this before the request sheet can be opened.
  const providerServiceOptions = useMemo(() => {
    return Array.from(new Set((providerServices || []).map(clean).filter(Boolean)));
  }, [providerServices]);
  const locationStyleOptions = useMemo(() => {
    const scoped = getRequesterLocationOptions(providerLocationStyles || []);
    return scoped.length > 0 ? scoped : LOCATION_STYLES.filter((item) => item !== "Flexible");
  }, [providerLocationStyles]);
  const providerOnlyCarerPlace = locationStyleOptions.length === 1 && locationStyleOptions[0] === "Carer's Place";
  const locationAreaLockedToProvider = providerOnlyCarerPlace && Boolean(clean(providerAreaName));
  // Advisory only (never blocks send): the requester's chosen location looks outside the
  // carer's usual service area (different country, or >100km from every served point).
  const locationOutOfArea = !locationAreaLockedToProvider && isNativeCareLocationOutOfArea(selectedLocationMeta, serviceAreas);
  // Only treat a half-filled manual pet as an error -- an untouched manual section alongside
  // an already-selected registered pet is not a blocker (it just contributes nothing).
  const manualPetPartial = manualPetDrafts.some((draft) => {
    const hasAnyValue = Boolean(clean(draft.name) || clean(draft.species) || clean(draft.breed) || clean(draft.dogSize));
    if (!hasAnyValue) return false;
    const speciesOption = PET_SPECIES_OPTIONS.find((option) => (
      option.id === draft.species
      || option.value === draft.species
      || option.label === draft.species
      || formatPetSpecies(option.value) === draft.species
    ));
    const hasSpecies = Boolean(speciesOption?.value || clean(draft.species));
    const isDog = clean(speciesOption?.value || draft.species).toLowerCase() === "dog";
    return !clean(draft.name) || !hasSpecies || !clean(draft.breed) || (isDog && !clean(draft.dogSize));
  });
  const missing = {
    serviceType: serviceTypes.length === 0 || serviceTypes.some((item) => !providerServiceOptions.includes(item)),
    // The backend (validate_service_request_payload) also requires a resolved petType, so
    // a selected pet whose species didn't resolve must surface at the (registered, visible)
    // pet field rather than being silently rejected by the RPC — whose error popup renders
    // behind this sheet, making the send look like it did nothing.
    petId: requestPets.length === 0 || manualPetPartial,
    requestedDates: requestedDates.length === 0,
    startTime: !isHHMM(startTime),
    endTime: !isHHMM(endTime),
    locationStyles: locationStyles.length === 0 || locationStyles.some((item) => !locationStyleOptions.includes(item)),
    locationArea: !locationArea.trim(),
  };
  const normalizedRequestPayment = normalizeCareScopePaymentInput(suggestedPrice, requestCurrency, suggestedRate);
  const proposedRequestCard: ServiceRequestCard = {
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
    petBreed: clean(requestPets[0]?.petBreed),
    petDob: clean(primaryPet?.dob) || clean(requestPets[0]?.petDob),
    petIsPublic: primaryPet ? primaryPet.is_public !== false : requestPets[0]?.petIsPublic,
    requestedDates,
    requestedDate: requestedDates[0] || "",
    startTime,
    endTime,
    tzOffset: deviceTzOffset(),
    startAtIso: wallClockToIso(requestedDates[0] || "", startTime),
    endAtIso: wallClockToIso(requestedDates[requestedDates.length - 1] || requestedDates[0] || "", endTime),
    locationStyles,
    locationArea: locationArea.trim(),
    locationCountry: locationCountry.trim(),
    currencySelectedByRequester: requestCurrencyTouched,
    suggestedCurrency: normalizedRequestPayment.paid ? requestCurrency : "",
    suggestedPrice: normalizedRequestPayment.finalPrice,
    suggestedRate: normalizedRequestPayment.paid ? normalizedRequestPayment.rate : "",
    voluntary: normalizedRequestPayment.paid ? false : true,
    updatePreference,
    scopeFrequency: scopeFrequency.trim(),
    scopeTasks,
    otherTasks: otherTasks.trim(),
    additionalNotes: additionalNotes.trim(),
    allowProfileAccess: true,
  };
  const hasEditedRequestScope = !initialCard || JSON.stringify(normalizeServiceRequestComparable(proposedRequestCard)) !== JSON.stringify(normalizeServiceRequestComparable(initialCard));
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 4 }, (_, index) => String(current + index));
  }, []);
  const today = (() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  })();
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
      scrollRef.current?.scrollTo({ y: Math.max(0, layout.y - huddleSpacing.x3), animated: true });
    };
    requestAnimationFrame(scrollToTarget);
    setTimeout(scrollToTarget, 180);
    setTimeout(scrollToTarget, 360);
  };
  const closeMenus = (except?: string) => {
    if (except !== "service") setServiceMenuOpen(false);
    if (except !== "manualSpecies") setManualSpeciesMenuOpen(false);
    if (except !== "manualBreed") setManualBreedMenuOpen(false);
    if (except !== "manualDogSize") setManualDogSizeMenuOpen(false);
    if (except !== "dates") {
      setDatePickerOpen(false);
      setDateDropdown(null);
    }
    if (except !== "locationStyles") setLocationStyleMenuOpen(false);
    if (except !== "requestCurrency") setRequestCurrencyMenuOpen(false);
    if (except !== "updatePreference") setUpdatePreferenceMenuOpen(false);
    if (except !== "location") setLocationSearchOpen(false);
  };

  const applyCurrentLocation = (loc: NativeResolvedLocation) => {
    const selectedLocation = loc.district || loc.label;
    acceptedLocationRef.current = selectedLocation;
    setLocationCountry(clean(loc.countryName) || clean(loc.country));
    setSelectedLocationMeta({ country: clean(loc.countryName) || clean(loc.country), lat: Number.isFinite(loc.lat) ? loc.lat : null, lng: Number.isFinite(loc.lng) ? loc.lng : null });
    setManualLocationAllowedQuery(null);
    setLocationPinError("");
    setLocationSuggestions([]);
    setLocationSearchOpen(false);
    setLocationArea(selectedLocation);
    setAttempted(false);
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
      setLocationCountry(clean(countryLabel));
      acceptedLocationRef.current = providerArea || null;
      setLocationSuggestions([]);
      setLocationSearchOpen(false);
    }
  }, [countryLabel, locationAreaLockedToProvider, locationStyleOptions, open, providerAreaName, providerOnlyCarerPlace]);

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
          setManualLocationAllowedQuery(results.length === 0 ? trimmed : null);
          setLocationSearchOpen(results.length > 0 || results.length === 0);
        })
        .catch(() => {
          if (active) {
            // Search failed (network/geocoder). Degrade to manual entry — same as the
            // no-results case — so a transient failure can never brick the booking by
            // leaving the location un-acceptable and the Send button silently blocked.
            setLocationSuggestions([]);
            setManualLocationAllowedQuery(trimmed);
            setLocationCountry("");
            setLocationSearchOpen(true);
          }
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
    setSubmitError(null);
    const firstMissing = Object.entries(missing).find(([, value]) => value)?.[0] || "";
    if (firstMissing) {
      setSlideResetKey((value) => value + 1);
      centerField(firstMissing);
      return;
    }
    const proposedStartMs = Date.parse(proposedRequestCard.startAtIso || "");
    const proposedEndMs = Date.parse(proposedRequestCard.endAtIso || "");
    if (!Number.isFinite(proposedStartMs) || !Number.isFinite(proposedEndMs) || proposedEndMs - proposedStartMs < 60 * 60 * 1000) {
      setSubmitError("Care bookings must be at least 1 hour.");
      setSlideResetKey((value) => value + 1);
      centerField("startTime");
      return;
    }
    // If the earliest requested day is today and the chosen start time has already passed,
    // don't silently book a time in the past — prompt the requester to pick a later time.
    const earliestIso = [...requestedDates].sort()[0];
    if (earliestIso && earliestIso === requestIsoDate(new Date()) && isHHMM(startTime)) {
      const startMs = new Date(buildServiceBookingDateTime(earliestIso, startTime)).getTime();
      if (Number.isFinite(startMs) && startMs <= Date.now()) {
        setSubmitError("That start time has already passed today. Pick a later time or a future date.");
        setSlideResetKey((value) => value + 1);
        centerField("startTime");
        return;
      }
    }
    if (normalizedRequestPayment.paid && normalizedRequestPayment.finalPrice !== suggestedPrice.trim()) {
      setSuggestedPrice(normalizedRequestPayment.finalPrice);
    }
    setSubmitting(true);
    try {
      await onSubmit(proposedRequestCard);
      onClose();
    } catch (error) {
      setSubmitError(nativeSafeErrorCopy(error, "Unable to send your request. Please try again."));
      setSlideResetKey((value) => value + 1);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;
  return (
    <View pointerEvents="box-none" style={styles.inlineSheetLayer}>
      <Pressable accessibilityLabel="Close booking request sheet" accessibilityRole="button" onPress={onClose} style={nativeModalStyles.appModalBackdrop} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0} pointerEvents="box-none" style={[nativeModalStyles.appModalBottomSafeArea, nativeModalStyles.appBottomSheetEventBoundary]}>
        <AppBottomSheet mode="large" onClose={onClose} swipeToCloseArea="header">
          <AppBottomSheetHeader>
            <Text style={nativeModalStyles.appModalSheetTitle}>Book Care</Text>
            <AppModalCloseButton onPress={onClose} />
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
              {attempted && missing.serviceType ? <Text style={styles.errorText}>Choose a Care type.</Text> : null}
            </View>

            <View onLayout={registerField("petId")} style={styles.petInputStack}>
              {!petChoicesOpen && selectedPets.length > 0 ? (
                <ScrollView
                  bounces={false}
                  contentContainerStyle={styles.petSelectRail}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.petSelectRailViewport}
                >
                  {selectedPets.map((pet) => (
                    <View key={pet.id} style={styles.petSelectTile}>
                      <NativePolaroidCard
                        accessibilityLabel={`${pet.name || "Pet"} selected`}
                        captionPrimary={pet.name || "Pet"}
                        captionSecondary={<Text numberOfLines={2} style={nativePolaroidStyles.captionSecondaryToken}>{formatPetCaption(pet)}</Text>}
                        onPress={() => { Keyboard.dismiss(); closeMenus(); setPetChoicesOpen(true); centerField("petId", 160); }}
                        photo={pet.photo_url ? (() => {
                          const photoVersion = nativeMutableImageVersion(pet.photo_url, pet.updated_at);
                          return <Image key={nativeFreshImageKey(pet.photo_url, photoVersion)} resizeMode="cover" source={{ uri: nativeFreshImageUri(pet.photo_url, photoVersion) }} style={nativePolaroidStyles.photo} />;
                        })() : (
                          <View style={nativePolaroidStyles.photoPlaceholder}>
                            <Feather color={huddleColors.iconSubtle} name="image" size={30} />
                          </View>
                        )}
                        photoOverlay={(
                          <View pointerEvents="none" style={[styles.petSelectCircle, styles.petSelectCircleActive]}>
                            <Feather color={huddleColors.onPrimary} name="check" size={14} />
                          </View>
                        )}
                      />
                    </View>
                  ))}
                  <View style={styles.petSelectTile}>
                    <Pressable accessibilityLabel="Input pet details" accessibilityRole="button" onPress={addManualPetDraft} style={({ pressed }) => [styles.petAddTile, pressed ? nativeModalStyles.pressed : null]}>
                      <Feather color={huddleColors.text} name="plus" size={22} />
                      <Text style={styles.petAddTileText}>Input pet details</Text>
                    </Pressable>
                  </View>
                </ScrollView>
              ) : null}
              {petChoicesOpen || (selectedPets.length === 0 && manualPetDrafts.length === 0) ? (
                <RequestPetCarousel
                  error={attempted && missing.petId && !manualRequestPets.length}
                  onAddManualPet={addManualPetDraft}
                  onSelect={(item) => {
                    const isRemovingOnlyPet = petIds.includes(item.id) && petIds.length === 1 && manualPetDrafts.length === 0;
                    setPetIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]);
                    const nextPetType = normalizePetType(item.species || null);
                    setPetType(nextPetType);
                    setDogSize(nextPetType === "Dog" ? clean(item.pet_size) : "");
                    setPetChoicesOpen(isRemovingOnlyPet);
                  }}
                  pets={pets}
                  selectedPetIds={petIds}
                />
              ) : null}
              {manualPetEntryMode ? (
                <View style={styles.manualPetFieldStack}>
                  {manualPetDrafts.map((draft, index) => {
                    const speciesOption = PET_SPECIES_OPTIONS.find((option) => (
                      option.id === draft.species
                      || option.value === draft.species
                      || option.label === draft.species
                      || formatPetSpecies(option.value) === draft.species
                    )) || null;
                    const speciesValue = speciesOption?.value || clean(draft.species);
                    const speciesLabel = speciesOption?.label || clean(draft.species);
                    const breedOptions = getBreedOptionsForSpecies(speciesValue);
                    const fieldKey = `manualPetName:${draft.id}`;
                    const isActiveManual = activeManualPetId === draft.id;
                    return (
                      <View key={draft.id} style={styles.manualPetCard}>
                        <View style={styles.manualPetHeaderRow}>
                          <Text style={styles.requestCreateLabel}>Pet Details{manualPetDrafts.length > 1 ? ` ${index + 1}` : ""}</Text>
                          <View style={styles.manualPetHeaderActions}>
                            <Pressable
                              accessibilityLabel="Add another pet"
                              accessibilityRole="button"
                              onPress={() => { Keyboard.dismiss(); closeMenus(); setPetChoicesOpen(true); centerField("petId", 160); }}
                              style={({ pressed }) => [styles.manualPetIconButton, pressed ? nativeModalStyles.pressed : null]}
                            >
                              <Feather color={huddleColors.blue} name="plus" size={18} />
                            </Pressable>
                            <Pressable
                              accessibilityLabel="Remove pet details"
                              accessibilityRole="button"
                              onPress={() => removeManualPetDraft(draft.id)}
                              style={({ pressed }) => [styles.manualPetIconButton, pressed ? nativeModalStyles.pressed : null]}
                            >
                              <Feather color={huddleColors.validationRed} name="x" size={18} />
                            </Pressable>
                          </View>
                        </View>
                        <View style={styles.manualPetGroup}>
                        <AppModalField
                          error={attempted && missing.petId}
                          focused={focusedField === fieldKey}
                          onBlur={() => setFocusedField(null)}
                          onChangeText={(value) => updateManualPetDraft(draft.id, { name: value })}
                          onFocus={() => { closeMenus(); setActiveManualPetId(draft.id); setFocusedField(fieldKey); centerField("petId", 160); }}
                          placeholder="Pet's name"
                          value={draft.name}
                        />
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => { Keyboard.dismiss(); setActiveManualPetId(draft.id); closeMenus("manualSpecies"); setManualSpeciesMenuOpen((value) => isActiveManual ? !value : true); centerField("petId", 220); }}
                          style={[nativeModalStyles.appModalSelectTrigger, styles.manualPetSelectTrigger, manualSpeciesMenuOpen && isActiveManual ? nativeModalStyles.appModalFieldFocused : null, attempted && missing.petId ? nativeModalStyles.appModalFieldError : null]}
                        >
                          <View style={styles.manualPetSelectValueRow}>
                            {speciesLabel ? <Text style={styles.manualPetEmoji}>{nativePetEmojiForLabel(speciesLabel)}</Text> : null}
                            <Text numberOfLines={1} style={[nativeModalStyles.appModalSelectText, !speciesLabel ? nativeModalStyles.appModalSelectPlaceholder : null]}>{speciesLabel || "Species"}</Text>
                          </View>
                          <Feather color={huddleColors.mutedText} name={manualSpeciesMenuOpen && isActiveManual ? "chevron-up" : "chevron-down"} size={18} />
                        </Pressable>
                        {manualSpeciesMenuOpen && isActiveManual ? (
                          <View style={styles.requestSelectMenu}>
                            {PET_SPECIES_OPTIONS.map((option) => (
                              <RequestOptionRow
                                key={option.id}
                                active={option.value === speciesValue}
                                emoji={nativePetEmojiForLabel(option.label)}
                                label={option.label}
                                onPress={() => {
                                  updateManualPetDraft(draft.id, { species: option.value, breed: "", dogSize: option.value === "dog" ? draft.dogSize : "" });
                                  setManualSpeciesMenuOpen(false);
                                }}
                              />
                            ))}
                          </View>
                        ) : null}
                        <Pressable
                          accessibilityRole="button"
                          disabled={!speciesValue}
                          onPress={() => { Keyboard.dismiss(); setActiveManualPetId(draft.id); closeMenus("manualBreed"); setManualBreedMenuOpen((value) => isActiveManual ? !value : true); centerField("petId", 220); }}
                          style={[nativeModalStyles.appModalSelectTrigger, styles.manualPetSelectTrigger, manualBreedMenuOpen && isActiveManual ? nativeModalStyles.appModalFieldFocused : null, attempted && missing.petId ? nativeModalStyles.appModalFieldError : null, !speciesValue ? styles.requestReadOnlyField : null]}
                        >
                          <Text numberOfLines={1} style={[nativeModalStyles.appModalSelectText, !draft.breed ? nativeModalStyles.appModalSelectPlaceholder : null]}>{draft.breed || "Breed"}</Text>
                          <Feather color={huddleColors.mutedText} name={manualBreedMenuOpen && isActiveManual ? "chevron-up" : "chevron-down"} size={18} />
                        </Pressable>
                        {manualBreedMenuOpen && isActiveManual ? (
                          <View style={styles.requestSelectMenu}>
                            {breedOptions.map((breed) => (
                              <RequestOptionRow key={breed} active={breed === draft.breed} label={breed} onPress={() => { updateManualPetDraft(draft.id, { breed }); setManualBreedMenuOpen(false); }} />
                            ))}
                          </View>
                        ) : null}
                        {speciesValue === "dog" ? (
                          <>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => { Keyboard.dismiss(); setActiveManualPetId(draft.id); closeMenus("manualDogSize"); setManualDogSizeMenuOpen((value) => isActiveManual ? !value : true); centerField("petId", 240); }}
                              style={[nativeModalStyles.appModalSelectTrigger, styles.manualPetSelectTrigger, manualDogSizeMenuOpen && isActiveManual ? nativeModalStyles.appModalFieldFocused : null, attempted && missing.petId && !draft.dogSize ? nativeModalStyles.appModalFieldError : null]}
                            >
                              <Text numberOfLines={1} style={[nativeModalStyles.appModalSelectText, !draft.dogSize ? nativeModalStyles.appModalSelectPlaceholder : null]}>{draft.dogSize || "Pet size"}</Text>
                              <Feather color={huddleColors.mutedText} name={manualDogSizeMenuOpen && isActiveManual ? "chevron-up" : "chevron-down"} size={18} />
                            </Pressable>
                            {manualDogSizeMenuOpen && isActiveManual ? (
                              <View style={styles.requestSelectMenu}>
                                {DOG_SIZES.map((size) => (
                                  <RequestOptionRow key={size} active={size === draft.dogSize} label={size} onPress={() => { updateManualPetDraft(draft.id, { dogSize: size }); setManualDogSizeMenuOpen(false); }} />
                                ))}
                              </View>
                            ) : null}
                          </>
                        ) : null}
                        </View>
                      </View>
                    );
                  })}
                  {attempted && missing.petId ? <Text style={styles.errorText}>Pet details are required.</Text> : null}
                </View>
              ) : null}
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
              {attempted && missing.requestedDates ? <Text style={styles.errorText}>Choose at least one care date.</Text> : null}
            </View>

            <View onLayout={registerField("startTime")} style={styles.requestTwoColumn}>
              <View style={styles.requestFlexField}>
                <Text style={styles.requestCreateLabel}>Start time</Text>
                <AppModalField error={attempted && missing.startTime} focused={focusedField === "startTime"} keyboardType="numbers-and-punctuation" onBlur={() => { setFocusedField(null); setStartTime((value) => normalizeHHMM(value)); }} onChangeText={setStartTime} onFocus={() => { closeMenus(); setFocusedField("startTime"); centerField("startTime"); }} placeholder="09:00" style={styles.requestFieldHeight} value={startTime} />
                {attempted && missing.startTime ? <Text style={styles.errorText}>Enter a valid start time.</Text> : null}
              </View>
              <View style={styles.requestFlexField}>
                <Text style={styles.requestCreateLabel}>End time</Text>
                <AppModalField error={attempted && missing.endTime} focused={focusedField === "endTime"} keyboardType="numbers-and-punctuation" onBlur={() => { setFocusedField(null); setEndTime((value) => normalizeHHMM(value)); }} onChangeText={setEndTime} onFocus={() => { closeMenus(); setFocusedField("endTime"); centerField("startTime"); }} placeholder="17:00" style={styles.requestFieldHeight} value={endTime} />
                {attempted && missing.endTime ? <Text style={styles.errorText}>Enter a valid end time.</Text> : null}
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
              {attempted && missing.locationStyles ? <Text style={styles.errorText}>Choose where care will take place.</Text> : null}
            </View>

            <View onLayout={registerField("locationArea")} style={nativeModalStyles.appModalFieldBlock}>
              <Text style={styles.requestCreateLabel}>Preferred Location</Text>
              <View style={[styles.locationFieldRow, focusedField === "locationArea" ? nativeModalStyles.appModalFieldFocused : null, attempted && missing.locationArea ? nativeModalStyles.appModalFieldError : null, locationAreaLockedToProvider ? styles.requestReadOnlyField : null]}>
                <NativeLocationPinButton
                  disabled={locationAreaLockedToProvider}
                  onError={setLocationPinError}
                  onResolved={applyCurrentLocation}
                  style={styles.locationFieldPin}
                />
                <TextInput
                  editable={!locationAreaLockedToProvider}
                  onBlur={() => setFocusedField(null)}
                  onChangeText={(value) => {
                    acceptedLocationRef.current = null;
                    setManualLocationAllowedQuery(null);
                    setLocationPinError("");
                    setLocationCountry("");
                    setSelectedLocationMeta(null);
                    setLocationArea(value);
                  }}
                  onFocus={() => {
                    if (locationAreaLockedToProvider) return;
                    closeMenus("location");
                    setFocusedField("locationArea");
                    centerField("locationArea", 170);
                    if (locationSuggestions.length > 0) setLocationSearchOpen(true);
                  }}
                  placeholder={locationAreaLockedToProvider ? "Carer's district / area" : "Search district or neighbourhood"}
                  placeholderTextColor={huddleColors.mutedText}
                  returnKeyType="search"
                  style={styles.locationFieldInput}
                  value={locationArea}
                />
              </View>
              {locationPinError ? <Text style={styles.errorText}>{locationPinError}</Text> : null}
              {attempted && missing.locationArea ? <Text style={styles.errorText}>Add the preferred care location.</Text> : null}
              {locationOutOfArea ? <Text style={styles.locationOutOfAreaText}>This area looks outside the carer&apos;s usual service area — they may not be able to take it.</Text> : null}
              {(locationSearchOpen || locationSearching) && (locationSuggestions.length > 0 || locationSearching || manualLocationAllowedQuery === locationArea.trim()) ? (
                <View style={styles.locationSuggestionCard}>
                  {locationSearching && locationSuggestions.length === 0 ? <Text style={styles.locationSuggestionMeta}>Searching...</Text> : null}
                  {locationSuggestions.map((suggestion) => (
                    <Pressable
                      key={`${suggestion.label}:${suggestion.lat}:${suggestion.lng}`}
                      onPress={() => {
                        const selectedLocation = suggestion.district || suggestion.label;
                        acceptedLocationRef.current = selectedLocation;
                        setManualLocationAllowedQuery(null);
                        setLocationCountry(clean(suggestion.country));
                        setSelectedLocationMeta({ country: clean(suggestion.country), lat: Number.isFinite(suggestion.lat) ? suggestion.lat : null, lng: Number.isFinite(suggestion.lng) ? suggestion.lng : null });
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
                  {manualLocationAllowedQuery === locationArea.trim() ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        const selectedLocation = locationArea.trim();
                        acceptedLocationRef.current = null;
                        setManualLocationAllowedQuery(selectedLocation);
                        setLocationCountry("");
                        setSelectedLocationMeta(null);
                        setLocationArea(selectedLocation);
                        setLocationSearchOpen(false);
                        Keyboard.dismiss();
                      }}
                      style={styles.locationSuggestionRow}
                    >
                      <Text style={styles.locationSuggestionPrimary}>Use "{locationArea.trim()}"</Text>
                    </Pressable>
                  ) : null}
	                </View>
	              ) : null}
            </View>

            <View onLayout={registerField("price")} style={styles.requestRateBlock}>
              <RateFieldLabel optional={Boolean(providerVolunteerOnly)} />
              <View style={[styles.requestRateCompositeField, focusedField === "price" || requestCurrencyMenuOpen ? nativeModalStyles.appModalFieldFocused : null]}>
                {requestCanPickCurrency ? (
                  <Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setFocusedField("price"); closeMenus("requestCurrency"); setRequestCurrencyMenuOpen((value) => !value); centerField("price", 180); }} style={[styles.requestRateCurrency, styles.requestRateCurrencyPickable]}>
                    <Text style={styles.requestRateText}>{formatNativeCareCurrencySymbol(requestCurrency)}</Text>
                    <Feather color={huddleColors.mutedText} name={requestCurrencyMenuOpen ? "chevron-up" : "chevron-down"} size={14} />
                  </Pressable>
                ) : (
                  <View style={styles.requestRateCurrency}>
                    <Text style={styles.requestRateText}>{formatNativeCareCurrencySymbol(requestCurrency)}</Text>
                  </View>
                )}
                <View style={styles.requestRatePrice}>
                  <AppModalField
                    focused={focusedField === "price"}
                    keyboardType="decimal-pad"
                    onBlur={() => {
                      setFocusedField(null);
                      const normalized = normalizeCareScopePaymentInput(suggestedPrice, requestCurrency, suggestedRate);
                      if (normalized.paid && normalized.finalPrice !== suggestedPrice.trim()) {
                        setSuggestedPrice(normalized.finalPrice);
                      }
                    }}
                    onChangeText={setSuggestedPrice}
                    onFocus={() => { closeMenus(); setFocusedField("price"); centerField("price", 180); }}
                    placeholder="0"
                    style={styles.requestRateInput}
                    value={suggestedPrice}
                  />
                </View>
                <View style={styles.requestRateUnit}>
                  <Text numberOfLines={1} style={styles.requestRateText}>{CARE_SCOPE_TOTAL_RATE_LABEL}</Text>
                </View>
              </View>
              {normalizeCareScopePaymentInput(suggestedPrice, requestCurrency, suggestedRate).adjustedToMinimum ? (
                <Text style={styles.helperText}>{formatMinimumChargeHelper(requestCurrency)}</Text>
              ) : null}
              {requestCurrencyMenuOpen && requestCanPickCurrency ? (
                <View style={styles.requestSelectMenu}>
                  {requestCurrencyDecision.options.map((item) => (
                    <RequestOptionRow
                      key={item}
                      active={item === requestCurrency}
                      label={`${formatNativeCareCurrencySymbol(item)}  ${item}`}
                      onPress={() => {
                        setRequestCurrencyMenuOpen(false);
                        setRequestCurrencyTouched(true);
                        setRequestCurrencyOverride(item);
                      }}
                    />
                  ))}
                </View>
              ) : null}
            </View>

            <View onLayout={registerField("updatePreference")}>
              <RequestQuoteSelect
                label="Updates preference"
                onToggle={() => { Keyboard.dismiss(); closeMenus("updatePreference"); setUpdatePreferenceMenuOpen((value) => !value); centerField("updatePreference", 140); }}
                open={updatePreferenceMenuOpen}
                placeholder={UPDATE_PREFERENCE_DEFAULT}
                value={updatePreference}
              >
                {UPDATE_PREFERENCE_OPTIONS.map((option) => (
                  <RequestOptionRow
                    key={option}
                    active={option === updatePreference}
                    label={option}
                    onPress={() => {
                      setUpdatePreference(option);
                      setUpdatePreferenceMenuOpen(false);
                    }}
                  />
                ))}
              </RequestQuoteSelect>
            </View>

            <View onLayout={registerField("scopeTasks")} style={nativeModalStyles.appModalFieldBlock}>
              <Text style={styles.requestCreateLabel}>Care tasks</Text>
              <MultiSelectChips options={CARE_SCOPE_TASK_OPTIONS} selected={scopeTasks} onChange={setScopeTasks} />
            </View>
            <View onLayout={registerField("otherTasks")} style={nativeModalStyles.appModalFieldBlock}>
              <AppModalField
                focused={focusedField === "otherTasks"}
                onBlur={() => setFocusedField(null)}
                onChangeText={setOtherTasks}
                onFocus={() => { closeMenus(); setFocusedField("otherTasks"); centerField("otherTasks", 80); }}
                placeholder="Other tasks"
                value={otherTasks}
              />
            </View>
            {scopeTasks.includes("Walk") ? (
            <View onLayout={registerField("scopeFrequency")} style={nativeModalStyles.appModalFieldBlock}>
              <Text style={styles.requestCreateLabel}>Walks per day</Text>
              <AppModalField
                focused={focusedField === "scopeFrequency"}
                onBlur={() => setFocusedField(null)}
                onChangeText={setScopeFrequency}
                onFocus={() => { closeMenus(); setFocusedField("scopeFrequency"); centerField("scopeFrequency", 80); }}
                placeholder="Example: 2 walks per day"
                value={scopeFrequency}
              />
            </View>
            ) : null}

            <View onLayout={registerField("additionalNotes")} style={nativeModalStyles.appModalFieldBlock}>
              <Text style={styles.requestCreateLabel}>Additional notes</Text>
              <AppModalField focused={focusedField === "additionalNotes"} multiline onBlur={() => setFocusedField(null)} onChangeText={setAdditionalNotes} onFocus={() => { closeMenus(); setFocusedField("additionalNotes"); centerField("additionalNotes", 80); }} placeholder="Share anything the provider should know" value={additionalNotes} />
            </View>
          </AppBottomSheetScroll>
          <AppBottomSheetFooter onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}>
            {submitError ? <AppModalError>{submitError}</AppModalError> : null}
            {submitLabel !== "Update" || hasEditedRequestScope ? (
              <SlideToConfirm busy={submitting} label={submitLabel === "Update" ? "Slide to Update" : "Slide to Send"} onCommit={() => void submit()} resetKey={slideResetKey} />
            ) : null}
            {returnToPaymentAvailable && onReturnToPayment ? (
              <AppModalButton disabled={submitting} variant="secondary" onPress={onReturnToPayment}>Return without Change</AppModalButton>
            ) : null}
          </AppBottomSheetFooter>
        </AppBottomSheet>
      </KeyboardAvoidingView>
    </View>
  );
}

function QuoteSheet({
  accessToken,
  careAgreement,
  careScope,
  countryLabel,
  currencyCountries,
  currencyOptions,
  currentUserId,
  carerContact,
  initialCard,
  onDecline,
  onClose,
  onError,
  onOpenPet,
  onSigned,
  onSubmit,
  open,
  providerCurrency,
  providerHasPaidRates,
  providerHasVoluntaryRates,
  providerVolunteerOnly,
  requestCard,
  requesterName,
  requesterCountry,
  serviceChatId,
  sessionKey,
}: {
  accessToken?: string | null;
  careAgreement?: ServiceCareAgreementRecord | null;
  careScope?: CareScopeSummary | null;
  countryLabel?: string | null;
  currencyCountries?: unknown[];
  currencyOptions?: NativeCarerCurrency[];
  currentUserId?: string | null;
  carerContact?: string | null;
  initialCard?: ServiceQuoteCard | null;
  onDecline?: () => void;
  onClose: () => void;
  onError: (body: string) => void;
  onOpenPet?: (petId: string) => void;
  onSigned?: () => void;
  onSubmit: (card: ServiceQuoteCard) => Promise<void>;
  open: boolean;
  providerCurrency?: string;
  providerHasPaidRates?: boolean;
  providerHasVoluntaryRates?: boolean;
  providerVolunteerOnly?: boolean;
  requestCard: ServiceRequestCard | null;
  requesterName?: string;
  requesterCountry?: string | null;
  serviceChatId?: string | null;
  sessionKey?: string | null;
}) {
  const scrollRef = useRef<ScrollView | null>(null);
  const fieldLayoutsRef = useRef<Record<string, { height: number; y: number }>>({});
  const [currency, setCurrency] = useState("");
  const [finalPrice, setFinalPrice] = useState("");
  const [rate, setRate] = useState(CARE_SCOPE_TOTAL_RATE_LABEL);
  const [voluntaryQuote, setVoluntaryQuote] = useState(false);
  const [locationArea, setLocationArea] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<NativeLocationSuggestion[]>([]);
  const [locationSearchOpen, setLocationSearchOpen] = useState(false);
  const [locationSearching, setLocationSearching] = useState(false);
  const [manualLocationAllowedQuery, setManualLocationAllowedQuery] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [scopeFrequency, setScopeFrequency] = useState("");
  const [scopeTasks, setScopeTasks] = useState<string[]>([]);
  const [otherTasks, setOtherTasks] = useState("");
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [slideResetKey, setSlideResetKey] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [providerSignature, setProviderSignature] = useState<CareSignatureSnapshot | null>(null);
  const [signatureSigning, setSignatureSigning] = useState(false);
  const [editingQuoteScope, setEditingQuoteScope] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [carerContactDraft, setCarerContactDraft] = useState("");
  // Carer must read the Care Service Carer Agreement the same way the owner is forced to
  // read the Booking Terms — scroll to the end before the checkbox becomes tappable — not
  // just tick a box with nothing behind it.
  const [termsSheetVisible, setTermsSheetVisible] = useState(false);
  const [termsScrolled, setTermsScrolled] = useState(false);
  const providerAgreementPage = useMemo(() => getNativeLegalPage("/service-provider-agreement"), []);
  const termsSheetPanResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gestureState) => gestureState.dy > huddleSpacing.x5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.6,
      onPanResponderRelease: (_event, gestureState) => {
        if (gestureState.dy > 160 && gestureState.vy > 0.7) setTermsSheetVisible(false);
      },
    }),
    [],
  );
  const openTermsSheet = () => {
    setTermsScrolled(false);
    setTermsSheetVisible(true);
  };
  const acceptTermsFromSheet = () => {
    if (!termsScrolled) return;
    setTermsAccepted(true);
    setTermsSheetVisible(false);
  };
  const acceptedLocationRef = useRef<string | null>(null);
  const signatureCaptureRef = useRef<View | null>(null);
  const [locationPinError, setLocationPinError] = useState("");
  const canEditLocation = providerCanEditCareScopeLocation(requestCard);
  const quoteLocationStyles = initialCard?.locationStyles?.length ? initialCard.locationStyles : requestCard?.locationStyles || [];
  const canChooseVoluntaryQuote = providerHasPaidRates === true && providerHasVoluntaryRates === true && providerVolunteerOnly !== true;
  const initializedForOpenRef = useRef(false);
  // Frozen at the exact moment the form is seeded (open transition only — see below). Compared
  // against LIVE form state to decide "has the carer actually edited anything." Previously this
  // was recomputed fresh from `initialCard`/`careScope` on every render, so any live update to
  // those props WHILE THE SHEET WAS OPEN (e.g. a realtime refresh after the owner signs) could
  // silently flip hasEditedCareScope true with zero user interaction — bouncing the sheet from
  // "Review & Sign Care Scope" into "Update Care Scope" edit mode. Freezing the snapshot at open
  // time makes the comparison immune to any prop drift after that point.
  const initialComparableSnapshotRef = useRef("");

  useEffect(() => {
    if (!open) {
      initializedForOpenRef.current = false;
      return;
    }
    if (initializedForOpenRef.current) return;
    initializedForOpenRef.current = true;
    const nextVoluntaryQuote = providerVolunteerOnly === true || (providerHasVoluntaryRates === true && initialCard?.voluntary === true);
    setVoluntaryQuote(nextVoluntaryQuote);
    // Provider owns the Care Scope currency. Constrain it to the carer's service currencies:
    // one currency is fixed, 2+ are selectable, none falls back to the request/profile/location
    // proposal chain for legacy or incomplete profiles.
    const nextCurrency = resolveCareScopeCurrencyDecision({
      allowedCurrencies: currencyOptions,
      locationCountries: [requestCard?.locationCountry, ...(currencyCountries && currencyCountries.length > 0 ? currencyCountries : [countryLabel, requesterCountry])],
      providerCurrency,
      quoteCurrency: initialCard?.currency,
      requestCurrency: requestCard?.suggestedCurrency,
    }).currency;
    setCurrency(nextCurrency);
    setCurrencyMenuOpen(false);
    const nextFinalPrice = clean(initialCard?.finalPrice) || clean(requestCard?.suggestedPrice);
    setFinalPrice(nextFinalPrice);
    const nextRate = normalizeRateLabel(initialCard?.rate) || normalizeRateLabel(requestCard?.suggestedRate) || CARE_SCOPE_TOTAL_RATE_LABEL;
    setRate(nextRate);
    const nextLocationArea = clean(initialCard?.locationArea) || clean(requestCard?.locationArea);
    setLocationArea(nextLocationArea);
    acceptedLocationRef.current = nextLocationArea || null;
    setLocationSuggestions([]);
    setLocationSearchOpen(false);
    setLocationSearching(false);
    setManualLocationAllowedQuery(null);
    setLocationPinError("");
    const nextNote = clean(initialCard?.note);
    setNote(nextNote);
    const nextScopeFrequency = clean(initialCard?.scopeFrequency) || clean(requestCard?.scopeFrequency);
    setScopeFrequency(nextScopeFrequency);
    const nextScopeTasks = normalizeCareTaskList(initialCard?.scopeTasks).length ? normalizeCareTaskList(initialCard?.scopeTasks) : normalizeCareTaskList(requestCard?.scopeTasks);
    setScopeTasks(nextScopeTasks);
    const nextOtherTasks = clean(initialCard?.otherTasks) || clean(requestCard?.otherTasks);
    setOtherTasks(nextOtherTasks);
    setFocusedField(null);
    setAttempted(false);
    setSubmitError(null);
    setProviderSignature(null);
    setSignatureSigning(false);
    setTermsAccepted(false);
    setPolicyAccepted(false);
    setCarerContactDraft(clean(carerContact) || carerContactFromCareDetails(careScope?.careDetails));
    // Default to read-first AGREE mode whenever there's a care scope to review (slider =
    // "Slide to Agree Care Scope"); only open straight into edit mode when the carer is
    // creating the first scope (no existing careScope). "Edit Care Scope" opts into editing.
    setEditingQuoteScope(!careScope);
    setSlideResetKey((value) => value + 1);
    // Freeze the "nothing edited yet" snapshot from the EXACT values just seeded above — not
    // recomputed from initialCard on every render — so live prop churn after open can never
    // desync it from currentComparable.
    const nextNormalizedPayment = normalizeCareScopePaymentInput(nextFinalPrice, nextCurrency, nextRate);
    initialComparableSnapshotRef.current = JSON.stringify(normalizeCareScopeComparable({
      currency: nextNormalizedPayment.paid ? nextNormalizedPayment.currency : "",
      finalPrice: nextNormalizedPayment.finalPrice,
      rate: nextNormalizedPayment.paid ? nextNormalizedPayment.rate : "",
      locationArea: nextLocationArea,
      note: nextNote,
      otherTasks: nextOtherTasks,
      scopeFrequency: nextScopeFrequency,
      scopeTasks: nextScopeTasks,
      voluntary: nextNormalizedPayment.paid ? false : true,
    }));
  }, [careScope, carerContact, countryLabel, currencyCountries, currencyOptions, initialCard, open, providerCurrency, providerHasVoluntaryRates, providerVolunteerOnly, requestCard?.locationArea, requestCard?.locationCountry, requestCard?.otherTasks, requestCard?.scopeFrequency, requestCard?.scopeTasks, requestCard?.suggestedCurrency, requestCard?.suggestedPrice, requestCard?.suggestedRate, requesterCountry]);

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
      scrollRef.current?.scrollTo({ y: Math.max(0, layout.y - huddleSpacing.x3), animated: true });
    };
    requestAnimationFrame(scrollToTarget);
    setTimeout(scrollToTarget, 180);
    setTimeout(scrollToTarget, 360);
  };
  const closeMenus = (except?: string) => {
    if (except !== "currency") setCurrencyMenuOpen(false);
    if (except !== "location") setLocationSearchOpen(false);
  };

  const applyCurrentLocation = (loc: NativeResolvedLocation) => {
    const selectedLocation = loc.district || loc.label;
    acceptedLocationRef.current = selectedLocation;
    setManualLocationAllowedQuery(null);
    setLocationPinError("");
    setLocationSuggestions([]);
    setLocationSearchOpen(false);
    setLocationArea(selectedLocation);
    setAttempted(false);
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
          setManualLocationAllowedQuery(results.length === 0 ? trimmed : null);
          setLocationSearchOpen(results.length > 0 || results.length === 0);
        })
        .catch(() => {
          if (active) {
            // Search failed (network/geocoder). Degrade to manual entry — same as the
            // no-results case — so a transient failure can never brick the booking by
            // leaving the location un-acceptable and the Send button silently blocked.
            setLocationSuggestions([]);
            setManualLocationAllowedQuery(trimmed);
            setLocationSearchOpen(true);
          }
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
  const hasQuotePrice = finalPrice.trim().length > 0;
  const normalizedQuoteCurrency = resolveCareScopeCurrencyDecision({
    allowedCurrencies: currencyOptions,
    locationCountries: [requestCard?.locationCountry, ...(currencyCountries && currencyCountries.length > 0 ? currencyCountries : [countryLabel, requesterCountry])],
    preferredCurrency: currency,
    providerCurrency,
    requestCurrency: requestCard?.suggestedCurrency,
  }).currency;
  // Provider may pick the currency only when the carer serves 2+ currencies; one ⇒ fixed.
  const canPickCurrency = (currencyOptions?.length ?? 0) > 1;
  const normalizedQuotePayment = normalizeCareScopePaymentInput(finalPrice, normalizedQuoteCurrency, rate);
  const missingRate = normalizedQuotePayment.invalid || (!voluntaryQuote && !hasQuotePrice);
  const proposedQuoteCard: ServiceQuoteCard = {
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
    locationCountry: clean(requestCard?.locationCountry),
    currency: normalizedQuotePayment.paid ? normalizedQuotePayment.currency : "",
    finalPrice: normalizedQuotePayment.finalPrice,
    rate: normalizedQuotePayment.paid ? normalizedQuotePayment.rate : "",
    note: note.trim(),
    scopeFrequency: scopeFrequency.trim(),
    scopeTasks,
    otherTasks: otherTasks.trim(),
    voluntary: normalizedQuotePayment.paid ? false : true,
  };
  const proposedNoChargeVoluntary = isNoChargeVoluntaryQuote(proposedQuoteCard);
  const proposedScopeRequestCard = requestCardWithCareScopeUpdates(requestCard, proposedQuoteCard, "carer");
  // Frozen at open time (see the reset effect above) — never recomputed from the live
  // initialCard/careScope props, so it can't silently drift out of sync with them.
  const initialComparable = initialComparableSnapshotRef.current;
  const currentComparable = JSON.stringify(normalizeCareScopeComparable({
    currency: normalizedQuotePayment.paid ? normalizedQuotePayment.currency : "",
    finalPrice: normalizedQuotePayment.finalPrice,
    rate: normalizedQuotePayment.paid ? normalizedQuotePayment.rate : "",
    locationArea,
    note,
    otherTasks,
    scopeFrequency,
    scopeTasks,
    voluntary: normalizedQuotePayment.paid ? false : true,
  }));
  const hasEditedCareScope = currentComparable !== initialComparable;
  const carerAlreadySigned = careScope?.carerSigned === true;
  const currentMutualSignatures = careScope?.mutualSigned === true;
  const ownerAlreadySigned = careScope?.ownerSigned === true;
  const canSignCareScope = !hasEditedCareScope && Boolean(
    serviceChatId &&
    currentUserId &&
    careScope &&
    !carerAlreadySigned &&
    (careScope.actorRole !== "carer" || ownerAlreadySigned),
  );
  const showWalksPerDayField = scopeTasks.includes("Walk");
  const visibleCarerContact = clean(carerContactDraft) || clean(carerContact);
  const showOtherTasksField = Boolean(otherTasks || clean(initialCard?.otherTasks) || clean(requestCard?.otherTasks));
  // Carer must see exact payout before signing (contract §7.4). 10% platform charge.
  const canCaptureProviderSignature = canSignCareScope && !editingQuoteScope;
  const missingTermsAcknowledgement = canCaptureProviderSignature && !termsAccepted;
  const missingPolicyAcknowledgement = canCaptureProviderSignature && !policyAccepted;
  const missingCarerContact = canCaptureProviderSignature && (!visibleCarerContact || !isValidPhoneNumber(visibleCarerContact));
  const missingAgreementAcknowledgement = missingTermsAcknowledgement || missingPolicyAcknowledgement;
  const showQuoteEditFields = editingQuoteScope || !canSignCareScope;
  // The requester owns the care tasks. The carer can only accept or decline the
  // tasks the requester asked for — never invent new ones (so "Walk" only appears
  // when the requester selected it). Fall back to a prior quote's tasks, then the
  // full palette only when neither side has scoped any task yet.
  const carerTaskOptions = useMemo(() => {
    const requested = normalizeCareTaskList(requestCard?.scopeTasks);
    if (requested.length) return requested;
    const priorQuote = normalizeCareTaskList(initialCard?.scopeTasks);
    if (priorQuote.length) return priorQuote;
    return [...CARE_SCOPE_TASK_OPTIONS];
  }, [initialCard?.scopeTasks, requestCard?.scopeTasks]);
  useEffect(() => {
    if (!hasEditedCareScope) return;
    setProviderSignature(null);
    setSignatureSigning(false);
  }, [hasEditedCareScope]);

  const submit = async () => {
    setAttempted(true);
    setSubmitError(null);
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
    if (normalizedQuotePayment.paid && normalizedQuotePayment.finalPrice !== finalPrice.trim()) {
      setFinalPrice(normalizedQuotePayment.finalPrice);
    }
    setSubmitting(true);
    let uploadedSignaturePath: string | null = null;
    try {
      if (canCaptureProviderSignature) {
        if (missingTermsAcknowledgement) {
          setSlideResetKey((value) => value + 1);
          centerField("terms");
          return;
        }
        if (missingPolicyAcknowledgement) {
          setSlideResetKey((value) => value + 1);
          centerField("policy");
          return;
        }
        if (missingCarerContact) {
          setSlideResetKey((value) => value + 1);
          centerField("carerContact", 140);
          return;
        }
        if (!providerSignature || !signatureCaptureRef.current || !serviceChatId || !currentUserId) {
          setSlideResetKey((value) => value + 1);
          centerField("signature");
          return;
        }
        const signatureUri = await captureRef(signatureCaptureRef, {
          fileName: `huddle-carer-scope-signature-${Date.now()}`,
          format: "png",
          quality: 1,
          result: "tmpfile",
        });
        const signatureImage = await uploadNativeServiceCareAgreementSignatureImage({
          accessToken,
          media: {
            height: providerSignature.height,
            kind: "image",
            mimeType: "image/png",
            name: `carer-scope-signature-${Date.now()}.png`,
            size: null,
            uri: signatureUri,
            width: providerSignature.width,
          },
          role: "provider",
          serviceChatId,
          sessionKey,
          userId: currentUserId,
        });
        uploadedSignaturePath = signatureImage.path;
        const signedAt = new Date().toISOString();
        const { error } = await supabase.rpc("record_service_care_scope_signature", {
          p_acknowledged_terms: true,
          p_acknowledged_no_start_policy: policyAccepted,
          p_service_chat_id: serviceChatId,
          p_signature: {
            ...providerSignature,
            imageBucket: signatureImage.bucket,
            imageMime: signatureImage.mime,
            imagePath: signatureImage.path,
            carerContact: visibleCarerContact,
            carer_contact: visibleCarerContact,
            signedAt,
          },
        });
        if (error) throw error;
        // Refresh the chat so the agreed state lands immediately — without this the
        // signature is recorded server-side but the CTA still shows "Review & Sign"
        // until a notification tap forces a reload (the "agree mode not detected" bug).
        onSigned?.();
      } else {
        await onSubmit(proposedQuoteCard);
      }
      onClose();
    } catch (error) {
      if (uploadedSignaturePath) {
        void requestNativeStorageCleanupResult("care_agreements", uploadedSignaturePath, "record_provider_care_scope_signature_failed", accessToken);
      }
      if (canCaptureProviderSignature) {
        setSubmitError(nativeSafeErrorCopy(error, "Unable to save your signature. Please clear it and sign again."));
      } else {
        setSubmitError(nativeSafeErrorCopy(error, "Unable to send your quote. Please try again."));
      }
      setSlideResetKey((value) => value + 1);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;
  return (
    <View pointerEvents="box-none" style={styles.inlineSheetLayer}>
      <Pressable accessibilityLabel="Close care scope sheet" accessibilityRole="button" onPress={onClose} style={nativeModalStyles.appModalBackdrop} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0} pointerEvents="box-none" style={[nativeModalStyles.appModalBottomSafeArea, nativeModalStyles.appBottomSheetEventBoundary]}>
        <AppBottomSheet mode="large" onClose={onClose} swipeToCloseArea="header">
          <AppBottomSheetHeader>
            <Text style={nativeModalStyles.appModalSheetTitle}>{canSignCareScope ? "Review & Sign Care Scope" : "Update Care Scope"}</Text>
            <AppModalCloseButton onPress={onClose} />
          </AppBottomSheetHeader>
          <AppBottomSheetScroll contentContainerStyle={styles.requestSheetScrollContent} scrollEnabled={!signatureSigning} scrollRef={scrollRef}>
            {proposedScopeRequestCard ? (
              <PaymentCareScopeSummary
                careScope={careScope || null}
                disabledEdit={submitting}
                onDecline={canSignCareScope && !editingQuoteScope && !carerAlreadySigned && !currentMutualSignatures && onDecline ? onDecline : undefined}
                onEdit={canSignCareScope && !editingQuoteScope ? () => setEditingQuoteScope(true) : undefined}
                onOpenPet={onOpenPet}
                providerCurrency={providerCurrency}
                quoteCard={proposedQuoteCard}
                requestCard={proposedScopeRequestCard}
                showPaymentLine
                viewerRole="provider"
              />
            ) : null}
            {showQuoteEditFields && canEditLocation ? (
              <View onLayout={registerField("location")} style={nativeModalStyles.appModalFieldBlock}>
                <Text style={styles.requestCreateLabel}>Preferred Location</Text>
                <View style={[styles.locationFieldRow, focusedField === "location" || locationSearchOpen ? nativeModalStyles.appModalFieldFocused : null, attempted && missingLocation ? nativeModalStyles.appModalFieldError : null]}>
                  <NativeLocationPinButton
                    onError={setLocationPinError}
                    onResolved={applyCurrentLocation}
                    style={styles.locationFieldPin}
                  />
                  <TextInput
                    onBlur={() => {
                      setFocusedField(null);
                    }}
                    onChangeText={(value) => {
                      acceptedLocationRef.current = null;
                      setManualLocationAllowedQuery(null);
                      setLocationPinError("");
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
                    placeholderTextColor={huddleColors.mutedText}
                    style={styles.locationFieldInput}
                    value={locationArea}
                  />
                </View>
                {locationPinError ? <Text style={styles.errorText}>{locationPinError}</Text> : null}
                {locationSearchOpen || locationSearching ? (
                  <View style={styles.locationSuggestionCard}>
                    {locationSearching ? <Text style={styles.locationSuggestionMeta}>Searching...</Text> : null}
                    {locationSuggestions.map((suggestion) => (
                      <Pressable
                        key={`${suggestion.label}-${suggestion.district}`}
                        onPress={() => {
                          const selectedLocation = suggestion.district || suggestion.label;
                          acceptedLocationRef.current = selectedLocation;
                          setManualLocationAllowedQuery(null);
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
                    {manualLocationAllowedQuery === locationArea.trim() ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          const selectedLocation = locationArea.trim();
                          acceptedLocationRef.current = null;
                          setManualLocationAllowedQuery(selectedLocation);
                          setLocationArea(selectedLocation);
                          setLocationSearchOpen(false);
                          setLocationSuggestions([]);
                        }}
                        style={({ pressed }) => [styles.locationSuggestionRow, pressed ? nativeModalStyles.pressed : null]}
                      >
                        <Text style={styles.locationSuggestionPrimary}>Use "{locationArea.trim()}"</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                {attempted && missingLocation ? <Text style={styles.errorText}>Don't skip this one!</Text> : null}
              </View>
            ) : null}
            {showQuoteEditFields && canChooseVoluntaryQuote ? (
              <View style={styles.requestRateBlock}>
                <Text style={styles.requestCreateLabel}>Care arrangement</Text>
                <View style={styles.requestSelectMenuInline}>
                  <RequestOptionRow active={!voluntaryQuote} label="Paid" onPress={() => setVoluntaryQuote(false)} />
                  <RequestOptionRow active={voluntaryQuote} label="Voluntary" onPress={() => setVoluntaryQuote(true)} />
                </View>
              </View>
            ) : null}
            {showQuoteEditFields ? <View onLayout={registerField("rate")} style={styles.requestRateBlock}>
              <RateFieldLabel optional={voluntaryQuote} />
              <View style={[styles.requestRateCompositeField, focusedField === "rate" || currencyMenuOpen ? nativeModalStyles.appModalFieldFocused : null, attempted && missingRate ? nativeModalStyles.appModalFieldError : null]}>
                {canPickCurrency ? (
                  <Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setFocusedField("rate"); setCurrencyMenuOpen((value) => !value); centerField("rate", 180); }} style={[styles.requestRateCurrency, styles.requestRateCurrencyPickable]}>
                    <Text style={styles.requestRateText}>{formatNativeCareCurrencySymbol(normalizedQuoteCurrency)}</Text>
                    <Feather color={huddleColors.mutedText} name={currencyMenuOpen ? "chevron-up" : "chevron-down"} size={14} />
                  </Pressable>
                ) : (
                  <View style={styles.requestRateCurrency}>
                    <Text style={styles.requestRateText}>{formatNativeCareCurrencySymbol(normalizedQuoteCurrency)}</Text>
                  </View>
                )}
                <View style={styles.requestRatePrice}>
                  <AppModalField
                    error={attempted && !finalPrice.trim()}
                    focused={focusedField === "rate"}
                    keyboardType="decimal-pad"
                    onBlur={() => {
                      setFocusedField(null);
                      if (normalizedQuotePayment.paid && normalizedQuotePayment.finalPrice !== finalPrice.trim()) {
                        setFinalPrice(normalizedQuotePayment.finalPrice);
                      }
                    }}
                    onChangeText={setFinalPrice}
                    onFocus={() => { closeMenus(); setFocusedField("rate"); centerField("rate", 180); }}
                    placeholder="Final price"
                    style={styles.requestRateInput}
                    value={finalPrice}
                  />
                </View>
                <View style={styles.requestRateUnit}>
                  <Text numberOfLines={1} style={styles.requestRateText}>{CARE_SCOPE_TOTAL_RATE_LABEL}</Text>
                </View>
              </View>
              {normalizedQuotePayment.adjustedToMinimum ? (
                <Text style={styles.helperText}>{formatMinimumChargeHelper(normalizedQuoteCurrency)}</Text>
              ) : null}
              {currencyMenuOpen && canPickCurrency ? (
                <View style={styles.requestSelectMenu}>
                  {(currencyOptions ?? []).map((item) => (
                    <RequestOptionRow
                      key={item}
                      active={item === normalizedQuoteCurrency}
                      label={`${formatNativeCareCurrencySymbol(item)}  ${item}`}
                      onPress={() => { setCurrency(item); setCurrencyMenuOpen(false); }}
                    />
                  ))}
                </View>
              ) : null}
            </View> : null}
              {attempted && missingRate ? <Text style={styles.errorText}>Add a valid rate, or enter 0 for a free Care booking.</Text> : null}
            {showQuoteEditFields && carerTaskOptions.length > 0 ? (
            <View onLayout={registerField("scopeTasks")} style={nativeModalStyles.appModalFieldBlock}>
              <Text style={styles.requestCreateLabel}>Care tasks</Text>
              <MultiSelectChips options={carerTaskOptions} selected={scopeTasks} onChange={setScopeTasks} />
            </View>
            ) : null}
            {showQuoteEditFields && showOtherTasksField ? (
              <View onLayout={registerField("otherTasks")} style={nativeModalStyles.appModalFieldBlock}>
                <AppModalField
                  focused={focusedField === "otherTasks"}
                  onBlur={() => setFocusedField(null)}
                  onChangeText={setOtherTasks}
                  onFocus={() => { closeMenus(); setFocusedField("otherTasks"); centerField("otherTasks", 80); }}
                  placeholder="Other tasks"
                  value={otherTasks}
                />
              </View>
            ) : null}
            {showQuoteEditFields && showWalksPerDayField ? (
              <View onLayout={registerField("scopeFrequency")} style={nativeModalStyles.appModalFieldBlock}>
                <Text style={styles.requestCreateLabel}>Walks per day</Text>
                <AppModalField
                  focused={focusedField === "scopeFrequency"}
                  onBlur={() => setFocusedField(null)}
                  onChangeText={setScopeFrequency}
                  onFocus={() => { closeMenus(); setFocusedField("scopeFrequency"); centerField("scopeFrequency", 80); }}
                  placeholder="Example: 2 walks per day"
                  value={scopeFrequency}
                />
              </View>
            ) : null}
            {showQuoteEditFields ? <View onLayout={registerField("note")} style={nativeModalStyles.appModalFieldBlock}>
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
            </View> : null}
            <CareScopeAgreementPaymentDetails providerCurrency={providerCurrency} quoteCard={proposedQuoteCard} requestCard={proposedScopeRequestCard} viewerRole="provider" />
            {canCaptureProviderSignature ? (
              <CareSignoffCancellationPolicy isNoChargeVoluntary={proposedNoChargeVoluntary} viewerRole="provider" />
            ) : null}
            {canCaptureProviderSignature ? (
              <>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: termsAccepted }} onLayout={registerField("terms")} onPress={termsAccepted ? () => setTermsAccepted(false) : openTermsSheet} style={styles.checkboxRowTop}>
                  <View style={[styles.checkbox, attempted && missingTermsAcknowledgement ? styles.checkboxError : null, termsAccepted ? styles.checkboxActive : null]}>{termsAccepted ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}</View>
                  <NativeLegalText style={styles.checkboxText}>{careScopeTermsAcknowledgementCopy("provider")}</NativeLegalText>
                </Pressable>
                {attempted && missingTermsAcknowledgement ? <Text style={styles.errorText}>Care Service Carer Agreement acknowledgement is required before sign off.</Text> : null}
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: policyAccepted }} onLayout={registerField("policy")} onPress={() => setPolicyAccepted((value) => !value)} style={styles.checkboxRowTop}>
                  <View style={[styles.checkbox, attempted && missingPolicyAcknowledgement ? styles.checkboxError : null, policyAccepted ? styles.checkboxActive : null]}>{policyAccepted ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}</View>
                  <NativeLegalText style={styles.checkboxText}>{careScopeAcknowledgementCopy("provider", proposedNoChargeVoluntary)}</NativeLegalText>
                </Pressable>
                {attempted && missingPolicyAcknowledgement ? <Text style={styles.errorText}>Cancellation policy acknowledgement is required before sign off.</Text> : null}
                <View onLayout={registerField("carerContact")} style={nativeModalStyles.appModalFieldBlock}>
                  <Text style={styles.paymentInfoTitle}>Carer's Contact</Text>
                  <NativePhoneField
                    defaultCountryCode={countryLabel || undefined}
                    error={attempted && missingCarerContact}
                    onChangeText={setCarerContactDraft}
                    onFocus={() => { closeMenus(); setFocusedField("carerContact"); centerField("carerContact", 140); }}
                    placeholder="Phone number"
                    showFormatWarning
                    value={carerContactDraft}
                  />
                  {attempted && missingCarerContact ? <Text style={styles.errorText}>Add a valid contact number before sign off.</Text> : null}
                </View>
              </>
            ) : null}
            {canCaptureProviderSignature ? (
              <View onLayout={registerField("signature")}>
                <NativeSignaturePad attempted={attempted} captureViewRef={signatureCaptureRef} onChange={setProviderSignature} onSigningChange={setSignatureSigning} />
              </View>
            ) : null}
            {!hasEditedCareScope && carerAlreadySigned && !currentMutualSignatures ? (
              <View style={styles.paymentInfoBox}>
                <Text style={styles.paymentInfoTitle}>Waiting for the owner</Text>
                <Text style={styles.paymentInfoText}>Signed. The owner reviews and signs off next.</Text>
              </View>
            ) : null}
            {!hasEditedCareScope && currentMutualSignatures ? (
              <View style={styles.paymentInfoBox}>
                <Text style={styles.paymentInfoTitle}>Both sides agreed</Text>
                <Text style={styles.paymentInfoText}>The owner can now confirm and pay to lock in the booking.</Text>
              </View>
            ) : null}
          </AppBottomSheetScroll>
          <AppBottomSheetFooter onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}>
            {submitError ? <AppModalError>{submitError}</AppModalError> : null}
            {hasEditedCareScope || canCaptureProviderSignature || !initialCard ? (
              <>
                <SlideToConfirm busy={submitting} label={canCaptureProviderSignature ? "Slide to Agree Care Scope" : initialCard ? "Slide to Update" : "Slide to Confirm"} onCommit={() => void submit()} resetKey={slideResetKey} />
                {hasEditedCareScope && (carerAlreadySigned || careScope?.ownerSigned === true) ? <Text style={styles.scopeSignatureResetHelper}>Updating this Care Scope will ask both sides to review it again.</Text> : null}
              </>
            ) : null}
            {editingQuoteScope && canSignCareScope && !hasEditedCareScope ? (
              <AppModalButton disabled={submitting} variant="secondary" onPress={() => setEditingQuoteScope(false)}>Return to Agreement without Updates</AppModalButton>
            ) : null}
          </AppBottomSheetFooter>
        </AppBottomSheet>
        {termsSheetVisible ? (
          <View style={[styles.inlineSheetLayer, nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]}>
            <Pressable accessibilityLabel="Close provider agreement" accessibilityRole="button" onPress={() => setTermsSheetVisible(false)} style={StyleSheet.absoluteFill} />
            <View style={styles.termsModalBoundary}>
              <View style={styles.termsModalCard}>
                <View {...termsSheetPanResponder.panHandlers} style={styles.termsModalHeader}>
                  <Text style={styles.termsModalTitle}>Care Service Carer Agreement</Text>
                  <AppModalIconButton accessibilityLabel="Close provider agreement" onPress={() => setTermsSheetVisible(false)}>
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
                  {providerAgreementPage ? (
                    <>
                      {providerAgreementPage.intro.map((paragraph, index) => (
                        <NativeLegalText key={`provider-intro-${index}`} style={styles.termsSheetText}>{paragraph}</NativeLegalText>
                      ))}
                      {providerAgreementPage.sections.map((section) => (
                        <View key={section.title} style={styles.termsLegalSection}>
                          <Text style={styles.termsLegalTitle}>{section.title}</Text>
                          {section.body.map((paragraph, index) => (
                            <NativeLegalText key={`${section.title}-${index}`} style={styles.termsSheetText}>{paragraph}</NativeLegalText>
                          ))}
                          {section.bullets?.map((bullet, index) => (
                            <View key={`${section.title}-bullet-${index}`} style={styles.termsBulletRow}>
                              <Text style={styles.termsBulletDot}>•</Text>
                              <NativeLegalText style={styles.termsBulletText}>{bullet}</NativeLegalText>
                            </View>
                          ))}
                        </View>
                      ))}
                      <Text style={styles.termsSheetText}>Updated: {providerAgreementPage.effectiveDate}</Text>
                    </>
                  ) : null}
                </ScrollView>
                <View style={styles.termsModalFooter}>
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: termsAccepted, disabled: !termsScrolled }} onPress={acceptTermsFromSheet} style={[styles.termsConfirmRow, !termsScrolled ? styles.termsConfirmRowDisabled : null]}>
                    <View style={[styles.checkbox, termsAccepted ? styles.checkboxActive : null]}>
                      {termsAccepted ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}
                    </View>
                    <Text style={styles.checkboxText}>I have read and agree to the Care Service Carer Agreement.</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
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
  const { width: windowWidth } = useWindowDimensions();
  const params = useMemo(() => parseParams(search), [search]);
  const [resolvedServiceRoomId, setResolvedServiceRoomId] = useState("");
  const roomId = params.room || resolvedServiceRoomId;
  const selectedHandoffRow = useMemo(() => readNativeChatSelectedRowHandoff({ roomId, sessionKey, userId }), [roomId, sessionKey, userId]);
  const [serviceChat, setServiceChat] = useState<ServiceChatRow | null>(null);
  const [paymentNowMs, setPaymentNowMs] = useState(() => Date.now());
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const initialCounterpart = useMemo<Counterpart | null>(() => params.peerId || params.name || params.avatar || selectedHandoffRow ? ({
    id: params.peerId || selectedHandoffRow?.peerUserId || "",
    displayName: params.name || selectedHandoffRow?.peerName || selectedHandoffRow?.chatName || "Care chat",
    avatarUrl: resolveRouteParamAvatarUrl(params.avatar) || selectedHandoffRow?.peerAvatarUrl || selectedHandoffRow?.avatarUrl || null,
    updatedAt: null,
    stripePayoutStatus: null,
    stripeAccountId: null,
    skills: params.skills.length > 0 ? params.skills : selectedHandoffRow?.serviceProviderSkills || [],
    providerServices: [],
    providerLocationStyles: [],
    providerAreaName: "",
    providerCurrency: "",
    providerHasPaidRates: true,
    providerHasVoluntaryRates: false,
    providerVolunteerOnly: false,
    providerCountry: null,
    providerServiceSearchCountry: null,
    providerAreaCountry: null,
    providerProfileCountry: null,
    providerServiceCurrencies: [],
    providerServiceAreas: [],
  }) : null, [params.avatar, params.name, params.peerId, params.skills, selectedHandoffRow]);
  const [counterpart, setCounterpart] = useState<Counterpart | null>(initialCounterpart);
  const [pets, setPets] = useState<PetOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeServiceResolved, setActiveServiceResolved] = useState(false);
  const [composer, setComposer] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const [linkPreviews, setLinkPreviews] = useState<Record<string, NativeSocialLinkPreview>>({});
  const [lockedPreviewUrl, setLockedPreviewUrl] = useState<string | null>(null);
  const [peerAvatarFailedUrls, setPeerAvatarFailedUrls] = useState<Set<string>>(new Set());
  const [dismissedPreviewUrls, setDismissedPreviewUrls] = useState<Set<string>>(new Set());
  const [uploads, setUploads] = useState<ServiceChatUpload[]>([]);
  const uploadProgress = useMemo(() => averageNativeUploadProgress(uploads), [uploads]);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // Service chat's footer is a two-layer stack (action/CTA card + composer). It's pinned to
  // the bottom as a single owned surface (position:absolute), and the message list reserves
  // this measured height as bottom padding — so the CTA can never be painted over by the
  // composer and the last messages are never hidden behind the footer. (Friends chat has only
  // a one-layer composer, which is why it never needed this contract.)
  const [footerHeight, setFooterHeight] = useState(0);
  const scrollRef = useRef<ScrollView | null>(null);
  const nearBottomRef = useRef(true);
  const loadingOlderMessagesRef = useRef(false);
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [requestSheetMode, setRequestSheetMode] = useState<"current" | "new">("current");
  const [hasReviewed, setHasReviewed] = useState(false);
  const reviewedServiceIdsRef = useRef<Set<string>>(new Set());
  const [hasReportedServiceDispute, setHasReportedServiceDispute] = useState(false);
  const [careUpdateStatus, setCareUpdateStatus] = useState<NativeCareUpdateStatus | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnchorRef = useRef<View | null>(null);
  const [menuAnchorPosition, setMenuAnchorPosition] = useState({ top: huddleSpacing.x1, right: huddleSpacing.x3 });
  const transitionNativeModal = useNativeModalTransition();
  const [reportOpen, setReportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sharedStartPin, setSharedStartPin] = useState("");
  const [carePopup, setCarePopup] = useState<{ title: string; body: string } | null>(null);
  const [confirmOwnerStartCareOpen, setConfirmOwnerStartCareOpen] = useState(false);
  const [careSaveToast, setCareSaveToast] = useState<string | null>(null);
  const careSaveToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showCareSaveToast = useCallback((message: string) => {
    setCareSaveToast(message);
    if (careSaveToastTimer.current) clearTimeout(careSaveToastTimer.current);
    careSaveToastTimer.current = setTimeout(() => setCareSaveToast(null), 2400);
  }, []);
  useEffect(() => () => { if (careSaveToastTimer.current) clearTimeout(careSaveToastTimer.current); }, []);
  const markServiceReviewSubmitted = useCallback((serviceChatId: string | null | undefined) => {
    const reviewedServiceChatId = clean(serviceChatId);
    if (!reviewedServiceChatId) return;
    reviewedServiceIdsRef.current.add(reviewedServiceChatId);
    setHasReviewed(true);
    if (userId) {
      void AsyncStorage.setItem(serviceReviewSubmittedKey(userId, reviewedServiceChatId), "1").catch(() => undefined);
    }
  }, [userId]);
  const [blockState, setBlockState] = useState<"none" | "blocked_by_me" | "blocked_by_them">("none");
  const [confirmBlockOpen, setConfirmBlockOpen] = useState(false);
  const [blockUnavailableNoticeOpen, setBlockUnavailableNoticeOpen] = useState(false);
  const [confirmWithdrawRequestOpen, setConfirmWithdrawRequestOpen] = useState(false);
  const [confirmDeclineRequestOpen, setConfirmDeclineRequestOpen] = useState(false);
  const [confirmCancelBookingOpen, setConfirmCancelBookingOpen] = useState(false);
  // When Report Issue is opened from the cancel-booking modal, we tag the report with its
  // origin ("Cancel Booking: Issue with {name}") so Support sees the cancellation context.
  // Cleared whenever the report is opened from any other entry point.
  const [handoffReportContext, setHandoffReportContext] = useState<string | null>(null);
  const [serviceActionCollapsed, setServiceActionCollapsed] = useState(false);
  const [handoffNowMs, setHandoffNowMs] = useState(() => Date.now());
  const [returnToPaymentAfterScopeEdit, setReturnToPaymentAfterScopeEdit] = useState(false);
  const [cancelBookingReason, setCancelBookingReason] = useState<(typeof CANCEL_BOOKING_ISSUES)[number]>("Plans changed");
  const [cancelBookingNote, setCancelBookingNote] = useState("");
  const [cancelIssueSelectOpen, setCancelIssueSelectOpen] = useState(false);
  const [cancelReasonFocused, setCancelReasonFocused] = useState(false);
  const [cancelSlideResetKey, setCancelSlideResetKey] = useState(0);
  const [cancelEvidenceMedia, setCancelEvidenceMedia] = useState<NativeSocialComposerMedia[]>([]);
  const [cancelEvidenceUploading, setCancelEvidenceUploading] = useState(false);
  const [careHistoryOpen, setCareHistoryOpen] = useState(false);
  const [careAgreementOpen, setCareAgreementOpen] = useState(false);
  const [careAgreementPdfUrl, setCareAgreementPdfUrl] = useState("");
  const [careAgreementDownloading, setCareAgreementDownloading] = useState(false);
  const [careHistoryLoading, setCareHistoryLoading] = useState(false);
  const [careHistoryRows, setCareHistoryRows] = useState<ServiceChatRow[]>([]);
  const [carePaymentMovementByServiceId, setCarePaymentMovementByServiceId] = useState<Record<string, NativeCarePaymentMovement[]>>({});
  // History is loaded after opening the sheet. A close invalidates outstanding
  // requests so a stalled network response cannot update the closed sheet.
  const careHistoryLoadSequenceRef = useRef(0);
  const [careHistoryManuallyHidden, setCareHistoryManuallyHidden] = useState(false);
  const [terminalHistoryDismissalHydrated, setTerminalHistoryDismissalHydrated] = useState(false);
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
  const [currentUserPhone, setCurrentUserPhone] = useState("");
  // Ordered country signals for the volunteer/empty-rate currency fallback, per spec:
  // service location → viewer location → provider GPS → provider profile. Provider GPS is
  // only stored as raw last_lat/last_lng (no country without geocoding), so it degrades to
  // the provider profile country. resolveNativeCarerCurrency walks these in order and only
  // returns USD when every signal is empty/unrecognised. Booleans/empties are dropped so a
  // missing signal never short-circuits the chain.
  const careCurrencyCountries = useMemo(() => [
    counterpart?.providerAreaCountry,   // service location
    currentUserCountry,                 // viewer location
    counterpart?.providerProfileCountry, // provider profile (GPS unavailable as a country)
  ].filter((value): value is string => Boolean(clean(value))),
  [counterpart?.providerAreaCountry, counterpart?.providerProfileCountry, currentUserCountry]);
  const autoOpenedRequestRef = useRef<string | null>(null);
  const autoOpenedQuoteRef = useRef<string | null>(null);
  // Persisted dismissed scope version for the carer auto-open (survives remount).
  const autoOpenQuoteDismissedVersionRef = useRef<string | null>(null);
  const [autoOpenQuoteDismissHydrated, setAutoOpenQuoteDismissHydrated] = useState(false);
  const paymentReturnConfirmRef = useRef<string | null>(null);
  const activeRoomRef = useRef(roomId);
  const activeSessionKeyRef = useRef(sessionKey || null);
  const loadSeqRef = useRef(0);
  const loadRef = useRef<(silent?: boolean) => Promise<void>>(async () => undefined);
  const serviceChatRef = useRef<ServiceChatRow | null>(null);
  const messagesRef = useRef<ChatMessageRow[]>([]);
  const forceScrollToLatestRef = useRef(false);
  const linkPreviewRequestsRef = useRef<Set<string>>(new Set());
  const linkPreviewsRef = useRef<Record<string, NativeSocialLinkPreview>>({});
  const realtimeCareRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    console.warn("[native.service_chat.runtime] screen_mounted", {
      probe: "payment-ui-v3",
      hasRoomId: Boolean(roomId),
      hasUserId: Boolean(userId),
    });
  }, [roomId, userId]);

  useEffect(() => {
    if (params.room || !params.service || !userId) {
      if (params.room) setResolvedServiceRoomId("");
      return;
    }
    let cancelled = false;
    void supabase
      .from("service_chats")
      .select("id,chat_id")
      .eq("id", params.service)
      .or(`requester_id.eq.${userId},provider_id.eq.${userId}`)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        const resolvedChatId = clean(data?.chat_id);
        if (error || !resolvedChatId) {
          setLoading(false);
          setCarePopup({ title: "Care payment", body: "This care session could not be opened. Please try again." });
          return;
        }
        setResolvedServiceRoomId(resolvedChatId);
      });
    return () => { cancelled = true; };
  }, [params.room, params.service, userId]);

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
    linkPreviewsRef.current = linkPreviews;
  }, [linkPreviews]);

  useEffect(() => {
    serviceChatRef.current = serviceChat;
  }, [serviceChat]);

  useEffect(() => {
    let cancelled = false;
    const activeServiceChatId = clean(serviceChat?.id);
    if (!userId || !activeServiceChatId) return () => { cancelled = true; };
    if (reviewedServiceIdsRef.current.has(activeServiceChatId)) {
      setHasReviewed(true);
      return () => { cancelled = true; };
    }
    void AsyncStorage.getItem(serviceReviewSubmittedKey(userId, activeServiceChatId))
      .then((value) => {
        if (cancelled || value !== "1") return;
        reviewedServiceIdsRef.current.add(activeServiceChatId);
        if (clean(serviceChatRef.current?.id) === activeServiceChatId) setHasReviewed(true);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [serviceChat?.id, userId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
    const activeServiceChatId = clean(serviceChat?.id);
    if (!userId || !activeServiceChatId) return () => { cancelled = true; };
    void readCachedStartPin(userId, activeServiceChatId).then((pin) => {
      // SecureStore can resolve after the authoritative preparation RPC. An empty
      // cache result must never erase a PIN that arrived while this read was pending.
      if (!cancelled && pin) setSharedStartPin((current) => current || pin);
    });
    return () => { cancelled = true; };
  }, [serviceChat?.id, userId]);

  useEffect(() => {
    const activeServiceChatId = clean(serviceChat?.id);
    if (!userId || !activeServiceChatId || !serviceChat?.care_status) return;
    if (!["awaiting_handoff", "pin_shared"].includes(serviceChat.care_status)) {
      setSharedStartPin("");
      void purgeCachedStartPin(userId, activeServiceChatId);
    }
  }, [serviceChat?.care_status, serviceChat?.id, userId]);

  const isCurrentServiceChatRequest = useCallback((targetRoomId: string | null | undefined, requestSessionKey: string | null | undefined) => (
    Boolean(targetRoomId) && activeRoomRef.current === targetRoomId && (activeSessionKeyRef.current || null) === (requestSessionKey || null)
  ), []);
  const scrollServiceMessagesToLatest = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated });
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated }), 80);
    });
  }, []);
  const hydrateServiceMessages = useCallback((
    incoming: ChatMessageRow[],
    options: { cacheRoomId?: string | null; cacheUserId?: string | null; replace?: boolean; source?: "cache" | "db" | "realtime"; sessionKey?: string | null } = {},
  ) => {
    setMessages((current) => {
      const next = options.replace === true
        ? mergeServiceMessageRows([], incoming)
        : mergeServiceMessageRows(current, incoming);
      messagesRef.current = next;
      if (options.source !== "cache" && options.cacheUserId && options.cacheRoomId && next.length > 0) {
        void writeCachedNativeChatMessages(
          options.cacheUserId,
          options.cacheRoomId,
          next.map((message) => serviceRowToNativeChatMessage(message, options.cacheRoomId || "")),
          { dbConfirmedAt: Date.now(), sessionKey: options.sessionKey || null, source: options.source || "db" },
        );
      }
      return next;
    });
  }, []);

  const role: ServiceRole | null = useMemo(() => {
    if (!userId) return null;
    // Once a booking becomes history, `serviceChat` is deliberately cleared. Keep
    // the participant role from that terminal row so the owner returns to the
    // same clean Start-a-quote state instead of a role-less pending screen.
    const roleAnchor = serviceChat || careHistoryRows.find((row) => (
      row.requester_id === userId || row.provider_id === userId
    )) || null;
    if (!roleAnchor) return null;
    if (roleAnchor.requester_id === userId) return "requester";
    if (roleAnchor.provider_id === userId) return "provider";
    return null;
  }, [careHistoryRows, serviceChat, userId]);
  const rawStatus = (serviceChat?.status || "pending") as ServiceStatus;
  const isRequester = role === "requester";
  const isProvider = role === "provider";
  const hasRequest = Boolean(serviceChat?.request_card);
  const hasQuote = Boolean(serviceChat?.quote_card);
  const providerStripeReady = Boolean(counterpart?.stripePayoutStatus === "complete" && counterpart?.stripeAccountId);
  const rawCareStatus = serviceChat?.care_status || null;
  const pendingRequestExpired = useMemo(() => isPendingRequestExpired(serviceChat), [serviceChat]);
  const disputeResolved = Boolean(isResolvedServiceDisputeStatus(serviceChat?.dispute_status));
  const rowHasOpenDisputeSignal = Boolean(rawStatus === "disputed" || rawCareStatus === "under_dispute" || rawCareStatus === "handoff_issue_review" || rawCareStatus === "handoff_expired_manual_refund_required" || serviceChat?.disputed_at);
  const rowResolved = Boolean(disputeResolved || (!rowHasOpenDisputeSignal && (rawStatus === "completed" || rawCareStatus === "completed" || serviceChat?.completed_at)));
  const rowUnderReview = Boolean(!disputeResolved && rowHasOpenDisputeSignal);
  const underReview = rowUnderReview;
  // Terminal rows remain history, never active Care truth. The latest terminal row is
  // presentation-only: it keeps a just-cancelled room visibly Cancelled until the owner
  // sends a fresh request and create_service_chat supplies a new active row.
  const latestTerminalServiceChat = useMemo(() => {
    const terminalRows = careHistoryRows
      .filter(isServiceChatHistoryMenuEligible)
      .sort((a, b) => {
        const bTerminalTime = Date.parse(serviceChatHistoryTerminalAt(b, b.provider_id === userId)) || serviceChatRowActivityTime(b);
        const aTerminalTime = Date.parse(serviceChatHistoryTerminalAt(a, a.provider_id === userId)) || serviceChatRowActivityTime(a);
        return bTerminalTime - aTerminalTime;
      });
    return terminalRows[0] || null;
  }, [careHistoryRows, userId]);
  const terminalCancelledServiceChat = !serviceChat && latestTerminalServiceChat && isCancelledServiceChatRow(latestTerminalServiceChat)
    ? latestTerminalServiceChat
    : null;
  const effectiveServiceChat = useMemo<ServiceChatRow | null>(() => {
    if (!serviceChat) return terminalCancelledServiceChat;
    if (!underReview) return serviceChat;
    if (serviceChat.care_status === "handoff_expired_manual_refund_required") {
      return {
        ...serviceChat,
        status: "disputed",
        disputed_at: serviceChat.disputed_at || new Date().toISOString(),
      };
    }
    return {
      ...serviceChat,
      status: "disputed",
      care_status: "under_dispute",
      disputed_at: serviceChat.disputed_at || new Date().toISOString(),
    };
  }, [serviceChat, terminalCancelledServiceChat, underReview]);
  const careConversationState = useMemo(
    () => deriveActiveCareConversationState(serviceChat, underReview),
    [serviceChat, underReview],
  );
  const status = careConversationState.status;
  const careStatus = careConversationState.careStatus;
  const terminalSystemNoStart = Boolean(terminalCancelledServiceChat?.cancellation_status === "system_no_start");
  const peerName = counterpart?.displayName || params.name || "Care chat";
  const peerAvatarCandidates = useMemo(() => Array.from(new Set([
    counterpart?.avatarUrl,
    resolveRouteParamAvatarUrl(params.avatar),
  ].filter((url): url is string => Boolean(url)))), [counterpart?.avatarUrl, params.avatar]);
  const peerAvatarCandidatesKey = peerAvatarCandidates.join("|");
  const visiblePeerAvatar = peerAvatarCandidates.find((url) => !peerAvatarFailedUrls.has(url)) || null;
  const skillsLabel = counterpart?.skills?.length ? counterpart.skills.slice(0, 3).join(" / ") : params.skills.length ? params.skills.slice(0, 3).join(" / ") : "Pet Carer";
  const noMessagesYet = messages.length === 0;
  const serviceShellPending = Boolean(loading && !serviceChat && noMessagesYet);
  const canLeaveReview = Boolean(!underReview && status === "completed" && (isRequester || isProvider) && !hasReviewed);
  const showReviewComposerCta = canLeaveReview;
  const canShowComposer = Boolean(careConversationState.kind === "scope_pending" && hasRequest && !showReviewComposerCta);
  const serviceComposerDisabled = sending || blockState !== "none";
  const canBookCareFromMenu = Boolean(isRequester && (careConversationState.kind === "clean_slate" || careConversationState.kind === "completed"));
  // Blocking would sever the shared Care evidence and resolution channel. Existing blocks
  // may still be lifted; only a new block is held until the relationship is clean or complete.
  const blockUnavailableForCare = Boolean(
    blockState !== "blocked_by_me"
    && !["clean_slate", "completed"].includes(careConversationState.kind),
  );
  const visibleNotice = underReview ? SERVICE_UNDER_REVIEW_NOTICE : notice;
  const typedPreviewUrl = extractCompletedServicePreviewUrl(composer);
  const activePreviewUrl = lockedPreviewUrl || (typedPreviewUrl && !dismissedPreviewUrls.has(typedPreviewUrl) ? typedPreviewUrl : null);
  const canReportBookingIssue = Boolean(!hasReportedServiceDispute && serviceChat && (isRequester || isProvider) && ["in_progress", "completed", "under_dispute"].includes(careStatus || "") && status !== "pending");
  // Role-split to match the embedded blue-box card's existing lock behavior (ServiceActionCard's
  // `locked={isRequester && careStatus === "pin_shared"}`): once the owner shares the Start PIN,
  // it's the carer's move -- the owner can no longer cancel from the menu. The carer keeps Cancel
  // Booking available (menu + inline) all the way through pin_shared, since they haven't
  // committed to the booking with an actual check-in yet; it disappears for them only once they
  // start care (care_status leaves pin_shared for in_progress).
  const scheduledStartMs = getServiceStartMs(serviceChat);
  const handoffGraceEndMs = getServiceHandoffGraceEndMs(serviceChat);
  const scheduledEndIso = serviceScheduledEndIso(serviceChat?.request_card, serviceChat?.booking_snapshot);
  const scheduledEndMs = scheduledEndIso ? Date.parse(scheduledEndIso) : NaN;
  const noStartPolicyActive = Boolean(clean(serviceChat?.booking_snapshot?.noStartPolicy?.version));
  const handoffReady = Boolean(scheduledStartMs && handoffNowMs >= scheduledStartMs);
  const handoffOverdue = Boolean(handoffGraceEndMs && handoffNowMs >= handoffGraceEndMs);
  const noStartReportOpen = Boolean(noStartPolicyActive && handoffOverdue && Number.isFinite(scheduledEndMs) && handoffNowMs < scheduledEndMs);
  const startWindowElapsed = Boolean(Number.isFinite(scheduledEndMs) && handoffNowMs >= scheduledEndMs);
  const systemNoStartCancellationPending = Boolean(
    serviceChat
    && startWindowElapsed
    && status === "booked"
    && ["awaiting_handoff", "pin_shared"].includes(careStatus || "awaiting_handoff")
  );
  const displayStatus = terminalCancelledServiceChat
    ? "cancelled"
    : systemNoStartCancellationPending
      ? "cancelling"
      : careConversationState.status;
  const displayStatusLabel = terminalCancelledServiceChat
    ? "Cancelled"
    : systemNoStartCancellationPending
      ? "Cancelling…"
      : careConversationState.statusLabel;
  const ownerAuthorizedStart = careStatus === "pin_shared" || Boolean(clean(serviceChat?.early_start_allowed_at));
  const carerCanStart = handoffReady || ownerAuthorizedStart;
  const canCancelPaidBooking = Boolean(serviceChat && status === "booked" && !handoffReady && (
    (isRequester && careStatus === "awaiting_handoff")
    || (isProvider && ["awaiting_handoff", "pin_shared"].includes(careStatus || "awaiting_handoff"))
  ));
  const canReportHandoffProblem = Boolean(serviceChat && isProvider && status === "booked" && ["awaiting_handoff", "pin_shared"].includes(careStatus || "awaiting_handoff") && (!noStartPolicyActive || !handoffOverdue));
  const canReportRequesterHandoffProblem = Boolean(serviceChat && isRequester && status === "booked" && ["awaiting_handoff", "pin_shared"].includes(careStatus || "awaiting_handoff") && (!noStartPolicyActive || !handoffOverdue));
  const canRespondToHandoffProblem = Boolean(serviceChat && isRequester && careStatus === "handoff_issue_review");

  useEffect(() => {
    if (status !== "booked" || !["awaiting_handoff", "pin_shared"].includes(careStatus || "")) return undefined;
    setHandoffNowMs(Date.now());
    const timer = setInterval(() => setHandoffNowMs(Date.now()), 15000);
    const deadlineDelayMs = scheduledEndMs - Date.now();
    const deadlineTimer = Number.isFinite(deadlineDelayMs) && deadlineDelayMs >= 0 && deadlineDelayMs <= 2_147_483_647
      ? setTimeout(() => setHandoffNowMs(Date.now()), deadlineDelayMs + 50)
      : null;
    return () => {
      clearInterval(timer);
      if (deadlineTimer) clearTimeout(deadlineTimer);
    };
  }, [careStatus, scheduledEndMs, status]);
  useEffect(() => {
    const activeServiceChatId = clean(serviceChat?.id);
    if (!systemNoStartCancellationPending || !userId || !activeServiceChatId) return;
    setSharedStartPin("");
    void purgeCachedStartPin(userId, activeServiceChatId);
  }, [serviceChat?.id, systemNoStartCancellationPending, userId]);
  const allCareHistoryRows = useMemo(() => {
    const byId = new Map<string, ServiceChatRow>();
    for (const row of careHistoryRows) byId.set(row.id, frozenHistoryServiceChatRow(row));
    return Array.from(byId.values())
      .filter(isServiceChatHistoryMenuEligible)
      .sort((a, b) => {
        const bTime = Date.parse(serviceChatHistoryTerminalAt(b, isProvider)) || serviceChatRowActivityTime(b);
        const aTime = Date.parse(serviceChatHistoryTerminalAt(a, isProvider)) || serviceChatRowActivityTime(a);
        return bTime - aTime;
      });
  }, [careHistoryRows, isProvider]);
  useEffect(() => {
    const ids = Array.from(new Set([
      clean(serviceChat?.id),
      clean(terminalCancelledServiceChat?.id),
      ...allCareHistoryRows.map((row) => clean(row.id)),
    ].filter(Boolean))).slice(0, 20);
    if (!userId || ids.length === 0) {
      setCarePaymentMovementByServiceId({});
      return undefined;
    }
    let active = true;
    const refresh = async () => {
      try {
        const movements = await getNativeCarePaymentStatuses(ids, accessToken);
        if (!active) return;
        const next: Record<string, NativeCarePaymentMovement[]> = {};
        for (const movement of movements) {
          if (!movement.serviceChatId) continue;
          (next[movement.serviceChatId] ||= []).push(movement);
        }
        setCarePaymentMovementByServiceId(next);
      } catch (error) {
        console.warn("[native.care_payment_status] refresh_failed", {
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [
    accessToken,
    allCareHistoryRows,
    serviceChat?.care_status,
    serviceChat?.id,
    serviceChat?.payout_released_at,
    terminalCancelledServiceChat?.id,
    userId,
  ]);
  const activeCarePaymentMovement = effectiveServiceChat?.id
    ? carePaymentMovementByServiceId[effectiveServiceChat.id]?.[0] || null
    : null;
  const paymentSetupNeeded = Boolean(isProvider && activeCarePaymentMovement?.actionRequired);
  const openPayoutAccount = useCallback(() => {
    onNavigate("/carerprofile");
  }, [onNavigate]);
  useEffect(() => {
    setPeerAvatarFailedUrls(new Set());
  }, [peerAvatarCandidatesKey]);
  const canOpenCareHistory = Boolean((serviceChat && (isRequester || isProvider)) || careHistoryRows.length > 0);
  const canHideCurrentCareHistory = Boolean(effectiveServiceChat && isServiceChatHistoryMenuEligible(effectiveServiceChat));
  const canInlineHideCurrentCareHistory = Boolean(canHideCurrentCareHistory && !terminalSystemNoStart);
  const careHistoryAutoHidden = Boolean(effectiveServiceChat && isServiceChatAutoHiddenInHistory(effectiveServiceChat, isProvider));
  const careHistoryHiddenFromChat = Boolean(
    (terminalCancelledServiceChat && !terminalHistoryDismissalHydrated)
    || (canHideCurrentCareHistory && careHistoryManuallyHidden)
    || careHistoryAutoHidden
  );

  useEffect(() => {
    if (serviceChat || !userId || !terminalCancelledServiceChat?.id) {
      setTerminalHistoryDismissalHydrated(true);
      return;
    }
    let cancelled = false;
    const terminalServiceChatId = terminalCancelledServiceChat.id;
    setTerminalHistoryDismissalHydrated(false);
    setCareHistoryManuallyHidden(false);
    void AsyncStorage.getItem(serviceHistoryHiddenKey(userId, terminalServiceChatId))
      .then((value) => {
        if (!cancelled) setCareHistoryManuallyHidden(value === "1");
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setTerminalHistoryDismissalHydrated(true);
      });
    return () => { cancelled = true; };
  }, [serviceChat, terminalCancelledServiceChat?.id, userId]);
  const cancelPolicy = useMemo(() => getCancelPolicy(serviceChat, isProvider), [isProvider, serviceChat]);
  const cancelWithin24Hours = useMemo(() => {
    const startMs = getServiceStartMs(serviceChat);
    return Boolean(startMs && (startMs - Date.now()) / 3600000 < 24);
  }, [serviceChat]);
  const showCancelReportIssueLink = Boolean(isProvider || (isRequester && cancelWithin24Hours));
  const careUpdateKind = useMemo(() => deriveCareUpdateKind(serviceChat?.request_card?.updatePreference), [serviceChat?.request_card?.updatePreference]);
  const careUpdatePetName = useMemo(() => {
    const card = serviceChat?.request_card;
    if (!card) return "";
    const direct = clean(card.petName);
    if (direct) return direct;
    return requestCardPets(card)[0]?.petName || "";
  }, [serviceChat?.request_card]);
  const careUpdatePetNames = useMemo(() => {
    const card = serviceChat?.request_card;
    if (!card) return [];
    const names = requestCardPets(card).map((pet) => clean(pet.petName)).filter(Boolean);
    const direct = clean(card.petName);
    return Array.from(new Set([direct, ...names].filter(Boolean)));
  }, [serviceChat?.request_card]);
  const hasLocalCareUpdate = useMemo(() => messages.some((message) => parseServiceMessage(message.content).kind === "service_care_update"), [messages]);
  const requestedCareUpdateCount = Math.max(1, getRequestedCareDayCount(serviceChat?.request_card));
  const requiredCareUpdateCount = careUpdateIsRequested(careUpdateKind)
    ? Math.max(1, Number(careUpdateStatus?.total_required_count ?? careUpdateStatus?.required_count ?? requestedCareUpdateCount) || 1)
    : 0;
  const statusSubmittedCareUpdateCount = typeof careUpdateStatus?.submitted_count === "number" ? careUpdateStatus.submitted_count : 0;
  const activeCareUpdateServiceChatId = clean(serviceChat?.id);
  const careUpdateStatusReady = !careUpdateIsRequested(careUpdateKind) || Boolean(
    activeCareUpdateServiceChatId
    && clean(careUpdateStatus?.service_chat_id) === activeCareUpdateServiceChatId,
  );
  const careUpdateRequirementMet = !careUpdateIsRequested(careUpdateKind) || (careUpdateStatusReady && careUpdateStatus?.met === true);
  const hasSentAnyCareUpdate = Boolean(careUpdateStatus?.latest_update_at) || hasLocalCareUpdate;
  const careUpdateRequiredCtaSatisfied = careUpdateRequirementMet;
  const careSessionInProgress = careStatus === "in_progress" || status === "in_progress";
  const careUpdateEntryVisible = Boolean(!underReview && isProvider && careSessionInProgress);
  const showCareUpdateStatusLoading = Boolean(careUpdateEntryVisible && careUpdateIsRequested(careUpdateKind) && !careUpdateStatusReady);
  const showRequiredCareUpdateAction = Boolean(careUpdateEntryVisible && careUpdateStatusReady && !careUpdateRequiredCtaSatisfied);
  const showShareMoreUpdateAction = Boolean(careUpdateEntryVisible && careUpdateStatusReady && careUpdateRequiredCtaSatisfied);
  const requiredCareUpdateActionText = requiredCareUpdateActionLabel(careUpdateKind, statusSubmittedCareUpdateCount, requiredCareUpdateCount);
  const [careUpdateSheetOptional, setCareUpdateSheetOptional] = useState(false);
  const openRequiredCareUpdateSheet = useCallback(() => {
    setCareUpdateSheetOptional(false);
    setActiveSheet("careUpdate");
  }, []);
  const openOptionalCareUpdateSheet = useCallback(() => {
    setCareUpdateSheetOptional(true);
    setActiveSheet("careUpdate");
  }, []);
  const [completionCareUpdateAttempted, setCompletionCareUpdateAttempted] = useState(false);
  useEffect(() => {
    if (careUpdateRequirementMet || hasSentAnyCareUpdate || careStatus !== "in_progress") setCompletionCareUpdateAttempted(false);
  }, [careStatus, careUpdateRequirementMet, hasSentAnyCareUpdate]);
  const handleStartCompletion = useCallback(async () => {
    if (!roomId) return;
    setCompletionCareUpdateAttempted(false);
    if (isProvider && careStatus === "in_progress" && careUpdateIsRequested(careUpdateKind)) {
      try {
        const activeServiceChatId = clean(serviceChatRef.current?.id);
        if (!activeServiceChatId) throw new Error("service_chat_not_found");
        const status = await getNativeCareUpdateStatus(activeServiceChatId);
        setCareUpdateStatus(status);
        const fetchedRequirementMet = status?.met === true;
        if (!fetchedRequirementMet) {
          setCompletionCareUpdateAttempted(true);
          haptic.warning();
        }
      } catch {
        // Fail open: a temporary status lookup problem must never become a
        // completion warning or gate. Only a confirmed missing update is shown.
      }
    }
    setActiveSheet("completion");
  }, [careStatus, careUpdateKind, isProvider, roomId]);
  const [completionEntrySlideResetKey, setCompletionEntrySlideResetKey] = useState(0);
  const handleCompletionEntrySlide = useCallback(async () => {
    try {
      await handleStartCompletion();
    } finally {
      // The entry control remains a real slider even though the confirmations live in
      // the completion sheet. Always return it to its resting position after the sheet
      // opens so a retry never leaves a spent slider. A missing update is a reminder,
      // never a completion prerequisite.
      setCompletionEntrySlideResetKey((key) => key + 1);
    }
  }, [handleStartCompletion]);
  useEffect(() => {
    if (!underReview) return;
    setActiveSheet(null);
    setCarePopup(null);
    setConfirmBlockOpen(false);
    setConfirmWithdrawRequestOpen(false);
    setMenuOpen(false);
    setReportOpen(false);
    setProviderProfileOpen(false);
  }, [underReview]);
  const messageStartPin = useMemo(() => {
    const activeServiceChatId = clean(serviceChat?.id);
    if (!activeServiceChatId) return "";
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const parsed = parseServiceMessage(messages[index]?.content || "");
      if (parsed.kind === "service_pin_shared" && parsed.serviceChatId === activeServiceChatId && parsed.pin) return parsed.pin;
    }
    return "";
  }, [messages, serviceChat?.id]);
  const activeStartPin = messageStartPin || sharedStartPin;
  useEffect(() => {
    const activeServiceChatId = clean(serviceChat?.id);
    if (!isRequester || !userId || !activeServiceChatId || serviceChat?.status !== "booked") return undefined;
    if (!["awaiting_handoff", "pin_shared"].includes(clean(serviceChat.care_status))) return undefined;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let showedError = false;
    const preparePin = async () => {
      try {
        const { data, error } = await supabase.rpc("prepare_service_start_pin_by_service_id", { p_service_chat_id: activeServiceChatId });
        if (error) throw error;
        const pin = sanitizeStartPin((data as { pin?: unknown } | null)?.pin);
        if (!pin) throw new Error("start_pin_not_prepared");
        if (cancelled || clean(serviceChatRef.current?.id) !== activeServiceChatId) return;
        setSharedStartPin(pin);
        void writeCachedStartPin(userId, activeServiceChatId, pin);
      } catch (error) {
        if (cancelled || clean(serviceChatRef.current?.id) !== activeServiceChatId) return;
        if (!activeStartPin && !showedError) {
          showedError = true;
          setCarePopup({ title: "Care Session PIN", body: safeCareErrorMessage(error, "Unable to prepare the Care Session PIN. Retrying automatically.") });
        }
        retryTimer = setTimeout(() => void preparePin(), 3000);
      }
    };
    void preparePin();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [activeStartPin, isRequester, serviceChat?.care_status, serviceChat?.id, serviceChat?.status, userId]);
  useEffect(() => {
    const activeServiceChatId = clean(serviceChat?.id);
    if (!messageStartPin || !activeServiceChatId || !userId) return;
    setSharedStartPin(messageStartPin);
    void writeCachedStartPin(userId, activeServiceChatId, messageStartPin);
  }, [messageStartPin, serviceChat?.id, userId]);
  const requesterEditableRequestCard = useMemo(
    () => requestCardWithCareScopeUpdates(serviceChat?.request_card, serviceChat?.quote_card, serviceChat?.care_scope?.actorRole),
    [serviceChat?.care_scope?.actorRole, serviceChat?.quote_card, serviceChat?.request_card],
  );
  const openCurrentRequestSheet = useCallback(() => {
    setRequestSheetMode("current");
    setActiveSheet("request");
  }, []);
  const openNewRequestSheet = useCallback(() => {
    setRequestSheetMode("new");
    setActiveSheet("request");
  }, []);
  useEffect(() => {
    if (!isCarePaymentPendingActive(serviceChat?.care_scope, Date.now())) return undefined;
    setPaymentNowMs(Date.now());
    const timer = setInterval(() => setPaymentNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [serviceChat?.care_scope, serviceChat?.care_scope?.paymentPendingExpiresAt, serviceChat?.care_scope?.paymentStatus]);
  const requestSheetStartsFresh = requestSheetMode === "new" || careConversationState.kind === "clean_slate" || careConversationState.kind === "completed";
  const requestSheetInitialCard = requestSheetStartsFresh ? null : requesterEditableRequestCard;
  const requestSheetSubmitLabel: "Send" | "Update" = requestSheetStartsFresh || !serviceChat?.request_sent_at ? "Send" : "Update";
  const currentBookingDetailsEditable = careConversationState.kind === "scope_pending";
  const requestSheetOpen = activeSheet === "request" && (requestSheetStartsFresh || currentBookingDetailsEditable);
  const quoteSheetOpen = activeSheet === "quote" && currentBookingDetailsEditable;
  useEffect(() => {
    if ((activeSheet === "request" && !requestSheetStartsFresh && !currentBookingDetailsEditable) || (activeSheet === "quote" && !currentBookingDetailsEditable)) {
      setActiveSheet(null);
      setRequestSheetMode("current");
    }
  }, [activeSheet, currentBookingDetailsEditable, requestSheetStartsFresh]);
  const canConfirmCompletion = useMemo(() => {
    if (underReview) return false;
    if (!serviceChat || !role) return false;
    if (!isCareOfficiallyStarted(serviceChat)) return false;
    if (role === "requester" && serviceChat.requester_mark_finished) return false;
    if (role === "provider" && serviceChat.provider_mark_finished) return false;
    return serviceChat.care_status === "in_progress" || serviceChat.status === "in_progress";
  }, [role, serviceChat, underReview]);
  const careSessionActiveForLockScreen = useMemo(() => {
    if (underReview || !serviceChat || !role) return false;
    if (serviceChat.requester_mark_finished && serviceChat.provider_mark_finished) return false;
    return serviceChat.care_status === "in_progress" || serviceChat.status === "in_progress";
  }, [role, serviceChat, underReview]);
  // Name and avatar must come from the same pet in the same pass — computing
  // them as two independently-deduped lists (as this used to) risks pairing
  // pet A's name with pet B's photo once the Live Activity zips them by index.
  const activeCarePetPayload = useMemo(() => {
    const pets: { name: string; rawUrl: string | null }[] = [];
    const seenNames = new Set<string>();
    const requestCardHasPets = Boolean(serviceChat?.request_card && (requestCardPets(serviceChat.request_card).length > 0 || clean(serviceChat.request_card.petName)));
    const quoteCardHasPets = Boolean(serviceChat?.quote_card && ((Array.isArray(serviceChat.quote_card.pets) && serviceChat.quote_card.pets.length > 0) || clean(serviceChat.quote_card.petName) || clean(serviceChat.quote_card.petId)));
    const snapshotCard = serviceChat?.booking_snapshot ? serviceRequestCardFromBookingSnapshot(serviceChat.booking_snapshot) : null;
    const snapshotHasPets = Boolean(snapshotCard && (requestCardPets(snapshotCard).length > 0 || clean(snapshotCard.petName)));
    const scopedSource = snapshotHasPets
      ? "booking_snapshot"
      : requestCardHasPets
        ? "request_card_fallback"
        : quoteCardHasPets
          ? "quote_card_fallback"
          : "missing";
    const scopedCard = snapshotHasPets
      ? snapshotCard
      : requestCardHasPets
        ? serviceChat?.request_card
        : quoteCardHasPets
          ? serviceChat?.quote_card
          : null;
    const scopedPets = scopedCard?.pets;
    if (scopedCard && scopedPets) {
      for (const pet of scopedPets) {
        const name = clean((pet as { petName?: unknown }).petName) || clean(scopedCard.petName);
        const rawUrl = clean((pet as { petPhotoUrl?: unknown }).petPhotoUrl);
        const dedupeKey = clean((pet as { petId?: unknown }).petId) || name || rawUrl || "";
        if (!dedupeKey || seenNames.has(dedupeKey)) continue;
        seenNames.add(dedupeKey);
        pets.push({ name, rawUrl: rawUrl || null });
      }
      return { source: scopedSource, pets };
    }
    const direct = clean(scopedCard?.petName);
    if (scopedCard && direct && !seenNames.has(direct)) {
      seenNames.add(direct);
      const rawUrl = clean("petPhotoUrl" in scopedCard ? scopedCard.petPhotoUrl : undefined);
      pets.push({ name: direct, rawUrl: rawUrl || null });
      return { source: scopedSource, pets };
    }
    return { source: scopedSource, pets };
  }, [serviceChat?.booking_snapshot, serviceChat?.quote_card, serviceChat?.request_card]);
  const activeCarePets = activeCarePetPayload.pets;
  useEffect(() => {
    if (!roomId || !serviceChat) return;
    const activeServiceId = clean(serviceChat.id);
    // Keep the same immutable clock precedence as cold hydration and the
    // dispatcher. Chat writes mutate updated_at and must never reset progress.
    const startedAt = serviceChat.in_progress_at || serviceChat.checkin_submitted_at || serviceChat.booked_at;
    const currentUserMarkedFinished = (role === "requester" && serviceChat.requester_mark_finished) || (role === "provider" && serviceChat.provider_mark_finished);
    const bothSidesMarkedFinished = serviceChat.requester_mark_finished && serviceChat.provider_mark_finished;
    const noLongerInProgress = bothSidesMarkedFinished || serviceChat.care_status === "completed" || serviceChat.status === "completed" || serviceChat.status === "cancelled" || underReview;
    if (noLongerInProgress) {
      void endCareSessionActivity(activeServiceId || roomId, [roomId]);
      return;
    }
    if (careSessionActiveForLockScreen && startedAt) {
      void (async () => {
        let canonicalPets = activeCarePets;
        if (activeServiceId) {
          const { data: servicePets, error: servicePetsError } = await supabase.rpc("get_service_care_pet_scope", {
            p_service_id: activeServiceId,
          });
          if (!servicePetsError && Array.isArray(servicePets) && servicePets.length > 0) {
            canonicalPets = servicePets.map((pet: { petName?: unknown; petPhotoUrl?: unknown }) => ({
              name: clean(pet.petName) || "Pet",
              rawUrl: clean(pet.petPhotoUrl) || null,
            }));
          } else if (servicePetsError) {
            console.log("[HUDDLE_ACTIVE_SESSION_NATIVE]", {
              event: "care_pet_scope_resolve_failed",
              serviceId: activeServiceId,
              message: servicePetsError.message,
            });
          }
        }
        const resolvedPets = await Promise.all(canonicalPets.map(async (pet) => ({
          name: pet.name,
          avatarUrl: await resolveNativePetImageUrlAsync(pet.rawUrl).catch((error) => {
            console.log("[HUDDLE_ACTIVE_SESSION_NATIVE]", {
              event: "care_pet_avatar_resolve_failed",
              roomId,
              rawKind: pet.rawUrl?.startsWith("http") ? "http" : pet.rawUrl ? "storage_path" : "missing",
              message: error instanceof Error ? error.message : String(error || "unknown"),
            });
            return null;
          }),
        })));
        console.log("[HUDDLE_ACTIVE_SESSION_NATIVE]", {
          event: "care_pet_avatar_payload",
          roomId,
          serviceId: activeServiceId || null,
          source: activeServiceId && canonicalPets !== activeCarePets ? "service_care_scope" : activeCarePetPayload.source,
          pets: resolvedPets.map((pet) => ({
            name: pet.name,
            hasAvatar: Boolean(pet.avatarUrl),
            avatarKind: pet.avatarUrl?.includes("/storage/v1/object/public/pets/") ? "public" : pet.avatarUrl?.includes("/storage/v1/object/sign/pets/") ? "signed" : pet.avatarUrl ? "other" : "missing",
          })),
        });
        await updateCareSessionActivity({
          chatId: roomId,
          serviceId: activeServiceId || null,
          startedAt,
          expiresAt: serviceScheduledEndIso(serviceChat.request_card, serviceChat.booking_snapshot) || null,
          pets: resolvedPets,
          petsTotalCount: canonicalPets.length,
          deepLink: `huddle:///service-chat?room=${encodeURIComponent(roomId)}&service=${encodeURIComponent(activeServiceId || roomId)}&sheet=completion`,
          completionRole: role === "provider" ? "provider" : "requester",
          showAction: !currentUserMarkedFinished,
          awaitingText: currentUserMarkedFinished
            ? role === "provider"
              ? "Awaiting owner to confirm completion."
              : "Awaiting carer to confirm completion."
            : null,
        });
      })();
      return;
    }
    if (careSessionActiveForLockScreen && !startedAt) {
      console.log("[HUDDLE_ACTIVE_SESSION_NATIVE]", {
        event: "care_started_at_missing",
        roomId,
        serviceId: activeServiceId || null,
      });
    }
  }, [activeCarePetPayload.source, activeCarePets, careSessionActiveForLockScreen, role, roomId, serviceChat, underReview]);
  useEffect(() => {
    if (params.sheet !== "completion" || !canConfirmCompletion) return;
    setActiveSheet("completion");
  }, [canConfirmCompletion, params.sheet]);
  // Completion is always entered through a real slide gesture. The sheet then captures the
  // required completion confirmations before its final slide submits the database action.
  const completionCtaLabel = "Slide to Complete";
  const canOpenPeerCarerProfile = Boolean(serviceChat?.provider_id && counterpart?.id === serviceChat.provider_id);
  const canOpenPeerPublicProfile = Boolean(counterpart?.id && counterpart.id !== serviceChat?.provider_id);

  const hideCurrentCareHistory = useCallback(() => {
    if (!userId || !effectiveServiceChat?.id || !canHideCurrentCareHistory) return;
    setCareHistoryManuallyHidden(true);
    void AsyncStorage.setItem(serviceHistoryHiddenKey(userId, effectiveServiceChat.id), "1").catch(() => undefined);
  }, [canHideCurrentCareHistory, effectiveServiceChat?.id, userId]);

  const openCareAgreementPdf = useCallback(async (chat: ServiceChatRow | null, snapshotMode: "live" | "history" = "live") => {
    const agreement = chat?.care_agreement || null;
    if (!chat || (!careAgreementHasPdf(agreement) && !careAgreementHasSignedParties(agreement))) {
      setCarePopup({ title: "Care Agreement", body: "The agreement is being prepared. Please check again shortly." });
      return;
    }
    setCareAgreementPdfUrl("");
    setCareAgreementOpen(true);
    try {
      let pdfPath = clean(agreement?.pdfPath);
      if (accessToken && chat.id) {
        const { data, error } = await supabase.functions.invoke("generate-care-agreement-pdf", {
          body: {
            service_chat_id: chat.id,
            snapshot_mode: snapshotMode,
            source: "native_viewer_open",
            viewer_role: isProvider ? "carer" : "owner",
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (error) throw error;
        pdfPath = clean((data as { pdf_path?: unknown } | null)?.pdf_path) || pdfPath;
      }
      if (!pdfPath) throw new Error("pdf_path_missing");
      const url = await getCachedSignedStorageUrl("care_agreements", pdfPath, 10 * 60);
      if (!url) throw new Error("signed_url_missing");
      setCareAgreementPdfUrl(url);
    } catch (error) {
      console.warn("[native.service_care_agreement] open_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      setCarePopup({ title: "Care Agreement", body: "Unable to open the Care Agreement PDF right now. Please try again." });
    }
  }, [accessToken, isProvider]);
  const openCareAgreementLocalPdf = useCallback(async () => {
    if (!careAgreementPdfUrl || careAgreementDownloading) return;
    setCareAgreementDownloading(true);
    try {
      const localUri = `${FileSystem.cacheDirectory || ""}huddle-care-agreement-${Date.now()}.pdf`;
      if (!FileSystem.cacheDirectory) throw new Error("cache_directory_missing");
      const result = await FileSystem.downloadAsync(careAgreementPdfUrl, localUri, {
        headers: { Accept: "application/pdf" },
      });
      await Linking.openURL(result.uri);
    } catch (error) {
      console.warn("[native.service_care_agreement] local_open_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      setCarePopup({ title: "Care Agreement", body: "Unable to open the PDF on this device right now. Please try again." });
    } finally {
      setCareAgreementDownloading(false);
    }
  }, [careAgreementDownloading, careAgreementPdfUrl]);

  const loadCareHistoryRows = useCallback(async () => {
    // A cancelled/completed conversation deliberately has no active serviceChat.
    // History must still load the linked agreement snapshot for the same pair;
    // otherwise it falls back to the flattened terminal row and loses the frozen
    // Care Scope, terms and pet media.
    const historyAnchor = serviceChat || careHistoryRows.find((row) => (
      row.requester_id === userId || row.provider_id === userId
    )) || null;
    if (!historyAnchor || !userId) {
      if (!userId) setCareHistoryRows([]);
      return;
    }
    const requestSequence = ++careHistoryLoadSequenceRef.current;
    const cachedHistory = await readCachedServiceChatHistory(userId, sessionKey || null, roomId);
    if (requestSequence !== careHistoryLoadSequenceRef.current) return;
    if (cachedHistory.length > 0) setCareHistoryRows(cachedHistory);
    setCareHistoryLoading(cachedHistory.length === 0 && careHistoryRows.length === 0);
    try {
      const { data: historyRowData, error: historyRowError } = await withTimeout(
        supabase
          .from("service_chats")
          .select(SERVICE_CHAT_SELECT_FIELDS)
          .eq("requester_id", historyAnchor.requester_id)
          .eq("provider_id", historyAnchor.provider_id)
          .or("completed_at.not.is.null,status.eq.completed,status.eq.cancelled,care_status.eq.completed,care_status.eq.cancelled,disputed_at.not.is.null")
          .order("completed_at", { ascending: false, nullsFirst: false })
          .limit(20),
        12_000,
        "care_history_load_timeout",
      );
      if (historyRowError) throw historyRowError;
      const rawHistoryRows = (Array.isArray(historyRowData) ? historyRowData : []) as unknown as ServiceChatRow[];
      const historyIds = rawHistoryRows.map((item) => item.id).filter(Boolean);
      const [
        { data: historyDisputeRows, error: historyDisputeError },
        { data: historyAgreementRows, error: historyAgreementError },
      ] = historyIds.length > 0
        ? await withTimeout(Promise.all([
          supabase
            .from("service_disputes")
            .select("service_chat_id,status,final_provider_receives_amount,final_customer_refund_amount,executed_at,decision_at,updated_at")
            .in("service_chat_id", historyIds)
            .order("updated_at", { ascending: false }),
          supabase
            .from("service_care_agreements")
            .select("service_chat_id,status,agreement_version,booking_snapshot,requester_signed_at,provider_signed_at,pdf_path,pdf_generated_at,scope_version_id,scope_hash,payment_intent_id,payment_status")
            .in("service_chat_id", historyIds),
        ]), 12_000, "care_history_details_timeout")
        : [
          { data: [], error: null },
          { data: [], error: null },
        ];
      if (historyDisputeError) throw historyDisputeError;
      if (historyAgreementError) throw historyAgreementError;
      const disputeByServiceChatId = new Map<string, unknown>();
      for (const dispute of Array.isArray(historyDisputeRows) ? historyDisputeRows : []) {
        const serviceChatId = clean((dispute as { service_chat_id?: unknown }).service_chat_id);
        if (serviceChatId && !disputeByServiceChatId.has(serviceChatId)) disputeByServiceChatId.set(serviceChatId, dispute);
      }
      const agreementByServiceChatId = new Map<string, ServiceCareAgreementRecord>();
      for (const agreement of Array.isArray(historyAgreementRows) ? historyAgreementRows : []) {
        const serviceChatId = clean((agreement as { service_chat_id?: unknown }).service_chat_id);
        const parsed = serviceCareAgreementFromRow(agreement);
        if (serviceChatId && parsed) agreementByServiceChatId.set(serviceChatId, parsed);
      }
      if (requestSequence !== careHistoryLoadSequenceRef.current) return;
      const resolvedHistoryRows = rawHistoryRows.map((item) => frozenHistoryServiceChatRow({
        ...attachServiceDisputeResolution(item, disputeByServiceChatId.get(item.id) || null),
        care_agreement: agreementByServiceChatId.get(item.id) || null,
      }));
      setCareHistoryRows(resolvedHistoryRows);
      void writeCachedServiceChatHistory(userId, sessionKey || null, roomId, resolvedHistoryRows);
    } catch (error) {
      console.warn("[native.service_history] load_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      // Keep the last confirmed local snapshot visible when reconciliation fails.
    } finally {
      if (requestSequence === careHistoryLoadSequenceRef.current) setCareHistoryLoading(false);
    }
  }, [careHistoryRows, roomId, serviceChat, sessionKey, userId]);

  const closeCareHistory = useCallback(() => {
    // Ignore any in-flight history query before unmounting the sheet.
    careHistoryLoadSequenceRef.current += 1;
    setCareHistoryLoading(false);
    setCareHistoryOpen(false);
  }, []);

  const paymentHistoryDeepLinkHandledRef = useRef("");
  useEffect(() => {
    const exactServiceChatId = clean(params.historyService);
    if (!exactServiceChatId || !activeServiceResolved || paymentHistoryDeepLinkHandledRef.current === exactServiceChatId) return;
    paymentHistoryDeepLinkHandledRef.current = exactServiceChatId;
    void loadCareHistoryRows().finally(() => setCareHistoryOpen(true));
  }, [activeServiceResolved, loadCareHistoryRows, params.historyService]);

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
          providerDragY.stopAnimation();
          providerDragY.setValue(0);
          closeProviderProfile();
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
      setCareUpdateStatus(null);
      return;
    }
    const requestRoomId = roomId;
    const requestSessionKey = sessionKey || null;
    const requestServiceId = params.service || null;
    const requestSeq = ++loadSeqRef.current;
    if (!silent) setActiveServiceResolved(false);
    let paintedCachedMessages = false;
    const messageSnapshotPromise = fetchNativeChatDialogueSnapshot({ roomId: requestRoomId, limit: SERVICE_MESSAGE_PAGE_SIZE + 1, accessToken });
    if (!silent) {
      const [cachedRow, cachedMessages] = await Promise.all([
        readCachedServiceChatRow(userId, requestSessionKey, requestRoomId),
        readCachedNativeChatMessages(userId, requestRoomId, { accessChecked: true, sessionKey: requestSessionKey }),
      ]);
      let paintedCache = false;
      const cachedRowMatchesRoute = !requestServiceId || clean(cachedRow?.id) === requestServiceId;
      if (cachedRow && cachedRowMatchesRoute && isCurrentServiceChatRequest(requestRoomId, requestSessionKey) && requestSeq === loadSeqRef.current) {
        if (isActiveServiceChatRow(cachedRow)) {
          setServiceChat(cachedRow);
          paintedCache = true;
        } else {
          setServiceChat(null);
          await clearCachedServiceChatRow(userId, requestSessionKey, requestRoomId);
        }
      }
      if (cachedMessages.length > 0 && isCurrentServiceChatRequest(requestRoomId, requestSessionKey) && requestSeq === loadSeqRef.current) {
        hydrateServiceMessages(cachedMessages.map(nativeChatMessageToServiceRow), { replace: true, source: "cache" });
        paintedCachedMessages = true;
        paintedCache = true;
      }
      const hasVisibleContent = Boolean(serviceChatRef.current) || messagesRef.current.length > 0;
      if (isCurrentServiceChatRequest(requestRoomId, requestSessionKey) && requestSeq === loadSeqRef.current) setLoading(!paintedCache && !hasVisibleContent);
    }
    try {
      if (!isCurrentServiceChatRequest(requestRoomId, requestSessionKey) || requestSeq !== loadSeqRef.current) return;
      void messageSnapshotPromise.then((messageSnapshot) => {
        if (!isCurrentServiceChatRequest(requestRoomId, requestSessionKey) || requestSeq !== loadSeqRef.current) return;
        const newestRows = messageSnapshot.messages.map(nativeChatMessageToServiceRow).filter(Boolean);
        const nextMessages = newestRows.slice(Math.max(0, newestRows.length - SERVICE_MESSAGE_PAGE_SIZE));
        setHasOlderMessages(newestRows.length > SERVICE_MESSAGE_PAGE_SIZE);
        hydrateServiceMessages(nextMessages, {
          cacheRoomId: requestRoomId,
          cacheUserId: userId,
          replace: !silent,
          sessionKey: requestSessionKey,
          source: "db",
        });
        if (nextMessages.length > 0 && (forceScrollToLatestRef.current || nearBottomRef.current || messagesRef.current.length === 0)) {
          forceScrollToLatestRef.current = false;
          nearBottomRef.current = true;
          scrollServiceMessagesToLatest(false);
        }
        if (nextMessages.some((message) => message.sender_id !== userId)) {
          void markNativeChatRoomRead({ roomId: requestRoomId, userId, accessToken, sessionKey: requestSessionKey })
            .then(() => invalidateNativeChatReadCaches(userId))
            .catch((error) => console.warn("[native.service] mark_room_read_failed", error));
        }
        setLoading(false);
      }).catch((error) => console.warn("[native.service] initial_message_snapshot_failed", error));
      const { data: rowData, error: rowError } = await supabase
        .from("service_chats")
        .select(SERVICE_CHAT_SELECT_FIELDS)
        .eq("chat_id", requestRoomId)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(20);
      if (!isCurrentServiceChatRequest(requestRoomId, requestSessionKey) || requestSeq !== loadSeqRef.current) return;
      if (rowError) throw rowError;
      const serviceRows = (Array.isArray(rowData) ? rowData : []) as unknown as ServiceChatRow[];
      const serviceRowIds = serviceRows.map((item) => clean(item.id)).filter(Boolean);
      const { data: activeScopeRows, error: activeScopeRowsError } = serviceRowIds.length > 0
        ? await supabase
          .from("care_scope_versions")
          .select("service_chat_id")
          .in("service_chat_id", serviceRowIds)
          .eq("is_active", true)
        : { data: [], error: null };
      if (activeScopeRowsError) throw activeScopeRowsError;
      const activeScopeServiceChatIds = new Set(
        (Array.isArray(activeScopeRows) ? activeScopeRows : [])
          .map((item) => clean((item as { service_chat_id?: unknown }).service_chat_id))
          .filter(Boolean),
      );
      const row = selectServiceChatRowForRoute(serviceRows, activeScopeServiceChatIds, requestServiceId);
      if (!row) {
        setServiceChat(null);
        setActiveServiceResolved(true);
        setCareUpdateStatus(null);
        setHasReviewed(false);
        setSharedStartPin("");
        // With no active booking, every terminal card must still hydrate from
        // its frozen Care Scope agreement. The service row's compact booking
        // snapshot is intentionally not a history display source.
        const terminalRows = serviceRows.filter(isServiceChatHistoryMenuEligible);
        const terminalIds = terminalRows.map((item) => item.id).filter(Boolean);
        // A clean-slate chat has no active scope, but Book Care still needs the
        // current owner's pets and the carer's actual offered services. Previously
        // this branch returned before either was loaded, so the request form fell
        // back to the global service list and looked as though it was disconnected
        // from the owner's pet profile.
        const latestTerminalRow = terminalRows[0] || null;
        const cleanSlateProviderId = clean(latestTerminalRow?.provider_id)
          || clean(params.providerId || params.peerId);
        const cleanSlateCounterpartId = latestTerminalRow
          ? clean(latestTerminalRow.requester_id) === userId
            ? clean(latestTerminalRow.provider_id)
            : clean(latestTerminalRow.requester_id)
          : clean(params.peerId || params.providerId || selectedHandoffRow?.peerUserId);
        const [
          { data: cleanSlatePetRows },
          { data: cleanSlateCurrentProfileRow },
          cleanSlatePublicProfile,
          { data: cleanSlateProviderProfile },
        ] = await Promise.all([
          supabase
            .from("pets")
            .select("id,owner_id,name,species,breed,pet_size,gender,neutered_spayed,dob,weight,weight_unit,bio,routine,vet_contact,microchip_id,temperament,vet_visit_records,set_reminder,medications,photo_url,is_active,is_public,updated_at")
            .eq("owner_id", userId)
            .eq("is_active", true)
            .order("created_at", { ascending: true }),
          supabase
            .from("profiles")
            .select("display_name,location_country,phone,care_contact_number")
            .eq("id", userId)
            .maybeSingle(),
          cleanSlateCounterpartId
            ? fetchNativePublicProfile({
              accessToken,
              fallbackData: {
                id: cleanSlateCounterpartId,
                avatar_url: resolveRouteParamAvatarUrl(params.avatar),
                display_name: params.name || null,
              },
              sessionKey,
              profileUserId: cleanSlateCounterpartId,
              viewerId: userId,
            }).catch(() => null)
            : Promise.resolve(null),
          cleanSlateProviderId
            ? supabase
              .from("pet_care_profiles")
              .select("stripe_payout_status,stripe_account_id,skills,rates,services_offered,location_styles,area_name,area_country,area_lat,area_lng,currency,preferred_meetup_areas")
              .eq("user_id", cleanSlateProviderId)
              .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        if (!isCurrentServiceChatRequest(requestRoomId, requestSessionKey) || requestSeq !== loadSeqRef.current) return;
        setPets(((cleanSlatePetRows || []) as PetOption[]).filter(Boolean));
        setCurrentDisplayName(clean((cleanSlateCurrentProfileRow as { display_name?: unknown } | null)?.display_name));
        setCurrentUserPhone(clean((cleanSlateCurrentProfileRow as { care_contact_number?: unknown; phone?: unknown } | null)?.care_contact_number) || clean((cleanSlateCurrentProfileRow as { phone?: unknown } | null)?.phone));
        setCurrentUserCountry(clean((cleanSlateCurrentProfileRow as { location_country?: unknown } | null)?.location_country) || null);
        const cleanSlateProviderRecord = cleanSlateProviderProfile as Record<string, unknown> | null;
        const cleanSlateRateRows = parseProviderRateRows(cleanSlateProviderRecord?.rates);
        const hasExplicitCleanSlateRates = cleanSlateRateRows.length > 0;
        let cleanSlateProviderServices = parseProviderRateServices(cleanSlateRateRows, cleanSlateProviderRecord?.services_offered);
        const cleanSlateMeetupAreas = normalizeCareLocationAreas(cleanSlateProviderRecord?.preferred_meetup_areas);
        let cleanSlateServiceCurrencies = nativeCarerServiceCurrencies(
          clean(cleanSlateProviderRecord?.area_country),
          cleanSlateMeetupAreas.map((area) => area.country),
        );
        const asCoordinate = (value: unknown) => {
          const coordinate = Number(value);
          return Number.isFinite(coordinate) && coordinate !== 0 ? coordinate : null;
        };
        let cleanSlateServiceAreas: NativeCareServiceArea[] = [
          ...(clean(cleanSlateProviderRecord?.area_country) || asCoordinate(cleanSlateProviderRecord?.area_lat)
            ? [{
              country: clean(cleanSlateProviderRecord?.area_country),
              lat: asCoordinate(cleanSlateProviderRecord?.area_lat),
              lng: asCoordinate(cleanSlateProviderRecord?.area_lng),
            }]
            : []),
          ...cleanSlateMeetupAreas.map((area) => ({ country: area.country, lat: area.lat, lng: area.lng })),
        ];
        if (cleanSlateProviderServices.length === 0 && cleanSlateProviderId && accessToken) {
          const providerDetail = await fetchNativeServiceProviderDetail({
            accessToken,
            cacheWriteGuard: () => isCurrentServiceChatRequest(requestRoomId, requestSessionKey) && requestSeq === loadSeqRef.current,
            providerUserId: cleanSlateProviderId,
            sessionKey: requestSessionKey,
            userId,
          }).catch(() => null);
          if (!isCurrentServiceChatRequest(requestRoomId, requestSessionKey) || requestSeq !== loadSeqRef.current) return;
          if (providerDetail?.servicesOffered?.length) cleanSlateProviderServices = providerDetail.servicesOffered.map(clean).filter(Boolean);
          if (cleanSlateServiceCurrencies.length === 0 && providerDetail) {
            cleanSlateServiceCurrencies = nativeCarerServiceCurrencies(
              providerDetail.areaCountry,
              providerDetail.preferredMeetupAreas.map((area) => area.country),
            );
          }
          if (cleanSlateServiceAreas.length === 0 && providerDetail) {
            cleanSlateServiceAreas = [
              ...(clean(providerDetail.areaCountry) || asCoordinate((providerDetail as { areaLat?: unknown }).areaLat)
                ? [{
                  country: clean(providerDetail.areaCountry),
                  lat: asCoordinate((providerDetail as { areaLat?: unknown }).areaLat),
                  lng: asCoordinate((providerDetail as { areaLng?: unknown }).areaLng),
                }]
                : []),
              ...providerDetail.preferredMeetupAreas.map((area) => ({ country: area.country, lat: area.lat, lng: area.lng })),
            ];
          }
        }
        if (cleanSlateCounterpartId) {
          setCounterpart({
            id: cleanSlateCounterpartId,
            displayName: clean(cleanSlatePublicProfile?.displayName) || clean(params.name) || "Care chat",
            avatarUrl: cleanSlatePublicProfile?.resolvedPhotoUrls.cover || resolveRouteParamAvatarUrl(params.avatar),
            updatedAt: clean(cleanSlatePublicProfile?.updatedAt) || null,
            stripePayoutStatus: clean(cleanSlateProviderRecord?.stripe_payout_status) || null,
            stripeAccountId: clean(cleanSlateProviderRecord?.stripe_account_id) || null,
            skills: normalizeServiceSkillLabels(cleanSlateProviderRecord?.skills),
            providerServices: cleanSlateProviderServices,
            providerLocationStyles: Array.isArray(cleanSlateProviderRecord?.location_styles) ? (cleanSlateProviderRecord.location_styles as string[]).map(clean).filter(Boolean) : [],
            providerAreaName: clean(cleanSlateProviderRecord?.area_name),
            providerCurrency: clean(cleanSlateProviderRecord?.currency),
            providerHasPaidRates: hasExplicitCleanSlateRates ? hasPaidNativeRateRows(cleanSlateRateRows) : true,
            providerHasVoluntaryRates: hasExplicitCleanSlateRates ? hasVoluntaryNativeRateRows(cleanSlateRateRows) : false,
            providerVolunteerOnly: hasExplicitCleanSlateRates ? isVolunteerOnlyNativeRateRows(cleanSlateRateRows) : false,
            providerCountry: clean(cleanSlatePublicProfile?.locationName) || null,
            providerServiceSearchCountry: clean(cleanSlateProviderRecord?.area_country) || clean(cleanSlatePublicProfile?.locationCountry) || null,
            providerAreaCountry: clean(cleanSlateProviderRecord?.area_country) || null,
            providerProfileCountry: clean(cleanSlatePublicProfile?.locationCountry) || null,
            providerServiceCurrencies: cleanSlateServiceCurrencies,
            providerServiceAreas: cleanSlateServiceAreas,
          });
        }
        const { data: terminalAgreementRows, error: terminalAgreementError } = terminalIds.length > 0
          ? await withTimeout(
            supabase
              .from("service_care_agreements")
              .select("service_chat_id,status,agreement_version,booking_snapshot,requester_signed_at,provider_signed_at,pdf_path,pdf_generated_at,scope_version_id,scope_hash,payment_intent_id,payment_status")
              .in("service_chat_id", terminalIds),
            12_000,
            "care_history_agreements_timeout",
          )
          : { data: [], error: null };
        if (!isCurrentServiceChatRequest(requestRoomId, requestSessionKey) || requestSeq !== loadSeqRef.current) return;
        if (terminalAgreementError) throw terminalAgreementError;
        const terminalAgreementByServiceId = new Map<string, ServiceCareAgreementRecord>();
        for (const agreement of Array.isArray(terminalAgreementRows) ? terminalAgreementRows : []) {
          const serviceChatId = clean((agreement as { service_chat_id?: unknown }).service_chat_id);
          const parsed = serviceCareAgreementFromRow(agreement);
          if (serviceChatId && parsed) terminalAgreementByServiceId.set(serviceChatId, parsed);
        }
        const resolvedTerminalRows = terminalRows.map((item) => frozenHistoryServiceChatRow({
          ...item,
          care_agreement: terminalAgreementByServiceId.get(item.id) || null,
        }));
        setCareHistoryRows(resolvedTerminalRows);
        void writeCachedServiceChatHistory(userId, requestSessionKey, requestRoomId, resolvedTerminalRows);
        await clearCachedServiceChatRow(userId, requestSessionKey, requestRoomId);
        const messageSnapshot = await messageSnapshotPromise;
        if (!isCurrentServiceChatRequest(requestRoomId, requestSessionKey) || requestSeq !== loadSeqRef.current) return;
        const newestRows = messageSnapshot.messages.map(nativeChatMessageToServiceRow).filter(Boolean);
        setHasOlderMessages(newestRows.length > SERVICE_MESSAGE_PAGE_SIZE);
        setLoading(false);
        return;
      }
      const [{ data: disputeRows }, { data: agreementRow }, { data: careScopeSummary }, { data: currentCareScopeVersion }] = await Promise.all([
        supabase
        .from("service_disputes")
        .select("status,filed_by,final_provider_receives_amount,final_customer_refund_amount,executed_at,decision_at,updated_at")
        .eq("service_chat_id", row.id)
        .order("updated_at", { ascending: false })
          .limit(10),
        supabase
          .from("service_care_agreements")
          .select("status,agreement_version,booking_snapshot,requester_signed_at,provider_signed_at,pdf_path,pdf_generated_at,scope_version_id,scope_hash,payment_intent_id,payment_status")
          .eq("service_chat_id", row.id)
          .maybeSingle(),
        supabase.rpc("current_care_scope_summary", { p_service_chat_id: row.id }),
        supabase
          .from("care_scope_versions")
          .select("care_details")
          .eq("service_chat_id", row.id)
          .eq("is_active", true)
          .maybeSingle(),
      ]);
      if (!isCurrentServiceChatRequest(requestRoomId, requestSessionKey) || requestSeq !== loadSeqRef.current) return;
      const disputeList = Array.isArray(disputeRows) ? disputeRows : [];
      const latestDisputeRow = disputeList[0] ?? null;
      setHasReportedServiceDispute(disputeList.some((item) => clean((item as { filed_by?: unknown }).filed_by) === userId));
      const resolvedCareScope = careScopeSummaryFromRpc(careScopeSummary);
      const resolvedRow = {
        ...attachServiceDisputeResolution(row, latestDisputeRow),
        care_agreement: serviceCareAgreementFromRow(agreementRow),
        care_scope: resolvedCareScope
          ? { ...resolvedCareScope, careDetails: normalizeCareScopeCareDetails((currentCareScopeVersion as { care_details?: unknown } | null)?.care_details) }
          : null,
      };
      setServiceChat(resolvedRow);
      setActiveServiceResolved(true);
      // A prepared owner PIN exists before the owner authorizes Start Care.
      // Keep it through both handoff states; only a terminal/in-progress row
      // may clear this booking-scoped display value.
      if (!["awaiting_handoff", "pin_shared"].includes(clean(resolvedRow.care_status))) setSharedStartPin("");
      void writeCachedServiceChatRow(userId, requestSessionKey, resolvedRow);
      if (!silent && !paintedCachedMessages) {
        const cachedMessages = await readCachedNativeChatMessages(userId, requestRoomId, { accessChecked: true, sessionKey: requestSessionKey });
        if (cachedMessages.length > 0 && isCurrentServiceChatRequest(requestRoomId, requestSessionKey) && requestSeq === loadSeqRef.current) {
          hydrateServiceMessages(cachedMessages.map(nativeChatMessageToServiceRow), { replace: true, source: "cache" });
          setLoading(false);
        }
      }
      const [messageSnapshot, { data: petRows }, { data: reviewRow }, { data: currentProfileRow }, { data: careUpdateStatusData }, fallbackLocation] = await Promise.all([
        messageSnapshotPromise,
        supabase.from("pets").select("id,owner_id,name,species,breed,pet_size,gender,neutered_spayed,dob,weight,weight_unit,bio,routine,vet_contact,microchip_id,temperament,vet_visit_records,set_reminder,medications,photo_url,is_active,is_public,updated_at").eq("owner_id", userId).eq("is_active", true).order("created_at", { ascending: true }),
        resolvedRow.status === "completed" && (resolvedRow.requester_id === userId || resolvedRow.provider_id === userId)
          ? supabase.from("service_reviews").select("id").eq("service_chat_id", row.id).eq("reviewer_id", userId).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("profiles").select("display_name,location_country,phone,care_contact_number").eq("id", userId).maybeSingle(),
        supabase.rpc("get_service_care_update_status_by_service_id", { p_service_chat_id: row.id }),
        nativeExactTokenRpc<Record<string, unknown>>("get_app_location_fallback", {}, accessToken).catch(() => ({ data: null, error: null })),
      ]);
      if (!isCurrentServiceChatRequest(requestRoomId, requestSessionKey) || requestSeq !== loadSeqRef.current) return;
      const newestRows = messageSnapshot.messages.map(nativeChatMessageToServiceRow).filter(Boolean);
      const nextMessages = newestRows.slice(Math.max(0, newestRows.length - SERVICE_MESSAGE_PAGE_SIZE));
      setCareUpdateStatus(careUpdateStatusData && typeof careUpdateStatusData === "object" ? careUpdateStatusData as NativeCareUpdateStatus : null);
      const previewUrls = Array.from(new Set(nextMessages
        .map((message) => {
          const parsed = parseServiceMessage(message.content);
          return parsed.linkPreviewUrl || extractNativeSocialFirstHttpUrl(parsed.text || "");
        })
        .filter((url): url is string => typeof url === "string" && url.length > 0 && !linkPreviewsRef.current[url] && !linkPreviewRequestsRef.current.has(url))));
      if (previewUrls.length > 0) {
        previewUrls.forEach((url) => linkPreviewRequestsRef.current.add(url));
        void fetchNativeSocialLinkPreviews(previewUrls, accessToken)
          .then((previews) => {
            if (isCurrentServiceChatRequest(requestRoomId, requestSessionKey) && requestSeq === loadSeqRef.current) {
              setLinkPreviews((current) => ({ ...current, ...previews }));
            }
          })
          .finally(() => {
            previewUrls.forEach((url) => linkPreviewRequestsRef.current.delete(url));
          });
      }
      setPets(((petRows || []) as PetOption[]).filter(Boolean));
      setHasReviewed(reviewedServiceIdsRef.current.has(clean(row.id)) || Boolean((reviewRow as { id?: string } | null)?.id));
      setCurrentDisplayName(clean((currentProfileRow as { display_name?: unknown } | null)?.display_name));
      setCurrentUserPhone(clean((currentProfileRow as { care_contact_number?: unknown; phone?: unknown } | null)?.care_contact_number) || clean((currentProfileRow as { phone?: unknown } | null)?.phone));
      setCurrentUserCountry(clean(fallbackLocation.data?.country) || clean((currentProfileRow as { location_country?: unknown } | null)?.location_country) || null);
      const counterpartId = row.requester_id === userId ? row.provider_id : row.requester_id;
      if (counterpartId) {
        const [publicProfile, { data: pcpRow }, { data: blockRows }] = await Promise.all([
          fetchNativePublicProfile({
            accessToken,
            fallbackData: {
              id: counterpartId,
              avatar_url: resolveRouteParamAvatarUrl(params.avatar),
              display_name: params.name || null,
            },
            sessionKey,
            profileUserId: counterpartId,
            viewerId: userId,
          }).catch(() => null),
          supabase.from("pet_care_profiles").select("stripe_payout_status,stripe_account_id,skills,rates,services_offered,location_styles,area_name,area_country,area_lat,area_lng,currency,preferred_meetup_areas").eq("user_id", row.provider_id).maybeSingle(),
          supabase.from("user_blocks").select("blocker_id,blocked_id").or(`and(blocker_id.eq.${userId},blocked_id.eq.${counterpartId}),and(blocker_id.eq.${counterpartId},blocked_id.eq.${userId})`).limit(1),
        ]);
        const blockRelation = Array.isArray(blockRows) && blockRows.length > 0 ? blockRows[0] as Record<string, unknown> : null;
        if (blockRelation?.blocker_id === userId && blockRelation?.blocked_id === counterpartId) setBlockState("blocked_by_me");
        else if (blockRelation?.blocker_id === counterpartId && blockRelation?.blocked_id === userId) setBlockState("blocked_by_them");
        else setBlockState("none");
        const providerRateRows = parseProviderRateRows((pcpRow as Record<string, unknown> | null)?.rates);
        const hasExplicitRates = providerRateRows.length > 0;
        let providerServices = parseProviderRateServices(providerRateRows, (pcpRow as Record<string, unknown> | null)?.services_offered);
        let providerServiceCurrencies = nativeCarerServiceCurrencies(
          clean((pcpRow as Record<string, unknown> | null)?.area_country),
          normalizeCareLocationAreas((pcpRow as Record<string, unknown> | null)?.preferred_meetup_areas).map((area) => area.country),
        );
        const toAreaNum = (value: unknown) => { const n = Number(value); return Number.isFinite(n) && n !== 0 ? n : null; };
        const buildServiceAreas = (areaCountry: unknown, areaLat: unknown, areaLng: unknown, meetups: NativeCareServiceArea[]): NativeCareServiceArea[] => {
          const base: NativeCareServiceArea[] = clean(areaCountry) || toAreaNum(areaLat)
            ? [{ country: clean(areaCountry), lat: toAreaNum(areaLat), lng: toAreaNum(areaLng) }]
            : [];
          return [...base, ...meetups];
        };
        let providerServiceAreas = buildServiceAreas(
          (pcpRow as Record<string, unknown> | null)?.area_country,
          (pcpRow as Record<string, unknown> | null)?.area_lat,
          (pcpRow as Record<string, unknown> | null)?.area_lng,
          normalizeCareLocationAreas((pcpRow as Record<string, unknown> | null)?.preferred_meetup_areas).map((area) => ({ country: area.country, lat: area.lat, lng: area.lng })),
        );
        if (providerServices.length === 0 && accessToken) {
          const providerDetail = await fetchNativeServiceProviderDetail({
            accessToken,
            cacheWriteGuard: () => isCurrentServiceChatRequest(requestRoomId, requestSessionKey) && requestSeq === loadSeqRef.current,
            providerUserId: row.provider_id,
            sessionKey: requestSessionKey,
            userId,
          }).catch(() => null);
          if (!isCurrentServiceChatRequest(requestRoomId, requestSessionKey) || requestSeq !== loadSeqRef.current) return;
          if (providerDetail?.servicesOffered?.length) providerServices = providerDetail.servicesOffered.map(clean).filter(Boolean);
          if (providerServiceCurrencies.length === 0 && providerDetail) {
            providerServiceCurrencies = nativeCarerServiceCurrencies(
              providerDetail.areaCountry,
              providerDetail.preferredMeetupAreas.map((area) => area.country),
            );
          }
          if (providerServiceAreas.length === 0 && providerDetail) {
            providerServiceAreas = buildServiceAreas(
              providerDetail.areaCountry,
              (providerDetail as { areaLat?: unknown }).areaLat,
              (providerDetail as { areaLng?: unknown }).areaLng,
              providerDetail.preferredMeetupAreas.map((area) => ({ country: area.country, lat: area.lat, lng: area.lng })),
            );
          }
        }
        setCounterpart({
          id: counterpartId,
          displayName: clean(publicProfile?.displayName) || clean(params.name) || "Care chat",
          avatarUrl: publicProfile?.resolvedPhotoUrls.cover || resolveRouteParamAvatarUrl(params.avatar),
          updatedAt: clean(publicProfile?.updatedAt) || null,
          stripePayoutStatus: clean((pcpRow as Record<string, unknown> | null)?.stripe_payout_status) || null,
          stripeAccountId: clean((pcpRow as Record<string, unknown> | null)?.stripe_account_id) || null,
          skills: normalizeServiceSkillLabels((pcpRow as Record<string, unknown> | null)?.skills),
          providerServices,
          providerLocationStyles: Array.isArray((pcpRow as Record<string, unknown> | null)?.location_styles) ? ((pcpRow as Record<string, unknown>).location_styles as string[]).map(clean).filter(Boolean) : [],
          providerAreaName: clean((pcpRow as Record<string, unknown> | null)?.area_name),
          providerCurrency: clean((pcpRow as Record<string, unknown> | null)?.currency),
          providerHasPaidRates: hasExplicitRates ? hasPaidNativeRateRows(providerRateRows) : true,
          providerHasVoluntaryRates: hasExplicitRates ? hasVoluntaryNativeRateRows(providerRateRows) : false,
          providerVolunteerOnly: hasExplicitRates ? isVolunteerOnlyNativeRateRows(providerRateRows) : false,
          providerCountry: clean(publicProfile?.locationName) || null,
          // Search scope must be an actual COUNTRY. area_country is empty whenever the
          // carer typed their area instead of picking a result (and on seeded carers),
          // so fall back to the carer's real location_country — never location_name,
          // which is a district ("Royal Wharf, London") and zeroes out the search.
          providerServiceSearchCountry: clean((pcpRow as Record<string, unknown> | null)?.area_country) || clean(publicProfile?.locationCountry) || null,
          // Split signals for the care-currency chain (service location → provider profile).
          providerAreaCountry: clean((pcpRow as Record<string, unknown> | null)?.area_country) || null,
          providerProfileCountry: clean(publicProfile?.locationCountry) || null,
          // The carer's selectable currency set — derived from their service areas (Carer's
          // Place country + each preferred meetup area country). One entry ⇒ fixed currency;
          // 2+ ⇒ the provider may pick when editing scope (default = service location).
          providerServiceCurrencies,
          providerServiceAreas,
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
          const nextChatId = await createNativeServiceChat(providerId, { accessToken, sessionKey, userId });
          if (nextChatId !== requestRoomId) {
            onNavigate(`/service-chat?room=${encodeURIComponent(nextChatId)}&request=1&returnTo=${encodeURIComponent(params.returnTo || "/chats?tab=service")}`);
            return;
          }
          await loadRef.current(false);
          return;
        } catch {
          // Fall through to the public-safe popup below.
        }
      }
      setCarePopup({ title: "huddle Care", body: SERVICE_CHAT_START_ERROR_COPY });
    } finally {
      if (!silent && isCurrentServiceChatRequest(requestRoomId, requestSessionKey) && requestSeq === loadSeqRef.current) setLoading(false);
    }
  }, [accessToken, hydrateServiceMessages, isCurrentServiceChatRequest, onNavigate, params.avatar, params.name, params.peerId, params.providerId, params.returnTo, params.service, roomId, scrollServiceMessagesToLatest, selectedHandoffRow?.peerUserId, sessionKey, userId]);
  loadRef.current = load;

  const loadOlderServiceMessages = useCallback(async () => {
    if (!roomId || !hasOlderMessages || loadingOlderMessagesRef.current) return;
    const oldestMessage = messagesRef.current[0];
    if (!oldestMessage?.created_at) return;
    const requestRoomId = roomId;
    const requestSessionKey = sessionKey || null;
    loadingOlderMessagesRef.current = true;
    setLoadingOlderMessages(true);
    try {
      const snapshot = await fetchNativeChatDialogueSnapshot({
        accessToken,
        beforeCreatedAt: oldestMessage.created_at,
        limit: SERVICE_MESSAGE_PAGE_SIZE + 1,
        roomId: requestRoomId,
      });
      if (!isCurrentServiceChatRequest(requestRoomId, requestSessionKey)) return;
      const olderRows = snapshot.messages.map(nativeChatMessageToServiceRow).filter(Boolean);
      setHasOlderMessages(olderRows.length > SERVICE_MESSAGE_PAGE_SIZE);
      const olderMessages = olderRows.slice(Math.max(0, olderRows.length - SERVICE_MESSAGE_PAGE_SIZE));
      if (olderMessages.length > 0) {
        hydrateServiceMessages(olderMessages, {
          cacheRoomId: requestRoomId,
          cacheUserId: userId,
          sessionKey: requestSessionKey,
          source: "db",
        });
      }
    } catch (error) {
      console.warn("[native.service] load_older_messages_failed", error);
      if (isCurrentServiceChatRequest(requestRoomId, requestSessionKey)) setNotice("Unable to load older messages.");
    } finally {
      loadingOlderMessagesRef.current = false;
      setLoadingOlderMessages(false);
    }
  }, [accessToken, hasOlderMessages, hydrateServiceMessages, isCurrentServiceChatRequest, roomId, sessionKey, userId]);

  const scheduleRealtimeCareRefresh = useCallback((targetRoomId: string, targetSessionKey: string | null, reason: string) => {
    if (!userId || !isCurrentServiceChatRequest(targetRoomId, targetSessionKey)) return;
    if (realtimeCareRefreshTimerRef.current) return;
    realtimeCareRefreshTimerRef.current = setTimeout(() => {
      realtimeCareRefreshTimerRef.current = null;
      if (!isCurrentServiceChatRequest(targetRoomId, targetSessionKey)) return;
      if (__DEV__) console.debug("[native.service_chat] realtime_refresh", { reason, roomId: targetRoomId });
      void invalidateNativeChatReadCaches(userId);
      // Reconcile silently over the visible/cache-backed model. Clearing first
      // creates a blank cold reopen if this validation is slow or offline.
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
    const freshAccessToken = await getFreshNativeAccessToken(accessToken);
    const activeServiceChatId = clean(serviceChatRef.current?.id);
    if (!activeServiceChatId || !freshAccessToken || !userId || !checkoutSessionId) return false;
    const { data, error } = await withTimeout(supabase.functions.invoke("confirm-service-payment", {
      headers: await createFreshNativeFunctionHeaders(freshAccessToken),
      body: {
        service_chat_id: activeServiceChatId,
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
    await AsyncStorage.removeItem(pendingServicePaymentKey(userId, roomId, serviceChatRef.current?.id)).catch(() => undefined);
    await AsyncStorage.removeItem(legacyPendingServicePaymentKey(userId, roomId)).catch(() => undefined);
    setNotice(null);
    await load(true);
    return true;
  }, [accessToken, load, roomId, userId]);

  const confirmPendingServicePayment = useCallback(async (source: string) => {
    if (!roomId || !userId) return false;
    if (!serviceChatRef.current) return false;
    if (isNoChargeServiceChat(serviceChatRef.current)) {
      await AsyncStorage.removeItem(pendingServicePaymentKey(userId, roomId, serviceChatRef.current?.id)).catch(() => undefined);
      await AsyncStorage.removeItem(legacyPendingServicePaymentKey(userId, roomId)).catch(() => undefined);
      return false;
    }
    const activePaymentKey = pendingServicePaymentKey(userId, roomId, serviceChatRef.current?.id);
    const raw = await AsyncStorage.getItem(activePaymentKey).catch(() => null);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as { checkoutSessionId?: unknown; savedAt?: unknown };
      const checkoutSessionId = clean(parsed.checkoutSessionId);
      if (!checkoutSessionId) {
        await AsyncStorage.removeItem(activePaymentKey).catch(() => undefined);
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
    if (!serviceChatRef.current) return;
    if (isNoChargeServiceChat(serviceChatRef.current)) {
      if (userId) void AsyncStorage.removeItem(pendingServicePaymentKey(userId, roomId, serviceChatRef.current?.id)).catch(() => undefined);
      return;
    }
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
          title: "huddle Care",
          body: await safePaymentErrorMessage(error, "Payment completed, but huddle could not confirm the booking yet. Please reopen this chat in a moment."),
        });
        await load(true);
      }
    })();
  }, [accessToken, confirmServicePayment, load, params.checkoutSessionId, params.paid, roomId, serviceChat?.id, serviceChat?.quote_card, userId]);

  useEffect(() => {
    if (isNoChargeServiceChat(serviceChat) && roomId && userId) {
      void AsyncStorage.removeItem(pendingServicePaymentKey(userId, roomId, serviceChat?.id)).catch(() => undefined);
      void AsyncStorage.removeItem(legacyPendingServicePaymentKey(userId, roomId)).catch(() => undefined);
    }
  }, [roomId, serviceChat, userId]);

  useEffect(() => {
    if (status !== "pending" && roomId && userId) {
      void AsyncStorage.removeItem(pendingServicePaymentKey(userId, roomId, serviceChat?.id)).catch(() => undefined);
      void AsyncStorage.removeItem(legacyPendingServicePaymentKey(userId, roomId)).catch(() => undefined);
    }
  }, [roomId, serviceChat?.id, status, userId]);

  useEffect(() => {
    if (!roomId || !userId) return;
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
  }, [accessToken, confirmPendingServicePayment, load, roomId, serviceChat?.id, serviceChat?.quote_card, userId]);

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
            scheduleRealtimeCareRefresh(subscriptionRoomId, subscriptionSessionKey, kind);
          } else if (kind === "service_disputed" || kind === "service_issue_reported") {
            void invalidateNativeChatReadCaches(userId);
            scheduleRealtimeCareRefresh(subscriptionRoomId, subscriptionSessionKey, kind);
          } else if (kind === "service_no_start_cancelled" || kind === "service_booking_cancelled") {
            // The terminal service row is authoritative. Clear the active mirror and
            // validate immediately so a cached Booked/PIN surface cannot outlive it.
            void invalidateNativeChatReadCaches(userId);
            void clearCachedServiceChatRow(userId, subscriptionSessionKey, subscriptionRoomId);
            setSharedStartPin("");
            scheduleRealtimeCareRefresh(subscriptionRoomId, subscriptionSessionKey, kind);
          }
          if (messagesRef.current.some((message) => message.id === mapped.id)) return;
          hydrateServiceMessages([mapped], {
            cacheRoomId: subscriptionRoomId,
            cacheUserId: userId,
            sessionKey: subscriptionSessionKey,
            source: "realtime",
          });
          if (nearBottomRef.current || forceScrollToLatestRef.current) {
            forceScrollToLatestRef.current = false;
            setTimeout(() => {
              if (isCurrentRealtimeSubscription()) scrollServiceMessagesToLatest(true);
            }, 80);
          }
        }),
      (status, error) => {
        if (__DEV__) console.debug("[native.service_chat] realtime_messages_status", { status, roomId: subscriptionRoomId, error: error ? String(error) : null });
      },
    );
    return () => {
      void messageHandle.dispose();
    };
  }, [hydrateServiceMessages, isCurrentServiceChatRequest, roomId, scheduleRealtimeCareRefresh, scrollServiceMessagesToLatest, sessionKey, userId]);

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
    // One-shot per room. Never re-open on subsequent renders (e.g. while `hasRequest`
    // catches up after a send) — a persisted `?request=1` param previously re-opened
    // the sheet behind itself, whose backdrop swallowed every tap until app restart.
    if (autoOpenedRequestRef.current === roomId) return;
    autoOpenedRequestRef.current = roomId;
    setActiveSheet("request");
  }, [hasRequest, isRequester, roomId, serviceChat]);

  // Carer opens a pending chat with a fresh request and no quote yet: auto-open
  // Update Care Scope once so they can review and respond. Mirrors the requester
  // auto-open (one-shot per room ref). Never auto-opens an expired request — the
  // "Review request" Care Status CTA stays available as the manual fallback.
  useEffect(() => {
    if (!roomId || !userId) return;
    setAutoOpenQuoteDismissHydrated(false);
    autoOpenQuoteDismissedVersionRef.current = null;
    void AsyncStorage.getItem(autoOpenQuoteDismissKey(userId, roomId))
      .then((value) => { autoOpenQuoteDismissedVersionRef.current = value || null; })
      .catch(() => undefined)
      .finally(() => setAutoOpenQuoteDismissHydrated(true));
  }, [roomId, userId]);

  useEffect(() => {
    if (!serviceChat || !isProvider || !hasRequest || hasQuote || pendingRequestExpired) return;
    if (!autoOpenQuoteDismissHydrated) return;
    if (autoOpenedQuoteRef.current === roomId) return;
    // Respect a prior dismissal/interaction for this scope version (persisted).
    const scopeVersionId = serviceChat.care_scope?.scopeVersionId || serviceChat.request_sent_at || "v0";
    if (autoOpenQuoteDismissedVersionRef.current === scopeVersionId) return;
    autoOpenedQuoteRef.current = roomId;
    setActiveSheet("quote");
  }, [autoOpenQuoteDismissHydrated, hasQuote, hasRequest, isProvider, pendingRequestExpired, roomId, serviceChat]);

  const dismissQuoteAutoOpen = useCallback(() => {
    if (!roomId || !userId || !isProvider || hasQuote) return;
    const scopeVersionId = serviceChatRef.current?.care_scope?.scopeVersionId || serviceChatRef.current?.request_sent_at || "v0";
    autoOpenQuoteDismissedVersionRef.current = scopeVersionId;
    void AsyncStorage.setItem(autoOpenQuoteDismissKey(userId, roomId), scopeVersionId).catch(() => undefined);
  }, [hasQuote, isProvider, roomId, userId]);

  const rpcVoid = useCallback(async (fn: string, paramsPayload: Record<string, unknown>, fallback: string) => {
    setSending(true);
    try {
      const { error } = await supabase.rpc(fn, paramsPayload);
      if (error) throw error;
    } catch (error) {
      setCarePopup({ title: "huddle Care", body: safeCareErrorMessage(error, fallback) });
      throw error;
    } finally {
      setSending(false);
    }
    // Refresh in the background so mutation sheets/buttons never hang.
    void load(true);
  }, [load]);

  const sendRequest = useCallback(async (card: ServiceRequestCard) => {
    if (status !== "pending") {
      setCarePopup({ title: "huddle Care", body: "This booking is confirmed, so the care details are now read-only." });
      return Promise.reject(new Error("booking_details_read_only"));
    }
    haptic.primaryConfirm();
    setSending(true);
    try {
      const activeServiceChatId = clean(serviceChatRef.current?.id);
      const { error } = activeServiceChatId
        ? await supabase.rpc("create_care_scope_counterproposal", { p_service_chat_id: activeServiceChatId, p_request_card: card })
        : await supabase.rpc("send_service_request", { p_chat_id: roomId, p_request_card: card });
      if (error) throw error;
    } catch (error) {
      setCarePopup({ title: "huddle Care", body: safeCareErrorMessage(error, "Unable to send your request. Please try again.") });
      throw error;
    } finally {
      setSending(false);
    }
    await load(true);
  }, [load, roomId, status]);
  const sendRequestFromSheet = useCallback(async (card: ServiceRequestCard) => {
    if (!requestSheetStartsFresh) {
      return sendRequest(card);
    }
    // Clean slate intentionally has no active service row. The pair's hydrated
    // carer context is the authoritative provider for creating the next row.
    const newBookingProviderId = clean(serviceChat?.provider_id) || clean(counterpart?.id);
    if (!newBookingProviderId || !accessToken || !userId) {
      setCarePopup({ title: "huddle Care", body: "Unable to start a new booking from this chat. Please try again from the carer profile." });
      throw new Error("new_booking_missing_provider_or_session");
    }
    haptic.primaryConfirm();
    setSending(true);
    try {
      const nextChatId = await createNativeServiceChat(newBookingProviderId, { accessToken, sessionKey, userId });
      const { error } = await supabase.rpc("send_service_request", { p_chat_id: nextChatId, p_request_card: card });
      if (error) throw error;
      await markNativeServiceTabHasDialogues(userId);
      await invalidateNativeChatReadCaches(userId);
      await invalidateNativeServiceProviderCaches(userId);
      setActiveSheet(null);
      setRequestSheetMode("current");
      if (nextChatId !== roomId) {
        onNavigate(`/service-chat?room=${encodeURIComponent(nextChatId)}&returnTo=${encodeURIComponent(params.returnTo || "/chats?tab=service")}`);
        return;
      }
      await load(true);
    } catch (error) {
      setCarePopup({ title: "huddle Care", body: safeCareErrorMessage(error, "Unable to start a new booking.") });
      throw error;
    } finally {
      setSending(false);
    }
  }, [accessToken, counterpart?.id, load, onNavigate, params.returnTo, requestSheetStartsFresh, roomId, sendRequest, serviceChat?.provider_id, sessionKey, userId]);
  const sendQuote = useCallback((card: ServiceQuoteCard) => {
    if (status !== "pending") {
      setCarePopup({ title: "huddle Care", body: "This booking is confirmed, so the care details are now read-only." });
      return Promise.reject(new Error("booking_details_read_only"));
    }
    haptic.primaryConfirm();
    if (!serviceChat?.id) return Promise.reject(new Error("service_chat_missing"));
    return rpcVoid("create_care_scope_counterproposal", { p_service_chat_id: serviceChat.id, p_quote_card: card }, "Unable to send care scope.");
  }, [rpcVoid, serviceChat?.id, status]);
  const updateOwnerCareDetails = useCallback((careDetails: CareScopeCareDetails) => {
    if (status !== "pending") {
      setCarePopup({ title: "huddle Care", body: "This booking is confirmed, so the care details are now read-only." });
      return Promise.reject(new Error("booking_details_read_only"));
    }
    haptic.primaryConfirm();
    if (!serviceChat?.id) return Promise.reject(new Error("service_chat_missing"));
    return rpcVoid("update_service_care_instruction", { p_service_chat_id: serviceChat.id, p_care_details: careDetails }, "Unable to update care instruction.");
  }, [rpcVoid, serviceChat?.id, status]);
  const withdrawRequest = useCallback(() => {
    const activeServiceChatId = clean(serviceChatRef.current?.id);
    if (!activeServiceChatId) return Promise.reject(new Error("service_chat_missing"));
    haptic.destructive();
    return rpcVoid("withdraw_service_request_by_service_id", { p_service_chat_id: activeServiceChatId }, "Unable to withdraw request.");
  }, [rpcVoid]);
  const declineCareRequest = useCallback(async () => {
    const activeServiceChatId = clean(serviceChatRef.current?.id);
    if (!activeServiceChatId) return Promise.reject(new Error("service_chat_missing"));
    haptic.destructive();
    await rpcVoid("decline_service_care_request", { p_service_chat_id: activeServiceChatId }, "Unable to decline this care request.");
    dismissQuoteAutoOpen();
    setActiveSheet(null);
  }, [dismissQuoteAutoOpen, rpcVoid]);
  const performShareStartPin = useCallback(async () => {
    const activeServiceChatId = clean(serviceChatRef.current?.id);
    if (!activeServiceChatId) return;
    haptic.primaryConfirm();
    setSending(true);
    try {
      const { data, error } = await supabase.rpc("share_service_start_pin_by_service_id", { p_service_chat_id: activeServiceChatId, p_requester_confirmed: true });
      if (error) throw error;
      const pin = sanitizeStartPin((data as { pin?: unknown } | null)?.pin);
      if (pin && userId) {
        setSharedStartPin(pin);
        void writeCachedStartPin(userId, activeServiceChatId, pin);
      }
      setNotice(null);
      await load(true);
    } catch (error) {
      haptic.error();
      setCarePopup({ title: "huddle Care", body: safeCareErrorMessage(error, "Unable to share Start PIN.") });
    } finally {
      setSending(false);
    }
  }, [load, userId]);
  const openStartCareFromHandoff = useCallback(() => {
    if (!canServiceStartNow(serviceChatRef.current)) {
      haptic.warning();
      setCarePopup({
        title: "Too early to start",
        body: "Care can only begin on the scheduled service date.",
      });
      return;
    }
    setActiveSheet("startCare");
  }, []);
  const handledNotificationActionRef = useRef<string | null>(null);
  useEffect(() => {
    if (params.notificationAction !== "start_care" || !activeServiceResolved || !serviceChat?.id || !role) return;
    const actionKey = `${serviceChat.id}:${role}:start_care`;
    if (handledNotificationActionRef.current === actionKey) return;
    handledNotificationActionRef.current = actionKey;
    if (role === "requester") {
      if (serviceChat.status !== "booked" || !["awaiting_handoff", "pin_shared"].includes(serviceChat.care_status || "awaiting_handoff")) {
        setCarePopup({ title: "Care is not ready to start", body: "This Care Session is no longer waiting for handoff." });
        return;
      }
      setConfirmOwnerStartCareOpen(true);
      return;
    }
    openStartCareFromHandoff();
  }, [activeServiceResolved, openStartCareFromHandoff, params.notificationAction, role, serviceChat?.care_status, serviceChat?.id, serviceChat?.status]);
  const pickCancelEvidence = useCallback(async () => {
    if (cancelEvidenceMedia.length >= MAX_CARE_REPORT_EVIDENCE) return;
    try {
      // Best-effort request; PHPicker presents regardless, so never hard-block.
      const result = await launchNativeImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ["images"],
        orderedSelection: true,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 0.86,
        selectionLimit: MAX_CARE_REPORT_EVIDENCE - cancelEvidenceMedia.length,
      });
      if (result.canceled || result.assets.length === 0) return;
      const selected = result.assets.map((asset) => ({ durationSeconds: typeof asset.duration === "number" ? asset.duration / 1000 : null, height: asset.height, kind: "image" as const, mimeType: asset.mimeType, name: asset.fileName, size: asset.fileSize, uri: asset.uri, width: asset.width }));
      setCancelEvidenceMedia((current) => [...current, ...selected].slice(0, MAX_CARE_REPORT_EVIDENCE));
    } catch (error) {
      setCarePopup({ title: "Cancel booking", body: nativeSafeErrorCopy(error, "Couldn't open your photo library. Try again.") });
    }
  }, [cancelEvidenceMedia.length]);
  const cancelPaidBooking = useCallback(async () => {
    if (!roomId || !userId) return;
    haptic.destructive();
    setSending(true);
    try {
      const evidenceUrls = cancelEvidenceMedia.length > 0 && serviceChat?.id
        ? await (async () => {
          setCancelEvidenceUploading(true);
          try {
            const uploaded = new Array<string>(cancelEvidenceMedia.length);
            let nextIndex = 0;
            await Promise.all(Array.from({ length: Math.min(2, cancelEvidenceMedia.length) }, async () => {
              while (nextIndex < cancelEvidenceMedia.length) {
                const index = nextIndex;
                nextIndex += 1;
                uploaded[index] = await uploadNativeServiceCareEvidenceImage({ accessToken, media: cancelEvidenceMedia[index], scope: "cancellation", serviceChatId: serviceChat.id, sessionKey, userId });
              }
            }));
            return uploaded;
          } finally {
            setCancelEvidenceUploading(false);
          }
        })()
        : [];
      const activeServiceChatId = clean(serviceChat?.id);
      const freshAccessToken = await getFreshNativeAccessToken(accessToken);
      if (!freshAccessToken) return;
      if (!activeServiceChatId) throw new Error("service_chat_missing");
      const { error } = await supabase.functions.invoke("cancel-service-booking", {
        headers: await createFreshNativeFunctionHeaders(freshAccessToken),
        body: {
          cancellation_note: cancelBookingNote.trim() || null,
          cancellation_reason: cancelBookingReason || null,
          evidence_urls: evidenceUrls,
          service_chat_id: activeServiceChatId,
        },
      });
      if (error) throw error;
      setConfirmCancelBookingOpen(false);
      setCancelBookingNote("");
      setCancelBookingReason("Plans changed");
      setCancelEvidenceMedia([]);
      setSharedStartPin("");
      await purgeCachedStartPin(userId, activeServiceChatId);
      await clearCachedServiceChatRow(userId, sessionKey || null, roomId);
      await invalidateNativeChatReadCaches(userId);
      await load(true);
    } catch (error) {
      haptic.error();
      setCarePopup({ title: "Cancel booking", body: safeCareErrorMessage(error, "Unable to cancel this booking.") });
    } finally {
      setSending(false);
    }
  }, [accessToken, cancelBookingNote, cancelBookingReason, cancelEvidenceMedia, load, roomId, serviceChat?.id, sessionKey, userId]);
  const submitCompletion = useCallback(async (note: string, providerChecks?: { confirmedCompleted: boolean; noUnresolvedSafetyConcerns: boolean; understandsReview: boolean }, requesterChecks?: { confirmedCompleted: boolean; understandsPayoutReview: boolean }) => {
    const activeServiceChatId = clean(serviceChatRef.current?.id) || clean(serviceChat?.id);
    if (!serviceChat || !activeServiceChatId) {
      haptic.error();
      setCarePopup({ title: "huddle Care", body: "Unable to find this booking. Close and reopen the chat, then try again." });
      return;
    }
    if (!isCareOfficiallyStarted(serviceChat)) {
      setCarePopup({ title: "huddle Care", body: "Completion is available after the provider has started care with a valid PIN check-in." });
      return;
    }
    setSending(true);
    try {
      if (isProvider) {
        const { error } = await supabase.rpc("submit_provider_completion_by_service_id", {
          p_service_chat_id: activeServiceChatId,
          p_confirmed_completed: providerChecks?.confirmedCompleted === true,
          p_no_unresolved_safety_concerns: providerChecks?.noUnresolvedSafetyConcerns === true,
          p_understands_review: providerChecks?.understandsReview === true,
          p_photo_url: null,
          p_note: note.trim() || null,
        });
        if (error) throw error;
      } else if (isRequester) {
        const isNoChargeVoluntaryBooking = isNoChargeServiceChat(serviceChat);
        const { error } = await supabase.rpc("submit_requester_completion_by_service_id", {
          p_service_chat_id: activeServiceChatId,
          p_confirmed_completed: requesterChecks?.confirmedCompleted === true,
          p_understands_payout_review: isNoChargeVoluntaryBooking || requesterChecks?.understandsPayoutReview === true,
          p_note: note.trim() || null,
        });
        if (error) throw error;
      }
      await supabase.rpc("complete_service_if_both_confirmed_by_service_id", { p_service_chat_id: activeServiceChatId });
      haptic.success();
      setActiveSheet(null);
      setNotice(null);
      await load(true);
    } catch (error) {
      haptic.error();
      setCarePopup({ title: "huddle Care", body: safeCareErrorMessage(error, "Unable to confirm completion.") });
    } finally {
      setSending(false);
    }
  }, [isProvider, isRequester, load, serviceChat]);
  const submitCheckin = useCallback(async (startPin: string, photoUrl: string, evidence?: StartCareEvidence): Promise<StartCareResult> => {
    const activeServiceChatId = clean(serviceChatRef.current?.id);
    if (!activeServiceChatId) return { ok: false, error: "Unable to find this booking. Close and reopen the chat, then try again." };
    setSending(true);
    try {
      const { data, error } = await supabase.rpc("submit_service_checkin_by_service_id", {
        p_checkin_captured_at: evidence?.capturedAt || null,
        p_checkin_location_accuracy_m: evidence?.locationAccuracyM ?? null,
        p_checkin_location_lat: evidence?.locationLat ?? null,
        p_checkin_location_lng: evidence?.locationLng ?? null,
        p_checkin_location_permission_denied: evidence?.locationPermissionDenied === true,
        p_checkin_note: evidence?.note?.trim() || null,
        p_service_chat_id: activeServiceChatId,
        p_photo_url: photoUrl,
        p_provider_confirmed: true,
        p_start_pin: startPin,
      });
      if (error) throw error;
      const result = (data || {}) as { ok?: boolean; error?: string; attempt_count?: number; show_handoff_problem?: boolean };
      if (result.ok === false) {
        haptic.warning();
        return {
          ok: false,
          error: clean(result.error) || "invalid_start_pin",
          attemptCount: typeof result.attempt_count === "number" ? result.attempt_count : undefined,
          showHandoffProblem: result.show_handoff_problem === true,
        };
      }
      haptic.success();
      setNotice(null);
      await load(true);
      return { ok: true };
    } catch (error) {
      haptic.error();
      logNativeProtectedActionFailure("[native.care] submit_service_checkin_failed", error);
      setCarePopup({ title: "huddle Care", body: safeCareErrorMessage(error, "Unable to start care.") });
      // Distinct from the RPC's own structured "invalid_start_pin" response -- this is any
      // other failure (evidence registration, care-start timing, network, etc). The sheet
      // must not relabel it as a wrong PIN; the popup above already carries the real reason.
      return { ok: false, error: "unexpected_error" };
    } finally {
      setSending(false);
    }
  }, [load]);
  const verifyStartPin = useCallback(async (startPin: string): Promise<{ valid: boolean | null }> => {
    // valid: true/false is a confirmed answer; null means the check itself failed (network,
    // etc) -- callers must treat null as "unknown", never as a false negative, since this is
    // only a heads-up ahead of the authoritative check at actual submit time.
    const activeServiceChatId = clean(serviceChatRef.current?.id);
    if (!activeServiceChatId) return { valid: null };
    try {
      const { data, error } = await supabase.rpc("verify_service_start_pin_by_service_id", { p_service_chat_id: activeServiceChatId, p_start_pin: startPin });
      if (error) throw error;
      const result = (data || {}) as { valid?: boolean };
      return { valid: result.valid === true };
    } catch {
      return { valid: null };
    }
  }, []);
  const submitIssueReport = useCallback(async (reason: string, note: string, evidenceUrls: string[]) => {
    const activeServiceChatId = clean(serviceChatRef.current?.id);
    if (!activeServiceChatId) return;
    const currentCareStatus = clean(serviceChatRef.current?.care_status || "awaiting_handoff");
    if (["awaiting_handoff", "pin_shared"].includes(currentCareStatus)) {
      setActiveSheet(null);
      if (isProvider) setActiveSheet("handoffProblem");
      else setActiveSheet("handoffRequesterProblem");
      setCarePopup({
        title: "Handoff or cancellation",
        body: "Before care starts, use the handoff or cancellation path. If something serious has happened, send the case to Support; huddle may hold payment while reviewing it.",
      });
      return;
    }
    haptic.warning();
    setSending(true);
    try {
      const { error } = await supabase.rpc("submit_service_issue_report_by_service_id", {
        p_service_chat_id: activeServiceChatId,
        p_reason: reason,
        p_note: note,
        p_acknowledged_review: true,
        p_evidence_urls: evidenceUrls,
      });
      if (error) throw error;
      setActiveSheet(null);
      if (userId) {
        await invalidateNativeChatReadCaches(userId);
        await clearCachedServiceChatRow(userId, sessionKey || null, roomId);
      }
      await load(true);
      setHasReportedServiceDispute(true);
      setNotice(SERVICE_UNDER_REVIEW_NOTICE);
    } catch (error) {
      haptic.error();
      setCarePopup({ title: "huddle Care", body: safeCareErrorMessage(error, "Unable to submit issue report.") });
    } finally {
      setSending(false);
    }
  }, [isProvider, load, roomId, sessionKey, userId]);
  const submitHandoffProblem = useCallback(async (reason: string, note: string, evidenceUrls: string[] = []) => {
    const activeServiceChatId = clean(serviceChatRef.current?.id);
    if (!activeServiceChatId) return;
    haptic.warning();
    setSending(true);
    try {
      const { error } = await supabase.rpc("submit_handoff_problem_by_service_id", {
        p_service_chat_id: activeServiceChatId,
        p_reason: reason,
        p_note: note,
        p_evidence_urls: evidenceUrls,
      });
      if (error) throw error;
      setHandoffReportContext(null);
      setActiveSheet(null);
      setNotice(SERVICE_HANDOFF_REVIEW_NOTICE);
      await load(true);
    } catch (error) {
      haptic.error();
      setCarePopup({ title: "Handoff problem", body: safeCareErrorMessage(error, "Unable to report this handoff problem.") });
    } finally {
      setSending(false);
    }
  }, [load]);
  const submitNoStartReport = useCallback(async (reason: string, note: string, evidenceUrls: string[] = []) => {
    const activeServiceChatId = clean(serviceChatRef.current?.id);
    if (!activeServiceChatId) return;
    haptic.warning();
    setSending(true);
    try {
      const { error } = await supabase.rpc("submit_service_no_start_report_by_service_id", {
        p_service_chat_id: activeServiceChatId,
        p_reason: reason,
        p_note: note || null,
        p_evidence_urls: evidenceUrls,
      });
      if (error) throw error;
      setActiveSheet(null);
      setCarePopup({ title: "Report received", body: "Your report was saved for the automatic no-start review at the scheduled end time." });
      await load(true);
    } catch (error) {
      haptic.error();
      setCarePopup({ title: "No-start report", body: safeCareErrorMessage(error, "Unable to submit this no-start report.") });
    } finally {
      setSending(false);
    }
  }, [load]);
  const submitRequesterHandoffResponse = useCallback(async (note: string, evidenceUrls: string[] = []) => {
    const activeServiceChatId = clean(serviceChatRef.current?.id);
    if (!activeServiceChatId) return;
    haptic.warning();
    setSending(true);
    try {
      const { error } = await supabase.rpc("submit_requester_handoff_response_by_service_id", {
        p_service_chat_id: activeServiceChatId,
        p_evidence_urls: evidenceUrls,
        p_note: note,
      });
      if (error) throw error;
      setActiveSheet(null);
      setNotice(SERVICE_UNDER_REVIEW_NOTICE);
      await load(true);
    } catch (error) {
      haptic.error();
      setCarePopup({ title: "Handoff response", body: safeCareErrorMessage(error, "Unable to send this handoff response.") });
    } finally {
      setSending(false);
    }
  }, [load]);
  const submitReview = useCallback(async (rating: number, tags: string[], text: string, mediaUrls: string[], safetyIncidentReported: boolean) => {
    const completedServiceChatId = serviceChatRef.current?.id;
    if (!completedServiceChatId) {
      setCarePopup({ title: "huddle Care", body: "We couldn't find this booking. Close and reopen the chat, then try again." });
      return "failed";
    }
    haptic.primaryConfirm();
    setSending(true);
    try {
      const { error } = await supabase.rpc("submit_service_review_v2", {
        p_service_chat_id: completedServiceChatId,
        p_media_urls: mediaUrls || [],
        p_rating: rating,
        p_review_text: text.trim(),
        p_safety_incident_reported: safetyIncidentReported,
        p_tags: tags || [],
      });
      if (error) throw error;
    } catch (error) {
      if (isAlreadyReviewedError(error)) {
        markServiceReviewSubmitted(completedServiceChatId);
        void load(true);
        return "alreadyReviewed";
      }
      setCarePopup({ title: "huddle Care", body: safeCareErrorMessage(error, "Unable to submit review.") });
      throw error;
    } finally {
      setSending(false);
    }
    markServiceReviewSubmitted(completedServiceChatId);
    if (safetyIncidentReported) {
      setHasReportedServiceDispute(true);
      if (userId) await invalidateNativeChatReadCaches(userId);
      setNotice(SERVICE_UNDER_REVIEW_NOTICE);
      // Negative experience — back off review prompting.
      void recordAppReviewNegativeSignal(userId);
    } else {
      haptic.success();
      // A-ha moment (Uber model): a completed Care booking the owner rated 4-5★.
      // The rating IS the sentiment gate, so fire the store prompt directly.
      if (rating >= 4) {
        void recordAppReviewInteraction(userId);
        void requestAppReview({ userId, trigger: "care_completed_rated", skipSentiment: true });
      } else if (rating > 0) {
        void recordAppReviewNegativeSignal(userId);
      }
    }
    void load(true);
    return "submitted";
  }, [load, markServiceReviewSubmitted, userId]);

  const toggleBlock = useCallback(async () => {
    const freshAccessToken = await getFreshNativeAccessToken(accessToken);
    if (!counterpart?.id || !freshAccessToken) return;
    try {
      const fn = blockState === "blocked_by_me" ? "unblock_user" : "block_user";
      const { error } = await nativeExactTokenRpc(fn, { p_blocked_id: counterpart.id }, freshAccessToken);
      if (error) throw error;
      await invalidateNativeBlockCascade({ userId, roomId, clearRoomMessages: blockState !== "blocked_by_me" });
      setBlockState(blockState === "blocked_by_me" ? "none" : "blocked_by_me");
      setConfirmBlockOpen(false);
    } catch {
      setNotice("Unable to update block status right now.");
    }
  }, [accessToken, blockState, counterpart?.id, roomId, userId]);

  const openProviderProfile = useCallback(async () => {
    const providerId = serviceChat?.provider_id;
    if (!providerId || !userId) return;
    setProviderProfileOpen(true);
    setProviderProfileLoading(true);
    setProviderProfileError("");
    try {
      const provider = await fetchNativeServiceProviderDetail({ userId, accessToken, sessionKey, providerUserId: providerId, force: true });
      setProviderProfile(provider);
      void incrementNativeServiceProviderView(providerId, userId, { accessToken, sessionKey }).catch(() => undefined);
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
        .select("id,owner_id,name,species,breed,pet_size,gender,neutered_spayed,dob,weight,weight_unit,bio,routine,vet_contact,microchip_id,temperament,vet_visit_records,set_reminder,medications,photo_url,is_active,is_public,updated_at")
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
    const previewUrl = activePreviewUrl;
    const attachments = uploads.map((item) => item.attachmentRef).filter((item): item is NativeServiceChatAttachmentStorageRef => Boolean(item?.path));
    if (!roomId || !userId || serviceComposerDisabled || (!text && attachments.length === 0 && !previewUrl)) return;
    if (uploads.some((item) => item.status !== "uploaded" || !item.attachmentRef?.path)) {
      setNotice("Wait for images to finish uploading before sending.");
      return;
    }
    setSending(true);
    const previousText = composer;
    const previousUploads = uploads;
    const previousPreviewUrl = lockedPreviewUrl;
    const pendingId = `pending:${roomId}:${Date.now()}`;
    const content = JSON.stringify({ text: previewUrl ? stripNativeSocialExternalUrlFromText(text, previewUrl) : text, attachments, linkPreviewUrl: previewUrl });
    const session = requireCurrentNativeSession({ accessToken, expectedUserId: userId, sessionKey });
    const pendingMessage: ChatMessageRow = { id: pendingId, sender_id: session.userId, content, created_at: new Date().toISOString(), localStatus: "pending" };
    try {
      setComposer("");
      setLockedPreviewUrl(null);
      setDismissedPreviewUrls(new Set());
      setUploads([]);
      hydrateServiceMessages([pendingMessage]);
      forceScrollToLatestRef.current = true;
      nearBottomRef.current = true;
      scrollServiceMessagesToLatest(true);
      const sent = await sendNativeChatMessage({ roomId, senderId: session.userId, content, accessToken, sessionKey });
      const confirmed = nativeChatMessageToServiceRow(sent);
      setMessages((current) => {
        const next = replacePendingServiceMessage(current, pendingId, confirmed);
        messagesRef.current = next;
        void writeCachedNativeChatMessages(session.userId, roomId, next.map((message) => serviceRowToNativeChatMessage(message, roomId)), { dbConfirmedAt: Date.now(), sessionKey, source: "db" });
        return next;
      });
      scrollServiceMessagesToLatest(true);
    } catch {
      setComposer(previousText);
      setLockedPreviewUrl(previousPreviewUrl);
      setUploads(previousUploads);
      setMessages((current) => {
        const next = current.map((message) => message.id === pendingId ? { ...message, localStatus: "failed" as const } : message);
        messagesRef.current = next;
        return next;
      });
      setCarePopup({ title: "huddle Care", body: "Unable to send message." });
    } finally {
      setSending(false);
    }
  }, [accessToken, activePreviewUrl, composer, hydrateServiceMessages, lockedPreviewUrl, roomId, scrollServiceMessagesToLatest, serviceComposerDisabled, sessionKey, uploads, userId]);

  useEffect(() => {
    if (!activePreviewUrl || linkPreviews[activePreviewUrl]) return;
    if (linkPreviewRequestsRef.current.has(activePreviewUrl)) return;
    linkPreviewRequestsRef.current.add(activePreviewUrl);
    void fetchNativeSocialLinkPreviews([activePreviewUrl], accessToken)
      .then((previews) => {
        if (Object.keys(previews).length > 0) setLinkPreviews((current) => ({ ...current, ...previews }));
      })
      .finally(() => {
        linkPreviewRequestsRef.current.delete(activePreviewUrl);
      });
  }, [accessToken, activePreviewUrl, linkPreviews]);

  useEffect(() => {
    if (!typedPreviewUrl || dismissedPreviewUrls.has(typedPreviewUrl)) return;
    const preview = linkPreviews[typedPreviewUrl];
    if (!preview || preview.failed) return;
    setLockedPreviewUrl(typedPreviewUrl);
    setComposer((current) => stripNativeSocialExternalUrlFromText(current, typedPreviewUrl));
  }, [dismissedPreviewUrls, linkPreviews, typedPreviewUrl]);

  const pickChatMedia = useCallback(async () => {
    if (!userId || serviceComposerDisabled || uploads.length >= 10) return;
    let result: Awaited<ReturnType<typeof ImagePicker.launchImageLibraryAsync>>;
    try {
      // Best-effort request; PHPicker presents regardless, so never hard-block.
      result = await launchNativeImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ["images"],
        orderedSelection: true,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 0.86,
        selectionLimit: 10 - uploads.length,
      });
    } catch (error) {
      setNotice(nativeSafeErrorCopy(error, "Couldn't open your photo library. Try again."));
      return;
    }
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
      setUploads((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, progress: Math.max(entry.progress, NATIVE_UPLOAD_PROGRESS_START), status: "uploading" } : entry));
      const progressTimer = setInterval(() => {
        setUploads((current) => current.map((entry) => (
          entry.uri === item.uri && entry.status === "uploading"
            ? { ...entry, progress: nextNativeUploadProgress(entry.progress) }
            : entry
        )));
      }, 450);
      const uploadGroupId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      void uploadNativeServiceChatAttachmentImage({ accessToken, chatRoomId: roomId, media: item, sessionKey, uploadGroupId, userId })
        .then((attachmentRef) => {
          setUploads((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, attachmentRef, progress: 100, status: "uploaded" } : entry));
        })
        .catch((error) => {
          setUploads((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, progress: 0, status: "error" } : entry));
          setNotice(nativeSafeErrorCopy(error, "Couldn't upload that image. Remove it or try again."));
        })
        .finally(() => {
          clearInterval(progressTimer);
        });
    });
  }, [accessToken, roomId, serviceComposerDisabled, sessionKey, uploads.length, userId]);

  const pay = useCallback(async (bookingSnapshot: CareBookingSnapshot, traceId: string, trace: ServicePaymentTrace) => {
    trace("onPay called", { hasBookingSnapshot: Boolean(bookingSnapshot) });
    const activeServiceChat = serviceChatRef.current;
    const hasPaymentAmount = serviceChatHasPositivePayment(activeServiceChat);
    const activeServiceChatId = clean(activeServiceChat?.id);
    if (!activeServiceChatId || !hasPaymentAmount) {
      console.warn("[native.service_payment] blocked_before_function_call", {
        hasRoomId: Boolean(roomId),
        hasServiceChatId: Boolean(activeServiceChatId),
        hasPaymentAmount,
      });
      trace("blocked before function call", {
        hasRoomId: Boolean(roomId),
        hasServiceChatId: Boolean(activeServiceChatId),
        hasPaymentAmount,
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
        hasServiceChatId: Boolean(activeServiceChatId),
        hasPaymentAmount,
        hasBookingSnapshot: Boolean(bookingSnapshot),
      });
      const { data, error } = await withTimeout(supabase.functions.invoke("create-service-payment", {
        headers: await createFreshNativeFunctionHeaders(await getFreshNativeAccessToken(accessToken)),
        body: {
          service_chat_id: activeServiceChatId,
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
        await AsyncStorage.setItem(pendingServicePaymentKey(userId, roomId, serviceChatRef.current?.id), JSON.stringify({
          checkoutSessionId,
          roomId,
          savedAt: Date.now(),
        })).catch(() => undefined);
      }
      try {
        // Do NOT gate on Linking.canOpenURL: for https Stripe Checkout it returns
        // false on Android (package-visibility), falsely blocking payment. The system
        // browser always handles https — open directly and only treat a thrown error
        // as a real failure.
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
      const message = await safePaymentErrorMessage(error, PAYMENT_FAILED_COPY);
      trace("create-service-payment threw", {
        message: error instanceof Error ? error.message : "unknown",
        status: functionErrorStatus(error),
      });
      return { ok: false, error: message };
    } finally {
      setSending(false);
    }
  }, [accessToken, roomId, userId]);

  const confirmVolunteerBooking = useCallback(async (bookingSnapshot: CareBookingSnapshot, traceId: string, trace: ServicePaymentTrace) => {
    trace("confirm-voluntary-service-booking request started", { hasBookingSnapshot: Boolean(bookingSnapshot), traceId });
    const activeServiceChat = serviceChatRef.current;
    const activeServiceChatId = clean(activeServiceChat?.id);
    if (!activeServiceChat || !activeServiceChatId || serviceChatHasPositivePayment(activeServiceChat)) {
      return { ok: false, error: PAYMENT_BLOCKERS.missingPaymentDetails };
    }
    setSending(true);
    try {
      const { error } = await withTimeout(supabase.functions.invoke("confirm-voluntary-service-booking", {
        headers: await createFreshNativeFunctionHeaders(await getFreshNativeAccessToken(accessToken)),
        body: {
          service_chat_id: activeServiceChatId,
          booking_snapshot: bookingSnapshot,
        },
      }), SERVICE_PAYMENT_TIMEOUT_MS, "confirm_voluntary_service_booking_timeout");
      if (error) throw error;
      await load(true);
      return { ok: true };
    } catch (error) {
      const message = await safePaymentErrorMessage(error, "Unable to confirm booking.");
      trace("confirm-voluntary-service-booking failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      return { ok: false, error: message };
    } finally {
      setSending(false);
    }
  }, [accessToken, load]);

  const proceedPaymentDirect = useCallback(async () => {
    const snapshot = paymentSnapshotFromAgreedChat(serviceChatRef.current);
    if (!snapshot) {
      setCarePopup({ title: "Payment couldn't open", body: PAYMENT_FAILED_COPY });
      return;
    }
    const traceId = createPaymentTraceId();
    const result = await pay(snapshot, traceId, () => undefined);
    if (!result.ok) {
      setCarePopup({
        title: "Payment couldn't open",
        body: result.error || PAYMENT_FAILED_COPY,
      });
      return;
    }
    await load();
  }, [load, pay]);

  const actionPrimary = useMemo(() => {
    if (careConversationState.kind === "clean_slate") {
      return isRequester ? { label: "Start a quote", onPress: openNewRequestSheet, disabled: false } : null;
    }
    if (!serviceChat || careConversationState.kind === "under_review") return null;
    if (careConversationState.kind === "scope_pending" || careConversationState.kind === "agreement_signed") {
      const scope = serviceChat.care_scope;
      const mutuallyAgreed = hasCurrentCareScopeAgreement(serviceChat);
      const paymentInProgress = isCarePaymentPendingActive(scope, paymentNowMs);
      const paymentRetryCountdown = formatPaymentRetryCountdown(scope, paymentNowMs);
      if (isRequester && !hasRequest) return { label: "Book Care", onPress: openCurrentRequestSheet, disabled: false };
      // Expired pending request: the carer has no actionable request; the requester
      // is steered to update the date or withdraw (both surfaced in the scope card).
      if (pendingRequestExpired) {
        if (isRequester) return { label: "Update date", onPress: () => setActiveSheet("request"), disabled: false };
        return null;
      }
      // Once the carer has signed/agreed they no longer "Review request" — they wait for
      // the owner. (Without this the carer's CTA stayed on "Review request" after agreeing
      // because no quote_card is created in agree-as-is mode.)
      if (isProvider && hasRequest && !hasQuote && !scope?.carerSigned) return { label: "Review request", onPress: () => setActiveSheet("quote"), disabled: false };
      if (isProvider && hasRequest && hasQuote && scope && !paymentInProgress) {
        const hasPaymentAmount = serviceChatHasPositivePayment(serviceChat);
        // Turn ownership: the carer proposes and signs first, then it is the owner's
        // turn. Once the carer has signed they wait — they cannot keep editing the
        // same scope while the owner reviews it.
        if (mutuallyAgreed) return null;
        if (!scope.carerSigned && scope.actorRole === "carer" && !scope.ownerSigned) return null;
        if (!scope.carerSigned) return { label: "Review & Sign Care Scope", onPress: () => setActiveSheet("quote"), disabled: false };
        if (!scope.ownerSigned) return null;
        return null;
      }
      if (isRequester && hasRequest && scope) {
        const hasPaymentAmount = serviceChatHasPositivePayment(serviceChat);
        if (paymentInProgress) {
          return null;
        }
        if (mutuallyAgreed) {
          if (hasPaymentAmount && !providerStripeReady) return null;
          return { label: hasPaymentAmount ? "Proceed Payment" : "Proceed Confirm", onPress: hasPaymentAmount ? proceedPaymentDirect : () => setActiveSheet("payment"), disabled: false };
        }
        // Turn ownership: the owner can only proceed once the carer has actually signed the
        // CURRENT scope version. actorRole is just "who last edited this version" — it says
        // nothing about whether the carer has signed it, and gating on it (instead of the
        // real carerSigned flag) let "Proceed Confirm"/"Proceed Payment" show as enabled the
        // moment the carer touched the version at all (e.g. sharing a Care Instruction, which
        // doesn't even require re-signing) — a dead-end, since the backend still correctly
        // rejects payment with care_scope_not_mutually_signed.
        if (scope && !scope.ownerSigned) {
          // Reviewing & signing never needs the carer's Stripe account -- only the eventual
          // payment step does. It's the owner's turn once the carer has signed the current
          // version (regardless of who edited it last), or when the carer just proposed it
          // (actorRole "carer"). Gating this on carerSigned/providerStripeReady left the owner
          // stuck on a "Waiting for you" banner with no CTA at all once the carer had signed
          // but hadn't finished Stripe onboarding yet.
          if (scope.carerSigned || scope.actorRole === "carer") return { label: "Review & Sign Care Scope", onPress: () => setActiveSheet("payment"), disabled: false };
          return null;
        }
        if (hasPaymentAmount && !providerStripeReady) {
          return null;
        }
        const label = hasPaymentAmount ? "Proceed Payment" : "Proceed Confirm";
        return { label, onPress: () => setActiveSheet("payment"), disabled: false };
      }
    }
    if (careConversationState.kind === "handoff_waiting" || careConversationState.kind === "pin_shared") {
      return null;
    }
    if (careConversationState.kind === "care_in_progress") {
      if (!canConfirmCompletion) return null;
      return { label: completionCtaLabel, onPress: handleCompletionEntrySlide, disabled: false };
    }
    if (canLeaveReview) return { label: "Leave a Review", onPress: () => setActiveSheet("review"), disabled: false };
    if (isRequester && careConversationState.kind === "completed") return { label: "Start a quote", onPress: openNewRequestSheet, disabled: false };
    return null;
  }, [canConfirmCompletion, canLeaveReview, careConversationState.kind, completionCtaLabel, handleCompletionEntrySlide, hasQuote, hasRequest, isProvider, isRequester, openCurrentRequestSheet, openNewRequestSheet, paymentNowMs, pendingRequestExpired, proceedPaymentDirect, providerStripeReady, serviceChat]);
  const completionPrimaryActionIsSlider = Boolean(actionPrimary && careConversationState.kind === "care_in_progress");

  // Agree-stage guidance shown as a banner ABOVE the composer CTA (not inside the sheet),
  // so each side always knows whose turn it is and that they've already agreed.
  const careStageBanner = useMemo<{ title: string; body: string } | null>(() => {
    if (careConversationState.kind !== "scope_pending" && careConversationState.kind !== "agreement_signed") return null;
    if (pendingRequestExpired) return null;
    const scope = serviceChat?.care_scope;
    if (!scope) return null;
    if (hasCurrentCareScopeAgreement(serviceChat)) {
      const hasPaymentAmount = serviceChatHasPositivePayment(serviceChat);
      const paymentInProgress = isCarePaymentPendingActive(scope, paymentNowMs);
      // The retry countdown is unique, time-sensitive info a title alone can't convey — this
      // is the one banner that keeps a body. Once it lapses, isCarePaymentPendingActive flips
      // false and "Proceed Payment" reappears on its own; no separate reset action needed.
      if (paymentInProgress && isRequester && hasPaymentAmount) {
        const countdown = formatPaymentRetryCountdown(scope, paymentNowMs);
        return { title: "Payment in progress", body: countdown ? `If you completed checkout, the booking will confirm shortly. If you cancelled, you can try again in ${countdown}.` : "If you completed checkout, the booking will confirm shortly. If you cancelled, you can try again once this countdown ends." };
      }
      return isRequester
        ? { title: "Both sides agreed", body: "" }
        : { title: hasPaymentAmount ? "Waiting for the owner to pay" : "Waiting for the owner to confirm", body: "" };
    }
    if (isProvider) {
      if (!scope.carerSigned && scope.actorRole === "carer" && !scope.ownerSigned) return { title: "Waiting for the owner to review & sign", body: "" };
      if (!scope.carerSigned) return { title: scope.ownerSigned ? `${clean(peerName) || "The owner"} already agreed to this Care Scope` : "Waiting for you", body: "" };
      if (!scope.ownerSigned) return { title: "Waiting for the owner to review & sign", body: "" };
      return null;
    }
    if (isRequester) {
      if (scope.actorRole === "carer" && !scope.ownerSigned) return { title: "Waiting for you", body: "" };
      if (!scope.carerSigned) return { title: `Care Scope is still under ${clean(peerName) || "the carer"}'s review`, body: "" };
      if (!scope.ownerSigned) return { title: "Waiting for you", body: "" };
      return null;
    }
    return null;
  }, [careConversationState.kind, isProvider, isRequester, paymentNowMs, peerName, pendingRequestExpired, serviceChat]);

  const completionStageBanner = useMemo<{ title: string; body: string; awaitingPeer: boolean } | null>(() => {
    if (careConversationState.kind !== "care_in_progress" || !serviceChat || !role) return null;
    const currentUserMarkedFinished = role === "provider"
      ? serviceChat.provider_mark_finished === true
      : serviceChat.requester_mark_finished === true;
    const peerMarkedFinished = role === "provider"
      ? serviceChat.requester_mark_finished === true
      : serviceChat.provider_mark_finished === true;
    if (currentUserMarkedFinished && !peerMarkedFinished) {
      return {
        title: `Waiting for ${clean(peerName) || (isProvider ? "the owner" : "the carer")} to confirm completion`,
        body: "",
        awaitingPeer: true,
      };
    }
    if (!currentUserMarkedFinished && peerMarkedFinished) {
      return {
        title: `${clean(peerName) || (isProvider ? "The owner" : "The carer")} marked care complete`,
        body: "Please confirm once care is complete and the pet is safely returned.",
        awaitingPeer: false,
      };
    }
    return null;
  }, [careConversationState.kind, isProvider, peerName, role, serviceChat]);

  // Care in progress auto-completes ~48h after the scheduled end (backend safety valve —
  // see process_service_payout_releases) if nobody confirms or reports an issue first. This
  // mirrors that same window client-side so the countdown is never a surprise: silence is
  // informed consent, not a trap. Applies to voluntary ($0) bookings too — they now also
  // auto-complete, just with no payout to release.
  const scheduledEndAtMain = useMemo(() => serviceScheduledEndIso(serviceChat?.request_card, serviceChat?.booking_snapshot), [serviceChat?.booking_snapshot, serviceChat?.request_card]);
  const autoCompleteAtMain = useMemo(() => addHoursIso(scheduledEndAtMain, PAYOUT_AUTO_RELEASE_HOURS), [scheduledEndAtMain]);
  const showCompletionCountdown = Boolean(
    careConversationState.kind === "care_in_progress"
    && canConfirmCompletion
    && autoCompleteAtMain
    && scheduledEndAtMain
    && Date.now() >= new Date(scheduledEndAtMain).getTime()
    && activeServiceResolved
  );
  const [completionCountdownNowMs, setCompletionCountdownNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!showCompletionCountdown) return undefined;
    setCompletionCountdownNowMs(Date.now());
    const timer = setInterval(() => setCompletionCountdownNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [showCompletionCountdown]);
  const completionCountdownLabel = useMemo(() => {
    if (!showCompletionCountdown || !autoCompleteAtMain) return "";
    const remainingMs = Math.max(0, new Date(autoCompleteAtMain).getTime() - completionCountdownNowMs);
    const totalSeconds = Math.floor(remainingMs / 1000);
    const pad = (value: number) => String(value).padStart(2, "0");
    const hh = Math.floor(totalSeconds / 3600);
    const mm = Math.floor((totalSeconds % 3600) / 60);
    const ss = totalSeconds % 60;
    return hh > 0 ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
  }, [autoCompleteAtMain, completionCountdownNowMs, showCompletionCountdown]);

  // The sign-off system pill is emitted once per signer. When the second signer completes
  // the pair for a scope version, upgrade that completing pill to "Both sides agreed to the
  // Care Scope." so the chat history reads as a clear mutual milestone, not two lone pills.
  const mutualAgreedMessageIds = useMemo(() => {
    const byVersion = new Map<string, { owner?: { id: string; at: number }; carer?: { id: string; at: number } }>();
    for (const message of messages) {
      const parsed = parseServiceMessage(message.content || "");
      if (parsed.kind !== "service_care_scope_agreed") continue;
      const version = parsed.scopeVersionId || "";
      const role = parsed.role === "carer" ? "carer" : parsed.role === "owner" ? "owner" : null;
      if (!version || !role) continue;
      const at = message.created_at ? new Date(message.created_at).getTime() : 0;
      const entry = byVersion.get(version) || {};
      entry[role] = { id: message.id, at };
      byVersion.set(version, entry);
    }
    const ids = new Set<string>();
    for (const entry of byVersion.values()) {
      if (entry.owner && entry.carer) {
        ids.add(entry.owner.at >= entry.carer.at ? entry.owner.id : entry.carer.id);
      }
    }
    return ids;
  }, [messages]);

  // Shared by the action-menu "Report Issue" item and CompletionSheet's "Report Issues" link --
  // both open the exact same issueReport-mode HandoffProblemSheet, so there's no reason for two
  // separate closures to drift out of sync with each other.
  const openIssueReportSheet = useCallback(() => {
    transitionNativeModal(
      () => setMenuOpen(false),
      () => setActiveSheet("issue"),
    );
  }, [transitionNativeModal]);
  const openBlockAction = useCallback(() => {
    transitionNativeModal(
      () => setMenuOpen(false),
      () => {
        if (blockUnavailableForCare) setBlockUnavailableNoticeOpen(true);
        else setConfirmBlockOpen(true);
      },
    );
  }, [blockUnavailableForCare, transitionNativeModal]);
  const menuItems = useMemo<AppActionMenuItem[]>(() => {
    const items: AppActionMenuItem[] = [
      { label: "See Carer Profile", icon: "user", onPress: () => transitionNativeModal(() => setMenuOpen(false), () => { void openProviderProfile(); }) },
    ];
    if (canBookCareFromMenu) {
      items.push({ label: "Start a quote", icon: "file-text", onPress: () => transitionNativeModal(() => setMenuOpen(false), () => { (!serviceChat || status === "completed" ? openNewRequestSheet : openCurrentRequestSheet)(); }) });
    }
    if (canLeaveReview) {
      items.push({ label: "Leave a Review", icon: "star", onPress: () => transitionNativeModal(() => setMenuOpen(false), () => setActiveSheet("review")) });
    }
    if (canOpenCareHistory) {
      items.push({ label: "Care History", icon: "clock", onPress: () => { void loadCareHistoryRows(); transitionNativeModal(() => setMenuOpen(false), () => setCareHistoryOpen(true)); } });
    }
    if (canCancelPaidBooking) {
      items.push({ label: "Cancel Booking", icon: "x-circle", destructive: true, onPress: () => transitionNativeModal(() => setMenuOpen(false), () => setConfirmCancelBookingOpen(true)) });
    }
    if (canReportHandoffProblem) {
      items.push({ label: "Report Handoff Problem", icon: "alert-circle", destructive: true, onPress: () => transitionNativeModal(() => setMenuOpen(false), () => { setHandoffReportContext(null); setActiveSheet("handoffProblem"); }) });
    }
    if (canReportRequesterHandoffProblem) {
      items.push({ label: "Report Handoff Problem", icon: "alert-circle", destructive: true, onPress: () => transitionNativeModal(() => setMenuOpen(false), () => { setHandoffReportContext(null); setActiveSheet("handoffRequesterProblem"); }) });
    }
    if (canRespondToHandoffProblem) {
      items.push({ label: "Respond to Handoff Review", icon: "message-circle", onPress: () => transitionNativeModal(() => setMenuOpen(false), () => setActiveSheet("handoffResponse")) });
    }
    if (canReportBookingIssue) {
      items.push({ label: "Report Issue", icon: "alert-triangle", destructive: true, onPress: openIssueReportSheet });
    }
    items.push(
      { label: "Report User", icon: "flag", onPress: () => transitionNativeModal(() => setMenuOpen(false), () => setReportOpen(true)) },
      {
        label: blockState === "blocked_by_me" ? "Unblock User" : "Block User",
        icon: "slash",
        destructive: blockState !== "blocked_by_me" && !blockUnavailableForCare,
        muted: blockUnavailableForCare,
        onPress: openBlockAction,
      },
    );
    return items;
  }, [blockState, blockUnavailableForCare, canBookCareFromMenu, canCancelPaidBooking, canLeaveReview, canOpenCareHistory, canReportBookingIssue, canReportHandoffProblem, canReportRequesterHandoffProblem, canRespondToHandoffProblem, loadCareHistoryRows, openBlockAction, openCurrentRequestSheet, openIssueReportSheet, openNewRequestSheet, openProviderProfile, serviceChat, status, transitionNativeModal]);

  const openHeaderActionMenu = useCallback(() => {
    if (!menuAnchorRef.current) {
      setMenuOpen(true);
      return;
    }
    menuAnchorRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchorPosition({
        top: y + height + huddleSpacing.x1,
        right: Math.max(huddleSpacing.x3, windowWidth - x - width),
      });
      setMenuOpen(true);
    });
  }, [windowWidth]);

  if (loading && !roomId && !initialCounterpart) {
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
          {visiblePeerAvatar ? (
            <ExpoImage
              cachePolicy="memory-disk"
              contentFit="cover"
              key={nativeFreshImageKey(visiblePeerAvatar, visiblePeerAvatar)}
              onError={() => setPeerAvatarFailedUrls((current) => new Set([...current, visiblePeerAvatar]))}
              source={{ uri: nativeFreshImageUri(visiblePeerAvatar, visiblePeerAvatar) }}
              style={styles.peerAvatar}
              transition={150}
            />
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
            displayStatus === "cancelled" || displayStatus === "cancelling" ? styles.statusCancelled : null,
          ]}
        >
          {displayStatusLabel}
        </Text>
        {!underReview || canOpenCareHistory ? (
          <Pressable
            accessibilityLabel="service-chat-more-button"
            hitSlop={huddleSpacing.x2}
            onPress={openHeaderActionMenu}
            ref={menuAnchorRef}
            style={styles.headerBack}
          >
            <Feather color={huddleColors.iconMuted} name="more-horizontal" size={20} />
          </Pressable>
        ) : (
          <View style={styles.headerBack} />
        )}
      </View>
      <View style={styles.chatBody}>
      {visibleNotice ? (
        visibleNotice === "Confirming payment..." && !underReview ? (
          <NativeToast message={visibleNotice} />
        ) : (
          <View style={styles.notice}><Feather color={huddleColors.blue} name="info" size={16} /><Text style={styles.noticeText}>{visibleNotice}</Text></View>
        )
      ) : null}
      {effectiveServiceChat && !careHistoryHiddenFromChat ? (
        <View style={styles.timelineBannerWrap}>
          <BookingTimelineCard
            chat={effectiveServiceChat}
            collapsed={timelineCollapsed}
            canHide={canInlineHideCurrentCareHistory}
            isProvider={isProvider}
            paymentMovement={activeCarePaymentMovement}
            underReview={underReview}
            onHide={hideCurrentCareHistory}
            onToggle={() => setTimelineCollapsed((value) => !value)}
          />
          <BookingCards
            chat={effectiveServiceChat}
            canHide={canInlineHideCurrentCareHistory}
            currencyCountries={careCurrencyCountries}
            providerCurrency={counterpart?.providerCurrency}
            isProvider={isProvider}
            isRequester={isRequester}
            sending={sending}
            underReview={underReview}
            onHide={hideCurrentCareHistory}
            onOpenPet={openPetProfile}
            onOpenCareAgreement={() => void openCareAgreementPdf(effectiveServiceChat)}
            ownerName={isRequester ? currentDisplayName || "Owner" : peerName || "Owner"}
            onEditRequest={() => setActiveSheet("request")}
            onWithdrawRequest={() => setConfirmWithdrawRequestOpen(true)}
            onEditQuote={() => setActiveSheet("quote")}
            providerName={isProvider ? currentDisplayName || "Carer" : peerName || "Carer"}
            footerHeight={footerHeight}
          />
        </View>
      ) : null}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          keyboardVisible ? styles.contentKeyboard : null,
          // Reserve the pinned footer's measured height so the last messages sit above it,
          // never behind it.
          { paddingBottom: footerHeight + huddleSpacing.x2 },
        ]}
        keyboardShouldPersistTaps="handled"
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onContentSizeChange={() => {
          if (nearBottomRef.current) scrollRef.current?.scrollToEnd({ animated: false });
        }}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          nearBottomRef.current = contentSize.height - contentOffset.y - layoutMeasurement.height <= 120;
          if (contentOffset.y < 56) void loadOlderServiceMessages();
        }}
        scrollEventThrottle={80}
        showsVerticalScrollIndicator={false}
        style={styles.messagesScroll}
      >
        {serviceShellPending ? (
          <NativeLoadingState style={styles.loadingInline} />
        ) : null}
        {loadingOlderMessages ? (
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
            if (["service_care_update", "service_check_in"].includes(parsed.kind) && parsed.careUpdate) {
              const mine = message.sender_id === userId;
              const fresh = mine && Number.isFinite(Date.parse(message.created_at || "")) && Date.now() - Date.parse(message.created_at || "") < 12000;
              return (
                <View key={message.id}>
                  {divider ? <Text style={styles.dayDivider}>{divider}</Text> : null}
                  <ServiceCareUpdateCard
                    align={mine ? "end" : "start"}
                    animateIn={fresh}
                    capturedAt={parsed.careUpdate.capturedAt || message.created_at}
                    note={parsed.careUpdate.note}
                    onSaved={showCareSaveToast}
                    ownerName={isRequester ? currentDisplayName || "Owner" : peerName || "Owner"}
                    petName={parsed.careUpdate.petName}
                    photoDescriptor={parsed.careUpdate.photoUrl}
                  />
                </View>
              );
            }
            if (parsed.kind?.startsWith("service_")) {
              // Collapse a consecutive run of the same low-signal status pill (e.g. repeated
              // "updated the Care Scope" during back-and-forth editing) down to just the
              // latest one — the run's earlier pills are noise. Full history stays in the DB;
              // this is render-only. Runs break on any other kind / real message / agreement.
              if (CONSOLIDATABLE_STATUS_KINDS.has(parsed.kind)) {
                const nextParsed = index + 1 < messages.length ? parseServiceMessage(messages[index + 1].content) : null;
                if (nextParsed?.kind === parsed.kind) return null;
              }
              const actorName = message.sender_id === userId ? currentDisplayName || "You" : peerName;
              return <View key={message.id}>{divider ? <Text style={styles.dayDivider}>{divider}</Text> : null}<ServiceSystemPill actorName={actorName} createdAt={message.created_at} isRequester={isRequester} kind={parsed.kind} mutualAgreed={mutualAgreedMessageIds.has(message.id)} policy={parsed.policy} /></View>;
            }
            if (parsed.share) {
              return (
                <View key={message.id} style={styles.messageBlock}>
                  {divider ? <Text style={styles.dayDivider}>{divider}</Text> : null}
                  <View style={[styles.messageRow, me ? styles.messageRowMine : null]}>
                    <Pressable
                      accessibilityRole="link"
                      onPress={() => {
                        const path = parsed.share ? nativePathForSharedContent(parsed.share) : null;
                        if (path) onNavigate(path);
                      }}
                      style={[styles.chatShareCard, me ? styles.chatShareCardMine : styles.chatShareCardTheirs]}
                    >
                      <View style={styles.chatShareCardBody}>
                        <View style={styles.shareThumb}>
                          {parsed.share.imageUrl ? (
                            <Image
                              key={nativeFreshImageKey(parsed.share.imageUrl, parsed.share.canonicalUrl || parsed.share.appUrl || parsed.share.imageUrl)}
                              resizeMode="cover"
                              source={{ uri: nativeFreshImageUri(parsed.share.imageUrl, parsed.share.canonicalUrl || parsed.share.appUrl || parsed.share.imageUrl) }}
                              style={styles.shareThumbImage}
                            />
                          ) : null}
                        </View>
                        <View style={styles.shareTextWrap}>
                          <Text numberOfLines={1} style={[styles.shareSurface, styles.shareTextOnBubble]}>{parsed.share.surface || "Huddle"}</Text>
                          <Text numberOfLines={2} style={[styles.shareTitle, styles.shareTextOnBubble]}>{buildServiceShareHeadline(parsed.share)}</Text>
                          {parsed.share.description ? <Text numberOfLines={2} style={[styles.shareDescription, styles.shareDescriptionOnBubble]}>{parsed.share.description}</Text> : null}
                        </View>
                        <Feather color={huddleColors.iconMuted} name="chevron-right" size={16} />
                      </View>
                    </Pressable>
                  </View>
                  <View style={[styles.messageMeta, me ? styles.messageMetaMine : null]}>
                    <Text style={styles.messageTime}>{message.localStatus === "pending" ? "Sending" : message.localStatus === "failed" ? "Failed" : formatMessageTime(message.created_at)}</Text>
                    {me && !message.localStatus ? <Text style={styles.readMark}>✓</Text> : null}
                  </View>
                </View>
              );
            }
            const hasAttachments = parsed.attachments.length > 0;
            const previewUrl = parsed.linkPreviewUrl || extractNativeSocialFirstHttpUrl(parsed.text || "");
            const visibleText = previewUrl ? stripNativeSocialExternalUrlFromText(parsed.text || "", previewUrl) : parsed.text;
            const hasImageOnlyContent = hasAttachments && !visibleText && !previewUrl;
            return (
              <View key={message.id} style={styles.messageBlock}>
                {divider ? <Text style={styles.dayDivider}>{divider}</Text> : null}
                <View style={[styles.messageRow, me ? styles.messageRowMine : null]}>
                  <View style={[styles.bubble, hasAttachments ? styles.messageBubbleRich : null, hasImageOnlyContent ? styles.messageBubbleMediaOnly : null, me ? styles.bubbleMine : styles.bubbleTheirs]}>
                    {hasAttachments ? <ServiceChatAttachmentCarousel attachments={parsed.attachments} /> : null}
                    {visibleText ? <Text style={[styles.bubbleText, hasAttachments ? styles.messageTextRich : null, me ? styles.bubbleTextMine : null]}>{visibleText}</Text> : null}
                    {previewUrl ? (
                      <NativeSocialExternalLinkPreview
                        linkPreview={linkPreviews[previewUrl] || null}
                        onOpen={(url) => { if (!navigateNativeHuddleLink(url, onNavigate)) void Linking.openURL(url); }}
                        url={previewUrl}
                      />
                    ) : null}
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
        onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        style={[styles.dialogueFooterSurface, keyboardVisible ? styles.dialogueFooterSurfaceKeyboard : null]}
      >
        <View style={styles.serviceActionLayer}>
          {paymentSetupNeeded ? (
            <ServiceActionCard
              body="Stripe couldn’t complete this payout. Review your payout account details."
              collapsed={false}
              onToggle={() => undefined}
              staticCard
              title="Payment setup needed"
            >
              <AppModalButton disabled={sending} onPress={openPayoutAccount}>Review payout account</AppModalButton>
            </ServiceActionCard>
          ) : (careConversationState.kind === "handoff_waiting" || careConversationState.kind === "pin_shared") && (isRequester || isProvider) && !showReviewComposerCta ? (
            <ServiceActionCard
              body={systemNoStartCancellationPending
                ? "The scheduled end time has passed. This booking is being cancelled under the no-start policy."
                : handoffOverdue
                ? (isRequester
                  ? (noStartPolicyActive
                    ? "If the carer is a no-show, you must report it before the scheduled end time. Otherwise, the booking will automatically cancel under the no-start policy. A refund is not guaranteed."
                    : "Care has not started. This booking will automatically cancel at the scheduled end time.")
                  : (noStartPolicyActive
                    ? "Please start care immediately or report any issue before the scheduled end time. Otherwise, the booking will automatically cancel under the no-start policy. Payout is not guaranteed."
                    : "Please start care immediately. Otherwise, the booking will automatically cancel at the scheduled end time."))
                : (isRequester
                  ? "Share the 4-digit PIN after handing over your pet or giving access to the care location."
                  : "Collect 4-digit PIN, then take a timestamped photo of the pet to start care.")}
              collapsed={systemNoStartCancellationPending ? false : serviceActionCollapsed}
              headerRight={!systemNoStartCancellationPending && isRequester ? (
                activeStartPin
                  ? <StartPinDetailCard digits={sanitizeStartPin(activeStartPin).split("")} />
                  : <Text accessibilityLiveRegion="polite" style={styles.startPinPreparingText}>Preparing PIN…</Text>
              ) : null}
              icon={<SvgXml color={huddleColors.blue} height={18} width={18} xml={PASSCODE_LOCK_ICON_SVG} />}
              locked={isRequester && ownerAuthorizedStart && !handoffReady}
              onToggle={() => { if (!systemNoStartCancellationPending) setServiceActionCollapsed((value) => !value); }}
              staticCard={systemNoStartCancellationPending}
              title={systemNoStartCancellationPending ? "Cancelling…" : isRequester ? "Your Care Session PIN" : "Enter PIN and 📸"}
              warningBody={handoffOverdue}
            >
              {isRequester && !handoffReady ? (
                <AppModalButton disabled={sending || ownerAuthorizedStart} onPress={() => setConfirmOwnerStartCareOpen(true)}>
                  Start Care
                </AppModalButton>
              ) : null}
              {isProvider && !startWindowElapsed ? (
                <AppModalButton disabled={sending || !carerCanStart} onPress={openStartCareFromHandoff}>
                  Start Care
                </AppModalButton>
              ) : null}
              {canCancelPaidBooking ? (
                <Pressable accessibilityRole="button" onPress={() => setConfirmCancelBookingOpen(true)} style={styles.cancelBookingTextButton}>
                  <Text style={styles.cancelBookingTextButtonLabel}>Cancel Booking</Text>
                </Pressable>
              ) : null}
              {noStartReportOpen ? (
                <Pressable accessibilityRole="button" onPress={() => { haptic.toggleControl(); setActiveSheet("noStartReport"); }} style={styles.cancelBookingTextButton}>
                  <Text style={styles.cancelBookingTextButtonLabel}>Report no-start issue</Text>
                </Pressable>
              ) : null}
            </ServiceActionCard>
          ) : terminalSystemNoStart && isRequester && !careHistoryHiddenFromChat ? (
            <ServiceActionCard
              body="Care did not start before the scheduled end time. This booking was cancelled under the no-start policy."
              collapsed={false}
              onToggle={() => undefined}
              staticCard
              title="Care session cancelled"
            >
              <AppModalButton disabled={sending} onPress={hideCurrentCareHistory} variant="secondary">Close</AppModalButton>
            </ServiceActionCard>
          ) : careStageBanner && !showReviewComposerCta ? (
            <ServiceActionCard
              body={careStageBanner.body}
              collapsed={serviceActionCollapsed}
              onToggle={() => setServiceActionCollapsed((value) => !value)}
              staticCard
              title={careStageBanner.title}
            >
              {actionPrimary && !actionPrimary.disabled ? (
                <AppModalButton disabled={sending || actionPrimary.disabled} onPress={actionPrimary.onPress}>{actionPrimary.label}</AppModalButton>
              ) : null}
            </ServiceActionCard>
          ) : completionStageBanner && !showReviewComposerCta ? (
            <ServiceActionCard
              body={completionStageBanner.body}
              collapsed={false}
              onToggle={() => undefined}
              staticCard
              title={completionStageBanner.title}
            >
              {!completionStageBanner.awaitingPeer && actionPrimary && !actionPrimary.disabled ? (
                <>
                  <View style={styles.completionActionStack}>
                    {completionPrimaryActionIsSlider
                      ? <SlideToConfirm busy={sending} label={completionCtaLabel} onCommit={actionPrimary.onPress} resetKey={completionEntrySlideResetKey} />
                      : <AppModalButton disabled={sending} onPress={actionPrimary.onPress}>{actionPrimary.label}</AppModalButton>}
                    {showCareUpdateStatusLoading ? (
                      <View accessibilityLabel="Checking requested updates" accessibilityRole="progressbar" style={styles.careUpdateStatusLoadingButton}>
                        <Text style={styles.careUpdateStatusLoadingText}>Checking requested updates…</Text>
                      </View>
                    ) : showRequiredCareUpdateAction ? (
                      <Pressable accessibilityRole="button" disabled={sending} onPress={openRequiredCareUpdateSheet} style={({ pressed }) => [styles.requiredCareUpdateButton, sending ? styles.disabledAction : null, pressed ? nativeModalStyles.pressed : null]}>
                        <Text style={styles.requiredCareUpdateButtonText}>{requiredCareUpdateActionText}</Text>
                      </Pressable>
                    ) : showShareMoreUpdateAction ? (
                      <Pressable accessibilityRole="button" disabled={sending} onPress={openOptionalCareUpdateSheet} style={({ pressed }) => [styles.shareMoreUpdateBanner, pressed ? nativeModalStyles.pressed : null]}>
                        <Text style={styles.shareMoreUpdateBannerText}>Share more update</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {canReportBookingIssue ? (
                    <Pressable accessibilityRole="button" hitSlop={huddleSpacing.x2} onPress={openIssueReportSheet} style={styles.completionCountdownReportLink}>
                      <Text style={styles.completionCountdownReportLinkText}>Report issue</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}
            </ServiceActionCard>
          ) : showCompletionCountdown && actionPrimary && !showReviewComposerCta ? (
            <ServiceActionCard
              collapsed={serviceActionCollapsed}
              onToggle={() => setServiceActionCollapsed((value) => !value)}
              title={`Auto-completes in ${completionCountdownLabel}`}
            >
              <View style={styles.completionActionStack}>
                {!actionPrimary.disabled ? (
                  completionPrimaryActionIsSlider
                    ? <SlideToConfirm busy={sending} label={completionCtaLabel} onCommit={actionPrimary.onPress} resetKey={completionEntrySlideResetKey} />
                    : <AppModalButton disabled={sending} onPress={actionPrimary.onPress}>{actionPrimary.label}</AppModalButton>
                ) : null}
                {showCareUpdateStatusLoading ? (
                  <View accessibilityLabel="Checking requested updates" accessibilityRole="progressbar" style={styles.careUpdateStatusLoadingButton}>
                    <Text style={styles.careUpdateStatusLoadingText}>Checking requested updates…</Text>
                  </View>
                ) : showRequiredCareUpdateAction ? (
                  <Pressable accessibilityRole="button" disabled={sending} onPress={openRequiredCareUpdateSheet} style={({ pressed }) => [styles.requiredCareUpdateButton, sending ? styles.disabledAction : null, pressed ? nativeModalStyles.pressed : null]}>
                    <Text style={styles.requiredCareUpdateButtonText}>{requiredCareUpdateActionText}</Text>
                  </Pressable>
                ) : showShareMoreUpdateAction ? (
                  <Pressable accessibilityRole="button" disabled={sending} onPress={openOptionalCareUpdateSheet} style={({ pressed }) => [styles.shareMoreUpdateBanner, pressed ? nativeModalStyles.pressed : null]}>
                    <Text style={styles.shareMoreUpdateBannerText}>Share more update</Text>
                  </Pressable>
                ) : null}
              </View>
              {canReportBookingIssue ? (
                <Pressable accessibilityRole="button" hitSlop={huddleSpacing.x2} onPress={openIssueReportSheet} style={styles.completionCountdownReportLink}>
                  <Text style={styles.completionCountdownReportLinkText}>Report issue</Text>
                </Pressable>
              ) : null}
            </ServiceActionCard>
          ) : actionPrimary && !showReviewComposerCta ? (
            <View style={styles.primaryActionWrap}>
              <View style={styles.completionActionStack}>
                {!actionPrimary.disabled ? (
                  completionPrimaryActionIsSlider
                    ? <SlideToConfirm busy={sending} label={completionCtaLabel} onCommit={actionPrimary.onPress} resetKey={completionEntrySlideResetKey} />
                    : <AppModalButton disabled={sending} onPress={actionPrimary.onPress}>{actionPrimary.label}</AppModalButton>
                ) : null}
                {showCareUpdateStatusLoading ? (
                  <View accessibilityLabel="Checking requested updates" accessibilityRole="progressbar" style={styles.careUpdateStatusLoadingButton}>
                    <Text style={styles.careUpdateStatusLoadingText}>Checking requested updates…</Text>
                  </View>
                ) : showRequiredCareUpdateAction ? (
                  <Pressable accessibilityRole="button" disabled={sending} onPress={openRequiredCareUpdateSheet} style={({ pressed }) => [styles.requiredCareUpdateButton, sending ? styles.disabledAction : null, pressed ? nativeModalStyles.pressed : null]}>
                    <Text style={styles.requiredCareUpdateButtonText}>{requiredCareUpdateActionText}</Text>
                  </Pressable>
                ) : showShareMoreUpdateAction ? (
                  <Pressable accessibilityRole="button" disabled={sending} onPress={openOptionalCareUpdateSheet} style={({ pressed }) => [styles.shareMoreUpdateBanner, pressed ? nativeModalStyles.pressed : null]}>
                    <Text style={styles.shareMoreUpdateBannerText}>Share more update</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
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
                <Image key={nativeFreshImageKey(item.uri, item.uri)} resizeMode="cover" source={{ uri: nativeFreshImageUri(item.uri, item.uri) }} style={styles.uploadImage} />
                {item.status === "uploading" ? (
                  <View pointerEvents="none" style={styles.uploadingOverlay}>
                    <NativeSpinner tone="primary" />
                    <Text style={styles.uploadingText}>{uploadProgress ?? item.progress}%</Text>
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
        {showReviewComposerCta ? (
          <View style={styles.completedReviewCtaWrap}>
            <AppModalButton disabled={sending} variant="secondary" onPress={() => setActiveSheet("review")}>Leave a Review</AppModalButton>
          </View>
        ) : null}
        {showReviewComposerCta && isRequester && !canShowComposer ? (
          <View style={styles.completedReviewCtaWrap}>
            <AppModalButton disabled={sending} onPress={openNewRequestSheet}>Book Care</AppModalButton>
          </View>
        ) : null}
        {canShowComposer ? (
          <View style={styles.composerStack}>
            {activePreviewUrl ? (
              <NativeSocialExternalLinkPreview
                linkPreview={linkPreviews[activePreviewUrl] || null}
                onOpen={(url) => { if (!navigateNativeHuddleLink(url, onNavigate)) void Linking.openURL(url); }}
                onRemove={() => {
                  setComposer((current) => stripNativeSocialExternalUrlFromText(current, activePreviewUrl));
                  setDismissedPreviewUrls((current) => new Set([...current, activePreviewUrl]));
                  setLockedPreviewUrl((current) => current === activePreviewUrl ? null : current);
                }}
                url={activePreviewUrl}
              />
            ) : null}
            <View style={styles.composerRow}>
              <View style={[nativeModalStyles.appModalComposerTray, composerFocused ? nativeModalStyles.appModalComposerTrayFocused : null]}>
                <Pressable accessibilityLabel={hasRequest && !serviceComposerDisabled ? "Add images" : "Conversation locked"} disabled={!hasRequest || serviceComposerDisabled} onPress={pickChatMedia} style={styles.attachButton}>
                  <Feather color={huddleColors.mutedText} name={hasRequest ? "image" : "lock"} size={16} />
                </Pressable>
                <AppModalField
                  accessibilityLabel="native-service-chat-composer-input"
                  editable={hasRequest && !serviceComposerDisabled}
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
              <Pressable accessibilityLabel="native-service-chat-send-button" disabled={!hasRequest || serviceComposerDisabled || (!composer.trim() && uploads.length === 0 && !activePreviewUrl)} onPress={() => void sendMessage()} style={[styles.sendButton, (!hasRequest || serviceComposerDisabled || (!composer.trim() && uploads.length === 0 && !activePreviewUrl)) ? huddleButtons.disabled : null]}>
                {sending ? <NativeSpinner tone="primary" /> : <Feather color={huddleColors.onPrimary} name="send" size={18} />}
              </Pressable>
            </View>
          </View>
        ) : null}
        </View>
        {careSaveToast ? (
          <NativeToast icon="check" message={careSaveToast} />
        ) : null}
      </View>

      {requestSheetOpen ? <RequestSheet
        countryLabel={counterpart?.providerServiceSearchCountry}
        currencyCountries={careCurrencyCountries}
        currencyOptions={counterpart?.providerServiceCurrencies}
        serviceAreas={counterpart?.providerServiceAreas}
        initialCard={requestSheetInitialCard}
        onClose={() => {
          setActiveSheet(null);
          setRequestSheetMode("current");
          setReturnToPaymentAfterScopeEdit(false);
        }}
        onReturnToPayment={() => {
          setReturnToPaymentAfterScopeEdit(false);
          setActiveSheet("payment");
        }}
        onSubmit={async (card) => {
          setReturnToPaymentAfterScopeEdit(false);
          await sendRequestFromSheet(card);
        }}
        open={requestSheetOpen}
        pets={pets}
        providerAreaName={counterpart?.providerAreaName}
        providerCurrency={counterpart?.providerCurrency}
        providerVolunteerOnly={counterpart?.providerVolunteerOnly}
        providerLocationStyles={counterpart?.providerLocationStyles}
        providerServices={counterpart?.providerServices}
        returnToPaymentAvailable={returnToPaymentAfterScopeEdit}
        submitLabel={requestSheetSubmitLabel}
      /> : null}
      {quoteSheetOpen ? <QuoteSheet
        accessToken={accessToken}
        careAgreement={serviceChat?.care_agreement || null}
        careScope={serviceChat?.care_scope || null}
        countryLabel={counterpart?.providerServiceSearchCountry}
        currencyCountries={careCurrencyCountries}
        currencyOptions={counterpart?.providerServiceCurrencies}
        carerContact={currentUserPhone}
        currentUserId={userId}
        initialCard={serviceChat?.quote_card}
        onClose={() => { dismissQuoteAutoOpen(); setActiveSheet(null); }}
        onDecline={() => setConfirmDeclineRequestOpen(true)}
        onError={(body) => setCarePopup({ title: "Care Scope", body })}
        onOpenPet={(petId) => void openPetProfile(petId)}
        onSigned={() => void load(true)}
        onSubmit={sendQuote}
        open={quoteSheetOpen}
        providerCurrency={counterpart?.providerCurrency}
        providerHasPaidRates={counterpart?.providerHasPaidRates}
        providerHasVoluntaryRates={counterpart?.providerHasVoluntaryRates}
        providerVolunteerOnly={counterpart?.providerVolunteerOnly}
        requestCard={serviceChat?.request_card || null}
        requesterName={isRequester ? currentDisplayName || "Owner" : peerName || "Owner"}
        requesterCountry={currentUserCountry}
        serviceChatId={serviceChat?.id || null}
        sessionKey={sessionKey}
      /> : null}
      {activeSheet === "payment" ? <PaymentSheet
        careAgreement={serviceChat?.care_agreement || null}
        careScope={serviceChat?.care_scope || null}
        hasCurrentAgreement={hasCurrentCareScopeAgreement(serviceChat)}
        open={activeSheet === "payment"}
        onBlocker={(body) => setCarePopup({ title: "Confirm booking", body })}
        onClose={() => setActiveSheet(null)}
        onConfirmVolunteer={confirmVolunteerBooking}
        onEditCareScope={() => {
          setActiveSheet(null);
          setReturnToPaymentAfterScopeEdit(true);
          setRequestSheetMode("current");
          requestAnimationFrame(() => setActiveSheet("request"));
        }}
        onOpenPet={(petId) => void openPetProfile(petId)}
        onOpenSupport={() => {
          setActiveSheet(null);
          onNavigate("/support");
        }}
        onUpdateCareDetails={updateOwnerCareDetails}
        onSigned={async () => {
          await load(true);
          setActiveSheet("payment");
        }}
        onPay={pay}
        quoteCard={serviceChat?.quote_card || null}
        requestCard={serviceChat?.request_card || null}
        serviceChatId={serviceChat?.id || null}
        requesterId={serviceChat?.requester_id || ""}
        providerId={serviceChat?.provider_id || ""}
        pets={pets}
        requesterCountry={currentUserCountry}
        requesterPhone={currentUserPhone}
        serviceCountry={counterpart?.providerServiceSearchCountry}
        accessToken={accessToken}
        requesterIdForPetUpdate={userId}
        sessionKey={sessionKey}
        sending={sending}
      /> : null}
      {activeSheet === "startCare" ? <StartCareSheet
        accessToken={accessToken}
        currentUserId={userId}
        open={activeSheet === "startCare"}
        onClose={() => setActiveSheet(null)}
        onError={(body) => setCarePopup({ title: "huddle Care", body })}
        onOpenHandoffProblem={() => {
          setActiveSheet(null);
          setActiveSheet("handoffProblem");
        }}
        onOpenSupport={() => {
          setActiveSheet(null);
          onNavigate("/support");
        }}
        onSubmit={submitCheckin}
        onVerifyPin={verifyStartPin}
        sessionKey={sessionKey}
        serviceChatId={serviceChat?.id || null}
        sending={sending}
      /> : null}
      {activeSheet === "careUpdate" ? <NativeCareUpdateSheet
        accessToken={accessToken}
        currentUserId={userId}
        onClose={() => { setCareUpdateSheetOptional(false); setActiveSheet(null); }}
        onError={(body) => setCarePopup({ title: "huddle Care", body })}
        onSent={(result) => {
          if (result.message && roomId && userId) {
            const confirmed: ChatMessageRow = {
              id: result.message.id,
              sender_id: result.message.sender_id,
              content: result.message.content,
              created_at: result.message.created_at,
            };
            hydrateServiceMessages([confirmed], {
              cacheRoomId: roomId,
              cacheUserId: userId,
              sessionKey,
              source: "db",
            });
            nearBottomRef.current = true;
            forceScrollToLatestRef.current = true;
            scrollServiceMessagesToLatest(true);
          }
          return load(true);
        }}
        open={activeSheet === "careUpdate"}
        ownerName={isRequester ? currentDisplayName || "Owner" : peerName || "Owner"}
        petName={careUpdatePetName}
        petNames={careUpdatePetNames}
        serviceChatId={serviceChat?.id || null}
        sessionKey={sessionKey}
        updateKind={careUpdateSheetOptional ? "optional" : careUpdateKind}
      /> : null}
      {activeSheet === "completion" ? <CompletionSheet
        canReportIssue={canReportBookingIssue}
        ctaLabel={completionCtaLabel}
        isProvider={isProvider}
        isRequester={isRequester}
        isVoluntary={isNoChargeServiceChat(serviceChat)}
        missingCareUpdateKind={isProvider && completionCareUpdateAttempted ? careUpdateKind : null}
        onClose={() => setActiveSheet(null)}
        onReportIssue={openIssueReportSheet}
        onSendUpdateFirst={() => {
          setCareUpdateSheetOptional(false);
          setActiveSheet("careUpdate");
        }}
        onSubmit={submitCompletion}
        open={activeSheet === "completion"}
        sending={sending}
      /> : null}
      {activeSheet === "issue" ? <HandoffProblemSheet
        accessToken={accessToken}
        contextPrefill={`Report Issue: Issue with ${clean(peerName) || "your booking partner"}`}
        currentUserId={userId}
        isRequester={isRequester}
        isVoluntary={isNoChargeServiceChat(serviceChat)}
        mode="issueReport"
        onClose={() => setActiveSheet(null)}
        onError={(body) => setCarePopup({ title: "huddle Care", body })}
        onSubmit={submitIssueReport}
        open={activeSheet === "issue"}
        sending={sending}
        serviceChatId={serviceChat?.id || null}
        sessionKey={sessionKey}
      /> : null}
      {activeSheet === "handoffProblem" ? <HandoffProblemSheet
        accessToken={accessToken}
        contextPrefill={handoffReportContext}
        currentUserId={userId}
        mode="provider"
        onClose={() => { setHandoffReportContext(null); setActiveSheet(null); }}
        onError={(body) => setCarePopup({ title: "Handoff problem", body })}
        onSubmit={submitHandoffProblem}
        open={activeSheet === "handoffProblem"}
        sending={sending}
        serviceChatId={serviceChat?.id || null}
        sessionKey={sessionKey}
      /> : null}
      {activeSheet === "handoffRequesterProblem" ? <HandoffProblemSheet
        accessToken={accessToken}
        contextPrefill={handoffReportContext}
        currentUserId={userId}
        mode="requesterReport"
        onClose={() => { setHandoffReportContext(null); setActiveSheet(null); }}
        onError={(body) => setCarePopup({ title: "Handoff problem", body })}
        onSubmit={submitHandoffProblem}
        open={activeSheet === "handoffRequesterProblem"}
        sending={sending}
        serviceChatId={serviceChat?.id || null}
        sessionKey={sessionKey}
      /> : null}
      {activeSheet === "handoffResponse" ? <HandoffProblemSheet
        accessToken={accessToken}
        currentUserId={userId}
        mode="requesterResponse"
        onClose={() => setActiveSheet(null)}
        onError={(body) => setCarePopup({ title: "Handoff response", body })}
        onSubmit={(_, note, evidenceUrls) => submitRequesterHandoffResponse(note, evidenceUrls)}
        open={activeSheet === "handoffResponse"}
        sending={sending}
        serviceChatId={serviceChat?.id || null}
        sessionKey={sessionKey}
      /> : null}
      {activeSheet === "noStartReport" ? <HandoffProblemSheet
        accessToken={accessToken}
        currentUserId={userId}
        isRequester={isRequester}
        mode={isRequester ? "ownerNoStart" : "carerNoStart"}
        onClose={() => setActiveSheet(null)}
        onError={(body) => setCarePopup({ title: "No-start report", body })}
        onSubmit={submitNoStartReport}
        open={activeSheet === "noStartReport"}
        sending={sending}
        serviceChatId={serviceChat?.id || null}
        sessionKey={sessionKey}
      /> : null}
      {activeSheet === "review" ? <ReviewSheet accessToken={accessToken} currentUserId={userId} hasReportedServiceDispute={hasReportedServiceDispute} isRequester={isRequester} isVoluntary={isNoChargeServiceChat(serviceChat)} open={activeSheet === "review"} onClose={() => setActiveSheet(null)} onSubmit={submitReview} serviceChatId={serviceChat?.id || null} sessionKey={sessionKey} /> : null}
      <CareHistorySheet
        currentUserId={userId}
        focusServiceChatId={params.historyService || null}
        loading={careHistoryLoading}
        paymentMovementByServiceId={carePaymentMovementByServiceId}
        rows={allCareHistoryRows}
        onClose={closeCareHistory}
        onOpenCareAgreement={(chat) => void openCareAgreementPdf(chat, "history")}
        onOpenPet={openPetProfile}
        open={careHistoryOpen}
        ownerName={isRequester ? currentDisplayName || "Owner" : peerName || "Owner"}
        providerName={isProvider ? currentDisplayName || "Provider" : peerName || "Provider"}
      />
      {menuOpen ? (
        <Modal animationType="fade" onRequestClose={() => setMenuOpen(false)} presentationStyle="overFullScreen" statusBarTranslucent transparent visible>
          <Pressable style={[styles.inlineSheetLayer, nativeModalStyles.appModalBackdrop]} onPress={() => setMenuOpen(false)}>
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={[styles.headerActionMenuAnchor, menuAnchorPosition]}
            >
              <AppActionMenu items={menuItems} />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
      <AppDestructiveSlideConfirm
        body={blockState === "blocked_by_me" ? "Allow this user to send you messages again?" : "You will no longer see their posts or alerts, and they won't be able to interact with you directly in Chats."}
        onClose={() => setConfirmBlockOpen(false)}
        onConfirm={() => void toggleBlock()}
        open={confirmBlockOpen}
        presentation="inline"
        slideLabel={`Slide to ${blockState === "blocked_by_me" ? "Unblock" : "Block"}`}
        title={blockState === "blocked_by_me" ? `Unblock ${peerName}?` : `Block ${peerName}?`}
      />
      <AppNoticeModal
        body="You can block this user after the care session and any open case are resolved. You can still report an issue or contact Support now."
        onClose={() => setBlockUnavailableNoticeOpen(false)}
        open={blockUnavailableNoticeOpen}
        title="Blocking unavailable"
      />
      <AppDestructiveSlideConfirm
        body={`This will cancel your inquiry for ${clean(serviceChat?.request_card?.serviceType) || "care"} with ${peerName}. You can send a new request if your plans change.`}
        onClose={() => setConfirmWithdrawRequestOpen(false)}
        onConfirm={() => {
          setConfirmWithdrawRequestOpen(false);
          void withdrawRequest();
        }}
        open={confirmWithdrawRequestOpen}
        presentation="inline"
        slideLabel="Slide to Withdraw"
        title="Withdraw this request?"
      />
      <AppDestructiveSlideConfirm
        body={`This will decline ${clean(serviceChat?.request_card?.serviceType) || "this care request"} and return this chat to a new quote state. The owner can send a new request later.`}
        onClose={() => setConfirmDeclineRequestOpen(false)}
        onConfirm={() => {
          setConfirmDeclineRequestOpen(false);
          void declineCareRequest();
        }}
        open={confirmDeclineRequestOpen}
        presentation="inline"
        slideLabel="Slide to Decline"
        title="Decline this care request?"
      />
      {confirmCancelBookingOpen ? (
      <View pointerEvents="box-none" style={styles.inlineSheetLayer}>
        <Pressable accessibilityLabel="Close cancel booking sheet" accessibilityRole="button" onPress={() => { if (!sending) setConfirmCancelBookingOpen(false); }} style={nativeModalStyles.appModalBackdrop} />
        <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} pointerEvents="box-none" style={[nativeModalStyles.appModalBottomSafeArea, nativeModalStyles.appBottomSheetEventBoundary]}>
          <AppBottomSheet mode="large" onClose={() => { if (!sending) setConfirmCancelBookingOpen(false); }}>
            <AppBottomSheetHeader>
              <Text style={nativeModalStyles.appModalSheetTitle}>{isProvider ? "Cancel Care Booking" : "Cancel booking"}</Text>
              <AppModalCloseButton onPress={sending ? () => undefined : () => setConfirmCancelBookingOpen(false)} />
            </AppBottomSheetHeader>
            <AppBottomSheetScroll contentContainerStyle={styles.paymentBody}>
              {isRequester ? (
                <AppModalSelectField
                  label="Issue"
                  labelStyle={styles.requestCreateLabel}
                  open={cancelIssueSelectOpen}
                  options={[...CANCEL_BOOKING_ISSUES]}
                  placeholder="Select an issue"
                  value={cancelBookingReason}
                  onSelect={(value) => { setCancelBookingReason(value as (typeof CANCEL_BOOKING_ISSUES)[number]); setCancelIssueSelectOpen(false); }}
                  onToggle={() => setCancelIssueSelectOpen((value) => !value)}
                />
              ) : null}
              <View style={nativeModalStyles.appModalFieldBlock}>
                <Text style={styles.requestCreateLabel}>Reason</Text>
                <AppModalField focused={cancelReasonFocused} multiline onBlur={() => setCancelReasonFocused(false)} onChangeText={setCancelBookingNote} onFocus={() => setCancelReasonFocused(true)} style={styles.completionNoteField} value={cancelBookingNote} />
              </View>
              {isProvider ? (
                <View style={nativeModalStyles.appModalFieldBlock}>
                  <AppModalButton disabled={cancelEvidenceMedia.length >= MAX_CARE_REPORT_EVIDENCE} onPress={pickCancelEvidence}>
                    <View style={styles.evidenceButtonRow}>
                      <Feather color={huddleColors.onPrimary} name="camera" size={18} />
                      <Text style={nativeModalStyles.appModalButtonText}>{cancelEvidenceMedia.length > 0 ? `Add Photos (${cancelEvidenceMedia.length}/10)` : "Add Supporting Photos"}</Text>
                    </View>
                  </AppModalButton>
                  {cancelEvidenceMedia.length > 0 ? (
                    <ScrollView bounces={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reviewMediaThumbRow} style={styles.reviewMediaRailViewport}>
                      {cancelEvidenceMedia.map((item, index) => (
                        <View key={`${item.uri}-${index}`} style={[styles.reviewMediaThumbWrap, { aspectRatio: 1 }]}>
                          <ExpoImage contentFit="cover" key={nativeFreshImageKey(item.uri, item.uri)} source={{ uri: nativeFreshImageUri(item.uri, item.uri) }} style={styles.reviewMediaThumb} />
                          <Pressable accessibilityLabel={`Remove supporting photo ${index + 1}`} accessibilityRole="button" onPress={() => setCancelEvidenceMedia((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={styles.reviewMediaRemoveButton}><Feather color={huddleColors.onPrimary} name="x" size={14} /></Pressable>
                        </View>
                      ))}
                    </ScrollView>
                  ) : null}
                </View>
              ) : null}
              <View style={styles.paymentInfoBox}>
                <Text style={styles.paymentInfoTitle}>{isProvider ? "Before you continue" : "Cancellation"}</Text>
                <Text style={styles.paymentInfoText}>{cancelPolicy.body}</Text>
                {showCancelReportIssueLink ? (
                  <Pressable accessibilityRole="button" onPress={() => { setHandoffReportContext(`Cancel Booking: Issue with ${clean(peerName) || "your booking partner"}`); setConfirmCancelBookingOpen(false); setActiveSheet(isRequester ? "handoffRequesterProblem" : "handoffProblem"); }} style={styles.cancelReportIssueButton}>
                    <Text style={styles.cancelReportIssueText}>Report Issue</Text>
                  </Pressable>
                ) : null}
              </View>
            </AppBottomSheetScroll>
            <AppBottomSheetFooter>
              <SlideToConfirm busy={sending || cancelEvidenceUploading} label={`Slide to ${cancelPolicy.confirmLabel}`} onCommit={() => { setConfirmCancelBookingOpen(false); void cancelPaidBooking(); }} resetKey={cancelSlideResetKey} tone="destructive" />
            </AppBottomSheetFooter>
          </AppBottomSheet>
        </KeyboardAvoidingView>
      </View>
      ) : null}
      <AppConfirmModal
        body="Only continue after your pet has been handed over or the carer has access to the care location. This shares the 4-digit Start PIN with your carer."
        cancelLabel="Not yet"
        confirmLabel="Start Care"
        loading={sending}
        onCancel={() => setConfirmOwnerStartCareOpen(false)}
        onConfirm={() => {
          setConfirmOwnerStartCareOpen(false);
          void performShareStartPin();
        }}
        open={confirmOwnerStartCareOpen}
        presentation="modal"
        title="Start Care?"
      />
      <AppConfirmModal
        body={carePopup?.body || ""}
        cancelLabel={null}
        confirmLabel="OK"
        onCancel={() => setCarePopup(null)}
        onConfirm={() => setCarePopup(null)}
        open={Boolean(carePopup)}
        presentation="modal"
        title={carePopup?.title || "huddle Care"}
      />
      <NativeSocialReportModal
        accessToken={accessToken}
        currentUserId={userId}
        chatRoomId={roomId || null}
        onClose={() => setReportOpen(false)}
        onNotice={setNotice}
        open={reportOpen}
        sessionKey={sessionKey}
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
        viewerUserId={userId}
        fallbackData={counterpartToProfileFallback(counterpart)}
        hideActions
        hideMatchedActions
        onClose={() => setProfileSheetUserId(null)}
        onNavigate={onNavigate}
        open={Boolean(profileSheetUserId)}
        sessionKey={sessionKey ?? null}
        profileUserId={profileSheetUserId}
      />
      {providerProfileOpen ? (
        <View style={[styles.inlineSheetLayer, nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea, styles.profileModalSafeArea, { paddingTop: huddleSpacing.x4, paddingBottom: insets.bottom }]}>
          <Pressable accessibilityLabel="Close provider profile" accessibilityRole="button" onPress={closeProviderProfile} style={StyleSheet.absoluteFill} />
          <Animated.View style={[styles.profileModalCard, providerDragStyle]}>
            <View collapsable={false} {...providerPullDownResponder.panHandlers}>
              <AppBottomSheetHeader>
                <Text numberOfLines={1} style={nativeModalStyles.appModalSheetTitle}>Pet Carer Profile</Text>
                <AppModalCloseButton onPress={closeProviderProfile} />
              </AppBottomSheetHeader>
            </View>
            <ScrollView bounces={false} contentContainerStyle={styles.profileModalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.profileModalScroll}>
              {providerProfileError ? <View style={styles.detailState}><Text style={styles.waitText}>{providerProfileError}</Text></View> : providerProfile ? <NativeCarerProfileContent provider={providerProfile} accessToken={accessToken} /> : providerProfileLoading ? <View style={styles.detailState}><NativeLoadingState variant="inline" /></View> : null}
            </ScrollView>
          </Animated.View>
        </View>
      ) : null}
      {careAgreementOpen ? (
        <View style={[styles.inlineSheetLayer, nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]}>
          <Pressable accessibilityLabel="Close Care Agreement" accessibilityRole="button" onPress={() => setCareAgreementOpen(false)} style={StyleSheet.absoluteFill} />
          <View style={styles.termsModalBoundary}>
            <View style={styles.termsModalCard}>
              <View style={styles.termsModalHeader}>
                <Text style={styles.termsModalTitle}>Care Agreement</Text>
                <View style={styles.headerActions}>
                  <AppModalIconButton accessibilityLabel="Open Care Agreement PDF" disabled={!careAgreementPdfUrl || careAgreementDownloading} onPress={() => { void openCareAgreementLocalPdf(); }}>
                    <Feather color={careAgreementPdfUrl && !careAgreementDownloading ? huddleColors.blue : huddleColors.mutedText} name={careAgreementDownloading ? "loader" : "download"} size={22} />
                  </AppModalIconButton>
                  <AppModalIconButton accessibilityLabel="Close Care Agreement" onPress={() => setCareAgreementOpen(false)}>
                    <Feather color={huddleColors.text} name="x" size={24} />
                  </AppModalIconButton>
                </View>
              </View>
              <ScrollView contentContainerStyle={styles.termsSheetContent} style={styles.termsSheetScroll}>
                {!careAgreementPdfUrl ? (
                  <View style={styles.agreementPendingNote}>
                    <Feather color={huddleColors.blue} name="clock" size={14} />
                    <Text style={styles.agreementPendingText}>Preparing your signed agreement — you can save the PDF here once it’s ready.</Text>
                  </View>
                ) : null}
                <Text style={styles.termsLegalTitle}>Parties &amp; platform role</Text>
                <Text style={styles.termsSheetText}>This Care Agreement is a direct agreement between the owner and the carer. Huddle operates the platform — booking, payments, messaging, and safety tooling — and is not the care provider, not an employer or agent of the carer, and not a party to the care itself. The carer acts as an independent party responsible for the care delivered. To the fullest extent permitted by law, Huddle is not liable for the acts, omissions, or outcomes of the care arranged through the platform.</Text>
                <Text style={styles.termsLegalTitle}>Confirmed Care Scope</Text>
                <PaymentCareScopeSummary bookingSnapshot={serviceChat?.booking_snapshot || null} careDetails={serviceChat?.care_scope?.careDetails || null} careScope={serviceChat?.care_scope || null} carerContact={carerContactFromCareDetails(serviceChat?.care_scope?.careDetails || null)} onOpenPet={(petId) => void openPetProfile(petId)} paymentMovement={serviceChat?.id ? carePaymentMovementByServiceId[serviceChat.id]?.[0] || null : null} quoteCard={serviceChat?.quote_card || null} requestCard={serviceChat?.request_card || null} showCarerContact={bookingHasConfirmed(serviceChat)} showPaymentLine viewerRole={isProvider ? "provider" : "requester"} />
                {!isNoChargeServiceChat(serviceChat) ? (
                  <>
                    <Text style={styles.termsLegalTitle}>{isProvider ? "Cancellation Policy" : "Cancellation & refunds"}</Text>
                    <Text style={styles.termsSheetText}>
                      {isProvider
                        ? "More than 24 hours before care — cancellation is recorded and may affect how often your profile appears. Within 24 hours — Care access may be restricted while huddle reviews. Confirmed no-shows or serious reliability issues may suspend Care access."
                        : "More than 72 hours before care starts — full refund. 24 to 72 hours before — 50% refund; huddle retains the remaining 50%. Less than 24 hours before — the booking is final and non-refundable."}
                    </Text>
                  </>
                ) : null}
                <Text style={styles.termsLegalTitle}>Terms &amp; consent</Text>
                <Text style={styles.termsSheetText}>Both parties accepted the Huddle Booking Terms{clean(serviceChat?.booking_snapshot?.agreedAt) ? ` on ${formatTimelineStepDate(serviceChat?.booking_snapshot?.agreedAt)}` : ""}. Signatures are retained as evidence of intent and to support dispute resolution; they are not a certified electronic signature.</Text>
                <Text style={styles.termsLegalTitle}>Signatures</Text>
                <View style={styles.agreementSignRow}>
                  <Feather color={serviceChat?.care_agreement?.requesterSignedAt ? huddleColors.success : huddleColors.mutedText} name={serviceChat?.care_agreement?.requesterSignedAt ? "check-circle" : "circle"} size={15} />
                  <Text style={styles.termsSheetText}>Owner — {serviceChat?.care_agreement?.requesterSignedAt ? `signed ${formatTimelineStepDate(serviceChat?.care_agreement?.requesterSignedAt)}` : "awaiting signature"}</Text>
                </View>
                <View style={styles.agreementSignRow}>
                  <Feather color={serviceChat?.care_agreement?.providerSignedAt ? huddleColors.success : huddleColors.mutedText} name={serviceChat?.care_agreement?.providerSignedAt ? "check-circle" : "circle"} size={15} />
                  <Text style={styles.termsSheetText}>Carer — {serviceChat?.care_agreement?.providerSignedAt ? `signed ${formatTimelineStepDate(serviceChat?.care_agreement?.providerSignedAt)}` : "awaiting signature"}</Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function BookingCards({
  allowAgreementPdfFromAgreement = false,
  canHide = false,
  chat,
  currencyCountries,
  providerCurrency,
  historyContent,
  hideActions = false,
  isProvider,
  isRequester,
  ownerName,
  sending,
  onHide,
  onOpenPet,
  onOpenCareAgreement,
  onEditRequest,
  onWithdrawRequest,
  onEditQuote,
  providerName,
  underReview,
  footerHeight = 0,
}: {
  allowAgreementPdfFromAgreement?: boolean;
  canHide?: boolean;
  chat: ServiceChatRow;
  currencyCountries?: unknown[];
  providerCurrency?: string;
  historyContent?: ReactNode;
  hideActions?: boolean;
  isProvider: boolean;
  isRequester: boolean;
  ownerName: string;
  sending: boolean;
  onHide?: () => void;
  onOpenCareAgreement?: () => void;
  onOpenPet?: (petId: string) => void;
  onEditRequest: () => void;
  onWithdrawRequest: () => void;
  onEditQuote: () => void;
  providerName: string;
  underReview?: boolean;
  // Measured height of the pinned footer (CTA + composer). Used only on small screens to cap
  // the expanded detail so it can't slide under the footer.
  footerHeight?: number;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const [requestExpanded, setRequestExpanded] = useState(false);
  const [summaryPage, setSummaryPage] = useState<"scope" | "instruction">("scope");
  // Collapse before running a scope action (Update date / Review & sign / Withdraw) so the
  // card doesn't stay expanded underneath whatever sheet the action opens.
  const runScopeAction = useCallback((action: () => void) => {
    setRequestExpanded(false);
    requestAnimationFrame(action);
  }, []);
  // The expanded detail scrolls internally, capped so it can't grow unboundedly.
  //   • Normal phones: the cap is windowHeight * 0.45 — UNCHANGED from before.
  //   • Small phones (SE etc): if 0.45 would let the detail slide under the pinned footer,
  //     we take the SMALLER of 0.45 and the real space between the detail's top (measured in
  //     window coords) and the footer's top. min() means normal phones always keep 0.45 (their
  //     real space is larger), and only tight screens shrink to fit above the CTA. A one-frame
  //     stale measurement only nudges the scroll size — it can't misplace anything.
  const detailWrapRef = useRef<View>(null);
  const [detailTopY, setDetailTopY] = useState(0);
  const measureDetailTop = useCallback(() => {
    detailWrapRef.current?.measureInWindow((_x, y) => { if (Number.isFinite(y) && y > 0) setDetailTopY(y); });
  }, []);
  const inlineCap = windowHeight * 0.45;
  const availableAboveFooter = (windowHeight - footerHeight) - detailTopY - huddleSpacing.x4;
  const scopeDetailMaxHeight = Math.max(220, detailTopY > 0 && footerHeight > 0 ? Math.min(inlineCap, availableAboveFooter) : inlineCap);
  const expanded = requestExpanded;
  const requestCard = chat.request_card;
  const quoteCard = chat.quote_card;
  const visibleScopeCard = requestCardWithCareScopeUpdates(requestCard, quoteCard, chat.care_scope?.actorRole);
  const careInstructionDetails = chat.care_scope?.careDetails || null;
  const hasCareInstruction = hasCareInstructionDetails(careInstructionDetails);
  useEffect(() => {
    if (!hasCareInstruction && summaryPage === "instruction") setSummaryPage("scope");
  }, [hasCareInstruction, summaryPage]);
  if (!visibleScopeCard && !quoteCard && chat.status !== "disputed") return null;
  const serviceLabel = Array.isArray(visibleScopeCard?.serviceTypes) && visibleScopeCard?.serviceTypes.length ? visibleScopeCard.serviceTypes.join("・") : clean(visibleScopeCard?.serviceType) || clean(quoteCard?.serviceType) || "—";
  const locationStyles = visibleScopeCard?.locationStyles?.length ? visibleScopeCard.locationStyles : quoteCard?.locationStyles || [];
  const locationArea = clean(visibleScopeCard?.locationArea) || clean(quoteCard?.locationArea);
  const locationStyleLabel = locationStyles.length ? locationStyles.join(", ") : "";
  const quoteIsNoChargeVoluntary = isNoChargeVisibleScope(visibleScopeCard, quoteCard, chat.care_scope?.actorRole);
  const quoteCurrency = careCurrencyFromScopeOnly(null, visibleScopeCard);
  const { requesterTotal, providerPayout } = frozenOrLiveCarePayment(chat.booking_snapshot, null, visibleScopeCard, quoteIsNoChargeVoluntary);
  const scopePets = visibleScopeCard ? requestCardPets(visibleScopeCard) : quoteCard ? requestCardPets(quoteCard) : [];
  const scopeTasks = normalizeCareTaskList(visibleScopeCard?.scopeTasks).length ? normalizeCareTaskList(visibleScopeCard?.scopeTasks) : normalizeCareTaskList(quoteCard?.scopeTasks);
  const scopeFrequency = clean(visibleScopeCard?.scopeFrequency) || clean(quoteCard?.scopeFrequency);
  const otherTasks = clean(visibleScopeCard?.otherTasks) || clean(quoteCard?.otherTasks);
  const updatePreferenceLabel = normalizeUpdatePreference(visibleScopeCard?.updatePreference);
  // History is rendered from the agreement snapshot. Some older payment snapshots
  // predate `agreedAt`; the two recorded signatures are the legal fallback.
  const agreedAt = clean(chat.booking_snapshot?.agreedAt)
    || latestIso(chat.care_agreement?.requesterSignedAt, chat.care_agreement?.providerSignedAt);
  const collapsedShortDate = formatShortDateRange(visibleScopeCard?.requestedDates, visibleScopeCard?.requestedDate);
  const collapsedWhereLine = [collapsedShortDate || null, locationArea || null].filter(Boolean).join(" · ");
  const requestExpired = isPendingRequestExpired(chat);
  const expiryHelperText = isRequester
    ? "This care date has passed. Update the date or withdraw this request."
    : "This care request has expired. Waiting for the owner to update the date or withdraw it.";
  // Once the scheduled care period has passed, the Care Scope it documents is no
  // longer a live, actionable agreement -- hide the PDF entirely rather than let it
  // imply the booking is still upcoming.
  const careScheduleHasPassed = hasServicePeriodPassed(visibleScopeCard);
  const cancelledHistoryRow = isCancelledServiceChatRow(chat);
  const careAgreementReady = !cancelledHistoryRow && (allowAgreementPdfFromAgreement
    ? careAgreementHasPdf(chat.care_agreement)
    : !careScheduleHasPassed && Boolean(
      careAgreementHasSignedParties(chat.care_agreement)
      && hasCurrentCareScopeAgreement(chat)
      && hasMandatoryCareInstructionDetails(careInstructionDetails)
    ));
  // Scope shortcut icons (Update date / Review & sign / Withdraw) sit in the card header next
  // to the chevron — bare icons, no chrome — so they're reachable without expanding first.
  const showScopeActions = !hideActions && !underReview && (isRequester || isProvider) && chat.status === "pending";
  const showUpdateDateAction = showScopeActions && isRequester && requestExpired;
  const showReviewSignAction = showScopeActions && isProvider && !requestExpired && !chat.care_scope?.carerSigned;
  // Withdraw must always be reachable pre-payment, not just before a quote exists --
  // withdraw_service_request already clears both request_card and quote_card back to
  // a clean "no scope" state, and only fails if a payment is actively in flight.
  const showWithdrawAction = showScopeActions && isRequester;
  return (
    <View style={styles.bookingCardsRoot}>
      {visibleScopeCard ? (
        <View
          style={[styles.glassCard, styles.careScopeElevated, !expanded ? styles.glassCardCollapsed : null]}
        >
          <LinearGradient
            colors={[huddleColors.glassOverlay, huddleColors.canvas]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {/* One strip for the whole card — header, expanded detail, and action row all live
              in this same container, so there's no seam between separately-rendered pieces. */}
          <View style={[styles.phaseStrip, { backgroundColor: underReview ? huddleColors.validationRed : huddleColors.blueLight }]} pointerEvents="none" />
          <Pressable
            accessibilityLabel={expanded ? "Collapse request details" : "Expand request details"}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            hitSlop={huddleSpacing.x1}
            onPress={() => {
              setRequestExpanded((value) => !value);
            }}
            style={({ pressed }) => [styles.glassCardInner, !expanded ? styles.careScopeCollapsedHeader : styles.glassCardInnerExpanded, pressed ? nativeModalStyles.pressed : null]}
          >
            <View style={styles.scopeHeadlineBlock}>
              <View style={styles.scopeHeaderTopRow}>
                <View style={[styles.scopeHeadlineCopy, styles.paymentScopeHeadlineCopy]}>
                  <Text numberOfLines={1} style={styles.timelineCurrentLabel}>{serviceLabel || "Care Scope"} with </Text>
                  <PetAvatarStack pets={scopePets} size={22} />
                </View>
                <View style={styles.scopeHeaderActions}>
                  {showUpdateDateAction ? (
                    <Pressable accessibilityLabel="Update care date" hitSlop={huddleSpacing.x2} onPress={(event) => { event.stopPropagation(); runScopeAction(onEditRequest); }} style={({ pressed }) => [styles.scopeIconAction, pressed ? nativeModalStyles.pressed : null]}>
                      <Feather color={huddleColors.blue} name="edit-2" size={18} />
                    </Pressable>
                  ) : null}
                  {showReviewSignAction ? (
                    <Pressable accessibilityLabel="Review and sign care scope" hitSlop={huddleSpacing.x2} onPress={(event) => { event.stopPropagation(); runScopeAction(onEditQuote); }} style={({ pressed }) => [styles.scopeIconAction, pressed ? nativeModalStyles.pressed : null]}>
                      <Feather color={huddleColors.blue} name="edit-3" size={18} />
                    </Pressable>
                  ) : null}
                  {showWithdrawAction ? (
                    <Pressable accessibilityLabel="Withdraw request" disabled={sending} hitSlop={huddleSpacing.x2} onPress={(event) => { event.stopPropagation(); runScopeAction(onWithdrawRequest); }} style={({ pressed }) => [styles.scopeIconAction, pressed ? nativeModalStyles.pressed : null, sending ? styles.disabledAction : null]}>
                      <Feather color={huddleColors.validationRed} name="rotate-ccw" size={18} />
                    </Pressable>
                  ) : null}
                  <Feather color={huddleColors.iconMuted} name={expanded ? "chevron-up" : "chevron-down"} size={18} />
                </View>
              </View>
              {collapsedWhereLine || cancelledHistoryRow || careAgreementReady || (canHide && onHide) ? <View style={styles.scopeHeaderBottomRow}>
                {collapsedWhereLine ? <Text numberOfLines={1} style={[styles.scopeSubtitle, requestExpired ? { color: huddleColors.validationRed } : null]}>{collapsedWhereLine}</Text> : <View style={styles.scopeHeaderBottomSpacer} />}
                <View style={styles.scopeUtilityActions}>
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
                  {cancelledHistoryRow ? (
                    <View style={[styles.careAgreementBadge, styles.careAgreementBadgeCompact, styles.cancelledCareBadge]}>
                      <Feather color={huddleColors.onPrimary} name="x-circle" size={12} />
                      <Text style={styles.careAgreementBadgeText}>Cancelled</Text>
                    </View>
                  ) : careAgreementReady ? (
                    <Pressable accessibilityRole="button" onPress={(event) => { event.stopPropagation(); onOpenCareAgreement?.(); }} style={({ pressed }) => [styles.careAgreementBadge, styles.careAgreementBadgeCompact, pressed ? nativeModalStyles.pressed : null]}>
                      <Feather color={huddleColors.onPrimary} name="file-text" size={12} />
                      <Text style={styles.careAgreementBadgeText}>See Agreement</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View> : null}
              {requestExpired ? <Text style={styles.errorText}>{expiryHelperText}</Text> : null}
            </View>
          </Pressable>
          {!expanded && hasCareInstruction ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSummaryPage("instruction");
                setRequestExpanded(true);
              }}
              style={({ pressed }) => [styles.careInstructionNavRow, pressed ? nativeModalStyles.pressed : null]}
            >
              <Text style={styles.careInstructionNavText}>See Care Instruction</Text>
              <Feather color={huddleColors.blue} name="chevron-right" size={18} />
            </Pressable>
          ) : null}
          {expanded ? (
            <View ref={detailWrapRef} onLayout={measureDetailTop}>
            <ScrollView
              bounces={false}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: scopeDetailMaxHeight }}
              contentContainerStyle={styles.scopeExpandedBody}
            >
                {summaryPage === "instruction" && hasCareInstruction ? (
                  <>
                    <View style={styles.scopeHairline} />
                    <View style={styles.scopeDetailGrid}>
                      <CareInstructionDetailRows details={careInstructionDetails} showCarerContact={bookingHasConfirmed(chat)} />
                    </View>
                    <Pressable accessibilityRole="button" onPress={() => setSummaryPage("scope")} style={({ pressed }) => [styles.careInstructionNavRow, pressed ? nativeModalStyles.pressed : null]}>
                      <Feather color={huddleColors.blue} name="chevron-left" size={18} />
                      <Text style={styles.careInstructionNavText}>Back to Care Scope</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <View style={styles.scopeHairline} />

                  <SelectedPetPolaroid requestCard={visibleScopeCard} onOpenPet={onOpenPet} />

                  <View style={styles.scopeDetailGrid}>
                    <ScopeDetailRow label="Time">
                      {visibleScopeCard.startTime || "—"} – {visibleScopeCard.endTime || "—"}
                    </ScopeDetailRow>
                    {formatCareScopeSetting(locationStyles, locationArea) ? (
                      <ScopeDetailRow label="Setting">{formatCareScopeSetting(locationStyles, locationArea)}</ScopeDetailRow>
                    ) : null}
                    {[scopeTasks.join(", "), otherTasks].filter(Boolean).join(", ") ? (
                      <ScopeDetailRow label="Care tasks">{[scopeTasks.join(", "), otherTasks].filter(Boolean).join(", ")}</ScopeDetailRow>
                    ) : null}
                    <ScopeDetailRow label="Updates preference">{updatePreferenceLabel}</ScopeDetailRow>
                    {scopeFrequency ? (
                      <ScopeDetailRow label="Walks per day">{scopeFrequency}</ScopeDetailRow>
                    ) : null}
                    {agreedAt ? (
                      <ScopeDetailRow label="Booking terms">Agreed - {formatTimelineStepDate(agreedAt)}</ScopeDetailRow>
                    ) : null}
                    {!quoteIsNoChargeVoluntary && (quoteCard || visibleScopeCard.suggestedPrice) ? (
                      <ScopeDetailRow label={isProvider ? "Payout" : "Payment"}>
                        {isProvider ? formatMoney(quoteCurrency, providerPayout) : formatMoney(quoteCurrency, requesterTotal)}
                      </ScopeDetailRow>
                    ) : !quoteIsNoChargeVoluntary && visibleScopeCard.suggestedPrice ? (
                      <ScopeDetailRow label="Offer">
                        {[`${quoteCurrency ? formatNativeCareCurrencySymbol(quoteCurrency) : ""}${visibleScopeCard.suggestedPrice}`, formatRateUnit(visibleScopeCard.suggestedRate)].filter(Boolean).join(" ")}
                      </ScopeDetailRow>
                    ) : null}
                  </View>
                  {hasCareInstruction ? (
                    <Pressable accessibilityRole="button" onPress={() => setSummaryPage("instruction")} style={({ pressed }) => [styles.careInstructionNavRow, pressed ? nativeModalStyles.pressed : null]}>
                      <Text style={styles.careInstructionNavText}>See Care Instruction</Text>
                      <Feather color={huddleColors.blue} name="chevron-right" size={18} />
                    </Pressable>
                  ) : null}
                  </>
                )}

              {summaryPage === "scope" && quoteCard?.note ? (
                <>
                  <View style={styles.scopeHairline} />
                  <View style={styles.scopeNoteBlock}>
                    <Text style={styles.scopeEyebrowText}>Note</Text>
                    <Text style={styles.scopeNoteText}>{quoteCard.note}</Text>
                  </View>
                </>
              ) : null}

              {summaryPage === "scope" && historyContent ? (
                <>
                  <View style={styles.scopeHairline} />
                  {historyContent}
                </>
              ) : null}

            </ScrollView>
            </View>
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

function CareInstructionDetailRows({
  carerContact,
  details,
  showCarerContact = false,
}: {
  carerContact?: string | null;
  details?: CareScopeCareDetails | null;
  showCarerContact?: boolean;
}) {
  const vetAuthorization = careInstructionVetAuthorizationLabel(details);
  const handoffLocation = clean(details?.handoffLocation);
  const ownerContact = ownerContactFromCareDetails(details);
  const visibleCarerContact = clean(carerContact) || carerContactFromCareDetails(details);
  return (
    <>
      {ownerContact ? <ScopeDetailRow label="Owner's Contact">{ownerContact}</ScopeDetailRow> : null}
      {showCarerContact && visibleCarerContact ? <ScopeDetailRow label="Carer's Contact">{visibleCarerContact}</ScopeDetailRow> : null}
      {clean(details?.emergencyContact) ? <ScopeDetailRow label="Emergency Contact">{clean(details?.emergencyContact)}</ScopeDetailRow> : null}
      {handoffLocation ? <ScopeDetailRow label="Hand-off Location">{handoffLocation}</ScopeDetailRow> : null}
      {clean(details?.careInstructions) ? <ScopeDetailRow label="Care Instructions">{clean(details?.careInstructions)}</ScopeDetailRow> : null}
      {clean(details?.medicationAllergyNotes) ? <ScopeDetailRow label="Medication / Allergies">{clean(details?.medicationAllergyNotes)}</ScopeDetailRow> : null}
      {clean(details?.behaviorEscapeRisk) ? <ScopeDetailRow label="Behavior / Escape Risk">{clean(details?.behaviorEscapeRisk)}</ScopeDetailRow> : null}
      {vetAuthorization ? <ScopeDetailRow label={"Emergency\nVet Care"}>{vetAuthorization}</ScopeDetailRow> : null}
      {clean(details?.emergencyVetContact) ? <ScopeDetailRow label="Preferred Vet Contact">{clean(details?.emergencyVetContact)}</ScopeDetailRow> : null}
    </>
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

function ServiceActionCard({
  body,
  children,
  collapsed,
  headerRight,
  icon,
  locked,
  onToggle,
  staticCard = false,
  title,
  warningBody = false,
}: {
  body?: string;
  children?: ReactNode;
  collapsed: boolean;
  headerRight?: ReactNode;
  icon?: ReactNode;
  locked?: boolean;
  onToggle: () => void;
  // staticCard: no collapse chevron, content always shown. Used for the status banners which
  // are just "header" or "header + button" — nothing to collapse.
  staticCard?: boolean;
  title: string;
  warningBody?: boolean;
}) {
  const isCollapsed = staticCard ? false : (locked || collapsed);
  return (
    <View style={[styles.paymentInfoBox, styles.serviceActionCard]}>
      <View style={styles.serviceActionCardHeader}>
        <View style={styles.serviceActionTitleWrap}>
          {icon}
          <Text style={styles.paymentInfoTitle}>{title}</Text>
        </View>
        {headerRight}
        {locked || staticCard ? null : (
          <Pressable accessibilityLabel={isCollapsed ? "Expand action card" : "Collapse action card"} accessibilityRole="button" hitSlop={huddleSpacing.x2} onPress={onToggle} style={styles.serviceActionCollapseButton}>
            <Feather color={huddleColors.blue} name={isCollapsed ? "chevron-up" : "chevron-down"} size={20} />
          </Pressable>
        )}
      </View>
      {!isCollapsed ? (
        <>
          {body ? <Text style={[styles.paymentInfoText, warningBody ? styles.errorText : null]}>{body}</Text> : null}
          {children}
        </>
      ) : null}
    </View>
  );
}

function CareScopeAgreementPaymentDetails({
  hideWhenFree,
  providerCurrency,
  quoteCard,
  requestCard,
  viewerRole,
}: {
  // Suppress this box entirely when it would fall through to the "Free Care Session" note.
  // The requester's Confirm/Payment sheet renders this component at BOTH Step 1 (Agree to
  // Care Scope) and Step 2 (Confirm & Pay) as the flow progresses — for a $0 voluntary
  // booking that meant showing the identical "Free Care Session" note twice for no reason.
  // There is nothing to actually confirm/pay for a free booking, so Step 2 skips it; the
  // requester already saw it once at Step 1. Paid bookings are unaffected (real money still
  // gets the Payment details recap at both steps).
  hideWhenFree?: boolean;
  providerCurrency?: string;
  quoteCard: ServiceQuoteCard | null;
  requestCard: ServiceRequestCard | null;
  viewerRole: ServiceRole;
}) {
  const hasActiveQuote = Boolean(quoteCard);
  const quoteAmount = Number(clean(quoteCard?.finalPrice));
  const hasPaidQuote = hasActiveQuote && Number.isFinite(quoteAmount) && quoteAmount > 0;
  const requestOffer = Number(clean(requestCard?.suggestedPrice));
  const hasRequestOffer = !hasActiveQuote && Number.isFinite(requestOffer) && requestOffer > 0;
  const quoteCurrency = careCurrencyFromScopeOnly(quoteCard, requestCard) || providerCurrency || "";
  const requestCurrency = normalizeNativeCarerCurrency(requestCard?.suggestedCurrency) || normalizeNativeCarerCurrency(providerCurrency) || "";
  if (!hasPaidQuote && !hasRequestOffer && hideWhenFree) return null;
  if (hasPaidQuote) {
    const requesterTotal = quoteAmount * (1 + CARE_REQUESTER_FEE_RATE);
    const providerPayout = quoteAmount * (1 - CARE_PROVIDER_FEE_RATE);
    return (
      <View style={styles.paymentInfoBox}>
        <Text style={styles.paymentInfoTitle}>Payment details</Text>
        <View style={styles.paymentRow}><Text style={styles.paymentLabel}>Final rate</Text><Text style={styles.paymentValue}>{formatMoney(quoteCurrency, quoteAmount)}</Text></View>
        {viewerRole === "provider" ? (
          <View style={styles.paymentRow}><Text style={styles.paymentLabel}>You receive</Text><Text style={styles.paymentValue}>{formatMoney(quoteCurrency, providerPayout)}</Text></View>
        ) : (
          <View style={styles.paymentRow}><Text style={styles.paymentLabel}>You pay</Text><Text style={styles.paymentValue}>{formatMoney(quoteCurrency, requesterTotal)}</Text></View>
        )}
        {viewerRole === "provider" && CARE_PROVIDER_FEE_RATE > 0 ? (
          <Text style={styles.paymentInfoText}>{`After ${Math.round(CARE_PROVIDER_FEE_RATE * 100)}% platform service fee.`}</Text>
        ) : viewerRole !== "provider" && CARE_REQUESTER_FEE_RATE > 0 ? (
          <Text style={styles.paymentInfoText}>{`Includes ${Math.round(CARE_REQUESTER_FEE_RATE * 100)}% platform service fee.`}</Text>
        ) : null}
      </View>
    );
  }
  if (hasRequestOffer) {
    const requesterTotal = requestOffer * (1 + CARE_REQUESTER_FEE_RATE);
    const providerPayout = requestOffer * (1 - CARE_PROVIDER_FEE_RATE);
    return (
      <View style={styles.paymentInfoBox}>
        <Text style={styles.paymentInfoTitle}>Payment details</Text>
        <View style={styles.paymentRow}><Text style={styles.paymentLabel}>Final rate</Text><Text style={styles.paymentValue}>{formatMoney(requestCurrency, requestOffer)}{requestCard?.suggestedRate ? ` ${formatRateUnit(requestCard.suggestedRate)}` : ""}</Text></View>
        {viewerRole === "provider" ? (
          <View style={styles.paymentRow}><Text style={styles.paymentLabel}>You receive</Text><Text style={styles.paymentValue}>{formatMoney(requestCurrency, providerPayout)}</Text></View>
        ) : (
          <View style={styles.paymentRow}><Text style={styles.paymentLabel}>You pay</Text><Text style={styles.paymentValue}>{formatMoney(requestCurrency, requesterTotal)}</Text></View>
        )}
        {viewerRole === "provider" && CARE_PROVIDER_FEE_RATE > 0 ? (
          <Text style={styles.paymentInfoText}>{`After ${Math.round(CARE_PROVIDER_FEE_RATE * 100)}% platform service fee.`}</Text>
        ) : viewerRole !== "provider" && CARE_REQUESTER_FEE_RATE > 0 ? (
          <Text style={styles.paymentInfoText}>{`Includes ${Math.round(CARE_REQUESTER_FEE_RATE * 100)}% platform service fee.`}</Text>
        ) : null}
      </View>
    );
  }
  return (
      <View style={styles.paymentInfoBox}>
        <Text style={styles.paymentInfoTitle}>Free Care Session</Text>
        <Text style={styles.paymentInfoText}>No payment will be collected for voluntary booking unless a paid total is proposed.</Text>
      </View>
  );
}

function CareSignoffCancellationPolicy({ isNoChargeVoluntary, viewerRole }: { isNoChargeVoluntary: boolean; viewerRole: ServiceRole }) {
  if (viewerRole === "provider") {
    // A no-payment booking has no money to refund or pay. Paid owner cancellations use
    // Huddle's disclosed retention policy; this copy must not promise the carer a payout.
    if (isNoChargeVoluntary) {
      return (
        <View style={styles.paymentInfoBox}>
          <Text style={styles.paymentInfoTitle}>Cancellation Policy</Text>
          <View style={styles.cancellationBulletRow}><Text style={styles.cancellationBullet}>•</Text><Text style={styles.cancellationBulletText}>This is a no-payment Care booking — no money changes hands.</Text></View>
          <View style={styles.cancellationBulletRow}><Text style={styles.cancellationBullet}>•</Text><Text style={styles.cancellationBulletText}>Owners rely on your commitment once you sign off, the same as a paid booking.</Text></View>
          <View style={styles.cancellationBulletRow}><Text style={styles.cancellationBullet}>•</Text><Text style={styles.cancellationBulletText}>Late cancellations, no-shows, or serious trust issues may restrict your Care access while huddle reviews.</Text></View>
        </View>
      );
    }
    return (
      <View style={styles.paymentInfoBox}>
        <Text style={styles.paymentInfoTitle}>Cancellation Policy</Text>
        <View style={styles.cancellationBulletRow}><Text style={styles.cancellationBullet}>•</Text><Text style={styles.cancellationBulletText}>If the owner cancels 24-72 hours before care, they receive a 50% refund and huddle retains 50%; no carer cancellation payout is released. Under 24 hours, the booking is non-refundable and any payout follows the booking record.</Text></View>
        <View style={styles.cancellationBulletRow}><Text style={styles.cancellationBullet}>•</Text><Text style={styles.cancellationBulletText}>Owners rely on your commitment once you sign off.</Text></View>
        <View style={styles.cancellationBulletRow}><Text style={styles.cancellationBullet}>•</Text><Text style={styles.cancellationBulletText}>Late cancellations, no-shows, or serious trust issues may restrict your Care access while huddle reviews.</Text></View>
      </View>
    );
  }
  if (isNoChargeVoluntary) {
    return (
      <View style={styles.paymentInfoBox}>
        <Text style={styles.paymentInfoTitle}>Cancellation Policy</Text>
        <View style={styles.cancellationBulletRow}><Text style={styles.cancellationBullet}>•</Text><Text style={styles.cancellationBulletText}>This is a no-payment Care booking — no money changes hands.</Text></View>
        <View style={styles.cancellationBulletRow}><Text style={styles.cancellationBullet}>•</Text><Text style={styles.cancellationBulletText}>The commitment is the same as a paid booking. Cancel early if plans change — repeated or last-minute no-shows may restrict your booking access.</Text></View>
      </View>
    );
  }
  return (
    <View style={styles.paymentInfoBox}>
      <Text style={styles.paymentInfoTitle}>Cancellation</Text>
      <View style={styles.cancellationBulletRow}><Text style={styles.cancellationBullet}>•</Text><Text style={styles.cancellationBulletText}>72+ hours before care: full refund.</Text></View>
      <View style={styles.cancellationBulletRow}><Text style={styles.cancellationBullet}>•</Text><Text style={styles.cancellationBulletText}>24-72 hours before care: 50% refund; huddle retains 50%.</Text></View>
      <View style={styles.cancellationBulletRow}><Text style={styles.cancellationBullet}>•</Text><Text style={styles.cancellationBulletText}>Under 24 hours: final and non-refundable.</Text></View>
    </View>
  );
}

const careScopeAcknowledgementCopy = (viewerRole: ServiceRole, isNoChargeVoluntary: boolean) => {
  if (viewerRole === "provider") return "I have read and agree to the cancellation and no-start policy (including automatic cancellation at the scheduled end time). I understand that last-minute cancellations, confirmed no-shows, or serious trust violations may restrict my ability to provide Care on HUDDLE.";
  if (isNoChargeVoluntary) return "I have read and agree to the cancellation and no-start policy (including automatic cancellation at the scheduled end time).";
  return "I have read and agree to the cancellation and no-start policy (including automatic cancellation at the scheduled end time and the applicable 50% retained amount).";
};

const careScopeTermsAcknowledgementCopy = (viewerRole: ServiceRole) =>
  viewerRole === "provider"
    ? "I have read the Care Service Carer Agreement, and understand the Care Scope & Instructions, payout details, and handoff process."
    : "I have read the Care Service Booking Terms, and understand the Care Scope & Instructions, payment details, and handoff process.";

const carePaymentMovementCopy = (movement: NativeCarePaymentMovement | null | undefined) =>
  presentCarePaymentMovement(movement, formatCarePaymentDate);

function PaymentCareScopeSummary({
  bookingSnapshot,
  careDetails,
  careScope,
  carerContact,
  disabledEdit,
  onDecline,
  onEdit,
  onOpenPet,
  paymentMovement,
  providerCurrency,
  quoteCard,
  requestCard,
  showCarerContact = false,
  showPaymentLine,
  viewerRole,
}: {
  bookingSnapshot?: CareBookingSnapshot | null;
  careDetails?: CareScopeCareDetails | null;
  careScope?: CareScopeSummary | null;
  carerContact?: string | null;
  disabledEdit?: boolean;
  onDecline?: () => void;
  onEdit?: () => void;
  onOpenPet?: (petId: string) => void;
  paymentMovement?: NativeCarePaymentMovement | null;
  providerCurrency?: string;
  quoteCard: ServiceQuoteCard | null;
  requestCard: ServiceRequestCard | null;
  showCarerContact?: boolean;
  showPaymentLine?: boolean;
  viewerRole?: ServiceRole;
}) {
  const [summaryPage, setSummaryPage] = useState<"scope" | "instruction">("scope");
  const [paymentReferenceExpanded, setPaymentReferenceExpanded] = useState(false);
  const hasCareInstruction = hasCareInstructionDetails(careDetails);
  useEffect(() => {
    if (!hasCareInstruction && summaryPage === "instruction") setSummaryPage("scope");
  }, [hasCareInstruction, summaryPage]);
  const summaryPagePanResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gestureState) => (
        hasCareInstruction
        && Math.abs(gestureState.dx) > 34
        && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.35
      ),
      onPanResponderRelease: (_event, gestureState) => {
        if (!hasCareInstruction) return;
        if (gestureState.dx < -48) setSummaryPage("instruction");
        if (gestureState.dx > 48) setSummaryPage("scope");
      },
    }),
    [hasCareInstruction],
  );
  const paymentMovementCopy = carePaymentMovementCopy(paymentMovement);
  const paymentReferenceLabel = paymentMovementCopy?.referenceLabel;
  const paymentReferenceValue = paymentMovementCopy?.referenceValue;
  const paymentReferenceCanCollapse = paymentReferenceLabel === "Trace ID" && Boolean(paymentReferenceValue && paymentReferenceValue.length > 10);
  const paymentReferenceDisplay = paymentReferenceValue
    ? !paymentReferenceCanCollapse || paymentReferenceExpanded
      ? paymentReferenceValue
      : `${paymentReferenceValue.slice(0, 10)}…`
    : "";
  useEffect(() => setPaymentReferenceExpanded(false), [paymentReferenceValue]);
  if (!requestCard && !quoteCard) return null;
  const visibleScopeCard = requestCardWithCareScopeUpdates(requestCard, quoteCard, careScope?.actorRole);
  const serviceLabel = Array.isArray(visibleScopeCard?.serviceTypes) && visibleScopeCard?.serviceTypes.length ? visibleScopeCard.serviceTypes.join("・") : clean(visibleScopeCard?.serviceType) || "Care Scope";
  const sourceDates = visibleScopeCard?.requestedDates;
  const sourceDate = clean(visibleScopeCard?.requestedDate);
  const startTime = clean(visibleScopeCard?.startTime) || "—";
  const endTime = clean(visibleScopeCard?.endTime) || "—";
  const locationStyles = visibleScopeCard?.locationStyles || [];
  const locationArea = clean(visibleScopeCard?.locationArea);
  const locationStyleLabel = locationStyles.length ? locationStyles.join(", ") : "";
  const scopeTasks = normalizeCareTaskList(visibleScopeCard?.scopeTasks);
  const scopeFrequency = clean(visibleScopeCard?.scopeFrequency);
  const otherTasks = clean(visibleScopeCard?.otherTasks);
  const updatePreferenceLabel = normalizeUpdatePreference(visibleScopeCard?.updatePreference);
  const agreedAt = clean(bookingSnapshot?.agreedAt);
  const quoteIsNoChargeVoluntary = isNoChargeVisibleScope(visibleScopeCard, quoteCard, careScope?.actorRole);
  const quoteCurrency = careCurrencyFromScopeOnly(null, visibleScopeCard) || providerCurrency || "";
  const { requesterTotal, providerPayout } = frozenOrLiveCarePayment(bookingSnapshot, null, visibleScopeCard, quoteIsNoChargeVoluntary);
  const scopePets = visibleScopeCard ? requestCardPets(visibleScopeCard) : [];
  const scopeDateLocation = [formatShortDateRange(sourceDates, sourceDate), locationArea].filter(Boolean).join(" · ");
  return (
    <View style={styles.paymentCareScopeCard}>
      <View style={[styles.phaseStrip, { backgroundColor: huddleColors.blueLight }]} pointerEvents="none" />
      <View style={styles.paymentCareScopeInner} {...summaryPagePanResponder.panHandlers}>
        <View style={styles.scopeHeadlineBlock}>
          <View style={[styles.scopeHeaderTopRow, styles.paymentScopeHeaderTopRow]}>
            <View style={styles.paymentScopeHeadlineMain}>
              <View style={[styles.scopeHeadlineCopy, styles.paymentScopeHeadlineCopy]}>
                <Text numberOfLines={1} style={styles.timelineCurrentLabel}>{serviceLabel} with </Text>
                <PetAvatarStack pets={scopePets} size={22} />
              </View>
              {scopeDateLocation ? <Text numberOfLines={1} style={styles.scopeSubtitle}>{scopeDateLocation}</Text> : null}
            </View>
            {onEdit || onDecline ? (
              <View style={styles.scopeHeaderActions}>
                {onEdit ? (
                  <Pressable accessibilityLabel="Edit care scope" accessibilityRole="button" disabled={disabledEdit} hitSlop={huddleSpacing.x2} onPress={onEdit} style={({ pressed }) => [styles.scopeIconAction, disabledEdit ? styles.disabledAction : null, pressed ? nativeModalStyles.pressed : null]}>
                    <Feather color={huddleColors.blue} name="edit-2" size={18} />
                  </Pressable>
                ) : null}
                {onDecline ? (
                  <Pressable accessibilityLabel="Reject care scope" accessibilityRole="button" disabled={disabledEdit} hitSlop={huddleSpacing.x2} onPress={onDecline} style={({ pressed }) => [styles.scopeIconAction, disabledEdit ? styles.disabledAction : null, pressed ? nativeModalStyles.pressed : null]}>
                    <Feather color={huddleColors.validationRed} name="x" size={18} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {summaryPage === "instruction" && hasCareInstruction ? (
          <>
            <View style={styles.scopeHairline} />
            <View style={styles.scopeDetailGrid}>
              <CareInstructionDetailRows carerContact={carerContact} details={careDetails} showCarerContact={showCarerContact} />
            </View>
            <Pressable accessibilityRole="button" onPress={() => setSummaryPage("scope")} style={({ pressed }) => [styles.careInstructionNavRow, pressed ? nativeModalStyles.pressed : null]}>
              <Feather color={huddleColors.blue} name="chevron-left" size={18} />
              <Text style={styles.careInstructionNavText}>Back to Care Scope</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.scopeHairline} />

            {visibleScopeCard ? <SelectedPetPolaroid onOpenPet={onOpenPet} requestCard={visibleScopeCard} /> : null}

            <View style={styles.scopeDetailGrid}>
              <ScopeDetailRow label="Time">{startTime} – {endTime}</ScopeDetailRow>
              {formatCareScopeSetting(locationStyles, locationArea) ? <ScopeDetailRow label="Setting">{formatCareScopeSetting(locationStyles, locationArea)}</ScopeDetailRow> : null}
              {[scopeTasks.join(", "), otherTasks].filter(Boolean).join(", ") ? <ScopeDetailRow label="Care tasks">{[scopeTasks.join(", "), otherTasks].filter(Boolean).join(", ")}</ScopeDetailRow> : null}
              <ScopeDetailRow label="Updates preference">{updatePreferenceLabel}</ScopeDetailRow>
              {scopeFrequency ? <ScopeDetailRow label="Walks per day">{scopeFrequency}</ScopeDetailRow> : null}
              {agreedAt ? <ScopeDetailRow label="Booking terms">Agreed - {formatTimelineStepDate(agreedAt)}</ScopeDetailRow> : null}
              {showPaymentLine && !quoteIsNoChargeVoluntary && (quoteCard || visibleScopeCard?.suggestedPrice) ? (
                <ScopeDetailRow label={viewerRole === "provider" ? "Payout" : "Payment"}>
                  {viewerRole === "provider" ? formatMoney(quoteCurrency, providerPayout) : formatMoney(quoteCurrency, requesterTotal)}
                </ScopeDetailRow>
              ) : null}
              {paymentMovementCopy ? (
                <ScopeDetailRow label={paymentMovementCopy.label}>{paymentMovementCopy.detail || "—"}</ScopeDetailRow>
              ) : null}
              {paymentReferenceLabel && paymentReferenceValue ? (
                <View style={styles.scopeDetailRow}>
                  <Text style={styles.scopeDetailLabel}>{paymentReferenceLabel}</Text>
                  <View style={styles.scopePaymentReferenceValue}>
                    <Pressable
                      accessibilityLabel={paymentReferenceCanCollapse ? `${paymentReferenceExpanded ? "Collapse" : "Expand"} ${paymentReferenceLabel}` : paymentReferenceLabel}
                      accessibilityRole="button"
                      disabled={!paymentReferenceCanCollapse}
                      onPress={() => {
                        haptic.toggleControl();
                        setPaymentReferenceExpanded((value) => !value);
                      }}
                      style={({ pressed }) => [styles.timelineReferenceValueButton, pressed ? nativeModalStyles.pressed : null]}
                    >
                      <Text selectable={paymentReferenceExpanded || !paymentReferenceCanCollapse} style={styles.scopeDetailValue}>{paymentReferenceDisplay}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Copy ${paymentReferenceLabel}`}
                      accessibilityRole="button"
                      hitSlop={huddleSpacing.x2}
                      onPress={() => {
                        void Clipboard.setStringAsync(paymentReferenceValue);
                        haptic.toggleControl();
                      }}
                      style={({ pressed }) => [styles.timelineReferenceCopyButton, pressed ? nativeModalStyles.pressed : null]}
                    >
                      <Feather color={huddleColors.blue} name="copy" size={15} />
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
            {hasCareInstruction ? (
              <Pressable accessibilityRole="button" onPress={() => setSummaryPage("instruction")} style={({ pressed }) => [styles.careInstructionNavRow, pressed ? nativeModalStyles.pressed : null]}>
                <Text style={styles.careInstructionNavText}>See Care Instruction</Text>
                <Feather color={huddleColors.blue} name="chevron-right" size={18} />
              </Pressable>
            ) : null}
          </>
        )}
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
              <ExpoImage key={nativeFreshImageKey(photo, photo)} source={{ uri: nativeFreshImageUri(photo, photo) }} style={{ width: size - 3, height: size - 3, borderRadius: (size - 3) / 2 }} contentFit="cover" transition={120} />
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
  cancelled?: boolean;
  dateLabel?: string;
  detail?: string;
  done: boolean;
  label: string;
  reference?: { label: string; value: string };
  skipped?: boolean;
};

const buildBookingTimelineState = (
  chat: ServiceChatRow,
  isProvider: boolean,
  underReviewOverride?: boolean,
  paymentMovement?: NativeCarePaymentMovement | null,
) => {
  const noChargeVoluntaryBooking = isNoChargeServiceChat(chat);
  const cancelled = isCancelledServiceChatRow(chat);
  const systemNoStart = cancelled && chat.cancellation_status === "system_no_start";
  const disputeResolved = isResolvedServiceDisputeStatus(chat.dispute_status);
  const checkInDone = Boolean(chat.checkin_submitted_at && (chat.checkin_photo_url || chat.care_status === "in_progress" || chat.care_status === "completed"));
  const completionDone = Boolean(chat.care_status === "completed" || chat.status === "completed" || chat.completed_at);
  const terminalDone = Boolean(cancelled || completionDone || disputeResolved);
  const providerPayoutSkipped = Boolean(isProvider && ((systemNoStart && Number(chat.cancellation_provider_payout_cents || 0) <= 0) || serviceDisputeNoProviderPayout(chat)));
  const manualRefundRequired = chat.care_status === "handoff_expired_manual_refund_required";
  const underReview = Boolean(!terminalDone && (underReviewOverride || chat.status === "disputed" || chat.care_status === "under_dispute" || chat.care_status === "handoff_issue_review" || manualRefundRequired));
  const oneSideComplete = !completionDone && (chat.requester_mark_finished || chat.provider_mark_finished);
  const currentUserMarkedComplete = isProvider ? chat.provider_mark_finished : chat.requester_mark_finished;
  const scheduledEndAt = serviceScheduledEndIso(chat.request_card, chat.booking_snapshot);
  const autoReleaseAt = addHoursIso(scheduledEndAt, PAYOUT_AUTO_RELEASE_HOURS);
  const waitingCompletionLabel = currentUserMarkedComplete
    ? isProvider
      ? "Completed. Wait for Pet Owner's confirmation"
      : "Completed. Wait for Carer's confirmation"
    : "Awaiting confirmation to finish";
  const careInProgressDone = Boolean(completionDone || oneSideComplete);
  const careInProgressActive = Boolean(!careInProgressDone && (chat.care_status === "in_progress" || chat.status === "in_progress"));
  const cancellationDate = chat.updated_at || chat.booked_at || chat.quote_sent_at || chat.request_sent_at;
  const completionDate = cancelled ? cancellationDate : chat.dispute_resolved_at || chat.completed_at;
  const visibleScopeCard = visibleCareScopeCardForChat(chat);
  const scopeTasks = normalizeCareTaskList(visibleScopeCard?.scopeTasks);
  const careTaskDetail = [
    scopeTasks.join(", "),
    clean(visibleScopeCard?.otherTasks),
  ].filter(Boolean).join(", ");
  const scopeFrequency = clean(visibleScopeCard?.scopeFrequency);
  const scopeDetail = [careTaskDetail, scopeFrequency ? `Walks per day: ${scopeFrequency}` : ""].filter(Boolean).join(" - ");
  const paymentCopy = carePaymentMovementCopy(paymentMovement);
  const bookingConfirmedDone = Boolean(chat.booked_at || chat.status === "booked" || chat.status === "in_progress");
  const agreementSignedAt = latestIso(chat.care_agreement?.requesterSignedAt, chat.care_agreement?.providerSignedAt, chat.booking_snapshot?.agreedAt);
  // Withdrawing a request clears request_card/quote_card and deactivates the scope version,
  // but the old service_care_agreements row (from a prior withdrawn round) is left on file for
  // audit purposes with its signed timestamps intact. Without the `chat.request_card` guard, a
  // freshly-withdrawn booking would still show "Agreement signed" as done, since both
  // timestamps are still present on that stale, no-longer-current agreement row.
  const agreementSignedDone = Boolean(hasCurrentCareScopeAgreement(chat) || bookingConfirmedDone);
  const agreementSignedDetail = agreementSignedDone
    ? undefined
    : chat.care_scope?.ownerSigned
      ? "Owner signed — waiting for the carer"
      : chat.care_scope?.carerSigned
        ? "Carer signed — waiting for the owner"
        : undefined;
  const coreItems: BookingTimelineItem[] = [
    { label: "Request sent", dateLabel: formatTimelineStepDate(chat.request_sent_at), done: Boolean(chat.request_sent_at || chat.request_card) },
    { label: "Care scope proposed", dateLabel: formatTimelineStepDate(chat.quote_sent_at || chat.request_sent_at || chat.booked_at), done: Boolean(visibleScopeCard) },
    { label: "Agreement signed", dateLabel: formatTimelineStepDate(agreementSignedAt), detail: agreementSignedDetail, done: agreementSignedDone },
    { label: "Booking confirmed", dateLabel: formatTimelineStepDate(chat.booked_at), done: bookingConfirmedDone },
    { label: "Check-in", dateLabel: formatTimelineStepDate(chat.checkin_submitted_at), done: checkInDone },
    { label: "Care in progress", dateLabel: formatTimelineStepDate(chat.in_progress_at || chat.checkin_submitted_at), done: careInProgressDone },
    {
      label: terminalDone ? "Booking completed" : oneSideComplete ? waitingCompletionLabel : "Completion",
      dateLabel: formatTimelineStepDate(completionDate),
      detail: !noChargeVoluntaryBooking && !terminalDone && (oneSideComplete || careInProgressActive) && autoReleaseAt
        ? `Payment auto-releases on ${formatTimelineStepDate(autoReleaseAt)} unless an issue is reported.`
        : undefined,
      done: Boolean(completionDone || disputeResolved),
    },
  ];
  const lastReachedCoreIndex = [...coreItems].map((item, index) => item.done ? index : -1).filter((index) => index >= 0).pop() ?? -1;
  const noStartRefundCents = Number(chat.no_start_refund_cents || 0);
  const noStartRetainedCents = Number(chat.no_start_retained_cents || 0);
  const noStartTotalCents = Number(chat.booking_snapshot?.price?.requesterTotal || 0);
  const noStartIsHalfRetained = noStartTotalCents > 0
    && noStartRefundCents > 0
    && noStartRetainedCents > 0
    && Math.abs((noStartRefundCents + noStartRetainedCents) - noStartTotalCents) <= 1
    && Math.abs((noStartRetainedCents * 2) - noStartTotalCents) <= 1;
  const noStartChargeDetail = systemNoStart && !isProvider && !noChargeVoluntaryBooking && noStartIsHalfRetained
    ? `(50% Platform charge: ${formatNativeCareCurrencySymbol(chat.booking_snapshot?.price?.currency)}${fromStripeMinorUnitAmount(noStartRetainedCents, clean(chat.booking_snapshot?.price?.currency)).toFixed(2)})`
    : undefined;
  const items: BookingTimelineItem[] = systemNoStart
    ? [
      ...coreItems.slice(0, 4),
      { ...coreItems[4], skipped: true, done: false },
      { label: "Care in Progress — Cancelled", dateLabel: formatTimelineStepDate(chat.no_start_resolved_at || cancellationDate), detail: noStartChargeDetail, done: false, cancelled: true },
      ...coreItems.slice(6).map((item) => ({ ...item, skipped: true, done: false })),
    ]
    : cancelled
    ? [
      ...coreItems.slice(0, lastReachedCoreIndex + 1),
      { label: "Booking Cancellation", dateLabel: formatTimelineStepDate(cancellationDate), done: false, cancelled: true },
      ...coreItems.slice(lastReachedCoreIndex + 1).map((item) => ({ ...item, skipped: true, done: false })),
    ]
    : coreItems;
  if (!isProvider && paymentMovement?.movementKind === "owner_refund" && paymentCopy) {
    items.push({
      label: paymentCopy.label,
      dateLabel: paymentMovement.status === "succeeded" ? formatTimelineStepDate(paymentMovement.processedAt) : undefined,
      detail: paymentCopy.detail,
      done: paymentMovement.status === "succeeded",
      reference: paymentCopy.referenceLabel && paymentCopy.referenceValue
        ? { label: paymentCopy.referenceLabel, value: paymentCopy.referenceValue }
        : undefined,
    });
  } else if (!isProvider && !paymentMovement) {
    const missingPaymentCopy = presentMissingCarePayment({ isProvider, stripeRefundId: chat.stripe_refund_id });
    if (missingPaymentCopy) items.push({
      label: missingPaymentCopy.label,
      detail: missingPaymentCopy.detail,
      done: false,
    });
  }
  if (isProvider && !noChargeVoluntaryBooking) {
    const missingPaymentCopy = presentMissingCarePayment({ isProvider, payoutReleasedAt: chat.payout_released_at });
    items.push({
      label: paymentCopy?.label || missingPaymentCopy?.label || "Payment pending",
      dateLabel: paymentMovement?.status === "paid" ? formatTimelineStepDate(paymentMovement.paidAt || paymentMovement.estimatedArrivalAt) : formatTimelineStepDate(chat.payout_released_at),
      detail: paymentCopy?.detail || missingPaymentCopy?.detail,
      done: paymentMovement ? paymentMovement.status === "paid" : Boolean(chat.payout_released_at),
      reference: paymentCopy?.referenceLabel && paymentCopy.referenceValue
        ? { label: paymentCopy.referenceLabel, value: paymentCopy.referenceValue }
        : undefined,
      skipped: providerPayoutSkipped,
    });
  }
  const currentIndex = items.findIndex((item) => item.cancelled || (!item.done && !("skipped" in item && item.skipped)));
  const disputeIndex = currentIndex >= 0 ? currentIndex : Math.max(0, items.length - 1);
  const lastCompletedItem = [...items].reverse().find((item) => item.done && !item.skipped);
  const currentLabel = systemNoStart ? "Care in Progress — Cancelled" : cancelled ? "Booking Cancellation" : lastCompletedItem?.label || items[0].label;
  const phaseColor = (() => {
    if (cancelled) return huddleColors.validationRed;
    if (underReview) return huddleColors.validationRed;
    if (terminalDone) return huddleColors.success;
    if (careInProgressDone || checkInDone) return huddleColors.blue;
    return huddleColors.primarySoftFill;
  })();
  return {
    cancelled,
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
    chat.status === "cancelled" ||
    chat.care_status === "completed" ||
    chat.care_status === "cancelled" ||
    isResolvedServiceDisputeStatus(chat.dispute_status),
  )
);

const serviceChatHistoryTerminalAt = (chat: ServiceChatRow, isProvider: boolean) => {
  if (isCancelledServiceChatRow(chat)) return chat.no_start_resolved_at || chat.updated_at || chat.booked_at || chat.quote_sent_at || chat.request_sent_at || "";
  const state = buildBookingTimelineState(chat, isProvider);
  if (!state.terminalDone || state.underReview) return "";
  if (isProvider) {
    if (isNoChargeServiceChat(chat)) return chat.dispute_resolved_at || chat.completed_at || "";
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
  lastUpdatedAt,
  noTopBorder = false,
  showAllDates = false,
  terminalDone,
  underReview,
}: {
  activeDotPulseStyle?: object;
  currentIndex: number;
  disputeIndex: number;
  items: BookingTimelineItem[];
  lastUpdatedAt?: string | null;
  noTopBorder?: boolean;
  showAllDates?: boolean;
  terminalDone: boolean;
  underReview: boolean;
}) {
  const [expandedReferenceKey, setExpandedReferenceKey] = useState<string | null>(null);
  return (
    <View style={[styles.timelineExpandedList, noTopBorder ? styles.timelineExpandedListNoBorder : null]}>
      {items.map((item, index) => {
        const isCancellation = item.cancelled === true;
        const isCurrent = isCancellation || (underReview ? index === disputeIndex : !item.done && !item.skipped && index === currentIndex);
        const isSkipped = "skipped" in item && item.skipped;
        const shouldShowDate = Boolean(item.dateLabel && (showAllDates || item.label === "Payment released" || item.label === "Refund processed"));
        const referenceKey = item.reference ? `${index}:${item.reference.value}` : null;
        const referenceExpanded = Boolean(referenceKey && expandedReferenceKey === referenceKey);
        const referenceCanCollapse = item.reference?.label === "Trace ID" && item.reference.value.length > 10;
        const referenceDisplay = item.reference
          ? !referenceCanCollapse || referenceExpanded
            ? item.reference.value
            : `${item.reference.value.slice(0, 10)}…`
          : "";
        return (
          <View key={`row-${item.label}-${index}`} style={styles.timelineItem}>
            <Animated.View style={[styles.timelineDot, item.done ? styles.timelineDotDone : null, item.done && terminalDone ? styles.timelineDotDoneTerminal : null, isSkipped ? styles.timelineDotSkipped : null, isCurrent ? styles.timelineDotCurrent : null, isCancellation ? styles.timelineDotCurrentDisputed : null, isCurrent && underReview ? styles.timelineDotCurrentDisputed : null, isCurrent && !terminalDone && !isSkipped && !isCancellation && activeDotPulseStyle ? activeDotPulseStyle : null]}>
              {item.done && !isCurrent ? <Feather color={huddleColors.onPrimary} name="check" size={11} /> : null}
              {isSkipped ? <Feather color={huddleColors.mutedText} name="x" size={11} /> : null}
              {isCancellation ? <Feather color={huddleColors.onPrimary} name="x" size={11} /> : null}
            </Animated.View>
            <View style={styles.timelineTextBlock}>
              <Text
                style={[
                  styles.timelineLabel,
                  item.done ? styles.timelineLabelDone : null,
                  item.done && terminalDone ? styles.timelineLabelDoneTerminal : null,
                  isSkipped ? styles.timelineLabelSkipped : null,
                  isCurrent ? styles.timelineLabelCurrent : null,
                  isCancellation ? { color: huddleColors.validationRed } : null,
                  isSkipped ? { textDecorationLine: "line-through" } : null,
                ]}
              >
                {item.label}
                {shouldShowDate ? <Text style={styles.timelineLabelDate}> - {item.dateLabel}</Text> : null}
              </Text>
              {item.detail ? <Text style={styles.timelineDetailText}>{item.detail}</Text> : null}
              {item.reference ? (
                <View style={styles.timelineReferenceRow}>
                  <Pressable
                    accessibilityLabel={referenceCanCollapse ? `${referenceExpanded ? "Collapse" : "Expand"} ${item.reference.label}` : item.reference.label}
                    accessibilityRole="button"
                    disabled={!referenceCanCollapse}
                    onPress={() => {
                      haptic.toggleControl();
                      setExpandedReferenceKey(referenceExpanded ? null : referenceKey);
                    }}
                    style={({ pressed }) => [styles.timelineReferenceValueButton, pressed ? nativeModalStyles.pressed : null]}
                  >
                    <Text selectable={referenceExpanded} style={styles.timelineReferenceText}>{item.reference.label}: {referenceDisplay}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Copy ${item.reference.label}`}
                    accessibilityRole="button"
                    hitSlop={huddleSpacing.x2}
                    onPress={() => {
                      void Clipboard.setStringAsync(item.reference?.value || "");
                      haptic.toggleControl();
                    }}
                    style={({ pressed }) => [styles.timelineReferenceCopyButton, pressed ? nativeModalStyles.pressed : null]}
                  >
                    <Feather color={huddleColors.blue} name="copy" size={15} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
      {lastUpdatedAt ? <Text style={styles.timelineLastUpdated}>{formatCarePaymentLastUpdated(lastUpdatedAt)}</Text> : null}
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
  paymentMovement,
  underReview: underReviewOverride,
}: {
  canHide?: boolean;
  chat: ServiceChatRow;
  collapsed: boolean;
  isProvider: boolean;
  onHide?: () => void;
  onToggle: () => void;
  paymentMovement?: NativeCarePaymentMovement | null;
  underReview?: boolean;
}) {
  const { cancelled, currentIndex, currentLabel, disputeIndex, items, phaseColor, providerPayoutSkipped, terminalDone, underReview } = buildBookingTimelineState(chat, isProvider, underReviewOverride, paymentMovement);
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
        Animated.timing(activeDotPulse, { toValue: 1, duration: 900, isInteraction: false, useNativeDriver: true }),
        Animated.timing(activeDotPulse, { toValue: 0, duration: 900, isInteraction: false, useNativeDriver: true }),
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
          <Text numberOfLines={1} style={[styles.timelineCurrentLabel, terminalDone && !cancelled ? styles.timelineCurrentLabelTerminal : null, cancelled ? styles.timelineCurrentLabelCancelled : null]}>{currentLabel}</Text>
          <Feather color={huddleColors.iconMuted} name={collapsed ? "chevron-down" : "chevron-up"} size={18} />
        </View>
        <View style={styles.timelineTopRow}>
          <View style={styles.timelineProgressAndHideRow}>
            <View style={styles.stitchedRibbon}>
              {items.map((item, index) => {
                const isCancellation = item.cancelled === true;
                const isCurrent = underReview ? index === disputeIndex : !item.done && !item.skipped && index === currentIndex;
                const isSkipped = "skipped" in item && item.skipped;
                if (isCancellation) {
                  return (
                    <View key={`cancelled-${index}`} style={styles.ribbonCancelled}>
                      <Feather color={huddleColors.onPrimary} name="x" size={10} strokeWidth={2.8} />
                    </View>
                  );
                }
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
            lastUpdatedAt={paymentMovement?.lastSyncedAt}
            terminalDone={terminalDone}
            underReview={underReview}
          />
        ) : null}
        {collapsed && paymentMovement?.lastSyncedAt ? <Text style={styles.timelineLastUpdated}>{formatCarePaymentLastUpdated(paymentMovement.lastSyncedAt)}</Text> : null}
      </Pressable>
    </View>
  );
}

function CareHistorySheet({
  currentUserId,
  focusServiceChatId,
  loading,
  onClose,
  onOpenCareAgreement,
  onOpenPet,
  open,
  ownerName,
  paymentMovementByServiceId,
  providerName,
  rows,
}: {
  currentUserId: string | null;
  focusServiceChatId?: string | null;
  loading: boolean;
  onClose: () => void;
  onOpenCareAgreement?: (chat: ServiceChatRow) => void;
  onOpenPet?: (petId: string) => void;
  open: boolean;
  ownerName: string;
  paymentMovementByServiceId: Record<string, NativeCarePaymentMovement[]>;
  providerName: string;
  rows: ServiceChatRow[];
}) {
  const historyRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      if (focusServiceChatId && a.id === focusServiceChatId && b.id !== focusServiceChatId) return -1;
      if (focusServiceChatId && b.id === focusServiceChatId && a.id !== focusServiceChatId) return 1;
      const aTime = Date.parse(serviceChatHistoryTerminalAt(a, a.provider_id === currentUserId) || a.completed_at || a.dispute_resolved_at || a.booked_at || "");
      const bTime = Date.parse(serviceChatHistoryTerminalAt(b, b.provider_id === currentUserId) || b.completed_at || b.dispute_resolved_at || b.booked_at || "");
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
    return sorted;
  }, [currentUserId, focusServiceChatId, rows]);
  if (!open) return null;
  return (
    <View pointerEvents="box-none" style={styles.inlineSheetLayer}>
        <Pressable accessibilityLabel="Close care history sheet" accessibilityRole="button" onPress={onClose} style={nativeModalStyles.appModalBackdrop} />
        <View style={[nativeModalStyles.appModalBottomSafeArea, nativeModalStyles.appBottomSheetEventBoundary]} pointerEvents="box-none">
          <AppBottomSheet mode="large" onClose={onClose} style={styles.careHistorySheet}>
            <AppBottomSheetHeader>
              <Text numberOfLines={1} style={nativeModalStyles.appModalSheetTitle}>Care History</Text>
              <AppModalCloseButton onPress={onClose} />
            </AppBottomSheetHeader>
            <AppBottomSheetScroll contentContainerStyle={styles.careHistoryContent} fill>
              {loading && historyRows.length === 0 ? (
                <NativeLoadingState variant="inline" />
              ) : historyRows.length > 0 ? (
                historyRows.map((chat) => {
                  const rowIsProvider = chat.provider_id === currentUserId;
                  const rowIsRequester = chat.requester_id === currentUserId;
                  const timelineState = buildBookingTimelineState(chat, rowIsProvider, undefined, paymentMovementByServiceId[chat.id]?.[0] || null);
                  return (
                    <BookingCards
                      allowAgreementPdfFromAgreement
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
                            lastUpdatedAt={paymentMovementByServiceId[chat.id]?.[0]?.lastSyncedAt}
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
                      onOpenCareAgreement={() => onOpenCareAgreement?.(chat)}
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
  );
}

function CompletionSheet({
  canReportIssue,
  ctaLabel,
  isProvider,
  isRequester,
  isVoluntary,
  missingCareUpdateKind,
  onClose,
  onReportIssue,
  onSendUpdateFirst,
  onSubmit,
  open,
  sending,
}: {
  canReportIssue: boolean;
  ctaLabel: string;
  isProvider: boolean;
  isRequester: boolean;
  isVoluntary: boolean;
  missingCareUpdateKind: CareUpdateKind | null;
  onClose: () => void;
  onReportIssue: () => void;
  onSendUpdateFirst: () => void;
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
    : isRequester && confirmedCompleted && (isVoluntary || understandsPayoutReview);
  const missingCareUpdateLabel = missingCareUpdateKind === "photo"
    ? "photo"
    : missingCareUpdateKind === "summary"
    ? "summary"
    : missingCareUpdateKind === "photo_note"
    ? "photo and summary"
    : null;
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
    <View pointerEvents="box-none" style={styles.inlineSheetLayer}>
      <Pressable accessibilityLabel="Close complete care sheet" accessibilityRole="button" onPress={sending ? () => undefined : onClose} style={nativeModalStyles.appModalBackdrop} />
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} pointerEvents="box-none" style={[nativeModalStyles.appModalBottomSafeArea, nativeModalStyles.appBottomSheetEventBoundary]}>
        <AppBottomSheet mode="content" onClose={onClose}>
          <AppBottomSheetHeader>
            <Text style={nativeModalStyles.appModalSheetTitle}>Complete Care Session</Text>
            <AppModalCloseButton onPress={sending ? () => undefined : onClose} />
          </AppBottomSheetHeader>
          <AppBottomSheetScroll contentContainerStyle={styles.paymentBody}>
            {isProvider && missingCareUpdateLabel ? (
              <View accessibilityRole="alert" style={styles.completionCareUpdateNotice}>
                <Feather color={huddleColors.blue} name="info" size={18} />
                <View style={styles.completionCareUpdateNoticeCopy}>
                  <Text style={styles.completionCareUpdateNoticeTitle}>Care update not sent</Text>
                  <Text style={styles.completionCareUpdateNoticeBody}>You haven’t sent the requested {missingCareUpdateLabel}. You can still confirm completion.</Text>
                </View>
              </View>
            ) : null}
            <CompletionCheckbox
              attempted={attempted}
              checked={confirmedCompleted}
              label={isProvider ? "The pet has been returned, handed off, or care was completed as agreed." : "I confirm the pet was returned safely or care was completed as agreed."}
              onToggle={() => setConfirmedCompleted((value) => !value)}
            />
            {isProvider ? (
              <>
                <CompletionCheckbox attempted={attempted} checked={noUnresolvedSafetyConcerns} label="I confirm there are no unresolved safety concerns unless reported separately." onToggle={() => setNoUnresolvedSafetyConcerns((value) => !value)} />
                <CompletionCheckbox attempted={attempted} checked={understandsReview} label={isVoluntary ? "I understand this completion may be used to support booking and safety review." : "I understand this completion may be used to support booking and payment review."} onToggle={() => setUnderstandsReview((value) => !value)} />
              </>
            ) : (
              isVoluntary ? null : <CompletionCheckbox attempted={attempted} checked={understandsPayoutReview} label="I understand confirming completion may allow provider payout to proceed." onToggle={() => setUnderstandsPayoutReview((value) => !value)} />
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
            {isProvider && missingCareUpdateLabel ? (
              <Pressable
                accessibilityRole="button"
                disabled={sending}
                onPress={onSendUpdateFirst}
                style={({ pressed }) => [styles.completionSendUpdateFirst, pressed ? nativeModalStyles.pressed : null]}
              >
                <Text style={styles.completionSendUpdateFirstText}>Send update first</Text>
              </Pressable>
            ) : null}
            <SlideToConfirm busy={sending} label={ctaLabel || "Complete Care Session"} onCommit={submit} resetKey={slideResetKey} />
          </AppBottomSheetFooter>
        </AppBottomSheet>
      </KeyboardAvoidingView>
    </View>
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
  accessToken,
  careAgreement,
  careScope,
  hasCurrentAgreement,
  open,
  onBlocker,
  onClose,
  onConfirmVolunteer,
  onEditCareScope,
  onOpenPet,
  onOpenSupport,
  onUpdateCareDetails,
  onSigned,
  onPay,
  quoteCard,
  requestCard,
  serviceChatId,
  requesterId,
  providerId,
  pets,
  requesterCountry,
  requesterPhone,
  serviceCountry,
  requesterIdForPetUpdate,
  sessionKey,
  sending,
}: {
  accessToken?: string | null;
  careAgreement?: ServiceCareAgreementRecord | null;
  careScope?: CareScopeSummary | null;
  hasCurrentAgreement?: boolean;
  open: boolean;
  onBlocker: (body: string) => void;
  onClose: () => void;
  onConfirmVolunteer: (snapshot: CareBookingSnapshot, traceId: string, trace: ServicePaymentTrace) => Promise<ServicePaymentResult>;
  onEditCareScope: () => void;
  onOpenPet?: (petId: string) => void;
  onOpenSupport: () => void;
  onUpdateCareDetails: (careDetails: CareScopeCareDetails) => Promise<void>;
  onSigned?: () => Promise<void> | void;
  onPay: (snapshot: CareBookingSnapshot, traceId: string, trace: ServicePaymentTrace) => Promise<ServicePaymentResult>;
  quoteCard: ServiceQuoteCard | null;
  requestCard: ServiceRequestCard | null;
  serviceChatId: string | null;
  requesterId: string;
  providerId: string;
  pets: PetOption[];
  requesterCountry?: string | null;
  requesterPhone?: string | null;
  serviceCountry?: string | null;
  requesterIdForPetUpdate: string | null;
  sessionKey?: string | null;
  sending: boolean;
}) {
  const paymentBasePrice = careScopePaymentAmount(quoteCard, requestCard);
  const hasValidPrice = paymentBasePrice > 0;
  const isVoluntaryQuote = quoteCard?.voluntary === true;
  const isNoChargeVoluntary = isVoluntaryQuote && !hasValidPrice;
  const curr = resolveCareScopeDisplayCurrency({
    currencyCountries: [serviceCountry, requesterCountry],
    quoteCard,
    requestCard,
  });
  const quoteMinor = hasValidPrice ? toStripeMinorUnitAmount(paymentBasePrice, curr) : 0;
  const serviceFeeMinor = hasValidPrice ? Math.round(quoteMinor * CARE_REQUESTER_FEE_RATE) : 0;
  const totalDueMinor = quoteMinor + serviceFeeMinor;
  const totalDue = fromStripeMinorUnitAmount(totalDueMinor, curr);
  const hasValidCurrency = isNoChargeVoluntary || Boolean(curr);
  const displayCurrency = formatNativeCareCurrencySymbol(curr);
  const vetAuthCurrency = normalizeNativeCarerCurrency(curr) || resolveNativeCarerCurrency(serviceCountry, requesterCountry);
  const serviceType = clean(quoteCard?.serviceType) || clean(requestCard?.serviceType) || "Care";
  const selectedPetIds = useMemo(() => {
    const ids = [
      ...(Array.isArray(quoteCard?.petIds) ? quoteCard.petIds : []),
      clean(quoteCard?.petId),
      ...(Array.isArray(requestCard?.petIds) ? requestCard.petIds : []),
      clean(requestCard?.petId),
    ].map(clean).filter(Boolean);
    return Array.from(new Set(ids));
  }, [quoteCard?.petId, quoteCard?.petIds, requestCard?.petId, requestCard?.petIds]);
  const petId = selectedPetIds[0] || "";
  const visiblePetName = clean(quoteCard?.petName) || clean(requestCard?.petName) || clean(requestCard?.pets?.[0]?.petName) || clean(quoteCard?.pets?.[0]?.petName);
  const hasAgreementPet = Boolean(petId || visiblePetName);
  const selectedPets = useMemo(() => {
    const idSet = new Set(selectedPetIds);
    const matched = pets.filter((pet) => idSet.has(pet.id));
    return matched.length ? matched : petId ? pets.filter((pet) => pet.id === petId) : [];
  }, [petId, pets, selectedPetIds]);
  const requestDates = (Array.isArray(quoteCard?.requestedDates) && quoteCard.requestedDates.length ? quoteCard.requestedDates : requestCard?.requestedDates || []).map(clean).filter(Boolean).sort();
  const firstRequestDate = requestDates[0] || clean(requestCard?.requestedDate);
  const lastRequestDate = requestDates[requestDates.length - 1] || firstRequestDate;
  const quoteOverridesSchedule = Boolean((Array.isArray(quoteCard?.requestedDates) && quoteCard.requestedDates.length > 0) || clean(quoteCard?.startTime) || clean(quoteCard?.endTime));
  const startAt = !quoteOverridesSchedule && clean(requestCard?.startAtIso)
    ? clean(requestCard?.startAtIso)
    : buildServiceBookingDateTime(firstRequestDate, clean(quoteCard?.startTime) || clean(requestCard?.startTime));
  const rawEndAt = !quoteOverridesSchedule && clean(requestCard?.endAtIso)
    ? clean(requestCard?.endAtIso)
    : buildServiceBookingDateTime(lastRequestDate, clean(quoteCard?.endTime) || clean(requestCard?.endTime));
  const startAtMs = Date.parse(startAt);
  const rawEndAtMs = Date.parse(rawEndAt);
  const endAtMs = Number.isFinite(startAtMs) && Number.isFinite(rawEndAtMs) && rawEndAtMs <= startAtMs ? rawEndAtMs + 24 * 60 * 60 * 1000 : rawEndAtMs;
  const endAt = Number.isFinite(endAtMs) ? new Date(endAtMs).toISOString() : rawEndAt;
  const invalidBookingDuration = !Number.isFinite(startAtMs) || !Number.isFinite(endAtMs) || endAtMs - startAtMs < 60 * 60 * 1000;
  const defaultHandoff = [clean(requestCard?.locationStyles?.join(" / ")), clean(requestCard?.locationArea)].filter(Boolean).join(" - ");
  const phoneCountryCode = useMemo(() => resolveNativeCountryCodeFromLabel(requesterCountry), [requesterCountry]);
  const [handoffMethod, setHandoffMethod] = useState(defaultHandoff);
  const [contact, setContact] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [handoffLocation, setHandoffLocation] = useState("");
  const [careInstructions, setCareInstructions] = useState(clean(requestCard?.additionalNotes));
  const [medicationAllergyNotes, setMedicationAllergyNotes] = useState("");
  const [behaviorEscapeRisk, setBehaviorEscapeRisk] = useState("");
  const [vetAuthChoice, setVetAuthChoice] = useState<"authorize" | "decline" | null>(null);
  const [vetAuthCap, setVetAuthCap] = useState("");
  const [vetAuthMenuOpen, setVetAuthMenuOpen] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [termsSheetVisible, setTermsSheetVisible] = useState(false);
  const [termsScrolled, setTermsScrolled] = useState(false);
  const [requesterSignature, setRequesterSignature] = useState<CareSignatureSnapshot | null>(null);
  const [signatureSigning, setSignatureSigning] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [contactValid, setContactValid] = useState(false);
  const [emergencyContactValid, setEmergencyContactValid] = useState(false);
  const [emergencyVetContact, setEmergencyVetContact] = useState("");
  const [petRefillTarget, setPetRefillTarget] = useState<{ field: "medications" | "vet"; petId: string | null } | null>(null);
  const [petRefillAttempted, setPetRefillAttempted] = useState(false);
  const [paymentTraceId, setPaymentTraceId] = useState("");
  const [paymentAttempting, setPaymentAttempting] = useState(false);
  const [openedScopeVersionId, setOpenedScopeVersionId] = useState("");
  // Guards the draft-reset effect below so it only runs once per open session per scope
  // version, not on every background refetch. `careScope`/`initialCareDetails` are freshly
  // parsed objects on every realtime/poll refresh even when nothing changed, and the effect
  // used to sit on `initialCareDetails` in its dependency array -- so a routine background
  // refresh mid-session force-reset `termsSheetVisible` to false, closing the just-opened
  // Terms modal on the owner within about a second of opening it.
  const draftInitializedForRef = useRef<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [vetClinicDraft, setVetClinicDraft] = useState("");
  const [vetNameDraft, setVetNameDraft] = useState("");
  const [vetPhoneDraft, setVetPhoneDraft] = useState("");
  const [medicationNameDraft, setMedicationNameDraft] = useState("");
  const [medicationDosageDraft, setMedicationDosageDraft] = useState("");
  const [medicationFrequencyDraft, setMedicationFrequencyDraft] = useState("");
  const [slideResetKey, setSlideResetKey] = useState(0);
  const signatureCaptureRef = useRef<View | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const paymentFieldOffsetsRef = useRef<Record<string, number>>({});
  const paymentTraceIdRef = useRef("");
  const validationStageRef = useRef<"sign" | "confirm" | null>(null);
  const bookingTermsPage = useMemo(() => getNativeLegalPage("/booking-terms"), []);
  const draftKey = useMemo(() => paymentDraftKey(requesterId, providerId, selectedPetIds, serviceType), [providerId, requesterId, selectedPetIds, serviceType]);
  const activeScopeVersionId = careScope?.scopeVersionId || `${serviceChatId || "service"}:unversioned`;
  const initialCareDetails = useMemo<CareScopeCareDetails>(() => {
    const saved = careScope?.careDetails || {};
    return {
      behaviorEscapeRisk: clean(saved.behaviorEscapeRisk),
      careInstructions: clean(saved.careInstructions) || clean(requestCard?.additionalNotes),
      carerContact: carerContactFromCareDetails(saved),
      contact: ownerContactFromCareDetails(saved) || clean(requesterPhone),
      emergencyContact: clean(saved.emergencyContact),
      emergencyVetAuthorization: saved.emergencyVetAuthorization,
      emergencyVetContact: clean(saved.emergencyVetContact),
      handoffLocation: clean(saved.handoffLocation),
      handoffMethod: clean(saved.handoffMethod) || defaultHandoff,
      medicationAllergyNotes: clean(saved.medicationAllergyNotes),
      ownerContact: ownerContactFromCareDetails(saved) || clean(requesterPhone),
      termsPath: clean(saved.termsPath),
      termsVersion: clean(saved.termsVersion),
    };
  }, [careScope?.careDetails, defaultHandoff, requestCard?.additionalNotes, requesterPhone]);
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
    if (!open) {
      draftInitializedForRef.current = null;
      return;
    }
    const initKey = activeScopeVersionId || "";
    if (draftInitializedForRef.current === initKey) return;
    draftInitializedForRef.current = initKey;
    let cancelled = false;
    type PaymentDraft = {
      behaviorEscapeRisk: string;
      careInstructions: string;
      contact: string;
      emergencyContact: string;
      emergencyVetContact: string;
      handoffLocation: string;
      handoffMethod: string;
      medicationAllergyNotes: string;
      scopeVersionId?: string;
      vetAuthCap: string;
      vetAuthChoice: "authorize" | "decline" | null;
    };
    const capMinor = Number(initialCareDetails.emergencyVetAuthorization?.capMinor || 0);
    const defaultDraft: PaymentDraft = {
      behaviorEscapeRisk: initialCareDetails.behaviorEscapeRisk || "",
      careInstructions: initialCareDetails.careInstructions || "",
      contact: initialCareDetails.contact || "",
      emergencyContact: initialCareDetails.emergencyContact || "",
      emergencyVetContact: initialCareDetails.emergencyVetContact || "",
      handoffLocation: initialCareDetails.handoffLocation || "",
      handoffMethod: initialCareDetails.handoffMethod || defaultHandoff,
      medicationAllergyNotes: initialCareDetails.medicationAllergyNotes || "",
      scopeVersionId: activeScopeVersionId,
      vetAuthCap: initialCareDetails.emergencyVetAuthorization?.authorized === true && Number.isFinite(capMinor) && capMinor > 0
        ? String(fromStripeMinorUnitAmount(capMinor, initialCareDetails.emergencyVetAuthorization.currency || vetAuthCurrency))
        : "",
      vetAuthChoice: typeof initialCareDetails.emergencyVetAuthorization?.authorized === "boolean"
        ? initialCareDetails.emergencyVetAuthorization.authorized ? "authorize" : "decline"
        : null,
    };
    const applyDraft = (draft: PaymentDraft) => {
      setHandoffMethod(draft.handoffMethod);
      setContact(draft.contact);
      setEmergencyContact(draft.emergencyContact);
      setHandoffLocation(draft.handoffLocation);
      setCareInstructions(draft.careInstructions);
      setMedicationAllergyNotes(draft.medicationAllergyNotes);
      setEmergencyVetContact(draft.emergencyVetContact);
      setBehaviorEscapeRisk(draft.behaviorEscapeRisk);
      setVetAuthChoice(draft.vetAuthChoice);
      setVetAuthCap(draft.vetAuthCap);
    };
    void AsyncStorage.getItem(draftKey).then((raw) => {
      if (cancelled) return;
      if (!raw) {
        applyDraft(defaultDraft);
        return;
      }
      try {
        const parsed = JSON.parse(raw) as Partial<typeof defaultDraft>;
        if (clean(parsed.scopeVersionId) !== activeScopeVersionId) {
          void AsyncStorage.removeItem(draftKey).catch(() => undefined);
          applyDraft(defaultDraft);
          return;
        }
        applyDraft({
          behaviorEscapeRisk: clean(parsed.behaviorEscapeRisk),
          careInstructions: clean(parsed.careInstructions) || defaultDraft.careInstructions,
          contact: clean(parsed.contact) || defaultDraft.contact,
          emergencyContact: clean(parsed.emergencyContact),
          emergencyVetContact: clean(parsed.emergencyVetContact),
          handoffLocation: clean(parsed.handoffLocation) || defaultDraft.handoffLocation,
          handoffMethod: clean(parsed.handoffMethod) || defaultDraft.handoffMethod,
          medicationAllergyNotes: clean(parsed.medicationAllergyNotes),
          scopeVersionId: activeScopeVersionId,
          vetAuthCap: clean(parsed.vetAuthCap) || defaultDraft.vetAuthCap,
          vetAuthChoice: parsed.vetAuthChoice === "authorize" || parsed.vetAuthChoice === "decline"
            ? parsed.vetAuthChoice
            : defaultDraft.vetAuthChoice,
        });
      } catch {
        applyDraft(defaultDraft);
      }
    });
    setAttempted(false);
    setSubmitError(null);
    setTermsSheetVisible(false);
    setTermsScrolled(false);
    setTermsAccepted(false);
    setPolicyAccepted(false);
    setRequesterSignature(null);
    setSignatureSigning(false);
    setVetAuthMenuOpen(false);
    setFocusedField(null);
    setPaymentTraceId("");
    paymentTraceIdRef.current = "";
    setPaymentAttempting(false);
    setOpenedScopeVersionId((current) => current || activeScopeVersionId);
    setSlideResetKey((value) => value + 1);
    return () => {
      cancelled = true;
    };
  }, [activeScopeVersionId, defaultHandoff, draftKey, initialCareDetails, open, requestCard?.additionalNotes, vetAuthCurrency]);
  useEffect(() => {
    if (!open) setOpenedScopeVersionId("");
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => {
      void AsyncStorage.setItem(draftKey, JSON.stringify({
        behaviorEscapeRisk,
        careInstructions,
        contact,
        emergencyContact,
        emergencyVetContact,
        handoffLocation,
        handoffMethod,
        medicationAllergyNotes,
        scopeVersionId: activeScopeVersionId,
        vetAuthCap,
        vetAuthChoice,
        updatedAt: Date.now(),
      })).catch(() => undefined);
    }, 450);
    return () => clearTimeout(timeout);
  }, [activeScopeVersionId, behaviorEscapeRisk, careInstructions, contact, draftKey, emergencyContact, emergencyVetContact, handoffLocation, handoffMethod, medicationAllergyNotes, open, vetAuthCap, vetAuthChoice]);
  const selectedPetMedicationNotes = useMemo(() => {
    const withMedication = selectedPets.find((pet) => Array.isArray(pet.medications) && pet.medications.length > 0);
    return withMedication?.medications?.length
      ? withMedication.medications.map((medication) => [medication.name, formatMedicationSummary(medication)].filter(Boolean).join(": ")).join("\n")
      : "";
  }, [selectedPets]);
  useEffect(() => {
    if (!open || !selectedPetMedicationNotes || medicationAllergyNotes.trim()) return;
    setMedicationAllergyNotes(selectedPetMedicationNotes);
  }, [medicationAllergyNotes, open, selectedPetMedicationNotes]);
  const normalizedEmergencyContact = emergencyContact.trim();
  const normalizedContact = contact.trim();
  const normalizedHandoffLocation = handoffLocation.trim();
  const contactLooksValid = contactValid || (normalizedContact.startsWith("+") && isValidPhoneNumber(normalizedContact));
  const missingContact = !normalizedContact || !contactLooksValid;
  const emergencyContactLooksValid = emergencyContactValid || (normalizedEmergencyContact.startsWith("+") && isValidPhoneNumber(normalizedEmergencyContact));
  const missingEmergency = !normalizedEmergencyContact || !emergencyContactLooksValid;
  const missingHandoffLocation = !normalizedHandoffLocation;
  // Care instructions are optional — the carer follows the agreed scope when blank.
  const missingInstructions = false;
  const missingMedication = Boolean(selectedPetMedicationNotes) && !medicationAllergyNotes.trim();
  const emergencyVetPermission = vetAuthChoice === "authorize";
  const vetAuthCapAmount = Number(vetAuthCap);
  const missingVetAuthChoice = vetAuthChoice === null;
  const missingVetAuthCap = vetAuthChoice === "authorize" && (!Number.isFinite(vetAuthCapAmount) || vetAuthCapAmount <= 0);
  // Preferred vet contact is optional even when authorizing — left to the carer if blank.
  const missingVetContact = false;
  const vetAuthCapMinor = vetAuthChoice === "authorize" ? toStripeMinorUnitAmount(vetAuthCapAmount, vetAuthCurrency) : undefined;
  const currentCareDetails = useMemo<CareScopeCareDetails>(() => ({
    behaviorEscapeRisk: behaviorEscapeRisk.trim(),
    careInstructions: careInstructions.trim(),
    carerContact: carerContactFromCareDetails(initialCareDetails),
    contact: normalizedContact,
    emergencyContact: normalizedEmergencyContact,
    emergencyVetAuthorization: {
      authorized: emergencyVetPermission,
      ...(vetAuthCapMinor ? { capMinor: vetAuthCapMinor, currency: vetAuthCurrency } : {}),
    },
    emergencyVetContact: emergencyVetContact.trim(),
    handoffLocation: normalizedHandoffLocation,
    handoffMethod: handoffMethod.trim() || defaultHandoff,
    medicationAllergyNotes: medicationAllergyNotes.trim(),
    ownerContact: normalizedContact,
    termsPath: bookingTermsPage.path,
    termsVersion: bookingTermsPage.effectiveDate,
  }), [behaviorEscapeRisk, bookingTermsPage.effectiveDate, bookingTermsPage.path, careInstructions, defaultHandoff, emergencyVetContact, emergencyVetPermission, handoffMethod, initialCareDetails, medicationAllergyNotes, normalizedContact, normalizedEmergencyContact, normalizedHandoffLocation, vetAuthCapMinor, vetAuthCurrency]);
  const comparableInitialCareDetails = useMemo(() => JSON.stringify({
    behaviorEscapeRisk: initialCareDetails.behaviorEscapeRisk || "",
    careInstructions: initialCareDetails.careInstructions || "",
    contact: ownerContactFromCareDetails(initialCareDetails),
    emergencyContact: initialCareDetails.emergencyContact || "",
    emergencyVetAuthorization: initialCareDetails.emergencyVetAuthorization,
    emergencyVetContact: initialCareDetails.emergencyVetContact || "",
    handoffLocation: initialCareDetails.handoffLocation || "",
    handoffMethod: initialCareDetails.handoffMethod || "",
    medicationAllergyNotes: initialCareDetails.medicationAllergyNotes || "",
    termsPath: initialCareDetails.termsPath || bookingTermsPage.path,
    termsVersion: initialCareDetails.termsVersion || bookingTermsPage.effectiveDate,
  }), [bookingTermsPage.effectiveDate, bookingTermsPage.path, initialCareDetails]);
  const comparableCurrentCareDetails = useMemo(() => JSON.stringify({
    behaviorEscapeRisk: currentCareDetails.behaviorEscapeRisk || "",
    careInstructions: currentCareDetails.careInstructions || "",
    contact: ownerContactFromCareDetails(currentCareDetails),
    emergencyContact: currentCareDetails.emergencyContact || "",
    emergencyVetAuthorization: currentCareDetails.emergencyVetAuthorization,
    emergencyVetContact: currentCareDetails.emergencyVetContact || "",
    handoffLocation: currentCareDetails.handoffLocation || "",
    handoffMethod: currentCareDetails.handoffMethod || "",
    medicationAllergyNotes: currentCareDetails.medicationAllergyNotes || "",
    termsPath: currentCareDetails.termsPath || bookingTermsPage.path,
    termsVersion: currentCareDetails.termsVersion || bookingTermsPage.effectiveDate,
  }), [bookingTermsPage.effectiveDate, bookingTermsPage.path, currentCareDetails]);
  const hasEditedCareInstruction = comparableCurrentCareDetails !== comparableInitialCareDetails;
  const careInstructionsChanged = clean(currentCareDetails.careInstructions) !== clean(initialCareDetails.careInstructions);
  const missingSignature = !requesterSignature;
  const ownerAlreadySigned = careScope?.ownerSigned === true;
  const carerAlreadySigned = careScope?.carerSigned === true;
  const currentMutualSignatures = hasCurrentAgreement === true || careScope?.mutualSigned === true;
  const paymentInProgress = isCarePaymentPendingActive(careScope);
  const canSignCareScope = !currentMutualSignatures && !ownerAlreadySigned && (carerAlreadySigned || careScope?.actorRole === "carer") && !paymentInProgress;
  useEffect(() => {
    if (!open) {
      validationStageRef.current = null;
      return;
    }
    const nextStage = canSignCareScope ? "sign" : "confirm";
    if (validationStageRef.current === nextStage) return;
    validationStageRef.current = nextStage;
    setAttempted(false);
    setSubmitError(null);
    setFocusedField(null);
  }, [canSignCareScope, open]);
  const paymentLockedByScopeChange = !canSignCareScope && Boolean(openedScopeVersionId && activeScopeVersionId && openedScopeVersionId !== activeScopeVersionId);
  // Terms consent is captured once, at the signature step. A requester who has
  // already agreed/signed never re-confirms the agreement just to pay.
  const missingTermsAcknowledgement = canSignCareScope ? !termsAccepted : false;
  const missingPolicyAcknowledgement = canSignCareScope ? !policyAccepted : false;
  const missingTerms = missingTermsAcknowledgement || missingPolicyAcknowledgement;
  const hasValidAgreementScope = hasValidCurrency && (isNoChargeVoluntary || hasValidPrice) && !invalidBookingDuration && Boolean(hasAgreementPet && requesterId && providerId && startAt && endAt);
  const canSubmitCareDetailsUpdate = hasValidAgreementScope && !missingContact && !missingEmergency && !missingHandoffLocation && !missingInstructions && !missingMedication && !missingVetAuthChoice && !missingVetAuthCap && !missingVetContact;
  const canAgreeCareScope = hasValidAgreementScope && canSignCareScope && !missingTerms && !missingSignature;
  const paymentReadyBase = canSubmitCareDetailsUpdate && currentMutualSignatures && !missingTerms && !paymentInProgress && Boolean(hasAgreementPet && requesterId && providerId && startAt && endAt);
  const canPay = paymentReadyBase && !hasEditedCareInstruction && !paymentLockedByScopeChange;
  const canSaveInstructionThenPay = paymentReadyBase && hasEditedCareInstruction && !paymentLockedByScopeChange;
  const getPaymentBlocker = useCallback(() => {
    if (paymentInProgress) return PAYMENT_BLOCKERS.paymentInProgress;
    if (paymentLockedByScopeChange) return "The Care Scope changed. Review and sign the latest Care Scope before paying.";
    if (!hasValidCurrency) return PAYMENT_BLOCKERS.invalidQuote;
    if (!isNoChargeVoluntary && !hasValidPrice) return PAYMENT_BLOCKERS.invalidQuote;
    if (invalidBookingDuration) return PAYMENT_BLOCKERS.invalidBookingDuration;
    if (!(hasAgreementPet && requesterId && providerId && startAt && endAt)) return PAYMENT_BLOCKERS.incompleteBooking;
    if (canSignCareScope && missingTerms) return PAYMENT_BLOCKERS.missingTerms;
    if (canSignCareScope && missingSignature) return PAYMENT_BLOCKERS.missingSignature;
    if (missingContact) return "Add a valid owner's contact before confirming.";
    if (missingEmergency) return PAYMENT_BLOCKERS.invalidEmergencyContact;
    if (missingHandoffLocation) return "Carer need the exact hand-off location to begin Care session.";
    if (missingInstructions) return PAYMENT_BLOCKERS.missingCareInstructions;
    if (missingMedication) return PAYMENT_BLOCKERS.missingMedicationNotes;
    if (missingVetAuthChoice) return PAYMENT_BLOCKERS.invalidEmergencyVetAuthorization;
    if (missingVetAuthCap) return PAYMENT_BLOCKERS.invalidEmergencyVetCap;
    if (missingVetContact) return PAYMENT_BLOCKERS.invalidEmergencyVetContact;
    if (!currentMutualSignatures) return isNoChargeVoluntary ? "Booking confirms after both sides sign the current Care Scope." : "Payment unlocks after both sides sign the current Care Scope.";
    return "";
  }, [
    canSignCareScope,
    currentMutualSignatures,
    endAt,
    hasValidCurrency,
    hasValidPrice,
    hasAgreementPet,
    invalidBookingDuration,
    isNoChargeVoluntary,
    missingContact,
    missingEmergency,
    missingHandoffLocation,
    missingInstructions,
    missingMedication,
    missingSignature,
    missingTerms,
    missingVetAuthCap,
    missingVetAuthChoice,
    missingVetContact,
    paymentInProgress,
    paymentLockedByScopeChange,
    providerId,
    requesterId,
    startAt,
  ]);
  const getFirstInvalidPaymentField = useCallback(() => {
    if (canSignCareScope && missingTermsAcknowledgement) return "terms";
    if (canSignCareScope && missingPolicyAcknowledgement) return "policy";
    if (canSignCareScope && missingSignature) return "signature";
    if (missingContact) return "contact";
    if (missingEmergency) return "emergency";
    if (missingHandoffLocation) return "handoffLocation";
    if (missingMedication) return "medication";
    if (missingVetAuthChoice) return "vetAuth";
    if (missingVetAuthCap) return "vetAuthCap";
    return "";
  }, [canSignCareScope, missingContact, missingEmergency, missingHandoffLocation, missingMedication, missingPolicyAcknowledgement, missingSignature, missingTermsAcknowledgement, missingVetAuthCap, missingVetAuthChoice]);
  const appendPaymentTrace = useCallback((traceId: string, step: string, details: Record<string, unknown> = {}) => {
    const normalizedStep = clean(step);
    if (!normalizedStep) return;
    console.warn("[native.service_payment.trace]", { traceId, step: normalizedStep, ...details });
    paymentTraceIdRef.current = traceId;
    setPaymentTraceId(traceId);
  }, []);
  useEffect(() => {
    if (!open) return;
    console.warn("[native.service_payment.runtime] sheet_open", {
      probe: "payment-ui-v3",
      hasQuote: Boolean(quoteCard),
      isVoluntaryQuote,
      isNoChargeVoluntary,
      hasValidPrice,
      canPay,
      canSaveInstructionThenPay,
      blocker: getPaymentBlocker() || "none",
    });
    const traceId = paymentTraceIdRef.current || createPaymentTraceId();
    paymentTraceIdRef.current = traceId;
    setPaymentTraceId(traceId);
    appendPaymentTrace(traceId, "sheet/modal open", { canPay, blocker: getPaymentBlocker() || "none" });
  }, [appendPaymentTrace, canPay, canSaveInstructionThenPay, getPaymentBlocker, hasValidPrice, isNoChargeVoluntary, isVoluntaryQuote, open, quoteCard]);
  const closePaymentSheet = () => {
    if (paymentTraceId) appendPaymentTrace(paymentTraceId, "sheet/modal closed", { sending, paymentAttempting });
    onClose();
  };
  const handlePaymentBlocked = (traceId?: string, source = "blocked") => {
    setAttempted(true);
    const blocker = getPaymentBlocker() || PAYMENT_BLOCKERS.incompleteBooking;
    if (traceId) appendPaymentTrace(traceId, "canPay result + blocker", { source, canPay: false, blocker });
    const firstInvalidField = getFirstInvalidPaymentField();
    setSubmitError(firstInvalidField ? null : blocker);
    if (!firstInvalidField) onBlocker(blocker);
    console.warn("[native.service_payment] blocked_before_create_service_payment", {
      hasValidPrice,
      isVoluntaryQuote,
      isNoChargeVoluntary,
      missingContact,
      missingEmergency,
      missingHandoffLocation,
      missingInstructions,
      missingMedication,
      missingVetAuthChoice,
      missingVetAuthCap,
      missingVetContact,
      missingTerms,
      missingSignature,
      invalidBookingDuration,
      hasAgreementPet,
      hasPetId: Boolean(petId),
      hasRequesterId: Boolean(requesterId),
      hasProviderId: Boolean(providerId),
      hasStartAt: Boolean(startAt),
      hasEndAt: Boolean(endAt),
    });
    setSlideResetKey((value) => value + 1);
    if (firstInvalidField) focusPaymentField(firstInvalidField);
    else requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 260, animated: true }));
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
    const session = requireCurrentNativeSession({ accessToken, expectedUserId: requesterIdForPetUpdate, sessionKey });
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
        .eq("owner_id", session.userId);
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
      const { error } = await supabase.from("pets").update({ medications: nextMedications }).eq("id", targetPet.id).eq("owner_id", session.userId);
      if (error) throw error;
      setMedicationAllergyNotes(nextMedications.map((medication) => [medication.name, formatMedicationSummary(medication)].filter(Boolean).join(": ")).join("\n"));
    }
    closePetRefill();
  };
  const submit = async () => {
    const traceId = paymentTraceId || createPaymentTraceId();
    setPaymentTraceId(traceId);
    setAttempted(true);
    setSubmitError(null);
    appendPaymentTrace(traceId, "slide commit fired");
    appendPaymentTrace(traceId, "canPay result + blocker", { canPay: canPay || canSaveInstructionThenPay, blocker: getPaymentBlocker() || "none" });
    console.warn("[native.service_payment.runtime] submit_called", {
      canPay,
      canSaveInstructionThenPay,
      blocker: getPaymentBlocker() || "none",
      emergencyContactLooksValid,
    });
    if (paymentAttempting || sending) {
      appendPaymentTrace(traceId, "duplicate submit prevented", { sending, paymentAttempting });
      return;
    }
    if (paymentLockedByScopeChange) {
      handlePaymentBlocked(traceId, "scope_changed");
      return;
    }
    if (canSignCareScope) {
      if (!canAgreeCareScope) {
        handlePaymentBlocked(traceId, "care_scope_signature");
        return;
      }
      setPaymentAttempting(true);
      let uploadedOwnerSignaturePath: string | null = null;
      try {
        const agreedAt = new Date().toISOString();
        if (!serviceChatId || !signatureCaptureRef.current || !requesterSignature) {
          handlePaymentBlocked(traceId, "signature_capture_missing");
          return;
        }
        const signatureUri = await captureRef(signatureCaptureRef, {
          fileName: `huddle-owner-signature-${Date.now()}`,
          format: "png",
          quality: 1,
          result: "tmpfile",
        });
        const ownerSignatureImage = await uploadNativeServiceCareAgreementSignatureImage({
          accessToken,
          media: {
            height: requesterSignature.height,
            kind: "image",
            mimeType: "image/png",
            name: `owner-scope-signature-${Date.now()}.png`,
            size: null,
            uri: signatureUri,
            width: requesterSignature.width,
          },
          role: "owner",
          serviceChatId,
          sessionKey,
          userId: requesterId,
        });
        uploadedOwnerSignaturePath = ownerSignatureImage.path;
        const { error: ownerScopeSignatureError } = await supabase.rpc("record_service_care_scope_signature", {
          p_acknowledged_terms: true,
          p_acknowledged_no_start_policy: policyAccepted,
          p_service_chat_id: serviceChatId,
          p_signature: {
            ...requesterSignature,
            imageBucket: ownerSignatureImage.bucket,
            imageMime: ownerSignatureImage.mime,
            imagePath: ownerSignatureImage.path,
            signedAt: agreedAt,
          },
        });
        if (ownerScopeSignatureError) throw ownerScopeSignatureError;
        uploadedOwnerSignaturePath = null;
        void AsyncStorage.removeItem(draftKey).catch(() => undefined);
        await onSigned?.();
      } catch (error) {
        if (uploadedOwnerSignaturePath) {
          void requestNativeStorageCleanupResult("care_agreements", uploadedOwnerSignaturePath, "record_owner_care_scope_signature_failed", accessToken);
        }
        appendPaymentTrace(traceId, "scope signature capture failed", { message: error instanceof Error ? error.message : "unknown" });
        setSubmitError(nativeSafeErrorCopy(error, "Unable to save your signature. Please clear it and sign again."));
        onBlocker(nativeSafeErrorCopy(error, "Unable to save your signature. Please clear it and sign again."));
        setSlideResetKey((value) => value + 1);
      } finally {
        setPaymentAttempting(false);
        appendPaymentTrace(traceId, "sheet/modal final state", { open });
      }
      return;
    }
    if (hasEditedCareInstruction) {
      if (!canSubmitCareDetailsUpdate) {
        handlePaymentBlocked(traceId, "care_instruction_update");
        return;
      }
      setPaymentAttempting(true);
      let instructionUpdatedThisSubmit = false;
      try {
        await onUpdateCareDetails(currentCareDetails);
        instructionUpdatedThisSubmit = true;
        void AsyncStorage.removeItem(draftKey).catch(() => undefined);
        if (!currentMutualSignatures || paymentInProgress) {
          onClose();
          return;
        }
      } catch (error) {
        appendPaymentTrace(traceId, "care instruction update failed", { message: error instanceof Error ? error.message : "unknown" });
        const message = nativeSafeErrorCopy(error, "Unable to update care instruction.");
        setSubmitError(message);
        onBlocker(message);
        setSlideResetKey((value) => value + 1);
      } finally {
        setPaymentAttempting(false);
      }
      if (!instructionUpdatedThisSubmit) return;
    }
    if (!canSignCareScope && !canPay && !canSaveInstructionThenPay) {
      handlePaymentBlocked(traceId, "submit");
      return;
    }
    setPaymentAttempting(true);
    try {
      const agreedAt = new Date().toISOString();
      const snapshot = {
        serviceType,
        petId,
        petName: visiblePetName,
        petSpecies: clean(quoteCard?.petSpecies) || clean(requestCard?.petSpecies) || clean(quoteCard?.petType) || clean(requestCard?.petType),
        petBreed: clean(quoteCard?.petBreed) || clean(requestCard?.petBreed),
        dogSize: clean(requestCard?.pets?.[0]?.dogSize) || clean(quoteCard?.pets?.[0]?.dogSize) || clean(requestCard?.dogSize) || clean(quoteCard?.dogSize),
        startAt,
        endAt,
        handoffMethod: handoffMethod.trim() || defaultHandoff,
        handoffLocation: normalizedHandoffLocation,
        otherTasks: clean(quoteCard?.otherTasks) || clean(requestCard?.otherTasks),
        scopeTasks: Array.isArray(quoteCard?.scopeTasks) && quoteCard.scopeTasks.length ? quoteCard.scopeTasks.map(clean).filter(Boolean) : Array.isArray(requestCard?.scopeTasks) ? requestCard.scopeTasks.map(clean).filter(Boolean) : [],
        scopeFrequency: clean(quoteCard?.scopeFrequency) || clean(requestCard?.scopeFrequency),
        carerContact: carerContactFromCareDetails(initialCareDetails),
        contact: normalizedContact,
        ownerContact: normalizedContact,
        emergencyContact: normalizedEmergencyContact,
        careInstructions: careInstructions.trim(),
        medicationAllergyNotes: medicationAllergyNotes.trim(),
        behaviorEscapeRisk: behaviorEscapeRisk.trim(),
        emergencyVetContact: emergencyVetContact.trim(),
        emergencyVetPermission,
        emergencyVetAuthorization: {
          authorized: emergencyVetPermission,
          ...(vetAuthCapMinor ? { capMinor: vetAuthCapMinor, currency: vetAuthCurrency } : {}),
        },
        price: isNoChargeVoluntary
          ? { currency: "", providerQuote: 0, requesterTotal: 0 }
          : {
            currency: curr,
            providerQuote: quoteMinor,
            requesterTotal: totalDueMinor,
          },
        termsVersion: bookingTermsPage.effectiveDate,
        termsPath: bookingTermsPage.path,
        agreedAt,
        requesterSignature: undefined,
        requesterId,
        providerId,
        createdAt: agreedAt,
      };
      appendPaymentTrace(traceId, isNoChargeVoluntary ? "onConfirmVolunteer called" : "onPay called", {
        hasSnapshot: true,
        hasAgreementPet: Boolean(snapshot.petId || snapshot.petName),
        hasPetId: Boolean(snapshot.petId),
        hasRequesterId: Boolean(snapshot.requesterId),
        hasProviderId: Boolean(snapshot.providerId),
      });
      const result = isNoChargeVoluntary
        ? await onConfirmVolunteer(snapshot, traceId, (step, details) => appendPaymentTrace(traceId, step, details))
        : await onPay(snapshot, traceId, (step, details) => appendPaymentTrace(traceId, step, details));
      if (!result.ok) {
        appendPaymentTrace(traceId, "payment failure recorded", { error: result.error || PAYMENT_FAILED_COPY });
        appendPaymentTrace(traceId, "sheet/modal still open after payment failure", { open: true });
        setSubmitError(result.error || PAYMENT_FAILED_COPY);
        onBlocker(result.error || PAYMENT_FAILED_COPY);
        setSlideResetKey((value) => value + 1);
      } else {
        void AsyncStorage.removeItem(draftKey).catch(() => undefined);
        appendPaymentTrace(traceId, "sheet/modal closed after URL open", { open: false });
        onClose();
      }
    } catch (error) {
      appendPaymentTrace(traceId, "booking confirmation failed", { message: error instanceof Error ? error.message : "unknown" });
      setSubmitError(nativeSafeErrorCopy(error, PAYMENT_FAILED_COPY));
      onBlocker(nativeSafeErrorCopy(error, PAYMENT_FAILED_COPY));
      setSlideResetKey((value) => value + 1);
    } finally {
      setPaymentAttempting(false);
      appendPaymentTrace(traceId, "sheet/modal final state", { open });
    }
  };
  return (
    <View pointerEvents="box-none" style={styles.inlineSheetLayer}>
      <Pressable accessibilityLabel="Close payment sheet" accessibilityRole="button" onPress={closePaymentSheet} style={nativeModalStyles.appModalBackdrop} />
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} pointerEvents="box-none" style={[nativeModalStyles.appModalBottomSafeArea, nativeModalStyles.appBottomSheetEventBoundary]}>
        <AppBottomSheet mode="large" onClose={closePaymentSheet}>
          <AppBottomSheetHeader>
            <Text style={nativeModalStyles.appModalSheetTitle}>{canSignCareScope ? "Review & Sign Care Scope" : isNoChargeVoluntary ? "Confirm care" : "Booking Payment"}</Text>
            <AppModalCloseButton onPress={closePaymentSheet} />
          </AppBottomSheetHeader>
          <AppBottomSheetScroll contentContainerStyle={styles.paymentBody} scrollEnabled={!signatureSigning} scrollRef={scrollRef}>
            {canSignCareScope ? null : currentMutualSignatures ? (
              <View style={styles.paymentInfoBox}>
                <Text style={styles.paymentInfoTitle}>{isNoChargeVoluntary ? "Step 2 · Confirm Booking" : "Step 2 · Confirm & Pay"}</Text>
                <Text style={styles.paymentInfoText}>{isNoChargeVoluntary ? "Care Scope is agreed. Review the booking safety details before confirming." : "Care Scope is agreed. Review the booking safety details before payment."}</Text>
              </View>
            ) : null}
            <PaymentCareScopeSummary careDetails={careScope?.careDetails || null} careScope={careScope || null} disabledEdit={paymentAttempting || sending} onEdit={canSignCareScope ? onEditCareScope : undefined} onOpenPet={onOpenPet} providerCurrency={curr} quoteCard={quoteCard} requestCard={requestCard} showPaymentLine={!isNoChargeVoluntary} viewerRole="requester" />
            <CareScopeAgreementPaymentDetails hideWhenFree={!canSignCareScope} providerCurrency={curr} quoteCard={quoteCard} requestCard={requestCard} viewerRole="requester" />

            {paymentLockedByScopeChange ? (
              <View style={styles.paymentInfoBox}>
                <Text style={styles.paymentInfoTitle}>Care Scope changed</Text>
                <Text style={styles.paymentInfoText}>This payment is paused because the Care Scope changed. Review and sign the latest Care Scope before paying.</Text>
              </View>
            ) : !canSignCareScope ? (
              <>
                <View onLayout={registerPaymentField("contact")} style={nativeModalStyles.appModalFieldBlock}>
                  <Text style={styles.fieldLabel}>Owner's Contact</Text>
                  <NativePhoneField
                    defaultCountryCode={phoneCountryCode}
                    error={attempted && missingContact}
                    onChangeText={setContact}
                    onFocus={() => focusPaymentField("contact")}
                    onOpenCountryPicker={() => focusPaymentField("contact")}
                    onValidityChange={setContactValid}
                    placeholder="Phone number"
                    value={contact}
                  />
                  {attempted && missingContact ? <Text style={styles.errorText}>Add a valid owner's contact before confirming.</Text> : null}
                </View>

                <View onLayout={registerPaymentField("emergency")} style={nativeModalStyles.appModalFieldBlock}>
                  <Text style={styles.fieldLabel}>Emergency contact</Text>
                  <NativePhoneField
                    defaultCountryCode={phoneCountryCode}
                    error={attempted && missingEmergency}
                    onChangeText={setEmergencyContact}
                    onFocus={() => focusPaymentField("emergency")}
                    onOpenCountryPicker={() => focusPaymentField("emergency")}
                    onValidityChange={setEmergencyContactValid}
                    placeholder="Phone number"
                    value={emergencyContact}
                  />
                  {attempted && missingEmergency ? <Text style={styles.errorText}>Add a valid emergency contact before confirming.</Text> : null}
                </View>

                <View onLayout={registerPaymentField("handoffLocation")} style={nativeModalStyles.appModalFieldBlock}>
                  <Text style={styles.fieldLabel}>Hand-off location</Text>
                  <AppModalField error={attempted && missingHandoffLocation} focused={focusedField === "handoffLocation"} value={handoffLocation} onBlur={() => setFocusedField(null)} onChangeText={setHandoffLocation} onFocus={() => focusPaymentField("handoffLocation")} placeholder="Exact meeting point or address" />
                  {attempted && missingHandoffLocation ? <Text style={styles.errorText}>Carer need the exact hand-off location to begin Care session.</Text> : null}
                </View>

                <View onLayout={registerPaymentField("instructions")} style={nativeModalStyles.appModalFieldBlock}>
                  <Text style={styles.fieldLabel}>Care instructions</Text>
                  <AppModalField error={attempted && missingInstructions} focused={focusedField === "instructions"} value={careInstructions} onBlur={() => setFocusedField(null)} onChangeText={setCareInstructions} onFocus={() => focusPaymentField("instructions")} multiline placeholder="Anything the provider must follow" />
                </View>

                <View onLayout={registerPaymentField("medication")} style={nativeModalStyles.appModalFieldBlock}>
                  <Text style={styles.fieldLabel}>Medication / allergy notes</Text>
                  <AppModalField error={attempted && missingMedication} focused={focusedField === "medication"} value={medicationAllergyNotes} onBlur={() => setFocusedField(null)} onChangeText={setMedicationAllergyNotes} onFocus={() => focusPaymentField("medication")} placeholder={selectedPetMedicationNotes ? "Required from pet medication record" : "Optional"} />
                  {attempted && missingMedication ? <Text style={styles.errorText}>Import or add the medication notes before confirming.</Text> : null}
                </View>
                <ImportCheckbox checked={Boolean(medicationAllergyNotes.trim())} label="Import medication record from pet profile" onToggle={applyMedicationFromPet} />

                <View onLayout={registerPaymentField("behavior")} style={nativeModalStyles.appModalFieldBlock}>
                  <Text style={styles.fieldLabel}>Behavior / escape risk</Text>
                  <AppModalField focused={focusedField === "behavior"} value={behaviorEscapeRisk} onBlur={() => setFocusedField(null)} onChangeText={setBehaviorEscapeRisk} onFocus={() => focusPaymentField("behavior")} placeholder="Optional" />
                </View>

                <View onLayout={registerPaymentField("vetAuth")} style={nativeModalStyles.appModalFieldBlock}>
                  <Text style={styles.fieldLabel}>Emergency vet care</Text>
                  <RequestQuoteSelect
                    error={attempted && missingVetAuthChoice}
                    label=""
                    onToggle={() => { Keyboard.dismiss(); setVetAuthMenuOpen((value) => !value); focusPaymentField("vetAuth"); }}
                    open={vetAuthMenuOpen}
                    placeholder="Choose authorization"
                    value={vetAuthChoice === "authorize" ? "Authorize up to a limit" : vetAuthChoice === "decline" ? "Do not authorize - I'll be reachable" : ""}
                  >
                    <RequestOptionRow active={vetAuthChoice === "authorize"} label="Authorize up to a limit" onPress={() => { setVetAuthChoice("authorize"); setVetAuthMenuOpen(false); }} />
                    <RequestOptionRow active={vetAuthChoice === "decline"} label="Do not authorize - I'll be reachable" onPress={() => { setVetAuthChoice("decline"); setVetAuthMenuOpen(false); setVetAuthCap(""); }} />
                  </RequestQuoteSelect>
                  {attempted && missingVetAuthChoice ? <Text style={styles.errorText}>Choose whether emergency vet care is authorized before confirming.</Text> : null}
                  {vetAuthChoice === "authorize" ? (
                    <>
                    <View onLayout={registerPaymentField("vetAuthCap")} style={styles.requestRateBlock}>
                      <Text style={styles.fieldLabel}>Emergency vet limit</Text>
                      <View style={[styles.requestRateCompositeField, focusedField === "vetAuthCap" ? nativeModalStyles.appModalFieldFocused : null, attempted && missingVetAuthCap ? nativeModalStyles.appModalFieldError : null]}>
                        <View style={styles.requestRateCurrency}>
                          <Text style={styles.requestRateText}>{formatNativeCareCurrencySymbol(vetAuthCurrency)}</Text>
                        </View>
                        <View style={styles.requestRatePrice}>
                          <AppModalField
                            error={attempted && missingVetAuthCap}
                            focused={focusedField === "vetAuthCap"}
                            keyboardType="decimal-pad"
                            onBlur={() => setFocusedField(null)}
                            onChangeText={setVetAuthCap}
                            onFocus={() => {
                              focusPaymentField("vetAuth");
                              setFocusedField("vetAuthCap");
                            }}
                            placeholder="0"
                            style={styles.requestRateInput}
                            value={vetAuthCap}
                          />
                        </View>
                      </View>
                      {attempted && missingVetAuthCap ? <Text style={styles.errorText}>Add a valid emergency vet limit before confirming.</Text> : null}
                    </View>
                    <View onLayout={registerPaymentField("vet")} style={nativeModalStyles.appModalFieldBlock}>
                      <Text style={styles.fieldLabel}>Preferred vet contact</Text>
                      <AppModalField focused={focusedField === "vet"} value={emergencyVetContact} onBlur={() => setFocusedField(null)} onChangeText={setEmergencyVetContact} onFocus={() => focusPaymentField("vet")} placeholder="Decided by carer if empty" />
                      <ImportCheckbox checked={Boolean(emergencyVetContact.trim())} label="Import vet contact from pet profile" onToggle={applyVetContactFromPet} />
                    </View>
                    </>
                  ) : null}
                </View>

                {!isNoChargeVoluntary ? (
                  <View style={styles.paymentInfoBox}>
                    <Text style={styles.paymentInfoTitle}>Cancellation</Text>
                    <View style={styles.cancellationBulletRow}><Text style={styles.cancellationBullet}>•</Text><Text style={styles.cancellationBulletText}>72+ hours before care: full refund.</Text></View>
                    <View style={styles.cancellationBulletRow}><Text style={styles.cancellationBullet}>•</Text><Text style={styles.cancellationBulletText}>24-72 hours before care: 50% refund; huddle retains 50%.</Text></View>
                    <View style={styles.cancellationBulletRow}><Text style={styles.cancellationBullet}>•</Text><Text style={styles.cancellationBulletText}>Under 24 hours: final and non-refundable.</Text></View>
                    <View style={styles.cancellationBulletRow}><Text style={styles.cancellationBullet}>•</Text><Text style={styles.cancellationBulletText}>No-show, handoff, or safety issue? Send evidence to <Text onPress={onOpenSupport} style={styles.checkboxLinkText}>Support</Text>. huddle may hold payment during review.</Text></View>
                  </View>
                ) : null}
              </>
            ) : null}

            {canSignCareScope ? (
              <CareSignoffCancellationPolicy isNoChargeVoluntary={isNoChargeVoluntary} viewerRole="requester" />
            ) : null}
            {canSignCareScope ? (
              <>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: termsAccepted }} onLayout={registerPaymentField("terms")} onPress={termsAccepted ? () => setTermsAccepted(false) : openTermsSheet} style={styles.checkboxRowTop}>
                  <View style={[styles.checkbox, attempted && missingTermsAcknowledgement ? styles.checkboxError : null, termsAccepted ? styles.checkboxActive : null]}>{termsAccepted ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}</View>
                  <NativeLegalText style={styles.checkboxText}>{careScopeTermsAcknowledgementCopy("requester")}</NativeLegalText>
                </Pressable>
                {attempted && missingTermsAcknowledgement ? <Text style={styles.errorText}>Care Service Booking Terms acknowledgement is required before sign off.</Text> : null}
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: policyAccepted }} onLayout={registerPaymentField("policy")} onPress={() => setPolicyAccepted((value) => !value)} style={styles.checkboxRowTop}>
                  <View style={[styles.checkbox, attempted && missingPolicyAcknowledgement ? styles.checkboxError : null, policyAccepted ? styles.checkboxActive : null]}>{policyAccepted ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}</View>
                  <NativeLegalText style={styles.checkboxText}>{careScopeAcknowledgementCopy("requester", isNoChargeVoluntary)}</NativeLegalText>
                </Pressable>
                {attempted && missingPolicyAcknowledgement ? <Text style={styles.errorText}>Cancellation policy acknowledgement is required before sign off.</Text> : null}
              </>
            ) : null}
            {canSignCareScope ? (
              <View onLayout={registerPaymentField("signature")}>
                <NativeSignaturePad attempted={attempted} captureViewRef={signatureCaptureRef} onChange={setRequesterSignature} onSigningChange={setSignatureSigning} />
              </View>
            ) : null}
            {paymentInProgress ? (
              <View style={styles.paymentInfoBox}>
                <Text style={styles.paymentInfoTitle}>Payment in progress</Text>
                <Text style={styles.paymentInfoText}>If you completed checkout, the booking will confirm shortly.{formatPaymentRetryCountdown(careScope) ? ` If you cancelled, you can try again in ${formatPaymentRetryCountdown(careScope)}.` : " If you cancelled, you can try again once this countdown ends."}</Text>
              </View>
            ) : null}
          </AppBottomSheetScroll>
          <AppBottomSheetFooter>
            {submitError ? <AppModalError>{submitError}</AppModalError> : null}
            {paymentLockedByScopeChange ? (
              <AppModalButton disabled={sending || paymentAttempting} onPress={onEditCareScope}>Edit Care Scope</AppModalButton>
            ) : !paymentInProgress && (hasEditedCareInstruction || canSignCareScope || currentMutualSignatures) ? (
              <>
                <SlideToConfirm
                  busy={sending || paymentAttempting}
                  label={canSignCareScope ? "Slide to Agree Care Scope" : hasEditedCareInstruction && currentMutualSignatures ? isNoChargeVoluntary ? "Slide to Update & Confirm" : "Slide to Update & Payment" : hasEditedCareInstruction ? "Slide to Update" : isNoChargeVoluntary ? "Slide to Confirm" : "Slide to Pay"}
                  onCommit={submit}
                  resetKey={slideResetKey}
                />
                {!canSignCareScope && hasEditedCareInstruction && careInstructionsChanged && (ownerAlreadySigned || carerAlreadySigned) ? <Text style={styles.scopeSignatureResetHelper}>We'll show the Care Instruction in this chat so both sides have the latest instruction.</Text> : null}
              </>
            ) : null}
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
          presentation="inline"
          title={petRefillTarget?.field === "vet" ? "Add vet contact" : "Add medication"}
        />
        {termsSheetVisible ? (
          <View style={[styles.inlineSheetLayer, nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]}>
            <Pressable accessibilityLabel="Close booking terms" accessibilityRole="button" onPress={() => setTermsSheetVisible(false)} style={StyleSheet.absoluteFill} />
            <View style={styles.termsModalBoundary}>
              <View style={styles.termsModalCard}>
                <View {...termsSheetPanResponder.panHandlers} style={styles.termsModalHeader}>
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
                        <NativeLegalText key={`booking-intro-${index}`} style={styles.termsSheetText}>{paragraph}</NativeLegalText>
                      ))}
                      {bookingTermsPage.sections.map((section) => (
                        <View key={section.title} style={styles.termsLegalSection}>
                          <Text style={styles.termsLegalTitle}>{section.title}</Text>
                          {section.body.map((paragraph, index) => (
                            <NativeLegalText key={`${section.title}-${index}`} style={styles.termsSheetText}>{paragraph}</NativeLegalText>
                          ))}
                          {section.bullets?.map((bullet, index) => (
                            <View key={`${section.title}-bullet-${index}`} style={styles.termsBulletRow}>
                              <Text style={styles.termsBulletDot}>•</Text>
                              <NativeLegalText style={styles.termsBulletText}>{bullet}</NativeLegalText>
                            </View>
                          ))}
                        </View>
                      ))}
                      <Text style={styles.termsSheetText}>Updated: {bookingTermsPage.effectiveDate}</Text>
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
        ) : null}
      </KeyboardAvoidingView>
    </View>
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
  open,
  onClose,
  onError,
  onOpenHandoffProblem,
  onOpenSupport,
  onSubmit,
  onVerifyPin,
  sessionKey,
  serviceChatId,
  sending,
}: {
  accessToken?: string | null;
  currentUserId: string | null;
  open: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  onOpenHandoffProblem: () => void;
  onOpenSupport: () => void;
  onSubmit: (startPin: string, photoUrl: string, evidence?: StartCareEvidence) => Promise<StartCareResult>;
  onVerifyPin: (startPin: string) => Promise<{ valid: boolean | null }>;
  sessionKey?: string | null;
  serviceChatId: string | null;
  sending: boolean;
}) {
  const [media, setMedia] = useState<NativeSocialComposerMedia | null>(null);
  const [capturedAt, setCapturedAt] = useState<Date | null>(null);
  const [pin, setPin] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [pinFeedback, setPinFeedback] = useState<{ message: string; attemptCount?: number; showHandoffProblem?: boolean } | null>(null);
  const [pinVerified, setPinVerified] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [noteFocused, setNoteFocused] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [slideResetKey, setSlideResetKey] = useState(0);
  const stampRef = useRef<View | null>(null);
  // The stamped check-in photo is uploaded once per captured photo and reused across retries
  // (e.g. a submit attempt that fails for an unrelated reason) so a slow/flaky slide never
  // leaves more than one photo behind. Only invalidated when the carer retakes a new photo or
  // the sheet is abandoned without completing check-in.
  const stagedEvidenceRef = useRef<{ forUri: string; photoUrl: string; checkinPath: string | null } | null>(null);
  const cleanupStagedEvidence = useCallback(() => {
    const staged = stagedEvidenceRef.current;
    stagedEvidenceRef.current = null;
    if (staged?.checkinPath) {
      void requestNativeStorageCleanupResult("service_care_evidence", staged.checkinPath, "checkin_photo_replaced", accessToken);
    }
  }, [accessToken]);
  useEffect(() => () => cleanupStagedEvidence(), [cleanupStagedEvidence]);
  const stampText = useMemo(() => formatCheckinStamp(capturedAt || new Date()), [capturedAt]);
  const photoAspectRatio = useMemo(() => (
    media?.width && media?.height && media.width > 0 && media.height > 0
      ? Math.max(0.68, Math.min(1.6, media.width / media.height))
      : 4 / 5
  ), [media?.height, media?.width]);
  useEffect(() => {
    if (!open) return;
    setMedia(null);
    setCapturedAt(null);
    // Never pre-fill the PIN -- the carer must be told it by the owner at physical
    // handoff and type it in themselves. Even though the app technically has the
    // value in memory (it rides the same chat message the owner reads), auto-filling
    // it here would defeat the entire point of requiring proof of a real handoff.
    setPin("");
    setAttempted(false);
    setPinFeedback(null);
    setPinVerified(null);
    setNote("");
    setNoteFocused(false);
    setSlideResetKey((value) => value + 1);
  }, [open]);
  useEffect(() => {
    if (!open || !/^[0-9]{4}$/.test(pin)) {
      setPinVerified(null);
      return;
    }
    let cancelled = false;
    void onVerifyPin(pin).then(({ valid }) => {
      if (cancelled || valid === null) return;
      setPinVerified(valid);
      setPinFeedback(valid
        ? null
        : { message: "That PIN doesn't match yet. Please check the code with the owner and try again." });
    });
    return () => { cancelled = true; };
  }, [onVerifyPin, open, pin]);
  const takePhoto = useCallback(async () => {
    let asset: ImagePicker.ImagePickerAsset;
    try {
      const permission = await requestNativeCameraPermissionDetail();
      if (permission.state !== "granted") {
        onError("Camera access is needed to capture a check-in photo.");
        return;
      }
      const result = await launchNativeCameraAsync({
        allowsMultipleSelection: false,
        mediaTypes: ["images"],
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 0.86,
      });
      if (result.canceled || !result.assets[0]) return;
      asset = result.assets[0];
    } catch (error) {
      onError(nativeSafeErrorCopy(error, "Couldn't open your camera. Try again."));
      return;
    }
    // Retaking replaces the previously staged photo -- clean up its upload since it will
    // never be attached to a successful check-in.
    cleanupStagedEvidence();
    setCapturedAt(new Date());
    setMedia({
      durationSeconds: typeof asset.duration === "number" ? asset.duration / 1000 : null,
      height: asset.height,
      kind: "image",
      mimeType: asset.mimeType,
      name: asset.fileName || `checkin-${Date.now()}.jpg`,
      size: asset.fileSize,
      uri: asset.uri,
      width: asset.width,
    });
  }, [cleanupStagedEvidence, onError]);
  const submit = useCallback(async () => {
    setAttempted(true);
    // currentUserId/serviceChatId missing is an app-state problem, not a user-input mistake --
    // it has no dedicated border (unlike the photo/PIN checks below), so it must never fail
    // silently or the sheet looks like nothing happened at all.
    if (!currentUserId || !serviceChatId) {
      haptic.error();
      setSlideResetKey((value) => value + 1);
      onError("Couldn't find this booking. Close and reopen the chat, then try again.");
      return;
    }
    if (!media || !/^[0-9]{4}$/.test(pin)) {
      haptic.error();
      setSlideResetKey((value) => value + 1);
      return;
    }
    // Already confirmed wrong by the live check -- don't waste a photo upload and round trip
    // proving what we already know. pinVerified === null (still checking, or offline) still
    // falls through to the real submit, which is the authoritative check either way.
    if (pinVerified === false) {
      haptic.error();
      setSlideResetKey((value) => value + 1);
      return;
    }
    setUploading(true);
    try {
      // Reuse the already-uploaded stamped photo for this exact capture if a prior attempt
      // (e.g. a submit that failed for an unrelated reason) already staged one -- only the
      // photo that ends up attached to a successful check-in should ever persist, and a retry
      // must never produce a second upload of the same photo.
      let photoUrl: string;
      if (stagedEvidenceRef.current?.forUri === media.uri) {
        photoUrl = stagedEvidenceRef.current.photoUrl;
      } else {
        // view-shot's captureRef has no built-in timeout and can hang indefinitely if the
        // stamped-photo view hasn't finished its layout pass yet (e.g. sliding immediately
        // after taking the photo) -- with no network call made yet at this point, a hang here
        // is silent and looks exactly like "nothing happens after slide". Race it against a
        // bound and fall back to the unstamped photo rather than block the whole flow forever.
        const stampedUri = stampRef.current
          ? await raceWithTimeoutFallback(
            captureRef(stampRef, {
              fileName: `huddle-checkin-${Date.now()}`,
              format: "jpg",
              height: Math.round(CHECKIN_STAMP_WIDTH / photoAspectRatio),
              quality: 0.9,
              result: "tmpfile",
              width: CHECKIN_STAMP_WIDTH,
            }),
            media.uri,
            4000,
          )
          : media.uri;
        const stampedMedia: NativeSocialComposerMedia = {
          ...media,
          mimeType: "image/jpeg",
          name: `huddle-checkin-${Date.now()}.jpg`,
          uri: stampedUri,
        };
        photoUrl = await uploadNativeServiceCareEvidenceImage({ accessToken, media: stampedMedia, scope: "checkin", serviceChatId, sessionKey, userId: currentUserId });
        stagedEvidenceRef.current = { forUri: media.uri, photoUrl, checkinPath: serviceCareEvidencePathFromDescriptor(photoUrl) };
      }
      let evidence: StartCareEvidence = { capturedAt: capturedAt?.toISOString() || null, locationPermissionDenied: false, note: note.trim() || null };
      try {
        const permission = await requestNativeForegroundLocationPermissionDetail();
        if (permission.state === "granted") {
          const position = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
          ]);
          if (position) {
            evidence = {
              ...evidence,
              locationAccuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
              locationLat: position.coords.latitude,
              locationLng: position.coords.longitude,
            };
          }
        } else {
          evidence = { ...evidence, locationPermissionDenied: true };
        }
      } catch {
        evidence = { ...evidence, locationPermissionDenied: true };
      }
      const result = await onSubmit(pin, photoUrl, evidence);
      if (result.ok === false) {
        // The staged upload is deliberately left in place (not cleaned up here) so a retry
        // with the same photo reuses it instead of uploading again -- see stagedEvidenceRef.
        // Only the RPC's own structured "invalid_start_pin" response means the PIN was
        // actually wrong. "unexpected_error" is onSubmit's sentinel for failures it already
        // surfaced via its own popup (evidence registration, timing guard, network, etc) --
        // anything else is a plain message onSubmit returned without popping its own alert
        // (e.g. missing chat context), so show it here. Showing PIN-mismatch copy for any of
        // these would falsely tell someone their correct PIN was wrong.
        if (result.error === "invalid_start_pin") {
          const attemptCount = result.attemptCount || 0;
          const showHandoffProblem = result.showHandoffProblem === true || attemptCount >= 3;
          setPinFeedback({
            attemptCount,
            showHandoffProblem,
            message: showHandoffProblem
              ? "That PIN still doesn't match. Please confirm the code with the owner. If handoff is not working, report a handoff problem so Support can review it before care starts."
              : "That PIN doesn't match yet. Please check the code with the owner and try again.",
          });
        } else if (result.error !== "unexpected_error") {
          onError(result.error);
        }
        haptic.error();
        setSlideResetKey((value) => value + 1);
        return;
      }
      // Check-in succeeded: this photo is now the permanent record. Clear the ref without
      // deleting from storage so the unmount-cleanup effect (which fires when onClose below
      // unmounts this sheet) doesn't tear down the photo it just persisted.
      stagedEvidenceRef.current = null;
      onClose();
    } catch (error) {
      logNativeProtectedActionFailure("[native.care] start_care_failed", error);
      onError(nativeSafeErrorCopy(error, "Unable to start care."));
    } finally {
      setUploading(false);
    }
  }, [accessToken, capturedAt, currentUserId, media, note, onClose, onError, onSubmit, photoAspectRatio, pin, pinVerified, serviceChatId, sessionKey]);
  return (
    <View pointerEvents="box-none" style={styles.inlineSheetLayer}>
      <Pressable accessibilityLabel="Close start care sheet" accessibilityRole="button" onPress={onClose} style={nativeModalStyles.appModalBackdrop} />
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} pointerEvents="box-none" style={[nativeModalStyles.appModalBottomSafeArea, nativeModalStyles.appBottomSheetEventBoundary]}>
          <AppBottomSheet mode="content" onClose={onClose}>
          <AppBottomSheetHeader>
            <View style={styles.sheetTitleBlock}>
              <Text style={[nativeModalStyles.appModalSheetTitle, styles.startCareSheetTitle]}>Start Care</Text>
              <Text style={styles.sheetSubtitle}>Enter the PIN and take a timestamped photo of the pet to begin care.</Text>
            </View>
            <AppModalCloseButton onPress={onClose} />
          </AppBottomSheetHeader>
          <AppBottomSheetScroll contentContainerStyle={styles.paymentBody}>
            <View style={styles.startCareInputStack}>
              <Pressable accessibilityRole="button" onPress={takePhoto} style={[styles.checkinPhotoButton, styles.checkinPhotoButtonStacked, attempted && !media ? styles.checkinPhotoButtonError : null]}>
                {media ? (
                  <View ref={stampRef} collapsable={false} style={[styles.checkinStampedPhoto, { aspectRatio: photoAspectRatio }]}>
                    <ExpoImage contentFit="cover" key={nativeFreshImageKey(media.uri, media.uri)} source={{ uri: nativeFreshImageUri(media.uri, media.uri) }} style={StyleSheet.absoluteFill} />
                    <LinearGradient colors={["transparent", "rgba(0,0,0,0.62)"]} pointerEvents="none" style={styles.checkinStampGradient} />
                    <Text numberOfLines={1} style={styles.checkinStampText}>{stampText}</Text>
                    <Image accessibilityIgnoresInvertColors resizeMode="contain" source={huddleStampLogo} style={styles.checkinStampLogo} />
                  </View>
                ) : (
                  <>
                    <Feather color={huddleColors.blue} name="camera" size={22} />
                    <Text style={styles.checkinPhotoText}>Take check-in photo</Text>
                  </>
                )}
              </Pressable>
              <StartPinInput
                error={(attempted && !/^[0-9]{4}$/.test(pin)) || Boolean(pinFeedback)}
                onChangeText={(value) => {
                  setPinFeedback(null);
                  setPin(value.replace(/\D/g, "").slice(0, 4));
                }}
                stacked
                value={pin}
              />
              {pinFeedback ? (
                <>
                  <Text style={styles.errorText}>{pinFeedback.message}</Text>
                  {pinFeedback.showHandoffProblem ? (
                    <Pressable accessibilityRole="button" onPress={onOpenHandoffProblem} style={styles.startPinFeedbackAction}>
                      <Feather color={huddleColors.validationRed} name="alert-circle" size={15} />
                      <Text style={styles.startPinFeedbackActionText}>Report handoff problem</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}
              <View style={nativeModalStyles.appModalFieldBlock}>
                <Text style={styles.fieldLabel}>Check-in note</Text>
                <AppModalField focused={noteFocused} multiline onBlur={() => setNoteFocused(false)} onChangeText={setNote} onFocus={() => setNoteFocused(true)} placeholder="Optional handoff note" style={styles.completionNoteField} value={note} />
              </View>
            </View>
            <Text style={styles.checkinWarningText}>
              If anything is off, document it in your chat with the owner with photos or contact{" "}
              <Text accessibilityRole="link" onPress={onOpenSupport} style={styles.checkboxLinkText}>Support</Text>
              {" "}before hitting start.
            </Text>
          </AppBottomSheetScroll>
          <AppBottomSheetFooter>
            <SlideToConfirm
              busy={sending || uploading}
              disabled={!media || Boolean(pinFeedback)}
              label="Slide to Start Care"
              onCommit={() => void submit()}
              onDisabledPress={() => { setAttempted(true); haptic.error(); setSlideResetKey((value) => value + 1); }}
              resetKey={slideResetKey}
            />
          </AppBottomSheetFooter>
        </AppBottomSheet>
      </KeyboardAvoidingView>
    </View>
  );
}

// The single "Report Issue" sheet for the whole care flow. Pre-handoff no-show/access-blocked
// reports (mode: provider/requesterReport), the requester's response to a handoff review
// (requesterResponse), and the post-handoff formal issue report that used to be its own
// IssueReportSheet component (issueReport) all render through here now -- same fields, same
// evidence flow, same auto-scroll-to-note behavior, just different reasons/copy/validation per
// mode. Each mode still submits to its own backend RPC via the onSubmit prop the caller passes.
function HandoffProblemSheet({
  accessToken,
  contextPrefill,
  currentUserId,
  isRequester,
  isVoluntary,
  mode,
  open,
  onClose,
  onError,
  onSubmit,
  sending,
  serviceChatId,
  sessionKey,
}: {
  accessToken?: string | null;
  contextPrefill?: string | null;
  currentUserId: string | null;
  isRequester?: boolean;
  isVoluntary?: boolean;
  mode: "provider" | "requesterReport" | "requesterResponse" | "issueReport" | "ownerNoStart" | "carerNoStart";
  open: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  onSubmit: (reason: string, note: string, evidenceUrls: string[]) => Promise<void>;
  sending: boolean;
  serviceChatId: string | null;
  sessionKey?: string | null;
}) {
  const issueReasons = useMemo(
    () => (isRequester ? OWNER_SERVICE_ISSUE_REASONS : CARER_SERVICE_ISSUE_REASONS).filter((item) => !(isVoluntary && item === "Payment or communication issue")),
    [isRequester, isVoluntary],
  );
  const reasonOptions = mode === "ownerNoStart"
    ? OWNER_NO_START_REASONS
    : mode === "carerNoStart"
      ? CARER_NO_START_REASONS
      : mode === "issueReport"
        ? issueReasons
        : mode === "requesterResponse"
          ? REQUESTER_HANDOFF_PROBLEM_REASONS
          : REPORT_ISSUE_REASONS;
  const [reason, setReason] = useState(reasonOptions[0]);
  const [note, setNote] = useState("");
  const [media, setMedia] = useState<NativeSocialComposerMedia[]>([]);
  const [noteFocused, setNoteFocused] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [slideResetKey, setSlideResetKey] = useState(0);
  const reportScrollRef = useRef<ScrollView | null>(null);
  const reportNoteOffsetRef = useRef(0);
  // Each header must say exactly what its own menu trigger says -- "provider"/"requesterReport"
  // both fell through to the generic "Report Issue" before, which is indistinguishable from the
  // actual Report Issue (issueReport) sheet in the header even though they're different reports
  // with different backend RPCs.
  const title = mode === "requesterResponse"
    ? "Respond to Handoff Review"
    : mode === "ownerNoStart" || mode === "carerNoStart"
      ? "Report No-start Issue"
    : mode === "issueReport"
      ? "Report Issue"
      : "Report Handoff Problem";
  // provider/requesterReport/issueReport dropped their explanatory sentence entirely -- it was
  // redundant with the header title (now mode-specific), the reason chips, and (for issueReport)
  // the acknowledgement checkbox below. requesterResponse is the one mode with no chips and no
  // checkbox, so it keeps a single concise disclosure line, shown as a header subtitle instead
  // of a separate block.
  const requesterResponseSubtitle = "Support will review booking, messages, and all chat activities.";
  // When opened from the cancel-booking flow, contextPrefill arrives as "Cancel Booking:
  // Issue with {Name}" -- split it into a headline/subheadline pair for the sheet title
  // instead of showing it as a separate blue box inside the body.
  const contextParts = clean(contextPrefill).split(/:\s+/);
  const headline = contextParts.length > 1 ? contextParts[0] : title;
  const subheadline = contextParts.length > 1 ? contextParts.slice(1).join(": ") : null;
  useEffect(() => {
    if (!open) return;
    setReason(reasonOptions[0]);
    setNote("");
    setMedia([]);
    setNoteFocused(false);
    setAcknowledged(false);
    setAttempted(false);
    setSlideResetKey((key) => key + 1);
  }, [open, reasonOptions]);
  const pickEvidence = useCallback(async () => {
    if (media.length >= MAX_CARE_REPORT_EVIDENCE) return;
    try {
      // Best-effort request; PHPicker presents regardless, so never hard-block.
      const result = await launchNativeImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ["images"],
        orderedSelection: true,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 0.86,
        selectionLimit: MAX_CARE_REPORT_EVIDENCE - media.length,
      });
      if (result.canceled || result.assets.length === 0) return;
      const selected = result.assets.map((asset) => ({ durationSeconds: typeof asset.duration === "number" ? asset.duration / 1000 : null, height: asset.height, kind: "image" as const, mimeType: asset.mimeType, name: asset.fileName, size: asset.fileSize, uri: asset.uri, width: asset.width }));
      setMedia((current) => [...current, ...selected].slice(0, MAX_CARE_REPORT_EVIDENCE));
    } catch (error) {
      onError(nativeSafeErrorCopy(error, "Couldn't open your photo library. Try again."));
    }
  }, [media.length, onError]);
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
  const submit = useCallback(async () => {
    setAttempted(true);
    // issueReport is the formal post-handoff report: a written note and the acknowledgement are
    // both mandatory (evidence stays optional). Every other mode is pre-handoff triage, where
    // evidence is optional-but-encouraged: a written note OR an attached photo is enough (never
    // a fully empty report), so a carer who uploads proof isn't forced to also type.
    const isNoStartReport = mode === "ownerNoStart" || mode === "carerNoStart";
    const invalid = mode === "issueReport"
      ? (!reason.trim() || !note.trim() || !acknowledged)
      : isNoStartReport
        ? !reason.trim()
        : ((!note.trim() && media.length === 0) || (mode !== "requesterResponse" && !reason.trim()));
    if (invalid) {
      haptic.error();
      setSlideResetKey((key) => key + 1);
      return;
    }
    setUploading(true);
    try {
      const evidenceUrls = new Array<string>(media.length);
      if (media.length > 0 && currentUserId && serviceChatId) {
        let nextIndex = 0;
        await Promise.all(Array.from({ length: Math.min(2, media.length) }, async () => {
          while (nextIndex < media.length) {
            const index = nextIndex;
            nextIndex += 1;
            evidenceUrls[index] = await uploadNativeServiceCareEvidenceImage({ accessToken, media: media[index], scope: mode === "issueReport" ? "issue" : "handoff", serviceChatId, sessionKey, userId: currentUserId });
          }
        }));
      }
      const context = clean(contextPrefill);
      const composedNote = context ? [context, note.trim()].filter(Boolean).join("\n\n") : note.trim();
      await onSubmit(mode === "requesterResponse" ? "Requester response" : reason, composedNote, evidenceUrls);
    } catch (error) {
      onError(nativeSafeErrorCopy(error, mode === "issueReport" ? "Unable to submit issue report." : "Unable to submit handoff details."));
    } finally {
      setUploading(false);
    }
  }, [accessToken, acknowledged, contextPrefill, currentUserId, media, mode, note, onError, onSubmit, reason, serviceChatId, sessionKey]);
  return (
    <View pointerEvents="box-none" style={styles.inlineSheetLayer}>
      <Pressable accessibilityLabel="Close care report sheet" accessibilityRole="button" onPress={sending ? () => undefined : onClose} style={nativeModalStyles.appModalBackdrop} />
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} pointerEvents="box-none" style={[nativeModalStyles.appModalBottomSafeArea, nativeModalStyles.appBottomSheetEventBoundary]}>
        <AppBottomSheet mode="large" onClose={onClose}>
          <AppBottomSheetHeader>
            <View style={styles.reportHeaderTitleWrap}>
              <Text style={[nativeModalStyles.appModalSheetTitle, styles.reportHeaderTitleNoFlex]}>{headline}</Text>
              {subheadline ? <Text numberOfLines={1} style={styles.reportHeaderSubtitle}>{subheadline}</Text> : null}
              {mode === "requesterResponse" ? <Text style={styles.sheetSubtitle}>{requesterResponseSubtitle}</Text> : null}
            </View>
            <AppModalCloseButton onPress={sending ? () => undefined : onClose} />
          </AppBottomSheetHeader>
          <AppBottomSheetScroll contentContainerStyle={styles.paymentBody} scrollRef={reportScrollRef}>
            {mode !== "requesterResponse" ? (
              <>
                <Text style={styles.fieldLabel}>Reason</Text>
                <View style={styles.chipWrap}>{reasonOptions.map((item) => <Pressable key={item} onPress={() => setReason(item)} style={[styles.chip, reason === item ? styles.chipActive : null]}><Text style={[styles.chipText, reason === item ? styles.chipTextActive : null]}>{item}</Text></Pressable>)}</View>
              </>
            ) : null}
            <View onLayout={(event) => { reportNoteOffsetRef.current = event.nativeEvent.layout.y; }}>
              <Text style={styles.fieldLabel}>Short note</Text>
              <AppModalField error={mode === "issueReport" ? (attempted && !note.trim()) : ((mode !== "ownerNoStart" && mode !== "carerNoStart") && attempted && !note.trim() && media.length === 0)} focused={noteFocused} multiline onBlur={() => setNoteFocused(false)} onChangeText={setNote} onFocus={focusReportNote} placeholder={mode === "ownerNoStart" || mode === "carerNoStart" ? "Add details (optional)" : "Describe what happened"} style={styles.completionNoteField} value={note} />
              {mode === "issueReport"
                ? (attempted && !note.trim() ? <Text style={styles.errorText}>Add a short note before reporting.</Text> : null)
                : ((mode !== "ownerNoStart" && mode !== "carerNoStart") && attempted && !note.trim() && media.length === 0 ? <Text style={styles.errorText}>Add a note or supporting photos before continuing.</Text> : null)}
            </View>
            <AppModalButton disabled={media.length >= MAX_CARE_REPORT_EVIDENCE} onPress={pickEvidence}>
              <View style={styles.evidenceButtonRow}>
                <Feather color={huddleColors.onPrimary} name="camera" size={18} />
                <Text style={nativeModalStyles.appModalButtonText}>{media.length > 0 ? `Add Photos (${media.length}/10)` : "Add Supporting Photos"}</Text>
              </View>
            </AppModalButton>
            {media.length > 0 ? (
              <ScrollView bounces={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reviewMediaThumbRow} style={styles.reviewMediaRailViewport}>
                {media.map((item, index) => (
                  <View key={`${item.uri}-${index}`} style={[styles.reviewMediaThumbWrap, { aspectRatio: 1 }]}>
                    <ExpoImage contentFit="cover" key={nativeFreshImageKey(item.uri, item.uri)} source={{ uri: nativeFreshImageUri(item.uri, item.uri) }} style={styles.reviewMediaThumb} />
                    <Pressable accessibilityLabel={`Remove supporting photo ${index + 1}`} accessibilityRole="button" onPress={() => setMedia((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={styles.reviewMediaRemoveButton}><Feather color={huddleColors.onPrimary} name="x" size={14} /></Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            {mode === "issueReport" ? (
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: acknowledged }} onPress={() => setAcknowledged((value) => !value)} style={styles.checkboxRowTop}>
                <View style={[styles.checkbox, attempted && !acknowledged ? styles.checkboxError : null, acknowledged ? styles.checkboxActive : null]}>{acknowledged ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}</View>
                <Text style={styles.checkboxText}>{isVoluntary ? "I understand huddle may review the booking, Start PIN activity, check-in records, completion records, and related conversation activity." : "I understand huddle may review the booking, payment status, Start PIN activity, check-in records, completion records, and related conversation activity."}</Text>
              </Pressable>
            ) : null}
          </AppBottomSheetScroll>
          <AppBottomSheetFooter>
            <SlideToConfirm busy={sending || uploading} label={mode === "requesterResponse" ? "Slide to Respond" : "Slide to Report"} onCommit={() => void submit()} resetKey={slideResetKey} tone={mode === "requesterResponse" ? "primary" : "destructive"} />
          </AppBottomSheetFooter>
        </AppBottomSheet>
      </KeyboardAvoidingView>
    </View>
  );
}

function ReviewSheet({
  accessToken,
  currentUserId,
  hasReportedServiceDispute,
  isRequester,
  isVoluntary,
  open,
  onClose,
  onSubmit,
  serviceChatId,
  sessionKey,
}: {
  accessToken?: string | null;
  currentUserId: string | null;
  hasReportedServiceDispute: boolean;
  isRequester: boolean;
  isVoluntary: boolean;
  open: boolean;
  onClose: () => void;
  onSubmit: (rating: number, tags: string[], text: string, mediaUrls: string[], safetyIncidentReported: boolean) => Promise<"submitted" | "alreadyReviewed" | "failed" | void>;
  serviceChatId: string | null;
  sessionKey?: string | null;
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
  const { shake: triggerShake, shakeStyle } = useErrorShake();
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
  const uploadProgress = useMemo(() => averageNativeUploadProgress(media, (item) => item.kind === "image"), [media]);
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
      : "Thanks for your feedback";
  const successBody = submitResult === "reported"
    ? isVoluntary
      ? "Our Trust & Safety team will review the situation and related conversation activity."
      : "Payment may be paused while huddle reviews the situation and related conversation activity."
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
    if (!submitResult) return undefined;
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose, submitResult]);

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
    let result: Awaited<ReturnType<typeof ImagePicker.launchImageLibraryAsync>>;
    try {
      // Best-effort request; PHPicker presents regardless, so never hard-block.
      result = await launchNativeImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ["images"],
        orderedSelection: true,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 0.86,
        selectionLimit: Math.max(1, MAX_REVIEW_MEDIA - media.length),
      });
    } catch {
      setValidationErrors((current) => ({ ...current, media: true }));
      return;
    }
    if (result.canceled) return;
    setValidationErrors((current) => ({ ...current, media: false }));
    const accepted: ReviewUploadMedia[] = result.assets.map((asset) => ({
      durationSeconds: typeof asset.duration === "number" ? asset.duration / 1000 : null,
      height: asset.height,
      kind: "image" as const,
      mimeType: asset.mimeType,
      name: asset.fileName,
      progress: 0,
      size: asset.fileSize,
      status: "queued" as const,
      uploadedUrl: null,
      uri: asset.uri,
      width: asset.width,
    })).slice(0, Math.max(0, MAX_REVIEW_MEDIA - media.length));
    setMedia((current) => [...current, ...accepted].slice(0, MAX_REVIEW_MEDIA));
    const uploadOne = async (item: ReviewUploadMedia) => {
      setMedia((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, error: null, progress: Math.max(entry.progress, NATIVE_UPLOAD_PROGRESS_START), status: "uploading" } : entry));
      let progressTimer: ReturnType<typeof setInterval> | null = null;
      try {
        progressTimer = setInterval(() => {
          setMedia((current) => current.map((entry) => (
            entry.uri === item.uri && entry.status === "uploading"
              ? { ...entry, progress: nextNativeUploadProgress(entry.progress) }
              : entry
          )));
        }, 450);
        if (!serviceChatId) throw new Error("missing_service_care_evidence_context");
        const uploadedUrl = await uploadNativeServiceCareEvidenceImage({ accessToken, media: item, scope: "review", serviceChatId, sessionKey, userId: currentUserId });
        setMedia((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, error: null, progress: 100, status: "uploaded", uploadedUrl } : entry));
      } catch (error) {
        const message = nativeSafeErrorCopy(error, "Couldn't upload that image. Remove it or try again.");
        setMedia((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, error: message, progress: 0, status: "error", uploadedUrl: null } : entry));
      } finally {
        if (progressTimer) clearInterval(progressTimer);
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
  }, [accessToken, currentUserId, media.length, serviceChatId, sessionKey]);

  const submit = async () => {
    const nextErrors = {
      media: hasMediaBlockingSubmit,
      rating: rating <= 0,
      text: lowRating && safetyIncidentReported && text.trim().length === 0,
    };
    setValidationErrors(nextErrors);
    if (nextErrors.rating || nextErrors.media || nextErrors.text) {
      triggerShake();
      setSliderResetKey((current) => current + 1);
      return;
    }
    setSubmitting(true);
    try {
      const mediaUrls = media.map((item) => item.uploadedUrl).filter(Boolean) as string[];
      const reported = lowRating && safetyIncidentReported && !hasReportedServiceDispute;
      const result: ReviewSubmitResult = reported ? "reported" : lowRating ? "negative" : "positive";
      const submitOutcome = await onSubmit(rating, selectedTags, text, mediaUrls, reported);
      if (submitOutcome === "alreadyReviewed") {
        onClose();
        return;
      }
      if (submitOutcome === "failed") {
        setSliderResetKey((current) => current + 1);
        return;
      }
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSubmitResult(result);
      setTimeout(() => haptic.swipeReturn(), 220);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitResult) {
    return (
      <View pointerEvents="box-none" style={styles.inlineSheetLayer}>
        <Pressable accessibilityLabel="Close review success notice" accessibilityRole="button" onPress={onClose} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]}>
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.reviewSuccessPopupBoundary}>
            <View style={nativeModalStyles.appConfirmCard}>
              <View style={styles.reviewSuccessPopupHeader}>
                <Text style={[nativeModalStyles.appConfirmTitle, styles.reviewSuccessPopupTitle]}>{successTitle}</Text>
                <AppModalIconButton accessibilityLabel="Close review success notice" onPress={onClose}>
                  <Feather color={huddleColors.text} name="x" size={22} />
                </AppModalIconButton>
              </View>
              <Text style={nativeModalStyles.appConfirmBody}>{successBody}</Text>
            </View>
          </Pressable>
        </Pressable>
      </View>
    );
  }

  return (
    <View pointerEvents="box-none" style={styles.inlineSheetLayer}>
      <Pressable accessibilityLabel="Close review sheet" accessibilityRole="button" onPress={onClose} style={nativeModalStyles.appModalBackdrop} />
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} pointerEvents="box-none" style={[nativeModalStyles.appModalBottomSafeArea, nativeModalStyles.appBottomSheetEventBoundary]}>
        <AppBottomSheet mode="autoMax" onClose={onClose}>
          <AppBottomSheetHeader>
            <View style={styles.reviewHeaderTitleWrap}>
              <Text style={nativeModalStyles.appModalSheetTitle}>Leave a review</Text>
            </View>
            <AppModalCloseButton onPress={onClose} />
          </AppBottomSheetHeader>
          <AppBottomSheetScroll scrollRef={reviewScrollRef}>
            <View style={styles.reviewRatingBlock}>
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Pressable key={value} onPress={() => selectRating(value)} style={styles.starButton}>
                    <Animated.View style={{ transform: [{ scale: starScalesRef.current[value - 1] }] }}>
                      <FontAwesome color={validationErrors.rating ? huddleColors.fieldErrorBorder : value <= animatedRating ? huddleColors.coral : huddleColors.iconSubtle} name={value <= animatedRating ? "star" : "star-o"} size={30} />
                    </Animated.View>
                  </Pressable>
                ))}
              </View>
              {ratingLabel ? <Text style={[styles.reviewRatingLabel, rating >= 4 ? styles.reviewRatingLabelPositive : styles.reviewRatingLabelNegative]}>{`"${ratingLabel}"`}</Text> : null}
              {validationErrors.rating ? <Text style={styles.errorText}>Pick a star rating before submitting.</Text> : null}
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
              {validationErrors.text ? <Text style={styles.errorText}>Share a few details before submitting your review.</Text> : null}
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
            {lowRating && safetyIncidentReported && !hasReportedServiceDispute ? <Text style={styles.reviewSafetySubtext}>{isVoluntary ? "Submitting a report may temporarily place the booking and related conversation activity under review while we investigate." : "Submitting a report may temporarily place the booking, payment, and related conversation activity under review while we investigate."}</Text> : null}
            {media.length > 0 ? (
              <ScrollView bounces={false} directionalLockEnabled horizontal keyboardShouldPersistTaps="handled" nestedScrollEnabled showsHorizontalScrollIndicator={false} style={[styles.reviewMediaRailViewport, validationErrors.media ? styles.reviewMediaRailError : null]} contentContainerStyle={styles.reviewMediaThumbRow}>
                {media.map((item, index) => (
                  <View key={`${item.uri}-${index}`} style={[styles.reviewMediaThumbWrap, { aspectRatio: reviewMediaPreviewAspect(item) }]}>
                    <ExpoImage cachePolicy="memory-disk" contentFit="cover" key={nativeFreshImageKey(item.uri, item.uploadedUrl || item.uri)} source={{ uri: nativeFreshImageUri(item.uri, item.uploadedUrl || item.uri) }} style={styles.reviewMediaThumb} transition={120} />
                    {item.status === "uploading" && uploadProgress !== null ? (
                      <View pointerEvents="none" style={styles.reviewMediaUploadingOverlay}>
                        <NativeSpinner tone="primary" />
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
                <Feather color={huddleColors.blue} name="camera" size={20} />
              </Pressable>
              <Animated.View style={[{ flex: 1 }, shakeStyle]}>
                <SlideToConfirm
                  busy={submitting}
                  label="Slide to Submit"
                  onCommit={() => void submit()}
                  resetKey={sliderResetKey}
                />
              </Animated.View>
            </View>
          </AppBottomSheetFooter>
        </AppBottomSheet>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: huddleColors.canvas },
  chatBody: { position: "relative", flex: 1, minHeight: 0 },
  inlineSheetLayer: { ...StyleSheet.absoluteFillObject, zIndex: 20 },
  inlineSheetCenterLayer: { backgroundColor: "transparent" },
  loadingFill: { flex: 1 },
  loadingInline: { minHeight: 220 },
  header: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, borderBottomWidth: 1, borderBottomColor: huddleColors.divider, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x2, backgroundColor: huddleColors.glassOverlay },
  headerBack: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill },
  headerActionMenuAnchor: { position: "absolute", alignItems: "flex-end" },
  peerAvatarButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.canvas },
  peerAvatar: { width: 40, height: 40, borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas },
  identityText: { flex: 1, minWidth: 0 },
  headerTitle: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  headerSubtitle: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  statusPill: { overflow: "hidden", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x1, backgroundColor: huddleColors.mutedCanvas, fontFamily: "Urbanist-700", fontSize: huddleType.meta, lineHeight: huddleType.metaLine, color: huddleColors.mutedText },
  statusBookedActive: { backgroundColor: huddleColors.glassControl, color: huddleColors.blue },
  statusCompleted: { backgroundColor: huddleColors.successSoft, color: huddleColors.success },
  statusDisputed: { backgroundColor: huddleColors.validationSoft, color: huddleColors.coral },
  statusCancelled: { backgroundColor: huddleColors.validationSoft, color: huddleColors.validationRed },
  // Always compact now — the expanded detail opens as a modal bottom sheet, so the card
  // never grows in-flow and can't affect the message list or the composer.
  timelineBannerWrap: {
    alignSelf: "stretch",
    flexShrink: 0,
    zIndex: 6,
    backgroundColor: huddleColors.canvas,
  },
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
  // No border box, no shadow — the care progress + care scope read as plain sections. The only
  // separation from the conversation is the single grey seam at the bottom of timelineBannerWrap.
  glassCard: { position: "relative", overflow: "hidden", marginHorizontal: huddleSpacing.x2, marginBottom: 0, borderRadius: huddleRadii.glass, backgroundColor: huddleColors.glassOverlay },
  // Applied to the care-scope card ONLY (not the progress card): a neutral drop shadow so it
  // reads as an elevated surface above the conversation, plus a grey line on its OWN bottom
  // edge (part of the card's box, not a detached line below it).
  careScopeElevated: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: huddleColors.sectionDividerStrong, shadowColor: huddleColors.neutralShadow, shadowOpacity: 1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  glassCardCollapsed: {},
  glassCardInner: { paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x3, gap: huddleSpacing.x1 },
  // When expanded, the divider below the header owns the separation — so the header's own
  // bottom padding is the ONLY gap above it (no stacking with body padding / hairline margin).
  glassCardInnerExpanded: { paddingTop: huddleSpacing.x1, paddingBottom: huddleSpacing.x1 },
  timelineCollapsedHeader: { paddingTop: huddleSpacing.x2, paddingBottom: huddleSpacing.x2 },
  careScopeCollapsedHeader: { paddingTop: huddleSpacing.x1, paddingBottom: huddleSpacing.x1 },
  phaseStrip: { position: "absolute", top: 0, bottom: 0, left: 0, width: 4 },
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
  ribbonCancelled: { width: 16, height: 16, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.validationRed },
  ribbonAhead: { width: 4, height: 4, borderRadius: 2, backgroundColor: huddleColors.fieldBorderStrong },
  timelineCurrentLabel: { fontFamily: "Urbanist-800", fontSize: huddleType.body, lineHeight: huddleType.body * huddleType.lineSnug, color: huddleColors.text, fontVariant: ["tabular-nums"] },
  timelineCurrentLabelTerminal: { color: huddleColors.success },
  timelineCurrentLabelCancelled: { color: huddleColors.validationRed },
  timelineExpandedList: { marginTop: huddleSpacing.x2, paddingTop: huddleSpacing.x2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: huddleColors.sectionDividerStrong, gap: huddleSpacing.x2 },
  timelineExpandedListNoBorder: { marginTop: 0, paddingTop: 0, borderTopWidth: 0 },
  timelineDotCurrent: { borderColor: huddleColors.blue, backgroundColor: huddleColors.canvas, borderWidth: 2 },
  timelineDotCurrentDisputed: { borderColor: huddleColors.validationRed, backgroundColor: huddleColors.validationSoft },
  timelineLabelCurrent: { color: huddleColors.text, fontFamily: "Urbanist-700" },
  timelineLabelDate: { fontFamily: "Urbanist-600", color: huddleColors.mutedText },
  // --- Care Scope (editorial layout) ---
  scopeHeadlineBlock: { gap: 4 },
  scopeHeaderTopRow: { minHeight: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x3 },
  paymentScopeHeaderTopRow: { alignItems: "flex-start" },
  paymentScopeHeadlineMain: { flex: 1, minWidth: 0, gap: 4 },
  paymentScopeHeadlineCopy: { flex: 0 },
  // Bare shortcut icons (Update date / Review & sign / Withdraw) + the expand chevron, sitting
  // together at the end of the header row — no borders, no circles, just the icons.
  scopeHeaderActions: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  scopeIconAction: { minWidth: 28, minHeight: 28, alignItems: "center", justifyContent: "center" },
  scopeHeaderBottomRow: { minHeight: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x3 },
  scopeHeaderBottomSpacer: { flex: 1, minWidth: 0 },
  scopeUtilityActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: huddleSpacing.x2 },
  scopeSubtitleAndHideRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x3 },
  scopeHeadlineCopy: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: huddleSpacing.x1 },
  scopeHeadlineMuted: { fontFamily: "Urbanist-500", fontSize: huddleType.body, lineHeight: huddleType.body * huddleType.lineSnug, color: huddleColors.mutedText },
  scopeSubtitleRow: { flex: 1, minWidth: 0, minHeight: 24, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: huddleSpacing.x2 },
  scopeSubtitle: { flexShrink: 1, minWidth: 0, fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text, fontVariant: ["tabular-nums"] },
  scopeMeta: { fontFamily: "Urbanist-500", fontSize: huddleType.helper + 1, lineHeight: (huddleType.helper + 1) * huddleType.lineNormal, color: huddleColors.mutedText, fontVariant: ["tabular-nums"] },
  scopeHairline: { height: StyleSheet.hairlineWidth, backgroundColor: huddleColors.sectionDividerStrong },
  careAgreementBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1, minHeight: 34, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blue, paddingHorizontal: huddleSpacing.x3 },
  careAgreementBadgeCompact: { minHeight: 28, paddingHorizontal: huddleSpacing.x2 },
  cancelledCareBadge: { backgroundColor: huddleColors.validationRed },
  careAgreementBadgeText: { fontFamily: "Urbanist-800", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.onPrimary },
  // Positioning context for the card (header + expanded detail render together, in-flow, in
  // this same subtree — one accent strip spans all of it, no separate overlay layer).
  bookingCardsRoot: { position: "relative" },
  scopeExpandedBody: { gap: huddleSpacing.x1, paddingHorizontal: huddleSpacing.x3, paddingTop: 0, paddingBottom: 0 },
  // detail rows (Time / Setting / Payment) — two-column with eyebrow label
  scopeDetailGrid: { flex: 1, minWidth: 0, gap: huddleSpacing.x2 },
  scopeDetailRow: { flexDirection: "row", alignItems: "flex-start", gap: huddleSpacing.x3 },
  scopeDetailLabel: { width: 104, fontFamily: "Urbanist-700", fontSize: huddleType.meta, lineHeight: huddleType.metaLine + 4, letterSpacing: 0.8, color: huddleColors.mutedText, textTransform: "uppercase" },
  scopeDetailValue: { flex: 1, fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text, fontVariant: ["tabular-nums"] },
  scopePaymentReferenceValue: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2 },
  startPinDetailCard: { flexShrink: 0, alignItems: "center" },
  startPinDetailLabel: { fontFamily: "Urbanist-800", fontSize: huddleType.meta, lineHeight: huddleType.metaLine + 4, letterSpacing: 0.8, color: huddleColors.blue, textTransform: "uppercase" },
  startPinDetailDigits: { flexDirection: "row", alignItems: "center", gap: 0 },
  startPinDetailDigitBox: { ...huddleGlassControls.surface, width: 20, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 8, borderColor: huddleColors.fieldFocusBorder },
  startPinDetailDigitText: { fontFamily: "Urbanist-800", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.blue, fontVariant: ["tabular-nums"] },
  startPinPreparingText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  // note block (full-width body)
  scopeEyebrowText: { fontFamily: "Urbanist-700", fontSize: huddleType.meta, lineHeight: huddleType.metaLine + 4, letterSpacing: 0.8, color: huddleColors.mutedText, textTransform: "uppercase" },
  scopeNoteBlock: { gap: huddleSpacing.x1 + 2 },
  scopeNoteText: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.label * huddleType.lineNormal, color: huddleColors.text },
  // actions
  scopeActionButton: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1, minHeight: 32, paddingHorizontal: huddleSpacing.x3, borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.primarySoftFill, backgroundColor: huddleColors.canvas },
  scopeDeclineAction: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1, minHeight: 28, paddingHorizontal: huddleSpacing.x1 },
  scopeDeclineActionText: { fontFamily: "Urbanist-800", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.validationRed },
  scopeEditSelfStart: { alignSelf: "flex-start", marginTop: huddleSpacing.x1 },
  scopeActionText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.blue },
  // Centered row (minHeight + alignItems center) with the divider as its top border and NO
  // extra body padding below it — so the gap from the line down to "See Care Instruction"
  // equals the gap from the text down to the card's bottom edge.
  careInstructionNavRow: { minHeight: 44, marginTop: huddleSpacing.x1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x1, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: huddleColors.sectionDividerStrong, paddingHorizontal: huddleSpacing.x2 },
  careInstructionNavText: { fontFamily: "Urbanist-800", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.blue },
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
  timelineTextBlock: { flex: 1, minWidth: 0, gap: 2 },
  timelineLabel: { fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  timelineDetailText: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  timelineLastUpdated: { alignSelf: "flex-end", marginTop: huddleSpacing.x1, fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText, textAlign: "right" },
  timelineReferenceRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, marginTop: huddleSpacing.x1 },
  timelineReferenceValueButton: { minWidth: 0, flexShrink: 1, borderRadius: huddleRadii.button },
  timelineReferenceText: { fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  timelineReferenceCopyButton: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas },
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
  notice: { ...huddleGlassControls.surface, flexDirection: "row", gap: huddleSpacing.x2, margin: huddleSpacing.x3, padding: huddleSpacing.x3, borderRadius: huddleRadii.card },
  noticeText: { flex: 1, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.blue },
  handoffBanner: { ...huddleGlassControls.surface, gap: huddleSpacing.x3, marginHorizontal: huddleSpacing.x3, marginBottom: huddleSpacing.x2, padding: huddleSpacing.x3, borderRadius: huddleRadii.card },
  handoffBannerCopy: { gap: huddleSpacing.x1 },
  handoffBannerTitleRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  handoffBannerTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.blue },
  handoffBannerText: { fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  handoffActionCard: { gap: huddleSpacing.x2 },
  cancelBookingTextButton: { alignSelf: "center", minHeight: 32, justifyContent: "center", paddingHorizontal: huddleSpacing.x2 },
  cancelBookingTextButtonLabel: { fontFamily: "Urbanist-800", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.validationRed },
  completionCountdownReportLink: { alignSelf: "center", minHeight: 32, justifyContent: "center", paddingHorizontal: huddleSpacing.x2 },
  completionCountdownReportLinkText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.blue },
  messageStack: { gap: 0 },
  messageBlock: { marginVertical: huddleSpacing.x1 },
  systemPill: { alignSelf: "center", maxWidth: "86%", marginVertical: huddleSpacing.x2, overflow: "hidden", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x1, backgroundColor: huddleColors.mutedCanvas, fontFamily: "Urbanist-500", fontSize: 12, lineHeight: 16, color: huddleColors.text, textAlign: "center" },
  systemPillMuted: { backgroundColor: huddleColors.mutedCanvas, color: huddleColors.mutedText },
  systemPillInfo: { backgroundColor: huddleColors.glassControl, color: huddleColors.blue },
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
  chatShareCard: { width: 286, maxWidth: "90%", overflow: "hidden", borderRadius: 18, borderWidth: 0, shadowColor: "rgba(36,55,120,0.32)", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 22, elevation: 2 },
  chatShareCardMine: { backgroundColor: huddleColors.membershipUpgradePlus, shadowColor: "rgba(11,18,48,0.28)", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 18 },
  chatShareCardTheirs: { backgroundColor: huddleColors.coral },
  chatShareCardBody: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3, padding: huddleSpacing.x3 },
  shareThumb: { width: 72, height: 72, overflow: "hidden", borderRadius: 14, backgroundColor: "rgba(244,247,251,0.95)" },
  shareThumbImage: { width: "100%", height: "100%" },
  shareTextWrap: { flex: 1, minWidth: 0 },
  shareSurface: { marginBottom: 2, fontFamily: "Urbanist-800", fontSize: 10, lineHeight: 13, color: huddleColors.blue, textTransform: "uppercase" },
  shareTitle: { fontFamily: "Urbanist-700", fontSize: 13, lineHeight: 20, color: "#424965" },
  shareDescription: { marginTop: huddleSpacing.x1, fontFamily: "Urbanist-500", fontSize: 12, lineHeight: 20, color: "#6B728A" },
  shareTextOnBubble: { color: huddleColors.onPrimary },
  shareDescriptionOnBubble: { color: "rgba(255,255,255,0.82)" },
  chatAttachmentRail: { gap: huddleSpacing.x1 },
  chatAttachmentFrame: { width: 220, height: 180, overflow: "hidden", borderRadius: huddleRadii.card, backgroundColor: huddleColors.glassControl },
  chatAttachmentImage: { width: "100%", height: "100%" },
  uploadRail: { gap: huddleSpacing.x2, paddingRight: huddleSpacing.x6, paddingBottom: huddleSpacing.x1 },
  uploadThumb: { width: huddleSpacing.x9, height: huddleSpacing.x9, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: huddleRadii.button, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.mutedCanvas },
  uploadImage: { width: "100%", height: "100%" },
  uploadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: huddleSpacing.x1, backgroundColor: huddleColors.backdrop },
  uploadingText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: 16, color: huddleColors.onPrimary },
  removeUpload: { position: "absolute", top: 2, right: 2, width: 20, height: 20, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.backdrop },
  // Single bottom-owned footer surface (CTA card + composer), absolutely pinned to the screen
  // bottom. Being out of flow, it can't be compressed by a tall card or a full message list —
  // it's always one intact stack at the bottom, and the scroll reserves its measured height as
  // bottom padding (see contentContainerStyle) so nothing hides behind it.
  dialogueFooterSurface: { position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", backgroundColor: huddleColors.canvas, zIndex: 6 },
  dialogueFooterSurfaceKeyboard: { position: "relative", left: undefined, right: undefined, bottom: undefined },
  serviceActionLayer: { width: "100%", flexShrink: 0, paddingHorizontal: huddleSpacing.x3, paddingTop: huddleSpacing.x2, paddingBottom: huddleSpacing.x3, backgroundColor: huddleColors.canvas },
  // Same canvas background as serviceActionLayer above it, so a thin/light divider is easy to
  // miss — use a solid 2px line at real contrast so the CTA reads as pinned above, not fused.
  dialogueComposerSurface: { flexShrink: 0, gap: huddleSpacing.x2, paddingTop: huddleSpacing.x2, backgroundColor: huddleColors.canvas, borderTopWidth: 2, borderTopColor: huddleColors.divider },
  actionRow: { width: "100%", flexDirection: "row", alignItems: "stretch", gap: huddleSpacing.x2 },
  primaryActionWrap: { flex: 1, minWidth: 0, ...huddleShadows.glassElevation1 },
  completionActionStack: { gap: huddleSpacing.x1 },
  requiredCareUpdateButton: {
    ...huddleButtons.base,
    minHeight: huddleButtons.base.minHeight,
    borderRadius: huddleButtons.base.borderRadius,
    backgroundColor: huddleColors.success,
  },
  requiredCareUpdateButtonText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  careUpdateStatusLoadingButton: {
    ...huddleButtons.base,
    minHeight: huddleButtons.base.minHeight,
    borderRadius: huddleButtons.base.borderRadius,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    backgroundColor: huddleColors.mutedCanvas,
  },
  careUpdateStatusLoadingText: {
    ...huddleButtons.label,
    color: huddleColors.mutedText,
  },
  completionCareUpdateNotice: {
    ...huddleGlassControls.surface,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x2,
    borderLeftWidth: 4,
    borderLeftColor: huddleColors.blue,
    borderRadius: huddleRadii.card,
    padding: huddleSpacing.x3,
  },
  completionCareUpdateNoticeCopy: { flex: 1, minWidth: 0, gap: huddleSpacing.x1 },
  completionCareUpdateNoticeTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.blue },
  completionCareUpdateNoticeBody: { fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  completionSendUpdateFirst: { alignSelf: "center", minHeight: 32, justifyContent: "center", paddingHorizontal: huddleSpacing.x2 },
  completionSendUpdateFirstText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.blue },
  shareMoreUpdateBanner: {
    ...huddleButtons.base,
    minHeight: huddleButtons.base.minHeight,
    borderRadius: huddleButtons.base.borderRadius,
    borderWidth: 1,
    borderColor: huddleColors.blue,
    backgroundColor: huddleColors.canvas,
  },
  shareMoreUpdateBannerText: {
    ...huddleButtons.label,
    color: huddleColors.blue,
  },
  completedReviewCtaWrap: { width: "100%" },
  composerRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  composerStack: { gap: huddleSpacing.x2 },
  summaryMissActions: { gap: huddleSpacing.x2, marginTop: huddleSpacing.x1 },
  attachButton: { width: 18, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 0, backgroundColor: "transparent" },
  sendButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blue },
  fieldLabel: { marginTop: huddleSpacing.x3, marginBottom: huddleSpacing.x1, fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  requestCreateLabel: { marginBottom: huddleSpacing.x1 + 2, paddingLeft: huddleSpacing.x1, fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  requestCreateLabelMuted: { color: huddleColors.mutedText, fontFamily: "Urbanist-500" },
  requestSheetScrollContent: { gap: huddleSpacing.x3, paddingBottom: huddleSpacing.x8 },
  requestFieldHeight: { height: 52, minHeight: 52, maxHeight: 52, paddingVertical: 0, textAlignVertical: "center" },
  requestReadOnlyField: { backgroundColor: huddleColors.mutedCanvas },
  locationFieldRow: { height: 56, minHeight: 56, maxHeight: 56, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: huddleColors.fieldBorder, borderRadius: huddleRadii.field, paddingLeft: huddleSpacing.x1, paddingRight: huddleSpacing.x3, backgroundColor: huddleColors.glassChrome, ...huddleShadows.glassElevation1 },
  // includeFontPadding: false intentionally omitted — on Android it strips the padding
  // reserved for descenders (g/y/j/p/q), which clips them against this field's fixed-height
  // parent row. textAlignVertical: "center" still centers the text correctly without it.
  locationFieldInput: { flex: 1, minWidth: 0, height: "100%", paddingTop: huddleSpacing.x1, paddingBottom: huddleSpacing.x1, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, textAlignVertical: "center", color: huddleColors.text },
  locationFieldPin: { marginRight: huddleSpacing.x1 },
  requestSelectMenu: { marginTop: huddleSpacing.x2, borderRadius: huddleFormControls.select.menuRadius, borderWidth: 1, borderColor: huddleFormControls.select.menuBorderColor, padding: huddleFormControls.select.menuPadding, backgroundColor: huddleColors.canvas, ...huddleShadows.glassElevation1 },
  requestSelectMenuInline: { maxHeight: 190, borderRadius: huddleFormControls.select.menuRadius, borderWidth: 1, borderColor: huddleFormControls.select.menuBorderColor, padding: huddleFormControls.select.menuPadding, backgroundColor: huddleColors.canvas },
  requestSelectOption: { minHeight: huddleFormControls.select.optionMinHeight, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2, borderRadius: huddleFormControls.select.optionRadius, paddingHorizontal: huddleFormControls.select.optionPaddingHorizontal, paddingVertical: huddleFormControls.select.optionPaddingVertical },
  requestSelectOptionLabelRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  requestSelectOptionEmoji: { fontSize: huddleType.label, lineHeight: huddleType.labelLine },
  requestSelectOptionText: { flex: 1, minWidth: 0, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  requestSelectOptionTextActive: { fontFamily: "Urbanist-700", color: huddleColors.blue },
  requestCheckSlot: { width: huddleFormControls.select.checkSlot, height: huddleFormControls.select.checkSlot },
  requestTwoColumn: { flexDirection: "row", gap: huddleSpacing.x2 },
  requestFlexField: { flex: 1, minWidth: 0, gap: huddleSpacing.x1 + 2 },
  requestRateBlock: { gap: huddleSpacing.x1 + 2 },
  requestRateCompositeField: { minHeight: 52, flexDirection: "row", alignItems: "center", overflow: "hidden", borderRadius: huddleRadii.field, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas },
  requestRateCurrency: { alignSelf: "stretch", minWidth: 72, alignItems: "center", justifyContent: "center", borderRightWidth: 1, borderRightColor: huddleColors.divider, paddingHorizontal: huddleSpacing.x2 },
  requestRateCurrencyPickable: { flexDirection: "row", gap: huddleSpacing.x1 },
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
  requestCalendarCellToday: { backgroundColor: huddleColors.glassControl },
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
  chip: { minHeight: 52, justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas, paddingHorizontal: huddleSpacing.x4 },
  chipActive: { borderColor: huddleColors.blue, backgroundColor: huddleColors.blue },
  chipText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  chipTextActive: { color: huddleColors.onPrimary },
  reviewHeaderTitleWrap: { flex: 1, minHeight: 40, justifyContent: "center" },
  reviewSuccessPopupBoundary: { width: "100%", maxWidth: 420 },
  reviewSuccessPopupHeader: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3 },
  reviewSuccessPopupTitle: { flex: 1, minWidth: 0 },
  reviewChipStack: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: huddleSpacing.x2, marginBottom: huddleSpacing.x4, marginTop: huddleSpacing.x2, paddingVertical: huddleSpacing.x1 },
  reviewChip: { minHeight: 32, justifyContent: "center", alignItems: "center", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x1 },
  reviewChipText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text, textAlign: "center" },
  errorText: { marginTop: huddleSpacing.x1, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.validationRed },
  helperText: { marginTop: huddleSpacing.x1, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  locationOutOfAreaText: { marginTop: huddleSpacing.x1, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
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
  signatureCard: { gap: huddleSpacing.x2, marginTop: huddleSpacing.x1, overflow: "hidden", borderRadius: huddleRadii.field, borderWidth: 1, borderColor: huddleColors.glassBorder, backgroundColor: huddleColors.glassOverlay, padding: huddleSpacing.x3 },
  signatureCardError: { ...huddleFieldStates.error },
  signatureTopRow: { minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2 },
  signatureTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.meta, lineHeight: huddleType.metaLine + 4, letterSpacing: 0.8, color: huddleColors.mutedText, textTransform: "uppercase" },
  signatureClearButton: { minHeight: 30, minWidth: 64, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.glassBorder, backgroundColor: huddleColors.glassChrome, paddingHorizontal: huddleSpacing.x3 },
  signatureClearButtonDisabled: { opacity: 0.42 },
  signatureClearText: { fontFamily: "Urbanist-800", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  signatureClearTextDisabled: { color: huddleColors.mutedText },
  signatureInkArea: { height: 148, overflow: "hidden", borderRadius: huddleRadii.field, backgroundColor: "rgba(255,255,255,0.08)" },
  signaturePlaceholder: { position: "absolute", left: 0, right: 0, bottom: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x1 },
  signaturePlaceholderText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.mutedText, fontStyle: "italic" },
  signatureErrorText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.validationRed },
  scopeSignatureResetHelper: { marginTop: huddleSpacing.x2, textAlign: "center", fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  termsModalBoundary: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x6 },
  // No overflow: "hidden" here -- clipping the whole card to round its corners also silently
  // clips any body text whose glyph ink render fractionally past its computed advance width
  // (e.g. Urbanist's "g" descender), which is invisible until a wrapped line happens to break
  // flush against the edge. The header has no background of its own so it never needs
  // clipping; the footer sets its own bottom corner radii below since it does have one.
  termsModalCard: { width: "100%", maxHeight: "86%", borderRadius: huddleRadii.sheet, backgroundColor: huddleColors.canvas },
  termsModalHeader: { minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x4, borderBottomWidth: 1, borderBottomColor: huddleColors.divider },
  termsModalTitle: { flex: 1, minWidth: 0, fontFamily: "Urbanist-800", fontSize: huddleType.h3, lineHeight: huddleType.h3Line, color: huddleColors.text },
  termsSheetScroll: { width: "100%", maxHeight: 520 },
  termsSheetContent: { width: "100%", gap: huddleSpacing.x3, paddingLeft: huddleSpacing.x4, paddingRight: huddleSpacing.x4 + 6, paddingVertical: huddleSpacing.x4 },
  termsSheetText: { width: "100%", flexShrink: 1, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.label * huddleType.lineNormal, color: huddleColors.text },
  termsBulletRow: { flexDirection: "row", alignItems: "flex-start", gap: huddleSpacing.x2 },
  termsBulletDot: { width: 14, fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.label * huddleType.lineNormal, color: huddleColors.text },
  termsBulletText: { flex: 1, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.label * huddleType.lineNormal, color: huddleColors.text },
  termsLegalSection: { gap: huddleSpacing.x2, paddingTop: huddleSpacing.x1 },
  termsLegalTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.body, lineHeight: huddleType.body * huddleType.lineNormal, color: huddleColors.text },
  agreementPendingNote: { ...huddleGlassControls.surface, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, borderRadius: huddleRadii.field, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x2 },
  agreementPendingText: { flex: 1, minWidth: 0, fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.label * huddleType.lineNormal, color: huddleColors.blue },
  agreementSignRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  termsModalFooter: { paddingHorizontal: huddleSpacing.x4, paddingTop: huddleSpacing.x2, paddingBottom: huddleSpacing.x4, borderTopWidth: 1, borderTopColor: huddleColors.divider, backgroundColor: huddleColors.canvas, borderBottomLeftRadius: huddleRadii.sheet, borderBottomRightRadius: huddleRadii.sheet },
  termsConfirmRow: { minHeight: 48, flexDirection: "row", alignItems: "flex-start", gap: huddleSpacing.x2 },
  termsConfirmRowDisabled: { opacity: 0.46 },
  petSelectSection: { gap: huddleSpacing.x1 + 2 },
  petSelectRailViewport: { marginRight: -huddleSpacing.x4 },
  petSelectRail: { gap: huddleSpacing.x3, paddingTop: huddleSpacing.x1, paddingRight: huddleSpacing.x4, paddingBottom: huddleSpacing.x2 },
  petSelectTile: { width: 170 },
  petSelectTileError: { borderRadius: huddleRadii.card, ...huddleFieldStates.error },
  petSelectCircle: { position: "absolute", top: huddleSpacing.x2, right: huddleSpacing.x2, width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 2, borderColor: huddleColors.blue, backgroundColor: huddleColors.canvas },
  petSelectCircleActive: { backgroundColor: huddleColors.blue },
  petAddTile: { width: "100%", aspectRatio: huddlePolaroid.frame.aspectRatio, alignItems: "center", justifyContent: "center", gap: huddleSpacing.x1, borderRadius: huddlePolaroid.frame.radius, borderWidth: 1, borderColor: huddleColors.glassBorder, backgroundColor: huddleColors.glassChrome, ...huddleShadows.glassElevation1 },
  petAddTileText: { maxWidth: "82%", textAlign: "center", fontFamily: "Urbanist-700", fontSize: huddleType.label, color: huddleColors.text },
  summaryPetBlock: { gap: huddleSpacing.x2 },
  summaryPetRail: { gap: huddleSpacing.x2, paddingVertical: huddleSpacing.x1 },
  summaryPetTile: { width: 116, marginVertical: huddleSpacing.x1 },
  summaryPetInitialPhoto: { backgroundColor: huddleColors.glassControl },
  summaryPetInitial: { fontFamily: "Urbanist-800", fontSize: huddleType.h2, lineHeight: huddleType.h2Line, color: huddleColors.blue },
  petInputStack: { gap: huddleSpacing.x3 },
  manualPetFieldStack: { gap: huddleSpacing.x4 },
  manualPetCard: { gap: huddleSpacing.x3, borderRadius: huddleRadii.card, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas, padding: huddleSpacing.x3, ...huddleShadows.glassElevation1 },
  manualPetHeaderRow: { minHeight: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2 },
  manualPetHeaderActions: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  manualPetIconButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill },
  manualPetGroup: { gap: huddleSpacing.x3 },
  manualPetSummaryGroup: { gap: huddleSpacing.x1 },
  manualPetSelectTrigger: { minHeight: 52 },
  manualPetSelectValueRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  manualPetEmoji: { fontSize: 17, lineHeight: 20 },
  sheetFooter: { paddingHorizontal: huddleSpacing.x4, paddingTop: huddleSpacing.x2, paddingBottom: huddleSpacing.x4, borderTopWidth: 1, borderTopColor: huddleColors.divider },
  startCareSheetTitle: { flex: 0 },
  sheetTitleBlock: { flex: 1, minWidth: 0, gap: huddleSpacing.x1 },
  sheetSubtitle: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  careHistorySheet: { height: "82%", maxHeight: "82%" },
  careHistoryContent: { gap: huddleSpacing.x3, paddingHorizontal: 0, paddingBottom: huddleSpacing.x6 },
  careHistoryTimelineBlock: { gap: huddleSpacing.x2 },
  requestSummaryCard: { gap: huddleSpacing.x1, borderRadius: huddleRadii.field, backgroundColor: huddleColors.mutedCanvas, padding: huddleSpacing.x4, marginBottom: huddleSpacing.x3 },
  paymentBody: { gap: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x3 },
  cancelReportIssueButton: { alignSelf: "center", minHeight: 36, justifyContent: "center", paddingHorizontal: huddleSpacing.x2 },
  cancelReportIssueText: { fontFamily: "Urbanist-800", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.blue },
  quoteDeclineButton: { alignSelf: "center", minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x1, borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.validationRed, paddingHorizontal: huddleSpacing.x3 },
  quoteDeclineActionText: { fontFamily: "Urbanist-800", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.validationRed },
  paymentServiceType: { fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  paymentRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x3 },
  paymentLabel: { flex: 1, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  paymentValue: { fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  paymentDivider: { height: 1, backgroundColor: huddleColors.divider, marginVertical: huddleSpacing.x1 },
  // Option B info/status box: white card + soft elevation + a blue accent bar on the left,
  // matching the app's borderless card language (edit-profile) instead of the old hard blue
  // outline. Left pad trimmed by the 4px accent-bar width so text stays aligned with siblings.
  paymentInfoBox: { gap: huddleSpacing.x1, borderRadius: huddleRadii.card, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, borderLeftWidth: 4, borderLeftColor: huddleColors.blue, backgroundColor: huddleColors.canvas, paddingVertical: huddleSpacing.x3, paddingRight: huddleSpacing.x3, paddingLeft: huddleSpacing.x3 - 3, ...huddleShadows.glassElevation1 },
  serviceActionCard: { alignSelf: "stretch", gap: huddleSpacing.x2 },
  serviceActionCardHeader: { minHeight: 26, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2 },
  serviceActionTitleWrap: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  serviceActionCollapseButton: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill },
  careStageBanner: { flex: 1, alignSelf: "stretch", marginBottom: huddleSpacing.x2 },
  paymentInfoTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.blue },
  paymentInfoText: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  paymentInfoTextBold: { fontFamily: "Urbanist-800", color: huddleColors.text },
  paymentCareScopeCard: { position: "relative", overflow: "hidden", borderRadius: huddleRadii.glass, borderWidth: 1, borderColor: huddleColors.glassBorder, backgroundColor: huddleColors.glassOverlay, ...huddleShadows.glassElevation1 },
  paymentCareScopeInner: { gap: huddleSpacing.x3, paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x4 },
  cancellationBulletRow: { flexDirection: "row", alignItems: "flex-start", gap: huddleSpacing.x2 },
  cancellationBullet: { width: 12, fontFamily: "Urbanist-800", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.blue },
  cancellationBulletText: { flex: 1, minWidth: 0, fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  petRefillBody: { gap: huddleSpacing.x3 },
  petChoiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: huddleSpacing.x2 },
  petChoiceChip: { minHeight: 36, justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, paddingHorizontal: huddleSpacing.x3, backgroundColor: huddleColors.canvas },
  petChoiceChipActive: { borderColor: huddleColors.blue, backgroundColor: huddleColors.blue },
  petChoiceText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  petChoiceTextActive: { color: huddleColors.onPrimary },
  completionNoteField: { minHeight: 96, textAlignVertical: "top" },
  reportIssueButton: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, alignSelf: "flex-start", borderRadius: huddleRadii.button, paddingHorizontal: huddleSpacing.x3 },
  reportIssueText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.validationRed },
  startCareInputStack: { gap: 0 },
  checkinPhotoButton: { ...huddleGlassControls.surface, minHeight: 156, alignItems: "center", justifyContent: "center", gap: huddleSpacing.x2, overflow: "hidden", borderRadius: huddleRadii.card, borderColor: huddleColors.fieldBorderSoft },
  checkinPhotoButtonStacked: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  checkinPhotoButtonError: { ...huddleFieldStates.error },
  evidenceButtonRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x2 },
  evidencePreviewThumb: { width: 96, height: 96, borderRadius: huddleRadii.card, alignSelf: "flex-start" },
  reportHeaderTitleWrap: { flex: 1, minWidth: 0, gap: 2, justifyContent: "center" },
  // appModalSheetTitle carries flex:1 for its usual single-line row layout; inside
  // this column wrapper that stretches the headline to fill available height and
  // shoves the subheadline away with a visible gap. Cancel it out here.
  reportHeaderTitleNoFlex: { flex: 0 },
  reportHeaderSubtitle: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  checkinStampedPhoto: { width: "100%", minHeight: 188, overflow: "hidden", backgroundColor: huddleColors.text },
  checkinStampGradient: { ...StyleSheet.absoluteFillObject, top: undefined, height: "42%" },
  checkinStampText: { position: "absolute", left: huddleSpacing.x3, bottom: huddleSpacing.x3, maxWidth: "62%", fontFamily: "Urbanist-800", fontSize: huddleType.body, lineHeight: huddleType.lineNormal, color: huddleColors.onPrimary, textShadowColor: "rgba(0,0,0,0.45)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  checkinStampLogo: { position: "absolute", right: huddleSpacing.x3, bottom: huddleSpacing.x3, width: 116, height: 38 },
  checkinPhotoText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.blue },
  startPinInputShell: { position: "relative", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x2, minHeight: 58, borderRadius: huddleRadii.field, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x2 },
  startPinInputShellStacked: { borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  startPinInputShellError: { ...huddleFieldStates.error },
  startPinInputBox: { ...huddleGlassControls.surface, width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.button, borderColor: huddleColors.fieldFocusBorder },
  startPinInputBoxError: { borderColor: huddleColors.validationRed, backgroundColor: huddleColors.validationSoft },
  startPinInputDigit: { fontFamily: "Urbanist-800", fontSize: huddleType.h3, lineHeight: huddleType.h3Line, color: huddleColors.blue, fontVariant: ["tabular-nums"] },
  startPinInputDigitEmpty: { color: huddleColors.mutedText },
  startPinHiddenInput: { ...StyleSheet.absoluteFillObject, color: "transparent", opacity: 0.02 },
  startPinFeedbackAction: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1, minHeight: 32 },
  startPinFeedbackActionText: { fontFamily: "Urbanist-800", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.validationRed },
  checkinWarningText: { alignSelf: "stretch", textAlign: "left", fontFamily: "Urbanist-800", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
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
  reviewFooterImageButton: { ...huddleGlassControls.borderlessSurface, alignItems: "center", borderRadius: huddleRadii.pill, height: 48, justifyContent: "center", width: 48 },
  profileModalSafeArea: { alignItems: "center", paddingHorizontal: 0 },
  profileModalCard: { width: "100%", height: "100%", maxHeight: "100%", flexShrink: 1, overflow: "hidden", borderWidth: 1.5, borderColor: huddleColors.glassBorder, borderRadius: huddleRadii.glass, backgroundColor: huddleColors.canvas, ...huddleShadows.glassElevation2 },
  headerActions: { flexShrink: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: huddleSpacing.x1 },
  profileModalScroll: { flex: 1, minHeight: 0 },
  profileModalScrollContent: { paddingBottom: huddleSpacing.x6 },
  detailState: { minHeight: 320, alignItems: "center", justifyContent: "center" },
});
