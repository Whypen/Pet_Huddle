const PUBLIC_EXACT_PATHS = new Set([
  "/auth",
  "/auth/callback",
  // "/join" (exact) is "join huddle" — the auth wall's destination.
  // "/join/:code" (prefix rule below) is "join THIS GROUP" — a different page.
  // They are distinct route patterns and do not shadow each other, but the
  // adjacency is easy to misread, so both are spelled out here on purpose.
  "/join",
  // Post-signup details page. Runs outside the guarded routes on purpose:
  // onboarding is not complete yet, so ProtectedRoute would redirect it to
  // /set-profile before it could collect anything.
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
