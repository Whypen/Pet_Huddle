import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { areUsersBlocked } from "@/lib/blocking";

export type WaveSendStatus = "sent" | "duplicate" | "blocked" | "failed";

export type WaveSendResult = {
  status: WaveSendStatus;
  mutual: boolean;
  matchCreated: boolean;
};

const isDuplicateWaveError = (err: unknown) => {
  const payload = typeof err === "object" && err !== null ? (err as Record<string, unknown>) : null;
  const code = String(payload?.code || "");
  const status = Number(payload?.status || 0);
  const message = String(payload?.message || "");
  const details = String(payload?.details || "");
  const hint = String(payload?.hint || "");
  const blob = `${message} ${details} ${hint}`.toLowerCase();
  return code === "23505" || status === 409 || blob.includes("duplicate key");
};

const isWaveSchemaFallbackError = (err: unknown) => {
  const payload = typeof err === "object" && err !== null ? (err as Record<string, unknown>) : null;
  const code = String(payload?.code || "");
  const message = String(payload?.message || "").toLowerCase();
  return code === "42703" || code === "PGRST204" || message.includes("column");
};

const checkReciprocalWave = async (viewerId: string, targetUserId: string) => {
  try {
    const attempts: Array<{ fromCol: "from_user_id" | "sender_id"; toCol: "to_user_id" | "receiver_id" }> = [
      { fromCol: "sender_id", toCol: "receiver_id" },
      { fromCol: "from_user_id", toCol: "to_user_id" },
    ];
    for (const attempt of attempts) {
      const { data, error } = await supabase
        .from("waves")
        .select("id")
        .eq(attempt.fromCol, targetUserId)
        .eq(attempt.toCol, viewerId)
        .limit(1)
        .maybeSingle();
      if (error) {
        if (isWaveSchemaFallbackError(error)) continue;
        return false;
      }
      if ((data as { id?: string } | null)?.id) return true;
      break;
    }
  } catch {
    return false;
  }
  return false;
};

const finalizeMutualWave = async (targetUserId: string): Promise<boolean> => {
  try {
    const { data, error } = await (supabase.rpc as (
      fn: string,
      params?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>)("accept_mutual_wave", {
      p_target_user_id: targetUserId,
    });
    if (error) {
      const message = String(error.message || "");
      if (!/accept_mutual_wave/i.test(message) && !/does not exist/i.test(message)) {
        throw error;
      }
      return false;
    }
    if (Array.isArray(data) && data.length > 0) {
      const first = (data[0] || {}) as { match_created?: unknown };
      return first.match_created === true;
    }
  } catch {
    return false;
  }
  return false;
};

export const sendDiscoveryWave = async (
  viewerId: string,
  targetUserId: string,
  copy?: {
    alreadyMatched?: string;
    blocked?: string;
    alreadySent?: string;
    sent?: string;
    match?: string;
    failed?: string;
  },
): Promise<WaveSendResult> => {
  try {
    const matchProbeA = await supabase
      .from("matches")
      .select("id")
      .eq("user1_id", viewerId)
      .eq("user2_id", targetUserId)
      .limit(1)
      .maybeSingle();
    if ((matchProbeA.data as { id?: string } | null)?.id) {
      toast.info(copy?.alreadyMatched || "You're already matched.");
      return { status: "duplicate", mutual: false, matchCreated: false };
    }

    const matchProbeB = await supabase
      .from("matches")
      .select("id")
      .eq("user1_id", targetUserId)
      .eq("user2_id", viewerId)
      .limit(1)
      .maybeSingle();
    if ((matchProbeB.data as { id?: string } | null)?.id) {
      toast.info(copy?.alreadyMatched || "You're already matched.");
      return { status: "duplicate", mutual: false, matchCreated: false };
    }

    const blocked = await areUsersBlocked(viewerId, targetUserId);
    if (blocked) {
      toast.error(copy?.blocked || "Cannot wave this user");
      return { status: "blocked", mutual: false, matchCreated: false };
    }

    const outgoingChecks: Array<{ fromCol: "sender_id" | "from_user_id"; toCol: "receiver_id" | "to_user_id" }> = [
      { fromCol: "sender_id", toCol: "receiver_id" },
      { fromCol: "from_user_id", toCol: "to_user_id" },
    ];
    for (const check of outgoingChecks) {
      const { data: existingRow, error: existingError } = await supabase
        .from("waves")
        .select("id")
        .eq(check.fromCol, viewerId)
        .eq(check.toCol, targetUserId)
        .limit(1)
        .maybeSingle();
      if (existingError) {
        if (isWaveSchemaFallbackError(existingError)) continue;
        break;
      }
      if ((existingRow as { id?: string } | null)?.id) {
        const mutual = await checkReciprocalWave(viewerId, targetUserId);
        const matchCreated = mutual ? await finalizeMutualWave(targetUserId) : false;
        toast.info(mutual ? (copy?.match || "It’s a pawfect match!") : (copy?.alreadySent || "Wave already sent"));
        return { status: "duplicate", mutual, matchCreated };
      }
      break;
    }

    const canonicalInsert = await supabase.from("waves" as "profiles").insert({
      sender_id: viewerId,
      receiver_id: targetUserId,
      status: "pending",
      wave_type: "standard",
    } as Record<string, unknown>);

    if (canonicalInsert.error) {
      if (isDuplicateWaveError(canonicalInsert.error)) throw canonicalInsert.error;
      if (!isWaveSchemaFallbackError(canonicalInsert.error)) throw canonicalInsert.error;
      const legacyInsert = await supabase.from("waves" as "profiles").insert({
        from_user_id: viewerId,
        to_user_id: targetUserId,
        status: "pending",
        wave_type: "standard",
      } as Record<string, unknown>);
      if (legacyInsert.error) {
        if (isDuplicateWaveError(legacyInsert.error)) throw legacyInsert.error;
        throw legacyInsert.error;
      }
    }

    const mutual = await checkReciprocalWave(viewerId, targetUserId);
    const matchCreated = mutual ? await finalizeMutualWave(targetUserId) : false;
    toast.success(mutual ? (copy?.match || "It’s a pawfect match!") : (copy?.sent || "Wave sent"));
    return { status: "sent", mutual, matchCreated };
  } catch (error) {
    if (isDuplicateWaveError(error)) {
      const mutual = await checkReciprocalWave(viewerId, targetUserId);
      const matchCreated = mutual ? await finalizeMutualWave(targetUserId) : false;
      toast.info(mutual ? (copy?.match || "It’s a pawfect match!") : (copy?.alreadySent || "Wave already sent"));
      return { status: "duplicate", mutual, matchCreated };
    }
    toast.error(copy?.failed || "Failed to send wave");
    return { status: "failed", mutual: false, matchCreated: false };
  }
};
