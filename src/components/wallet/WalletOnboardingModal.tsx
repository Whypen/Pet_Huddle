import { useState, useEffect } from "react";
import { loadConnectAndInitialize, StripeConnectInstance } from "@stripe/connect-js";
import {
  ConnectComponentsProvider,
  ConnectAccountOnboarding,
} from "@stripe/react-connect-js";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { invokeAuthedFunction } from "@/lib/invokeAuthedFunction";

interface WalletOnboardingModalProps {
  open: boolean;
  onExit: () => void;
  onOpenChange: (open: boolean) => void;
}

export function WalletOnboardingModal({
  open,
  onExit,
  onOpenChange,
}: WalletOnboardingModalProps) {
  const [connectInstance, setConnectInstance] = useState<StripeConnectInstance | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const bootstrapAccountSession = async (): Promise<{
    client_secret?: string;
    publishable_key?: string;
  } | null> => {
    const accountBootstrap = await invokeAuthedFunction<{ stripe_account_id?: string }>(
      "create-or-get-stripe-account",
      { body: {}, forceRefresh: true },
    );
    if (accountBootstrap.error) {
      throw accountBootstrap.error;
    }

    const sessionResponse = await invokeAuthedFunction<{
      client_secret?: string;
      publishable_key?: string;
    }>("create-account-session", {
      body: { stripe_account_id: accountBootstrap.data?.stripe_account_id || "" },
      forceRefresh: true,
    });

    if (sessionResponse.error) {
      throw sessionResponse.error;
    }

    return sessionResponse.data;
  };

  // Create a fresh Connect instance each time the modal opens.
  // Destroyed on close to avoid stale Stripe sessions.
  useEffect(() => {
    if (!open) {
      setConnectInstance(null);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    // Holds the first client_secret so Connect.js doesn't need a second round-trip.
    // Subsequent fetchClientSecret calls (session refresh) hit the endpoint fresh.
    let pendingSecret: string | null = null;

    const fetchClientSecret = async (): Promise<string> => {
      if (pendingSecret) {
        const s = pendingSecret;
        pendingSecret = null;
        return s;
      }
      try {
        const data = await bootstrapAccountSession();
        if (!data?.client_secret) {
          throw new Error("wallet_session_missing");
        }
        return data.client_secret;
      } catch {
        if (!cancelled) setLoadError("Could not start wallet setup. Please close and retry.");
        return "";
      }
    };

    (async () => {
      try {
        const data = await bootstrapAccountSession();
        if (cancelled) return;

        if (!data?.client_secret || !data?.publishable_key) {
          setLoadError("Could not start wallet setup. Please close and retry.");
          return;
        }

        // Stash the secret so the first fetchClientSecret() call returns it immediately
        // instead of making a duplicate request.
        pendingSecret = data.client_secret;

        const instance = loadConnectAndInitialize({
          publishableKey: data.publishable_key,
          fetchClientSecret,
          appearance: {
            overlays: "dialog",
            variables: { fontFamily: "inherit", borderRadius: "12px" },
          },
        });

        setConnectInstance(instance);
      } catch {
        if (!cancelled) {
          setLoadError("Could not start wallet setup. Please close and retry.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleExit = () => {
    onOpenChange(false);
    onExit();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md w-full p-0 overflow-hidden"
        style={{
          // Explicit fixed positioning keeps the modal anchored on iOS Safari
          // when the virtual keyboard appears during Stripe form fill.
          position: "fixed",
          maxHeight: "90dvh",
        }}
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/20">
          <DialogTitle className="text-base font-semibold">Set Wallet</DialogTitle>
        </DialogHeader>

        {/* Scrollable inner container — iOS Safari momentum scroll + iframe containment */}
        <div
          style={{
            overflowY: "auto",
            // Required for momentum scrolling on iOS Safari
            WebkitOverflowScrolling: "touch",
            maxHeight: "calc(90dvh - 60px)",
            // Prevent the embedded Stripe iframe from visually escaping the modal
            isolation: "isolate",
            contain: "layout",
          }}
        >
          {loadError ? (
            <p className="p-6 text-sm text-destructive text-center">{loadError}</p>
          ) : !connectInstance ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-muted-foreground" size={24} />
            </div>
          ) : (
            <ConnectComponentsProvider connectInstance={connectInstance}>
              <div className="px-4 py-4">
                <ConnectAccountOnboarding
                  onExit={handleExit}
                  collectionOptions={{
                    fields: "eventually_due",
                    futureRequirements: "include",
                  }}
                />
              </div>
            </ConnectComponentsProvider>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
