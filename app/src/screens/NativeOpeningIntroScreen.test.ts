import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..", "..");
const read = (path: string) => readFileSync(join(appRoot, path), "utf8");
const screen = () => read("src/screens/NativeOpeningIntroScreen.tsx");

describe("NativeOpeningIntroScreen", () => {
  it("equalises letter size with a measured per-card correction, not a shared canvas scale", () => {
    const text = screen();
    expect(text).toContain("sizeCorrection");
    expect(text).toContain("caption.width * caption.sizeCorrection * scale");
    expect(text).toContain("width={captionWidth(caption)}");
  });

  it("keeps cards 2 and 3 on one correction, because their shared line carries the wordplay", () => {
    const text = screen();
    const values = [...text.matchAll(/sizeCorrection: ([\d.]+)/g)].map((m) => m[1]);
    expect(values).toHaveLength(4);
    expect(values[1]).toBe(values[2]);
  });

  it("lets the widest unpinned card set the ceiling so equalising type cannot overflow", () => {
    const text = screen();
    expect(text).toContain("const CAPTION_MAX_SCREEN_RATIO = 0.7;");
    expect(text).toContain("const scale = (width * CAPTION_MAX_SCREEN_RATIO) / WIDEST_CORRECTED_CAPTION;");
    expect(text).toContain("caption.screenWidthRatio === undefined");
  });

  it("pins the closing card to a fixed share of screen width", () => {
    const text = screen();
    expect(text).toContain("screenWidthRatio: 0.65");
    expect(text).toContain("width * caption.screenWidthRatio");
    // Aspect is derived, so a re-exported PNG cannot distort.
    expect(text).toContain("captionWidth(caption) * (caption.height / caption.width)");
  });

  it("carries the approved caption timings", () => {
    const text = screen();
    expect(text).toContain("start: 0, end: 1.9");
    expect(text).toContain("start: 2.1, end: 3.8");
    expect(text).toContain("start: 4, end: 6.7");
    expect(text).toContain("start: 6.8, end: 10");
  });

  it("fills any device with the video centred and the captions centred over it", () => {
    const text = screen();
    expect(text).toContain('contentFit="cover"');
    expect(text).toMatch(/captionLayer:\s*{[^}]*alignItems:\s*"center"/);
    expect(text).toMatch(/captionLayer:\s*{[^}]*justifyContent:\s*"center"/);
  });

  it("never takes the audio session from whatever the user is playing", () => {
    const text = screen();
    expect(text).toContain('nextPlayer.audioMixingMode = "mixWithOthers";');
    expect(text).toContain("nextPlayer.muted = true;");
    expect(text).toContain("nextPlayer.loop = false;");
  });

  it("is skippable from the first frame and fades to white on the way out", () => {
    const text = screen();
    expect(text).toContain('accessibilityLabel="Skip intro"');
    expect(text).toContain("onPress={finish}");
    expect(text).toMatch(/white:\s*{[^}]*backgroundColor:\s*huddleColors\.canvas/);
  });

  it("shows an explicit Skip label, since the full-screen tap is otherwise invisible", () => {
    const text = screen();
    expect(text).toContain("<Text style={styles.skipLabel}>Skip</Text>");
    expect(text).toContain("bottom: insets.bottom + huddleSpacing.x5");
    // Carries a scrim: the film runs bright enough to swallow plain white type.
    expect(text).toMatch(/skip:\s*{[^}]*backgroundColor:/);
    // Held back past the first card so frame one stays clean.
    expect(text).toContain("withDelay(");
  });

  it("leaves for auth on playToEnd, and also if the video fails rather than trapping the user", () => {
    const text = screen();
    expect(text).toContain('useEventListener(player, "playToEnd", () => finish());');
    expect(text).toContain('if (status === "error" || error) finish();');
  });

  it("marks itself seen on mount, so a killed launch cannot replay it", () => {
    const text = screen();
    expect(text).toMatch(/useEffect\(\(\) => {\s*void markNativeOpeningIntroSeen\(\);\s*}, \[\]\);/);
  });
});

describe("nativeOpeningIntro storage", () => {
  it("is device-scoped with no user id, because this plays before anyone signs in", () => {
    const lib = read("src/lib/nativeOpeningIntro.ts");
    expect(lib).toContain('const OPENING_INTRO_KEY = "huddle-opening-intro-seen:v1";');
    expect(lib).not.toContain("userId");
    // SecureStore survives uninstall on iOS, which would skip the opening for a
    // reinstall; AsyncStorage clears with the install, which is what we want.
    expect(lib).not.toContain("expo-secure-store");
    expect(lib).not.toContain("SecureStore.");
    expect(lib).toContain("AsyncStorage");
  });
});

describe("RootNavigator opening intro wiring", () => {
  it("replaces the screen beneath it, so no brand mark loops unseen behind the film", () => {
    const nav = read("src/navigation/RootNavigator.tsx");
    expect(nav).toMatch(/if \(openingIntroDecision\) {\s*return \(\s*<View style={styles\.root}>\s*<NativeOpeningIntroScreen/);
    const introAt = nav.indexOf("if (openingIntroDecision) {");
    const authAt = nav.indexOf('if (resolvedRoute.route === "auth" || !session || !userId) {');
    expect(introAt).toBeGreaterThan(0);
    expect(introAt).toBeLessThan(authAt);
  });

  it("decides nothing until the session has resolved", () => {
    const nav = read("src/navigation/RootNavigator.tsx");
    expect(nav).toContain("useState<boolean | null>(null)");
    expect(nav).toContain("if (!authBootChecked) return;");
    expect(nav).toMatch(/}, \[authBootChecked, session\]\);/);
  });

  it("holds the brand loading mark while a signed-out app reads the first-run flag", () => {
    const nav = read("src/navigation/RootNavigator.tsx");
    // No blank frame and no flash of the auth screen before the film appears.
    expect(nav).toContain("|| (!session && openingIntroDecision === null)");
    const gateAt = nav.indexOf("|| (!session && openingIntroDecision === null)");
    const filmAt = nav.indexOf("if (openingIntroDecision) {");
    expect(gateAt).toBeGreaterThan(0);
    expect(gateAt).toBeLessThan(filmAt);
  });

  it("warms the auth brand mark from inside the film, paused and never rendered", () => {
    const text = screen();
    expect(text).toContain('import brandLogoVideo from "../../assets/APP/brandlogo.mp4";');
    expect(text).toContain("useVideoPlayer(brandLogoVideo, (warmup) => {");
    expect(text).toContain("warmup.pause();");
    expect(text).toContain("warmup.muted = true;");
    // No VideoView for it: a visible warm-up would loop behind the film and be
    // revealed mid-animation.
    expect(text).not.toContain("player={brandWarmup}");
  });

  it("only plays on a signed-out cold start and never becomes a sign-out transition", () => {
    const nav = read("src/navigation/RootNavigator.tsx");
    expect(nav).toContain("const openingIntroColdStartCheckedRef = useRef(false);");
    expect(nav).toContain("void hasSeenNativeOpeningIntro().then((seen) => {");
    expect(nav).toContain("if (!cancelled) setOpeningIntroDecision(!seen);");
    expect(nav).toMatch(/if \(session\) {\s*setOpeningIntroDecision\(false\);\s*return;\s*}/);
    expect(nav).toMatch(/if \(openingIntroColdStartCheckedRef\.current\) return;\s*openingIntroColdStartCheckedRef\.current = true;/);
  });
});
