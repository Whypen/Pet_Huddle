import { PublicRoute } from "@/components/auth/PublicRoute";
import SignupCredentials from "@/pages/signup/SignupCredentials";
import { RouteSuspense } from "@/routes/RouteSuspense";
import { lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

const Join = lazy(() => import("@/pages/Join"));
const SignupDob = lazy(() => import("@/pages/signup/SignupDob"));
const SignupContinueInApp = lazy(() => import("@/pages/signup/SignupContinueInApp"));
const SignupVerify = lazy(() => import("@/pages/signup/SignupVerify"));
const SignupEmailConfirmation = lazy(() => import("@/pages/signup/SignupEmailConfirmation"));
const SignupVerifyEmail = lazy(() => import("@/pages/signup/SignupVerifyEmail"));
const VerifyCallback = lazy(() => import("@/pages/VerifyCallback"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const ResetPasswordDirect = lazy(() => import("@/pages/ResetPasswordDirect"));
const ResetPasswordInline = lazy(() => import("@/pages/ResetPasswordInline"));
const ResetPasswordInlineHealthAction = lazy(() => import("@/pages/ResetPasswordInlineHealthAction"));
const UpdatePassword = lazy(() => import("@/pages/UpdatePassword"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const SecureAccount = lazy(() => import("@/pages/SecureAccount"));
const TurnstileHealth = lazy(() => import("@/pages/TurnstileHealth"));
const TurnstileHealthResetAction = lazy(() => import("@/pages/TurnstileHealthResetAction"));
const JoinGroup = lazy(() => import("@/pages/JoinGroup"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));
const PrivacyChoices = lazy(() => import("@/pages/PrivacyChoices"));
const CommunityGuidelines = lazy(() => import("@/pages/CommunityGuidelines"));
const CookiesPolicy = lazy(() => import("@/pages/CookiesPolicy"));
const CollectionNotice = lazy(() => import("@/pages/CollectionNotice"));
const ServiceAgreement = lazy(() => import("@/pages/ServiceAgreement"));
const ServiceProviderAgreement = lazy(() => import("@/pages/ServiceProviderAgreement"));
const BookingTerms = lazy(() => import("@/pages/BookingTerms"));
const Support = lazy(() => import("@/pages/Support"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const LegacyAuthRedirect = () => {
  const location = useLocation();
  const { search } = location;
  const params = new URLSearchParams(search);
  const from = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
  const originatingPath = from?.pathname
    ? `${from.pathname}${from.search || ""}${from.hash || ""}`
    : params.get("next");
  if (originatingPath) {
    params.set("next", originatingPath);
  }
  params.set("mode", "signin");
  return <Navigate to={`/join?${params.toString()}`} replace />;
};

export const PublicAuthRoutes = () => (
  <Routes>
    <Route path="/auth" element={<LegacyAuthRedirect />} />
    <Route path="/join" element={<PublicRoute><RouteSuspense><Join /></RouteSuspense></PublicRoute>} />
    <Route path="/reset-password" element={<PublicRoute><RouteSuspense><ResetPassword /></RouteSuspense></PublicRoute>} />
    <Route path="/reset-password-direct" element={<RouteSuspense><ResetPasswordDirect /></RouteSuspense>} />
    <Route path="/reset-password-inline" element={<RouteSuspense><ResetPasswordInline /></RouteSuspense>} />
    <Route path="/reset-password-inline-healthaction" element={<RouteSuspense><ResetPasswordInlineHealthAction /></RouteSuspense>} />
    <Route path="/update-password" element={<PublicRoute><RouteSuspense><UpdatePassword /></RouteSuspense></PublicRoute>} />
    <Route path="/auth/callback" element={<PublicRoute><RouteSuspense><AuthCallback /></RouteSuspense></PublicRoute>} />
    <Route path="/security/secure" element={<RouteSuspense><SecureAccount /></RouteSuspense>} />
    <Route path="/signup/dob" element={<PublicRoute><RouteSuspense><SignupDob /></RouteSuspense></PublicRoute>} />
    <Route path="/signup/name" element={<RouteSuspense><SignupContinueInApp /></RouteSuspense>} />
    <Route path="/signupname" element={<RouteSuspense><SignupContinueInApp /></RouteSuspense>} />
    <Route path="/signup/credentials" element={<PublicRoute renderWhileAuthLoading><SignupCredentials /></PublicRoute>} />
    <Route path="/signup/verify" element={<PublicRoute><RouteSuspense><SignupVerify /></RouteSuspense></PublicRoute>} />
    <Route path="/signup/email-confirmation" element={<PublicRoute><RouteSuspense><SignupEmailConfirmation /></RouteSuspense></PublicRoute>} />
    <Route path="/signup/verify-email" element={<RouteSuspense><SignupVerifyEmail /></RouteSuspense>} />
    <Route path="/turnstile-health" element={<RouteSuspense><TurnstileHealth /></RouteSuspense>} />
    <Route path="/turnstile-health-resetaction" element={<RouteSuspense><TurnstileHealthResetAction /></RouteSuspense>} />
    <Route path="/verify" element={<RouteSuspense><VerifyCallback /></RouteSuspense>} />
    <Route path="/join/:code" element={<RouteSuspense><JoinGroup /></RouteSuspense>} />
    <Route path="/privacy" element={<RouteSuspense><Privacy /></RouteSuspense>} />
    <Route path="/terms" element={<RouteSuspense><Terms /></RouteSuspense>} />
    <Route path="/privacy-choices" element={<RouteSuspense><PrivacyChoices /></RouteSuspense>} />
    <Route path="/community-guidelines" element={<RouteSuspense><CommunityGuidelines /></RouteSuspense>} />
    <Route path="/cookies" element={<RouteSuspense><CookiesPolicy /></RouteSuspense>} />
    <Route path="/collection-notice" element={<RouteSuspense><CollectionNotice /></RouteSuspense>} />
    <Route path="/service-agreement" element={<RouteSuspense><ServiceAgreement /></RouteSuspense>} />
    <Route path="/service-provider-agreement" element={<RouteSuspense><ServiceProviderAgreement /></RouteSuspense>} />
    <Route path="/booking-terms" element={<RouteSuspense><BookingTerms /></RouteSuspense>} />
    <Route path="/support" element={<RouteSuspense><Support /></RouteSuspense>} />
    <Route path="*" element={<RouteSuspense><NotFound /></RouteSuspense>} />
  </Routes>
);
