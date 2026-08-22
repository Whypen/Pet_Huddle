import { describe, expect, it } from "vitest";
import { dedupeInboxRowsByPeer, isRenderableInboxRow, parseInboxPreview } from "./ScopedChats";

describe("ScopedChats native inbox parity", () => {
  it("rejects the same malformed direct-room shapes as native", () => {
    expect(isRenderableInboxRow({ chat_id: "room", room_type: "direct", member_count: 2, peer_user_id: "peer" })).toBe(true);
    expect(isRenderableInboxRow({ chat_id: "room", room_type: "direct", member_count: 1, peer_user_id: "peer" })).toBe(false);
    expect(isRenderableInboxRow({ chat_id: "room", room_type: "direct", member_count: 2 })).toBe(false);
    expect(isRenderableInboxRow({ chat_id: "room", room_type: "direct", member_count: 2, peer_user_id: "peer", shape_issue: "duplicate" })).toBe(false);
  });

  it("deduplicates direct rooms by peer and prefers the active conversation", () => {
    const rows = dedupeInboxRowsByPeer([
      { chat_id: "empty", room_type: "direct", member_count: 2, peer_user_id: "peer", created_at: "2026-08-16T10:00:00Z" },
      { chat_id: "active", room_type: "direct", member_count: 2, peer_user_id: "peer", last_message_content: "Hello", last_message_at: "2026-08-15T10:00:00Z" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.chat_id).toBe("active");
  });

  it("decodes native message envelopes instead of exposing JSON", () => {
    expect(parseInboxPreview(JSON.stringify({ text: "Hiiiii", attachments: [] }))).toBe("Hiiiii");
    expect(parseInboxPreview(JSON.stringify({ kind: "huddle_share", share: { chatHeadline: "Shared alert" } }))).toBe("Shared alert");
    expect(parseInboxPreview(JSON.stringify({ attachments: [{ mime: "image/jpeg" }] }))).toBe("Photo");
  });
});
