import { Feather } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Keyboard,
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
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeCarerProfileContent } from "../components/service/NativeCarerProfileContent";
import { NativeStripeConnectOnboarding } from "../components/wallet/NativeStripeConnectOnboarding";
import {
  SlideToConfirm,
} from "../components/nativeModalPrimitives";
import { nativeModalStyles } from "../components/nativeModalPrimitives.styles";
import { nativeCountryOptions } from "../components/profile/NativeProfileForm";
import { getNativeLegalPage } from "../content/nativeLegalPages";
import { createNativeFunctionHeaders } from "../lib/nativeFunctionClient";
import { createSingleRealtimeChannel } from "../lib/realtimeChannelManager";
import {
  ALL_SKILLS,
  CURRENCIES,
  DAYS,
  deriveWalletState,
  DOG_SIZES,
  EMPTY_PROFESSIONAL_CREDENTIAL,
  EMPTY_CARER_PROFILE,
  hasSubmittedProfessionalCredential,
  isAge18PlusFromDob,
  isProfessionalCredentialComplete,
  LOCATION_STYLES,
  makeCarerViewData,
  mapCarerRowToForm,
  MAX_SKILLS,
  PET_TYPES,
  PET_TYPES_REQUIRING_SIZE,
  PROFESSIONAL_TYPES,
  RATE_OPTIONS,
  resolveSocialAlbumUrlList,
  SERVICES_OFFERED,
  toggleStringItem,
  buildCarerUpsertPayload,
  computeCarerCompleted,
  fetchPublicProviderCredentialBadges,
  type NativeCarerProfileData,
  type NativeProfessionalCredential,
  type NativePublicCredentialBadge,
  type NativeRateRow,
} from "../lib/nativeCarerProfile";
import {
  fetchNativeProfileSummary,
  readCachedNativeProfileSummary,
  subscribeNativeProfileSummary,
  type NativeProfileSummary,
} from "../lib/nativeProfileSummary";
import { isNativeVerifiedProfile } from "../lib/nativeVerificationGate";
import { haptic } from "../lib/nativeHaptics";
import { useShakeAnimation } from "../lib/nativeAnimations";
import { supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import {
  fetchNativeLocationSuggestions,
  type NativeLocationSuggestion,
} from "../lib/nativeLocation";
import {
  huddleButtons,
  huddleColors,
  huddleFieldStates,
  huddleFormControls,
  huddleLayout,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";

type NativeCarerProfileScreenProps = {
  accessToken?: string | null;
  initialSession?: Session | null;
  session?: Session | null;
  userId: string | null;
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
  | "areaName"
  | "professional"
  | "professionalCredentials"
  | "wallet"
  | "agreement";

type FieldErrors = Partial<Record<FocusField | "time" | "rate" | "careScope" | "petSize" | "listing", string>>;

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

const readNativeCarerProfileCache = (userId: string): Record<string, unknown> | null | undefined => {
  const cached = carerProfileCache.get(userId);
  if (!cached) return undefined;
  if (Date.now() - cached.cachedAt > CARER_PROFILE_CACHE_TTL_MS) {
    carerProfileCache.delete(userId);
    return undefined;
  }
  return cached.row;
};

const writeNativeCarerProfileCache = (userId: string, row: Record<string, unknown> | null) => {
  carerProfileCache.set(userId, { row, cachedAt: Date.now() });
  return row;
};

const cleanAccessToken = (value: string | null | undefined) => {
  const token = String(value || "").trim();
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

async function fetchNativeCarerProfileRow(userId: string, accessToken: string | null | undefined, options: { force?: boolean } = {}): Promise<Record<string, unknown> | null> {
  const token = cleanAccessToken(accessToken);
  const cached = readNativeCarerProfileCache(userId);
  if (!options.force && cached !== undefined) return cached;

  const existing = carerProfileInFlight.get(userId);
  if (!options.force && existing) return existing;

  const request = (async () => {
    const response = await fetch(`${supabaseUrl}/rest/v1/pet_care_profiles?select=${encodeURIComponent(providerColumns)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        Accept: "application/json",
      },
    });
    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok) throw new Error(getNativeCarerRestError(body, "Unable to load care profile."));
    const data = Array.isArray(body) ? body[0] : null;
    return writeNativeCarerProfileCache(userId, data ? (data as unknown as Record<string, unknown>) : null);
  })();

  carerProfileInFlight.set(userId, request);
  try {
    return await request;
  } finally {
    carerProfileInFlight.delete(userId);
  }
}

async function nativeCredentialRpc<T>(fn: string, params: Record<string, unknown>, accessToken: string | null | undefined): Promise<T> {
  const token = cleanAccessToken(accessToken);
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      "content-type": "application/json",
      Accept: "application/json",
    },
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

const providerColumns = [
  "id",
  "user_id",
  "story",
  "skills",
  "proof_metadata",
  "vet_license_found",
  "days",
  "time_blocks",
  "other_time_from",
  "other_time_to",
  "emergency_readiness",
  "min_notice_value",
  "min_notice_unit",
  "location_styles",
  "area_name",
  "services_offered",
  "services_other",
  "pet_types",
  "pet_types_other",
  "dog_sizes",
  "currency",
  "starting_price",
  "rates",
  "agreement_accepted",
  "agreement_accepted_at",
  "listed",
  "stripe_account_id",
  "stripe_details_submitted",
  "stripe_payouts_enabled",
  "stripe_payout_status",
  "stripe_requirements_currently_due",
].join(",");

const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hours = Math.floor(index / 2);
  const minutes = index % 2 === 0 ? "00" : "30";
  return `${String(hours).padStart(2, "0")}:${minutes}`;
});

const LICENSED_MEDICAL_CARE_ERROR = "Add a professional credential before offering Licensed Medical Care.";
const UNSUPPORTED_CREDENTIAL_COPY = "Self-declared · Not verified by huddle.";
const UNABLE_TO_VERIFY_COPY = "Unable to verify online. Please check credentials before booking.";

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
  servicesOffered: [],
  petTypes: [],
  dogSizes: [],
  stripeRequirementsCurrentlyDue: [],
  rateRows: [{ price: "", rate: "", services: [], voluntary: false }],
});

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
  if (!isIsoDate(credential.expiry_date) || isPastDate(credential.expiry_date)) return "Expiry date cannot be in the past.";
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
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
  disabledOptions?: Set<string>;
  closeOnSelect?: boolean;
  embedded?: boolean;
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
            <Text style={styles.dropdownText}>{option}</Text>
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

export function NativeCarerProfileScreen({ accessToken, initialSession, session, userId, onNavigate, onGoBack }: NativeCarerProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<NativeProfileSummary | null>(null);
  const [formData, setFormData] = useState<NativeCarerProfileData>(cloneEmpty);
  const [mode, setMode] = useState<"edit" | "view">("view");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveShakeAnim, triggerSaveShake] = useShakeAnimation();
  const [loadError, setLoadError] = useState("");
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
  const [publicCredentialBadges, setPublicCredentialBadges] = useState<NativePublicCredentialBadge[]>([]);
  const [countrySearch, setCountrySearch] = useState("");
  const [focusedField, setFocusedField] = useState<FocusField | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [locationSuggestions, setLocationSuggestions] = useState<NativeLocationSuggestion[]>([]);
  const [locationSuggestionsOpen, setLocationSuggestionsOpen] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const editScrollRef = useRef<ScrollView | null>(null);
  const scrollYRef = useRef(0);
  const scrollViewportHeightRef = useRef(0);
  const fieldRefs = useRef<Record<string, View | null>>({});
  const focusedFieldRef = useRef<FocusField | null>(null);
  const effectiveAccessToken = useMemo(
    () => String(accessToken || initialSession?.access_token || session?.access_token || "").trim() || null,
    [accessToken, initialSession?.access_token, session?.access_token],
  );

  const isAge18Plus = isAge18PlusFromDob(profile?.dob);
  const isVerified = isNativeVerifiedProfile(profile);
  const providerEligible = isAge18Plus && isVerified;
  const walletState = deriveWalletState(formData);
  const shouldShowAreaSearch = formData.locationStyles.includes("Carer's Place") || formData.locationStyles.includes("Outdoor");
  const areaPlaceholder = formData.locationStyles.includes("Outdoor") ? "District / Area (optional)" : "District / Area";
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
    if (!userId) {
      setLoadError("Profile is unavailable.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      const cached = await readCachedNativeProfileSummary(userId);
      if (cached?.profile) setProfile(cached.profile);

      const [profileSnapshot, carerRow] = await Promise.all([
        fetchNativeProfileSummary(userId, { force: false, accessToken: effectiveAccessToken }),
        fetchNativeCarerProfileRow(userId, effectiveAccessToken, { force: true }),
      ]);
      const nextProfile = profileSnapshot.profile;
      setProfile(nextProfile);

      const nextForm = carerRow ? mapCarerRowToForm(carerRow) : cloneEmpty();
      setFormData(nextForm);
      setMode(carerRow ? "view" : "edit");
      const albumRaw = Array.isArray(nextProfile?.social_album) ? (nextProfile?.social_album as string[]) : [];
      const albumUrls = await resolveSocialAlbumUrlList(albumRaw);
      setSocialAlbumUrls(albumUrls);
      const [ownerCredentials, badges] = await Promise.all([
        nativeCredentialRpc<unknown>("get_my_professional_credentials", {}, effectiveAccessToken).catch(() => []),
        fetchPublicProviderCredentialBadges(userId, { force: true }).catch(() => []),
      ]);
      setSubmittedCredentials(normalizeSubmittedCredentials(ownerCredentials));
      setPublicCredentialBadges(badges);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load care profile.");
    } finally {
      setLoading(false);
    }
  }, [effectiveAccessToken, userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!userId) return;
    return subscribeNativeProfileSummary(userId, ({ profile: nextProfile }) => {
      setProfile(nextProfile);
      const albumRaw = Array.isArray(nextProfile?.social_album) ? (nextProfile?.social_album as string[]) : [];
      void resolveSocialAlbumUrlList(albumRaw).then(setSocialAlbumUrls);
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const channelName = `native_pet_care_profiles_wallet:${userId}`;
    const handle = createSingleRealtimeChannel(channelName, (channel) =>
      channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pet_care_profiles", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          writeNativeCarerProfileCache(userId, row);
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
  }, [userId]);

  const viewData = useMemo(
    () => ({
      ...makeCarerViewData(userId || "", formData, profile as Record<string, unknown> | null, socialAlbumUrls),
      publicCredentialBadges,
    }),
    [formData, profile, publicCredentialBadges, socialAlbumUrls, userId],
  );

  const updateEmergencyReadiness = (emergencyReadiness: boolean) => {
    haptic.toggleControl(); // F4: tactile feedback on carer toggle
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
      mark("rateServices", "Care Scope is required.", "careScope");
    }
    const licensedMedicalSelected = data.rateRows.some((row) => row.services.includes("Licensed Medical Care"));
    if (licensedMedicalSelected && !hasSubmittedProfessionalCredential(data.professional)) {
      mark("rateServices", LICENSED_MEDICAL_CARE_ERROR, "careScope");
      mark("professional", LICENSED_MEDICAL_CARE_ERROR);
    }
    if (data.rateRows.some((row) => !row.voluntary && (!data.currency || !row.price.trim() || !row.rate))) {
      mark("price", "Rate and unit are required for paid care scope.", "rate");
    }
    if (data.petTypes.length === 0) mark("petTypes", "Pet Types are required.");
    const needsPetSize = data.petTypes.some((petType) => (PET_TYPES_REQUIRING_SIZE as readonly string[]).includes(petType));
    if (needsPetSize && data.dogSizes.length === 0) mark("dogSizes", "Pet Size is required.", "petSize");
    if (data.skills.length === 0) mark("skills", "Strengths are required.");
    if (data.days.length === 0) mark("days", "Availability is required.");
    if (!data.timeBlocks.includes("Anytime") && (!data.otherTimeFrom || !data.otherTimeTo)) {
      mark("timeFrom", "Availability From and To are required.", "time");
    }
    const notice = Number.parseInt(data.minNoticeValue, 10);
    if (data.emergencyReadiness !== true) {
      if (data.minNoticeValue.trim() === "" || Number.isNaN(notice) || notice < 0) mark("minNotice", "Notice Time is required.");
      else if (data.minNoticeUnit === "hours" && notice > 24) mark("minNotice", "Hours cannot exceed 24.");
      else if (data.minNoticeUnit === "days" && notice > 99) mark("minNotice", "Days cannot exceed 99.");
    }
    if (data.locationStyles.length === 0) mark("locationStyles", "Care Location is required.");
    if (data.professional.has_credentials) {
      if (!data.professional.credentials.some(isProfessionalCredentialComplete)) {
        mark("professionalCredentials", "Add at least one complete professional qualification.");
      }
      if (data.professional.credentials.some((credential) => credential.expiry_date.trim() && (!isIsoDate(credential.expiry_date) || isPastDate(credential.expiry_date)))) {
        mark("professionalCredentials", "Expiry date cannot be in the past.");
      }
    }
    if (data.listed || requireListing) {
      if (!isVerified) nextErrors.listing = "Complete identity verification first.";
      if (!data.stripePayoutsEnabled) mark("wallet", "Set up wallet before providing care.");
      if (!data.agreementAccepted) mark("agreement", "Accept the Care Service Carer Agreement.");
    }
    return { errors: nextErrors, firstInvalid: firstInvalid[0] ?? null };
  }, [isVerified]);

  const applyValidationErrors = useCallback((errors: FieldErrors, firstInvalid: FocusField | null) => {
    setFieldErrors(errors);
    if (firstInvalid) {
      haptic.error();
      triggerSaveShake();
      scrollFieldIntoView(firstInvalid, { targetRatio: 0.34 });
      return true;
    }
    return false;
  }, [scrollFieldIntoView, triggerSaveShake]);

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

  const saveProfile = useCallback(async (silent = false, validateBeforeSave = false) => {
    if (!userId) return false;
    if (validateBeforeSave) {
      const { errors, firstInvalid } = getValidationErrors(formData);
      if (applyValidationErrors(errors, firstInvalid)) return false;
    }
    if (!silent) setFieldErrors({});

    setSaving(!silent);
    try {
      const token = cleanAccessToken(effectiveAccessToken);
      const payload = buildCarerUpsertPayload(userId, formData, providerEligible);
      const response = await fetch(`${supabaseUrl}/rest/v1/pet_care_profiles?on_conflict=user_id`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
          "content-type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(getNativeCarerRestError(body, "Couldn't save profile. Please retry."));
      const savedRow = Array.isArray(body) && body[0] && typeof body[0] === "object"
        ? body[0] as Record<string, unknown>
        : payload as Record<string, unknown>;
      writeNativeCarerProfileCache(userId, savedRow);
      setFormData(mapCarerRowToForm(savedRow));
      const submittedKeys = new Set(submittedCredentials.map((credential) => [
        normalizeCredentialLookup(credential.credential_type),
        normalizeCredentialLookup(credential.country_region),
        credential.license_number_masked || "",
      ].join("|")));
      const completeCredentials = formData.professional.credentials.filter(isProfessionalCredentialComplete);
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
        void fetch(`${supabaseUrl}/functions/v1/brevo-sync`, {
          method: "POST",
          headers: createNativeFunctionHeaders(token),
          body: JSON.stringify({ event: "service_profile_completed", user_id: userId }),
        }).catch(() => {});
      }
      return true;
    } catch (error) {
      if (silent) {
        console.warn("[NativeCarerProfile.silentSave]", error);
      } else {
        haptic.error();
        Alert.alert("Save failed", "Couldn't save profile. Please retry.");
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [applyValidationErrors, effectiveAccessToken, formData, getValidationErrors, providerEligible, refreshCredentialEvidence, submittedCredentials, userId]);

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
      Alert.alert("Credential", error instanceof Error ? error.message : "Unable to save credential evidence.");
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
      const token = cleanAccessToken(effectiveAccessToken);
      const response = await fetch(`${supabaseUrl}/functions/v1/credential-registry-check`, {
        method: "POST",
        headers: createNativeFunctionHeaders(token),
        body: JSON.stringify({ credential_id: submitted.id }),
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(getNativeCarerRestError(body, "Unable to check credential online."));
      await refreshCredentialEvidence();
      const result = body && typeof body === "object" && "status" in body ? String((body as { status?: unknown }).status || "") : "";
      if (result === "unable_to_verify") Alert.alert("Credential", UNABLE_TO_VERIFY_COPY);
    } catch (error) {
      await refreshCredentialEvidence();
      Alert.alert("Credential", error instanceof Error ? error.message : "Unable to check credential online.");
    } finally {
      setCredentialBusyKey((current) => current === busyKey ? null : current);
    }
  }, [effectiveAccessToken, findSubmittedCredential, refreshCredentialEvidence, submitCredentialEvidence, submittedCredentials]);

  const textFieldStyle = (field: FocusField) => [
    styles.field,
    focusedField === field ? styles.fieldFocused : null,
    fieldErrors[field] ? styles.fieldError : null,
  ];

  const setFieldRef = useCallback(
    (fieldName: string) => (node: View | null) => {
      fieldRefs.current[fieldName] = node;
    },
    [],
  );

  const handleEditScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  function scrollFieldIntoView(fieldName: string, options?: { targetRatio?: number }) {
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
  }

  const focusField = useCallback(
    (fieldName: FocusField) => {
      focusedFieldRef.current = fieldName;
      setFocusedField(fieldName);
      scrollFieldIntoView(fieldName, fieldName === "areaName" ? { targetRatio: 0.42 } : undefined);
    },
    [scrollFieldIntoView],
  );

  useEffect(() => {
    const resnapFocusedField = () => {
      const fieldName = focusedFieldRef.current;
      if (!fieldName) return;
      requestAnimationFrame(() => {
        scrollFieldIntoView(fieldName, fieldName === "areaName" ? { targetRatio: 0.42 } : undefined);
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
    const query = formData.areaName.trim();
    if (query.length < 2 || !locationSuggestionsOpen) {
      setLocationSuggestions([]);
      setLocationLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLocationLoading(true);
      try {
        const suggestions = await fetchNativeLocationSuggestions(query, typeof profile?.location_country === "string" ? profile.location_country : null);
        if (!cancelled) setLocationSuggestions(suggestions);
      } catch {
        if (!cancelled) setLocationSuggestions([]);
      } finally {
        if (!cancelled) setLocationLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formData.areaName, locationSuggestionsOpen, profile?.location_country]);

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
        price: rateDraft.voluntary ? "" : rateDraft.price,
        rate: rateDraft.voluntary ? "" : rateDraft.rate,
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
    const draftSaved = await saveProfile(true, false);
    if (!draftSaved) {
      haptic.error();
      setFieldErrors((prev) => ({ ...prev, wallet: "Save your draft before setting up wallet." }));
      return;
    }
    setWalletOnboardingVisible(true);
  }, [saveProfile, userId]);

  const refreshWallet = useCallback(async () => {
    try {
      const token = cleanAccessToken(effectiveAccessToken);
      const response = await fetch(`${supabaseUrl}/functions/v1/refresh-stripe-account-status`, {
        method: "POST",
        headers: createNativeFunctionHeaders(token),
        body: JSON.stringify({}),
      });
      await parseFunctionResponse(response);
      await loadData();
    } catch (error) {
      Alert.alert("Wallet", error instanceof Error ? error.message : "Unable to refresh wallet status.");
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
    void saveProfile(false, false);
  };
  const goBack = () => {
    if (onGoBack) onGoBack();
    else onNavigate("/settings");
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color={huddleColors.blue} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isAge18Plus) {
    return (
      <SafeAreaView edges={["left", "right"]} style={styles.safe}>
        <View style={[styles.header, { marginTop: 0, paddingTop: huddleLayout.headerHeight + huddleSpacing.x3 }]}>
          <Pressable accessibilityLabel="Back" onPress={goBack} style={styles.headerIcon}>
            <Feather color={huddleColors.text} name="arrow-left" size={24} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Pet Carer Profile</Text>
            <Text style={styles.headerSubtitle}>Care Service Providers must be at least 18.</Text>
          </View>
          <View style={styles.headerIcon} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["left", "right"]} style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <View style={[styles.header, { marginTop: 0, paddingTop: huddleLayout.headerHeight + huddleSpacing.x3 }]}>
          <Pressable accessibilityLabel="Back" onPress={goBack} style={({ pressed }) => [styles.headerIcon, pressed ? styles.pressed : null]}>
            <Feather color={huddleColors.text} name="arrow-left" size={24} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Pet Carer Profile</Text>
            <Text style={styles.headerSubtitle}>Customize how you offer trusted support</Text>
          </View>
          {mode === "edit" ? (
            <Animated.View style={{ transform: [{ translateX: saveShakeAnim }] }}>
              <Pressable accessibilityLabel="Save" disabled={saving} onPress={() => void saveProfile(false)} style={({ pressed }) => [styles.headerIcon, pressed && !saving ? styles.pressed : null, saving ? styles.disabled : null]}>
                {saving ? <ActivityIndicator color={huddleColors.text} /> : <Feather color={huddleColors.text} name="save" size={22} />}
              </Pressable>
            </Animated.View>
          ) : (
            <View style={styles.headerIcon} />
          )}
        </View>

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
              <NativeCarerProfileContent provider={viewData} />
            ) : (
              <View style={styles.form}>
                <View ref={setFieldRef("story")} style={styles.section}>
                  <Text style={styles.sectionTitle}>About Me</Text>
                  <TextInput
                    multiline
                    onBlur={() => setFocusedField(null)}
                    onChangeText={(story) => setFormData((prev) => ({ ...prev, story }))}
                    onFocus={() => focusField("story")}
                    placeholder="Introduce yourself and how you care for pets"
                    placeholderTextColor={huddleColors.mutedText}
                    style={[...textFieldStyle("story"), styles.textArea]}
                    textAlignVertical="top"
                    value={formData.story}
                  />
                </View>

                <View ref={setFieldRef("rateServices")} style={styles.section}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Care Scope</Text>
                    {rateEditIndex === null ? (
                      <Pressable onPress={addRateRow} style={styles.iconCircle}>
                        <Feather color={huddleColors.blue} name="plus" size={18} />
                      </Pressable>
                    ) : null}
                  </View>
                  {formData.rateRows.map((row, index) => {
                    const isEditing = rateEditIndex === index;
                    if (!isEditing) {
                      const needsDetails = row.services.length === 0 && (row.voluntary !== true && (!row.price || !row.rate));
                      return (
                        <View key={index} style={styles.rateSummary}>
                          {needsDetails ? (
                            <View style={styles.flex}>
                              <Text style={styles.rateAddDetails}>Add details</Text>
                            </View>
                          ) : (
                            <View style={styles.flex}>
                              <Text style={styles.rateTitle}>{row.services.length ? row.services.join(", ") : "Add details"}</Text>
                              <Text style={styles.rateMeta}>{row.voluntary ? "Voluntary" : row.price && row.rate ? `${formData.currency} ${row.price} / ${row.rate.toLowerCase()}` : "Add details"}</Text>
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
                              <NeuToggle value={rateDraft.voluntary === true} onChange={() => setRateDraft((prev) => ({ ...prev, voluntary: !prev.voluntary, price: !prev.voluntary ? "" : prev.price, rate: !prev.voluntary ? "" : prev.rate }))} />
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
                              onBlur={() => setFocusedField(null)}
                            onChangeText={(servicesOther) => setFormData((prev) => ({ ...prev, servicesOther }))}
                            onFocus={() => focusField("servicesOther")}
                            placeholder="Describe your other care"
                            placeholderTextColor={huddleColors.mutedText}
                            returnKeyType="done"
                            style={textFieldStyle("servicesOther")}
                              value={formData.servicesOther}
                            />
                          </View>
                        ) : null}
                        {fieldErrors.careScope ? <Text style={styles.errorText}>{fieldErrors.careScope}</Text> : null}
                        {!rateDraft.voluntary ? (
                          <>
                            <Text style={styles.fieldLabel}>Rate</Text>
                            <View style={[styles.rateCompositeField, fieldErrors.rate ? styles.fieldError : null]}>
                              <Pressable ref={setFieldRef("currency")} onPress={() => toggleDrop("currency")} style={styles.rateCompositeCurrency}>
                                <Text style={styles.rateSelectText}>{formData.currency || "-"}</Text>
                              </Pressable>
                              <View ref={setFieldRef("price")} style={styles.flex}>
                                <TextInput
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
                              <SelectList closeOnSelect options={CURRENCIES} selected={formData.currency ? [formData.currency] : []} onToggle={(currency) => { setFormData((prev) => ({ ...prev, currency })); setOpenDrop(null); }} />
                            ) : null}
                            {openDrop === "rate" ? (
                              <SelectList closeOnSelect options={RATE_OPTIONS} selected={rateDraft.rate ? [rateDraft.rate] : []} onToggle={(rate) => { setRateDraft((prev) => ({ ...prev, rate })); setOpenDrop(null); }} />
                            ) : null}
                          </>
                        ) : null}
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

                <MultiSelectSection
                  dropKey="petTypes"
                  fieldRef={setFieldRef("petTypes")}
                  focusedDrop={focusedField as DropdownKey | null}
                  onFocusControl={toggleDrop}
                  openDrop={openDrop}
                  options={PET_TYPES}
                  selected={formData.petTypes}
                  setOpenDrop={setOpenDrop}
                  title="Pet Types"
                  error={fieldErrors.petTypes}
                  onToggle={(petType) => setFormData((prev) => ({
                    ...prev,
                    petTypes: toggleStringItem(prev.petTypes, petType),
                    ...((PET_TYPES_REQUIRING_SIZE as readonly string[]).includes(petType) && prev.petTypes.includes(petType) ? { dogSizes: [] } : {}),
                  }))}
                />
                {formData.petTypes.includes("Others") ? (
                  <View ref={setFieldRef("petTypesOther")} style={styles.section}>
                    <TextInput
                      onBlur={() => setFocusedField(null)}
                    onChangeText={(petTypesOther) => setFormData((prev) => ({ ...prev, petTypesOther }))}
                    onFocus={() => focusField("petTypesOther")}
                    placeholder="Describe other pet type"
                    placeholderTextColor={huddleColors.mutedText}
                    returnKeyType="done"
                    style={textFieldStyle("petTypesOther")}
                      value={formData.petTypesOther}
                    />
                  </View>
                ) : null}
                {formData.petTypes.some((petType) => (PET_TYPES_REQUIRING_SIZE as readonly string[]).includes(petType)) ? (
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
                    onToggle={(size) => setFormData((prev) => ({ ...prev, dogSizes: toggleStringItem(prev.dogSizes, size) }))}
                  />
                ) : null}

                <View ref={setFieldRef("skills")} style={styles.section}>
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
                        <Text style={styles.selectButtonText}>{formData.skills.length === 0 ? "Select" : "Select"}</Text>
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

                <View ref={setFieldRef("professional")} style={styles.section}>
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
                                  {submitting ? <ActivityIndicator color={huddleColors.iconMuted} size="small" /> : <Feather color={huddleColors.iconMuted} name={editing ? "save" : "edit-2"} size={15} />}
                                </Pressable>
                                <Pressable onPress={() => removeCredential(index)} style={styles.iconCircle}>
                                  <Feather color={huddleColors.iconMuted} name="trash-2" size={15} />
                                </Pressable>
                              </View>
                            </View>
                            {editing ? (
                              <>
                                <Pressable onPress={() => toggleDrop(`professionalType:${index}`)} style={[styles.selectButton, openDrop === `professionalType:${index}` ? styles.fieldFocused : null, credentialHasError && !credential.professional_type.trim() ? styles.fieldError : null]}>
                                  <Text style={styles.selectButtonText}>{credential.professional_type || "Professional type"}</Text>
                                  <Feather color={huddleColors.iconMuted} name={openDrop === `professionalType:${index}` ? "chevron-up" : "chevron-down"} size={16} />
                                </Pressable>
                                {openDrop === `professionalType:${index}` ? (
                                  <SelectList closeOnSelect options={PROFESSIONAL_TYPES} selected={credential.professional_type ? [credential.professional_type] : []} onToggle={(professional_type) => { updateCredential(index, { professional_type }); setOpenDrop(null); }} />
                                ) : null}
                                <Pressable onPress={() => { setCountrySearch(""); toggleDrop(`credentialCountry:${index}`); }} style={[styles.selectButton, openDrop === `credentialCountry:${index}` ? styles.fieldFocused : null, credentialHasError && !credential.country_region.trim() ? styles.fieldError : null]}>
                                  <Text style={styles.selectButtonText}>{credential.country_region || "Country/region"}</Text>
                                  <Feather color={huddleColors.iconMuted} name={openDrop === `credentialCountry:${index}` ? "chevron-up" : "chevron-down"} size={16} />
                                </Pressable>
                                {openDrop === `credentialCountry:${index}` ? (
                                  <View style={styles.countryDropdownMenu}>
                                    <TextInput
                                      onChangeText={setCountrySearch}
                                      placeholder="Search country/region"
                                      placeholderTextColor={huddleColors.mutedText}
                                      style={styles.dropdownSearchInput}
                                      value={countrySearch}
                                    />
                                    <SelectList embedded closeOnSelect options={filteredCountryOptions} selected={credential.country_region ? [credential.country_region] : []} onToggle={(country_region) => { updateCredential(index, { country_region }); setOpenDrop(null); }} />
                                  </View>
                                ) : null}
                                <TextInput onBlur={() => setFocusedField(null)} onChangeText={(name_on_certificate) => updateCredential(index, { name_on_certificate })} onFocus={() => focusField("professionalCredentials")} placeholder="Name on Certificate" placeholderTextColor={huddleColors.mutedText} style={[...textFieldStyle("professionalCredentials"), credentialHasError && !credential.name_on_certificate.trim() ? styles.fieldError : null]} value={credential.name_on_certificate} />
                                <TextInput onBlur={() => setFocusedField(null)} onChangeText={(license_number) => updateCredential(index, { license_number })} onFocus={() => focusField("professionalCredentials")} placeholder="License/certificate number" placeholderTextColor={huddleColors.mutedText} style={[...textFieldStyle("professionalCredentials"), credentialHasError && !credential.license_number.trim() ? styles.fieldError : null]} value={credential.license_number} />
                                <TextInput onBlur={() => setFocusedField(null)} onChangeText={(issuing_body) => updateCredential(index, { issuing_body })} onFocus={() => focusField("professionalCredentials")} placeholder="Issuing body" placeholderTextColor={huddleColors.mutedText} style={[...textFieldStyle("professionalCredentials"), credentialHasError && !credential.issuing_body.trim() ? styles.fieldError : null]} value={credential.issuing_body} />
                                <ExpiryDateField
                                  error={credentialHasError && (!credential.expiry_date.trim() || isPastDate(credential.expiry_date))}
                                  focused={credentialDateIndex === index}
                                  onChangeText={(expiry_date) => updateCredential(index, { expiry_date })}
                                  onToggle={() => {
                                    Keyboard.dismiss();
                                    focusField("professionalCredentials");
                                    setCredentialDateIndex((current) => current === index ? null : index);
                                  }}
                                  value={credential.expiry_date}
                                />
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
                                    {checking ? <ActivityIndicator color={huddleColors.blue} size="small" /> : <Feather color={huddleColors.blue} name="shield" size={14} />}
                                    <Text style={styles.smallSecondaryText}>{checking ? "Checking..." : "Check credential"}</Text>
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

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Availability</Text>
                  <MultiSelectControl
                    dropKey="days"
                    fieldRef={setFieldRef("days")}
                    focusedDrop={focusedField as DropdownKey | null}
                    onFocusControl={toggleDrop}
                    label="Days"
                    openDrop={openDrop}
                    options={DAYS}
                    selected={formData.days}
                    setOpenDrop={setOpenDrop}
                    error={fieldErrors.days}
                    onToggle={(day) => setFormData((prev) => ({ ...prev, days: toggleStringItem(prev.days, day) }))}
                  />
                  <View style={styles.availabilityColumn}>
                    <View style={styles.switchSettingRow}>
                      <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={styles.fieldLabel}>Anytime</Text>
                      <NeuToggle value={formData.timeBlocks.includes("Anytime")} onChange={updateAnytime} />
                    </View>
                    {formData.timeBlocks.includes("Specify") ? (
                      <View style={styles.compactFieldStack}>
                        <View style={styles.availabilityTimeRow}>
                          <View style={styles.flex}>
                            <Pressable ref={setFieldRef("timeFrom")} onPress={() => toggleDrop("timeFrom")} style={[styles.selectButton, styles.compactSelectButton, openDrop === "timeFrom" || focusedField === "timeFrom" ? styles.fieldFocused : null, fieldErrors.time ? styles.fieldError : null]}>
                              <Text style={styles.selectButtonText}>{formData.otherTimeFrom || "From"}</Text>
                              <Feather color={huddleColors.iconMuted} name={openDrop === "timeFrom" ? "chevron-up" : "chevron-down"} size={16} />
                            </Pressable>
                            {openDrop === "timeFrom" ? (
                              <SelectList closeOnSelect options={TIME_OPTIONS} selected={formData.otherTimeFrom ? [formData.otherTimeFrom] : []} onToggle={(otherTimeFrom) => { setFormData((prev) => ({ ...prev, otherTimeFrom })); setFieldErrors((prev) => ({ ...prev, time: undefined })); setOpenDrop(null); }} />
                            ) : null}
                          </View>
                          <View style={styles.flex}>
                            <Pressable ref={setFieldRef("timeTo")} onPress={() => toggleDrop("timeTo")} style={[styles.selectButton, styles.compactSelectButton, openDrop === "timeTo" || focusedField === "timeTo" ? styles.fieldFocused : null, fieldErrors.time ? styles.fieldError : null]}>
                              <Text style={styles.selectButtonText}>{formData.otherTimeTo || "To"}</Text>
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

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Notice Time</Text>
                  <View style={[styles.noticeCompactRow, !formData.emergencyReadiness ? styles.noticeCompactRowSplit : null]}>
                    <View style={[styles.noticeToggleWrap, formData.emergencyReadiness === true ? styles.noticeToggleWrapFull : null]}>
                      <Text adjustsFontSizeToFit minimumFontScale={0.88} numberOfLines={1} style={styles.noticeToggleLabel}>Available Now</Text>
                      <NeuToggle value={formData.emergencyReadiness === true} onChange={updateEmergencyReadiness} />
                    </View>
                    {!formData.emergencyReadiness ? (
                      <View style={styles.noticeInputColumn}>
                        <View style={[styles.noticeCompositeField, fieldErrors.minNotice ? styles.fieldError : null]}>
                          <View ref={setFieldRef("minNotice")} style={styles.noticeValueWrap}>
                            <TextInput
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

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Care Location</Text>
                  <MultiSelectControl
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
                    onToggle={(locationStyle) => setFormData((prev) => {
                      const locationStyles = toggleStringItem(prev.locationStyles, locationStyle);
                      const showArea = locationStyles.includes("Carer's Place") || locationStyles.includes("Outdoor");
                      return { ...prev, locationStyles, areaName: showArea ? prev.areaName : "" };
                    })}
                  />
                  {shouldShowAreaSearch ? (
                  <View>
                    <View collapsable={false} ref={setFieldRef("areaName")}>
                      <TextInput
                        onBlur={() => {
                          focusedFieldRef.current = null;
                          setFocusedField(null);
                          setTimeout(() => setLocationSuggestionsOpen(false), 140);
                        }}
                        onChangeText={(areaName) => {
                          setLocationSuggestionsOpen(true);
                          setFormData((prev) => ({ ...prev, areaName }));
                        }}
                        onFocus={() => {
                          focusField("areaName");
                          setLocationSuggestionsOpen(true);
                        }}
                        onPressIn={() => {
                          focusField("areaName");
                          setLocationSuggestionsOpen(true);
                        }}
                        placeholder={areaPlaceholder}
                        placeholderTextColor={huddleColors.mutedText}
                        returnKeyType="search"
                        style={textFieldStyle("areaName")}
                        value={formData.areaName}
                      />
                    </View>
                    {locationLoading ? <Text style={styles.locationHelper}>Loading suggestions...</Text> : null}
                    {locationSuggestionsOpen && locationSuggestions.length > 0 ? (
                      <View style={styles.suggestionMenu}>
                        {locationSuggestions.map((item) => (
                          <Pressable
                            accessibilityRole="button"
                            key={`${item.label}:${item.lat}:${item.lng}`}
                            onPress={() => {
                              const selectedLocation = item.district || item.label;
                              setFormData((prev) => ({ ...prev, areaName: selectedLocation }));
                              setLocationSuggestions([]);
                              setLocationSuggestionsOpen(false);
                            }}
                            style={({ pressed }) => [styles.suggestionRow, pressed ? styles.pressed : null]}
                          >
                            <Text style={styles.suggestionPrimary}>{item.district || item.label}</Text>
                            {item.label ? <Text numberOfLines={1} style={styles.suggestionText}>{item.label}</Text> : null}
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                  ) : null}
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Publish Checklist</Text>
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
                  <View style={[styles.listingRow, fieldErrors.listing || (fieldErrors.wallet && walletState !== "connected") ? styles.fieldError : null]}>
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
                          if (!formData.stripePayoutsEnabled) {
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
                    {listingAttempted || formData.listed || walletState === "connected" ? (
                      <View ref={setFieldRef("wallet")} style={[styles.publishCard, fieldErrors.wallet && walletState !== "connected" ? styles.fieldError : null]}>
                        {walletState === "connected" ? (
                          <Pressable disabled style={[styles.walletButton, styles.walletButtonConnected]}>
                            <Feather color={huddleColors.onPrimary} name="check" size={18} />
                            <Text style={styles.walletButtonConnectedText}>Wallet Connected</Text>
                          </Pressable>
                        ) : walletState === "review" ? (
                          <View style={styles.walletRow}>
                            <View style={styles.walletStatusRow}>
                              <ActivityIndicator color={huddleColors.iconMuted} />
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
            )}
          </ScrollView>
        )}

        {mode === "edit" ? (
          <Animated.View style={[styles.stickyFooter, { paddingBottom: insets.bottom + huddleSpacing.x3, transform: [{ translateX: saveShakeAnim }] }]}>
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
                        <Text key={`intro-${index}`} style={styles.agreementSheetText}>{paragraph}</Text>
                      ))}
                      {serviceAgreementPage.sections.map((section) => (
                        <View key={section.title} style={styles.agreementLegalSection}>
                          <Text style={styles.agreementLegalTitle}>{section.title}</Text>
                          {section.body.map((paragraph, index) => (
                            <Text key={`${section.title}-${index}`} style={styles.agreementSheetText}>{paragraph}</Text>
                          ))}
                        </View>
                      ))}
                      <Text style={styles.locationHelper}>{serviceAgreementPage.effectiveDate}</Text>
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
  dropKey,
  label,
  openDrop,
  options,
  selected,
  setOpenDrop,
  onToggle,
  fieldRef,
  focusedDrop,
  onFocusControl,
  error,
}: {
  dropKey: DropdownKey;
  label: string | null;
  openDrop: DropdownKey | null;
  options: readonly string[];
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
        style={[styles.selectButton, openDrop === dropKey || focusedDrop === dropKey ? styles.fieldFocused : null, error ? styles.fieldError : null]}
      >
        <Text numberOfLines={1} style={styles.selectButtonText}>{selected.length ? selected.join(", ") : "Select"}</Text>
        <Feather color={huddleColors.iconMuted} name={openDrop === dropKey ? "chevron-up" : "chevron-down"} size={16} />
      </Pressable>
      {openDrop === dropKey ? <SelectList options={options} selected={selected} onToggle={onToggle} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function MultiSelectSection(props: Omit<Parameters<typeof MultiSelectControl>[0], "label"> & { title: string; error?: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{props.title}</Text>
      <MultiSelectControl {...props} label={null} />
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
    backgroundColor: huddleColors.glassChrome,
    ...huddleShadows.glassHeader,
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
  form: {
    gap: huddleSpacing.x6,
  },
  section: {
    gap: huddleSpacing.x4,
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
    ...huddleShadows.glassElevation1,
  },
  fieldFocused: {
    ...huddleFieldStates.focused,
  },
  fieldError: {
    ...huddleFieldStates.error,
  },
  textArea: {
    height: undefined,
    minHeight: 108,
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
    borderColor: huddleColors.fieldBorderSoft,
    backgroundColor: huddleColors.mutedCanvas,
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
    borderColor: huddleColors.fieldBorder,
    borderRadius: huddleRadii.field,
    backgroundColor: huddleColors.canvas,
  },
  selectButtonText: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body + 6,
    color: huddleColors.mutedText,
  },
  dropdownMenu: {
    maxHeight: huddleFormControls.select.menuMaxHeight,
    borderRadius: huddleFormControls.select.menuRadius,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
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
    height: huddleLayout.fieldHeight,
    margin: huddleFormControls.select.menuPadding,
    marginBottom: 0,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    paddingHorizontal: huddleSpacing.x3,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    color: huddleColors.text,
    backgroundColor: huddleColors.canvas,
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
    backgroundColor: huddleColors.primarySoftFill,
  },
  dropdownText: {
    flex: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.body,
    lineHeight: huddleType.body + 6,
    color: huddleColors.text,
  },
  checkSlot: {
    width: huddleFormControls.select.checkSlot,
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
    borderColor: huddleColors.fieldBorderSoft,
    backgroundColor: huddleColors.mutedCanvas,
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
    height: huddleLayout.fieldHeight,
    paddingHorizontal: huddleSpacing.x2,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    color: huddleColors.text,
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
    backgroundColor: huddleColors.mutedCanvas,
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
    height: huddleLayout.fieldHeight,
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
    backgroundColor: huddleColors.mutedCanvas,
  },
  noticeToggleWrapFull: {
    flex: 0,
    width: "100%",
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
    height: huddleLayout.fieldHeight,
    paddingHorizontal: huddleSpacing.x2,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    color: huddleColors.text,
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
    textAlign: "center",
  },
  agreementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    padding: huddleSpacing.x3,
    borderRadius: huddleRadii.field,
    backgroundColor: huddleColors.mutedCanvas,
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
    backgroundColor: huddleColors.mutedCanvas,
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
    padding: huddleSpacing.x3,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    backgroundColor: huddleColors.canvas,
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.canvas,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
  },
  dateFieldInput: {
    flex: 1,
    height: huddleLayout.fieldHeight,
    paddingHorizontal: huddleSpacing.x4,
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
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
  agreementConfirmRow: {
    minHeight: huddleLayout.fieldHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x3,
    borderRadius: huddleRadii.field,
    backgroundColor: huddleColors.mutedCanvas,
  },
  switchTrack: {
    width: 50,
    height: 28,
    flexShrink: 0,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.fieldBorderStrong,
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
    color: huddleColors.validationRed,
  },
  locationHelper: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
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
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  suggestionText: {
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
