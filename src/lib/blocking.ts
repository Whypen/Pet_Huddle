import { supabase } from "@/integrations/supabase/client";

export const loadBlockedUserIdsFor = async (userId: string): Promise<Set<string>> => {
  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

  if (error || !data) {
    return new Set<string>();
  }

  const ids = new Set<string>();
  for (const row of data as Array<{ blocker_id: string; blocked_id: string }>) {
    if (row.blocker_id === userId) ids.add(row.blocked_id);
    if (row.blocked_id === userId) ids.add(row.blocker_id);
  }
  return ids;
};

export const areUsersBlocked = async (viewerId: string, targetId: string): Promise<boolean> => {
  if (!viewerId || !targetId) return false;
  const { data, error } = await (supabase.rpc as (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown }>)("is_user_blocked", {
    p_a: viewerId,
    p_b: targetId,
  });

  if (error) return false;
  return Boolean(data);
};

export const getEventActorId = (payload: { new?: Record<string, unknown> | null; old?: Record<string, unknown> | null }): string | null => {
  const next = payload.new || {};
  const prev = payload.old || {};
  const candidate =
    (next.user_id as string | undefined) ||
    (next.sender_id as string | undefined) ||
    (next.creator_id as string | undefined) ||
    (next.from_user_id as string | undefined) ||
    (prev.user_id as string | undefined) ||
    (prev.sender_id as string | undefined) ||
    (prev.creator_id as string | undefined) ||
    (prev.from_user_id as string | undefined);
  return candidate || null;
};
