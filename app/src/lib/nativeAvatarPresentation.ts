import { supabase } from "./supabase";
import { normalizeNativeProfilePhotoPresentationCrop, type NativeProfilePhotoPresentationCrop } from "./nativeProfilePhotos";

const cache = new Map<string, NativeProfilePhotoPresentationCrop | null>();
const pending = new Map<string, Array<(crop: NativeProfilePhotoPresentationCrop | null) => void>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const flush = async () => {
  flushTimer = null;
  const ids = Array.from(pending.keys()).filter((id) => !cache.has(id));
  if (ids.length > 0) {
    const { data, error } = await supabase.rpc("get_native_public_avatar_presentations", { p_user_ids: ids });
    const rows = Array.isArray(data) ? data as Array<{ id?: unknown; avatar_presentation?: unknown }> : [];
    const byId = new Map(rows.map((row) => [String(row.id || ""), row.avatar_presentation]));
    if (!error) {
      ids.forEach((id) => {
        cache.set(id, normalizeNativeProfilePhotoPresentationCrop(byId.get(id)));
      });
    }
  }
  Array.from(pending.entries()).forEach(([id, listeners]) => {
    const crop = cache.get(id) ?? null;
    pending.delete(id);
    listeners.forEach((listener) => listener(crop));
  });
};

/** Coalesces avatar-frame hydration into one profile query per render batch. */
export const loadNativeAvatarPresentation = (userId: string): Promise<NativeProfilePhotoPresentationCrop | null> => {
  const id = userId.trim();
  if (!id) return Promise.resolve(null);
  if (cache.has(id)) return Promise.resolve(cache.get(id) ?? null);
  return new Promise((resolve) => {
    pending.set(id, [...(pending.get(id) ?? []), resolve]);
    if (!flushTimer) flushTimer = setTimeout(() => void flush(), 0);
  });
};

export const cacheNativeAvatarPresentation = (userId: string, crop: unknown) => {
  const id = userId.trim();
  if (id) cache.set(id, normalizeNativeProfilePhotoPresentationCrop(crop));
};
