import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { nativePetPresentationImageStyle } from "../../lib/nativePetPhotoPresentation";
import { LinearGradient } from "expo-linear-gradient";
import { FontAwesome5 } from "@expo/vector-icons";
import huddleWordmark from "../../../assets/huddle-wordmark-white.png";
import huddleLogoTransparent from "../../../assets/huddle-logo-transparent.png";
import { isReduceMotionActive } from "../../lib/nativeReduceMotion";

// The shareable "collector card". Pure render — props in, view out — so the same
// component drives the live 3D presenter AND the off-screen view-shot capture.
// Every string rendered here arrives from a DB-backed field via shareCardData;
// nothing is invented in this file, and absent data simply doesn't render.
//
// Type grid (the whole card obeys this):
//   display  Urbanist-800 46/48   (name)
//   title    Urbanist-800 30/34   (pack/pet titles)
//   label    Urbanist-800 12/16   (chips, ticker, stats labels)
//   micro    Urbanist-800 10/14 +3 tracking, uppercase (eyebrow, rail, scan)
//   body     Urbanist-700 15/20   (subline, ledger values)
// Block rhythm: multiples of 4; card padding 20.

const INK = "#0C1E5C";
const CREAM = "#FFF9F0";
const LIME = "#BFFF00";
const CORAL = "#FF751F";
const BLUE = "#2145CF";

const WORDMARK = huddleWordmark;
const WATERMARK = huddleLogoTransparent;

// Ground-truth row fit: for k = n..1 build the COMPLETE candidate line
// ("A · B · +1", …), measure each candidate's real rendered width in a hidden
// unconstrained pass, and show the longest candidate that fits the row. No
// per-item arithmetic (joins/kerning/letter-spacing made estimates drop items
// early); the thing measured is exactly the thing displayed.
function MeasuredFitList({ items, width, textStyle }: { items: string[]; width: number; textStyle: StyleProp<TextStyle> }) {
  const key = items.join("|");
  const candidates = items.map((_, idx) => {
    const k = idx + 1;
    const extra = items.length - k;
    return items.slice(0, k).map((t) => t.toUpperCase()).join(" · ") + (extra > 0 ? ` · +${extra}` : "");
  });
  const [candW, setCandW] = useState<Array<number | null>>(() => candidates.map(() => null));
  useEffect(() => { setCandW(candidates.map(() => null)); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = candW.length === candidates.length && candW.every((w) => w != null);

  let text = candidates[candidates.length - 1] ?? "";
  if (ready) {
    let pick = 0; // fallback: first item alone (may shrink via numberOfLines fit below)
    for (let k = candidates.length - 1; k >= 0; k -= 1) {
      if ((candW[k] as number) <= width) { pick = k; break; }
    }
    text = candidates[pick];
  }

  return (
    <View style={{ width }}>
      {!ready ? (
        // Hidden measuring pass. Rows are absolutely positioned with no width
        // constraint (alignSelf flex-start) so each candidate reports its true
        // intrinsic width. Visible line is withheld until measured.
        <View style={{ position: "absolute", opacity: 0, width: 2000 }} pointerEvents="none">
          {candidates.map((candidate, i) => (
            <Text
              key={`${candidate}-${i}`}
              style={[textStyle, { alignSelf: "flex-start" }]}
              onLayout={(event) => {
                const measured = event.nativeEvent.layout.width;
                setCandW((prev) => {
                  if (prev[i] != null) return prev;
                  const next = [...prev];
                  next[i] = measured;
                  return next;
                });
              }}
            >
              {candidate}
            </Text>
          ))}
        </View>
      ) : null}
      {ready ? (
        <Text adjustsFontSizeToFit={items.length > 1} minimumFontScale={0.78} numberOfLines={1} style={textStyle}>{text}</Text>
      ) : <Text adjustsFontSizeToFit={items.length > 1} minimumFontScale={0.78} numberOfLines={1} style={textStyle}>{items.map((item) => item.toUpperCase()).join(" · ") || "ANIMAL FRIEND"}</Text>}
    </View>
  );
}

function MeasuredFittingName({ name, width }: { name: string; width: number }) {
  const [intrinsicWidth, setIntrinsicWidth] = useState<number | null>(null);
  useEffect(() => setIntrinsicWidth(null), [name]);
  const needsTwoLines = intrinsicWidth !== null && intrinsicWidth * 0.5 > width;
  return (
    <View style={{ width }}>
      {intrinsicWidth === null ? (
        <View pointerEvents="none" style={styles.nameMeasureHost}>
          <Text onLayout={(event) => setIntrinsicWidth(Math.ceil(event.nativeEvent.layout.width))} style={[styles.bigName, styles.nameMeasureText]}>{name}</Text>
        </View>
      ) : null}
      <Text
        adjustsFontSizeToFit
        minimumFontScale={needsTwoLines ? 0.35 : 0.5}
        numberOfLines={needsTwoLines ? 2 : 1}
        style={styles.bigName}
      >
        {name}
      </Text>
    </View>
  );
}

export type ShareCardVariant = "profile" | "care";
export type ShareCardTier = "free" | "plus" | "gold";

export type ShareCardPet = {
  name: string;
  emoji?: string;
  photoUri?: string | null;
  photoPosition?: { centerX: number; centerY: number; widthPct: number; sourceAspect?: number } | null;
  /** Deterministic hue for the branded fallback tile when no photo. */
  hue?: number;
};

export type ShareCardData = {
  variant: ShareCardVariant;
  name: string;
  handle: string; // "@social_id"
  photoUri?: string | null;
  tier: ShareCardTier;
  verified: boolean;
  /** Eyebrow list (roles for profile, services for care). Rendered as a
      measured fit-list that fills the row and shows "+N" when items overflow. */
  eyebrowItems: string[];
  subline: string;
  /** Top-left sticker chips (first is solid accent). Render only what's true.
      `sparkle` renders the engagement star (half = Top, full = Loyal Member). */
  stickers: Array<{ label: string; dot?: boolean; sparkle?: "half" | "full" }>;
  /** Care card only: service chips above the name. */
  badges: string[];
  /** Vertical rail — profile: "#71 · huddle since May 2026"; care: credentials. */
  railText: string;
  ticker: string[];
  deepLink?: string | null;
  /** Back-footer line (e.g. same member line as the rail). */
  footerLine: string;
  pets: ShareCardPet[];
  careStats?: Array<[string, string]>;
  careRows?: Array<[string, string]>;
};

// --- deterministic badge fit: keep whole labels, drop overflow into "+N" ------
// Metrics match the actual chip styles (font 11, paddingH 10): Urbanist-800 at
// 11px averages ~6.2px/glyph. Over-reserving here is what pushed labels into
// "+N" with visible space left over.
export function fitBadges(labels: string[], availableWidth: number): { shown: string[]; extra: number } {
  const GAP = 6;
  const PAD = 20;
  const CHAR = 6.3;
  const PLUS_W = 38;
  const widthOf = (label: string) => Math.ceil(label.length * CHAR) + PAD;
  const fit: string[] = [];
  let used = 0;
  for (const label of labels) {
    const w = widthOf(label) + (fit.length ? GAP : 0);
    if (used + w > availableWidth) break;
    fit.push(label);
    used += w;
  }
  if (fit.length === labels.length) return { shown: fit, extra: 0 };
  const budget = availableWidth - PLUS_W - GAP;
  const shown: string[] = [];
  used = 0;
  for (const label of labels) {
    const w = widthOf(label) + (shown.length ? GAP : 0);
    if (used + w > budget) break;
    shown.push(label);
    used += w;
  }
  return { shown, extra: labels.length - shown.length };
}

const petFallback = (hue = 210) => `hsl(${hue}, 65%, 52%)`;

function TierWordmark({ tier, accent, tint }: { tier: ShareCardTier; accent: string; tint?: string }) {
  return (
    <View style={styles.wordmarkRow}>
      <View style={styles.wordmarkClip}>
        <Image source={WORDMARK} resizeMode="contain" style={[styles.wordmarkImg, tint ? { tintColor: tint } : null]} />
      </View>
      {tier === "plus" ? <Text style={[styles.wordmarkSuffix, { color: accent }]}>+</Text> : null}
      {tier === "gold" ? <Text style={[styles.wordmarkSuffix, { color: accent }]}>＊</Text> : null}
    </View>
  );
}

// ── Lenticular foil ──────────────────────────────────────────────────────────
// Matches the approved stress-test look: REPEATING rainbow stripes (a 5-color
// cycle repeated across the band, not one wash), sliding at two parallax rates
// with a specular streak on top. RN has no blend modes; saturation × opacity is
// tuned to read like the demo. The stripes also drift slowly on their own so
// the foil is alive even when the card rests.
const CYCLE = ["#FF3C78", "#FFC828", "#50FF8C", "#3CB4FF", "#B45AFF"];
const STRIPES: string[] = [];
const STOPS: number[] = [];
for (let r = 0; r < 5; r += 1) {
  CYCLE.forEach((c, i) => {
    STRIPES.push(c);
    STOPS.push((r * CYCLE.length + i) / (5 * CYCLE.length - 1));
  });
}

function Holo({ spin, width }: { spin?: Animated.Value; width: number }) {
  const bandW = width * 3;
  const idle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isReduceMotionActive()) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(idle, { toValue: 1, duration: 5200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(idle, { toValue: 0, duration: 5200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [idle]);
  const idleShift = idle.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.12, width * 0.12] });
  const spinShift = (rate: number, base: number) => spin
    ? spin.interpolate({ inputRange: [-360, 360], outputRange: [-width * rate + base, width * rate + base] })
    : base;
  // Thin: RN has no color-dodge (the stress test's blend brightened rather than
  // painted), so a raw overlay reads far heavier at the same alpha. Kept light
  // — a sheen that shifts, not a coat of paint.
  const glancing = spin
    ? spin.interpolate({
        inputRange: [-360, -270, -180, -90, 0, 90, 180, 270, 360],
        outputRange: [0.1, 0.24, 0.1, 0.24, 0.1, 0.24, 0.1, 0.24, 0.1],
      })
    : 0.1;
  return (
    // Own borderRadius (matching the card) — Android's clipping of ROTATED
    // children under an ancestor's rounded overflow:hidden has edge cases, so
    // the foil layer carries its own corner clip as a second line of defence.
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden", borderRadius: 22 }]}>
      <Animated.View style={{ position: "absolute", top: -60, bottom: -60, width: bandW, left: -width, opacity: glancing, transform: [{ translateX: Animated.add(spinShift(0.9, 0) as Animated.Value, idleShift) }, { rotate: "115deg" }] }}>
        <LinearGradient colors={STRIPES as [string, string, ...string[]]} locations={STOPS as [number, number, ...number[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={{ position: "absolute", top: -60, bottom: -60, width: bandW, left: -width, opacity: 0.07, transform: [{ translateX: spinShift(-0.45, width * 0.25) }, { rotate: "115deg" }] }}>
        <LinearGradient colors={[...STRIPES].reverse() as [string, string, ...string[]]} locations={STOPS as [number, number, ...number[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={{ position: "absolute", top: -60, bottom: -60, width: width * 0.8, left: -width * 0.4, opacity: 0.3, transform: [{ translateX: spinShift(1.6, width * 0.5) }, { rotate: "115deg" }] }}>
        <LinearGradient colors={["transparent", "rgba(255,255,255,0.4)", "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

// ── Marquee ticker ───────────────────────────────────────────────────────────
// True marquee: content doubled and translated on a loop, so the strip never
// reads as truncated. Static (offset 0) under reduce-motion and in captures.
function TickerMarquee({ items, accentInk }: { items: string[]; accentInk: string }) {
  const [contentW, setContentW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (contentW <= 0 || isReduceMotionActive()) return;
    x.setValue(0);
    const loop = Animated.loop(
      Animated.timing(x, { toValue: -contentW, duration: Math.max(9000, contentW * 34), easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [contentW, x]);
  const line = items.map((t) => t.toUpperCase()).join("  ✦  ");
  return (
    // A disabled horizontal ScrollView is the one RN container whose content
    // width is truly unbounded — the text can never wrap OR ellipsise, no
    // matter how long the line gets. The card row just clips it.
    <ScrollView horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false} style={styles.tickerClip} contentContainerStyle={styles.tickerContent} pointerEvents="none">
      <Animated.View style={{ flexDirection: "row", transform: [{ translateX: x }] }}>
        <Text numberOfLines={1} onLayout={(e) => setContentW(Math.ceil(e.nativeEvent.layout.width))} style={[styles.tickerText, { color: accentInk }]}>
          {line}  ✦{"  "}
        </Text>
        <Text numberOfLines={1} style={[styles.tickerText, { color: accentInk }]}>
          {line}  ✦{"  "}
        </Text>
      </Animated.View>
    </ScrollView>
  );
}

function FrontFace({ data, width, spin }: { data: ShareCardData; width: number; spin?: Animated.Value }) {
  const accent = data.variant === "care" ? CORAL : LIME;
  const accentInk = data.variant === "care" ? CREAM : INK;
  const { shown: shownBadges, extra: extraBadges } = fitBadges(data.badges, width - 40);
  return (
    <View style={styles.faceInner}>
      {data.photoUri ? (
        <ExpoImage cachePolicy="memory-disk" contentFit="cover" source={{ uri: data.photoUri }} style={StyleSheet.absoluteFill} transition={0} />
      ) : (
        <LinearGradient colors={[BLUE, INK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      )}
      {/* Brand tint — deliberately thin so the photo stays clear; the heavy
          double-wash was most of the "too much effect" complaint. */}
      <LinearGradient
        colors={data.variant === "care" ? ["rgba(255,117,31,0.22)", "rgba(33,69,207,0.16)"] : ["rgba(33,69,207,0.28)", "rgba(12,30,92,0.14)"]}
        start={{ x: 0, y: 0 }} end={{ x: 0.5, y: 1 }} pointerEvents="none" style={StyleSheet.absoluteFill}
      />
      <LinearGradient colors={["rgba(4,8,26,0.7)", "transparent"]} pointerEvents="none" style={styles.scrimTop} />
      <LinearGradient colors={["transparent", "rgba(4,8,26,0.42)", "rgba(4,8,26,0.94)"]} locations={[0, 0.44, 1]} pointerEvents="none" style={styles.scrimBottom} />
      <Holo spin={spin} width={width} />
      <View style={[styles.frame, { borderColor: "rgba(255,249,240,0.32)" }]} pointerEvents="none" />

      {/* top band: wordmark left, stamp right (locked safe zones) */}
      <View style={styles.band}>
        <TierWordmark tier={data.tier} accent={accent} />
        {data.verified ? (
          <View style={[styles.stamp, { borderColor: accent }]}>
            <Text style={[styles.stampText, { color: accent }]} numberOfLines={1}>
              {data.variant === "care" ? "CERTIFIED ✓" : "VERIFIED ✓"}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Vertical rail hugging the frame line. Run length derives from the
          card height; the text renders at full size and only shrinks when the
          string genuinely exceeds the run (adjustsFontSizeToFit). */}
      {(() => {
        const runLen = Math.round(width * 1.5) - 200;
        return (
          <View pointerEvents="none" style={[styles.rail, { width: runLen, right: -(runLen / 2 - 16) }]}>
            <Text adjustsFontSizeToFit minimumFontScale={0.6} numberOfLines={1} style={[styles.railText, { width: runLen }]}>
              {data.railText.toUpperCase()}
            </Text>
          </View>
        );
      })()}

      {/* top-left sticker chips — only truths (engagement pill, groups, status) */}
      <View style={styles.stickers}>
        {data.stickers.map((s, i) => (
          <View key={s.label} style={[styles.sticker, i === 0 ? { backgroundColor: accent } : styles.stickerGlass]}>
            {s.sparkle ? (
              <FontAwesome5 name="star" solid color={i === 0 ? accentInk : LIME} size={11} style={styles.stickerSparkle} />
            ) : s.dot ? <View style={styles.stickerDot} /> : null}
            <Text style={[styles.stickerText, { color: i === 0 ? accentInk : CREAM }]} numberOfLines={1}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* care-only service chips */}
      {shownBadges.length > 0 ? (
        <View style={styles.badgeAnchor}>
          <View style={styles.badgeRow}>
            {shownBadges.map((label) => (
              <View key={label} style={styles.badge}><Text style={styles.badgeText} numberOfLines={1}>{label}</Text></View>
            ))}
            {extraBadges > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>+{extraBadges}</Text></View> : null}
          </View>
        </View>
      ) : null}

      {/* identity block — even 6px rhythm: roles · NAME · handle */}
      <View style={styles.idBlock}>
        <MeasuredFitList items={data.eyebrowItems} width={width - 40} textStyle={[styles.eyebrow, { color: accent }]} />
        <MeasuredFittingName name={data.name} width={width - 40} />
        <Text style={styles.subName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{data.subline}</Text>
      </View>

      <View style={[styles.ticker, { backgroundColor: accent }]}>
        <TickerMarquee items={data.ticker} accentInk={accentInk} />
      </View>
    </View>
  );
}

// Back footer: barcode aesthetic + member line + handle. No QR (dropped until a
// public web landing exists — a scannable 404 is worse than none).
function BackFooter({ footerLine, handle, dark }: { footerLine: string; handle: string; dark?: boolean }) {
  const tone = dark ? INK : CREAM;
  return (
    <View style={styles.backFoot}>
      <View style={styles.footCol}>
        <Text style={[styles.scanText, { color: dark ? "rgba(12,30,92,0.75)" : "rgba(255,249,240,0.85)" }]} numberOfLines={1}>{footerLine.toUpperCase()}</Text>
        <View style={[styles.barcode, { backgroundColor: tone }]} />
        {handle ? <Text style={[styles.handleText, { color: dark ? BLUE : LIME }]} numberOfLines={1}>{handle}</Text> : null}
      </View>
    </View>
  );
}

function PetHero({ pet }: { pet: ShareCardPet }) {
  return (
    <View style={styles.hero}>
      {pet.photoUri ? (
        <ExpoImage cachePolicy="memory-disk" contentFit="fill" source={{ uri: pet.photoUri }} style={[StyleSheet.absoluteFill, nativePetPresentationImageStyle(pet.photoPosition, 4 / 5)]} transition={0} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: petFallback(pet.hue), alignItems: "center", justifyContent: "center" }]}>
          <Text style={{ fontSize: 108 }}>{pet.emoji || "🐾"}</Text>
        </View>
      )}
      <LinearGradient colors={["transparent", "rgba(4,8,26,0.85)"]} locations={[0.45, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <Text style={styles.heroName} numberOfLines={1}>{pet.name}</Text>
    </View>
  );
}

function PetRoster({ pets, width }: { pets: ShareCardPet[]; width: number }) {
  const count = pets.length;
  const cols = count === 2 ? 2 : count <= 3 ? 3 : count === 4 ? 2 : 3;
  const maxSlots = count <= 6 ? count : 9;
  const overflow = count - maxSlots;
  const shown = overflow > 0 ? maxSlots - 1 : Math.min(count, maxSlots);
  const av = count <= 2 ? 104 : count === 3 ? 82 : count === 4 ? 90 : count <= 6 ? 72 : 60;
  return (
    <View style={styles.roster}>
      {pets.slice(0, shown).map((pet, i) => (
        <View key={`${pet.name}-${i}`} style={[styles.cell, { width: (width - 40) / cols }]}>
          <View style={[styles.avatar, { width: av, height: av, borderRadius: av / 2 }]}>
            {pet.photoUri ? (
              <ExpoImage cachePolicy="memory-disk" contentFit="fill" source={{ uri: pet.photoUri }} style={[{ width: av, height: av }, nativePetPresentationImageStyle(pet.photoPosition, 1)]} transition={0} />
            ) : (
              <View style={{ width: av, height: av, alignItems: "center", justifyContent: "center", backgroundColor: petFallback(pet.hue) }}>
                <Text style={{ fontSize: Math.round(av * 0.5) }}>{pet.emoji || "🐾"}</Text>
              </View>
            )}
          </View>
          <Text style={styles.avatarName} numberOfLines={1}>{pet.name}</Text>
        </View>
      ))}
      {overflow > 0 ? (
        <View style={[styles.cell, { width: (width - 40) / cols }]}>
          <View style={[styles.avatar, styles.avatarMore, { width: av, height: av, borderRadius: av / 2 }]}>
            <Text style={[styles.avatarMoreText, { fontSize: Math.round(av * 0.3) }]}>+{overflow + 1}</Text>
          </View>
          <Text style={styles.avatarName}>more</Text>
        </View>
      ) : null}
    </View>
  );
}

function PackBack({ data, width, spin }: { data: ShareCardData; width: number; spin?: Animated.Value }) {
  const single = data.pets.length === 1;
  return (
    <View style={styles.faceInner}>
      <LinearGradient colors={["#1B3AA0", INK]} start={{ x: 0.7, y: 0 }} end={{ x: 0.2, y: 1 }} style={StyleSheet.absoluteFill} />
      <Holo spin={spin} width={width} />
      <View style={[styles.frame, { borderColor: "rgba(255,249,240,0.24)" }]} pointerEvents="none" />
      <View style={styles.binner}>
        <View style={styles.bhead}>
          <Image source={WORDMARK} style={styles.backWordmarkTop} resizeMode="contain" />
          <Text style={styles.packCount}>{single ? "1 COMPANION" : `${data.pets.length} COMPANIONS`}</Text>
        </View>
        <Text style={styles.packTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {single ? data.pets[0].name : "The pack"}
        </Text>
        <View style={styles.packStage}>
          {single ? <PetHero pet={data.pets[0]} /> : <PetRoster pets={data.pets} width={width} />}
        </View>
        <BackFooter footerLine={data.footerLine} handle={data.handle} />
      </View>
    </View>
  );
}

function CareBack({ data }: { data: ShareCardData }) {
  return (
    <View style={[styles.faceInner, { backgroundColor: CREAM }]}>
      {/* Very pale full-body watermark. */}
      <View pointerEvents="none" style={styles.ledgerWatermarkWrap}>
        <Image source={WATERMARK} resizeMode="contain" style={styles.ledgerWatermark} />
      </View>
      <View style={styles.ledgerInner}>
        <View style={styles.bhead}>
          <Image source={WORDMARK} style={styles.ledgerWordmark} resizeMode="contain" />
          <Text style={styles.ledgerTitle}>CARE PROFILE</Text>
        </View>
        {data.careStats && data.careStats.length ? (
          <View style={styles.statsRow}>
            {data.careStats.map(([v, l], i) => (
              <View key={l} style={[styles.stat, i > 0 ? styles.statDivide : null]}>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{v}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>{l.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {/* flex:1 + overflow hidden: extra rows are dropped rather than pushing
            the footer off the card ("once it's out of space, just don't have it"). */}
        <View style={styles.ledgerRows}>
          {(data.careRows || []).map(([k, v]) => (
            <View key={k + v} style={styles.ledgerRow}>
              <Text style={styles.ledgerKey} numberOfLines={1}>{k.toUpperCase()}</Text>
              <Text style={styles.ledgerVal} numberOfLines={2}>{v}</Text>
            </View>
          ))}
        </View>
        <BackFooter dark footerLine={data.footerLine} handle={data.handle} />
      </View>
    </View>
  );
}

/** No-pet profile back: exact mirror of the front with the footer strip over it. */
function MirrorBack({ data, width, spin }: { data: ShareCardData; width: number; spin?: Animated.Value }) {
  return (
    <View style={styles.faceInner}>
      <View style={StyleSheet.absoluteFill}><FrontFace data={data} width={width} spin={spin} /></View>
      <LinearGradient colors={["transparent", "rgba(4,8,26,0.5)"]} pointerEvents="none" style={StyleSheet.absoluteFill} />
      <View style={styles.mirrorScan}>
        <BackFooter footerLine={data.footerLine} handle={data.handle} />
      </View>
    </View>
  );
}

export function NativeShareCard({ data, face, spin, width = 330, style }: {
  data: ShareCardData;
  face: "front" | "back";
  /** Live rotY (degrees) from the presenter — drives the lenticular foil. */
  spin?: Animated.Value;
  width?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const height = width * 1.5;
  const Back = data.variant === "care"
    ? <CareBack data={data} />
    : data.pets.length === 0
      ? <MirrorBack data={data} width={width} spin={spin} />
      : <PackBack data={data} width={width} spin={spin} />;
  return (
    <View style={[styles.face, { width, height }, style]}>
      {face === "front" ? <FrontFace data={data} width={width} spin={spin} /> : Back}
    </View>
  );
}

const styles = StyleSheet.create({
  face: { borderRadius: 22, overflow: "hidden", backgroundColor: INK },
  faceInner: { ...StyleSheet.absoluteFillObject },
  frame: { position: "absolute", top: 10, left: 10, right: 10, bottom: 10, borderWidth: 1, borderRadius: 15 },
  scrimTop: { position: "absolute", top: 0, left: 0, right: 0, height: "30%" },
  scrimBottom: { position: "absolute", left: 0, right: 0, bottom: 0, height: "58%" },

  band: { position: "absolute", top: 20, left: 20, right: 20, height: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  wordmarkRow: { flexDirection: "row", alignItems: "center" },
  // `contain` centers the source inside 84x20; its visible pixels end at ~69px.
  // Clip there so the suffix starts at the actual glyph edge, not PNG whitespace.
  wordmarkClip: { width: 69, height: 20, overflow: "hidden" },
  wordmarkImg: { width: 84, height: 20 },
  wordmarkSuffix: { fontFamily: "Urbanist-800", fontSize: 20, lineHeight: 20, transform: [{ translateY: 2 }] },
  stamp: { borderWidth: 2, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 6, transform: [{ rotate: "4deg" }], backgroundColor: "rgba(4,8,26,0.28)" },
  stampText: { fontFamily: "Urbanist-800", fontSize: 10, lineHeight: 14, letterSpacing: 2 },

  // Rotated text's layout box rotates around its center; the run length is the
  // box `width` (computed per-card from its height) with the center anchored
  // 16px from the right edge so the run sits on the frame line.
  rail: { position: "absolute", top: 60, bottom: 140, alignItems: "center", justifyContent: "center" },
  railText: { fontFamily: "Urbanist-800", fontSize: 13, lineHeight: 17, letterSpacing: 2, color: "rgba(255,249,240,0.7)", transform: [{ rotate: "90deg" }], textAlign: "center" },

  stickers: { position: "absolute", top: 60, left: 20, gap: 8, alignItems: "flex-start" },
  sticker: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  stickerGlass: { backgroundColor: "rgba(4,8,26,0.5)", borderWidth: 1, borderColor: "rgba(255,249,240,0.4)" },
  stickerDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: LIME, marginRight: 6 },
  stickerSparkle: { marginRight: 6 },
  stickerText: { fontFamily: "Urbanist-800", fontSize: 12, lineHeight: 16 },

  badgeAnchor: { position: "absolute", left: 20, right: 20, bottom: 152 },
  badgeRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(4,8,26,0.5)", borderWidth: 1, borderColor: "rgba(255,249,240,0.35)" },
  badgeText: { fontFamily: "Urbanist-800", fontSize: 11, lineHeight: 15, color: CREAM },

  idBlock: { position: "absolute", left: 20, right: 20, bottom: 44 },
  eyebrow: { fontFamily: "Urbanist-800", fontSize: 10, lineHeight: 14, letterSpacing: 3, marginBottom: 6 },
  bigName: { fontFamily: "Urbanist-800", fontSize: 46, lineHeight: 46, letterSpacing: -1.6, color: CREAM, textTransform: "uppercase", includeFontPadding: false },
  nameMeasureHost: { position: "absolute", opacity: 0, width: 2000 },
  nameMeasureText: { alignSelf: "flex-start" },
  // Uppercase has no descenders, so the 46px line-box carries ~8px of dead
  // space BELOW the caps that doesn't exist above them. The negative top pull
  // makes the visible gap under the name equal the 6px above it.
  subName: { fontFamily: "Urbanist-700", fontSize: 15, lineHeight: 20, color: "rgba(255,249,240,0.92)", marginTop: -2 },

  ticker: { position: "absolute", left: 0, right: 0, bottom: 0, height: 30, justifyContent: "center", overflow: "hidden" },
  tickerClip: { overflow: "hidden", flexGrow: 0 },
  // Centers the marquee vertically in the 30px strip — the ScrollView content
  // container top-aligns by default, which floated the text high.
  tickerContent: { alignItems: "center", height: 30 },
  tickerText: { fontFamily: "Urbanist-800", fontSize: 12, lineHeight: 16, letterSpacing: 1.6 },

  binner: { ...StyleSheet.absoluteFillObject, padding: 20 },
  bhead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  packCount: { fontFamily: "Urbanist-800", fontSize: 10, lineHeight: 14, letterSpacing: 2, color: "rgba(255,249,240,0.7)" },
  packTitle: { fontFamily: "Urbanist-800", fontSize: 30, lineHeight: 34, letterSpacing: -1, color: CREAM, textTransform: "uppercase", marginTop: 8, marginBottom: 12 },
  packStage: { flex: 1, borderRadius: 14, overflow: "hidden" },
  backWordmarkTop: { width: 84, height: 20 },

  hero: { flex: 1, overflow: "hidden", justifyContent: "flex-end" },
  heroName: { position: "absolute", left: 14, bottom: 12, fontFamily: "Urbanist-800", fontSize: 30, lineHeight: 34, color: CREAM, textTransform: "uppercase", letterSpacing: -0.6 },

  roster: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", rowGap: 14 },
  cell: { alignItems: "center", gap: 6 },
  avatar: { borderWidth: 2.5, borderColor: CREAM, overflow: "hidden", backgroundColor: INK },
  avatarMore: { borderStyle: "dashed", borderColor: "rgba(255,249,240,0.5)", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,249,240,0.1)" },
  avatarMoreText: { fontFamily: "Urbanist-800", color: CREAM },
  avatarName: { fontFamily: "Urbanist-800", fontSize: 12, lineHeight: 16, color: CREAM, textTransform: "uppercase", maxWidth: 72 },

  backFoot: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  footCol: { flex: 1, gap: 6 },
  scanText: { fontFamily: "Urbanist-800", fontSize: 10, lineHeight: 14, letterSpacing: 2 },
  barcode: { height: 18, borderRadius: 2, opacity: 0.5 },
  handleText: { fontFamily: "Urbanist-800", fontSize: 15, lineHeight: 20 },
  mirrorScan: { position: "absolute", left: 20, right: 20, bottom: 40 },

  ledgerWatermarkWrap: { position: "absolute", top: "18%", left: "10%", width: "80%", height: "64%", alignItems: "center", justifyContent: "center" },
  // No tintColor — tinting flattens the mark to a silhouette and erases the
  // bear face. The original transparent logo at low opacity keeps the face.
  ledgerWatermark: { width: "100%", height: "100%", opacity: 0.06 },
  ledgerInner: { ...StyleSheet.absoluteFillObject, padding: 22 },
  ledgerWordmark: { width: 84, height: 20, tintColor: INK },
  ledgerTitle: { fontFamily: "Urbanist-800", fontSize: 10, lineHeight: 14, letterSpacing: 3, color: BLUE },
  statsRow: { flexDirection: "row", borderTopWidth: 2.5, borderBottomWidth: 2.5, borderColor: INK, marginTop: 12 },
  stat: { flex: 1, paddingVertical: 10, alignItems: "center" },
  statDivide: { borderLeftWidth: 1, borderColor: "rgba(12,30,92,0.22)" },
  statValue: { fontFamily: "Urbanist-800", fontSize: 22, lineHeight: 26, color: INK },
  statLabel: { fontFamily: "Urbanist-800", fontSize: 9, lineHeight: 13, letterSpacing: 1.6, color: "rgba(12,30,92,0.6)" },
  ledgerRows: { flex: 1, marginTop: 12, overflow: "hidden" },
  // minHeight (not fixed height) so two-line values expand the row instead of
  // colliding with the dashed rule; single-line rows stay perfectly even.
  ledgerRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, minHeight: 32, alignItems: "center", paddingVertical: 5, borderBottomWidth: 1, borderColor: "rgba(12,30,92,0.28)", borderStyle: "dashed" },
  ledgerKey: { fontFamily: "Urbanist-800", fontSize: 10, lineHeight: 14, letterSpacing: 1.6, color: "rgba(12,30,92,0.6)" },
  ledgerVal: { flex: 1, fontFamily: "Urbanist-700", fontSize: 12.5, lineHeight: 17, color: INK, textAlign: "right" },
});
