import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import urbanist400 from "./assets/fonts/Urbanist-400.ttf";
import urbanist500 from "./assets/fonts/Urbanist-500.ttf";
import urbanist600 from "./assets/fonts/Urbanist-600.ttf";
import urbanist600Italic from "./assets/fonts/Urbanist-600Italic.ttf";
import urbanist700 from "./assets/fonts/Urbanist-700.ttf";
import urbanist800 from "./assets/fonts/Urbanist-800.ttf";
import { NativeBootBrandMedia, RootNavigator } from "./src/navigation/RootNavigator";

export default function App() {
  const [fontsLoaded] = useFonts({
    "Urbanist-400": urbanist400,
    "Urbanist-500": urbanist500,
    "Urbanist-600": urbanist600,
    "Urbanist-600Italic": urbanist600Italic,
    "Urbanist-700": urbanist700,
    "Urbanist-800": urbanist800,
  });

  if (!fontsLoaded) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <NativeBootBrandMedia mode="loading" />
          <StatusBar style="auto" />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <RootNavigator />
          <StatusBar style="auto" />
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
