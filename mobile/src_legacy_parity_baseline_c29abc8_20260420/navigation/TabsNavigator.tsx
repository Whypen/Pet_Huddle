import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, LAYOUT } from "../theme/tokens";
import type { TabsParamList } from "./types";
import { launchTabScreens } from "./launchScope";

const Tab = createBottomTabNavigator<TabsParamList>();

export function TabsNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopColor: `${COLORS.brandText}1F`,
          height: 56,
        },
        tabBarItemStyle: { paddingVertical: 8 },
        tabBarLabelStyle: { fontSize: 12, color: COLORS.brandText },
        tabBarIcon: ({ focused, color, size }) => {
          const c = focused ? COLORS.brandBlue : "rgba(66,73,101,0.55)";
          const s = size ?? 22;
          let icon: keyof typeof Ionicons.glyphMap = "home";
          if (route.name === "Pet") icon = "paw";
          if (route.name === "Chats") icon = "chatbubbles";
          if (route.name === "Map") icon = "map";
          if (route.name === "Premium") icon = "diamond";
          if (route.name === "Settings") icon = "settings";
          return <Ionicons name={icon} size={s} color={c} />;
        },
      })}
    >
      {launchTabScreens.map((screen) => (
        <Tab.Screen key={screen.name} name={screen.name} component={screen.component} />
      ))}
    </Tab.Navigator>
  );
}
