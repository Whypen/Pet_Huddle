/**
 * brevo-sync — Huddle CRM Bridge
 *
 * Server-side only. Never called from browser.
 * Supabase auth + app DB remain canonical truth.
 * Brevo is downstream CRM mirror only.
 *
 * Guardrails:
 *   - default-list sync is idempotent
 *   - important_user_activity is throttled (bucket change or 24h max)
 *   - default list configuration must be explicit and valid
 *   - provider list logic is optional additive behavior only
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ─── Config ──────────────────────────────────────────────────────────────────

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const BREVO_DEFAULT_LIST_ID_RAW = Deno.env.get("BREVO_DEFAULT_LIST_ID") ?? "";
const BREVO_SERVICE_PROVIDER_LIST_ID_RAW = Deno.env.get("BREVO_SERVICE_PROVIDER_LIST_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BREVO_API_BASE = "https://api.brevo.com/v3";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-huddle-access-token, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
};

// Activity throttle: max 24h between syncs unless bucket changes
const ACTIVITY_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Valid ACTIVITY_BUCKET values
type ActivityBucket = "active" | "inactive_7d" | "inactive_30d";

// ─── Brevo attribute definitions ─────────────────────────────────────────────
// 29 attributes. Provisioned idempotently at cold start.
// App-DB-only fields NOT in this list:
//   BREVO_SYNC_REQUIRED, BREVO_SYNC_REASON, LAST_ACTIVE_SYNCED_AT
// Deliberately excluded:
//   CITY — app stores location_country + location_district only; no city field
//   SUPER_HUDDLE_BALANCE — star model lives in user_quotas; mapping TBD

const BREVO_ATTRIBUTES: Array<{ name: string; type: "text" | "date" | "boolean" | "float" }> = [
  { name: "APP_USER_ID",              type: "text" },
  { name: "DISPLAY_NAME",             type: "text" },
  { name: "SOCIAL_ID",                type: "text" },
  { name: "PHONE",                    type: "text" },
  { name: "COUNTRY",                  type: "text" },
  { name: "DISTRICT",             type: "text" },
  { name: "PET_TYPES",            type: "text" },   // comma-sep e.g. "DOG,CAT"
  { name: "HAS_PET",              type: "text" },
  { name: "PET_COUNT",            type: "float" },
  { name: "HAS_DOG",              type: "text" },
  { name: "HAS_CAT",              type: "text" },
  { name: "HAS_OTHERS",           type: "text" },
  { name: "TIER",                 type: "text" },
  { name: "SERVICE_PROVIDER",     type: "text" },
  { name: "VERIFICATION_STATUS",  type: "text" },
  { name: "LAST_ACTIVE_AT",       type: "text" },
  { name: "ACTIVITY_BUCKET",      type: "text" },
  { name: "TRUST_SCORE",          type: "float" },
  { name: "TRUST_TIER",           type: "text" },
  { name: "SUBSCRIPTION_STATUS",  type: "text" },
  { name: "LAST_BOOKING_AT",      type: "text" },
  { name: "LAST_BROADCAST_AT",    type: "text" },
  { name: "LAST_CHAT_AT",         type: "text" },
  { name: "MARKETING_CONSENT",         type: "text" },
  { name: "MARKETING_CONSENT_AT",      type: "date" },
  { name: "MARKETING_OPT_IN",          type: "text" },  // stage-1: form checkbox
  { name: "MARKETING_OPT_IN_AT",       type: "date" },
  { name: "MARKETING_DOI_CONFIRMED",   type: "text" },  // stage-2: email click
  { name: "MARKETING_DOI_CONFIRMED_AT",type: "date" },
  { name: "EMAIL_ENABLED",             type: "boolean" },
  { name: "USER_CREATED_AT",           type: "text" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

async function brevoFetch(
  path: string,
  method: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const res = await fetch(`${BREVO_API_BASE}${path}`, {
      method,
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error("[brevo-sync] fetch error", path, err);
    return { ok: false, status: 0, data: null };
  }
}

// ─── One-time provisioning (idempotent) ──────────────────────────────────────

// Cache to avoid re-provisioning on every warm invocation
let provisionDone = false;
let defaultListIdCache: number | null = null;
let serviceProviderListIdCache: number | null = null;

async function ensureAttributes(): Promise<void> {
  // GET existing attributes
  const existing = await brevoFetch("/contacts/attributes", "GET");
  if (!existing.ok) {
    console.warn("[brevo-sync] could not fetch existing attributes; skipping provision");
    return;
  }
  const existingNames = new Set(
    ((existing.data as { attributes?: Array<{ name: string }> })?.attributes ?? [])
      .map((a) => a.name.toUpperCase()),
  );

  for (const attr of BREVO_ATTRIBUTES) {
    if (existingNames.has(attr.name)) continue;
    // Brevo attribute category: "normal" for contact-level attributes
    const brevoType = attr.type === "boolean" ? "boolean" :
                      attr.type === "float"   ? "float"   :
                      attr.type === "date"    ? "date"    : "text";
    const result = await brevoFetch("/contacts/attributes/normal/" + attr.name, "POST", {
      type: brevoType,
    });
    if (result.ok || result.status === 400) {
      // 400 means already exists with different casing — acceptable
      console.log(`[brevo-sync] attribute ensured: ${attr.name}`);
    } else {
      console.warn(`[brevo-sync] failed to create attribute ${attr.name}`, result.data);
    }
  }
}

function parseConfiguredListId(raw: string, envName: string): number {
  const normalized = String(raw || "").trim();
  const parsed = Number.parseInt(normalized, 10);
  if (!normalized || !Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${envName}_missing_or_invalid`);
  }
  return parsed;
}

async function validateBrevoListId(listId: number, envName: string): Promise<number> {
  const result = await brevoFetch(`/contacts/lists/${listId}`, "GET");
  if (!result.ok) {
    throw new Error(`${envName}_not_found:${listId}`);
  }
  const resolvedId = Number((result.data as { id?: number } | null)?.id || listId);
  if (!Number.isFinite(resolvedId) || resolvedId <= 0) {
    throw new Error(`${envName}_not_found:${listId}`);
  }
  return resolvedId;
}

async function getDefaultListId(): Promise<number> {
  if (defaultListIdCache) return defaultListIdCache;
  const configuredId = parseConfiguredListId(BREVO_DEFAULT_LIST_ID_RAW, "BREVO_DEFAULT_LIST_ID");
  defaultListIdCache = await validateBrevoListId(configuredId, "BREVO_DEFAULT_LIST_ID");
  return defaultListIdCache;
}

async function getOptionalServiceProviderListId(): Promise<number | null> {
  if (serviceProviderListIdCache) return serviceProviderListIdCache;
  const normalized = String(BREVO_SERVICE_PROVIDER_LIST_ID_RAW || "").trim();
  if (!normalized) return null;
  const configuredId = parseConfiguredListId(normalized, "BREVO_SERVICE_PROVIDER_LIST_ID");
  serviceProviderListIdCache = await validateBrevoListId(configuredId, "BREVO_SERVICE_PROVIDER_LIST_ID");
  return serviceProviderListIdCache;
}

async function provision(): Promise<void> {
  if (provisionDone) return;
  await ensureAttributes();
  await getDefaultListId();
  await getOptionalServiceProviderListId();
  provisionDone = true;
}

// ─── Trust score calculation ──────────────────────────────────────────────────

interface TrustSignals {
  device_fingerprint_verified?: boolean;
  phone_verified?: boolean;
  human_verified?: boolean;
  card_verified?: boolean;
}

function computeTrust(signals: TrustSignals): { score: number; tier: string } {
  let score = 1; // base
  if (signals.device_fingerprint_verified) score += 1;
  if (signals.phone_verified) score += 1;
  if (signals.human_verified) score += 1;
  if (signals.card_verified) score += 1;
  const tier = score <= 2 ? "low" : score <= 4 ? "medium" : "high";
  return { score, tier };
}

// ─── Activity throttle ───────────────────────────────────────────────────────

function shouldSyncActivity(
  lastSyncedAt: string | null,
  currentBucket: ActivityBucket,
  previousBucket: ActivityBucket | null,
): boolean {
  // Always sync if bucket changed
  if (currentBucket !== previousBucket) return true;
  // Otherwise max once per 24h
  if (!lastSyncedAt) return true;
  const elapsed = Date.now() - new Date(lastSyncedAt).getTime();
  return elapsed >= ACTIVITY_SYNC_INTERVAL_MS;
}

// ─── Contact upsert ──────────────────────────────────────────────────────────

interface BrevoContactPayload {
  email: string;
  ext_id: string;
  attributes: Record<string, unknown>;
  listIds?: number[];
}

async function upsertContact(payload: BrevoContactPayload): Promise<boolean> {
  const body: Record<string, unknown> = {
    email: payload.email,
    extId: payload.ext_id,
    attributes: payload.attributes,
    updateEnabled: true, // idempotent upsert
  };
  if (payload.listIds?.length) {
    body.listIds = payload.listIds;
  }
  const res = await brevoFetch("/contacts", "POST", body);
  if (!res.ok && res.status !== 204) {
    console.error("[brevo-sync] upsert failed", res.status, res.data);
    return false;
  }
  return true;
}

async function addContactToList(email: string, listId: number): Promise<boolean> {
  const res = await brevoFetch(`/contacts/lists/${listId}/contacts/add`, "POST", {
    emails: [email],
  });
  if (!res.ok && res.status !== 204) {
    console.error("[brevo-sync] add-to-list failed", email, listId, res.status, res.data);
    return false;
  }
  return true;
}

type SyncBrevoContactOptions = {
  additionalListIds?: number[];
};

async function syncBrevoContactToDefaultList(
  email: string,
  extId: string,
  attributes: Record<string, unknown>,
  options: SyncBrevoContactOptions = {},
): Promise<boolean> {
  const defaultListId = await getDefaultListId();
  const requestedListIds = [defaultListId, ...(options.additionalListIds || [])]
    .filter((value, index, all): value is number => Number.isFinite(value) && all.indexOf(value) === index);

  const ok = await upsertContact({
    email,
    ext_id: extId,
    attributes,
    listIds: requestedListIds,
  });
  if (!ok) return false;

  for (const listId of requestedListIds) {
    await addContactToList(email, listId);
  }
  return true;
}

// ─── Event handlers ──────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface CrmContactsViewRow {
  EMAIL: string | null;
  DISPLAY_NAME: string | null;
  SOCIAL_ID: string | null;
  PHONE: string | null;
  COUNTRY: string | null;
  DISTRICT: string | null;
  TIER: string | null;
  SERVICE_PROVIDER: string | null;
  VERIFICATION_STATUS: string | null;
  SUBSCRIPTION_STATUS: string | null;
  HAS_PET: string | null;
  PET_COUNT: number | null;
  PET_TYPES: string | null;
  HAS_DOG: string | null;
  HAS_CAT: string | null;
  HAS_OTHERS: string | null;
  LAST_ACTIVE_AT: string | null;
  ACTIVITY_BUCKET: string | null;
  LAST_CHAT_AT: string | null;
  LAST_BROADCAST_AT: string | null;
  LAST_BOOKING_AT: string | null;
  TRUST_SCORE: number | null;
  TRUST_TIER: string | null;
  USER_CREATED_AT: string | null;
  MARKETING_CONSENT: string | null;
  MARKETING_OPT_IN: string | null;
  MARKETING_DOI_CONFIRMED: string | null;
}

function crmAttrsFromView(viewRow: CrmContactsViewRow | null): Record<string, unknown> {
  if (!viewRow) return {};
  return {
    DISPLAY_NAME: viewRow.DISPLAY_NAME ?? "",
    SOCIAL_ID: viewRow.SOCIAL_ID ?? "",
    PHONE: viewRow.PHONE ?? "",
    COUNTRY: viewRow.COUNTRY ?? "",
    DISTRICT: viewRow.DISTRICT ?? "",
    TIER: viewRow.TIER ?? "free",
    SERVICE_PROVIDER: viewRow.SERVICE_PROVIDER ?? "No",
    VERIFICATION_STATUS: viewRow.VERIFICATION_STATUS ?? "unverified",
    SUBSCRIPTION_STATUS: viewRow.SUBSCRIPTION_STATUS ?? null,
    HAS_PET: viewRow.HAS_PET ?? "No",
    PET_COUNT: viewRow.PET_COUNT ?? 0,
    PET_TYPES: viewRow.PET_TYPES ?? "",
    HAS_DOG: viewRow.HAS_DOG ?? "No",
    HAS_CAT: viewRow.HAS_CAT ?? "No",
    HAS_OTHERS: viewRow.HAS_OTHERS ?? "No",
    LAST_ACTIVE_AT: viewRow.LAST_ACTIVE_AT ?? null,
    ACTIVITY_BUCKET: viewRow.ACTIVITY_BUCKET ?? null,
    LAST_CHAT_AT: viewRow.LAST_CHAT_AT ?? null,
    LAST_BROADCAST_AT: viewRow.LAST_BROADCAST_AT ?? null,
    LAST_BOOKING_AT: viewRow.LAST_BOOKING_AT ?? null,
    TRUST_SCORE: viewRow.TRUST_SCORE ?? null,
    TRUST_TIER: viewRow.TRUST_TIER ?? null,
    USER_CREATED_AT: viewRow.USER_CREATED_AT ?? null,
    MARKETING_CONSENT: viewRow.MARKETING_CONSENT ?? "No",
    MARKETING_OPT_IN: viewRow.MARKETING_OPT_IN ?? "No",
    MARKETING_DOI_CONFIRMED: viewRow.MARKETING_DOI_CONFIRMED ?? "No",
  };
}

async function loadCrmViewRowByEmail(email: string): Promise<CrmContactsViewRow | null> {
  const { data, error } = await supabase
    .from("crm_contacts_view")
    .select(
      "EMAIL, DISPLAY_NAME, SOCIAL_ID, PHONE, COUNTRY, DISTRICT, TIER, SERVICE_PROVIDER, " +
      "VERIFICATION_STATUS, SUBSCRIPTION_STATUS, HAS_PET, PET_COUNT, PET_TYPES, HAS_DOG, HAS_CAT, HAS_OTHERS, " +
      "LAST_ACTIVE_AT, ACTIVITY_BUCKET, LAST_CHAT_AT, LAST_BROADCAST_AT, LAST_BOOKING_AT, TRUST_SCORE, TRUST_TIER, " +
      "USER_CREATED_AT, MARKETING_CONSENT, MARKETING_OPT_IN, MARKETING_DOI_CONFIRMED",
    )
    .eq("EMAIL", email)
    .maybeSingle();

  if (error) {
    console.warn("[brevo-sync] crm_contacts_view lookup failed", email, error);
    return null;
  }
  return (data ?? null) as CrmContactsViewRow | null;
}

async function handleProfileCompleted(userId: string): Promise<void> {
  // First and only point where a Brevo contact is created
  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, email, display_name, social_id, phone, location_country, location_district, " +
      "tier, verification_status, marketing_consent, marketing_consent_at, " +
      "marketing_opt_in_checked, marketing_opt_in_checked_at, " +
      "marketing_doi_confirmed, marketing_doi_confirmed_at, last_active_at, created_at",
    )
    .eq("id", userId)
    .single();

  if (error || !profile) {
    console.error("[brevo-sync] profile_completed: profile not found", userId, error);
    return;
  }

  // Derive email from auth if not on profile
  let email = String(profile.email || "").trim().toLowerCase();
  if (!email) {
    const { data: authUser, error: authUserError } = await supabase.auth.admin.getUserById(userId);
    if (authUserError) {
      console.warn("[brevo-sync] profile_completed: auth email fallback failed", userId, authUserError.message);
    } else {
      email = String(authUser.user?.email || "").trim().toLowerCase();
      if (email) {
        await supabase
          .from("profiles")
          .update({ email })
          .eq("id", userId);
      }
    }
  }
  if (!email) {
    console.warn("[brevo-sync] profile_completed: no email for user", userId);
    return;
  }
  const crmView = await loadCrmViewRowByEmail(email);

  const now = new Date().toISOString();

  const ok = await syncBrevoContactToDefaultList(
    email,
    userId,
    {
      APP_USER_ID:          userId,
      DISPLAY_NAME:         profile.display_name ?? "",
      SOCIAL_ID:            profile.social_id ?? "",
      PHONE:                profile.phone ?? "",
      COUNTRY:              profile.location_country ?? "",
      DISTRICT:             profile.location_district ?? "",
      TIER:                 profile.tier ?? "free",
      VERIFICATION_STATUS:  profile.verification_status ?? "unverified",
      MARKETING_CONSENT:          Boolean(profile.marketing_consent),
      MARKETING_CONSENT_AT:       profile.marketing_consent_at ?? null,
      MARKETING_OPT_IN:           Boolean(profile.marketing_opt_in_checked),
      MARKETING_OPT_IN_AT:        profile.marketing_opt_in_checked_at ?? null,
      MARKETING_DOI_CONFIRMED:    Boolean(profile.marketing_doi_confirmed),
      MARKETING_DOI_CONFIRMED_AT: profile.marketing_doi_confirmed_at ?? null,
      EMAIL_ENABLED:              Boolean(profile.marketing_consent),
      USER_CREATED_AT:      profile.created_at ?? null,
      LAST_ACTIVE_AT:       profile.last_active_at ?? now,
      ACTIVITY_BUCKET:      "active" satisfies ActivityBucket,
      ...crmAttrsFromView(crmView),
    },
  );

  if (ok) {
    // Mark sync done
    await supabase
      .from("profiles")
      .update({ brevo_sync_required: false, brevo_sync_reason: null })
      .eq("id", userId);
    console.log("[brevo-sync] profile_completed synced", userId);
  }
}

async function handlePetProfileCompleted(userId: string): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  if (!profile?.email) return;
  const crmView = await loadCrmViewRowByEmail(profile.email);

  await syncBrevoContactToDefaultList(profile.email, userId, {
    ...crmAttrsFromView(crmView),
  });
  console.log("[brevo-sync] pet_profile_completed synced", userId);
}

async function handleVerificationCompleted(userId: string): Promise<void> {
  // Use the same signal sources as refresh_identity_verification_status RPC:
  //   phone = profile.phone non-empty OR auth.users.phone_confirmed_at
  //   device = row in device_fingerprint_history
  //   human = profile.human_verification_status = 'passed'
  //   card  = profile.card_verification_status  = 'passed'
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "email, verification_status, phone, " +
      "human_verification_status, card_verification_status",
    )
    .eq("id", userId)
    .single();

  if (!profile?.email) return;
  const crmView = await loadCrmViewRowByEmail(profile.email);

  // Device fingerprint: row presence in device_fingerprint_history (mirrors RPC)
  const { count: fpCount } = await supabase
    .from("device_fingerprint_history")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  const phoneVerified = Boolean(profile.phone?.trim());
  const deviceVerified = (fpCount ?? 0) > 0;
  const humanVerified = profile.human_verification_status === "passed";
  const cardVerified = profile.card_verification_status === "passed";

  const { score, tier } = computeTrust({
    device_fingerprint_verified: deviceVerified,
    phone_verified: phoneVerified,
    human_verified: humanVerified,
    card_verified: cardVerified,
  });

  await syncBrevoContactToDefaultList(profile.email, userId, {
    VERIFICATION_STATUS: profile.verification_status ?? "pending",
    TRUST_SCORE:         score,
    TRUST_TIER:          tier,
    ...crmAttrsFromView(crmView),
  });
  console.log("[brevo-sync] verification_completed synced", userId, { score, tier });
}

async function handleServiceProfileCompleted(userId: string): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  if (!profile?.email) return;
  const crmView = await loadCrmViewRowByEmail(profile.email);

  const serviceProvidersId = await getOptionalServiceProviderListId();
  await syncBrevoContactToDefaultList(
    profile.email,
    userId,
    {
      ...crmAttrsFromView(crmView),
    },
    { additionalListIds: serviceProvidersId ? [serviceProvidersId] : [] },
  );
  console.log("[brevo-sync] service_profile_completed synced", userId);
}

async function handleSubscriptionChanged(
  userId: string,
  tier: string,
  subscriptionStatus: string,
): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  if (!profile?.email) return;
  const crmView = await loadCrmViewRowByEmail(profile.email);

  await syncBrevoContactToDefaultList(profile.email, userId, {
    TIER:                tier,
    SUBSCRIPTION_STATUS: subscriptionStatus,
    ...crmAttrsFromView(crmView),
  });
  console.log("[brevo-sync] subscription_changed synced", userId, { tier, subscriptionStatus });
}

async function handleMarketingDoiConfirmed(userId: string): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "email, marketing_consent, marketing_consent_at, " +
      "marketing_opt_in_checked, marketing_opt_in_checked_at, " +
      "marketing_doi_confirmed, marketing_doi_confirmed_at",
    )
    .eq("id", userId)
    .single();

  if (!profile?.email) return;
  const crmView = await loadCrmViewRowByEmail(profile.email);

  await syncBrevoContactToDefaultList(profile.email, userId, {
    MARKETING_CONSENT:          Boolean(profile.marketing_consent),
    MARKETING_CONSENT_AT:       profile.marketing_consent_at ?? null,
    MARKETING_OPT_IN:           Boolean(profile.marketing_opt_in_checked),
    MARKETING_OPT_IN_AT:        profile.marketing_opt_in_checked_at ?? null,
    MARKETING_DOI_CONFIRMED:    Boolean(profile.marketing_doi_confirmed),
    MARKETING_DOI_CONFIRMED_AT: profile.marketing_doi_confirmed_at ?? null,
    EMAIL_ENABLED:              Boolean(profile.marketing_consent),
    ...crmAttrsFromView(crmView),
  });
  console.log("[brevo-sync] marketing_doi_confirmed synced", userId);
}

async function handleImportantUserActivity(userId: string): Promise<void> {
  // Guardrail: throttled. Never sync on every app open.
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, last_active_at, last_active_synced_at, brevo_sync_required, brevo_sync_reason")
    .eq("id", userId)
    .single();

  if (!profile?.email) return;
  const crmView = await loadCrmViewRowByEmail(profile.email);

  // Derive current activity bucket
  const lastActive = profile.last_active_at ? new Date(profile.last_active_at) : new Date();
  const daysSince = (Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24);
  const currentBucket: ActivityBucket =
    daysSince >= 30 ? "inactive_30d" :
    daysSince >= 7  ? "inactive_7d"  : "active";

  // Determine previous bucket from brevo_sync_reason heuristic or default to active
  const previousBucket = (profile.brevo_sync_reason?.startsWith("bucket:")
    ? profile.brevo_sync_reason.replace("bucket:", "")
    : null) as ActivityBucket | null;

  if (!shouldSyncActivity(profile.last_active_synced_at, currentBucket, previousBucket)) {
    console.log("[brevo-sync] activity throttled, skipping sync", userId);
    return;
  }

  await syncBrevoContactToDefaultList(profile.email, userId, {
    LAST_ACTIVE_AT:  profile.last_active_at ?? new Date().toISOString(),
    ACTIVITY_BUCKET: currentBucket,
    ...crmAttrsFromView(crmView),
  });

  // Update throttle state in app DB
  await supabase
    .from("profiles")
    .update({
      last_active_synced_at: new Date().toISOString(),
      brevo_sync_required:   false,
      brevo_sync_reason:     `bucket:${currentBucket}`,
    })
    .eq("id", userId);

  console.log("[brevo-sync] important_user_activity synced", userId, currentBucket);
}

type BackfillResult = {
  scanned: number;
  synced: number;
  failed: number;
  skipped: number;
};

async function handleBackfillDefaultList(): Promise<BackfillResult> {
  const result: BackfillResult = { scanned: 0, synced: 0, failed: 0, skipped: 0 };
  const perPage = 500;

  for (let from = 0; from < 100_000; from += perPage) {
    const { data: profilesPage, error } = await supabase
      .from("profiles")
      .select("id,email,created_at")
      .not("email", "is", null)
      .order("created_at", { ascending: true })
      .range(from, from + perPage - 1);
    if (error) {
      throw new Error(error.message || "profile_backfill_failed");
    }
    const rows = profilesPage || [];
    for (const profileRow of rows) {
      const userId = String(profileRow.id || "").trim();
      const email = String(profileRow.email || "").trim().toLowerCase();
      if (!userId || !email) {
        result.skipped += 1;
        continue;
      }
      result.scanned += 1;
      try {
        const crmView = await loadCrmViewRowByEmail(email);
        const ok = await syncBrevoContactToDefaultList(email, userId, {
          APP_USER_ID: userId,
          USER_CREATED_AT: profileRow.created_at ?? null,
          ...crmAttrsFromView(crmView),
        });
        if (ok) {
          result.synced += 1;
        } else {
          result.failed += 1;
        }
      } catch (error) {
        result.failed += 1;
        console.error("[brevo-sync] backfill failed", userId, email, error);
      }
    }
    if (rows.length < perPage) break;
  }

  console.log("[brevo-sync] backfill_default_list complete", result);
  return result;
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  if (!BREVO_API_KEY) {
    console.error("[brevo-sync] BREVO_API_KEY not set");
    return json({ ok: false, error: "BREVO_API_KEY_not_configured" }, 500);
  }

  let body: { event: string; user_id?: string; [k: string]: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const { event, user_id } = body;
  if (!event) return json({ error: "event required" }, 400);
  if (event !== "backfill_default_list" && !user_id) {
    return json({ error: "event and user_id required" }, 400);
  }

  try {
    await provision();
  } catch (err) {
    console.error("[brevo-sync] configuration validation failed", err);
    return json({
      ok: false,
      error: err instanceof Error ? err.message : "brevo_configuration_invalid",
    }, 500);
  }

  try {
    switch (event) {
      case "profile_completed":
        await handleProfileCompleted(String(user_id));
        return json({ ok: true, event });
      case "pet_profile_completed":
        await handlePetProfileCompleted(String(user_id));
        return json({ ok: true, event });
      case "verification_completed":
        await handleVerificationCompleted(String(user_id));
        return json({ ok: true, event });
      case "service_profile_completed":
        await handleServiceProfileCompleted(String(user_id));
        return json({ ok: true, event });
      case "subscription_changed":
        await handleSubscriptionChanged(
          String(user_id),
          String(body.tier ?? ""),
          String(body.subscription_status ?? ""),
        );
        return json({ ok: true, event });
      case "important_user_activity":
        await handleImportantUserActivity(String(user_id));
        return json({ ok: true, event });
      case "marketing_doi_confirmed":
        await handleMarketingDoiConfirmed(String(user_id));
        return json({ ok: true, event });
      case "backfill_default_list": {
        const summary = await handleBackfillDefaultList();
        return json({ ok: true, event, summary });
      }
      default:
        console.warn("[brevo-sync] unknown event", event);
        return json({ ok: false, error: "unknown_event" }, 400);
    }
  } catch (err) {
    console.error("[brevo-sync] handler error", event, user_id, err);
    return json({
      ok: false,
      event,
      error: err instanceof Error ? err.message : "brevo_sync_failed",
    }, 500);
  }
});
