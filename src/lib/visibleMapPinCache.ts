let visibleUserPinIds = new Set<string>();
const listeners = new Set<(ids: Set<string>) => void>();

export const peekVisibleUserPinIds = (): Set<string> => new Set(visibleUserPinIds);

export const publishVisibleUserPinIds = (ids: Iterable<string>): void => {
  const next = new Set(Array.from(ids, (id) => String(id || "").trim()).filter(Boolean));
  if (Array.from(visibleUserPinIds).sort().join("|") === Array.from(next).sort().join("|")) return;
  visibleUserPinIds = next;
  listeners.forEach((listener) => listener(new Set(next)));
};

export const subscribeVisibleUserPinIds = (listener: (ids: Set<string>) => void): (() => void) => {
  listeners.add(listener);
  listener(peekVisibleUserPinIds());
  return () => { listeners.delete(listener); };
};
