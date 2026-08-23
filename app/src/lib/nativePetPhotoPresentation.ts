import type { ImageStyle } from "react-native";

export type NativePetPhotoPresentation = {
  centerX?: number;
  centerY?: number;
  widthPct?: number;
  sourceAspect?: number;
} | null | undefined;

const bounded = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Derives Home, polaroid, and avatar crops from one adjustable 5:4 pet frame. */
export const nativePetPresentationImageStyle = (
  crop: NativePetPhotoPresentation,
  outputAspect: number,
): ImageStyle => {
  const selectedWidth = bounded(crop?.widthPct ?? 100, 1, 100);
  const sourceAspect = bounded(crop?.sourceAspect ?? 4 / 5, 0.1, 10);
  const selectedHeight = selectedWidth * sourceAspect / (5 / 4);
  const cropWidth = Math.min(selectedWidth, selectedHeight * outputAspect / sourceAspect);
  const cropHeight = cropWidth * sourceAspect / outputAspect;
  const centerX = bounded(crop?.centerX ?? 50, cropWidth / 2, 100 - cropWidth / 2);
  const centerY = bounded(crop?.centerY ?? 50, cropHeight / 2, 100 - cropHeight / 2);

  return {
    position: "absolute",
    width: `${10000 / cropWidth}%`,
    height: `${10000 / cropHeight}%`,
    left: `${-(centerX - cropWidth / 2) * 100 / cropWidth}%`,
    top: `${-(centerY - cropHeight / 2) * 100 / cropHeight}%`,
  };
};
