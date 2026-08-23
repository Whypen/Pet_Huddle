import { Feather } from "@expo/vector-icons";
import { getCountries, getCountryCallingCode, isValidPhoneNumber, type CountryCode } from "libphonenumber-js";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  huddleColors,
  huddleFieldStates,
  huddleFormFields,
  huddleLayout,
  huddleRadii,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";

export type NativePhoneCountry = {
  code: CountryCode;
  dialCode: string;
  flag: string;
};

const countryFlag = (countryCode: CountryCode) =>
  countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));

export const nativePhoneCountries: NativePhoneCountry[] = getCountries().map((code) => ({
  code,
  dialCode: `+${getCountryCallingCode(code)}`,
  flag: countryFlag(code),
}));

export const findNativePhoneCountry = (code?: string | null) => {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return nativePhoneCountries.find((country) => country.code === normalized) || null;
};

export const resolveNativePhoneCountry = (phone: string) => {
  const normalized = phone.trim();
  return [...nativePhoneCountries]
    .sort((a, b) => b.dialCode.length - a.dialCode.length)
    .find((country) => normalized.startsWith(country.dialCode)) || null;
};

const normalizeNativePhoneLocalDigits = (value: string, country?: NativePhoneCountry | null) => {
  const countryDigits = country?.dialCode.replace(/\D/g, "").length ?? 0;
  return value.replace(/\D/g, "").slice(0, Math.max(1, 15 - countryDigits));
};

export const localNativePhoneValue = (phone: string, country?: NativePhoneCountry | null) => {
  const normalized = phone.trim();
  if (!normalized) return "";
  if (country && normalized.startsWith(country.dialCode)) {
    return normalizeNativePhoneLocalDigits(normalized.slice(country.dialCode.length), country);
  }
  const savedCountry = resolveNativePhoneCountry(normalized);
  return savedCountry
    ? normalizeNativePhoneLocalDigits(normalized.slice(savedCountry.dialCode.length), savedCountry)
    : normalizeNativePhoneLocalDigits(normalized.replace(/^\+/, ""));
};

export const composeNativePhoneValue = (localValue: string, country?: NativePhoneCountry | null) => {
  const local = localValue.trim();
  if (!local) return "";
  return country ? `${country.dialCode}${local}` : local;
};

export const isNativePhoneValueValid = (phone: string, country?: NativePhoneCountry | null) => {
  const normalized = phone.trim();
  if (!normalized || !country) return false;
  return isValidPhoneNumber(normalized, country.code);
};

type NativePhoneFieldProps = {
  defaultCountryCode?: string | null;
  editable?: boolean;
  error?: boolean;
  onBlur?: () => void;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
  onOpenCountryPicker?: () => void;
  onValidityChange?: (valid: boolean) => void;
  placeholder?: string;
  rightAccessory?: ReactNode;
  rightAccessoryWidth?: number;
  showFormatWarning?: boolean;
  value: string;
};

export function NativePhoneField({
  defaultCountryCode,
  editable = true,
  error = false,
  onBlur,
  onChangeText,
  onFocus,
  onOpenCountryPicker,
  onValidityChange,
  placeholder = "",
  rightAccessory,
  rightAccessoryWidth = 0,
  showFormatWarning = false,
  value,
}: NativePhoneFieldProps) {
  const initialCountry = resolveNativePhoneCountry(value) || findNativePhoneCountry(defaultCountryCode);
  const [selectedCountry, setSelectedCountry] = useState<NativePhoneCountry | null>(initialCountry);
  const [localValue, setLocalValue] = useState(() => localNativePhoneValue(value, initialCountry));
  const [focused, setFocused] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const lastComposedValue = useRef(composeNativePhoneValue(localValue, initialCountry));

  useEffect(() => {
    const nextCountry = resolveNativePhoneCountry(value) || selectedCountry || findNativePhoneCountry(defaultCountryCode);
    const nextLocal = localNativePhoneValue(value, nextCountry);
    if (value !== lastComposedValue.current) {
      setSelectedCountry(nextCountry);
      setLocalValue(nextLocal);
      lastComposedValue.current = value;
    } else if (!selectedCountry && nextCountry) {
      setSelectedCountry(nextCountry);
    }
  }, [defaultCountryCode, selectedCountry, value]);

  const composedValue = composeNativePhoneValue(localValue, selectedCountry);
  const valid = Boolean(localValue.trim() && selectedCountry && isValidPhoneNumber(composedValue, selectedCountry.code));
  const formatWarning = showFormatWarning && localValue.trim() && selectedCountry && !valid;
  const countrySelectLabel = selectedCountry ? "Change phone country code" : "Choose phone country code";
  const filteredCountries = useMemo(() => {
    const query = search.trim().toLowerCase().replace(/^\+/, "");
    if (!query) return nativePhoneCountries;
    return nativePhoneCountries.filter((country) => {
      const dialCode = country.dialCode.replace(/^\+/, "");
      return country.code.toLowerCase().includes(query) || dialCode.includes(query);
    });
  }, [search]);

  useEffect(() => {
    onValidityChange?.(valid);
  }, [onValidityChange, valid]);

  const commitLocalValue = (nextLocal: string, country: NativePhoneCountry | null = selectedCountry) => {
    const normalizedLocal = normalizeNativePhoneLocalDigits(nextLocal, country);
    setLocalValue(normalizedLocal);
    const nextValue = composeNativePhoneValue(normalizedLocal, country);
    lastComposedValue.current = nextValue;
    onChangeText(nextValue);
  };

  const selectCountry = (country: NativePhoneCountry) => {
    const normalizedLocal = normalizeNativePhoneLocalDigits(localValue, country);
    setSelectedCountry(country);
    setLocalValue(normalizedLocal);
    setSearch("");
    setPickerOpen(false);
    const nextValue = composeNativePhoneValue(normalizedLocal, country);
    lastComposedValue.current = nextValue;
    onChangeText(nextValue);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.inputWrap}>
        <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
          autoComplete="tel"
          autoCorrect={false}
          editable={editable}
          keyboardType="phone-pad"
          onChangeText={commitLocalValue}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          onFocus={() => {
            setFocused(true);
            setPickerOpen(false);
            onFocus?.();
          }}
          placeholder={placeholder}
          placeholderTextColor={huddleColors.mutedText}
          style={[
            styles.input,
            styles.phoneInput,
            rightAccessory ? { paddingRight: rightAccessoryWidth + huddleSpacing.x4 } : null,
            focused ? styles.inputFocused : null,
            error || formatWarning ? styles.inputError : null,
          ]}
          textContentType="telephoneNumber"
          value={localValue}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={countrySelectLabel}
          disabled={!editable}
          onPress={() => {
            Keyboard.dismiss();
            onOpenCountryPicker?.();
            setSearch("");
            setPickerOpen((open) => !open);
          }}
          style={({ pressed }) => [styles.countrySelect, pressed ? styles.pressed : null]}
        >
          {selectedCountry ? <Text style={styles.countryFlag}>{selectedCountry.flag}</Text> : null}
          <Text style={[styles.phoneDialCode, !selectedCountry ? styles.phoneDialCodePlaceholder : null]}>
            {selectedCountry?.dialCode ?? "Code"}
          </Text>
          {editable ? <Feather color={huddleColors.iconSubtle} name="chevron-down" size={12} /> : null}
        </Pressable>
        {rightAccessory ? <View style={styles.rightAccessory}>{rightAccessory}</View> : null}
      </View>
      {formatWarning ? <Text style={styles.errorText}>Phone number is not complete or valid for the selected country.</Text> : null}
      {pickerOpen ? (
        <View style={styles.countryPicker}>
          <View style={styles.countrySearchField}>
            <Feather color={huddleColors.mutedText} name="search" size={15} />
            <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
              autoCapitalize="characters"
              autoCorrect={false}
              onChangeText={setSearch}
              placeholder="Search code or country"
              placeholderTextColor={huddleColors.mutedText}
              style={styles.countrySearchInput}
              value={search}
            />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.countryPickerList}>
            {filteredCountries.map((country) => (
              <Pressable
                key={country.code}
                onPress={() => selectCountry(country)}
                style={({ pressed }) => [styles.countryOption, selectedCountry?.code === country.code ? styles.countryOptionSelected : null, pressed ? styles.pressed : null]}
              >
                <Text style={styles.countryOptionText}>{country.flag} {country.code} {country.dialCode}</Text>
                {selectedCountry?.code === country.code ? <Feather color={huddleColors.blue} name="check" size={14} /> : null}
              </Pressable>
            ))}
            {filteredCountries.length === 0 ? <Text style={styles.countryEmptyText}>No country code found</Text> : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: huddleSpacing.x1,
  },
  inputWrap: {
    position: "relative",
  },
  input: {
    flexShrink: 1,
    minWidth: 0,
    minHeight: huddleLayout.fieldHeight,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleFormFields.background,
    paddingHorizontal: huddleSpacing.x4,
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body + 6,
    includeFontPadding: false,
    textAlignVertical: "center",
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: huddleFormFields.shadowOpacity,
    shadowRadius: 6,
    shadowOffset: { width: huddleFormFields.shadowOffset, height: huddleFormFields.shadowOffset },
    elevation: 1,
    overflow: "hidden",
  },
  inputFocused: {
    ...huddleFieldStates.focused,
    backgroundColor: huddleFormFields.background,
  },
  inputError: {
    ...huddleFieldStates.error,
  },
  phoneInput: {
    width: "100%",
    flexShrink: 1,
    minWidth: 0,
    paddingLeft: 92,
    textAlignVertical: "center",
    overflow: "hidden",
  },
  countrySelect: {
    position: "absolute",
    left: huddleSpacing.x3,
    top: 0,
    bottom: 0,
    zIndex: 1,
    minWidth: 58,
    minHeight: huddleLayout.fieldHeight,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x1,
  },
  rightAccessory: {
    position: "absolute",
    right: huddleSpacing.x2,
    top: 0,
    bottom: 0,
    zIndex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x1,
  },
  countryFlag: {
    fontSize: 17,
    lineHeight: 20,
  },
  phoneDialCode: {
    color: huddleColors.text,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.body,
    lineHeight: huddleType.body + 6,
    includeFontPadding: false,
  },
  phoneDialCodePlaceholder: {
    color: huddleColors.mutedText,
  },
  countryPicker: {
    borderRadius: huddleRadii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: huddleColors.fieldBorderSoft,
    backgroundColor: huddleColors.canvas,
    overflow: "hidden",
  },
  countrySearchField: {
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: huddleColors.fieldBorderSoft,
    paddingHorizontal: huddleSpacing.x4,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  countrySearchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    padding: 0,
    margin: 0,
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: 14,
    lineHeight: 18,
    includeFontPadding: false,
    overflow: "hidden",
  },
  countryPickerList: {
    maxHeight: 180,
  },
  countryOption: {
    minHeight: 42,
    paddingHorizontal: huddleSpacing.x4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
  },
  countryOptionSelected: {
    backgroundColor: huddleColors.mutedCanvas,
  },
  countryOptionText: {
    flex: 1,
    color: huddleColors.text,
    fontFamily: "Urbanist-600",
    fontSize: 14,
  },
  countryEmptyText: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-600",
    fontSize: 13,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x3,
  },
  errorText: {
    color: huddleColors.validationRed,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
  },
  pressed: {
    opacity: 0.78,
  },
});
