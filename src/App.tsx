import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { SignupProvider } from "@/contexts/SignupContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { NetworkProvider } from "@/contexts/NetworkContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PublicRoute } from "@/components/auth/PublicRoute";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { OfflineBanner } from "@/components/network/OfflineBanner";
import { BottomNav } from "@/components/layout/BottomNav";
import Index from "./pages/Index";
import Social from "./pages/Social";
import Chats from "./pages/Chats";
import ChatDialogue from "./pages/ChatDialogue";
import AIVet from "./pages/AIVet";
import MapPage from "./pages/Map";
import Auth from "./pages/Auth";
import SignupDob from "./pages/signup/SignupDob";
import SignupName from "./pages/signup/SignupName";
import SignupCredentials from "./pages/signup/SignupCredentials";
import SignupVerify from "./pages/signup/SignupVerify";
import ResetPassword from "./pages/ResetPassword";
import AuthCallback from "./pages/AuthCallback";
import Onboarding from "./pages/Onboarding";
import EditProfile from "./pages/EditProfile";
import EditPetProfile from "./pages/EditPetProfile";
import PetDetails from "./pages/PetDetails";
import Settings from "./pages/Settings";
import Premium from "./pages/Premium";
import AccountSettings from "./pages/AccountSettings";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Notifications from "./pages/Notifications";
import Admin from "./pages/Admin";
import VerifyIdentity from "./pages/auth/verify/VerifyIdentity";
import AdminDisputes from "./screens/AdminDisputes";
import AdminKYCReview from "./pages/admin/AdminKYCReview";
import { ScrollToTop } from "@/components/routing/ScrollToTop";
import { UpsellBannerProvider } from "@/contexts/UpsellBannerContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <NetworkProvider>
          <TooltipProvider>
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
                  <Routes>
                  {/* Public Routes */}
                  <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
                  <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
                  <Route path="/auth/callback" element={<PublicRoute><AuthCallback /></PublicRoute>} />
                  <Route path="/signup/dob" element={<PublicRoute><SignupDob /></PublicRoute>} />
                  <Route path="/signup/name" element={<PublicRoute><SignupName /></PublicRoute>} />
                  <Route path="/signup/credentials" element={<PublicRoute><SignupCredentials /></PublicRoute>} />
                  <Route path="/signup/verify" element={<PublicRoute><SignupVerify /></PublicRoute>} />

                  {/* Onboarding Route (requires auth but not onboarding completion) */}
                  <Route
                    path="/onboarding"
                    element={
                      <ProtectedRoute requireOnboarding={false}>
                        <Onboarding />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected Routes */}
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <div className="max-w-md mx-auto min-h-screen bg-background relative">
                          <Index />
                          <BottomNav />
                        </div>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/social"
                    element={
                      <ProtectedRoute>
                        <div className="max-w-md mx-auto min-h-screen bg-background relative">
                          <Social />
                          <BottomNav />
                        </div>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/threads"
                    element={
                      <ProtectedRoute>
                        <div className="max-w-md mx-auto min-h-screen bg-background relative">
                          <Social />
                          <BottomNav />
                        </div>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/threads/:threadId"
                    element={
                      <ProtectedRoute>
                        <div className="max-w-md mx-auto min-h-screen bg-background relative">
                          <Social />
                          <BottomNav />
                        </div>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/chats"
                    element={
                      <ProtectedRoute>
                        <div className="max-w-md mx-auto min-h-screen bg-background relative">
                          <Chats />
                          <BottomNav />
                        </div>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/chat-dialogue"
                    element={
                      <ProtectedRoute>
                        <div className="max-w-md mx-auto min-h-screen bg-background relative">
                          <ChatDialogue />
                          <BottomNav />
                        </div>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/ai-vet"
                    element={
                      <ProtectedRoute>
                        <div className="max-w-md mx-auto min-h-screen bg-background relative">
                          <AIVet />
                          <BottomNav />
                        </div>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/map"
                    element={
                      <ProtectedRoute>
                        <div className="max-w-md mx-auto min-h-screen bg-background relative">
                          <MapPage />
                          <BottomNav />
                        </div>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/notifications"
                    element={
                      <ProtectedRoute>
                        <div className="max-w-md mx-auto min-h-screen bg-background relative">
                          <Notifications />
                          <BottomNav />
                        </div>
                      </ProtectedRoute>
                    }
                  />

                  {/* Profile Edit Routes */}
                  <Route
                    path="/edit-profile"
                    element={
                      <ProtectedRoute>
                        <EditProfile />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/edit-pet-profile"
                    element={
                      <ProtectedRoute>
                        <EditPetProfile />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/pet-details"
                    element={
                      <ProtectedRoute>
                        <PetDetails />
                      </ProtectedRoute>
                    }
                  />

                  {/* Settings & Subscription */}
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute>
                        <Settings />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/account-settings"
                    element={
                      <ProtectedRoute>
                        <AccountSettings />
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
                        <Premium />
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
                        <VerifyIdentity />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/privacy"
                    element={
                      <ProtectedRoute>
                        <Privacy />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/terms"
                    element={
                      <ProtectedRoute>
                        <Terms />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute>
                        <Admin />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/verifications"
                    element={
                      <ProtectedRoute>
                        <AdminKYCReview />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/control-center"
                    element={
                      <ProtectedRoute>
                        <AdminDisputes />
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
