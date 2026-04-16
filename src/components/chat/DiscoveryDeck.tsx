import { memo, Profiler, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValueEvent, type MotionValue } from "framer-motion";
import { ArrowUpRight, MapPin, PawPrint, Star, X } from "lucide-react";
import { ProfileBadges } from "@/components/ui/ProfileBadges";
import { HuddleVideoLoader } from "@/components/ui/HuddleVideoLoader";
import { WaveHandIcon } from "@/components/icons/WaveHandIcon";
import { cn } from "@/lib/utils";
import {
  noteDiscoveryDeckRender,
  noteDiscoveryFirstDragFrame,
  noteDiscoveryPointerDown,
  noteDiscoveryPromotionPaint,
} from "@/lib/discoveryPerf";

type DiscoveryDeckProfile = {
  id: string;
  display_name: string | null;
  avatar_url?: string | null;
  is_verified?: boolean | null;
  has_car?: boolean;
  location_name?: string | null;
  social_album?: string[] | null;
  availability_status?: string[] | null;
};

type DiscoveryDeckProps = {
  stackedDiscoveryCards: DiscoveryDeckProfile[];
  currentDiscovery: DiscoveryDeckProfile | null;
  discoveryLoading: boolean;
  discoveryLocationBlocked: boolean;
  renderDiscoverEmpty: boolean;
  canExpandSearch: boolean;
  discoveryExpandStepKm: number;
  passedDiscoveryCount: number;
  showDiscoveryQuotaLock: boolean;
  discoverExhaustedCopy: string;
  emptyChatImage: string;
  profilePlaceholder: string;
  swipeUiBusy: boolean;
  waveButtonAnimating: boolean;
  dragX: MotionValue<number>;
  dragY: MotionValue<number>;
  dragRotate: MotionValue<number>;
  dragScale: MotionValue<number>;
  nextCardScale: MotionValue<number>;
  nextCardTranslateY: MotionValue<number>;
  stampCounterRotate: MotionValue<number>;
  waveIndicatorOpacity: MotionValue<number>;
  passIndicatorOpacity: MotionValue<number>;
  waveIndicatorScale: MotionValue<number>;
  passIndicatorScale: MotionValue<number>;
  waveIndicatorX: MotionValue<number>;
  waveIndicatorY: MotionValue<number>;
  passIndicatorX: MotionValue<number>;
  passIndicatorY: MotionValue<number>;
  waveTintOpacity: MotionValue<number>;
  passTintOpacity: MotionValue<number>;
  onOpenLocationSettings: () => void;
  onExpandSearch: () => void;
  onResurfacePassedProfiles: () => void;
  onWaveFromButton: () => Promise<void> | void;
  onSwipeRight: (target: DiscoveryDeckProfile, velocityX?: number) => Promise<boolean>;
  onSwipeLeft: (target: DiscoveryDeckProfile, velocityX?: number) => Promise<boolean>;
  onPromptStar: (target: DiscoveryDeckProfile) => void;
  onProfileTap: (userId: string, displayName: string, avatarUrl?: string | null) => Promise<void> | void;
  onSpringCardHome: () => Promise<void>;
  onDecodeProfileReady: (profileId: string) => void;
  getDiscoveryAlbum: (profileRow?: DiscoveryDeckProfile | null) => string[];
  getDiscoverySpeciesSummary: (profileRow: DiscoveryDeckProfile) => string;
  getDiscoveryAvailabilityPills: (profileRow: DiscoveryDeckProfile) => string[];
};

const DiscoveryDeckInner = ({
  stackedDiscoveryCards,
  currentDiscovery,
  discoveryLoading,
  discoveryLocationBlocked,
  renderDiscoverEmpty,
  canExpandSearch,
  discoveryExpandStepKm,
  passedDiscoveryCount,
  showDiscoveryQuotaLock,
  discoverExhaustedCopy,
  emptyChatImage,
  profilePlaceholder,
  swipeUiBusy,
  waveButtonAnimating,
  dragX,
  dragY,
  dragRotate,
  dragScale,
  nextCardScale,
  nextCardTranslateY,
  stampCounterRotate,
  waveIndicatorOpacity,
  passIndicatorOpacity,
  waveIndicatorScale,
  passIndicatorScale,
  waveIndicatorX,
  waveIndicatorY,
  passIndicatorX,
  passIndicatorY,
  waveTintOpacity,
  passTintOpacity,
  onOpenLocationSettings,
  onExpandSearch,
  onResurfacePassedProfiles,
  onWaveFromButton,
  onSwipeRight,
  onSwipeLeft,
  onPromptStar,
  onProfileTap,
  onSpringCardHome,
  onDecodeProfileReady,
  getDiscoveryAlbum,
  getDiscoverySpeciesSummary,
  getDiscoveryAvailabilityPills,
}: DiscoveryDeckProps) => {
  const [discoverImageIndex, setDiscoverImageIndex] = useState(0);
  const [discoveryUseSideActions, setDiscoveryUseSideActions] = useState(false);
  const [isDiscoverDragging, setIsDiscoverDragging] = useState(false);
  const discoveryScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const discoveryCardStackRef = useRef<HTMLDivElement | null>(null);
  const discoveryBottomActionsRef = useRef<HTMLDivElement | null>(null);
  const discoveryVisibleBottomActionsRef = useRef<HTMLDivElement | null>(null);
  const discoverImageInteractingRef = useRef(false);
  const awaitingFirstDragFrameRef = useRef(false);
  const decodedProfileIdsRef = useRef<Set<string>>(new Set());

  const CTA_VISUAL_SHADOW_ALLOWANCE = 14;
  const NAV_PROTECTED_PADDING = 12;
  const SIDE_ACTION_ENTER_GAP = 0;
  const SIDE_ACTION_EXIT_GAP = 12;

  useEffect(() => {
    setDiscoverImageIndex(0);
    setIsDiscoverDragging(false);
  }, [currentDiscovery?.id]);

  useMotionValueEvent(dragX, "change", (latest) => {
    if (!awaitingFirstDragFrameRef.current) return;
    if (Math.abs(latest) < 1) return;
    awaitingFirstDragFrameRef.current = false;
    noteDiscoveryFirstDragFrame();
  });

  useLayoutEffect(() => {
    if (renderDiscoverEmpty || discoveryLocationBlocked) {
      setDiscoveryUseSideActions(false);
      return;
    }
    const trayNode = discoveryVisibleBottomActionsRef.current ?? discoveryBottomActionsRef.current;
    const navNode = document.querySelector('[data-bottom-nav="true"]') as HTMLElement | null;
    const scrollNode = discoveryScrollContainerRef.current;
    const stackNode = discoveryCardStackRef.current;
    if (!trayNode || !navNode || !scrollNode || !stackNode) {
      setDiscoveryUseSideActions(false);
      return;
    }

    let frameId = 0;
    const measure = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const trayRect = trayNode.getBoundingClientRect();
        const navRect = navNode.getBoundingClientRect();
        const protectedNavTop = navRect.top - NAV_PROTECTED_PADDING;
        const ctaVisualBottom = trayRect.bottom + CTA_VISUAL_SHADOW_ALLOWANCE;
        const effectiveGap = protectedNavTop - ctaVisualBottom;

        setDiscoveryUseSideActions((current) => {
          if (current) {
            return effectiveGap <= SIDE_ACTION_EXIT_GAP;
          }
          return effectiveGap < SIDE_ACTION_ENTER_GAP;
        });
      });
    };

    measure();

    const resizeObserver = new ResizeObserver(() => {
      measure();
    });
    resizeObserver.observe(trayNode);
    resizeObserver.observe(navNode);
    resizeObserver.observe(stackNode);
    window.addEventListener("resize", measure);
    scrollNode.addEventListener("scroll", measure, { passive: true });
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
      scrollNode.removeEventListener("scroll", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [currentDiscovery?.id, discoveryLocationBlocked, renderDiscoverEmpty, stackedDiscoveryCards.length]);

  const stackedProfileKey = useMemo(
    () => stackedDiscoveryCards.map((profile) => profile.id).join("|"),
    [stackedDiscoveryCards]
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      stackedDiscoveryCards.slice(0, 2).map(async (profile) => {
        if (decodedProfileIdsRef.current.has(profile.id)) return;
        const album = getDiscoveryAlbum(profile);
        const src = album[0] || profile.avatar_url || profilePlaceholder;
        if (!src) return;
        try {
          const image = new Image();
          image.src = src;
          if (typeof image.decode === "function") {
            await image.decode();
          } else {
            await new Promise<void>((resolve) => {
              image.onload = () => resolve();
              image.onerror = () => resolve();
            });
          }
        } finally {
          if (!cancelled) {
            decodedProfileIdsRef.current.add(profile.id);
            onDecodeProfileReady(profile.id);
          }
        }
      })
    );
    return () => {
      cancelled = true;
    };
  }, [getDiscoveryAlbum, onDecodeProfileReady, profilePlaceholder, stackedProfileKey, stackedDiscoveryCards]);

  useLayoutEffect(() => {
    const nextProfileId = currentDiscovery?.id ?? null;
    if (!nextProfileId) return;
    window.requestAnimationFrame(() => {
      noteDiscoveryPromotionPaint(nextProfileId);
    });
  }, [currentDiscovery?.id]);

  const renderDiscoveryActionButtons = (mode: "bottom" | "side") => (
    <div className={cn("flex items-center", mode === "side" && "flex-col gap-3")}>
      <motion.button
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full border border-white/80 bg-[rgba(255,255,255,0.97)] text-[#D94B5A] shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_10px_24px_rgba(33,71,201,0.12)] backdrop-blur-[14px] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]",
          swipeUiBusy && "cursor-not-allowed opacity-45"
        )}
        aria-label="Skip"
        disabled={swipeUiBusy}
        whileTap={{ scale: 0.9 }}
        onClick={(event) => {
          event.stopPropagation();
          if (!currentDiscovery) return;
          void onSwipeLeft(currentDiscovery, 0);
        }}
      >
        <motion.div whileTap={{ scale: 0.84 }} transition={{ duration: 0.2 }}>
          <X size={22} strokeWidth={2} />
        </motion.div>
      </motion.button>
      {mode === "bottom" ? <div className="w-4" /> : null}
      <motion.button
        className={cn(
          "group flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(33,71,201,0.98)] shadow-[0_14px_28px_rgba(33,71,201,0.28)] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]",
          (showDiscoveryQuotaLock || swipeUiBusy) && "cursor-not-allowed opacity-45"
        )}
        aria-label="Wave"
        disabled={showDiscoveryQuotaLock || swipeUiBusy}
        whileTap={{ scale: 0.88 }}
        onClick={(event) => {
          event.stopPropagation();
          void onWaveFromButton();
        }}
      >
        <motion.div
          animate={waveButtonAnimating ? { rotate: [0, -18, 12, -8, 5, 0] } : { rotate: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <WaveHandIcon size={40} className="drop-shadow-[0_8px_18px_rgba(7,24,108,0.22)]" />
        </motion.div>
      </motion.button>
      {mode === "bottom" ? <div className="w-3" /> : null}
      <motion.button
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full border border-white/80 bg-[rgba(255,255,255,0.97)] text-[#F5C85C] shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_10px_24px_rgba(33,71,201,0.12)] backdrop-blur-[14px] transition-transform duration-150 hover:scale-[1.05] active:scale-[0.96]",
          (showDiscoveryQuotaLock || swipeUiBusy) && "cursor-not-allowed opacity-45"
        )}
        aria-label="Star"
        disabled={showDiscoveryQuotaLock || swipeUiBusy}
        whileTap={{ scale: 0.92 }}
        onClick={(event) => {
          event.stopPropagation();
          if (!currentDiscovery) return;
          onPromptStar(currentDiscovery);
        }}
      >
        <Star size={26} fill="currentColor" stroke="currentColor" strokeWidth={1.8} />
      </motion.button>
    </div>
  );

  const renderDiscoveryProfileCard = (profile: DiscoveryDeckProfile, deckIndex: number) => {
    const isActive = deckIndex === 0;
    const isImmediateNext = deckIndex === 1;
    const isDeferredCard = deckIndex >= 2;
    const availabilityPills = getDiscoveryAvailabilityPills(profile);
    const speciesSummary = getDiscoverySpeciesSummary(profile);
    const album = getDiscoveryAlbum(profile);
    const cover = album[0] || profilePlaceholder;
    const stackedOffsetY = deckIndex === 1 ? 0 : deckIndex === 2 ? 8 : 14;
    const stackedScale = deckIndex === 1 ? 1 : deckIndex === 2 ? 0.985 : 0.97;
    const stackedOpacity = deckIndex <= 1 ? 1 : 0;
    const cardStyle = isActive
      ? { x: dragX, y: dragY, rotate: dragRotate, scale: dragScale, transformOrigin: "50% 20%" as const, willChange: "transform" as const }
      : isImmediateNext
        ? { y: nextCardTranslateY, scale: nextCardScale, transformOrigin: "50% 100%" as const }
        : { transformOrigin: "50% 100%" as const };
    const cardInitial = isActive
      ? false as const
      : isImmediateNext
        ? { x: 0, y: 8, scale: 0.95, rotate: 0, opacity: 1 }
        : { x: 0, y: stackedOffsetY, scale: stackedScale, rotate: 0, opacity: stackedOpacity };
    const cardAnimate = isActive
      ? { opacity: 1 }
      : isImmediateNext
        ? { opacity: 1 }
        : { y: stackedOffsetY, scale: stackedScale, opacity: stackedOpacity };
    const mediaSources = isActive || isImmediateNext ? (album.length > 0 ? album : [cover]) : [cover];

    return (
      <motion.div
        key={profile.id}
        drag={isActive ? true : false}
        dragConstraints={isActive ? { left: 0, right: 0, top: 30, bottom: 30 } : undefined}
        dragElastic={isActive ? 0.15 : undefined}
        dragMomentum={false}
        initial={cardInitial}
        style={cardStyle}
        animate={isActive ? { opacity: 1 } : cardAnimate}
        transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.92 }}
        className={cn(
          "absolute inset-0 overflow-visible rounded-[28px] bg-white shadow-[0_26px_56px_rgba(33,71,201,0.16)]",
          isActive ? "z-20" : isImmediateNext ? "z-[12]" : "z-[9]",
          !isActive && "pointer-events-none",
          isActive && swipeUiBusy && "pointer-events-none"
        )}
        onPointerDown={
          isActive
            ? () => {
                awaitingFirstDragFrameRef.current = true;
                noteDiscoveryPointerDown();
              }
            : undefined
        }
        onDragStart={
          isActive
            ? () => {
                if (swipeUiBusy) return;
                setIsDiscoverDragging(true);
              }
            : undefined
        }
        onDragEnd={
          isActive
            ? (_, info) => {
                if (swipeUiBusy) return;
                if (Math.abs(info.offset.x) < 5 && Math.abs(info.offset.y) < 5) {
                  setIsDiscoverDragging(false);
                  return;
                }
                if (info.offset.x >= 110 || (info.velocity.x >= 500 && info.offset.x > -24)) {
                  void onSwipeRight(profile, info.velocity.x).finally(() => setIsDiscoverDragging(false));
                  return;
                }
                if (info.offset.x <= -110 || (info.velocity.x <= -500 && info.offset.x < 24)) {
                  void onSwipeLeft(profile, info.velocity.x).finally(() => setIsDiscoverDragging(false));
                  return;
                }
                void onSpringCardHome().finally(() => setIsDiscoverDragging(false));
              }
            : undefined
        }
        onClick={
          isActive
            ? () => {
                if (swipeUiBusy) return;
                if (Math.abs(dragY.get()) > 8 || Math.abs(dragX.get()) > 8) return;
                if (discoverImageInteractingRef.current) return;
                void onProfileTap(profile.id, profile.display_name || "User", profile.avatar_url || null);
              }
            : undefined
        }
      >
        {isActive && showDiscoveryQuotaLock && (
          <div className="absolute inset-0 z-30 flex items-center justify-center px-6">
            <div className="w-full rounded-[26px] border border-white/35 bg-white/20 px-5 py-4 text-center shadow-[0_14px_40px_rgba(7,24,108,0.2)] backdrop-blur-[18px]">
              <p className="text-sm font-semibold text-white">{discoverExhaustedCopy}</p>
            </div>
          </div>
        )}
        <div className="h-full w-full overflow-hidden rounded-[28px] [clip-path:inset(0_round_28px)]">
          {mediaSources.length > 1 && isActive ? (
            <>
              <div
                className="absolute inset-0 flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden touch-pan-x"
                onPointerDown={() => {
                  discoverImageInteractingRef.current = false;
                }}
                onPointerMove={() => {
                  discoverImageInteractingRef.current = true;
                }}
                onPointerUp={() => {
                  window.setTimeout(() => {
                    discoverImageInteractingRef.current = false;
                  }, 100);
                }}
                onPointerCancel={() => {
                  discoverImageInteractingRef.current = false;
                }}
                onScroll={(event) => {
                  const node = event.currentTarget;
                  if (!node.clientWidth) return;
                  const idx = Math.round(node.scrollLeft / node.clientWidth);
                  setDiscoverImageIndex(Math.max(0, Math.min(mediaSources.length - 1, idx)));
                }}
              >
                {mediaSources.map((src, index) => (
                  <div key={`${profile.id}-album-${index}`} className="h-full w-full shrink-0 snap-start">
                    <img
                      src={src}
                      alt={`${profile.display_name || "User"} ${index + 1}`}
                      className="h-full w-full object-cover object-center"
                      style={{ objectPosition: "center center" }}
                      loading={index === 0 ? "eager" : "lazy"}
                      decoding="async"
                      fetchPriority={index === 0 ? "high" : "auto"}
                      onError={(event) => {
                        (event.currentTarget as HTMLImageElement).src = cover;
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex items-center justify-center gap-1.5">
                {mediaSources.map((_, idx) => (
                  <span
                    key={`${profile.id}-img-dot-${idx}`}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      idx === discoverImageIndex ? "w-4 bg-[#7D86A6]" : "w-1.5 bg-[#B8BED2]/85"
                    )}
                  />
                ))}
              </div>
            </>
          ) : (
            <img
              src={mediaSources[0] || cover}
              alt={isActive ? profile.display_name || "" : ""}
              aria-hidden={isActive ? undefined : true}
              className="h-full w-full object-cover object-center"
              style={{ objectPosition: "center center" }}
              loading={deckIndex < 2 ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={deckIndex < 2 ? "high" : "auto"}
              onError={(event) => {
                (event.currentTarget as HTMLImageElement).src = profilePlaceholder;
              }}
            />
          )}
          {isActive && (
            <>
              <motion.div className="absolute inset-0 bg-[rgba(33,71,201,0.96)]" style={{ opacity: waveTintOpacity }} />
              <motion.div className="absolute inset-0 bg-[rgba(233,76,92,0.95)]" style={{ opacity: passTintOpacity }} />
            </>
          )}
          {isActive && (
            <>
              <motion.div
                className="pointer-events-none absolute right-4 top-4 z-[18] flex items-center gap-2 rounded-[16px] border-2 border-[#2147C9] bg-white/92 px-3 py-2 text-[#2147C9] shadow-[0_10px_24px_rgba(33,71,201,0.14)]"
                style={{ opacity: waveIndicatorOpacity, scale: waveIndicatorScale, rotate: stampCounterRotate, x: waveIndicatorX, y: waveIndicatorY }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M8.5 3.5a1.5 1.5 0 0 1 3 0v6m0-6a1.5 1.5 0 0 1 3 0v5m0-4a1.5 1.5 0 0 1 3 0v7l-1 4c-.5 2-2.2 3.5-4.5 3.5h-1c-2 0-3.8-1-4.8-2.7L4 13.5c-.6-1 0-2.3 1.1-2.5 1-.2 2 .3 2.4 1.2L8.5 14V3.5z" stroke="#2147C9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M6 3C5 3.8 4.3 5 4 6.5M18.5 3c1 .8 1.7 2 2 3.5" stroke="#2147C9" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                <span className="text-[13px] font-extrabold tracking-[0.18em]">WAVE</span>
              </motion.div>
              <motion.div
                className="pointer-events-none absolute right-4 top-4 z-[18] flex items-center gap-2 rounded-[16px] border-2 border-[#E94C5C] bg-white/92 px-3 py-2 text-[#E94C5C] shadow-[0_10px_24px_rgba(233,76,92,0.14)]"
                style={{ opacity: passIndicatorOpacity, scale: passIndicatorScale, rotate: stampCounterRotate, x: passIndicatorX, y: passIndicatorY }}
              >
                <span className="text-[13px] font-extrabold tracking-[0.18em]">SKIP</span>
                <X size={18} strokeWidth={2.2} />
              </motion.div>
            </>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[34%] bg-[linear-gradient(180deg,rgba(9,21,95,0)_0%,rgba(9,21,95,0.82)_100%)]" />
          <div className="absolute left-4 top-4">
            <ProfileBadges isVerified={profile.is_verified === true} hasCar={!!profile.has_car} size="lg" />
          </div>
          {isActive && discoveryUseSideActions && !isDiscoverDragging && !swipeUiBusy && !showDiscoveryQuotaLock && (
            <div className="absolute right-4 top-4 z-[19]">
              {renderDiscoveryActionButtons("side")}
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-4 bottom-5">
            <div className="relative overflow-hidden rounded-[28px] border border-[rgba(255,255,255,0.38)] shadow-[0_14px_48px_rgba(0,0,0,0.16)] backdrop-blur-[22px]">
              <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.58)_0%,rgba(255,255,255,0.48)_22%,rgba(33,69,207,0.48)_38%,rgba(33,69,207,0.42)_100%)]" />
              {availabilityPills.length > 0 && (
                <div className="absolute inset-x-0 top-0 z-10 flex h-[40px] items-center rounded-t-[27px] bg-[linear-gradient(to_bottom,rgba(255,255,255,0.58)_0%,rgba(255,255,255,0.48)_100%)] px-4">
                  <span className="block min-w-0 truncate text-[12px] font-semibold leading-[1] text-[#1F1F1F]">
                    {availabilityPills.join(" • ")}
                  </span>
                </div>
              )}
              <div className={cn("relative z-10 flex items-end gap-3 px-4 pb-3", availabilityPills.length > 0 ? "pt-[46px]" : "pt-3")}>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="truncate text-[25px] font-[700] leading-tight text-white">{profile.display_name}</span>
                  </div>
                  {profile.location_name && (
                    <div className="mb-2 flex items-center gap-1.5 py-[1px]">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-white/90" strokeWidth={1.9} />
                      <span className="truncate text-[12px] font-medium leading-[1.2] text-white/90">{profile.location_name}</span>
                    </div>
                  )}
                  {speciesSummary && (
                    <div className="mt-0.5 flex items-center gap-1.5 py-0">
                      <PawPrint className="h-3.5 w-3.5 flex-shrink-0 text-white/90" strokeWidth={1.9} />
                      <span className="truncate text-[12px] font-medium leading-[1.1] text-white/90">{speciesSummary}</span>
                    </div>
                  )}
                </div>
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(33,71,201,0.92)] text-white shadow-[0_10px_24px_rgba(33,71,201,0.35)]">
                  <ArrowUpRight className="h-5 w-5" strokeWidth={2} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <Profiler id="DiscoveryDeck" onRender={noteDiscoveryDeckRender}>
      <div
        ref={discoveryScrollContainerRef}
        className="flex-1 min-h-0 flex flex-col overflow-y-auto touch-pan-y pb-[calc(var(--nav-height)+env(safe-area-inset-bottom,0px)+110px)] transition-all duration-300"
      >
        <div className="px-4 pt-2 pb-0 flex items-start justify-center flex-none">
          <div ref={discoveryCardStackRef} className="relative w-full max-w-[388px] pb-[11%] sm:pb-[17%] md:pb-[24%]">
            <div className="relative h-[clamp(438px,64vh,608px)] w-full overflow-visible">
              {currentDiscovery && !renderDiscoverEmpty && (
                <motion.div aria-hidden="true" className="absolute z-0 left-1/2 bottom-[-8.8%] h-[14.5%] w-full -translate-x-1/2 rounded-[22px] bg-[rgba(79,86,119,0.14)] shadow-[0_4px_8px_rgba(0,0,255,0.10)]" style={{ transform: "translateX(-50%) scaleX(0.74)" }} />
              )}
              {currentDiscovery && !renderDiscoverEmpty && (
                <motion.div aria-hidden="true" className="absolute z-[1] left-1/2 bottom-[-6.1%] h-[14.5%] w-full -translate-x-1/2 rounded-[22px] bg-[rgba(33,71,201,0.34)] shadow-[0_4px_8px_rgba(0,0,255,0.10)]" style={{ transform: "translateX(-50%) scaleX(0.83)" }} />
              )}
              {currentDiscovery && !renderDiscoverEmpty && (
                <motion.div aria-hidden="true" className="absolute z-[2] left-1/2 bottom-[-3.6%] h-[14.5%] w-full -translate-x-1/2 rounded-[22px] bg-[rgba(33,71,201,0.60)] shadow-[0_4px_8px_rgba(0,0,255,0.10)]" style={{ transform: "translateX(-50%) scaleX(0.91)" }} />
              )}
              {currentDiscovery && !renderDiscoverEmpty && (
                <motion.div aria-hidden="true" className="absolute z-[3] left-1/2 bottom-[-1.1%] h-[11.5%] w-full -translate-x-1/2 rounded-[20px] bg-[rgba(17,37,126,0.84)] shadow-[0_6px_14px_rgba(7,24,108,0.16)]" style={{ transform: "translateX(-50%) scaleX(0.952)" }} />
              )}
              {discoveryLoading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-[28px] bg-slate-100/60">
                  <HuddleVideoLoader size={32} />
                </div>
              )}
              {discoveryLocationBlocked && (
                <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                  <div className="glass-nav w-full rounded-[28px] border border-white/55 bg-white/24 px-6 py-6 shadow-[0_16px_32px_rgba(33,71,201,0.12)]">
                    <p className="text-sm text-muted-foreground">Enable location to discover people nearby.</p>
                    <button onClick={onOpenLocationSettings} className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-[rgba(33,71,201,0.92)] px-5 text-xs font-semibold text-white shadow-[0_10px_22px_rgba(33,71,201,0.24)]">
                      Open Location Settings
                    </button>
                  </div>
                </div>
              )}
              {renderDiscoverEmpty && (
                <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                  <div className="glass-nav w-full rounded-[30px] border border-white/55 bg-white/24 px-6 py-7 shadow-[0_18px_40px_rgba(33,71,201,0.14)]">
                    <img src={emptyChatImage} alt="" aria-hidden="true" className="mx-auto mb-4 w-full max-w-[320px] object-contain opacity-95" loading="lazy" />
                    <p className="text-base font-semibold text-[#4F5677]">All caught up!</p>
                    <div className="mt-4 flex flex-col gap-2">
                      {canExpandSearch && (
                        <button className="inline-flex h-11 items-center justify-center rounded-full bg-[rgba(33,71,201,0.92)] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(33,71,201,0.24)]" onClick={onExpandSearch}>
                          {`Expand Search +${discoveryExpandStepKm}km`}
                        </button>
                      )}
                      {passedDiscoveryCount > 0 && (
                        <button className="inline-flex h-11 items-center justify-center rounded-full bg-white/75 px-5 text-sm font-semibold text-[#4F5677] shadow-[0_8px_20px_rgba(33,71,201,0.12)]" onClick={onResurfacePassedProfiles}>
                          Resurface Skipped Profiles
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {stackedDiscoveryCards
                .slice()
                .reverse()
                .map((profile, reversedIndex) => renderDiscoveryProfileCard(profile, stackedDiscoveryCards.length - 1 - reversedIndex))}
            </div>
          </div>
        </div>
        <div className="relative mt-1 px-4 pb-[calc(var(--nav-height)+env(safe-area-inset-bottom,0px)+8px)] flex-shrink-0 min-h-[92px]">
          <div ref={discoveryBottomActionsRef} aria-hidden="true" className="pointer-events-none invisible absolute left-1/2 top-0 -translate-x-1/2">
            <div className="flex w-fit items-center rounded-full border border-white/55 bg-[rgba(255,255,255,0.82)] px-4 py-3 shadow-[0_18px_36px_rgba(33,71,201,0.16)] backdrop-blur-[20px]">
              {renderDiscoveryActionButtons("bottom")}
            </div>
          </div>
          {renderDiscoverEmpty ? <div /> : !discoveryUseSideActions && !isDiscoverDragging ? (
            <div ref={discoveryVisibleBottomActionsRef} className="mx-auto flex w-fit items-center rounded-full border border-white/55 bg-[rgba(255,255,255,0.82)] px-4 py-3 shadow-[0_18px_36px_rgba(33,71,201,0.16)] backdrop-blur-[20px]">
              {renderDiscoveryActionButtons("bottom")}
            </div>
          ) : <div />}
        </div>
      </div>
    </Profiler>
  );
};

export const DiscoveryDeck = memo(DiscoveryDeckInner);
