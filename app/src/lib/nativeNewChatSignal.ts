import AsyncStorage from "@react-native-async-storage/async-storage";
import { readNativeDisplayCacheItem } from "./nativeDisplayCacheStorage";

// A Star creates a chat room and sends nothing, so the unread badge can never
// announce it — `unread_count` only counts messages where `sender_id <> viewer`.
// This is the separate signal: "you started a chat, it's waiting in Chats."
// Gold dot on the Chats tab, cleared the moment the person opens Chats.

const key = (userId: string) => `huddle.newChatSignal.${userId}`;

export async function markNativeNewChatSignal(userId: string): Promise<void> {
  if (!userId) return;
  await AsyncStorage.setItem(key(userId), "1").catch(() => undefined);
}

export async function clearNativeNewChatSignal(userId: string): Promise<void> {
  if (!userId) return;
  await AsyncStorage.removeItem(key(userId)).catch(() => undefined);
}

export async function readNativeNewChatSignal(userId: string): Promise<boolean> {
  if (!userId) return false;
  const value = await readNativeDisplayCacheItem(key(userId));
  return value === "1";
}
