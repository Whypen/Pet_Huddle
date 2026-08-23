/**
 * Share-sheet payload rules, deliberately free of any react-native import.
 *
 * `react-native` ships Flow-typed source that the test runner cannot parse, so
 * the decisions that need proving live here and the IO lives in
 * `nativeShareSheet.ts`. Pure in, pure out.
 *
 * THE LINK APPEARS EXACTLY ONCE
 * `Share.share` on iOS appends `url` to the body itself, so passing the link in
 * both `message` and `url` pasted it twice — the duplicate seen in WhatsApp.
 * Attaching a file changes that: nothing is appended any more, so the link has
 * to travel in the body or it is lost.
 */

export type NativeShareSheetInput = {
  /** The human sentence. Never contains the URL — this module adds it. */
  text: string;
  /** Canonical https link that unfurls into a preview card. */
  url: string;
  /** Optional remote image, only used when `attachImage` opts in. */
  imageUrl?: string | null;
  /**
   * Opt in to attaching the image as a file. Off by default: it trades
   * WhatsApp's rich link card for a photo-with-caption, and the link is what
   * converts a recipient who does not have the app yet.
   */
  attachImage?: boolean;
  title?: string | null;
};

export type NativeShareSheetPayload = {
  /** Present when the OS share sheet gets a file attachment. */
  fileUri: string | null;
  message: string;
  title: string;
  url: string;
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

/**
 * Pure payload rules, kept separate from the IO so they can be tested.
 *
 * `platform` and `hasFile` are parameters rather than reads of the ambient
 * environment for the same reason.
 */
export const buildNativeShareSheetPayload = (
  input: NativeShareSheetInput,
  options: { platform: "ios" | "android"; fileUri: string | null },
): NativeShareSheetPayload => {
  const text = String(input.text || "").trim();
  const url = String(input.url || "").trim();
  const title = String(input.title || "").trim() || "huddle";

  // With a file attached the sheet no longer appends anything of its own, so
  // the link has to travel in the body or it is lost. Without one, iOS appends
  // `url` itself and repeating it in the body is the duplicate-link bug.
  const linkBelongsInBody = Boolean(options.fileUri) || options.platform === "android";

  const message = linkBelongsInBody
    ? [text, url].filter(Boolean).join("\n")
    : text;

  return { fileUri: options.fileUri, message, title, url };
};
