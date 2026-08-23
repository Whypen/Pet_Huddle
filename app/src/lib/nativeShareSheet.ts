import { NativeModules, Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { buildNativeShareSheetPayload, type NativeShareSheetInput } from "./nativeShareSheetPayload";

export { buildNativeShareSheetPayload } from "./nativeShareSheetPayload";
export type { NativeShareSheetInput, NativeShareSheetPayload } from "./nativeShareSheetPayload";

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

/**
 * ONE share sheet for Social posts and Map alerts.
 *
 * WHY AN IMAGE IS ATTACHED
 * The OS decides which apps appear by the TYPE of the activity items handed to
 * it. A URL-only share lists only extensions that declare they accept URLs —
 * which is why the sheet showed WhatsApp and Messenger and nothing else. TikTok
 * and Instagram's extensions accept images and video, never URLs, so they can
 * only appear once a real image is attached.
 *
 * Instagram Stories still cannot appear: it is not a share extension at all but
 * a private `instagram-stories://` URL scheme, and no activity item summons it.
 *
 * THE LINK APPEARS EXACTLY ONCE
 * `Share.share` on iOS appends `url` to the body itself, so passing the link in
 * both `message` and `url` pasted it twice — the duplicate seen in WhatsApp.
 * The payload builder below owns that rule in one place so no call site has to
 * remember it.
 */

/**
 * Materialise a remote image as a local file, because the OS share sheet cannot
 * attach an https URL as an image — it needs bytes on disk.
 *
 * Best effort by design: a failed download simply means a link-only share,
 * which is the behaviour that shipped before. It must never block the sheet.
 */
export const cacheRemoteShareImage = async (imageUrl?: string | null): Promise<string | null> => {
  const remote = String(imageUrl || "").trim();
  if (!remote || !isHttpUrl(remote)) return null;
  try {
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) return null;
    const extension = /\.png(\?|$)/i.test(remote) ? "png" : "jpg";
    const target = `${cacheDir}huddle-share-${Date.now()}.${extension}`;
    const result = await FileSystem.downloadAsync(remote, target);
    return result?.uri || null;
  } catch {
    return null;
  }
};

/**
 * LINK-ONLY BY DESIGN.
 *
 * Attaching an image widens the OS share sheet to the image-only socials
 * (TikTok, Instagram), but it costs the thing that matters more: WhatsApp then
 * receives a photo with a caption instead of a link with a preview card. A
 * recipient of an external share most likely does NOT have huddle installed, so
 * the link is the entire path from "what is this" to "I have the app" — and a
 * caption is not a tap target.
 *
 * Image sharing is a separate, deliberate action (`NativeShareCardModal`), not
 * the default for sharing a post or an alert. `cacheRemoteShareImage` and the
 * file branch below stay in place for that caller.
 */
export const openNativeShareSheet = async (input: NativeShareSheetInput): Promise<void> => {
  const fileUri = input.attachImage === true ? await cacheRemoteShareImage(input.imageUrl) : null;
  const platform = Platform.OS === "ios" ? "ios" : "android";
  const payload = buildNativeShareSheetPayload(input, { fileUri, platform });

  // The optional native package is loaded only after confirming this installed
  // binary contains it: a Metro update must never make an older native shell
  // fail at boot. Same guard as the share-card modal.
  if (payload.fileUri && NativeModules.RNShare) {
    try {
      const { default: nativeShare } = await import("react-native-share") as {
        default: {
          open: (options: {
            failOnCancel: boolean;
            message: string;
            title: string;
            type: string;
            urls: string[];
          }) => Promise<unknown>;
        };
      };
      await nativeShare.open({
        failOnCancel: false,
        message: payload.message,
        title: payload.title,
        type: /\.png$/i.test(payload.fileUri) ? "image/png" : "image/jpeg",
        urls: [payload.fileUri],
      });
      return;
    } catch {
      // Fall through to the platform sheet rather than losing the share.
    }
  }

  await Share.share({
    message: payload.message,
    title: payload.title,
    url: payload.url,
  });
};
