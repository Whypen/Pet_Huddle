import { supabaseAnonKey, supabaseUrl } from "./supabase";
import { createFreshNativeAuthHeaders } from "./nativeFunctionClient";
import type { NativeOAuthProvider } from "./nativeOAuthProviders";
import { fetchNativeResponseWithTimeout as fetch } from "./nativeTimeout";

export type NativeOAuthResolutionState =
  | "registered_complete"
  | "registered_incomplete"
  | "new_oauth_signup"
  | "registered_conflict";

export type NativeOAuthResolution = {
  state: NativeOAuthResolutionState;
  registered: boolean;
  same_user: boolean;
  provider: NativeOAuthProvider;
  email?: string | null;
  email_verified?: boolean;
  provider_identity_present?: boolean;
  existing_providers?: string[];
  public_message?: string;
};

export async function resolveNativeOAuthAccount(provider: NativeOAuthProvider, accessToken: string): Promise<NativeOAuthResolution> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/resolve_native_oauth_account`, {
    method: "POST",
    headers: await createFreshNativeAuthHeaders(accessToken, {
      "content-type": "application/json",
    }),
    body: JSON.stringify({ p_provider: provider }),
  });
  const body = (await response.json().catch(() => null)) as NativeOAuthResolution | { message?: string; error?: string } | null;
  if (!response.ok) {
    const errorMessage = body && "message" in body ? body.message : body && "error" in body ? body.error : "oauth_resolution_failed";
    throw new Error(errorMessage || "oauth_resolution_failed");
  }
  const state = String((body as NativeOAuthResolution | null)?.state || "") as NativeOAuthResolutionState;
  if (!state) throw new Error("oauth_resolution_missing");
  return body as NativeOAuthResolution;
}
