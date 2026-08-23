import { describe, expect, it } from "vitest";
import { buildNativeReplyTree } from "./nativeSocialReplyTree";
import type { NativeSocialComment } from "../../lib/nativeSocial";

const comment = (id: string, parentCommentId: string | null = null): NativeSocialComment => ({
  id,
  threadId: "thread-1",
  parentCommentId,
  content: "Hey",
  images: [],
  imageMetadata: [],
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
  userId: "user-1",
  author: {
    displayName: "kuriocollective",
    socialId: null,
    avatarUrl: null,
    verificationStatus: null,
    locationCountry: null,
    isVerified: false,
    nonSocial: false,
  },
  mentions: [],
  supportCount: 0,
  viewerSupported: false,
});

describe("buildNativeReplyTree", () => {
  it("emits each comment id at most once so React keys stay unique", () => {
    const duplicated = [
      comment("pending:comment:1787066492251"),
      comment("pending:comment:1787066492251"),
      comment("real-1"),
    ];
    const tree = buildNativeReplyTree(duplicated, new Set(), new Set());
    const ids = tree.threadedComments.map((item) => item.comment.id);
    expect(ids).toEqual(["pending:comment:1787066492251", "real-1"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("still drops hidden comments and keeps real replies nested", () => {
    const tree = buildNativeReplyTree(
      [comment("root"), comment("child", "root"), comment("hidden")],
      new Set(["root"]),
      new Set(["hidden"]),
    );
    const ids = tree.threadedComments.map((item) => item.comment.id);
    expect(ids).toContain("root");
    expect(ids).toContain("child");
    expect(ids).not.toContain("hidden");
  });
});
