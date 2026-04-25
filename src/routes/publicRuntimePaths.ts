const PUBLIC_EXACT_PATHS = new Set([
  "/auth",
  "/auth/callback",
  "/reset-password",
  "/reset-password-direct",
  "/reset-password-inline",
  "/reset-password-inline-healthaction",
  "/update-password",
  "/turnstile-health",
  "/turnstile-health-resetaction",
  "/verify",
  "/privacy",
  "/terms",
  "/privacy-choices",
  "/support",
]);

export const isPublicRuntimePath = (pathname: string) =>
  pathname.startsWith("/signup/") ||
  pathname.startsWith("/join/") ||
  PUBLIC_EXACT_PATHS.has(pathname);
