import { describe, expect, it } from "vitest";
import { AUTH_WALL_COPY, resolveAuthWallCopy } from "./authWallCopy";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Every AuthIntentType must have copy. Keeping this list literal (rather than
// deriving it from the same object under test) is the point: if someone adds an
// intent type without copy, this fails instead of silently passing.
const EVERY_INTENT = [
  "post",
  "reply",
  "like",
  "join-group",
  "broadcast",
  "see-alert",
  "message",
  "create-group",
  "manage-group",
  "edit-profile",
  "profile",
  "notifications",
  "settings",
  "map-location",
  "search",
  "view-media",
  "save-post",
  "pin-post",
  "post-options",
] as const;

describe("auth wall copy", () => {
  it.each(EVERY_INTENT)("%s has copy", (intent) => {
    expect(AUTH_WALL_COPY[intent]).toBeDefined();
  });

  it("covers exactly the intents that exist — no orphans, no gaps", () => {
    expect(Object.keys(AUTH_WALL_COPY).sort()).toEqual([...EVERY_INTENT].sort());
  });

  it.each(EVERY_INTENT)("%s names the action rather than saying 'continue'", (intent) => {
    // The whole reason the wall carries intent is so it never reads as a
    // generic tollbooth. "Sign in to continue" is the failure mode.
    expect(AUTH_WALL_COPY[intent].title.toLowerCase()).not.toContain("continue");
    expect(AUTH_WALL_COPY[intent].eyebrow.trim().length).toBeGreaterThan(0);
    expect(AUTH_WALL_COPY[intent].subtitle.trim().length).toBeGreaterThan(0);
  });

  it("falls back safely for an unknown or absent intent", () => {
    expect(resolveAuthWallCopy(undefined).title).toBe("Sign in to continue");
    expect(resolveAuthWallCopy(null).title).toBe("Sign in to continue");
  });

  it("resolves a known intent to its own copy", () => {
    expect(resolveAuthWallCopy("join-group")).toEqual(AUTH_WALL_COPY["join-group"]);
  });

  it("keeps every locked write entry point on the shared contextual wall", () => {
    const root = join(__dirname, "..", "..", "..");
    const cases = [
      ["src/pages/Chats.tsx", 'requireAuth("join-group"'],
      ["src/components/chat/JoinWithCodeSheet.tsx", 'requireAuth("join-group"'],
      ["src/components/chat/CreateGroupSheet.tsx", 'requireAuth("create-group"'],
      ["src/components/chat/GroupDetailsPanel.tsx", 'requireAuth("manage-group"'],
      ["src/components/profile/edit/ProfilePhotoSlot.tsx", 'requireAuth("edit-profile"'],
      ["src/pages/EditProfile.tsx", 'requireAuth("edit-profile"'],
    ] as const;

    for (const [path, expected] of cases) {
      const source = readFileSync(join(root, path), "utf8");
      expect(source, path).toContain(expected);
      expect(source, path).not.toMatch(/toast\.(?:error|warning)\(["'](?:Please )?Sign in/i);
    }
  });
});
