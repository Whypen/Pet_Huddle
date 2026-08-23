import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => {
  const callbacks: Array<(payload: unknown) => void> = [];
  const channel = {
    on: vi.fn((_type: string, _filter: unknown, callback: (payload: unknown) => void) => {
      callbacks.push(callback);
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };
  return {
    callbacks,
    channel,
    supabase: { channel: vi.fn(() => channel), removeChannel: vi.fn(async () => undefined) },
  };
});

vi.mock('./supabase', () => ({ supabase: mock.supabase }));

import { createSinglePrivateBroadcastChannel } from './realtimeChannelManager';

describe('shared private Broadcast channel', () => {
  beforeEach(() => {
    mock.callbacks.length = 0;
    vi.clearAllMocks();
  });

  it('multiplexes same-topic consumers onto one subscribed channel', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const a = createSinglePrivateBroadcastChannel('consumer-a', 'user:u:inbox', first);
    const b = createSinglePrivateBroadcastChannel('consumer-b', 'user:u:inbox', second);

    expect(mock.supabase.channel).toHaveBeenCalledTimes(1);
    expect(mock.channel.subscribe).toHaveBeenCalledTimes(1);
    mock.callbacks[0]({ payload: { v: 1, kind: 'chat_message' } });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    await a.dispose();
    expect(mock.supabase.removeChannel).not.toHaveBeenCalled();
    await b.dispose();
    expect(mock.supabase.removeChannel).toHaveBeenCalledTimes(1);
  });
});
