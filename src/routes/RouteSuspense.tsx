import { Suspense } from "react";

export const RouteSuspenseFallback = () => (
  <div className="min-h-svh bg-background px-4 pt-16" aria-busy="true" aria-label="Loading">
    <div className="mx-auto max-w-[640px] animate-pulse">
      <div className="h-5 w-24 rounded bg-muted" />
      <div className="mt-8 h-px bg-border" />
      <div className="mt-5 h-10 w-10 rounded-full bg-muted" />
      <div className="mt-4 h-3 w-2/3 rounded bg-muted" />
      <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
    </div>
  </div>
);

export const RouteSuspense = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<RouteSuspenseFallback />}>
    {children}
  </Suspense>
);
