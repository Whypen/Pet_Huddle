const WEB_TEST_INBOX_LAUNCH_ENABLED =
  String(import.meta.env.VITE_ENABLE_WEB_TEST_INBOX_LAUNCHER || "").trim() === "1";

const IOS_INBOX_SCHEMES = [
  "message://",
] as const;

const ANDROID_INBOX_SCHEMES = [
  "googlegmail://co",
  "ms-outlook://mail/inbox",
] as const;

export type EmailInboxLaunchResult = {
  launched: boolean;
  attemptedSchemes: string[];
  reason: "launched" | "not_confirmed" | "disabled";
};

const getWebInboxSchemes = (): readonly string[] => {
  const ua = String(navigator.userAgent || "").toLowerCase();
  const platform = String(navigator.platform || "").toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua) || /iphone|ipad|ipod/.test(platform);
  const isAndroid = ua.includes("android");
  if (isIOS) return IOS_INBOX_SCHEMES;
  if (isAndroid) return ANDROID_INBOX_SCHEMES;
  return [];
};

export const launchEmailInboxBestEffort = async (): Promise<EmailInboxLaunchResult> => {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return {
      launched: false,
      attemptedSchemes: [],
      reason: "not_confirmed",
    };
  }
  if (!WEB_TEST_INBOX_LAUNCH_ENABLED) {
    return {
      launched: false,
      attemptedSchemes: [],
      reason: "disabled",
    };
  }

  const webSchemes = getWebInboxSchemes();
  if (!webSchemes.length) {
    return {
      launched: false,
      attemptedSchemes: [],
      reason: "not_confirmed",
    };
  }

  const attemptedSchemes: string[] = [];
  let launched = false;
  const markLaunched = () => {
    launched = true;
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") markLaunched();
  };
  const onPageHide = () => markLaunched();

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide, { once: true });

  try {
    for (const scheme of webSchemes) {
      if (launched) break;
      attemptedSchemes.push(scheme);
      const frame = document.createElement("iframe");
      frame.style.display = "none";
      frame.setAttribute("aria-hidden", "true");
      frame.src = scheme;
      document.body.appendChild(frame);
      await new Promise<void>((resolve) => setTimeout(resolve, 120));
      frame.remove();
    }
    // Fail fast to manual-open guidance if web launch can't be confirmed quickly.
    await new Promise<void>((resolve) => setTimeout(resolve, 240));
  } finally {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
  }

  return {
    launched,
    attemptedSchemes,
    reason: launched ? "launched" : "not_confirmed",
  };
};
