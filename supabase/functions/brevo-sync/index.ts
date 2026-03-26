/**
 * brevo-sync — Huddle CRM Bridge
 *
 * Server-side only. Never called from browser.
 * Supabase auth + app DB remain canonical truth.
 * Brevo is downstream CRM mirror only.
 *
 * Guardrails:
 *   - profile_completed is the FIRST Brevo contact creation point
 *   - important_user_activity is throttled (bucket change or 24h max)
 *   - fail open: Brevo down must never block app-critical flows
 *   - idempotent: every sync is create-or-update, never clobber
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ─── Config ──────────────────────────────────────────────────────────────────

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BREVO_API_BASE = "https://api.brevo.com/v3";

// List names (created idempotently on first run)
const LIST_USERS_ALL = "users_all";
const LIST_SERVICE_PROVIDERS = "service_providers";

// Activity throttle: max 24h between syncs unless bucket changes
const ACTIVITY_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Valid ONBOARDING_STEP values
type OnboardingStep =
  | "signup_started"
  | "profile_complete"
  | "pet_complete"
  | "verification_complete"
  | "service_profile_complete"
  | "fully_onboarded";

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
  { name: "HAS_PET",              type: "boolean" },
  { name: "PET_COUNT",            type: "float" },
  { name: "HAS_DOG",              type: "boolean" },
  { name: "HAS_CAT",              type: "boolean" },
  { name: "HAS_OTHERS",           type: "boolean" },
  { name: "TIER",                 type: "text" },
  { name: "SERVICE_PROVIDER",     type: "boolean" },
  { name: "VERIFICATION_STATUS",  type: "text" },
  { name: "ONBOARDING_STEP",      type: "text" },
  { name: "LAST_ACTIVE_AT",       type: "date" },
  { name: "ACTIVITY_BUCKET",      type: "text" },
  { name: "TRUST_SCORE",          type: "float" },
  { name: "TRUST_TIER",           type: "text" },
  { name: "SUBSCRIPTION_STATUS",  type: "text" },
  { name: "LAST_BOOKING_AT",      type: "date" },
  { name: "LAST_BROADCAST_AT",    type: "date" },
  { name: "LAST_CHAT_AT",         type: "date" },
  { name: "MARKETING_CONSENT",         type: "boolean" },
  { name: "MARKETING_CONSENT_AT",      type: "date" },
  { name: "MARKETING_OPT_IN",          type: "boolean" },  // stage-1: form checkbox
  { name: "MARKETING_OPT_IN_AT",       type: "date" },
  { name: "MARKETING_DOI_CONFIRMED",   type: "boolean" },  // stage-2: email click
  { name: "MARKETING_DOI_CONFIRMED_AT",type: "date" },
  { name: "EMAIL_ENABLED",             type: "boolean" },
  { name: "USER_CREATED_AT",           type: "date" },
  { name: "PROFILE_COMPLETED_AT",      type: "date" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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
const listIdCache: Record<string, number> = {};

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

async function ensureList(name: string): Promise<number | null> {
  if (listIdCache[name]) return listIdCache[name];

  // Search existing lists
  const res = await brevoFetch("/contacts/lists?limit=50&offset=0", "GET");
  if (res.ok) {
    const lists = (res.data as { lists?: Array<{ id: number; name: string }> })?.lists ?? [];
    const found = lists.find((l) => l.name === name);
    if (found) {
      listIdCache[name] = found.id;
      return found.id;
    }
  }

  // Create list
  const created = await brevoFetch("/contacts/lists", "POST", { name, folderId: 1 });
  if (created.ok) {
    const id = (created.data as { id?: number })?.id;
    if (id) {
      listIdCache[name] = id;
      return id;
    }
  }

  console.warn("[brevo-sync] could not ensure list:", name, created.data);
  return null;
}

async function provision(): Promise<void> {
  if (provisionDone) return;
  await ensureAttributes();
  await ensureList(LIST_USERS_ALL);
  await ensureList(LIST_SERVICE_PROVIDERS);
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

async function addContactToList(email: string, listId: number): Promise<void> {
  await brevoFetch(`/contacts/lists/${listId}/contacts/add`, "POST", {
    emails: [email],
  });
}

// ─── Event handlers ──────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
  const email: string = profile.email ?? "";
  if (!email) {
    console.warn("[brevo-sync] profile_completed: no email for user", userId);
    return;
  }

  const listIds: number[] = [];
  const usersAllId = await ensureList(LIST_USERS_ALL);
  if (usersAllId) listIds.push(usersAllId);

  const now = new Date().toISOString();

  const ok = await upsertContact({
    email,
    ext_id: userId,
    attributes: {
      APP_USER_ID:          userId,
      DISPLAY_NAME:         profile.display_name ?? "",
      SOCIAL_ID:            profile.social_id ?? "",
      PHONE:                profile.phone ?? "",
      COUNTRY:              profile.location_country ?? "",
      DISTRICT:             profile.location_district ?? "",
      TIER:                 profile.tier ?? "free",
      VERIFICATION_STATUS:  profile.verification_status ?? "unverified",
      ONBOARDING_STEP:      "profile_complete" satisfies OnboardingStep,
      MARKETING_CONSENT:          Boolean(profile.marketing_consent),
      MARKETING_CONSENT_AT:       profile.marketing_consent_at ?? null,
      MARKETING_OPT_IN:           Boolean(profile.marketing_opt_in_checked),
      MARKETING_OPT_IN_AT:        profile.marketing_opt_in_checked_at ?? null,
      MARKETING_DOI_CONFIRMED:    Boolean(profile.marketing_doi_confirmed),
      MARKETING_DOI_CONFIRMED_AT: profile.marketing_doi_confirmed_at ?? null,
      EMAIL_ENABLED:              Boolean(profile.marketing_consent),
      USER_CREATED_AT:      profile.created_at ?? null,
      PROFILE_COMPLETED_AT: now,
      LAST_ACTIVE_AT:       profile.last_active_at ?? now,
      ACTIVITY_BUCKET:      "active" satisfies ActivityBucket,
    },
    listIds,
  });

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
  // Fetch all pets for this user
  const { data: pets, error } = await supabase
    .from("pets")
    .select("species")
    .eq("owner_id", userId);

  if (error) {
    console.error("[brevo-sync] pet_profile_completed: pets query failed", userId, error);
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  if (!profile?.email) return;

  const species = (pets ?? []).map((p: { species?: string }) =>
    (p.species ?? "other").toUpperCase()
  );
  const petTypes = [...new Set(species)].join(",");
  const hasDog = species.includes("DOG");
  const hasCat = species.includes("CAT");
  const hasOthers = species.some((s) => s !== "DOG" && s !== "CAT");

  await upsertContact({
    email: profile.email,
    ext_id: userId,
    attributes: {
      HAS_PET:              pets!.length > 0,
      PET_COUNT:            pets!.length,
      PET_TYPES:            petTypes,
      HAS_DOG:              hasDog,
      HAS_CAT:              hasCat,
      HAS_OTHERS:           hasOthers,
      ONBOARDING_STEP:      "pet_complete" satisfies OnboardingStep,
    },
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

  await upsertContact({
    email: profile.email,
    ext_id: userId,
    attributes: {
      VERIFICATION_STATUS: profile.verification_status ?? "pending",
      TRUST_SCORE:         score,
      TRUST_TIER:          tier,
      ONBOARDING_STEP:     "verification_complete" satisfies OnboardingStep,
    },
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

  const serviceProvidersId = await ensureList(LIST_SERVICE_PROVIDERS);
  const listIds = serviceProvidersId ? [serviceProvidersId] : [];

  await upsertContact({
    email: profile.email,
    ext_id: userId,
    attributes: {
      SERVICE_PROVIDER: true,
      ONBOARDING_STEP:  "service_profile_complete" satisfies OnboardingStep,
    },
    listIds,
  });
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

  await upsertContact({
    email: profile.email,
    ext_id: userId,
    attributes: {
      TIER:                tier,
      SUBSCRIPTION_STATUS: subscriptionStatus,
    },
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

  await upsertContact({
    email:    profile.email,
    ext_id:   userId,
    attributes: {
      MARKETING_CONSENT:          Boolean(profile.marketing_consent),
      MARKETING_CONSENT_AT:       profile.marketing_consent_at ?? null,
      MARKETING_OPT_IN:           Boolean(profile.marketing_opt_in_checked),
      MARKETING_OPT_IN_AT:        profile.marketing_opt_in_checked_at ?? null,
      MARKETING_DOI_CONFIRMED:    Boolean(profile.marketing_doi_confirmed),
      MARKETING_DOI_CONFIRMED_AT: profile.marketing_doi_confirmed_at ?? null,
      EMAIL_ENABLED:              Boolean(profile.marketing_consent),
    },
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

  await upsertContact({
    email: profile.email,
    ext_id: userId,
    attributes: {
      LAST_ACTIVE_AT:  profile.last_active_at ?? new Date().toISOString(),
      ACTIVITY_BUCKET: currentBucket,
    },
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

// ─── HTTP handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  if (!BREVO_API_KEY) {
    console.error("[brevo-sync] BREVO_API_KEY not set");
    // Fail open — return 200 so caller is not blocked
    return json({ ok: false, reason: "brevo not configured" });
  }

  let body: { event: string; user_id: string; [k: string]: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const { event, user_id } = body;
  if (!event || !user_id) return json({ error: "event and user_id required" }, 400);

  // Provision attributes + lists idempotently (cheap no-op after first call)
  try {
    await provision();
  } catch (err) {
    console.warn("[brevo-sync] provision failed — continuing anyway", err);
    // fail open
  }

  try {
    switch (event) {
      case "profile_completed":
        await handleProfileCompleted(user_id);
        break;
      case "pet_profile_completed":
        await handlePetProfileCompleted(user_id);
        break;
      case "verification_completed":
        await handleVerificationCompleted(user_id);
        break;
      case "service_profile_completed":
        await handleServiceProfileCompleted(user_id);
        break;
      case "subscription_changed":
        await handleSubscriptionChanged(
          user_id,
          String(body.tier ?? ""),
          String(body.subscription_status ?? ""),
        );
        break;
      case "important_user_activity":
        await handleImportantUserActivity(user_id);
        break;
      case "marketing_doi_confirmed":
        await handleMarketingDoiConfirmed(user_id);
        break;
      default:
        console.warn("[brevo-sync] unknown event", event);
    }
  } catch (err) {
    // Fail open — log but never return 500 to block core flows
    console.error("[brevo-sync] handler error", event, user_id, err);
  }

  return json({ ok: true });
});
