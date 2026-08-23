import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Guards against the two "schema/code drift" regressions found 2026-06-25, both of
// which silently rolled back the entire care-booking transaction (no UI signal):
//   1. insert_care_agreement_notification() inserted type 'service_booking', which
//      was missing from the notifications_type_check allow-list -> every quote,
//      signature, and booking confirmation rolled back.
//   2. can_deliver_notification() referenced notification_preferences.vet / .email
//      after those columns were renamed to care / systems -> every care/systems
//      notification (incl. send_service_request) rolled back.
// Both are statically checkable from the migration SQL, which is the source applied
// to prod. notification_type allow-lists are append-only, so "every type ever passed
// to the helper must be in the latest allow-list" is a robust, low-false-positive
// invariant.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationsDir = resolve(root, "supabase/migrations");
const allSql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort() // timestamp-prefixed -> chronological
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
  .join("\n");

// Parse the argument list of a SQL function call starting at the '(' index,
// respecting single-quoted strings (incl. '' escapes) and nested parens.
const callArgsAt = (src: string, openParen: number): string[] => {
  const args: string[] = [];
  let cur = "";
  let depth = 0;
  let inStr = false;
  for (let i = openParen; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      cur += c;
      if (c === "'") {
        if (src[i + 1] === "'") { cur += "'"; i++; } else { inStr = false; }
      }
      continue;
    }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === "(") { depth++; if (depth === 1) continue; cur += c; continue; }
    if (c === ")") { depth--; if (depth === 0) { args.push(cur.trim()); break; } cur += c; continue; }
    if (c === "," && depth === 1) { args.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  return args;
};

const latestAllowedNotificationTypes = (): Set<string> => {
  const re = /add constraint notifications_type_check\s+check\s*\(\s*type\s*=\s*any\s*\(\s*array\[([\s\S]*?)\]/gi;
  let last: string | null = null;
  for (const m of allSql.matchAll(re)) last = m[1];
  if (!last) throw new Error("notifications_type_check allow-list not found in migrations");
  return new Set([...last.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
};

// type is the 6th positional arg (index 5) of insert_care_agreement_notification(...)
const careNotificationTypesUsed = (): Set<string> => {
  const used = new Set<string>();
  for (const m of allSql.matchAll(/insert_care_agreement_notification\s*\(/gi)) {
    const openParen = (m.index ?? 0) + m[0].length - 1;
    const args = callArgsAt(allSql, openParen);
    const lit = (args[5] || "").match(/^'([a-z_]+)'$/);
    if (lit) used.add(lit[1]);
  }
  return used;
};

const latestFunctionBody = (name: string): string => {
  const re = new RegExp(`create or replace function public\\.${name}\\b`, "gi");
  let lastIdx = -1;
  for (const m of allSql.matchAll(re)) lastIdx = m.index ?? lastIdx;
  if (lastIdx < 0) throw new Error(`function ${name} not found in migrations`);
  const after = allSql.slice(lastIdx);
  const tag = after.match(/\$[a-zA-Z_]*\$/)?.[0];
  if (!tag) throw new Error(`dollar-quoted body for ${name} not found`);
  const start = after.indexOf(tag);
  const end = after.indexOf(tag, start + tag.length);
  return after.slice(start, end + tag.length);
};

describe("care notification schema/code drift guard", () => {
  it("every notification type passed to insert_care_agreement_notification is in the latest allow-list", () => {
    const allowed = latestAllowedNotificationTypes();
    const used = careNotificationTypesUsed();
    expect(used.size, "expected to find care notification type literals").toBeGreaterThan(0);
    const missing = [...used].filter((t) => !allowed.has(t));
    expect(missing, `notification type(s) not permitted by notifications_type_check: ${missing.join(", ")}`).toEqual([]);
  });

  it("service_booking is permitted (the 2026-06-25 booking-flow regression)", () => {
    expect(latestAllowedNotificationTypes().has("service_booking")).toBe(true);
  });

  it("can_deliver_notification references the renamed columns, not the dropped ones", () => {
    const body = latestFunctionBody("can_deliver_notification");
    // renamed-away columns must not be referenced as record fields
    expect(/v_pref\.vet\b/.test(body), "can_deliver_notification still references dropped column v_pref.vet").toBe(false);
    expect(/v_pref\.email\b/.test(body), "can_deliver_notification still references dropped column v_pref.email").toBe(false);
    // current columns must be referenced
    expect(/v_pref\.care\b/.test(body)).toBe(true);
    expect(/v_pref\.systems\b/.test(body)).toBe(true);
  });

  it("no-start resolution covers legacy unversioned bookings and emits both Care surfaces", () => {
    const body = latestFunctionBody("resolve_expired_service_no_starts");
    expect(body).toContain("public.service_no_start_end_at(sc) <= now()");
    expect(body).not.toMatch(/booking_snapshot\s*->\s*'noStartPolicy'\s*->>\s*'version'\s+is\s+not\s+null/i);
    expect(body).toContain("v_policy_version is null then");
    expect(body).toMatch(/v_refund\s*:=\s*v_total;\s*v_status\s*:=\s*'pending_refund'/);
    expect(body).toContain("v_retained := v_total;");
    expect(body).toContain("cancellation_provider_payout_cents = 0");
    expect(body).toContain("'service_no_start_cancelled'");
    expect(body).toContain("Care Session: No-start Cancellation");
    expect(body).toContain("The care session is overdue and was cancelled under the no-start policy.");
    expect(body.match(/perform public\.service_notify/g)?.length).toBe(2);
  });
});

describe("rich push notification contract guard", () => {
  it("push dispatch is preference-gated and does not require push_and_in_app delivery metadata", () => {
    const body = latestFunctionBody("dispatch_expo_push_for_notification");
    expect(body).toContain("public.notification_category");
    expect(body).toContain("notification_preferences");
    expect(body).toContain("v_allowed is not true");
    expect(body).not.toMatch(/<>\s*'push_and_in_app'/);
  });

  it("push dispatch keeps title, body, and image payload fields for iOS and Android rich push", () => {
    const source = readFileSync(resolve(root, "supabase/functions/dispatch-rich-push/index.ts"), "utf8");
    expect(source).toContain('title: notification.title || "Huddle"');
    expect(source).toContain('body: notification.body || notification.message || ""');
    expect(source).toContain("rich_image_url");
    expect(source).toContain("rich_image_masked");
    expect(source).toContain("mutableContent");
    expect(source).toContain("richContent");
    expect(source).toContain("richContentImage");
    expect(source).toContain('.select("token,platform")');
  });

  it("push dispatch records delivery attempts without storing full Expo tokens", () => {
    const body = latestFunctionBody("dispatch_expo_push_for_notification");
    const source = readFileSync(resolve(root, "supabase/functions/dispatch-rich-push/index.ts"), "utf8");
    expect(allSql).toContain("create table if not exists public.push_delivery_attempts");
    expect(body).toContain("v_request_id := net.http_post");
    expect(body).toContain("insert into public.push_delivery_attempts");
    expect(body).toContain("payload_summary");
    expect(source).toContain("token_count: expoTokens.length");
  });

  it("native push token registration moves the current device token away from stale users", () => {
    const body = latestFunctionBody("register_native_push_token");
    expect(body).toContain("v_user_id uuid := auth.uid()");
    expect(body).toContain("where token = v_token");
    expect(body).toContain("and user_id <> v_user_id");
    expect(body).toContain("set is_active = false");
    expect(body).toContain("on conflict (user_id, token) do update");
    expect(body).toContain("fcm_token = v_token");
  });

  it("private Care update images use existing Vault-backed signing through dispatch-rich-push", () => {
    const body = latestFunctionBody("dispatch_expo_push_for_notification");
    expect(body).toContain("vault.decrypted_secrets");
    expect(body).toContain("supabase_project_url");
    expect(body).toContain("supabase_service_role_key");
    expect(body).toContain("/functions/v1/dispatch-rich-push");
    expect(body).not.toContain("app.settings.supabase_url");
    expect(body).not.toContain("app.settings.service_role_key");
  });

  it("dispatch-rich-push stores Expo ticket responses for private rich image debugging", () => {
    const source = readFileSync(resolve(root, "supabase/functions/dispatch-rich-push/index.ts"), "utf8");
    expect(source).toContain("push_delivery_attempts");
    expect(source).toContain("recordDeliveryAttempt");
    expect(source).toContain("expoResponse.status");
    expect(source).toContain("has_rich_content");
    expect(source).toContain("rich_image_masked");
    expect(source).toContain("result");
    expect(source).toContain("skipped: \"no_push_tokens\"");
  });

  it("dispatch-rich-push accepts the existing Supabase service-role bearer used by the DB trigger", () => {
    const source = readFileSync(resolve(root, "supabase/functions/dispatch-rich-push/index.ts"), "utf8");
    expect(source).toContain("acceptedBearerTokens");
    expect(source).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).toContain("acceptedBearerTokens.includes(bearerToken(request))");
  });

  it("dispatch-rich-push uses compact rich data to stay below Expo payload limits", () => {
    const source = readFileSync(resolve(root, "supabase/functions/dispatch-rich-push/index.ts"), "utf8");
    expect(source).toContain("compactNotificationData");
    expect(source).toContain("rich_image_url: image");
    expect(source).toContain("huddle_rich_debug_probe");
    expect(source).toContain("debugProbe?: boolean");
    expect(source).not.toContain("data: image ? { ...mergedData");
    expect(source).toContain("MAX_EXPO_MESSAGE_BYTES");
    expect(source).toContain("oversizedPushMessages(messages)");
    expect(source).toContain('error: "payload_too_large"');
  });

  it("dispatch-rich-push sends platform-complete rich media without leaking an unmasked sensitive preview", () => {
    const source = readFileSync(resolve(root, "supabase/functions/dispatch-rich-push/index.ts"), "utf8");
    expect(source).toContain('select("token,platform")');
    expect(source).toContain('channelId: "huddle-push"');
    expect(source).toContain('priority: "high"');
    expect(source).toContain("maskedRichPreviewURL");
    expect(source).toContain("ImageMagick");
    expect(source).toContain("richContentImage");
    expect(source).toContain("maskedPreviewGenerated");
  });

  it("resolves Match, Added Friend, and Star avatars server-side from the approved public profile buckets", () => {
    const source = readFileSync(resolve(root, "supabase/functions/dispatch-rich-push/index.ts"), "utf8");
    expect(source).toContain("publicProfileAvatarURL");
    expect(source).toContain('kind === "match"');
    expect(source).toContain('kind === "friend_added"');
    expect(source).toContain('kind === "star"');
    expect(source).toContain('.from("profiles")');
    expect(source).toContain("profile_photos|avatars");
    expect(source).toContain("rich_image_presentation");
    expect(source).toContain("resolveRichImagePresentation");
  });

  it("enriches eligible social notifications before the delivery trigger and restores the Match title/body contract", () => {
    const source = readFileSync(resolve(root, "supabase/migrations/20260711151500_route_rich_avatar_notifications_to_dispatcher.sql"), "utf8");
    expect(source).toContain("'match'");
    expect(source).toContain("'friend_added'");
    expect(source).toContain("'star'");
    expect(source).toContain("'New Match'");
    expect(source).toContain("'You have a pawfect match 🐾'");
    expect(source).toContain("'rich_avatar_user_id'");
    expect(source).toContain("'avatar_circle'");
    expect(source).toContain("select p.avatar_url");
    expect(source).toContain("'rich_image_url'");
    expect(source).toContain("profile_photos|avatars");
  });

  it("rich image pushes route through the Edge dispatcher so Expo ticket responses are auditable", () => {
    const body = latestFunctionBody("dispatch_expo_push_for_notification");
    const source = readFileSync(resolve(root, "supabase/functions/dispatch-rich-push/index.ts"), "utf8");
    expect(body).toContain("'dispatch-rich-push-request'");
    expect(body).toContain("'edge_dispatch_requested', true");
    expect(body).toContain("/functions/v1/dispatch-rich-push");
    expect(source).toContain("shrinkPayloadForAudit");
    expect(source).toContain("richContentImage");
    expect(source).toContain("payload: payloadAudit");
  });

  it("delayed map alert notifications use enqueue_notification with rich image parity", () => {
    const body = latestFunctionBody("process_due_broadcast_alert_notifications");
    expect(body).toContain("with locked_queue as");
    expect(body).toContain("for update skip locked");
    expect(body).toContain("public.enqueue_notification");
    expect(body).toContain("'map'");
    expect(body).toContain("'broadcast_alert'");
    expect(body).toContain("rich_image_url");
    expect(body).toContain("is_sensitive");
    expect(body).toContain("rich_image_masked");
    expect(body).toContain("/map?alert=");
    expect(body).not.toMatch(/left join[\s\S]{0,300}for update skip locked/i);
  });

  it("immediate map alert notifications preserve sensitive image masking metadata", () => {
    const body = latestFunctionBody("enqueue_broadcast_notifications");
    expect(body).toContain("coalesce(b.is_sensitive, false) as is_sensitive");
    expect(body).toContain("rich_image_url");
    expect(body).toContain("rich_image_masked");
  });

  it("iOS rich notification extension blurs masked map alert images before attachment", () => {
    const extension = readFileSync(resolve(root, "app/targets/HuddleRichNotifications/NotificationService.swift"), "utf8");
    expect(extension).toContain("rich_image_masked");
    expect(extension).toContain("is_sensitive");
    expect(extension).toContain("CIGaussianBlur");
    expect(extension).toContain("writeMaskedImage(from: temporaryURL, to: localURL)");
  });

  it("iOS rich notification extension reads Expo image URLs and uses the proven direct attachment path", () => {
    const extension = readFileSync(resolve(root, "app/targets/HuddleRichNotifications/NotificationService.swift"), "utf8");
    expect(extension).toContain("for containerKey in [\"data\", \"richContent\", \"rich_content\", \"_richContent\", \"custom\"]");
    expect(extension).toContain("normalizedDictionary(userInfo[\"body\"])");
    expect(extension).toContain("\"_richContent\"");
    expect(extension).toContain("normalizedDictionary");
    expect(extension).toContain("NSDictionary");
    expect(extension).toContain("JSONSerialization.jsonObject");
    expect(extension).toContain("RICH_PUSH_IMAGE_URL_MISSING");
    expect(extension).toContain("RICH_PUSH_IMAGE_DOWNLOAD_FAILED");
    expect(extension).toContain("RICH_PUSH_MASKED_IMAGE_RENDER_FAILED");
    expect(extension).toContain("RICH_PUSH_ATTACHMENT_FAILED");
    expect(extension).toContain("huddle_rich_debug_probe");
    expect(extension).toContain("huddle-rich-notification-v5-20260716");
    expect(extension).toContain("moveItem(at: temporaryURL, to: localURL)");
    expect(extension).toContain("options: nil");
    expect(extension).not.toContain("UTType.jpeg");
    expect(extension).toContain("private func finish(with content: UNNotificationContent)");
    expect(extension).toContain("guard !didComplete else");
    expect(extension).toContain("defer { self?.finish(with: bestAttemptContent) }");
    expect(extension).toContain("finish(with: bestAttemptContent)");
    expect(extension).not.toContain("defer { contentHandler(bestAttemptContent) }");
    expect(extension).toContain('url.scheme?.lowercased() == "https"');
    expect(extension).not.toContain('url.scheme == "http"');
  });

  it("plain and rich delivery share ticket, receipt, and invalid-token handling", () => {
    const dispatcher = readFileSync(resolve(root, "supabase/functions/dispatch-rich-push/index.ts"), "utf8");
    const receipts = readFileSync(resolve(root, "supabase/functions/process-expo-push-receipts/index.ts"), "utf8");
    const migration = readFileSync(resolve(root, "supabase/migrations/20260716190000_notification_delivery_gap_closure.sql"), "utf8");
    expect(dispatcher).toContain('from("expo_push_tickets").upsert');
    expect(dispatcher).toContain('DeviceNotRegistered');
    expect(receipts).toContain("/api/v2/push/getReceipts");
    expect(receipts).toContain("Date.now() - 15 * 60 * 1000");
    expect(receipts).toContain('providerError === "DeviceNotRegistered"');
    expect(receipts).toContain('.update({ is_active: false })');
    expect(migration).toContain("create table if not exists public.expo_push_tickets");
    expect(migration).toContain("process-expo-push-receipts-5min");
    expect(migration).toContain("'/functions/v1/dispatch-rich-push'");
    expect(migration).not.toContain("'https://exp.host/--/api/v2/push/send'");
  });

  it("iOS renders approved avatar rich images into a circular transparent PNG attachment", () => {
    const extension = readFileSync(resolve(root, "app/targets/HuddleRichNotifications/NotificationService.swift"), "utf8");
    expect(extension).toContain("shouldRenderAvatarCircle");
    expect(extension).toContain("rich_image_presentation");
    expect(extension).toContain("writeCircularAvatarImage");
    expect(extension).toContain("UIBezierPath(ovalIn:");
    expect(extension).toContain("format.opaque = false");
    expect(extension).toContain("pngData()");
  });

  it("Xcode compiles the rich notification source from exactly one synchronized root", () => {
    const project = readFileSync(resolve(root, "app/ios/huddle.xcodeproj/project.pbxproj"), "utf8");
    expect(project.match(/path = \.\.\/targets\/HuddleRichNotifications;/g)?.length).toBe(1);
    expect(project).not.toContain("path = HuddleRichNotifications;");
    expect(project).not.toContain('Exceptions for "HuddleRichNotifications" folder');
  });

  it("map uploads constrain new rich-image sources to the Android-safe size range", () => {
    const source = readFileSync(resolve(root, "app/src/lib/nativeBroadcast.ts"), "utf8");
    expect(source).toContain("RICH_NOTIFICATION_ANDROID_MAX_BYTES");
    expect(source).toContain("resize: { width: 1200 }");
    expect(source).toContain("resize: { width: 960 }");
  });

  it("Care Update with Photo forwards private storage bucket/path for rich push signing", () => {
    const body = readFileSync(resolve(root, "supabase/migrations/20260710234500_care_update_photo_rich_push_payload.sql"), "utf8");
    expect(body).toContain("v_notification_data");
    expect(body).toContain("'rich_image_bucket', v_bucket");
    expect(body).toContain("'rich_image_path', v_path");
    expect(body).toContain("service_notify");
  });
});
