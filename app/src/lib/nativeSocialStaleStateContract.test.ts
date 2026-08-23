import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = existsSync(resolve(process.cwd(), "app", "package.json"))
  ? resolve(process.cwd(), "app")
  : process.cwd();

const read = (relativePath: string) => readFileSync(resolve(appRoot, relativePath), "utf8");

const between = (source: string, start: string, end: string) => {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt);
  if (startAt < 0 || endAt < 0) throw new Error(`Missing contract boundary: ${start}`);
  return source.slice(startAt, endAt);
};

const assertSocialStaleStateContract = (screen: string, reportModal: string) => {
  const submitComposer = between(screen, "const submitComposer = useCallback", "const openNativeShare = useCallback");
  expect(submitComposer).toContain("postScope: viewerScope");
  expect(submitComposer).toMatch(/\}, \[[^\]]*\bviewerScope\b[^\]]*\]\);/s);

  const renderItem = between(screen, "const renderItem = useCallback", "const handleViewableItemsChanged = useRef");
  expect(renderItem).toContain("accessToken,");
  expect(renderItem).toContain("sessionKey: currentSessionKey");
  expect(renderItem).toContain("clearReplyComposer();");
  expect(renderItem).toMatch(/\}, \[[^\]]*\baccessToken\b[^\]]*\]\);/s);
  expect(renderItem).toMatch(/\}, \[[^\]]*\bcurrentSessionKey\b[^\]]*\]\);/s);
  expect(renderItem).toMatch(/\}, \[[^\]]*\bclearReplyComposer\b[^\]]*\]\);/s);

  const blockedCheck = between(reportModal, "useEffect(() => {\n    if (!open || !currentUserId", "const pickImages = useCallback");
  expect(blockedCheck).toContain("areNativeSocialUsersBlocked(currentUserId, target.userId, accessToken)");
  expect(blockedCheck).toMatch(/\}, \[[^\]]*\baccessToken\b[^\]]*\]\);/s);
};

describe("native Social stale-state contract", () => {
  it("rebinds post scope, map prefetch, reply state, and report block checks to current state", () => {
    assertSocialStaleStateContract(
      read("src/screens/NativeSocialScreen.tsx"),
      read("src/components/social/NativeSocialReportModal.tsx"),
    );
  });

  it("detects removal of each protected dependency without mutating the working tree", () => {
    const screen = read("src/screens/NativeSocialScreen.tsx");
    const reportModal = read("src/components/social/NativeSocialReportModal.tsx");
    const tamperedScreen = screen
      .replace(", viewerScope]);\n\n  const openNativeShare", "]);\n\n  const openNativeShare")
      .replace("}, [accessToken, clearReplyComposer, commentLoadErrors", "}, [commentLoadErrors");
    const tamperedReportModal = reportModal.replace("}, [accessToken, currentUserId, onClose", "}, [currentUserId, onClose");

    expect(() => assertSocialStaleStateContract(tamperedScreen, reportModal)).toThrow();
    expect(() => assertSocialStaleStateContract(screen, tamperedReportModal)).toThrow();
  });
});
