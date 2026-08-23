const cleanLocationPart = (value: unknown) => String(value || "").trim();

export const extractNativeCityFromMapboxContext = (context?: Array<{ id?: string; text?: string }>) => (
  cleanLocationPart(context?.find((entry) => /^place\./.test(cleanLocationPart(entry.id)))?.text) || null
);
