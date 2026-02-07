import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { COLORS, LAYOUT } from "../theme/tokens";
import { hapticBack } from "../lib/haptics";
import type { RootStackParamList } from "../navigation/types";

export function BackButton() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const onPress = useCallback(async () => {
    await hapticBack();
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);

  return (
    <View style={{ position: "absolute", top: 0, left: 0, height: LAYOUT.headerHeight, justifyContent: "center" }}>
      <Pressable onPress={onPress} hitSlop={4} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
        {({ pressed }) => (
          <Ionicons
            name="arrow-back"
            size={24}
            // UAT: apply primary tint on press.
            color={pressed ? COLORS.brandBlue : "rgba(66,73,101,0.75)"}
          />
        )}
      </Pressable>
    </View>
  );
}
