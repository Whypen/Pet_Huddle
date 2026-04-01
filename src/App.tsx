import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, useEffect, useRef, type ComponentType } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SignupProvider } from "@/contexts/SignupContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { NetworkProvider } from "@/contexts/NetworkContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PublicRoute } from "@/components/auth/PublicRoute";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { OfflineBanner } from "@/components/network/OfflineBanner";
import { BottomNav } from "@/components/layout/BottomNav";
import { AppShell } from "@/components/layout/AppShell";
import { HuddleVideoLoader } from "@/components/ui/HuddleVideoLoader";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import SignupDob from "./pages/signup/SignupDob";
import SignupName from "./pages/signup/SignupName";
import SignupCredentials from "./pages/signup/SignupCredentials";
import SignupVerify from "./pages/signup/SignupVerify";
import SignupEmailConfirmation from "./pages/signup/SignupEmailConfirmation";
import SignupMarketingConfirmed from "./pages/signup/SignupMarketingConfirmed";
import SignupVerifyEmail from "./pages/signup/SignupVerifyEmail";
import ResetPassword from "./pages/ResetPassword";
import AuthCallback from "./pages/AuthCallback";
import EditProfile from "./pages/EditProfile";
import EditPetProfile from "./pages/EditPetProfile";
import SetProfile from "./pages/SetProfile";
import SetPetProfile from "./pages/SetPetProfile";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import CommunityGuidelines from "./pages/CommunityGuidelines";
import CookiesPolicy from "./pages/CookiesPolicy";
import PrivacyChoices from "./pages/PrivacyChoices";
import ServiceAgreement from "./pages/ServiceAgreement";
import BookingTerms from "./pages/BookingTerms";
import VerifyIdentity from "./pages/VerifyIdentity";
import ServiceProviderAgreement from "./pages/ServiceProviderAgreement";
import CarerProfile from "./pages/CarerProfile";
import Social from "./pages/Social";
import { ScrollToTop } from "@/components/routing/ScrollToTop";
import { UpsellBannerProvider } from "@/contexts/UpsellBannerContext";
import { AppBackground } from "@/components/ui/AppBackground";

const CHUNK_RETRY_FLAG_PREFIX = "huddle:lazy-reload:";
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
        const flagKey = `${CHUNK_RETRY_FLAG_PREFIX}${key}`;
        const retried = sessionStorage.getItem(flagKey) === "1";
        if (!retried) {
          sessionStorage.setItem(flagKey, "1");
          window.location.reload();
          return new Promise<never>(() => undefined);
        }
      }
      throw error;
    }
  });

const Discover = lazy(() => import("./pages/Discover"));
const Chats = lazy(() => import("./pages/Chats"));
const ChatDialogue = lazy(() => import("./pages/ChatDialogue"));
const ServiceChat = lazy(() => import("./pages/ServiceChat"));
const AIVet = lazy(() => import("./pages/AIVet"));
const MapPage = lazy(() => import("./pages/Map"));
const PetDetails = lazy(() => import("./pages/PetDetails"));
const Settings = lazy(() => import("./pages/Settings"));
const SecuritySettings = lazy(() => import("./pages/SecuritySettings"));
const Premium = lazyWithChunkRecovery("premium", () => import("./pages/Premium"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminKYCReview = lazy(() => import("./pages/admin/AdminKYCReview"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const Service = lazy(() => import("./pages/Service"));
const AdminDisputes = lazy(() => import("./screens/AdminDisputes"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

const RouteSuspense = ({ children }: { children: React.ReactNode }) => (
  <Suspense
    fallback={
      <div className="min-h-svh flex items-center justify-center bg-background">
        <HuddleVideoLoader size={32} />
      </div>
    }
  >
    {children}
  </Suspense>
);

const AuthCacheIsolation = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const previousUserRef = useRef<string | null>(null);

  useEffect(() => {
    const currentUserId = user?.id ?? null;
    if (previousUserRef.current && previousUserRef.current !== currentUserId) {
      queryClient.clear();
    } else if (!currentUserId) {
      queryClient.removeQueries();
    }
    previousUserRef.current = currentUserId;
  }, [queryClient, user?.id]);

  return null;
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
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
                <AuthCacheIsolation />
                <SignupProvider>
                  <UpsellBannerProvider>
                  <OfflineBanner />
                  <ScrollToTop />
                  <Routes>
                  {/* Public Routes */}
                  <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
                  <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
                  <Route path="/auth/callback" element={<PublicRoute><AuthCallback /></PublicRoute>} />
                  <Route path="/signup/dob" element={<PublicRoute><SignupDob /></PublicRoute>} />
                  <Route path="/signup/name" element={<PublicRoute><SignupName /></PublicRoute>} />
                  <Route path="/signup/credentials" element={<PublicRoute><SignupCredentials /></PublicRoute>} />
                  <Route path="/signup/verify" element={<PublicRoute><SignupVerify /></PublicRoute>} />
                  <Route path="/signup/email-confirmation" element={<PublicRoute><SignupEmailConfirmation /></PublicRoute>} />
                  <Route path="/signup/marketing-confirmed" element={<PublicRoute><SignupMarketingConfirmed /></PublicRoute>} />
                  {/* No PublicRoute wrapper — accessible from email client in-app browsers without a session */}
                  <Route path="/signup/verify-email" element={<SignupVerifyEmail />} />

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
                        <AppShell>
                          <RouteSuspense><Discover /></RouteSuspense>
                          <BottomNav />
                        </AppShell>
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
                        <ServiceProviderAgreement />
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
                          <VerifyIdentity />
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
                          <SetProfile />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/set-pet"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <SetPetProfile />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/privacy"
                    element={<Privacy />}
                  />
                  <Route
                    path="/terms"
                    element={<Terms />}
                  />
                  <Route
                    path="/community-guidelines"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <CommunityGuidelines />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/service-agreement"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <ServiceAgreement />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/booking-terms"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <BookingTerms />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/cookies"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <CookiesPolicy />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/privacy-choices"
                    element={<PrivacyChoices />}
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
                  <Route path="*" element={<NotFound />} />
                  </Routes>
                </UpsellBannerProvider>
              </SignupProvider>
              </AuthProvider>
            </BrowserRouter>
          </TooltipProvider>
        </NetworkProvider>
      </LanguageProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
