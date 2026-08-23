import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(dir, "../..");
const read = (path: string) => readFileSync(resolve(appRoot, path), "utf8");

describe("verified-only Lost/Stray broadcast audience", () => {
  it("keeps create opt-in off by default and lets a verified-only alert still cross-post", () => {
    const source = read("src/components/map/NativeBroadcastModal.tsx");
    const broadcastLib = read("src/lib/nativeBroadcast.ts");
    expect(source).toContain("const [verifiedOnly, setVerifiedOnly] = useState(false)");
    expect(source).toContain("Visible to verified users only");
    expect(source).toContain("backgroundColor: huddleColors.success");
    expect(source).toContain('name="check-circle"');

    // Verified-only alerts now cross-post to Social scoped to verified viewers, so the
    // client must not suppress the Social opt-in any more. These three layers each
    // independently blocked it and each has to stay gone: a silent state reset, a
    // disabled control, and an overridden request payload.
    expect(source).not.toContain("if (next) setPostOnThreads(false)");
    expect(source).not.toContain("disabled={verifiedOnly}");
    expect(source).not.toContain("verifiedOnly ? false : postOnThreads");
    expect(broadcastLib).not.toContain("verifiedOnly ? false : postOnThreads");
  });

  it("uses the same audience control in Edit and explains destructive Social removal only there", () => {
    const source = read("src/components/map/NativeAlertDetailModal.tsx");
    expect(source).toContain("loadNativeBroadcastVerifiedOnly");
    expect(source).toContain("verified_only: editVerifiedOnly");
    // The post is no longer destroyed on flip -- it survives, scoped to verified viewers.\n    expect(source).toContain("Your Community post stays up, visible to verified users only. Unverified users will no longer see this alert on the Map.");\n    expect(source).not.toContain("This will remove your Community post.");
    expect(source).toContain("editVerifiedOnly && !savedVerifiedOnly && isSocial");
    expect(source).toContain("Verified User only");
  });

  it("uses capability links for explicit sharing without weakening ordinary visibility", () => {
    const modal = read("src/components/map/NativeAlertDetailModal.tsx");
    const mapData = read("src/lib/nativeMapData.ts");
    const directShareMigration = read("../supabase/migrations/20260718130000_verified_alert_direct_share_access.sql");
    expect(modal).toContain("createNativeBroadcastAlertShareToken");
    expect(modal).toContain("`${sharePath}?access=${encodeURIComponent(shareToken)}`");
    expect(mapData).toContain("get_broadcast_alert_by_share_token");
    expect(directShareMigration).toContain("broadcast_alert_share_links");
    expect(directShareMigration).toContain("grant execute on function public.get_broadcast_alert_by_share_token(uuid, uuid) to anon, authenticated, service_role");
    expect(directShareMigration).toContain("get_broadcast_alert_by_id_before_verified_audience");
  });

  it("lets signed-in direct-link recipients interact without adding them to Map discovery", () => {
    const interactionMigration = read("../supabase/migrations/20260718140000_verified_alert_link_interactions.sql");
    expect(interactionMigration).toContain("broadcast_alert_share_viewers");
    expect(interactionMigration).toContain("can_interact_with_verified_only_broadcast");
    expect(interactionMigration).toContain("native_map_upsert_alert_interaction_before_share_access");
    expect(interactionMigration).not.toContain("get_visible_map_pin_shells");
    expect(interactionMigration).not.toContain("notify_on_broadcast_alert_insert");
    expect(interactionMigration).not.toContain("get_social_feed");
  });

  it("enforces one canonical server audience across list, detail, shells, interactions, Social, and notifications", () => {
    const migration = read("../supabase/migrations/20260718120000_broadcast_verified_only_audience.sql");
    expect(migration).toContain("verified_only boolean not null default false");
    expect(migration).toContain("viewer.verification_status::text = 'verified'");
    expect(migration).toContain("get_visible_broadcast_alerts_before_verified_audience");
    expect(migration).toContain("get_broadcast_alert_by_id_before_verified_audience");
    expect(migration).toContain("get_visible_map_pin_shells_before_verified_audience");
    expect(migration).toContain("trg_enforce_broadcast_interaction_audience");
    expect(migration).toContain("set is_public = false");
    expect(migration).toContain("set thread_id = null");
    expect(migration).toContain("recipient.verification_status::text is distinct from 'verified'");
    expect(migration).toContain("p.verification_status::text = 'verified'");
  });
});
