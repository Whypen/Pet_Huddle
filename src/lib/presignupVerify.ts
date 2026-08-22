/**
 * Pre-signup email verification.
 *
 * `supabase/functions/auth-signup/index.ts:658-660` rejects any email signup
 * without a `signup_proof`:
 *
 *   const signupProof = String(body.signup_proof || "").trim();
 *   if (!signupProof) return json(403, { error: "signup_proof_required" });
 *
 * The proof is only issued after the address is verified, so this is not a
 * client convention that can be skipped — it is enforced server-side.
 *
 * The exchange, as the deployed functions implement it:
 *   1. send-pre-signup-verify   { email, turnstile_token } -> { ok, resend_key }
 *      and emails a link carrying a token.
 *   2. The recipient opens that link, which calls confirm-pre-signup-verify
 *      with the TOKEN (index.ts:48-53 — a token, not a numeric code; there is
 *      no code-entry endpoint to build against).
 *   3. get-pre-signup-verify-status { email, resend_key } -> { verified,
 *      signup_proof, auth_confirmed, expired }, polled by the waiting tab.
 */

import { postPublicFunction } from "@/lib/publicFunctionClient";

export type SendVerifyResult = {
  ok: boolean;
  resendKey: string;
  email: string;
  emailSent: boolean;
};

export type VerifyStatus = {
  verified: boolean;
  signupProof: string;
  authConfirmed: boolean;
  expired: boolean;
};

export async function sendPresignupVerify(
  email: string,
  turnstileToken: string,
  resendKey?: string,
): Promise<SendVerifyResult | null> {
  const { data, error } = await postPublicFunction<{
    ok?: boolean;
    resend_key?: string;
    email?: string;
    email_sent?: boolean;
  }>("send-pre-signup-verify", {
    email: email.trim().toLowerCase(),
    // The server takes a resend key OR a fresh Turnstile token, never both.
    resend_key: resendKey || undefined,
    turnstile_token: resendKey ? undefined : turnstileToken,
  });

  if (error || !data?.ok) return null;
  return {
    ok: true,
    resendKey: String(data.resend_key || "").trim(),
    email: String(data.email || email).trim().toLowerCase(),
    emailSent: data.email_sent !== false,
  };
}

export async function readPresignupStatus(email: string, resendKey: string): Promise<VerifyStatus | null> {
  const { data, error } = await postPublicFunction<{
    verified?: boolean;
    signup_proof?: string;
    auth_confirmed?: boolean;
    expired?: boolean;
  }>("get-pre-signup-verify-status", {
    email: email.trim().toLowerCase(),
    resend_key: resendKey || undefined,
  });

  if (error || !data) return null;
  return {
    verified: Boolean(data.verified),
    signupProof: String(data.signup_proof || "").trim(),
    authConfirmed: Boolean(data.auth_confirmed),
    expired: Boolean(data.expired),
  };
}
