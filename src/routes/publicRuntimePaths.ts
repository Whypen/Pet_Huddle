const PUBLIC_EXACT_PATHS = new Set([
  "/auth",
  "/auth/callback",
  "/signupname",
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
  "/cookies",
  "/community-guidelines",
  "/collection-notice",
  "/service-agreement",
  "/service-provider-agreement",
  "/booking-terms",
  "/support",
]);

export const isPublicRuntimePath = (pathname: string) =>
  pathname.startsWith("/signup/") ||
  pathname.startsWith("/join/") ||
  PUBLIC_EXACT_PATHS.has(pathname);
