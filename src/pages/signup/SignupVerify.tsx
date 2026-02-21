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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { humanizeError } from "@/lib/humanizeError";

const SignupVerify = () => {
  const navigate = useNavigate();
  const { data, update, reset, startVerificationSignup } = useSignup();
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
  const DOB_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ legal_name: string }>({
    resolver: zodResolver(verifySchema),
    defaultValues: { legal_name: data.legal_name || "" },
  });

  const onStartVerification = async (values: { legal_name: string }) => {
    if (!data.display_name.trim()) {
      toast.error("Please enter a valid display name");
      return;
    }
    if (!data.social_id.trim()) {
      toast.error("Please enter a valid social ID");
      return;
    }
    if (!DOB_ISO_REGEX.test(data.dob)) {
      toast.error("Please enter a valid date of birth");
      return;
    }
    if (!E164_PHONE_REGEX.test(data.phone)) {
      toast.error("Please enter a valid phone number");
      return;
    }

    setLoading(true);
    const legalName = values.legal_name || data.legal_name;
    const result = await startVerificationSignup(legalName);
    if (result.ok) {
      update({ legal_name: legalName || "" });
      navigate("/verify-identity");
      setLoading(false);
      return;
    }

    const message = humanizeError(result.error || "Signup failed");
    if (message.toLowerCase().includes("already") && message.toLowerCase().includes("registered")) {
      toast.error("Email already registered. Please sign in.");
    } else {
      toast.error(message);
    }
    setLoading(false);
  };

  const skipVerificationSignup = async () => {
    if (!data.display_name.trim()) {
      toast.error("Please enter a valid display name");
      return;
    }
    if (!data.social_id.trim()) {
      toast.error("Please enter a valid social ID");
      return;
    }
    if (!DOB_ISO_REGEX.test(data.dob)) {
      toast.error("Please enter a valid date of birth");
      return;
    }
    if (!E164_PHONE_REGEX.test(data.phone)) {
      toast.error("Please enter a valid phone number");
      return;
    }
    setLoading(true);
    try {
      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            display_name: data.display_name,
            legal_name: data.legal_name || "",
            dob: data.dob,
            phone: data.phone,
            social_id: data.social_id,
          },
        },
      });
      if (error) throw error;

      const sessionUser = authData.user;
      if (sessionUser) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ verification_status: "unverified" })
          .eq("id", sessionUser.id);
        if (profileError) throw profileError;
      }

      toast.success("Welcome to huddle 🐾");
      reset();
      navigate("/");
    } catch (err: unknown) {
      const message = humanizeError(err);
      if (message.toLowerCase().includes("already") && message.toLowerCase().includes("registered")) {
        toast.error("Email already registered. Please sign in.");
        // Do not navigate away on error - stay on page
        setLoading(false);
        setShowSkipConfirm(false);
        return;
      }
      toast.error(message);
    } finally {
      setLoading(false);
      setShowSkipConfirm(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-6">
      <div className="pt-6 flex items-center justify-between">
        <button onClick={() => navigate("/signup/name")} className="p-2 -ml-2" aria-label="Back">
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
              className={`h-10 pl-9 ${errors.legal_name ? "border-red-500" : ""}`}
              placeholder="Enter your legal name"
              {...register("legal_name")}
            />
          </div>
          {errors.legal_name && <p className="text-xs text-red-500 mt-1">{errors.legal_name.message as string}</p>}
        </div>

        <div className="rounded-2xl border border-brandBlue/40 bg-brandBlue/5 p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brandBlue" />
            <span className="font-semibold">Get verified</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Helps us build a safer space where everyone feels truly connected in huddle.
          </p>
          <Button type="submit" className="w-full h-10 mt-4" disabled={loading}>
            Start Verification
          </Button>
        </div>
      </form>

      <Button type="button" variant="outline" className="w-full h-10 mt-4" onClick={() => setShowSkipConfirm(true)}>
        Skip Verification
      </Button>

      <Dialog open={showSkipConfirm} onOpenChange={setShowSkipConfirm}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-brandText text-base font-semibold">
            Skipping verification for now?
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            It might make connections feel a bit less open and trusting.
            Verifying helps us all feel safer and truly at home in Huddle.
          </p>
          <div className="mt-4 space-y-2">
            <Button type="button" variant="ghost" className="w-full h-10" onClick={() => setShowSkipConfirm(false)}>
              Cancel
            </Button>
            <Button type="button" className="w-full h-10" onClick={skipVerificationSignup} disabled={loading}>
              Yes. Skip verification.
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SignupVerify;
