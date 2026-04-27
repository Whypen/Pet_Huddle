import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Lightbox } from "@/components/media/Lightbox";

interface MediaThumbProps {
  src: string;
  alt?: string;
  className?: string;
  fallbackSrc?: string;
  style?: CSSProperties;
}

export const MediaThumb = ({ src, alt = "", className, fallbackSrc, style }: MediaThumbProps) => {
  const [open, setOpen] = useState(false);
  const isVideo = /\.(mp4|mov|m4v|webm|ogg)$/i.test(src) || src.includes("video/");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("overflow-hidden rounded-lg bg-muted/50 border border-border", className)}
        style={style}
      >
        {isVideo ? (
          <video src={src} className="h-full w-full object-contain" muted playsInline preload="metadata" />
        ) : (
          <img
            src={src}
            alt={alt}
            className="h-full w-full object-contain"
            loading="lazy"
            onError={fallbackSrc ? (e) => { (e.currentTarget as HTMLImageElement).src = fallbackSrc; } : undefined}
          />
        )}
      </button>
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
};
