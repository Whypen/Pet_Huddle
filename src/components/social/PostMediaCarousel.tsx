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

const SensitiveTapIcon = () => (
  <svg
    width="72"
    height="72"
    viewBox="0 0 100 110"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    {/* ── Index finger pointing up ── */}
    <path
      d="M40 60 L40 22 Q40 10 48 10 Q56 10 56 22 L56 60"
      stroke="white" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"
    />
    {/* ── Palm / fist body ── */}
    <path
      d="M40 60 L26 60 Q18 60 18 70 L18 84 Q18 96 32 96 L66 96 Q82 96 82 84 L82 72 Q82 62 74 62 L56 60"
      stroke="white" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"
    />
    {/* ── Curled finger knuckle 1 ── */}
    <path
      d="M56 60 Q61 50 68 50 Q75 50 75 60"
      stroke="white" strokeWidth="5.5" strokeLinecap="round" fill="none"
    />
    {/* ── Curled finger knuckle 2 (smaller, merges into palm) ── */}
    <path
      d="M75 62 Q80 56 84 58 Q88 61 84 72"
      stroke="white" strokeWidth="5.5" strokeLinecap="round" fill="none"
    />
    {/* ── Thumb curling left ── */}
    <path
      d="M26 76 Q14 74 12 64 Q10 54 19 52 Q26 50 26 60"
      stroke="white" strokeWidth="5.5" strokeLinecap="round" fill="none"
    />
    {/* ── Tap dash 1 — NW ── */}
    <line x1="36" y1="20" x2="28" y2="11" stroke="white" strokeWidth="5" strokeLinecap="round"/>
    {/* ── Tap dash 2 — WNW ── */}
    <line x1="30" y1="32" x2="19" y2="27" stroke="white" strokeWidth="5" strokeLinecap="round"/>
    {/* ── Tap dash 3 — W ── */}
    <line x1="27" y1="46" x2="15" y2="46" stroke="white" strokeWidth="5" strokeLinecap="round"/>
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
                    <>
                      <span
                        className={cn(
                          "pointer-events-none absolute inset-0 bg-black/10 transition-opacity duration-300",
                          sensitiveRevealed ? "opacity-0" : "opacity-100",
                        )}
                      />
                      {!sensitiveRevealed ? (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center drop-shadow-lg">
                          <SensitiveTapIcon />
                        </span>
                      ) : null}
                    </>
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
