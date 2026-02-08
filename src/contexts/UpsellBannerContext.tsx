/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { UpsellBanner, type UpsellBannerState } from "@/components/monetization/UpsellBanner";

type ShowArgs = {
  message: string;
  ctaLabel?: string;
  onCta?: () => void;
};

type Ctx = {
  showUpsellBanner: (args: ShowArgs) => void;
  hideUpsellBanner: () => void;
};

const UpsellBannerContext = createContext<Ctx | null>(null);

export function UpsellBannerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UpsellBannerState>({
    open: false,
    message: "",
  });

  const hideUpsellBanner = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  const showUpsellBanner = useCallback((args: ShowArgs) => {
    setState({
      open: true,
      message: args.message,
      ctaLabel: args.ctaLabel,
      onCta: args.onCta,
    });
  }, []);

  const value = useMemo(() => ({ showUpsellBanner, hideUpsellBanner }), [hideUpsellBanner, showUpsellBanner]);

  return (
    <UpsellBannerContext.Provider value={value}>
      {children}
      <UpsellBanner state={state} onClose={hideUpsellBanner} />
    </UpsellBannerContext.Provider>
  );
}

export function useUpsellBanner() {
  const ctx = useContext(UpsellBannerContext);
  if (!ctx) throw new Error("useUpsellBanner must be used within UpsellBannerProvider");
  return ctx;
}
