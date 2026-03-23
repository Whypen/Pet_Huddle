import { AlertTriangle, PawPrint, Info } from "lucide-react";
import { getBroadcastPinStyle } from "@/lib/broadcastPinStyle";

type Props = {
  alertType: string;
  markerState?: "active" | "expired_dot";
  interactive?: boolean;
  className?: string;
};

/**
 * Shared single-source-of-truth marker UI for Stray/Lost/Caution/Others.
 * Used by both persisted alert markers and the draft/broadcast preview marker.
 */
const AlertPinMarker = ({ alertType, markerState = "active", interactive = false, className }: Props) => {
  const style = getBroadcastPinStyle(alertType);
  const Icon = style.icon === "alert" ? AlertTriangle : style.icon === "info" ? Info : PawPrint;

  if (markerState === "expired_dot") {
    return (
      <span className={className}>
        <span
          className={[
            "block h-3 w-3 rounded-full border border-white shadow-[0_3px_8px_rgba(0,0,0,0.24)]",
            interactive ? "transition-shadow hover:shadow-[0_0_0_3px_rgba(33,69,207,0.32),0_8px_20px_rgba(0,0,0,0.28)]" : "",
          ].join(" ")}
          style={{ backgroundColor: style.color }}
        />
      </span>
    );
  }

  return (
    <span className={[className, "inline-flex flex-col items-center leading-[0] [filter:drop-shadow(0_4px_8px_rgba(0,0,0,0.28))]"].filter(Boolean).join(" ")}>
      <span
        className={[
          "block h-10 w-10 rounded-full",
          "flex items-center justify-center text-white",
          interactive
            ? "transition-[filter] hover:[filter:drop-shadow(0_0_0_3px_rgba(33,69,207,0.42))]"
            : "",
        ].join(" ")}
        style={{ backgroundColor: style.color }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span
        className="block h-0 w-0 -mt-[3px] border-l-[8px] border-r-[8px] border-t-[12px] border-l-transparent border-r-transparent"
        style={{ borderTopColor: style.color }}
      />
    </span>
  );
};

export default AlertPinMarker;
