/* eslint-disable @typescript-eslint/no-require-imports */
// React Native Metro static asset declarations must use require() — ES import
// is not supported for PNG assets in this project's bundler configuration.
import type { ImageSourcePropType } from "react-native";

export type NativeGenderBucket = "male" | "female" | "neutral";

const MALE_AVATAR_ASSETS: ImageSourcePropType[] = [
  require("../../assets/user-pin/male/01-alex-taylor.png"),
  require("../../assets/user-pin/male/02-ethan-ho.png"),
  require("../../assets/user-pin/male/02-river-chen.png"),
  require("../../assets/user-pin/male/02-sabrina-lee.png"),
  require("../../assets/user-pin/male/03-ryan-au.png"),
  require("../../assets/user-pin/male/03-sky-morgan.png"),
  require("../../assets/user-pin/male/04-calvin-poon.png"),
  require("../../assets/user-pin/male/04-casey-lin.png"),
  require("../../assets/user-pin/male/05-jordan-vale.png"),
  require("../../assets/user-pin/male/05-marcus-lau.png"),
  require("../../assets/user-pin/male/06-adrian-ng.png"),
  require("../../assets/user-pin/male/07-quinn-park.png"),
];

const FEMALE_AVATAR_ASSETS: ImageSourcePropType[] = [
  require("../../assets/user-pin/female/01-maya-chan.png"),
  require("../../assets/user-pin/female/03-naomi-yip.png"),
  require("../../assets/user-pin/female/04-tiffany-cheung.png"),
  require("../../assets/user-pin/female/05-olivia-tang.png"),
  require("../../assets/user-pin/female/06-chloe-lam.png"),
  require("../../assets/user-pin/female/07-daniel-kwok.png"),
  require("../../assets/user-pin/female/08-hannah-yu.png"),
  require("../../assets/user-pin/female/08-victor-cheng.png"),
];

const NEUTRAL_AVATAR_ASSETS: ImageSourcePropType[] = [
  require("../../assets/user-pin/neutral/01-jasper-wong.png"),
  require("../../assets/user-pin/neutral/01-maya-chan.png"),
  require("../../assets/user-pin/neutral/06-avery-wong.png"),
  require("../../assets/user-pin/neutral/07-daniel-kwok.png"),
  require("../../assets/user-pin/neutral/07-grace-ho.png"),
  require("../../assets/user-pin/neutral/07-quinn-park.png"),
  require("../../assets/user-pin/neutral/08-victor-cheng.png"),
];

const GROUP_PIN_ASSETS: ImageSourcePropType[] = [
  require("../../assets/user-pin/groups/01-group-maya-chan-jasper-wong-alex-taylor.png"),
  require("../../assets/user-pin/groups/02-group-sabrina-lee-ethan-ho-river-chen.png"),
  require("../../assets/user-pin/groups/03-group-naomi-yip-ryan-au-sky-morgan.png"),
  require("../../assets/user-pin/groups/04-group-tiffany-cheung-calvin-poon-casey-lin.png"),
  require("../../assets/user-pin/groups/05-group-olivia-tang-marcus-lau-jordan-vale.png"),
  require("../../assets/user-pin/groups/06-group-chloe-lam-adrian-ng-avery-wong.png"),
  require("../../assets/user-pin/groups/07-group-grace-ho-daniel-kwok-quinn-park.png"),
  require("../../assets/user-pin/groups/08-group-hannah-yu-victor-cheng-jamie-lau.png"),
];

const AVATAR_ASSETS: Record<NativeGenderBucket, ImageSourcePropType[]> = {
  male: MALE_AVATAR_ASSETS,
  female: FEMALE_AVATAR_ASSETS,
  neutral: NEUTRAL_AVATAR_ASSETS,
};

const hashDeterministically = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const pickFromList = (items: ImageSourcePropType[], key: string) => {
  if (items.length === 0) return null;
  return items[hashDeterministically(key) % items.length] ?? null;
};

export const normalizeNativeGenderBucket = (value: string | null | undefined): NativeGenderBucket => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "male" || normalized === "man") return "male";
  if (normalized === "female" || normalized === "woman") return "female";
  return "neutral";
};

export const pickNativeMaskedAvatarAsset = (bucket: NativeGenderBucket, sessionKey: string) =>
  pickFromList(AVATAR_ASSETS[bucket], sessionKey);

export const pickNativeGroupedPinAsset = (sessionKey: string) =>
  pickFromList(GROUP_PIN_ASSETS, sessionKey);
