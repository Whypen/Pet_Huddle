import { Pressable, StyleSheet, Text, View } from "react-native";

type NativePageHeaderProps = {
  title: string;
  onBack: () => void;
};

export function NativePageHeader({ title, onBack }: NativePageHeaderProps) {
  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back" onPress={onBack} style={styles.backButton}>
          <View style={styles.arrow}>
            <View style={[styles.chevron, styles.chevronTop]} />
            <View style={[styles.chevron, styles.chevronBottom]} />
            <View style={styles.shaft} />
          </View>
        </Pressable>
        <View style={styles.titleSlot}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
        </View>
        <View style={styles.rightSlot} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    zIndex: 20,
  },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(209,213,219,0.9)",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.38)",
  },
  arrow: {
    width: 24,
    height: 24,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  chevron: {
    position: "absolute",
    left: 3,
    width: 9,
    height: 2,
    borderRadius: 2,
    backgroundColor: "rgba(74,73,101,0.85)",
  },
  chevronTop: {
    top: 8,
    transform: [{ rotate: "-45deg" }],
  },
  chevronBottom: {
    top: 14,
    transform: [{ rotate: "45deg" }],
  },
  shaft: {
    position: "absolute",
    left: 7,
    width: 13,
    height: 2,
    borderRadius: 2,
    backgroundColor: "rgba(74,73,101,0.85)",
  },
  titleSlot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  title: {
    fontFamily: "Urbanist-700",
    fontSize: 22,
    lineHeight: 25,
    color: "#424965",
  },
  rightSlot: {
    width: 40,
    height: 40,
  },
});
