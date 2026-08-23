import * as ImagePicker from "expo-image-picker";
import { launchNativeImageLibraryAsync } from "../../lib/nativeMediaPermissions";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "react-native";
import { validateNativeProfilePhotoAsset, type NativeSoloAspect } from "../../lib/nativeProfilePhotos";
import { resolveNativeProfilePhotoDisplayUrl } from "../../lib/nativeProfilePhotos";

export type NativeProfilePickedPhoto = {
  asset: ImagePicker.ImagePickerAsset;
  soloAspect: NativeSoloAspect | null;
};

const readImageDimensions = (uri: string) => new Promise<{ height: number; width: number }>((resolve, reject) => {
  Image.getSize(
    uri,
    (width, height) => {
      if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) resolve({ height, width });
      else reject(new Error("invalid_photo_dimensions"));
    },
    reject,
  );
});

const readAssetFileSize = async (uri: string) => {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && typeof info.size === "number" && Number.isFinite(info.size) && info.size > 0 ? info.size : null;
};

export const loadNativeProfilePhotoForEditing = async (value: string) => {
  const resolved = await resolveNativeProfilePhotoDisplayUrl(value);
  if (!resolved) throw new Error("Couldn't load that photo. Try again.");
  let localUri = resolved;
  if (/^https?:\/\//i.test(resolved)) {
    if (!FileSystem.cacheDirectory) throw new Error("Couldn't prepare that photo for editing.");
    const extension = resolved.split("?")[0]?.split(".").pop()?.toLowerCase();
    const safeExtension = extension && ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(extension) ? extension : "jpg";
    const destination = `${FileSystem.cacheDirectory}huddle-photo-edit-${Date.now()}.${safeExtension}`;
    const downloaded = await FileSystem.downloadAsync(resolved, destination);
    localUri = downloaded.uri;
  }
  const [dimensions, fileSize] = await Promise.all([
    readImageDimensions(localUri),
    readAssetFileSize(localUri),
  ]);
  if (!fileSize) throw new Error("Couldn't prepare that photo for editing.");
  return {
    ...dimensions,
    fileName: localUri.split("/").pop() || "photo.jpg",
    fileSize,
    mimeType: null,
    uri: localUri,
  };
};

export const pickNativeProfilePhoto = async ({
  soloAspect = "4:5",
}: {
  soloAspect?: NativeSoloAspect;
}): Promise<NativeProfilePickedPhoto | null> => {
  // PHPicker grants access only to the assets the user selects. Do not request
  // broad Photo Library authorization before presenting the system picker.
  const result = await launchNativeImageLibraryAsync({
    allowsEditing: false,
    mediaTypes: ["images"],
    // Preserve the asset's current representation and avoid PHPicker doing an
    // eager compatibility transcode. The shared crop normalizer produces the
    // bounded WebP/JPEG upload artifact after the user confirms the crop.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
    quality: 1,
  });
  if (result.canceled || !result.assets[0]?.uri) return null;
  const selectedAsset = result.assets[0];
  const fileSize = typeof selectedAsset.fileSize === "number" && Number.isFinite(selectedAsset.fileSize) && selectedAsset.fileSize > 0
    ? selectedAsset.fileSize
    : await readAssetFileSize(selectedAsset.uri).catch(() => null);
  if (!fileSize) throw new Error("Couldn't verify that photo's size. Try another image.");
  const hydratedAsset = { ...selectedAsset, fileSize };
  const validation = validateNativeProfilePhotoAsset(hydratedAsset);
  if (validation) throw new Error(validation);
  // Decode dimensions from the same oriented representation rendered by React
  // Native/ImageManipulator. Picker metadata can describe the encoded pixel axes
  // for EXIF-rotated assets rather than the upright image shown to the user.
  const decodedDimensions = await readImageDimensions(selectedAsset.uri).catch(() => null);
  const pickerDimensions = Number.isFinite(selectedAsset.width) && selectedAsset.width > 0 && Number.isFinite(selectedAsset.height) && selectedAsset.height > 0
    ? { height: selectedAsset.height, width: selectedAsset.width }
    : null;
  const dimensions = decodedDimensions ?? pickerDimensions;
  if (!dimensions) throw new Error("Couldn't read that photo. Try a JPG, PNG, or HEIC image.");
  return {
    asset: { ...hydratedAsset, ...dimensions },
    soloAspect,
  };
};
