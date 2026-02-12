import { AlertTriangle, PawPrint, Info } from "lucide-react";
import { getBroadcastPinStyle } from "@/lib/broadcastPinStyle";

type Props = {
  alertType: string;
  interactive?: boolean;
  className?: string;
};

/**
 * Shared single-source-of-truth marker UI for Stray/Lost/Others.
 * Used by both persisted alert markers and the draft/broadcast preview marker.
 */
const AlertPinMarker = ({ alertType, interactive = false, className }: Props) => {
  const style = getBroadcastPinStyle(alertType);
  const Icon = style.icon === "alert" ? AlertTriangle : style.icon === "info" ? Info : PawPrint;

  return (
    <span className={className}>
      <span
        className={[
          "h-10 w-10 rounded-full border-[3px] border-white",
          "shadow-[0_4px_12px_rgba(0,0,0,0.3)] flex items-center justify-center text-white",
          interactive
            ? "transition-shadow hover:shadow-[0_0_0_3px_rgba(33,69,207,0.42),0_8px_20px_rgba(0,0,0,0.32)]"
            : "",
        ].join(" ")}
        style={{ backgroundColor: style.color }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span
        className="mx-auto block h-0 w-0 border-l-[8px] border-r-[8px] border-t-[12px] border-l-transparent border-r-transparent"
        style={{ borderTopColor: style.color }}
      />
    </span>
  );
};

export default AlertPinMarker;
