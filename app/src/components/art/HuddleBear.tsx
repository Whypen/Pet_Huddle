import { Image as ExpoImage } from "expo-image";
import { StyleSheet, View } from "react-native";

import bearHappy from "../../../assets/Notifications/Toast/114.png";
import bearUnimpressed from "../../../assets/Notifications/Toast/115.png";
import bearNeutral from "../../../assets/Notifications/Toast/116.png";
import bearCub from "../../../assets/Notifications/Toast/117.png";

// The huddle bear.
//
// Source art is 1080x1350 (4:5) with transparent padding around the figure, so
// rendering the frame at 4:5 lands the bear at roughly 70% of the given width —
// which is why `size` is the frame width, not the bear's own width.
//
//   happy       114  paws clasped, heart      long walk, rewards
//   unimpressed 115  arms crossed             short walk, errors, offline
//   neutral     116  standing                 default, empty states
//   cub         117  sitting cub              small slots, refresh peek
export type HuddleBearPose = "happy" | "unimpressed" | "neutral" | "cub";

const BEAR_ART: Record<HuddleBearPose, typeof bearNeutral> = {
  happy: bearHappy,
  unimpressed: bearUnimpressed,
  neutral: bearNeutral,
  cub: bearCub,
};

const ART_ASPECT = 1080 / 1350;

type HuddleBearProps = {
  pose: HuddleBearPose;
  /** Frame width. The figure occupies about 70% of it (100% for `cub`). */
  size?: number;
};

export function HuddleBear({ pose, size = 100 }: HuddleBearProps) {
  const height = Math.round(size / ART_ASPECT);

  return (
    <View pointerEvents="none" style={[styles.frame, { height, width: size }]}>
      <ExpoImage
        contentFit="contain"
        source={BEAR_ART[pose]}
        style={[styles.art, { height, width: size }]}
        transition={0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
  },
  art: {
    left: 0,
    position: "absolute",
    top: 0,
  },
});
