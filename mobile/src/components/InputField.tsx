import { useMemo, useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, TYPO } from "../theme/tokens";

type Props = TextInputProps & {
  label?: string;
  error?: string;
  disabled?: boolean;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
};

export function InputField({ label, error, disabled, style, leftIcon, rightIcon, onRightIconPress, ...rest }: Props) {
  const [focused, setFocused] = useState(false);

  const borderColor = error ? COLORS.brandError : COLORS.brandText;
  const borderWidth = focused ? 1.5 : 1;

  const containerStyle = useMemo(
    () => [
      {
        borderColor,
        borderWidth,
        borderRadius: 12,
        backgroundColor: disabled ? COLORS.disabledBg : COLORS.white,
        height: 36, // Global UI override: compact inputs
        paddingHorizontal: 8,
        paddingVertical: 4,
        flexDirection: "row" as const,
        alignItems: "center" as const,
        shadowColor: focused ? "#000" : "transparent",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: focused ? 0.2 : 0,
        shadowRadius: focused ? 2 : 0,
        elevation: focused ? 1 : 0,
      },
      style,
    ],
    [borderColor, borderWidth, disabled, focused, style]
  );

  const inputStyle = useMemo(
    () => [
      {
        flex: 1,
        padding: 0,
        margin: 0,
        fontSize: TYPO.bodySize,
        color: COLORS.brandText,
        textAlign: "left" as const, // placeholders and input text must be left-aligned
      },
    ],
    []
  );

  const value = typeof rest.value === "string" ? rest.value : "";
  const showOverlayPlaceholder = !!rest.placeholder && !focused && value.length === 0;
  const leftOffset = 8 + (leftIcon ? 22 : 0);

  return (
    <View style={{ width: "100%" }}>
      {label ? (
        <Text
          style={{
            color: COLORS.brandText,
            fontSize: TYPO.bodySize,
            fontWeight: "400",
            marginBottom: 6,
            textAlign: "left",
          }}
        >
          {label}
        </Text>
      ) : null}

      <View style={{ position: "relative" }}>
        {/* Border box container */}
        <View style={containerStyle}>
          {leftIcon ? (
            <View style={{ width: 22, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={leftIcon} size={18} color="rgba(66,73,101,0.65)" />
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

          {rightIcon ? (
            <Pressable
              onPress={onRightIconPress}
              hitSlop={8}
              disabled={!onRightIconPress}
              style={({ pressed }) => ({ width: 22, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
            >
              <Ionicons name={rightIcon} size={18} color="rgba(66,73,101,0.65)" />
            </Pressable>
          ) : null}
        </View>

        {showOverlayPlaceholder ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: leftOffset,
              right: 8 + (rightIcon ? 22 : 0),
              top: 0,
              bottom: 0,
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: "rgba(66,73,101,0.45)",
                opacity: 0.6,
                fontStyle: "italic",
                textAlign: "left",
                fontSize: TYPO.bodySize,
              }}
              numberOfLines={1}
            >
              {rest.placeholder}
            </Text>
          </View>
        ) : null}
      </View>

      {error ? (
        <Text style={{ color: COLORS.brandError, fontSize: 12, marginTop: 6, textAlign: "left" }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
