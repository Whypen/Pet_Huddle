import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const StripeReturn = () => {
  const navigate = useNavigate();

  useEffect(() => {
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("create-stripe-connect-link", {
          body: { action: "check_status" },
        });
        if (error) throw error;
        const status = String((data as { status?: string })?.status || "pending");
        if (status === "complete") {
          toast.success("Payouts set up successfully.");
        } else if (status === "needs_action") {
          toast.warning("More details needed. Please resume Stripe onboarding.");
        } else {
          toast.warning("Payout setup not yet complete. Please try again.");
        }
      } catch {
        toast.error("Could not confirm payout status. Please retry.");
      }
      navigate("/carerprofile", { replace: true });
    })();
  }, [navigate]);

  return (
    <div className="h-full flex items-center justify-center">
      <Loader2 className="animate-spin text-muted-foreground" size={24} />
    </div>
  );
};

export default StripeReturn;
