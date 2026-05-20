import { clearCachedNativeChatMessages, invalidateNativeChatReadCaches, invalidateNativeDiscoveryRelationshipCache } from "./nativeChat";
import { invalidateNativeMapAlertCaches } from "./nativeMapData";
import { invalidateNativeServiceProviderCaches } from "./nativeService";
import { purgeNativeSocialPersistentCache } from "./nativeSocial";

export async function invalidateNativeBlockCascade(options: {
  userId?: string | null;
  roomId?: string | null;
  clearRoomMessages?: boolean;
}) {
  const userId = String(options.userId || "").trim();
  if (!userId) return;
  invalidateNativeDiscoveryRelationshipCache(userId);
  await Promise.allSettled([
    invalidateNativeChatReadCaches(userId),
    options.clearRoomMessages && options.roomId ? clearCachedNativeChatMessages(userId, options.roomId) : Promise.resolve(),
    invalidateNativeMapAlertCaches(),
    invalidateNativeServiceProviderCaches(userId),
    purgeNativeSocialPersistentCache(userId),
  ]);
}
