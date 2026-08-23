import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const appRoot = resolve(__dirname, "../..");
const repoRoot = resolve(appRoot, "..");
const readApp = (path: string) => readFileSync(resolve(appRoot, path), "utf8");
const readRepo = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("iOS registers the complete action/category contract before React Native starts", () => {
  const swift = readApp("ios/huddle/AppDelegate.swift");
  const actions = readApp("src/lib/nativeNotificationActions.ts");
  const pluginSource = readApp("plugins/with-huddle-notification-categories.js");
  const appConfig = readApp("app.config.js");
  // The tracked Expo config plugin is CommonJS because Expo loads it directly.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { patchAppDelegate } = require(resolve(appRoot, "plugins/with-huddle-notification-categories.js")) as {
    patchAppDelegate: (contents: string) => string;
  };
  const generated = patchAppDelegate(swift);
  const regenerated = patchAppDelegate(generated);
  const launch = generated.slice(generated.indexOf("didFinishLaunchingWithOptions"));

  expect(launch).toContain("registerHuddleNotificationCategories()");
  expect(launch.indexOf("registerHuddleNotificationCategories()")).toBeLessThan(launch.indexOf("factory.startReactNative"));
  expect(regenerated, "config plugin must be idempotent across clean and repeated prebuilds").toBe(generated);
  expect(appConfig).toContain("./plugins/with-huddle-notification-categories");
  expect(pluginSource).toMatch(/UNNotificationActionOptions\s*=\s*\[\.foreground, \.authenticationRequired\]/);

  for (const identifier of [
    "huddle_action_reply",
    "huddle_action_join_group",
    "huddle_action_rsvp",
    "huddle_action_start_care",
    "huddle_reply",
    "huddle_join_group",
    "huddle_event_rsvp",
    "huddle_start_care",
  ]) {
    expect(pluginSource, `tracked iOS config plugin is missing ${identifier}`).toContain(`"${identifier}"`);
    expect(generated, `generated AppDelegate is missing ${identifier}`).toContain(`"${identifier}"`);
    expect(actions, `JavaScript reconciliation is missing ${identifier}`).toContain(`"${identifier}"`);
  }
  expect(generated).toMatch(/UNTextInputNotificationAction\s*\(/);
  expect(generated).toMatch(/textInputButtonTitle:\s*"Send"/);
  expect(actions, "category reconciliation must not race Apple's replace-all category set").not.toContain("await Promise.all([");
  const registrationCalls = actions.match(/await Notifications\.setNotificationCategoryAsync/g) || [];
  expect(registrationCalls).toHaveLength(4);
});

test("all non-open actions use one retry-safe server-authoritative path", () => {
  const root = readApp("src/navigation/RootNavigator.tsx");
  const handlerStart = root.indexOf("const handleNotificationResponse = useCallback");
  const handlerEnd = root.indexOf("notificationResponseHandlerRef.current = handleNotificationResponse", handlerStart);
  const handler = root.slice(handlerStart, handlerEnd);

  expect(handler).toContain('supabase.rpc("execute_notification_action"');
  expect(handler, "Start Care must not bypass the RPC").not.toContain('if (action === "start_care")');
  expect(handler, "Start Care must not construct a client-only success path").not.toContain("startCareActionPath");
  const rpcStart = handler.indexOf('supabase.rpc("execute_notification_action"');
  const successHandled = handler.indexOf("handledNotificationResponseKeysRef.current.add(responseKey)", rpcStart);
  expect(handler.indexOf("if (error) throw error", rpcStart)).toBeLessThan(successHandled);
  expect(handler).toContain("processingNotificationResponseKeysRef.current.delete(responseKey)");
  expect(handler).toContain('"Open huddle to continue"');
  expect(handler).toContain('text: "Not now"');
  expect(handler).toContain('text: "Try again"');
  expect(handler).toContain('text: "Open notification"');
  expect(handler).toContain("notificationCountRefreshRef.current?.()");
  expect(handler, "Badge state must be refreshed exactly, not guessed").not.toContain("setNotificationCount((current) => Math.max(0, current - 1))");
});

test("unknown actions are ignored and cold-start actions are retained in FIFO order", () => {
  const actions = readApp("src/lib/nativeNotificationActions.ts");
  const root = readApp("src/navigation/RootNavigator.tsx");

  expect(actions).toContain('return "unknown";');
  expect(root).toContain('if (action === "unknown")');
  expect(root).toContain("pendingNotificationResponsesRef.current.push(response)");
  expect(root).toContain("pendingNotificationResponsesRef.current.shift()");
  expect(root).not.toContain("pendingNotificationResponseRef.current = response");
  expect(root).toContain("drainingNotificationResponsesRef.current");
});

test("action retries survive process termination after Apple's retained response is cleared", () => {
  const root = readApp("src/navigation/RootNavigator.tsx");

  expect(root).toContain('LEGACY_PENDING_NOTIFICATION_ACTION_RESPONSES_KEY = "huddle:native:pending-notification-actions:v1"');
  expect(root).toContain("pending-notification-actions:v2:${encodeURIComponent(userId)}");
  expect(root).toContain("await persistPendingNotificationActionResponse(response, activeUserId)");
  expect(root).toContain("readPendingNotificationActionResponses(activeUserId).then((responses)");
  expect(root).toContain("pendingNotificationResponsesRef.current.push(response)");
  expect(root).toContain("await removePendingNotificationActionResponse(responseKey, activeUserId)");
  expect(root.indexOf("await persistPendingNotificationActionResponse(response, activeUserId)")).toBeLessThan(
    root.indexOf('supabase.rpc("execute_notification_action"'),
  );
});

test("notification actions and destinations stay bound to the authenticated recipient", () => {
  const root = readApp("src/navigation/RootNavigator.tsx");
  const notifications = readApp("src/lib/nativeNotifications.ts");
  const handlerStart = root.indexOf("const handleNotificationResponse = useCallback");
  const handlerEnd = root.indexOf("notificationResponseHandlerRef.current = handleNotificationResponse", handlerStart);
  const handler = root.slice(handlerStart, handlerEnd);

  expect(handler).toContain("verifyNativeNotificationOwnershipWithToken(");
  expect(notifications).toContain('user_id: `eq.${cleanUserId}`');
  expect(notifications).toContain("NOTIFICATION_OWNERSHIP_TIMEOUT_MS");
  expect(handler).toContain("currentSessionRef.current?.userId !== activeUserId");
  expect(handler).toContain("openNotificationInbox();");
  expect(handler.indexOf('supabase.rpc("execute_notification_action"')).toBeLessThan(
    handler.indexOf('enqueueInboundDestination(resultPath, "notification")'),
  );
  expect(root).toContain("pendingNotificationResponsesRef.current = [];");
  expect(root).toContain("setPendingInboundDestinations([]);");
  expect(root).toContain("clearPendingNotificationActionResponses(previousUserId)");
});

test("default notification opens cannot poison a response before bounded ownership resolves", () => {
  const root = readApp("src/navigation/RootNavigator.tsx");
  const notifications = readApp("src/lib/nativeNotifications.ts");
  const handlerStart = root.indexOf("const handleNotificationResponse = useCallback");
  const handlerEnd = root.indexOf("if (action === \"unknown\")", handlerStart);
  const openHandler = root.slice(handlerStart, handlerEnd);

  expect(openHandler.indexOf("processingNotificationResponseKeysRef.current.add(responseKey)")).toBeLessThan(
    openHandler.indexOf("verifyNativeNotificationOwnershipWithToken("),
  );
  expect(openHandler.indexOf("handledNotificationResponseKeysRef.current.add(responseKey)")).toBeGreaterThan(
    openHandler.indexOf("verifyNativeNotificationOwnershipWithToken("),
  );
  expect(openHandler).toContain("processingNotificationResponseKeysRef.current.delete(responseKey)");
  expect(notifications).toMatch(/fetch\([^;]+NOTIFICATION_OWNERSHIP_TIMEOUT_MS\)/s);
  expect(notifications).toContain('Promise<NativeNotificationOwnership>');
});

test("the open-response contract fails if handled state moves ahead of ownership", () => {
  const root = readApp("src/navigation/RootNavigator.tsx");
  const handlerStart = root.indexOf("const handleNotificationResponse = useCallback");
  const handlerEnd = root.indexOf("if (action === \"unknown\")", handlerStart);
  const openHandler = root.slice(handlerStart, handlerEnd);
  const tampered = openHandler.replace(
    "processingNotificationResponseKeysRef.current.add(responseKey);",
    "handledNotificationResponseKeysRef.current.add(responseKey);",
  );
  expect(() => expect(tampered.indexOf("handledNotificationResponseKeysRef.current.add(responseKey)")).toBeGreaterThan(
    tampered.indexOf("verifyNativeNotificationOwnershipWithToken("),
  )).toThrow();
});

test("failed masked rich previews evict both preview and ImageMagick initialization caches", () => {
  const dispatcher = readRepo("supabase/functions/dispatch-rich-push/index.ts");

  expect(dispatcher).toContain("if (!url) maskedPreviewCache.delete(previewPath)");
  expect(dispatcher).toMatch(/magickInitialization\s*=\s*null;\s*throw error;/);
  expect(dispatcher).toContain("maskedPreviewCache.set(previewPath, cacheableWork)");
});

test("foreground actions are intentional, authenticated, and recovery-capable", () => {
  const actions = readApp("src/lib/nativeNotificationActions.ts");

  expect(actions).toContain("opensAppToForeground: true");
  expect(actions).toContain("isAuthenticationRequired: true");
  expect(actions).toContain("Expo does not deliver killed-state iOS action presses");
  expect(actions).toContain("reply_too_long");
  expect(actions).toContain("under 2,000 characters");
});

test("the action RPC authorizes, locks, consumes, and deduplicates every action", () => {
  const migration = readRepo("supabase/migrations/20260716120000_interactive_notification_action_hardening.sql");

  expect(migration).toMatch(/where id = p_notification_id and user_id = v_uid\s+for update/);
  expect(migration).toMatch(/elsif v_action = 'start_care'/);
  expect(migration).toMatch(/v_uid in \(sc\.requester_id, sc\.provider_id\)/);
  expect(migration).toMatch(/v_service_chat\.status <> 'booked'/);
  expect(migration).toMatch(/not in \('awaiting_handoff', 'pin_shared'\)/);
  expect(migration).toMatch(/notificationAction=start_care/);
  expect(migration).toMatch(/set read = true, is_read = true/);
  expect(migration.indexOf("set read = true, is_read = true", migration.indexOf("elsif v_action = 'start_care'"))).toBeLessThan(migration.lastIndexOf("insert into public.notification_action_receipts"));
  expect(migration).toMatch(/primary key|on conflict \(notification_id, user_id, action\) do nothing/i);
});

test("primary and fallback push payloads carry Apple's category plus exact action identity", () => {
  const edgeDispatcher = readRepo("supabase/functions/dispatch-rich-push/index.ts");
  const fallback = readRepo("supabase/migrations/20260716123000_interactive_notification_fallback_category.sql");

  expect(edgeDispatcher).toMatch(/notificationId:\s*notification\.id/);
  expect(edgeDispatcher).toMatch(/actionCategory\s*\?\s*\{ categoryId: actionCategory \}/);
  expect(fallback).toMatch(/'categoryId', v_action_category/);
  expect(fallback).toMatch(/'notificationId', new\.id/);
  expect(fallback).toMatch(/'href', coalesce\(new\.href/);
});

test("Start Care deeplink opens the role-correct owner or carer flow", () => {
  const serviceChat = readApp("src/screens/NativeServiceChatScreen.tsx");

  expect(serviceChat).toMatch(/params\.notificationAction !== "start_care"/);
  expect(serviceChat).toMatch(/if \(role === "requester"\)[\s\S]*?setConfirmOwnerStartCareOpen\(true\)/);
  expect(serviceChat).toMatch(/setConfirmOwnerStartCareOpen\(true\);[\s\S]*?openStartCareFromHandoff\(\)/);
  expect(serviceChat).toMatch(/setActiveSheet\("startCare"\)/);
});

test("rollback proof covers exact effects, recipients, deeplinks, read state, failure, and replay", () => {
  const sqlTest = readRepo("supabase/tests/interactive_notification_actions.sql");

  for (const proof of [
    "Reply must send exactly one human message",
    "duplicate Reply must return idempotently",
    "owner Start Care must return the exact service deeplink",
    "carer Start Care must return the exact service deeplink",
    "successful RSVP must mark the exact notification read",
    "successful Join now must mark the exact notification read",
    "failed action must remain unread for recovery",
    "failed action must not write a success receipt",
    "Care state changed while visible must return a recoverable server error",
    "revoked invite must return a recoverable server error",
    "revoked invite must not add membership",
    "cross-user action must be rejected",
  ]) {
    expect(sqlTest, `SQL proof is missing: ${proof}`).toContain(proof);
  }
  expect(sqlTest).toMatch(/rollback;/i);
// Reads Swift + TS + SQL across the repo: needs a real budget, not the 5s default.
}, 30_000);
