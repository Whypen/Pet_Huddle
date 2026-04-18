import type { ReactNode } from "react";
import { ImageIcon, Users } from "lucide-react";

type GroupDetailsAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  destructive?: boolean;
};

type GroupDetailsPanelProps = {
  name: string;
  memberCount: number;
  avatarUrl?: string | null;
  subtitle?: string | null;
  description?: string | null;
  mediaUrls: string[];
  actions: GroupDetailsAction[];
};

export function GroupDetailsPanel({
  name,
  memberCount,
  avatarUrl,
  subtitle,
  description,
  mediaUrls,
  actions,
}: GroupDetailsPanelProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/30 bg-card">
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <Users className="h-6 w-6 text-primary" />
          )}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-foreground">{name}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {subtitle || `${memberCount} members`}
          </p>
        </div>
      </div>

      {description ? (
        <div className="rounded-[18px] border border-white/60 bg-white px-4 py-3 shadow-[0_10px_24px_rgba(66,73,101,0.10)]">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8C93AA]">Description</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-brandText">{description}</p>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#8C93AA]">
          Media{mediaUrls.length > 0 ? ` (${mediaUrls.length})` : ""}
        </p>
        {mediaUrls.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {mediaUrls.map((url, index) => (
              <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="h-24 w-24 shrink-0 overflow-hidden rounded-xl">
                <img src={url} alt="" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
            <span>No media shared yet</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className={`flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors ${
              action.destructive ? "hover:bg-red-50" : "hover:bg-muted/60"
            }`}
            onClick={action.onClick}
          >
            {action.icon}
            <span className={`text-sm font-medium ${action.destructive ? "text-red-500" : ""}`}>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
