import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stripeSecret =
  Deno.env.get("STRIPE_LIVE_SECRET_KEY") ||
  Deno.env.get("STRIPE_SECRET_KEY") ||
  Deno.env.get("STRIPE_TEST_SECRET_KEY") ||
  "";

const stripe = new Stripe(stripeSecret, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") as string,
  (Deno.env.get("HUDDLE_SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) as string,
);
const releaseServicePayoutSecret = Deno.env.get("RELEASE_SERVICE_PAYOUT_SECRET") || "";
const serviceRoleKey = Deno.env.get("HUDDLE_SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const clean = (value: unknown): string => String(value || "").trim();
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
  const requestedDates = Array.isArray(requestCard.requestedDates)
    ? requestCard.requestedDates.map(clean).filter(Boolean).sort()
    : [];
  const lastDate = requestedDates[requestedDates.length - 1] || clean(requestCard.requestedDate);
  const endTime = clean(requestCard.endTime);
  if (!lastDate || !endTime) return null;
  const dt = new Date(`${lastDate}T${endTime}:00Z`);
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!authorizedBackendCaller(req)) return json({ error: "Unauthorized" }, 401);
  if (!stripeSecret) return json({ error: "Missing Stripe secret key" }, 500);

  let serviceChatId = "";
  let lockToken = "";

  try {
    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    serviceChatId = String(payload.service_chat_id || "").trim();
    if (!serviceChatId) return json({ error: "Missing service_chat_id" }, 400);

    lockToken = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const staleLockIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: preflightRow, error: preflightError } = await supabase
      .from("service_chats")
      .select("id, chat_id, status, care_status, checkin_submitted_at, checkin_photo_url, refund_issued_at, stripe_payment_intent_id, provider_id, request_card, booking_snapshot")
      .eq("chat_id", serviceChatId)
      .maybeSingle();
    if (preflightError) return json({ error: "preflight_failed", detail: preflightError.message }, 500);
    if (!preflightRow) return json({ ok: true, skipped: "service_chat_not_found" });

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
      const hasValidatedAutoCompleteCheckIn =
        checkInEventForAutoComplete?.actor_id === preflightRow.provider_id &&
        Boolean(preflightRow.checkin_submitted_at) &&
        (checkInMediaForAutoComplete.length > 0 || Boolean(clean(preflightRow.checkin_photo_url))) &&
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
            payout_release_lock_token: null,
            payout_release_locked_at: null,
          })
          .eq("chat_id", serviceChatId)
          .eq("status", "in_progress")
          .eq("care_status", "in_progress")
          .is("payout_released_at", null)
          .is("refund_issued_at", null);
      }
    }

    const { data: claimedRow, error: claimError } = await supabase
      .from("service_chats")
      .update({
        payout_release_lock_token: lockToken,
        payout_release_locked_at: nowIso,
        payout_release_attempted_at: nowIso,
      })
      .eq("chat_id", serviceChatId)
      .eq("status", "completed")
      .is("payout_released_at", null)
      .or(`payout_release_lock_token.is.null,payout_release_locked_at.lt.${staleLockIso}`)
      .select("id, chat_id, status, care_status, checkin_submitted_at, checkin_photo_url, refund_issued_at, stripe_payment_intent_id, provider_id, request_card")
      .maybeSingle();

    if (claimError) {
      return json({ error: "claim_failed", detail: claimError.message }, 500);
    }

    if (!claimedRow) {
      return json({ ok: true, skipped: "already_released_or_claimed" });
    }

    const serviceChat = claimedRow;
    const { data: checkInEvent, error: checkInEventError } = await supabase
      .from("service_care_events")
      .select("id, actor_id, media_urls, metadata")
      .eq("service_chat_id", serviceChat.id)
      .eq("event_type", "check_in")
      .limit(1)
      .maybeSingle();
    if (checkInEventError) {
      await supabase
        .from("service_chats")
        .update({
          payout_release_lock_token: null,
          payout_release_locked_at: null,
        })
        .eq("chat_id", serviceChatId)
        .eq("payout_release_lock_token", lockToken);
      return json({ error: "checkin_guard_failed", detail: checkInEventError.message }, 500);
    }
    const checkInMedia = Array.isArray(checkInEvent?.media_urls) ? checkInEvent.media_urls : [];
    const checkInMetadata = (checkInEvent?.metadata || {}) as Record<string, unknown>;
    const hasValidatedCheckIn =
      checkInEvent?.actor_id === serviceChat.provider_id &&
      Boolean(serviceChat.checkin_submitted_at) &&
      (checkInMedia.length > 0 || Boolean(clean(serviceChat.checkin_photo_url))) &&
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
      await supabase
        .from("service_chats")
        .update({
          payout_release_lock_token: null,
          payout_release_locked_at: null,
        })
        .eq("chat_id", serviceChatId)
        .eq("payout_release_lock_token", lockToken);
      return json({ ok: true, skipped: "missing_valid_checkin" });
    }

    const { data: unresolvedDispute, error: disputeGuardError } = await supabase
      .from("service_disputes")
      .select("id")
      .eq("service_chat_id", serviceChat.id)
      .not("status", "in", "(resolved_hold,resolved_release_full,resolved_partial_refund,resolved_refund_full)")
      .limit(1)
      .maybeSingle();
    if (disputeGuardError) {
      await supabase
        .from("service_chats")
        .update({
          payout_release_lock_token: null,
          payout_release_locked_at: null,
        })
        .eq("chat_id", serviceChatId)
        .eq("payout_release_lock_token", lockToken);
      return json({ error: "dispute_guard_failed", detail: disputeGuardError.message }, 500);
    }
    if (unresolvedDispute?.id) {
      await supabase
        .from("service_chats")
        .update({
          payout_release_lock_token: null,
          payout_release_locked_at: null,
        })
        .eq("chat_id", serviceChatId)
        .eq("payout_release_lock_token", lockToken);
      return json({ ok: true, skipped: "open_dispute_or_safety_issue" });
    }

    const { data: issueEvents, error: issueGuardError } = await supabase
      .from("service_care_events")
      .select("id, metadata")
      .eq("service_chat_id", serviceChat.id)
      .in("event_type", ["issue_report", "dispute_evidence"]);
    if (issueGuardError) {
      await supabase
        .from("service_chats")
        .update({
          payout_release_lock_token: null,
          payout_release_locked_at: null,
        })
        .eq("chat_id", serviceChatId)
        .eq("payout_release_lock_token", lockToken);
      return json({ error: "issue_guard_failed", detail: issueGuardError.message }, 500);
    }
    if ((issueEvents || []).some((event) => careIssueBlocksPayout(event.metadata))) {
      await supabase
        .from("service_chats")
        .update({
          payout_release_lock_token: null,
          payout_release_locked_at: null,
        })
        .eq("chat_id", serviceChatId)
        .eq("payout_release_lock_token", lockToken);
      return json({ ok: true, skipped: "open_issue_or_dispute_evidence" });
    }

    if (!serviceChat.stripe_payment_intent_id) {
      await supabase
        .from("service_chats")
        .update({
          payout_release_lock_token: null,
          payout_release_locked_at: null,
        })
        .eq("chat_id", serviceChatId)
        .eq("payout_release_lock_token", lockToken);
      return json({ ok: true, skipped: "missing_payment_intent" });
    }

    const { data: alreadyReleased } = await supabase
      .from("service_chats")
      .select("payout_released_at")
      .eq("chat_id", serviceChatId)
      .maybeSingle();

    if (alreadyReleased?.payout_released_at) {
      await supabase
        .from("service_chats")
        .update({
          payout_release_lock_token: null,
          payout_release_locked_at: null,
        })
        .eq("chat_id", serviceChatId)
        .eq("payout_release_lock_token", lockToken);
      return json({ ok: true, skipped: "already_released" });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(serviceChat.stripe_payment_intent_id);
    const providerStripeAccountId = String(paymentIntent.metadata?.provider_stripe_account_id || "").trim();
    const providerPayoutCents = Number(paymentIntent.metadata?.provider_payout_cents || 0);

    if (!providerStripeAccountId || !providerPayoutCents) {
      await supabase
        .from("service_chats")
        .update({
          payout_release_lock_token: null,
          payout_release_locked_at: null,
        })
        .eq("chat_id", serviceChatId)
        .eq("payout_release_lock_token", lockToken);
      return json({ ok: true, skipped: "missing_payout_metadata" });
    }

    await stripe.transfers.create({
      amount: providerPayoutCents,
      currency: paymentIntent.currency || "usd",
      destination: providerStripeAccountId,
      transfer_group: `service_chat_${serviceChatId}`,
      metadata: {
        service_chat_id: serviceChatId,
        payment_intent_id: paymentIntent.id,
      },
    });

    await supabase
      .from("service_chats")
      .update({
        payout_released_at: new Date().toISOString(),
        payout_release_lock_token: null,
        payout_release_locked_at: null,
      })
      .eq("chat_id", serviceChatId)
      .eq("payout_release_lock_token", lockToken);

    const providerId = String((serviceChat as Record<string, unknown>)?.provider_id || "").trim();
    const requestCard = ((serviceChat as Record<string, unknown>)?.request_card || {}) as Record<string, unknown>;
    const serviceType = String(requestCard.serviceType || "service").trim() || "service";
    if (providerId) {
      await supabase.rpc("service_notify", {
        p_user_id: providerId,
        p_kind: "service_payout_released",
        p_title: "Payout released",
        p_body: `Your earnings for ${serviceType} are on the way.`,
        p_href: `/chats?tab=service&room=${serviceChatId}`,
        p_data: {
          kind: "service_payout_released",
          chatId: serviceChatId,
          serviceType,
        },
      });
    }

    return json({ ok: true });
  } catch (error) {
    if (serviceChatId) {
      let unlockQuery = supabase
        .from("service_chats")
        .update({
          payout_release_lock_token: null,
          payout_release_locked_at: null,
        })
        .eq("chat_id", serviceChatId);
      if (lockToken) {
        unlockQuery = unlockQuery.eq("payout_release_lock_token", lockToken);
      }
      await unlockQuery;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[release-service-payout] failed:", message);
    return json({ error: "internal_error", detail: message }, 500);
  }
});
