import { useMemo } from "react";
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

  const borderColor = error ? COLORS.brandError : COLORS.brandText;
  const borderWidth = rest.editable === false || disabled ? 1 : 1;

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
      },
      style,
    ],
    [align, borderColor, borderWidth, disabled, style]
  );

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

      <TextInput
        placeholderTextColor="rgba(66,73,101,0.45)"
        style={inputStyle}
        editable={!disabled && rest.editable !== false}
        {...rest}
      />

      {error ? (
        <Text style={{ color: COLORS.brandError, fontSize: 12, marginTop: 6, textAlign: align }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
