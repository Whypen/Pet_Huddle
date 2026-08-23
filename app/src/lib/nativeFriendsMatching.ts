// Friends Matching (a.k.a. "Open to Friends Matching" in Account Settings) is
// backed by the inverted `non_social` profile flag: non_social === true means the
// user has paused matching (they don't appear in Discovery and can't swipe). This
// helper flips that single field so the Discovery deck can re-enable matching
// inline without touching the user's other privacy settings (e.g. map precision).

import { createNativeAuthenticatedHeaders, getFreshNativeAccessToken } from "./nativeFunctionClient";
import { supabaseAnonKey, supabaseUrl } from "./supabase";
import { fetchNativeResponseWithTimeout as fetch } from "./nativeTimeout";

export async function setNativeFriendsMatchingEnabled(
  userId: string,
  enabled: boolean,
  accessToken?: string | null,
): Promise<void> {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) throw new Error("missing_user_id");
  const token = await getFreshNativeAccessToken(accessToken);
  if (!token) throw new Error("auth_required");
  const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
  url.searchParams.set("id", `eq.${cleanUserId}`);
  const response = await fetch(url.toString(), {
    method: "PATCH",
    headers: createNativeAuthenticatedHeaders(token, {
      "content-type": "application/json",
      prefer: "return=minimal",
    }),
    // enabled = open to matching → discovery_opt_out must be false.
    body: JSON.stringify({ discovery_opt_out: !enabled }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `profile_patch_failed_${response.status}`);
  }
}
