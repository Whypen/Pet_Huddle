import {
  nativeOAuthResetNotAvailableCopy,
  nativeOAuthSignInRequiredCopy,
} from "./nativeOAuthProviders";

type AuthIdentityLike = {
  provider?: unknown;
};

type AuthUserLike = {
  app_metadata?: Record<string, unknown> | null;
  identities?: AuthIdentityLike[] | null;
};

const cleanProvider = (value: unknown) => String(value || "").trim().toLowerCase();

export const getNativeAuthProviders = (user: AuthUserLike | null | undefined): string[] => {
  const providers = new Set<string>();
  const primaryProvider = cleanProvider(user?.app_metadata?.provider);
  if (primaryProvider) providers.add(primaryProvider);
  const metadataProviders = user?.app_metadata?.providers;
  if (Array.isArray(metadataProviders)) {
    metadataProviders.forEach((provider) => {
      const cleaned = cleanProvider(provider);
      if (cleaned) providers.add(cleaned);
    });
  }
  if (Array.isArray(user?.identities)) {
    user.identities.forEach((identity) => {
      const cleaned = cleanProvider(identity?.provider);
      if (cleaned) providers.add(cleaned);
    });
  }
  return Array.from(providers);
};

export const hasNativePasswordProvider = (user: AuthUserLike | null | undefined) => {
  const providers = getNativeAuthProviders(user);
  return providers.includes("email") || providers.includes("phone");
};

export const getNativeOAuthOnlyProvider = (user: AuthUserLike | null | undefined) => {
  const providers = getNativeAuthProviders(user).filter((provider) => provider !== "phone");
  const oauthProviders = providers.filter((provider) => provider === "apple" || provider === "google");
  if (providers.length === 1 && oauthProviders.length === 1) return oauthProviders[0];
  return null;
};

export const isNativeOAuthOnlyAccount = (user: AuthUserLike | null | undefined) => {
  return Boolean(getNativeOAuthOnlyProvider(user));
};

export const isNativeAppleOnlyAccount = (user: AuthUserLike | null | undefined) => {
  return getNativeOAuthOnlyProvider(user) === "apple";
};

export const nativeOAuthAccountSignInRequiredCopy = (user: AuthUserLike | null | undefined) => {
  return nativeOAuthSignInRequiredCopy(getNativeOAuthOnlyProvider(user));
};

export const nativeOAuthAccountResetNotAvailableCopy = (user: AuthUserLike | null | undefined) => {
  return nativeOAuthResetNotAvailableCopy(getNativeOAuthOnlyProvider(user));
};

export const APPLE_SIGN_IN_REQUIRED_COPY = nativeOAuthSignInRequiredCopy("apple");
export const APPLE_RESET_NOT_AVAILABLE_COPY = nativeOAuthResetNotAvailableCopy("apple");
