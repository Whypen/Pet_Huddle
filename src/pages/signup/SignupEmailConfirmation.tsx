// src/pages/signup/SignupEmailConfirmation.tsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Mail, CheckCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { NeuButton } from "@/components/ui/NeuButton";
import { SignupShell } from "@/components/signup/SignupShell";
import { isEmailInboxLauncherEnabled, launchEmailInboxBestEffort } from "@/lib/emailInboxLauncher";

type PageState = "waiting" | "confirming" | "success" | "error";

const SignupEmailConfirmation = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, refreshProfile } = useAuth();
  const [pageState, setPageState] = useState<PageState>("waiting");
  const [resending, setResending] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const token = searchParams.get("token");
  const uid = searchParams.get("uid");

  const goTo = (path: string) => {
    setIsExiting(true);
    setTimeout(() => navigate(path, { replace: true }), 180);
  };

  // Auto-confirm when token + uid are present in URL
  useEffect(() => {
    if (!token || !uid) return;
    setPageState("confirming");

    supabase.functions
      .invoke("confirm-signup-email", { body: { token, uid } })
      .then(async ({ data, error }) => {
        if (error || !data?.ok) {
          console.error("[email-confirmation] confirm failed", error ?? data);
          setPageState("error");
          return;
        }
        // Refresh profile so email_verified is up-to-date
        await refreshProfile();
        setPageState("success");
      })
      .catch((err) => {
        console.error("[email-confirmation] unexpected error", err);
        setPageState("error");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, uid]);

  const handleResend = async () => {
    const userId = uid ?? user?.id;
    if (!userId) {
      toast.error("Please sign in to resend the verification email.");
      return;
    }
    setResending(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "send-signup-verify-email",
        { body: { user_id: userId } },
      );
      if (error || !data?.ok) throw new Error("send_failed");
      toast.success("Verification email sent again");
      setPageState("waiting");
    } catch {
      toast.error("Could not resend. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const handleOpenMail = async () => {
    if (!isEmailInboxLauncherEnabled()) {
      toast.message("Open your mail app manually.");
      return;
    }
    const result = await launchEmailInboxBestEffort();
    if (!result.launched) {
      toast.message("Open your mail app manually.");
      return;
    }
    toast.message("If your mail app opened, return here after verifying.");
  };

  const handleCheckVerified = async () => {
    await refreshProfile();
    // refreshProfile updates AuthContext; if email_verified is now true,
    // the user can proceed. We check the updated profile via the effect below.
  };

  // After refreshProfile, if user is now verified, auto-advance to success
  const { profile } = useAuth();
  useEffect(() => {
    if (profile?.email_verified && (pageState === "waiting" || pageState === "error")) {
      setPageState("success");
    }
  }, [profile?.email_verified, pageState]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (pageState === "confirming") {
    return (
      <SignupShell step={3} isExiting={isExiting} cta={null}>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-primary" />
          <p className="text-[15px] text-muted-foreground">Verifying your email…</p>
        </div>
      </SignupShell>
    );
  }

  if (pageState === "success") {
    return (
      <SignupShell
        step={3}
        isExiting={isExiting}
        cta={
          <NeuButton
            variant="primary"
            className="w-full h-12"
            onClick={() => goTo("/set-profile")}
          >
            Continue
          </NeuButton>
        }
      >
        <div className="flex flex-col items-center text-center gap-4 pt-8">
          <div className="w-16 h-16 rounded-full bg-[#c1ff72] flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-[#2b33c6]" />
          </div>
          <h1 className="text-[28px] font-[600] leading-[1.1] tracking-[-0.02em] text-[#424965]">
            You've verified your email
          </h1>
          <p className="text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed">
            Your email is confirmed. You can now continue setting up huddle.
          </p>
        </div>
      </SignupShell>
    );
  }

  // Waiting state (default) + error state
  const isError = pageState === "error";

  return (
    <SignupShell
      step={3}
      isExiting={isExiting}
      cta={
        <div className="space-y-3">
          <NeuButton
            variant="secondary"
            className="w-full h-12"
            onClick={handleOpenMail}
          >
            <Mail size={16} className="mr-2" />
            Open Mail app
          </NeuButton>
          <NeuButton
            variant="ghost"
            className="w-full h-11"
            disabled={resending}
            onClick={handleResend}
          >
            {resending ? "Sending…" : "Resend email"}
          </NeuButton>
          <NeuButton
            variant="ghost"
            className="w-full h-11 text-[rgba(74,73,101,0.55)]"
            onClick={handleCheckVerified}
          >
            I've verified my email
          </NeuButton>
          <NeuButton
            variant="ghost"
            className="w-full h-11 text-[rgba(74,73,101,0.40)]"
            onClick={() => goTo("/signup/name")}
          >
            I'll do it later
          </NeuButton>
        </div>
      }
    >
      <h1 className="text-[28px] font-[600] leading-[1.1] tracking-[-0.02em] text-[#424965]">
        {isError ? "Link expired" : "Verification link sent!"}
      </h1>
      <p className="text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed mt-3">
        {isError
          ? "This verification link has expired or is invalid. Request a new one below."
          : "Open your mail app manually and tap the latest verification email link."}
      </p>
    </SignupShell>
  );
};

export default SignupEmailConfirmation;
