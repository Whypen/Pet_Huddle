import type { NativeProfilePhotoSlot, NativeSoloAspect } from "../../lib/nativeProfilePhotos";

export const NATIVE_PROFILE_SLOT_ORDER: NativeProfilePhotoSlot[] = [
  "cover",
  "establishing",
  "pack",
  "solo",
  "closer",
];

export type NativeProfileSlotAspect = "4/5" | "3/2" | "free";

export const nativeProfileSlotBriefs: Record<NativeProfilePhotoSlot, {
  aspect: NativeProfileSlotAspect;
  helper: string;
  label: string;
}> = {
  cover: {
    label: "Main photo",
    helper: "A clear photo of you. Eye contact. Daylight is your friend.",
    aspect: "4/5",
  },
  establishing: {
    label: "Where you spend time",
    helper: "A wider shot — your neighbourhood, a favourite park, your sofa with the dog on it.",
    aspect: "4/5",
  },
  pack: {
    label: "You and your pet",
    helper: "A photo with at least one of your pets. You can add a caption.",
    aspect: "3/2",
  },
  solo: {
    label: "A photo of just you",
    helper: "One more frame of you — square, portrait, or wide, however it was shot.",
    aspect: "free",
  },
  closer: {
    label: "One last photo",
    helper: "The image you'd want a neighbour to remember.",
    aspect: "4/5",
  },
};

export const nativeProfileAspectLabels: Record<NativeSoloAspect, string> = {
  "1:1": "Square",
  "4:5": "Portrait",
  "16:9": "Wide",
};
