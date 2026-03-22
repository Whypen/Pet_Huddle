/**
 * AppShell — Phase 4 / Step 21
 * Gradient canvas wrapper; z-index layer map enforcer.
 *
 * Z-INDEX MAP:
 *   content (0) → fab (10) → nav (20) → sheet (30) → modal (40) → toast (50)
 *
 * NOTE: The canvas gradient is already set globally on html/body/#root via tokens.css.
 * AppShell provides the correct flex column layout + max-width container for mobile.
 */

import React from "react";

export interface AppShellProps {
  children: React.ReactNode;
  /** Optional extra class for the inner container */
  className?: string;
  /** Disable max-width centering (e.g. for full-bleed pages) */
  fullBleed?: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  className = "",
  fullBleed = false,
}) => (
  <div
    className={[
      "relative min-h-svh flex flex-col",
      fullBleed ? "" : "max-w-[var(--app-max-width,430px)] mx-auto w-full",
      className,
    ].join(" ")}
  >
    {children}
  </div>
);

export default AppShell;
