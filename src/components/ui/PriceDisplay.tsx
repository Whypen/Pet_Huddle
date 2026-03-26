// src/components/ui/PriceDisplay.tsx
// Renders a price as "USD$X.XX".
interface Props {
  n: number;
  suffix?: string;
  className?: string;
  currency?: string;
}

export function PriceDisplay({ n, suffix, className, currency = "USD" }: Props) {
  const upperCurrency = String(currency || "USD").toUpperCase();
  let symbol = "$";
  let amountText = Number(n || 0).toFixed(2);
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: upperCurrency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).formatToParts(1);
    const currencyPart = parts.find((part) => part.type === "currency");
    if (currencyPart?.value) symbol = currencyPart.value;
    amountText = new Intl.NumberFormat(navigator.language, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(n || 0));
  } catch {
    // keep fallback symbol
  }
  return (
    <span className={className}>
      <span style={{ fontSize: "0.72em" }}>{upperCurrency}{symbol}</span>
      {amountText}
      {suffix}
    </span>
  );
}
