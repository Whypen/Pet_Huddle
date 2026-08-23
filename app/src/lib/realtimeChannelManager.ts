import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type RealtimeSubscriptionHandle = {
  channel: RealtimeChannel;
  dispose: () => Promise<void>;
};

type RealtimeStatusCallback = Parameters<RealtimeChannel["subscribe"]>[0];
type BroadcastCallback = (payload: unknown) => void;

type SharedBroadcastEntry = {
  channel: RealtimeChannel;
  callbacks: Map<string, BroadcastCallback>;
  statusCallbacks: Map<string, RealtimeStatusCallback>;
};

const activeRealtimeChannels = new Map<string, RealtimeChannel>();
const sharedBroadcastChannels = new Map<string, SharedBroadcastEntry>();

const toDelete = (channelName: string, channel: RealtimeChannel) => {
  const current = activeRealtimeChannels.get(channelName);
  if (current === channel) {
    activeRealtimeChannels.delete(channelName);
  } else if (current === undefined) {
    activeRealtimeChannels.delete(channelName);
  }
};

export const ensureSingleRealtimeChannel = (
  channelName: string,
  buildChannel: () => RealtimeChannel,
  onStatus?: RealtimeStatusCallback,
): RealtimeSubscriptionHandle => {
  const existing = activeRealtimeChannels.get(channelName);
  if (existing) {
    void supabase.removeChannel(existing);
    activeRealtimeChannels.delete(channelName);
  }

  const channel = buildChannel().subscribe(onStatus);
  activeRealtimeChannels.set(channelName, channel);

  return {
    channel,
    dispose: async () => {
      toDelete(channelName, channel);
      await supabase.removeChannel(channel);
    },
  };
};

export const createSingleRealtimeChannel = (
  channelName: string,
  configureChannel: (channel: RealtimeChannel) => RealtimeChannel,
  onStatus?: RealtimeStatusCallback,
): RealtimeSubscriptionHandle => ensureSingleRealtimeChannel(
  channelName,
  () => configureChannel(supabase.channel(channelName)),
  onStatus,
);

export const createSinglePrivateBroadcastChannel = (
  channelName: string,
  topic: string,
  onBroadcast: BroadcastCallback,
  onStatus?: RealtimeStatusCallback,
): RealtimeSubscriptionHandle => {
  let entry = sharedBroadcastChannels.get(topic);
  if (!entry) {
    const callbacks = new Map<string, BroadcastCallback>();
    const statusCallbacks = new Map<string, RealtimeStatusCallback>();
    const channel = supabase
      .channel(topic, { config: { private: true } })
      .on("broadcast", { event: "changed" }, (payload) => {
        callbacks.forEach((callback) => callback(payload));
      });
    entry = { channel, callbacks, statusCallbacks };
    sharedBroadcastChannels.set(topic, entry);
    channel.subscribe((status, error) => {
      statusCallbacks.forEach((callback) => callback?.(status, error));
    });
  }

  entry.callbacks.set(channelName, onBroadcast);
  if (onStatus) entry.statusCallbacks.set(channelName, onStatus);
  const ownedEntry = entry;

  return {
    channel: entry.channel,
    dispose: async () => {
      ownedEntry.callbacks.delete(channelName);
      ownedEntry.statusCallbacks.delete(channelName);
      if (ownedEntry.callbacks.size > 0) return;
      if (sharedBroadcastChannels.get(topic) === ownedEntry) sharedBroadcastChannels.delete(topic);
      await supabase.removeChannel(ownedEntry.channel);
    },
  };
};
