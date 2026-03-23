import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NeuButton } from "@/components/ui/NeuButton";
import type { ServiceQuoteCard, ServiceRequestCard } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (card: ServiceQuoteCard) => Promise<void>;
  requestCard: ServiceRequestCard | null;
  initialCard?: ServiceQuoteCard;
};

export const QuoteForm = ({ open, onClose, onSubmit, requestCard, initialCard }: Props) => {
  const [currency, setCurrency] = useState("HKD");
  const [finalPrice, setFinalPrice] = useState("");
  const [rate, setRate] = useState("visit");
  const [note, setNote] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrency(String(initialCard?.currency || "HKD"));
    setFinalPrice(String(initialCard?.finalPrice || ""));
    setRate(String(initialCard?.rate || "visit"));
    setNote(String(initialCard?.note || ""));
    setAttempted(false);
  }, [initialCard, open]);

  const invalidCurrency = !currency.trim();
  const invalidFinalPrice = !finalPrice.trim();
  const invalidRate = !rate.trim();

  const requestServiceLabel =
    requestCard && Array.isArray(requestCard.serviceTypes) && requestCard.serviceTypes.length > 0
      ? requestCard.serviceTypes.join(" · ")
      : String(requestCard?.serviceType || "");
  const requestPetLabel = String(requestCard?.petName || requestCard?.petId || "");
  const requestDogSize = String(requestCard?.dogSize || "").trim();
  const requestLocationStyles =
    requestCard && Array.isArray(requestCard.locationStyles) && requestCard.locationStyles.length > 0
      ? requestCard.locationStyles.join(", ")
      : "";

  const submit = async () => {
    setAttempted(true);
    if (invalidCurrency || invalidFinalPrice || invalidRate) return;
    setSubmitting(true);
    try {
      await onSubmit({
        serviceType: String(requestCard?.serviceType || ""),
        serviceTypes: requestCard?.serviceTypes || [],
        petId: String(requestCard?.petId || ""),
        petName: String(requestCard?.petName || ""),
        petType: String(requestCard?.petType || ""),
        dogSize: String(requestCard?.dogSize || ""),
        requestedDates: requestCard?.requestedDates || [],
        startTime: String(requestCard?.startTime || ""),
        endTime: String(requestCard?.endTime || ""),
        locationStyles: requestCard?.locationStyles || [],
        locationArea: String(requestCard?.locationArea || ""),
        currency: currency.trim().toUpperCase(),
        finalPrice: finalPrice.trim(),
        rate: rate.trim(),
        note: note.trim(),
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send quote</DialogTitle>
          <DialogDescription>Quote can only be sent after request is received.</DialogDescription>
        </DialogHeader>
        {requestCard ? (
          <div className="rounded-[14px] bg-muted/40 p-4 mb-4 space-y-1.5">
            <p className="text-[13px] font-[600] text-brandText">{requestServiceLabel}</p>
            <p className="text-[13px] text-muted-foreground">
              {requestPetLabel} · {requestCard.petType}{requestDogSize ? ` (${requestDogSize})` : ""}
            </p>
            <p className="text-[12px] text-muted-foreground">
              {Array.isArray(requestCard.requestedDates) ? requestCard.requestedDates.join(", ") : String(requestCard.requestedDate || "—")}
            </p>
            <p className="text-[12px] text-muted-foreground">{requestCard.startTime} - {requestCard.endTime}</p>
            <p className="text-[12px] text-muted-foreground">
              {requestLocationStyles ? `${requestLocationStyles} · ` : ""}{requestCard.locationArea}
            </p>
          </div>
        ) : null}
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="Currency" className="h-10 rounded-xl border border-border bg-background px-3" />
            <input value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} placeholder="Final price" className="h-10 rounded-xl border border-border bg-background px-3" />
            <input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Rate" className="h-10 rounded-xl border border-border bg-background px-3" />
          </div>
          {attempted && (invalidCurrency || invalidFinalPrice || invalidRate) ? (
            <p className="text-[11px] text-[#ef6450]">Currency, final price and rate are required.</p>
          ) : null}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Optional note" className="w-full rounded-xl border border-border bg-background px-3 py-2" />
        </div>
        <DialogFooter className="!flex-row gap-2">
          <NeuButton variant="secondary" onClick={onClose}>Cancel</NeuButton>
          <NeuButton onClick={() => void submit()} disabled={submitting}>
            Send quote
          </NeuButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
