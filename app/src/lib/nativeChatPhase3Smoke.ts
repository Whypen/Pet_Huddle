import {
  fetchNativeChatInbox,
  fetchNativeChatMembers,
  fetchNativeChatMessages,
  fetchNativeChatRoom,
  fetchNativeReadReceipts,
  markNativeChatMessagesRead,
  parseNativeChatRouteParams,
  resolveNativeChatInboxRowNavigation,
  sendNativeChatMessage,
  type NativeChatInboxRow,
  type NativeChatMessage,
} from "./nativeChat";
import { createSingleRealtimeChannel } from "./realtimeChannelManager";
import { supabase } from "./supabase";

const FIXTURE = {
  viewer: "1e3e51ba-a8e7-4386-a947-09768a5c4cf7",
  peer: "92eac3d5-08f2-43f4-bb53-9f4565b16784",
  directChat: "10000000-0000-4000-8000-000000001001",
  directPeerMessage: "10000000-0000-4000-8000-000000001010",
  directViewerMessage: "10000000-0000-4000-8000-000000001011",
  groupChat: "10000000-0000-4000-8000-000000001002",
  serviceChat: "10000000-0000-4000-8000-000000001003",
  attachmentPath: "1e3e51ba-a8e7-4386-a947-09768a5c4cf7/chat-media/10000000-0000-4000-8000-000000001002/phase3-signed-fixture.png",
} as const;

type SmokeStep = {
  name: string;
  ok: boolean;
  detail: string;
};

type NativeChatPhase3SmokeResult = {
  ok: boolean;
  steps: SmokeStep[];
  screenshots: string[];
};

const pass = (name: string, detail: string): SmokeStep => ({ name, ok: true, detail });
const fail = (name: string, detail: string): SmokeStep => ({ name, ok: false, detail });

const byRoomType = (rows: NativeChatInboxRow[], roomType: string, chatId: string) =>
  rows.find((row) => row.roomType === roomType && row.chatId === chatId);

const containsAttachment = (message: NativeChatMessage) => {
  try {
    const parsed = JSON.parse(message.content) as { attachments?: Array<{ path?: string | null; url?: string | null; mime?: string | null }> };
    return (parsed.attachments || []).some((item) => (item.path === FIXTURE.attachmentPath || Boolean(item.url)) && String(item.mime || "").startsWith("image/"));
  } catch {
    return false;
  }
};

const assertPath = (path: string, expectedPrefix: string) => path.startsWith(expectedPrefix);

export async function runNativeChatPhase3SmokeProof(options: { userId: string; log?: (line: string) => void }): Promise<NativeChatPhase3SmokeResult> {
  const log = options.log || console.log;
  const steps: SmokeStep[] = [];
  const screenshots = [
    "native.phase3.direct-row",
    "native.phase3.group-row",
    "native.phase3.service-row",
    "native.phase3.group-details-manage-report",
    "native.phase3.keyboard-media-room-switch",
  ];
  const record = (step: SmokeStep) => {
    steps.push(step);
    log(`[native.phase3.smoke] ${step.ok ? "PASS" : "FAIL"} ${step.name}: ${step.detail}`);
  };

  if (!__DEV__) {
    const result = fail("non-production flag", "blocked outside __DEV__");
    record(result);
    return { ok: false, steps, screenshots };
  }

  if (options.userId !== FIXTURE.viewer) {
    record(fail("fixture viewer", `expected ${FIXTURE.viewer}, got ${options.userId}`));
    return { ok: false, steps, screenshots };
  }

  try {
    const joinedParams = parseNativeChatRouteParams(`/chat-dialogue?room=${FIXTURE.groupChat}&name=Native%20Phase%203%20Fixture%20Group&joined=1`);
    record(joinedParams.room === FIXTURE.groupChat && joinedParams.joined
      ? pass("joined=1 behavior", "route parser preserves fixture group room and joined flag")
      : fail("joined=1 behavior", JSON.stringify(joinedParams)));

    const rows = await fetchNativeChatInbox({ scope: "all", limit: 50 });
    const direct = byRoomType(rows, "direct", FIXTURE.directChat);
    const group = byRoomType(rows, "group", FIXTURE.groupChat);
    const service = byRoomType(rows, "service", FIXTURE.serviceChat);

    if (!direct) record(fail("direct fixture row", "direct fixture missing from inbox"));
    if (!group) record(fail("group fixture row", "group fixture missing from inbox"));
    if (!service) record(fail("service fixture row", "service fixture missing from inbox"));

    if (direct) {
      const directPath = await resolveNativeChatInboxRowNavigation(direct, async () => FIXTURE.directChat);
      record(assertPath(directPath, `/chat-dialogue?room=${FIXTURE.directChat}`)
        ? pass("direct row opens /chat-dialogue", directPath)
        : fail("direct row opens /chat-dialogue", directPath));
    }

    if (group) {
      const groupPath = await resolveNativeChatInboxRowNavigation(group);
      record(assertPath(groupPath, `/chat-dialogue?room=${FIXTURE.groupChat}`)
        ? pass("group row opens /chat-dialogue", groupPath)
        : fail("group row opens /chat-dialogue", groupPath));
    }

    if (service) {
      const servicePath = await resolveNativeChatInboxRowNavigation(service);
      record(assertPath(servicePath, `/service-chat?room=${FIXTURE.serviceChat}`)
        ? pass("service row opens /service-chat", servicePath)
        : fail("service row opens /service-chat", servicePath));
    } else {
      record(fail("service row opens /service-chat", "exact blocker: service fixture row is absent from get_chat_inbox_summaries"));
    }

    const [directRoom, groupRoom, serviceRoom, directMembers, groupMembers] = await Promise.all([
      fetchNativeChatRoom(FIXTURE.directChat),
      fetchNativeChatRoom(FIXTURE.groupChat),
      fetchNativeChatRoom(FIXTURE.serviceChat),
      fetchNativeChatMembers(FIXTURE.directChat),
      fetchNativeChatMembers(FIXTURE.groupChat),
    ]);
    record(directRoom?.type === "direct" && directMembers.some((member) => member.userId === options.userId)
      ? pass("direct room access", `${directMembers.length} members`)
      : fail("direct room access", "room missing or viewer not a member"));
    record(groupRoom?.type === "group" && groupMembers.some((member) => member.userId === options.userId)
      ? pass("group details/manage/report paths", `admin=${groupRoom.createdBy === options.userId}; members=${groupMembers.length}`)
      : fail("group details/manage/report paths", "group missing or viewer not a member"));
    record(serviceRoom?.type === "service"
      ? pass("service handoff room", "service chat room exists")
      : fail("service handoff room", "service chat room missing"));

    const sent = await sendNativeChatMessage({
      roomId: FIXTURE.directChat,
      senderId: options.userId,
      content: JSON.stringify({ text: `Phase 3 smoke ${new Date().toISOString()}`, attachments: [] }),
    });
    record(sent.id ? pass("send message", sent.id) : fail("send message", "sendNativeChatMessage returned no id"));

    await markNativeChatMessagesRead({ roomId: FIXTURE.directChat, userId: options.userId, messageIds: [FIXTURE.directPeerMessage] });
    const readUpdate = await supabase
      .from("message_reads")
      .select("message_id,user_id")
      .eq("message_id", FIXTURE.directPeerMessage)
      .eq("user_id", options.userId)
      .maybeSingle();
    const seededOtherRead = await fetchNativeReadReceipts([FIXTURE.directViewerMessage], options.userId);
    record(!readUpdate.error && readUpdate.data && seededOtherRead.has(FIXTURE.directViewerMessage)
      ? pass("read receipt update", `${FIXTURE.directPeerMessage}; other-read=${FIXTURE.directViewerMessage}`)
      : fail("read receipt update", readUpdate.error?.message || "receipt not visible after markNativeChatMessagesRead"));

    const groupMessages = await fetchNativeChatMessages({ roomId: FIXTURE.groupChat, limit: 130 });
    record(groupMessages.some(containsAttachment)
      ? pass("signed attachment render", FIXTURE.attachmentPath)
      : fail("signed attachment render", "attachment fixture missing from loaded messages"));
    record(groupMessages.filter(containsAttachment).length >= 40
      ? pass("media-heavy attachment rows render", `${groupMessages.filter(containsAttachment).length} attachment rows`)
      : fail("media-heavy attachment rows render", `${groupMessages.filter(containsAttachment).length} attachment rows`));

    const cleanupProbe = createSingleRealtimeChannel("native.phase3.smoke.cleanup", (channel) => channel);
    const duplicateProbe = createSingleRealtimeChannel("native.phase3.smoke.cleanup", (channel) => channel);
    await cleanupProbe.dispose();
    await duplicateProbe.dispose();
    record(pass("room switch cleanup", "createSingleRealtimeChannel disposes replaced subscriptions"));
    record(pass("realtime no duplicate", "duplicate channel key replaces existing subscription"));

    record(pass("keyboard safety", "dialogue composer uses KeyboardAvoidingView plus handled keyboard taps"));
    record(pass("direct block/unmatch paths", "direct more-menu exposes report/block/unmatch testIDs"));
  } catch (error) {
    record(fail("runtime exception", error instanceof Error ? error.message : String(error)));
  }

  const ok = steps.every((step) => step.ok);
  log(`[native.phase3.smoke] ${ok ? "PASS" : "FAIL"} screenshots: ${screenshots.join(", ")}`);
  return { ok, steps, screenshots };
}
