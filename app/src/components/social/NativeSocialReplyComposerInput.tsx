import { forwardRef } from "react";
import { StyleSheet, TextInput, type TextInputProps } from "react-native";
import { huddleColors, huddleFormFields, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";

export const NativeSocialReplyComposerInput = forwardRef<TextInput, TextInputProps>(function NativeSocialReplyComposerInput(props, ref) {
  return (
    <TextInput
      {...props}
      ref={ref}
      multiline
      placeholder={props.placeholder ?? "Leave a comment"}
      placeholderTextColor={huddleColors.caption}
      scrollEnabled={props.scrollEnabled ?? true}
      style={[styles.input, props.style]}
      textAlignVertical="top"
    />
  );
});

const styles = StyleSheet.create({
  input: {
    flexShrink: 1,
    minWidth: 0,
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    minHeight: huddleSpacing.x6,
    height: huddleFormFields.multilineHeight,
    maxHeight: huddleFormFields.multilineHeight,
    padding: 0,
    overflow: "hidden",
  },
});
