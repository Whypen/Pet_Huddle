import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatWalkDuration, resolveReturnBanner, resolveToastCopy } from "./nativeToastCopy";

// Enforces app/docs/Contracts/notification_copy_contract.md
const root = path.resolve(__dirname, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const source = read("src/lib/nativeToastCopy.ts");

const allCopy = () => {
  const strings: string[] = [];
  for (const match of source.matchAll(/(?:headline|copy): "((?:[^"\\]|\\.)*)"/g)) strings.push(match[1]);
  return strings;
};

describe("toast copy voice", () => {
  it("never capitalises huddle", () => {
    const offenders = allCopy().filter((value) => /Huddle/.test(value));
    expect(offenders).toEqual([]);
  });

  it("drops the corporate error boilerplate from headlines", () => {
    // "Couldn't <verb> …" is fine — it names the action that failed. What's banned
    // is the vague boilerplate: bare "Unable to", and the "right now" hedge.
    for (const legacy of ["Unable to unmatch right now.", "Couldn't send your message.", "Could not update RSVP."]) {
      const resolved = resolveToastCopy(legacy);
      expect(resolved.tone).toBe("failed");
      expect(resolved.headline).not.toMatch(/^(Unable|Could not)/);
      expect(resolved.headline).not.toMatch(/right now/i);
      expect(resolved.copy).toBeTruthy();
    }
  });

  it("names the action, not the noun, for Wave and Star", () => {
    // A Star creates a chat room (send_star_chat_atomic); a Wave is an interest
    // signal. Copy says what happens, never "Star/Wave sent" or "didn't send".
    const cases = [
      "Star sent", "Wave sent",
      "You can't send a Star to this user right now.", "Cannot send a Wave to this user",
      "Unable to send Star right now. Try again in a moment.", "Unable to send Wave right now",
    ];
    for (const legacy of cases) {
      const { headline } = resolveToastCopy(legacy);
      expect(headline).not.toMatch(/(Star|Wave) (sent|didn't send)/);
      expect(headline).toMatch(/chat|wave/i);
    }
    expect(resolveToastCopy("Star sent").headline).toBe("Chat started");
    expect(resolveToastCopy("Wave sent").headline).toBe("You waved");
  });

  it("never promises an interaction the toast does not have", () => {
    // Tapping a toast dismisses it. Nothing retries on tap, so no copy may say so.
    const offenders = allCopy().filter((value) => /tap (to|and) (retry|try again)/i.test(value));
    expect(offenders).toEqual([]);
  });

  it("keeps plumbing words out of user copy", () => {
    const offenders = allCopy().filter((value) => /\b(session|token|payload|endpoint|cache|sync failed)\b/i.test(value));
    expect(offenders).toEqual([]);
  });

  it("keeps every failure pointed at a next step", () => {
    const failures = [
      "Couldn't load group members.",
      "Unable to load pet profile.",
      "Couldn't send invite.",
      "Discover could not load. Pull to retry.",
      "Community could not load. Pull to refresh.",
      "Failed to load conversations. Pull to refresh.",
    ];
    for (const legacy of failures) expect(resolveToastCopy(legacy).copy).toBeTruthy();
  });

  it("does not sell the product when confirming an action", () => {
    const resolved = resolveToastCopy("Friend added.");
    expect(resolved.tone).toBe("done");
    expect(resolved.headline).toBe("You've got a new friend!");
    expect(`${resolved.headline} ${resolved.copy}`).not.toMatch(/huddle/i);
  });

  it("routes tier limits to the limit tone, not failure", () => {
    expect(resolveToastCopy("You can pin up to 3 posts.").tone).toBe("limit");
    expect(resolveToastCopy("Video upload is for huddle＊ members only.").tone).toBe("limit");
  });

  it("handles interpolated names and unmapped strings", () => {
    expect(resolveToastCopy("Ella Tan is no longer in this group.").headline).toBe("Ella Tan left");
    const unmapped = resolveToastCopy("Unable to frobnicate right now.");
    expect(unmapped.tone).toBe("failed");
    expect(unmapped.headline).toBe("Unable to frobnicate right now.");
    expect(resolveToastCopy("").headline).toBe("");
  });
});

describe("walk return banner", () => {
  it("buckets on elapsed seconds", () => {
    expect(resolveReturnBanner(4 * 60).bucket).toBe("short");
    expect(resolveReturnBanner(19 * 60).bucket).toBe("short");
    expect(resolveReturnBanner(20 * 60).bucket).toBe("normal");
    expect(resolveReturnBanner(48 * 60).bucket).toBe("normal");
    expect(resolveReturnBanner(2 * 60 * 60).bucket).toBe("long");
    expect(resolveReturnBanner(3 * 60 * 60 + 12 * 60).bucket).toBe("long");
  });

  it("talks about the walk and nothing else", () => {
    for (const seconds of [60, 48 * 60, 4 * 60 * 60]) {
      const banner = resolveReturnBanner(seconds);
      expect(`${banner.headline} ${banner.copy}`).not.toMatch(/pin|map|visib|presence|session|cleared/i);
    }
  });

  it("never prints the duration twice on one card", () => {
    for (const seconds of [60, 4 * 60, 48 * 60, 90 * 60, 4 * 60 * 60]) {
      const banner = resolveReturnBanner(seconds);
      const duration = formatWalkDuration(seconds);
      expect(banner.eyebrow).toContain(duration);
      expect(`${banner.headline} ${banner.copy}`).not.toContain(duration);
    }
  });

  it("formats durations the way a person would say them", () => {
    expect(formatWalkDuration(30)).toBe("under a minute");
    expect(formatWalkDuration(4 * 60)).toBe("4 min");
    expect(formatWalkDuration(60 * 60)).toBe("1 hr");
    expect(formatWalkDuration(3 * 60 * 60 + 12 * 60)).toBe("3 hr 12 min");
    expect(formatWalkDuration(-5)).toBe("under a minute");
  });
});

describe("component contract", () => {
  const toast = read("src/components/NativeToast.tsx");
  const banner = read("src/components/NativeReturnBanner.tsx");
  const tokens = read("src/theme/huddleDesignTokens.ts");
  const home = read("src/screens/NativeHomeScreen.tsx");
  const chats = read("src/screens/NativeChatsScreen.tsx");
  const notifications = read("src/components/NativeNotificationsPanel.tsx");

  it("routes transient Chats and notification failures through the shared toast rail", () => {
    expect(chats).not.toContain("styles.statusBanner");
    expect(chats.match(/<ChatsToast message=\{status\}/g)).toHaveLength(1);
    expect(notifications).not.toContain("styles.statusBanner");
    expect(notifications).toContain("<NativeToast message={statusMessage}");
  });

  it("builds all four glass layers plus the scrim on both surfaces", () => {
    // Both surfaces blur at 24. NativeToast reads it from the shared token per the
    // design-system rule; the banner still carries the literal. Pin the resolved
    // value in the token so a change there cannot silently split the two surfaces.
    expect(tokens).toMatch(/huddleFeedbackGlass = \{[\s\S]*?blurAmount: 24/);
    expect(toast).toContain("blurAmount={huddleFeedbackGlass.blurAmount}");
    expect(banner).toContain("blurAmount={24}");
    for (const file of [toast, banner]) {
      expect(file).toContain("LinearGradient");
      expect(file).toContain("rgba(20, 24, 38, 0.10)");
      expect(file).toContain('borderColor: "rgba(255,255,255,0.85)"');
    }
  });

  it("shares the rail, radius and spring", () => {
    for (const file of [toast, banner]) {
      // The rail is clipped at the safe-area edge so the card slides out from
      // behind the Dynamic Island instead of painting over it.
      expect(file).toContain("styles.railClip, { top: insets.top }");
      expect(file).toContain("top: NATIVE_RAIL_TOP_GAP");
      expect(file).toMatch(/railClip: \{[^}]*overflow: "hidden"/s);
      expect(file).toContain("borderRadius: 26");
      expect(file).toContain("damping: 18, stiffness: 190");
      expect(file).toContain("useReducedMotion");
    }
  });

  it("renders huddle bold wherever it appears in a toast", () => {
    expect(toast).toContain("split(/(huddle)/gi)");
    expect(toast).toContain("styles.brand");
  });

  it("holds long enough to actually be read", () => {
    // Under ~3.5s a two-line toast is gone before a person finishes it.
    for (const [file, name] of [[toast, "NATIVE_TOAST_DURATION_MS"], [banner, "NATIVE_RETURN_BANNER_DURATION_MS"]] as const) {
      const ms = Number(file.match(new RegExp(`${name} = (\\d+)`))?.[1]);
      expect(ms).toBeGreaterThanOrEqual(3500);
    }
    for (const screen of ["NativeSocialScreen", "NativeChatDialogueScreen", "NativeChatsScreen", "NativeServiceChatScreen"]) {
      expect(read(`src/screens/${screen}.tsx`)).toContain("NATIVE_TOAST_DURATION_MS");
    }
  });

  it("dismisses every native toast after exactly 4.2 seconds", () => {
    expect(toast).toContain("NATIVE_TOAST_DURATION_MS = 4200");
    expect(toast).toContain("if (!onDismiss) return;");
    expect(toast).not.toContain("if (!holdToPause || !onDismiss) return;");
  });

  it("centers one-line copy and supports only an optional second line", () => {
    expect(toast).toMatch(/text: \{[^}]*alignSelf: "center"[^}]*justifyContent: "center"/s);
    expect(toast).toContain("resolved.copy ? <ToastText");
  });

  it("stays silent for minor updates already confirmed by the changed UI", () => {
    for (const message of ["Post updated.", "Reply updated.", "Notifications on.", "Group muted."]) {
      expect(resolveToastCopy(message).headline).toBe("");
    }
    expect(resolveToastCopy("Profile updated").headline).toBe("Profile updated");
    expect(resolveToastCopy("Profile completed successfully.").headline).not.toBe("");
    expect(resolveToastCopy("Couldn't update your profile.").headline).not.toBe("");
  });

  it("never truncates — the card grows instead", () => {
    for (const file of [toast, banner]) {
      expect(file).not.toContain("numberOfLines");
      expect(file).not.toContain("ellipsizeMode");
    }
    // The card floor is a minHeight so long wording grows it; a fixed height
    // would clip. shadowOffset's height is not a layout height, so check the
    // card block line by line rather than loose-matching the whole thing.
    expect(banner).toContain("minHeight: BANNER_HEIGHT");
    const cardBlock = banner.match(/\n {2}card: \{([\s\S]*?)\n {2}\},/)?.[1] ?? "";
    expect(cardBlock).not.toBe("");
    expect(cardBlock.split("\n").filter((line) => /^\s{4}height:/.test(line))).toEqual([]);
  });

  it("uses huddle+ and huddle＊ for tiers, never Premium or Gold", () => {
    const offenders = allCopy().filter((value) => /\b(Premium|Gold|Plus)\b/.test(value));
    expect(offenders).toEqual([]);
  });

  it("keeps the bear off toasts", () => {
    expect(toast).not.toContain("HuddleBear");
    expect(banner).toContain("HuddleBear");
  });

  it("wires all four bear poses to art that exists on disk", () => {
    const art = read("src/components/art/HuddleBear.tsx");
    for (const [pose, file] of [["happy", "114"], ["unimpressed", "115"], ["neutral", "116"], ["cub", "117"]]) {
      expect(art).toContain(`assets/Notifications/Toast/${file}.png`);
      expect(art).toMatch(new RegExp(`${pose}:\\s*bear`));
      expect(fs.existsSync(path.join(root, `assets/Notifications/Toast/${file}.png`))).toBe(true);
    }
  });

  it("documents every toast string in the real notification contract", () => {
    // ONE notification contract. All user-facing text — push and in-app — lives
    // in notification_copy_contract.md. Never split copy into a second file.
    const copyContract = read("docs/Contracts/notification_copy_contract.md");
    expect(copyContract).toContain("## In-App Toast Copy");
    expect(copyContract).toContain("### Walk-return banner");
    expect(copyContract).toContain("Glass recipe");
    expect(fs.existsSync(path.join(root, "docs/Contracts/native_notification_contract.md"))).toBe(false);

    // Every mapped headline has to appear in the table — no undocumented strings.
    const headlines = [...source.matchAll(/headline: "((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    expect(headlines.length).toBeGreaterThan(60);
    const missing = headlines.filter((h) => !copyContract.includes(h.replace(/\|/g, "\\|")));
    expect(missing).toEqual([]);
  });

  it("drives the banner from server elapsed seconds while the Live Activity keeps finalMessage", () => {
    expect(home).toContain("showReturnSummary(returned.elapsedSeconds)");
    expect(home).toContain("endHomePresenceActivity({ finalMessage: returnSummary })");
    expect(home).toContain("NativeReturnBanner");
  });
});
