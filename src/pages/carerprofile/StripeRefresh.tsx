import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { invokeAuthedFunction } from "@/lib/invokeAuthedFunction";

const StripeRefresh = () => {
  const navigate = useNavigate();

  useEffect(() => {
    void (async () => {
      try {
        const returnUrl = `${window.location.origin}/carerprofile/stripe-return`;
        const refreshUrl = `${window.location.origin}/carerprofile/stripe-refresh`;
        const { data, error } = await invokeAuthedFunction<{ url?: string }>(
          "create-stripe-connect-link",
          { body: { action: "create_link", returnUrl, refreshUrl } },
        );
        if (error) throw error;
        const nextUrl = String(data?.url || "").trim();
        if (!nextUrl) throw new Error("stripe_connect_link_missing");
        window.location.href = nextUrl;
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
