import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = fs.existsSync(path.join(process.cwd(), "app", "package.json"))
  ? path.join(process.cwd(), "app")
  : process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("native input lifecycle contract", () => {
  it("keeps shared single-line inputs and fields to one visual line", () => {
    const formField = read("src/components/NativeFormField.tsx");
    const modalPrimitives = read("src/components/nativeModalPrimitives.tsx");
    const phoneField = read("src/components/NativePhoneField.tsx");

    expect(formField).toContain("numberOfLines={props.numberOfLines ?? (multiline ? undefined : 1)}");
    expect(formField).toContain("onSubmitEditing={props.onSubmitEditing ?? (multiline ? undefined : () => Keyboard.dismiss())}");
    expect(formField).toContain('lineBreakModeIOS={props.lineBreakModeIOS ?? (multiline ? undefined : "tail")}');
    expect(formField).toContain("<Text numberOfLines={1} style={[styles.value");
    expect(modalPrimitives).toContain("numberOfLines={props.numberOfLines ?? (multiline ? undefined : 1)}");
    expect(modalPrimitives).toContain('lineBreakModeIOS={props.lineBreakModeIOS ?? (multiline ? undefined : "tail")}');
    expect(modalPrimitives).toContain("scrollEnabled={props.scrollEnabled ?? true}");
    expect(modalPrimitives).toContain("<Text numberOfLines={1} style={[nativeModalStyles.appModalSelectText");
    expect(phoneField).toContain("multiline={false}");
    expect(phoneField).toContain("numberOfLines={1}");
  });

  it("keeps compact persisted summaries single-line after editing", () => {
    const care = read("src/screens/NativeServiceChatScreen.tsx");
    const pet = read("src/screens/NativeSetPetScreen.tsx");
    const carer = read("src/screens/NativeCarerProfileScreen.tsx");

    expect(care).toContain('function ScopeDetailRow({ children, label, multiline = false }');
    expect(care).toContain('nestedScrollEnabled showsVerticalScrollIndicator style={styles.scopeDetailValueMultiline}');
    expect(care).toContain('<ScopeDetailRow label="Care Instructions" multiline>');
    expect(pet).toMatch(/<Text ellipsizeMode="tail" numberOfLines=\{1\} style=\{styles\.listTitle\}>\{medication\.name\}/);
    expect(pet).toContain("flexOne: {\n    flex: 1,\n    minWidth: 0,");
    expect(carer).toMatch(/<Text ellipsizeMode="tail" numberOfLines=\{1\} style=\{styles\.rateTitle\}>/);
    expect(carer).toContain("flex: {\n    flex: 1,\n    minWidth: 0,");
  });

  it("keeps phone fields and toggle tracks on their shared border contracts", () => {
    const phoneField = read("src/components/NativePhoneField.tsx");
    const signup = read("src/screens/NativeSignupScreen.tsx");
    const auth = read("src/screens/NativeAuthScreen.tsx");
    const security = read("src/screens/NativeSecuritySettingsScreen.tsx");
    const setPet = read("src/screens/NativeSetPetScreen.tsx");
    const chats = read("src/screens/NativeChatsScreen.tsx");
    const alertDetail = read("src/components/map/NativeAlertDetailModal.tsx");

    expect(phoneField).toContain("borderWidth: 1");
    expect(phoneField).toContain("borderColor: huddleColors.fieldBorder");
    expect(phoneField).toContain("...huddleFieldStates.focused");
    expect(phoneField).toContain("...huddleFieldStates.error");
    expect(signup).toMatch(/supportField: \{[\s\S]*?width: "100%",[\s\S]*?maxWidth: "100%",/);
    expect(signup).toMatch(/field: \{[\s\S]*?width: "100%",[\s\S]*?maxWidth: "100%",/);
    expect(auth).toMatch(/supportField: \{[\s\S]*?width: "100%",[\s\S]*?maxWidth: "100%",/);
    expect(security).toMatch(/input: \{[\s\S]*?width: "100%",[\s\S]*?maxWidth: "100%",/);

    expect(setPet).toContain("webToggleTrack: {\n    ...huddleGlassControls.toggleSurface,");
    expect(chats).toContain("nativeSwitch: { ...huddleGlassControls.toggleSurface,");
    expect(alertDetail).toContain("editVerifiedSwitchTrack: {\n    ...huddleGlassControls.toggleSurface,");
  });

  it("requires every native multiline editor to use an approved bounded scroll path", () => {
    const sourceRoot = path.join(root, "src");
    const sources: Array<{ file: string; source: string }> = [];
    const walk = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(fullPath);
        else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
          sources.push({ file: fullPath, source: fs.readFileSync(fullPath, "utf8") });
        }
      }
    };
    walk(sourceRoot);

    const boundedSources = [
      "components/NativeFormField.tsx",
      "components/nativeModalPrimitives.styles.ts",
      "components/service/NativeCareUpdateSheet.tsx",
      "components/map/NativeBroadcastModal.tsx",
      "components/map/NativeAlertDetailModal.tsx",
      "components/social/NativeSocialReplyComposerInput.tsx",
      "components/profile/NativeProfilePhotoSlot.tsx",
      "screens/NativeSetPetScreen.tsx",
      "screens/NativeCarerProfileScreen.tsx",
      "screens/NativeChatsScreen.tsx",
      "screens/NativeSocialScreen.tsx",
      "screens/NativeServiceChatScreen.tsx",
      "screens/NativeSupportScreen.tsx",
      "screens/NativeAuthScreen.tsx",
    ];
    for (const relativePath of boundedSources) {
      const source = read(`src/${relativePath}`);
      expect(source, relativePath).toMatch(/maxHeight|CAPTION_INPUT_HEIGHT|GROUP_DESCRIPTION_FIELD_MAX_HEIGHT/);
    }

    const socialSource = read("src/screens/NativeSocialScreen.tsx");
    expect(socialSource).not.toContain("replyComposerTextLayerWrap");
    expect(socialSource).toContain('placeholder="Leave a comment"');
    expect(socialSource).toContain("const SOCIAL_COMPOSER_TEXTAREA_HEIGHT = huddleType.labelLine * 4;");
    expect(socialSource).toContain("composerMentionField: {\n    height: SOCIAL_COMPOSER_TEXTAREA_HEIGHT,");
    expect(socialSource).toContain("replyComposerInputViewport: {\n    height: SOCIAL_COMPOSER_TEXTAREA_HEIGHT,");
    expect(socialSource).toContain("replyComposerInput: {\n    backgroundColor: \"transparent\",\n    color: huddleColors.text");
    expect(socialSource).toContain("scrollEnabled\n            value={displayedReplyDraft}");
    expect(read("src/components/social/NativeSocialReplyComposerInput.tsx")).toContain('placeholder={props.placeholder ?? "Leave a comment"}');

    const approvedTwoLineCaption = path.join(sourceRoot, "components/profile/NativeProfilePhotoSlot.tsx");
    const nativeTextInput = /<TextInput(?:\s*\n\s*|\s+)(?:[A-Za-z{])[\s\S]*?\/>/g;
    for (const { file, source } of sources) {
      for (const input of source.matchAll(nativeTextInput)) {
        const tag = input[0];
        const isMultiline = /\bmultiline(?=\s|\/|>)|multiline=\{true\}|multiline=\{multiline\}/.test(tag);
        if (!isMultiline) {
          // Every raw field must declare the one-line contract. This avoids a
          // platform default silently changing a compact field into wrapping text.
          expect(tag, file).toMatch(/multiline=\{false\}|numberOfLines=\{1\}|multiline=\{multiline\}/);
          expect(tag, file).toMatch(/scrollEnabled(?:=\{[^}]*\})?/);
          expect(tag, file).toContain('lineBreakModeIOS="tail"');
          continue;
        }
        if (file === approvedTwoLineCaption) {
          expect(tag).toContain("numberOfLines={CAPTION_LINES}");
          expect(tag).toContain("scrollEnabled");
          continue;
        }
        expect(tag, file).toMatch(/scrollEnabled(?:=\{[^}]*\})?/);
        expect(tag, file).not.toContain("scrollEnabled={false}");
      }
    }
  });

  it("bounds read-only multiline Care Scope content instead of expanding its surrounding layout", () => {
    const care = read("src/screens/NativeServiceChatScreen.tsx");

    expect(care).toContain('<ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.scopeDetailValueMultiline}>');
    expect(care).toContain("scopeDetailValueMultiline: { flex: 1, maxHeight: huddleFormFields.multilineHeight }");
    expect(care).toContain("scopeNoteScroll: { maxHeight: huddleFormFields.multilineHeight }");
  });
});
