import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FormField } from "@/components/ui";
import { NeuButton } from "@/components/ui/NeuButton";
import { authChangePassword } from "@/lib/publicAuthApi";
import { consumeSupabaseAuthRedirect } from "@/lib/supabaseAuthRedirect";

const UpdatePassword = () => {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      const callbackResult = await consumeSupabaseAuthRedirect();
      if (!callbackResult.ok || (callbackResult.type && callbackResult.type !== "recovery")) {
        toast.error("That reset link is no longer valid. Please request a new one.");
        navigate("/reset-password", { replace: true });
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("That reset link is no longer valid. Please request a new one.");
        navigate("/reset-password", { replace: true });
        return;
      }

      setReady(true);
    };
    void run();
  }, [navigate]);

  const updatePassword = async () => {
    setSubmitting(true);
    const { error } = await authChangePassword({
      password,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message || "Failed to update password");
      return;
    }
    toast.success("Password updated");
    navigate("/auth", { replace: true });
  };

  if (!ready) return null;

  return (
    <div className="min-h-svh bg-background px-6 pt-10">
      <h1 className="text-xl font-bold text-brandText">Set a new password</h1>
      <div className="mt-6 space-y-3">
        <FormField
          type="password"
          label="Password"
          leadingIcon={<Lock size={16} strokeWidth={1.75} />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
        />
        <NeuButton
          className="w-full h-10"
          onClick={updatePassword}
          disabled={password.length < 8 || submitting}
        >
          Update password
        </NeuButton>
      </div>
    </div>
  );
};

export default UpdatePassword;
