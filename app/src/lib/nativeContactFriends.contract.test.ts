import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(dir, path), "utf8");

describe("contact friend contract", () => {
  const client = read("./nativeContactFriends.ts");
  const chatClient = read("./nativeChat.ts");
  const sheet = read("../components/contacts/NativeContactFriendsSheet.tsx");
  const friendsSheet = read("../components/friends/NativeHuddleFriendsSheet.tsx");
  const settingsDrawer = read("../components/NativeSettingsDrawer.tsx");
  const requests = read("../components/chat/NativeContactFriendRequests.tsx");
  const migration = read("../../../supabase/migrations/20260813144655_native_contact_friend_requests.sql");
  const phoneHashFix = read("../../../supabase/migrations/20260813160230_fix_native_contact_friend_phone_hash.sql");
  const inviterIndex = read("../../../supabase/migrations/20260813164000_index_native_contact_friend_request_inviter.sql");
  const abuseGuardRepair = read("../../../supabase/migrations/20260813171030_repair_contact_friend_acceptance_and_abuse_guards.sql");
  const codeConsentRepair = read("../../../supabase/migrations/20260814160655_huddle_code_friend_request_consent.sql");
  const sourceContract = read("../../../supabase/migrations/20260820104742_friend_request_source_and_realtime_ui_contract.sql");
  const landing = read("../../../api/add-friend.ts");
  const appConfig = read("../../app.json");
  const iosInfo = read("../../ios/huddle/Info.plist");
  const androidManifest = read("../../android/app/src/main/AndroidManifest.xml");

  it("is opt-in, foreground-only, batched, and never persists the address book", () => {
    expect(migration).toContain("contact_discovery_enabled boolean not null default false");
    expect(client).toContain("slice(0, 1000)");
    expect(client).toContain("find_native_contact_friends");
    expect(client).not.toMatch(/AsyncStorage|setInterval|addListener|from\("profiles"\)/);
  });

  it("keeps repeat scans fast without persistent contact storage", () => {
    expect(client).toContain("CONTACT_SCAN_CACHE_MS");
    expect(client).toContain("contactScanInFlight");
    expect(client).toContain("CONTACT_HASH_BATCH_SIZE");
    expect(client).toContain("Promise.all(batch.map");
    expect(sheet).not.toContain("setFriends([])");
    expect(client).not.toMatch(/AsyncStorage|SecureStore|FileSystem/);
  });

  it("has no age gate and sends only normalized hashes to the lookup RPC", () => {
    expect(`${client}\n${sheet}\n${migration}`).not.toMatch(/adult|18\+|age_gate|date_of_birth/i);
    expect(client).toContain("CryptoDigestAlgorithm.SHA256");
    expect(client).toContain("resolveNativeContactCountryCode");
    expect(migration).toContain("value !~ '^[0-9a-f]{64}$'");
    expect(migration).toContain("phone_verification_status = 'verified'");
    expect(phoneHashFix).toContain("regexp_replace(trim(phone), '\\D', '', 'g')");
    expect(phoneHashFix).toContain("regexp_replace(trim(p.phone), '\\D', '', 'g')");
  });

  it("keeps tables private and filters self, blocks, active matches, and incoming requests", () => {
    expect(migration).toContain("revoke all on table public.native_contact_friend_requests from public, anon, authenticated");
    expect(migration).toContain("p.id <> v_uid");
    expect(migration).toContain("public.user_blocks");
    expect(migration).toContain("public.matches");
    expect(migration).toContain("incoming.inviter_id = p.id and incoming.invitee_id = v_uid");
    expect(migration).toContain("= p_contact_key");
    expect(inviterIndex).toContain("on public.native_contact_friend_requests (inviter_id)");
  });

  it("reuses the existing add-code redemption and notification systems", () => {
    expect(migration).toContain("public.get_or_create_native_add_code()");
    expect(migration).toContain("public.redeem_native_add_code(v_code)");
    expect(migration).toContain("'friend_request', 'Friend request'");
    expect(migration).toContain("'/chats?tab=friends'");
  });

  it("keeps the web landing visible instead of forcing a redirect", () => {
    expect(landing).toContain("Open huddle");
    expect(landing).toContain("Get huddle");
    expect(landing).not.toContain("window.location.replace");
    expect(landing).not.toContain("window.location.href");
  });

  it("ships the narrow native contacts permission and add-friend link contract", () => {
    expect(appConfig).toContain('"expo-contacts"');
    expect(appConfig).toContain('"android.permission.READ_CONTACTS"');
    expect(appConfig).toContain('"android.permission.WRITE_CONTACTS"');
    expect(iosInfo).toContain("NSContactsUsageDescription");
    expect(androidManifest).toContain('android.permission.READ_CONTACTS');
    expect(androidManifest).toContain('android.permission.WRITE_CONTACTS" tools:node="remove"');
    expect(androidManifest).toContain('android:pathPrefix="/add-friend"');
  });

  it("keeps requests in Friends without coupling Chats to the contacts sheet", () => {
    expect(requests).toContain("getMyNativeContactFriendRequests");
    expect(requests).toContain("refreshKey");
    expect(requests).toContain(`onErrorRef.current("Couldn't decline. Try again.")`);
    expect(sheet).not.toContain("getMyNativeContactFriendRequests");
  });

  it("updates pending requests live and shows their source with compact actions", () => {
    expect(sourceContract).toContain("source text not null default 'contact_list'");
    expect(sourceContract).toContain("set source = 'qr_code'");
    expect(sourceContract).toContain("set source = 'contact_list'");
    expect(sourceContract).toContain("returns table(request_id uuid, inviter_id uuid, display_name text, created_at timestamptz, source text)");
    expect(client).toContain('source: row.source === "qr_code"');
    expect(requests).toContain("createSingleRealtimeChannel");
    expect(requests).toContain('table: "notifications"');
    expect(requests).not.toContain("onPendingCountChange");
    expect(requests).toContain(">Friend requests</Text>");
    expect(requests).toContain('request.source === "qr_code" ? "from QR code" : "from contact list"');
    expect(requests).toContain('name="x"');
    expect(requests).toContain('name="check"');
    expect(requests).not.toContain(">Decline</Text>");
    expect(requests).not.toContain(">Accept</Text>");
    expect(requests).not.toContain("pendingFriendRequestCount");
  });

  it("silently remembers a declined request without notifying the sender", () => {
    const declineBranch = abuseGuardRepair.slice(
      abuseGuardRepair.indexOf("if coalesce(p_accept, false) is false then"),
      abuseGuardRepair.indexOf("select * into v_match"),
    );
    expect(declineBranch).toContain("set status = 'declined', responded_at = now()");
    expect(declineBranch).not.toContain("enqueue_notification");
    expect(abuseGuardRepair).toContain("if v_request_id is not null then return v_request_id; end if;");
  });

  it("keeps contact and QR friendship independent from Discover", () => {
    const core = abuseGuardRepair.slice(
      abuseGuardRepair.indexOf("create or replace function public._create_native_friend_match"),
      abuseGuardRepair.indexOf("create or replace function public.redeem_native_add_code"),
    );
    expect(core).not.toMatch(/non_social|discovery_opt_out/);
    expect(abuseGuardRepair).toContain("public._create_native_friend_match(v_actor_id, v_target_id)");
    expect(abuseGuardRepair).toContain("public._create_native_friend_match(v_uid, v_inviter_id)");
    expect(abuseGuardRepair).toContain("revoke all on function public._create_native_friend_match(uuid, uuid) from public, anon, authenticated, service_role");
  });

  it("rate-limits lookup and daily outbound requests", () => {
    expect(abuseGuardRepair).toContain("'find_native_contact_friends', '', 6, interval '1 hour'");
    expect(abuseGuardRepair).toContain("'send_native_contact_friend_request_daily', '', 20, interval '1 day'");
  });

  it("guards each request synchronously against double actions", () => {
    expect(requests).toContain("busyRequestIdsRef.current.has(request.requestId)");
    expect(requests).toContain("disabled={busy}");
  });

  it("makes a six-digit huddle Code send the existing consent request", () => {
    expect(codeConsentRepair).toContain("insert into public.native_contact_friend_requests(inviter_id, invitee_id, status)");
    expect(codeConsentRepair).toContain("'friend_request'");
    expect(codeConsentRepair).toContain("return query select null::uuid, v_target_id, false");
    expect(codeConsentRepair).not.toContain("public._create_native_friend_match");
    expect(chatClient).toContain("roomId: string | null");
    expect(friendsSheet).toContain('setToast("Request sent.")');
    expect(friendsSheet).not.toContain('setNotice("Friend added.")');
    expect(friendsSheet).not.toContain("onRedeemed=");
    expect(settingsDrawer).toContain("NativeHuddleFriendsSheet");
  });
});
