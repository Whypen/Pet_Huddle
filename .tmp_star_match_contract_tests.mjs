import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const migration = read("./supabase/migrations/20260514003000_star_match_contract_and_hide_invalid_direct_rooms.sql");
const discover = read("./supabase/migrations/20260512182000_fix_discovery_runtime_schema_contract.sql");
const chats = read("./app/src/screens/NativeChatsScreen.tsx");
const nativeChat = read("./app/src/lib/nativeChat.ts");
const publicProfile = read("./app/src/lib/nativePublicProfile.ts");
const modal = read("./app/src/components/profile/NativePublicProfileModal.tsx");

const contains = (source, pattern, label) => {
  assert.match(source, pattern, label);
};

const ordered = (source, patterns, label) => {
  let cursor = -1;
  for (const [pattern, name] of patterns) {
    const match = source.slice(cursor + 1).search(pattern);
    assert.notEqual(match, -1, `${label}: missing ${name}`);
    cursor += match + 1;
  }
};

contains(migration, /create or replace function public\.send_star_chat_atomic/, "Star RPC is overridden");
ordered(migration, [
  [/from public\.user_blocks ub[\s\S]*blocked_relationship/, "hard block rejection"],
  [/from public\.user_unmatches uu[\s\S]*uu\.actor_id = p_target_user_id[\s\S]*uu\.target_id = v_actor_id[\s\S]*unmatched_relationship/, "target -> sender unmatch rejection"],
  [/delete from public\.user_unmatches uu[\s\S]*uu\.actor_id = v_actor_id[\s\S]*uu\.target_id = p_target_user_id/, "sender -> target unmatch clear only"],
  [/v_room_id := public\.ensure_direct_chat_room_for_users/, "canonical direct room reuse/create"],
  [/count\(distinct crm\.user_id\)::int[\s\S]*coalesce\(v_member_count, 0\) <> 2[\s\S]*direct_room_invalid/, "exactly 2 members enforcement"],
  [/insert into public\.matches[\s\S]*on conflict \(user1_id, user2_id\)[\s\S]*is_active = true/, "active match upsert"],
  [/insert into public\.chat_messages/, "Star starter message write"],
], "Star reachable source contract");

contains(publicProfile, /send_star_chat_atomic/, "Frontend calls Star RPC");
contains(publicProfile, /star_notification_enqueue_failed/, "Notification failure is warning-only after Star success");

contains(migration, /e\.room_type = 'direct'[\s\S]*e\.member_count = 2/, "Inbox requires direct member_count = 2");
contains(migration, /e\.peer_user_id is not null/, "Inbox requires peer id");
contains(migration, /from public\.profiles p[\s\S]*p\.id = e\.peer_user_id[\s\S]*coalesce\(p\.account_status::text, 'active'\) = 'active'/, "Inbox requires reachable peer profile");
contains(migration, /from public\.direct_chat_pairs dcp[\s\S]*dcp\.chat_id = e\.chat_id[\s\S]*dcp\.user_low = least\(v\.user_id, e\.peer_user_id\)[\s\S]*dcp\.user_high = greatest\(v\.user_id, e\.peer_user_id\)/, "Inbox requires canonical direct pair");
contains(migration, /create or replace function public\.search_chat_inbox[\s\S]*from public\.get_chat_inbox_summaries\('all', null, null, null, null\)/, "Search delegates to guarded inbox RPC");

contains(discover, /active_matches as \([\s\S]*from public\.matches m[\s\S]*m\.is_active = true/, "Discover builds active match set");
contains(discover, /not exists\(select 1 from active_matches am where am\.target_id = p\.id\)/, "Discover excludes active matches");

contains(chats, /const isMatchedRailRow =[\s\S]*!row\.lastMessageAt[\s\S]*!String\(row\.lastMessageContent \|\| ""\)\.trim\(\)/, "Rail requires no message activity");
contains(chats, /const visibleRows =[\s\S]*!railPeerIds\.has\(String\(row\.peerUserId \|\| ""\)\)/, "Conversation rows exclude rail peers");
contains(chats, /setStatus\("You can't send a Star to this user right now\."\)/, "Chats unreachable Star copy");
contains(chats, /setStatus\("Unable to send Star right now\. Try again in a moment\."\)/, "Chats generic Star copy");
contains(modal, /You can't send a Star to this user right now\./, "Profile modal unreachable Star copy");
contains(modal, /Unable to send Star right now\. Try again in a moment\./, "Profile modal generic Star copy");

contains(chats, /return row\.peerName \|\| row\.chatName \|\| "Conversation"/, "Fallback still exists only after guarded rows enter UI");
contains(migration, /and \(e\.room_type <> 'direct' or e\.shape_issue is null\)/, "Malformed direct rows blocked before render");
contains(nativeChat, /const isRenderableNativeInboxRow =[\s\S]*row\.roomType !== "direct"[\s\S]*row\.memberCount !== 2[\s\S]*!row\.peerUserId[\s\S]*row\.shapeIssue/, "Client also drops malformed direct rows before render");
contains(nativeChat, /\.map\(mapInboxRow\)\.filter\(isRenderableNativeInboxRow\)/, "Inbox fetch applies client malformed-row guard");

console.log("star_match_contract_source_tests: ok");
