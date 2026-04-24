import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import urbanist600 from "./assets/fonts/Urbanist-600.ttf";
import urbanist700 from "./assets/fonts/Urbanist-700.ttf";
import { RootNavigator } from "./src/navigation/RootNavigator";

export default function App() {
  const [fontsLoaded] = useFonts({
    "Urbanist-600": urbanist600,
    "Urbanist-700": urbanist700,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <RootNavigator />
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
