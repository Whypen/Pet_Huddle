import { Platform, Text, type TextProps } from "react-native";
import { COLORS, TYPO } from "../theme/tokens";

type Variant = "heading" | "body" | "meta";

type Props = TextProps & {
  variant?: Variant;
  color?: string;
};

const sans =
  Platform.OS === "web"
    ? "Microsoft YaHei UI, Microsoft YaHei, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    : "Microsoft YaHei UI";

export function HText({ variant = "body", color, style, ...rest }: Props) {
  const base =
    variant === "heading"
      ? { fontSize: TYPO.headingSize, fontWeight: TYPO.headingWeight }
      : variant === "meta"
        ? { fontSize: TYPO.metaSize, fontWeight: TYPO.bodyWeight }
        : { fontSize: TYPO.bodySize, fontWeight: TYPO.bodyWeight };

  return (
    <Text
      allowFontScaling
      style={[
        { color: color ?? COLORS.brandText, fontFamily: sans },
        base,
        // keep styles last for overrides
        style,
      ]}
      {...rest}
    />
  );
}

