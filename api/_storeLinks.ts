/** Store identities shared by download and public-share entry points.
 * These are launch destinations; store publication is controlled in each console.
 * Overrides allow a store URL to change without splitting the entry points.
 */
function storeUrl(value: string | undefined, fallback: string, host: string): string {
  try {
    const url = new URL((value || "").trim());
    if (url.protocol === "https:" && url.hostname === host && !url.username && !url.password) {
      return url.href;
    }
  } catch { /* Missing or invalid configuration uses the registered listing. */ }
  return fallback;
}

export function getStoreLinks() {
  return {
    ios: storeUrl(process.env.HUDDLE_IOS_DOWNLOAD_URL,
      "https://apps.apple.com/app/id6766207079", "apps.apple.com"),
    android: storeUrl(process.env.HUDDLE_ANDROID_DOWNLOAD_URL,
      "https://play.google.com/store/apps/details?id=pet.huddle", "play.google.com"),
  };
}
