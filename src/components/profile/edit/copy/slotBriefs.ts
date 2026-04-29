import type { ProfilePhotoSlot } from "@/types/profilePhotos";

export const SLOT_ORDER: ProfilePhotoSlot[] = [
  "cover",
  "establishing",
  "pack",
  "solo",
  "closer",
];

export const slotBriefs: Record<ProfilePhotoSlot, {
  label: string;
  helper: string;
  aspect: "4/5" | "3/2" | "free";
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

export const aspectLabels = {
  "1:1": "Square",
  "4:5": "Portrait",
  "16:9": "Wide",
} as const;
