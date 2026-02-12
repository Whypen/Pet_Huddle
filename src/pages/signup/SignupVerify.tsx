import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ShieldCheck, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { verifySchema } from "@/lib/authSchemas";
import { useSignup } from "@/contexts/SignupContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const SignupVerify = () => {
  const navigate = useNavigate();
  const { data, update, reset } = useSignup();
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ legal_name: string }>({
    resolver: zodResolver(verifySchema),
    defaultValues: { legal_name: data.legal_name || "" },
  });

  const doSignup = async (verificationStatus: "pending" | "unverified", legalName?: string) => {
    setLoading(true);
    try {
      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            display_name: data.display_name,
            phone: data.phone,
            dob: data.dob,
            legal_name: legalName || null,
          },
        },
      });
      if (error) throw error;

      const sessionUser = authData.user;
      if (sessionUser) {
        await supabase.from("profiles").upsert({
          id: sessionUser.id,
          display_name: data.display_name,
          dob: data.dob,
          legal_name: legalName || null,
          phone: data.phone,
          verification_status: verificationStatus,
        });
      }

      if (verificationStatus === "pending") {
        update({ legal_name: legalName || "" });
        navigate("/verify-identity", { state: { legalName: legalName || "" } });
        return;
      }

      toast.success("Welcome to huddle 🐾");
      reset();
      navigate("/onboarding");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message || "Failed to sign up");
    } finally {
      setLoading(false);
    }
  };

  const onStartVerification = (values: { legal_name: string }) => {
    doSignup("pending", values.legal_name || data.legal_name);
  };

  return (
    <div className="min-h-screen bg-background px-6">
      <div className="pt-6 flex items-center justify-between">
        <button onClick={() => navigate("/signup/credentials")} className="p-2 -ml-2" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="text-sm text-muted-foreground">4 of 4</div>
      </div>

      <div className="mt-4 h-2 w-full rounded-full bg-muted">
        <div className="h-2 w-full rounded-full bg-brandBlue" />
      </div>

      <h1 className="mt-6 text-xl font-bold text-brandText">Do you want to complete identity verification now?</h1>
      <p className="text-sm text-muted-foreground">You can do this later in Settings</p>

      {errors.legal_name && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600" aria-live="polite">
          {errors.legal_name.message as string}
        </div>
      )}
      <form onSubmit={handleSubmit(onStartVerification)} className="mt-6 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground">Legal Name (as shown on ID)</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className={`h-9 pl-9 ${errors.legal_name ? "border-red-500" : ""}`}
              placeholder="Enter your legal name"
              {...register("legal_name")}
            />
          </div>
          {errors.legal_name && <p className="text-xs text-red-500 mt-1">{errors.legal_name.message as string}</p>}
        </div>

        <div className="rounded-2xl border border-brandBlue/40 bg-brandBlue/5 p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brandBlue" />
            <span className="font-semibold">Get verified to access full app features</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Complete identity verification to unlock Social features, premium filters, and build trust in the community.
          </p>
          <Button type="submit" className="w-full h-10 mt-4" disabled={loading}>
            Start Verification
          </Button>
        </div>
      </form>

      <Button
        type="button"
        variant="outline"
        className="w-full h-10 mt-4"
        onClick={() => setShowSkipConfirm(true)}
      >
        Skip Verification
      </Button>

      {showSkipConfirm && (
        <div className="fixed inset-0 z-[3000] bg-black/50 flex items-end" onClick={() => setShowSkipConfirm(false)}>
          <div className="w-full bg-card rounded-t-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-brandText">Skipping verification may affect your user journey</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Unverified users have limited access to certain community features and may appear less trustworthy to others.
            </p>
            <div className="mt-4 space-y-2">
              <Button type="button" variant="outline" className="w-full h-10" onClick={() => setShowSkipConfirm(false)}>
                Go Back
              </Button>
              <Button
                type="button"
                className="w-full h-10"
                onClick={() => doSignup("unverified", data.legal_name)}
                disabled={loading}
              >
                Continue to Profile Setup
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SignupVerify;
