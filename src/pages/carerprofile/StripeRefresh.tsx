import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const StripeRefresh = () => {
  const navigate = useNavigate();

  useEffect(() => {
    void (async () => {
      try {
        const returnUrl = `${window.location.origin}/carerprofile/stripe-return`;
        const refreshUrl = `${window.location.origin}/carerprofile/stripe-refresh`;
        const { data, error } = await supabase.functions.invoke("create-stripe-connect-link", {
          body: { action: "create_link", returnUrl, refreshUrl },
        });
        if (error) throw error;
        window.location.href = (data as { url: string }).url;
      } catch {
        toast.error("Could not refresh payout link. Please retry.");
        navigate("/carerprofile", { replace: true });
      }
    })();
  }, [navigate]);

  return (
    <div className="h-full flex items-center justify-center">
      <Loader2 className="animate-spin text-muted-foreground" size={24} />
    </div>
  );
};

export default StripeRefresh;
