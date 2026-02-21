import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { humanizeError } from "@/lib/humanizeError";

const AuthCallback = () => {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const type = url.searchParams.get("type");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          toast.error(type === "recovery" ? "Invalid reset link" : "Sign-in failed. Please try again.");
        }
      }
      if (type !== "recovery") {
        navigate("/");
        return;
      }
      setReady(true);
    };
    void run();
  }, [navigate]);

  const updatePassword = async () => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(humanizeError(error));
      return;
    }
    toast.success("Password updated");
    navigate("/auth");
  };

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-background px-6 pt-10">
      <h1 className="text-xl font-bold text-brandText">Set a new password</h1>
      <div className="mt-6 space-y-3">
        <Input
          type="password"
          className="h-10"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
        />
        <Button className="w-full h-10" onClick={updatePassword} disabled={password.length < 8}>
          Update password
        </Button>
      </div>
    </div>
  );
};

export default AuthCallback;
