import { useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const STRIPE_CONNECT_RESULT_KEY = "huddle:stripe-connect-result";
const STRIPE_CONNECT_MESSAGE_TYPE = "huddle:stripe-connect";

const StripeReturn = () => {
  const notifyAndClose = (status: "returned" | "error") => {
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
  };

  useEffect(() => {
    toast.success("Stripe returned to Huddle. Finalizing payout status…");
    notifyAndClose("returned");
  }, []);

  return (
    <div className="h-full flex items-center justify-center">
      <Loader2 className="animate-spin text-muted-foreground" size={24} />
    </div>
  );
};

export default StripeReturn;
