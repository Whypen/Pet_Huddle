import type { NativeSocialShareTarget } from "./nativeSocial";
import { resolveNativeGroupAvatarUrl, resolveNativeProfileImageUrlAsync } from "./nativeStorageUrlCache";

type ShareChannelLabel = "Care" | "Friend";

type NormalizedNativeSocialShareTarget = NativeSocialShareTarget & {
  channelLabels: Set<ShareChannelLabel>;
  rankMs: number;
};

const cleanString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const nativeSocialShareTargetRankMs = (lastMessageAt: string | null): number => {
  if (!lastMessageAt) return 0;
  const parsed = Date.parse(lastMessageAt);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nativeSocialShareTargetKey = (target: NativeSocialShareTarget): string => {
  if (target.type === "group") return `group:${target.chatId}`;
  if (target.userId) return `user:${target.userId}`;
  if (target.socialId) return `social:${target.socialId.toLowerCase()}`;
  return `chat:${target.chatId}`;
};

const nativeSocialShareTargetSubtitle = (labels: Set<ShareChannelLabel>): string => {
  if (labels.has("Friend")) return "Friend";
  return "Care";
};

export function normalizeNativeSocialShareTargets(rows: unknown[]): NativeSocialShareTarget[] {
  const normalized = rows.map((row) => {
    const item = row as Record<string, unknown>;
    const roomType = cleanString(item.room_type).toLowerCase();
    const type: NativeSocialShareTarget["type"] = roomType === "group" ? "group" : roomType === "service" ? "service" : "direct";
    const socialId = cleanString(item.social_id).replace(/^@+/, "") || null;
    const peerUserId = cleanString(item.user_id) || cleanString(item.peer_user_id) || null;
    const lastMessageAt = cleanString(item.last_message_at) || null;
    const target: NativeSocialShareTarget = {
      avatarUrl: cleanString(item.avatar) || cleanString(item.avatar_url) || null,
      chatId: cleanString(item.chat_id),
      label: cleanString(item.name) || "Conversation",
      lastMessageAt,
      socialId,
      subtitle: type === "group" ? "Group" : type === "service" ? "Care" : "Friend",
      type,
      userId: type === "group" ? null : peerUserId,
    };
    return {
      ...target,
      channelLabels: new Set(type === "service" ? ["Care"] : type === "direct" ? ["Friend"] : []),
      rankMs: nativeSocialShareTargetRankMs(lastMessageAt),
    } satisfies NormalizedNativeSocialShareTarget;
  }).filter((target) => target.chatId);

  normalized.sort((a, b) => b.rankMs - a.rankMs);

  const mergedByKey = new Map<string, NormalizedNativeSocialShareTarget>();
  normalized.forEach((target) => {
    const key = nativeSocialShareTargetKey(target);
    const existing = mergedByKey.get(key);
    if (!existing) {
      mergedByKey.set(key, target);
      return;
    }
    if (existing.type === "service" && target.type === "direct") {
      existing.channelLabels.forEach((label) => target.channelLabels.add(label));
      target.rankMs = Math.max(existing.rankMs, target.rankMs);
      target.avatarUrl = target.avatarUrl || existing.avatarUrl;
      target.label = target.label === "Conversation" ? existing.label : target.label;
      target.socialId = target.socialId || existing.socialId;
      target.userId = target.userId || existing.userId;
      target.subtitle = nativeSocialShareTargetSubtitle(target.channelLabels);
      mergedByKey.set(key, target);
      return;
    }
    target.channelLabels.forEach((label) => existing.channelLabels.add(label));
    existing.avatarUrl = existing.avatarUrl || target.avatarUrl;
    existing.label = existing.label === "Conversation" && target.label !== "Conversation" ? target.label : existing.label;
    existing.socialId = existing.socialId || target.socialId;
    existing.userId = existing.userId || target.userId;
    if (existing.type !== "group") existing.subtitle = nativeSocialShareTargetSubtitle(existing.channelLabels);
  });

  return Array.from(mergedByKey.values())
    .map(({ channelLabels, rankMs, ...target }) => ({
      ...target,
      subtitle: target.type === "group" ? "Group" : nativeSocialShareTargetSubtitle(channelLabels),
    }))
    .sort((a, b) => nativeSocialShareTargetRankMs(b.lastMessageAt) - nativeSocialShareTargetRankMs(a.lastMessageAt));
}

export async function normalizeNativeSocialShareTargetsForDisplay(rows: unknown[]): Promise<NativeSocialShareTarget[]> {
  const targets = normalizeNativeSocialShareTargets(rows);
  return Promise.all(targets.map(async (target) => {
    const avatarUrl = target.type === "group"
      ? resolveNativeGroupAvatarUrl(target.avatarUrl)
      : await resolveNativeProfileImageUrlAsync(target.avatarUrl, 60 * 60, { defaultBucket: "profile_photos" }).catch(() => null);
    return { ...target, avatarUrl };
  }));
}
