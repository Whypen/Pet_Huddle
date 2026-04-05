import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { authResetPassword } from "@/lib/publicAuthApi";
import { useTurnstile } from "@/hooks/useTurnstile";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";
import { useNavigate } from "react-router-dom";

const schema = z.object({
  email: z.string().email("Invalid email format"),
});

type FormData = z.infer<typeof schema>;

const ResetPassword = () => {
  const navigate = useNavigate();
  const resetTurnstile = useTurnstile("reset_password");
  const readTurnstileToken = () => {
    const maybeGetToken = (resetTurnstile as { getToken?: unknown }).getToken;
    if (typeof maybeGetToken === "function") {
      return String((maybeGetToken as () => string)() || "").trim();
    }
    return String((resetTurnstile as { token?: string | null }).token || "").trim();
  };
  const { register, handleSubmit, formState: { errors, isValid } } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: "onChange",
  });

  const onSubmit = async (values: FormData) => {
    const token = readTurnstileToken();
    if (!token) {
      toast.error("Complete human verification first.");
      return;
    }
    const { error } = await authResetPassword({
      email: values.email,
      redirectTo: `${window.location.origin}/auth/callback`,
      turnstile_token: token,
      turnstile_action: "reset_password",
    });
    resetTurnstile.reset();
    if (error) {
      toast.error(error.message || "Failed to send reset link");
      return;
    }
    toast.success("Password reset link sent to your email");
  };

  return (
    <div className="min-h-screen bg-background px-6 pt-10">
      <button
        type="button"
        onClick={() => navigate("/auth")}
        className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-brandText"
        aria-label="Back to sign in"
      >
        <ChevronLeft size={18} strokeWidth={1.75} />
      </button>
      <h1 className="text-xl font-bold text-brandText">Reset Password</h1>
      <p className="text-sm text-muted-foreground">Enter your email to receive a reset link.</p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-3">
        <Input type="email" className={`h-9 ${errors.email ? "border-red-500" : ""}`} {...register("email")} />
        {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
        <TurnstileWidget
          siteKeyMissing={resetTurnstile.siteKeyMissing}
          setContainer={resetTurnstile.setContainer}
          className="min-h-[65px]"
        />
        <Button type="submit" className="w-full h-10" disabled={!isValid || !resetTurnstile.isTokenUsable}>Send reset link</Button>
      </form>
    </div>
  );
};

export default ResetPassword;
