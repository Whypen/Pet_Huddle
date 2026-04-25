import { TooltipProvider } from "@/components/ui/tooltip";
import { NetworkProvider } from "@/contexts/NetworkContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { OfflineBanner } from "@/components/network/OfflineBanner";
import { BottomNav } from "@/components/layout/BottomNav";
import { AppShell } from "@/components/layout/AppShell";
import Index from "@/pages/Index";
import { ScrollToTop } from "@/components/routing/ScrollToTop";
import { UpsellBannerProvider } from "@/contexts/UpsellBannerContext";
import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { lazyWithChunkRecovery } from "@/routes/lazyWithChunkRecovery";
import { RouteSuspense } from "@/routes/RouteSuspense";

const Chats = lazyWithChunkRecovery("chats", () => import("@/pages/Chats"));
const ChatDialogue = lazyWithChunkRecovery("chat-dialogue", () => import("@/pages/ChatDialogue"));
const ServiceChat = lazyWithChunkRecovery("service-chat", () => import("@/pages/ServiceChat"));
const AIVet = lazy(() => import("@/pages/AIVet"));
const MapPage = lazyWithChunkRecovery("map", () => import("@/pages/Map"));
const PetDetails = lazy(() => import("@/pages/PetDetails"));
const Settings = lazyWithChunkRecovery("settings", () => import("@/pages/Settings"));
const SecuritySettings = lazyWithChunkRecovery("security-settings", () => import("@/pages/SecuritySettings"));
const Premium = lazyWithChunkRecovery("premium", () => import("@/pages/Premium"));
const Notifications = lazyWithChunkRecovery("notifications", () => import("@/pages/Notifications"));
const Admin = lazy(() => import("@/pages/Admin"));
const AdminSafety = lazy(() => import("@/pages/admin/AdminSafety"));
const Marketplace = lazy(() => import("@/pages/Marketplace"));
const Service = lazyWithChunkRecovery("service", () => import("@/pages/Service"));
const AdminDisputes = lazy(() => import("@/screens/AdminDisputes"));
const Social = lazyWithChunkRecovery("social", () => import("@/pages/Social"));
const EditProfile = lazyWithChunkRecovery("edit-profile", () => import("@/pages/EditProfile"));
const EditPetProfile = lazyWithChunkRecovery("edit-pet-profile", () => import("@/pages/EditPetProfile"));
const SetProfile = lazyWithChunkRecovery("set-profile", () => import("@/pages/SetProfile"));
const SetPetProfile = lazyWithChunkRecovery("set-pet", () => import("@/pages/SetPetProfile"));
const VerifyIdentity = lazyWithChunkRecovery("verify-identity", () => import("@/pages/VerifyIdentity"));
const CarerProfile = lazyWithChunkRecovery("carer-profile", () => import("@/pages/CarerProfile"));
const ServiceProviderAgreement = lazy(() => import("@/pages/ServiceProviderAgreement"));
const CommunityGuidelines = lazy(() => import("@/pages/CommunityGuidelines"));
const CookiesPolicy = lazy(() => import("@/pages/CookiesPolicy"));
const ServiceAgreement = lazy(() => import("@/pages/ServiceAgreement"));
const BookingTerms = lazy(() => import("@/pages/BookingTerms"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const FullAppRoutes = () => (
  <NetworkProvider>
    <TooltipProvider>
      <UpsellBannerProvider>
        <OfflineBanner />
        <ScrollToTop />
        <Routes>
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
          <Route path="/subscription" element={<ProtectedRoute><Navigate to="/premium" replace /></ProtectedRoute>} />
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
          <Route path="/manage-subscription" element={<ProtectedRoute><Navigate to="/premium" replace /></ProtectedRoute>} />
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
          <Route path="*" element={<RouteSuspense><NotFound /></RouteSuspense>} />
        </Routes>
      </UpsellBannerProvider>
    </TooltipProvider>
  </NetworkProvider>
);

export default FullAppRoutes;
