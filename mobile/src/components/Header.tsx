import { Image, View } from "react-native";
import { COLORS, LAYOUT } from "../theme/tokens";
import { BackButton } from "./BackButton";
import huddleLogo from "../../assets/huddle-logo.png";
import { HText } from "./HText";

type Props = {
  showBack?: boolean;
};

export function Header({ showBack }: Props) {
  return (
    <View
      style={{
        height: LAYOUT.headerHeight,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: LAYOUT.sectionPaddingH,
        borderBottomWidth: 1,
        borderBottomColor: `${COLORS.brandText}1F`,
        backgroundColor: COLORS.white,
      }}
    >
      {showBack ? <BackButton /> : null}

      <HText variant="heading" style={{ fontSize: 24, fontWeight: "700" }} accessibilityRole="header">
        huddle
      </HText>

      <View style={{ position: "absolute", left: 0, right: 0, alignItems: "center" }}>
        <Image
          source={huddleLogo}
          style={{ width: 28, height: 28 }}
          resizeMode="contain"
          accessibilityLabel="Huddle logo"
        />
      </View>
    </View>
  );
}
