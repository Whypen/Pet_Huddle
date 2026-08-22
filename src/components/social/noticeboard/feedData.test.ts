import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc },
}));

import { hydrateRows, mapFeedRowToThread } from "./feedData";

describe("social feed safety parity", () => {
  beforeEach(() => rpc.mockReset());

  it("does not erase the canonical sensitive flag when optional hydration omits it", async () => {
    rpc
      .mockResolvedValueOnce({
        data: [{ thread_id: "thread-1", share_count: 2 }],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null });

    const thread = mapFeedRowToThread({
      id: "thread-1",
      title: "Safety",
      content: "Sensitive media",
      images: ["https://images.example/sensitive.jpg"],
      is_sensitive: true,
      created_at: "2026-08-11T00:00:00.000Z",
      user_id: "member-1",
    });

    const result = await hydrateRows([thread], {
      deriveAlertTypeFromNoticeData: () => null,
      primeMentionDirectory: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.rows[0]?.is_sensitive).toBe(true);
  });

  it("fails media closed when the app safety hydration RPC is unavailable", async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
      .mockResolvedValueOnce({ data: [], error: null });

    const thread = mapFeedRowToThread({
      id: "thread-2",
      title: "Unknown safety state",
      content: "Copy remains readable",
      images: ["https://images.example/unknown.jpg"],
      created_at: "2026-08-11T00:00:00.000Z",
      user_id: "member-2",
    });

    const result = await hydrateRows([thread], {
      deriveAlertTypeFromNoticeData: () => null,
      primeMentionDirectory: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.rows[0]?.is_sensitive).toBe(true);
  });

  it("fails only an omitted hydration row closed", async () => {
    rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const thread = mapFeedRowToThread({
      id: "thread-3",
      images: ["https://images.example/unknown.jpg"],
      created_at: "2026-08-11T00:00:00.000Z",
      user_id: "member-3",
    });
    const result = await hydrateRows([thread], {
      deriveAlertTypeFromNoticeData: () => null,
      primeMentionDirectory: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.rows[0]?.is_sensitive).toBe(true);
  });

  it("does not erase a verified author when hydration omits verification fields", async () => {
    rpc
      .mockResolvedValueOnce({ data: [{ thread_id: "thread-4" }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const thread = mapFeedRowToThread({
      id: "thread-4",
      author_is_verified: true,
      created_at: "2026-08-11T00:00:00.000Z",
      user_id: "member-4",
    });
    const result = await hydrateRows([thread], {
      deriveAlertTypeFromNoticeData: () => null,
      primeMentionDirectory: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.rows[0]?.author?.is_verified).toBe(true);
  });
});
