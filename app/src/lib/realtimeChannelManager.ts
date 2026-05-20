import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type RealtimeSubscriptionHandle = {
  channel: RealtimeChannel;
  dispose: () => Promise<void>;
};

type RealtimeStatusCallback = Parameters<RealtimeChannel["subscribe"]>[0];

const activeRealtimeChannels = new Map<string, RealtimeChannel>();

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
