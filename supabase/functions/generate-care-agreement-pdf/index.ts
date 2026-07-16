import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.93.1";
import { buildCareAgreementPdf } from "./pdf.ts";
import { HUDDLE_WORDMARK_WHITE_PNG_BASE64 } from "./huddle-wordmark-white.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MAX_PDF_RETRY_ATTEMPTS = 12;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const clean = (value: unknown) => String(value ?? "").trim();
type SupabaseAdminClient = SupabaseClient<any, "public", any>;
const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const normalizeTaskList = (value: unknown) => Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
const requestCardFromQuoteCard = (quoteCard: Record<string, unknown>): Record<string, unknown> => ({
  serviceType: clean(quoteCard.serviceType),
  serviceTypes: normalizeTaskList(quoteCard.serviceTypes),
  petId: clean(quoteCard.petId),
  petIds: normalizeTaskList(quoteCard.petIds),
  petName: clean(quoteCard.petName),
  petType: clean(quoteCard.petType),
  dogSize: clean(quoteCard.dogSize),
  pets: Array.isArray(quoteCard.pets) ? quoteCard.pets : [],
  requestedDates: normalizeTaskList(quoteCard.requestedDates),
  requestedDate: normalizeTaskList(quoteCard.requestedDates)[0] || "",
  startTime: clean(quoteCard.startTime),
  endTime: clean(quoteCard.endTime),
  locationStyles: normalizeTaskList(quoteCard.locationStyles),
  locationArea: clean(quoteCard.locationArea),
  locationCountry: clean(quoteCard.locationCountry),
  suggestedCurrency: clean(quoteCard.currency),
  suggestedPrice: clean(quoteCard.finalPrice),
  suggestedRate: clean(quoteCard.rate),
  scopeFrequency: clean(quoteCard.scopeFrequency),
  scopeTasks: normalizeTaskList(quoteCard.scopeTasks),
  otherTasks: clean(quoteCard.otherTasks),
  updatePreference: clean(quoteCard.updatePreference),
});
const visibleRequestCard = (
  requestCard: Record<string, unknown>,
  quoteCard: Record<string, unknown>,
  actorRole: string,
): Record<string, unknown> => {
  if (!Object.keys(requestCard).length) return requestCardFromQuoteCard(quoteCard);
  if (!Object.keys(quoteCard).length) return requestCard;
  const base: Record<string, unknown> = {
    ...requestCard,
    serviceType: clean(requestCard.serviceType) || clean(quoteCard.serviceType),
    serviceTypes: normalizeTaskList(requestCard.serviceTypes).length ? normalizeTaskList(requestCard.serviceTypes) : normalizeTaskList(quoteCard.serviceTypes),
    petId: clean(requestCard.petId) || clean(quoteCard.petId),
    petIds: normalizeTaskList(requestCard.petIds).length ? normalizeTaskList(requestCard.petIds) : normalizeTaskList(quoteCard.petIds),
    petName: clean(requestCard.petName) || clean(quoteCard.petName),
    petType: clean(requestCard.petType) || clean(quoteCard.petType),
    dogSize: clean(requestCard.dogSize) || clean(quoteCard.dogSize),
    pets: Array.isArray(requestCard.pets) && requestCard.pets.length ? requestCard.pets : Array.isArray(quoteCard.pets) ? quoteCard.pets : [],
    requestedDates: normalizeTaskList(requestCard.requestedDates).length ? normalizeTaskList(requestCard.requestedDates) : normalizeTaskList(quoteCard.requestedDates),
    startTime: clean(requestCard.startTime) || clean(quoteCard.startTime),
    endTime: clean(requestCard.endTime) || clean(quoteCard.endTime),
    locationStyles: normalizeTaskList(requestCard.locationStyles).length ? normalizeTaskList(requestCard.locationStyles) : normalizeTaskList(quoteCard.locationStyles),
    locationArea: clean(requestCard.locationArea) || clean(quoteCard.locationArea),
    locationCountry: clean(requestCard.locationCountry) || clean(quoteCard.locationCountry),
    suggestedCurrency: clean(requestCard.suggestedCurrency),
    suggestedPrice: clean(requestCard.suggestedPrice),
    suggestedRate: clean(requestCard.suggestedRate),
    scopeFrequency: clean(requestCard.scopeFrequency),
    scopeTasks: normalizeTaskList(requestCard.scopeTasks),
    otherTasks: clean(requestCard.otherTasks),
    updatePreference: clean(requestCard.updatePreference) || clean(quoteCard.updatePreference),
  };
  const quoteOwnsCurrentTurn = actorRole === "carer";
  const paymentFieldsPresent = Boolean(clean(quoteCard.currency) || clean(quoteCard.finalPrice) || clean(quoteCard.rate) || quoteCard.voluntary === true);
  return {
    ...base,
    serviceType: quoteOwnsCurrentTurn ? clean(quoteCard.serviceType) || clean(base.serviceType) : clean(base.serviceType),
    serviceTypes: quoteOwnsCurrentTurn && normalizeTaskList(quoteCard.serviceTypes).length ? normalizeTaskList(quoteCard.serviceTypes) : normalizeTaskList(base.serviceTypes),
    petId: quoteOwnsCurrentTurn ? clean(quoteCard.petId) || clean(base.petId) : clean(base.petId),
    petIds: quoteOwnsCurrentTurn && normalizeTaskList(quoteCard.petIds).length ? normalizeTaskList(quoteCard.petIds) : normalizeTaskList(base.petIds),
    petName: quoteOwnsCurrentTurn ? clean(quoteCard.petName) || clean(base.petName) : clean(base.petName),
    petType: quoteOwnsCurrentTurn ? clean(quoteCard.petType) || clean(base.petType) : clean(base.petType),
    dogSize: quoteOwnsCurrentTurn ? clean(quoteCard.dogSize) || clean(base.dogSize) : clean(base.dogSize),
    pets: quoteOwnsCurrentTurn && Array.isArray(quoteCard.pets) && quoteCard.pets.length ? quoteCard.pets : base.pets,
    requestedDates: quoteOwnsCurrentTurn && normalizeTaskList(quoteCard.requestedDates).length ? normalizeTaskList(quoteCard.requestedDates) : normalizeTaskList(base.requestedDates),
    startTime: quoteOwnsCurrentTurn ? clean(quoteCard.startTime) || clean(base.startTime) : clean(base.startTime),
    endTime: quoteOwnsCurrentTurn ? clean(quoteCard.endTime) || clean(base.endTime) : clean(base.endTime),
    locationStyles: quoteOwnsCurrentTurn && normalizeTaskList(quoteCard.locationStyles).length ? normalizeTaskList(quoteCard.locationStyles) : normalizeTaskList(base.locationStyles),
    locationArea: quoteOwnsCurrentTurn ? clean(quoteCard.locationArea) || clean(base.locationArea) : clean(base.locationArea),
    locationCountry: quoteOwnsCurrentTurn ? clean(quoteCard.locationCountry) || clean(base.locationCountry) : clean(base.locationCountry),
    suggestedCurrency: quoteOwnsCurrentTurn && paymentFieldsPresent ? clean(quoteCard.currency) : clean(base.suggestedCurrency),
    suggestedPrice: quoteOwnsCurrentTurn && paymentFieldsPresent ? clean(quoteCard.finalPrice) : clean(base.suggestedPrice),
    suggestedRate: quoteOwnsCurrentTurn && paymentFieldsPresent ? clean(quoteCard.rate) : clean(base.suggestedRate),
    scopeFrequency: quoteOwnsCurrentTurn ? clean(quoteCard.scopeFrequency) || clean(base.scopeFrequency) : clean(base.scopeFrequency),
    scopeTasks: quoteOwnsCurrentTurn && normalizeTaskList(quoteCard.scopeTasks).length ? normalizeTaskList(quoteCard.scopeTasks) : normalizeTaskList(base.scopeTasks),
    otherTasks: quoteOwnsCurrentTurn ? clean(quoteCard.otherTasks) || clean(base.otherTasks) : clean(base.otherTasks),
  };
};
// Countries where a single IANA zone unambiguously covers the whole country.
// Deliberately excludes multi-zone countries (US, Canada, Australia, Russia,
// Brazil, Mexico, Indonesia, etc.) -- guessing a zone within those would silently
// show the wrong local time, which is worse than the honest UTC fallback below.
const SINGLE_TIMEZONE_COUNTRIES: Record<string, string> = {
  "hong kong": "Asia/Hong_Kong",
  singapore: "Asia/Singapore",
  japan: "Asia/Tokyo",
  "south korea": "Asia/Seoul",
  taiwan: "Asia/Taipei",
  philippines: "Asia/Manila",
  thailand: "Asia/Bangkok",
  vietnam: "Asia/Ho_Chi_Minh",
  malaysia: "Asia/Kuala_Lumpur",
  "united kingdom": "Europe/London",
  "great britain": "Europe/London",
  ireland: "Europe/Dublin",
  france: "Europe/Paris",
  germany: "Europe/Berlin",
  spain: "Europe/Madrid",
  italy: "Europe/Rome",
  netherlands: "Europe/Amsterdam",
  "new zealand": "Pacific/Auckland",
  "united arab emirates": "Asia/Dubai",
  uae: "Asia/Dubai",
};
const pickSnapshotTimeZone = (snapshot: Record<string, unknown>) => {
  const requestCard = objectValue(snapshot.requestCard);
  const quoteCard = objectValue(snapshot.quoteCard);
  const direct = clean(
    snapshot.timeZone
      || snapshot.timezone
      || snapshot.bookingTimeZone
      || snapshot.locationTimeZone
      || requestCard.timeZone
      || requestCard.timezone
      || quoteCard.timeZone
      || quoteCard.timezone,
  );
  if (direct) return direct;
  const offset = clean(snapshot.tzOffset || requestCard.tzOffset || quoteCard.tzOffset);
  if (/^[+-]\d{2}:\d{2}$/.test(offset)) return `UTC${offset}`;
  const country = clean(snapshot.locationCountry || requestCard.locationCountry || quoteCard.locationCountry).toLowerCase();
  if (country && SINGLE_TIMEZONE_COUNTRIES[country]) return SINGLE_TIMEZONE_COUNTRIES[country];
  if (/\b(HK|Hong Kong)\b/i.test([
    snapshot.locationArea,
    snapshot.locationSummary,
    snapshot.locationAddress,
    requestCard.locationArea,
    quoteCard.locationArea,
  ].map(clean).join(" "))) return "Asia/Hong_Kong";
  return "";
};
const hasMandatoryCareInstruction = (snapshot: Record<string, unknown>) => {
  const careDetails = objectValue(snapshot.careDetails);
  const vet = objectValue(careDetails.emergencyVetAuthorization || snapshot.emergencyVetAuthorization);
  if (!clean(careDetails.ownerContact || careDetails.owner_contact || careDetails.contact || snapshot.ownerContact || snapshot.owner_contact || snapshot.contact)) return false;
  if (!clean(careDetails.emergencyContact || snapshot.emergencyContact)) return false;
  if (!clean(careDetails.handoffLocation || snapshot.handoffLocation)) return false;
  if (typeof vet.authorized !== "boolean") return false;
  if (vet.authorized === true) {
    const capMinor = Number(vet.capMinor || 0);
    if (!Number.isFinite(capMinor) || capMinor <= 0) return false;
  }
  return true;
};
const firstSecretKey = (value: string | null | undefined) => {
  const raw = String(value || "").trim().replace(/^['"]+|['"]+$/g, "");
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item || "").trim()).find(Boolean) || "";
    if (parsed && typeof parsed === "object") return Object.values(parsed).map((item) => String(item || "").trim()).find(Boolean) || "";
  } catch {
    // Fall through to delimited parsing.
  }
  return raw.split(/[\s,]+/).map((item) => item.trim().replace(/^['"]+|['"]+$/g, "")).find(Boolean) || "";
};

// Unicode body font (Noto Sans SC — covers Latin + Han + kana) so non-ASCII names
// (incl. Chinese / Japanese) render rather than crash the document. Bold text in
// the document is all ASCII, so the builder keeps Helvetica-Bold for headings.
// Cached across warm invocations; on any failure the builder falls back to the
// standard font + glyph sanitiser (never throws). PDF generation is an async
// background job (with a retry queue), so the larger cold-start fetch is acceptable.
let logoCache: Uint8Array | null | undefined;
const loadFonts = async (): Promise<{ regular: Uint8Array } | null> => {
  // iOS Quick Look rendered the subsetted remote Noto font as unreadable glyphs
  // in generated agreements. Use standard PDF fonts until we ship a bundled,
  // device-verified Unicode font path.
  return null;
};
const loadLogo = async (): Promise<Uint8Array | null> => {
  if (logoCache !== undefined) return logoCache;
  try {
    const binary = atob(HUDDLE_WORDMARK_WHITE_PNG_BASE64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    logoCache = bytes;
    return logoCache;
  } catch (error) {
    console.warn("[generate-care-agreement-pdf] wordmark unavailable, using text-only header:", error instanceof Error ? error.message : error);
    logoCache = null;
    return null;
  }
};

const alertPdfRetryExhausted = async (
  supabase: SupabaseAdminClient,
  agreementId: string,
  errorMessage: string,
) => {
  const { data: agreement } = await supabase
    .from("service_care_agreements")
    .select("id, service_chat_id, service_chats(id, chat_id, requester_id, provider_id)")
    .eq("id", agreementId)
    .maybeSingle();
  const agreementRow = agreement as { id?: string; service_chat_id?: string; service_chats?: unknown } | null;
  const chat = agreementRow?.service_chats as { id?: string; chat_id?: string; requester_id?: string; provider_id?: string } | null | undefined;
  if (!agreementRow?.service_chat_id || !agreementRow?.id || !chat?.requester_id || !chat?.provider_id) return;

  await supabase.from("admin_audit_logs").insert({
    actor_id: chat.requester_id,
    action: "care_agreement_pdf_exhausted",
    notes: "Care Agreement PDF retry limit exhausted.",
    details: {
      agreement_id: agreementRow.id,
      service_chat_id: agreementRow.service_chat_id,
      chat_id: chat.chat_id,
      max_attempts: MAX_PDF_RETRY_ATTEMPTS,
      last_error: errorMessage,
    },
  });

  for (const userId of [chat.requester_id, chat.provider_id]) {
    await supabase.rpc("service_notify", {
      p_user_id: userId,
      p_kind: "care_agreement_pdf_delayed",
      p_title: "Agreement PDF delayed",
      p_body: "Your Care Agreement PDF is delayed; the signed agreement remains on file.",
      p_href: `/chats?tab=service&room=${chat.chat_id || ""}`,
      p_data: {
        kind: "care_agreement_pdf_delayed",
        chatId: chat.chat_id || "",
        serviceChatId: agreementRow.service_chat_id,
        agreementId: agreementRow.id,
      },
    });
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let serviceChatId = "";
  let agreementId = "";
  let nextAttemptCount = 1;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey =
      firstSecretKey(Deno.env.get("SUPABASE_SECRET_KEYS")) ||
      firstSecretKey(Deno.env.get("SUPABASE_SECRET_KEY")) ||
      firstSecretKey(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    if (!supabaseUrl || !supabaseServiceKey) return json({ error: "Server is not configured" }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Authentication required" }, 401);

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });
    const internalRequest = token === supabaseServiceKey;
    const { data: userData, error: userError } = internalRequest
      ? { data: { user: null }, error: null }
      : await supabase.auth.getUser(token);
    if (!internalRequest && (userError || !userData.user)) return json({ error: "Authentication required" }, 401);

    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    if (payload.process_pending === true) {
      if (!internalRequest) return json({ error: "Forbidden" }, 403);
      const { data: queued, error: backfillError } = await supabase.rpc("backfill_care_agreement_pdf_generation_jobs");
      if (backfillError) throw backfillError;

      const limit = Math.max(1, Math.min(Number(payload.limit || 10) || 10, 50));
      const { data: jobs, error: jobsError } = await supabase
        .from("care_agreement_pdf_generation_jobs")
        .select("id, service_chat_id")
        .in("status", ["pending", "failed"])
        .lte("next_attempt_at", new Date().toISOString())
        .lt("attempt_count", MAX_PDF_RETRY_ATTEMPTS)
        .order("next_attempt_at", { ascending: true })
        .limit(limit);
      if (jobsError) throw jobsError;

      let processed = 0;
      let succeeded = 0;
      let failed = 0;
      for (const job of jobs || []) {
        processed += 1;
        const { data, error } = await supabase.functions.invoke("generate-care-agreement-pdf", {
          headers: { Authorization: `Bearer ${supabaseServiceKey}` },
          body: {
            service_chat_id: job.service_chat_id,
            source: "admin_pdf_retry",
          },
        });
        if (error || (data as { ok?: boolean } | null)?.ok !== true) {
          failed += 1;
        } else {
          succeeded += 1;
        }
      }

      return json({ ok: true, queued: queued ?? 0, processed, succeeded, failed });
    }

    if (payload.backfill === true) {
      if (!internalRequest) return json({ error: "Forbidden" }, 403);
      const { data: queued, error: backfillError } = await supabase.rpc("backfill_care_agreement_pdf_generation_jobs");
      if (backfillError) throw backfillError;
      return json({ ok: true, queued: queued ?? 0 });
    }

    serviceChatId = clean(payload.service_chat_id);
    if (!serviceChatId) return json({ error: "service_chat_id is required" }, 400);
    if (!UUID_RE.test(serviceChatId)) return json({ error: "service_chat_id must be a valid UUID" }, 400);

    const chatResult = await supabase
      .from("service_chats")
      .select("id, requester_id, provider_id, status, care_status, booking_snapshot, request_card, quote_card")
      .eq("id", serviceChatId)
      .maybeSingle();
    const { data: chat, error: chatError } = chatResult;
    if (chatError) throw chatError;
    if (!chat) return json({ error: "Service chat not found" }, 404);
    const canonicalServiceChatId = chat.id;
    if (!internalRequest && userData.user && chat.requester_id !== userData.user.id && chat.provider_id !== userData.user.id) return json({ error: "Forbidden" }, 403);

    const { data: agreement, error: agreementError } = await supabase
      .from("service_care_agreements")
      .select("id, agreement_version, booking_snapshot, requester_signature_path, provider_signature_path, requester_signed_at, provider_signed_at, pdf_path, pdf_generated_at")
      .eq("service_chat_id", canonicalServiceChatId)
      .maybeSingle();
    if (agreementError) throw agreementError;
    if (!agreement?.requester_signature_path || !agreement?.provider_signature_path) {
      return json({ error: "Both signatures are required before generating the agreement PDF" }, 409);
    }
    agreementId = agreement.id;
    const payloadViewerRole = clean(payload.viewer_role);
    const snapshotMode = clean(payload.snapshot_mode || payload.snapshotMode).toLowerCase() === "history" ? "history" : "live";
    const frozenSnapshotMode = snapshotMode === "history";
    const viewerRole = payloadViewerRole === "owner" || payloadViewerRole === "carer"
      ? payloadViewerRole
      : !internalRequest && userData.user
        ? userData.user.id === chat.requester_id ? "owner" : userData.user.id === chat.provider_id ? "carer" : ""
        : "";
    const roleSpecificPdf = viewerRole === "owner" || viewerRole === "carer";
    const forceRegenerate = payload.regenerate === true && internalRequest;
    if (agreement.pdf_path && !forceRegenerate && !roleSpecificPdf) {
      await supabase.rpc("enqueue_care_agreement_pdf_generation", {
        p_service_chat_id: canonicalServiceChatId,
        p_reason: "already_generated",
      });
      return json({ ok: true, pdf_path: agreement.pdf_path, pdf_generated_at: agreement.pdf_generated_at, alreadyGenerated: true });
    }
    await supabase.rpc("enqueue_care_agreement_pdf_generation", {
      p_service_chat_id: canonicalServiceChatId,
      p_reason: clean(payload.source) || "generate",
    });
    const { data: currentJob } = await supabase
      .from("care_agreement_pdf_generation_jobs")
      .select("attempt_count")
      .eq("agreement_id", agreement.id)
      .maybeSingle();
    nextAttemptCount = Number(currentJob?.attempt_count || 0) + 1;
    await supabase
      .from("care_agreement_pdf_generation_jobs")
      .update({
        status: "processing",
        attempt_count: nextAttemptCount,
        last_error: null,
        next_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("agreement_id", agreement.id);

    const [requesterProfile, providerProfile, activeScopeVersion] = await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", chat.requester_id).maybeSingle(),
      supabase.from("profiles").select("display_name, care_contact_number, phone").eq("id", chat.provider_id).maybeSingle(),
      // In live mode, mirror the native app's own `currentCareScopeVersion` fetch (see
      // paymentSnapshotFromAgreedChat / RequestQuoteSummaryCard in
      // NativeServiceChatScreen.tsx) so the PDF reads Safety & Instructions from
      // the exact same live source the in-app Care Agreement card shows -- not the
      // frozen booking_snapshot, which can predate later scope updates. History mode
      // never uses this row; it must render the immutable agreement snapshot.
      supabase.from("care_scope_versions").select("care_details, actor_role").eq("service_chat_id", chat.id).eq("is_active", true).maybeSingle(),
    ]);
    const requesterName = clean(requesterProfile.data?.display_name) || "Owner";
    const providerName = clean(providerProfile.data?.display_name) || "Care provider";
    const carerContactNumber = clean(providerProfile.data?.care_contact_number) || clean(providerProfile.data?.phone);
    const liveCareDetails = (activeScopeVersion.data as { care_details?: unknown } | null)?.care_details;
    const activeScopeActorRole = clean((activeScopeVersion.data as { actor_role?: unknown } | null)?.actor_role);

    const [ownerImage, providerImage] = await Promise.all([
      supabase.storage.from("care_agreements").download(agreement.requester_signature_path),
      supabase.storage.from("care_agreements").download(agreement.provider_signature_path),
    ]);
    if (ownerImage.error) throw ownerImage.error;
    if (providerImage.error) throw providerImage.error;

    const rawSnapshot = (agreement.booking_snapshot || chat.booking_snapshot || {}) as Record<string, unknown>;
    const rawSnapshotCareDetails = objectValue(rawSnapshot.careDetails);
    // The native app's own Care Agreement card (and the collapsed Care Scope
    // summary) reads live `chat.request_card` / `chat.quote_card` / the active
    // care_scope_versions.care_details -- not the frozen booking_snapshot -- for
    // every human-readable field (service types, date/time as entered with no
    // timezone math, location, care tasks, safety details). Enrich the snapshot
    // with that same live data before handing it to the PDF builder so the two
    // views can never disagree; booking_snapshot still supplies agreedAt/price/
    // signature audit fields the live tables don't carry.
    const liveRequestCard = chat.request_card && typeof chat.request_card === "object" && !Array.isArray(chat.request_card)
      ? chat.request_card as Record<string, unknown>
      : {};
    const liveQuoteCard = chat.quote_card && typeof chat.quote_card === "object" && !Array.isArray(chat.quote_card)
      ? chat.quote_card as Record<string, unknown>
      : {};
    const liveCareDetailsObject = liveCareDetails && typeof liveCareDetails === "object" && !Array.isArray(liveCareDetails)
      ? liveCareDetails as Record<string, unknown>
      : null;
    const liveVisibleRequestCard = visibleRequestCard(liveRequestCard, liveQuoteCard, activeScopeActorRole);
    const snapshot: Record<string, unknown> = frozenSnapshotMode
      ? rawSnapshot
      : {
        ...rawSnapshot,
        requestCard: Object.keys(liveVisibleRequestCard).length ? liveVisibleRequestCard : rawSnapshot.requestCard,
        // The PDF builder intentionally reads one effective request card first.
        // Keeping a stale quoteCard beside it would let old quote fields override
        // owner-side edits (date/location/tasks/price) after the active Care Scope
        // has already changed.
        quoteCard: {},
        careDetails: liveCareDetailsObject || rawSnapshot.careDetails,
      };
    if (!hasMandatoryCareInstruction(snapshot)) {
      return json({ error: "Care Instruction is required before generating the agreement PDF", code: "care_instruction_required" }, 409);
    }
    const requestCard = snapshot.requestCard && typeof snapshot.requestCard === "object" && !Array.isArray(snapshot.requestCard)
      ? snapshot.requestCard as Record<string, unknown>
      : {};
    const quoteCard = snapshot.quoteCard && typeof snapshot.quoteCard === "object" && !Array.isArray(snapshot.quoteCard)
      ? snapshot.quoteCard as Record<string, unknown>
      : {};
    const requestPets = Array.isArray(requestCard.pets) ? requestCard.pets as Record<string, unknown>[] : [];
    const quotePets = Array.isArray(quoteCard.pets) ? quoteCard.pets as Record<string, unknown>[] : [];
    const manualPetName =
      clean(snapshot.petName) ||
      clean(requestCard.petName) ||
      clean(quoteCard.petName) ||
      clean(requestPets[0]?.petName) ||
      clean(quotePets[0]?.petName);
    const petId = clean(snapshot.petId);
    const petRow = petId
      ? await supabase.from("pets").select("name").eq("id", petId).maybeSingle()
      : { data: null as { name?: unknown } | null };
    const petName = clean((petRow.data as { name?: unknown } | null)?.name) || manualPetName || "Pet";
    const [fonts, logoPng] = await Promise.all([loadFonts(), loadLogo()]);

    const bytes = await buildCareAgreementPdf({
      agreementVersion: clean(agreement.agreement_version) || "1.0",
      reference: clean(agreement.id).slice(0, 8).toUpperCase(),
      generatedAt: new Date().toISOString(),
      ownerName: requesterName,
      providerName,
      petName,
      ownerSignedAt: clean(agreement.requester_signed_at),
      providerSignedAt: clean(agreement.provider_signed_at),
      snapshot,
      ownerSignaturePng: new Uint8Array(await ownerImage.data.arrayBuffer()),
      providerSignaturePng: new Uint8Array(await providerImage.data.arrayBuffer()),
      logoPng,
      viewerRole: roleSpecificPdf ? viewerRole : null,
      timeZone: pickSnapshotTimeZone(snapshot) || null,
      cancellationPolicyText: clean((snapshot.cancellationTerms as string) || ""),
      carerContactNumber: frozenSnapshotMode
        ? clean(rawSnapshotCareDetails.carerContact || rawSnapshotCareDetails.carer_contact || rawSnapshot.carerContact || rawSnapshot.carer_contact)
        : carerContactNumber,
      fonts: fonts ?? undefined,
    });
    const pdfModeSegment = frozenSnapshotMode ? "history" : "live";
    const pdfPath = roleSpecificPdf
      ? `pdf/${canonicalServiceChatId}/care_agreement-${pdfModeSegment}-${viewerRole}-v1.pdf`
      : `pdf/${canonicalServiceChatId}/care_agreement-${pdfModeSegment}-v1.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("care_agreements")
      .upload(pdfPath, bytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const generatedAt = new Date().toISOString();
    if (!roleSpecificPdf && !frozenSnapshotMode) {
      const { error: updateError } = await supabase
        .from("service_care_agreements")
        .update({
          pdf_generated_at: generatedAt,
          pdf_path: pdfPath,
          status: "finalized",
          updated_at: generatedAt,
        })
        .eq("id", agreement.id);
      if (updateError) throw updateError;
    }
    await supabase
      .from("care_agreement_pdf_generation_jobs")
      .update({
        status: "succeeded",
        last_error: null,
        next_attempt_at: generatedAt,
        updated_at: generatedAt,
      })
      .eq("agreement_id", agreement.id);

    return json({ ok: true, pdf_path: pdfPath, pdf_generated_at: generatedAt });
  } catch (error) {
    if (agreementId) {
      try {
        const retryAt = new Date(Date.now() + Math.min(Math.max(nextAttemptCount, 1) * 5 * 60_000, 60 * 60_000)).toISOString();
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const supabaseServiceKey =
          firstSecretKey(Deno.env.get("SUPABASE_SECRET_KEYS")) ||
          firstSecretKey(Deno.env.get("SUPABASE_SECRET_KEY")) ||
          firstSecretKey(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
        if (supabaseUrl && supabaseServiceKey) {
          const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
        await supabase
            .from("care_agreement_pdf_generation_jobs")
            .update({
              status: "failed",
              last_error: error instanceof Error ? error.message : String(error),
              next_attempt_at: retryAt,
              updated_at: new Date().toISOString(),
            })
            .eq("agreement_id", agreementId);
          if (nextAttemptCount >= MAX_PDF_RETRY_ATTEMPTS) {
            await alertPdfRetryExhausted(
              supabase,
              agreementId,
              error instanceof Error ? error.message : String(error),
            );
          }
        }
      } catch {
        // Keep the public response stable; retry metadata is best effort.
      }
    }
    console.error("[generate-care-agreement-pdf] failed", error instanceof Error ? error.message : error);
    return json({ error: "Unable to generate Care Agreement PDF" }, 500);
  }
});
