import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, TYPO } from "../theme/tokens";

export type SelectOption<T extends string> = {
  label: string;
  value: T;
};

type Props<T extends string> = {
  label: string;
  value: T | null | undefined;
  placeholder?: string;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  error?: string;
  disabled?: boolean;
};

export function SelectField<T extends string>({
  label,
  value,
  placeholder = "Select",
  options,
  onChange,
  error,
  disabled,
}: Props<T>) {
  // Placeholders and input text must be left-aligned (override).
  const align = "left";
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(() => options.find((o) => o.value === value)?.label ?? "", [options, value]);

  const borderColor = error ? COLORS.brandError : COLORS.brandText;

  return (
    <View style={{ width: "100%" }}>
      <Text style={{ color: COLORS.brandText, fontSize: TYPO.bodySize, marginBottom: 6, textAlign: align }}>
        {label}
      </Text>

      <Pressable
        onPress={() => !disabled && setOpen(true)}
        style={{
          borderColor,
          borderWidth: 1,
          borderRadius: 12,
          backgroundColor: disabled ? COLORS.disabledBg : COLORS.white,
          height: 36, // Global UI override: compact inputs
          paddingHorizontal: 8,
          paddingVertical: 4,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            color: selectedLabel ? COLORS.brandText : "rgba(66,73,101,0.45)",
            opacity: selectedLabel ? 1 : 0.6,
            fontStyle: selectedLabel ? "normal" : "italic",
            fontSize: TYPO.bodySize,
            textAlign: align,
            flex: 1,
          }}
          numberOfLines={1}
        >
          {selectedLabel || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color="rgba(66,73,101,0.6)" />
      </Pressable>

      {error ? <Text style={{ color: COLORS.brandError, fontSize: 12, marginTop: 6, textAlign: align }}>{error}</Text> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={() => setOpen(false)}>
          <View style={{ marginTop: 120, marginHorizontal: 16, borderRadius: 16, backgroundColor: COLORS.white, overflow: "hidden" }}>
            <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: `${COLORS.brandText}1F` }}>
              <Text style={{ color: COLORS.brandText, fontSize: 16, fontWeight: "700" }}>{label}</Text>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {options.map((o) => (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => ({
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    backgroundColor: pressed ? "rgba(33,69,207,0.08)" : COLORS.white,
                    borderBottomWidth: 1,
                    borderBottomColor: `${COLORS.brandText}14`,
                  })}
                >
                  <Text style={{ color: COLORS.brandText, fontSize: 14, fontWeight: value === o.value ? "800" : "500" }}>{o.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
