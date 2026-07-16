import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stripeDefaultSecret = Deno.env.get("STRIPE_SECRET_KEY") || "";
const stripeTestSecret = Deno.env.get("STRIPE_TEST_SECRET_KEY") || "";
const stripeLiveSecret = Deno.env.get("STRIPE_LIVE_SECRET_KEY") || "";
const stripeModeHint = String(Deno.env.get("STRIPE_MODE") || "").toLowerCase();

const projectRef = Deno.env.get("SUPABASE_PROJECT_REF") || "ztrbourwcnhrpmzwlrcn";
const configuredSupabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseUrl = configuredSupabaseUrl.includes(projectRef) ? configuredSupabaseUrl : `https://${projectRef}.supabase.co`;
const firstSecretKey = (value: string | null | undefined) => {
  const raw = String(value || "").trim().replace(/^['"]+|['"]+$/g, "");
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const fromArray = parsed.map((item) => String(item || "").trim()).find(Boolean);
      if (fromArray) return fromArray;
    }
    if (parsed && typeof parsed === "object") {
      const fromObject = Object.values(parsed).map((item) => String(item || "").trim()).find(Boolean);
      if (fromObject) return fromObject;
    }
  } catch {
    // Fall through to delimited secret parsing.
  }
  return raw.split(/[\s,]+/).map((item) => item.trim().replace(/^['"]+|['"]+$/g, "")).find(Boolean) || "";
};
const supabaseSecretKey =
  firstSecretKey(Deno.env.get("SUPABASE_SECRET_KEYS")) ||
  firstSecretKey(Deno.env.get("SUPABASE_SECRET_KEY")) ||
  firstSecretKey(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
const supabaseApiKey =
  firstSecretKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")) ||
  firstSecretKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEY")) ||
  firstSecretKey(Deno.env.get("SUPABASE_ANON_KEY")) ||
  supabaseSecretKey;
const supabase = createClient(
  supabaseUrl,
  supabaseSecretKey || supabaseApiKey,
);
const releaseServicePayoutSecret = Deno.env.get("RELEASE_SERVICE_PAYOUT_SECRET") || "";
const serviceRoleKey = supabaseSecretKey;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const clean = (value: unknown): string => String(value || "").trim();
const careEvidenceDescriptor = (value: unknown) => {
  const parsed = typeof value === "string"
    ? (() => {
      try {
        return JSON.parse(value) as Record<string, unknown>;
      } catch {
        return null;
      }
    })()
    : value && typeof value === "object" ? value as Record<string, unknown> : null;
  if (!parsed) return null;
  const bucket = clean(parsed.bucket);
  const path = clean(parsed.path).replace(/^\/+/, "").split("?")[0] || "";
  if (bucket !== "service_care_evidence" || !path || path.includes("..")) return null;
  return { bucket, path };
};
const hasRegisteredCareEvidence = async (serviceChatDbId: string, ownerId: string, scope: string, values: unknown[]) => {
  const descriptors = values.map(careEvidenceDescriptor).filter((item): item is { bucket: string; path: string } => Boolean(item));
  if (descriptors.length === 0) return false;
  const paths = descriptors
    .map((item) => item.path)
    .filter((path) => path.startsWith(`${ownerId}/service-care/${serviceChatDbId}/${scope}/`));
  if (paths.length === 0) return false;
  const { data, error } = await supabase
    .from("media_assets")
    .select("id")
    .eq("bucket", "service_care_evidence")
    .eq("owner_id", ownerId)
    .eq("content_id", serviceChatDbId)
    .eq("content_type", `service_care_${scope}`)
    .is("deleted_at", null)
    .in("object_path", paths)
    .limit(1);
  if (error) throw new Error(`care_evidence_guard_failed:${error.message}`);
  return Array.isArray(data) && data.length > 0;
};
const tzOffsetSuffix = (requestCard: Record<string, unknown>) => {
  const raw = clean(requestCard.tzOffset) || clean(requestCard.timezoneOffset) || clean(requestCard.tzOffsetMinutes);
  if (/^[+-]\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^[+-]?\d+$/.test(raw)) {
    const value = Number(raw);
    const totalMinutes = Math.abs(value) <= 14 ? Math.abs(value) * 60 : Math.abs(value);
    const sign = Math.abs(value) <= 14
      ? (value < 0 ? "-" : "+")
      : (value <= 0 ? "+" : "-");
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    return `${sign}${hours}:${minutes}`;
  }
  return "Z";
};
const stripeSecretsByPreference = () => {
  const ordered = stripeModeHint === "live"
    ? [stripeLiveSecret, stripeDefaultSecret, stripeTestSecret]
    : [stripeTestSecret, stripeDefaultSecret, stripeLiveSecret];
  return Array.from(new Set(ordered.map(clean).filter(Boolean)));
};
const createStripeClient = (secret: string): Stripe =>
  new Stripe(secret, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });
const retrievePaymentIntentWithOwningKey = async (paymentIntentId: string) => {
  let lastError = "";
  for (const secret of stripeSecretsByPreference()) {
    try {
      const stripe = createStripeClient(secret);
      return { paymentIntent: await stripe.paymentIntents.retrieve(paymentIntentId), stripe };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError || "payment_intent_retrieve_failed");
};
const authorizedBackendCaller = (req: Request): boolean => {
  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const internalSecret = req.headers.get("x-huddle-internal-secret") || "";
  return Boolean(
    (serviceRoleKey && bearer === serviceRoleKey) ||
    (releaseServicePayoutSecret && internalSecret === releaseServicePayoutSecret),
  );
};

const parseScheduledEnd = (row: Record<string, unknown>): Date | null => {
  const snapshot = (row.booking_snapshot || {}) as Record<string, unknown>;
  const snapshotEnd = clean(snapshot.endAt);
  if (snapshotEnd) {
    const dt = new Date(snapshotEnd);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  if (clean(row.care_status)) return null;
  const requestCard = (row.request_card || {}) as Record<string, unknown>;
  const explicitEndAt = clean(requestCard.endAtIso) || clean(requestCard.endAt);
  if (explicitEndAt) {
    const dt = new Date(explicitEndAt);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const requestedDates = Array.isArray(requestCard.requestedDates)
    ? requestCard.requestedDates.map(clean).filter(Boolean).sort()
    : [];
  const lastDate = requestedDates[requestedDates.length - 1] || clean(requestCard.requestedDate);
  const endTime = clean(requestCard.endTime);
  if (!lastDate || !endTime) return null;
  const dt = new Date(`${lastDate}T${endTime}:00${tzOffsetSuffix(requestCard)}`);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const endGracePassed = (row: Record<string, unknown>) => {
  const endAt = parseScheduledEnd(row);
  if (!endAt) return false;
  return Date.now() >= endAt.getTime() + 48 * 60 * 60 * 1000;
};
const careIssueBlocksPayout = (metadata: unknown): boolean => {
  const value = (metadata || {}) as Record<string, unknown>;
  const status = clean(value.status).toLowerCase();
  return (
    value.unresolved === true &&
    !clean(value.resolved_at) &&
    !clean(value.resolution) &&
    (status === "open" || status === "under_review")
  );
};

const unlockPayout = async (serviceChatId: string, lockToken: string) => {
  await supabase.rpc("unlock_service_payout_release_by_service_id", {
    p_service_chat_id: serviceChatId,
    p_lock_token: lockToken,
  });
};
const markPayoutFailed = async (serviceChatId: string, lockToken: string, reason: string) => {
  await supabase.rpc("mark_service_payout_release_failed_by_service_id", {
    p_service_chat_id: serviceChatId,
    p_lock_token: lockToken,
    p_reason: reason,
  });
};
const markPayoutManualRecovery = async (serviceChatId: string, lockToken: string, reason: string, transferId?: string | null) => {
  await supabase.rpc("mark_service_payout_manual_recovery_by_service_id", {
    p_service_chat_id: serviceChatId,
    p_lock_token: lockToken,
    p_reason: reason,
    p_stripe_transfer_id: transferId || null,
  });
};

const moneyAlert = async (serviceChatId: string, code: string, detail: Record<string, unknown> = {}) => {
  console.error("[release-service-payout] money_flow_alert", JSON.stringify({ service_chat_id: serviceChatId, code, ...detail }));
  try {
    await supabase.from("admin_audit_logs").insert({
      action: `service_payout_${code}`,
      notes: `Service payout blocked: ${code}`,
      details: { service_chat_id: serviceChatId, ...detail },
    });
  } catch {
    // Preserve the money guard result even if audit logging is unavailable.
  }
};

const serviceChatSelect =
  "id, status, care_status, checkin_submitted_at, checkin_photo_url, refund_issued_at, stripe_payment_intent_id, stripe_transfer_id, payout_release_requested_at, payout_released_at, manual_recovery_required_at, manual_recovery_reason, provider_id, request_card, booking_snapshot";

const resolvePayoutServiceChat = async (inputId: string) => {
  return await supabase
    .from("service_chats")
    .select(serviceChatSelect)
    .eq("id", inputId)
    .in("status", ["in_progress", "completed"])
    .maybeSingle();
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!authorizedBackendCaller(req)) return json({ error: "Unauthorized" }, 401);
  if (stripeSecretsByPreference().length === 0) return json({ error: "Missing Stripe secret key" }, 500);

  let serviceChatId = "";
  let payoutServiceChatId = "";
  let lockToken = "";
  let stripeTransferCreated = false;
  let stripeTransferId: string | null = null;

  try {
    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    serviceChatId = String(payload.service_chat_id || "").trim();
    if (!serviceChatId) return json({ error: "Missing service_chat_id" }, 400);

    lockToken = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const { data: preflightRow, error: preflightError } = await resolvePayoutServiceChat(serviceChatId);
    if (preflightError) return json({ error: "preflight_failed", detail: preflightError.message }, 500);
    if (!preflightRow) return json({ error: "service_chat_not_found", alert: true, service_chat_id: serviceChatId }, 404);
    const targetServiceChatId = String(preflightRow.id);
    payoutServiceChatId = targetServiceChatId;
    if (preflightRow.payout_released_at && !preflightRow.stripe_transfer_id) {
      await moneyAlert(targetServiceChatId, "released_without_transfer_id");
      return json({ error: "released_without_transfer_id", alert: true, service_chat_id: serviceChatId }, 409);
    }
    if (preflightRow.manual_recovery_required_at) {
      await moneyAlert(targetServiceChatId, "manual_recovery_required", { reason: preflightRow.manual_recovery_reason || "unknown" });
      return json({ error: "manual_recovery_required", alert: true, service_chat_id: serviceChatId }, 409);
    }

    if (preflightRow.status === "in_progress" && preflightRow.care_status === "in_progress" && endGracePassed(preflightRow as Record<string, unknown>)) {
      const { data: checkInEventForAutoComplete } = await supabase
        .from("service_care_events")
        .select("id, actor_id, media_urls, metadata")
        .eq("service_chat_id", preflightRow.id)
        .eq("event_type", "check_in")
        .limit(1)
        .maybeSingle();
      const checkInMediaForAutoComplete = Array.isArray(checkInEventForAutoComplete?.media_urls) ? checkInEventForAutoComplete.media_urls : [];
      const checkInMetadataForAutoComplete = (checkInEventForAutoComplete?.metadata || {}) as Record<string, unknown>;
      const hasRegisteredCheckInForAutoComplete = await hasRegisteredCareEvidence(
        String(preflightRow.id),
        String(preflightRow.provider_id),
        "checkin",
        checkInMediaForAutoComplete,
      );
      const hasValidatedAutoCompleteCheckIn =
        checkInEventForAutoComplete?.actor_id === preflightRow.provider_id &&
        Boolean(preflightRow.checkin_submitted_at) &&
        hasRegisteredCheckInForAutoComplete &&
        checkInMetadataForAutoComplete.pin_validated === true;
      const { data: unresolvedDisputeForAutoComplete } = await supabase
        .from("service_disputes")
        .select("id")
        .eq("service_chat_id", preflightRow.id)
        .not("status", "in", "(resolved_hold,resolved_release_full,resolved_partial_refund,resolved_refund_full)")
        .limit(1)
        .maybeSingle();
      const { data: issueEventsForAutoComplete } = await supabase
        .from("service_care_events")
        .select("id, metadata")
        .eq("service_chat_id", preflightRow.id)
        .in("event_type", ["issue_report", "dispute_evidence"]);
      const hasUnresolvedIssueForAutoComplete = (issueEventsForAutoComplete || []).some((event) => careIssueBlocksPayout(event.metadata));
      if (
        hasValidatedAutoCompleteCheckIn &&
        preflightRow.stripe_payment_intent_id &&
        preflightRow.care_status !== "handoff_issue_review" &&
        preflightRow.care_status !== "under_dispute" &&
        !preflightRow.refund_issued_at &&
        !unresolvedDisputeForAutoComplete?.id &&
        !hasUnresolvedIssueForAutoComplete
      ) {
        await supabase
          .from("service_chats")
          .update({
            status: "completed",
            care_status: "completed",
            completed_at: nowIso,
            payout_release_requested_at: nowIso,
            payout_release_attempted_at: null,
          })
          .eq("id", targetServiceChatId)
          .eq("status", "in_progress")
          .eq("care_status", "in_progress")
          .is("payout_released_at", null)
          .is("refund_issued_at", null);
      }
    }

    const { data: claimedRow, error: claimError } = await supabase.rpc("claim_service_payout_release_by_service_id", {
      p_service_chat_id: targetServiceChatId,
      p_lock_token: lockToken,
    });

    if (claimError) {
      return json({ error: "claim_failed", detail: claimError.message }, 500);
    }

    const claimedPayload = (claimedRow || {}) as Record<string, unknown>;
    if (claimedPayload.claimed !== true) {
      return json({ ok: true, skipped: "already_released_or_claimed" });
    }

    const serviceChat = claimedPayload;
    const { data: checkInEvent, error: checkInEventError } = await supabase
      .from("service_care_events")
      .select("id, actor_id, media_urls, metadata")
      .eq("service_chat_id", serviceChat.id)
      .eq("event_type", "check_in")
      .limit(1)
      .maybeSingle();
    if (checkInEventError) {
      await markPayoutFailed(targetServiceChatId, lockToken, `checkin_guard_failed:${checkInEventError.message}`);
      return json({ error: "checkin_guard_failed", detail: checkInEventError.message }, 500);
    }
    const checkInMedia = Array.isArray(checkInEvent?.media_urls) ? checkInEvent.media_urls : [];
    const checkInMetadata = (checkInEvent?.metadata || {}) as Record<string, unknown>;
    const hasRegisteredCheckIn = await hasRegisteredCareEvidence(
      String(serviceChat.id),
      String(serviceChat.provider_id),
      "checkin",
      checkInMedia,
    );
    const hasValidatedCheckIn =
      checkInEvent?.actor_id === serviceChat.provider_id &&
      Boolean(serviceChat.checkin_submitted_at) &&
      hasRegisteredCheckIn &&
      checkInMetadata.pin_validated === true;
    if (
      serviceChat.care_status === "handoff_issue_review" ||
      serviceChat.care_status === "under_dispute" ||
      serviceChat.care_status !== "completed" ||
      Boolean(serviceChat.refund_issued_at) ||
      !serviceChat.checkin_submitted_at ||
      !checkInEvent?.id ||
      !hasValidatedCheckIn
    ) {
      const guardCode = "missing_valid_checkin";
      await markPayoutFailed(targetServiceChatId, lockToken, guardCode);
      await moneyAlert(targetServiceChatId, guardCode);
      return json({ error: guardCode, alert: true, service_chat_id: serviceChatId }, 409);
    }

    const { data: unresolvedDispute, error: disputeGuardError } = await supabase
      .from("service_disputes")
      .select("id")
      .eq("service_chat_id", serviceChat.id)
      .not("status", "in", "(resolved_hold,resolved_release_full,resolved_partial_refund,resolved_refund_full)")
      .limit(1)
      .maybeSingle();
    if (disputeGuardError) {
      await markPayoutFailed(targetServiceChatId, lockToken, `dispute_guard_failed:${disputeGuardError.message}`);
      return json({ error: "dispute_guard_failed", detail: disputeGuardError.message }, 500);
    }
    if (unresolvedDispute?.id) {
      await markPayoutFailed(targetServiceChatId, lockToken, "blocked_open_dispute");
      await moneyAlert(targetServiceChatId, "blocked_open_dispute", { dispute_id: unresolvedDispute.id });
      return json({ error: "open_dispute_or_safety_issue", alert: true, service_chat_id: serviceChatId }, 409);
    }

    const { data: issueEvents, error: issueGuardError } = await supabase
      .from("service_care_events")
      .select("id, metadata")
      .eq("service_chat_id", serviceChat.id)
      .in("event_type", ["issue_report", "dispute_evidence"]);
    if (issueGuardError) {
      await markPayoutFailed(targetServiceChatId, lockToken, `issue_guard_failed:${issueGuardError.message}`);
      return json({ error: "issue_guard_failed", detail: issueGuardError.message }, 500);
    }
    if ((issueEvents || []).some((event) => careIssueBlocksPayout(event.metadata))) {
      await markPayoutFailed(targetServiceChatId, lockToken, "blocked_open_issue");
      await moneyAlert(targetServiceChatId, "blocked_open_issue", { issue_event_count: (issueEvents || []).length });
      return json({ error: "open_issue_or_dispute_evidence", alert: true, service_chat_id: serviceChatId }, 409);
    }

    const servicePaymentIntentId = clean(serviceChat.stripe_payment_intent_id);
    if (!servicePaymentIntentId) {
      await markPayoutFailed(targetServiceChatId, lockToken, "missing_payment_intent");
      await moneyAlert(targetServiceChatId, "missing_payment_intent");
      return json({ error: "missing_payment_intent", alert: true, service_chat_id: serviceChatId }, 409);
    }

    const { data: alreadyReleased } = await supabase
      .from("service_chats")
      .select("payout_released_at")
      .eq("id", String(serviceChat.id))
      .maybeSingle();

    if (alreadyReleased?.payout_released_at) {
      await unlockPayout(targetServiceChatId, lockToken);
      return json({ ok: true, skipped: "already_released" });
    }

    let stripe: Stripe;
    let paymentIntent: Stripe.PaymentIntent;
    try {
      const resolved = await retrievePaymentIntentWithOwningKey(servicePaymentIntentId);
      stripe = resolved.stripe;
      paymentIntent = resolved.paymentIntent;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markPayoutFailed(targetServiceChatId, lockToken, `payment_intent_retrieve_failed:${message}`);
      await moneyAlert(targetServiceChatId, "payment_intent_retrieve_failed", { payment_intent_id: servicePaymentIntentId, detail: message });
      return json({ error: "payment_intent_retrieve_failed", alert: true, detail: message }, 502);
    }
    const providerStripeAccountId = String(paymentIntent.metadata?.provider_stripe_account_id || "").trim();
    const providerPayoutCents = Number(paymentIntent.metadata?.provider_payout_cents || 0);

    if (paymentIntent.status !== "succeeded") {
      await markPayoutFailed(targetServiceChatId, lockToken, `payment_intent_not_succeeded:${paymentIntent.status}`);
      await moneyAlert(targetServiceChatId, "payment_intent_not_succeeded", { payment_intent_id: paymentIntent.id, status: paymentIntent.status });
      return json({ error: "payment_intent_not_succeeded", alert: true, payment_intent_status: paymentIntent.status }, 409);
    }

    if (!providerStripeAccountId || !Number.isFinite(providerPayoutCents) || providerPayoutCents <= 0) {
      await markPayoutFailed(targetServiceChatId, lockToken, "missing_payout_metadata");
      await moneyAlert(targetServiceChatId, "missing_payout_metadata", { payment_intent_id: paymentIntent.id });
      return json({ error: "missing_payout_metadata", alert: true, service_chat_id: serviceChatId }, 409);
    }

    const { error: payoutRecordError } = await supabase.rpc("upsert_care_payment_movement", {
      p_service_chat_id: targetServiceChatId,
      p_movement_kind: "carer_payout",
      p_movement_reason: "care_completion",
      p_source_kind: "release_service_payout",
      p_source_record_id: targetServiceChatId,
      p_amount_minor: providerPayoutCents,
      p_currency: clean(paymentIntent.currency).toUpperCase(),
      p_status: "submitted",
      p_stripe_payment_intent_id: paymentIntent.id,
      p_stripe_refund_id: null,
      p_stripe_transfer_id: null,
      p_requested_at: clean(serviceChat.payout_release_requested_at) || new Date().toISOString(),
      p_processed_at: null,
    });
    if (payoutRecordError) {
      await markPayoutFailed(targetServiceChatId, lockToken, `payout_record_failed:${payoutRecordError.message}`);
      return json({ error: "payout_record_failed", alert: true }, 500);
    }

    const amountReceived = Number(paymentIntent.amount_received || 0);
    if (amountReceived < providerPayoutCents) {
      await markPayoutFailed(targetServiceChatId, lockToken, "amount_received_below_payout");
      await moneyAlert(targetServiceChatId, "amount_received_below_payout", { payment_intent_id: paymentIntent.id, amount_received: amountReceived, provider_payout_cents: providerPayoutCents });
      return json({ error: "amount_received_below_payout", alert: true, amount_received: amountReceived, provider_payout_cents: providerPayoutCents }, 409);
    }

    let disputes: Stripe.ApiList<Stripe.Dispute>;
    try {
      disputes = await stripe.disputes.list({ payment_intent: paymentIntent.id, limit: 10 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markPayoutFailed(targetServiceChatId, lockToken, `stripe_dispute_check_failed:${message}`);
      await moneyAlert(targetServiceChatId, "stripe_dispute_check_failed", { payment_intent_id: paymentIntent.id, detail: message });
      return json({ error: "stripe_dispute_check_failed", alert: true, detail: message }, 502);
    }
    const activeStripeDispute = disputes.data.find((dispute: Stripe.Dispute) =>
      !["won", "lost", "warning_closed"].includes(String(dispute.status || "").toLowerCase())
    );
    if (activeStripeDispute) {
      await markPayoutFailed(targetServiceChatId, lockToken, "blocked_active_stripe_dispute");
      await moneyAlert(targetServiceChatId, "blocked_active_stripe_dispute", { payment_intent_id: paymentIntent.id, dispute_id: activeStripeDispute.id });
      return json({ error: "active_stripe_dispute", alert: true, dispute_id: activeStripeDispute.id }, 409);
    }

    const latestChargeId = typeof paymentIntent.latest_charge === "string"
      ? paymentIntent.latest_charge
      : (paymentIntent.latest_charge as { id?: string } | null)?.id || undefined;
    const transferCreateParams: Stripe.TransferCreateParams = {
      amount: providerPayoutCents,
      currency: paymentIntent.currency || "usd",
      destination: providerStripeAccountId,
      transfer_group: `service_chat_${targetServiceChatId}`,
      metadata: {
        service_chat_id: targetServiceChatId,
        payment_intent_id: paymentIntent.id,
      },
    };
    if (latestChargeId) transferCreateParams.source_transaction = latestChargeId;

    let transfer: Stripe.Transfer;
    try {
      transfer = await stripe.transfers.create(
        transferCreateParams,
        { idempotencyKey: `service_payout:${targetServiceChatId}:${providerPayoutCents}:${paymentIntent.id}` },
      );
      stripeTransferCreated = true;
      stripeTransferId = transfer.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markPayoutFailed(targetServiceChatId, lockToken, `stripe_transfer_failed:${message}`);
      await moneyAlert(targetServiceChatId, "stripe_transfer_failed", { payment_intent_id: paymentIntent.id, detail: message });
      return json({ error: "stripe_transfer_failed", alert: true, detail: message }, 502);
    }

    const { data: releaseUpdateRow, error: releaseUpdateError } = await supabase.rpc("mark_service_payout_released_by_service_id", {
      p_service_chat_id: targetServiceChatId,
      p_lock_token: lockToken,
      p_stripe_transfer_id: transfer.id,
    });
    const releaseUpdatePayload = (releaseUpdateRow || {}) as Record<string, unknown>;
    if (releaseUpdateError || releaseUpdatePayload.updated !== true) {
      await markPayoutManualRecovery(targetServiceChatId, lockToken, "db_mark_release_failed_after_transfer", transfer.id);
      await moneyAlert(targetServiceChatId, "db_mark_release_failed_after_transfer", { transfer_id: transfer.id, detail: releaseUpdateError?.message || "no_row_updated" });
      return json({ error: "db_mark_release_failed_after_transfer", alert: true, stripe_transfer_id: transfer.id }, 500);
    }

    return json({ ok: true });
  } catch (error) {
    if (serviceChatId) {
      const safeServiceChatId = payoutServiceChatId || serviceChatId;
      if (stripeTransferCreated) {
        await markPayoutManualRecovery(safeServiceChatId, lockToken, "exception_after_stripe_transfer", stripeTransferId);
      } else if (lockToken) {
        await unlockPayout(safeServiceChatId, lockToken);
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[release-service-payout] failed:", message);
    return json({ error: "internal_error", detail: message }, 500);
  }
});
