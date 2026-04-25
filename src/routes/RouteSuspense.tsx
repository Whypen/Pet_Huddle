import { Loader2 } from "lucide-react";
import { Suspense } from "react";

export const RouteSuspenseFallback = () => (
  <div className="min-h-svh flex items-center justify-center bg-background">
    <Loader2 className="w-6 h-6 animate-spin text-primary" />
  </div>
);

export const RouteSuspense = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<RouteSuspenseFallback />}>
    {children}
  </Suspense>
);
