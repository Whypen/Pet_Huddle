import { supabase } from "@/integrations/supabase/client";

export const getThreadShareCount = async (threadId: string): Promise<number | null> => {
  const id = String(threadId || "").trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from("threads")
    .select("clicks")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  const value = Number((data as { clicks?: number | null } | null)?.clicks ?? 0);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
};

export const recordThreadShareClick = async (threadId: string): Promise<number | null> => {
  const id = String(threadId || "").trim();
  if (!id) return null;
  const { data, error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>)(
    "record_thread_share_click",
    { p_thread_id: id }
  );
  if (error) return null;
  if (typeof data === "number" && Number.isFinite(data)) {
    return Math.max(0, Number(data));
  }
  return getThreadShareCount(id);
};
