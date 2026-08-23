import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(dir, path), "utf8");
const migration = () => read("../../../supabase/migrations/20260815074308_friend_request_decline_is_dismissal.sql");
const rateLimit = () => read("../../../supabase/migrations/20260815074327_rate_limit_attempt_cleanup_off_hot_path.sql");
const noCaps = () => read("../../../supabase/migrations/20260820035030_friend_requests_no_add_caps_and_silent_cooldown.sql");
const sheet = () => read("../components/friends/NativeHuddleFriendsSheet.tsx");
const navigator = () => read("../navigation/RootNavigator.tsx");

describe("declining a friend request is a dismissal", () => {
  it("frees the pair so a decline cannot deadlock either direction", () => {
    const text = migration();
    // Only a pending request occupies the pair; declines leave no blocking row.
    expect(text).toContain("drop index if exists public.native_contact_friend_requests_pair_uidx");
    expect(text).toMatch(/create unique index if not exists native_contact_friend_requests_pending_pair_uidx[\s\S]*?where status = 'pending'/);
    expect(text).toContain("delete from public.native_contact_friend_requests where id = p_request_id");
  });

  it("never returns a stale request id as if the send succeeded", () => {
    const text = migration();
    // The old bug: the fallback select returned a declined row's id with no insert
    // and no notification. Only a live pending request may short-circuit now.
    expect(text).toMatch(/where r\.inviter_id = v_uid and r\.invitee_id = p_invitee_id and r\.status = 'pending';\s*if v_request_id is not null then return v_request_id; end if;/);
    expect(text).not.toContain("on conflict (least(inviter_id, invitee_id), greatest(inviter_id, invitee_id)) do nothing");
  });

  it("waits a day between retries and stops entirely after three declines", () => {
    const text = noCaps();
    expect(text).toContain("if v_count >= 3 then");
    // Three declines ends it. Accepting from either side clears the record, so a
    // pair is never permanently dead -- the other person can still add them back.
    expect(text).toContain("set suppressed_until = 'infinity'::timestamptz");
    expect(text).toMatch(/d\.last_declined_at \+ interval '24 hours' > now\(\)/);
    expect(text).toMatch(/d\.suppressed_until is not null and d\.suppressed_until > now\(\)/);
  });

  it("never tells the sender they were declined", () => {
    const text = noCaps();
    // A cooldown that announces itself reveals the decline, and who made it. Both
    // paths report success and write nothing instead.
    expect(text).not.toContain("request_suppressed");
    expect(text).toMatch(/or d\.last_declined_at \+ interval '24 hours' > now\(\)[\s\S]*?return query select null::uuid, v_target_id, false;/);
    expect(text).toMatch(/or d\.last_declined_at \+ interval '24 hours' > now\(\)[\s\S]*?\) then return null::uuid; end if;/);
    expect(sheet()).not.toContain("request_suppressed");
  });

  it("puts no quota on adding a friend", () => {
    const text = noCaps();
    // Abuse here is per-pair. A global cap punished the person scanning codes at a
    // meetup, not the person pestering one individual.
    expect(text).not.toContain("send_native_contact_friend_request_daily");
    expect(text).not.toContain("send_native_contact_friend_request_minute");
    expect(text).not.toContain("daily_limit_reached");
    expect(text).toContain("raise exception 'request_pending'");
  });

  it("keeps suppression directional and clears it when they do connect", () => {
    const text = migration();
    expect(text).toContain("d.requester_id = v_uid and d.decliner_id = p_invitee_id");
    expect(text).toContain("delete from public.native_contact_friend_request_declines");
    expect(text).toContain("revoke all on table public.native_contact_friend_request_declines from public, anon, authenticated");
  });

  it("keeps the rate-limit sweep off the hot path with an index it can use", () => {
    const text = rateLimit();
    expect(text).toContain("create index if not exists native_chat_rpc_attempts_attempted_at_idx");
    expect(text).toContain("if random() < 0.01 then");
    expect(text).toContain("where attempted_at < now() - interval '1 day'");
  });
});

describe("invite journeys stay intact for every recipient", () => {
  it("holds an add-friend link until a brand new signup finishes onboarding", () => {
    const text = navigator();
    expect(text).toContain('if (path.startsWith("/add-friend") && onboarding?.onboardingCompleted !== true) return;');
    expect(text).toContain("onboarding?.onboardingCompleted, onNavigate");
  });

  it("speaks about links as links, not mistyped codes", () => {
    const text = sheet();
    expect(text).toContain('source === "invite" ? "This invite link has expired or was already used."');
    expect(text).toContain('source === "invite" ? "That\'s your own invite link."');
    expect(text).toContain('addFriendErrorCopy(nextError, "invite")');
  });

  it("confirms above the fold instead of under the friends list", () => {
    const text = sheet();
    const notice = text.indexOf("{notice ? <Text style={styles.notice}>");
    const friendsSegment = text.indexOf('{segment === "friends" ? (');
    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(friendsSegment);
  });

  it("keeps acceptance in the Friends list and leaves conversation opening to an explicit friend tap", () => {
    const text = sheet();
    expect(text).not.toContain("onOpenChatRoom(result.roomId, result.targetUserId)");
    expect(text).toContain("void loadPeers()");
    expect(text).toContain("onOpenChatRoom: (roomId: string, peerUserId: string) => void;");
  });
});
