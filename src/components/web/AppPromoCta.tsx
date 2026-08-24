/**
 * The app door, inside the web product.
 *
 * ONE URL, NO PLATFORM DETECTION. Every variant points at `/get`, which
 * resolves server-side: phones 307 to the right store, desktops get a page with
 * a QR and the web door. Detecting the platform here would be a second
 * implementation of a decision `api/open-app.ts` already owns, and the two would
 * drift.
 *
 * NEVER IN THE WAY. The bar is dismissible and stays dismissed. Nothing here
 * intercepts navigation, covers content, or renders before the content it sits
 * beside. Someone who wants to read an alert and leave must be able to.
 */

import { useState } from "react";
import { Smartphone, X } from "lucide-react";

/** Persisted so a dismissal survives the tab and the visit. */
const DISMISS_KEY = "huddle_web_app_bar_dismissed";

const readDismissed = (): boolean => {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
};

type AppPromoCtaProps =
  | { variant: "rail"; collapsed?: boolean }
  | { variant: "bar" }
  | { variant: "wall"; reason?: string };

export function AppPromoCta(props: AppPromoCtaProps) {
  const [dismissed, setDismissed] = useState(readDismissed);

  if (props.variant === "rail") {
    return (
      <a
        href="/get"
        aria-label="Get the huddle app"
        className="flex h-12 items-center gap-4 rounded-xl px-3 text-[16px] font-semibold text-brandText/75 no-underline transition-colors hover:bg-muted/60 hover:text-brandText"
      >
        <Smartphone className="h-[22px] w-[22px] shrink-0" />
        {props.collapsed ? null : <span>Get huddle</span>}
      </a>
    );
  }

  if (props.variant === "wall") {
    return (
      <a
        href="/get"
        className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-[14px] border border-border px-5 text-[14px] font-bold text-brandText no-underline transition-colors hover:bg-muted/60"
      >
        Get the app
      </a>
    );
  }

  if (dismissed) return null;

  return (
    <div
      role="complementary"
      aria-label="Get the huddle app"
      className="mx-auto mb-2 flex w-full max-w-[680px] items-center gap-3 rounded-[16px] border border-border/70 bg-muted/40 px-4 py-2.5 lg:hidden"
    >
      <Smartphone className="h-[18px] w-[18px] shrink-0 text-brandBlue" aria-hidden />
      <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-brandText">
        huddle tells you first.{" "}
        <a href="/get" className="font-bold text-brandBlue underline-offset-2 hover:underline">
          Get the app →
        </a>
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* A blocked storage write must not stop the bar closing. */
          }
          setDismissed(true);
        }}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-brandText"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default AppPromoCta;
