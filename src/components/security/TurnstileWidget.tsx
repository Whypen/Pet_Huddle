type TurnstileWidgetProps = {
  siteKeyMissing?: boolean;
  setContainer: (element: HTMLDivElement | null) => void;
  className?: string;
};

export function TurnstileWidget({
  siteKeyMissing,
  setContainer,
  className,
}: TurnstileWidgetProps) {
  if (siteKeyMissing) return null;
  return <div ref={setContainer} className={className ?? "min-h-[65px]"} />;
}
