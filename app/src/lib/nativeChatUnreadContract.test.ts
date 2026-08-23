import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSrc = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(appSrc, "../..");
const readApp = (path: string) => readFileSync(resolve(appSrc, path), "utf8");
const readRepo = (path: string) => readFileSync(resolve(repo, path), "utf8");

describe("chat unread system-banner contract", () => {
  it("filters typed and legacy system banners in the canonical inbox RPC", () => {
    const migration = readRepo("supabase/migrations/20260714160000_chat_system_banners_do_not_count_unread.sql");
    expect(migration).toMatch(/v_kind in \('group_welcome', 'membership', 'system', 'deleted'\)/);
    expect(migration).toMatch(/v_kind like 'service\\_%'/);
    expect(migration).toMatch(/v_kind like 'care\\_%'/);
    expect(migration).toMatch(/v_kind like 'voluntary\\_%'/);
    expect(migration).toMatch(/and not public\.is_chat_system_banner\(cm\.content\)/);
  });

  it("keeps ordinary member messages countable", () => {
    const chat = readApp("lib/nativeChat.ts");
    expect(chat).toMatch(/kind\.startsWith\("service_"\)/);
    expect(chat).toMatch(/kind\.startsWith\("care_"\)/);
    expect(chat).toMatch(/kind\.startsWith\("voluntary_"\)/);
    expect(chat).not.toMatch(/kind\.startsWith\("huddle_"\)/);
  });

  it("also excludes banners from the dialogue snapshot read hint", () => {
    const dialogue = readApp("screens/NativeChatDialogueScreen.tsx");
    expect(dialogue).toMatch(/!isNativeChatSystemBannerContent\(message\.content\)/);
  });
});
