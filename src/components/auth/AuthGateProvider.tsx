/**
 * AuthGateProvider — one wall for the whole tree.
 *
 * Every gated action goes through `requireAuth`. Signed in, the action runs
 * immediately and nothing renders. Signed out, the wall opens with copy naming
 * that action, and the intent is stored so it can resume after auth.
 *
 * A single instance is deliberate: a wall per call site would mean N overlays
 * mounted across the app, N stacking contexts, and no guarantee that only one is
 * ever visible.
 *
 * Usage:
 *   const { requireAuth } = useAuthGate();
 *   <button onClick={() => requireAuth("join-group", () => join(id), { targetId: id })}>
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { AuthIntentType } from "@/lib/authIntent";
import { AuthWall } from "./AuthWall";
import { AuthGateContext, type AuthGateOptions, type AuthGateValue } from "./authGateContext";

type WallState = { intent: AuthIntentType; options?: AuthGateOptions } | null;

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [wall, setWall] = useState<WallState>(null);
  const isSignedIn = Boolean(user);

  const requireAuth = useCallback(
    (intent: AuthIntentType, action: () => void, options?: AuthGateOptions) => {
      if (user) {
        action();
        return true;
      }
      setWall({ intent, options });
      return false;
    },
    [user],
  );

  // Stable identity matters here, it is not a micro-optimisation. AuthWall's
  // focus/Escape effect depends on `onClose`; an inline arrow would be a new
  // function every render, so the effect would tear down and re-run on each
  // re-render of this provider — restoring focus to the trigger mid-interaction
  // and then re-capturing the restore target as whatever happened to be focused.
  // This provider wraps the router, so it re-renders on every navigation.
  const closeWall = useCallback(() => setWall(null), []);

  const value = useMemo<AuthGateValue>(() => ({ requireAuth, isSignedIn }), [requireAuth, isSignedIn]);

  return (
    <AuthGateContext.Provider value={value}>
      {children}
      <AuthWall
        isOpen={wall !== null}
        onClose={closeWall}
        intent={wall?.intent}
        targetId={wall?.options?.targetId}
        returnTo={wall?.options?.returnTo}
        context={wall?.options?.context}
      />
    </AuthGateContext.Provider>
  );
}

export default AuthGateProvider;
