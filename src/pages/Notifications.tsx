import { useEffect, useMemo, useState } from "react";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NotificationRow = {
  id: string;
  message: string;
  type: "alert" | "admin" | string;
  read: boolean;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

function timeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const unread = useMemo(() => rows.filter((r) => !r.read).length, [rows]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const res = await supabase
        .from("notifications")
        .select("id,message,type,read,created_at,metadata")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      setRows((res.data ?? []) as NotificationRow[]);
      setLoading(false);
    };

    const channel = supabase
      .channel(`notifications_list:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => void load()
      )
      .subscribe();

    void load();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markOneRead = async (id: string) => {
    if (!user) return;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, read: true } : r)));
    await supabase.from("notifications").update({ read: true }).eq("id", id).eq("user_id", user.id);
  };

  const markAllRead = async () => {
    if (!user) return;
    setRows((prev) => prev.map((r) => ({ ...r, read: true })));
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
  };

  return (
    <div className="min-h-screen bg-background pb-nav">
      <GlobalHeader />

      <div className="px-4 pt-4 max-w-md mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-brandText">Notifications</h1>
          <Button variant="outline" className="h-9" disabled={unread === 0} onClick={markAllRead}>
            Mark all read
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          New alerts and admin notices show up here in real time.
        </p>
      </div>

      <div className="px-4 mt-4 max-w-md mx-auto space-y-2 pb-6">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No notifications yet.</div>
        ) : (
          rows.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                void markOneRead(r.id);
                const alertId = (r.metadata?.alert_id as string | undefined) ?? null;
                if (alertId) {
                  // Deep link to map for now. (Alert detail is accessible by selecting the pin.)
                  window.location.assign(`/map?alert=${encodeURIComponent(alertId)}`);
                }
              }}
              className={cn(
                "w-full text-left rounded-2xl border px-4 py-3 transition-colors",
                r.read ? "border-border bg-card" : "border-brandBlue/30 bg-brandBlue/5"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold text-brandText">{r.message}</div>
                <div className="text-[10px] text-muted-foreground whitespace-nowrap">{timeLabel(r.created_at)}</div>
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                {String(r.type || "alert").toUpperCase()}
                {!r.read ? <span className="ml-2 text-red-500 font-semibold">NEW</span> : null}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

