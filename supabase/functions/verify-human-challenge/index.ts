import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const supabase = createClient(supabaseUrl, serviceRoleKey);

type Action = "get" | "start" | "complete";
type Status = "not_started" | "pending" | "passed" | "failed";

type Payload = {
  action?: Action;
  attemptId?: string;
  status?: Status;
  score?: number;
  resultPayload?: Record<string, unknown>;
  evidencePath?: string | null;
};

const CHALLENGE_POOL = [
  { id: "turn_left_right", instruction: "Turn head left then right" },
  { id: "look_up_down", instruction: "Look up then down slowly" },
] as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function randomChallenge() {
  const idx = Math.floor(Math.random() * CHALLENGE_POOL.length);
  const step = CHALLENGE_POOL[idx];
  return {
    challengeType: step.id,
    instruction: step.instruction,
    issuedAt: new Date().toISOString(),
    expiresInSec: 180,
  };
}

function parseIsoDate(value: unknown): Date | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function isAttemptExpired(challengePayload: unknown, now = new Date()): boolean {
  const payload = (challengePayload || {}) as Record<string, unknown>;
  const issuedAt = parseIsoDate(payload.issuedAt);
  const expiresInSec = asNumber(payload.expiresInSec);
  if (!issuedAt || !expiresInSec || expiresInSec <= 0) return true;
  const expiresAt = issuedAt.getTime() + expiresInSec * 1000;
  return now.getTime() > expiresAt;
}

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

function isValidHumanPassResult(params: {
  challengeType: string;
  score: number | null;
  resultPayload: Record<string, unknown>;
}) {
  const verifier = String(params.resultPayload.verifier || "");
  const detectedFrames = asNumber(params.resultPayload.detectedFrames) ?? 0;
  const horizontalShift = asNumber(params.resultPayload.horizontalShift) ?? 0;
  const verticalShift = asNumber(params.resultPayload.verticalShift) ?? 0;
  const leftTravel = asNumber(params.resultPayload.leftTravel) ?? 0;
  const rightTravel = asNumber(params.resultPayload.rightTravel) ?? 0;
  const upTravel = asNumber(params.resultPayload.upTravel) ?? 0;
  const downTravel = asNumber(params.resultPayload.downTravel) ?? 0;
  const requiredDurationMs = asNumber(params.resultPayload.requiredDurationMs) ?? 0;

  if (verifier !== "mediapipe_face_landmarker") return false;
  if (detectedFrames < 6) return false;
  if (requiredDurationMs < 3000) return false;
  if ((params.score ?? 0) < 0.7) return false;

  if (params.challengeType === "turn_left_right") {
    return horizontalShift >= 0.36 && leftTravel >= 0.12 && rightTravel >= 0.12;
  }
  if (params.challengeType === "look_up_down") {
    return verticalShift >= 0.30 && upTravel >= 0.10 && downTravel >= 0.10;
  }
  return (
    (horizontalShift >= 0.36 && leftTravel >= 0.12 && rightTravel >= 0.12)
    || (verticalShift >= 0.30 && upTravel >= 0.10 && downTravel >= 0.10)
  );
}

const corsPreflightResponse = () =>
  new Response("ok", {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });

const withCors = (_req: Request, response: Response) => {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "*");
  return response;
};

async function resolveVerificationStatus(userId: string): Promise<string> {
  const { data: statusData, error: statusError } = await supabase
    .rpc("refresh_identity_verification_status", { p_user_id: userId });
  if (!statusError) return String(statusData || "unverified");
  if (!String(statusError.message || "").includes("profile_not_found")) throw statusError;

  const { data: latestAttempt } = await supabase
    .from("human_verification_attempts")
    .select("status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const humanStatus = String(latestAttempt?.status || "not_started");
  if (humanStatus === "pending" || humanStatus === "passed") return "pending";
  return "unverified";
}

async function tryUpdateProfileHumanStatus(userId: string, nextStatus: Status, nowIso: string | null) {
  // Use UPDATE (not upsert) — no-op when no profile row exists.
  // The attempt status is already recorded in human_verification_attempts.
  // Upsert would fail with NOT NULL violations on required profile columns.
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      human_verification_status: nextStatus,
      human_verified_at: nextStatus === "passed" ? nowIso : null,
    })
    .eq("id", userId);
  if (updateError) throw updateError;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return corsPreflightResponse();
    }
    if (req.method !== "POST") {
      return withCors(req, json({ error: "method_not_allowed" }, 405));
    }

    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return withCors(req, json({ error: "missing_token" }, 401));

    const authUser = await supabase.auth.getUser(accessToken);
    const userId = authUser.data?.user?.id;
    if (!userId) return withCors(req, json({ error: "unauthorized" }, 401));

    const payload = (await req.json().catch(() => ({}))) as Payload;
    const action: Action = payload.action || "get";

    if (action === "get") {
      const [{ data: profile }, { data: latestAttempt }, verificationStatus] = await Promise.all([
        supabase
          .from("profiles")
          .select("human_verification_status, verification_status")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("human_verification_attempts")
          .select("id,status,challenge_payload,created_at,completed_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        resolveVerificationStatus(userId),
      ]);

      return withCors(req, json({
        ok: true,
        humanStatus: profile?.human_verification_status ?? latestAttempt?.status ?? "not_started",
        verificationStatus,
        attempt: latestAttempt ?? null,
      }));
    }

    if (action === "start") {
      const { data: latestAttempt, error: latestAttemptError } = await supabase
        .from("human_verification_attempts")
        .select("id,status,challenge_payload")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestAttemptError) throw latestAttemptError;

      if (
        latestAttempt
        && latestAttempt.status === "pending"
        && !isAttemptExpired(latestAttempt.challenge_payload)
      ) {
        const statusData = await resolveVerificationStatus(userId);
        return withCors(req, json({
          ok: true,
          verificationStatus: statusData,
          attempt: latestAttempt,
        }));
      }

      const challenge = randomChallenge();
      const challengeToken = crypto.randomUUID();

      const { data: attemptRow, error: insertError } = await supabase
        .from("human_verification_attempts")
        .insert({
          user_id: userId,
          challenge_token: challengeToken,
          challenge_payload: challenge,
          status: "pending",
          started_at: new Date().toISOString(),
        })
        .select("id,status,challenge_payload,created_at")
        .single();
      if (insertError) throw insertError;

      await tryUpdateProfileHumanStatus(userId, "pending", null);

      const statusData = await resolveVerificationStatus(userId);

      return withCors(req, json({
        ok: true,
        verificationStatus: statusData,
        attempt: attemptRow,
      }));
    }

    if (action === "complete") {
      const attemptId = String(payload.attemptId || "").trim();
      const nextStatus = payload.status;
      if (!attemptId) return withCors(req, json({ error: "missing_attempt_id" }, 400));
      if (!nextStatus || !["passed", "failed"].includes(nextStatus)) {
        return withCors(req, json({ error: "invalid_status" }, 400));
      }

      const { data: ownedAttempt, error: ownedAttemptError } = await supabase
        .from("human_verification_attempts")
        .select("id,status,challenge_payload")
        .eq("id", attemptId)
        .eq("user_id", userId)
        .maybeSingle();
      if (ownedAttemptError) throw ownedAttemptError;
      if (!ownedAttempt) return withCors(req, json({ error: "attempt_not_found" }, 404));
      if (ownedAttempt.status !== "pending") {
        return withCors(req, json({ error: "invalid_transition" }, 409));
      }
      if (isAttemptExpired(ownedAttempt.challenge_payload)) {
        const nowIso = new Date().toISOString();
        await supabase
          .from("human_verification_attempts")
          .update({
            status: "failed",
            result_payload: {
              reason: "challenge_expired",
            },
            completed_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", attemptId)
          .eq("user_id", userId);
        await tryUpdateProfileHumanStatus(userId, "failed", null);
        return withCors(req, json({ error: "challenge_expired" }, 409));
      }

      const score = Number.isFinite(payload.score) ? Number(payload.score) : null;
      const nowIso = new Date().toISOString();

      const safeResultPayload = payload.resultPayload || {};
      const challengeType = String(
        (ownedAttempt.challenge_payload as Record<string, unknown> | null)?.challengeType || "",
      );

      if (
        nextStatus === "passed"
        && !isValidHumanPassResult({
          challengeType,
          score,
          resultPayload: safeResultPayload,
        })
      ) {
        return withCors(req, json({ error: "invalid_verification_result" }, 400));
      }

      const { error: attemptUpdateError } = await supabase
        .from("human_verification_attempts")
        .update({
          status: nextStatus,
          score,
          result_payload: safeResultPayload,
          evidence_path: payload.evidencePath || null,
          completed_at: nextStatus === "pending" ? null : nowIso,
          updated_at: nowIso,
        })
        .eq("id", attemptId)
        .eq("user_id", userId);
      if (attemptUpdateError) throw attemptUpdateError;

      await tryUpdateProfileHumanStatus(userId, nextStatus, nowIso);

      const statusData = await resolveVerificationStatus(userId);

      return withCors(req, json({
        ok: true,
        humanStatus: nextStatus,
        verificationStatus: statusData,
      }));
    }

    return withCors(req, json({ error: "unsupported_action" }, 400));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[verify-human-challenge]", message);
    return withCors(req, json({ error: message || "unknown_error" }, 500));
  }
});
