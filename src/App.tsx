import { AppBackground } from "@/components/ui/AppBackground";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { NativeRuntimeBridge } from "@/components/native/NativeRuntimeBridge";
import { AuthProvider } from "@/contexts/AuthContext";
import { SignupProvider } from "@/contexts/SignupContext";
import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { RouteSuspenseFallback } from "@/routes/RouteSuspense";
import { PublicAuthRoutes } from "@/routes/PublicAuthRoutes";
import { isPublicRuntimePath } from "@/routes/publicRuntimePaths";

const FullAppRoutes = lazy(() => import("@/routes/FullAppRoutes"));
const AppToasters = lazy(() => import("@/components/app/AppToasters"));

if (typeof window !== "undefined" && window.location.pathname === "/signup/credentials") {
  void import("@/pages/signup/SignupCredentials");
}

const RuntimeRoutes = () => {
  const location = useLocation();

  if (isPublicRuntimePath(location.pathname)) {
    return <PublicAuthRoutes />;
  }

  return (
    <Suspense fallback={<RouteSuspenseFallback />}>
      <FullAppRoutes />
    </Suspense>
  );
};

const App = () => {
  const [afterFirstPaint, setAfterFirstPaint] = useState(false);

  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    let timeout = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        timeout = window.setTimeout(() => setAfterFirstPaint(true), 1000);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(timeout);
    };
  }, []);

  return (
    <ErrorBoundary>
      <AppBackground />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthProvider>
          <SignupProvider>
            <NativeRuntimeBridge />
            <RuntimeRoutes />
          </SignupProvider>
        </AuthProvider>
      </BrowserRouter>
      {afterFirstPaint ? (
        <Suspense fallback={null}>
          <AppToasters />
        </Suspense>
      ) : null}
    </ErrorBoundary>
  );
};

export default App;
