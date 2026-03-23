import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";

type Props = {
  providerName: string;
  onDone: () => void;
};

export const BookingConfirmedOverlay = ({ providerName, onDone }: Props) => {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 2500);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-[100] bg-white/96 backdrop-blur-sm flex flex-col items-center justify-center gap-3" onClick={onDone}>
      <div className="h-20 w-20 rounded-full bg-emerald-50 flex items-center justify-center">
        <CheckCircle2 size={44} className="text-emerald-500" strokeWidth={1.5} />
      </div>
      <div className="text-center px-6">
        <p className="text-[22px] font-[700] text-[#424965]">Booking confirmed</p>
        <p className="text-[15px] text-muted-foreground mt-1">{providerName} has been notified</p>
      </div>
      <p className="text-[12px] text-muted-foreground/60 mt-2">Tap anywhere to continue</p>
    </div>
  );
};

