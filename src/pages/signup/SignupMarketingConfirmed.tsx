/**
 * SignupMarketingConfirmed — Marketing DOI confirmation landing page.
 *
 * Accessible without auth (user arrives from email inbox, potentially days later).
 * Handles ?token=<uuid>&uid=<uuid> query params, calls confirm-marketing-doi,
 * and shows success / error / already-confirmed states.
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui";

type PageState = "confirming" | "success" | "already_confirmed" | "error";

const SignupMarketingConfirmed = () => {
  const [searchParams]          = useSearchParams();
  const navigate                = useNavigate();
  const [pageState, setPageState] = useState<PageState>("confirming");

  useEffect(() => {
    const token = searchParams.get("token");
    const uid   = searchParams.get("uid");

    if (!token || !uid) {
      setPageState("error");
      return;
    }

    supabase.functions
      .invoke("confirm-marketing-doi", { body: { token, uid } })
      .then(({ data, error }) => {
        if (error) {
          setPageState("error");
          return;
        }
        if (data?.already_confirmed) {
          setPageState("already_confirmed");
        } else if (data?.ok) {
          setPageState("success");
        } else {
          setPageState("error");
        }
      })
      .catch(() => setPageState("error"));
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm text-center space-y-6">

        {pageState === "confirming" && (
          <>
            <div className="w-12 h-12 rounded-full bg-muted animate-pulse mx-auto" />
            <p className="text-[15px] text-muted-foreground">Confirming your subscription…</p>
          </>
        )}

        {(pageState === "success" || pageState === "already_confirmed") && (
          <>
            <div className="w-14 h-14 rounded-full bg-[#C8FF00] flex items-center justify-center mx-auto text-2xl">
              ✓
            </div>
            <h1 className="text-[24px] font-[600] text-[#424965]">You're subscribed!</h1>
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              You'll receive huddle updates on pet care, community news, and product announcements.
              You can unsubscribe at any time.
            </p>
            <Button variant="primary" className="w-full h-12" onClick={() => navigate("/")}>
              Go to huddle
            </Button>
          </>
        )}

        {pageState === "error" && (
          <>
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto text-2xl">
              ✕
            </div>
            <h1 className="text-[24px] font-[600] text-[#424965]">Link expired or invalid</h1>
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              This confirmation link may have expired. You can request a new one from your account settings.
            </p>
            <Button variant="primary" className="w-full h-12" onClick={() => navigate("/")}>
              Go to huddle
            </Button>
          </>
        )}

      </div>
    </div>
  );
};

export default SignupMarketingConfirmed;
