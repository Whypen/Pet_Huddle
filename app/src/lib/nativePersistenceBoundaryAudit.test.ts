import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) => readFileSync(decodeURIComponent(new URL(relativePath, import.meta.url).pathname), "utf8");

describe("native persistence boundary audit", () => {
  it("does not repeat signup-owned profile completion from the pet save path", () => {
    const petScreen = source("../screens/NativeSetPetScreen.tsx");

    expect(petScreen).not.toContain("updateProfileOnboardingWithToken");
    expect(petScreen).not.toContain('petRestUrl("profiles")');
    expect(petScreen).not.toContain("onboarding_completed: true");
  });

  it("keeps direct media uploads paired with registration and compensating cleanup", () => {
    const broadcast = source("./nativeBroadcast.ts");
    const social = source("./nativeSocial.ts");
    const petScreen = source("../screens/NativeSetPetScreen.tsx");

    expect(broadcast).toContain('bucket: "alerts"');
    expect(broadcast).toContain("await registerNativeMediaAsset({");
    expect(broadcast).toContain('requestNativeStorageCleanupResult("alerts"');

    for (const bucket of ["notices", "care_attachments", "service_care_evidence"]) {
      expect(social).toContain(`bucket: "${bucket}"`);
    }
    expect(social.match(/await registerNativeMediaAsset\(\{/g)?.length).toBeGreaterThanOrEqual(3);
    expect(social).toContain('requestNativeStorageCleanupResult("notices"');
    expect(social).toContain('requestNativeStorageCleanupResult("care_attachments"');
    expect(social).toContain('requestNativeStorageCleanupResult("service_care_evidence"');

    expect(petScreen).toContain("await registerPetMediaAssetWithToken(");
    expect(petScreen).toContain("await registerFamilyPetMediaAssetWithToken(");
    expect(petScreen).toContain("await requestNativeStorageCleanupResult(");
    expect(petScreen).toContain("await requestFamilyPetStorageCleanup(");
  });

  it("keeps care signature upload failure compensating cleanup at both save call sites", () => {
    const serviceChat = source("../screens/NativeServiceChatScreen.tsx");

    expect(serviceChat.match(/uploadNativeServiceCareAgreementSignatureImage\(\{/g)).toHaveLength(2);
    expect(serviceChat).toContain('requestNativeStorageCleanupResult("care_agreements", uploadedSignaturePath');
    expect(serviceChat).toContain('requestNativeStorageCleanupResult("care_agreements", uploadedOwnerSignaturePath');
  });

  it("does not send server-owned profile timestamps in native photo persistence", () => {
    const editProfile = source("../screens/NativeEditProfileScreen.tsx");
    const photoPersistence = editProfile.slice(
      editProfile.indexOf("const persistNativeProfilePhotosWithToken"),
      editProfile.indexOf("const saveNativeEditProfileWithToken"),
    );

    expect(photoPersistence).not.toContain("updated_at");
  });

  it("serializes profile photo PATCH requests and reads the synchronous form ref", () => {
    const editProfile = source("../screens/NativeEditProfileScreen.tsx");

    expect(editProfile).toContain("const formRef = useRef(form)");
    expect(editProfile).toContain("formRef.current = resolved");
    expect(editProfile).toContain("const profilePhotoPersistQueueRef = useRef<Promise<void>>(Promise.resolve())");
    expect(editProfile).toContain("profilePhotoPersistQueueRef.current.then(runPersist, runPersist)");
    expect(editProfile).toContain("const previousPhotos = formRef.current.photos");
  });
});
