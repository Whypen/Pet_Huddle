import { forwardRef } from "react";
import { StyleSheet, TextInput, type TextInputProps } from "react-native";
import { huddleColors, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";

export const NativeSocialReplyComposerInput = forwardRef<TextInput, TextInputProps>(function NativeSocialReplyComposerInput(props, ref) {
  return (
    <TextInput
      {...props}
      ref={ref}
      multiline
      placeholderTextColor={huddleColors.caption}
      scrollEnabled={false}
      style={[styles.input, props.style]}
      textAlignVertical="top"
    />
  );
});

const styles = StyleSheet.create({
  input: {
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    minHeight: huddleSpacing.x6,
    padding: 0,
  },
});
