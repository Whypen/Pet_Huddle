import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = process.cwd();
const repoRoot = path.basename(appRoot) === "app" ? path.dirname(appRoot) : appRoot;

const read = (relativePath: string) => fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8");

describe("native verify identity direct-flow contract", () => {
  it("does not add a verify-identity precheck or action-level auth probe", () => {
    const screen = read("app/src/screens/NativeVerifyIdentityScreen.tsx");
    const client = read("app/src/lib/nativeVerifyIdentity.ts");

    expect(screen).not.toContain("ensureNativeVerifyIdentityAuthReady");
    expect(screen).not.toContain("runNativeIdentityPrecheck");
    expect(screen).not.toContain("identityPrecheck");
    expect(screen).not.toContain("reconcileVerificationBeforeAction");
    expect(client).not.toContain("action: \"precheck\"");
    expect(client).not.toContain("action: \"auth_probe\"");
    expect(client).not.toContain("precheckId");
  });

  it("shares one profile snapshot during a full refresh while preserving the separate summary warm", () => {
    const screen = read("app/src/screens/NativeVerifyIdentityScreen.tsx");
    const client = read("app/src/lib/nativeVerifyIdentity.ts");

    expect(screen).toContain("fetchNativeVerifyIdentityRefreshState({ sessionKey, userId })");
    expect(screen).toContain("refreshNativeVerifyIdentityProfileCache({ sessionKey, userId })");
    expect(screen).not.toMatch(/fetchNativeVerifyIdentitySnapshot\(\),\s*fetchNativeVerifyIdentityProfileStatus/);
    expect(client).toContain("const sharedProfileSnapshot = fetchVerifyIdentityProfileSnapshot(accessToken)");
    expect(client).toContain("fetchNativeVerifyIdentitySnapshotWithProfile(accessToken, sharedProfileSnapshot)");
    expect(client).toContain("sharedProfileSnapshot.then(async (value) =>");
    expect(client).toContain("const existing = nativeVerifyIdentityRefreshInFlight.get(key)");
    expect(client).toContain("if (existing) return existing");
    expect(client).toContain("nativeVerifyIdentityRefreshInFlight.delete(key)");
  });

  it("starts and completes human verification without device or precheck gates", () => {
    const handler = read("supabase/functions/verify-human-challenge/index.ts");

    expect(handler).not.toContain("identity_safety_prechecks");
    expect(handler).not.toContain("deviceFingerprintHash");
    expect(handler).not.toContain("precheckId");
    expect(handler).toContain("HUMAN_START_RATE_LIMIT");
    expect(handler).toContain('json({ error: "rate_limited" }, 429)');
  });

  it("uses a throttled synchronous face processor and never transfers native frames to JS", () => {
    const screen = read("app/src/screens/NativeVerifyIdentityScreen.tsx");

    expect(screen).toContain("runAtTargetFps(5");
    expect(screen).toContain("runFacesDetectedOnJs(detectFaces(frame), { height: frame.height, width: frame.width });");
    expect(screen).toContain("const frameProcessor = useFrameProcessor");
    expect(screen).not.toContain("runAsync(");
    expect(screen).not.toContain("incrementRefCount");
    expect(screen).not.toContain("decrementRefCount");
  });

  it("keeps document confirmation independent from the removed precheck endpoint", () => {
    const handler = read("supabase/functions/native-verify-identity-document/index.ts");

    expect(handler).not.toContain('action?: "auth_probe"');
    expect(handler).not.toContain('action === "precheck"');
    expect(handler).not.toContain("identity_precheck");
    expect(handler).toContain('payload.action === "confirm_document"');
    expect(handler).toContain("human_verification_required");
  });

  it("preserves both passport name extraction candidates for the server confirmation", () => {
    const screen = read("app/src/screens/NativeVerifyIdentityScreen.tsx");

    expect(screen).toContain("const extractedNameEvidence = getUniqueIdentityNameEvidence(mrz.legalName, values.legalName)");
    expect(screen).toContain("evaluateIdentityLegalNameMatch(enteredLegalName, extractedNameEvidence");
    expect(screen).toContain("extractedNameEvidence,");
    expect(screen).toContain("extractedNameEvidence: documentState.extractedNameEvidence.length > 0");
    expect(screen).not.toContain("extractedNameEvidence: [documentState.original.legalName]");
  });

  it("keeps the verified badge and all three identity checks on one server-authoritative contract", () => {
    const screen = read("app/src/screens/NativeVerifyIdentityScreen.tsx");
    const cache = read("app/src/lib/nativeProfileSummary.ts");
    const settingsDrawer = read("app/src/components/NativeSettingsDrawer.tsx");
    const migration = read("supabase/migrations/20260816143000_identity_verified_state_contract.sql");

    expect(migration).toContain("v_authorized_override");
    expect(migration).toContain("vu.status = 'approved'");
    expect(migration).toContain("v_human_passed and v_document_confirmed and v_phone_complete and v_phone_unique");
    expect(screen).toContain('const serverVerified = snapshot?.verificationStatus === "verified";');
    expect(screen).toContain("const effectiveHumanPassed = identityFullyVerified || humanPassed;");
    expect(screen).toContain("const effectiveDocumentConfirmed = identityFullyVerified || documentConfirmed;");
    expect(screen).toContain("const effectivePhoneVerified = identityFullyVerified || phoneVerified;");
    expect(screen).toContain('if (status === "verified") return { label: "Verified", tone: "success" };');
    expect(screen).toContain("setHumanCompletedSteps({ center: true, left: true, right: true });");
    expect(screen).toContain("readCachedNativeVerifyIdentityProfileStatus({ sessionKey, userId })");
    expect(screen).toContain('identityStatusReady ? describeOverallChip(effectiveOverallStatus) : { label: "Loading", tone: "muted" as const }');
    expect(screen).not.toContain('profileStatus?.verificationStatus === "verified" ||');
    expect(cache).toContain("const CACHE_VERSION = 6;");
    expect(cache).not.toContain('verification_status: "verified",');
    expect(settingsDrawer).toContain("subscribeNativeVerifyIdentityUpdated");
    expect(settingsDrawer).toContain("const verificationPatch = { is_verified: event.verified, verification_status: verificationStatus };");
  });

  it("does not let a late cache callback repaint fresh Settings or Social state", () => {
    const settingsDrawer = read("app/src/components/NativeSettingsDrawer.tsx");
    const social = read("app/src/screens/NativeSocialScreen.tsx");

    expect(settingsDrawer).toContain("let freshProfileApplied = false;");
    expect(settingsDrawer).toContain('if (source === "cache" && freshProfileApplied) return;');
    expect(settingsDrawer).toContain("const isVerified = profileHydratedForOpen && isNativeVerifiedProfile(profile);");
    expect(social).toContain("let freshViewerScopeApplied = false;");
    expect(social).toContain("if (!active || !scope || freshViewerScopeApplied || socialSessionKeyRef.current !== requestSessionKey) return;");
    expect(social).toContain("const freshViewerScopePromise = resolveNativeViewerScope({ userId, accessToken, sessionKey: requestSessionKey });");
    expect(social).toContain("void freshViewerScopePromise.then((scope) => {");
  });
});
