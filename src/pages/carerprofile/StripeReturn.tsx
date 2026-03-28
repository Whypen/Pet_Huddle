import { useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { invokeAuthedFunction } from "@/lib/invokeAuthedFunction";

const STRIPE_CONNECT_RESULT_KEY = "huddle:stripe-connect-result";
const STRIPE_CONNECT_MESSAGE_TYPE = "huddle:stripe-connect";

const StripeReturn = () => {
  const notifyAndClose = (status: "complete" | "needs_action" | "pending" | "error") => {
    const payload = { type: STRIPE_CONNECT_MESSAGE_TYPE, status, ts: Date.now() };
    try {
      localStorage.setItem(STRIPE_CONNECT_RESULT_KEY, JSON.stringify(payload));
    } catch {
      // best effort only
    }
    try {
      window.opener?.postMessage(payload, window.location.origin);
    } catch {
      // best effort only
    }
    window.close();
    window.setTimeout(() => {
      if (!window.closed && !window.opener) {
        window.location.replace("/carerprofile");
      }
    }, 200);
  };

  useEffect(() => {
    void (async () => {
      try {
        const { data, error } = await invokeAuthedFunction<{ status?: string }>(
          "create-stripe-connect-link",
          { body: { action: "check_status" }, forceRefresh: true },
        );
        if (error) throw error;
        const status = String((data as { status?: string })?.status || "pending");
        if (status === "complete") {
          toast.success("Payouts set up successfully.");
          notifyAndClose("complete");
        } else if (status === "needs_action") {
          toast.warning("More details needed. Please resume Stripe onboarding.");
          notifyAndClose("needs_action");
        } else {
          toast.warning("Payout setup not yet complete. Please try again.");
          notifyAndClose("pending");
        }
      } catch {
        toast.error("Could not confirm payout status. Please retry.");
        notifyAndClose("error");
      }
    })();
  }, []);

  return (
    <div className="h-full flex items-center justify-center">
      <Loader2 className="animate-spin text-muted-foreground" size={24} />
    </div>
  );
};

export default StripeReturn;
