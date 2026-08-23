import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(testDirectory, path), "utf8");

describe("native active-session reliability contract", () => {
  it("keeps active Care after one participant confirms", () => {
    const hydration = read("./nativeActiveSessionHydration.ts");
    const chat = read("../screens/NativeServiceChatScreen.tsx");
    const dispatcher = read("../../../supabase/functions/dispatch-live-activity-progress/index.ts");

    expect(hydration).toContain('authedRpc<HydrationServiceRow[]>("get_native_active_care_sessions"');
    expect(hydration).not.toContain("care_skip_self_completed");
    expect(hydration).toContain("showAction: !currentUserMarkedFinished");
    expect(chat).toContain("showAction: !currentUserMarkedFinished");
    expect(dispatcher).not.toMatch(/requester_id === row\.user_id[^\n]+return true/);
    expect(dispatcher).not.toMatch(/provider_id === row\.user_id[^\n]+return true/);
  });

  it("does not destroy a valid iOS activity while its push token is pending", () => {
    const native = read("../../modules/huddle-active-sessions/ios/HuddleActiveSessionsModule.swift");

    expect(native).not.toContain("if current.pushToken != nil {");
    expect(native).not.toContain("legacy_nonpush_activity_end");
    expect(native).toContain("observeActivity(current)");
  });

  it("preserves the server generation when a local iOS refresh re-registers the same activity", () => {
    const native = read("../../modules/huddle-active-sessions/ios/HuddleActiveSessionsModule.swift");
    const migration = read("../../../supabase/migrations/20260816182056_native_live_activity_generation_registration_compatibility.sql");

    expect(native).toContain("private func canonicalGeneration");
    expect(native).toContain("generation: canonicalGeneration(payload.generation)");
    expect(native).toContain("preserving: current.content.state.generation");
    expect(native).toContain("preserving: activity.content.state.generation");
    expect(native).toContain('contentState["generation"] = canonicalGeneration(state.generation)');
    expect(native).toContain("reconciledState.generation = registeredGeneration");
    expect(migration).toContain("v_existing_activity_id = v_activity_id");
    expect(migration).toContain("v_generation := v_existing_generation");
    expect(migration).toContain("'reason', 'stale_generation'");
    expect(migration).toContain("v_content_state := jsonb_set(v_content_state, '{generation}', to_jsonb(v_generation), true)");
  });

  it("preserves cached avatar references in the terminal iOS activity state", () => {
    const native = read("../../modules/huddle-active-sessions/ios/HuddleActiveSessionsModule.swift");
    const endActivity = native
      .split('AsyncFunction("endActivity")')[1]
      ?.split('AsyncFunction("clearInactiveCareActivities")')[0] ?? "";

    expect(endActivity).not.toContain("contentState(from: payload)");
    expect(endActivity).toContain("var finalState = activity.content.state");
    expect(endActivity).toContain("finalState.finalMessage = payload.finalMessage");
    expect(endActivity).toContain("ActivityContent(state: finalState, staleDate: nil)");
  });

  it("preserves the cached ongoing avatar in the Android terminal summary", () => {
    const native = read("../../modules/huddle-active-sessions/android/src/main/java/pet/huddle/activesessions/HuddleActiveSessionsModule.kt");
    const receiver = read("../../modules/huddle-active-sessions/android/src/main/java/pet/huddle/activesessions/HuddleTerminalActionReceiver.kt");
    const layout = read("../../modules/huddle-active-sessions/android/src/main/res/layout/huddle_active_session_final.xml");

    expect(native).toContain("val activePayload = HuddleActiveSessionRuntimeStore.get(identity.key)");
    expect(native).toContain("postFinalSummary(identity, activePayload, finalMessage)");
    expect(native).toContain("finalSummaryRemoteViews(payload, message)");
    expect(native).toContain("avatarBitmap(44, accent, avatarName, avatarUrl");
    expect(native).toContain("R.layout.huddle_active_session_final");
    expect(receiver).toContain("HuddleActiveSessionsModule.showReturnSummary(context, sessionKey, notificationTag, notificationId, finalMessage)");
    expect(layout).toContain('android:id="@+id/huddle_final_avatar"');
    expect(layout).toContain('android:id="@+id/huddle_final_status"');
    expect(layout).toContain('android:layout_width="11dp"');
    expect(layout).toContain('android:fontFamily="sans-serif-rounded"');
    expect(layout).toContain('android:textFontWeight="600"');
    expect(native).toContain('rv.setInt(R.id.huddle_final_status, "setColorFilter", accent)');
    expect(layout).toContain('android:id="@+id/huddle_final_message"');
  });

  it("routes ActivityKit tokens using the signed APNs entitlement", () => {
    const native = read("../../modules/huddle-active-sessions/ios/HuddleActiveSessionsModule.swift");

    expect(native).toContain('url(forResource: "embedded", withExtension: "mobileprovision")');
    expect(native).toContain('profile.range(of: "<key>aps-environment</key>")');
    expect(native).toContain('entitlementTail.contains("<string>development</string>") ? "sandbox" : "production"');
  });

  it("uses one canonical clock-derived value for line, glyph, and trace", () => {
    const widget = read("../../targets/HuddleLiveActivities/HuddleLiveActivities.swift");
    expect(widget).toContain("var progressInterval: ClosedRange<Date>?");
    expect(widget).toContain("func presentation(at date: Date) -> HuddlePresentationState");
    expect(widget.match(/let presentation = state\.presentation\(at: Date\(\)\)/g)).toHaveLength(2);
    expect(widget).toContain("let displayedProgress: CGFloat = intervalComplete ? 1 : fraction");
    expect(widget).toContain("HuddleSessionBar(progress: presentation.displayedProgress, state: state)");
    expect(widget).toContain("progress: state.progressInterval == nil ? nil : presentation.displayedProgress");
    expect(widget).toContain("fraction: progress,");
    expect(widget).not.toContain("snapshotProgress");
    expect(widget).not.toContain("ProgressView(timerInterval: interval, countsDown: false)");
    expect(widget).not.toContain("configuration.fractionCompleted ?? 0");
    expect(widget).toContain('"1 user nearby"');
    expect(widget).toContain('"\\(users) users nearby"');
  });

  it("uses Live Activity intents for lock-screen terminal actions", () => {
    const widget = read("../../targets/HuddleLiveActivities/HuddleLiveActivities.swift");
    const androidReceiver = read("../../modules/huddle-active-sessions/android/src/main/java/pet/huddle/activesessions/HuddleTerminalActionReceiver.kt");
    const androidWorker = read("../../modules/huddle-active-sessions/android/src/main/java/pet/huddle/activesessions/HuddleTerminalActionWorker.kt");
    const androidModule = read("../../modules/huddle-active-sessions/android/src/main/java/pet/huddle/activesessions/HuddleActiveSessionsModule.kt");

    expect(widget).toContain("struct HuddleReturnedIntent: LiveActivityIntent");
    expect(widget).toContain("struct HuddleContinueWalkIntent: LiveActivityIntent");
    expect(widget).toContain("struct HuddleCareCompleteIntent: LiveActivityIntent");
    expect(widget).toContain("private static func canonicalOutActivity() async");
    expect(widget).toContain("for duplicate in activities where duplicate.id != current.id");
    expect(widget).toContain("await duplicate.end(nil, dismissalPolicy: .immediate)");
    expect(widget).toContain("if let activity = await canonicalOutActivity()");
    expect(widget).not.toContain('for activity in Activity<HuddleActiveSessionAttributes>.activities where activity.content.state.kind == "map_out_now"');
    expect(widget).not.toContain("struct HuddleReturnedIntent: AppIntent");
    expect(widget).not.toContain("struct HuddleCareCompleteIntent: AppIntent");
    expect(widget).toContain("static var openAppWhenRun = false");
    expect(widget).toContain('rpc("renew_native_out_now_visibility_with_clock", body: [:])');
    expect(widget).toContain('rpc("submit_provider_completion_by_service_id"');
    expect(widget).toContain('rpc("submit_requester_completion_by_service_id"');
    expect(widget).toContain('"p_service_chat_id": serviceId');
    expect(widget).not.toContain('rpc("submit_provider_completion",');
    expect(widget).not.toContain('rpc("submit_requester_completion",');
    expect(widget).toContain("if first.statusCode != 401");
    expect(widget).toContain("parseISO8601(rawExpiresAt)");
    expect(widget).toContain("let terminal = (try? await careIsTerminal(serviceId: serviceId)) ?? false");
    expect(widget).toContain('rpc("return_native_out_now", body: [:])');
    expect(widget).toContain("state.finalMessage = finalMessage");
    expect(widget).toContain("dismissalPolicy: .after(Date().addingTimeInterval(120))");
    expect(androidReceiver).toContain("ACTION_CONTINUE_WALK");
    expect(androidReceiver).toContain('authenticatedRpc(context, "renew_native_out_now_visibility_with_clock"');
    expect(androidReceiver).toContain('"submit_provider_completion_by_service_id"');
    expect(androidReceiver).toContain('"submit_requester_completion_by_service_id"');
    expect(androidReceiver).toContain('JSONObject().put("p_service_chat_id", serviceId)');
    expect(androidReceiver).not.toContain('"submit_provider_completion",');
    expect(androidReceiver).not.toContain('"submit_requester_completion",');
    expect(androidReceiver).toContain("OneTimeWorkRequestBuilder<HuddleTerminalActionWorker>");
    expect(androidReceiver).not.toContain("goAsync()")
    expect(androidReceiver).not.toContain("Thread {")
    expect(androidReceiver).toContain('authenticatedRpc(context, "return_native_out_now"');
    expect(androidReceiver).toContain("HuddleActiveSessionsModule.showReturnSummary(context, sessionKey, notificationTag, notificationId, finalMessage)");
    expect(androidModule).toContain(".setTimeoutAfter(120_000L)");
    expect(androidWorker).toContain("runAttemptCount < 2");
    expect(androidModule).toContain("intervalComplete -> HuddleTerminalActionReceiver.ACTION_CONTINUE_WALK");
  });

  it("uses canonical pet priority and exact two-kilometre nearby reconciliation", () => {
    const hydration = read("./nativeActiveSessionHydration.ts");
    const migration = read("../../../supabase/migrations/20260714130000_active_session_canonical_reconciliation.sql");
    const petScopeMigration = read("../../../supabase/migrations/20260714143000_active_care_scope_pet_resolution.sql");
    const multiPetScopeMigration = read("../../../supabase/migrations/20260714151000_active_care_scope_multi_pet_resolution.sql");

    expect(hydration.indexOf('source: "booking_snapshot"')).toBeLessThan(hydration.indexOf('source: "request_card_fallback"'));
    expect(hydration).toContain('source: "service_care_scope"');
    expect(petScopeMigration).toContain("get_service_care_pet_scope");
    expect(petScopeMigration).toContain("left join public.pets p on p.id::text");
    expect(petScopeMigration).toContain("'active_pet_scope'");
    expect(multiPetScopeMigration).toContain("s.booking_snapshot -> 'requestCard'");
    expect(multiPetScopeMigration.indexOf("c.frozen_request -> 'pets'")).toBeLessThan(multiPetScopeMigration.indexOf("c.request_card -> 'pets'"));
    expect(multiPetScopeMigration).toContain("left join public.pets p on p.id::text");
    expect(multiPetScopeMigration).toContain("lower(btrim(candidate.value ->> 'petName'))");
    expect(migration).toContain("peer.map_visible_until > now()");
    expect(migration).toContain("2000");
    expect(migration).toContain("order by is_matched desc, distance_m asc");
  });

  it("registers push-to-start and recovers long-running Care without app launch", () => {
    const native = read("../../modules/huddle-active-sessions/ios/HuddleActiveSessionsModule.swift");
    const dispatcher = read("../../../supabase/functions/dispatch-live-activity-progress/index.ts");
    const migration = read("../../../supabase/migrations/20260714132000_live_activity_push_to_start_recovery.sql");
    const reliabilityMigration = read("../../../supabase/migrations/20260715012000_live_activity_event_delivery_reliability.sql");

    expect(native).toContain("pushToStartTokenUpdates");
    expect(native).toContain("activityUpdates");
    expect(native).toContain("activity.contentUpdates");
    expect(native).toContain("cacheRemoteAssets(for: activity)");
    expect(native).toContain("register_native_live_activity_start_token");
    expect(dispatcher).toContain('event: "start"');
    expect(dispatcher).toContain('"input-push-token": 1');
    expect(dispatcher).toContain("The predecessor");
    expect(reliabilityMigration).toContain("7 hours 20 minutes");
    expect(reliabilityMigration).toContain("existing registration RPC");
    expect(migration).toContain("claim_live_activity_start_recovery_batch");
  });

  it("uses acknowledged, bounded push-to-start recovery instead of five-minute duplicate starts", () => {
    const migration = read("../../../supabase/migrations/20260716170000_live_activity_delivery_gap_closure.sql");
    const leaseMigration = read("../../../supabase/migrations/20260716170300_live_activity_acknowledged_generation_lease.sql");
    const dispatcher = read("../../../supabase/functions/dispatch-live-activity-progress/index.ts");
    const native = read("../../modules/huddle-active-sessions/ios/HuddleActiveSessionsModule.swift");

    expect(migration).toContain("attempt_count < 3");
    expect(migration).toContain("delivery_status, accepted_at, acknowledged_at");
    expect(migration).toContain("acknowledge_live_activity_start");
    expect(migration).not.toContain("attempted_at > now() - interval '5 minutes'");
    expect(dispatcher).toContain('delivery_status: "accepted"');
    expect(dispatcher).toContain("state.generation = Math.max");
    expect(native).toContain("await acknowledgePushToStart(state: state, generation: registeredGeneration)");
    expect(leaseMigration).toContain("previous.created_at > attempt.acknowledged_at");
    expect(leaseMigration).not.toContain("or attempt.acknowledged_at is not null");
  });

  it("reconciles backend registrations against the device ActivityKit inventory", () => {
    const native = read("../../modules/huddle-active-sessions/ios/HuddleActiveSessionsModule.swift");
    const migration = read("../../../supabase/migrations/20260719010000_live_activity_device_truth_recovery.sql");

    expect(native).toContain("reconcile_native_live_activities");
    expect(native).toContain("Activity<HuddleActiveSessionAttributes>.activities");
    expect(native).toContain("await reconcileLocalActivities()");
    expect(migration).toContain("last_delivery_status = 'device_missing'");
    expect(migration).toContain("and r.active");
    expect(migration).toContain("attempt.delivery_status, '') = 'device_missing'");
    expect(migration).toContain("device_activity_reconciliation");
  });

  it("serializes revisions and scopes event dispatch to the changed session", () => {
    const migration = read("../../../supabase/migrations/20260716170000_live_activity_delivery_gap_closure.sql");
    const dispatcher = read("../../../supabase/functions/dispatch-live-activity-progress/index.ts");

    expect(migration).toContain("Never release an\n  -- in-flight claim");
    expect(migration).toContain("user_id = new.id and kind = 'map_out_now'");
    expect(migration).toContain("session_id = new.id::text");
    expect(migration).not.toContain("dispatch_claimed_until = null");
    expect(dispatcher).toContain('.eq("state_revision", expectedRevision)');
    expect(dispatcher).toContain("stale_dispatch_revision_");
  });

  it("never resets Care elapsed time from mutable row updated_at", () => {
    const dispatcher = read("../../../supabase/functions/dispatch-live-activity-progress/index.ts");
    const canonicalStart = dispatcher.slice(
      dispatcher.indexOf("const existingStartedAtMs"),
      dispatcher.indexOf("const expiresAt = careEndIso"),
    );

    expect(canonicalStart).toContain("data.in_progress_at");
    expect(canonicalStart).toContain("data.checkin_submitted_at");
    expect(canonicalStart).toContain("data.booked_at");
    expect(canonicalStart).toContain("existingStartedAtMs");
    expect(canonicalStart).not.toContain("data.updated_at");
    expect(canonicalStart).not.toContain("new Date().toISOString()");
  });

  it("re-registers iOS activity tokens after auth and invalidates replaced device start tokens", () => {
    const native = read("../../modules/huddle-active-sessions/ios/HuddleActiveSessionsModule.swift");
    const migration = read("../../../supabase/migrations/20260715010000_live_activity_per_installation_lifecycle.sql");

    expect(native).toContain("for activity in Activity<HuddleActiveSessionAttributes>.activities");
    expect(native).toContain("await registerPushToken(activityToken, for: activity)");
    expect(native).toContain('"p_device_id"');
    expect(native).toContain("kSecClassGenericPassword");
    expect(native).toContain("activity.activityStateUpdates");
    expect(native).toContain("deactivate_native_live_activity");
    expect(migration).toContain("push_token <> lower(p_push_token) or apns_environment <> p_apns_environment");
    expect(migration).toContain("live_activity_start_tokens_active_device_idx");
    expect(migration).toContain("active.device_id = st.device_id");
    expect(migration).toContain("live_activity_registrations_active_installation_session_idx");
    expect(migration).toContain("Other physical");
  });

  it("sends canonical idle progress with ActivityKit freshness metadata", () => {
    const dispatcher = read("../../../supabase/functions/dispatch-live-activity-progress/index.ts");
    const native = read("../../modules/huddle-active-sessions/ios/HuddleActiveSessionsModule.swift");
    const capabilityMigration = read("../../../supabase/migrations/20260716170100_live_activity_frequent_update_capability.sql");

    expect(dispatcher).toContain("Canonical visual snapshot shared by iOS and Android");
    expect(dispatcher).toContain("appleReferenceDateUnixSeconds");
    expect(dispatcher).toContain("startedAt: activityKitDate");
    expect(dispatcher).toContain("expiresAt: activityKitDate");
    expect(dispatcher).toContain('"relevance-score"');
    expect(dispatcher).toContain('"stale-date"');
    expect(dispatcher).toContain("(frequent ? 3 : 6) * 60");
    expect(dispatcher).toContain('event === "end" || immediate ? "HIGH" : "NORMAL"');
    expect(dispatcher).toContain("frequentUpdatesEnabled");
    expect(dispatcher).not.toContain("deferred_by_frequent_update_setting");
    expect(dispatcher).toMatch(/Always\s+\/\/ attempt the minute heartbeat at low APNs priority/);
    expect(native).toContain("frequentPushEnablementUpdates");
    expect(native).toContain("register_live_activity_device_capability");
    expect(capabilityMigration).toContain("live_activity_device_capabilities");
  });

  it("uses persisted Android state and FCM data reconciliation while the app is idle", () => {
    const module = read("../../modules/huddle-active-sessions/android/src/main/java/pet/huddle/activesessions/HuddleActiveSessionsModule.kt");
    const service = read("../../modules/huddle-active-sessions/android/src/main/java/pet/huddle/activesessions/HuddleActiveSessionMessagingService.kt");
    const manifest = read("../../modules/huddle-active-sessions/android/src/main/AndroidManifest.xml");
    const dispatcher = read("../../../supabase/functions/dispatch-live-activity-progress/index.ts");

    expect(module).toContain("persistPayload(identity, payload)");
    expect(module).toContain("HuddleActiveSessionRuntimeStore.put(identity.key, payload)");
    expect(module).toContain("restorePersistedPayloads()");
    expect(module).toContain("setOnlyAlertOnce(true)");
    expect(service).toContain('remoteMessage.data["huddle_active_session"] == "1"');
    expect(manifest).toContain("HuddleActiveSessionMessagingService");
    expect(manifest).toContain("HuddleActiveSessionBootReceiver");
    expect(manifest).toContain('tools:node="remove"');
    expect(dispatcher).toContain("claim_android_active_session_dispatch_batch");
    expect(dispatcher).toContain('huddle_active_session: "1"');
  });

  it("reconstructs canonical iOS and Android sessions without an app-created snapshot", () => {
    const migration = read("../../../supabase/migrations/20260714133000_active_session_platform_reliability.sql");
    const dispatcher = read("../../../supabase/functions/dispatch-live-activity-progress/index.ts");

    expect(migration).toContain("coalesce(previous.content_state, '{}'::jsonb)");
    expect(migration).toContain("insert into public.android_active_session_registrations");
    expect(migration).toContain("device.user_id = src.user_id and device.active");
    expect(dispatcher).toContain("const canonicalContentState = async");
    expect(dispatcher).toContain('.select("avatar_url,map_visible_until,out_now_started_at,out_now_returned_at,out_now_final_message")');
    expect(dispatcher).toContain('supabase.rpc("get_service_care_pet_scope"');
  });

  it("persists provider-acknowledged delivery evidence for every platform path", () => {
    const migration = read("../../../supabase/migrations/20260716170200_live_activity_persistent_delivery_telemetry.sql");
    const dispatcher = read("../../../supabase/functions/dispatch-live-activity-progress/index.ts");

    expect(migration).toContain("create table if not exists public.live_activity_delivery_attempts");
    expect(migration).toContain("provider_message_id text");
    expect(migration).toContain("state_revision bigint");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("grant all on public.live_activity_delivery_attempts to service_role");
    expect(dispatcher).toContain("const recordDelivery = async");
    expect(dispatcher).toContain('platform: "ios", event: terminal ? "end" : "update"');
    expect(dispatcher).toContain('platform: "ios", event: "start"');
    expect(dispatcher).toContain('platform: "android", event: terminal ? "end" : "update"');
    expect(dispatcher).toContain('status: "accepted"');
    expect(dispatcher).toContain('status: "failed"');
  });

  it("uses host-clock rendering for local progress and ActivityKit updates for canonical state", () => {
    const widget = read("../../targets/HuddleLiveActivities/HuddleLiveActivities.swift");
    const native = read("../../modules/huddle-active-sessions/ios/HuddleActiveSessionsModule.swift");
    const dispatcher = read("../../../supabase/functions/dispatch-live-activity-progress/index.ts");

    expect(widget).not.toContain("TimelineView(");
    expect(widget.match(/let presentation = state\.presentation\(at: Date\(\)\)/g)).toHaveLength(2);
    expect(widget).toContain("intervalComplete = (isOverrun ?? false) || date >= interval.upperBound");
    expect(widget).toContain("Text(state.startedAt, style: .timer)");
    expect(widget).not.toContain("ProgressView(timerInterval: interval, countsDown: false)");
    expect(native).toContain("max(60.0, min(15.0 * 60.0, end.timeIntervalSince(visualStart) * 0.006))");
    expect(native).toContain("max(minimumFreshness, cadence * 3.0)");
    expect(dispatcher).toContain("const staleWindowSeconds");
    expect(dispatcher).toContain("visualCadenceMs(state, row.kind)");
    expect(dispatcher).toContain("const overrun = current >= 1000");
  });

  it("keeps widget and native Codable ContentState fields identical to the fixture", () => {
    const fields = (source: string) => {
      const body = source.match(/public struct ContentState: Codable, Hashable \{([\s\S]*?)\n {2}\}/)?.[1] || "";
      return [...body.matchAll(/^\s*var\s+(\w+):/gm)].map((match) => match[1]).sort();
    };
    const widget = read("../../targets/HuddleLiveActivities/HuddleLiveActivities.swift");
    const native = read("../../modules/huddle-active-sessions/ios/HuddleActiveSessionsModule.swift");
    const fixture = JSON.parse(read("./__fixtures__/huddleActiveSessionContentState.json"));

    expect(fields(widget)).toEqual(fields(native));
    expect(Object.keys(fixture).sort()).toEqual(fields(widget));
  });

  it("records terminal delivery failures as end events", () => {
    const dispatcher = read("../../../supabase/functions/dispatch-live-activity-progress/index.ts");
    expect(dispatcher).toContain('attemptedEvent = terminal ? "end" : "update"');
    expect(dispatcher).toContain('platform: "ios", event: attemptedEvent');
    expect(dispatcher).toContain('platform: "android", event: attemptedEvent');
  });

  it("intentionally keeps compact elapsed duration counting after schedule end", () => {
    const widget = read("../../targets/HuddleLiveActivities/HuddleLiveActivities.swift");
    expect(widget).toContain("compactTrailing: {");
    expect(widget).toContain("Text(state.startedAt, style: .timer)");
    expect(widget).not.toContain('Text("Ended")');
  });

  it("normalizes required Codable fields and rejects oversized ActivityKit payloads", () => {
    const dispatcher = read("../../../supabase/functions/dispatch-live-activity-progress/index.ts");
    expect(dispatcher).toContain("state.names = Array.isArray(state.names) ? state.names : []");
    expect(dispatcher).toContain("state.avatarUrls = Array.isArray(state.avatarUrls) ? state.avatarUrls : []");
    expect(dispatcher).toContain("state.avatarIsBlurred = Array.isArray(state.avatarIsBlurred) ? state.avatarIsBlurred : []");
    expect(dispatcher).toContain("if (bytes > 4096) throw new Error(`activity_payload_too_large_${bytes}`)");
    expect(dispatcher.match(/body: encodedActivityPayload/g)?.length).toBe(2);
  });

  it("keeps natural Out expiry actionable but ends explicit returns on every device", () => {
    const dispatcher = read("../../../supabase/functions/dispatch-live-activity-progress/index.ts");
    const hydration = read("./nativeActiveSessionHydration.ts");
    const home = read("../screens/NativeHomeScreen.tsx");
    const branchStart = hydration.indexOf("if (!expiresAt || !expiresMs || expiresMs <= Date.now())");
    const expiredBranch = hydration.slice(branchStart, hydration.indexOf("const startedAt", branchStart));

    expect(dispatcher).toContain("visibleUntil < scheduledUntil - 30_000");
    expect(dispatcher).toContain("!Number.isFinite(scheduledUntil)");
    expect(expiredBranch).not.toContain("clearHomePresenceActivityIfStored");
    expect(home).not.toContain("if (mapVisibleUntil && formatOutNowClock(mapVisibleUntil, Date.now())) return;\n    void endHomePresenceActivity();");
  });

  it("never throttles the first scheduled-end state transition", () => {
    const dispatcher = read("../../../supabase/functions/dispatch-live-activity-progress/index.ts");
    expect(dispatcher).toContain("const boundaryDue = scheduledUntil > 0 && now >= scheduledUntil && row.content_state.isOverrun !== true");
    expect(dispatcher).toContain("immediate || boundaryDue ||");
    expect(dispatcher).toContain("priority: terminal || rowImmediate ? 10 : 5");
  });
});
