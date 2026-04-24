import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, type ComponentType } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { SignupProvider } from "@/contexts/SignupContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { NetworkProvider } from "@/contexts/NetworkContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PublicRoute } from "@/components/auth/PublicRoute";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { OfflineBanner } from "@/components/network/OfflineBanner";
import { BottomNav } from "@/components/layout/BottomNav";
import { AppShell } from "@/components/layout/AppShell";
import { Loader2 } from "lucide-react";
import Index from "./pages/Index";
import { ScrollToTop } from "@/components/routing/ScrollToTop";
import { UpsellBannerProvider } from "@/contexts/UpsellBannerContext";
import { AppBackground } from "@/components/ui/AppBackground";
import { NativeRuntimeBridge } from "@/components/native/NativeRuntimeBridge";

const CHUNK_RETRY_FLAG_PREFIX = "huddle:lazy-reload:";
const forceReloadToLatestBundle = (key: string) => {
  const flagKey = `${CHUNK_RETRY_FLAG_PREFIX}${key}`;
  const retried = sessionStorage.getItem(flagKey) === "1";
  if (retried) return false;
  sessionStorage.setItem(flagKey, "1");
  const url = new URL(window.location.href);
  url.searchParams.set("__chunk_recover", String(Date.now()));
  window.location.replace(url.toString());
  return true;
};
const lazyWithChunkRecovery = <T extends ComponentType<unknown>>(
  key: string,
  importer: () => Promise<{ default: T }>,
) =>
  lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      const message = String((error as { message?: unknown } | null)?.message ?? error ?? "");
      const isChunkFailure =
        message.includes("Failed to fetch dynamically imported module")
        || message.includes("Importing a module script failed")
        || message.includes("Expected a JavaScript-or-Wasm module script");
      if (isChunkFailure) {
        if (forceReloadToLatestBundle(key)) {
          return await new Promise<never>(() => {});
        }
      }
      throw error;
    }
  });

const Chats = lazyWithChunkRecovery("chats", () => import("./pages/Chats"));
const ChatDialogue = lazyWithChunkRecovery("chat-dialogue", () => import("./pages/ChatDialogue"));
const ServiceChat = lazyWithChunkRecovery("service-chat", () => import("./pages/ServiceChat"));
const AIVet = lazy(() => import("./pages/AIVet"));
const MapPage = lazyWithChunkRecovery("map", () => import("./pages/Map"));
const PetDetails = lazy(() => import("./pages/PetDetails"));
const Settings = lazyWithChunkRecovery("settings", () => import("./pages/Settings"));
const SecuritySettings = lazyWithChunkRecovery("security-settings", () => import("./pages/SecuritySettings"));
const Premium = lazyWithChunkRecovery("premium", () => import("./pages/Premium"));
const Notifications = lazyWithChunkRecovery("notifications", () => import("./pages/Notifications"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminKYCReview = lazy(() => import("./pages/admin/AdminKYCReview"));
const AdminSafety = lazy(() => import("./pages/admin/AdminSafety"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const Service = lazyWithChunkRecovery("service", () => import("./pages/Service"));
const AdminDisputes = lazy(() => import("./screens/AdminDisputes"));

// Auth & signup flow
const Auth = lazyWithChunkRecovery("auth", () => import("./pages/Auth"));
const SignupDob = lazy(() => import("./pages/signup/SignupDob"));
const SignupName = lazy(() => import("./pages/signup/SignupName"));
const SignupCredentials = lazy(() => import("./pages/signup/SignupCredentials"));
const SignupVerify = lazy(() => import("./pages/signup/SignupVerify"));
const SignupEmailConfirmation = lazy(() => import("./pages/signup/SignupEmailConfirmation"));
const SignupMarketingConfirmed = lazy(() => import("./pages/signup/SignupMarketingConfirmed"));
const SignupVerifyEmail = lazy(() => import("./pages/signup/SignupVerifyEmail"));
const VerifyCallback = lazy(() => import("./pages/VerifyCallback"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ResetPasswordDirect = lazy(() => import("./pages/ResetPasswordDirect"));
const ResetPasswordInline = lazy(() => import("./pages/ResetPasswordInline"));
const ResetPasswordInlineHealthAction = lazy(() => import("./pages/ResetPasswordInlineHealthAction"));
const UpdatePassword = lazy(() => import("./pages/UpdatePassword"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const TurnstileHealth = lazy(() => import("./pages/TurnstileHealth"));
const TurnstileHealthResetAction = lazy(() => import("./pages/TurnstileHealthResetAction"));
const JoinGroup = lazy(() => import("./pages/JoinGroup"));

// Core app pages (protected, non-nav)
const Social = lazyWithChunkRecovery("social", () => import("./pages/Social"));
const EditProfile = lazyWithChunkRecovery("edit-profile", () => import("./pages/EditProfile"));
const EditPetProfile = lazyWithChunkRecovery("edit-pet-profile", () => import("./pages/EditPetProfile"));
const SetProfile = lazyWithChunkRecovery("set-profile", () => import("./pages/SetProfile"));
const SetPetProfile = lazyWithChunkRecovery("set-pet", () => import("./pages/SetPetProfile"));
const VerifyIdentity = lazyWithChunkRecovery("verify-identity", () => import("./pages/VerifyIdentity"));
const CarerProfile = lazyWithChunkRecovery("carer-profile", () => import("./pages/CarerProfile"));
const ServiceProviderAgreement = lazy(() => import("./pages/ServiceProviderAgreement"));

// Legal pages
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const CommunityGuidelines = lazy(() => import("./pages/CommunityGuidelines"));
const CookiesPolicy = lazy(() => import("./pages/CookiesPolicy"));
const PrivacyChoices = lazy(() => import("./pages/PrivacyChoices"));
const ServiceAgreement = lazy(() => import("./pages/ServiceAgreement"));
const BookingTerms = lazy(() => import("./pages/BookingTerms"));

// Fallback
const NotFound = lazy(() => import("./pages/NotFound"));

const RouteSuspense = ({ children }: { children: React.ReactNode }) => (
  <Suspense
    fallback={
      <div className="min-h-svh flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    }
  >
    {children}
  </Suspense>
);

const App = () => (
  <ErrorBoundary>
    <LanguageProvider>
        <NetworkProvider>
          <TooltipProvider>
            <AppBackground />
            <Toaster />
            <Sonner />
            <BrowserRouter
              future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true,
              }}
            >
              <AuthProvider>
                <SignupProvider>
                  <UpsellBannerProvider>
                  <OfflineBanner />
                  <ScrollToTop />
                  <NativeRuntimeBridge />
                  <Routes>
                  {/* Public Routes */}
                  <Route path="/auth" element={<PublicRoute><RouteSuspense><Auth /></RouteSuspense></PublicRoute>} />
                  <Route path="/reset-password" element={<PublicRoute><RouteSuspense><ResetPassword /></RouteSuspense></PublicRoute>} />
                  <Route path="/reset-password-direct" element={<RouteSuspense><ResetPasswordDirect /></RouteSuspense>} />
                  <Route path="/reset-password-inline" element={<RouteSuspense><ResetPasswordInline /></RouteSuspense>} />
                  <Route path="/reset-password-inline-healthaction" element={<RouteSuspense><ResetPasswordInlineHealthAction /></RouteSuspense>} />
                  <Route path="/update-password" element={<PublicRoute><RouteSuspense><UpdatePassword /></RouteSuspense></PublicRoute>} />
                  <Route path="/auth/callback" element={<PublicRoute><RouteSuspense><AuthCallback /></RouteSuspense></PublicRoute>} />
                  <Route path="/signup/dob" element={<PublicRoute><RouteSuspense><SignupDob /></RouteSuspense></PublicRoute>} />
                  <Route path="/signup/name" element={<PublicRoute><RouteSuspense><SignupName /></RouteSuspense></PublicRoute>} />
                  <Route path="/signup/credentials" element={<PublicRoute><RouteSuspense><SignupCredentials /></RouteSuspense></PublicRoute>} />
                  <Route path="/signup/verify" element={<PublicRoute><RouteSuspense><SignupVerify /></RouteSuspense></PublicRoute>} />
                  <Route path="/signup/email-confirmation" element={<PublicRoute><RouteSuspense><SignupEmailConfirmation /></RouteSuspense></PublicRoute>} />
                  <Route path="/signup/marketing-confirmed" element={<PublicRoute><RouteSuspense><SignupMarketingConfirmed /></RouteSuspense></PublicRoute>} />
                  {/* No PublicRoute wrapper — accessible from email client in-app browsers without a session */}
                  <Route path="/signup/verify-email" element={<RouteSuspense><SignupVerifyEmail /></RouteSuspense>} />
                  <Route path="/turnstile-health" element={<RouteSuspense><TurnstileHealth /></RouteSuspense>} />
                  <Route path="/turnstile-health-resetaction" element={<RouteSuspense><TurnstileHealthResetAction /></RouteSuspense>} />
                  {/* Email verification callback — token in URL is the auth, no session required */}
                  <Route path="/verify" element={<RouteSuspense><VerifyCallback /></RouteSuspense>} />
                  {/* Group invite link — code from /join/:code invite URLs */}
                  <Route path="/join/:code" element={<RouteSuspense><JoinGroup /></RouteSuspense>} />

                  {/* Protected Routes */}
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <Index />
                          <BottomNav />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/social"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><Social /></RouteSuspense>
                          <BottomNav />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/discover"
                    element={
                      <ProtectedRoute>
                        <Navigate to="/chats?tab=discover" replace />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/threads"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><Social /></RouteSuspense>
                          <BottomNav />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/chats"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><Chats /></RouteSuspense>
                          <BottomNav />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/chat-dialogue"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><ChatDialogue /></RouteSuspense>
                          <BottomNav />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/service-chat"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><ServiceChat /></RouteSuspense>
                          <BottomNav />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/ai-vet"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><AIVet /></RouteSuspense>
                          <BottomNav />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/map"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><MapPage /></RouteSuspense>
                          <BottomNav />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/notifications"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><Notifications /></RouteSuspense>
                          <BottomNav />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/marketplace"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><Marketplace /></RouteSuspense>
                          <BottomNav />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/service"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><Service /></RouteSuspense>
                          <BottomNav />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/service-provider-agreement"
                    element={
                      <AppShell>
                        <RouteSuspense><ServiceProviderAgreement /></RouteSuspense>
                      </AppShell>
                    }
                  />

                  {/* Profile Edit Routes */}
                  <Route
                    path="/edit-profile"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><EditProfile /></RouteSuspense>
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/edit-pet-profile"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><EditPetProfile /></RouteSuspense>
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/pet-details"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><PetDetails /></RouteSuspense>
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />

                  {/* Settings & Subscription */}
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><Settings /></RouteSuspense>
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings/security"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><SecuritySettings /></RouteSuspense>
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/subscription"
                    element={
                      <ProtectedRoute>
                        <Navigate to="/premium" replace />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/premium"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><Premium /></RouteSuspense>
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/manage-subscription"
                    element={
                      <ProtectedRoute>
                        <Navigate to="/premium" replace />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/verify-identity"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><VerifyIdentity /></RouteSuspense>
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/carerprofile"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><CarerProfile /></RouteSuspense>
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/set-profile"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><SetProfile /></RouteSuspense>
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/set-pet"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><SetPetProfile /></RouteSuspense>
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/privacy"
                    element={<RouteSuspense><Privacy /></RouteSuspense>}
                  />
                  <Route
                    path="/terms"
                    element={<RouteSuspense><Terms /></RouteSuspense>}
                  />
                  <Route
                    path="/community-guidelines"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><CommunityGuidelines /></RouteSuspense>
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/service-agreement"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><ServiceAgreement /></RouteSuspense>
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/booking-terms"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><BookingTerms /></RouteSuspense>
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/cookies"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><CookiesPolicy /></RouteSuspense>
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/privacy-choices"
                    element={<RouteSuspense><PrivacyChoices /></RouteSuspense>}
                  />
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><Admin /></RouteSuspense>
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/verifications"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><AdminKYCReview /></RouteSuspense>
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/safety"
                    element={
                      <ProtectedRoute>
                        <AppShell fullBleed>
                          <RouteSuspense><AdminSafety /></RouteSuspense>
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/control-center"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <RouteSuspense><AdminDisputes /></RouteSuspense>
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />

                  {/* Catch-all */}
                  <Route path="*" element={<RouteSuspense><NotFound /></RouteSuspense>} />
                  </Routes>
                </UpsellBannerProvider>
              </SignupProvider>
              </AuthProvider>
            </BrowserRouter>
          </TooltipProvider>
        </NetworkProvider>
      </LanguageProvider>
  </ErrorBoundary>
);

export default App;
