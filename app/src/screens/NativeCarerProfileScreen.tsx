import { Feather } from "@expo/vector-icons";
import { fetchNativeResponseWithTimeout as fetch } from "../lib/nativeTimeout";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Modal,
  Keyboard,
  LayoutAnimation,
  findNodeHandle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeFormChoiceField } from "../components/NativeFormField";
import { NativeGlassSurface } from "../components/NativeGlassSurface";
import { NativeCarerProfileContent } from "../components/service/NativeCarerProfileContent";
import { NativeLoadingState } from "../components/NativeLoadingState";
import { NativePhoneField } from "../components/NativePhoneField";
import { NativeLegalText } from "../components/NativeLegalText";
import { NativeSpinner } from "../components/NativeSpinner";
import { NativeCollapsibleSection } from "../components/profile/NativeCollapsibleSection";
import { NativeProfileProgressTrack } from "../components/profile/NativeProfileProgressTrack";
import { useGuidedSections } from "../components/profile/useGuidedSections";
import { NativeStripeConnectOnboarding } from "../components/wallet/NativeStripeConnectOnboarding";
import {
  SlideToConfirm,
  AppKeyboardAvoidingView as KeyboardAvoidingView,
} from "../components/nativeModalPrimitives";
import { nativeModalStyles } from "../components/nativeModalPrimitives.styles";
import { nativeCountryOptions } from "../components/profile/NativeProfileForm";
import { getNativeLegalPage } from "../content/nativeLegalPages";
import { createFreshNativeFunctionHeaders, createNativeAuthenticatedHeaders, getFreshNativeAccessToken } from "../lib/nativeFunctionClient";
import { isReduceMotionActive } from "../lib/nativeReduceMotion";
import { createSingleRealtimeChannel } from "../lib/realtimeChannelManager";
import {
  ALL_SKILLS,
  CURRENCIES,
  DAYS,
  deriveWalletState,
  DOG_SIZES,
  EMPTY_PROFESSIONAL_CREDENTIAL,
  EMPTY_CARER_PROFILE,
  formatNativeCareCurrencySymbol,
  hasSubmittedProfessionalCredential,
  isAge16PlusFromDob,
  isProfessionalCredentialComplete,
  isVerifiedPublicCredentialLabel,
  LOCATION_STYLES,
  makeCarerViewData,
  mapCarerRowToForm,
  MAX_SKILLS,
  PET_TYPES,
  PET_TYPES_REQUIRING_SIZE,
  PROFESSIONAL_TYPES,
  RATE_OPTIONS,
  reconcileNativeCarerCurrency,
  nativeCarerServiceCurrencies,
  resolveSocialAlbumUrlList,
  SERVICES_OFFERED,
  toggleStringItem,
  buildCarerUpsertPayload,
  computeCarerCompleted,
  fetchPublicProviderCredentialBadges,
  type NativeCareLocationArea,
  type NativeCarerProfileData,
  type NativeProfessionalCredential,
  type NativePublicCredentialBadge,
  type NativeRateRow,
} from "../lib/nativeCarerProfile";
import { nativeCarerProfileSelectColumns } from "../lib/nativeCarerProfilePrivacy";
import { NativeShareCardModal } from "../components/share/NativeShareCardModal";
import { buildCareShareCard } from "../lib/shareCardData";
import {
  fetchNativeProfileSummary,
  readCachedNativeProfileSummary,
  subscribeNativeProfileSummary,
  type NativeProfileSummary,
} from "../lib/nativeProfileSummary";
import { fetchNativeProviderRatingSummaries, invalidateNativeServiceProviderCaches } from "../lib/nativeService";
import { haptic } from "../lib/nativeHaptics";
import { nativeSafeErrorCopy } from "../lib/nativeSafeErrorCopy";
import { useNativeLoadingDeadline } from "../lib/useNativeLoadingDeadline";
import { allowValidatedWrite } from "../lib/nativeAsyncRace";
import { nativePetEmojiForLabel } from "../lib/nativePetTaxonomy";
import { useErrorShake } from "../components/motion/useErrorShake";
import { supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import {
  fetchNativePrioritizedLocationSuggestions,
  getNativeCurrentCoordinates,
  reverseGeocodeNativeLocationComponents,
  type NativeLocationSuggestion,
  type NativeResolvedLocation,
} from "../lib/nativeLocation";
import { NativeLocationPinButton } from "../components/NativeLocationPinButton";
import {
  huddleButtons,
  huddleColors,
  huddleFieldStates,
  huddleGlassControls,
  huddleFormControls,
  huddleFormFields,
  huddleLayout,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";

type NativeCarerProfileScreenProps = {
  accessToken?: string | null;
  initialSession?: Session | null;
  profileUserId?: string | null;
  session?: Session | null;
  sessionKey?: string | null;
  userId: string | null;
  openProfessionalOnLoad?: boolean;
  onNavigate: (path: string) => void;
  onGoBack?: () => void;
};

type DropdownKey =
  | "skills"
  | "petTypes"
  | "dogSizes"
  | "days"
  | "locationStyles"
  | "currency"
  | "rate"
  | "rateServices"
  | "timeFrom"
  | "timeTo"
  | "minNoticeUnit"
  | `professionalType:${number}`
  | `credentialCountry:${number}`;

type FocusField =
  | DropdownKey
  | "story"
  | "servicesOther"
  | "price"
  | "petTypesOther"
  | "minNotice"
  | "preferredMeetupArea"
  | "professional"
  | "professionalCredentials"
  | "wallet"
  | "agreement"
  | "careContactNumber";

type FieldErrors = Partial<Record<FocusField | "time" | "rate" | "careScope" | "petSize" | "listing", string>>;

const carerAccordionSectionTitles = ["Care Scope", "Strengths & Credentials", "Availability"] as const;

type NativeSubmittedCredential = {
  id: string;
  credential_type: string;
  country_region: string;
  license_number_masked: string | null;
  status: string;
  public_label: string;
  check_available: boolean;
  last_checked_at: string | null;
};

type NativeCarerProfileCacheEntry = {
  row: Record<string, unknown> | null;
  cachedAt: number;
};

const CARER_PROFILE_CACHE_TTL_MS = 30_000;
const carerProfileCache = new Map<string, NativeCarerProfileCacheEntry>();
const carerProfileInFlight = new Map<string, Promise<Record<string, unknown> | null>>();

const nativeCarerProfileCacheKey = (userId: string, includeOwnerPrivateFields: boolean) =>
  `${includeOwnerPrivateFields ? "owner" : "public"}:${userId}`;

const readNativeCarerProfileCache = (userId: string, includeOwnerPrivateFields: boolean): Record<string, unknown> | null | undefined => {
  const cacheKey = nativeCarerProfileCacheKey(userId, includeOwnerPrivateFields);
  const cached = carerProfileCache.get(cacheKey);
  if (!cached) return undefined;
  if (Date.now() - cached.cachedAt > CARER_PROFILE_CACHE_TTL_MS) {
    carerProfileCache.delete(cacheKey);
    return undefined;
  }
  return cached.row;
};

const writeNativeCarerProfileCache = (userId: string, row: Record<string, unknown> | null, includeOwnerPrivateFields: boolean) => {
  carerProfileCache.set(nativeCarerProfileCacheKey(userId, includeOwnerPrivateFields), { row, cachedAt: Date.now() });
  return row;
};

const cleanAccessToken = async (value: string | null | undefined) => {
  const token = await getFreshNativeAccessToken(value);
  if (!token) throw new Error("missing_access_token");
  return token;
};

const getNativeCarerRestError = (body: unknown, fallback: string) => {
  if (body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string") {
    return String((body as { message?: string }).message || fallback);
  }
  if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
    return String((body as { error?: string }).error || fallback);
  }
  return fallback;
};

const maskCredentialIdentifier = (value: string) => {
  const clean = value.trim().replace(/\s+/g, "");
  if (!clean) return null;
  if (clean.length <= 4) return `${"*".repeat(Math.max(clean.length - 1, 1))}${clean.slice(-1)}`;
  return `${clean.slice(0, 2)}${"*".repeat(Math.max(clean.length - 4, 2))}${clean.slice(-2)}`;
};

const normalizeCredentialLookup = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const credentialDisplayBadge = (credential: NativeSubmittedCredential | null | undefined) => {
  const label = credential?.public_label || "";
  return label === "Registry matched"
    || label === "Certificate matched"
    || label === "Organization matched"
    || label === "Directory matched"
      ? "Verified"
      : "Self-declared";
};

async function fetchNativeCarerProfileRow(userId: string, accessToken: string | null | undefined, options: { force?: boolean; includeOwnerPrivateFields?: boolean } = {}): Promise<Record<string, unknown> | null> {
  const includeOwnerPrivateFields = options.includeOwnerPrivateFields === true;
  const cacheKey = nativeCarerProfileCacheKey(userId, includeOwnerPrivateFields);
  const cached = readNativeCarerProfileCache(userId, includeOwnerPrivateFields);
  if (!options.force && cached !== undefined) return cached;

  const existing = carerProfileInFlight.get(cacheKey);
  if (!options.force && existing) return existing;

  const request = (async () => {
    const token = await cleanAccessToken(accessToken);
    const selectColumns = nativeCarerProfileSelectColumns();
    const response = await fetch(`${supabaseUrl}/rest/v1/pet_care_profiles?select=${encodeURIComponent(selectColumns)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`, {
      method: "GET",
      headers: createNativeAuthenticatedHeaders(token, {
        Accept: "application/json",
      }),
    });
    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok) throw new Error(getNativeCarerRestError(body, "Unable to load care profile."));
    const data = Array.isArray(body) ? body[0] : null;
    const publicRow = data ? (data as unknown as Record<string, unknown>) : null;
    if (!publicRow || !includeOwnerPrivateFields) {
      return writeNativeCarerProfileCache(userId, publicRow, includeOwnerPrivateFields);
    }

    const privateResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_my_pet_care_stripe_fields`, {
      method: "POST",
      headers: createNativeAuthenticatedHeaders(token, {
        "content-type": "application/json",
        Accept: "application/json",
      }),
      body: "{}",
    });
    const privateBody = await privateResponse.json().catch(() => null) as unknown;
    if (!privateResponse.ok) throw new Error(getNativeCarerRestError(privateBody, "Unable to load wallet status."));
    const privateRow = Array.isArray(privateBody) && privateBody[0] && typeof privateBody[0] === "object"
      ? privateBody[0] as Record<string, unknown>
      : {};
    return writeNativeCarerProfileCache(userId, { ...publicRow, ...privateRow }, true);
  })();

  carerProfileInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    carerProfileInFlight.delete(cacheKey);
  }
}

// Lives on `profiles` (not `pet_care_profiles`) since generate-care-agreement-pdf/index.ts
// reads it straight off the carer's profile row for the owner-facing PDF's "Carer contact"
// field -- keeping one source of truth for both the app and the generated agreement.
async function fetchNativeCareContactNumber(userId: string, accessToken: string | null | undefined): Promise<string> {
  const token = await cleanAccessToken(accessToken);
  const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=care_contact_number&id=eq.${encodeURIComponent(userId)}&limit=1`, {
    method: "GET",
    headers: createNativeAuthenticatedHeaders(token, { Accept: "application/json" }),
  });
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) return "";
  const row = Array.isArray(body) ? body[0] as Record<string, unknown> : null;
  return String(row?.care_contact_number ?? "").trim();
}

async function saveNativeCareContactNumber(userId: string, accessToken: string | null | undefined, value: string): Promise<void> {
  const token = await cleanAccessToken(accessToken);
  const response = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: createNativeAuthenticatedHeaders(token, {
      "content-type": "application/json",
      Prefer: "return=minimal",
    }),
    body: JSON.stringify({ care_contact_number: value.trim() || null }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as unknown;
    throw new Error(getNativeCarerRestError(body, "Unable to save contact number."));
  }
}

async function nativeCredentialRpc<T>(fn: string, params: Record<string, unknown>, accessToken: string | null | undefined): Promise<T> {
  const token = await cleanAccessToken(accessToken);
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: createNativeAuthenticatedHeaders(token, {
      "content-type": "application/json",
      Accept: "application/json",
    }),
    body: JSON.stringify(params),
  });
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) throw new Error(getNativeCarerRestError(body, "Credential request failed."));
  return body as T;
}

const normalizeSubmittedCredentials = (input: unknown): NativeSubmittedCredential[] => {
  if (!Array.isArray(input)) return [];
  return input
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)))
    .map((entry) => ({
      id: String(entry.id || ""),
      credential_type: String(entry.credential_type || ""),
      country_region: String(entry.country_region || ""),
      license_number_masked: entry.license_number_masked == null ? null : String(entry.license_number_masked),
      status: String(entry.status || "self_declared"),
      public_label: String(entry.public_label || "Self-declared"),
      check_available: entry.check_available === true,
      last_checked_at: entry.last_checked_at == null ? null : String(entry.last_checked_at),
    }))
    .filter((entry) => entry.id);
};

const submitCredentialRecord = async (credential: NativeProfessionalCredential, accessToken: string | null | undefined) =>
  nativeCredentialRpc<unknown>("submit_professional_credential", {
    p_credential_type: credential.professional_type.trim(),
    p_country_region: credential.country_region.trim(),
    p_legal_name: credential.name_on_certificate.trim(),
    p_license_number: credential.license_number.trim(),
    p_issuing_body: credential.issuing_body.trim(),
    p_expiry_date: credential.expiry_date.trim() || null,
    p_provider_profile_id: null,
    p_document_storage_path: null,
  }, accessToken);

const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hours = Math.floor(index / 2);
  const minutes = index % 2 === 0 ? "00" : "30";
  return `${String(hours).padStart(2, "0")}:${minutes}`;
});

const LICENSED_MEDICAL_CARE_ERROR = "Add a professional credential before offering Licensed Medical Care.";
const UNSUPPORTED_CREDENTIAL_COPY = "Self-declared · Not verified by huddle.";
const UNABLE_TO_VERIFY_COPY = "We couldn't verify this credential online. It will remain Self-declared.";

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
const pad2 = (value: number) => String(value).padStart(2, "0");
const todayAtMidnight = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};
const datePartsFromIso = (value: string) => {
  const fallback = todayAtMidnight();
  if (!isIsoDate(value)) return { year: fallback.getFullYear(), month: fallback.getMonth() + 1, day: fallback.getDate() };
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
};
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();
const isoFromParts = (year: number, month: number, day: number) => `${year}-${pad2(month)}-${pad2(Math.min(day, daysInMonth(year, month)))}`;
const isPastDate = (value: string) => isIsoDate(value) && new Date(`${value}T00:00:00`) < todayAtMidnight();
const formatCredentialExpiryDate = (value: string) => {
  if (!isIsoDate(value)) return value;
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const cloneEmpty = (): NativeCarerProfileData => ({
  ...EMPTY_CARER_PROFILE,
  skills: [],
  proofMetadata: {},
  professional: {
    ...EMPTY_CARER_PROFILE.professional,
    roles: [],
    credentials: [],
  },
  days: [],
  timeBlocks: ["Specify"],
  locationStyles: [],
  areaCountry: "",
  areaLat: null,
  areaLng: null,
  preferredMeetupAreas: [],
  servicesOffered: [],
  petTypes: [],
  dogSizes: [],
  stripeRequirementsCurrentlyDue: [],
  rateRows: [{ price: "", rate: "", services: [], voluntary: false }],
});

// Older profiles stored a separate Carer's Place area. Fold a valid saved area
// into the single preferred-area list before the form is rendered or saved.
const normalizeLegacyCareArea = (data: NativeCarerProfileData): NativeCarerProfileData => {
  const label = data.areaName.trim();
  const country = data.areaCountry.trim();
  const legacyArea = label && country
    ? { label, country, lat: data.areaLat, lng: data.areaLng }
    : null;
  const alreadyPreferred = legacyArea && data.preferredMeetupAreas.some((area) => (
    area.label.trim().toLowerCase() === legacyArea.label.toLowerCase()
    && area.country.trim().toLowerCase() === legacyArea.country.toLowerCase()
  ));

  return {
    ...data,
    areaName: "",
    areaCountry: "",
    areaLat: null,
    areaLng: null,
    preferredMeetupAreas: legacyArea && !alreadyPreferred
      ? [...data.preferredMeetupAreas, legacyArea].slice(0, 5)
      : data.preferredMeetupAreas,
  };
};

const noticeExceedsEmergencyLimit = (value: string, unit: NativeCarerProfileData["minNoticeUnit"]) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return false;
  if (unit === "days") return parsed > 0;
  return parsed > 2;
};

const getQualificationError = (credential: NativeProfessionalCredential) => {
  if (
    !credential.professional_type.trim()
    || !credential.country_region.trim()
    || !credential.name_on_certificate.trim()
    || !credential.license_number.trim()
    || !credential.issuing_body.trim()
    || !credential.expiry_date.trim()
  ) {
    return "Complete the required professional qualification fields.";
  }
  if (!isIsoDate(credential.expiry_date)) return "Enter a valid expiry date.";
  return "";
};

const parseFunctionResponse = async (response: Response) => {
  const body = (await response.json().catch(() => null)) as { error?: string; detail?: string; message?: string } | null;
  if (!response.ok) {
    throw new Error(body?.error || body?.detail || body?.message || `Request failed with HTTP ${response.status}.`);
  }
  return body;
};

function SelectList({
  options,
  selected,
  onToggle,
  disabledOptions,
  closeOnSelect = false,
  embedded = false,
  optionIcon,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
  disabledOptions?: Set<string>;
  closeOnSelect?: boolean;
  embedded?: boolean;
  optionIcon?: (option: string) => string | null;
}) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      showsVerticalScrollIndicator
      style={[styles.dropdownMenu, embedded ? styles.dropdownMenuEmbedded : null]}
      contentContainerStyle={styles.dropdownContent}
    >
      {options.map((option, index) => {
        const disabled = disabledOptions?.has(option) ?? false;
        const active = selected.includes(option);
        return (
          <Pressable
            disabled={disabled}
            key={`${option}:${index}`}
            onPress={() => {
              onToggle(option);
              if (closeOnSelect) return;
            }}
            style={({ pressed }) => [
              styles.dropdownOption,
              active ? styles.dropdownOptionActive : null,
              pressed && !disabled ? styles.pressed : null,
              disabled ? styles.disabled : null,
            ]}
          >
            <View style={styles.dropdownLabelRow}>
              {optionIcon?.(option) ? <Text style={styles.dropdownOptionEmoji}>{optionIcon(option)}</Text> : null}
              <Text ellipsizeMode="tail" numberOfLines={1} style={styles.dropdownText}>{option}</Text>
            </View>
            {active ? <Feather color={huddleColors.blue} name="check" size={huddleFormControls.select.checkSlot} /> : <View style={styles.checkSlot} />}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function NeuToggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.switchTrack, value ? styles.switchTrackActive : null, pressed ? styles.pressed : null]}
    >
      <View style={[styles.switchThumb, value ? styles.switchThumbActive : null]} />
    </Pressable>
  );
}

function ExpiryDateField({
  error,
  focused,
  onChangeText,
  onToggle,
  value,
}: {
  error?: boolean;
  focused?: boolean;
  onChangeText: (value: string) => void;
  onToggle: () => void;
  value: string;
}) {
  return (
    <View style={[styles.dateField, error ? styles.fieldError : null, focused ? styles.fieldFocused : null]}>
      <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChangeText}
        onFocus={onToggle}
        placeholder="Expiry date"
        placeholderTextColor={huddleColors.mutedText}
        style={styles.dateFieldInput}
        value={value}
      />
      <Pressable accessibilityRole="button" onPress={onToggle} style={styles.dateIconButton}>
        <Feather color={huddleColors.mutedText} name="calendar" size={17} />
      </Pressable>
    </View>
  );
}

function FutureDatePicker({
  onChange,
  value,
  visible,
}: {
  onChange: (value: string) => void;
  value: string;
  visible: boolean;
}) {
  if (!visible) return null;
  const today = todayAtMidnight();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();
  const rawParts = datePartsFromIso(value);
  const parts = new Date(`${isoFromParts(rawParts.year, rawParts.month, rawParts.day)}T00:00:00`) < today
    ? { year: currentYear, month: currentMonth, day: currentDay }
    : rawParts;
  const years = Array.from({ length: 16 }, (_, index) => currentYear + index);
  const months = Array.from({ length: 12 }, (_, index) => index + 1).filter((month) => parts.year > currentYear || month >= currentMonth);
  const days = Array.from({ length: daysInMonth(parts.year, parts.month) }, (_, index) => index + 1).filter((day) => parts.year > currentYear || parts.month > currentMonth || day >= currentDay);
  const updatePart = (patch: Partial<typeof parts>) => {
    const next = { ...parts, ...patch };
    const nextMonths = Array.from({ length: 12 }, (_, index) => index + 1).filter((month) => next.year > currentYear || month >= currentMonth);
    const nextMonth = nextMonths.includes(next.month) ? next.month : nextMonths[0] ?? currentMonth;
    const nextDays = Array.from({ length: daysInMonth(next.year, nextMonth) }, (_, index) => index + 1).filter((day) => next.year > currentYear || nextMonth > currentMonth || day >= currentDay);
    const nextDay = nextDays.includes(next.day) ? next.day : nextDays[0] ?? currentDay;
    onChange(isoFromParts(next.year, nextMonth, nextDay));
  };

  return (
    <View style={styles.inlinePopover}>
      <View style={styles.inlineDateColumns}>
        <ScrollView nestedScrollEnabled style={styles.inlineDateColumn}>
          {years.map((year) => (
            <Pressable key={year} onPress={() => updatePart({ year })} style={[styles.inlineDateOption, year === parts.year ? styles.inlineDateOptionActive : null]}>
              <Text style={[styles.inlineDateOptionText, year === parts.year ? styles.inlineDateOptionTextActive : null]}>{year}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <ScrollView nestedScrollEnabled style={styles.inlineDateColumn}>
          {months.map((month) => (
            <Pressable key={month} onPress={() => updatePart({ month })} style={[styles.inlineDateOption, month === parts.month ? styles.inlineDateOptionActive : null]}>
              <Text style={[styles.inlineDateOptionText, month === parts.month ? styles.inlineDateOptionTextActive : null]}>{pad2(month)}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <ScrollView nestedScrollEnabled style={styles.inlineDateColumn}>
          {days.map((day) => (
            <Pressable key={day} onPress={() => updatePart({ day })} style={[styles.inlineDateOption, day === parts.day ? styles.inlineDateOptionActive : null]}>
              <Text style={[styles.inlineDateOptionText, day === parts.day ? styles.inlineDateOptionTextActive : null]}>{pad2(day)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

export function NativeCarerProfileScreen({ accessToken, initialSession, openProfessionalOnLoad = false, profileUserId, session, sessionKey, userId, onNavigate, onGoBack }: NativeCarerProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<NativeProfileSummary | null>(null);
  const [formData, setFormData] = useState<NativeCarerProfileData>(cloneEmpty);
  const [mode, setMode] = useState<"edit" | "view">("view");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { shake: triggerSaveShake, shakeStyle: saveShakeStyle } = useErrorShake();
  const [loadError, setLoadError] = useState("");
  useNativeLoadingDeadline(loading, {
    onTrip: () => {
      setLoading(false);
      setLoadError("Care profile is taking too long to load. Please try again.");
    },
  });
  const [openDrop, setOpenDrop] = useState<DropdownKey | null>(null);
  const [rateEditIndex, setRateEditIndex] = useState<number | null>(null);
  const [rateDraft, setRateDraft] = useState<NativeRateRow>({ price: "", rate: "", services: [] });
  const [listingAttempted, setListingAttempted] = useState(false);
  const [socialAlbumUrls, setSocialAlbumUrls] = useState<string[]>([]);
  const [walletOnboardingVisible, setWalletOnboardingVisible] = useState(false);
  const [walletStarting, setWalletStarting] = useState(false);
  const [agreementSheetVisible, setAgreementSheetVisible] = useState(false);
  const [agreementScrolled, setAgreementScrolled] = useState(false);
  const [sliderResetKey, setSliderResetKey] = useState(0);
  const [credentialEditIndex, setCredentialEditIndex] = useState<number | null>(null);
  const [credentialDateIndex, setCredentialDateIndex] = useState<number | null>(null);
  const [submittedCredentials, setSubmittedCredentials] = useState<NativeSubmittedCredential[]>([]);
  const [credentialBusyKey, setCredentialBusyKey] = useState<string | null>(null);
  const professionalDeepLinkHandledRef = useRef(false);
  const [publicCredentialBadges, setPublicCredentialBadges] = useState<NativePublicCredentialBadge[]>([]);
  const [countrySearch, setCountrySearch] = useState("");
  // Separate from the account's verified `profiles.phone` -- this is the number shared with
  // an owner only after a booking is confirmed, so it needs no SMS re-verification to edit.
  const [careContactNumber, setCareContactNumber] = useState("");
  const [careContactNumberSaving, setCareContactNumberSaving] = useState(false);
  const [focusedField, setFocusedField] = useState<FocusField | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [preferredMeetupQuery, setPreferredMeetupQuery] = useState("");
  const [preferredMeetupSuggestions, setPreferredMeetupSuggestions] = useState<NativeLocationSuggestion[]>([]);
  const [preferredMeetupSuggestionsOpen, setPreferredMeetupSuggestionsOpen] = useState(false);
  const [preferredMeetupLoading, setPreferredMeetupLoading] = useState(false);
  // Collapsible cards with guided flow (all modes): opens the first incomplete
  // card and auto-follows forward as cards complete; stops once the user opens
  // one themselves. Publish Checklist stays outside the accordion.
  const isCarerSectionComplete = (title: string): boolean => {
    switch (title) {
      case "About Me":
        return Boolean(formData.story.trim());
      case "Care Scope":
        return formData.rateRows.some((row) => row.services.length > 0);
      case "Strengths & Credentials":
        return formData.skills.length > 0;
      case "Availability":
        return formData.days.length > 0;
      default:
        return false;
    }
  };
  const [autoExpandedCarerSections, setAutoExpandedCarerSections] = useState<Set<string>>(() => new Set());
  const { openSection: openCarerSection, toggleSection: toggleCarerSection, openSectionManually: openCarerSectionManually, progress: carerProgress } = useGuidedSections(
    ["About Me", ...carerAccordionSectionTitles],
    isCarerSectionComplete,
  );
  const isCarerSectionOpen = (title: string) => openCarerSection === title || autoExpandedCarerSections.has(title);
  const toggleCarerProfileSection = (title: string) => {
    if (!autoExpandedCarerSections.has(title)) {
      toggleCarerSection(title);
      return;
    }
    setAutoExpandedCarerSections((current) => {
      const next = new Set(current);
      next.delete(title);
      return next;
    });
    if (openCarerSection === title) toggleCarerSection(title);
  };
  const carerSectionForField = (field: FocusField | null): string | null => {
    if (!field) return null;
    if (field === "story") return "About Me";
    if (["servicesOther", "currency", "price", "rate", "petTypes", "petTypesOther", "dogSizes"].includes(field)) return "Care Scope";
    if (["skills", "professional", "professionalCredentials"].includes(field)) return "Strengths & Credentials";
    if (["days", "timeFrom", "timeTo", "minNotice", "minNoticeUnit", "preferredMeetupArea"].includes(field)) return "Availability";
    return null; // wallet/agreement/listing live in the always-visible Publish Checklist
  };
  const editScrollRef = useRef<ScrollView | null>(null);
  const scrollYRef = useRef(0);
  const nextAutoExpandScrollYRef = useRef(huddleSpacing.x8);
  const scrollViewportHeightRef = useRef(0);
  const fieldRefs = useRef<Record<string, View | null>>({});
  const focusedFieldRef = useRef<FocusField | null>(null);
  const effectiveAccessToken = useMemo(
    () => String(accessToken || initialSession?.access_token || session?.access_token || "").trim() || null,
    [accessToken, initialSession?.access_token, session?.access_token],
  );
  const viewedUserId = useMemo(() => {
    const candidate = String(profileUserId || "").trim();
    return candidate || userId || null;
  }, [profileUserId, userId]);
  const viewerSessionKey = sessionKey || (userId ? `${userId}:0` : null);
  const isOwnCarerProfile = Boolean(userId && viewedUserId && userId === viewedUserId);

  const isAge16Plus = isAge16PlusFromDob(profile?.dob);
  const providerEligible = isAge16Plus;
  const walletState = deriveWalletState(formData);
  const needsPayoutWallet = true;
  const hasServiceListingLocation = (data: NativeCarerProfileData) => {
    return data.preferredMeetupAreas.some((area) => area.label.trim().length > 0 && area.country.trim().length > 0);
  };
  // Rate-currency pick-list: the carer's service-location currencies (multi-country
  // support), falling back to all currencies before any area is set.
  const availableCurrencies = useMemo(() => {
    const scoped = nativeCarerServiceCurrencies("", formData.preferredMeetupAreas.map((area) => area.country));
    return scoped.length > 0 ? scoped : [...CURRENCIES];
  }, [formData.preferredMeetupAreas]);
  const reconcileFormCurrency = useCallback((data: NativeCarerProfileData): NativeCarerProfileData => ({
    ...data,
    currency: reconcileNativeCarerCurrency({
      areaCountry: "",
      preferredCountries: data.preferredMeetupAreas.map((area) => area.country),
      current: data.currency,
      fallbackCountries: [profile?.location_country],
    }),
  }), [profile?.location_country]);
  const serviceAgreementPage = useMemo(() => getNativeLegalPage("/service-provider-agreement"), []);
  const agreementSheetPanResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gestureState) => gestureState.dy > huddleSpacing.x2 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderRelease: (_event, gestureState) => {
        if (gestureState.dy > huddleSpacing.x10) setAgreementSheetVisible(false);
      },
    }),
    [],
  );
  const filteredCountryOptions = useMemo(() => {
    const query = countrySearch.trim().toLowerCase();
    const source = nativeCountryOptions.length > 0 ? nativeCountryOptions : ["Other"];
    if (!query) return source;
    return source.filter((country) => country.toLowerCase().includes(query));
  }, [countrySearch]);

  const loadData = useCallback(async () => {
    if (!viewedUserId) {
      setLoadError("Profile is unavailable.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError("");
    let showedCachedProfile = false;
    try {
      const [cachedProfileSnapshot, cachedCarerRow] = await Promise.all([
        readCachedNativeProfileSummary(viewedUserId, { sessionKey: viewerSessionKey }).catch(() => null),
        Promise.resolve(readNativeCarerProfileCache(viewedUserId, isOwnCarerProfile)),
      ]);
      if (cachedProfileSnapshot?.profile && cachedCarerRow !== undefined) {
        showedCachedProfile = true;
        const cachedProfile = cachedProfileSnapshot.profile;
        const cachedForm = normalizeLegacyCareArea(cachedCarerRow ? mapCarerRowToForm(cachedCarerRow) : cloneEmpty());
        cachedForm.currency = reconcileNativeCarerCurrency({
          areaCountry: "",
          preferredCountries: cachedForm.preferredMeetupAreas.map((area) => area.country),
          current: cachedForm.currency,
          fallbackCountries: [cachedProfile.location_country],
        });
        setProfile(cachedProfile);
        setFormData(cachedForm);
        setMode(isOwnCarerProfile && (openProfessionalOnLoad || !cachedCarerRow) ? "edit" : "view");
        setLoading(false);
        const cachedAlbumRaw = Array.isArray(cachedProfile.social_album) ? cachedProfile.social_album as string[] : [];
        void resolveSocialAlbumUrlList(cachedAlbumRaw).then(setSocialAlbumUrls);
      }
      const [profileSnapshot, carerRow] = await Promise.all([
        fetchNativeProfileSummary(viewedUserId, { force: true, accessToken: effectiveAccessToken, sessionKey: viewerSessionKey }),
        fetchNativeCarerProfileRow(viewedUserId, effectiveAccessToken, { force: true, includeOwnerPrivateFields: isOwnCarerProfile }),
      ]);
      const nextProfile = profileSnapshot.profile;
      setProfile(nextProfile);

      const nextForm = normalizeLegacyCareArea(carerRow ? mapCarerRowToForm(carerRow) : cloneEmpty());
      // Reconcile the rate currency against the care locations every load: keep it if it
      // still matches a service area (multi-country carers keep their pick), otherwise
      // reset to the care-location currency — this self-heals a stale currency left over
      // from a removed area (e.g. GBP after switching a UK area to HK). GPS is only needed
      // as a fallback when there is no service area at all yet.
      const hasServiceArea = nextForm.preferredMeetupAreas.some((area) => area.country.trim());
      let gpsCountry: string | null = null;
      if (!hasServiceArea) {
        const gpsCoordinates = await getNativeCurrentCoordinates().catch(() => null);
        gpsCountry = gpsCoordinates
          ? await reverseGeocodeNativeLocationComponents(gpsCoordinates.lat, gpsCoordinates.lng).then((components) => components?.countryCode || components?.countryName || null).catch(() => null)
          : null;
      }
      nextForm.currency = reconcileNativeCarerCurrency({
        areaCountry: "",
        preferredCountries: nextForm.preferredMeetupAreas.map((area) => area.country),
        current: nextForm.currency,
        fallbackCountries: [gpsCountry, nextProfile?.location_country],
      });
      setFormData(nextForm);
      setMode(isOwnCarerProfile && (openProfessionalOnLoad || !carerRow) ? "edit" : "view");
      if (isOwnCarerProfile && openProfessionalOnLoad) {
        setAutoExpandedCarerSections((current) => new Set(current).add("Strengths & Credentials"));
        const expiredIndex = nextForm.professional.credentials.findIndex((credential) => isPastDate(credential.expiry_date));
        if (expiredIndex >= 0) setCredentialEditIndex(expiredIndex);
      }
      const albumRaw = Array.isArray(nextProfile?.social_album) ? (nextProfile?.social_album as string[]) : [];
      const albumUrls = await resolveSocialAlbumUrlList(albumRaw);
      setSocialAlbumUrls(albumUrls);
      if (isOwnCarerProfile) {
        void fetchNativeCareContactNumber(viewedUserId, effectiveAccessToken).then((value) => {
          setCareContactNumber(value || nextProfile?.phone || "");
          careContactNumberLoadedRef.current = true;
        });
      } else {
        setCareContactNumber("");
        careContactNumberLoadedRef.current = false;
      }
      const [ownerCredentials, badges] = await Promise.all([
        isOwnCarerProfile ? nativeCredentialRpc<unknown>("get_my_professional_credentials", {}, effectiveAccessToken).catch(() => []) : Promise.resolve([]),
        fetchPublicProviderCredentialBadges(viewedUserId, { force: true }).catch(() => []),
      ]);
      setSubmittedCredentials(normalizeSubmittedCredentials(ownerCredentials));
      setPublicCredentialBadges(badges);
    } catch (error) {
      if (!showedCachedProfile) setLoadError(nativeSafeErrorCopy(error, "Unable to load care profile."));
    } finally {
      setLoading(false);
    }
  }, [effectiveAccessToken, isOwnCarerProfile, openProfessionalOnLoad, viewedUserId, viewerSessionKey]);

  // Guards the debounced auto-save below from firing the moment the fetched value is first
  // applied to state (which would otherwise PATCH the exact value straight back on load).
  const careContactNumberLoadedRef = useRef(false);
  useEffect(() => {
    if (!careContactNumberLoadedRef.current) return;
    if (!isOwnCarerProfile || !viewedUserId) return;
    const timer = setTimeout(() => {
      setCareContactNumberSaving(true);
      saveNativeCareContactNumber(viewedUserId, effectiveAccessToken, careContactNumber)
        .catch((error) => setLoadError(nativeSafeErrorCopy(error, "Unable to save contact number.")))
        .finally(() => setCareContactNumberSaving(false));
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [careContactNumber]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!viewedUserId || !viewerSessionKey) return;
    return subscribeNativeProfileSummary(viewedUserId, ({ profile: nextProfile }) => {
      setProfile(nextProfile);
      const albumRaw = Array.isArray(nextProfile?.social_album) ? (nextProfile?.social_album as string[]) : [];
      void resolveSocialAlbumUrlList(albumRaw).then(setSocialAlbumUrls);
    }, { sessionKey: viewerSessionKey });
  }, [viewedUserId, viewerSessionKey]);

  useEffect(() => {
    if (!isOwnCarerProfile || !viewedUserId) return;
    const channelName = `native_pet_care_profiles_wallet:${viewedUserId}`;
    const handle = createSingleRealtimeChannel(channelName, (channel) =>
      channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pet_care_profiles", filter: `user_id=eq.${viewedUserId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          writeNativeCarerProfileCache(viewedUserId, row, true);
          setFormData((prev) => ({
            ...prev,
            stripePayoutStatus: row.stripe_payout_status === "pending" || row.stripe_payout_status === "needs_action" || row.stripe_payout_status === "complete" ? row.stripe_payout_status : prev.stripePayoutStatus,
            stripeAccountId: String(row.stripe_account_id ?? prev.stripeAccountId),
            stripeDetailsSubmitted: row.stripe_details_submitted === true,
            stripePayoutsEnabled: row.stripe_payouts_enabled === true,
            stripeRequirementsCurrentlyDue: Array.isArray(row.stripe_requirements_currently_due) ? (row.stripe_requirements_currently_due as string[]) : prev.stripeRequirementsCurrentlyDue,
            hasStripeAccount: Boolean(row.stripe_account_id ?? prev.stripeAccountId),
            listed: row.listed === true,
          }));
        },
      ));
    if (__DEV__) console.log("SUPABASE_REALTIME_SUBSCRIBE", { channel: channelName, screen: "NativeCarerProfileScreen" });
    return () => {
      if (__DEV__) console.log("SUPABASE_REALTIME_UNSUBSCRIBE", { channel: channelName, screen: "NativeCarerProfileScreen" });
      void handle.dispose();
    };
  }, [isOwnCarerProfile, viewedUserId]);

  const viewData = useMemo(
    () => ({
      ...makeCarerViewData(viewedUserId || "", formData, profile as Record<string, unknown> | null, socialAlbumUrls),
      publicCredentialBadges,
    }),
    [formData, profile, publicCredentialBadges, socialAlbumUrls, viewedUserId],
  );

  const [shareCardOpen, setShareCardOpen] = useState(false);
  // Real rating from service_reviews (via summary RPC) — pet_care_profiles
  // carries a stale rating_avg cache that must not feed the share card.
  const [careRatingSummary, setCareRatingSummary] = useState<{ avgRating: number; reviewCount: number } | null>(null);
  useEffect(() => {
    if (!isOwnCarerProfile || !viewedUserId) return;
    let alive = true;
    void fetchNativeProviderRatingSummaries([viewedUserId], effectiveAccessToken)
      .then((summaries) => { if (alive) setCareRatingSummary(summaries.get(viewedUserId) ?? null); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [effectiveAccessToken, isOwnCarerProfile, viewedUserId]);
  const careShareData = useMemo(() => {
    if (!isOwnCarerProfile) return null;
    const profileRow = profile as Record<string, unknown> | null;
    const days = formData.days.join(" · ");
    const timeLabel = formData.timeBlocks.includes("Anytime") ? "anytime" : "";
    const availability = days ? `${days}${timeLabel ? ` — ${timeLabel}` : ""}` : null;
    const petTypes = [...formData.petTypes];
    const voluntary = formData.rateRows.some((r) => r.voluntary === true);
    // Credentials from professional_credentials via the public badge RPC —
    // registry/certificate/organization-matched entries are VERIFIED and
    // outrank self-declared ones from the care-profile form.
    const badgeCreds = publicCredentialBadges
      .filter((badge) => badge.credentialType.trim())
      .map((badge) => ({
        type: badge.credentialType,
        issuingBody: badge.sourceName,
        verified: isVerifiedPublicCredentialLabel(badge.publicLabel),
      }));
    const selfDeclared = formData.professional.credentials
      .filter((c) => c.professional_type?.trim())
      .filter((c) => !badgeCreds.some((b) => b.type.toLowerCase() === c.professional_type.trim().toLowerCase()))
      .map((c) => ({ type: c.professional_type.trim(), issuingBody: c.issuing_body || null, verified: false }));
    return buildCareShareCard({
      id: viewedUserId || "",
      displayName: String(profileRow?.display_name || viewData.displayName || "Pet Carer"),
      socialId: typeof profileRow?.social_id === "string" ? profileRow.social_id : null,
      avatarUrl: typeof profileRow?.avatar_url === "string" ? profileRow.avatar_url : null,
      tier: (typeof profileRow?.effective_tier === "string" ? profileRow.effective_tier : null) ?? (typeof profileRow?.tier === "string" ? profileRow.tier : null),
      createdAt: null,
      availableNow: formData.listed === true,
      emergencyReady: formData.emergencyReadiness === true,
      voluntaryRate: voluntary,
      petTypes,
      allPets: petTypes.length >= 4,
      services: formData.servicesOffered,
      skills: formData.skills,
      availability,
      credentials: [...badgeCreds, ...selfDeclared],
      experienceYears: typeof profileRow?.experience_years === "number" || typeof profileRow?.experience_years === "string" ? profileRow.experience_years : null,
      petExperience: Array.isArray(profileRow?.pet_experience) ? (profileRow.pet_experience as string[]) : null,
      ratingAvg: careRatingSummary?.avgRating ?? null,
      reviewCount: careRatingSummary?.reviewCount ?? 0,
    });
  }, [careRatingSummary, formData, isOwnCarerProfile, profile, publicCredentialBadges, viewData.displayName, viewedUserId]);

  const updateEmergencyReadiness = (emergencyReadiness: boolean) => {
    haptic.toggleControl(); // F4: tactile feedback on carer toggle
    if (!isReduceMotionActive()) LayoutAnimation.configureNext(LayoutAnimation.create(180, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setFormData((prev) => {
      if (emergencyReadiness) {
        return { ...prev, emergencyReadiness, minNoticeUnit: "hours", minNoticeValue: "2" };
      }
      return { ...prev, emergencyReadiness: false, minNoticeUnit: prev.minNoticeUnit || "hours", minNoticeValue: prev.minNoticeValue || "2" };
    });
    if (emergencyReadiness) setFieldErrors((prev) => ({ ...prev, minNotice: undefined }));
  };

  const updateAnytime = (anytime: boolean) => {
    haptic.toggleControl(); // F4: tactile feedback on carer toggle
    if (!isReduceMotionActive()) LayoutAnimation.configureNext(LayoutAnimation.create(180, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setFormData((prev) => ({
      ...prev,
      timeBlocks: [anytime ? "Anytime" : "Specify"],
      ...(anytime ? { otherTimeFrom: "", otherTimeTo: "" } : {}),
    }));
    setFieldErrors((prev) => ({ ...prev, time: undefined }));
  };

  const updateMinNoticeValue = (minNoticeValue: string) => {
    const nextValue = minNoticeValue.replace(/\D/g, "").slice(0, 2);
    setFormData((prev) => {
      if (prev.emergencyReadiness === true && noticeExceedsEmergencyLimit(nextValue, prev.minNoticeUnit)) {
        return { ...prev, minNoticeUnit: "hours", minNoticeValue: "2" };
      }
      return { ...prev, minNoticeValue: nextValue };
    });
    setFieldErrors((prev) => ({ ...prev, minNotice: undefined }));
  };

  const updateMinNoticeUnit = (minNoticeUnit: NativeCarerProfileData["minNoticeUnit"]) => {
    setFormData((prev) => {
      if (prev.emergencyReadiness === true && minNoticeUnit === "days") {
        return { ...prev, minNoticeUnit: "hours", minNoticeValue: "2" };
      }
      return { ...prev, minNoticeUnit, minNoticeValue: prev.minNoticeValue.slice(0, 2) };
    });
    setFieldErrors((prev) => ({ ...prev, minNotice: undefined }));
  };

  const getValidationErrors = useCallback((data: NativeCarerProfileData, requireListing = false) => {
    const nextErrors: FieldErrors = {};
    const firstInvalid: FocusField[] = [];
    const mark = (field: FocusField, message: string, alias?: keyof FieldErrors) => {
      if (!nextErrors[field]) nextErrors[field] = message;
      if (alias && !nextErrors[alias]) nextErrors[alias] = message;
      if (!firstInvalid.includes(field)) firstInvalid.push(field);
    };

    if (data.rateRows.length === 0 || data.rateRows.some((row) => row.services.length === 0)) {
      mark("rateServices", "Don't skip this one!", "careScope");
    }
    const licensedMedicalSelected = data.rateRows.some((row) => row.services.includes("Licensed Medical Care"));
    if (licensedMedicalSelected && !hasSubmittedProfessionalCredential(data.professional)) {
      mark("rateServices", LICENSED_MEDICAL_CARE_ERROR, "careScope");
      mark("professional", LICENSED_MEDICAL_CARE_ERROR);
    }
    if (data.rateRows.some((row) => {
      const hasPrice = row.price.trim().length > 0;
      const hasRate = row.rate.trim().length > 0;
      if (row.voluntary && !hasPrice && !hasRate) return false;
      const price = Number.parseFloat(row.price);
      return !hasPrice || Number.isNaN(price) || price <= 0 || !data.currency || !hasRate;
    })) {
      mark("price", "We'll need this part.", "rate");
    }
    if (data.petTypes.length === 0) mark("petTypes", "Gotta have this!");
    const needsPetSize = data.petTypes.some((petType) => (PET_TYPES_REQUIRING_SIZE as readonly string[]).includes(petType));
    if (needsPetSize && data.dogSizes.length === 0) mark("dogSizes", "Don't forget this bit.", "petSize");
    if (data.skills.length === 0) mark("skills", "Oops! Don't leave this blank.");
    if (data.days.length === 0) mark("days", "Don't skip this one!");
    if (!data.timeBlocks.includes("Anytime") && (!data.otherTimeFrom || !data.otherTimeTo)) {
      mark("timeFrom", "We'll need this part.", "time");
    }
    const notice = Number.parseInt(data.minNoticeValue, 10);
    if (data.emergencyReadiness !== true) {
      if (data.minNoticeValue.trim() === "" || Number.isNaN(notice) || notice < 0) mark("minNotice", "Gotta have this!");
      else if (data.minNoticeUnit === "hours" && notice > 24) mark("minNotice", "Hours cannot exceed 24.");
      else if (data.minNoticeUnit === "days" && notice > 99) mark("minNotice", "Days cannot exceed 99.");
    }
    if (data.locationStyles.length === 0) mark("locationStyles", "Don't forget this bit.");
    const preferredMeetupQueryValue = preferredMeetupQuery.trim();
    if (preferredMeetupQueryValue) {
      mark("preferredMeetupArea", "Choose a valid area from search.");
    }
    if (!hasServiceListingLocation(data)) mark("preferredMeetupArea", "Add at least one preferred area.");
    if (data.professional.has_credentials) {
      if (!data.professional.credentials.some(isProfessionalCredentialComplete)) {
        mark("professionalCredentials", "Add at least one complete professional qualification.");
      }
      if (data.professional.credentials.some((credential) => credential.expiry_date.trim() && !isIsoDate(credential.expiry_date))) {
        mark("professionalCredentials", "Enter a valid expiry date.");
      }
    }
    if (data.listed || requireListing) {
      if (!data.stripePayoutsEnabled) mark("wallet", "Set up wallet before providing care.");
      if (!data.agreementAccepted) mark("agreement", "Accept the Care Service Carer Agreement.");
    }
    return { errors: nextErrors, firstInvalid: firstInvalid[0] ?? null };
  }, [preferredMeetupQuery]);

  // Declared before its first use (applyValidationErrors below) — this is a
  // useCallback const, so referencing it earlier would hit the temporal dead
  // zone. Depends only on `mode` + refs defined at the top of the component.
  const scrollFieldIntoView = useCallback((fieldName: string, options?: { targetRatio?: number }) => {
      const node = fieldRefs.current[fieldName];
      const scrollView = editScrollRef.current;
      if (!node || !scrollView || mode !== "edit") return;

      const target = findNodeHandle(node);
      const viewportTarget = findNodeHandle(scrollView);
      if (!target || !viewportTarget) return;

      requestAnimationFrame(() => {
        UIManager.measureInWindow(viewportTarget, (_sx, scrollViewY, _sw, viewportHeight) => {
          if (!viewportHeight) return;

          UIManager.measureInWindow(target, (_x, y, _width, height) => {
            const targetRatio = options?.targetRatio ?? 0.5;
            const fieldCenterInViewport = y - scrollViewY + height / 2;
            const desiredCenterInViewport = viewportHeight * targetRatio;
            const nextY = Math.max(
              0,
              scrollYRef.current + fieldCenterInViewport - desiredCenterInViewport,
            );

            scrollView.scrollTo({ y: nextY, animated: true });
          });
        });
      });
  }, [mode]);

  const applyValidationErrors = useCallback((errors: FieldErrors, firstInvalid: FocusField | null) => {
    setFieldErrors(errors);
    if (firstInvalid) {
      triggerSaveShake();
      const section = carerSectionForField(firstInvalid);
      if (section) openCarerSectionManually(section);
      scrollFieldIntoView(firstInvalid, { targetRatio: 0.34 });
      return true;
    }
    return false;
  }, [scrollFieldIntoView, triggerSaveShake, openCarerSectionManually]);

  const refreshCredentialEvidence = useCallback(async () => {
    if (!userId) return [];
    const [ownerCredentials, badges] = await Promise.all([
      nativeCredentialRpc<unknown>("get_my_professional_credentials", {}, effectiveAccessToken).catch(() => []),
      fetchPublicProviderCredentialBadges(userId, { force: true }).catch(() => []),
    ]);
    const normalized = normalizeSubmittedCredentials(ownerCredentials);
    setSubmittedCredentials(normalized);
    setPublicCredentialBadges(badges);
    return normalized;
  }, [effectiveAccessToken, userId]);

  const saveProfile = useCallback(async (silent = false, requireListing = false) => {
    if (!userId) return false;
    const nextFormData = reconcileFormCurrency(formData);
    const { errors, firstInvalid } = getValidationErrors(nextFormData, requireListing);
    if (!allowValidatedWrite(
      { valid: firstInvalid === null },
      () => { applyValidationErrors(errors, firstInvalid); },
    )) return false;
    if (!silent) setFieldErrors({});

    setSaving(!silent);
    try {
      const token = await cleanAccessToken(effectiveAccessToken);
      const payload = buildCarerUpsertPayload(userId, nextFormData, providerEligible);
      const publicSelectColumns = nativeCarerProfileSelectColumns();
      const response = await fetch(`${supabaseUrl}/rest/v1/pet_care_profiles?on_conflict=user_id&select=${encodeURIComponent(publicSelectColumns)}`, {
        method: "POST",
        headers: createNativeAuthenticatedHeaders(token, {
          "content-type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        }),
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(getNativeCarerRestError(body, "Couldn't save profile. Please retry."));
      const savedPublicRow = Array.isArray(body) && body[0] && typeof body[0] === "object"
        ? body[0] as Record<string, unknown>
        : payload as Record<string, unknown>;
      const savedOwnerRow = await fetchNativeCarerProfileRow(userId, effectiveAccessToken, {
        force: true,
        includeOwnerPrivateFields: true,
      });
      const savedRow = savedOwnerRow || savedPublicRow;
      writeNativeCarerProfileCache(userId, savedRow, true);
      void invalidateNativeServiceProviderCaches(userId);
      setFormData(mapCarerRowToForm(savedRow));
      setPreferredMeetupQuery("");
      const submittedKeys = new Set(submittedCredentials.map((credential) => [
        normalizeCredentialLookup(credential.credential_type),
        normalizeCredentialLookup(credential.country_region),
        credential.license_number_masked || "",
      ].join("|")));
      const completeCredentials = nextFormData.professional.credentials.filter(isProfessionalCredentialComplete);
      for (const credential of completeCredentials) {
        const key = [
          normalizeCredentialLookup(credential.professional_type),
          normalizeCredentialLookup(credential.country_region),
          maskCredentialIdentifier(credential.license_number) || "",
        ].join("|");
        if (!submittedKeys.has(key)) {
          await submitCredentialRecord(credential, effectiveAccessToken);
        }
      }
      if (completeCredentials.length > 0) await refreshCredentialEvidence();
      if (!silent) {
        setMode("view");
        haptic.success();
        Alert.alert("Saved", "Pet Carer Profile saved.");
      }
      return true;
    } catch {
      if (silent) {
        console.warn("[NativeCarerProfile.silentSave] failed");
      } else {
        haptic.error();
        Alert.alert("Save failed", "Couldn't save profile. Please retry.");
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [applyValidationErrors, effectiveAccessToken, formData, getValidationErrors, providerEligible, reconcileFormCurrency, refreshCredentialEvidence, submittedCredentials, userId]);

  const findSubmittedCredential = useCallback((credential: NativeProfessionalCredential) => {
    const masked = maskCredentialIdentifier(credential.license_number);
    return submittedCredentials.find((entry) =>
      normalizeCredentialLookup(entry.credential_type) === normalizeCredentialLookup(credential.professional_type)
      && normalizeCredentialLookup(entry.country_region) === normalizeCredentialLookup(credential.country_region)
      && (!masked || entry.license_number_masked === masked)
    ) ?? null;
  }, [submittedCredentials]);

  const submitCredentialEvidence = useCallback(async (credential: NativeProfessionalCredential, index: number) => {
    const error = getQualificationError(credential);
    if (error) {
      haptic.error();
      setFieldErrors((prev) => ({ ...prev, professionalCredentials: error }));
      setCredentialEditIndex(index);
      scrollFieldIntoView("professionalCredentials", { targetRatio: 0.34 });
      return false;
    }
    const existing = findSubmittedCredential(credential);
    if (existing) return true;
    const busyKey = `submit:${index}`;
    setCredentialBusyKey(busyKey);
    try {
      await submitCredentialRecord(credential, effectiveAccessToken);
      const refreshed = await refreshCredentialEvidence();
      const masked = maskCredentialIdentifier(credential.license_number);
      return refreshed.find((entry) =>
        normalizeCredentialLookup(entry.credential_type) === normalizeCredentialLookup(credential.professional_type)
        && normalizeCredentialLookup(entry.country_region) === normalizeCredentialLookup(credential.country_region)
        && (!masked || entry.license_number_masked === masked)
      ) ?? true;
    } catch (error) {
      await refreshCredentialEvidence();
      Alert.alert("Credential", nativeSafeErrorCopy(error, "We couldn't save your certification document right now. Try uploading later."));
      return false;
    } finally {
      setCredentialBusyKey((current) => current === busyKey ? null : current);
    }
  }, [effectiveAccessToken, findSubmittedCredential, refreshCredentialEvidence, scrollFieldIntoView]);

  const checkCredentialEvidence = useCallback(async (credential: NativeProfessionalCredential, index: number) => {
    let submitted = findSubmittedCredential(credential);
    if (!submitted) {
      const saved = await submitCredentialEvidence(credential, index);
      if (!saved || saved === true) {
        await refreshCredentialEvidence();
        return;
      }
      submitted = saved;
    }
    if (!submitted.check_available) {
      Alert.alert("Credential", UNSUPPORTED_CREDENTIAL_COPY);
      return;
    }
    const busyKey = `check:${index}`;
    setCredentialBusyKey(busyKey);
    try {
      const token = await cleanAccessToken(effectiveAccessToken);
      const response = await fetch(`${supabaseUrl}/functions/v1/credential-registry-check`, {
        method: "POST",
        headers: await createFreshNativeFunctionHeaders(token),
        body: JSON.stringify({ credential_id: submitted.id }),
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(getNativeCarerRestError(body, "Unable to check credential online."));
      await refreshCredentialEvidence();
      const result = body && typeof body === "object" && "status" in body ? String((body as { status?: unknown }).status || "") : "";
      if (result === "unable_to_verify") Alert.alert("Credential", UNABLE_TO_VERIFY_COPY);
    } catch (error) {
      await refreshCredentialEvidence();
      Alert.alert("Credential", nativeSafeErrorCopy(error, "This document image isn't clear enough for our checks. Let's try again later."));
    } finally {
      setCredentialBusyKey((current) => current === busyKey ? null : current);
    }
  }, [effectiveAccessToken, findSubmittedCredential, refreshCredentialEvidence, submitCredentialEvidence]);

  const textFieldStyle = (field: FocusField) => [
    styles.field,
    focusedField === field ? styles.fieldFocused : null,
    fieldErrors[field] ? styles.fieldError : null,
  ];

  const applyCurrentPreferredMeetupArea = (loc: NativeResolvedLocation) => {
    addPreferredMeetupArea({
      country: loc.countryName || loc.country,
      label: loc.district || loc.label,
      lat: Number.isFinite(loc.lat) ? loc.lat : null,
      lng: Number.isFinite(loc.lng) ? loc.lng : null,
    });
  };

  const updatePreferredMeetupQuery = (value: string) => {
    const parts = value.split(",");
    const nextQuery = parts.length > 1 ? parts.at(-1)?.trimStart() ?? "" : value;
    setPreferredMeetupQuery(nextQuery);
    setPreferredMeetupSuggestionsOpen(true);
    setFieldErrors((prev) => ({ ...prev, preferredMeetupArea: undefined }));
  };

  const fetchCareLocationSuggestions = useCallback(async (query: string) => {
    const profileCountry = typeof profile?.location_country === "string" ? profile.location_country : null;
    return fetchNativePrioritizedLocationSuggestions(query, {
      selectedCountry: profileCountry,
      biasPoint: Number.isFinite(profile?.latitude) && Number.isFinite(profile?.longitude)
        ? { lat: Number(profile?.latitude), lng: Number(profile?.longitude) }
        : null,
    });
  }, [profile?.latitude, profile?.location_country, profile?.longitude]);

  const setFieldRef = useCallback(
    (fieldName: string) => (node: View | null) => {
      fieldRefs.current[fieldName] = node;
    },
    [],
  );

  const handleEditScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    scrollYRef.current = scrollY;
    if (scrollY < nextAutoExpandScrollYRef.current) return;
    nextAutoExpandScrollYRef.current = scrollY + huddleSpacing.x9;
    setAutoExpandedCarerSections((current) => {
      const next = carerAccordionSectionTitles.find((title) => title !== openCarerSection && !current.has(title));
      return next ? new Set([...current, next]) : current;
    });
  }, [openCarerSection]);

  useEffect(() => {
    if (professionalDeepLinkHandledRef.current || loading || !isOwnCarerProfile || !openProfessionalOnLoad || mode !== "edit") return;
    professionalDeepLinkHandledRef.current = true;
    requestAnimationFrame(() => scrollFieldIntoView("professionalCredentials", { targetRatio: 0.34 }));
  }, [isOwnCarerProfile, loading, mode, openProfessionalOnLoad, scrollFieldIntoView]);

  const focusField = useCallback(
    (fieldName: FocusField) => {
      focusedFieldRef.current = fieldName;
      setFocusedField(fieldName);
      scrollFieldIntoView(fieldName);
    },
    [scrollFieldIntoView],
  );

  useEffect(() => {
    const resnapFocusedField = () => {
      const fieldName = focusedFieldRef.current;
      if (!fieldName) return;
      requestAnimationFrame(() => {
        scrollFieldIntoView(fieldName);
      });
    };

    const showSub = Keyboard.addListener("keyboardDidShow", resnapFocusedField);
    const frameSub = Keyboard.addListener("keyboardDidChangeFrame", resnapFocusedField);

    return () => {
      showSub.remove();
      frameSub.remove();
    };
  }, [scrollFieldIntoView]);

  const toggleDrop = useCallback(
    (dropKey: DropdownKey) => {
      Keyboard.dismiss();
      focusField(dropKey);
      setOpenDrop((current) => (current === dropKey ? null : dropKey));
    },
    [focusField],
  );

  useEffect(() => {
    const query = preferredMeetupQuery.trim();
    if (query.length < 2 || !preferredMeetupSuggestionsOpen) {
      setPreferredMeetupSuggestions([]);
      setPreferredMeetupLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setPreferredMeetupLoading(true);
      try {
        const suggestions = await fetchCareLocationSuggestions(query);
        if (!cancelled) {
          setPreferredMeetupSuggestions(suggestions);
        }
      } catch {
        if (!cancelled) {
          setPreferredMeetupSuggestions([]);
        }
      } finally {
        if (!cancelled) setPreferredMeetupLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fetchCareLocationSuggestions, preferredMeetupQuery, preferredMeetupSuggestionsOpen]);

  const addPreferredMeetupArea = (area: NativeCareLocationArea) => {
    setFormData((prev) => {
      const key = `${area.label.toLowerCase()}|${area.country.toLowerCase()}`;
      const exists = prev.preferredMeetupAreas.some((item) => `${item.label.toLowerCase()}|${item.country.toLowerCase()}` === key);
      if (exists) return prev;
      const nextAreas = [...prev.preferredMeetupAreas, area].slice(0, 5);
      return {
        ...prev,
        preferredMeetupAreas: nextAreas,
        currency: reconcileNativeCarerCurrency({
          areaCountry: "",
          preferredCountries: nextAreas.map((item) => item.country),
          current: prev.currency,
        }),
      };
    });
    setPreferredMeetupQuery("");
    setPreferredMeetupSuggestions([]);
    setPreferredMeetupSuggestionsOpen(false);
    setFieldErrors((prev) => ({ ...prev, preferredMeetupArea: undefined }));
  };

  const removePreferredMeetupArea = (label: string, country: string) => {
    setFormData((prev) => {
      const nextAreas = prev.preferredMeetupAreas.filter((item) => item.label !== label || item.country !== country);
      return {
        ...prev,
        preferredMeetupAreas: nextAreas,
        currency: reconcileNativeCarerCurrency({
          areaCountry: "",
          preferredCountries: nextAreas.map((item) => item.country),
          current: prev.currency,
        }),
      };
    });
  };

  const toggleSkill = (skill: string) => {
    const alreadySelected = formData.skills.includes(skill);
    if (alreadySelected) {
      setFormData((prev) => ({ ...prev, skills: prev.skills.filter((entry) => entry !== skill) }));
      return;
    }
    if (formData.skills.length >= MAX_SKILLS) {
      Alert.alert("Strengths", "Maximum 6 strengths selected.");
      return;
    }
    setFormData((prev) => ({ ...prev, skills: [...prev.skills, skill] }));
  };

  const setProfessionalQualifications = (hasCredentials: boolean) => {
    haptic.toggleControl();
    setFormData((prev) => ({
      ...prev,
      professional: {
        ...prev.professional,
        enabled: hasCredentials,
        roles: hasCredentials ? prev.professional.roles : [],
        has_credentials: hasCredentials,
        credentials: hasCredentials && prev.professional.credentials.length === 0 ? [{ ...EMPTY_PROFESSIONAL_CREDENTIAL }] : hasCredentials ? prev.professional.credentials : [],
      },
    }));
    setCredentialEditIndex(hasCredentials ? 0 : null);
    setCredentialDateIndex(null);
    setFieldErrors((prev) => ({ ...prev, professionalCredentials: undefined, professional: undefined }));
  };

  const updateCredential = (index: number, patch: Partial<NativeProfessionalCredential>) => {
    setFormData((prev) => {
      const credentials = [...prev.professional.credentials];
      credentials[index] = { ...(credentials[index] ?? EMPTY_PROFESSIONAL_CREDENTIAL), ...patch };
      return { ...prev, professional: { ...prev.professional, credentials } };
    });
    setFieldErrors((prev) => ({ ...prev, professionalCredentials: undefined, professional: undefined }));
  };

  const saveCredential = async (index: number) => {
    const credential = formData.professional.credentials[index] ?? EMPTY_PROFESSIONAL_CREDENTIAL;
    const error = getQualificationError(credential);
    if (error) {
      haptic.error();
      setFieldErrors((prev) => ({ ...prev, professionalCredentials: error }));
      setCredentialEditIndex(index);
      scrollFieldIntoView("professionalCredentials", { targetRatio: 0.34 });
      return;
    }
    setFieldErrors((prev) => ({ ...prev, professionalCredentials: undefined, professional: undefined }));
    setCredentialEditIndex(null);
    setCredentialDateIndex(null);
    setOpenDrop(null);
    await submitCredentialEvidence(credential, index);
  };

  const addCredential = () => {
    setFormData((prev) => ({
      ...prev,
      professional: {
        ...prev.professional,
        enabled: true,
        has_credentials: true,
        credentials: [...prev.professional.credentials, { ...EMPTY_PROFESSIONAL_CREDENTIAL }],
      },
    }));
    setCredentialEditIndex(formData.professional.credentials.length);
    setCredentialDateIndex(null);
    setFieldErrors((prev) => ({ ...prev, professionalCredentials: undefined, professional: undefined }));
    setOpenDrop(null);
  };

  const removeCredential = (index: number) => {
    setFormData((prev) => {
      const credentials = prev.professional.credentials.length > 1
        ? prev.professional.credentials.filter((_, credentialIndex) => credentialIndex !== index)
        : [{ ...EMPTY_PROFESSIONAL_CREDENTIAL }];
      return {
        ...prev,
        professional: {
          ...prev.professional,
          credentials,
          has_credentials: true,
        },
      };
    });
    setCredentialEditIndex(0);
    setCredentialDateIndex(null);
    setOpenDrop(null);
  };

  const addRateRow = () => {
    setFormData((prev) => ({ ...prev, rateRows: [...prev.rateRows, { price: "", rate: "", services: [], voluntary: false }] }));
    setRateEditIndex(formData.rateRows.length);
    setRateDraft({ price: "", rate: "", services: [], voluntary: false });
    setOpenDrop(null);
  };

  const editRate = (index: number) => {
    const row = formData.rateRows[index] ?? { price: "", rate: "", services: [], voluntary: false };
    setRateEditIndex(index);
    setRateDraft({ ...row, services: [...row.services] });
    setOpenDrop(null);
  };

  const saveRate = () => {
    if (rateEditIndex === null) return;
    setFormData((prev) => {
      const rows = [...prev.rateRows];
      rows[rateEditIndex] = {
        ...rateDraft,
        price: rateDraft.price,
        rate: rateDraft.rate,
        services: [...rateDraft.services],
      };
      return {
        ...prev,
        rateRows: rows,
        servicesOffered: [...new Set(rows.flatMap((row) => row.services))],
      };
    });
    setRateEditIndex(null);
    setOpenDrop(null);
  };

  const startWallet = useCallback(async () => {
    if (!userId) return;
    const draftSaved = await saveProfile(true);
    if (!draftSaved) {
      haptic.error();
      setFieldErrors((prev) => ({ ...prev, wallet: "Save your draft before setting up wallet." }));
      return;
    }
    setWalletOnboardingVisible(true);
  }, [saveProfile, userId]);

  const refreshWallet = useCallback(async () => {
    try {
      const token = await cleanAccessToken(effectiveAccessToken);
      const response = await fetch(`${supabaseUrl}/functions/v1/refresh-stripe-account-status`, {
        method: "POST",
        headers: await createFreshNativeFunctionHeaders(token),
        body: JSON.stringify({}),
      });
      await parseFunctionResponse(response);
      await loadData();
    } catch (error) {
      Alert.alert("Wallet", nativeSafeErrorCopy(error, "Your payout profile isn't fully set up yet. Tap to connect Stripe!"));
    }
  }, [effectiveAccessToken, loadData]);

  const openAgreementSheet = () => {
    setAgreementScrolled(false);
    setAgreementSheetVisible(true);
  };
  const acceptAgreementFromSheet = () => {
    setFormData((prev) => ({ ...prev, agreementAccepted: true, agreementAcceptedAt: prev.agreementAcceptedAt ?? new Date().toISOString() }));
    setAgreementSheetVisible(false);
    setFieldErrors((prev) => ({ ...prev, agreement: undefined }));
  };
  const completeProfile = () => {
    const { errors, firstInvalid } = getValidationErrors(formData, true);
    if (applyValidationErrors(errors, firstInvalid)) {
      setSliderResetKey((current) => current + 1);
      return;
    }
    void saveProfile(false, true);
  };
  const goBack = () => {
    if (onGoBack) onGoBack();
    else onNavigate("/settings");
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <NativeLoadingState variant="centered" />
      </SafeAreaView>
    );
  }

  if (isOwnCarerProfile && !isAge16Plus) {
    return (
      <SafeAreaView edges={["left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back" onPress={goBack} style={styles.headerIcon}>
            <Feather color={huddleColors.text} name="arrow-left" size={24} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Pet Carer Profile</Text>
            <Text style={styles.headerSubtitle}>Care Service Providers must be at least 16.</Text>
          </View>
          <View style={styles.headerIcon} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["left", "right"]} style={styles.safe}>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back" onPress={goBack} style={({ pressed }) => [styles.headerIcon, pressed ? styles.pressed : null]}>
            <Feather color={huddleColors.text} name="arrow-left" size={24} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Pet Carer Profile</Text>
            <Text style={styles.headerSubtitle}>{isOwnCarerProfile ? "Customize how you offer trusted support" : "Trusted pet care profile"}</Text>
          </View>
          {mode === "edit" ? (
            <Animated.View style={saveShakeStyle}>
              <Pressable accessibilityLabel="Save" disabled={saving} onPress={() => void saveProfile(false)} style={({ pressed }) => [styles.headerIcon, pressed && !saving ? styles.pressed : null, saving ? styles.disabled : null]}>
                {saving ? <NativeSpinner tone="secondary" /> : <Feather color={huddleColors.text} name="save" size={22} />}
              </Pressable>
            </Animated.View>
          ) : (
            <View style={styles.headerIcon} />
          )}
        </View>

        {isOwnCarerProfile ? (
          <View style={styles.tabs}>
            <Pressable onPress={() => setMode("edit")} style={[styles.tab, mode === "edit" ? styles.tabActive : null]}>
              <Text style={[styles.tabText, mode === "edit" ? styles.tabTextActive : null]}>Edit</Text>
            </Pressable>
            <Pressable
              onPress={() => setMode("view")}
              style={[styles.tab, mode === "view" ? styles.tabActive : null]}
            >
              <Text style={[styles.tabText, mode === "view" ? styles.tabTextActive : null]}>View</Text>
            </Pressable>
          </View>
        ) : null}

        {loadError ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable onPress={() => void loadData()} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            ref={editScrollRef}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + huddleSpacing.x10 }]}
            onLayout={(event) => {
              scrollViewportHeightRef.current = event.nativeEvent.layout.height;
            }}
            onScroll={handleEditScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            style={styles.contentScroller}
          >
            {mode === "view" ? (
              <NativeCarerProfileContent
                provider={viewData}
                accessToken={accessToken}
                topRightOverlay={careShareData ? (
                  <Pressable accessibilityLabel="Share your care card" accessibilityRole="button" onPress={() => setShareCardOpen(true)}>
                    <NativeGlassSurface style={styles.shareCardGlass}>
                      <Feather color={huddleColors.text} name="share" size={18} />
                    </NativeGlassSurface>
                  </Pressable>
                ) : null}
              />
            ) : (
              <View style={styles.form}>
                <NativeProfileProgressTrack progress={carerProgress} />
                <NativeCollapsibleSection title="About Me" collapsible open onToggle={() => undefined}>
                <View style={styles.groupStack}>
                <View ref={setFieldRef("story")} style={styles.fieldGroup}>
                  <TextInput
                    multiline
                    onBlur={() => setFocusedField(null)}
                    onChangeText={(story) => setFormData((prev) => ({ ...prev, story }))}
                    onFocus={() => focusField("story")}
                    placeholder="Introduce yourself and how you care for pets"
                    placeholderTextColor={huddleColors.mutedText}
                    scrollEnabled
                    style={[...textFieldStyle("story"), styles.textArea]}
                    textAlignVertical="top"
                    value={formData.story}
                  />
                </View>
                <View style={styles.contactFieldGroup}>
                  <Text style={styles.sectionTitle}>Contact Number for Care Service</Text>
                  <View style={styles.helperFieldStack}>
                    <NativePhoneField
                      onChangeText={setCareContactNumber}
                      onFocus={() => focusField("careContactNumber")}
                      placeholder="Phone number"
                      value={careContactNumber}
                    />
                    <Text style={styles.helperText}>Your contact number will only be shared after a booking is confirmed.</Text>
                  </View>
                  {careContactNumberSaving ? <NativeSpinner tone="secondary" /> : null}
                </View>
                </View>
                </NativeCollapsibleSection>

                <NativeCollapsibleSection title="Care Scope" collapsible open={isCarerSectionOpen("Care Scope")} onToggle={() => toggleCarerProfileSection("Care Scope")}>
                <View style={styles.groupStack}>
                <View ref={setFieldRef("rateServices")} style={styles.fieldGroup}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Rates & services</Text>
                    {rateEditIndex === null ? (
                      <Pressable onPress={addRateRow} style={styles.iconCircle}>
                        <Feather color={huddleColors.blue} name="plus" size={18} />
                      </Pressable>
                    ) : null}
                  </View>
                  {formData.rateRows.map((row, index) => {
                    const isEditing = rateEditIndex === index;
                    if (!isEditing) {
                      const rowHasPrice = Boolean(row.price && row.rate);
                      const needsDetails = row.services.length === 0 && (!row.voluntary || rowHasPrice);
                      const rateMeta = row.voluntary
                        ? rowHasPrice ? `Voluntary · ${formatNativeCareCurrencySymbol(formData.currency)}${row.price} / ${row.rate.toLowerCase()}` : "Voluntary"
                        : rowHasPrice ? `${formatNativeCareCurrencySymbol(formData.currency)}${row.price} / ${row.rate.toLowerCase()}` : "Add details";
                      return (
                        <View key={index} style={styles.rateSummary}>
                          {needsDetails ? (
                            <View style={styles.flex}>
                              <Text style={styles.rateAddDetails}>Add details</Text>
                            </View>
                          ) : (
                            <View style={styles.flex}>
                              <Text ellipsizeMode="tail" numberOfLines={1} style={styles.rateTitle}>{row.services.length ? row.services.join(", ") : "Add details"}</Text>
                              <Text ellipsizeMode="tail" numberOfLines={1} style={styles.rateMeta}>{rateMeta}</Text>
                            </View>
                          )}
                          <Pressable onPress={() => editRate(index)} style={styles.iconCircle}>
                            <Feather color={huddleColors.iconMuted} name="edit-2" size={15} />
                          </Pressable>
                          <Pressable
                            onPress={() => setFormData((prev) => {
                              const rows = prev.rateRows.length > 1
                                ? prev.rateRows.filter((_, rowIndex) => rowIndex !== index)
                                : [{ price: "", rate: "", services: [], voluntary: false }];
                              return { ...prev, rateRows: rows, servicesOffered: [...new Set(rows.flatMap((entry) => entry.services))] };
                            })}
                            style={styles.iconCircle}
                          >
                            <Feather color={huddleColors.iconMuted} name="trash-2" size={15} />
                          </Pressable>
                        </View>
                      );
                    }
                    return (
                      <View key={index} style={styles.rateEditor}>
                        <View style={styles.careTypeToggleRow}>
                          <View style={styles.careTypeColumn}>
                            <Text style={styles.fieldLabel}>Care Types</Text>
                            <Pressable onPress={() => toggleDrop("rateServices")} style={[styles.selectButton, openDrop === "rateServices" || focusedField === "rateServices" ? styles.fieldFocused : null, fieldErrors.careScope ? styles.fieldError : null]}>
                              <Text numberOfLines={1} style={styles.selectButtonText}>{rateDraft.services.length ? rateDraft.services.join(", ") : "Select"}</Text>
                              <Feather color={huddleColors.iconMuted} name={openDrop === "rateServices" ? "chevron-up" : "chevron-down"} size={16} />
                            </Pressable>
                          </View>
                          <View style={styles.voluntaryColumn}>
                            <Text style={styles.fieldLabel}>Voluntary</Text>
                            <View style={styles.voluntaryToggleBox}>
                              <NeuToggle value={rateDraft.voluntary === true} onChange={() => setRateDraft((prev) => ({ ...prev, voluntary: !prev.voluntary }))} />
                            </View>
                          </View>
                        </View>
                        {openDrop === "rateServices" ? (
                          <SelectList
                            options={SERVICES_OFFERED}
                            selected={rateDraft.services}
                            onToggle={(service) => {
                              setRateDraft((prev) => ({ ...prev, services: toggleStringItem(prev.services, service) }));
                            }}
                          />
                        ) : null}
                        {rateDraft.services.includes("Others") ? (
                          <View ref={setFieldRef("servicesOther")}>
                            <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                              onBlur={() => setFocusedField(null)}
                            onChangeText={(servicesOther) => setFormData((prev) => ({ ...prev, servicesOther }))}
                            onFocus={() => focusField("servicesOther")}
                            placeholder="Describe your other care"
                            placeholderTextColor={huddleColors.mutedText}
                            returnKeyType="done"
                            onSubmitEditing={Keyboard.dismiss}
                            style={textFieldStyle("servicesOther")}
                              value={formData.servicesOther}
                            />
                          </View>
                        ) : null}
                        {fieldErrors.careScope ? <Text style={styles.errorText}>{fieldErrors.careScope}</Text> : null}
                        <>
                            <Text style={styles.fieldLabel}>{rateDraft.voluntary ? "Optional rate" : "Rate"}</Text>
                            <View style={[styles.rateCompositeField, focusedField === "currency" || focusedField === "price" || focusedField === "rate" || openDrop === "currency" || openDrop === "rate" ? styles.fieldFocused : null, fieldErrors.rate ? styles.fieldError : null]}>
                              <Pressable ref={setFieldRef("currency")} onPress={() => toggleDrop("currency")} style={styles.rateCompositeCurrency}>
                                <Text style={styles.rateSelectText}>{formatNativeCareCurrencySymbol(formData.currency)}</Text>
                              </Pressable>
                              <View ref={setFieldRef("price")} style={styles.flex}>
                                <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                                  keyboardType="decimal-pad"
                                  onBlur={() => setFocusedField(null)}
                                  onChangeText={(price) => setRateDraft((prev) => ({ ...prev, price }))}
                                  onFocus={() => focusField("price")}
                                  placeholder="0"
                                  placeholderTextColor={huddleColors.mutedText}
                                  style={styles.rateCompositeInput}
                                  value={rateDraft.price}
                                />
                              </View>
                              <Pressable ref={setFieldRef("rate")} onPress={() => toggleDrop("rate")} style={styles.rateCompositeUnit}>
                                <Text style={styles.rateSelectText}>{rateDraft.rate || "Rate"}</Text>
                              </Pressable>
                            </View>
                            {fieldErrors.rate ? <Text style={styles.errorText}>{fieldErrors.rate}</Text> : null}
                            {openDrop === "currency" ? (
                              <SelectList closeOnSelect options={availableCurrencies} selected={formData.currency ? [formData.currency] : []} onToggle={(currency) => { setFormData((prev) => ({ ...prev, currency })); setOpenDrop(null); }} />
                            ) : null}
                            {openDrop === "rate" ? (
                              <SelectList closeOnSelect options={RATE_OPTIONS} selected={rateDraft.rate ? [rateDraft.rate] : []} onToggle={(rate) => { setRateDraft((prev) => ({ ...prev, rate })); setOpenDrop(null); }} />
                            ) : null}
                          </>
                        <View style={styles.actionRow}>
                          <Pressable onPress={saveRate} style={styles.smallPrimaryButton}>
                            <Text style={styles.smallPrimaryText}>Save</Text>
                          </Pressable>
                          <Pressable onPress={() => { setRateEditIndex(null); setOpenDrop(null); }} style={styles.smallSecondaryButton}>
                            <Text style={styles.smallSecondaryText}>Cancel</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.compositeContent}>
                <PetTypeMultiSelectSection
                  dropKey="petTypes"
                  fieldRef={setFieldRef("petTypes")}
                  focusedDrop={focusedField as DropdownKey | null}
                  onFocusControl={toggleDrop}
                  openDrop={openDrop}
                  selected={formData.petTypes}
                  setOpenDrop={setOpenDrop}
                  error={fieldErrors.petTypes}
                  onToggle={(petType) => {
                    setFormData((prev) => ({
                      ...prev,
                      petTypes: toggleStringItem(prev.petTypes, petType),
                      ...(petType === "Dogs" && prev.petTypes.includes(petType) ? { dogSizes: [] } : {}),
                    }));
                    setFieldErrors((prev) => ({ ...prev, petTypes: undefined }));
                  }}
                />
                {formData.petTypes.includes("Others") ? (
                  <View ref={setFieldRef("petTypesOther")}>
                    <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                      onBlur={() => setFocusedField(null)}
                    onChangeText={(petTypesOther) => setFormData((prev) => ({ ...prev, petTypesOther }))}
                    onFocus={() => focusField("petTypesOther")}
                    placeholder="Describe other pet type"
                    placeholderTextColor={huddleColors.mutedText}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    style={textFieldStyle("petTypesOther")}
                      value={formData.petTypesOther}
                    />
                  </View>
                ) : null}
                </View>
                {formData.petTypes.includes("Dogs") ? (
                  <MultiSelectSection
                    dropKey="dogSizes"
                    fieldRef={setFieldRef("dogSizes")}
                    focusedDrop={focusedField as DropdownKey | null}
                    onFocusControl={toggleDrop}
                    openDrop={openDrop}
                    options={DOG_SIZES}
                    selected={formData.dogSizes}
                    setOpenDrop={setOpenDrop}
                    title="Pet Size"
                    error={fieldErrors.petSize || fieldErrors.dogSizes}
                    onToggle={(size) => {
                      setFormData((prev) => ({ ...prev, dogSizes: toggleStringItem(prev.dogSizes, size) }));
                      setFieldErrors((prev) => ({ ...prev, dogSizes: undefined, petSize: undefined }));
                    }}
                  />
                ) : null}
                </View>
                </NativeCollapsibleSection>

                <NativeCollapsibleSection title="Strengths & Credentials" collapsible open={isCarerSectionOpen("Strengths & Credentials")} onToggle={() => toggleCarerProfileSection("Strengths & Credentials")}>
                <View style={styles.groupStack}>
                <View ref={setFieldRef("skills")} style={styles.fieldGroup}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Strengths</Text>
                    <Text style={styles.sectionCount}>{formData.skills.length}/{MAX_SKILLS}</Text>
                  </View>
                  {formData.skills.length > 0 ? (
                    <View style={styles.chipWrap}>
                      {formData.skills.map((skill) => (
                        <Pressable key={skill} onPress={() => toggleSkill(skill)} style={styles.chip}>
                          <Text style={styles.chipText}>{skill}</Text>
                          <Feather color={huddleColors.iconMuted} name="x" size={12} />
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {formData.skills.length < MAX_SKILLS ? (
                    <>
                      <Pressable onPress={() => toggleDrop("skills")} style={[styles.selectButton, openDrop === "skills" || focusedField === "skills" ? styles.fieldFocused : null, fieldErrors.skills ? styles.fieldError : null]}>
                        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.selectButtonText}>{formData.skills.length === 0 ? "Select" : "Select"}</Text>
                        <Feather color={huddleColors.iconMuted} name={openDrop === "skills" ? "chevron-up" : "chevron-down"} size={16} />
                      </Pressable>
                      {openDrop === "skills" ? (
                        <SelectList
                          options={ALL_SKILLS.filter((skill) => !formData.skills.includes(skill))}
                          selected={[]}
                          onToggle={toggleSkill}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {fieldErrors.skills ? <Text style={styles.errorText}>{fieldErrors.skills}</Text> : null}
                </View>

                <View ref={setFieldRef("professional")} style={styles.fieldGroup}>
                  <View style={[styles.switchSettingRow, fieldErrors.professional ? styles.fieldError : null]}>
                    <Text style={styles.fieldLabel}>Do you have professional qualifications?</Text>
                    <NeuToggle value={formData.professional.has_credentials} onChange={setProfessionalQualifications} />
                  </View>
                  {fieldErrors.professional ? <Text style={styles.errorText}>{fieldErrors.professional}</Text> : null}
                  {formData.professional.has_credentials ? (
                    <View ref={setFieldRef("professionalCredentials")} style={styles.credentialStack}>
                      <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionTitle}>Professional</Text>
                        <Pressable onPress={addCredential} style={styles.iconCircle}>
                          <Feather color={huddleColors.blue} name="plus" size={18} />
                        </Pressable>
                      </View>
                      {formData.professional.credentials.map((credential, index) => {
                        const editing = credentialEditIndex === index;
                        const credentialHasError = Boolean(fieldErrors.professionalCredentials);
                        const submittedCredential = findSubmittedCredential(credential);
                        const displayBadge = credentialDisplayBadge(submittedCredential);
                        const busyKey = credentialBusyKey;
                        const submitting = busyKey === `submit:${index}`;
                        const checking = busyKey === `check:${index}`;
                        const previewRows = [
                          ["Professional type", credential.professional_type],
                          ["Country/region", credential.country_region],
                          ["Name on Certificate", credential.name_on_certificate],
                          ["Issuing body", credential.issuing_body],
                          ["Expiry date", credential.expiry_date],
                        ].filter(([, value]) => value.trim());
                        return (
                          <View key={index} style={styles.rateEditor}>
                            <View style={styles.qualificationHeaderRow}>
                              <View style={styles.qualificationTitleRow}>
                                <Text style={styles.rateTitle}>Qualification</Text>
                                <View style={[styles.credentialEditBadge, displayBadge === "Verified" ? styles.credentialEditBadgeVerified : styles.credentialEditBadgeSelfDeclared]}>
                                  <Text style={[styles.credentialEditBadgeText, displayBadge === "Verified" ? styles.credentialEditBadgeTextVerified : styles.credentialEditBadgeTextSelfDeclared]}>{displayBadge}</Text>
                                </View>
                              </View>
                              <View style={styles.qualificationActions}>
                                <Pressable disabled={submitting || checking} onPress={() => editing ? void saveCredential(index) : setCredentialEditIndex(index)} style={[styles.iconCircle, submitting || checking ? styles.disabled : null]}>
                                  {submitting ? <NativeSpinner tone="muted" /> : <Feather color={huddleColors.iconMuted} name={editing ? "save" : "edit-2"} size={15} />}
                                </Pressable>
                                <Pressable onPress={() => removeCredential(index)} style={styles.iconCircle}>
                                  <Feather color={huddleColors.iconMuted} name="trash-2" size={15} />
                                </Pressable>
                              </View>
                            </View>
                            {editing ? (
                              <>
                                <Pressable onPress={() => toggleDrop(`professionalType:${index}`)} style={[styles.selectButton, openDrop === `professionalType:${index}` ? styles.fieldFocused : null, credentialHasError && !credential.professional_type.trim() ? styles.fieldError : null]}>
                                  <Text ellipsizeMode="tail" numberOfLines={1} style={styles.selectButtonText}>{credential.professional_type || "Professional type"}</Text>
                                  <Feather color={huddleColors.iconMuted} name={openDrop === `professionalType:${index}` ? "chevron-up" : "chevron-down"} size={16} />
                                </Pressable>
                                {openDrop === `professionalType:${index}` ? (
                                  <SelectList closeOnSelect options={PROFESSIONAL_TYPES} selected={credential.professional_type ? [credential.professional_type] : []} onToggle={(professional_type) => { updateCredential(index, { professional_type }); setOpenDrop(null); }} />
                                ) : null}
                                <Pressable onPress={() => { setCountrySearch(""); toggleDrop(`credentialCountry:${index}`); }} style={[styles.selectButton, openDrop === `credentialCountry:${index}` ? styles.fieldFocused : null, credentialHasError && !credential.country_region.trim() ? styles.fieldError : null]}>
                                  <Text ellipsizeMode="tail" numberOfLines={1} style={styles.selectButtonText}>{credential.country_region || "Country/region"}</Text>
                                  <Feather color={huddleColors.iconMuted} name={openDrop === `credentialCountry:${index}` ? "chevron-up" : "chevron-down"} size={16} />
                                </Pressable>
                                {openDrop === `credentialCountry:${index}` ? (
                                  <View style={styles.countryDropdownMenu}>
                                    <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                                      onChangeText={setCountrySearch}
                                      placeholder="Search country/region"
                                      placeholderTextColor={huddleColors.mutedText}
                                      style={styles.dropdownSearchInput}
                                      value={countrySearch}
                                    />
                                    <SelectList embedded closeOnSelect options={filteredCountryOptions} selected={credential.country_region ? [credential.country_region] : []} onToggle={(country_region) => { updateCredential(index, { country_region }); setOpenDrop(null); }} />
                                  </View>
                                ) : null}
                                <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple" onBlur={() => setFocusedField(null)} onChangeText={(name_on_certificate) => updateCredential(index, { name_on_certificate })} onFocus={() => focusField("professionalCredentials")} placeholder="Name on Certificate" placeholderTextColor={huddleColors.mutedText} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} style={[...textFieldStyle("professionalCredentials"), credentialHasError && !credential.name_on_certificate.trim() ? styles.fieldError : null]} value={credential.name_on_certificate} />
                                <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple" onBlur={() => setFocusedField(null)} onChangeText={(license_number) => updateCredential(index, { license_number })} onFocus={() => focusField("professionalCredentials")} placeholder="License/certificate number" placeholderTextColor={huddleColors.mutedText} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} style={[...textFieldStyle("professionalCredentials"), credentialHasError && !credential.license_number.trim() ? styles.fieldError : null]} value={credential.license_number} />
                                <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple" onBlur={() => setFocusedField(null)} onChangeText={(issuing_body) => updateCredential(index, { issuing_body })} onFocus={() => focusField("professionalCredentials")} placeholder="Issuing body" placeholderTextColor={huddleColors.mutedText} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} style={[...textFieldStyle("professionalCredentials"), credentialHasError && !credential.issuing_body.trim() ? styles.fieldError : null]} value={credential.issuing_body} />
                                <ExpiryDateField
                                  error={credentialHasError && (!credential.expiry_date.trim() || !isIsoDate(credential.expiry_date))}
                                  focused={credentialDateIndex === index}
                                  onChangeText={(expiry_date) => updateCredential(index, { expiry_date })}
                                  onToggle={() => {
                                    Keyboard.dismiss();
                                    focusField("professionalCredentials");
                                    setCredentialDateIndex((current) => current === index ? null : index);
                                  }}
                                  value={credential.expiry_date}
                                />
                                {isPastDate(credential.expiry_date) ? (
                                  <Text style={styles.expiredCredentialHelper}>
                                    Certificate expired on {formatCredentialExpiryDate(credential.expiry_date)}. Update it to restore your verified credential badge.
                                  </Text>
                                ) : null}
                                <FutureDatePicker
                                  onChange={(expiry_date) => {
                                    updateCredential(index, { expiry_date });
                                    setFieldErrors((prev) => ({ ...prev, professionalCredentials: undefined }));
                                  }}
                                  value={credential.expiry_date}
                                  visible={credentialDateIndex === index}
                                />
                              </>
                            ) : (
                              <View style={styles.qualificationReadCard}>
                                {previewRows.length > 0 ? previewRows.map(([label, value]) => (
                                  <View key={label} style={styles.qualificationPreviewRow}>
                                    <Text numberOfLines={1} style={styles.qualificationPreviewLabel}>{label}</Text>
                                    <Text numberOfLines={1} style={styles.qualificationPreviewValue}>{value}</Text>
                                  </View>
                                )) : (
                                  <Text style={styles.rateAddDetails}>Add details</Text>
                                )}
                                {submittedCredential?.check_available ? (
                                  <Pressable disabled={checking || submitting} onPress={() => void checkCredentialEvidence(credential, index)} style={[styles.smallSecondaryButton, checking || submitting ? styles.disabled : null]}>
                                    {checking ? <NativeSpinner tone="accent" /> : <Feather color={huddleColors.blue} name="shield" size={14} />}
                                    {checking ? null : <Text style={styles.smallSecondaryText}>Check credential</Text>}
                                  </Pressable>
                                ) : null}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
                </View>
                </NativeCollapsibleSection>

                <NativeCollapsibleSection title="Availability" collapsible open={isCarerSectionOpen("Availability")} onToggle={() => toggleCarerProfileSection("Availability")}>
                <View style={styles.groupStack}>
                <View style={styles.compactGroup}>
                  <MultiSelectControl
                    compact
                    dropKey="days"
                    fieldRef={setFieldRef("days")}
                    focusedDrop={focusedField as DropdownKey | null}
                    onFocusControl={toggleDrop}
                    label={null}
                    openDrop={openDrop}
                    options={DAYS}
                    placeholder="Days"
                    selected={formData.days}
                    setOpenDrop={setOpenDrop}
                    error={fieldErrors.days}
                    onToggle={(day) => setFormData((prev) => ({ ...prev, days: toggleStringItem(prev.days, day) }))}
                  />
                  <View style={styles.availabilityColumn}>
                    <View style={[styles.switchSettingRow, styles.compactSwitchSettingRow]}>
                      <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={styles.fieldLabel}>Anytime</Text>
                      <NeuToggle value={formData.timeBlocks.includes("Anytime")} onChange={updateAnytime} />
                    </View>
                    {formData.timeBlocks.includes("Specify") ? (
                      <View style={styles.compactFieldStack}>
                        <View style={styles.availabilityTimeRow}>
                          <View style={styles.flex}>
                            <Pressable ref={setFieldRef("timeFrom")} onPress={() => toggleDrop("timeFrom")} style={[styles.selectButton, styles.compactSelectButton, openDrop === "timeFrom" || focusedField === "timeFrom" ? styles.fieldFocused : null, fieldErrors.time ? styles.fieldError : null]}>
                              <Text ellipsizeMode="tail" numberOfLines={1} style={styles.selectButtonText}>{formData.otherTimeFrom || "From"}</Text>
                              <Feather color={huddleColors.iconMuted} name={openDrop === "timeFrom" ? "chevron-up" : "chevron-down"} size={16} />
                            </Pressable>
                            {openDrop === "timeFrom" ? (
                              <SelectList closeOnSelect options={TIME_OPTIONS} selected={formData.otherTimeFrom ? [formData.otherTimeFrom] : []} onToggle={(otherTimeFrom) => { setFormData((prev) => ({ ...prev, otherTimeFrom })); setFieldErrors((prev) => ({ ...prev, time: undefined })); setOpenDrop(null); }} />
                            ) : null}
                          </View>
                          <View style={styles.flex}>
                            <Pressable ref={setFieldRef("timeTo")} onPress={() => toggleDrop("timeTo")} style={[styles.selectButton, styles.compactSelectButton, openDrop === "timeTo" || focusedField === "timeTo" ? styles.fieldFocused : null, fieldErrors.time ? styles.fieldError : null]}>
                              <Text ellipsizeMode="tail" numberOfLines={1} style={styles.selectButtonText}>{formData.otherTimeTo || "To"}</Text>
                              <Feather color={huddleColors.iconMuted} name={openDrop === "timeTo" ? "chevron-up" : "chevron-down"} size={16} />
                            </Pressable>
                            {openDrop === "timeTo" ? (
                              <SelectList closeOnSelect options={TIME_OPTIONS} selected={formData.otherTimeTo ? [formData.otherTimeTo] : []} onToggle={(otherTimeTo) => { setFormData((prev) => ({ ...prev, otherTimeTo })); setFieldErrors((prev) => ({ ...prev, time: undefined })); setOpenDrop(null); }} />
                            ) : null}
                          </View>
                        </View>
                        {fieldErrors.time ? <Text style={styles.errorText}>{fieldErrors.time}</Text> : null}
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.sectionTitle}>Notice Time</Text>
                  <View style={[styles.noticeCompactRow, !formData.emergencyReadiness ? styles.noticeCompactRowSplit : null]}>
                    <View style={[styles.noticeToggleWrap, styles.compactNoticeControl]}>
                      <Text adjustsFontSizeToFit minimumFontScale={0.88} numberOfLines={1} style={styles.noticeToggleLabel}>Available Now</Text>
                      <NeuToggle value={formData.emergencyReadiness === true} onChange={updateEmergencyReadiness} />
                    </View>
                    {!formData.emergencyReadiness ? (
                      <View style={styles.noticeInputColumn}>
                        <View style={[styles.noticeCompositeField, styles.compactNoticeControl, fieldErrors.minNotice ? styles.fieldError : null]}>
                          <View ref={setFieldRef("minNotice")} style={styles.noticeValueWrap}>
                            <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                              keyboardType="number-pad"
                              onBlur={() => setFocusedField(null)}
                              onChangeText={updateMinNoticeValue}
                              onFocus={() => focusField("minNotice")}
                              placeholder=""
                              placeholderTextColor={huddleColors.mutedText}
                              style={styles.noticeCompositeInput}
                              value={formData.minNoticeValue}
                            />
                          </View>
                          <Pressable ref={setFieldRef("minNoticeUnit")} onPress={() => toggleDrop("minNoticeUnit")} style={styles.noticeCompositeUnit}>
                            <Text numberOfLines={1} style={styles.noticeUnitText}>{formData.minNoticeUnit}</Text>
                            <Feather color={huddleColors.iconMuted} name={openDrop === "minNoticeUnit" ? "chevron-up" : "chevron-down"} size={15} />
                          </Pressable>
                        </View>
                        {openDrop === "minNoticeUnit" ? (
                          <View style={styles.noticeDropdownWrap}>
                            <SelectList
                              closeOnSelect
                              options={["hours", "days"]}
                              selected={[formData.minNoticeUnit]}
                              onToggle={(unit) => {
                                updateMinNoticeUnit(unit as NativeCarerProfileData["minNoticeUnit"]);
                                setOpenDrop(null);
                              }}
                            />
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                  {fieldErrors.minNotice ? <Text style={styles.errorText}>{fieldErrors.minNotice}</Text> : null}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.sectionTitle}>Preferred Location</Text>
                  <MultiSelectControl
                    compact
                    dropKey="locationStyles"
                    fieldRef={setFieldRef("locationStyles")}
                    focusedDrop={focusedField as DropdownKey | null}
                    onFocusControl={toggleDrop}
                    label={null}
                    openDrop={openDrop}
                    options={LOCATION_STYLES}
                    selected={formData.locationStyles}
                    setOpenDrop={setOpenDrop}
                    error={fieldErrors.locationStyles}
                    onToggle={(locationStyle) => {
                      setFormData((prev) => ({
                        ...prev,
                        locationStyles: toggleStringItem(prev.locationStyles, locationStyle),
                      }));
                      setFieldErrors((prev) => ({ ...prev, locationStyles: undefined }));
                    }}
                  />
                  <View style={styles.locationFollowupStack}>
                    <View style={styles.preferredMeetupBlock}>
                      <View collapsable={false} ref={setFieldRef("preferredMeetupArea")}>
                        <View style={[styles.locationFieldRow, styles.compactFieldFrame, focusedField === "preferredMeetupArea" ? styles.fieldFocused : null, fieldErrors.preferredMeetupArea ? styles.fieldError : null]}>
                          <NativeLocationPinButton
                            onError={(message) => setFieldErrors((prev) => ({ ...prev, preferredMeetupArea: message }))}
                            onResolved={applyCurrentPreferredMeetupArea}
                            retainedCoordinates={Number.isFinite(profile?.latitude) && Number.isFinite(profile?.longitude)
                              ? { lat: Number(profile?.latitude), lng: Number(profile?.longitude) }
                              : null}
                            style={styles.locationFieldPin}
                          />
                          <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                            onBlur={() => {
                              focusedFieldRef.current = null;
                              setFocusedField(null);
                              setTimeout(() => setPreferredMeetupSuggestionsOpen(false), 140);
                            }}
                            onChangeText={(value) => {
                              updatePreferredMeetupQuery(value);
                            }}
                            onFocus={() => {
                              focusField("preferredMeetupArea");
                              setPreferredMeetupSuggestionsOpen(true);
                            }}
                            onPressIn={() => {
                              focusField("preferredMeetupArea");
                              setPreferredMeetupSuggestionsOpen(true);
                            }}
                            placeholder="Preferred Area"
                            placeholderTextColor={huddleColors.mutedText}
                            returnKeyType="search"
                            style={styles.locationFieldInput}
                            value={preferredMeetupQuery}
                          />
                        </View>
                      </View>
                      {formData.preferredMeetupAreas.length > 0 ? (
                        <View style={styles.chipWrap}>
                          {formData.preferredMeetupAreas.map((area) => (
                            <Pressable
                              accessibilityRole="button"
                              key={`${area.label}:${area.country}`}
                              onPress={() => removePreferredMeetupArea(area.label, area.country)}
                              style={styles.chip}
                            >
                              <Text ellipsizeMode="tail" numberOfLines={1} style={styles.chipText}>{area.label}</Text>
                              <Feather color={huddleColors.iconMuted} name="x" size={14} />
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                      {preferredMeetupLoading ? <NativeSpinner tone="muted" style={styles.locationSpinner} /> : null}
                      {preferredMeetupSuggestionsOpen && preferredMeetupSuggestions.length > 0 ? (
                        <View style={styles.suggestionMenu}>
                          {preferredMeetupSuggestions.map((item) => (
                            <Pressable
                              accessibilityRole="button"
                              key={`${item.label}:${item.lat}:${item.lng}`}
                              onPress={() => {
                                const selectedLocation = item.district || item.label;
                                addPreferredMeetupArea({
                                  country: item.country,
                                  label: selectedLocation,
                                  lat: Number.isFinite(item.lat) && item.lat !== 0 ? item.lat : null,
                                  lng: Number.isFinite(item.lng) && item.lng !== 0 ? item.lng : null,
                                });
                              }}
                              style={({ pressed }) => [styles.suggestionRow, pressed ? styles.pressed : null]}
                            >
                              <Text ellipsizeMode="tail" numberOfLines={1} style={styles.suggestionPrimary}>{item.district || item.label}</Text>
                              {item.label ? <Text numberOfLines={1} style={styles.suggestionText}>{item.label}</Text> : null}
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                      {fieldErrors.preferredMeetupArea ? <Text style={styles.errorText}>{fieldErrors.preferredMeetupArea}</Text> : null}
                    </View>
                  </View>
                </View>
                </View>
                </NativeCollapsibleSection>

                <View style={styles.fieldGroup}>
                  <Text style={styles.sectionTitle}>Publish Checklist</Text>
                  <View style={styles.groupStack}>
                  <View ref={setFieldRef("agreement")}>
                    <Pressable onPress={openAgreementSheet} style={[styles.agreementRow, fieldErrors.agreement ? styles.fieldError : null]}>
                      <View style={[styles.checkbox, formData.agreementAccepted ? styles.checkboxActive : null]}>
                        {formData.agreementAccepted ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}
                      </View>
                      <Text style={styles.agreementText}>
                        I have read and agree to the{" "}
                        <Text onPress={() => onNavigate("/service-provider-agreement")} style={styles.linkText}>Care Service Carer Agreement</Text>.
                      </Text>
                    </Pressable>
                  </View>
                  <View style={[styles.listingRow, fieldErrors.listing || (needsPayoutWallet && fieldErrors.wallet && walletState !== "connected") ? styles.fieldError : null]}>
                    <View style={styles.listingTopRow}>
                      <Text style={styles.listingText}>List on Care Service</Text>
                      <NeuToggle
                        value={formData.listed && formData.stripePayoutsEnabled}
                        onChange={(value) => {
                          if (!value) {
                            haptic.toggleControl();
                            setFormData((prev) => ({ ...prev, listed: false }));
                            return;
                          }
                          if (needsPayoutWallet && !formData.stripePayoutsEnabled) {
                            haptic.warning();
                            setListingAttempted(true);
                            setFormData((prev) => ({ ...prev, listed: false }));
                            setFieldErrors((prev) => ({ ...prev, wallet: "Set up wallet before providing care.", listing: undefined }));
                            scrollFieldIntoView("wallet", { targetRatio: 0.42 });
                            return;
                          }
                          haptic.toggleControl();
                          setFieldErrors((prev) => ({ ...prev, wallet: undefined }));
                          setFormData((prev) => ({ ...prev, listed: true }));
                        }}
                      />
                    </View>
                    {needsPayoutWallet && (listingAttempted || formData.listed || walletState === "connected") ? (
                      <View ref={setFieldRef("wallet")} style={[styles.publishCard, fieldErrors.wallet && walletState !== "connected" ? styles.fieldError : null]}>
                        {walletState === "connected" ? (
                          <Pressable disabled style={[styles.walletButton, styles.walletButtonConnected]}>
                            <Feather color={huddleColors.onPrimary} name="check" size={18} />
                            <Text style={styles.walletButtonConnectedText}>Wallet Connected</Text>
                          </Pressable>
                        ) : walletState === "review" ? (
                          <View style={styles.walletRow}>
                            <View style={styles.walletStatusRow}>
                              <NativeSpinner tone="muted" />
                              <Text style={styles.walletText}>Wallet under review</Text>
                            </View>
                            <Pressable onPress={() => void refreshWallet()} style={styles.walletButton}>
                              <Text style={styles.walletButtonText}>Refresh</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable onPress={() => void startWallet()} style={styles.primaryButton}>
                            <Text style={styles.primaryButtonText}>{walletStarting ? "Preparing..." : "Manage Payout Wallet"}</Text>
                          </Pressable>
                        )}
                      </View>
                    ) : null}
                  </View>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {careShareData ? (
          <NativeShareCardModal data={careShareData} visible={shareCardOpen} onClose={() => setShareCardOpen(false)} />
        ) : null}

        {mode === "edit" ? (
          <Animated.View style={[styles.stickyFooter, { paddingBottom: insets.bottom + huddleSpacing.x3 }, saveShakeStyle]}>
            <SlideToConfirm
              busy={saving}
              label="Slide to Complete"
              onCommit={completeProfile}
              resetKey={sliderResetKey}
            />
          </Animated.View>
        ) : null}

        <Modal
          animationType="fade"
          onRequestClose={() => setAgreementSheetVisible(false)}
          transparent
          visible={agreementSheetVisible}
        >
          <View style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]}>
            <Pressable accessibilityLabel="Close agreement" onPress={() => setAgreementSheetVisible(false)} style={StyleSheet.absoluteFill} />
            <View
              {...agreementSheetPanResponder.panHandlers}
              style={styles.agreementModalBoundary}
            >
              <View style={styles.agreementModalCard}>
                <View style={styles.agreementModalHeader}>
                  <Text style={styles.sheetTitle}>Care Service Carer Agreement</Text>
                  <Pressable accessibilityLabel="Close" onPress={() => setAgreementSheetVisible(false)} style={styles.iconCircle}>
                    <Feather color={huddleColors.iconMuted} name="x" size={18} />
                  </Pressable>
                </View>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  onContentSizeChange={(_width, height) => {
                    if (height <= 520) setAgreementScrolled(true);
                  }}
                  onScroll={(event) => {
                    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
                    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - huddleSpacing.x3) {
                      setAgreementScrolled(true);
                    }
                  }}
                  scrollEventThrottle={16}
                  style={styles.agreementSheetScroll}
                  contentContainerStyle={styles.agreementSheetContent}
                >
                  {serviceAgreementPage ? (
                    <>
                      {serviceAgreementPage.intro.map((paragraph, index) => (
                        <NativeLegalText key={`intro-${index}`} style={styles.agreementSheetText}>{paragraph}</NativeLegalText>
                      ))}
                      {serviceAgreementPage.sections.map((section) => (
                        <View key={section.title} style={styles.agreementLegalSection}>
                          <Text style={styles.agreementLegalTitle}>{section.title}</Text>
                          {section.body.map((paragraph, index) => (
                            <NativeLegalText key={`${section.title}-${index}`} style={styles.agreementSheetText}>{paragraph}</NativeLegalText>
                          ))}
                          {section.bullets?.map((bullet, index) => (
                            <View key={`${section.title}-bullet-${index}`} style={styles.agreementBulletRow}>
                              <Text style={styles.agreementBulletDot}>•</Text>
                              <NativeLegalText style={styles.agreementBulletText}>{bullet}</NativeLegalText>
                            </View>
                          ))}
                          {section.bullets?.map((bullet, index) => (
                            <View key={`${section.title}-bullet-${index}`} style={styles.agreementBulletRow}>
                              <Text style={styles.agreementBulletDot}>•</Text>
                              <Text style={styles.agreementBulletText}>{bullet}</Text>
                            </View>
                          ))}
                        </View>
                      ))}
                      <Text style={styles.locationHelper}>Updated: {serviceAgreementPage.effectiveDate}</Text>
                    </>
                  ) : null}
                </ScrollView>
                <View style={styles.agreementModalFooter}>
                <Pressable
                  onPress={acceptAgreementFromSheet}
                  style={styles.agreementConfirmRow}
                >
                  <View style={[styles.checkbox, formData.agreementAccepted ? styles.checkboxActive : null]}>
                    {formData.agreementAccepted ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}
                  </View>
                  <Text style={styles.agreementText}>I have read and agree to the Care Service Carer Agreement.</Text>
                </Pressable>
                </View>
              </View>
            </View>
          </View>
        </Modal>

        <NativeStripeConnectOnboarding
          accessToken={effectiveAccessToken}
          visible={walletOnboardingVisible}
          onReadyStateChange={setWalletStarting}
          onExit={() => {
            setWalletOnboardingVisible(false);
            void refreshWallet();
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MultiSelectControl({
  compact = false,
  dropKey,
  label,
  openDrop,
  options,
  placeholder = "Select",
  selected,
  setOpenDrop,
  onToggle,
  fieldRef,
  focusedDrop,
  onFocusControl,
  error,
}: {
  compact?: boolean;
  dropKey: DropdownKey;
  label: string | null;
  openDrop: DropdownKey | null;
  options: readonly string[];
  placeholder?: string;
  selected: string[];
  setOpenDrop: (key: DropdownKey | null) => void;
  onToggle: (value: string) => void;
  fieldRef?: (node: View | null) => void;
  focusedDrop?: DropdownKey | null;
  onFocusControl?: (dropKey: DropdownKey) => void;
  error?: string;
}) {
  return (
    <View ref={fieldRef} style={styles.controlGroup}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <Pressable
        onPress={() => {
          if (onFocusControl) onFocusControl(dropKey);
          else {
            Keyboard.dismiss();
            setOpenDrop(openDrop === dropKey ? null : dropKey);
          }
        }}
        style={[styles.selectButton, compact ? styles.compactSelectButton : null, openDrop === dropKey || focusedDrop === dropKey ? styles.fieldFocused : null, error ? styles.fieldError : null]}
      >
        <Text numberOfLines={1} style={[styles.selectButtonText, selected.length === 0 ? styles.placeholder : null]}>{selected.length ? selected.join(", ") : placeholder}</Text>
        <Feather color={huddleColors.iconMuted} name={openDrop === dropKey ? "chevron-up" : "chevron-down"} size={16} />
      </Pressable>
      {openDrop === dropKey ? <SelectList options={options} selected={selected} onToggle={onToggle} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function MultiSelectSection(props: Omit<Parameters<typeof MultiSelectControl>[0], "label"> & { title: string; error?: string }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.sectionTitle}>{props.title}</Text>
      <MultiSelectControl {...props} label={null} />
    </View>
  );
}

function PetTypeMultiSelectSection({
  dropKey,
  error,
  fieldRef,
  focusedDrop,
  onFocusControl,
  onToggle,
  openDrop,
  selected,
  setOpenDrop,
}: Omit<Parameters<typeof MultiSelectControl>[0], "compact" | "label" | "options" | "placeholder">) {
  const selectedIcons = selected.map((option) => nativePetEmojiForLabel(option)).filter((icon): icon is string => Boolean(icon));
  return (
    <View ref={fieldRef} style={styles.fieldGroup}>
      <Text style={styles.sectionTitle}>Pet Types</Text>
      <NativeFormChoiceField error={error} focused={openDrop === dropKey || focusedDrop === dropKey} label="">
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (onFocusControl) onFocusControl(dropKey);
            else {
              Keyboard.dismiss();
              setOpenDrop(openDrop === dropKey ? null : dropKey);
            }
          }}
          style={styles.petTypeSelectTrigger}
        >
          <View style={styles.petTypeSelectValueRow}>
            {selectedIcons.length > 0 ? <Text style={styles.petTypeEmoji}>{selectedIcons.join(" ")}</Text> : null}
            <Text numberOfLines={1} style={[styles.petTypeSelectValue, selected.length === 0 ? styles.placeholder : null]}>
              {selected.length > 0 ? selected.join(", ") : "Pet type"}
            </Text>
          </View>
          <Feather color={huddleColors.mutedText} name={openDrop === dropKey ? "chevron-up" : "chevron-down"} size={18} />
        </Pressable>
      </NativeFormChoiceField>
      {openDrop === dropKey ? <SelectList optionIcon={nativePetEmojiForLabel} options={PET_TYPES} selected={selected} onToggle={onToggle} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: huddleColors.glassChrome,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x4,
    padding: huddleSpacing.x5,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x3,
    paddingBottom: huddleSpacing.x3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: huddleColors.divider,
    backgroundColor: huddleColors.canvas,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: huddleRadii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.nativeHeaderTitle,
    lineHeight: huddleType.nativeHeaderTitleLine,
    color: huddleColors.text,
  },
  headerSubtitle: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
  },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: huddleColors.divider,
    paddingHorizontal: huddleSpacing.x4,
  },
  tab: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: huddleColors.tabActive,
  },
  tabText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.body,
    color: huddleColors.mutedText,
  },
  tabTextActive: {
    color: huddleColors.text,
  },
  scrollContent: {
    padding: huddleSpacing.x4,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  contentScroller: {
    backgroundColor: huddleColors.canvas,
  },
  // Stationed at the top-right corner of the card in view mode; frosted recipe
  // matches the bottom nav (NativeGlassSurface), not a solid white circle.
  shareCardButton: {
    position: "absolute",
    top: huddleSpacing.x5,
    right: huddleSpacing.x5,
    zIndex: 20,
    ...huddleShadows.glassElevation1,
  },
  shareCardGlass: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
  },
  form: {
    gap: huddleSpacing.x6,
  },
  contactFieldGroup: {
    gap: huddleSpacing.x2,
  },
  helperFieldStack: {
    gap: huddleSpacing.x1,
  },
  // Every card owns one local stack so the shared collapsible-body gap cannot
  // accidentally determine the spacing between form groups.
  groupStack: {
    gap: huddleSpacing.x5,
    paddingBottom: huddleSpacing.x2,
  },
  fieldGroup: {
    gap: huddleSpacing.x2,
  },
  compactGroup: {
    gap: huddleSpacing.x2,
  },
  compositeContent: {
    gap: huddleSpacing.x1,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionCount: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    color: huddleColors.mutedText,
  },
  fieldLabel: {
    flexShrink: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  field: {
    flexShrink: 1,
    minWidth: 0,
    height: huddleLayout.fieldHeight,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    borderRadius: huddleRadii.field,
    paddingHorizontal: huddleSpacing.x4,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body + 6,
    color: huddleColors.text,
    backgroundColor: huddleColors.canvas,
    overflow: "hidden",
    ...huddleShadows.glassElevation1,
  },
  fieldFocused: {
    ...huddleFieldStates.focused,
  },
  fieldError: {
    ...huddleFieldStates.error,
  },
  locationFieldRow: {
    height: huddleLayout.fieldHeight,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    borderRadius: huddleRadii.field,
    paddingLeft: huddleSpacing.x1,
    paddingRight: huddleSpacing.x4,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  compactFieldFrame: {
    height: 48,
    minHeight: 48,
    maxHeight: 48,
  },
  locationFieldInput: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    height: huddleLayout.fieldHeight - 2,
    paddingTop: huddleSpacing.x1,
    paddingBottom: huddleSpacing.x1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body + 8,
    color: huddleColors.text,
    textAlignVertical: "center",
    overflow: "hidden",
  },
  locationFieldPin: {
    marginRight: huddleSpacing.x1,
  },
  textArea: {
    height: huddleFormFields.multilineHeight,
    maxHeight: huddleFormFields.multilineHeight,
    paddingTop: huddleSpacing.x3,
    paddingBottom: huddleSpacing.x3,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: huddleSpacing.x2,
  },
  chip: {
    minHeight: huddleFormControls.select.optionMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x1,
    paddingHorizontal: huddleSpacing.x3,
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.glassChrome,
    ...huddleShadows.glassElevation1,
  },
  chipText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    color: huddleColors.text,
  },
  selectButton: {
    height: huddleLayout.fieldHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x4,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    borderRadius: huddleRadii.field,
    backgroundColor: huddleFormFields.background,
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: huddleFormFields.shadowOpacity,
    shadowRadius: 6,
    shadowOffset: { width: huddleFormFields.shadowOffset, height: huddleFormFields.shadowOffset },
    elevation: 1,
  },
  selectButtonText: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleFormFields.valueSize,
    lineHeight: huddleFormFields.valueLine,
    color: huddleColors.text,
  },
  dropdownMenu: {
    maxHeight: huddleFormControls.select.menuMaxHeight,
    marginTop: huddleSpacing.x2,
    borderRadius: huddleFormControls.select.menuRadius,
    borderWidth: 0,
    backgroundColor: huddleColors.canvas,
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  dropdownMenuEmbedded: {
    maxHeight: 180,
    borderWidth: 0,
    borderRadius: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  countryDropdownMenu: {
    maxHeight: huddleFormControls.select.menuMaxHeight,
    borderRadius: huddleFormControls.select.menuRadius,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  dropdownContent: {
    padding: huddleFormControls.select.menuPadding,
  },
  dropdownSearchInput: {
    flexShrink: 1,
    minWidth: 0,
    height: huddleLayout.fieldHeight,
    margin: huddleFormControls.select.menuPadding,
    marginBottom: 0,
    borderRadius: huddleRadii.field,
    paddingHorizontal: huddleSpacing.x3,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    color: huddleColors.text,
    backgroundColor: huddleColors.canvas,
    overflow: "hidden",
  },
  dropdownOption: {
    minHeight: huddleFormControls.select.optionMinHeight,
    borderRadius: huddleFormControls.select.optionRadius,
    paddingHorizontal: huddleFormControls.select.optionPaddingHorizontal,
    paddingVertical: huddleFormControls.select.optionPaddingVertical,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
  },
  dropdownOptionActive: {
    backgroundColor: "transparent",
  },
  dropdownText: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: 14,
    color: huddleColors.text,
  },
  dropdownLabelRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  dropdownOptionEmoji: {
    fontSize: 17,
    lineHeight: 20,
  },
  checkSlot: {
    width: huddleFormControls.select.checkSlot,
  },
  petTypeSelectTrigger: {
    minHeight: huddleLayout.fieldHeight - 2,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  petTypeSelectValueRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  petTypeEmoji: {
    fontSize: 17,
    lineHeight: 20,
  },
  petTypeSelectValue: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body + 6,
    color: huddleColors.text,
  },
  placeholder: {
    color: huddleColors.mutedText,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: huddleRadii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rateSummary: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    padding: huddleSpacing.x3,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    backgroundColor: huddleColors.canvas,
  },
  rateSummaryCentered: {
    justifyContent: "center",
  },
  rateAddDetails: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
  },
  rateTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    color: huddleColors.text,
  },
  rateMeta: {
    marginTop: huddleSpacing.x1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    color: huddleColors.mutedText,
  },
  rateEditor: {
    gap: huddleSpacing.x3,
    padding: huddleSpacing.x4,
    borderRadius: huddleRadii.card,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.glassOverlay,
    ...huddleShadows.glassElevation1,
  },
  careTypeToggleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: huddleSpacing.x2,
  },
  careTypeColumn: {
    flex: 1,
    minWidth: 0,
    gap: huddleSpacing.x2,
  },
  voluntaryColumn: {
    width: 84,
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x2,
  },
  voluntaryToggleBox: {
    height: huddleLayout.fieldHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  rateInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  rateSelect: {
    height: huddleLayout.fieldHeight,
    minWidth: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.canvas,
  },
  rateSelectWide: {
    height: huddleLayout.fieldHeight,
    minWidth: 92,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.canvas,
  },
  rateSelectText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    color: huddleColors.mutedText,
  },
  ratePriceInput: {
    flex: 1,
    minWidth: 0,
    ...huddleShadows.glassElevation1,
  },
  rateCompositeField: {
    height: huddleLayout.fieldHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x3,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    borderRadius: huddleRadii.field,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  rateCompositeCurrency: {
    minWidth: 54,
    height: huddleLayout.fieldHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  rateCompositeInput: {
    flexShrink: 1,
    minWidth: 0,
    height: huddleLayout.fieldHeight,
    paddingHorizontal: huddleSpacing.x2,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    color: huddleColors.text,
    overflow: "hidden",
  },
  rateCompositeUnit: {
    minWidth: 98,
    height: huddleLayout.fieldHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  actionRow: {
    flexDirection: "row",
    gap: huddleSpacing.x2,
  },
  smallPrimaryButton: {
    flex: 1,
    ...huddleButtons.base,
    ...huddleButtons.primary,
  },
  smallPrimaryText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  smallSecondaryButton: {
    flex: 1,
    ...huddleButtons.base,
    ...huddleButtons.secondary,
  },
  smallSecondaryText: {
    ...huddleButtons.label,
    color: huddleColors.text,
  },
  controlGroup: {
    gap: huddleSpacing.x2,
  },
  credentialStack: {
    gap: huddleSpacing.x3,
  },
  toggleRow: {
    minHeight: huddleLayout.fieldHeight,
    flexDirection: "row",
    gap: huddleSpacing.x2,
  },
  switchSettingRow: {
    minHeight: huddleLayout.fieldHeight,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x3,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.glassChrome,
    ...huddleShadows.glassElevation1,
  },
  availabilityColumns: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x2,
  },
  availabilityColumn: {
    flex: 1,
    minWidth: 0,
    gap: huddleSpacing.x2,
  },
  availabilityColumnCompact: {
    flex: 0.9,
  },
  availabilityColumnWide: {
    flex: 1.1,
  },
  compactFieldStack: {
    gap: huddleSpacing.x2,
  },
  availabilityTimeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x2,
  },
  compactSelectButton: {
    height: 48,
    minHeight: 48,
  },
  compactSwitchSettingRow: {
    minHeight: 48,
    height: 48,
  },
  noticeCompactRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  noticeCompactRowSplit: {
    justifyContent: "space-between",
  },
  noticeToggleWrap: {
    minHeight: huddleLayout.fieldHeight,
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x1,
    paddingHorizontal: huddleSpacing.x3,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.glassChrome,
    ...huddleShadows.glassElevation1,
  },
  compactNoticeControl: {
    minHeight: 48,
    height: 48,
  },
  noticeToggleLabel: {
    flex: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  noticeCompactInput: {
    minWidth: 0,
    height: huddleLayout.fieldHeight,
    paddingHorizontal: huddleSpacing.x3,
  },
  noticeUnitSelectWrap: {
    width: 86,
  },
  noticeCompositeField: {
    minWidth: 0,
    height: huddleLayout.fieldHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
    paddingHorizontal: 0,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    borderRadius: huddleRadii.field,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  noticeValueWrap: {
    width: 34,
  },
  noticeCompositeInput: {
    flexShrink: 1,
    minWidth: 0,
    height: huddleLayout.fieldHeight,
    paddingLeft: huddleSpacing.x3,
    paddingRight: 0,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    color: huddleColors.text,
    overflow: "hidden",
  },
  noticeCompositeUnit: {
    flex: 1,
    minWidth: 92,
    height: huddleLayout.fieldHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x1,
    paddingLeft: 0,
    paddingRight: huddleSpacing.x3,
  },
  noticeUnitText: {
    flex: 1,
    minWidth: 0,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    color: huddleColors.mutedText,
  },
  noticeInputColumn: {
    width: 150,
    minWidth: 0,
    gap: huddleSpacing.x2,
  },
  noticeDropdownWrap: {
    width: "100%",
  },
  noticeUnitSelect: {
    height: huddleLayout.fieldHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x1,
    paddingHorizontal: huddleSpacing.x2,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.canvas,
  },
  walletRow: {
    minHeight: 48,
    alignItems: "stretch",
    gap: huddleSpacing.x2,
  },
  walletStatusRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  publishCard: {
    gap: huddleSpacing.x2,
    padding: 0,
    borderRadius: huddleRadii.field,
  },
  walletText: {
    flex: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    color: huddleColors.text,
  },
  walletButton: {
    width: "100%",
    ...huddleButtons.base,
    ...huddleButtons.ghost,
  },
  walletButtonConnected: {
    flexDirection: "row",
    gap: huddleSpacing.x2,
    borderColor: huddleColors.success,
    backgroundColor: huddleColors.success,
  },
  walletButtonMuted: {
    opacity: 0.62,
  },
  walletButtonText: {
    ...huddleButtons.label,
    color: huddleColors.blue,
  },
  walletButtonConnectedText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  primaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
  },
  primaryButtonText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  helperText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
    textAlign: "left",
  },
  expiredCredentialHelper: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.blue,
    textAlign: "left",
  },
  agreementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    padding: huddleSpacing.x3,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.glassChrome,
    ...huddleShadows.glassElevation1,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: huddleColors.blue,
    borderColor: huddleColors.blue,
  },
  agreementText: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  linkText: {
    color: huddleColors.blue,
    textDecorationLine: "underline",
  },
  legalLinkRow: {
    alignSelf: "flex-start",
    paddingTop: huddleSpacing.x2,
  },
  listingRow: {
    minHeight: 56,
    gap: huddleSpacing.x3,
    borderRadius: huddleRadii.field,
    paddingVertical: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x4,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.glassChrome,
    ...huddleShadows.glassElevation1,
  },
  listingTopRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x3,
  },
  listingText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    color: huddleColors.text,
  },
  qualificationReadCard: {
    gap: huddleSpacing.x1,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  qualificationPreviewRow: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  qualificationPreviewLabel: {
    width: 132,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  qualificationPreviewValue: {
    flex: 1,
    minWidth: 0,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
  },
  qualificationHeaderRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
  },
  qualificationTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  credentialEditBadge: {
    minHeight: 26,
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x2,
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
  },
  credentialEditBadgeVerified: {
    backgroundColor: huddleColors.successSoft,
    borderColor: huddleColors.success,
  },
  credentialEditBadgeSelfDeclared: {
    backgroundColor: huddleColors.mutedCanvas,
    borderColor: huddleColors.fieldBorderSoft,
  },
  credentialEditBadgeText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  credentialEditBadgeTextVerified: {
    color: huddleColors.success,
  },
  credentialEditBadgeTextSelfDeclared: {
    color: huddleColors.mutedText,
  },
  qualificationActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x1,
  },
  dateField: {
    height: huddleLayout.fieldHeight,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.canvas,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
  },
  dateFieldInput: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    height: huddleLayout.fieldHeight,
    paddingHorizontal: huddleSpacing.x4,
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    overflow: "hidden",
  },
  dateIconButton: {
    width: 40,
    height: huddleLayout.fieldHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  inlinePopover: {
    overflow: "hidden",
    borderRadius: huddleFormControls.select.menuRadius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: huddleFormControls.select.menuBorderColor,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  inlineDateColumns: {
    flexDirection: "row",
    gap: huddleFormControls.datePicker.columnGap,
    padding: huddleFormControls.datePicker.columnPadding,
  },
  inlineDateColumn: {
    flex: 1,
    maxHeight: huddleFormControls.datePicker.columnMaxHeight,
    borderRadius: huddleFormControls.datePicker.columnRadius,
    backgroundColor: huddleColors.mutedCanvas,
  },
  inlineDateOption: {
    minHeight: huddleFormControls.datePicker.optionMinHeight,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleFormControls.datePicker.optionRadius,
  },
  inlineDateOptionActive: {
    backgroundColor: huddleColors.blue,
  },
  inlineDateOptionText: {
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
  },
  inlineDateOptionTextActive: {
    color: huddleColors.onPrimary,
  },
  stickyFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: huddleColors.divider,
    paddingTop: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x4,
    backgroundColor: huddleColors.glassChrome,
    ...huddleShadows.glassHeader,
  },
  sheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x3,
  },
  sheetTitle: {
    flex: 1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h3,
    lineHeight: huddleType.h3 + 4,
    color: huddleColors.text,
  },
  agreementModalBoundary: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "82%",
  },
  agreementModalCard: {
    overflow: "hidden",
    maxHeight: "100%",
    borderRadius: huddleRadii.modal,
    borderBottomLeftRadius: huddleRadii.modal,
    borderBottomRightRadius: huddleRadii.modal,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation2,
  },
  agreementModalHeader: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: huddleColors.divider,
  },
  agreementSheetScroll: {
    flexGrow: 0,
    maxHeight: "100%",
  },
  agreementSheetContent: {
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x4,
  },
  agreementModalFooter: {
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: huddleColors.divider,
    backgroundColor: huddleColors.canvas,
  },
  agreementSheetText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body + 7,
    color: huddleColors.text,
  },
  agreementLegalSection: {
    gap: huddleSpacing.x2,
  },
  agreementLegalTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  agreementBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x2,
  },
  agreementBulletDot: {
    width: 12,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    lineHeight: huddleType.body + 7,
    color: huddleColors.blue,
  },
  agreementBulletText: {
    flex: 1,
    minWidth: 0,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body + 7,
    color: huddleColors.text,
  },
  agreementConfirmRow: {
    minHeight: huddleLayout.fieldHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x3,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.glassChrome,
    ...huddleShadows.glassElevation1,
  },
  switchTrack: {
    ...huddleGlassControls.toggleSurface,
    width: 50,
    height: 28,
    flexShrink: 0,
    borderRadius: huddleRadii.pill,
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  switchTrackActive: {
    backgroundColor: huddleColors.blue,
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.canvas,
  },
  switchThumbActive: {
    transform: [{ translateX: 22 }],
  },
  errorText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    letterSpacing: 0,
    color: huddleColors.validationRed,
  },
  locationHelper: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
  },
  preferredMeetupBlock: {
    gap: huddleSpacing.x1,
  },
  locationFollowupStack: {
    gap: huddleSpacing.x2,
  },
  locationSpinner: {
    alignSelf: "flex-start",
  },
  suggestionMenu: {
    marginTop: huddleSpacing.x2,
    overflow: "hidden",
    borderRadius: huddleRadii.card,
    borderWidth: 1,
    borderColor: huddleColors.cardBorderSoft,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  suggestionRow: {
    minHeight: 48,
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: huddleSpacing.x3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: huddleColors.divider,
  },
  suggestionPrimary: {
    flexShrink: 1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  suggestionText: {
    flexShrink: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.mutedText,
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.55,
  },
});
