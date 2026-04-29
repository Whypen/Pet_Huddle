export type ProfilePhotoSlot =
  | "cover"
  | "establishing"
  | "pack"
  | "solo"
  | "closer";

export type SoloAspect = "1:1" | "4:5" | "16:9";

export type ProfilePhotos = {
  cover: string | null;
  establishing: string | null;
  pack: string | null;
  solo: string | null;
  closer: string | null;
  cover_caption: string | null;
  establishing_caption: string | null;
  pack_caption: string | null;
  solo_caption: string | null;
  closer_caption: string | null;
  solo_aspect: SoloAspect | null;
};

export const PROFILE_PHOTO_SLOTS: ProfilePhotoSlot[] = [
  "cover",
  "establishing",
  "pack",
  "solo",
  "closer",
];

export const SOLO_ASPECTS: SoloAspect[] = ["1:1", "4:5", "16:9"];
