import { ChevronLeft, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ServiceStatus } from "./types";
import { STATUS_BADGE_CLASS, STATUS_LABEL } from "./types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  peerName: string;
  peerAvatar: string;
  status: ServiceStatus;
  onBack: () => void;
  onPeerClick?: () => void;
  peerClickable?: boolean;
  onReport?: () => void;
  onBlock?: () => void;
  blockMenuLabel?: string;
};

export const ServiceChatHeader = ({
  peerName,
  peerAvatar,
  status,
  onBack,
  onPeerClick,
  peerClickable = false,
  onReport,
  onBlock,
  blockMenuLabel = "Block User",
}: Props) => {
  const peerClassName = peerClickable
    ? "transition-colors hover:bg-muted/40 cursor-pointer"
    : "cursor-default";

  return (
    <header className="h-14 border-b border-border px-4 flex items-center gap-3 bg-background">
      <button type="button" onClick={onBack} className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center">
        <ChevronLeft className="w-5 h-5 text-brandText" />
      </button>
      <button
        type="button"
        onClick={peerClickable ? onPeerClick : undefined}
        disabled={!peerClickable}
        className={`h-9 w-9 rounded-full flex items-center justify-center ${peerClassName}`}
      >
        <img src={peerAvatar} alt="" className="h-9 w-9 rounded-full object-cover border border-border/40" />
      </button>
      <button
        type="button"
        onClick={peerClickable ? onPeerClick : undefined}
        disabled={!peerClickable}
        className={`min-w-0 flex-1 text-left rounded-lg px-1 py-1 ${peerClassName}`}
      >
        <p className="truncate text-[15px] font-semibold text-brandText">{peerName}</p>
      </button>
      <span className={cn("rounded-full px-3 py-1 text-[11px] font-semibold", STATUS_BADGE_CLASS[status])}>
        {STATUS_LABEL[status]}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center"
            aria-label="More actions"
          >
            <MoreVertical className="w-5 h-5 text-brandText" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onReport}>Report User</DropdownMenuItem>
          <DropdownMenuItem onClick={onBlock} className="text-red-500 focus:text-red-600">
            {blockMenuLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
};
