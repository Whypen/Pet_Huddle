import type { NativeToastContent } from "./nativeToastCopy";

export type NativeWindowToastPayload = {
  content?: NativeToastContent;
  holdToPause?: boolean;
  id: number;
  message?: string;
  onDismiss?: () => void;
};

type Listener = (payload: NativeWindowToastPayload | null) => void;

const listeners = new Set<Listener>();
let nextToastId = 0;
let currentToast: NativeWindowToastPayload | null = null;

export function showNativeWindowToast(
  payload: Omit<NativeWindowToastPayload, "id">,
): number {
  const next = { ...payload, id: ++nextToastId };
  currentToast = next;
  for (const listener of listeners) listener(next);
  return next.id;
}

export function hideNativeWindowToast(id?: number): void {
  if (id != null && currentToast?.id !== id) return;
  currentToast = null;
  for (const listener of listeners) listener(null);
}

export function subscribeNativeWindowToast(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentToast);
  return () => { listeners.delete(listener); };
}
