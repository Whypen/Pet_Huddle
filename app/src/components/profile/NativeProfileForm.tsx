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
import {
  emptyNativeProfilePhotos,
  type NativeProfilePhotos,
} from "../../lib/nativeProfilePhotos";
import {
  huddleButtons,
  huddleColors,
  huddleFieldStates,
  huddleFormControls,
  huddleFormFields,
  huddleLayout,
  huddleRadii,
  huddleSpacing,
  huddleToggle,
  huddleType,
} from "../../theme/huddleDesignTokens";
import { NativeProfilePhotoSlots } from "./NativeProfilePhotoSlots";
import type { NativeLocationSuggestion } from "../../lib/nativeLocation";
import { PET_FOCUS_OPTIONS, getBreedOptionsForSpecies, nativePetFocusLabels } from "../../lib/nativePetTaxonomy";

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
  if (!displayNamesFactory) return staticNativeCountryOptions;
  const countryDisplayNames = new displayNamesFactory(["en"], { type: "region" });
  return Array.from({ length: 26 * 26 }, (_, idx) => {
    const a = String.fromCharCode(65 + Math.floor(idx / 26));
    const b = String.fromCharCode(65 + (idx % 26));
    const code = `${a}${b}`;
    const label = countryDisplayNames.of(code);
    return label && label !== code && !label.toLowerCase().includes("unknown") ? label : null;
  }).filter((item): item is string => Boolean(item)).sort((a, b) => a.localeCompare(b));
};
export const nativeCountryOptions = buildNativeCountryOptions();

type NativeProfileFormProps = {
  activePetCount: number;
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
  onLocationSuggestionSelect?: (suggestion: NativeLocationSuggestion) => void;
  onPreviousPhotoPathQueued?: (path: string | null) => void;
  onProfilePhotoCaptionAutosave?: (photos: NativeProfilePhotos) => void;
  onProfilePhotoCaptionCommit?: (photos: NativeProfilePhotos) => void;
  onProfilePhotosCommit?: (photos: NativeProfilePhotos) => void;
  accessToken?: string | null;
  onUseCurrentLocation?: () => void;
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
  profileVerified?: boolean;
  savedPhoneVerified?: boolean;
  locationLoading?: boolean;
  locationSuggestions?: NativeLocationSuggestion[];
  locationSuggestionsOpen?: boolean;
  resolvingLocation?: boolean;
  socialIdStatus?: "idle" | "checking" | "available" | "taken" | "failed";
  userId: string | null;
};

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

const resolveNativeCountryCodeFromLabel = (countryName?: string | null) => {
  const target = String(countryName || "").trim().toLowerCase();
  if (!target) return "";
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
  const dob = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 16;
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
            styles.visibilitySwitchIconTilt,
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
                <Text style={styles.selectOptionText}>{option}</Text>
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

function SelectField({
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
  const selectedLabel = values.length > 0 ? values.join(", ") : placeholder ?? (multi ? `Select ${label.toLowerCase()}` : "Select");
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
                  <Text style={styles.selectOptionText}>{option}</Text>
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
  error,
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
  error?: string;
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
      <ReadOnlyField
        fieldAccessory={(
          <Pressable accessibilityLabel={`Edit ${label}`} onPress={onEdit} style={styles.inlineIconButton}>
            <Feather color={huddleColors.iconMuted} name={saveIcon === "check" ? "check" : "edit-2"} size={16} />
          </Pressable>
        )}
        label={label}
        value={`${prefix ?? ""}${value || "—"}`}
      />
    );
  }
  return (
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
  onLocationSuggestionSelect,
  onPhoneOtpRequest,
  onPhoneOtpVerify,
  onPreviousPhotoPathQueued,
  onProfilePhotoCaptionAutosave,
  onProfilePhotoCaptionCommit,
  onProfilePhotosCommit,
  accessToken,
  onUseCurrentLocation,
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
  profileVerified = false,
  savedPhoneVerified = false,
  locationLoading = false,
  locationSuggestions = [],
  locationSuggestionsOpen = false,
  resolvingLocation = false,
  socialIdStatus = "idle",
  userId,
}: NativeProfileFormProps) {
  const hasPets = activePetCount > 0 || form.owns_pets;
  const [displayNameEditMode, setDisplayNameEditMode] = useState(false);
  const [socialIdEditMode, setSocialIdEditMode] = useState(false);
  const [phoneEditMode, setPhoneEditMode] = useState(false);
  const [dobEditMode, setDobEditMode] = useState(false);
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
  const defaultPhoneCountry = inferNativeCountryCodeFromPhone(form.phone) || resolveNativeCountryCodeFromLabel(form.location_country);
  const photoSectionRef = useRef<View | null>(null);
  const displayNameRef = useRef<View | null>(null);
  const socialIdRef = useRef<View | null>(null);
  const phoneRef = useRef<View | null>(null);
  const dobRef = useRef<View | null>(null);
  const genderRef = useRef<View | null>(null);
  const petExperienceRef = useRef<View | null>(null);

  useEffect(() => {
    if (errorFocusRequest <= 0) return;
    const target =
      errors.photos ? { label: "Your photos", ref: photoSectionRef } :
      errors.display_name ? { label: "Display/User Name", ref: displayNameRef } :
      errors.phone ? { label: "Phone", ref: phoneRef } :
      errors.dob ? { label: "Date of Birth", ref: dobRef } :
      errors.social_id ? { label: "Social ID", ref: socialIdRef } :
      errors.gender_genre ? { label: "Gender", ref: genderRef } :
      errors.pet_experience || errors.experience_years ? { label: "Pet experience", ref: petExperienceRef } :
      null;
    if (!target) return;
    setTimeout(() => onDropdownOpen?.(target.label, findNodeHandle(target.ref.current)), 40);
  }, [errorFocusRequest, errors, onDropdownOpen]);

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

  return (
    <View style={styles.root}>
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
      />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Basic Info</Text>
        <ReadOnlyField label="Legal Name" value={profileVerified && form.legal_name.trim() ? form.legal_name : "Available after verification"} />
        <View ref={displayNameRef}>
          <EditableTextField
            editing={displayNameEditMode}
            error={errors.display_name}
            label="Display/User Name"
            onChangeText={(value) => setField("display_name", value)}
            onEdit={() => {
              setDisplayNameEditMode(true);
              setSocialIdEditMode(false);
              setPhoneEditMode(false);
            }}
            onSave={() => setDisplayNameEditMode(false)}
            placeholder="Your display name"
            value={form.display_name}
          />
        </View>
        <View ref={socialIdRef}>
          <EditableTextField
            editing={socialIdEditMode}
            error={errors.social_id}
            label="Social ID"
            onChangeText={(value) => setField("social_id", value.toLowerCase().replace(/[^a-z0-9._]/g, ""))}
            onEdit={() => {
              setSocialIdEditMode(true);
              setDisplayNameEditMode(false);
              setPhoneEditMode(false);
            }}
            onSave={() => setSocialIdEditMode(false)}
            prefix="@"
            value={form.social_id}
          />
        </View>
        {socialIdEditMode && !errors.social_id && socialIdStatus === "checking" ? (
          <Text style={styles.helperText}>Checking Social ID...</Text>
        ) : null}
        {socialIdEditMode && !errors.social_id && socialIdStatus === "available" ? (
          <Text style={styles.successText}>Social ID is available</Text>
        ) : null}
        {socialIdEditMode && !errors.social_id && socialIdStatus === "failed" ? (
          <Text style={styles.helperText}>Oops! We couldn't check Social ID. Try again.</Text>
        ) : null}
        {mode === "onboarding" ? <EmailVerifiedField value={email || "—"} /> : null}
        <View ref={phoneRef}>
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
        <View style={[styles.inlineRow, styles.afterPhoneRow]}>
          <View style={styles.inlineGrow}>
            <View ref={dobRef}>
              {dobEditMode ? (
                <NativeFormTextField
                  error={errors.dob}
                  fieldAccessory={<Feather color={huddleColors.iconMuted} name="calendar" size={16} />}
                  keyboardType="numbers-and-punctuation"
                  label="Date of Birth"
                  onBlur={() => setDobEditMode(false)}
                  onChangeText={(value) => setField("dob", value)}
                  placeholder="YYYY-MM-DD"
                  textContentType="birthdate"
                  value={form.dob}
                />
              ) : (
                <ReadOnlyField
                  fieldAccessory={<Pressable accessibilityLabel="Edit date of birth" onPress={() => setDobEditMode(true)} style={styles.inlineIconButton}><Feather color={huddleColors.iconMuted} name="calendar" size={16} /></Pressable>}
                  label="Date of Birth"
                  value={form.dob || "—"}
                />
              )}
            </View>
            {!errors.dob && showDiscoverAgeInfo ? (
              <Text style={styles.helperText}>You must be 16+ to access Discover feature on Chats.</Text>
            ) : null}
          </View>
          <View style={styles.inlineGrow}>
            <NativeFormTextField
              error={errors.height}
              fieldAccessory={<Text style={styles.unitSuffix}>cm</Text>}
              keyboardType="numeric"
              label="Height"
              onChangeText={(value) => setField("height", value.replace(/[^\d]/g, ""))}
              placeholder="cm"
              rightAccessory={<VisibilityControl onToggle={(value) => setVisibility("show_height", value)} value={form.show_height} />}
              value={form.height}
            />
          </View>
        </View>
        <TextField onFocusRequest={onDropdownOpen} label="Bio" multiline onChangeText={(value) => setField("bio", value)} placeholder="Tell others about yourself..." value={form.bio} visibility visibilityValue={form.show_bio} onVisibilityToggle={(value) => setVisibility("show_bio", value)} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Demographics</Text>
        <View ref={genderRef}>
          <SelectField onFieldFocus={onDropdownOpen} error={errors.gender_genre} label="Gender" onVisibilityToggle={(value) => setVisibility("show_gender", value)} options={nativeGenderOptions} values={form.gender_genre ? [form.gender_genre] : []} visibility visibilityValue={form.show_gender} onChange={([value]) => setField("gender_genre", value || "")} />
        </View>
        <SelectField onFieldFocus={onDropdownOpen} label="Sexual Orientation" onVisibilityToggle={(value) => setVisibility("show_orientation", value)} options={nativeOrientationOptions} values={form.orientation ? [form.orientation] : []} visibility visibilityValue={form.show_orientation} onChange={([value]) => setField("orientation", value || "")} />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Education & Career</Text>
          <VisibilityControl onToggle={(value) => setVisibility("show_academic", value)} value={form.show_academic} />
        </View>
        <View style={styles.webFieldStack}>
          <SelectField onFieldFocus={onDropdownOpen} compact label="Highest Degree" options={nativeDegreeOptions} values={form.degree ? [form.degree] : []} onChange={([value]) => setField("degree", value || "")} />
          <NativeFormTextField compact error={errors.school} label="" onChangeText={(value) => setField("school", value)} onSubmitEditing={() => majorFieldRef.current?.focus()} placeholder="School Name" returnKeyType="next" value={form.school} />
          <NativeFormTextField ref={majorFieldRef} compact error={errors.major} label="" onChangeText={(value) => setField("major", value)} onSubmitEditing={() => Keyboard.dismiss()} placeholder="Major / Field of Study" returnKeyType="done" value={form.major} />
        </View>
        <TextField onFocusRequest={onDropdownOpen} error={errors.occupation} label="Occupation" onChangeText={(value) => setField("occupation", value)} onSubmitEditing={() => Keyboard.dismiss()} returnKeyType="done" value={form.occupation} visibility visibilityValue={form.show_occupation} onVisibilityToggle={(value) => setVisibility("show_occupation", value)} />
      </View>

      <View style={styles.section}>
        <TextField onFocusRequest={onDropdownOpen} label="Affiliation" multiline onChangeText={(value) => setField("affiliation", value)} placeholder="Shelters, clubs, organizations..." value={form.affiliation} visibility visibilityValue={form.show_affiliation} onVisibilityToggle={(value) => setVisibility("show_affiliation", value)} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Social & Lifestyle</Text>
        <SelectField onFieldFocus={onDropdownOpen} label="Relationship Status" onVisibilityToggle={(value) => setVisibility("show_relationship_status", value)} options={nativeRelationshipOptions} values={form.relationship_status ? [form.relationship_status] : []} visibility visibilityValue={form.show_relationship_status} onChange={([value]) => setField("relationship_status", value || "")} />
        <ToggleRow icon="car" label="Pet Driver with Car?" onChange={(value) => setField("has_car", value)} subtitle="Important for pet transport" value={form.has_car} />
        <SelectField onFieldFocus={onDropdownOpen} label="Languages" multi onVisibilityToggle={(value) => setVisibility("show_languages", value)} options={nativeLanguageOptions} values={form.languages} visibility visibilityValue={form.show_languages} onChange={(values) => setField("languages", values)} />
        <View style={styles.locationGroup}>
          <View style={styles.locationHeader}>
            <Text style={styles.webLabel}>Location</Text>
            <VisibilityControl onToggle={(value) => setVisibility("show_location", value)} value={form.show_location} />
          </View>
          <View style={styles.webFieldStack}>
            <SelectField
              compact
              error={errors.location}
              label=""
              onFieldFocus={onDropdownOpen}
              onOpen={(target) => onDropdownOpen?.("Location country", target)}
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
              fieldAccessory={(
                <Pressable accessibilityLabel="Use current location" disabled={resolvingLocation} onPress={onUseCurrentLocation} style={styles.inlineIconButton}>
                  <Feather color={huddleColors.iconMuted} name="map-pin" size={18} />
                </Pressable>
              )}
              label=""
              onBlur={() => {
                setTimeout(() => onLocationFocusChange?.(false), 140);
              }}
              onChangeText={(value) => {
                onLocationFocusChange?.(true);
                setField("location_district", value);
                onChange((previous) => {
                  const next = { ...previous, location_district: value, location_name: `${value}${previous.location_country ? `, ${previous.location_country}` : ""}`.trim() };
                  next.show_location = visibilityContentReady("show_location", next);
                  return next;
                });
              }}
              onFocus={() => {
                onDropdownOpen?.("District / Area", findNodeHandle(locationTextFieldRef.current));
                onLocationFocusChange?.(true);
              }}
              placeholder="District / Area"
              value={form.location_district}
              />
            </View>
          </View>
          {locationLoading ? <Text style={styles.locationHelper}>Loading suggestions...</Text> : null}
          {locationSuggestionsOpen && locationSuggestions.length > 0 ? (
            <View style={styles.suggestionMenu}>
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
            </View>
          ) : null}
        </View>
      </View>

      <View ref={petExperienceRef} style={styles.section}>
        <Text style={styles.sectionTitle}>Pet Experience</Text>
        <View style={styles.inlineRow}>
          <View style={styles.inlineGrow}>
            <SelectField
              onFieldFocus={onDropdownOpen}
              error={errors.pet_experience}
              label="Experience with"
              multi
              disabledOptions={hasPets ? new Set(["None"]) : undefined}
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
            <TextField onFocusRequest={onDropdownOpen} error={errors.experience_years} keyboardType="numeric" label="Years" onChangeText={(value) => setField("experience_years", value.replace(/[^\d.]/g, ""))} onSubmitEditing={() => Keyboard.dismiss()} placeholder="0" returnKeyType="done" value={form.experience_years} />
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
                onFieldFocus={onDropdownOpen}
                label={`${breedTargetSpecies.replace(/s$/, "")} breed`}
                multi
                onOpen={(target) => onDropdownOpen?.(`${breedTargetSpecies.replace(/s$/, "")} breed`, target)}
                options={breedOptionsForTarget}
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
            onFieldFocus={onDropdownOpen}
            disabledOptions={disabledRoleOptions}
            error={errors.availability_status || (form.availability_status.length === 0 ? "Required to connect" : undefined)}
            label="What should others know you as?"
            multi
            onOpen={(target) => onDropdownOpen?.("What should others know you as?", target)}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: huddleSpacing.x5,
  },
  section: {
    gap: huddleSpacing.x4,
  },
  sectionTitle: {
    flex: 1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    letterSpacing: 0.6,
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
    fontSize: 14,
    lineHeight: 20,
    color: huddleColors.text,
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
    fontSize: 15,
    lineHeight: 20,
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
    minHeight: huddleToggle.trackHeight,
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
  inlineGrow: {
    flex: 1,
  },
  breedFieldBlock: {
    marginTop: huddleSpacing.x1,
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
    fontSize: huddleType.helper,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
  },
  warningText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.labelLine,
    color: huddleColors.validationRed,
  },
  successText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
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
    gap: huddleSpacing.x2,
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
    fontSize: 14,
    lineHeight: 20,
    color: huddleColors.text,
  },
  locationHelper: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
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
    padding: huddleFormControls.select.menuPadding,
    elevation: 8,
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
    backgroundColor: huddleColors.mutedCanvas,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x3,
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
    width: huddleToggle.trackWidth,
    height: huddleToggle.trackHeight,
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.fieldBorder,
    paddingHorizontal: huddleToggle.trackPaddingHorizontal,
  },
  switchTrackOn: {
    backgroundColor: huddleColors.blue,
  },
  visibilitySwitchTrack: {
    width: huddleToggle.visibilityTrackWidth,
    height: huddleToggle.trackHeight,
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.fieldBorder,
    paddingHorizontal: huddleToggle.trackPaddingHorizontal,
  },
  visibilitySwitchTrackOn: {
    backgroundColor: huddleColors.blue,
  },
  visibilitySwitchIcon: {
    position: "absolute",
    zIndex: 1,
  },
  visibilitySwitchIconTilt: {
    transform: [{ rotate: "-16deg" }],
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
    ...huddleFieldStates.focused,
    backgroundColor: "transparent",
  },
  selectValue: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: 15,
    lineHeight: 20,
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
    ...huddleFieldStates.focused,
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
