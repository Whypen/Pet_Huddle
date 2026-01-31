import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { BottomNav } from "@/components/layout/BottomNav";
import Index from "./pages/Index";
import Social from "./pages/Social";
import Chats from "./pages/Chats";
import AIVet from "./pages/AIVet";
import Map from "./pages/Map";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import EditProfile from "./pages/EditProfile";
import EditPetProfile from "./pages/EditPetProfile";
import Settings from "./pages/Settings";
import Subscription from "./pages/Subscription";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
          <Routes>
            {/* Public Routes */}
            <Route path="/auth" element={<Auth />} />
            
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
                    <Map />
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
              path="/subscription"
              element={
                <ProtectedRoute>
                  <Subscription />
                </ProtectedRoute>
              }
            />
            
            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </LanguageProvider>
</QueryClientProvider>
);

export default App;
