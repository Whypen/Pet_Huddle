import { useEffect, useRef, useState } from "react";
import { PenSquare } from "lucide-react";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { NoticeBoard } from "@/components/social/NoticeBoard";
import { useUpsell } from "@/hooks/useUpsell";
import { UpsellModal } from "@/components/monetization/UpsellModal";

const Social = () => {
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const { upsellModal, closeUpsellModal, buyAddOn } = useUpsell();
  const [composeSignal, setComposeSignal] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [hideComposeFab, setHideComposeFab] = useState(false);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;

    const updateFabVisibility = () => {
      const isScrollable = node.scrollHeight > node.clientHeight + 8;
      if (!isScrollable) {
        setHideComposeFab(false);
        return;
      }
      const distanceToBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
      setHideComposeFab(distanceToBottom < 220);
    };

    updateFabVisibility();
    node.addEventListener("scroll", updateFabVisibility, { passive: true });
    return () => node.removeEventListener("scroll", updateFabVisibility);
  }, []);

  return (
    <div className="h-full min-h-0 relative overflow-x-hidden flex flex-col">
      <GlobalHeader />

      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto touch-pan-y">
        <div className="pt-4 px-4 pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+20px)]">
          <NoticeBoard
            onPremiumClick={() => setIsPremiumOpen(true)}
            composeSignal={composeSignal}
            scrollContainerRef={scrollContainerRef}
          />
        </div>
      </div>

      <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />
      <UpsellModal
        isOpen={upsellModal.isOpen}
        type={upsellModal.type}
        title={upsellModal.title}
        description={upsellModal.description}
        price={upsellModal.price}
        onClose={closeUpsellModal}
        onBuy={() => buyAddOn(upsellModal.type)}
      />

      {/* Compose FAB */}
      <button
        className={`fixed right-5 bottom-[calc(64px+env(safe-area-inset-bottom)+35px)] z-30 h-14 w-14 rounded-full border border-white/40 bg-white/30 shadow-md backdrop-blur-md flex items-center justify-center transition-all duration-200 ${hideComposeFab ? "pointer-events-none opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}
        aria-label="Compose post"
        onClick={() => setComposeSignal((prev) => prev + 1)}
      >
        <PenSquare size={20} strokeWidth={1.75} className="text-[var(--text-secondary)]" />
      </button>
    </div>
  );
};

export default Social;
