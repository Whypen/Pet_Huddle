import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./types";
import { TabsNavigator } from "./TabsNavigator";
import { AuthScreen } from "../screens/AuthScreen";
import { useAuth } from "../contexts/useAuth";
import { launchRootScreens } from "./launchScope";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { user } = useAuth();

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? <Stack.Screen name="Auth" component={AuthScreen} /> : <Stack.Screen name="RootTabs" component={TabsNavigator} />}
        {launchRootScreens.map((screen) => (
          <Stack.Screen key={screen.name} name={screen.name} component={screen.component} />
        ))}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
