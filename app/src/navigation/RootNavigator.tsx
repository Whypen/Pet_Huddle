import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { WebShellScreen } from "../screens/WebShellScreen";

type RootStackParamList = {
  Shell: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Shell" component={WebShellScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
