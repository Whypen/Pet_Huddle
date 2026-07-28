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
  "/reset-password-direct",
  "/reset-password-inline",
  "/reset-password-inline-healthaction",
  "/update-password",
  "/auth/callback",
  "/signup/dob",
  "/signup/name",
  "/signupname",
  "/signup/credentials",
  "/signup/verify",
  "/signup/email-confirmation",
  "/signup/verify-email",
  "/turnstile-health",
  "/turnstile-health-resetaction",
  "/verify",
  "/join/:code",

  // ── Core (protected) ────────────────────────────────────────
  "/",
  "/social",
  "/threads",
  "/chats",
  "/chat-dialogue",
  "/service-chat",
  "/map",
  "/notifications",
  "/marketplace",
  "/service",

  // ── Profile ─────────────────────────────────────────────────
  "/edit-profile",
  "/edit-pet-profile",
  "/pet-details",
  "/set-profile",
  "/set-pet",

  // ── Settings & Subscription ──────────────────────────────────
  "/settings",
  "/settings/security",
  "/subscription",       // → wired to /premium as legacy alias
  "/premium",
  "/manage-subscription", // → wired to /premium as legacy alias
  "/verify-identity",
  "/carerprofile",

  // ── Legal ───────────────────────────────────────────────────
  "/privacy",
  "/terms",
  "/privacy-choices",
  "/cookies",
  "/community-guidelines",
  "/service-agreement",
  "/service-provider-agreement",
  "/booking-terms",
  "/support",

  // ── Admin ───────────────────────────────────────────────────
  "/admin",
  "/admin/growth",
  "/admin/safety",
  "/admin/support",
  "/admin/control-center",

  // ── Catch-all ───────────────────────────────────────────────
  "*",
] as const;

/** Type alias for route path string. */
export type RoutePath = typeof ROUTE_MANIFEST[number];

export const NATIVE_SHELL_ONLY_ROUTE_MANIFEST = [] as const;

export type NativeShellOnlyRoutePath = typeof NATIVE_SHELL_ONLY_ROUTE_MANIFEST[number];
export type NativeChromeRoutePath = RoutePath | NativeShellOnlyRoutePath;

export type NativeChromeRouteConfig = {
  title: string | null;
  header: "global" | "page" | null;
  nativeContentOnly: boolean;
  nativeBottomNav: boolean;
  activeTab: "home" | "social" | "chats" | "service" | "map" | null;
  suppressWebHeader: boolean;
  suppressWebBottomNav: boolean;
  signedOutAccess?: boolean;
  ownership:
    | "web-backed-native-chrome"
    | "native-content"
    | "native-summary-web-edit-handoff";
  notes: string;
};

/**
 * Phase 4 approved native-chrome routes.
 *
 * This is intentionally smaller than ROUTE_MANIFEST. Only routes with real
 * native runtime proof may be listed here. This object is the single source of
 * truth for `/app` native shell route ownership; `/app` imports it directly.
 *
 * `nativeContentOnly` is fail-closed: set it to true only when `/app` renders
 * real native content for the route and hides the WebView. Web-owned pages with
 * native chrome must stay false so the web route remains the content owner.
 *
 * `/settings` is native-owned for account summary, notification preference
 * writes, profile privacy toggles, push preference/device registration path,
 * logout, account deletion, and password change through current-password
 * verification plus the Turnstile-backed `auth-change-password` flow.
 * `/settings/security` now owns the current TOTP MFA behavior plus Biometric
 * Sign In UI/status for existing passkey factors. Passkey setup/sign-in remains
 * blocked until native has a WebAuthn/passkey credential bridge.
 */
export const NATIVE_CHROME_ROUTE_MANIFEST = {
  "/": {
    title: null,
    header: "global",
    nativeContentOnly: true,
    nativeBottomNav: true,
    activeTab: "home",
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    notes: "Native Home owns the bounded read-only slice: profile/tier summary, selected pet summary, reminders summary, pet-details handoff, and pet-profile edit/add handoffs. Full Home parity, pet mutations, reminder mutations, and heavy realtime remain deferred.",
  },
  "/social": {
    title: null,
    header: "global",
    nativeContentOnly: true,
    nativeBottomNav: true,
    activeTab: "social",
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    notes: "Native Social owns feed/cards, focused thread params, composer, comments/replies, support mutations, edit/delete, report/block, profile/share overlays, image upload, video upload authorization/finalize flow, save/pin, refresh/pagination, filters/search/sort, external links, and feed analytics events. Runtime proof remains required after the code-parity gate.",
  },
  "/chats": {
    title: null,
    header: "global",
    nativeContentOnly: true,
    nativeBottomNav: true,
    activeTab: "chats",
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    notes: "Native Chats owns inbox/group/service list shell. Route-scoped app rollback flag EXPO_PUBLIC_ENABLE_NATIVE_CHATS=false reverts to WebView without DB rollback. Direct chat dialogue and service chat remain route handoffs.",
  },
  "/chat-dialogue": {
    title: null,
    header: null,
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: "chats",
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    notes: "Native Chat Dialogue owns direct and group conversation runtime for room, with, and name params. Service chat, payment, booking, and request flows remain explicit web handoffs. Route-scoped app rollback flag EXPO_PUBLIC_ENABLE_NATIVE_CHAT_DIALOGUE=false reverts to WebView without DB rollback.",
  },
  "/service": {
    title: null,
    header: "global",
    nativeContentOnly: true,
    nativeBottomNav: true,
    activeTab: "service",
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    notes: "Native Service owns browse/list/search/filter/sort/provider cards/bookmarks/provider summary detail. Service chat, booking, payment, dispute, and review flows remain explicit web handoffs.",
  },
  "/map": {
    title: null,
    header: "global",
    nativeContentOnly: true,
    nativeBottomNav: true,
    activeTab: "map",
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    notes: "Native Map owns map shell, markers, pin/privacy mutations, broadcast create/edit/media, alert detail/report/share/support, and notification alert focus. Native app shell still keeps the map feature kill switch so disabling the native map flag can force web fallback.",
  },
  "/notifications": {
    title: "Notifications",
    header: "page",
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: null,
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    notes: "Native notifications screen hides the WebView.",
  },
  "/pet-details": {
    title: "Pet details",
    header: "page",
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: null,
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    notes: "Native pet details screen hides the WebView.",
  },
  "/edit-pet-profile": {
    title: null,
    header: null,
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: null,
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    notes: "Native edit-pet-profile owns add/edit pet fields, pet fetch/update, photo upload, and Home return. Exact web control parity for phone/date primitives remains dependency-limited.",
  },
  "/edit-profile": {
    title: null,
    header: null,
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: null,
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    notes: "Native edit-profile bridge owns the shared native profile form, view preview through NativePublicProfileContent, profile photo slots, phone OTP, OS location fill, draft save, and full profile save. Runtime mutation proof remains required before release-complete status.",
  },
  "/set-profile": {
    title: null,
    header: null,
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: null,
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    notes: "Native set-profile bridge owns onboarding profile setup using the same shared native profile form as edit-profile. Completion routes to /set-pet only when the user toggles currently owns pets; otherwise it routes Home. Runtime onboarding guard proof remains required.",
  },
  "/set-pet": {
    title: null,
    header: null,
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: null,
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    notes: "Native set-pet onboarding owns pet creation/draft save, photo upload, pet health fields, onboarding completion, and Home return.",
  },
  "/carerprofile": {
    title: null,
    header: null,
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: null,
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    notes: "Phase 1 native carer profile owns shared view content, non-wallet editor fields, pet_care_profiles load/save/silent-save, realtime wallet state display, agreement gate, and listing safety. Stripe Connect onboarding remains Phase 2 and is not claimed native yet.",
  },
  "/settings": {
    title: null,
    header: "global",
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: null,
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    notes: "Native settings owns summary, notification preferences, profile privacy toggles, push preference/device registration path, logout, account deletion, and password change through current-password verification plus Turnstile-backed auth-change-password. Physical push delivery still requires device proof.",
  },
  "/settings/security": {
    title: "Security",
    header: "page",
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: null,
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    notes: "Native security settings owns current TOTP authenticator app MFA behavior, password change entry/flow, and Biometric Sign In UI/status for existing passkey factors. Passkey setup/sign-in remains blocked until native has a WebAuthn/passkey credential bridge.",
  },
  "/verify-identity": {
    title: null,
    header: null,
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: null,
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    notes: "Native Verify Identity owns the default app route for phone OTP, human liveness shell, Stripe card SetupIntent entry, invisible device fingerprint, backend status refresh, signup handoff, settings entry, and support path. Emergency web fallback remains explicit through native_fallback=1 or native_verify_identity_fallback=1.",
  },
  "/premium": {
    title: null,
    header: "global",
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: null,
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    notes: "Native membership overview hides the WebView.",
  },
  "/privacy-choices": {
    title: "Your Privacy Choices",
    header: "page",
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: null,
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    signedOutAccess: true,
    notes: "Native privacy choices legal content hides the WebView; native content key is /nativeprivacychoices.",
  },
  "/privacy": {
    title: "Privacy Policy",
    header: "page",
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: null,
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    signedOutAccess: true,
    notes: "Native legal content hides the WebView.",
  },
  "/terms": {
    title: "Terms of Service",
    header: "page",
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: null,
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    signedOutAccess: true,
    notes: "Native legal content hides the WebView.",
  },
  "/cookies": {
    title: "Cookies Notice",
    header: "page",
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: null,
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    signedOutAccess: true,
    notes: "Native legal content hides the WebView.",
  },
  "/community-guidelines": {
    title: "Community Guidelines",
    header: "page",
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: null,
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    signedOutAccess: true,
    notes: "Native legal content hides the WebView.",
  },
  "/service-provider-agreement": {
    title: "Provider Agreement",
    header: "page",
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: null,
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    signedOutAccess: true,
    notes: "Native legal content hides the WebView.",
  },
  "/booking-terms": {
    title: "Booking Terms",
    header: "page",
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: null,
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    signedOutAccess: true,
    notes: "Native legal content hides the WebView.",
  },
  "/support": {
    title: "Help & Support",
    header: "page",
    nativeContentOnly: true,
    nativeBottomNav: false,
    activeTab: null,
    suppressWebHeader: true,
    suppressWebBottomNav: true,
    ownership: "native-content",
    signedOutAccess: true,
    notes: "Native support form with Turnstile hides the WebView; web route remains standalone browser fallback.",
  },
} as const satisfies Partial<Record<NativeChromeRoutePath, NativeChromeRouteConfig>>;

export const NATIVE_CHROME_APPROVED_ROUTE_MANIFEST = Object.keys(
  NATIVE_CHROME_ROUTE_MANIFEST,
) as Array<keyof typeof NATIVE_CHROME_ROUTE_MANIFEST>;

export type NativeChromeApprovedRoutePath = typeof NATIVE_CHROME_APPROVED_ROUTE_MANIFEST[number];

export const nativeChromeRouteAllowsSignedOutAccess = (path: NativeChromeApprovedRoutePath) => {
  const route = NATIVE_CHROME_ROUTE_MANIFEST[path] as NativeChromeRouteConfig | undefined;
  return route?.nativeContentOnly === true && route.signedOutAccess === true;
};
