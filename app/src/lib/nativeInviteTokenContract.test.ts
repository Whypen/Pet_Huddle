import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(dir, path), "utf8");
const migration = () => read("../../../supabase/migrations/20260815065559_single_use_add_friend_invite_tokens.sql");
const codeConsent = () => read("../../../supabase/migrations/20260814160655_huddle_code_friend_request_consent.sql");
const landing = () => read("../../../api/add-friend.ts");
const navigator = () => read("../navigation/RootNavigator.tsx");
const client = () => read("./nativeChat.ts");

describe("single-use add-friend invite token", () => {
  it("is high-entropy, single-use, and expiring", () => {
    const text = migration();
    expect(text).toContain("encode(extensions.gen_random_bytes(32), 'hex')");
    expect(text).toContain("expires_at timestamptz not null default now() + interval '14 days'");
    expect(text).toMatch(/where t\.token = v_token\s*and t\.redeemed_at is null\s*and t\.expires_at > now\(\)\s*for update/s);
    expect(text).toContain("set redeemed_at = now(), redeemed_by = v_actor_id");
  });

  it("keeps the table private and validates the token shape server-side", () => {
    const text = migration();
    expect(text).toContain("revoke all on table public.native_add_friend_invite_tokens from public, anon, authenticated");
    expect(text).toContain("if v_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid_code'");
    expect(text).toContain("revoke all on function public.redeem_native_add_friend_invite_token(text) from public, anon");
  });

  it("connects directly, unlike the guessable six-digit code which stays a request", () => {
    expect(migration()).toContain("public._create_native_friend_match(v_actor_id, v_inviter_id)");
    // The 6-digit path must NOT auto-connect: its space is 10^6 and never expires.
    expect(codeConsent()).not.toContain("public._create_native_friend_match");
    expect(codeConsent()).toContain("insert into public.native_contact_friend_requests(inviter_id, invitee_id, status)");
  });

  it("still refuses blocked pairs, self-redemption, and repeat abuse", () => {
    const text = migration();
    expect(text).toContain("raise exception 'self_code'");
    expect(text).toContain("raise exception 'blocked_relationship'");
    expect(text).toContain("'redeem_native_add_friend_invite_token', '', 20, interval '1 hour'");
    expect(text).toContain("'create_native_add_friend_invite_token', '', 20, interval '1 day'");
  });

  it("carries the token through the landing page and the deep link handler", () => {
    expect(landing()).toContain("?invite=");
    expect(landing()).toMatch(/\/\^\[0-9a-f\]\{64\}\$\/\.test/);
    expect(navigator()).toContain('params?.get("invite")');
    expect(navigator()).toContain("if (code || invite) setAddFriendCodeIntent({ code, invite, nonce: Date.now() })");
  });

  it("exposes both client calls with matching validation", () => {
    const text = client();
    expect(text).toContain("export async function createNativeAddFriendInviteToken");
    expect(text).toContain("export async function redeemNativeAddFriendInviteToken");
    expect(text).toContain('if (!/^[0-9a-f]{64}$/.test(cleanToken)) throw new Error("invalid_code")');
  });
});
