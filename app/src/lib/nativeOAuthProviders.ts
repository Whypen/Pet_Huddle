export type NativeOAuthProvider = "apple" | "google";

export type NativeOAuthProviderConfig = {
  provider: NativeOAuthProvider;
  label: string;
  signInName: string;
};

export const NATIVE_OAUTH_PROVIDER_CONFIG: Record<NativeOAuthProvider, NativeOAuthProviderConfig> = {
  apple: {
    provider: "apple",
    label: "Apple",
    signInName: "Apple Sign In",
  },
  google: {
    provider: "google",
    label: "Google",
    signInName: "Google Sign-In",
  },
};

export const isNativeOAuthProvider = (value: unknown): value is NativeOAuthProvider => {
  return value === "apple" || value === "google";
};

export const nativeOAuthProviderLabel = (provider: string | null | undefined) => {
  return isNativeOAuthProvider(provider)
    ? NATIVE_OAUTH_PROVIDER_CONFIG[provider].label
    : "this sign-in provider";
};

export const nativeOAuthProviderSignInName = (provider: string | null | undefined) => {
  return isNativeOAuthProvider(provider)
    ? NATIVE_OAUTH_PROVIDER_CONFIG[provider].signInName
    : "this sign-in method";
};

export const nativeOAuthSignInRequiredCopy = (provider: string | null | undefined) => {
  const label = nativeOAuthProviderLabel(provider);
  const signInName = nativeOAuthProviderSignInName(provider);
  return `This email is linked to ${signInName}. Continue with ${label} instead.`;
};

export const nativeOAuthResetNotAvailableCopy = (provider: string | null | undefined) => {
  const label = nativeOAuthProviderLabel(provider);
  const signInName = nativeOAuthProviderSignInName(provider);
  return `This account uses ${signInName}. Continue with ${label} to access huddle.`;
};
