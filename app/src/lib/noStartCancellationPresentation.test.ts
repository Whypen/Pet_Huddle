import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../..");
const screen = readFileSync(join(appRoot, "src/screens/NativeServiceChatScreen.tsx"), "utf8");

describe("no-start terminal presentation", () => {
  it("removes every PIN surface at the scheduled-end cutoff", () => {
    expect(screen).toMatch(/const systemNoStartCancellationPending = Boolean/);
    expect(screen).toMatch(/setTimeout\(\(\) => setHandoffNowMs\(Date\.now\(\)\), deadlineDelayMs \+ 50\)/);
    expect(screen).toMatch(/setSharedStartPin\(""\);[\s\S]{0,100}purgeCachedStartPin\(userId, activeServiceChatId\)/);
    expect(screen).toMatch(/headerRight=\{!systemNoStartCancellationPending && isRequester \?/);
    expect(screen).toMatch(/title=\{systemNoStartCancellationPending \? "Cancelling…"/);
    expect(screen).toMatch(/staticCard=\{systemNoStartCancellationPending\}/);
  });

  it("keeps terminal rows out of active Care while presenting the latest cancellation", () => {
    expect(screen).toMatch(/const terminalCancelledServiceChat = !serviceChat/);
    expect(screen).toMatch(/if \(!serviceChat\) return terminalCancelledServiceChat/);
    expect(screen).toMatch(/terminalCancelledServiceChat[\s\S]{0,100}\? "cancelled"/);
    expect(screen).toMatch(/terminalCancelledServiceChat[\s\S]{0,100}\? "Cancelled"/);
    expect(screen).toContain("service_booking_cancelled:");
    expect(screen).toContain('service_no_start_cancelled: "The care session is overdue and was cancelled under the no-start policy."');
    expect(screen).toMatch(/await clearCachedServiceChatRow\(userId, requestSessionKey, requestRoomId\)/);
  });

  it("uses one owner-only close action and preserves the terminal row in History", () => {
    expect(screen).toMatch(/terminalSystemNoStart && isRequester && !careHistoryHiddenFromChat/);
    expect(screen).toMatch(/title="Care session cancelled"/);
    expect(screen).toMatch(/Care never started before the scheduled end time, so this booking was cancelled\./);
    expect(screen).toMatch(/onPress=\{hideCurrentCareHistory\} variant="secondary">Close/);
    expect(screen).toMatch(/const canInlineHideCurrentCareHistory = Boolean\(canHideCurrentCareHistory && !terminalSystemNoStart\)/);
    expect(screen).toMatch(/readNativeDisplayCacheItem\(serviceHistoryHiddenKey\(userId, terminalServiceChatId\)\)/);
    expect(screen).toMatch(/serviceChatHistoryTerminalAt\(b, isProvider\)/);
    expect(screen).toMatch(/isCancelledServiceChatRow\(chat\)\) return chat\.no_start_resolved_at \|\| chat\.updated_at/);
  });

  it("uses destructive red rather than success green or an active pulse for cancellation", () => {
    expect(screen).toMatch(/terminalDone && !cancelled \? styles\.timelineCurrentLabelTerminal/);
    expect(screen).toMatch(/cancelled \? styles\.timelineCurrentLabelCancelled/);
    expect(screen).toMatch(/if \(isCancellation\)[\s\S]{0,240}styles\.ribbonCancelled/);
    expect(screen).toMatch(/ribbonCancelled:[^\n]+backgroundColor: huddleColors\.validationRed/);
    expect(screen).toMatch(/timelineCurrentLabelCancelled:[^\n]+huddleColors\.validationRed/);
  });

  it("retains the existing replacement-request and carer-review path", () => {
    expect(screen).toMatch(/createNativeServiceChat\(newBookingProviderId/);
    expect(screen).toMatch(/send_service_request", \{ p_chat_id: nextChatId, p_request_card: card \}/);
    expect(screen).toMatch(/!isProvider \|\| !hasRequest \|\| hasQuote \|\| pendingRequestExpired/);
    expect(screen).toMatch(/setActiveSheet\("quote"\)/);
  });
});
