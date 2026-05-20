import { forwardRef } from "react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import {
  huddleColors,
  huddleFieldStates,
  huddleFormFields,
  huddleLayout,
  huddleRadii,
  huddleSpacing,
} from "../theme/huddleDesignTokens";

type NativeFormFieldShellProps = {
  children: ReactNode;
  compact?: boolean;
  error?: string;
  fieldAccessory?: ReactNode;
  focused?: boolean;
  label: string;
  readOnly?: boolean;
  rightAccessory?: ReactNode;
};

export function NativeFormError({ message }: { message?: string }) {
  return String(message || "").trim() ? <Text style={styles.errorText}>{message}</Text> : null;
}

export function NativeFormFieldShell({
  children,
  compact,
  error,
  fieldAccessory,
  focused,
  label,
  readOnly,
  rightAccessory,
}: NativeFormFieldShellProps) {
  return (
    <View style={[styles.block, compact ? styles.compactBlock : null]}>
      {label || rightAccessory ? (
        <View style={[styles.labelRow, compact ? styles.compactLabelRow : null]}>
          {label ? (
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                error ? styles.labelError : null,
              ]}
            >
              {label}
            </Text>
          ) : <View style={styles.labelSpacer} />}
          {rightAccessory}
        </View>
      ) : null}
      <View
        style={[
          styles.field,
          readOnly ? styles.fieldReadOnly : null,
          focused ? styles.fieldFocused : null,
          error ? styles.fieldError : null,
        ]}
      >
        <View style={styles.fieldRow}>
          <View style={styles.fieldContent}>
            {children}
          </View>
          {fieldAccessory}
        </View>
      </View>
      <NativeFormError message={error} />
    </View>
  );
}

export const NativeFormTextField = forwardRef<TextInput, TextInputProps & {
  compact?: boolean;
  error?: string;
  fieldAccessory?: ReactNode;
  label: string;
  multiline?: boolean;
  prefix?: string;
  rightAccessory?: ReactNode;
}>(function NativeFormTextField({
  compact,
  error,
  fieldAccessory,
  label,
  multiline = false,
  prefix,
  rightAccessory,
  style,
  ...props
}, ref) {
  const [focused, setFocused] = useState(false);

  return (
    <NativeFormFieldShell
      error={error}
      compact={compact}
      fieldAccessory={fieldAccessory}
      focused={focused}
      label={label}
      rightAccessory={rightAccessory}
    >
      <TextInput
        ref={ref}
        {...props}
        multiline={multiline}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        placeholderTextColor={huddleColors.mutedText}
        scrollEnabled={multiline}
        style={[styles.input, prefix ? styles.inputWithPrefix : null, multiline ? styles.textArea : null, style]}
      />
      {prefix ? <Text pointerEvents="none" style={styles.inputPrefix}>{prefix}</Text> : null}
    </NativeFormFieldShell>
  );
});

export function NativeFormReadOnlyField({
  fieldAccessory,
  label,
  rightAccessory,
  value,
}: {
  fieldAccessory?: ReactNode;
  label: string;
  rightAccessory?: ReactNode;
  value: string;
}) {
  return (
    <NativeFormFieldShell fieldAccessory={fieldAccessory} label={label} readOnly rightAccessory={rightAccessory}>
      <Text numberOfLines={1} style={[styles.value, !value ? styles.placeholder : null]}>
        {value || "—"}
      </Text>
    </NativeFormFieldShell>
  );
}

export function NativeFormChoiceField({
  children,
  compact,
  error,
  fieldAccessory,
  focused,
  label,
  rightAccessory,
}: NativeFormFieldShellProps) {
  return (
    <NativeFormFieldShell compact={compact} error={error} fieldAccessory={fieldAccessory} focused={focused} label={label} rightAccessory={rightAccessory}>
      {children}
    </NativeFormFieldShell>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: huddleSpacing.x2,
  },
  compactBlock: {
    gap: huddleSpacing.x1,
  },
  field: {
    minHeight: huddleLayout.fieldHeight,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    borderRadius: huddleRadii.field,
    backgroundColor: huddleFormFields.background,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: 0,
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: huddleFormFields.shadowOpacity,
    shadowRadius: 6,
    shadowOffset: { width: huddleFormFields.shadowOffset, height: huddleFormFields.shadowOffset },
    elevation: 1,
  },
  fieldFocused: {
    ...huddleFieldStates.focused,
    backgroundColor: huddleFormFields.background,
  },
  fieldReadOnly: {
    backgroundColor: huddleColors.mutedCanvas,
  },
  fieldError: {
    ...huddleFieldStates.error,
  },
  labelRow: {
    minHeight: huddleSpacing.x5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
  },
  compactLabelRow: {
    minHeight: 20,
  },
  label: {
    flex: 1,
    fontFamily: "Urbanist-700",
    fontSize: 14,
    lineHeight: 20,
    color: huddleColors.text,
  },
  labelSpacer: {
    flex: 1,
  },
  labelError: {
    color: huddleColors.validationRed,
  },
  fieldRow: {
    minHeight: huddleLayout.fieldHeight - 2,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  fieldContent: {
    position: "relative",
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  input: {
    height: huddleLayout.fieldHeight - 2,
    padding: 0,
    fontFamily: "Urbanist-500",
    fontSize: 15,
    lineHeight: huddleFormFields.valueLine,
    includeFontPadding: false,
    textAlignVertical: "center",
    color: huddleColors.text,
  },
  inputWithPrefix: {
    paddingLeft: huddleSpacing.x5,
  },
  inputPrefix: {
    position: "absolute",
    left: 0,
    top: (huddleLayout.fieldHeight - 2 - huddleFormFields.valueLine) / 2,
    height: huddleFormFields.valueLine,
    textAlignVertical: "center",
    fontFamily: "Urbanist-500",
    fontSize: 15,
    lineHeight: huddleFormFields.valueLine,
    includeFontPadding: false,
    color: huddleColors.mutedText,
  },
  textArea: {
    height: undefined,
    minHeight: huddleLayout.fieldHeight * 2,
    paddingTop: huddleSpacing.x2,
    textAlignVertical: "top",
  },
  value: {
    fontFamily: "Urbanist-500",
    fontSize: 15,
    lineHeight: huddleFormFields.valueLine,
    includeFontPadding: false,
    color: huddleColors.text,
  },
  placeholder: {
    color: huddleColors.mutedText,
  },
  errorText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleFormFields.errorSize,
    lineHeight: huddleFormFields.errorLine,
    color: huddleColors.validationRed,
  },
});
