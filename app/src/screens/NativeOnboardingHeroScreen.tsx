import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import onboardingHeroImage from "../../assets/onboarding-hero.jpg";
import huddleWordmarkWhite from "../../assets/huddle-wordmark-white.png";
import { huddleColors, huddleSpacing } from "../theme/huddleDesignTokens";

type NativeOnboardingHeroScreenProps = {
  onContinue: () => void;
};

export function NativeOnboardingHeroScreen({ onContinue }: NativeOnboardingHeroScreenProps) {
  // Tap-anywhere to continue, while still allowing the long definition to scroll:
  // a drag cancels the press (scroll), a clean tap advances.
  const draggingRef = useRef(false);

  const handleContinue = () => {
    if (draggingRef.current) return;
    onContinue();
  };

  return (
    <View style={styles.screen}>
      <ExpoImage
        accessibilityIgnoresInvertColors
        cachePolicy="memory-disk"
        contentFit="cover"
        source={onboardingHeroImage}
        style={StyleSheet.absoluteFill}
        transition={200}
      />
      <LinearGradient
        colors={[huddleColors.heroOverlayStrong, huddleColors.heroOverlaySoft, huddleColors.heroOverlayStrong]}
        locations={[0, 0.42, 0.92]}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <Pressable accessibilityRole="button" accessibilityLabel="Enter huddle" onPress={handleContinue} style={styles.pressArea}>
          <ScrollView
            contentContainerStyle={styles.content}
            onScrollBeginDrag={() => { draggingRef.current = true; }}
            onScrollEndDrag={() => { setTimeout(() => { draggingRef.current = false; }, 120); }}
            onMomentumScrollEnd={() => { draggingRef.current = false; }}
            showsVerticalScrollIndicator={false}
          >
            <ExpoImage
              accessibilityLabel="huddle"
              contentFit="contain"
              source={huddleWordmarkWhite}
              style={styles.wordmark}
            />

            <View style={styles.metaRow}>
              <Text style={styles.metaNoun}>noun</Text>
              <View style={styles.metaRule} />
              <Text style={styles.metaIpa}>/ˈhʌd.əl/</Text>
            </View>

            <Text style={styles.lead}>
              A circle of people who come close, think fast, and work together.
            </Text>

            <Text style={styles.body}>
              huddle is formed around a pet who needs care before it's too late — a lost dog, a stray cat, or a hazard on the street — so everyone knows what happened, where help is needed, and what they can do.
            </Text>

            <Text style={styles.body}>
              Because not everyone can rescue full-time.{"\n"}Not everyone can foster.{"\n"}Not everyone knows who to call.
            </Text>

            <Text style={styles.emphasis}>But everyone can do something.</Text>

            <Text style={styles.closing}>
              <Text style={styles.closingBrand}>huddle</Text> is a circle for every pet.
            </Text>

            <Text style={styles.tapHint}>Tap anywhere to continue</Text>
          </ScrollView>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: huddleColors.blue,
  },
  safeArea: {
    flex: 1,
  },
  pressArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x6,
    paddingVertical: huddleSpacing.x8,
    gap: huddleSpacing.x4,
  },
  wordmark: {
    width: 168,
    height: 52,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    marginTop: -huddleSpacing.x1,
  },
  metaNoun: {
    fontFamily: "Urbanist-500",
    fontStyle: "italic",
    fontSize: 15,
    lineHeight: 18,
    color: huddleColors.onPrimary,
  },
  metaRule: {
    width: 28,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  metaIpa: {
    fontFamily: "Urbanist-500",
    fontSize: 15,
    lineHeight: 18,
    color: "rgba(255,255,255,0.85)",
  },
  lead: {
    fontFamily: "Urbanist-700",
    fontSize: 24,
    lineHeight: 31,
    color: huddleColors.onPrimary,
  },
  body: {
    fontFamily: "Urbanist-500",
    fontSize: 16,
    lineHeight: 25,
    color: "rgba(255,255,255,0.92)",
  },
  emphasis: {
    fontFamily: "Urbanist-700",
    fontSize: 18,
    lineHeight: 25,
    color: huddleColors.coral,
  },
  closing: {
    marginTop: huddleSpacing.x1,
    fontFamily: "Urbanist-700",
    fontSize: 18,
    lineHeight: 26,
    color: huddleColors.onPrimary,
  },
  closingBrand: {
    fontFamily: "Urbanist-800",
    color: huddleColors.coral,
  },
  tapHint: {
    marginTop: huddleSpacing.x5,
    fontFamily: "Urbanist-600",
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.7)",
  },
});
