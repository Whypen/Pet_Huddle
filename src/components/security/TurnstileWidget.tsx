import type { TurnstileDiagnostics } from "@/hooks/useTurnstile";

type TurnstileWidgetProps = {
  siteKeyMissing?: boolean;
  setContainer: (element: HTMLDivElement | null) => void;
  className?: string;
};

type TurnstileDebugPanelProps = {
  visible: boolean;
  diag: TurnstileDiagnostics;
};

export function TurnstileWidget({
  siteKeyMissing,
  setContainer,
  className,
}: TurnstileWidgetProps) {
  if (siteKeyMissing) return null;
  return <div ref={setContainer} className={className ?? "min-h-[65px]"} />;
}

export function TurnstileDebugPanel({ visible, diag }: TurnstileDebugPanelProps) {
  if (!visible) return null;

  const rows: Array<[string, string]> = [
    ["widget rendered", diag.widgetRendered ? "yes" : "no"],
    ["callback fired", diag.callbackFired ? "yes" : "no"],
    ["error callback fired", diag.errorCallbackFired ? "yes" : "no"],
    ["expired callback fired", diag.expiredCallbackFired ? "yes" : "no"],
    ["token length", String(diag.tokenLength)],
    ["widget id", diag.widgetId ?? "none"],
  ];

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-brandText">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-4">
          <span className="text-slate-600">{label}</span>
          <span className="font-medium">{value}</span>
        </div>
      ))}
    </div>
  );
}
