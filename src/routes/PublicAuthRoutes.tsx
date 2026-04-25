import { PublicRoute } from "@/components/auth/PublicRoute";
import SignupCredentials from "@/pages/signup/SignupCredentials";
import { lazyWithChunkRecovery } from "@/routes/lazyWithChunkRecovery";
import { RouteSuspense } from "@/routes/RouteSuspense";
import { lazy } from "react";
import { Route, Routes } from "react-router-dom";

const Auth = lazyWithChunkRecovery("auth", () => import("@/pages/Auth"));
const SignupDob = lazy(() => import("@/pages/signup/SignupDob"));
const SignupName = lazy(() => import("@/pages/signup/SignupName"));
const SignupVerify = lazy(() => import("@/pages/signup/SignupVerify"));
const SignupEmailConfirmation = lazy(() => import("@/pages/signup/SignupEmailConfirmation"));
const SignupMarketingConfirmed = lazy(() => import("@/pages/signup/SignupMarketingConfirmed"));
const SignupVerifyEmail = lazy(() => import("@/pages/signup/SignupVerifyEmail"));
const VerifyCallback = lazy(() => import("@/pages/VerifyCallback"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const ResetPasswordDirect = lazy(() => import("@/pages/ResetPasswordDirect"));
const ResetPasswordInline = lazy(() => import("@/pages/ResetPasswordInline"));
const ResetPasswordInlineHealthAction = lazy(() => import("@/pages/ResetPasswordInlineHealthAction"));
const UpdatePassword = lazy(() => import("@/pages/UpdatePassword"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const TurnstileHealth = lazy(() => import("@/pages/TurnstileHealth"));
const TurnstileHealthResetAction = lazy(() => import("@/pages/TurnstileHealthResetAction"));
const JoinGroup = lazy(() => import("@/pages/JoinGroup"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));
const PrivacyChoices = lazy(() => import("@/pages/PrivacyChoices"));
const Support = lazy(() => import("@/pages/Support"));
const NotFound = lazy(() => import("@/pages/NotFound"));

export const PublicAuthRoutes = () => (
  <Routes>
    <Route path="/auth" element={<PublicRoute><RouteSuspense><Auth /></RouteSuspense></PublicRoute>} />
    <Route path="/reset-password" element={<PublicRoute><RouteSuspense><ResetPassword /></RouteSuspense></PublicRoute>} />
    <Route path="/reset-password-direct" element={<RouteSuspense><ResetPasswordDirect /></RouteSuspense>} />
    <Route path="/reset-password-inline" element={<RouteSuspense><ResetPasswordInline /></RouteSuspense>} />
    <Route path="/reset-password-inline-healthaction" element={<RouteSuspense><ResetPasswordInlineHealthAction /></RouteSuspense>} />
    <Route path="/update-password" element={<PublicRoute><RouteSuspense><UpdatePassword /></RouteSuspense></PublicRoute>} />
    <Route path="/auth/callback" element={<PublicRoute><RouteSuspense><AuthCallback /></RouteSuspense></PublicRoute>} />
    <Route path="/signup/dob" element={<PublicRoute><RouteSuspense><SignupDob /></RouteSuspense></PublicRoute>} />
    <Route path="/signup/name" element={<PublicRoute><RouteSuspense><SignupName /></RouteSuspense></PublicRoute>} />
    <Route path="/signup/credentials" element={<PublicRoute renderWhileAuthLoading><SignupCredentials /></PublicRoute>} />
    <Route path="/signup/verify" element={<PublicRoute><RouteSuspense><SignupVerify /></RouteSuspense></PublicRoute>} />
    <Route path="/signup/email-confirmation" element={<PublicRoute><RouteSuspense><SignupEmailConfirmation /></RouteSuspense></PublicRoute>} />
    <Route path="/signup/marketing-confirmed" element={<PublicRoute><RouteSuspense><SignupMarketingConfirmed /></RouteSuspense></PublicRoute>} />
    <Route path="/signup/verify-email" element={<RouteSuspense><SignupVerifyEmail /></RouteSuspense>} />
    <Route path="/turnstile-health" element={<RouteSuspense><TurnstileHealth /></RouteSuspense>} />
    <Route path="/turnstile-health-resetaction" element={<RouteSuspense><TurnstileHealthResetAction /></RouteSuspense>} />
    <Route path="/verify" element={<RouteSuspense><VerifyCallback /></RouteSuspense>} />
    <Route path="/join/:code" element={<RouteSuspense><JoinGroup /></RouteSuspense>} />
    <Route path="/privacy" element={<RouteSuspense><Privacy /></RouteSuspense>} />
    <Route path="/terms" element={<RouteSuspense><Terms /></RouteSuspense>} />
    <Route path="/privacy-choices" element={<RouteSuspense><PrivacyChoices /></RouteSuspense>} />
    <Route path="/support" element={<RouteSuspense><Support /></RouteSuspense>} />
    <Route path="*" element={<RouteSuspense><NotFound /></RouteSuspense>} />
  </Routes>
);
