// The top rail belongs to the window, not to a screen.
//
// Screens mount inside `mainRouteLayer`, which carries `paddingTop:
// measuredHeaderHeight`. Yoga positions absolute children inside the padding
// box, so a banner rendered from a screen lands at
// headerHeight + insets.top + offset — below the header, floating mid-screen.
//
// Screens publish here; RootNavigator renders the single rail at window level.

export type NativeBannerPayload = { elapsedSeconds: number };

type Listener = (payload: NativeBannerPayload | null) => void;

const listeners = new Set<Listener>();

export function showNativeReturnBanner(payload: NativeBannerPayload): void {
  for (const listener of listeners) listener(payload);
}

export function hideNativeReturnBanner(): void {
  for (const listener of listeners) listener(null);
}

export function subscribeNativeBanner(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
