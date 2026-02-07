import { Image, View } from "react-native";
import { COLORS } from "../theme/tokens";
import type { VerificationStatus } from "../contexts/AuthContext";
import fallbackIcon from "../../assets/icon.png";

type Props = {
  uri?: string | null;
  verificationStatus?: VerificationStatus | null;
  showCarBadge?: boolean;
  size?: number;
};

export function UserAvatar({ uri, verificationStatus, showCarBadge, size = 56 }: Props) {
  const rim =
    verificationStatus === "Verified"
      ? COLORS.brandGold
      : verificationStatus === "Rejected"
        ? COLORS.brandError
        : "rgba(66,73,101,0.35)";

  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: rim, overflow: "hidden" }}>
      <Image
        source={uri ? { uri } : fallbackIcon}
        style={{ width: size, height: size }}
        resizeMode="cover"
      />
      {/* UAT: only verified badge + car badge; no crown. */}
      {verificationStatus === "Verified" ? (
        <View
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: COLORS.brandGold,
            borderWidth: 2,
            borderColor: COLORS.white,
          }}
        />
      ) : null}
      {showCarBadge ? (
        <View
          style={{
            position: "absolute",
            left: -2,
            bottom: -2,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: COLORS.brandBlue,
            borderWidth: 2,
            borderColor: COLORS.white,
          }}
        />
      ) : null}
    </View>
  );
}
