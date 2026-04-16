type DiscoveryPerfStore = {
  pointerDownAt: number | null;
  dragEndAt: number | null;
  commitAt: number | null;
  onsetLatencyMs: number | null;
  exitLatencyMs: number | null;
  promotionLatencyMs: number | null;
  renderCount: number;
  lastPromotedProfileId: string | null;
};

declare global {
  interface Window {
    __HUDDLE_DISCOVERY_METRICS__?: DiscoveryPerfStore;
  }
}

const getStore = (): DiscoveryPerfStore => {
  if (typeof window === "undefined") {
    return {
      pointerDownAt: null,
      dragEndAt: null,
      commitAt: null,
      onsetLatencyMs: null,
      exitLatencyMs: null,
      promotionLatencyMs: null,
      renderCount: 0,
      lastPromotedProfileId: null,
    };
  }
  if (!window.__HUDDLE_DISCOVERY_METRICS__) {
    window.__HUDDLE_DISCOVERY_METRICS__ = {
      pointerDownAt: null,
      dragEndAt: null,
      commitAt: null,
      onsetLatencyMs: null,
      exitLatencyMs: null,
      promotionLatencyMs: null,
      renderCount: 0,
      lastPromotedProfileId: null,
    };
  }
  return window.__HUDDLE_DISCOVERY_METRICS__;
};

export const noteDiscoveryPointerDown = () => {
  const store = getStore();
  store.pointerDownAt = performance.now();
};

export const noteDiscoveryFirstDragFrame = () => {
  const store = getStore();
  if (store.pointerDownAt === null) return;
  store.onsetLatencyMs = performance.now() - store.pointerDownAt;
  store.pointerDownAt = null;
};

export const noteDiscoveryDragEnd = () => {
  const store = getStore();
  store.dragEndAt = performance.now();
};

export const noteDiscoveryFlingResolved = () => {
  const store = getStore();
  if (store.dragEndAt !== null) {
    store.exitLatencyMs = performance.now() - store.dragEndAt;
    store.dragEndAt = null;
  }
};

export const noteDiscoveryCommit = () => {
  const store = getStore();
  store.commitAt = performance.now();
};

export const noteDiscoveryPromotionPaint = (profileId: string | null | undefined) => {
  const store = getStore();
  const normalized = String(profileId || "").trim() || null;
  store.lastPromotedProfileId = normalized;
  if (store.commitAt !== null) {
    store.promotionLatencyMs = performance.now() - store.commitAt;
    store.commitAt = null;
  }
};

export const noteDiscoveryDeckRender = () => {
  const store = getStore();
  store.renderCount += 1;
};
