export type NativePermissionKind = "camera" | "contacts" | "location" | "notifications" | "photo_library_add" | "photo_library_read";
export type NativePermissionState = "unknown" | "granted" | "denied";
export type NativePermissionDetail = {
  canAskAgain: boolean;
  state: NativePermissionState;
};

const details = new Map<NativePermissionKind, NativePermissionDetail>();
const listeners = new Map<NativePermissionKind, Set<(detail: NativePermissionDetail) => void>>();

export function readNativePermissionDetail(kind: NativePermissionKind): NativePermissionDetail {
  return details.get(kind) ?? { canAskAgain: true, state: "unknown" };
}

export function publishNativePermissionDetail(kind: NativePermissionKind, detail: NativePermissionDetail) {
  details.set(kind, detail);
  listeners.get(kind)?.forEach((listener) => {
    try {
      listener(detail);
    } catch {
      // One mounted surface must not prevent every other screen from receiving
      // the same OS permission transition.
    }
  });
  return detail;
}

export function subscribeNativePermissionDetail(kind: NativePermissionKind, listener: (detail: NativePermissionDetail) => void) {
  const kindListeners = listeners.get(kind) ?? new Set<(detail: NativePermissionDetail) => void>();
  kindListeners.add(listener);
  listeners.set(kind, kindListeners);
  listener(readNativePermissionDetail(kind));
  return () => {
    kindListeners.delete(listener);
    if (kindListeners.size === 0) listeners.delete(kind);
  };
}
