const ENABLE_TEST_INBOX_LAUNCHER =
  String(import.meta.env.VITE_TEST_EMAIL_INBOX_LAUNCHER || "").toLowerCase() === "true";

const WEB_INBOX_SCHEMES = [
  "message://",
  "googlegmail://",
  "ms-outlook://inbox",
  "readdle-spark://",
] as const;

export type EmailInboxLaunchResult = {
  enabled: boolean;
  launched: boolean;
  attemptedSchemes: string[];
  reason: "disabled" | "launched" | "not_confirmed";
};

export const isEmailInboxLauncherEnabled = (): boolean => ENABLE_TEST_INBOX_LAUNCHER;

export const launchEmailInboxBestEffort = async (): Promise<EmailInboxLaunchResult> => {
  if (!ENABLE_TEST_INBOX_LAUNCHER || typeof document === "undefined" || typeof window === "undefined") {
    return {
      enabled: ENABLE_TEST_INBOX_LAUNCHER,
      launched: false,
      attemptedSchemes: [],
      reason: "disabled",
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
    for (const scheme of WEB_INBOX_SCHEMES) {
      if (launched) break;
      attemptedSchemes.push(scheme);
      const frame = document.createElement("iframe");
      frame.style.display = "none";
      frame.setAttribute("aria-hidden", "true");
      frame.src = scheme;
      document.body.appendChild(frame);
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      frame.remove();
    }
    // Fail fast to manual-open guidance if web launch can't be confirmed quickly.
    await new Promise<void>((resolve) => setTimeout(resolve, 220));
  } finally {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
  }

  return {
    enabled: true,
    launched,
    attemptedSchemes,
    reason: launched ? "launched" : "not_confirmed",
  };
};
