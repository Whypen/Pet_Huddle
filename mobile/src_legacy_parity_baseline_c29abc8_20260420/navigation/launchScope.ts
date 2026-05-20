import type { ComponentType } from "react";
import type { RootStackParamList, TabsParamList } from "./types";
import { HomeScreen } from "../screens/HomeScreen";
import { ChatsScreen } from "../screens/ChatsScreen";
import { MapScreen } from "../screens/MapScreen";
import { PremiumScreen } from "../screens/PremiumScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { TermsScreen } from "../screens/TermsScreen";
import { PrivacyScreen } from "../screens/PrivacyScreen";
import { AccountSettingsScreen } from "../screens/AccountSettingsScreen";
import { PetProfileScreen } from "../screens/PetProfileScreen";
import { UserProfileScreen } from "../screens/UserProfileScreen";
import { CreateThreadScreen } from "../screens/CreateThreadScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";

type LaunchTabScreenDef = {
  name: keyof TabsParamList;
  component: ComponentType<object>;
};

type LaunchRootScreenName = Exclude<keyof RootStackParamList, "Auth" | "RootTabs">;

type LaunchRootScreenDef = {
  name: LaunchRootScreenName;
  component: ComponentType<object>;
};

// Keep this aligned with docs/plans/2026-04-19-phase1-native-scope-matrix.md.
// The reviewer/demo path list in that document is the single source of truth.
export const launchTabScreens = [
  { name: "Pet", component: HomeScreen },
  { name: "Chats", component: ChatsScreen },
  { name: "Map", component: MapScreen },
  { name: "Premium", component: PremiumScreen },
  { name: "Settings", component: SettingsScreen },
] satisfies LaunchTabScreenDef[];

// These stack routes are the native launch-scope screens currently exposed outside tabs.
export const launchRootScreens = [
  { name: "Terms", component: TermsScreen },
  { name: "Privacy", component: PrivacyScreen },
  { name: "PremiumPage", component: PremiumScreen },
  { name: "Notifications", component: NotificationsScreen },
  { name: "AccountSettings", component: AccountSettingsScreen },
  { name: "PetProfile", component: PetProfileScreen },
  { name: "UserProfile", component: UserProfileScreen },
  { name: "CreateThread", component: CreateThreadScreen },
] satisfies LaunchRootScreenDef[];

export const deferredNativePages = [
  "Discover standalone page",
  "AI Vet",
  "Hazard Scanner",
  "Legacy signup email confirmation",
  "Legacy subscription fallback",
] as const;
