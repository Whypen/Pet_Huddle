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
      <Pressable
        onPress={onPress}
        hitSlop={4}
        style={({ pressed }) => ({
          paddingHorizontal: 12,
          paddingVertical: 8,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Ionicons name="arrow-back" size={24} color={COLORS.brandBlue} />
      </Pressable>
    </View>
  );
}

