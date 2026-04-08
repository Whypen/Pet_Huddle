import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NeuButton } from "@/components/ui/NeuButton";
import { supabase } from "@/integrations/supabase/client";
import type { ServiceQuoteCard } from "./types";
import { LegalContent } from "@/components/legal/LegalContent";

type Props = {
  open: boolean;
  onClose: () => void;
  quoteCard: ServiceQuoteCard | null;
  requestServiceType?: string;
  roomId: string;
  onStarted?: () => void;
};

const toAmountCents = (value: string): number => {
  const parsed = Number(String(value || "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
};

export const BookingConfirmScreen = ({ open, onClose, quoteCard, requestServiceType, roomId, onStarted }: Props) => {
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [termsViewed, setTermsViewed] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const canContinue = acceptTerms && termsViewed && !loading;

  const amountCents = useMemo(() => toAmountCents(String(quoteCard?.finalPrice || "")), [quoteCard?.finalPrice]);
  const currency = String(quoteCard?.currency || "HKD").toLowerCase();

  // Fee breakdown for display — server enforces these same rates
  const quotePrice = Number(String(quoteCard?.finalPrice || "0").trim());
  const hasValidPrice = Number.isFinite(quotePrice) && quotePrice > 0;
  const serviceFeeAmount = hasValidPrice ? Math.round(quotePrice * 0.10 * 100) / 100 : 0;
  const totalDue = hasValidPrice ? quotePrice + serviceFeeAmount : 0;
  const displayCurrency = String(quoteCard?.currency || "HKD");

  const pay = async () => {
    if (!quoteCard || !roomId || amountCents <= 0 || !canContinue) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-service-payment", {
        body: {
          service_chat_id: roomId,
          amount_cents: amountCents,
          currency,
          success_url: `${window.location.origin}/service-chat?room=${encodeURIComponent(roomId)}&paid=1`,
          cancel_url: `${window.location.origin}/service-chat?room=${encodeURIComponent(roomId)}&paid=0`,
        },
      });
      if (error) throw error;
      const checkoutUrl = String((data as { url?: string } | null)?.url || "");
      if (!checkoutUrl) throw new Error("checkout_url_missing");
      onStarted?.();
      window.location.href = checkoutUrl;
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm booking</DialogTitle>
          </DialogHeader>
          <div className="rounded-2xl border border-border/40 bg-muted/20 p-3 text-sm space-y-1">
            <p className="text-muted-foreground">{String(requestServiceType || "Service")}</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Provider quote ({String(quoteCard?.rate || "visit")})</span>
              <span>{displayCurrency} {String(quoteCard?.finalPrice || "—")}</span>
            </div>
            {hasValidPrice && (
              <div className="flex justify-between text-muted-foreground">
                <span>Platform service fee (10%)</span>
                <span>{displayCurrency} {serviceFeeAmount.toFixed(serviceFeeAmount % 1 === 0 ? 0 : 2)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-brandText border-t border-border/30 pt-1 mt-1">
              <span>Total you pay</span>
              <span>{hasValidPrice ? `${displayCurrency} ${totalDue % 1 === 0 ? totalDue : totalDue.toFixed(2)}` : "—"}</span>
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
            <span>
              I understand this booking is directly with the provider and I agree to the{" "}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => setTermsOpen(true)}
              >
                Pet Care Service Booking Terms
              </button>
              .
            </span>
          </label>
          {!termsViewed ? (
            <p className="text-xs text-[#ef6450]">Please open and read the booking terms before proceeding.</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Please ensure your pet’s behavior details, address, and emergency contact are accurate to help your provider give the best care.
          </p>
          <DialogFooter className="!flex-row gap-2">
            <NeuButton variant="secondary" onClick={onClose}>Cancel</NeuButton>
            <NeuButton onClick={() => void pay()} disabled={!canContinue}>
              {loading ? "Opening payment..." : "Accept & pay"}
            </NeuButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="max-w-2xl h-[82vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Pet Care Service Booking Terms</DialogTitle>
          </DialogHeader>
          <div
            className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/40 p-4"
            onScroll={(event) => {
              const container = event.currentTarget;
              const nearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 12;
              if (nearBottom) setTermsViewed(true);
            }}
          >
            <LegalContent type="booking-terms" />
          </div>
          <DialogFooter className="!flex-row gap-2">
            <NeuButton variant="secondary" onClick={() => setTermsOpen(false)}>
              Close
            </NeuButton>
            <NeuButton
              onClick={() => setTermsOpen(false)}
              disabled={!termsViewed}
            >
              I have read the terms
            </NeuButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

