type NativeMutationListener<T> = (payload: T) => void;

export type NativePetMutationPayload = {
  deleted?: boolean;
  pet?: Record<string, unknown> | null;
  petId: string;
  sessionKey?: string | null;
  userId: string;
};

const petListeners = new Map<string, Set<NativeMutationListener<NativePetMutationPayload>>>();

const clean = (value?: string | null) => String(value || "").trim();

export const publishNativePetMutation = (payload: NativePetMutationPayload) => {
  const userId = clean(payload.userId);
  const petId = clean(payload.petId);
  if (!userId || !petId) return;
  petListeners.get(userId)?.forEach((listener) => listener({ ...payload, petId, userId }));
};

export const subscribeNativePetMutations = (
  userId: string | null | undefined,
  listener: NativeMutationListener<NativePetMutationPayload>,
) => {
  const cleanUserId = clean(userId);
  if (!cleanUserId) return () => undefined;
  const set = petListeners.get(cleanUserId) ?? new Set<NativeMutationListener<NativePetMutationPayload>>();
  set.add(listener);
  petListeners.set(cleanUserId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) petListeners.delete(cleanUserId);
  };
};
