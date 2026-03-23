/**
 * ROUTE_MANIFEST — UI CONTRACT v6.1 MCL requirement
 *
 * Exported string array of ALL route paths registered in App.tsx.
 * Required by MCL (Minimum Compliance Layer) enforcement tools.
 *
 * ⚠️  Keep in sync with <Routes> in src/App.tsx.
 *     Add new routes here when adding to App.tsx.
 */

export const ROUTE_MANIFEST: ReadonlyArray<string> = [
  // ── Public ──────────────────────────────────────────────────
  "/auth",
  "/reset-password",
  "/auth/callback",
  "/signup/dob",
  "/signup/name",
  "/signup/credentials",
  "/signup/verify",

  // ── Core (protected) ────────────────────────────────────────
  "/",
  "/social",
  "/threads",
  "/chats",
  "/chat-dialogue",
  "/service-chat",
  "/ai-vet",
  "/map",
  "/notifications",
  "/marketplace",

  // ── Profile ─────────────────────────────────────────────────
  "/edit-profile",
  "/edit-pet-profile",
  "/pet-details",
  "/set-profile",
  "/set-pet",

  // ── Settings & Subscription ──────────────────────────────────
  "/settings",
  "/subscription",       // → redirects to /premium
  "/premium",
  "/manage-subscription", // → redirects to /premium
  "/verify-identity",

  // ── Legal ───────────────────────────────────────────────────
  "/privacy",
  "/terms",

  // ── Admin ───────────────────────────────────────────────────
  "/admin",
  "/admin/verifications",
  "/admin/control-center",

  // ── Catch-all ───────────────────────────────────────────────
  "*",
] as const;

/** Type alias for route path string. */
export type RoutePath = typeof ROUTE_MANIFEST[number];
