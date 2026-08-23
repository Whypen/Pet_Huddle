import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const appRoot = fs.existsSync(path.join(process.cwd(), "app", "package.json"))
  ? path.join(process.cwd(), "app")
  : process.cwd();

const sourceFiles = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const target = path.join(directory, entry.name);
  if (entry.isDirectory()) return sourceFiles(target);
  return entry.isFile() && target.endsWith(".tsx") ? [target] : [];
});

const attribute = (node: ts.JsxSelfClosingElement, source: ts.SourceFile, name: string) => {
  const match = node.attributes.properties.find((item): item is ts.JsxAttribute => (
    ts.isJsxAttribute(item) && item.name.getText(source) === name
  ));
  return match?.initializer?.getText(source) ?? (match ? "true" : "");
};

describe("native text-input line contract", () => {
  it("makes every direct single-line TextInput explicitly non-wrapping", () => {
    const failures: string[] = [];
    let count = 0;

    sourceFiles(path.join(appRoot, "src")).forEach((file) => {
      const sourceText = fs.readFileSync(file, "utf8");
      if (!sourceText.includes("<TextInput")) return;
      const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "TextInput" && attribute(node, source, "multiline") === "{false}") {
          count += 1;
          const missing = ["numberOfLines", "lineBreakModeIOS", "lineBreakStrategyIOS", "textBreakStrategy"]
            .filter((name) => !attribute(node, source, name));
          if (missing.length) {
            const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
            failures.push(`${path.relative(appRoot, file)}:${line} missing ${missing.join(", ")}`);
          }
          if (attribute(node, source, "scrollEnabled") === "{false}") {
            const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
            failures.push(`${path.relative(appRoot, file)}:${line} disables native horizontal scrolling`);
          }
          if (!attribute(node, source, "scrollEnabled")) {
            const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
            failures.push(`${path.relative(appRoot, file)}:${line} does not enable native horizontal scrolling`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    });

    expect(count).toBeGreaterThan(60);
    expect(failures).toEqual([]);
  }, 60_000);

  it("keeps shared dynamic fields bounded by their line mode", () => {
    const formField = fs.readFileSync(path.join(appRoot, "src/components/NativeFormField.tsx"), "utf8");
    const modalField = fs.readFileSync(path.join(appRoot, "src/components/nativeModalPrimitives.tsx"), "utf8");
    const signup = fs.readFileSync(path.join(appRoot, "src/screens/NativeSignupScreen.tsx"), "utf8");

    [formField, modalField].forEach((source) => {
      expect(source).not.toContain('lineBreakModeIOS="clip"');
      expect(source).toContain('lineBreakModeIOS={props.lineBreakModeIOS ?? (multiline ? undefined : "tail")}');
      expect(source).toContain('lineBreakStrategyIOS={props.lineBreakStrategyIOS ?? (multiline ? undefined : "none")}');
      expect(source).toContain('textBreakStrategy={props.textBreakStrategy ?? (multiline ? undefined : "simple")}');
      expect(source).toContain("numberOfLines={props.numberOfLines ?? (multiline ? undefined : 1)}");
    });
    expect(formField).toContain("height: huddleFormFields.valueLine");
    expect(formField).toContain('overflow: "hidden"');
    expect(formField).toContain("flexShrink: 1");
    expect(formField).toContain("minWidth: 0");
    expect(modalField).toContain('overflow: "hidden"');
    expect(signup).toContain("maxHeight: huddleLayout.fieldHeight");
    expect(signup).toContain("overflow: \"hidden\"");
  });

  it("keeps the known signup/auth email paths inside their field bounds", () => {
    const signup = fs.readFileSync(path.join(appRoot, "src/screens/NativeSignupScreen.tsx"), "utf8");
    const auth = fs.readFileSync(path.join(appRoot, "src/screens/NativeAuthScreen.tsx"), "utf8");

    [signup, auth].forEach((source) => {
      expect(source).toContain("minWidth: 0");
      expect(source).toContain("flexShrink: 1");
      expect(source).toContain('overflow: "hidden"');
    });
    expect(signup).toContain("scrollEnabled");
  });

  it("keeps direct multiline editors bounded and internally scrollable", () => {
    const required = [
      ["src/components/profile/NativeProfilePhotoSlot.tsx", "scrollEnabled"],
      ["src/components/service/NativeCareUpdateSheet.tsx", "maxHeight: huddleFormFields.multilineHeight"],
      ["src/components/map/NativeBroadcastModal.tsx", "maxHeight: huddleFormFields.multilineHeight"],
      ["src/components/map/NativeAlertDetailModal.tsx", "maxHeight: huddleFormFields.multilineHeight"],
      ["src/screens/NativeSetPetScreen.tsx", "maxHeight: huddleFormFields.multilineHeight"],
      ["src/screens/NativeSocialScreen.tsx", "maxHeight: SOCIAL_COMPOSER_TEXTAREA_HEIGHT"],
    ] as const;

    required.forEach(([relativePath, marker]) => {
      expect(fs.readFileSync(path.join(appRoot, relativePath), "utf8")).toContain(marker);
    });
  });

  it("bounds untrusted compact read-only values after editing", () => {
    const required = [
      ["src/screens/NativeSignupScreen.tsx", '<Text ellipsizeMode="middle" numberOfLines={1} style={[styles.emailFooterSeparator, styles.emailFooterAddress]}>{normalizedEmail}</Text>'],
      ["src/screens/NativeChatsScreen.tsx", '<Text ellipsizeMode="tail" numberOfLines={1} style={styles.locationSuggestionPrimary}>{suggestion.district || suggestion.label}</Text>'],
      ["src/screens/NativeCarerProfileScreen.tsx", '<Text ellipsizeMode="tail" numberOfLines={1} style={styles.suggestionPrimary}>{item.district || item.label}</Text>'],
      ["src/screens/NativeServiceChatScreen.tsx", '<Text ellipsizeMode="tail" numberOfLines={1} style={styles.locationSuggestionPrimary}>{suggestion.district || suggestion.label}</Text>'],
      ["src/screens/NativeServiceChatScreen.tsx", '<Text ellipsizeMode="tail" numberOfLines={1} style={styles.locationSuggestionMeta}>{suggestion.label}</Text>'],
      ["src/components/NativeSettingsDrawer.tsx", '<Text ellipsizeMode="tail" numberOfLines={1} style={styles.familyMemberRole}>@{result.social_id}</Text>'],
      ["src/components/profile/NativeProfileVitals.tsx", '<Text ellipsizeMode="tail" numberOfLines={1} style={styles.socialId}>@{intro.socialId}</Text>'],
      ["src/components/NativePetDetailsContent.tsx", '<ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.bodyTextScroll}><Text style={styles.bodyText}>{pet.bio}</Text></ScrollView>'],
      ["src/components/NativePetDetailsContent.tsx", '<ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.bodyTextScroll}><Text style={styles.bodyText}>{routine}</Text></ScrollView>'],
      ["src/components/NativePetDetailsContent.tsx", '<ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.bodyTextScroll}><Text style={styles.bodyText}>{pet.vet_contact}</Text></ScrollView>'],
    ] as const;

    required.forEach(([relativePath, marker]) => {
      const source = fs.readFileSync(path.join(appRoot, relativePath), "utf8");
      expect(source, relativePath).toContain(marker);
    });

    const chats = fs.readFileSync(path.join(appRoot, "src/screens/NativeChatsScreen.tsx"), "utf8");
    const service = fs.readFileSync(path.join(appRoot, "src/screens/NativeServiceChatScreen.tsx"), "utf8");
    expect(chats.match(/<Text ellipsizeMode="tail" numberOfLines=\{1\} style=\{styles\.locationSuggestionPrimary\}>\{suggestion\.district \|\| suggestion\.label\}<\/Text>/g)).toHaveLength(2);
    expect(service.match(/<Text ellipsizeMode="tail" numberOfLines=\{1\} style=\{styles\.locationSuggestionPrimary\}>\{suggestion\.district \|\| suggestion\.label\}<\/Text>/g)).toHaveLength(2);
    expect(service.match(/<Text ellipsizeMode="tail" numberOfLines=\{1\} style=\{styles\.locationSuggestionPrimary\}>Use "\{locationArea\.trim\(\)\}"<\/Text>/g)).toHaveLength(2);

    const photoPlate = fs.readFileSync(path.join(appRoot, "src/components/profile/NativeProfilePhotoPlate.tsx"), "utf8");
    const heroPicker = fs.readFileSync(path.join(appRoot, "src/components/NativeHeroPhotoPicker.tsx"), "utf8");
    const photoSlot = fs.readFileSync(path.join(appRoot, "src/components/profile/NativeProfilePhotoSlot.tsx"), "utf8");
    expect(photoPlate).toContain('<Text ellipsizeMode="tail" numberOfLines={2} style={styles.caption}>{caption}</Text>');
    expect(heroPicker).toContain('<Text ellipsizeMode="tail" numberOfLines={1} style={styles.badgeText}>{badgeLabel}</Text>');
    expect(heroPicker).toContain('<Text ellipsizeMode="tail" numberOfLines={2} style={styles.emptyHelper}>{emptyHelper}</Text>');
    expect(photoSlot).toContain('<Text ellipsizeMode="tail" numberOfLines={2} style={styles.emptyHelper}>{brief.helper}</Text>');
  // Whole-tree TextInput sweep: 9s+ even on an idle machine.
  }, 30_000);
});
