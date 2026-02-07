import { useMemo, useState } from "react";
import { Modal, Platform, Pressable, Text, useWindowDimensions, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { COLORS, TYPO } from "../theme/tokens";

function formatDate(d: Date | null) {
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${dd} ${months[d.getMonth()]}, ${d.getFullYear()}`;
}

type Props = {
  label: string;
  value: Date | null;
  onChange: (d: Date | null) => void;
  error?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  disabled?: boolean;
  placeholder?: string;
};

export function DateField({
  label,
  value,
  onChange,
  error,
  minimumDate,
  maximumDate,
  disabled,
  placeholder = "Select date",
}: Props) {
  const { width } = useWindowDimensions();
  const isWide = width > 600;
  const align = isWide ? "left" : "center";
  const [open, setOpen] = useState(false);

  const borderColor = error ? COLORS.brandError : COLORS.brandText;
  const text = useMemo(() => formatDate(value), [value]);
  const showPlaceholder = !text;

  const onNativeChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setOpen(false);
    if (selected) onChange(selected);
  };

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
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <Text
          style={{
            color: showPlaceholder ? "rgba(66,73,101,0.45)" : COLORS.brandText,
            opacity: showPlaceholder ? 0.6 : 1,
            fontStyle: showPlaceholder ? "italic" : "normal",
            fontSize: TYPO.bodySize,
            textAlign: align,
          }}
          numberOfLines={1}
        >
          {showPlaceholder ? placeholder : text}
        </Text>
      </Pressable>

      {error ? <Text style={{ color: COLORS.brandError, fontSize: 12, marginTop: 6, textAlign: align }}>{error}</Text> : null}

      {open ? (
        Platform.OS === "android" ? (
          <DateTimePicker
            value={value ?? new Date()}
            mode="date"
            onChange={onNativeChange}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
          />
        ) : (
          <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
            <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={() => setOpen(false)}>
              <View style={{ marginTop: 180, marginHorizontal: 16, borderRadius: 16, backgroundColor: COLORS.white, overflow: "hidden" }}>
                <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: `${COLORS.brandText}1F` }}>
                  <Text style={{ color: COLORS.brandText, fontSize: 16, fontWeight: "700" }}>{label}</Text>
                </View>
                <View style={{ padding: 12 }}>
                  <DateTimePicker
                    value={value ?? new Date()}
                    mode="date"
                    display="spinner"
                    onChange={onNativeChange}
                    minimumDate={minimumDate}
                    maximumDate={maximumDate}
                  />
                  <Pressable
                    onPress={() => setOpen(false)}
                    style={{
                      marginTop: 10,
                      backgroundColor: COLORS.brandBlue,
                      paddingVertical: 12,
                      borderRadius: 12,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: COLORS.white, fontSize: 14, fontWeight: "800" }}>Done</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </Modal>
        )
      ) : null}
    </View>
  );
}

