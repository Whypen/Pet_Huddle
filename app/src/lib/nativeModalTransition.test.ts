import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const transition = () => readFileSync(resolve(dir, "./nativeModalTransition.ts"), "utf8");
const dialogue = () => readFileSync(resolve(dir, "../screens/NativeChatDialogueScreen.tsx"), "utf8");
const service = () => readFileSync(resolve(dir, "../screens/NativeServiceChatScreen.tsx"), "utf8");

describe("native chat modal transitions", () => {
  it("waits for native dismissal and cancels pending opens on unmount", () => {
    const source = transition();
    expect(source).toMatch(/NATIVE_MODAL_DISMISS_MS = 360/);
    expect(source).toMatch(/if \(timerRef\.current\) clearTimeout\(timerRef\.current\)/);
    expect(source).toMatch(/closeCurrent\(\);[\s\S]*setTimeout\(\(\) => \{[\s\S]*openNext\(\)/);
  });

  it("queues menu-to-sheet transitions in friends, groups, and Care", () => {
    expect(dialogue()).toMatch(/Report User[\s\S]*transitionNativeModal/);
    expect(dialogue()).toMatch(/Report group[\s\S]*transitionNativeModal/);
    expect(service()).toMatch(/Leave a Review[\s\S]*transitionNativeModal/);
    expect(service()).toMatch(/Report User[\s\S]*transitionNativeModal/);
  });

  it("keeps confirmations inside an existing group-details modal", () => {
    const groupDetails = readFileSync(resolve(dir, "../screens/NativeChatsScreen.tsx"), "utf8");
    expect(groupDetails).toMatch(/AppDestructiveSlideConfirm[\s\S]*presentation="inline"/);
  });
});
