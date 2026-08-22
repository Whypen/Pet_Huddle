/**
 * AuthWall — the single gate for every signed-out interaction on web.
 *
 * One centred dialog presentation at every viewport. The wall is an interruptive
 * account decision, not a mobile action sheet, so its geometry stays consistent
 * across desktop and mobile.
 *
 * It composes the existing GlassModal (E3) primitive rather than introducing a
 * separate overlay language.
 *
 * Two rules this component enforces:
 *   1. It never opens on page load. It is only ever a response to an action.
 *      Nothing here mounts itself; callers open it.
 *   2. The action that triggered it is written to storage before any OAuth
 *      redirect, so it can be replayed afterwards (see lib/authIntent.ts).
 */

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { GlassModal } from "@/components/ui/GlassModal";
import { writeAuthIntent, writeAuthReturnTo, type AuthIntent, type AuthIntentType } from "@/lib/authIntent";
import { resolveAuthWallCopy } from "./authWallCopy";

export type AuthWallProps = {
  isOpen: boolean;
  onClose: () => void;
  /** What the person was doing. Drives the copy and the post-auth replay. */
  intent?: AuthIntentType;
  /** The thing being acted on — group id, thread id, alert id. */
  targetId?: string;
  /**
   * Where to land after auth. Defaults to the current location, which is almost
   * always right: the person wants to be back where they were.
   */
  returnTo?: string;
  /**
   * Optional context rendered above the headline — e.g. an alert's public header
   * on the map, so the wall reads as a preview with a gate rather than a blank
   * door.
   */
  context?: ReactNode;
};

export function AuthWall({ isOpen, onClose, intent, targetId, returnTo, context }: AuthWallProps) {
  const navigate = useNavigate();
  const copy = resolveAuthWallCopy(intent);
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  // GlassModal is presentational — it provides no dialog semantics,
  // no focus handling and no Escape key. For a surface this central that is not
  // acceptable, so the behaviour is added here rather than by changing shared
  // primitives that other surfaces already depend on.
  useEffect(() => {
    if (!isOpen) return;

    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    // Focus the first control so keyboard and screen-reader users land inside
    // the wall rather than behind it.
    const focusTimer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      // Focus trap. `aria-modal="true"` tells assistive tech the rest of the
      // page is inert, but it does nothing for the Tab key — without this,
      // keyboard users tab straight out of the dialog into the page behind it,
      // which is exactly the state aria-modal claims is unreachable.
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;

      // No visibility filtering here on purpose. An `offsetParent !== null`
      // check is the usual idiom, but it depends on layout — which jsdom does
      // not implement, so it silently matches nothing under test and the trap
      // appears to work while doing nothing. Every control the wall renders is
      // visible by construction, so the selector alone is the honest check.
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      // Wrap at both ends, and pull focus back in if it has escaped entirely
      // (which can happen when the trigger element is removed while open).
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      // Return focus to whatever opened the wall, so dismissing does not dump
      // the user at the top of the document.
      restoreFocusTo.current?.focus?.();
    };
  }, [isOpen, onClose]);

  const go = (mode: "join" | "signin") => {
    const destination = returnTo ?? `${window.location.pathname}${window.location.search}`;
    writeAuthReturnTo(destination);
    // Persist BEFORE navigating. OAuth performs a full page unload, so anything
    // held in memory at this point is gone by the time we come back.
    if (intent) {
      const intentToStore: Omit<AuthIntent, "createdAt"> = {
        type: intent,
        targetId,
        returnTo: destination,
      };
      writeAuthIntent(intentToStore);
    }
    onClose();
    // `/join` owns both new auth entry points. The legacy `/auth` route remains
    // untouched and is never entered from this web surface.
    // `?next=` carries the destination in the URL as well as in storage: the
    // stored intent is single-shot and only written when there IS an intent, so
    // a plain "Create account" tap would otherwise lose where they were.
    const query = new URLSearchParams({ next: destination });
    if (mode === "signin") query.set("mode", "signin");
    navigate(`/join?${query.toString()}`);
  };

  const body = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="relative flex flex-col"
    >
      {/* Brand bloom behind the content, inside the glass rather than on the
          page, so it moves with the panel and tints what shows through it. */}

      <div className="relative">
        {context ? <div className="mb-4">{context}</div> : null}

        <p className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.24em] text-brandBlue">
          <span
            className="h-[5px] w-[5px] rounded-full bg-[#BFFF00] shadow-[0_0_0_3px_rgba(191,255,0,0.3)]"
            aria-hidden
          />
          {copy.eyebrow}
        </p>

        <h2
          id={titleId}
          className="mt-3 text-[27px] font-extrabold leading-[1.08] tracking-[-0.025em] text-brandText text-balance"
        >
          {copy.title}
        </h2>
        <p id={descriptionId} className="sr-only">
          Choose whether to create an account or sign in, then return to the page you were using.
        </p>
        <div className="mt-7 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => go("join")}
            className="neu-primary h-[54px] w-full rounded-[16px] text-[15.5px] font-bold transition-transform active:scale-[0.985]"
          >
            Create account
          </button>
          <button
            type="button"
            onClick={() => go("signin")}
            className="h-[54px] w-full rounded-[16px] border border-white/60 bg-white/75 text-[15.5px] font-bold text-brandText backdrop-blur-md transition-all hover:border-ring/40 hover:bg-white hover:text-brandBlue"
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} hideClose maxWidth="max-w-[414px]" className="auth-wall-bloom" backdropClassName="!bg-foreground/[0.55]">
      {body}
    </GlassModal>
  );
}

export default AuthWall;
