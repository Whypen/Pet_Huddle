export type NativeSettingsOverlayName = "account";

export type NativeSettingsDrawerNavigationResolution = {
  closeSettings: boolean;
  overlay: NativeSettingsOverlayName | null;
  path: string | null;
  returnToSettings: boolean;
};

export const resolveNativeSettingsDrawerNavigation = (
  path: string,
): NativeSettingsDrawerNavigationResolution => {
  if (path === "/settings" || path.startsWith("/settings?")) {
    return {
      closeSettings: true,
      overlay: "account",
      path: null,
      returnToSettings: false,
    };
  }

  if (path.startsWith("/verify-identity") && path.includes("from=settings")) {
    return {
      closeSettings: true,
      overlay: null,
      path,
      returnToSettings: true,
    };
  }

  return {
    closeSettings: false,
    overlay: null,
    path,
    returnToSettings: false,
  };
};
