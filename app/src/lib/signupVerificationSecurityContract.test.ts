import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../..");
const source = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

describe("signup verification security contract", () => {
  it("gates native client advancement on verified state plus a non-empty proof", () => {
    const client = source("app/src/lib/nativeSignup.ts");
    const screen = source("app/src/screens/NativeSignupScreen.tsx");

    expect(client).toContain('status?.verified === true && Boolean(String(status.signup_proof || "").trim())');
    expect(screen).toContain("if (hasUsablePreSignupProof(status))");
    expect(screen).not.toContain("if (status?.verified && status.signup_proof)");
  });

  it("does not expose verification credentials in send or status responses", () => {
    const send = source("supabase/functions/send-pre-signup-verify/index.ts");
    const status = source("supabase/functions/get-pre-signup-verify-status/index.ts");
    const confirm = source("supabase/functions/confirm-pre-signup-verify/index.ts");

    expect(send).not.toContain("token: activePendingRow.token");
    expect(send).not.toContain("signal_key: activePendingRow.signal_key");
    expect(send).not.toMatch(/return json\(\{[\s\S]{0,320}\btoken\s*:/);
    expect(send).not.toMatch(/return json\(\{[\s\S]{0,320}\bsignal_key\s*:/);
    expect(status).not.toContain("token: canonicalRow.token");
    expect(status).not.toContain("signal_key: canonicalRow.signal_key");
    expect(confirm).not.toContain("token: row.token");
    expect(confirm).not.toContain("signal_key: row.signal_key");
  });

  it("uses the canonical Universal Link owned by the native app with a web fallback", () => {
    const send = source("supabase/functions/send-pre-signup-verify/index.ts");
    const appConfig = source("app/app.json");
    const internalLinks = source("app/src/lib/nativeInternalLinks.ts");

    expect(send).toContain('const NATIVE_VERIFY_URL = "https://huddle.pet/verify"');
    expect(send).toContain('const verifyUrl = `${NATIVE_VERIFY_URL}?token=${encodeURIComponent(nextToken)}&email=${encodeURIComponent(normalizedEmail)}`');
    expect(send).toContain('headers:     { "X-Mailin-Track-Click": "0" }');
    expect(send).not.toContain('const APP_URL          = Deno.env.get("APP_URL")');
    expect(send).not.toContain('new URL("huddle://verify")');
    expect(internalLinks).toMatch(/"\/verify"/);
    expect(appConfig).toMatch(/"pathPrefix": "\/verify"/);
  });

  it("requires proof at account creation and keeps proof unavailable to email-only polling", () => {
    const signup = source("supabase/functions/auth-signup/index.ts");
    const status = source("supabase/functions/get-pre-signup-verify-status/index.ts");
    const webVerify = source("src/pages/signup/SignupVerifyEmail.tsx");
    const callback = source("src/pages/VerifyCallback.tsx");

    expect(signup).toContain('if (!signupProof)');
    expect(signup).toContain('error: "signup_proof_required"');
    expect(status).toContain("resend_key?: string");
    expect(status).toContain("resendKeyCanIssueProof");
    expect(status).toContain("constantTimeEqual(resendKey");
    expect(status).toContain("const proof = canIssueProof ? await ensureSignupProof");
    expect(webVerify).toContain("if (resp?.verified && signupProof)");
    expect(callback).toContain('data?.verified && String(data?.signup_proof || "").trim()');
  });

  it("enforces the minimum signup age on the server before creating an auth user", () => {
    const signup = source("supabase/functions/auth-signup/index.ts");
    const screen = source("app/src/screens/NativeSignupScreen.tsx");
    const ageCheckIndex = signup.indexOf("const ageCheck = validateMinimumSignupAge");
    const createUserIndex = signup.indexOf("const signUp = await createSignupUser");

    expect(signup).toContain('code: "minimum_age_required"');
    expect(ageCheckIndex).toBeGreaterThanOrEqual(0);
    expect(createUserIndex).toBeGreaterThan(ageCheckIndex);
    expect(screen).toContain("dob: draft.dob");
  });

  it("lets native polling recover proof through the existing resend capability without exposing the email token", () => {
    const native = source("app/src/lib/nativeSignup.ts");
    const screen = source("app/src/screens/NativeSignupScreen.tsx");
    expect(native).toContain("resendKey?: string");
    expect(native).toContain("resend_key: resendKey?.trim() || undefined");
    expect(screen).toContain("latest.presignupResendKey || undefined");
  });

  it("keeps native verification polling sequential, bounded, and scoped to the active email step", () => {
    const screen = source("app/src/screens/NativeSignupScreen.tsx");

    expect(screen).toContain("const POLL_WINDOW_MS = 2 * 60 * 1000;");
    expect(screen).toContain("if (existing?.email === email) return existing.request;");
    expect(screen).toContain('currentScope.step !== "emailConfirmation"');
    expect(screen).toContain('currentScope.appState !== "active"');
    expect(screen).toContain("currentEmail !== email");
    expect(screen).toContain("Date.now() >= deadline");
    expect(screen).toContain("timer = setTimeout(() => void poll(), POLL_INTERVAL_MS)");
    expect(screen).not.toContain("setInterval(() => {\n      void lookupStatus();");
  });

  it("recovers a confirmed orphan auth user even when a newer pending token exists", () => {
    const status = source("supabase/functions/get-pre-signup-verify-status/index.ts");
    const authLookup = status.indexOf("const authConfirmed = email ? await authConfirmedForEmail(email)");
    const canonicalPendingReturn = status.indexOf("if (!canonicalRow.verified || expired)");

    expect(authLookup).toBeGreaterThanOrEqual(0);
    expect(authLookup).toBeLessThan(canonicalPendingReturn);
    expect(status).toContain('auth_confirmed: true');
    expect(status).toContain('confirmation_mode: "auth"');
  });

  it("keeps an exact verification token authoritative over auth-only recovery", () => {
    const status = source("supabase/functions/get-pre-signup-verify-status/index.ts");

    expect(status).toContain("if (token) {");
    expect(status).toContain("An invalid or unknown token must never fall back");
    expect(status).toContain("if (!token && (!canonicalRow.verified || expired || Boolean(canonicalRow.signup_proof_used_at)))");
  });

  it("keeps auth user persistence and proof finalization ordered after session recovery", () => {
    const signup = source("supabase/functions/auth-signup/index.ts");
    const handler = signup.slice(signup.indexOf("Deno.serve"));
    const sessionIndex = handler.lastIndexOf("const recoveredSession = await ensureSessionForVerifiedSignup");
    const persistenceIndex = handler.lastIndexOf("const authUser = await ensureAuthUserPersisted");
    const proofIndex = handler.lastIndexOf("const proofResult = await markSignupProofUsed");

    expect(signup).toContain("auth.admin.getUserById");
    expect(signup).toContain('"signup_session_unavailable"');
    expect(signup).toContain('"signup_proof_finalize_failed"');
    expect(sessionIndex).toBeGreaterThanOrEqual(0);
    expect(sessionIndex).toBeGreaterThan(persistenceIndex);
    expect(proofIndex).toBeGreaterThan(sessionIndex);
  });

  it("returns stable safe signup codes instead of raw auth provider errors", () => {
    const signup = source("supabase/functions/auth-signup/index.ts");
    const native = source("app/src/lib/nativeSignup.ts");
    const screen = source("app/src/screens/NativeSignupScreen.tsx");

    expect(signup).toContain("public_message: signupSafeMessage(code)");
    expect(signup).toContain("request_id: requestId");
    expect(native).toContain("safeError.code = code || undefined");
    expect(screen).toContain('message === "signup_session_unavailable"');
    expect(screen).toContain('message === "signup_proof_finalize_failed"');
  });

  it("never deletes or recreates an existing account during signup", () => {
    const signup = source("supabase/functions/auth-signup/index.ts");
    const alreadyRegisteredBranch = signup.slice(
      signup.indexOf("if (signUp.error)"),
      signup.indexOf("const authUser = await ensureAuthUserPersisted"),
    );

    expect(alreadyRegisteredBranch).toContain('return fail(409, "account_already_exists")');
    expect(alreadyRegisteredBranch).not.toContain("auth.admin.deleteUser");
    expect(alreadyRegisteredBranch).not.toContain('.from("profiles")');
    expect(alreadyRegisteredBranch).not.toContain("retrySignUp");
  });
});
