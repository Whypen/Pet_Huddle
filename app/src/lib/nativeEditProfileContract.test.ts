import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const readAppSourceFile = (path: string) => readFileSync(resolve(currentDir, "../", path), "utf8");

describe("native edit profile contract", () => {
  it("keeps legal name read-only and only renders it when a verified value exists", () => {
    const form = readAppSourceFile("components/profile/NativeProfileForm.tsx");
    const account = readAppSourceFile("screens/NativeProfileSummaryScreen.tsx");
    const legalNameRow = account.slice(account.indexOf('label="Legal name"'), account.indexOf('label="Email"'));

    expect(legalNameRow).toContain("disabled");
    expect(account).toContain('typeof profile?.legal_name === "string" && profile.legal_name.trim()');
    expect(form).toContain('<ReadOnlyField label="Legal Name" value={verifiedLegalName} />');
    expect(form).not.toContain('value={form.legal_name.trim() ? form.legal_name : form.display_name');
  });

  it("keeps Account identity order and locked row affordances exact", () => {
    const source = readAppSourceFile("screens/NativeProfileSummaryScreen.tsx");
    const identity = source.slice(source.indexOf('<Text style={styles.sectionLabel}>IDENTITY</Text>'), source.indexOf('<Text style={styles.sectionLabel}>MEMBERSHIP</Text>'));

    expect(identity.indexOf('label="Email"')).toBeLessThan(identity.indexOf('label="Date of birth"'));
    expect(identity.indexOf('label="Date of birth"')).toBeLessThan(identity.indexOf('label="Social ID"'));
    expect(identity.indexOf('label="Social ID"')).toBeLessThan(identity.indexOf('label="Phone"'));
    expect(identity.slice(identity.indexOf('label="Legal name"'), identity.indexOf('label="Email"'))).toContain("disabled");
    expect(identity.slice(identity.indexOf('label="Date of birth"'), identity.indexOf('label="Social ID"'))).toContain("disabled");
    expect(source).toContain("disabled && styles.actionLabelLocked");
    expect(source).toContain("disabled && styles.actionValueLocked");
    expect(source).toContain("const interactive = Boolean(onPress) && !disabled;");
    expect(source).toContain('{interactive ? <Feather');
  });

  it("renders a complete identity editor with conditional document facts and editable display name", () => {
    const source = readAppSourceFile("components/profile/NativeProfileForm.tsx");
    const screen = readAppSourceFile("screens/NativeEditProfileScreen.tsx");
    const identityClient = readAppSourceFile("lib/nativeVerifyIdentity.ts");
    const identity = source.slice(source.indexOf('title="Identity & account"'), source.indexOf('title="Your gender"'));

    expect(identity.indexOf("<EmailVerifiedField")).toBeLessThan(identity.indexOf('label="Date of Birth"'));
    expect(identity.indexOf('label="Legal Name"')).toBeLessThan(identity.indexOf('label="Date of Birth"'));
    expect(identity.indexOf('label="Nationality"')).toBeLessThan(identity.indexOf('label="Date of Birth"'));
    expect(identity.indexOf('label="Gender"')).toBeLessThan(identity.indexOf('label="Date of Birth"'));
    expect(identity.indexOf('label="Date of Birth"')).toBeLessThan(identity.indexOf('label="Social ID"'));
    expect(identity.indexOf('label="Social ID"')).toBeLessThan(identity.indexOf("<EditablePhoneField"));
    expect(identity.indexOf('label="Display/User Name"')).toBeLessThan(identity.indexOf('label="Social ID"'));
    expect(source).toContain('verifiedDocumentIdentity ? formatNativeIdentityDocumentCountry(identityDocumentCountry) : ""');
    expect(source).toContain('verifiedDocumentIdentity ? formatNativeIdentityDocumentGender(identityDocumentGender) : ""');
    expect(identity).toContain('displayNameCooldown?.locked');
    expect(screen).toContain('force: true');
    expect(screen).toContain('identityDocumentStatus={identityProfileStatus?.identityDocumentStatus}');
    expect(identityClient).toContain('formatNativeIdentityDocumentCountry');
  });

  it("blocks identity edit entry when cooldown is active", () => {
    const source = readAppSourceFile("components/profile/NativeProfileForm.tsx");
    const screen = readAppSourceFile("screens/NativeEditProfileScreen.tsx");

    expect(source).toContain("displayNameCooldown?.locked");
    expect(source).toContain("socialIdCooldown?.locked");
    expect(source).toContain("onError?.(displayNameCooldown.lockedMessage)");
    expect(source).toContain("onError?.(socialIdCooldown.lockedMessage)");
    expect(screen).toContain("onError={setSaveToastMessage}");
  });

  it("synchronizes a successful Account phone OTP into the shared identity and profile caches", () => {
    const source = readAppSourceFile("screens/NativeEditProfileScreen.tsx");
    const verifyOtp = source.slice(source.indexOf("const handleVerifyPhoneOtp = async"), source.indexOf("useEffect(() => {", source.indexOf("const handleVerifyPhoneOtp = async")));
    const otpFunction = readFileSync(resolve(currentDir, "../../../supabase/functions/verify-phone-otp/index.ts"), "utf8");

    expect(otpFunction).toContain('phone_verification_status: "verified"');
    expect(otpFunction).toContain("refresh_phone_verification_status");
    expect(verifyOtp).toContain("fetchNativeVerifyIdentityProfileStatus({");
    expect(verifyOtp).toContain("force: true");
    expect(verifyOtp).toContain("phone_verification_status: verificationStatus.phoneVerificationStatus");
    expect(verifyOtp).toContain("await patchNativeProfileSummaryCache(nativeSession.userId");
  });

  it("keeps verified identity fields canonical across Account and Verify Identity", () => {
    const form = readAppSourceFile("components/profile/NativeProfileForm.tsx");
    const verifyScreen = readAppSourceFile("screens/NativeVerifyIdentityScreen.tsx");
    const identityMigration = readFileSync(resolve(currentDir, "../../../supabase/migrations/20260601123000_identity_document_optional_metadata_and_snapshot.sql"), "utf8");
    const otpFunction = readFileSync(resolve(currentDir, "../../../supabase/functions/verify-phone-otp/index.ts"), "utf8");

    expect(form).toContain("Some features are available to people aged 16+.");
    expect(form).toContain("styles.dobHelperText");
    expect(identityMigration).toContain("set legal_name = trim(p_confirmed_legal_name),\n      dob = p_confirmed_dob");
    expect(verifyScreen).toContain("legal_name: nextProfile.legalName");
    expect(verifyScreen).toContain("dob: nextProfile.identityDocumentDob");
    expect(verifyScreen).toContain("phone: nextProfile.phone");
    expect(otpFunction).toContain("phone: rawPhone");
    expect(otpFunction).toContain('phone_verification_status: "verified"');
  });

  it("opens the first visible invalid profile section and never validation-navigates to identity", () => {
    const source = readAppSourceFile("components/profile/NativeProfileForm.tsx");
    const errorFocusEffect = source.slice(
      source.indexOf("if (errorFocusRequest <= 0) return;"),
      source.indexOf("}, [errorFocusRequest]);") + "}, [errorFocusRequest]);".length,
    );

    expect(errorFocusEffect).toContain('errors.pet_experience || errors.experience_years || errors.availability_status ? "experience"');
    expect(errorFocusEffect).not.toContain('? "identity"');
    expect(errorFocusEffect).toContain("identityDeepLinkedRef.current = false");
    expect(errorFocusEffect).toContain("setActiveEditor(editor)");
  });

  it("does not let edit-profile validation block on explicit-entry identity fields", () => {
    const source = readAppSourceFile("screens/NativeEditProfileScreen.tsx");

    expect(source).toContain("validateForm(form, activePetCount, identitySaveRequested)");
    expect(source).toContain("if (includeIdentity) {");
    expect(source).toContain('String(focusField || "").trim() === "identity"');
    expect(source).toContain("delete safePayload.phone");
    expect(source).toContain("delete safePayload.social_id");
  });

  it("keeps profile and signup experience years as bounded whole-number input", () => {
    const profile = readAppSourceFile("components/profile/NativeProfileForm.tsx");
    const signup = readAppSourceFile("screens/NativeSignupScreen.tsx");

    expect(profile).toContain('keyboardType="numeric" label="Years" maxLength={2}');
    expect(profile).toContain('value.replace(/[^\\d]/g, "").slice(0, 2)');
    expect(profile).not.toContain('value.replace(/[^\\d.]/g, "")');
    expect(signup).toContain('keyboardType="number-pad"');
    expect(signup).toContain('maxLength={2}');
    expect(signup).toContain('value.replace(/[^\\d]/g, "").slice(0, 2)');
    expect(signup).toContain("quickProfileYearsValue <= 99");
  });

  it("keeps photo persistence inside the authenticated column grant", () => {
    const source = readAppSourceFile("screens/NativeEditProfileScreen.tsx");
    const photoPersistPayload = source.slice(
      source.indexOf("const data = await updateNativeEditProfileWithToken"),
      source.indexOf("if (!isCurrentNativeSessionKey", source.indexOf("const data = await updateNativeEditProfileWithToken")),
    );

    expect(photoPersistPayload).toContain("photos: nextPhotos");
    expect(photoPersistPayload).toContain("avatar_url:");
    expect(photoPersistPayload).toContain("social_album: nextSocialAlbum");
    expect(photoPersistPayload).not.toContain("updated_at:");
  });

  it("shows profile save outcomes through the shared toast rail", () => {
    const source = readAppSourceFile("screens/NativeEditProfileScreen.tsx");

    expect(source).toContain('import { NativeToast } from "../components/NativeToast"');
    expect(source).toContain('<NativeToast message={saveToastMessage} onDismiss={() => setSaveToastMessage(null)} />');
    expect(source).toContain('setSaveToastMessage(mode === "onboarding" ? "Profile completed successfully." : "Profile updated")');
    expect(source).not.toContain("setSaveToastMessage(firstValidationMessage(nextErrors))");
    expect(source).not.toContain('<NativeToast message={message}');
  });

  it("keeps Reanimated shared-value writes outside React state updaters", () => {
    const source = readAppSourceFile("components/profile/NativeProfilePhotoCropper.tsx");
    const boundsEffect = source.slice(
      source.indexOf("panBoundsRef.current = { x: maxPanX, y: maxPanY }"),
      source.indexOf("}, [maxPanX, maxPanY, panX, panY]);") + "}, [maxPanX, maxPanY, panX, panY]);".length,
    );
    const stateUpdater = boundsEffect.slice(boundsEffect.indexOf("setPan((current) =>"));

    expect(boundsEffect).toContain("panX.value = next.x");
    expect(boundsEffect).toContain("panY.value = next.y");
    expect(stateUpdater).not.toContain("panX.value");
    expect(stateUpdater).not.toContain("panY.value");
  });

  it("loads and enforces backend identity cooldown columns before save", () => {
    const source = readAppSourceFile("screens/NativeEditProfileScreen.tsx");

    expect(source).toContain('"display_name_changed_at"');
    expect(source).toContain('"social_id_changed_at"');
    expect(source).toContain("DISPLAY_NAME_COOLDOWN_DAYS = 7");
    expect(source).toContain("SOCIAL_ID_COOLDOWN_DAYS = 30");
    expect(source).toContain("displayNameChanged && displayNameCooldown.locked");
    expect(source).toContain("socialIdChanged && socialIdCooldown.locked");
  });

  it("keeps identity cooldown backend enforcement in the latest migration", () => {
    const migration = readFileSync(resolve(currentDir, "../../../supabase/migrations/20260608150000_profile_identity_cooldown_contract.sql"), "utf8");

    expect(migration).toContain("display_name_changed_at");
    expect(migration).toContain("social_id_changed_at");
    expect(migration).toContain("interval '7 days'");
    expect(migration).toContain("interval '30 days'");
    expect(migration).toContain("social_id_reservations");
    expect(migration).toContain("public.is_social_id_taken(v_social_id)");
  });
});
