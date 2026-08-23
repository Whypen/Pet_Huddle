import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve(__dirname, "../../../supabase/migrations/20260723120000_friend_out_nearby_2km_cooldown_contract.sql"),
  "utf8",
);

describe("friend-out-nearby notification contract", () => {
  it("uses one global 12-hour recipient cursor", () => {
    expect(migration).toContain("claim_notification_nudge(v_recipient.id, 'friends_out_nearby', interval '12 hours')");
    expect(migration).not.toContain("interval '2 hours'");
    expect(migration).not.toContain("'friend_joined_nearby'");
    expect(migration).not.toContain("'area_active_aggregate'");
  });

  it("requires an active mutual friendship and a strict 2 km distance", () => {
    expect(migration).toContain("from public.matches m");
    expect(migration).toContain("coalesce(m.is_active, true)");
    expect(migration).toMatch(/extensions\.st_dwithin\([\s\S]*?2000/);
  });

  it("excludes hidden users from both the sender and recipient sides of friend-out notifications", () => {
    // Incognito is map_precision='hidden' with hide_from_map=false. Both checks are
    // required: the actor must never cause a nudge, and an incognito recipient must
    // never receive a location-based nudge.
    expect(migration).toMatch(/where p\.id = p_actor_id[\s\S]*?coalesce\(p\.map_precision, 'area'\) <> 'hidden'/);
    expect(migration).toContain("recipient.map_visible_until <= now() - interval '12 hours'");
    expect(migration).toContain("coalesce(recipient.map_precision, 'area') <> 'hidden'");
    expect(migration).toMatch(/from public\.matches m[\s\S]*?coalesce\(p\.map_precision, 'area'\) <> 'hidden'/);
  });

  it("retains the rest of the notification audience privacy gates", () => {
    expect(migration).toContain("coalesce(recipient.hide_from_map, false) = false");
    expect(migration).toContain("not public.is_user_restriction_active(recipient.id, 'map_hidden', now())");
    expect(migration).toContain("not public.is_user_blocked(recipient.id, p_actor_id)");
    expect(migration).toContain("coalesce(recipient.location_retention_until, recipient.location_pinned_until) > now()");
  });

  it("stores independent push and Hub copy and opens Home", () => {
    expect(migration).toContain("'is out nearby — want to join?'");
    expect(migration).toContain("'are out nearby — want to join them?'");
    expect(migration).toContain("' is out near you.'");
    expect(migration).toContain("' are out near you.'");
    expect(migration).toMatch(/'friends_out_nearby',[\s\S]*?v_title,[\s\S]*?v_body,[\s\S]*?'\/'/);
    expect(migration).toContain("'hub_body', v_hub_body");
  });
});
