import { TooltipProvider } from "@/components/ui/tooltip";
import { NetworkProvider } from "@/contexts/NetworkContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { OfflineBanner } from "@/components/network/OfflineBanner";
import { BottomNav } from "@/components/layout/BottomNav";
import { AppShell } from "@/components/layout/AppShell";
import { ScrollToTop } from "@/components/routing/ScrollToTop";
import { UpsellBannerProvider } from "@/contexts/UpsellBannerContext";
import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { lazyWithChunkRecovery } from "@/routes/lazyWithChunkRecovery";
import { RouteSuspense } from "@/routes/RouteSuspense";
import { DesktopSurfaceRail } from "@/components/layout/DesktopSurfaceRail";

const Chats = lazyWithChunkRecovery("chats", () => import("@/pages/ScopedChats"));
const ChatDialogue = lazyWithChunkRecovery("chat-dialogue", () => import("@/pages/ChatDialogue"));
const ServiceChat = lazyWithChunkRecovery("service-chat", () => import("@/pages/ServiceChat"));
const AIVet = lazy(() => import("@/pages/AIVet"));
const MapPage = lazyWithChunkRecovery("map", () => import("@/pages/Map"));
const PetDetails = lazy(() => import("@/pages/PetDetails"));
const Premium = lazyWithChunkRecovery("premium", () => import("@/pages/Premium"));
const Notifications = lazyWithChunkRecovery("notifications", () => import("@/pages/Notifications"));
const Admin = lazy(() => import("@/pages/Admin"));
const AdminGrowth = lazy(() => import("@/pages/admin/AdminGrowth"));
const AdminSafety = lazy(() => import("@/pages/admin/AdminSafety"));
const AdminSupportCases = lazy(() => import("@/pages/admin/AdminSupportCases"));
const Marketplace = lazy(() => import("@/pages/Marketplace"));
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
const ChatsTwoPane = lazyWithChunkRecovery("chats-two-pane", () => import("@/pages/ChatsTwoPane"));

// Logged-out read-only views. Separate components rather than conditionals
// inside the signed-in pages: these contain no `supabase.from(...)` at all, so
// there is no client call that can fire without a session and 401.
const PublicSocial = lazyWithChunkRecovery("public-social", () => import("@/pages/public/PublicSocial"));
const PublicMap = lazyWithChunkRecovery("public-map", () => import("@/pages/public/PublicMap"));
const PublicChats = lazyWithChunkRecovery("public-chats", () => import("@/pages/public/PublicChats"));

const FullAppRoutes = () => (
  <NetworkProvider>
    <TooltipProvider>
      <UpsellBannerProvider>
        <OfflineBanner />
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Navigate to="/social" replace />} />
          <Route
            path="/social"
            element={
              <ProtectedRoute loggedOutFallback={<RouteSuspense><PublicSocial /></RouteSuspense>}>
                <DesktopSurfaceRail>
                  <AppShell fullBleed>
                    <RouteSuspense><Social /></RouteSuspense>
                    <BottomNav />
                  </AppShell>
                </DesktopSurfaceRail>
              </ProtectedRoute>
            }
          />
          <Route
            path="/discover"
            element={
              <ProtectedRoute>
                <Navigate to="/social" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/threads"
            element={
              <ProtectedRoute>
                <DesktopSurfaceRail>
                  <AppShell fullBleed>
                    <RouteSuspense><Social /></RouteSuspense>
                    <BottomNav />
                  </AppShell>
                </DesktopSurfaceRail>
              </ProtectedRoute>
            }
          />
          {/* Both chat paths share ONE element so the list is never remounted
              when a conversation is selected. A parent route stays mounted while
              its child match changes; two sibling routes would not. The panes
              are chosen from the URL inside ChatsTwoPane. */}
          <Route
            element={
              <ProtectedRoute loggedOutFallback={<RouteSuspense><PublicChats /></RouteSuspense>}>
                <DesktopSurfaceRail>
                  <AppShell fullBleed>
                    <ChatsTwoPane
                      list={<RouteSuspense><Chats /></RouteSuspense>}
                      conversation={<RouteSuspense><ChatDialogue /></RouteSuspense>}
                    />
                    <BottomNav />
                  </AppShell>
                </DesktopSurfaceRail>
              </ProtectedRoute>
            }
          >
            <Route path="/chats" element={null} />
            <Route path="/groups" element={null} />
            <Route path="/chat-dialogue" element={null} />
          </Route>
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
              <ProtectedRoute loggedOutFallback={<RouteSuspense><PublicMap /></RouteSuspense>}>
                <DesktopSurfaceRail>
                  <AppShell fullBleed>
                    <RouteSuspense><MapPage /></RouteSuspense>
                    <BottomNav />
                  </AppShell>
                </DesktopSurfaceRail>
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
          {/* Care is hidden on web. Removing the nav entry only stops
              discovery — this closes client-side navigation and a pasted URL,
              which is the part that actually gates it.

              Note this is /service ONLY. /carerprofile and /service-chat are
              live Stripe callback targets for the NATIVE app
              (NativeStripeConnectOnboarding.tsx:27-28,
              NativeServiceChatScreen.tsx:7453-7454) and redirecting them would
              break payouts and checkout for native users. */}
          <Route path="/service" element={<Navigate to="/social" replace />} />
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
          <Route path="/settings" element={<Navigate to="/social" replace state={{ openSettingsDrawer: true }} />} />
          <Route path="/settings/security" element={<Navigate to="/social" replace state={{ openSettingsDrawer: true }} />} />
          <Route
            path="/member"
            element={
              <ProtectedRoute>
                <AppShell>
                  <RouteSuspense><Premium /></RouteSuspense>
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route path="/subscription" element={<Navigate to="/member" replace />} />
          <Route path="/premium" element={<Navigate to="/member" replace />} />
          <Route path="/manage-subscription" element={<Navigate to="/member" replace />} />
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
          <Route path="/carerprofile/stripe-return" element={<Navigate to="/carerprofile" replace />} />
          <Route path="/carerprofile/stripe-refresh" element={<Navigate to="/carerprofile" replace />} />
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
            path="/admin/growth"
            element={
              <ProtectedRoute>
                <AppShell fullBleed>
                  <RouteSuspense><AdminGrowth /></RouteSuspense>
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
            path="/admin/support"
            element={
              <ProtectedRoute>
                <AppShell fullBleed>
                  <RouteSuspense><AdminSupportCases /></RouteSuspense>
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/control-center"
            element={
              <ProtectedRoute>
                <Navigate replace to="/admin/safety?tab=disputes" />
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
