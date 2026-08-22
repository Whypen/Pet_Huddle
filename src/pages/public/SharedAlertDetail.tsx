import { BadgeCheck, Heart, MoreHorizontal, Send, X } from "lucide-react";
import { PostMediaCarousel } from "@/components/social/PostMediaCarousel";
import { useAuthGate } from "@/components/auth/authGateContext";
import { getBroadcastPinStyle } from "@/lib/broadcastPinStyle";

export type SharedAlert = {
  id: string;
  alert_type: string;
  title: string | null;
  description: string | null;
  photo_url: string | null;
  media_urls: string[] | null;
  support_count: number;
  created_at: string;
  creator_id: string | null;
  creator_display_name: string | null;
  creator_avatar_url: string | null;
};

const timeAgo = (iso: string) => {
  const elapsed = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (elapsed < 60) return `${elapsed}s ago`;
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h ago`;
  return `${Math.floor(elapsed / 86400)}d ago`;
};

export const SharedAlertDetail = ({ alert, onClose }: { alert: SharedAlert; onClose: () => void }) => {
  const { requireAuth } = useAuthGate();
  const wall = () => requireAuth("see-alert", () => {}, { targetId: alert.id });
  const media = alert.media_urls?.length ? alert.media_urls : alert.photo_url ? [alert.photo_url] : [];
  const alertStyle = getBroadcastPinStyle(alert.alert_type);

  return (
    <div className="fixed inset-0 z-[5000] flex items-end justify-center bg-black/50" role="dialog" aria-modal="true" aria-label="Shared alert details">
      <section data-huddle-bottom-sheet="true" className="flex max-h-[calc(100svh-8px)] min-h-0 w-full max-w-[430px] flex-col overflow-hidden rounded-t-3xl bg-card shadow-elevated">
        <div className="min-h-0 overflow-y-auto p-6 pb-4 overscroll-contain">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 rounded-full px-3 py-1 text-sm font-medium text-white" style={{ backgroundColor: alertStyle.color }}>
                {alert.alert_type} · {timeAgo(alert.created_at)}
              </span>
              <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-50/70 px-2 py-1 text-xs font-medium text-emerald-700 backdrop-blur-md">
                <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Shared alert</span>
              </span>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-1" aria-label="Close alert details"><X className="h-6 w-6" /></button>
          </div>

          {alert.title ? <h1 className="mb-2 text-lg font-bold text-brandText">{alert.title}</h1> : null}
          {alert.description ? <p className="mb-4 text-foreground">{alert.description}</p> : null}
          {media.length ? (
            <div className="mb-4 w-full">
              <PostMediaCarousel items={media.map((src, index) => ({ src, alt: `${alert.title || "Alert photo"} ${index + 1}` }))} />
            </div>
          ) : null}

          <button type="button" className="mb-4 flex items-center gap-2" onClick={wall}>
            <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-muted">
              {alert.creator_avatar_url ? <img src={alert.creator_avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="text-xs font-semibold">{alert.creator_display_name?.charAt(0) || "?"}</span>}
            </span>
            <span className="text-sm font-medium">{alert.creator_display_name || "Anonymous"}</span>
          </button>
        </div>

        <footer className="flex items-center justify-end gap-1 border-t border-border bg-card px-6 pb-4 pt-3">
          <button type="button" onClick={wall} className="inline-flex items-center gap-1 rounded-full px-2 py-2" aria-label="Support alert"><Heart className="h-5 w-5 text-muted-foreground" /><span className="text-xs font-medium tabular-nums text-muted-foreground">{alert.support_count || 0}</span></button>
          <button type="button" onClick={wall} className="rounded-full p-2" aria-label="Share alert"><Send className="h-4 w-4 text-muted-foreground" /></button>
          <button type="button" onClick={wall} className="rounded-full p-2" aria-label="More alert actions"><MoreHorizontal className="h-5 w-5 text-muted-foreground" /></button>
        </footer>
      </section>
    </div>
  );
};
