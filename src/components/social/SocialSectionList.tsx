import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SOCIAL_SECTIONS, type SocialSection } from "@/components/social/socialSections";

type SocialSectionListProps = {
  selected: SocialSection | null;
  onSelect: (section: SocialSection | null) => void;
  className?: string;
};

export const SocialSectionList = ({ selected, onSelect, className }: SocialSectionListProps) => {
  const railRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const dragRef = useRef<{ pointerId: number; startX: number; scrollLeft: number; moved: boolean } | null>(null);
  const [overflowEdges, setOverflowEdges] = useState({ left: false, right: false });

  const syncOverflowEdges = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const next = {
      left: rail.scrollLeft > 2,
      right: rail.scrollLeft < maxScrollLeft - 2,
    };
    setOverflowEdges((current) => (
      current.left === next.left && current.right === next.right ? current : next
    ));
  }, []);

  useEffect(() => {
    syncOverflowEdges();
    const rail = railRef.current;
    if (!rail || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(syncOverflowEdges);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [syncOverflowEdges]);

  useEffect(() => {
    const rail = railRef.current;
    const active = tabRefs.current[selected ?? "All"];
    if (!rail || !active) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    const viewportLeft = rail.scrollLeft;
    const viewportRight = viewportLeft + rail.clientWidth;
    if (left < viewportLeft) rail.scrollTo({ left, behavior: "smooth" });
    else if (right > viewportRight) rail.scrollTo({ left: right - rail.clientWidth, behavior: "smooth" });
  }, [selected]);

  return (
    <div className="relative w-full">
      <nav
        ref={railRef}
        aria-label="Social topics"
        className={cn(
          "flex h-12 w-full touch-pan-x items-stretch gap-5 overflow-x-auto overscroll-x-contain border-b border-border/60 scrollbar-hide",
          className,
        )}
        onScroll={syncOverflowEdges}
        onPointerDown={(event) => {
          // Touch and pen must keep the browser's native horizontal scrolling
          // and click synthesis. Pointer capture here made normal mobile taps
          // look like drags and prevented topic selection.
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          const rail = railRef.current;
          if (!rail) return;
          dragRef.current = { pointerId: event.pointerId, startX: event.clientX, scrollLeft: rail.scrollLeft, moved: false };
          rail.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const rail = railRef.current;
          const drag = dragRef.current;
          if (!rail || !drag || drag.pointerId !== event.pointerId) return;
          const delta = event.clientX - drag.startX;
          if (Math.abs(delta) > 4) drag.moved = true;
          rail.scrollLeft = drag.scrollLeft - delta;
          syncOverflowEdges();
        }}
        onPointerUp={(event) => {
          const rail = railRef.current;
          if (rail?.hasPointerCapture?.(event.pointerId)) rail.releasePointerCapture?.(event.pointerId);
          window.setTimeout(() => { dragRef.current = null; }, 0);
        }}
        onPointerCancel={() => { dragRef.current = null; }}
      >
        {[null, ...SOCIAL_SECTIONS].map((section) => {
          const active = selected === section;
          const label = section ?? "All";
          return (
            <button
              ref={(node) => { tabRefs.current[label] = node; }}
              key={label}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => { if (!dragRef.current?.moved) onSelect(section); }}
              className={cn(
                "relative flex h-12 min-w-11 shrink-0 items-center justify-center px-1 text-[14px] transition-colors",
                active
                  ? "font-extrabold text-brandText"
                  : "font-semibold text-muted-foreground hover:text-brandText",
              )}
            >
              {active ? <span aria-hidden className="absolute bottom-0 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-brandBlue" /> : null}
              {label}
            </button>
          );
        })}
      </nav>
      {overflowEdges.left ? (
        <span data-testid="topic-overflow-left" aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background via-background/80 to-transparent" />
      ) : null}
      {overflowEdges.right ? (
        <span data-testid="topic-overflow-right" aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background via-background/80 to-transparent" />
      ) : null}
    </div>
  );
};

export default SocialSectionList;
