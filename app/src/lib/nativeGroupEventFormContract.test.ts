import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const screen = readFileSync(resolve(src, "screens/NativeChatDialogueScreen.tsx"), "utf8");

describe("native recurring group event form contract", () => {
  it("preserves entered date and times when Repeat event is toggled", () => {
    const repeatHandler = screen.slice(screen.indexOf("const next = !repeatEvent;"), screen.indexOf("style={[styles.groupEventToggleRow", screen.indexOf("const next = !repeatEvent;")));
    expect(repeatHandler).not.toMatch(/setDateValue|setStartTime|setEndTime/);
  });

  it("scrolls focused controls and opened dropdowns into view", () => {
    expect(screen).toMatch(/onFocus=\{\(\) => focusEventField\("startTime"\)\}/);
    expect(screen).toMatch(/if \(next\) scrollToEventField\("recurrence"\)/);
    expect(screen).toMatch(/if \(next\) scrollToEventField\("timeZone"\)/);
  });

  it("shows one country-free UTC offset per timezone option", () => {
    expect(screen).toMatch(/groupEventOffsetLabel\(group\.offset\)/);
    expect(screen).toMatch(/seenOffsets\.has\(group\.offset\)/);
    expect(screen).not.toMatch(/groupEventOffsetLabel\(group\.offset\).*countries/);
    expect(screen).toMatch(/`\$\{grouped\} \(\$\{currentTime\}\)`/);
    expect(screen).toMatch(/return `UTC\$\{sign\}\$\{hours\}\$\{remainder \? `:\$\{pad2\(remainder\)\}` : ""\}`/);
    expect(screen).toMatch(/if \(open\) setTimeZoneClockNow\(new Date\(\)\)/);
    expect(screen).not.toMatch(/setInterval\(\(\) => setTimeZoneClockNow/);
  });

  it("prioritizes the group timezone before the user's cached GPS timezone", () => {
    expect(screen).toMatch(/inferGroupEventTimeZone\(room, groupEventUserLocationTimeZone\)/);
    expect(screen).toMatch(/supportedGroupEventTimeZones\(\[event\?\.timeZone \|\| defaultTimeZone, userLocationTimeZone\]\)/);
    expect(screen).toMatch(/readCachedNativeViewerScope\(userId, \{ sessionKey \}\)/);
  });

  it("keeps the visible Repeat event row gap at exactly four pixels", () => {
    expect(screen).toMatch(/groupEventToggleRow: \{ height: 20,/);
    expect(screen).toMatch(/groupEventToggleStack: \{ gap: 4 \}/);
    expect(screen).toMatch(/<Pressable disabled=\{isSeriesEdit\} hitSlop=\{12\}/);
  });
});
