import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

type MediaItem = {
  src: string;
  alt?: string;
};

type PostMediaCarouselProps = {
  items: MediaItem[];
  className?: string;
  mode?: "peek" | "full";
  isSensitive?: boolean;
};

const MIN_ASPECT = 3 / 4;
const MAX_ASPECT = 4 / 3;

const isVideoSrc = (src: string) => /\.(mp4|mov|m4v|webm|ogg)$/i.test(src) || src.includes("video/");
const clampAspect = (aspect: number) => Math.min(Math.max(aspect || 1, MIN_ASPECT), MAX_ASPECT);

const FingerTapFilledIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
    <path d="M11.5 2.5a1 1 0 0 1 1 1v5.75h.7V6.5a1 1 0 1 1 2 0v2.75h.7V7.25a1 1 0 1 1 2 0V10h.7V9a1 1 0 1 1 2 0v4.25A7.75 7.75 0 0 1 13.55 21h-.7a6.62 6.62 0 0 1-5.44-2.82L5.5 15.4a1 1 0 1 1 1.64-1.15l1.36 1.94V7.75a1 1 0 1 1 2 0v3.5h1V3.5a1 1 0 0 1 1-1z" />
    <path d="M7.28 4.66a.85.85 0 0 1 0-1.2l1-1a.85.85 0 1 1 1.2 1.2l-1 1a.85.85 0 0 1-1.2 0zm8.24-2.2a.85.85 0 0 1 1.2 0l1 1a.85.85 0 0 1-1.2 1.2l-1-1a.85.85 0 0 1 0-1.2zM12 0.9a.85.85 0 0 1 .85.85V3a.85.85 0 0 1-1.7 0V1.75A.85.85 0 0 1 12 .9z" />
  </svg>
);

export const PostMediaCarousel = ({ items, className, mode = "peek", isSensitive = false }: PostMediaCarouselProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fullscreenScrollRef = useRef<HTMLDivElement | null>(null);
  const dragStartXRef = useRef<number | null>(null);
  const dragMovedRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [aspectMap, setAspectMap] = useState<Record<string, number>>({});
  const [sensitiveRevealed, setSensitiveRevealed] = useState(false);

  useEffect(() => {
    if (!isSensitive) {
      setSensitiveRevealed(false);
    }
  }, [isSensitive]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const updateWidth = () => setMeasuredWidth(node.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const slideWidth = useMemo(() => {
    if (mode === "full") return measuredWidth;
    return Math.max(measuredWidth - 56, measuredWidth * 0.82);
  }, [measuredWidth, mode]);

  const activeAspect = clampAspect(aspectMap[items[activeIndex]?.src] || aspectMap[items[0]?.src] || MIN_ASPECT);
  const carouselHeight = slideWidth > 0 ? slideWidth / activeAspect : undefined;

  const updateAspect = (src: string, width: number, height: number) => {
    if (!width || !height) return;
    setAspectMap((prev) => (prev[src] === width / height ? prev : { ...prev, [src]: width / height }));
  };

  const scrollToIndex = (index: number) => {
    const node = scrollRef.current;
    if (!node) return;
    const next = Math.max(0, Math.min(items.length - 1, index));
    node.scrollTo({ left: next * slideWidth, behavior: "smooth" });
    setActiveIndex(next);
  };

  const handleScroll = () => {
    const node = scrollRef.current;
    if (!node || !slideWidth) return;
    const nextIndex = Math.round(node.scrollLeft / slideWidth);
    if (nextIndex !== activeIndex) setActiveIndex(nextIndex);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStartXRef.current = event.clientX;
    dragMovedRef.current = false;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartXRef.current == null) return;
    if (Math.abs(event.clientX - dragStartXRef.current) > 8) {
      dragMovedRef.current = true;
    }
  };

  const handlePointerEnd = () => {
    dragStartXRef.current = null;
    window.setTimeout(() => {
      dragMovedRef.current = false;
    }, 0);
  };

  const fullscreenItems = fullscreenIndex != null ? items : [];

  useEffect(() => {
    if (fullscreenIndex == null) return;
    const node = fullscreenScrollRef.current;
    if (!node) return;
    requestAnimationFrame(() => {
      node.scrollLeft = fullscreenIndex * node.clientWidth;
    });
  }, [fullscreenIndex]);

  return (
    <>
      <div className={cn("space-y-2", className)}>
        <div className="overflow-hidden" style={carouselHeight ? { height: `${carouselHeight}px` } : undefined}>
          <div
            ref={scrollRef}
            className="flex h-full snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth touch-pan-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            onScroll={handleScroll}
          >
            {items.map((item, index) => {
              const aspect = clampAspect(aspectMap[item.src] || 1);
              const isVideo = isVideoSrc(item.src);
              return (
                <div
                  key={`${item.src}-${index}`}
                  role="button"
                  tabIndex={0}
                  className="relative shrink-0 snap-start overflow-hidden rounded-2xl bg-muted/60 touch-pan-x cursor-pointer"
                  style={{
                    width: slideWidth ? `${slideWidth}px` : undefined,
                    aspectRatio: `${aspect}`,
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerEnd}
                  onPointerCancel={handlePointerEnd}
                  onClick={() => {
                    if (dragMovedRef.current) return;
                    if (isSensitive) {
                      setSensitiveRevealed((prev) => !prev);
                      return;
                    }
                    setFullscreenIndex(index);
                  }}
                  onKeyDown={(event) => {
                    if (isSensitive) {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSensitiveRevealed((prev) => !prev);
                      }
                      return;
                    }
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setFullscreenIndex(index);
                    }
                  }}
                >
                  {isVideo ? (
                    <video
                      src={item.src}
                      className="h-full w-full object-cover object-center transition-[filter] duration-300 ease-out"
                      style={{ filter: isSensitive && !sensitiveRevealed ? "blur(22px)" : "blur(0px)" }}
                      muted
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={(event) => updateAspect(item.src, event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
                    />
                  ) : (
                    <img
                      src={item.src}
                      alt={item.alt || ""}
                      className="h-full w-full object-cover object-center transition-[filter] duration-300 ease-out"
                      style={{ filter: isSensitive && !sensitiveRevealed ? "blur(22px)" : "blur(0px)" }}
                      loading="lazy"
                      onLoad={(event) => updateAspect(item.src, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
                    />
                  )}
                  {isSensitive ? (
                    <span
                      className={cn(
                        "pointer-events-none absolute inset-0 flex items-center justify-center bg-black/22 transition-opacity duration-300",
                        sensitiveRevealed ? "opacity-0" : "opacity-100",
                      )}
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/38 text-white">
                        <FingerTapFilledIcon className="h-6 w-6" />
                      </span>
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
        {items.length > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => scrollToIndex(activeIndex - 1)}
              disabled={activeIndex <= 0}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-white/80 text-brandText/70 disabled:opacity-35"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {items.map((item, index) => (
              <span
                key={`${item.src}-dot-${index}`}
                className={cn("h-1.5 rounded-full transition-all", index === activeIndex ? "w-4 bg-brandBlue" : "w-1.5 bg-muted-foreground/35")}
              />
            ))}
            <button
              type="button"
              onClick={() => scrollToIndex(activeIndex + 1)}
              disabled={activeIndex >= items.length - 1}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-white/80 text-brandText/70 disabled:opacity-35"
              aria-label="Next image"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {fullscreenIndex != null && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[9600] bg-black/95">
              <button
                type="button"
                onClick={() => setFullscreenIndex(null)}
                className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white"
                aria-label="Close media viewer"
              >
                <X className="h-5 w-5" />
              </button>
              {fullscreenIndex > 0 && (
                <button
                  type="button"
                  onClick={() => setFullscreenIndex((prev) => (prev == null ? prev : Math.max(prev - 1, 0)))}
                  className="absolute left-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white"
                  aria-label="Previous media"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {fullscreenIndex < items.length - 1 && (
                <button
                  type="button"
                  onClick={() => setFullscreenIndex((prev) => (prev == null ? prev : Math.min(prev + 1, items.length - 1)))}
                  className="absolute right-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white"
                  aria-label="Next media"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
              <div
                ref={fullscreenScrollRef}
                className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                onScroll={(event) => {
                  const nextIndex = Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth);
                  if (nextIndex !== fullscreenIndex) setFullscreenIndex(nextIndex);
                }}
              >
                {fullscreenItems.map((item, index) => {
                  const isVideo = isVideoSrc(item.src);
                  return (
                    <div key={`${item.src}-fullscreen-${index}`} className="flex h-full w-full shrink-0 snap-center items-center justify-center p-4">
                      {isVideo ? (
                        <video src={item.src} controls autoPlay playsInline className="max-h-full max-w-full object-contain" />
                      ) : (
                        <img src={item.src} alt={item.alt || ""} className="max-h-full max-w-full object-contain" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
};
