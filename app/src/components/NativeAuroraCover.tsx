import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import type { ReactNode } from "react";

// Deterministic aurora cover — the brand answer to every flat/grey empty-cover
// state. Seeded by a stable string (group id, chat id, or a name being typed),
// it renders the same gradient-blob composition as the Home hero, so a group
// with no photo still owns a unique, on-brand identity from birth.
//
// Static by default: these render inside lists, so no animation loops here —
// motion stays reserved for presence signals (live dots, breathing blobs).

// Vivid accent trios — each aurora paints two saturated glows + one bright
// accent, so covers read as living light, not flat navy. Brights (lime/coral)
// are deliberately included as the third, small pop. Brand palette only:
// blue (#2145CF family), coral (#FF751F), lime (#BFFF00), gold (#CFAB21) —
// no violet/purple, which is off-brand.
const AURORA_ACCENTS: Array<[string, string, string]> = [
  ["#2145CF", "#3A5FE8", "#BFFF00"], // blue · light blue · lime
  ["#3A5FE8", "#2145CF", "#FF751F"], // light blue · blue · coral
  ["#2145CF", "#0C1E5C", "#BFFF00"], // blue · deep blue · lime
  ["#FF751F", "#2145CF", "#3A5FE8"], // coral · blue · light blue
  ["#2145CF", "#CFAB21", "#BFFF00"], // blue · gold · lime
  ["#3A5FE8", "#FF751F", "#2145CF"], // light blue · coral · blue
];

const INK = "#1B3AA0";
const INK_DEEP = "#0C1E5C";

const fnv1a = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

type AuroraBlob = {
  cxPct: number;
  cyPct: number;
  radiusPct: number;
  color: string;
  opacity: number;
};

// Derives three glows from the seed hash. Bright centers land INSIDE the visible
// frame (15-85%) so the cover reads as vivid light — the earlier version pushed
// blobs off-card, which is why they rendered as near-solid navy. The upper band
// stays a touch calmer so overlaid title text keeps contrast.
const auroraLayoutForSeed = (seed: string): { blobs: AuroraBlob[]; accentIndex: number } => {
  const hash = fnv1a(seed || "huddle");
  const accentIndex = hash % AURORA_ACCENTS.length;
  const [accentA, accentB, accentPop] = AURORA_ACCENTS[accentIndex];
  const pick = (shift: number, range: number) => ((hash >>> shift) % range);
  const blobs: AuroraBlob[] = [
    // Primary saturated glow — large, upper-right, the hero light.
    {
      cxPct: 62 + pick(2, 24),
      cyPct: 18 + pick(5, 24),
      radiusPct: 62 + pick(8, 20),
      color: accentA,
      opacity: 0.9,
    },
    // Secondary glow — lower-left counter-light.
    {
      cxPct: 12 + pick(11, 26),
      cyPct: 66 + pick(14, 26),
      radiusPct: 55 + pick(17, 20),
      color: accentB,
      opacity: 0.82,
    },
    // Bright accent pop — small, punchy, wanders per seed.
    {
      cxPct: 30 + pick(20, 45),
      cyPct: 55 + pick(23, 35),
      radiusPct: 26 + pick(26, 16),
      color: accentPop,
      opacity: 0.7,
    },
  ];
  return { blobs, accentIndex };
};

export function NativeAuroraCover({ children, initial, seed, style }: {
  children?: ReactNode;
  /** Optional single letter rendered folio-style in the top-left corner. */
  initial?: string | null;
  /** Stable identity string — same seed always renders the same aurora. */
  seed: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { blobs } = auroraLayoutForSeed(seed);
  const gradientPrefix = `aurora-${fnv1a(seed || "huddle").toString(16)}`;
  // First alphanumeric character, so "[UAT] …" folios as "U", not "[".
  const letter = (String(initial || "").match(/[A-Za-z0-9]/)?.[0] || "").toUpperCase();
  return (
    <View style={[styles.cover, style]}>
      <LinearGradient
        colors={[INK, INK_DEEP]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg height="100%" pointerEvents="none" style={StyleSheet.absoluteFill} width="100%">
        <Defs>
          {blobs.map((blob, index) => (
            <RadialGradient cx="50%" cy="50%" id={`${gradientPrefix}-${index}`} key={`def-${index}`} r="50%">
              <Stop offset="0%" stopColor={blob.color} stopOpacity={blob.opacity} />
              <Stop offset="100%" stopColor={blob.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {blobs.map((blob, index) => (
          <Circle
            cx={`${blob.cxPct}%`}
            cy={`${blob.cyPct}%`}
            fill={`url(#${gradientPrefix}-${index})`}
            key={`blob-${index}`}
            r={`${blob.radiusPct}%`}
          />
        ))}
      </Svg>
      {/* Fine top sheen — the glassy edge that reads as premium light. */}
      <LinearGradient
        colors={["rgba(255,255,255,0.14)", "rgba(255,255,255,0)"]}
        end={{ x: 0, y: 0.5 }}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      {letter ? (
        <View pointerEvents="none" style={styles.initialWrap}>
          <Text style={styles.initial}>{letter}</Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    overflow: "hidden",
    backgroundColor: INK_DEEP,
  },
  // Large faint monogram vertically centered against the right edge — a watermark
  // behind the content that clears every corner (info button, member chip, time,
  // bottom title), so it never collides with overlaid controls.
  initialWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 16,
  },
  initial: {
    fontFamily: "Urbanist-800",
    fontSize: 64,
    lineHeight: 70,
    color: "rgba(255,255,255,0.14)",
  },
});
