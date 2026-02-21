import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface UseBlockReturn {
  isBlocked: boolean;       // current user blocked targetId
  isBlockedBy: boolean;     // targetId blocked current user (derived from is_blocked RPC minus own row)
  isEitherBlocked: boolean; // any direction blocked
  loading: boolean;
  block: () => Promise<void>;
  unblock: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * useBlock — tracks block state between current user and a target profile.
 *
 * isBlocked:       the current user has blocked targetId.
 * isBlockedBy:     the target has blocked the current user.
 * isEitherBlocked: either direction — used to gate message sends.
 */
export function useBlock(targetId: string | null | undefined): UseBlockReturn {
  const { user } = useAuth();
  const [isBlocked, setIsBlocked] = useState(false);
  const [isBlockedBy, setIsBlockedBy] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id || !targetId) return;
    setLoading(true);
    try {
      // Own block row — "did I block them?"
      const { data: ownRow } = await supabase
        .from("user_blocks")
        .select("id")
        .eq("blocker_id", user.id)
        .eq("blocked_id", targetId)
        .maybeSingle();

      setIsBlocked(!!ownRow);

      // Bidirectional check via SECURITY DEFINER RPC
      const { data: either, error } = await supabase.rpc("is_blocked", {
        p_user_a: user.id,
        p_user_b: targetId,
      });

      if (!error) {
        // isBlockedBy = either is true AND I didn't block them
        setIsBlockedBy(!!either && !ownRow);
      }
    } catch (err) {
      console.error("[useBlock] refresh failed:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, targetId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const block = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc("block_user", { p_blocked_id: targetId });
      if (error) throw error;
      setIsBlocked(true);
      toast.success("User blocked");
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to block user");
    } finally {
      setLoading(false);
    }
  }, [targetId]);

  const unblock = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc("unblock_user", { p_blocked_id: targetId });
      if (error) throw error;
      setIsBlocked(false);
      toast.success("User unblocked");
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to unblock user");
    } finally {
      setLoading(false);
    }
  }, [targetId]);

  return {
    isBlocked,
    isBlockedBy,
    isEitherBlocked: isBlocked || isBlockedBy,
    loading,
    block,
    unblock,
    refresh,
  };
}
