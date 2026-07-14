import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeLegalPageContent } from "../content/nativeLegalPages";
import {
  huddleColors,
  huddleLayout,
  huddleRadii,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";

type NativeLegalPageProps = {
  page: NativeLegalPageContent;
};

export function NativeLegalPage({ page }: NativeLegalPageProps) {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          {page.intro.map((paragraph, index) => (
            <Text key={`intro-${index}`} style={styles.body}>
              {paragraph}
            </Text>
          ))}
          {page.sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.body.map((paragraph, index) => (
                <Text key={`${section.title}-${index}`} style={styles.body}>
                  {paragraph}
                </Text>
              ))}
              {section.bullets?.map((bullet, index) => (
                <View key={`${section.title}-bullet-${index}`} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{bullet}</Text>
                </View>
              ))}
            </View>
          ))}
          <Text style={styles.meta}>Date of creation: {page.effectiveDate}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: huddleLayout.headerHeight,
    backgroundColor: huddleColors.canvas,
    zIndex: 2,
  },
  content: {
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x9,
  },
  card: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    borderRadius: huddleRadii.glass,
    borderWidth: 1,
    borderColor: "rgba(66, 73, 101, 0.06)",
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x6,
  },
  meta: {
    marginTop: huddleSpacing.x6,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: 18,
    color: huddleColors.mutedText,
  },
  section: {
    marginTop: huddleSpacing.x5,
  },
  sectionTitle: {
    marginBottom: huddleSpacing.x2,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  body: {
    marginBottom: huddleSpacing.x3,
    fontFamily: "Urbanist-400",
    fontSize: huddleType.label,
    lineHeight: 22,
    color: huddleColors.text,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x2,
    marginBottom: huddleSpacing.x2,
  },
  bulletDot: {
    width: 12,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: 22,
    color: huddleColors.blue,
  },
  bulletText: {
    flex: 1,
    fontFamily: "Urbanist-400",
    fontSize: huddleType.label,
    lineHeight: 22,
    color: huddleColors.text,
  },
});
