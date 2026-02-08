import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./types";
import { TabsNavigator } from "./TabsNavigator";
import { TermsScreen } from "../screens/TermsScreen";
import { PrivacyScreen } from "../screens/PrivacyScreen";
import { AuthScreen } from "../screens/AuthScreen";
import { AccountSettingsScreen } from "../screens/AccountSettingsScreen";
import { PetProfileScreen } from "../screens/PetProfileScreen";
import { UserProfileScreen } from "../screens/UserProfileScreen";
import { CreateThreadScreen } from "../screens/CreateThreadScreen";
import { PremiumScreen } from "../screens/PremiumScreen";
import { useAuth } from "../contexts/useAuth";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { user } = useAuth();

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? <Stack.Screen name="Auth" component={AuthScreen} /> : <Stack.Screen name="RootTabs" component={TabsNavigator} />}
        <Stack.Screen name="Terms" component={TermsScreen} />
        <Stack.Screen name="Privacy" component={PrivacyScreen} />
        <Stack.Screen name="PremiumPage" component={PremiumScreen} />
        <Stack.Screen name="AccountSettings" component={AccountSettingsScreen} />
        <Stack.Screen name="PetProfile" component={PetProfileScreen} />
        <Stack.Screen name="UserProfile" component={UserProfileScreen} />
        <Stack.Screen name="CreateThread" component={CreateThreadScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
