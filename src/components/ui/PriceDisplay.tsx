// src/components/ui/PriceDisplay.tsx
// Renders a price as "US$X.XX" with "US" in slightly smaller text.
interface Props {
  n: number;
  suffix?: string;
  className?: string;
}

export function PriceDisplay({ n, suffix, className }: Props) {
  return (
    <span className={className}>
      <span style={{ fontSize: "0.72em" }}>US</span>${n.toFixed(2)}
      {suffix}
    </span>
  );
}
