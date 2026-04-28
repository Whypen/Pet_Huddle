import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";

type MediaItem = {
  src: string;
  alt?: string;
  kind?: "image" | "video";
  poster?: string | null;
  previewSrc?: string | null;
  embedUrl?: string | null;
  status?: string | null;
};

type PostMediaCarouselProps = {
  items: MediaItem[];
  className?: string;
  mode?: "peek" | "full";
  isSensitive?: boolean;
};

const MIN_ASPECT = 3 / 4;
const MAX_ASPECT = 16 / 9;
const DEFAULT_CAROUSEL_ASPECT = 1;
const mediaAspectCache = new Map<string, number>();

const isVideoSrc = (src: string) => /\.(mp4|mov|m4v|webm|ogg)$/i.test(src) || src.includes("video/");
const clampAspect = (aspect: number) => Math.min(Math.max(aspect || 1, MIN_ASPECT), MAX_ASPECT);

const SENSITIVE_TAP_SEEN_KEY = "huddle_sensitive_tap_seen";

const TapHintIcon = () => (
  <span className="relative inline-flex items-center justify-center">
    {/* Ripple rings — anchored at centre, no drift on icon */}
    <span className="absolute h-14 w-14 rounded-full border-2 border-white/60 animate-[sensitiveRipple_1.6s_ease-out_infinite]" />
    <span className="absolute h-14 w-14 rounded-full border-2 border-white/40 animate-[sensitiveRipple_1.6s_ease-out_0.5s_infinite]" />
    <span className="absolute h-14 w-14 rounded-full border-2 border-white/20 animate-[sensitiveRipple_1.6s_ease-out_1s_infinite]" />
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 21V19C20 16.7909 18.2091 15 16 15H15C14.4477 15 14 14.5523 14 14V9C14 7.89543 13.1046 7 12 7V7C10.8954 7 10 7.89543 10 9V18L7.6 14.8C7.22229 14.2964 6.62951 14 6 14H5.56619C4.70121 14 4 14.7012 4 15.5662V15.5662C4 15.8501 4.07715 16.1286 4.22319 16.372L7 21" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
      <path d="M12 4V3" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
      <path d="M18 10L19 10" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
      <path d="M5 10L6 10" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
      <path d="M7.34334 5.34309L6.63623 4.63599" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
      <path d="M16.6567 5.34309L17.3638 4.63599" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
    </svg>
  </span>
);

const FeedVideo = ({
  item,
  isSensitive,
  sensitiveRevealed,
  onReadyAspect,
}: {
  item: MediaItem;
  isSensitive: boolean;
  sensitiveRevealed: boolean;
  onReadyAspect: (width: number, height: number) => void;
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [intent, setIntent] = useState(false);
  const [loadPlayer, setLoadPlayer] = useState(false);

  useEffect(() => {
    if (intent || isSensitive) return;
    const node = rootRef.current;
    if (!node) return;
    let timer: number | null = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.72) {
          timer = window.setTimeout(() => setIntent(true), 1000);
        } else if (timer) {
          window.clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: [0, 0.72, 1] },
    );
    observer.observe(node);
    return () => {
      if (timer) window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [intent, isSensitive]);

  useEffect(() => {
    if (!intent || (isSensitive && !sensitiveRevealed)) return;
    const timer = window.setTimeout(() => setLoadPlayer(true), 120);
    return () => window.clearTimeout(timer);
  }, [intent, isSensitive, sensitiveRevealed]);

  const poster = item.poster || item.previewSrc || "";
  const embedUrl = item.embedUrl || item.src;

  return (
    <div ref={rootRef} className="relative h-full w-full bg-black">
      {poster ? (
        <img
          src={poster}
          alt={item.alt || ""}
          className="h-full w-full object-contain object-center transition-[filter] duration-300 ease-out"
          style={{ filter: isSensitive && !sensitiveRevealed ? "blur(22px)" : "blur(0px)" }}
          loading="lazy"
          onLoad={(event) => onReadyAspect(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
        />
      ) : (
        <div className="h-full w-full bg-muted/70" />
      )}
      {!loadPlayer ? (
        <button
          type="button"
          aria-label="Play video"
          onClick={(event) => {
            event.stopPropagation();
            setIntent(true);
            setLoadPlayer(true);
          }}
          className="absolute inset-0 flex items-center justify-center bg-black/10 text-white"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
        </button>
      ) : (
        <iframe
          src={embedUrl}
          title={item.alt || "Social video"}
          loading="lazy"
          allow="accelerometer; gyroscope; encrypted-media; picture-in-picture;"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      )}
      {item.status && item.status !== "ready" ? (
        <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white">
          Processing
        </span>
      ) : null}
    </div>
  );
};

export const PostMediaCarousel = ({ items, className, mode = "peek", isSensitive = false }: PostMediaCarouselProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fullscreenScrollRef = useRef<HTMLDivElement | null>(null);
  const dragStartXRef = useRef<number | null>(null);
  const dragMovedRef = useRef(false);
  const primarySrc = items[0]?.src || "";
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [displayAspect, setDisplayAspect] = useState(() =>
    clampAspect(mediaAspectCache.get(primarySrc) || DEFAULT_CAROUSEL_ASPECT)
  );
  const [sensitiveRevealed, setSensitiveRevealed] = useState(false);
  const [tapHintDismissed, setTapHintDismissed] = useState(
    () => localStorage.getItem(SENSITIVE_TAP_SEEN_KEY) === "1"
  );
  const activeSrc = items[activeIndex]?.src || primarySrc;

  const revealSensitive = useCallback(() => {
    setSensitiveRevealed((prev) => !prev);
    if (!tapHintDismissed) {
      setTapHintDismissed(true);
      localStorage.setItem(SENSITIVE_TAP_SEEN_KEY, "1");
    }
  }, [tapHintDismissed]);

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

  const updateAspect = (src: string, width: number, height: number) => {
    if (!width || !height) return;
    const nextAspect = clampAspect(width / height);
    mediaAspectCache.set(src, nextAspect);
    if (src === activeSrc) {
      setDisplayAspect(nextAspect);
    }
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
    setDisplayAspect(clampAspect(mediaAspectCache.get(activeSrc) || mediaAspectCache.get(primarySrc) || DEFAULT_CAROUSEL_ASPECT));
  }, [activeSrc, primarySrc]);

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
        <div className="overflow-hidden" style={{ aspectRatio: `${displayAspect}` }}>
          <div
            ref={scrollRef}
            className="flex h-full snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            onScroll={handleScroll}
          >
            {items.map((item, index) => {
              const isVideo = item.kind === "video" || isVideoSrc(item.src);
              return (
                <div
                  key={`${item.src}-${index}`}
                  role="button"
                  tabIndex={0}
                  className="relative h-full shrink-0 snap-start overflow-hidden rounded-[14px] bg-muted/60 cursor-pointer"
                  style={{
                    width: slideWidth ? `${slideWidth}px` : undefined,
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerEnd}
                  onPointerCancel={handlePointerEnd}
                  onClick={() => {
                    if (dragMovedRef.current) return;
                    if (isSensitive) {
                      revealSensitive();
                      return;
                    }
                    setFullscreenIndex(index);
                  }}
                  onKeyDown={(event) => {
                    if (isSensitive) {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        revealSensitive();
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
                    item.embedUrl ? (
                      <FeedVideo
                        item={item}
                        isSensitive={isSensitive}
                        sensitiveRevealed={sensitiveRevealed}
                        onReadyAspect={(width, height) => updateAspect(item.src, width, height)}
                      />
                    ) : (
                    <video
                      src={item.src}
                      className="h-full w-full object-contain object-center transition-[filter] duration-300 ease-out"
                      style={{ filter: isSensitive && !sensitiveRevealed ? "blur(22px)" : "blur(0px)" }}
                      muted
                      playsInline
                      preload="none"
                      poster={item.poster || undefined}
                      onLoadedMetadata={(event) => updateAspect(item.src, event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
                    />
                    )
                  ) : (
                    <img
                      src={item.src}
                      alt={item.alt || ""}
                      className="h-full w-full object-contain object-center transition-[filter] duration-300 ease-out"
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
                      {!sensitiveRevealed && !tapHintDismissed ? (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center drop-shadow-xl">
                          <TapHintIcon />
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
                  const isVideo = item.kind === "video" || isVideoSrc(item.src);
                  return (
                    <div key={`${item.src}-fullscreen-${index}`} className="flex h-full w-full shrink-0 snap-center items-center justify-center p-4">
                      {isVideo ? (
                        item.embedUrl ? (
                          <iframe
                            src={item.embedUrl}
                            title={item.alt || "Social video"}
                            allow="accelerometer; gyroscope; encrypted-media; picture-in-picture;"
                            allowFullScreen
                            className="h-full w-full border-0"
                          />
                        ) : (
                        <video src={item.src} controls autoPlay playsInline className="max-h-full max-w-full object-contain" />
                        )
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
