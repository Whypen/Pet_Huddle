import { describe, expect, it } from "vitest";
import type { NativeChatMessage } from "./nativeChat";
import {
  dismissNativeChatOutboxMessage,
  executeNativeChatOutboxRetry,
  failNativeChatOutboxMessage,
  reconcileNativeChatOutboxMessage,
  reconcileNativeChatRealtimeMessage,
} from "./nativeChatOutbox";

const pendingMessage = (overrides: Partial<NativeChatMessage> = {}): NativeChatMessage => ({
  id: "pending:room-1:1",
  chatId: "room-1",
  senderId: "user-1",
  content: JSON.stringify({
    text: "Keep this message",
    attachments: [{ path: "user-1/photo.jpg", mime: "image/jpeg" }],
    linkPreviewUrl: "https://huddle.pet/post/1",
  }),
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: null,
  localStatus: "pending",
  ...overrides,
});

describe("native chat outbox", () => {
  it("keeps two identical sends distinct by their client message IDs", () => {
    const first = pendingMessage({
      id: "pending:room-1:first",
      content: JSON.stringify({ text: "Same", client_message_id: "first" }),
    });
    const second = pendingMessage({
      id: "pending:room-1:second",
      content: JSON.stringify({ text: "Same", client_message_id: "second" }),
      createdAt: "2026-08-01T00:00:01.000Z",
    });
    const confirmedSecond = pendingMessage({
      id: "message-2",
      content: second.content,
      createdAt: "2026-08-01T00:00:02.000Z",
      localStatus: undefined,
    });

    const reconciled = reconcileNativeChatRealtimeMessage([first, second], confirmedSecond);
    expect(reconciled.map((message) => message.id)).toEqual([first.id, confirmedSecond.id]);
  });

  it("is stable when realtime confirmation arrives before send success", () => {
    const pending = pendingMessage({ content: JSON.stringify({ text: "Hello", client_message_id: "send-1" }) });
    const confirmed = pendingMessage({ id: "message-1", content: pending.content, localStatus: undefined });

    const realtimeFirst = reconcileNativeChatRealtimeMessage([pending], confirmed);
    expect(realtimeFirst).toEqual([confirmed]);
    const sendSuccessSecond = reconcileNativeChatOutboxMessage(realtimeFirst, pending.id, confirmed);
    expect(sendSuccessSecond).toEqual({ messages: realtimeFirst, transitioned: false });
  });

  it("is stable when send success arrives before realtime confirmation", () => {
    const pending = pendingMessage({ content: JSON.stringify({ text: "Hello", client_message_id: "send-1" }) });
    const confirmed = pendingMessage({ id: "message-1", content: pending.content, localStatus: undefined });

    const sendSuccessFirst = reconcileNativeChatOutboxMessage([pending], pending.id, confirmed);
    expect(sendSuccessFirst.messages).toEqual([confirmed]);
    expect(reconcileNativeChatRealtimeMessage(sendSuccessFirst.messages, confirmed)).toEqual([confirmed]);
  });

  it("retains one failed retry bubble when an identical sibling send succeeds", () => {
    const failed = pendingMessage({
      id: "pending:room-1:failed",
      content: JSON.stringify({ text: "Same", client_message_id: "failed" }),
      localStatus: "failed",
    });
    const pending = pendingMessage({
      id: "pending:room-1:sent",
      content: JSON.stringify({ text: "Same", client_message_id: "sent" }),
    });
    const confirmed = pendingMessage({ id: "message-2", content: pending.content, localStatus: undefined });

    const reconciled = reconcileNativeChatRealtimeMessage([failed, pending], confirmed);
    expect(reconciled).toEqual([failed, confirmed]);
  });

  it("removes a failed bubble when realtime proves that exact send committed", () => {
    const failed = pendingMessage({
      content: JSON.stringify({ text: "Delivered despite timeout", client_message_id: "timed-out-send" }),
      localStatus: "failed",
    });
    const confirmed = pendingMessage({ id: "message-committed", content: failed.content, localStatus: undefined });

    expect(reconcileNativeChatRealtimeMessage([failed], confirmed)).toEqual([confirmed]);
  });

  it("keeps legacy realtime compatible without guessing by identical content", () => {
    const legacy = pendingMessage();
    const confirmed = pendingMessage({ id: "message-legacy", localStatus: undefined });
    expect(reconcileNativeChatRealtimeMessage([legacy], confirmed)).toEqual([legacy, confirmed]);
    expect(reconcileNativeChatOutboxMessage([legacy, confirmed], legacy.id, confirmed).messages).toEqual([confirmed]);
  });

  it("executes failure -> retry -> success once and preserves the exact payload", async () => {
    const original = pendingMessage();
    const failed = failNativeChatOutboxMessage([original], original.id);
    expect(failed.transitioned).toBe(true);
    expect(failed.messages[0]).toMatchObject({ content: original.content, localStatus: "failed" });

    const sentPayloads: string[] = [];
    const confirmed = pendingMessage({ id: "message-100", localStatus: undefined });
    const retry = await executeNativeChatOutboxRetry({
      messages: failed.messages,
      pendingId: original.id,
      onPending: (messages) => expect(messages[0]).toMatchObject({ content: original.content, localStatus: "pending" }),
      send: async (message) => {
        sentPayloads.push(message.content);
        return confirmed;
      },
    });
    expect(retry.outcome).toBe("sent");
    expect(retry.messages).toEqual([confirmed]);
    expect(sentPayloads).toEqual([original.content]);

    const duplicateRetry = await executeNativeChatOutboxRetry({
      messages: retry.messages,
      pendingId: original.id,
      send: async () => {
        throw new Error("must not send twice");
      },
    });
    expect(duplicateRetry.outcome).toBe("ignored");
    expect(duplicateRetry.messages).toBe(retry.messages);
  });

  it("returns a failed bubble when the retry transport rejects", async () => {
    const failed = pendingMessage({ localStatus: "failed" });
    const result = await executeNativeChatOutboxRetry({
      messages: [failed],
      pendingId: failed.id,
      send: async () => { throw new Error("offline"); },
    });
    expect(result.outcome).toBe("failed");
    expect(result.messages).toEqual([{ ...failed, localStatus: "failed" }]);
  });

  it("returns a failed bubble when the retry confirmation is malformed", async () => {
    const failed = pendingMessage({ localStatus: "failed" });
    const result = await executeNativeChatOutboxRetry({
      messages: [failed],
      pendingId: failed.id,
      send: async () => ({ ...failed, id: "", localStatus: undefined }),
    });
    expect(result.outcome).toBe("failed");
    expect(result.messages).toEqual([{ ...failed, localStatus: "failed" }]);
  });

  it("does not transition or show failure after realtime already confirmed a retry", () => {
    const pending = pendingMessage({ content: JSON.stringify({ text: "Retry", client_message_id: "retry-1" }) });
    const confirmed = pendingMessage({ id: "message-retry-1", content: pending.content, localStatus: undefined });
    const realtimeConfirmed = reconcileNativeChatRealtimeMessage([pending], confirmed);

    expect(failNativeChatOutboxMessage(realtimeConfirmed, pending.id)).toEqual({
      messages: realtimeConfirmed,
      transitioned: false,
    });
  });

  it("dismisses only failed sends and leaves other messages untouched", () => {
    const confirmed = pendingMessage({ id: "message-1", localStatus: undefined });
    const failed = pendingMessage({ localStatus: "failed" });
    const dismissed = dismissNativeChatOutboxMessage([confirmed, failed], failed.id);
    expect(dismissed).toEqual({ messages: [confirmed], transitioned: true });

    const pending = pendingMessage();
    const ignored = dismissNativeChatOutboxMessage([pending], pending.id);
    expect(ignored.transitioned).toBe(false);
    expect(ignored.messages).toEqual([pending]);
  });
});
