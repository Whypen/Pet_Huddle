export type RootStackParamList = {
  RootTabs:
    | {
        screen?: keyof TabsParamList;
        params?: TabsParamList[keyof TabsParamList];
      }
    | undefined;
  Auth: undefined;
  Terms: undefined;
  Privacy: undefined;
  PremiumPage: undefined;
  AccountSettings: undefined;
  PetProfile: { mode: "add" | "edit" } | undefined;
  UserProfile: undefined;
  CreateThread: undefined;
};

export type TabsParamList = {
  Pet: undefined;
  Chats: undefined;
  Premium: undefined;
  Settings: undefined;
};
