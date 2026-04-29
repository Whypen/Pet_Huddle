import { cn } from "@/lib/utils";
import type { SoloAspect } from "@/types/profilePhotos";

type ProfileAdaptivePlateProps = {
  src: string | null;
  aspect: SoloAspect;
  align?: "full-bleed" | "inset-left" | "inset-right";
  caption?: string | null;
  alt: string;
  onClick?: (src: string) => void;
};

const aspectClass = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "16:9": "aspect-video",
};

const alignClass = {
  "full-bleed": "w-full",
  "inset-left": "w-full",
  "inset-right": "w-full",
};

export function ProfileAdaptivePlate({
  src,
  aspect,
  align = "full-bleed",
  caption,
  alt,
  onClick,
}: ProfileAdaptivePlateProps) {
  if (!src) return null;

  return (
    <button
      type="button"
      className={cn("relative block overflow-hidden bg-[var(--bg-muted)]", aspectClass[aspect], alignClass[align])}
      style={{ touchAction: "pan-y" }}
      onClick={() => onClick?.(src)}
      aria-label={alt}
    >
      <img src={src} alt={alt} className="h-full w-full object-cover object-center" loading="lazy" />
      {caption ? (
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-4 pb-4 pt-12 text-left type-meta text-white">
          {caption}
        </span>
      ) : null}
    </button>
  );
}
