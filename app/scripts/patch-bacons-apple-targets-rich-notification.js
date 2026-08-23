const fs = require("fs");
const path = require("path");

const appleTargetsBuildPath = path.join(__dirname, "..", "node_modules", "@bacons", "apple-targets", "build");
const targetPath = path.join(appleTargetsBuildPath, "target.js");

if (!fs.existsSync(targetPath)) {
  console.warn("[huddle rich push] @bacons/apple-targets target.js not found; skipping patch.");
  process.exit(0);
}

// @bacons/apple-targets imports an Expo CLI implementation detail without
// declaring it as a runtime dependency. Resolve the version owned by Expo CLI
// instead of installing Expo's internal package directly in the application.
const resolverPath = path.join(appleTargetsBuildPath, "resolve-expo-asset-contents.js");
const resolverSource = `const path = require("path");

const expoDirectory = path.dirname(require.resolve("expo/package.json"));
const cliDirectory = path.dirname(require.resolve("@expo/cli/package.json", { paths: [expoDirectory] }));
const assetContentsPath = require.resolve(
  "@expo/prebuild-config/build/plugins/icons/AssetContents",
  { paths: [cliDirectory] },
);

module.exports = require(assetContentsPath);
`;
fs.writeFileSync(resolverPath, resolverSource);

for (const relativePath of ["icon/with-image-asset.js", "icon/with-ios-icon.js"]) {
  const iconPath = path.join(appleTargetsBuildPath, relativePath);
  if (!fs.existsSync(iconPath)) {
    console.error(`[huddle rich push] Missing @bacons/apple-targets file: ${relativePath}`);
    process.exit(1);
  }
  const iconSource = fs.readFileSync(iconPath, "utf8");
  const originalImport = 'require("@expo/prebuild-config/build/plugins/icons/AssetContents")';
  const patchedImport = 'require("../resolve-expo-asset-contents")';
  if (iconSource.includes(originalImport)) {
    fs.writeFileSync(iconPath, iconSource.replaceAll(originalImport, patchedImport));
  } else if (!iconSource.includes(patchedImport)) {
    console.error(`[huddle rich push] Unexpected Expo asset import in ${relativePath}`);
    process.exit(1);
  }
}
console.log("[huddle rich push] Wired @bacons/apple-targets to Expo CLI's prebuild configuration.");

const source = fs.readFileSync(targetPath, "utf8");
const original = /        case "notification-service":\n            return \{\n                NSExtension: \{\n                    NSExtensionAttributes: \{\n                        NSExtensionActivationRule: "TRUEPREDICATE",\n                    \},\n(?<principal>(?:                    \/\/ TODO: Update `NotificationService` dynamically\n)?                    NSExtensionPrincipalClass: "\$\(PRODUCT_MODULE_NAME\)\.NotificationService",\n                    \/\/ NSExtensionMainStoryboard: 'MainInterface',\n                    NSExtensionPointIdentifier,\n)                \},\n            \};/;
const replacement = `        case "notification-service":
            return {
                NSExtension: {
$<principal>                },
            };`;
const patchedShape = `        case "notification-service":
            return {
                NSExtension: {
                    // TODO: Update \`NotificationService\` dynamically
                    NSExtensionPrincipalClass: "$(PRODUCT_MODULE_NAME).NotificationService",
                    // NSExtensionMainStoryboard: 'MainInterface',
                    NSExtensionPointIdentifier,
                },
            };`;
const patchedShapeWithoutTodo = `        case "notification-service":
            return {
                NSExtension: {
                    NSExtensionPrincipalClass: "$(PRODUCT_MODULE_NAME).NotificationService",
                    // NSExtensionMainStoryboard: 'MainInterface',
                    NSExtensionPointIdentifier,
                },
            };`;

if (source.includes(patchedShape) || source.includes(patchedShapeWithoutTodo)) {
  console.log("[huddle rich push] @bacons/apple-targets notification-service plist patch already applied.");
} else if (!original.test(source)) {
  console.error("[huddle rich push] @bacons/apple-targets notification-service plist shape changed.");
  console.error("[huddle rich push] Refusing to continue because TRUEPREDICATE may reappear in the rich notification extension.");
  process.exit(1);
} else {
  fs.writeFileSync(targetPath, source.replace(original, replacement));
  console.log("[huddle rich push] Removed TRUEPREDICATE from @bacons/apple-targets notification-service plist template.");
}
