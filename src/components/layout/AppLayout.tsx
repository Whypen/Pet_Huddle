import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";

interface AppLayoutProps {
  children?: React.ReactNode;
}

// Single source of truth for app chrome.
// Settings drawer lives in GlobalHeader (Sheet) — do NOT add it here.
export const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    // Reads the same --app-max-width token as AppShell. NOTE: this component
    // currently has no consumers; kept in sync so it cannot ship misaligned if
    // it is ever mounted.
    <div className="min-h-svh bg-background w-full max-w-[var(--app-max-width,430px)] mx-auto relative overflow-x-hidden">
      <div className="pb-nav">
        {children}
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
};
