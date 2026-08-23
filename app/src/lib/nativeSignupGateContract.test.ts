import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nativePasswordPolicyError, nativePasswordSecurityError } from "./nativePasswordSecurity";

const currentDir = dirname(fileURLToPath(import.meta.url));
const signupScreenSource = () => readFileSync(resolve(currentDir, "../screens/NativeSignupScreen.tsx"), "utf8");
const signupLocationSource = () => readFileSync(resolve(currentDir, "../components/NativeSignupLocationStep.tsx"), "utf8");
const phoneFieldSource = () => readFileSync(resolve(currentDir, "../components/NativePhoneField.tsx"), "utf8");
const rootNavigatorSource = () => readFileSync(resolve(currentDir, "../navigation/RootNavigator.tsx"), "utf8");
const navigationStateSource = () => readFileSync(resolve(currentDir, "./nativeNavigationState.ts"), "utf8");
const repoFileSource = (path: string) => readFileSync(resolve(currentDir, "../../..", path), "utf8");

const between = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
};

describe("native signup gate ownership contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps password policy and breach feedback on the credentials step", async () => {
    expect(nativePasswordPolicyError("lowercase1!")).toBe("Password must include an uppercase letter.");
    expect(nativePasswordPolicyError("Goodpass1!")).toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      text: async () => "FC1A0F5B6330E3F4C8C1BBECDE9BEDB9573:1000\r\n",
    })));

    await expect(nativePasswordSecurityError("Password1!")).resolves.toBe("This password has appeared in a data breach. Choose a different one.");
  });

  it("waits until a non-empty password field loses focus before showing inline password feedback", () => {
    const source = signupScreenSource();

    expect(source).toContain("const [passwordTouched, setPasswordTouched] = useState(false);");
    expect(source).toContain("const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);");
    expect(source).toContain("passwordTouched && draft.password ? passwordLiveError : undefined");
    expect(source).toContain("confirmPasswordTouched && confirmPassword ? confirmPasswordError : undefined");
    expect(source).toContain("onBlur={() => setPasswordTouched(true)}");
    expect(source).toContain("onBlur={() => setConfirmPasswordTouched(true)}");
    expect(source).not.toContain("const credentialsHint =");
  });

  it("does not recheck Social ID inside the quick profile submit step", () => {
    const source = signupScreenSource();
    const quickProfileBody = between(source, "const continueQuickProfile = async", "const waitForSignupSession");

    expect(quickProfileBody).not.toContain("checkSocialIdTaken");
    expect(quickProfileBody).not.toContain("socialAvailability");
  });

  it("keeps quick profile validation scoped to quick profile fields", () => {
	    const source = signupScreenSource();
	    const quickProfileBody = between(source, "const continueQuickProfile = async", "const waitForSignupSession");

    expect(quickProfileBody).toContain("nextErrors.avatar");
    // Gender is optional (Apple Guideline 5.1.1(v)): it must NOT be a required
    // quick-profile field that can block completion.
    expect(quickProfileBody).not.toContain("nextErrors.genderGenre");
    // Location is validated on the dedicated Location step, not in quick profile.
    expect(quickProfileBody).not.toContain("nextErrors.locationCountry");
    expect(quickProfileBody).not.toContain("nextErrors.locationDistrict");
    expect(quickProfileBody).toContain('setStep("location")');
    expect(quickProfileBody).toContain("nextErrors.petExperience");
    expect(quickProfileBody).toContain("nextErrors.petExperienceYears");
    expect(quickProfileBody).toContain("nextErrors.petExperienceKinds");
    expect(quickProfileBody).not.toContain("nextErrors.password");
	    expect(quickProfileBody).not.toContain("nextErrors.socialId");
	  });

	  it("keeps the Step 5 RPC scoped to quick profile fields after Step 4 identity exists", () => {
	    const migration = repoFileSource("supabase/migrations/20260604123000_native_signup_no_legal_name_seed.sql");
	    const step5Function = between(migration, "create or replace function public.complete_native_signup_profile", "comment on function public.complete_native_signup_profile");

	    expect(step5Function).toContain("profile_identity_required");
	    expect(step5Function).toContain("onboarding_completed = true");
	    expect(step5Function).not.toContain("display_name =");
	    expect(step5Function).not.toContain("social_id =");
	    expect(step5Function).not.toContain("phone =");
	    expect(step5Function).not.toContain("dob =");
	  });

  it("keeps quick profile completion out of email signup and password recovery", () => {
    const source = signupScreenSource();
    const quickProfileBody = between(source, "const continueQuickProfile = async", "const waitForSignupSession");

    expect(quickProfileBody).toContain("uploadQuickProfileAvatar(existingAuth.session)");
    expect(quickProfileBody).toContain("completeSignup(nextPath, existingAuth.session)");
    expect(quickProfileBody).toContain('signupProof: ""');
    expect(quickProfileBody).not.toContain("authSignupNative");
    expect(quickProfileBody).not.toContain("getPreSignupVerifyStatus");
    expect(quickProfileBody).not.toContain("signInWithPassword");
  });

  it("does not re-upload an already saved Step 5 profile photo after Verify Identity return", () => {
    const source = signupScreenSource();
    const uploadBody = between(source, "const uploadQuickProfileAvatar = async", "const continueQuickProfile");

    expect(source).toContain("const isSavedQuickProfileAvatar");
    expect(uploadBody).toContain("isSavedQuickProfileAvatar(avatarUri)");
    expect(uploadBody.indexOf("isSavedQuickProfileAvatar(avatarUri)")).toBeLessThan(uploadBody.indexOf("uploadNativeProfilePhotoAsset"));
    expect(uploadBody).toContain("await saveQuickProfileForSession(session, avatarUri)");
  });

  it("uses immutable Step 5 photo paths so an older upload cannot overwrite a newer selection", () => {
    const source = signupScreenSource();
    const profilePhotos = repoFileSource("app/src/lib/nativeProfilePhotos.ts");
    const uploadFunction = repoFileSource("supabase/functions/native-profile-photo-upload/index.ts");
    const uploadBody = between(profilePhotos, "export const uploadNativeProfilePhotoAsset = async", "export const deleteNativeProfilePhotoPath");

    expect(uploadBody).toContain('/functions/v1/native-profile-photo-upload');
    expect(uploadBody).toContain("createFreshNativeFunctionHeaders(activeAccessToken");
    expect(uploadBody).toContain("refreshNativeSessionOnce()");
    expect(uploadFunction).toContain("admin.auth.getUser(accessToken)");
    expect(uploadFunction).toContain("const uploadId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`");
    expect(uploadFunction).toContain("const objectPath = `${userId}/${slot}-${uploadId}.${extension}`");
    expect(uploadFunction).toContain("upsert: true");
    expect(uploadFunction).toContain('.from("media_assets")');
    expect(uploadFunction).toContain("owner_id: userId");
    expect(source).toContain('logNativeProtectedActionFailure("[native-signup] photo_upload_failed", error)');
    expect(source).toContain("Please retry with this photo or choose another one.");
  });

  it("reuses the Step 4 email session instead of creating auth twice", () => {
    const source = signupScreenSource();
    const createSessionBody = between(source, "const createEmailSignupSessionFromStep4 = async", "const validateAndAdvanceToQuickProfile");

    expect(createSessionBody.indexOf("getFreshNativeSession")).toBeGreaterThanOrEqual(0);
    expect(createSessionBody.indexOf("getFreshNativeSession")).toBeLessThan(createSessionBody.indexOf("authSignupNative"));
    expect(createSessionBody).toContain('existingProvider !== "email"');
    expect(createSessionBody).toContain("signup_session_mismatch");
  });

  it("recovers a confirmed orphan signup before requiring a fresh email proof", () => {
    const source = signupScreenSource();
    const createSessionBody = between(source, "const createEmailSignupSessionFromStep4 = async", "const validateAndAdvanceToQuickProfile");
    expect(createSessionBody).toContain("const signupProof = draft.signupProof.trim()");
    expect(createSessionBody).toContain("signInWithHardenedNativeLogin(normalizedEmail, password)");
    expect(createSessionBody).toContain('throw new Error("email_verification_required")');
    expect(createSessionBody).not.toContain("getPreSignupVerifyStatus");
    expect(createSessionBody.indexOf("signupProof = draft.signupProof.trim()")).toBeLessThan(createSessionBody.indexOf("authSignupNative"));
  });

  it("keeps OAuth Step 2 free of email verification, signup auth, password, and Turnstile flows", () => {
    const source = signupScreenSource();
    const credentialsBody = between(source, "const continueCredentials = async", "const resendEmail = async");
    const oauthBranch = between(credentialsBody, "if (isOAuthOnboarding) {", "setBusy(true);");

    expect(oauthBranch).toContain('setStep("name")');
    expect(oauthBranch).not.toContain("sendPreSignupVerify");
    expect(oauthBranch).not.toContain("getPreSignupVerifyStatus");
    expect(oauthBranch).not.toContain("authSignupNative");
    expect(oauthBranch).not.toContain("signInWithPassword");
    expect(oauthBranch).not.toContain("turnstileToken");
    expect(oauthBranch).not.toContain("password");
  });

  it("keeps quick-profile transitions limited to Step 4 success or registered incomplete resume", () => {
    const source = signupScreenSource();
    const transitions = [...source.matchAll(/setStep\("quickProfile"\)/g)];
    const hydrateBody = between(source, "const hydrateIncompleteProfile = async () => {", "void hydrateIncompleteProfile();");
    const validateNameBody = between(source, "const validateName = () => {", "const createEmailSignupSessionFromStep4 = async");
    const step4Body = between(source, "const validateAndAdvanceToQuickProfile = async", "const saveQuickProfileForSession");

    expect(transitions).toHaveLength(2);
    expect(hydrateBody).toContain("!data?.display_name || !data?.social_id");
    expect(hydrateBody).toContain('setStep("quickProfile")');
    expect(step4Body).toContain("completeNativeSignupIdentity");
    expect(step4Body).toContain("setNotificationTransition");
    expect(source).toContain("finishSignupNotificationTransition");
    expect(validateNameBody).toContain('socialAvailability === "checking"');
    expect(validateNameBody).toContain('socialAvailability === "taken"');
    expect(validateNameBody).toContain('socialAvailability !== "available"');
    expect(source).not.toContain('useEffect(() => {\n    if (!loaded || !authSession?.user || profileOnboardingCompleted || step === "quickProfile") return;');
  });

  it("registers profile identity at Step 4 before quick profile onboarding", () => {
    const source = signupScreenSource();
    const step4Body = between(source, "const validateAndAdvanceToQuickProfile = async", "const saveQuickProfileForSession");
    const quickProfileBody = between(source, "const continueQuickProfile = async", "const waitForSignupSession");

    expect(step4Body).toContain("completeNativeSignupIdentity");
    expect(step4Body).toContain("identity.registered !== true");
    expect(step4Body.indexOf("completeNativeSignupIdentity")).toBeLessThan(step4Body.indexOf("notificationTransitionSessionRef.current = session"));
    expect(quickProfileBody).not.toContain("completeNativeSignupIdentity");
  });

  it("persists the Step 2 marketing checkbox at Step 4 instead of leaving dead UI state", () => {
    const source = signupScreenSource();
    const nativeSignup = repoFileSource("app/src/lib/nativeSignup.ts");
    const migration = repoFileSource("supabase/migrations/20260604124500_native_signup_marketing_opt_in_contract.sql");
    const step4Body = between(source, "const validateAndAdvanceToQuickProfile = async", "const saveQuickProfileForSession");

    expect(step4Body).toContain("marketing_opt_in_checked: updatesChecked");
    expect(nativeSignup).toContain("marketing_opt_in_checked: boolean");
    expect(migration).toContain("v_marketing_opt_in_checked");
    expect(migration).toContain("marketing_opt_in_checked_at");
  });

  it("does not send Step 4 identity fields in the Step 5 quick-profile payload", () => {
    const source = signupScreenSource();
    const saveQuickProfileBody = between(source, "const saveQuickProfileForSession = async", "const uploadQuickProfileAvatar");
    const nativeSignup = repoFileSource("app/src/lib/nativeSignup.ts");
    const profilePayloadType = between(nativeSignup, "export type CompleteNativeSignupProfilePayload = {", "export type CompleteNativeSignupIdentityPayload = {");

    expect(saveQuickProfileBody).not.toContain("display_name:");
    expect(saveQuickProfileBody).not.toContain("social_id:");
    expect(saveQuickProfileBody).not.toContain("phone:");
    expect(saveQuickProfileBody).not.toContain("dob:");
    expect(profilePayloadType).not.toContain("display_name:");
    expect(profilePayloadType).not.toContain("social_id:");
    expect(profilePayloadType).not.toContain("phone:");
    expect(profilePayloadType).not.toContain("dob:");
  });

  it("uses fresh-token RPC transport for protected Step 4 and Step 5 signup RPCs", () => {
    const source = signupScreenSource();
    const nativeSignup = repoFileSource("app/src/lib/nativeSignup.ts");
    const profileRpcBody = between(nativeSignup, "export async function completeNativeSignupProfile", "export async function completeNativeSignupIdentity");
    const identityRpcBody = between(nativeSignup, "export async function completeNativeSignupIdentity", "export async function getPreSignupVerifyStatus");

    expect(nativeSignup).toContain('import { nativeExactTokenRpc } from "./nativeExactTokenRequest";');
    expect(profileRpcBody).toContain('nativeExactTokenRpc<{ id: string }>("complete_native_signup_profile"');
    expect(identityRpcBody).toContain('nativeExactTokenRpc<{ id: string; registered?: boolean }>("complete_native_signup_identity"');
    expect(identityRpcBody).toContain("}, accessToken);");
    expect(source).toContain("}, session.access_token);");
    expect(profileRpcBody).not.toContain("supabase.rpc");
    expect(identityRpcBody).not.toContain("supabase.rpc");
  });

  it("keeps Step 5 completion free of legacy web/set-profile handoff state", () => {
    const source = signupScreenSource();
    const completeSignupBody = between(source, "const completeSignup = async", "const resetAndCancel");
    const rootSource = rootNavigatorSource();

    expect(source).not.toContain("SETPROFILE_PREFILL_KEY");
    expect(source).not.toContain("SIGNUP_FLOW_STATE_KEY");
    expect(source).not.toContain("buildScopedStorageKey");
    expect(completeSignupBody).not.toContain("webLocalStorage");
    expect(completeSignupBody).not.toContain("legal_name");
    expect(completeSignupBody).not.toContain('nextPath === "/set-profile"');
    expect(completeSignupBody).toContain("onSignedIn(session, nextPath, isVerifyIdentityPath");
    expect(rootSource).toContain("setSignupVerifyReturnActive(signupVerifyReturnActive === true)");
    expect(rootSource).not.toContain("VERIFY_IDENTITY_NAV_KEY");
  });

  it("keeps the post-Step-4 return rules and top bar free of step counters", () => {
    const source = signupScreenSource();
    const locationRenderBody = between(source, 'if (step === "location") {', 'if (step === "quickProfile" && busy && quickProfileSaving)');
    const topBarBody = between(source, '<View style={styles.signupTopBar}>', '<Animated.ScrollView');

    expect(source).toContain('accessibilityLabel="Sign out"');
    expect(source).toContain("const returnToSignupNotificationTransition = async");
    expect(source).toContain("setNotificationTransition");
    expect(locationRenderBody).toContain("returnToSignupNotificationTransition");
    expect(locationRenderBody).not.toContain("signOutFromQuickProfile");
    expect(topBarBody).toContain("handleVisibleBack");
    expect(source).toContain('if (step === "quickProfile") setStep("location")');
    expect(source).not.toContain("StepPill");
    expect(source).not.toContain("Step {");
  });

  it("marks completed Step 5 handoff as a registered identity", () => {
    const source = signupScreenSource();
    const completeSignupBody = between(source, "const completeSignup = async", "const resetAndCancel");

    expect(completeSignupBody).toContain("registeredIdentity: true");
  });

  it("keeps Verify Identity back navigation returning to Step 5 after signup", () => {
    const source = rootNavigatorSource();
    const verifyIdentityBody = between(source, "const handleVerifyIdentityBack =", "const handleEditPetBack =");

    expect(source).toContain("signupVerifyReturnActive");
    expect(verifyIdentityBody).toContain("verifyIdentityFromSignup");
    expect(verifyIdentityBody).toContain('setRoutePath("/signup?resume=quickProfile")');
    expect(verifyIdentityBody).toContain('setRoute("/signup")');
    expect(source).toContain("onBack={handleVerifyIdentityBack}");
    expect(source).toContain("resumeQuickProfile={signupVerifyReturnActive || routePath.includes(\"resume=quickProfile\")}");
  });

  it("routes both OAuth and email incomplete signup through the location transition before Step 5", () => {
    const rootSource = rootNavigatorSource();
    const navigationSource = navigationStateSource();
    const signupSource = signupScreenSource();
    const migration = repoFileSource("supabase/migrations/20260608123000_native_signup_location_transition_contract.sql");

    expect(navigationSource).toContain('state === "location_transition"');
    expect(navigationSource).toContain('return "/signup?resume=locationTransition"');
    expect(navigationSource).toContain('state === "notification_transition"');
    expect(navigationSource).toContain('return "/signup?resume=notificationTransition"');
    expect(rootSource).toContain('resumeLocationTransition={routePath.includes("resume=locationTransition")}');
    expect(signupSource).toContain("resumeLocationTransition = false");
    expect(signupSource).toContain('resumeLocationTransition ? "location"');
    expect(signupSource).toContain("markNativeSignupLocation");
    expect(migration).toContain("return 'location_transition';");
    expect(migration).toContain("create or replace function public.mark_native_signup_location");
    expect(migration).toContain("and nullif(btrim(coalesce(p.social_id, '')), '') is not null");
    expect(migration).toContain("coalesce((select a.provider from auth_state a), 'email')");
    expect(migration).not.toContain("public.native_signup_resume_state_for_profile(v_profile, true, true, 'email')");
  });

  it("globally forces every signed-in incomplete profile to its exact signup resume step", () => {
    const rootSource = rootNavigatorSource();
    const globalResumeBody = between(
      rootSource,
      "if (!session || !onboarding || signupVerifyReturnActive) return;",
      "if (signupVerifyReturnActive) return;",
    );
    const resumeLoadingBody = between(
      rootSource,
      "onboarding?.registeredIdentity === true &&",
      "if (resolvedRoute.route === \"auth\" || !session || !userId)",
    );

    expect(globalResumeBody).toContain("onboarding.registeredIdentity !== true");
    expect(globalResumeBody).toContain("onboarding.onboardingCompleted !== false");
    expect(globalResumeBody).toContain("nativeSignupResumePath(onboarding.signupResumeState)");
    expect(globalResumeBody).toContain("setOauthSignupActive(false)");
    expect(globalResumeBody).toContain("setRoutePath(nextSignupPath)");
    expect(globalResumeBody).toContain('setRoute("/signup")');
    expect(resumeLoadingBody).not.toContain("oauthSignupActive &&");
    expect(resumeLoadingBody).toContain('route !== "/signup"');
    expect(resumeLoadingBody).toContain("routePath !== nativeSignupResumePath(onboarding.signupResumeState)");
  });

  it("does not let Supabase auth-state bounce signup back to Auth during Step 4 registration", () => {
    const source = rootNavigatorSource();
    const authStateBody = between(source, "const unsubscribeAuthState = subscribeNativeAuthState", "return () => {");

    expect(authStateBody).toContain('latestRouteRef.current === "/signup"');
    expect(authStateBody).toContain('String(event) === "SIGNED_IN"');
    expect(authStateBody).toContain("defer_signup_auth_state");
    expect(authStateBody.indexOf("defer_signup_auth_state")).toBeLessThan(authStateBody.indexOf('activateSession(nextSession, "auth_state_change")'));
  });

		  it("holds native OAuth auth in routing until registration state decides signup versus sign-in", () => {
		    const authScreen = readFileSync(resolve(currentDir, "../screens/NativeAuthScreen.tsx"), "utf8");
		    const rootSource = rootNavigatorSource();
		    const oauthBody = between(authScreen, "const handleNativeOAuthSignIn = useCallback", "const handleBiometricLogin");
		    const authRouteBody = between(rootSource, "onAuthenticated={(nextSession: Session", "onCreateAccount={() => {");
	    const oauthLoadingBody = between(rootSource, "if (\n    oauthSignupActive &&\n    session &&\n    userId &&", "if (oauthSignupActive && session && userId && resolvedRoute.route === \"auth\"");
	    const oauthRoutingBody = between(rootSource, "if (!oauthSignupActive || !session || !onboarding) return;", "if (signupVerifyReturnActive) return;");

		    expect(oauthBody).toContain("resolveNativeOAuthAccount(provider, data.session.access_token)");
		    expect(oauthBody).toContain('oauthResolution.state === "registered_conflict"');
		    expect(oauthBody).toContain("onAuthenticated(data.session, { source: provider, oauthResolution })");
		    expect(authRouteBody).toContain("isNativeOAuthProvider(options?.source)");
		    expect(authRouteBody).toContain("setOauthSignupActive(fromOAuth)");
		    expect(authRouteBody).toContain('setRoutePath("/")');
		    expect(authRouteBody).toContain('setRoute("/")');
		    expect(authRouteBody).toContain("options?.oauthResolution");
		    expect(authRouteBody).toContain('options.oauthResolution.state === "new_oauth_signup"');
		    expect(authRouteBody).toContain('options.oauthResolution.state === "registered_incomplete"');
		    expect(authRouteBody).toContain("loadOnboarding(nextSession, { force: fromOAuth }).then((snapshot)");
		    expect(authRouteBody).toContain("!snapshot.registeredIdentity");
		    expect(authRouteBody).toContain("setOauthSignupActive(false)");
    expect(oauthLoadingBody).toContain("!onboarding");
    expect(oauthLoadingBody).toContain("onboarding.registeredIdentity === true");
    expect(oauthLoadingBody).toContain("onboarding.onboardingCompleted === true");
    expect(oauthLoadingBody).toContain('route === "/signup"');
		    expect(oauthRoutingBody).toContain("!onboarding.registeredIdentity");
		    expect(oauthRoutingBody).toContain('setRoutePath("/signup")');
		    expect(oauthRoutingBody).toContain("nativeSignupResumePath(onboarding.signupResumeState)");
		  });

  it("keeps an unregistered signed-in identity recoverable and explains the choice", () => {
    const source = rootNavigatorSource();
    const recoveryBody = between(source, 'if (!session || !onboarding || onboarding.registeredIdentity', "}, [oauthSignupActive, onboarding, session, signupVerifyReturnActive]);");
    const verifyIdentityBody = between(source, 'effectiveRoute === "/verify-identity"', 'effectiveRoute === "/social"');

    expect(recoveryBody).toContain("onboarding.registeredIdentity");
    expect(recoveryBody).toContain("oauthSignupActive");
    expect(recoveryBody).toContain("nativeSignupResumePath(onboarding.signupResumeState)");
    expect(recoveryBody).toContain("signupVerifyReturnActive");
    expect(recoveryBody).toContain('"Finish setting up your account"');
    expect(recoveryBody).toContain('{ text: "Continue setup" }');
    expect(recoveryBody).toContain('{ text: "Sign out"');
    expect(recoveryBody).not.toContain("clearSessionState");
    expect(source).toContain("const verifyIdentityFromOnboarding = onboarding?.registeredIdentity === false");
    expect(verifyIdentityBody).not.toContain("onboarding?.profileExists === false");
  });

	  it("keeps OAuth Step 2 duplicate ownership to phone because Apple email is resolved at Auth", () => {
	    const source = signupScreenSource();
	    const duplicateEffectBody = between(source, "useEffect(() => {\n    setDuplicateDetected(false);", "const continueDob = () => {");
	    const step2Body = between(source, "const continueCredentials = async", "const resendEmail = async");
    const step4Body = between(source, "const validateAndAdvanceToQuickProfile = async", "const saveQuickProfileForSession");

    expect(duplicateEffectBody).toContain('const duplicateEmail = isOAuthOnboarding ? "" : trimmedEmail');
    expect(duplicateEffectBody).toContain("checkIdentifierRegistered(duplicateEmail, trimmedPhone)");
	    expect(step2Body).toContain("const duplicate = await checkIdentifierRegistered(normalizedEmail, draft.phone.trim())");
	    expect(step4Body).not.toContain("checkIdentifierRegistered");
	  });

	  it("blocks Step 2 until the duplicate result matches the current email or phone key", () => {
	    const source = signupScreenSource();
	    const duplicateEffectBody = between(source, "useEffect(() => {\n    setDuplicateDetected(false);", "const continueDob = () => {");
	    const credentialsGateBody = between(source, "const canContinueCredentials = Boolean(", "const canContinueName = Boolean(");
	    const step2Body = between(source, "const continueCredentials = async", "const resendEmail = async");

	    expect(source).toContain("const [duplicateCheckedKey, setDuplicateCheckedKey]");
	    expect(source).toContain("const duplicateCheckKey =");
	    expect(duplicateEffectBody).toContain('setDuplicateCheckedKey("")');
	    expect(duplicateEffectBody).toContain("setCheckingDuplicate(true)");
	    expect(duplicateEffectBody.indexOf("setCheckingDuplicate(true)")).toBeLessThan(duplicateEffectBody.indexOf("setTimeout"));
	    expect(duplicateEffectBody).toContain("setDuplicateCheckedKey(activeCheckKey)");
	    expect(credentialsGateBody).toContain("duplicateCheckedKey === duplicateCheckKey");
	    expect(step2Body).toContain("duplicateCheckedKey !== duplicateCheckKey || checkingDuplicate");
	  });

	  it("blocks Step 4 until the Social ID availability result matches the current Social ID", () => {
	    const source = signupScreenSource();
	    const socialEffectBody = between(source, "useEffect(() => {\n    const social = draft.socialId.trim().toLowerCase();", "const applyVerifyStatus");
	    const nameGateBody = between(source, "const canContinueName = Boolean(", "const quickProfileNeedsYears");
	    const validateNameBody = between(source, "const validateName = () => {", "const createEmailSignupSessionFromStep4 = async");

	    expect(source).toContain("const [socialAvailabilityCheckedKey, setSocialAvailabilityCheckedKey]");
	    expect(source).toContain("const socialCheckKey = draft.socialId.trim().toLowerCase()");
	    expect(socialEffectBody).toContain('setSocialAvailabilityCheckedKey("")');
	    expect(socialEffectBody).toContain('setSocialAvailability("checking")');
	    expect(socialEffectBody.indexOf('setSocialAvailability("checking")')).toBeLessThan(socialEffectBody.indexOf("setTimeout"));
	    expect(socialEffectBody).toContain("setSocialAvailabilityCheckedKey(social)");
	    expect(nameGateBody).toContain("socialAvailabilityCheckedKey === socialCheckKey");
	    expect(validateNameBody).toContain("socialAvailabilityCheckedKey !== draft.socialId.trim().toLowerCase()");
	  });

	  it("blocks non-OAuth Step 2 until the current password safety check completes", () => {
	    const source = signupScreenSource();
	    const passwordEffectBody = between(source, "useEffect(() => {\n    setPasswordSecurityError(\"\");", "const legalModalPage");
	    const credentialsGateBody = between(source, "const canContinueCredentials = Boolean(", "const canContinueName = Boolean(");
	    const validateCredentialsBody = between(source, "const validateCredentials = () => {", "const continueCredentials = async");

	    expect(source).toContain("const [passwordSecurityCheckedKey, setPasswordSecurityCheckedKey]");
	    expect(source).toContain("const passwordSecurityKey = isOAuthOnboarding ? \"\" : draft.password");
	    expect(passwordEffectBody).toContain('setPasswordSecurityCheckedKey("")');
	    expect(passwordEffectBody).toContain('setPasswordSecurityStatus("checking")');
	    expect(passwordEffectBody.indexOf('setPasswordSecurityStatus("checking")')).toBeLessThan(passwordEffectBody.indexOf("setTimeout"));
	    expect(passwordEffectBody).toContain("setPasswordSecurityCheckedKey(password)");
	    expect(credentialsGateBody).toContain("passwordSecurityCheckedKey === passwordSecurityKey");
	    expect(validateCredentialsBody).toContain("passwordSecurityCheckedKey !== passwordSecurityKey");
	  });

  it("uses the hardened auth-login function for duplicate-modal sign in", () => {
    const source = signupScreenSource();
    const duplicateSignInBody = between(source, "const submitDuplicateSignIn = async () => {", "const validateName = () => {");
    const hardenedLoginBody = between(source, "async function signInWithHardenedNativeLogin", "function isValidSocialId");

    expect(hardenedLoginBody).toContain('/functions/v1/auth-login');
    expect(hardenedLoginBody).toContain("getNativeSignInDeviceContext");
    expect(hardenedLoginBody).toContain("installNativeAuthSession");
    expect(duplicateSignInBody).toContain("signInWithHardenedNativeLogin");
    expect(source).not.toContain("supabase.auth.signInWithPassword");
  });

	  it("uses passwordless draft storage while OAuth onboarding is active", () => {
	    const source = signupScreenSource();

	    expect(source).toContain("loadNativeSignupDraft({ includePassword: !isOAuthSession })");
	    expect(source).toContain("saveNativeSignupDraft({ ...draft, turnstileToken }, { includePassword: !isOAuthOnboarding })");
	    expect(source).toContain("clearNativeSignupPassword()");
	  });

	  it("clears abandoned pre-Step-4 signup draft when auth state is cleared", () => {
	    const source = rootNavigatorSource();
	    const clearSessionBody = between(source, "const clearSessionState = useCallback", "const isCurrentSession");

	    expect(clearSessionBody).toContain("setOauthSignupActive(false)");
	    expect(clearSessionBody).toContain("setNotificationsOpen(false)");
	    expect(clearSessionBody).toContain("setSupportOpen(false)");
	    expect(clearSessionBody).toContain("setOnboardingHeroVisible(false)");
	    expect(clearSessionBody).toContain("setCancelSignupOpen(false)");
	    expect(clearSessionBody).toContain("void clearNativeSignupDraft()");
	  });

	  it("does not let signup Step 1-5 write identity verification fields", () => {
	    const source = signupScreenSource();

    expect(source).not.toContain("verification_status");
	    expect(source).not.toContain("is_verified");
	    expect(source).not.toContain("human_verification_status");
	  });

	  it("keeps native signup RPCs from seeding legal name from display name", () => {
	    const migration = repoFileSource("supabase/migrations/20260604123000_native_signup_no_legal_name_seed.sql");

	    expect(migration).not.toMatch(/^\s*legal_name,?\s*$/m);
	    expect(migration).not.toMatch(/legal_name\s*=/);
	    expect(migration).not.toContain("v_display_name,\n    v_display_name");
	    expect(migration).toContain("without writing legal_name or verification fields");
	  });

  it("keeps signup inputs single-line and responsive on narrow screens", () => {
    const source = signupScreenSource();
    const yearsRowStyle = between(source, "quickRadioInlineSentence: {", "quickYearsUnderlineInput: {");

    expect(source).toContain("multiline={false}");
    expect(source).toContain("numberOfLines={1}");
    expect(source).toContain('dobSelectMonth: {\n    flex: 1.35,\n    flexBasis: 0');
    expect(source).toContain('dobSelectDay: {\n    flex: 1,\n    flexBasis: 0');
    expect(source).toContain('dobSelectYear: {\n    flex: 1,\n    flexBasis: 0');
    expect(yearsRowStyle).not.toContain('flexWrap: "wrap"');
    expect(yearsRowStyle).toContain("quickRadioSentenceLead");
  });

  it("defers phone errors until blur or submit and stores E.164-compatible digits", () => {
    const source = signupScreenSource();
    const phoneField = phoneFieldSource();

    expect(source).toContain("const [phoneValidationVisible, setPhoneValidationVisible]");
    expect(source).toContain("onBlur={() => setPhoneValidationVisible(true)}");
    expect(source).toContain("phoneValidationVisible && draft.phone.trim() && !phoneValid");
    expect(phoneField).toContain('value.replace(/\\D/g, "")');
    expect(phoneField).toContain("15 - countryDigits");
  });

  it("keeps focused signup fields visible and renders location errors once", () => {
    const source = signupScreenSource();
    const location = signupLocationSource();

    expect(source).toContain("onFocus={() => scrollCredentialsFieldIntoSafeZone(200)}");
    expect(source).toContain("onFocus={() => scrollCredentialsFieldIntoSafeZone(250)}");
    expect(source).toContain("onFocus={() => scrollCredentialsFieldIntoSafeZone(350)}");
    expect(location).toContain('behavior={Platform.OS === "ios" ? "padding" : "height"}');
    expect(location).toContain("scrollRef.current?.scrollToEnd({ animated: true })");
    expect(location).not.toContain("<Text style={styles.searchErrorText}>{errorMessage}</Text>");
  });

  it("keeps denied signup location access recoverable through native settings", () => {
    const location = signupLocationSource();

    expect(location).toContain("requestNativeForegroundLocationPermissionDetail()");
    expect(location).toContain("areNativeLocationServicesEnabled()");
    expect(location).toContain('nextState === "active"');
    expect(location).toContain('locationSettingsReason === "services" ? openNativeLocationSettings() : openNativeAppSettings()');
    expect(location).toContain('accessibilityLabel="Enable location service"');
    expect(location.indexOf('accessibilityLabel="Enable location service"')).toBeLessThan(location.indexOf('accessibilityLabel="Continue"'));
    expect(location).toContain("Your location stays private. It’s used only to connect you with nearby pet people, communities, events, and safety alerts.");
  });
	});
