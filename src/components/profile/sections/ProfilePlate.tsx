import { cn } from "@/lib/utils";

type ProfilePlateProps = {
  src: string | null;
  aspect: "4/5" | "3/2" | "1/1";
  align?: "full-bleed" | "inset-left" | "inset-right";
  caption?: string | null;
  alt: string;
  onClick?: (src: string) => void;
};

const aspectClass = {
  "4/5": "aspect-[4/5]",
  "3/2": "aspect-[3/2]",
  "1/1": "aspect-square",
};

const alignClass = {
  "full-bleed": "w-full",
  "inset-left": "w-full",
  "inset-right": "w-full",
};

export function ProfilePlate({
  src,
  aspect,
  align = "full-bleed",
  caption,
  alt,
  onClick,
}: ProfilePlateProps) {
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
