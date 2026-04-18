import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatExternalUrlLabel,
  type ExternalLinkPreview,
} from "@/lib/externalLinkPreview";

type ExternalLinkPreviewCardProps = {
  url: string;
  preview?: Pick<ExternalLinkPreview, "title" | "description" | "image" | "siteName" | "loading" | "failed" | "error"> | null;
  onRemove?: () => void;
  className?: string;
};

export const ExternalLinkPreviewCard = ({
  url,
  preview,
  onRemove,
  className,
}: ExternalLinkPreviewCardProps) => {
  const siteLabel = preview?.siteName || (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "External link";
    }
  })();

  return (
    <div className={cn("relative", className)}>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove link preview"
          className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-brandText shadow-sm hover:bg-background"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="form-field-rest block !h-auto !overflow-hidden !p-0 transition-colors hover:bg-muted/20"
      >
        {preview?.image ? (
          <img
            src={preview.image}
            alt={preview.title || "Link preview"}
            className="h-40 w-full object-cover"
          />
        ) : preview?.loading ? (
          <div className="h-40 w-full animate-pulse bg-muted/20" aria-hidden="true" />
        ) : null}
        <div className="space-y-1.5 px-3 py-2.5">
          <p className="text-xs text-[rgba(74,73,101,0.62)]">{siteLabel}</p>
          <p className="line-clamp-2 text-[15px] font-semibold leading-5 text-brandText">
            {preview?.title || formatExternalUrlLabel(url)}
          </p>
          {preview?.description ? (
            <p className="line-clamp-2 text-xs leading-4 text-[rgba(74,73,101,0.72)]">
              {preview.description}
            </p>
          ) : null}
          {preview?.loading ? (
            <p className="text-xs text-[rgba(74,73,101,0.62)]">Loading preview...</p>
          ) : null}
          {preview?.failed ? (
            <p className="text-xs text-[rgba(74,73,101,0.62)]">
              Preview unavailable{import.meta.env.DEV && preview.error ? `: ${preview.error}` : ""}
            </p>
          ) : null}
        </div>
      </a>
    </div>
  );
};
