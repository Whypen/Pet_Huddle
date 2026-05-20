import * as ImagePicker from "expo-image-picker";
import type { NativeSoloAspect } from "../../lib/nativeProfilePhotos";

export type NativeProfilePickedPhoto = {
  asset: ImagePicker.ImagePickerAsset;
  soloAspect: NativeSoloAspect | null;
};

export const pickNativeProfilePhoto = async ({
  soloAspect = "4:5",
}: {
  soloAspect?: NativeSoloAspect;
}): Promise<NativeProfilePickedPhoto | null> => {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Photo library permission is required to add a profile photo.");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: false,
    mediaTypes: ["images"],
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    quality: 1,
  });
  if (result.canceled || !result.assets[0]?.uri) return null;
  return {
    asset: result.assets[0],
    soloAspect,
  };
};
