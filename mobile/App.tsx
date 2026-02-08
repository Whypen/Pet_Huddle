import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { supabase } from "./src/lib/supabase";
import { COLORS } from "./src/theme/tokens";
import { AuthProvider } from "./src/contexts/AuthContext";
import { UpsellBannerProvider } from "./src/contexts/UpsellBannerContext";

export default function App() {
  const [connecting, setConnecting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // UAT: Initialize realtime early to eliminate "Connecting..." lag.
        supabase.realtime.connect();
        await supabase.auth.getSession();
      } finally {
        if (!cancelled) setConnecting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (connecting) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.white }}>
          <Text style={{ color: COLORS.brandText, fontSize: 14, fontWeight: "600" }}>Connecting...</Text>
          <StatusBar style="auto" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <UpsellBannerProvider>
          <RootNavigator />
        </UpsellBannerProvider>
      </AuthProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
