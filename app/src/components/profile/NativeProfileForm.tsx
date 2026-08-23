import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { findNodeHandle, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  NativeFormChoiceField,
  NativeFormError,
  NativeFormFieldShell,
  NativeFormReadOnlyField,
  NativeFormTextField,
} from "../NativeFormField";
import { NativePhoneField } from "../NativePhoneField";
import { NativeSpinner } from "../NativeSpinner";
import { NativeLocationPinButton } from "../NativeLocationPinButton";
import {
  emptyNativeProfilePhotos,
  type NativeProfilePhotos,
} from "../../lib/nativeProfilePhotos";
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
  huddleToggle,
  huddleType,
} from "../../theme/huddleDesignTokens";
import { NativeProfilePhotoSlots } from "./NativeProfilePhotoSlots";
import { NativeBadgePicker } from "../NativeBadgePicker";
import { NativeFocusedEditor } from "../NativeFocusedEditor";
import { NativeProfileProgressTrack } from "./NativeProfileProgressTrack";
import type { NativeLocationSuggestion, NativeResolvedLocation } from "../../lib/nativeLocation";
import { PET_FOCUS_OPTIONS, getBreedOptionsForSpecies, nativePetEmojiForLabel, nativePetFocusLabels } from "../../lib/nativePetTaxonomy";
import { formatNativeIdentityDocumentCountry, formatNativeIdentityDocumentGender } from "../../lib/nativeVerifyIdentity";

export type NativeProfileFormMode = "edit" | "onboarding";

export type NativeProfileFormData = {
  affiliation: string;
  availability_status: string[];
  bio: string;
  degree: string;
  display_name: string;
  dob: string;
  experience_years: string;
  gender_genre: string;
  has_car: boolean;
  height: string;
  languages: string[];
  legal_name: string;
  location_country: string;
  location_district: string;
  location_name: string;
  major: string;
  occupation: string;
  orientation: string;
  owns_pets: boolean;
  pet_experience: string[];
  phone: string;
  photos: NativeProfilePhotos;
  relationship_status: string;
  school: string;
  show_academic: boolean;
  show_affiliation: boolean;
  show_age: boolean;
  show_bio: boolean;
  show_gender: boolean;
  show_height: boolean;
  show_languages: boolean;
  show_location: boolean;
  show_occupation: boolean;
  show_orientation: boolean;
  show_relationship_status: boolean;
  show_weight: boolean;
  social_album: string[];
  social_id: string;
  weight: string;
  weight_unit: "kg" | "lb";
};

export type NativeProfileFormErrors = Partial<Record<
  | "availability_status"
  | "display_name"
  | "dob"
  | "experience_years"
  | "gender_genre"
  | "height"
  | "location"
  | "major"
  | "occupation"
  | "pet_experience"
  | "phone"
  | "photos"
  | "school"
  | "social_id"
  | "weight",
  string
>>;

export type NativeIdentityCooldown = {
  helperText: string;
  locked: boolean;
  lockedMessage: string;
};

export const emptyNativeProfileFormData = (): NativeProfileFormData => ({
  affiliation: "",
  availability_status: [],
  bio: "",
  degree: "",
  display_name: "",
  dob: "",
  experience_years: "",
  gender_genre: "",
  has_car: false,
  height: "",
  languages: [],
  legal_name: "",
  location_country: "",
  location_district: "",
  location_name: "",
  major: "",
  occupation: "",
  orientation: "",
  owns_pets: false,
  pet_experience: [],
  phone: "",
  photos: emptyNativeProfilePhotos(),
  relationship_status: "",
  school: "",
  show_academic: false,
  show_affiliation: false,
  show_age: false,
  show_bio: false,
  show_gender: false,
  show_height: false,
  show_languages: false,
  show_location: false,
  show_occupation: false,
  show_orientation: false,
  show_relationship_status: false,
  show_weight: false,
  social_album: [],
  social_id: "",
  weight: "",
  weight_unit: "kg",
});

export const nativeGenderOptions = ["Man", "Woman", "Non-binary", "Transgender", "Genderfluid", "Others"];
export const nativeOrientationOptions = ["Straight", "Gay / Lesbian", "Bisexual", "Pansexual", "Queer", "Asexual", "Questioning / Not sure", "Others"];
export const nativeDegreeOptions = ["College", "Associate Degree", "Bachelor", "Master", "Doctorate / PhD"];
export const nativeRelationshipOptions = ["Single", "In a relationship", "Open relationship", "Married", "Divorced"];
export const nativePetExperienceOptions = ["Dogs", "Cats", "Birds", "Fish", "Reptiles", "Small Mammals", "Farm Animals", "Others", "None"];
export const nativeLanguageOptions = ["English", "Cantonese", "Mandarin", "Spanish", "French", "Japanese", "Korean", "German", "Portuguese", "Italian", "Arabic", "Hindi", "Bengali", "Urdu", "Russian", "Turkish", "Thai", "Vietnamese", "Indonesian", "Malay", "Tamil", "Telugu", "Polish", "Dutch", "Swedish"];
export const nativeAvailabilityOptions = ["Pet Parent", "Pet Nanny", "Animal Friend (No Pet)", "Veterinarian", "Pet Photographer", "Pet Groomer", "Vet Nurse", "Volunteer"];
const staticNativeCountryOptions = ["Afghanistan","Åland Islands","Albania","Algeria","American Samoa","Andorra","Angola","Anguilla","Antarctica","Antigua & Barbuda","Argentina","Armenia","Aruba","Ascension Island","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Benin","Bermuda","Bhutan","Bolivia","Bosnia & Herzegovina","Botswana","Bouvet Island","Brazil","British Indian Ocean Territory","British Virgin Islands","Brunei","Bulgaria","Burkina Faso","Burkina Faso","Burundi","Cambodia","Cameroon","Canada","Canary Islands","Cape Verde","Caribbean Netherlands","Cayman Islands","Central African Republic","Ceuta & Melilla","Chad","Chile","China","Christmas Island","Clipperton Island","Cocos (Keeling) Islands","Colombia","Comoros","Congo - Brazzaville","Congo - Kinshasa","Congo - Kinshasa","Cook Islands","Costa Rica","Côte d’Ivoire","Croatia","Cuba","Curaçao","Curaçao","Cyprus","Czechia","Denmark","Diego Garcia","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","European Union","Eurozone","Falkland Islands","Faroe Islands","Fiji","Finland","France","France","French Guiana","French Polynesia","French Southern Territories","Gabon","Gambia","Georgia","Germany","Germany","Ghana","Gibraltar","Greece","Greenland","Grenada","Guadeloupe","Guam","Guatemala","Guernsey","Guinea","Guinea-Bissau","Guyana","Haiti","Heard & McDonald Islands","Honduras","Hong Kong SAR China","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Isle of Man","Israel","Italy","Jamaica","Japan","Jersey","Jordan","Kazakhstan","Kenya","Kiribati","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Macao SAR China","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Martinique","Mauritania","Mauritius","Mayotte","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Montserrat","Morocco","Mozambique","Myanmar (Burma)","Myanmar (Burma)","Namibia","Nauru","Nepal","Netherlands","New Caledonia","New Zealand","Nicaragua","Niger","Nigeria","Niue","Norfolk Island","North Korea","North Macedonia","Northern Mariana Islands","Norway","Oman","Outlying Oceania","Pakistan","Palau","Palestinian Territories","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Pitcairn Islands","Poland","Portugal","Pseudo-Accents","Pseudo-Bidi","Puerto Rico","Qatar","Réunion","Romania","Russia","Russia","Rwanda","Samoa","San Marino","São Tomé & Príncipe","Sark","Saudi Arabia","Senegal","Serbia","Serbia","Serbia","Seychelles","Sierra Leone","Singapore","Sint Maarten","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Georgia & South Sandwich Islands","South Korea","South Sudan","Spain","Sri Lanka","St. Barthélemy","St. Helena","St. Kitts & Nevis","St. Lucia","St. Martin","St. Pierre & Miquelon","St. Vincent & Grenadines","Sudan","Suriname","Svalbard & Jan Mayen","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Timor-Leste","Togo","Tokelau","Tonga","Trinidad & Tobago","Tristan da Cunha","Tunisia","Türkiye","Turkmenistan","Turks & Caicos Islands","Tuvalu","U.S. Outlying Islands","U.S. Virgin Islands","Uganda","Ukraine","United Arab Emirates","United Kingdom","United Kingdom","United Nations","United States","Uruguay","Uzbekistan","Vanuatu","Vanuatu","Vatican City","Venezuela","Vietnam","Vietnam","Wallis & Futuna","Western Sahara","Yemen","Yemen","Zambia","Zimbabwe","Zimbabwe"];
const buildNativeCountryOptions = () => {
  const displayNamesFactory = typeof Intl !== "undefined" && "DisplayNames" in Intl ? Intl.DisplayNames : null;
  if (!displayNamesFactory) {
    return Array.from(new Set(staticNativeCountryOptions.map((label) => label === "Hong Kong SAR China" ? "Hong Kong" : label)));
  }
  const countryDisplayNames = new displayNamesFactory(["en"], { type: "region" });
  return Array.from({ length: 26 * 26 }, (_, idx) => {
    const a = String.fromCharCode(65 + Math.floor(idx / 26));
    const b = String.fromCharCode(65 + (idx % 26));
    const code = `${a}${b}`;
    const label = code === "HK" ? "Hong Kong" : countryDisplayNames.of(code);
    return label && label !== code && !label.toLowerCase().includes("unknown") ? label : null;
  }).filter((item): item is string => Boolean(item))
    .filter((item, index, values) => values.indexOf(item) === index)
    .sort((a, b) => a.localeCompare(b));
};
export const nativeCountryOptions = buildNativeCountryOptions();

type NativeProfileFormProps = {
  activePetCount: number;
  autoExpandRequest?: number;
  email?: string | null;
  errors?: NativeProfileFormErrors;
  form: NativeProfileFormData;
  mode: NativeProfileFormMode;
  onChange: (next: NativeProfileFormData | ((previous: NativeProfileFormData) => NativeProfileFormData)) => void;
  onError?: (message: string) => void;
  errorFocusRequest?: number;
  onPhoneOtpCodeChange?: (value: string) => void;
  onDropdownOpen?: (label: string, target?: number | null) => void;
  onPhoneInlineSave?: () => boolean | Promise<boolean>;
  onPhoneOtpRequest?: () => void;
  onPhoneOtpVerify?: () => void;
  onLocationFocusChange?: (open: boolean) => void;
  onLocationPinResolved?: (location: NativeResolvedLocation) => void;
  onLocationTextChange?: () => void;
  onLocationSuggestionSelect?: (suggestion: NativeLocationSuggestion) => void;
  onPreviousPhotoPathQueued?: (path: string | null) => void;
  onProfilePhotoCaptionAutosave?: (photos: NativeProfilePhotos) => void;
  onProfilePhotoCaptionCommit?: (photos: NativeProfilePhotos) => void;
  onProfilePhotosCommit?: (photos: NativeProfilePhotos) => void;
  photosVersion?: string | null;
  accessToken?: string | null;
  phoneOtpBusy?: boolean;
  phoneOtpCanRequest?: boolean;
  phoneOtpCode?: string;
  phoneOtpCooldown?: number;
  phoneOtpDuplicate?: boolean;
  phoneOtpDuplicateChecking?: boolean;
  phoneOtpMessage?: string | null;
  phoneOtpRequested?: boolean;
  phoneSentMaskedHint?: string | null;
  phoneOtpTurnstile?: ReactNode;
  phoneOtpUnavailable?: boolean;
  phoneOtpVerified?: boolean;
  phoneRequiresVerification?: boolean;
  identityLocked?: boolean;
  identityDocumentCountry?: string | null;
  identityDocumentGender?: string | null;
  identityDocumentStatus?: "confirmed" | "not_started" | "pending" | "rejected" | null;
  identityLegalName?: string | null;
  onIdentityEditorOpen?: () => void;
  profileVerified?: boolean;
  savedPhoneVerified?: boolean;
  locationLoading?: boolean;
  locationSuggestions?: NativeLocationSuggestion[];
  locationSuggestionsOpen?: boolean;
  displayNameCooldown?: NativeIdentityCooldown;
  socialIdCooldown?: NativeIdentityCooldown;
  socialIdStatus?: "idle" | "checking" | "available" | "taken" | "failed";
  openEditorRequest?: { editor: string; nonce: number } | null;
  onExitToSettings?: () => void;
  userId: string | null;
};

// Focused editors: each canvas block opens exactly one of these full-screen.
export type NativeProfileEditorId =
  | "affiliation"
  | "bio"
  | "education"
  | "experience"
  | "gender"
  | "height"
  | "identity"
  | "languages"
  | "location"
  | "name"
  | "occupation"
  | "orientation"
  | "relationship";

const profileEditorIds: NativeProfileEditorId[] = [
  "affiliation", "bio", "education", "experience", "gender", "height", "identity",
  "languages", "location", "name", "occupation", "orientation", "relationship",
];

const profileSectionTitles = ["Basic Info", "Demographics", "Pet Experience", "Education & Career", "Social & Lifestyle"] as const;

type VisibilityField = Extract<keyof NativeProfileFormData, `show_${string}`>;

const parseProfilePetExperienceLabel = (value: string) => {
  const raw = String(value || "").trim();
  const [head = "", ...tail] = raw.split(/[•·]/).map((part) => part.trim());
  const option = nativePetFocusLabels.find((label) => {
    const normalizedLabel = label.toLowerCase();
    const normalizedHead = head.toLowerCase();
    return normalizedLabel === normalizedHead || normalizedLabel.replace(/s$/, "") === normalizedHead.replace(/s$/, "");
  });
  return {
    species: option || head,
    breed: tail.join(" ").trim() || null,
  };
};

const speciesIdForProfileLabel = (speciesLabel: string) => {
  const normalized = speciesLabel.toLowerCase();
  return PET_FOCUS_OPTIONS.find((item) => {
    const label = item.label.toLowerCase();
    return label === normalized || label.replace(/s$/, "") === normalized.replace(/s$/, "");
  })?.value || speciesLabel;
};

const buildProfilePetExperienceLabel = (species: string, breed?: string | null) => {
  const cleanBreed = String(breed || "").trim();
  return cleanBreed ? `${species} · ${cleanBreed}` : species;
};

const updateList = (values: string[], value: string) => (
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
);

const nativeCountryCodeByLabel = new Map<string, string>();

const resolveNativeCountryCodeFromLabel = (countryName?: string | null) => {
  const target = String(countryName || "").trim().toLowerCase();
  if (!target) return "";
  const cached = nativeCountryCodeByLabel.get(target);
  if (cached !== undefined) return cached;
  const displayNamesFactory = typeof Intl !== "undefined" && "DisplayNames" in Intl ? Intl.DisplayNames : null;
  if (!displayNamesFactory) return "";
  const countryDisplayNames = new displayNamesFactory(["en"], { type: "region" });
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = `${String.fromCharCode(first)}${String.fromCharCode(second)}`;
      const label = countryDisplayNames.of(code);
      if (label && label.toLowerCase() === target) {
        nativeCountryCodeByLabel.set(target, code);
        return code;
      }
    }
  }
  nativeCountryCodeByLabel.set(target, "");
  return "";
};

const inferNativeCountryCodeFromPhone = (phone: string): string => {
  const normalized = phone.replace(/\s+/g, "");
  if (normalized.startsWith("+852")) return "HK";
  if (normalized.startsWith("+1")) return "US";
  if (normalized.startsWith("+44")) return "GB";
  if (normalized.startsWith("+65")) return "SG";
  if (normalized.startsWith("+81")) return "JP";
  if (normalized.startsWith("+82")) return "KR";
  if (normalized.startsWith("+886")) return "TW";
  if (normalized.startsWith("+61")) return "AU";
  if (normalized.startsWith("+91")) return "IN";
  return "";
};

const nativeCountryLabelByCode: Record<string, string> = {
  AU: "Australia",
  GB: "United Kingdom",
  HK: "Hong Kong",
  IN: "India",
  JP: "Japan",
  KR: "South Korea",
  SG: "Singapore",
  TW: "Taiwan",
  US: "United States",
};

export const inferNativeCountryLabelFromPhone = (phone: string): string => {
  const code = inferNativeCountryCodeFromPhone(phone);
  return nativeCountryLabelByCode[code] || "";
};

const isAtLeast13FromDate = (isoDate: string): boolean => {
  if (!isoDate) return false;
  if (!isValidIsoDate(isoDate)) return false;
  const dob = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 13;
};

const isAtLeast16FromDate = (isoDate: string): boolean => {
  if (!isoDate) return false;
  if (!isValidIsoDate(isoDate)) return false;
  const dob = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 16;
};

const pad2 = (value: number) => String(value).padStart(2, "0");
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();
const isoFromParts = (year: number, month: number, day: number) => `${year}-${pad2(month)}-${pad2(Math.min(day, daysInMonth(year, month)))}`;
const isValidIsoDate = (value: string) => {
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return false;
  return isoFromParts(year, month, day) === text;
};

const datePartsFromIso = (value: string) => {
  const fallback = new Date();
  if (!isValidIsoDate(value)) {
    return {
      year: fallback.getFullYear() - 18,
      month: fallback.getMonth() + 1,
      day: fallback.getDate(),
    };
  }
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
};

const visibilityContentReady = (field: VisibilityField, form: NativeProfileFormData) => {
  switch (field) {
    case "show_gender": return Boolean(form.gender_genre.trim());
    case "show_orientation": return Boolean(form.orientation.trim());
    case "show_age": return Boolean(form.dob);
    case "show_height": return Boolean(form.height.trim());
    case "show_weight": return Boolean(form.weight.trim());
    case "show_academic": return Boolean(form.degree.trim() || form.school.trim() || form.major.trim());
    case "show_affiliation": return Boolean(form.affiliation.trim());
    case "show_occupation": return Boolean(form.occupation.trim());
    case "show_bio": return Boolean(form.bio.trim());
    case "show_relationship_status": return Boolean(form.relationship_status.trim());
    case "show_languages": return form.languages.length > 0;
    case "show_location": return Boolean(form.location_country.trim() && form.location_district.trim());
    default: return false;
  }
};

const visibilityFieldsForProfileField = (field: keyof NativeProfileFormData): VisibilityField[] => {
  switch (field) {
    case "bio": return ["show_bio"];
    case "gender_genre": return ["show_gender"];
    case "orientation": return ["show_orientation"];
    case "height": return ["show_height"];
    case "weight": return ["show_weight"];
    case "degree":
    case "school":
    case "major":
      return ["show_academic"];
    case "affiliation": return ["show_affiliation"];
    case "occupation": return ["show_occupation"];
    case "relationship_status": return ["show_relationship_status"];
    case "languages": return ["show_languages"];
    case "location_country":
    case "location_district":
    case "location_name":
      return ["show_location"];
    default: return [];
  }
};

function VisibilityToggle({ value, onToggle }: { onToggle?: (value: boolean) => void; value?: boolean }) {
  const enabled = Boolean(value);
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: enabled }} hitSlop={8} onPress={() => onToggle?.(!value)} style={styles.visibilityToggle}>
      <View style={[styles.visibilitySwitchTrack, enabled ? styles.visibilitySwitchTrackOn : null]}>
        <Feather
          color={enabled ? huddleColors.onPrimary : huddleColors.iconMuted}
          name={enabled ? "eye" : "eye-off"}
          size={15}
          style={[
            styles.visibilitySwitchIcon,
            enabled ? styles.visibilitySwitchIconOn : styles.visibilitySwitchIconOff,
          ]}
        />
        <View style={[styles.switchThumb, enabled ? styles.switchThumbOn : null]} />
      </View>
    </Pressable>
  );
}

function VisibilityControl({ value, onToggle }: { onToggle?: (value: boolean) => void; value?: boolean }) {
  return <VisibilityToggle onToggle={onToggle} value={value} />;
}

function TextField({
  error,
  keyboardType,
  label,
  maxLength,
  multiline,
  onChangeText,
  onFocusRequest,
  onSubmitEditing,
  placeholder,
  returnKeyType,
  value,
  visibility,
  visibilityValue,
  onVisibilityToggle,
}: {
  error?: string;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
  label: string;
  maxLength?: number;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  onFocusRequest?: (label: string, target?: number | null) => void;
  onSubmitEditing?: () => void;
  onVisibilityToggle?: (value: boolean) => void;
  placeholder?: string;
  returnKeyType?: "done" | "next" | "search" | "go" | "send";
  value: string;
  visibility?: boolean;
  visibilityValue?: boolean;
}) {
  const fieldRef = useRef<View | null>(null);
  const rightAccessory = visibility ? <VisibilityControl onToggle={onVisibilityToggle} value={visibilityValue} /> : undefined;
  return (
    <View ref={fieldRef}>
      <NativeFormTextField
        error={error}
        keyboardType={keyboardType}
        label={label}
        maxLength={maxLength}
        multiline={multiline}
        onChangeText={onChangeText}
        onFocus={() => onFocusRequest?.(label, findNodeHandle(fieldRef.current))}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        returnKeyType={multiline ? undefined : returnKeyType}
        rightAccessory={rightAccessory}
        value={value}
      />
    </View>
  );
}

function InlineDobPicker({
  onChange,
  value,
  visible,
}: {
  onChange: (value: string) => void;
  value: string;
  visible: boolean;
}) {
  if (!visible) return null;
  const parts = datePartsFromIso(value);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, index) => currentYear - index);
  const months = Array.from({ length: 12 }, (_, index) => index + 1);
  const days = Array.from({ length: daysInMonth(parts.year, parts.month) }, (_, index) => index + 1);
  const selectPart = (next: Partial<typeof parts>) => {
    const merged = { ...parts, ...next };
    onChange(isoFromParts(merged.year, merged.month, merged.day));
  };
  const renderColumn = (items: number[], selected: number, onSelect: (value: number) => void) => (
    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.inlineDateColumn}>
      {items.map((item) => {
        const active = item === selected;
        return (
          <Pressable key={item} onPress={() => onSelect(item)} style={[styles.inlineDateOption, active ? styles.inlineDateOptionActive : null]}>
            <Text style={[styles.inlineDateOptionText, active ? styles.inlineDateOptionTextActive : null]}>{item}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
  return (
    <View style={styles.inlineDateColumns}>
      {renderColumn(years, parts.year, (year) => selectPart({ year }))}
      {renderColumn(months, parts.month, (month) => selectPart({ month }))}
      {renderColumn(days, parts.day, (day) => selectPart({ day }))}
    </View>
  );
}

function ReadOnlyField({ fieldAccessory, label, rightAccessory, value }: { fieldAccessory?: ReactNode; label: string; rightAccessory?: ReactNode; value: string }) {
  return <NativeFormReadOnlyField fieldAccessory={fieldAccessory} label={label} rightAccessory={rightAccessory} value={value} />;
}

function EmailVerifiedField({ value }: { value: string }) {
  return (
    <NativeFormFieldShell
      fieldAccessory={(
        <View style={styles.emailVerifiedChip}>
          <Text style={styles.emailVerifiedText}>Verified</Text>
        </View>
      )}
      label="Email"
      readOnly
    >
      <View style={styles.emailValueRow}>
        <Feather color={huddleColors.mutedText} name="mail" size={16} />
        <Text numberOfLines={1} style={styles.emailValueText}>{value || "—"}</Text>
      </View>
    </NativeFormFieldShell>
  );
}

function UnlabeledSelect({
  disabledOptions,
  multi,
  onChange,
  options,
  placeholder,
  values,
}: {
  disabledOptions?: Set<string>;
  multi?: boolean;
  onChange: (values: string[]) => void;
  options: string[];
  placeholder: string;
  values: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const selectedLabel = values.length > 0 ? values.join(", ") : placeholder;
  return (
    <View style={expanded ? styles.dropdownLayer : null}>
      <Pressable accessibilityRole="button" onPress={() => setExpanded((current) => !current)} style={[styles.selectTrigger, expanded ? styles.selectTriggerFocused : null]}>
        <Text numberOfLines={1} style={[styles.selectValue, values.length === 0 ? styles.placeholderText : null]}>
          {selectedLabel}
        </Text>
        <Feather color={huddleColors.iconMuted} name={expanded ? "chevron-up" : "chevron-down"} size={16} />
      </Pressable>
      {expanded ? (
        <ScrollView nestedScrollEnabled style={styles.selectMenu}>
          {options.map((option, index) => {
            const selected = values.includes(option);
            const disabled = disabledOptions?.has(option) ?? false;
            return (
              <Pressable
                accessibilityRole={multi ? "checkbox" : "button"}
                accessibilityState={{ checked: selected, disabled }}
                disabled={disabled}
                key={`${option}-${index}`}
                onPress={() => {
                  onChange(multi ? updateList(values, option) : [option]);
                  if (!multi) setExpanded(false);
                }}
                style={({ pressed }) => [
                  styles.selectOption,
                  pressed && !disabled ? styles.pressed : null,
                  disabled ? styles.disabled : null,
                ]}
              >
                <Text ellipsizeMode="tail" numberOfLines={1} style={styles.selectOptionText}>{option}</Text>
                {selected ? <Feather color={huddleColors.blue} name="check" size={16} /> : <View style={styles.selectCheckSlot} />}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

function ToggleRow({ disabled, icon, label, onChange, subtitle, value }: { disabled?: boolean; icon?: "car" | keyof typeof Feather.glyphMap; label: string; onChange: (value: boolean) => void; subtitle?: string; value: boolean }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.toggleRow, pressed && !disabled ? styles.pressed : null]}
    >
      <View style={styles.toggleContent}>
        {icon === "car" ? <MaterialCommunityIcons color={huddleColors.blue} name="car-outline" size={20} /> : icon ? <Feather color={huddleColors.blue} name={icon} size={20} /> : null}
        <View style={styles.toggleCopy}>
          <Text style={styles.toggleLabel}>{label}</Text>
          {subtitle ? <Text style={styles.toggleSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={[styles.switchTrack, value ? styles.switchTrackOn : null]}>
        <View style={[styles.switchThumb, value ? styles.switchThumbOn : null]} />
      </View>
    </Pressable>
  );
}

// One editable fact on the canvas: icon, label, current value (or a quiet
// invitation), and glanceable state — coral dot for validation errors, slashed
// eye when the fact is set to "only you". Tapping opens its focused editor.
function CanvasRow({
  error,
  hidden,
  icon,
  label,
  materialIcon,
  onPress,
  value,
}: {
  error?: boolean;
  hidden?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  label: string;
  materialIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  value: string;
}) {
  const filled = Boolean(value.trim());
  return (
    <Pressable
      accessibilityLabel={`Edit ${label}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.canvasRow, pressed ? styles.pressed : null]}
    >
      <View style={styles.canvasRowIcon}>
        {materialIcon ? (
          <MaterialCommunityIcons color={filled ? huddleColors.blue : huddleColors.iconSubtle} name={materialIcon} size={17} />
        ) : (
          <Feather color={filled ? huddleColors.blue : huddleColors.iconSubtle} name={icon ?? "edit-3"} size={16} />
        )}
      </View>
      <View style={styles.canvasRowCopy}>
        <Text style={styles.canvasRowLabel}>{label}</Text>
        <Text numberOfLines={1} style={[styles.canvasRowValue, filled ? null : styles.canvasRowInvite]}>
          {filled ? value : "—"}
        </Text>
      </View>
      {error ? <View style={styles.canvasErrorDot} /> : null}
      {hidden && filled ? <Feather color={huddleColors.iconSubtle} name="eye-off" size={14} /> : null}
      <Feather color={huddleColors.iconSubtle} name="chevron-right" size={16} />
    </Pressable>
  );
}

export function SelectField({
  compact,
  disabledOptions,
  error,
  label,
  multi,
  onChange,
  options,
  placeholder,
  values,
  visibility,
  visibilityValue,
  onVisibilityToggle,
  onOpen,
  onFieldFocus,
  optionIcon,
  searchable,
  searchPlaceholder,
}: {
  compact?: boolean;
  disabledOptions?: Set<string>;
  error?: string;
  label: string;
  multi?: boolean;
  onChange: (values: string[]) => void;
  onVisibilityToggle?: (value: boolean) => void;
  onOpen?: (target?: number | null) => void;
  onFieldFocus?: (label: string, target?: number | null) => void;
  optionIcon?: (option: string) => string | null;
  options: string[];
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  values: string[];
  visibility?: boolean;
  visibilityValue?: boolean;
}) {
  const fieldRef = useRef<View | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const rightAccessory = visibility ? <VisibilityControl onToggle={onVisibilityToggle} value={visibilityValue} /> : undefined;
  const formatOption = (option: string) => {
    const icon = optionIcon?.(option);
    return icon ? `${icon} ${option}` : option;
  };
  const selectedLabel = values.length > 0 ? values.map(formatOption).join(", ") : placeholder ?? (multi ? `Select ${label.toLowerCase()}` : "Select");
  const filteredOptions = searchable && searchQuery.trim()
    ? options.filter((option) => option.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : options;
  return (
    <View ref={fieldRef} style={expanded ? styles.dropdownLayer : null}>
      <NativeFormChoiceField compact={compact} error={error} focused={expanded} label={label} rightAccessory={rightAccessory}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const target = findNodeHandle(fieldRef.current);
            setExpanded((current) => {
              const next = !current;
              if (next) {
                setSearchQuery("");
                onFieldFocus?.(label, target);
                onOpen?.(target);
              }
              return next;
            });
          }}
          style={[styles.selectTrigger, expanded ? styles.selectTriggerFocused : null]}
        >
          <Text numberOfLines={1} style={[styles.selectValue, values.length === 0 ? styles.placeholderText : null]}>
            {selectedLabel}
          </Text>
          <Feather color={huddleColors.iconMuted} name={expanded ? "chevron-up" : "chevron-down"} size={16} />
        </Pressable>
        {expanded ? (
          <ScrollView nestedScrollEnabled style={styles.selectMenu}>
            {searchable ? (
              <View style={styles.selectSearchWrap}>
                <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                  autoCapitalize="words"
                  autoCorrect={false}
                  onChangeText={setSearchQuery}
                  placeholder={searchPlaceholder || `Find ${label.toLowerCase()}`}
                  placeholderTextColor={huddleColors.mutedText}
                  style={styles.selectSearchInput}
                  value={searchQuery}
                />
              </View>
            ) : null}
            {filteredOptions.map((option, index) => {
              const selected = values.includes(option);
              const disabled = disabledOptions?.has(option) ?? false;
              const icon = optionIcon?.(option);
              return (
                <Pressable
                  accessibilityRole={multi ? "checkbox" : "button"}
                  accessibilityState={{ checked: selected, disabled }}
                  disabled={disabled}
                  key={`${option}-${index}`}
                  onPress={() => {
                    onChange(multi ? updateList(values, option) : [option]);
                    if (!multi) setExpanded(false);
                  }}
                  style={({ pressed }) => [
                    styles.selectOption,
                    pressed && !disabled ? styles.pressed : null,
                    disabled ? styles.disabled : null,
                  ]}
                >
                  <View style={styles.selectOptionLabelRow}>
                    {icon ? <Text style={styles.selectOptionEmoji}>{icon}</Text> : null}
                    <Text ellipsizeMode="tail" numberOfLines={1} style={styles.selectOptionText}>{option}</Text>
                  </View>
                  {selected ? <Feather color={huddleColors.blue} name="check" size={16} /> : <View style={styles.selectCheckSlot} />}
                </Pressable>
              );
            })}
            {filteredOptions.length === 0 ? (
              <View style={styles.selectEmptyState}>
                <Text style={styles.selectEmptyStateText}>No matches found.</Text>
              </View>
            ) : null}
          </ScrollView>
        ) : null}
      </NativeFormChoiceField>
    </View>
  );
}

function EditableTextField({
  editing,
  editLockedMessage,
  error,
  helperText,
  keyboardType,
  label,
  onChangeText,
  onEdit,
  onSave,
  placeholder,
  prefix,
  saveIcon = "save",
  value,
}: {
  editing: boolean;
  editLockedMessage?: string;
  error?: string;
  helperText?: string;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
  label: string;
  onChangeText: (value: string) => void;
  onEdit: () => void;
  onSave?: () => void;
  placeholder?: string;
  prefix?: string;
  saveIcon?: "save" | "check";
  value: string;
}) {
  if (!editing) {
    return (
      <>
        <ReadOnlyField
          fieldAccessory={(
            <Pressable
              accessibilityLabel={`Edit ${label}`}
              accessibilityState={{ disabled: Boolean(editLockedMessage) }}
              onPress={onEdit}
              style={styles.inlineIconButton}
            >
              <Feather color={editLockedMessage ? huddleColors.mutedText : huddleColors.iconMuted} name={saveIcon === "check" ? "check" : "edit-2"} size={16} />
            </Pressable>
          )}
          label={label}
          value={`${prefix ?? ""}${value || "—"}`}
        />
        {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
      </>
    );
  }
  return (
    <>
      <NativeFormTextField
        error={error}
        fieldAccessory={onSave ? (
          <Pressable accessibilityLabel={`Save ${label}`} onPress={onSave} style={styles.inlineIconButton}>
            <Feather color={huddleColors.iconMuted} name="save" size={16} />
          </Pressable>
        ) : undefined}
        keyboardType={keyboardType}
        label={label}
        onChangeText={onChangeText}
        placeholder={placeholder}
        prefix={prefix}
        value={value}
      />
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
    </>
  );
}

function EditablePhoneField({
  defaultCountryCode,
  editing,
  error,
  onChangeText,
  onEdit,
  onSave,
  onOtpRequest,
  otpCooldown,
  otpDisabled,
  otpVisible,
  value,
}: {
  defaultCountryCode?: string | null;
  editing: boolean;
  error?: string;
  onChangeText: (value: string) => void;
  onEdit: () => void;
  onSave?: () => boolean | Promise<boolean>;
  onOtpRequest?: () => void;
  otpCooldown?: number;
  otpDisabled?: boolean;
  otpVisible?: boolean;
  value: string;
}) {
  if (!editing) {
    return (
      <ReadOnlyField
        fieldAccessory={(
          <Pressable accessibilityLabel="Edit Phone" onPress={onEdit} style={styles.inlineIconButton}>
            <Feather color={huddleColors.iconMuted} name="edit-2" size={16} />
          </Pressable>
        )}
        label="Phone"
        value={value || "—"}
      />
    );
  }

  return (
    <View style={styles.editablePhoneField}>
      <View style={styles.editablePhoneHeader}>
        <Text style={styles.label}>Phone</Text>
      </View>
      <NativePhoneField
        defaultCountryCode={defaultCountryCode}
        error={Boolean(error)}
        onChangeText={onChangeText}
        rightAccessory={(
          <>
            {otpVisible ? (
              <Pressable
                accessibilityLabel="Send phone OTP"
                disabled={otpDisabled}
                onPress={onOtpRequest}
                style={({ pressed }) => [styles.phoneOtpInlineButton, otpDisabled ? styles.phoneOtpInlineDisabled : null, pressed && !otpDisabled ? styles.pressed : null]}
              >
                <Text style={styles.phoneOtpInlineText}>{otpCooldown && otpCooldown > 0 ? `Resend ${otpCooldown}s` : "Send OTP"}</Text>
              </Pressable>
            ) : null}
            {onSave ? (
              <Pressable
                accessibilityLabel="Save Phone"
                onPress={async () => {
                  await onSave();
                }}
                style={styles.phoneSaveInlineButton}
              >
                <Feather color={huddleColors.iconMuted} name="save" size={16} />
              </Pressable>
            ) : null}
          </>
        )}
        rightAccessoryWidth={otpVisible ? 132 : 36}
        value={value}
      />
      {error ? <NativeFormError message={error} /> : null}
    </View>
  );
}

export function NativeProfileForm({
  activePetCount,
  autoExpandRequest = 0,
  email,
  errors = {},
  errorFocusRequest = 0,
  form,
  mode,
  onChange,
  onError,
  onDropdownOpen,
  onPhoneInlineSave,
  onPhoneOtpCodeChange,
  onLocationFocusChange,
  onLocationPinResolved,
  onLocationTextChange,
  onLocationSuggestionSelect,
  onPhoneOtpRequest,
  onPhoneOtpVerify,
  onPreviousPhotoPathQueued,
  onProfilePhotoCaptionAutosave,
  onProfilePhotoCaptionCommit,
  onProfilePhotosCommit,
  photosVersion,
  accessToken,
  phoneOtpBusy = false,
  phoneOtpCanRequest = true,
  phoneOtpCode = "",
  phoneOtpCooldown = 0,
  phoneOtpDuplicate = false,
  phoneOtpDuplicateChecking = false,
  phoneOtpMessage,
  phoneOtpRequested = false,
  phoneSentMaskedHint = null,
  phoneOtpTurnstile,
  phoneOtpUnavailable = false,
  phoneOtpVerified = false,
  phoneRequiresVerification = false,
  identityLocked = false,
  identityDocumentCountry = null,
  identityDocumentGender = null,
  identityDocumentStatus = null,
  identityLegalName = null,
  profileVerified = false,
  savedPhoneVerified = false,
  locationLoading = false,
  locationSuggestions = [],
  locationSuggestionsOpen = false,
  displayNameCooldown,
  socialIdCooldown,
  socialIdStatus = "idle",
  openEditorRequest,
  onIdentityEditorOpen,
  onExitToSettings,
  userId,
}: NativeProfileFormProps) {
  const hasPets = activePetCount > 0 || form.owns_pets;
  const identityFieldsLocked = profileVerified || identityLocked;
  const [displayNameEditMode, setDisplayNameEditMode] = useState(false);
  const [socialIdEditMode, setSocialIdEditMode] = useState(false);
  const [phoneEditMode, setPhoneEditMode] = useState(false);
  const [dobPickerOpen, setDobPickerOpen] = useState(false);
  const [displayNameCooldownNoticeVisible, setDisplayNameCooldownNoticeVisible] = useState(false);
  const [socialIdCooldownNoticeVisible, setSocialIdCooldownNoticeVisible] = useState(false);
  // Tap-to-edit canvas: the form renders as an editorial page; each block opens
  // one full-screen focused editor. Form state stays lifted in the parent, so
  // editors commit live and closing (back arrow or Done) never discards.
  const [activeEditor, setActiveEditor] = useState<NativeProfileEditorId | null>(null);
  const lastOpenEditorNonceRef = useRef(0);
  const identityDeepLinkedRef = useRef(false);
  const setField = <Key extends keyof NativeProfileFormData>(field: Key, value: NativeProfileFormData[Key]) => {
    onChange((previous) => {
      const next = { ...previous, [field]: value };
      visibilityFieldsForProfileField(field).forEach((visibilityField) => {
        next[visibilityField] = visibilityContentReady(visibilityField, next) as NativeProfileFormData[typeof visibilityField];
      });
      return next;
    });
  };

  const petExperienceParsed = form.pet_experience.map(parseProfilePetExperienceLabel);
  const petExperienceSpeciesValues = form.pet_experience.includes("None")
    ? ["None"]
    : Array.from(new Set(petExperienceParsed.map((item) => item.species).filter(Boolean)));
  const breedTargetSpeciesList = petExperienceSpeciesValues.filter((item) => item !== "None");
  const locationTextFieldRef = useRef<View | null>(null);
  const majorFieldRef = useRef<TextInput | null>(null);
  const setVisibility = (field: VisibilityField, value: boolean) => {
    if (value && !visibilityContentReady(field, form)) {
      onError?.("Complete this field before making it visible.");
      return;
    }
    setField(field, value as NativeProfileFormData[typeof field]);
  };
  const disabledRoleOptions = new Set<string>();
  if (hasPets) disabledRoleOptions.add("Animal Friend (No Pet)");
  if (!hasPets) disabledRoleOptions.add("Pet Parent");
  const showDiscoverAgeInfo = Boolean(form.dob) && isAtLeast13FromDate(form.dob) && !isAtLeast16FromDate(form.dob);
  const verifiedDocumentIdentity = identityDocumentStatus === "confirmed";
  const verifiedLegalName = String(identityLegalName || "").trim();
  const verifiedNationality = verifiedDocumentIdentity ? formatNativeIdentityDocumentCountry(identityDocumentCountry) : "";
  const verifiedDocumentGender = verifiedDocumentIdentity ? formatNativeIdentityDocumentGender(identityDocumentGender) : "";
  const defaultPhoneCountry = inferNativeCountryCodeFromPhone(form.phone) || resolveNativeCountryCodeFromLabel(form.location_country);
  const photoSectionRef = useRef<View | null>(null);

  const isSectionComplete = (title: string): boolean => {
    switch (title) {
      case "Basic Info":
        return Boolean(form.display_name.trim() && form.social_id.trim() && form.dob.trim());
      case "Demographics":
        return Boolean(form.gender_genre);
      case "Pet Experience":
        return form.availability_status.length > 0 && form.pet_experience.length > 0;
      case "Education & Career":
        return Boolean(form.degree);
      default:
        return false; // Social & Lifestyle is last.
    }
  };
  // Same completion semantics the guided accordion reported, without the accordion.
  const progress = profileSectionTitles.reduce((count, title) => count + (isSectionComplete(title) ? 1 : 0), 0) / profileSectionTitles.length;

  const closeEditor = () => {
    // Identity is only reachable in edit mode via a deep link from Account
    // Settings, so closing it should hand the user back to Settings (not the
    // profile screen). Onboarding has no Settings yet, so it just returns.
    const wasDeepLinkedIdentity = activeEditor === "identity" && identityDeepLinkedRef.current;
    setActiveEditor(null);
    setDisplayNameEditMode(false);
    setSocialIdEditMode(false);
    setPhoneEditMode(false);
    setDobPickerOpen(false);
    if (wasDeepLinkedIdentity) {
      identityDeepLinkedRef.current = false;
      onExitToSettings?.();
    }
  };
  const openEditor = (editor: NativeProfileEditorId) => {
    if (editor === "name") {
      // Same cooldown gate the inline pencil used: locked names never open an editor.
      setDisplayNameCooldownNoticeVisible(true);
      if (displayNameCooldown?.locked) {
        onError?.(displayNameCooldown.lockedMessage);
        return;
      }
      setDisplayNameEditMode(true);
    }
    if (editor === "identity") void onIdentityEditorOpen?.();
    setActiveEditor(editor);
  };

  // Deep-link entry (e.g. Account → /edit-profile?focus=identity).
  useEffect(() => {
    if (!openEditorRequest || openEditorRequest.nonce <= lastOpenEditorNonceRef.current) return;
    lastOpenEditorNonceRef.current = openEditorRequest.nonce;
    const editor = openEditorRequest.editor as NativeProfileEditorId;
    if (!profileEditorIds.includes(editor)) return;
    if (editor === "identity") identityDeepLinkedRef.current = true;
    if (editor === "identity") void onIdentityEditorOpen?.();
    setActiveEditor(editor);
  }, [onIdentityEditorOpen, openEditorRequest]);

  useEffect(() => {
    if (errorFocusRequest <= 0) return;
    if (errors.photos) {
      setActiveEditor(null);
      setTimeout(() => onDropdownOpen?.("Your photos", findNodeHandle(photoSectionRef.current)), 80);
      return;
    }
    // Follow the visible canvas order so Save opens the first red section the
    // user can actually fix. Pet Life intentionally precedes private identity.
    const editor: NativeProfileEditorId | null =
      errors.pet_experience || errors.experience_years || errors.availability_status ? "experience" :
      errors.display_name ? "name" :
      errors.height ? "height" :
      errors.school || errors.major ? "education" :
      errors.occupation ? "occupation" :
      errors.location ? "location" :
      null;
    if (editor) {
      identityDeepLinkedRef.current = false;
      setActiveEditor(editor);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorFocusRequest]);

  useEffect(() => {
    if (form.location_country.trim()) return;
    const inferredCountry = inferNativeCountryLabelFromPhone(form.phone);
    if (!inferredCountry) return;
    onChange((previous) => ({
      ...previous,
      location_country: previous.location_country.trim() || inferredCountry,
      location_name: previous.location_name.trim() || inferredCountry,
    }));
  }, [form.location_country, form.location_name, form.phone, onChange]);

  // One-line row summaries for the canvas — what the block currently says.
  const experienceSummary = [
    petExperienceSpeciesValues.join(", "),
    form.experience_years.trim() ? `${form.experience_years} yr${form.experience_years.trim() === "1" ? "" : "s"}` : "",
    form.availability_status.join(" · "),
  ].filter(Boolean).join(" · ");
  const educationSummary = [form.degree, form.school, form.major].map((value) => value.trim()).filter(Boolean).join(" · ");
  const locationSummary = form.location_name.trim() || [form.location_district, form.location_country].map((value) => value.trim()).filter(Boolean).join(", ");

  return (
    <View style={styles.root}>
      <NativeProfileProgressTrack progress={progress} />
      <View ref={photoSectionRef}>
      <NativeProfilePhotoSlots
        accessToken={accessToken}
        coverError={Boolean(errors.photos)}
        onCaptionAutosave={onProfilePhotoCaptionAutosave}
        onCaptionCommit={onProfilePhotoCaptionCommit}
        onChange={(next) => onChange((previous) => ({
          ...previous,
          photos: typeof next === "function" ? next(previous.photos) : next,
        }))}
        onError={onError}
        onPhotosCommit={onProfilePhotosCommit}
        onPreviousPathQueued={onPreviousPhotoPathQueued}
        photos={form.photos}
        userId={userId}
        version={photosVersion}
      />
      </View>

      {/* ——— The canvas: the profile as an editable page ——— */}
      <Pressable
        accessibilityLabel="Edit your bio"
        accessibilityRole="button"
        onPress={() => openEditor("bio")}
        style={({ pressed }) => [styles.canvasQuote, pressed ? styles.pressed : null]}
      >
        {form.bio.trim() ? (
          <>
            <Text style={styles.canvasQuoteMark}>“</Text>
            <Text numberOfLines={4} style={styles.canvasQuoteText}>{form.bio.trim()}</Text>
          </>
        ) : (
          <>
            <Text style={styles.canvasQuoteMarkGhost}>“</Text>
            <Text style={styles.canvasQuoteInvite}>Say something only you would say.</Text>
          </>
        )}
        <View style={styles.canvasQuoteMeta}>
          {form.bio.trim() && !form.show_bio ? <Feather color={huddleColors.iconSubtle} name="eye-off" size={13} /> : null}
          <Feather color={huddleColors.iconSubtle} name="edit-3" size={13} />
        </View>
      </Pressable>

      <Text style={styles.canvasEyebrow}>Your pet life</Text>
      <View style={styles.canvasGroup}>
        <CanvasRow
          error={Boolean(errors.pet_experience || errors.experience_years || errors.availability_status) || form.availability_status.length === 0}
          materialIcon="paw"
          label="Experience & roles"
          onPress={() => openEditor("experience")}
          value={experienceSummary}
        />
      </View>

      <Text style={styles.canvasEyebrow}>A bit about you</Text>
      <View style={styles.canvasGroup}>
        <CanvasRow error={Boolean(errors.display_name)} icon="user" label="Name" onPress={() => openEditor("name")} value={form.display_name} />
        <CanvasRow hidden={!form.show_gender} error={Boolean(errors.gender_genre)} materialIcon="account-circle-outline" label="Gender" onPress={() => openEditor("gender")} value={form.gender_genre} />
        <CanvasRow hidden={!form.show_orientation} icon="heart" label="Orientation" onPress={() => openEditor("orientation")} value={form.orientation} />
        <CanvasRow hidden={!form.show_height} error={Boolean(errors.height)} materialIcon="ruler" label="Height" onPress={() => openEditor("height")} value={form.height.trim() ? `${form.height} cm` : ""} />
        <CanvasRow hidden={!form.show_academic} error={Boolean(errors.school || errors.major)} materialIcon="school-outline" label="Education" onPress={() => openEditor("education")} value={educationSummary} />
        <CanvasRow hidden={!form.show_occupation} error={Boolean(errors.occupation)} materialIcon="briefcase-outline" label="Work" onPress={() => openEditor("occupation")} value={form.occupation} />
        <CanvasRow hidden={!form.show_affiliation} materialIcon="bank-outline" label="Affiliation" onPress={() => openEditor("affiliation")} value={form.affiliation} />
        <CanvasRow hidden={!form.show_languages} materialIcon="translate" label="Languages" onPress={() => openEditor("languages")} value={form.languages.join(", ")} />
        <CanvasRow hidden={!form.show_relationship_status} icon="heart" label="Relationship" onPress={() => openEditor("relationship")} value={form.relationship_status} />
        <CanvasRow hidden={!form.show_location} error={Boolean(errors.location)} icon="map-pin" label="Location" onPress={() => openEditor("location")} value={locationSummary} />
        {mode === "onboarding" ? (
          <CanvasRow
            error={Boolean(errors.phone || errors.dob || errors.social_id)}
            icon="shield"
            label="Identity & account"
            onPress={() => openEditor("identity")}
            value={[form.social_id.trim() ? `@${form.social_id.trim()}` : "", form.phone.trim(), form.dob.trim()].filter(Boolean).join(" · ")}
          />
        ) : null}
      </View>
      <View style={styles.canvasGroup}>
        <ToggleRow icon="car" label="Can you drive pets around?" onChange={(value) => setField("has_car", value)} subtitle="Handy for rides to the vet or playdates" value={form.has_car} />
      </View>

      {/* ——— Focused editors: one moment each ——— */}
      <NativeFocusedEditor onClose={closeEditor} subtitle="A line that’s so you. It sits right up top — make it count." title="Say hi in your words" visible={activeEditor === "bio"}>
        <TextField label="Bio" multiline onChangeText={(value) => setField("bio", value)} placeholder="Tell others about yourself..." value={form.bio} visibility visibilityValue={form.show_bio} onVisibilityToggle={(value) => setVisibility("show_bio", value)} />
      </NativeFocusedEditor>

      <NativeFocusedEditor onClose={closeEditor} subtitle="What should everyone call you around here?" title="Your name" visible={activeEditor === "name"}>
        <EditableTextField
          editing={displayNameEditMode}
          error={errors.display_name}
          label="Display/User Name"
          editLockedMessage={displayNameCooldown?.locked ? displayNameCooldown.lockedMessage : undefined}
          helperText={displayNameCooldown?.locked && displayNameCooldownNoticeVisible ? displayNameCooldown.helperText : undefined}
          onChangeText={(value) => setField("display_name", value)}
          onEdit={() => {
            setDisplayNameCooldownNoticeVisible(true);
            if (displayNameCooldown?.locked) {
              onError?.(displayNameCooldown.lockedMessage);
              return;
            }
            setDisplayNameEditMode(true);
            setSocialIdEditMode(false);
            setPhoneEditMode(false);
          }}
          onSave={() => setDisplayNameEditMode(false)}
          placeholder="Your display name"
          value={form.display_name}
        />
      </NativeFocusedEditor>

      <NativeFocusedEditor onClose={closeEditor} subtitle="The essentials — kept private and only used to keep huddle safe." title="Identity & account" visible={activeEditor === "identity"}>
        {email || mode === "onboarding" ? <EmailVerifiedField value={email || "—"} /> : null}
        <View style={styles.afterPhoneRow}>
          <View>
            {verifiedLegalName ? <ReadOnlyField label="Legal Name" value={verifiedLegalName} /> : null}
            {verifiedNationality ? <ReadOnlyField label="Nationality" value={verifiedNationality} /> : null}
            {verifiedDocumentGender ? <ReadOnlyField label="Gender" value={verifiedDocumentGender} /> : null}
            {identityFieldsLocked ? (
              <ReadOnlyField
                label="Date of Birth"
                value={form.dob || "-"}
              />
            ) : (
              <>
              <NativeFormTextField
                error={errors.dob}
                fieldAccessory={(
                  <Pressable
                    accessibilityLabel="Open date of birth calendar"
                    accessibilityRole="button"
                    onPress={() => {
                      Keyboard.dismiss();
                      setDobPickerOpen((current) => !current);
                    }}
                    style={styles.inlineIconButton}
                  >
                    <Feather color={huddleColors.iconMuted} name="calendar" size={16} />
                  </Pressable>
                )}
                keyboardType="numbers-and-punctuation"
                label="Date of Birth"
                onChangeText={(value) => {
                  const cleaned = value.replace(/[^\d-]/g, "").slice(0, 10);
                  setField("dob", cleaned);
                }}
                onFocus={() => {
                  setDobPickerOpen(false);
                }}
                placeholder="YYYY-MM-DD"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                textContentType="birthdate"
                value={form.dob}
              />
              <InlineDobPicker
                onChange={(value) => {
                  setField("dob", value);
                  setDobPickerOpen(false);
                }}
                value={form.dob}
                visible={dobPickerOpen}
              />
              </>
            )}
            {!errors.dob && showDiscoverAgeInfo ? (
              <Text style={[styles.helperText, styles.dobHelperText]}>Some features are available to people aged 16+.</Text>
            ) : null}
          </View>
        </View>
        <EditableTextField
          editing={displayNameEditMode}
          error={errors.display_name}
          label="Display/User Name"
          editLockedMessage={displayNameCooldown?.locked ? displayNameCooldown.lockedMessage : undefined}
          helperText={displayNameCooldown?.locked && displayNameCooldownNoticeVisible ? displayNameCooldown.helperText : undefined}
          onChangeText={(value) => setField("display_name", value)}
          onEdit={() => {
            setDisplayNameCooldownNoticeVisible(true);
            if (displayNameCooldown?.locked) {
              onError?.(displayNameCooldown.lockedMessage);
              return;
            }
            setDisplayNameEditMode(true);
            setSocialIdEditMode(false);
            setPhoneEditMode(false);
          }}
          onSave={() => setDisplayNameEditMode(false)}
          placeholder="Your display name"
          value={form.display_name}
        />
        <EditableTextField
          editing={socialIdEditMode}
          error={errors.social_id}
          label="Social ID"
          editLockedMessage={socialIdCooldown?.locked ? socialIdCooldown.lockedMessage : undefined}
          helperText={socialIdCooldown?.locked && socialIdCooldownNoticeVisible ? socialIdCooldown.helperText : undefined}
          onChangeText={(value) => setField("social_id", value.toLowerCase().replace(/[^a-z0-9._]/g, ""))}
          onEdit={() => {
            setSocialIdCooldownNoticeVisible(true);
            if (socialIdCooldown?.locked) {
              onError?.(socialIdCooldown.lockedMessage);
              return;
            }
            setSocialIdEditMode(true);
            setDisplayNameEditMode(false);
            setPhoneEditMode(false);
          }}
          onSave={() => setSocialIdEditMode(false)}
          prefix="@"
          value={form.social_id}
        />
        {socialIdEditMode && !errors.social_id && socialIdStatus === "checking" ? (
          <Text style={styles.helperText}>Checking Social ID...</Text>
        ) : null}
        {socialIdEditMode && !socialIdCooldown?.locked && !errors.social_id && socialIdStatus === "available" ? (
          <Text style={styles.successText}>Social ID is available</Text>
        ) : null}
        {socialIdEditMode && !errors.social_id && socialIdStatus === "failed" ? (
          <Text style={styles.helperText}>Oops! We couldn't check Social ID. Try again.</Text>
        ) : null}
        <View>
          <EditablePhoneField
            defaultCountryCode={defaultPhoneCountry}
            editing={phoneEditMode}
            error={errors.phone}
            onChangeText={(value) => setField("phone", value)}
            onEdit={() => {
              setDisplayNameEditMode(false);
              setSocialIdEditMode(false);
              setPhoneEditMode(true);
            }}
            onSave={async () => {
              const shouldClose = await onPhoneInlineSave?.();
              if (shouldClose !== false) setPhoneEditMode(false);
              return shouldClose ?? true;
            }}
            onOtpRequest={onPhoneOtpRequest}
            otpCooldown={phoneOtpCooldown}
            otpDisabled={phoneOtpBusy || phoneOtpUnavailable || phoneOtpCooldown > 0 || !phoneOtpCanRequest}
            otpVisible={phoneRequiresVerification}
            value={form.phone}
          />
        </View>
        {phoneEditMode && phoneRequiresVerification ? (
          <View style={styles.otpBlock}>
            {!phoneOtpUnavailable ? phoneOtpTurnstile : null}
            {phoneOtpUnavailable ? (
              <View style={styles.otpUnavailableCard}>
                <Text style={styles.otpUnavailableTitle}>Unavailable</Text>
              </View>
            ) : null}
            {phoneOtpVerified ? (
              <View style={styles.otpActionRow}>
                <View style={styles.verifiedBadge}>
                  <Feather color={huddleColors.blue} name="check" size={14} />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              </View>
            ) : null}
            {phoneOtpRequested && !phoneOtpVerified ? (
              <View style={styles.otpCodeGroup}>
                <NativeFormTextField
                  fieldAccessory={(
                    <Pressable
                      disabled={phoneOtpBusy || phoneOtpCode.length < 6}
                      onPress={onPhoneOtpVerify}
                      style={({ pressed }) => [
                        styles.inlinePrimaryButton,
                        (pressed || phoneOtpBusy || phoneOtpCode.length < 6) ? styles.inlinePrimaryButtonDisabled : null,
                      ]}
                    >
                      <Text style={styles.inlinePrimaryButtonText}>Verify</Text>
                    </Pressable>
                  )}
                  keyboardType="numeric"
                  label="Verification code"
                  maxLength={6}
                  onChangeText={(value) => onPhoneOtpCodeChange?.(value.replace(/[^\d]/g, ""))}
                  placeholder="6-digit code"
                  value={phoneOtpCode}
                />
                {phoneOtpMessage ? <Text style={styles.helperText}>{phoneOtpMessage}</Text> : null}
              </View>
            ) : null}
            {!phoneOtpRequested && phoneOtpMessage ? <Text style={styles.helperText}>{phoneOtpMessage}</Text> : null}
          </View>
        ) : null}
      </NativeFocusedEditor>

      <NativeFocusedEditor onClose={closeEditor} subtitle="However you identify — it’s your call." title="Your gender" visible={activeEditor === "gender"}>
        <SelectField error={errors.gender_genre} label="Gender" onVisibilityToggle={(value) => setVisibility("show_gender", value)} options={nativeGenderOptions} values={form.gender_genre ? [form.gender_genre] : []} visibility visibilityValue={form.show_gender} onChange={([value]) => setField("gender_genre", value || "")} />
      </NativeFocusedEditor>

      <NativeFocusedEditor onClose={closeEditor} subtitle="Share it if you’d like — totally optional." title="Your orientation" visible={activeEditor === "orientation"}>
        <SelectField label="Sexual Orientation" onVisibilityToggle={(value) => setVisibility("show_orientation", value)} options={nativeOrientationOptions} values={form.orientation ? [form.orientation] : []} visibility visibilityValue={form.show_orientation} onChange={([value]) => setField("orientation", value || "")} />
      </NativeFocusedEditor>

      <NativeFocusedEditor onClose={closeEditor} subtitle="In centimetres. Optional — round however you like." title="How tall are you?" visible={activeEditor === "height"}>
        <NativeFormTextField
          error={errors.height}
          fieldAccessory={<Text style={styles.unitSuffix}>cm</Text>}
          keyboardType="numeric"
          label="Height"
          maxLength={3}
          // Digits only, no leading zeros — so "000" or a stray "0" never sticks.
          onChangeText={(value) => setField("height", value.replace(/[^\d]/g, "").replace(/^0+/, ""))}
          placeholder="e.g. 170"
          rightAccessory={<VisibilityControl onToggle={(value) => setVisibility("show_height", value)} value={form.show_height} />}
          value={form.height}
        />
      </NativeFocusedEditor>

      <NativeFocusedEditor onClose={closeEditor} subtitle="Brag a little about the animals you’ve loved." title="Your pet life" visible={activeEditor === "experience"}>
        <View style={styles.compactFieldGroup}>
        <View style={styles.inlineRow}>
          <View style={styles.inlineGrow}>
            <SelectField
              error={errors.pet_experience}
              label="Experience with"
              multi
              disabledOptions={hasPets ? new Set(["None"]) : undefined}
              optionIcon={(option) => (option === "None" ? null : nativePetEmojiForLabel(option))}
              options={[...nativePetFocusLabels, "None"]}
              values={petExperienceSpeciesValues}
              onChange={(values) => {
                if (values.includes("None")) {
                  setField("pet_experience", ["None"]);
                  setField("experience_years", "");
                  return;
                }

                const nextSpecies = values.filter((item) => item !== "None");
                const next = nextSpecies.map((species) => {
                  const existingBreed = petExperienceParsed.find((item) => item.species === species)?.breed;
                  return buildProfilePetExperienceLabel(species, existingBreed);
                });
                setField("pet_experience", next);
              }}
            />
          </View>
          <View style={styles.yearsColumn}>
            <TextField error={errors.experience_years} keyboardType="numeric" label="Years" maxLength={2} onChangeText={(value) => setField("experience_years", value.replace(/[^\d]/g, "").slice(0, 2))} onSubmitEditing={() => Keyboard.dismiss()} placeholder="0" returnKeyType="done" value={form.experience_years} />
          </View>
        </View>
        {breedTargetSpeciesList.map((breedTargetSpecies) => {
          const breedTargetValues = petExperienceParsed
            .filter((item) => item.species === breedTargetSpecies)
            .map((item) => item.breed)
            .filter((item): item is string => Boolean(item));
          const breedOptionsForTarget = getBreedOptionsForSpecies(speciesIdForProfileLabel(breedTargetSpecies));

          return (
            <View key={`breed-${breedTargetSpecies}`} style={styles.breedFieldBlock}>
              <SelectField
                label=""
                multi
                options={breedOptionsForTarget}
                placeholder={`Select ${breedTargetSpecies.replace(/s$/, "").toLowerCase()} breed`}
                values={breedTargetValues}
                onChange={(values) => {
                  const nextBySpecies = new Map<string, string[]>();

                  for (const species of breedTargetSpeciesList) {
                    if (species === breedTargetSpecies) {
                      nextBySpecies.set(
                        species,
                        values.length > 0
                          ? values.map((breed) => buildProfilePetExperienceLabel(species, breed))
                          : [buildProfilePetExperienceLabel(species)],
                      );
                      continue;
                    }

                    const existing = form.pet_experience.filter((item) => parseProfilePetExperienceLabel(item).species === species);
                    nextBySpecies.set(species, existing.length > 0 ? existing : [buildProfilePetExperienceLabel(species)]);
                  }

                  setField("pet_experience", breedTargetSpeciesList.flatMap((species) => nextBySpecies.get(species) ?? []));
                }}
              />
            </View>
          );
        })}
        </View>
        <ToggleRow disabled={activePetCount > 0} label="Currently own pets?" onChange={(value) => {
          onChange((previous) => ({
            ...previous,
            owns_pets: value,
            pet_experience: value ? previous.pet_experience.filter((item) => item !== "None") : previous.pet_experience,
            availability_status: value
              ? updateList(previous.availability_status.filter((item) => item !== "Animal Friend (No Pet)"), "Pet Parent")
              : previous.availability_status.filter((item) => item !== "Pet Parent"),
          }));
        }} value={activePetCount > 0 ? true : form.owns_pets} />
        <View>
          <SelectField
            disabledOptions={disabledRoleOptions}
            error={errors.availability_status || (form.availability_status.length === 0 ? "Required to connect" : undefined)}
            label="What should others know you as?"
            multi
            onChange={(values) => {
              const hasPetParent = values.includes("Pet Parent");
              const hasAnimalFriend = values.includes("Animal Friend (No Pet)");
              const next = hasPetParent && hasAnimalFriend
                ? values.filter((item) => item !== (hasPets ? "Animal Friend (No Pet)" : "Pet Parent"))
                : values;
              setField("availability_status", next);
            }}
            options={nativeAvailabilityOptions}
            values={form.availability_status.filter((item) => nativeAvailabilityOptions.includes(item))}
          />
        </View>
      </NativeFocusedEditor>

      <NativeFocusedEditor onClose={closeEditor} subtitle="Where you studied, if you want to share it." title="Your studies" visible={activeEditor === "education"}>
        <View style={styles.webFieldStack}>
          <SelectField compact label="Highest Degree" options={nativeDegreeOptions} values={form.degree ? [form.degree] : []} onChange={([value]) => setField("degree", value || "")} visibility visibilityValue={form.show_academic} onVisibilityToggle={(value) => setVisibility("show_academic", value)} />
          <NativeFormTextField compact error={errors.school} label="" onChangeText={(value) => setField("school", value)} onSubmitEditing={() => majorFieldRef.current?.focus()} placeholder="School name" returnKeyType="next" value={form.school} />
          <NativeFormTextField ref={majorFieldRef} compact error={errors.major} label="" onChangeText={(value) => setField("major", value)} onSubmitEditing={() => Keyboard.dismiss()} placeholder="Major / field of study" returnKeyType="done" value={form.major} />
        </View>
      </NativeFocusedEditor>

      <NativeFocusedEditor onClose={closeEditor} subtitle="Shelters, clubs, the crews you run with." title="Your affiliations" visible={activeEditor === "affiliation"}>
        <TextField label="Affiliation" multiline onChangeText={(value) => setField("affiliation", value)} placeholder="Shelters, clubs, organizations..." value={form.affiliation} visibility visibilityValue={form.show_affiliation} onVisibilityToggle={(value) => setVisibility("show_affiliation", value)} />
      </NativeFocusedEditor>

      <NativeFocusedEditor onClose={closeEditor} subtitle="What keeps you busy these days?" title="Your work" visible={activeEditor === "occupation"}>
        <TextField error={errors.occupation} label="Occupation" onChangeText={(value) => setField("occupation", value)} onSubmitEditing={() => Keyboard.dismiss()} returnKeyType="done" value={form.occupation} visibility visibilityValue={form.show_occupation} onVisibilityToggle={(value) => setVisibility("show_occupation", value)} />
      </NativeFocusedEditor>

      <NativeFocusedEditor onClose={closeEditor} subtitle="Only if you feel like sharing." title="Relationship status" visible={activeEditor === "relationship"}>
        <SelectField label="Relationship Status" onVisibilityToggle={(value) => setVisibility("show_relationship_status", value)} options={nativeRelationshipOptions} values={form.relationship_status ? [form.relationship_status] : []} visibility visibilityValue={form.show_relationship_status} onChange={([value]) => setField("relationship_status", value || "")} />
      </NativeFocusedEditor>

      <NativeFocusedEditor onClose={closeEditor} subtitle="Search and tap the ones you speak." title="Which languages do you speak?" visible={activeEditor === "languages"}>
        <NativeBadgePicker
          header={(
            <View style={styles.badgeVisibilityRow}>
              <Text style={styles.badgeVisibilityLabel}>Show on profile</Text>
              <VisibilityControl onToggle={(value) => setVisibility("show_languages", value)} value={form.show_languages} />
            </View>
          )}
          onChange={(values) => setField("languages", values)}
          options={nativeLanguageOptions}
          searchPlaceholder="Search languages"
          values={form.languages}
        />
      </NativeFocusedEditor>

      <NativeFocusedEditor onClose={closeEditor} subtitle="Helps nearby pet people find you." title="Where are you based?" visible={activeEditor === "location"}>
        <View style={styles.locationGroup}>
          <View style={styles.locationHeader}>
            <Text style={styles.webLabel}>Location</Text>
            <VisibilityControl onToggle={(value) => setVisibility("show_location", value)} value={form.show_location} />
          </View>
          <View style={styles.webFieldStack}>
            <SelectField
              compact
              label=""
              options={nativeCountryOptions}
              placeholder="Country"
              searchable
              searchPlaceholder="Find country"
              values={form.location_country ? [form.location_country] : []}
              onChange={([value]) => {
                const nextCountry = value || "";
                onLocationFocusChange?.(false);
                onChange((previous) => ({
                  ...(() => {
                    const next = {
                      ...previous,
                      location_country: nextCountry,
                      location_district: "",
                      location_name: nextCountry,
                    };
                    next.show_location = visibilityContentReady("show_location", next);
                    return next;
                  })(),
                }));
              }}
            />
            <View ref={locationTextFieldRef}>
              <NativeFormTextField
                compact
                error={errors.location}
              leftAccessory={onLocationPinResolved ? (
                <NativeLocationPinButton
                  onError={onError}
                  onResolved={onLocationPinResolved}
                  style={styles.locationFieldPin}
                />
              ) : undefined}
              label=""
              onBlur={() => {
                setTimeout(() => onLocationFocusChange?.(false), 140);
              }}
	              onChangeText={(value) => {
	                onLocationFocusChange?.(true);
	                onLocationTextChange?.();
	                setField("location_district", value);
                onChange((previous) => {
                  const next = { ...previous, location_district: value, location_name: `${value}${previous.location_country ? `, ${previous.location_country}` : ""}`.trim() };
                  next.show_location = visibilityContentReady("show_location", next);
                  return next;
                });
              }}
              onFocus={() => {
                onLocationFocusChange?.(true);
              }}
              placeholder="District / Area"
              value={form.location_district}
              />
            </View>
          </View>
          {locationLoading ? <NativeSpinner tone="muted" style={styles.locationSpinner} /> : null}
          {locationSuggestionsOpen && locationSuggestions.length > 0 ? (
            <ScrollView
              contentContainerStyle={styles.suggestionMenuContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator
              style={styles.suggestionMenu}
            >
              {locationSuggestions.map((item) => (
                <Pressable
                  accessibilityRole="button"
                  key={`${item.label}:${item.lat}:${item.lng}`}
                  onPress={() => onLocationSuggestionSelect?.(item)}
                  style={({ pressed }) => [styles.suggestionRow, pressed ? styles.pressed : null]}
                >
                  <Text numberOfLines={2} style={styles.suggestionText}>{item.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>
      </NativeFocusedEditor>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: huddleSpacing.x4,
  },
  // ——— Canvas (tap-to-edit page) ———
  canvasQuote: {
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x5,
    borderRadius: huddleRadii.glass,
    backgroundColor: huddleColors.canvas,
    borderWidth: 1,
    borderColor: huddleColors.cardBorderSoft,
    ...huddleShadows.glassElevation1,
  },
  canvasQuoteMark: {
    fontFamily: "Urbanist-800",
    fontSize: 34,
    lineHeight: 26,
    color: huddleColors.primarySoftFill,
  },
  canvasQuoteMarkGhost: {
    fontFamily: "Urbanist-800",
    fontSize: 34,
    lineHeight: 26,
    color: huddleColors.sectionDividerStrong,
  },
  canvasQuoteText: {
    marginTop: huddleSpacing.x1,
    fontFamily: "Urbanist-600Italic",
    fontSize: 17,
    lineHeight: 27,
    color: huddleColors.text,
  },
  canvasQuoteInvite: {
    marginTop: huddleSpacing.x1,
    fontFamily: "Urbanist-600",
    fontSize: 15,
    lineHeight: 22,
    color: huddleColors.mutedText,
  },
  canvasQuoteMeta: {
    marginTop: huddleSpacing.x3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: huddleSpacing.x2,
  },
  canvasEyebrow: {
    marginTop: huddleSpacing.x2,
    marginBottom: -huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: huddleColors.mutedText,
  },
  canvasGroup: {
    borderRadius: huddleRadii.glass,
    backgroundColor: huddleColors.canvas,
    borderWidth: 1,
    borderColor: huddleColors.cardBorderSoft,
    overflow: "hidden",
    ...huddleShadows.glassElevation1,
  },
  canvasRow: {
    minHeight: huddleLayout.minTouch + 10,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: huddleColors.divider,
  },
  canvasRowIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: huddleColors.mutedCanvas,
  },
  canvasRowCopy: {
    flex: 1,
    minWidth: 0,
    gap: huddleSpacing.x1 + 2,
  },
  canvasRowLabel: {
    fontFamily: "Urbanist-700",
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: huddleColors.mutedText,
  },
  canvasRowValue: {
    fontFamily: "Urbanist-600",
    fontSize: 16,
    lineHeight: 21,
    color: huddleColors.text,
  },
  canvasRowInvite: {
    color: huddleColors.mutedText,
  },
  canvasErrorDot: {
    width: 7,
    height: 7,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.validationRed,
  },
  badgeVisibilityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
  },
  badgeVisibilityLabel: {
    fontFamily: "Urbanist-600",
    fontSize: huddleFormFields.valueSize,
    color: huddleColors.text,
  },
  section: {
    gap: huddleSpacing.x3,
  },
  sectionBody: {
    gap: huddleSpacing.x5,
  },
  addMoreRow: {
    minHeight: huddleLayout.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  addMoreText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.blue,
  },
  sectionTitle: {
    flex: 1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: huddleColors.mutedText,
  },
  sectionHeaderRow: {
    minHeight: huddleSpacing.x5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
  },
  label: {
    flex: 1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: huddleColors.mutedText,
  },
  emailValueRow: {
    minHeight: huddleLayout.fieldHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  emailValueText: {
    flex: 1,
    minWidth: 0,
    fontFamily: "Urbanist-500",
    fontSize: huddleFormFields.valueSize,
    lineHeight: huddleFormFields.valueLine,
    color: huddleColors.text,
  },
  emailVerifiedChip: {
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.mutedCanvas,
    paddingHorizontal: huddleSpacing.x3,
  },
  emailVerifiedText: {
    fontFamily: "Urbanist-700",
    fontSize: 11,
    lineHeight: 14,
    color: huddleColors.mutedText,
  },
  editablePhoneField: {
    gap: huddleSpacing.x2,
  },
  editablePhoneHeader: {
    minHeight: huddleSpacing.x5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
  },
  visibilityToggle: {
    height: huddleType.labelLine,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  inlineRow: {
    flexDirection: "row",
    gap: huddleSpacing.x3,
    alignItems: "flex-start",
  },
  afterPhoneRow: {
    marginTop: huddleSpacing.x2,
  },
  inlineDateColumns: {
    flexDirection: "row",
    gap: huddleSpacing.x2,
    marginTop: huddleSpacing.x2,
  },
  inlineDateColumn: {
    flex: 1,
    maxHeight: 180,
    borderRadius: huddleRadii.field,
    backgroundColor: huddleColors.mutedCanvas,
  },
  inlineDateOption: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.field,
  },
  inlineDateOptionActive: {
    backgroundColor: huddleColors.blue,
  },
  inlineDateOptionText: {
    color: huddleColors.text,
    fontFamily: "Urbanist-600",
    fontSize: 14,
  },
  inlineDateOptionTextActive: {
    color: huddleColors.onPrimary,
  },
  inlineGrow: {
    flex: 1,
  },
  breedFieldBlock: {
    marginTop: 0,
  },
  yearsColumn: {
    width: 112,
  },
  otpBlock: {
    gap: huddleSpacing.x2,
  },
  otpCodeGroup: {
    gap: huddleSpacing.x2,
  },
  otpActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  otpUnavailableCard: {
    borderWidth: 1,
    borderColor: huddleFormControls.select.menuBorderColor,
    borderRadius: 10,
    backgroundColor: huddleColors.mutedCanvas,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x2,
  },
  otpUnavailableTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
  },
  inlinePrimaryButton: {
    minHeight: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x2,
    ...huddleButtons.primary,
  },
  inlinePrimaryButtonDisabled: {
    backgroundColor: huddleColors.fieldBorder,
  },
  inlinePrimaryButtonText: {
    fontFamily: "Urbanist-600",
    fontSize: 12,
    lineHeight: 16,
    color: huddleColors.onPrimary,
  },
  phoneOtpInlineButton: {
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: huddleColors.blue,
    paddingHorizontal: huddleSpacing.x2,
  },
  phoneOtpInlineDisabled: {
    backgroundColor: huddleColors.fieldBorder,
  },
  phoneOtpInlineText: {
    fontFamily: "Urbanist-700",
    fontSize: 11,
    lineHeight: 14,
    color: huddleColors.onPrimary,
  },
  phoneSaveInlineButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: huddleColors.canvas,
  },
  inlineIconButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedBadge: {
    minHeight: huddleLayout.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x1,
  },
  verifiedText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    color: huddleColors.blue,
  },
  helperText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
  },
  dobHelperText: {
    marginTop: huddleSpacing.x1,
  },
  warningText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.validationRed,
  },
  successText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.success,
  },
  unitSuffix: {
    fontFamily: "Urbanist-500",
    fontSize: 14,
    color: huddleColors.mutedText,
  },
  locationGroup: {
    position: "relative",
    zIndex: 2,
    gap: huddleSpacing.x2,
  },
  webFieldStack: {
    gap: huddleSpacing.x1,
  },
  compactFieldGroup: {
    gap: huddleSpacing.x1,
  },
  locationHeader: {
    minHeight: huddleSpacing.x5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
  },
  webLabel: {
    flex: 1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: huddleColors.mutedText,
  },
  locationHelper: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
  },
  locationSpinner: {
    alignSelf: "flex-start",
  },
  locationFieldPin: {
    marginLeft: -huddleSpacing.x2,
    marginRight: -huddleSpacing.x1,
  },
  suggestionMenu: {
    position: "absolute",
    top: 134,
    left: 0,
    right: 0,
    zIndex: 20,
    maxHeight: huddleFormControls.select.menuMaxHeight,
    borderRadius: huddleFormControls.select.menuRadius,
    borderWidth: 1,
    borderColor: huddleFormControls.select.menuBorderColor,
    backgroundColor: huddleColors.canvas,
    overflow: "hidden",
    elevation: 8,
  },
  suggestionMenuContent: {
    padding: huddleFormControls.select.menuPadding,
  },
  suggestionRow: {
    minHeight: huddleFormControls.select.optionMinHeight,
    justifyContent: "center",
    borderRadius: huddleFormControls.select.optionRadius,
    paddingHorizontal: huddleFormControls.select.optionPaddingHorizontal,
    paddingVertical: huddleFormControls.select.optionPaddingVertical,
  },
  suggestionText: {
    fontFamily: "Urbanist-500",
    fontSize: 14,
    lineHeight: 18,
    color: huddleColors.text,
  },
  toggleRow: {
    minHeight: huddleLayout.ctaHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x3,
    borderRadius: huddleRadii.card,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.glassChrome,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x3,
    ...huddleShadows.glassElevation1,
  },
  toggleCopy: {
    flex: 1,
  },
  toggleContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
  },
  toggleLabel: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    color: huddleColors.text,
  },
  toggleSubtitle: {
    marginTop: huddleSpacing.x1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    color: huddleColors.subtext,
  },
  switchTrack: {
    ...huddleGlassControls.toggleSurface,
    width: huddleToggle.trackWidth,
    height: huddleToggle.trackHeight,
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    paddingHorizontal: huddleToggle.trackPaddingHorizontal,
  },
  switchTrackOn: {
    backgroundColor: huddleColors.blue,
  },
  visibilitySwitchTrack: {
    ...huddleGlassControls.toggleSurface,
    width: huddleToggle.visibilityTrackWidth,
    height: huddleToggle.trackHeight,
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    paddingHorizontal: huddleToggle.trackPaddingHorizontal,
  },
  visibilitySwitchTrackOn: {
    backgroundColor: huddleColors.blue,
  },
  visibilitySwitchIcon: {
    position: "absolute",
    top: (huddleToggle.trackHeight - 15) / 2,
    zIndex: 1,
  },
  visibilitySwitchIconOn: {
    left: huddleToggle.visibilityIconLeft,
  },
  visibilitySwitchIconOff: {
    right: huddleToggle.visibilityIconLeft,
  },
  switchThumb: {
    width: huddleToggle.thumbSize,
    height: huddleToggle.thumbSize,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.canvas,
  },
  switchThumbOn: {
    alignSelf: "flex-end",
  },
  visibilityHeaderControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  selectTrigger: {
    minHeight: huddleLayout.fieldHeight - 2,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: "transparent",
  },
  selectTriggerFocused: {
    backgroundColor: "transparent",
  },
  selectValue: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleFormFields.valueSize,
    lineHeight: huddleFormFields.valueLine,
    color: huddleColors.text,
  },
  placeholderText: {
    color: huddleColors.mutedText,
  },
  selectMenu: {
    marginTop: huddleSpacing.x2,
    maxHeight: huddleFormControls.select.menuMaxHeight,
    borderRadius: huddleFormControls.select.menuRadius,
    borderWidth: 0,
    backgroundColor: huddleColors.canvas,
    padding: huddleFormControls.select.menuPadding,
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  selectSearchWrap: {
    marginBottom: huddleSpacing.x1,
    paddingHorizontal: huddleSpacing.x3,
    paddingBottom: huddleSpacing.x1,
  },
  selectSearchInput: {
    flexShrink: 1,
    minWidth: 0,
    minHeight: 32,
    borderRadius: huddleRadii.field,
    backgroundColor: "transparent",
    paddingHorizontal: huddleSpacing.x2,
    paddingVertical: huddleSpacing.x1,
    fontFamily: "Urbanist-500",
    fontSize: 14,
    lineHeight: 18,
    includeFontPadding: false,
    color: huddleColors.text,
    overflow: "hidden",
  },
  dropdownLayer: {
    zIndex: 30,
    elevation: 8,
  },
  selectOption: {
    minHeight: huddleFormControls.select.optionMinHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
    borderRadius: huddleFormControls.select.optionRadius,
    paddingHorizontal: huddleFormControls.select.optionPaddingHorizontal,
    paddingVertical: huddleFormControls.select.optionPaddingVertical,
  },
  selectOptionText: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: 14,
    color: huddleColors.text,
  },
  selectOptionLabelRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  selectOptionEmoji: {
    fontSize: 17,
    lineHeight: 20,
  },
  selectCheckSlot: {
    width: huddleFormControls.select.checkSlot,
    height: huddleFormControls.select.checkSlot,
  },
  selectEmptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: huddleSpacing.x3,
  },
  selectEmptyStateText: {
    fontFamily: "Urbanist-500",
    fontSize: 13,
    lineHeight: 18,
    color: huddleColors.mutedText,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.78,
  },
});
