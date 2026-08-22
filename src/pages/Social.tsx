import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, Check, Search } from "lucide-react";
import { useLocation } from "react-router-dom";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { NoticeBoard, type SocialSortMode } from "@/components/social/NoticeBoard";
import { useUpsell } from "@/hooks/useUpsell";
import { UpsellModal } from "@/components/monetization/UpsellModal";
import type { SocialSection } from "@/components/social/socialSections";
import { ExpandableSearchField } from "@/components/ui/ExpandableSearchField";

const Social = () => {
  const { upsellModal, closeUpsellModal, buyAddOn } = useUpsell();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<SocialSection | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SocialSortMode>("Latest");
  const [mobileControl, setMobileControl] = useState<"search" | "sort" | null>(null);
  const location = useLocation();
  const [composeSignal, setComposeSignal] = useState(0);

  useEffect(() => {
    if (new URLSearchParams(location.search).get("compose") === "1") {
      setComposeSignal((current) => current + 1);
    }
  }, [location.key, location.search]);

  return (
    <div className="h-full min-h-0 relative overflow-x-hidden flex flex-col">
      <GlobalHeader
        desktopRail
        accountLeadingActions={
          <div className="flex items-center gap-0">
            <button
              type="button"
              aria-label="Search"
              aria-expanded={mobileControl === "search"}
              onClick={() => setMobileControl((current) => current === "search" ? null : "search")}
              className="grid h-11 w-11 place-items-center rounded-full text-brandText hover:bg-muted"
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Sort"
              aria-expanded={mobileControl === "sort"}
              onClick={() => setMobileControl((current) => current === "sort" ? null : "sort")}
              className="grid h-11 w-11 place-items-center rounded-full text-brandText hover:bg-muted"
            >
              <ArrowDownUp className="h-5 w-5" />
            </button>
          </div>
        }
      />

      {mobileControl ? (
        <div className="border-b border-border/60 bg-background px-4 py-2">
          {mobileControl === "search" ? (
            <ExpandableSearchField value={searchQuery} onChange={setSearchQuery} onClose={() => setMobileControl(null)} label="Search social posts" />
          ) : (
            <div className="mx-auto max-w-[320px] rounded-[14px] border border-border bg-background p-1.5 shadow-lg" role="menu" aria-label="Sort social posts">
              {(["Latest", "Trending", "Saves"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={sortMode === option}
                  onClick={() => { setSortMode(option); setMobileControl(null); }}
                  className={sortMode === option ? "flex h-10 w-full items-center justify-between rounded-[10px] bg-brandBlue/[0.08] px-3 text-[13px] font-bold text-brandBlue" : "flex h-10 w-full items-center justify-between rounded-[10px] px-3 text-[13px] font-semibold text-brandText hover:bg-muted"}
                >
                  {option}
                  {sortMode === option ? <Check className="h-4 w-4" aria-hidden /> : null}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto touch-pan-y">
        <div className="mx-auto w-full px-4 pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+20px)] pt-4 lg:px-8 2xl:px-12">
          <main className="min-w-0">
            <NoticeBoard
              composeSignal={composeSignal}
              scrollContainerRef={scrollContainerRef}
              selectedTopic={selectedTopic}
              onSelectedTopicChange={setSelectedTopic}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              sortMode={sortMode}
              onSortModeChange={setSortMode}
            />
          </main>
        </div>
      </div>

      <UpsellModal
        isOpen={upsellModal.isOpen}
        type={upsellModal.type}
        title={upsellModal.title}
        description={upsellModal.description}
        price={upsellModal.price}
        onClose={closeUpsellModal}
        onBuy={() => buyAddOn(upsellModal.type)}
      />
    </div>
  );
};

export default Social;
