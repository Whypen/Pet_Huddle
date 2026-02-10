import { useState } from "react";
import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { SettingsDrawer } from "./SettingsDrawer";

interface AppLayoutProps {
  children?: React.ReactNode;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto relative">
      <div className="pb-nav">
        {children}
        <Outlet context={{ openSettings: () => setIsSettingsOpen(true) }} />
      </div>
      <BottomNav />
      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};
