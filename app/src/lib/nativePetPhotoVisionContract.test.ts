import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = fs.existsSync(path.join(process.cwd(), "app", "package.json"))
  ? path.join(process.cwd(), "app")
  : process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("native pet photo upload contract", () => {

  it("keeps the pet picker on the same manual crop and upload path as profile photos", () => {
    const petScreen = read("src/screens/NativeSetPetScreen.tsx");
    const cropper = read("src/components/profile/NativeProfilePhotoCropper.tsx");

    expect(petScreen).not.toContain("suggestNativePetPhotoCropResult");
    expect(petScreen).toContain("pickNativeProfilePhoto({})");
    expect(petScreen).toContain('aspect="4/5"');
    expect(petScreen).toContain('title="Adjust pet photo"');
    expect(petScreen).toContain("presentationCropAspect={huddlePetPhoto.bannerAspect}");
    expect(petScreen).toContain('presentationCropLabel="Home banner"');
    expect(petScreen).toContain("setPetCropAsset({");
    expect(petScreen).toContain("await uploadNativeLocalMediaToSupabase({");
    expect(petScreen).toContain('const bucket: PetPhotoStorageBucket = form.isPublic ? "pets" : "private_pet_photos"');
    expect(petScreen).toContain("requestNativeStorageCleanupResult(object.bucket, object.path");
    expect(petScreen).toContain('requestNativeStorageCleanupResult(petPhotoObject.bucket, petPhotoObject.path, "delete_pet_photo"');
    expect(cropper).toContain("await normalizeNativeProfilePhotoAsset(asset, crop");
    expect(cropper).toContain("buildPresentationCrop()");
    expect(cropper).not.toContain("normalizeNativeProfilePhotoAsset(asset, presentationCrop");
    expect(cropper).not.toContain("avatarPreviewRing");
    expect(cropper).toContain('title="Discard photo edits?"');
    expect(cropper).toContain('cancel="Keep editing"');
    expect(cropper).toContain('confirm="Confirm"');
    expect(cropper).toMatch(/confirm="Confirm"\s+destructive/);
    expect(cropper).toMatch(/presentation="inline"\s+showClose/);
    expect(cropper).toContain("const cropGesture = useMemo(() =>");
    expect(cropper).toContain("const previewOverlayFrame = useMemo(() =>");
    expect(cropper).toContain("const presentationCropGesture = useMemo(() =>");
    expect(cropper).not.toContain("presentationCropPositionRef.current");
    expect(cropper).toContain("centerX: ((sourceCrop.originX + sourceCrop.width / 2) / imageWidth) * 100");
    expect(cropper).toContain("centerY: ((sourceCrop.originY + sourceCrop.height / 2) / imageHeight) * 100");
    expect(cropper).toContain("Presentation frames are metadata only");
    expect(cropper).toContain("await onSave(asset, aspectOptions");
    expect(cropper).toContain("? { originX: 0, originY: 0, width: imageWidth, height: imageHeight }");
    expect(cropper).not.toContain("savePresentationCropAsAsset");
    expect(cropper).toContain("sourceAspect: imageWidth / imageHeight");
    expect(cropper).toContain("animatedPresentationFrameStyle");
    expect(cropper).toContain("presentationSelected ? styles.previewOverlaySelected");
    expect(cropper).toContain("const presentationResizeGesture = useMemo");
    expect(cropper).toContain("gesture={presentationResizeGesture}");
    expect(cropper).toContain('borderStyle: "dashed"');
    expect(cropper).toContain('borderStyle: "solid"');
    expect(cropper).toContain("styles.focusMask");
    expect(cropper).not.toContain("gridHorizontalTop");
    expect(cropper).not.toContain("setPresentationCropPosition");
    expect(cropper).not.toContain(".onEnd(commitTransform)");
    expect(cropper).toContain("if (success) commitTransform()");
    expect(cropper).toContain("<GestureHandlerRootView style={styles.gestureRoot}>");
    expect(cropper).toContain("[asset?.uri, effectiveAspect");
    expect(cropper).not.toContain("[asset, effectiveAspect");
    expect(cropper).toContain("if (!crop)");
    expect(cropper).toContain("Couldn't read that photo. Try another image.");
  });

  it("keeps profile avatar framing separate from the canonical profile photo", () => {
    const cropper = read("src/components/profile/NativeProfilePhotoCropper.tsx");
    const photos = read("src/lib/nativeProfilePhotos.ts");
    const slots = read("src/components/profile/NativeProfilePhotoSlots.tsx");
    const avatar = read("src/components/NativeProfileAvatar.tsx");
    const home = read("src/screens/NativeHomeScreen.tsx");
    const editProfile = read("src/screens/NativeEditProfileScreen.tsx");
    const avatarHydration = read("src/lib/nativeAvatarPresentation.ts");

    expect(cropper).toContain("presentationCropAspect && imageWidth && imageHeight");
    expect(cropper).toContain("originX: 0, originY: 0, width: imageWidth, height: imageHeight");
    expect(cropper).not.toContain("savePresentationCropAsAsset");
    expect(photos).toContain("avatar_presentation: NativeProfilePhotoPresentationCrop | null");
    expect(slots).toContain("avatar_presentation: slot === \"cover\" ? presentationCrop");
    expect(read("src/components/profile/NativeProfilePhotoSlot.tsx")).toContain("editingExisting && slot === \"cover\" && value");
    expect(avatar).toContain("presentationCrop?: NativeProfilePhotoPresentationCrop | null");
    expect(avatar).toContain("const cropWidth = sourceSize.width * crop.widthPct / 100");
    expect(home).toContain("presentationCrop={homeProfileAvatarPresentation(profile)}");
    expect(home).toContain("avatarPresentation={homeProfileAvatarPresentation(profile)}");
    expect(editProfile).toContain("photos: nextPhotos,");
    expect(avatar).toContain("loadNativeAvatarPresentation(userId)");
    expect(avatarHydration).toContain('supabase.rpc("get_native_public_avatar_presentations"');
    expect(avatarHydration).toContain("if (!flushTimer) flushTimer = setTimeout");
  });

  it("uses one canonical photo and preserves its editable Home crop", () => {
    const petScreen = read("src/screens/NativeSetPetScreen.tsx");
    const homeScreen = read("src/screens/NativeHomeScreen.tsx");
    const publicProfile = read("src/lib/nativePublicProfile.ts");
    const editProfile = read("src/screens/NativeEditProfileScreen.tsx");
    const tokens = read("src/theme/huddleDesignTokens.ts");
    const metadataMigration = read("../supabase/migrations/20260801120000_pet_single_photo_presentation_metadata.sql");
    const cleanupMigration = read("../supabase/migrations/20260801120100_queue_redundant_pet_home_derivative_cleanup.sql");
    const serviceChat = read("src/screens/NativeServiceChatScreen.tsx");
    const mapScreen = read("src/screens/NativeMapScreen.tsx");

    expect(tokens).toContain("bannerAspect: 5 / 4");
    expect(petScreen).toContain("photo_presentation: homeCrop ? { home: homeCrop } : {}");
    expect(petScreen).toContain("if (editingExistingPetPhoto)");
    expect(petScreen).toContain('variant: "portrait"');
    expect(petScreen).not.toContain('variant: "portrait" | "home"');
    expect(homeScreen).toContain("const presentationPhotoUrl = pet.photo_url");
    expect(homeScreen).toContain("nativePetPresentationImageStyle(homePosition, huddlePetPhoto.bannerAspect)");
    expect(homeScreen).toContain("nativePetPresentationImageStyle(pet.photo_presentation?.home, 1)");
    expect(homeScreen).toContain("height: width / huddlePetPhoto.bannerAspect");
    expect(publicProfile).toContain("photoUrl: nullableString(pet.photo_url)");
    expect(editProfile).toContain("photo_url,photo_presentation,is_public,is_active");
    expect(editProfile).toContain("photoUrl: cleanString(pet.photo_url) || null");
    expect(metadataMigration).toContain("add column if not exists photo_presentation jsonb");
    expect(metadataMigration).toContain("set home_photo_url = null");
    expect(cleanupMigration).toContain("retire_pet_home_derivative");
    expect(petScreen).toContain("loadNativeProfilePhotoForEditing(photoUri)");
    expect(petScreen).toContain("onEdit={() => void editCurrentPhoto()}");
    expect(petScreen).toContain("initialPresentationCrop={homeCrop}");
    expect(serviceChat).toContain("nativePetPresentationImageStyle(pet.photo_presentation?.home, huddlePolaroid.photo.aspectRatio)");
    expect(serviceChat).toContain("photo_url,photo_presentation,is_active");
    expect(mapScreen).toContain("photoPosition: pet.photoPosition");
    expect(mapScreen).toContain("<NativeProfileAvatar name={fallbackName}");
    expect(mapScreen).toContain("userId={friend.id}");
    expect(mapScreen).toContain("userId={effectiveUserId}");
    expect(tokens).toContain("aspectRatio: 9 / 8");
  });

  it("edits an existing pet or profile image directly and reserves the image control for replacement", () => {
    const hero = read("src/components/NativeHeroPhotoPicker.tsx");
    const slot = read("src/components/profile/NativeProfilePhotoSlot.tsx");
    const picker = read("src/components/profile/NativeProfilePhotoPicker.tsx");

    expect(hero).toContain("onPress={hasPhoto ? (onEdit ?? onPick) : onPick}");
    expect(slot).toContain("loadNativeProfilePhotoForEditing(value)");
    expect(slot).toContain("onPress={hasPhoto ? () => void handleEditCurrent() : handlePickAndUpload}");
    expect(slot).toContain("void handlePickAndUpload()");
    expect(slot).not.toContain("Photo options");
    expect(slot).toContain('avatarCrop={slot === "cover"}');
    expect(picker).toContain("FileSystem.downloadAsync(resolved, destination)");
  });

  it("uses PHPicker's least-privilege, non-transcoding selection path", () => {
    const picker = read("src/components/profile/NativeProfilePhotoPicker.tsx");

    expect(picker).toContain("launchNativeImageLibraryAsync({");
    expect(picker).not.toContain("requestMediaLibraryPermissionsAsync");
    expect(picker).toContain("UIImagePickerPreferredAssetRepresentationMode.Current");
    expect(picker).not.toContain("UIImagePickerPreferredAssetRepresentationMode.Compatible");
    expect(picker).toContain("validateNativeProfilePhotoAsset(hydratedAsset)");
    expect(picker).toContain("await readAssetFileSize(selectedAsset.uri)");
    expect(picker).toContain("Couldn't verify that photo's size. Try another image.");
    expect(picker).toContain("readImageDimensions(selectedAsset.uri)");
  });

  it("does not gate the pet cropper on Vision or preparation state", () => {
    const petScreen = read("src/screens/NativeSetPetScreen.tsx");
    const picker = read("src/components/profile/NativeProfilePhotoPicker.tsx");

    expect(petScreen).not.toContain("petPhotoPreparation");
    expect(petScreen).not.toContain("petSuggestedCropRect");
    expect(petScreen).not.toContain("nativePetPhotoVision");
    expect(picker).not.toContain("onAssetSelected");
  });

  it("keeps every photo-library-only picker on PHPicker least privilege", () => {
    const sourceRoot = path.join(root, "src");
    const files: string[] = [];
    const walk = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(fullPath);
        else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) files.push(fullPath);
      }
    };
    walk(sourceRoot);
    const pickerSources = files
      .filter((file) => !file.endsWith("nativeMediaPermissions.ts"))
      .map((file) => fs.readFileSync(file, "utf8"))
      .filter((source) => source.includes("launchNativeImageLibraryAsync"));
    expect(pickerSources.length).toBeGreaterThan(0);
    for (const source of pickerSources) {
      expect(source).not.toContain("requestMediaLibraryPermissionsAsync");
    }
  });

  it("keeps Android photo selection permissionless and save-to-library permission write-only", () => {
    const appConfig = JSON.parse(read("app.json")) as {
      expo: { android: { blockedPermissions: string[] }; plugins: unknown[] };
    };
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    const writeOnlyPlugin = read("plugins/with-android-media-library-write-only.js");
    const shareCard = read("src/components/share/NativeShareCardModal.tsx");
    const careCard = read("src/components/service/ServiceCareUpdateCard.tsx");
    const carePolaroid = read("src/components/service/CareUpdatePolaroid.tsx");

    const mediaPlugin = appConfig.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-media-library") as [string, { granularPermissions?: string[] }] | undefined;
    expect(mediaPlugin?.[1].granularPermissions).toEqual([]);
    expect(appConfig.expo.android.blockedPermissions).toEqual(expect.arrayContaining([
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.READ_MEDIA_AUDIO",
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_MEDIA_VIDEO",
      "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
    ]));
    expect(manifest).toContain('android.permission.READ_MEDIA_VISUAL_USER_SELECTED" tools:node="remove"');
    expect(manifest).toContain('android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28"');
    expect(writeOnlyPlugin).toContain('writePermission.$["android:maxSdkVersion"] = "28"');
    expect(shareCard).toContain("requestNativeMediaLibrarySavePermission()");
    expect(careCard).toContain("requestNativeMediaLibrarySavePermission()");
    expect(carePolaroid).toContain("requestNativeMediaLibrarySavePermission()");
    expect(read("src/lib/nativeMediaPermissions.ts")).toContain("MediaLibrary.requestPermissionsAsync(true)");
  });

  it("keeps the app photo ceiling within the deployed server ceiling", () => {
    const client = read("src/lib/nativeProfilePhotos.ts");
    const server = fs.readFileSync(path.join(root, "..", "supabase/functions/native-profile-photo-upload/index.ts"), "utf8");

    expect(client).toContain("NATIVE_PROFILE_PHOTO_FINAL_MAX_BYTES = 1.2 * 1024 * 1024");
    expect(server).toContain("MAX_BYTES = 1.5 * 1024 * 1024");
    expect(client).not.toContain("quality === qualities[qualities.length - 1]");
  });
});
