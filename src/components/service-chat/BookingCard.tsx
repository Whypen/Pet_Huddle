import { ChevronDown, ChevronUp, Pencil, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { ServiceStatus } from "./types";
import { DisputeBanner } from "./DisputeBanner";

type Props = {
  status: ServiceStatus;
  isRequester: boolean;
  isProvider: boolean;
  submittingAction: boolean;
  requestCard: Record<string, unknown> | null;
  quoteCard: Record<string, unknown> | null;
  hasQuote: boolean;
  onEditRequest: () => void;
  onWithdrawRequest: () => void;
  onEditQuote: () => void;
  onWithdrawQuote: () => void;
};

export const BookingCard = ({
  status,
  isRequester,
  isProvider,
  submittingAction,
  requestCard,
  quoteCard,
  hasQuote,
  onEditRequest,
  onWithdrawRequest,
  onEditQuote,
  onWithdrawQuote,
}: Props) => {
  const [requestExpanded, setRequestExpanded] = useState(true);
  const showDispute = status === "disputed";
  const hasEditableRequest = isRequester && status === "pending";
  const formatDateRange = (rawDates: unknown, fallbackDate: unknown) => {
    const dates = Array.isArray(rawDates)
      ? (rawDates as unknown[]).map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const sorted = dates.length > 0
      ? [...dates].sort()
      : [String(fallbackDate || "").trim()].filter(Boolean);
    if (sorted.length === 0) return "—";
    const format = (iso: string) => {
      const [year, month, day] = iso.split("-");
      if (!year || !month || !day) return iso;
      return `${day}-${month}-${year}`;
    };
    return `From ${format(sorted[0])} to ${format(sorted[sorted.length - 1])}`;
  };
  const serviceLabel = Array.isArray(requestCard?.serviceTypes) && requestCard?.serviceTypes.length
    ? (requestCard.serviceTypes as string[]).join(" · ")
    : String(requestCard?.serviceType || "—");
  const petLabel = String(requestCard?.petName || requestCard?.petId || "Pet");
  const petTypeLabel = String(requestCard?.petType || "Type");
  const dogSize = String(requestCard?.dogSize || "").trim();
  const locationStyleLabel = Array.isArray(requestCard?.locationStyles) && requestCard?.locationStyles.length
    ? (requestCard.locationStyles as string[]).join(", ")
    : "";
  const rateOffered = useMemo(() => {
    const currency = String(requestCard?.suggestedCurrency || "").trim().toUpperCase();
    const price = String(requestCard?.suggestedPrice || "").trim();
    const rate = String(requestCard?.suggestedRate || "").trim();
    if (!price) return null;
    return `Rate offered: ${currency || "HKD"} ${price}${rate ? ` ${rate}` : ""}`;
  }, [requestCard?.suggestedCurrency, requestCard?.suggestedPrice, requestCard?.suggestedRate]);

  return (
    <section className="sticky top-0 z-10 space-y-2">
      {requestCard ? (
        <div className="rounded-2xl bg-card border border-border/40 p-3 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setRequestExpanded((value) => !value)}
              className="inline-flex items-center gap-1 text-sm font-semibold text-brandText"
              aria-expanded={requestExpanded}
            >
              {requestExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              <span>Request</span>
            </button>
            <div className="flex items-center gap-2">
              {hasEditableRequest ? (
                <>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/50 text-brandText hover:bg-muted"
                    onClick={onEditRequest}
                    aria-label="Edit request"
                    title="Edit request"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/50 text-[#ef6450] hover:bg-[#ef6450]/10"
                    onClick={onWithdrawRequest}
                    disabled={submittingAction}
                    aria-label="Withdraw request"
                    title="Withdraw request"
                  >
                    <Undo2 className="h-4 w-4" />
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {requestExpanded ? (
            <>
              <p className="mt-1 text-sm text-brandText">{serviceLabel}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {petLabel} · {petTypeLabel}{dogSize ? ` (${dogSize})` : ""}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatDateRange(requestCard.requestedDates, requestCard.requestedDate)}{" "}
                · {String(requestCard.startTime || "—")} - {String(requestCard.endTime || "—")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {locationStyleLabel ? `${locationStyleLabel} · ` : ""}{String(requestCard.locationArea || "—")}
              </p>
              {rateOffered ? <p className="text-xs text-muted-foreground mt-1">{rateOffered}</p> : null}
            </>
          ) : null}
        </div>
      ) : null}

      {quoteCard ? (
        <div className="rounded-2xl bg-card border border-border/40 p-3 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-brandText">Quote</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-brandText">
                {String(quoteCard.currency || "HKD")} {String(quoteCard.finalPrice || "—")} / {String(quoteCard.rate || "visit")}
              </p>
              {isProvider && status === "pending" ? (
                <>
                  <button type="button" className="text-[11px] text-brandText underline underline-offset-2" onClick={onEditQuote}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-[11px] text-[#ef6450] underline underline-offset-2"
                    onClick={onWithdrawQuote}
                    disabled={submittingAction}
                  >
                    Withdraw
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {String(quoteCard.note || "").trim() ? (
            <p className="mt-1 text-xs text-muted-foreground">{String(quoteCard.note)}</p>
          ) : null}
        </div>
      ) : null}

      {showDispute ? <DisputeBanner role={isRequester ? "requester" : "provider"} /> : null}
    </section>
  );
};
