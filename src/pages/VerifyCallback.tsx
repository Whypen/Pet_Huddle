/**
 * VerifyCallback — /verify
 *
 * Landing page for pre-signup email verification links.
 * Link format: /verify?token=<uuid>&email=<email>
 *
 * Calls confirm-pre-signup-verify edge function to mark the token verified.
 * Routes:
 *   success  → /signup/name  (flow continues; no auth user created yet)
 *   expired  → /signup/verify-email  with { state: { expired: true } }
 *   invalid  → /signup/credentials  with { state: { invalid_link: true } }
 *
 * No user-facing error text on this page — all error paths redirect with state.
 * Old presignup links (to /signup/verify-email?token=) won't hit this route.
 */

import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSignup } from "@/contexts/SignupContext";

const PRESIGNUP_TOKEN_KEY = "huddle_presignup_token";

const VerifyCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setFlowState } = useSignup();
  const ran = useRef(false);

  useEffect(() => {
    // Guard against StrictMode double-invoke
    if (ran.current) return;
    ran.current = true;

    const token = searchParams.get("token");

    if (!token) {
      // No token — malformed link
      navigate("/signup/credentials", {
        replace: true,
        state: { invalid_link: true },
      });
      return;
    }

    const confirm = async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "confirm-pre-signup-verify",
          { body: { token } },
        );

        if (error) {
          // Network / edge function failure — treat as invalid link
          navigate("/signup/credentials", {
            replace: true,
            state: { invalid_link: true },
          });
          return;
        }

        if (data?.verified) {
          // Clear stored token — verification is complete
          try { sessionStorage.removeItem(PRESIGNUP_TOKEN_KEY); } catch { /* best-effort */ }
          // Restore signup flow state so guards pass at /signup/name
          setFlowState("signup");
          navigate("/signup/name", { replace: true });
          return;
        }

        if (data?.expired) {
          navigate("/signup/verify-email", {
            replace: true,
            state: { expired: true },
          });
          return;
        }

        // verified=false, expired=false → token not found or already used
        navigate("/signup/credentials", {
          replace: true,
          state: { invalid_link: true },
        });
      } catch {
        navigate("/signup/credentials", {
          replace: true,
          state: { invalid_link: true },
        });
      }
    };

    void confirm();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show a minimal spinner while the edge function call resolves (usually < 500ms)
  return (
    <div className="min-h-svh flex items-center justify-center bg-background">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
};

export default VerifyCallback;
