import Feather from "@expo/vector-icons/Feather";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  clampCustomHours,
  formatNativeMapSharingUntil,
  nativeMapSharingStatusText,
  type NativeMapPrecision,
} from "../../lib/nativeMapPrecision";
import {
  huddleColors,
  huddleLayout,
  huddleRadii,
  huddleSpacing,
  huddleType,
} from "../../theme/huddleDesignTokens";

export type NativeSelfPinControlsProps = {
  hours: number;
  onChangeHours: (hours: number) => void;
  onChangePrecision: (precision: NativeMapPrecision) => void;
  onStop: () => void;
  precision: NativeMapPrecision;
  visibleUntil: Date;
};

const PRIVACY_OPTIONS: ReadonlyArray<{
  accessibilityLabel: string;
  icon: "map" | "eye-off";
  precision: NativeMapPrecision;
}> = [
  { accessibilityLabel: "Share an approximate area", icon: "map", precision: "area" },
  { accessibilityLabel: "Use an Incognito map avatar", icon: "eye-off", precision: "hidden" },
];

export function NativeSelfPinControls({
  hours,
  onChangeHours,
  onChangePrecision,
  onStop,
  precision,
  visibleUntil,
}: NativeSelfPinControlsProps) {
  const [hoursOpen, setHoursOpen] = useState(false);

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <View pointerEvents="none" style={styles.rowIcon}>
          <Feather color={huddleColors.blue} name="map-pin" size={huddleType.h4} />
        </View>
        <View style={styles.segment}>
          {PRIVACY_OPTIONS.map((option) => {
            const selected = option.precision === precision;
            return (
              <Pressable
                accessibilityLabel={option.accessibilityLabel}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={option.precision}
                onPress={() => onChangePrecision(option.precision)}
                style={({ pressed }) => [
                  styles.segmentOption,
                  selected ? styles.segmentOptionSelected : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Feather
                  color={selected ? huddleColors.onPrimary : huddleColors.iconSubtle}
                  name={option.icon}
                  size={huddleType.h3}
                />
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.divider} />

      <Pressable
        accessibilityLabel={`Sharing until ${formatNativeMapSharingUntil(visibleUntil)}`}
        accessibilityRole="button"
        onPress={() => setHoursOpen((current) => !current)}
        style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
      >
        <View pointerEvents="none" style={styles.rowIcon}>
          <Feather color={huddleColors.text} name="clock" size={huddleType.h4} />
        </View>
        <View style={styles.rowCopy}>
          <Text style={styles.rowLabel}>Sharing until</Text>
          <Text style={styles.rowValue}>{formatNativeMapSharingUntil(visibleUntil)}</Text>
        </View>
        <Feather
          color={huddleColors.iconSubtle}
          name={hoursOpen ? "chevron-down" : "chevron-right"}
          size={huddleType.h3}
        />
      </Pressable>

      {hoursOpen ? (
        <View style={styles.stepper}>
          <Pressable
            accessibilityLabel="Decrease sharing time"
            accessibilityRole="button"
            onPress={() => onChangeHours(clampCustomHours(hours - 1))}
            style={({ pressed }) => [styles.stepButton, pressed ? styles.pressed : null]}
          >
            <Feather color={huddleColors.text} name="minus" size={huddleType.h4} />
          </Pressable>
          <Text style={styles.stepValue}>{clampCustomHours(hours)} hours</Text>
          <Pressable
            accessibilityLabel="Increase sharing time"
            accessibilityRole="button"
            onPress={() => onChangeHours(clampCustomHours(hours + 1))}
            style={({ pressed }) => [styles.stepButton, pressed ? styles.pressed : null]}
          >
            <Feather color={huddleColors.text} name="plus" size={huddleType.h4} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.divider} />

      <View style={styles.status}>
        <View style={[styles.statusDot, precision === "hidden" ? styles.statusDotIncognito : null]} />
        <Text style={styles.statusText}>{nativeMapSharingStatusText(precision, visibleUntil)}</Text>
        <Pressable accessibilityLabel="Stop sharing" accessibilityRole="button" onPress={onStop}>
          <Text style={styles.stopText}>Stop</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: huddleSpacing.x1,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleSpacing.x3,
    minHeight: huddleLayout.minTouch,
  },
  rowIcon: {
    alignItems: "center",
    backgroundColor: huddleColors.mutedCanvas,
    borderRadius: huddleRadii.pill,
    height: huddleLayout.minTouch,
    justifyContent: "center",
    width: huddleLayout.minTouch,
  },
  segment: {
    backgroundColor: huddleColors.mutedCanvas,
    borderRadius: huddleRadii.field,
    flex: 1,
    flexDirection: "row",
    gap: huddleSpacing.x1,
    padding: huddleSpacing.x1,
  },
  segmentOption: {
    alignItems: "center",
    borderRadius: huddleRadii.card,
    flex: 1,
    justifyContent: "center",
    minHeight: huddleLayout.minTouch,
  },
  segmentOptionSelected: {
    backgroundColor: huddleColors.blue,
  },
  pressed: {
    opacity: 0.7,
  },
  divider: {
    backgroundColor: huddleColors.divider,
    height: StyleSheet.hairlineWidth,
  },
  rowCopy: {
    flex: 1,
  },
  rowLabel: {
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    lineHeight: huddleType.labelLine,
  },
  rowValue: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  stepper: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: huddleColors.mutedCanvas,
    borderRadius: huddleRadii.pill,
    flexDirection: "row",
    gap: huddleSpacing.x3,
    padding: huddleSpacing.x1,
  },
  stepButton: {
    alignItems: "center",
    borderRadius: huddleRadii.pill,
    height: huddleLayout.minTouch,
    justifyContent: "center",
    width: huddleLayout.minTouch,
  },
  stepValue: {
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
  },
  status: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleSpacing.x2,
    minHeight: huddleLayout.minTouch,
  },
  statusDot: {
    backgroundColor: huddleColors.success,
    borderRadius: huddleRadii.pill,
    height: huddleSpacing.x2,
    width: huddleSpacing.x2,
  },
  statusDotIncognito: {
    opacity: 0.4,
  },
  statusText: {
    color: huddleColors.text,
    flex: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  stopText: {
    color: huddleColors.validationRed,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
  },
});
