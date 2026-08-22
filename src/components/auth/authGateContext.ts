/**
 * Context and hook for the auth gate. Split from AuthGateProvider.tsx so that
 * file exports only a component — exporting a hook alongside it breaks React
 * Fast Refresh for every consumer.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { AuthIntentType } from "@/lib/authIntent";

export type AuthGateOptions = {
  targetId?: string;
  returnTo?: string;
  /** Rendered above the headline — e.g. an alert's public header. */
  context?: ReactNode;
};

export type AuthGateValue = {
  /**
   * Runs `action` if there is a session; otherwise opens the wall.
   * Returns true when the action ran, so callers can early-return.
   */
  requireAuth: (intent: AuthIntentType, action: () => void, options?: AuthGateOptions) => boolean;
  /** True when a session exists. For rendering differences, not for gating. */
  isSignedIn: boolean;
};

export const AuthGateContext = createContext<AuthGateValue | null>(null);

export function useAuthGate(): AuthGateValue {
  const ctx = useContext(AuthGateContext);
  if (!ctx) {
    throw new Error("useAuthGate must be used inside <AuthGateProvider>. Mount it above your routes.");
  }
  return ctx;
}
