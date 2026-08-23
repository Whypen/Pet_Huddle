import { supabaseAnonKey, supabaseUrl } from "./supabase";
import {
  clearInactiveCareSessionActivities,
  syncNativeActiveSessionActionAuth,
  startCareSessionActivity,
  startHomePresenceActivity,
  verifyNativeActiveSessionCoexistence,
} from "./nativeActiveSessions";
import { createNativeAuthenticatedHeaders, getFreshNativeAccessToken } from "./nativeFunctionClient";
import { fetchNativeResponseWithTimeout as fetch } from "./nativeTimeout";
import { fetchNativeNearbyOutSnapshot } from "./nativeNearbyOutSnapshot";
import { resolveNativePetImageUrlAsync, resolveNativeProfileImageUrlAsync } from "./nativeStorageUrlCache";

type HydrateActiveSessionsOptions = {
  accessToken?: string | null;
  refreshToken?: string | null;
  sessionKey?: string | null;
  userId: string;
};

type HydrationServicePet = {
  petId?: unknown;
  petName?: unknown;
  petPhotoUrl?: unknown;
};

type HydrationServiceCard = {
  endAt?: unknown;
  endAtIso?: unknown;
  endTime?: unknown;
  petName?: unknown;
  petPhotoUrl?: unknown;
  pets?: HydrationServicePet[];
  requestedDate?: unknown;
  requestedDates?: unknown;
  startAt?: unknown;
  startAtIso?: unknown;
  startTime?: unknown;
};

type HydrationServiceRow = {
  active_pet_scope?: HydrationServicePet[] | null;
  id: string;
  booked_at: string | null;
  booking_snapshot: HydrationServiceCard | null;
  care_status: string | null;
  chat_id: string;
  checkin_submitted_at: string | null;
  in_progress_at: string | null;
  provider_id: string;
  provider_mark_finished: boolean | null;
  quote_card: HydrationServiceCard | null;
  request_card: HydrationServiceCard | null;
  requester_id: string;
  requester_mark_finished: boolean | null;
  status: string | null;
};

const OUT_NOW_WINDOW_MS = 2 * 60 * 60 * 1000;
const HYDRATION_LOG_PREFIX = "[HUDDLE_ACTIVE_HYDRATION]";
const TERMINAL_CARE_STATUSES = new Set([
  "completed",
  "cancelled",
  "under_dispute",
  "handoff_issue_review",
  "not_started_refunded",
  "handoff_expired_manual_refund_required",
]);
const TERMINAL_SERVICE_STATUSES = new Set(["completed", "cancelled", "disputed", "under_dispute"]);

const clean = (value: unknown) => String(value ?? "").trim();

const logId = (value: unknown) => {
  const raw = clean(value);
  return raw ? `...${raw.slice(-6)}` : null;
};

const hydrationLog = (event: string, payload: Record<string, unknown> = {}) => {
  if (!__DEV__) return;
  console.log(HYDRATION_LOG_PREFIX, { event, ...payload });
};

const resolveCarePetAvatarUrl = async (rawUrl: string, context: Record<string, unknown>) => {
  if (!rawUrl) return null;
  const resolved = await resolveNativePetImageUrlAsync(rawUrl).catch((error) => {
    hydrationLog("care_pet_avatar_resolve_failed", {
      ...context,
      rawKind: rawUrl.startsWith("http") ? "http" : "storage_path",
      message: error instanceof Error ? error.message : String(error || "unknown"),
    });
    return null;
  });
  hydrationLog("care_pet_avatar_resolved", {
    ...context,
    rawKind: rawUrl.startsWith("http") ? "http" : "storage_path",
    resolvedKind: resolved?.includes("/storage/v1/object/public/pets/") ? "public" : resolved?.includes("/storage/v1/object/sign/pets/") ? "signed" : resolved ? "other" : "missing",
  });
  return resolved;
};

const parseMs = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
};

const localServiceDateTime = (date: string, time: string) => {
  const raw = `${date}T${time.length === 5 ? `${time}:00` : time}+08:00`;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
};

const servicePeriodEndIso = (requestCard: HydrationServiceCard | null | undefined, bookingSnapshot?: HydrationServiceRow["booking_snapshot"]) => {
  const directEnd = parseMs(requestCard?.endAtIso) ?? parseMs(requestCard?.endAt) ?? parseMs(bookingSnapshot?.endAt);
  if (directEnd) return new Date(directEnd).toISOString();

  const dates = Array.isArray(requestCard?.requestedDates)
    ? requestCard.requestedDates.map(clean).filter(Boolean).sort()
    : [];
  const firstDate = dates[0] || clean(requestCard?.requestedDate);
  const lastDate = dates[dates.length - 1] || clean(requestCard?.requestedDate);
  const startTime = clean(requestCard?.startTime);
  const endTime = clean(requestCard?.endTime);
  if (!firstDate || !lastDate || !startTime || !endTime) return null;
  const startMs = localServiceDateTime(firstDate, startTime);
  const rawEndMs = localServiceDateTime(lastDate, endTime);
  if (!startMs || !rawEndMs) return null;
  const endMs = rawEndMs <= startMs ? rawEndMs + 24 * 60 * 60 * 1000 : rawEndMs;
  return new Date(endMs).toISOString();
};

// Name and avatar must come from the same pet in the same pass — two
// independently-deduped lists risk pairing pet A's name with pet B's photo
// once the Live Activity zips them together by index.
const cardHasPetIdentity = (card: HydrationServiceCard | null | undefined) => {
  if (!card) return false;
  if (Array.isArray(card.pets) && card.pets.some((pet) => clean((pet as { petId?: unknown }).petId) || clean(pet.petName))) return true;
  return Boolean(clean((card as { petId?: unknown }).petId) || clean(card.petName));
};

const activeCarePetCard = (
  requestCard: HydrationServiceCard | null | undefined,
  quoteCard: HydrationServiceCard | null | undefined,
  bookingSnapshot: HydrationServiceCard | null | undefined,
) => {
  if (cardHasPetIdentity(bookingSnapshot)) return { source: "booking_snapshot", card: bookingSnapshot };
  if (cardHasPetIdentity(requestCard)) return { source: "request_card_fallback", card: requestCard };
  if (cardHasPetIdentity(quoteCard)) return { source: "quote_card_fallback", card: quoteCard };
  return { source: "missing", card: null };
};

const collectPets = async (context: Record<string, unknown>, card: HydrationServiceCard | null | undefined) => {
  const pets: { name: string; avatarUrl: string | null }[] = [];
  const seen = new Set<string>();
  const scopedPets = Array.isArray(card?.pets) ? card.pets : null;
  if (card && scopedPets && scopedPets.length > 0) {
    for (const pet of scopedPets) {
      const name = clean(pet.petName) || clean(card.petName);
      const rawUrl = clean(pet.petPhotoUrl);
      const avatarUrl = await resolveCarePetAvatarUrl(rawUrl, context);
      const dedupeKey = clean((pet as { petId?: unknown }).petId) || name || avatarUrl || "";
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      pets.push({ name, avatarUrl });
    }
    return pets;
  }
  const direct = clean(card?.petName);
  if (direct && !seen.has(direct)) {
    seen.add(direct);
    const rawUrl = clean(card?.petPhotoUrl);
    const avatarUrl = await resolveCarePetAvatarUrl(rawUrl, context);
    pets.push({ name: direct, avatarUrl });
    return pets;
  }
  return pets;
};

const authedGet = async <T,>(path: string, accessToken?: string | null) => {
  const token = await getFreshNativeAccessToken(accessToken || null);
  if (!token) {
    hydrationLog("auth_token_missing", { path });
    return null;
  }
  const response = await fetch(`${supabaseUrl}${path}`, {
    headers: createNativeAuthenticatedHeaders(token),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    hydrationLog("rest_failed", { path, status: response.status, body: body.slice(0, 500) });
    return null;
  }
  return await response.json() as T;
};

const authedRpc = async <T,>(name: string, accessToken?: string | null) => {
  const token = await getFreshNativeAccessToken(accessToken || null);
  if (!token) {
    hydrationLog("auth_token_missing", { rpc: name });
    return null;
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: createNativeAuthenticatedHeaders(token, {
      "Content-Type": "application/json",
    }),
    body: "{}",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    hydrationLog("rpc_failed", { rpc: name, status: response.status, body: body.slice(0, 500) });
    return null;
  }
  return await response.json() as T;
};

const hydrateHomeCompanions = async (
  userId: string,
  accessToken: string | null | undefined,
) => {
  try {
    return await fetchNativeNearbyOutSnapshot(userId, accessToken);
  } catch (error) {
    hydrationLog("home_companions_failed", {
      userId: logId(userId),
      message: error instanceof Error ? error.message : String(error || "unknown"),
    });
    return null;
  }
};

const hydrateHomePresence = async ({ accessToken, sessionKey, userId }: HydrateActiveSessionsOptions) => {
  const rows = await authedGet<Array<{
    avatar_url?: string | null;
    last_lat?: number | null;
    last_lng?: number | null;
    latitude?: number | null;
    longitude?: number | null;
    map_visible_until?: string | null;
    out_now_started_at?: string | null;
  }>>(
    `/rest/v1/profiles?select=avatar_url,last_lat,last_lng,latitude,longitude,map_visible_until,out_now_started_at&id=eq.${encodeURIComponent(userId)}&limit=1`,
    accessToken,
  );
  const profile = Array.isArray(rows) ? rows[0] : null;
  const mapVisibleUntil = typeof profile?.map_visible_until === "string" ? profile.map_visible_until : "";
  const mapVisibleMs = parseMs(mapVisibleUntil);
  const expiresAt = mapVisibleUntil;
  const expiresMs = mapVisibleMs;
  if (!expiresAt || !expiresMs || expiresMs <= Date.now()) {
    hydrationLog("home_skip", {
      userId: logId(userId),
      mapVisibleUntil: profile?.map_visible_until ?? null,
    });
    return false;
  }
  const progressStartedAt = new Date(Math.max(0, expiresMs - OUT_NOW_WINDOW_MS)).toISOString();
  const startedAt = typeof profile?.out_now_started_at === "string" && parseMs(profile.out_now_started_at)
    ? profile.out_now_started_at
    : progressStartedAt;
  const avatarUrl = await resolveNativeProfileImageUrlAsync(profile?.avatar_url, 60 * 60, { defaultBucket: "profile_photos" }).catch(() => null);
  const nearbySnapshot = await hydrateHomeCompanions(userId, accessToken);
  const companions = nearbySnapshot?.companions ?? [];
  hydrationLog("home_start", {
    userId: logId(userId),
    startedAt,
    progressStartedAt,
    expiresAt,
    source: "map_visible_until",
    hasAvatar: Boolean(avatarUrl),
    companionsCount: nearbySnapshot?.totalCount ?? 0,
  });
  await startHomePresenceActivity({
    startedAt,
    progressStartedAt,
    expiresAt,
    selfAvatarUrl: avatarUrl,
    companions: companions.slice(0, 4),
    companionsTotalCount: nearbySnapshot?.totalCount ?? 0,
    friendCount: nearbySnapshot?.friendCount ?? 0,
    nearbyUserCount: nearbySnapshot?.nearbyUserCount ?? 0,
  });
  return true;
};

const hydrateCarePresence = async ({ accessToken, userId }: HydrateActiveSessionsOptions) => {
  const rows = await authedRpc<HydrationServiceRow[]>("get_native_active_care_sessions", accessToken);

  if (!Array.isArray(rows)) {
    hydrationLog("care_rows_missing", { userId: logId(userId) });
    return false;
  }

  const activeCareSessions: Array<{ chatId: string; serviceId: string }> = [];
  let startedCount = 0;
  for (const row of rows) {
    const serviceId = clean(row.id);
    const roomId = clean(row.chat_id);
    if (!roomId || !serviceId) continue;
    const role = row.requester_id === userId ? "requester" : row.provider_id === userId ? "provider" : null;
    if (!role) continue;
    const bothSidesMarkedFinished = row.requester_mark_finished === true && row.provider_mark_finished === true;
    const terminal = bothSidesMarkedFinished
      || TERMINAL_CARE_STATUSES.has(clean(row.care_status))
      || TERMINAL_SERVICE_STATUSES.has(clean(row.status));
    if (terminal) continue;
    const active = row.care_status === "in_progress" || row.status === "in_progress";
    if (!active) continue;
    const currentUserMarkedFinished = (role === "requester" && row.requester_mark_finished === true) || (role === "provider" && row.provider_mark_finished === true);
    activeCareSessions.push({ chatId: roomId, serviceId });
    // Only immutable Care milestones may own the activity clock. updated_at is
    // changed by chat and metadata writes, while "now" would restart the timer
    // on every cold hydration.
    const startedAt = row.in_progress_at || row.checkin_submitted_at || row.booked_at;
    if (!startedAt) {
      hydrationLog("care_started_at_missing", {
        userId: logId(userId),
        serviceId: logId(serviceId),
        roomId: logId(roomId),
      });
      continue;
    }

    hydrationLog("care_start", {
      userId: logId(userId),
      serviceId: logId(serviceId),
      roomId: logId(roomId),
      role,
      status: row.status,
      careStatus: row.care_status,
      startedAt,
      showAction: !currentUserMarkedFinished,
    });
    const activePetCard = activeCarePetCard(row.request_card, row.quote_card, row.booking_snapshot);
    const activePetScope = Array.isArray(row.active_pet_scope) ? row.active_pet_scope : [];
    hydrationLog("care_pet_source", {
      roomId: logId(roomId),
      serviceId: logId(serviceId),
      source: activePetCard.source,
      requestHasPets: cardHasPetIdentity(row.request_card),
      quoteHasPets: cardHasPetIdentity(row.quote_card),
      snapshotHasPets: cardHasPetIdentity(row.booking_snapshot),
    });
    const pets = activePetScope.length > 0
      ? await collectPets(
        { roomId: logId(roomId), serviceId: logId(serviceId), source: "service_care_scope" },
        { pets: activePetScope },
      )
      : await collectPets(
        { roomId: logId(roomId), serviceId: logId(serviceId), source: activePetCard.source },
        activePetCard.card,
      );
    await startCareSessionActivity({
      chatId: roomId,
      serviceId,
      startedAt,
      expiresAt: servicePeriodEndIso(row.request_card, row.booking_snapshot),
      pets,
      petsTotalCount: pets.length,
      deepLink: `huddle:///service-chat?room=${encodeURIComponent(roomId)}&service=${encodeURIComponent(serviceId)}&sheet=completion`,
      completionRole: row.provider_id === userId ? "provider" : "requester",
      showAction: !currentUserMarkedFinished,
      awaitingText: currentUserMarkedFinished
        ? role === "provider"
          ? "Awaiting owner to confirm completion."
          : "Awaiting carer to confirm completion."
        : null,
    });
    startedCount += 1;
  }

  await clearInactiveCareSessionActivities(activeCareSessions);
  if (startedCount > 0) {
    hydrationLog("care_started", { userId: logId(userId), rowCount: rows.length, startedCount });
    return true;
  }
  hydrationLog("care_skip", { userId: logId(userId), rowCount: rows.length });
  return false;
};

export const hydrateNativeActiveSessions = async (options: HydrateActiveSessionsOptions) => {
  await syncNativeActiveSessionActionAuth(options.accessToken, options.refreshToken);
  // Keep lifecycle writes ordered across platforms. Parallel hydration could
  // interleave cleanup, native creation, and persisted activity identifiers.
  const homeExpected = await hydrateHomePresence(options);
  const careExpected = await hydrateCarePresence(options);
  const expectedKinds: Array<"map_out_now" | "care_in_progress"> = [];
  if (homeExpected) expectedKinds.push("map_out_now");
  if (careExpected) expectedKinds.push("care_in_progress");
  const verification = await verifyNativeActiveSessionCoexistence(expectedKinds);
  if (!verification?.missingKinds.length) return;

  hydrationLog("active_coexistence_recovery", { missingKinds: verification.missingKinds });
  if (verification.missingKinds.includes("map_out_now")) await hydrateHomePresence(options);
  if (verification.missingKinds.includes("care_in_progress")) await hydrateCarePresence(options);
  await verifyNativeActiveSessionCoexistence(expectedKinds);
};
