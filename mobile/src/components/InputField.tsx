import { useMemo, useState } from "react";
import {
  Platform,
  Text,
  TextInput,
  type TextInputProps,
  useWindowDimensions,
  View,
} from "react-native";
import { COLORS, TYPO } from "../theme/tokens";

type Props = TextInputProps & {
  label?: string;
  error?: string;
  disabled?: boolean;
};

export function InputField({ label, error, disabled, style, ...rest }: Props) {
  const { width } = useWindowDimensions();
  const isWide = width > 600;
  const align = isWide ? "left" : "center";

  const [focused, setFocused] = useState(false);

  const borderColor = error ? COLORS.brandError : COLORS.brandText;
  const borderWidth = focused ? 1.5 : 1;

  const inputStyle = useMemo(
    () => [
      {
        borderColor,
        borderWidth,
        borderRadius: 12,
        backgroundColor: disabled ? COLORS.disabledBg : COLORS.white,
        paddingHorizontal: 14,
        paddingVertical: Platform.OS === "ios" ? 12 : 10,
        fontSize: TYPO.bodySize,
        color: COLORS.brandText,
        textAlign: align as "left" | "center",
        shadowColor: focused ? "#000" : "transparent",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: focused ? 0.2 : 0,
        shadowRadius: focused ? 2 : 0,
        elevation: focused ? 1 : 0,
      },
      style,
    ],
    [align, borderColor, borderWidth, disabled, focused, style]
  );

  const value = typeof rest.value === "string" ? rest.value : "";
  const showOverlayPlaceholder = !!rest.placeholder && !focused && value.length === 0;

  return (
    <View style={{ width: "100%" }}>
      {label ? (
        <Text
          style={{
            color: COLORS.brandText,
            fontSize: TYPO.bodySize,
            fontWeight: "400",
            marginBottom: 6,
            textAlign: align,
          }}
        >
          {label}
        </Text>
      ) : null}

      <View style={{ position: "relative" }}>
        {showOverlayPlaceholder ? (
          <View pointerEvents="none" style={{ position: "absolute", left: 14, right: 14, top: Platform.OS === "ios" ? 12 : 10 }}>
            <Text
              style={{
                color: "rgba(66,73,101,0.45)",
                opacity: 0.6,
                fontStyle: "italic",
                textAlign: align,
                fontSize: TYPO.bodySize,
              }}
              numberOfLines={1}
            >
              {rest.placeholder}
            </Text>
          </View>
        ) : null}

        <TextInput
          placeholder={""}
          style={inputStyle}
          editable={!disabled && rest.editable !== false}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          {...rest}
        />
      </View>

      {error ? (
        <Text style={{ color: COLORS.brandError, fontSize: 12, marginTop: 6, textAlign: align }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
