/**
 * SignupVerifyEmail — /signup/verify-email
 * Reached by clicking the link in the pre-signup verification email.
 * Calls confirm-pre-signup-verify edge function to mark token verified in DB.
 * No auth session required.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type State = "confirming" | "success" | "expired" | "error";

const SignupVerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<State>("confirming");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) { setState("error"); return; }

    supabase.functions
      .invoke("confirm-pre-signup-verify", { body: { token } })
      .then(({ data, error }) => {
        if (error) { setState("error"); return; }
        if (data?.verified)     setState("success");
        else if (data?.expired) setState("expired");
        else                    setState("error");
      })
      .catch(() => setState("error"));
  }, [searchParams]);

  const iconWrap = (bg: string, color: string, Icon: typeof CheckCircle) => (
    <div style={{ width: 64, height: 64, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
      <Icon size={32} color={color} />
    </div>
  );

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", background: "var(--background,#f5f5f7)", fontFamily: "system-ui,sans-serif" }}>
      {state === "confirming" && (
        <div style={{ textAlign: "center" }}>
          <Loader2 size={32} style={{ color: "#2b33c6", margin: "0 auto 16px", display: "block", animation: "spin 1s linear infinite" }} />
          <p style={{ color: "rgba(74,73,101,0.60)", fontSize: "15px" }}>Verifying…</p>
        </div>
      )}

      {state === "success" && (
        <div style={{ textAlign: "center", maxWidth: "360px" }}>
          {iconWrap("#c1ff72", "#2b33c6", CheckCircle)}
          <h1 style={{ fontSize: "24px", fontWeight: 600, color: "#424965", marginBottom: "12px", lineHeight: 1.2 }}>Email verified</h1>
          <p style={{ fontSize: "15px", color: "rgba(74,73,101,0.70)", lineHeight: 1.5 }}>
            Your email is confirmed. Return to huddle to continue setting up your account.
          </p>
        </div>
      )}

      {(state === "expired" || state === "error") && (
        <div style={{ textAlign: "center", maxWidth: "360px" }}>
          {iconWrap("#fde8e8", "#e84545", XCircle)}
          <h1 style={{ fontSize: "24px", fontWeight: 600, color: "#424965", marginBottom: "12px" }}>
            {state === "expired" ? "Link expired" : "Invalid link"}
          </h1>
          <p style={{ fontSize: "15px", color: "rgba(74,73,101,0.70)", lineHeight: 1.5 }}>
            {state === "expired"
              ? "This link has expired. Return to huddle and request a new verification email."
              : "This link is invalid. Return to huddle and request a new verification email."}
          </p>
        </div>
      )}
    </div>
  );
};

export default SignupVerifyEmail;
