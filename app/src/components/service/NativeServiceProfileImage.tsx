import { Image as ExpoImage } from "expo-image";
import { type ImageStyle, StyleSheet, type StyleProp } from "react-native";
import { WebView } from "react-native-webview";
import { nativeFreshImageKey, nativeFreshImageUri } from "../../lib/nativeImageFreshness";
import { huddleImageDefaults } from "../../theme/huddleDesignTokens";

type NativeServiceProfileImageProps = {
  accessibilityIgnoresInvertColors?: boolean;
  onError?: () => void;
  resizeMode?: "cover" | "contain";
  style: StyleProp<ImageStyle>;
  uri: string;
  version?: string | number | null;
};

const isSvgUri = (uri: string) => {
  const value = uri.trim().toLowerCase();
  if (value.startsWith("data:image/svg+xml")) return true;
  try {
    return new URL(uri).pathname.toLowerCase().endsWith(".svg");
  } catch {
    return value.includes(".svg");
  }
};

const escapeHtmlAttribute = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const svgHtml = (uri: string, resizeMode: "cover" | "contain") => `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
      img { width: 100%; height: 100%; object-fit: ${resizeMode}; display: block; }
    </style>
  </head>
  <body>
    <img src="${escapeHtmlAttribute(uri)}" onerror="window.ReactNativeWebView.postMessage('error')" />
  </body>
</html>`;

export function NativeServiceProfileImage({
  accessibilityIgnoresInvertColors,
  onError,
  resizeMode = "cover",
  style,
  uri,
  version,
}: NativeServiceProfileImageProps) {
  if (isSvgUri(uri)) {
    return (
      <WebView
        accessibilityIgnoresInvertColors={accessibilityIgnoresInvertColors}
        containerStyle={style}
        javaScriptEnabled
        onError={onError}
        onHttpError={onError}
        onMessage={(event) => {
          if (event.nativeEvent.data === "error") onError?.();
        }}
        originWhitelist={["*"]}
        scrollEnabled={false}
        source={{ html: svgHtml(uri, resizeMode), baseUrl: uri }}
        style={styles.webImage}
      />
    );
  }

  return (
    <ExpoImage
      accessibilityIgnoresInvertColors={accessibilityIgnoresInvertColors}
      onError={onError}
      contentFit={resizeMode}
      cachePolicy={huddleImageDefaults.cachePolicy}
      key={nativeFreshImageKey(uri, version || uri)}
      transition={huddleImageDefaults.transition}
      source={{ uri: nativeFreshImageUri(uri, version || uri) }}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  webImage: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
