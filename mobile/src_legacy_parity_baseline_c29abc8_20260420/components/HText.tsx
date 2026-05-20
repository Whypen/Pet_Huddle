import { Platform, Text, type TextProps } from "react-native";
import { COLORS, TYPO } from "../theme/tokens";

type Variant = "heading" | "body" | "meta";

type Props = TextProps & {
  variant?: Variant;
  color?: string;
  className?: string;
};

const sans =
  Platform.OS === "web"
    ? "Microsoft YaHei UI, Microsoft YaHei, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    : "Microsoft YaHei UI";

export function HText({ variant = "body", color, style, ...rest }: Props) {
  const { className, ...textProps } = rest;
  const base =
    variant === "heading"
      ? { fontSize: TYPO.headingSize, fontWeight: TYPO.headingWeight }
      : variant === "meta"
        ? { fontSize: TYPO.metaSize, fontWeight: TYPO.bodyWeight }
        : { fontSize: TYPO.bodySize, fontWeight: TYPO.bodyWeight };

  return (
    <Text
      allowFontScaling
      // NativeWind support (kept optional to allow gradual migration).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...({ className } as any)}
      style={[
        { color: color ?? COLORS.brandText, fontFamily: sans },
        base,
        // keep styles last for overrides
        style,
      ]}
      {...textProps}
    />
  );
}
