import { AlertTriangle } from "lucide-react";

interface RestrictionBannerProps {
  message: string;
}

export function RestrictionBanner({ message }: RestrictionBannerProps) {
  return (
    <div className="fixed inset-x-3 z-[70] rounded-xl border border-amber-200 bg-amber-50/95 px-3 py-2 text-[11px] text-amber-900 shadow-sm"
      style={{ bottom: "calc(var(--nav-height,64px) + env(safe-area-inset-bottom) + 8px)" }}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p className="leading-snug">{message}</p>
      </div>
    </div>
  );
}
