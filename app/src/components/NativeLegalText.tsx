import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

type NativeLegalTextProps = {
  children: string;
  style?: StyleProp<TextStyle>;
};

/** Keeps the registered HUDDLE brand name consistent in every legal surface. */
export function NativeLegalText({ children, style }: NativeLegalTextProps) {
  return (
    <Text style={style}>
      {children.split(/(HUDDLE)/g).map((part, index) => (
        part === "HUDDLE"
          ? <Text key={`brand-${index}`} style={styles.brand}>{part}</Text>
          : part
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  brand: {
    fontFamily: "Urbanist-800",
    fontWeight: "800",
  },
});
