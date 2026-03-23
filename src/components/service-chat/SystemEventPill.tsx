import type { ReactNode } from "react";

type Kind =
  | "service_request_sent"
  | "service_request_updated"
  | "service_request_withdrawn"
  | "service_quote_sent"
  | "service_booked"
  | "service_in_progress"
  | "service_completed"
  | "service_disputed";

const EVENT_CONFIG: Record<Kind, { label: string; className: string; icon?: ReactNode }> = {
  service_request_sent: { label: "Request sent", className: "bg-muted text-muted-foreground" },
  service_request_updated: { label: "Request updated", className: "bg-muted text-muted-foreground" },
  service_request_withdrawn: { label: "You withdrew the request.", className: "bg-muted text-muted-foreground" },
  service_quote_sent: { label: "Quote received", className: "bg-muted text-muted-foreground" },
  service_booked: { label: "Booking confirmed", className: "bg-emerald-50 text-emerald-700" },
  service_in_progress: { label: "Service started", className: "bg-blue-50 text-blue-700" },
  service_completed: { label: "Service completed", className: "bg-emerald-50 text-emerald-700" },
  service_disputed: { label: "Dispute filed", className: "bg-red-50 text-red-700" },
};

export const SystemEventPill = ({ kind }: { kind: Kind }) => {
  const cfg = EVENT_CONFIG[kind];
  return (
    <div className="flex justify-center py-2">
      <span className={`rounded-full px-3 py-1 text-[12px] font-[500] ${cfg.className}`}>{cfg.label}</span>
    </div>
  );
};
