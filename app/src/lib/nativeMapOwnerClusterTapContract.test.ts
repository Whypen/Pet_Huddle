import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(resolve(appRoot, "src/screens/NativeMapScreen.tsx"), "utf8");

describe("native map owner cluster tap contract", () => {
  it("gives the owner its sharing-control target and keeps nearby friends on the existing people target", () => {
    expect(source).toMatch(/const ownerAreaFriendIds = useMemo/);
    expect(source).toMatch(/!ownerAreaFriendIds\.has\(member\.id\)/);
    expect(source).toMatch(/<AreaChipRow\s+members=\{cluster\.members\}/s);
    expect(source).toMatch(/accessibilityLabel="Open map sharing controls"/);
    expect(source).toMatch(/onOwnerPress=\{\(\) => \{\s*void openSelfPinMenu\(cluster\.center/);
    expect(source).toMatch(/onOthersPress=\{\(\) => \{\s*handleAreaOthersAction\(cluster\)/s);
  });

  it("reserves room for a visible people fan before placing it beside the owner", () => {
    expect(source).toMatch(/const friendFanFootprint = \(count: number\)/);
    expect(source).toMatch(/size: item\.expanded \|\| markerRenderZoom >= FRIEND_AVATAR_OVERVIEW_ZOOM\s*\? friendFanFootprint\(item\.count\)/s);
    expect(source).toMatch(/const ownSize = ownMarkerSizeForZoom\(markerRenderZoom\)/);
  });
});
