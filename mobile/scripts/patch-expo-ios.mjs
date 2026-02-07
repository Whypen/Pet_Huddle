#!/usr/bin/env node
/**
 * Fixes iOS build scripts that break when the repo path contains spaces.
 *
 * Why: Expo/React Native CocoaPods script phases may embed unquoted paths into `bash -c`,
 * causing failures like: `bash: /Users/.../Huddle: No such file or directory`.
 *
 * This script is run in `postinstall` to keep CI and fresh installs consistent.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

const repoRoot = process.cwd();
const isDarwin = process.platform === "darwin";

const readText = (p) => fs.readFileSync(p, "utf8");
const writeText = (p, s) => fs.writeFileSync(p, s, "utf8");

const safeReplace = (p, from, to) => {
  const before = readText(p);
  if (!before.includes(from)) return { changed: false, reason: "pattern_not_found" };
  const after = before.replace(from, to);
  if (after === before) return { changed: false, reason: "no_op" };
  writeText(p, after);
  return { changed: true };
};

const patchExpoConstants = () => {
  // expo-constants is nested under expo's node_modules in this project structure.
  const expoPkg = require.resolve("expo/package.json", { paths: [repoRoot] });
  const expoDir = path.dirname(expoPkg);
  const expoConstantsDir = path.join(expoDir, "node_modules", "expo-constants");

  const constantsScript = path.join(expoConstantsDir, "scripts", "get-app-config-ios.sh");
  const constantsPodspec = path.join(expoConstantsDir, "ios", "EXConstants.podspec");

  if (!fs.existsSync(constantsScript) || !fs.existsSync(constantsPodspec)) {
    // If expo changes layout, skip instead of failing install.
    return { ok: false, skipped: true, reason: "expo_constants_not_found" };
  }

  // 1) Quote basename arg.
  {
    const res = safeReplace(
      constantsScript,
      "PROJECT_DIR_BASENAME=$(basename $PROJECT_DIR)",
      "PROJECT_DIR_BASENAME=$(basename \"$PROJECT_DIR\")",
    );
    // It's fine if upstream already fixed it.
    void res;
  }

  // 2) Ensure BUNDLE_FORMAT default exists.
  {
    const before = readText(constantsScript);
    if (!before.includes('BUNDLE_FORMAT="${BUNDLE_FORMAT:-shallow}"')) {
      const anchor = 'EXPO_CONSTANTS_PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"';
      if (before.includes(anchor)) {
        // Use plain strings (not template literals) because the shell snippet includes `${...}`,
        // which would be parsed as JS template interpolation.
        const injected = [
          anchor,
          "# Xcode does not always provide BUNDLE_FORMAT for this build phase.",
          "# Default to the standard shallow bundle layout used by CocoaPods resource bundles.",
          'BUNDLE_FORMAT="${BUNDLE_FORMAT:-shallow}"',
        ].join("\n");
        writeText(constantsScript, before.replace(anchor, injected));
      }
    }
  }

  // 3) Ensure RESOURCE_DEST dir is created for shallow and deep.
  {
    const before = readText(constantsScript);
    if (!before.includes('mkdir -p "$RESOURCE_DEST"')) {
      // Place it right after the if/elif/else bundle format block.
      const needle = '  exit 1\nfi\n\n"${EXPO_CONSTANTS_PACKAGE_DIR}/scripts/with-node.sh"';
      if (before.includes(needle)) {
        writeText(
          constantsScript,
          before.replace(
            needle,
            // Keep this as a plain string to avoid `${...}` interpolation.
            "  exit 1\nfi\n\nmkdir -p \"$RESOURCE_DEST\"\n\n\"${EXPO_CONSTANTS_PACKAGE_DIR}/scripts/with-node.sh\"",
          ),
        );
      }
    }
  }

  // 4) Quote script path inside bash -c in the podspec so spaces in project path don't break execution.
  {
    const from =
      ':script => "bash -l -c \\"#{env_vars}$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\"",';
    const to =
      ":script => \"bash -l -c \\\"#{env_vars}\\\\\\\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\\\\\\"\\\"\",";
    const res = safeReplace(constantsPodspec, from, to);
    void res;
  }

  return { ok: true, skipped: false };
};

const patchPbxproj = () => {
  const pbxproj = path.join(repoRoot, "ios", "mobile.xcodeproj", "project.pbxproj");
  if (!fs.existsSync(pbxproj)) return { ok: false, skipped: true, reason: "pbxproj_not_found" };

  // Replace the problematic backtick form with a quoted path + explicit bash.
  const from =
    '`"$NODE_BINARY" --print "require(\\\'path\\\').dirname(require.resolve(\\\'react-native/package.json\\\')) + \\\'/scripts/react-native-xcode.sh\\\'"`';
  const to =
    "RN_SCRIPT_PATH=\"$(\"$NODE_BINARY\" --print \"require(\\'path\\').dirname(require.resolve(\\'react-native/package.json\\')) + '/scripts/react-native-xcode.sh'\")\"\\n\\nbash \"$RN_SCRIPT_PATH\"";

  const before = readText(pbxproj);
  if (!before.includes(from)) {
    // If upstream or previous runs already fixed it, do not fail installs.
    return { ok: true, skipped: true, reason: "already_patched_or_unmatched" };
  }
  const after = before.replace(from, to);
  writeText(pbxproj, after);
  return { ok: true, skipped: false };
};

const main = () => {
  // Only relevant on macOS for iOS builds.
  if (!isDarwin) {
    process.exit(0);
  }

  const results = [];
  results.push({ step: "expo-constants", ...patchExpoConstants() });
  results.push({ step: "pbxproj", ...patchPbxproj() });

  // Keep output minimal but useful in CI logs.
  const failures = results.filter((r) => r.ok === false && !r.skipped);
  if (failures.length) {
    console.error("[patch-expo-ios] failed:", failures);
    process.exit(1);
  }
};

main();
