import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WebShellScreen } from "../screens/WebShellScreen";
import { NativeServiceChatScreen } from "../screens/NativeServiceChatScreen";

type RootStackParamList = {
  Shell: undefined;
  NativeServiceChat: { roomId: string; userId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function NativeServiceChatRoute({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, "NativeServiceChat">) {
  return (
    <NativeServiceChatScreen
      roomId={route.params.roomId}
      userId={route.params.userId}
      onBack={() => navigation.goBack()}
    />
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Shell" component={WebShellScreen} />
        <Stack.Screen name="NativeServiceChat" component={NativeServiceChatRoute} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
