import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  APPLE_RESET_NOT_AVAILABLE_COPY,
  APPLE_SIGN_IN_REQUIRED_COPY,
  getNativeOAuthOnlyProvider,
  getNativeAuthProviders,
  hasNativePasswordProvider,
  isNativeAppleOnlyAccount,
  isNativeOAuthOnlyAccount,
  nativeOAuthAccountResetNotAvailableCopy,
  nativeOAuthAccountSignInRequiredCopy,
} from "./nativeAuthAccountType";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../..");
const readRepoFile = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

describe("native OAuth account contract", () => {
  it("classifies OAuth-only, email-password, and mixed accounts", () => {
    expect(getNativeAuthProviders({
      app_metadata: { provider: "apple", providers: ["apple"] },
      identities: [{ provider: "apple" }],
    })).toEqual(["apple"]);
    expect(isNativeAppleOnlyAccount({
      app_metadata: { provider: "apple", providers: ["apple"] },
      identities: [{ provider: "apple" }],
    })).toBe(true);
    expect(getNativeOAuthOnlyProvider({
      app_metadata: { provider: "google", providers: ["google"] },
      identities: [{ provider: "google" }],
    })).toBe("google");
    expect(isNativeOAuthOnlyAccount({
      app_metadata: { provider: "google", providers: ["google"] },
      identities: [{ provider: "google" }],
    })).toBe(true);
    expect(hasNativePasswordProvider({
      app_metadata: { provider: "email", providers: ["email"] },
      identities: [{ provider: "email" }],
    })).toBe(true);
    expect(isNativeAppleOnlyAccount({
      app_metadata: { provider: "apple", providers: ["apple", "email"] },
      identities: [{ provider: "apple" }, { provider: "email" }],
    })).toBe(false);
  });

  it("maps OAuth-only password login and reset to provider product copy", () => {
    const authScreen = readRepoFile("app/src/screens/NativeAuthScreen.tsx");

    expect(authScreen).toContain("APPLE_SIGN_IN_REQUIRED_COPY");
    expect(authScreen).toContain("APPLE_RESET_NOT_AVAILABLE_COPY");
    expect(APPLE_SIGN_IN_REQUIRED_COPY).toBe("This email is linked to Apple Sign In. Continue with Apple instead.");
    expect(APPLE_RESET_NOT_AVAILABLE_COPY).toBe("This account uses Apple Sign In. Continue with Apple to access huddle.");
    const googleOnly = { app_metadata: { provider: "google", providers: ["google"] }, identities: [{ provider: "google" }] };
    expect(nativeOAuthAccountSignInRequiredCopy(googleOnly)).toBe("This email is linked to Google Sign-In. Continue with Google instead.");
    expect(nativeOAuthAccountResetNotAvailableCopy(googleOnly)).toBe("This account uses Google Sign-In. Continue with Google to access huddle.");
  });

  it("does not read or persist password draft state from Auth create-account prefill", () => {
    const authScreen = readRepoFile("app/src/screens/NativeAuthScreen.tsx");

    expect(authScreen).toMatch(/loadNativeSignupDraft\(\{\s*includePassword: false,?\s*\}\)/);
    expect(authScreen).toContain("saveNativeSignupDraft({ ...currentDraft, email: prefillEmail }, { includePassword: false })");
  });

  it("hides password change for OAuth-only signed-in accounts", () => {
    const securityScreen = readRepoFile("app/src/screens/NativeSecuritySettingsScreen.tsx");

    expect(securityScreen).toContain("isNativeOAuthOnlyAccount(session.user)");
    expect(securityScreen).toContain("hasNativePasswordProvider(session.user) && !oauthOnly");
    expect(securityScreen).toContain("{passwordLoginAvailable ? (");
  });

  it("blocks OAuth-only password login and reset in Edge functions", () => {
    const authLogin = readRepoFile("supabase/functions/auth-login/index.ts");
    const resetPassword = readRepoFile("supabase/functions/auth-reset-password/index.ts");
    const authAccountType = readRepoFile("supabase/functions/_shared/authAccountType.ts");

    expect(authLogin).toContain('oauthOnlyAuthError(user, "signin")');
    expect(resetPassword).toContain('oauthOnlyAuthError(user, "reset")');
    expect(authAccountType).toContain('`${provider}_oauth_required`');
    expect(authAccountType).toContain("Google Sign-In");
  });

  it("keeps native Google OAuth on the ID-token path and never the Supabase hosted redirect path", () => {
    const authScreen = readRepoFile("app/src/screens/NativeAuthScreen.tsx");
    const rootNavigator = readRepoFile("app/src/navigation/RootNavigator.tsx");

    expect(authScreen).toContain('handleNativeOAuthSignIn("google")');
    expect(authScreen).toMatch(/signInWithIdToken\(\{\s*provider,\s*token,?\s*\}\)/);
    expect(authScreen).toContain("GoogleSignin.signIn()");
    expect(authScreen).toContain("resolveNativeOAuthAccount(provider, data.session.access_token)");
    expect(authScreen).not.toContain("signInWithOAuth");
    expect(rootNavigator).toContain("options?.oauthResolution");
    expect(rootNavigator).toContain('options.oauthResolution.state === "new_oauth_signup"');
    expect(rootNavigator).toContain('options.oauthResolution.state === "registered_incomplete"');
    expect(rootNavigator).toContain("isNativeOAuthProvider(options?.source)");
  });

  it("does not swallow real Google OAuth failures as silent cancel", () => {
    const authScreen = readRepoFile("app/src/screens/NativeAuthScreen.tsx");
    const oauthBody = authScreen.slice(
      authScreen.indexOf("const getNativeOAuthIdToken = useCallback"),
      authScreen.indexOf("const handleBiometricLogin"),
    );

    expect(oauthBody).toContain("isCancelledResponse(result)");
    expect(oauthBody).toContain("isSuccessResponse(result)");
    expect(oauthBody).toContain("google_sign_in_incomplete");
    expect(oauthBody).toContain("google_identity_token_missing");
    expect(oauthBody).toContain("code === statusCodes.SIGN_IN_CANCELLED || raw === \"google_sign_in_cancelled\"");
    expect(oauthBody).not.toContain('raw.includes("cancel")');
    expect(oauthBody).toContain('logNativeOAuthFailure(provider, "supabase_session", error)');
  });

  it("keeps OAuth email reconciliation server-owned and conflict-safe", () => {
    const migration = readRepoFile("supabase/migrations/20260607123500_native_oauth_email_resolution.sql");
    const client = readRepoFile("app/src/lib/nativeOAuthResolution.ts");

    expect(migration).toContain("create or replace function public.resolve_native_oauth_account");
    expect(migration).toContain("auth.identities");
    expect(migration).toContain("lower(coalesce(p.email, '')) = v_email");
    expect(migration).toContain("nullif(btrim(coalesce(p.social_id, '')), '') is not null");
    expect(migration).toContain("'registered_complete'");
    expect(migration).toContain("'registered_incomplete'");
    expect(migration).toContain("'new_oauth_signup'");
    expect(migration).toContain("'registered_conflict'");
    expect(migration).toContain("same_user");
    expect(client).toContain("/rest/v1/rpc/resolve_native_oauth_account");
  });

  it("requires the native Google iOS return scheme before showing Google sign-in", () => {
    const authScreen = readRepoFile("app/src/screens/NativeAuthScreen.tsx");
    const appConfig = readRepoFile("app/app.json");

    expect(authScreen).toContain("googleSignInIosUrlScheme");
    expect(authScreen).toContain("Linking.canOpenURL(`${googleSignInIosUrlScheme}:/`)");
    expect(authScreen).toContain("setGoogleAvailable(false)");
    expect(appConfig).toContain("@react-native-google-signin/google-signin");
    expect(appConfig).toContain("com.googleusercontent.apps.1001575603946-2qgdsucl7k5ehkkbq6ksnpe504teic28");
  });
});
