import { cn } from "@/lib/utils";
import type { ShareModel } from "@/lib/shareModel";
import { buildChatShareHeadline } from "@/lib/shareModel";

type SharedContentCardProps = {
  share: ShareModel;
  mine?: boolean;
  compact?: boolean;
};

export function SharedContentCard({ share, mine = false, compact = false }: SharedContentCardProps) {
  const isLogoFallback = /\/huddle-logo\.jpg$/i.test(share.imageUrl);
  const resolvedHeadline = (() => {
    const raw = String(share.chatHeadline || "").trim();
    if (raw && /on huddle's (Social|Map)$/i.test(raw)) return raw;
    const title = String(share.title || "").trim();
    const withSocial = title.match(/^(.+?)\s+\(@([^)]+)\)\s+on\s+huddle$/i);
    if (withSocial) return buildChatShareHeadline(withSocial[1], withSocial[2], share.surface);
    const socialOnly = title.match(/^@(.+?)\s+on\s+huddle$/i);
    if (socialOnly) return buildChatShareHeadline("", socialOnly[1], share.surface);
    const nameOnly = title.match(/^(.+?)\s+on\s+huddle$/i);
    if (nameOnly) return buildChatShareHeadline(nameOnly[1], "", share.surface);
    return buildChatShareHeadline("", "", share.surface);
  })();
  return (
    <a
      href={share.appUrl || share.canonicalUrl}
      className={cn(
        "block overflow-hidden rounded-[18px] border transition-transform active:scale-[0.98]",
        mine
          ? "border-[rgba(163,168,190,0.34)] bg-[rgba(239,243,255,0.92)] shadow-[0_8px_18px_rgba(11,18,48,0.12)]"
          : "border-[rgba(163,168,190,0.34)] bg-white shadow-[0_10px_22px_rgba(36,55,120,0.10)]",
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <div className={cn("overflow-hidden rounded-[14px] bg-[rgba(244,247,251,0.95)]", compact ? "h-12 w-12" : "h-14 w-14")}>
          <img
            src={share.imageUrl}
            alt="huddle share preview"
            className={cn(
              "h-full w-full object-contain",
              isLogoFallback ? "p-0.5" : "p-0",
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-semibold leading-5 text-[#424965]">
            {resolvedHeadline}
          </p>
          <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#6B728A]">
            {share.description}
          </p>
        </div>
      </div>
    </a>
  );
}
