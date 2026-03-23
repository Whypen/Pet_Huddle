import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useRef } from "react";
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
import Index from "./pages/Index";
import Social from "./pages/Social";
import Discover from "./pages/Discover";
import Chats from "./pages/Chats";
import ChatDialogue from "./pages/ChatDialogue";
import ServiceChat from "./pages/ServiceChat";
import AIVet from "./pages/AIVet";
import MapPage from "./pages/Map";
import Auth from "./pages/Auth";
import SignupDob from "./pages/signup/SignupDob";
import SignupName from "./pages/signup/SignupName";
import SignupCredentials from "./pages/signup/SignupCredentials";
import SignupVerify from "./pages/signup/SignupVerify";
import ResetPassword from "./pages/ResetPassword";
import AuthCallback from "./pages/AuthCallback";
import EditProfile from "./pages/EditProfile";
import EditPetProfile from "./pages/EditPetProfile";
import PetDetails from "./pages/PetDetails";
import SetProfile from "./pages/SetProfile";
import SetPetProfile from "./pages/SetPetProfile";
import Settings from "./pages/Settings";
import SecuritySettings from "./pages/SecuritySettings";
import Premium from "./pages/Premium";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import CommunityGuidelines from "./pages/CommunityGuidelines";
import CookiesPolicy from "./pages/CookiesPolicy";
import PrivacyChoices from "./pages/PrivacyChoices";
import ServiceAgreement from "./pages/ServiceAgreement";
import BookingTerms from "./pages/BookingTerms";
import Notifications from "./pages/Notifications";
import Admin from "./pages/Admin";
import VerifyIdentity from "./pages/VerifyIdentity";
import CarerProfile from "./pages/CarerProfile";
import Marketplace from "./pages/Marketplace";
import Service from "./pages/Service";
import ServiceProviderAgreement from "./pages/ServiceProviderAgreement";
import CarerStripeReturn from "./pages/carerprofile/StripeReturn";
import CarerStripeRefresh from "./pages/carerprofile/StripeRefresh";
import AdminDisputes from "./screens/AdminDisputes";
import AdminKYCReview from "./pages/admin/AdminKYCReview";
import { ScrollToTop } from "@/components/routing/ScrollToTop";
import { UpsellBannerProvider } from "@/contexts/UpsellBannerContext";
import { AppBackground } from "@/components/ui/AppBackground";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

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
                          <Social />
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
                          <Discover />
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
                          <Social />
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
                          <Chats />
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
                          <ChatDialogue />
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
                          <ServiceChat />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/ai-vet"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <AIVet />
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
                          <MapPage />
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
                          <Notifications />
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
                          <Marketplace />
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
                          <Service />
                          <BottomNav />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/carerprofile/stripe-return"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <CarerStripeReturn />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/carerprofile/stripe-refresh"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <CarerStripeRefresh />
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
                          <EditProfile />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/edit-pet-profile"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <EditPetProfile />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/pet-details"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <PetDetails />
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
                          <Settings />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings/security"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <SecuritySettings />
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
                          <Premium />
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
                          <CarerProfile />
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
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <Privacy />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/terms"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <Terms />
                        </AppShell>
                      </ProtectedRoute>
                    }
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
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <PrivacyChoices />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <Admin />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/verifications"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <AdminKYCReview />
                        </AppShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/control-center"
                    element={
                      <ProtectedRoute>
                        <AppShell>
                          <AdminDisputes />
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
