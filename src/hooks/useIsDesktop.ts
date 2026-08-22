import * as React from "react";

/**
 * True at Tailwind's `lg` breakpoint and above.
 *
 * RESOLVED SYNCHRONOUSLY ON THE FIRST RENDER — and that is the whole point.
 *
 * `use-mobile.tsx` starts `undefined` and fills in from an effect. That is fine
 * for hiding a control, but wrong for choosing a LAYOUT: on a desktop viewport
 * it renders the narrow shape first and the wide shape second, so any subtree
 * that sits in a different position between them is unmounted and remounted.
 * That cost the chats list its scroll position and search text on every desktop
 * load. See the remount test in `chatsTwoPane.test.tsx`.
 *
 * Reading `matchMedia` in the initialiser also means a phone gets `false`
 * immediately and *correctly*, rather than correctly by accident — and the
 * initial value comes from the same source the listener watches, so the two can
 * never disagree.
 *
 * Safe here: this is a Vite SPA with no SSR, so `window` exists on first render
 * and there is no hydration mismatch to worry about.
 *
 * `use-mobile.tsx` has the same latent flaw. It is pre-existing and out of
 * scope — deliberately not touched.
 */
const DESKTOP_BREAKPOINT = 1024;
const DESKTOP_QUERY = `(min-width: ${DESKTOP_BREAKPOINT}px)`;

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    setIsDesktop(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

export default useIsDesktop;
