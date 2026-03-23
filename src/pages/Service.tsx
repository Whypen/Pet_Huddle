import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Filter, Loader2, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { toast } from "sonner";
import { CarerPolaroidCard } from "@/components/service/CarerPolaroidCard";
import { PublicCarerProfileModal } from "@/components/service/PublicCarerProfileModal";
import { ServiceDateSheet } from "@/components/service/ServiceDateSheet";
import { ServiceFilterSheet } from "@/components/service/ServiceFilterSheet";
import { ServiceMultiDropdown } from "@/components/service/ServiceMultiDropdown";
import { ServiceSkeleton } from "@/components/service/ServiceSkeleton";
import { ServiceSortDropdown } from "@/components/service/ServiceSortDropdown";
import { filterAndSortProviders, type ServiceFilterState } from "@/components/service/filterProviders";
import { useServiceProviders } from "@/hooks/useServiceProviders";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_FILTERS: ServiceFilterState = {
  search: "",
  serviceTypes: [],
  selectedWeekdays: [],
  bookmarkedOnly: false,
  verifiedLicensedOnly: false,
  emergencyReadyOnly: false,
  petTypes: [],
  dogSizes: [],
  locationStyles: [],
  sort: "proximity",
};

const Service = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [proximityAnchor, setProximityAnchor] = useState<{ lat: number; lng: number } | null>(null);
  const { providers, loading, error, toggleBookmark, refresh } = useServiceProviders(proximityAnchor);
  const [filters, setFilters] = useState<ServiceFilterState>(DEFAULT_FILTERS);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isDateOpen, setIsDateOpen] = useState(false);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [deckCompressed, setDeckCompressed] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [pullOffset, setPullOffset] = useState(0);
  const touchStartYRef = useRef<number | null>(null);
  const pullEligibleRef = useRef(false);
  const PULL_REFRESH_THRESHOLD = 44;

  useEffect(() => {
    let canceled = false;
    const resolveAnchor = async () => {
      if (!profile?.id) return;
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        const device = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: false, timeout: 2500, maximumAge: 300000 },
          );
        });
        if (!canceled && device) {
          setProximityAnchor(device);
          return;
        }
      }

      try {
        const { data: pin } = await supabase
          .from("pins")
          .select("lat,lng,created_at")
          .eq("user_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!canceled && pin && typeof pin.lat === "number" && typeof pin.lng === "number") {
          setProximityAnchor({ lat: pin.lat, lng: pin.lng });
          return;
        }
      } catch {
        // fallback below
      }

      if (!canceled && typeof profile.last_lat === "number" && typeof profile.last_lng === "number") {
        setProximityAnchor({ lat: profile.last_lat, lng: profile.last_lng });
      }
    };
    void resolveAnchor();
    return () => {
      canceled = true;
    };
  }, [profile?.id, profile?.last_lat, profile?.last_lng]);

  const visibleProviders = useMemo(
    () => filterAndSortProviders(providers, filters),
    [providers, filters],
  );

  const leftColumn = visibleProviders.filter((_, index) => index % 2 === 0);
  const rightColumn = visibleProviders.filter((_, index) => index % 2 === 1);

  const handleBookmark = async (providerUserId: string) => {
    try {
      await toggleBookmark(providerUserId);
    } catch (error) {
      console.error("[service.bookmark_failed]", error);
      toast.error("Unable to update bookmark right now.");
    }
  };

  const handleRequestService = useCallback(async (providerUserId: string) => {
    if (!profile?.id) {
      toast.error("Sign in required.");
      return;
    }
    if (profile?.is_verified !== true) {
      toast.error("Identity verification is required before requesting service.");
      return;
    }
    try {
      const { data, error } = await (supabase.rpc as (
        fn: string,
        params?: Record<string, unknown>
      ) => Promise<{ data: unknown; error: { message?: string } | null }>)("create_service_chat", {
        p_provider_id: providerUserId,
      });
      if (error) throw error;

      const chatId = String(data || "").trim();
      if (!chatId) {
        throw new Error("service_chat_create_returned_empty_chat_id");
      }
      setActiveProviderId(null);
      navigate(`/service-chat?room=${encodeURIComponent(chatId)}`);
    } catch (err) {
      const message = String((err as { message?: string })?.message || "");
      const details = String((err as { details?: string })?.details || "");
      const hint = String((err as { hint?: string })?.hint || "");
      const code = String((err as { code?: string })?.code || "");
      const reason = `${message} ${details} ${hint}`.toLowerCase();
      const fullMessage = [code, message, details, hint].filter(Boolean).join(" | ");
      console.error("[service.request_service_failed]", { providerUserId, code, message, details, hint, err });
      if (reason.includes("provider_not_requestable")) {
        toast.error("This provider cannot receive service requests yet.");
        return;
      }
      if (reason.includes("provider_profile_missing")) {
        toast.error("This provider profile is incomplete and can't receive requests yet.");
        return;
      }
      if (reason.includes("requester_profile_missing")) {
        toast.error("Your profile setup is incomplete. Please complete profile setup first.");
        return;
      }
      if (reason.includes("requester_not_verified")) {
        toast.error("Identity verification is required before requesting service.");
        return;
      }
      if (reason.includes("not_authenticated")) {
        toast.error("Please sign in again.");
        return;
      }
      if (reason.includes("cannot_create_service_chat_with_self")) {
        toast.error("You can't request service from yourself.");
        return;
      }
      if (reason.includes("already matched")) {
        toast.error("You already have a service chat with this provider.");
        return;
      }
      if (fullMessage) {
        toast.error(`Unable to start service chat right now. (${fullMessage})`);
        return;
      }
      toast.error("Unable to start service chat right now.");
    }
  }, [navigate, profile?.id, profile?.is_verified]);

  const triggerPullRefresh = useCallback(async () => {
    if (pullRefreshing) return;
    setPullRefreshing(true);
    try {
      await refresh();
    } catch {
      toast.error("Couldn't refresh services.");
    } finally {
      setPullRefreshing(false);
      setPullOffset(0);
      touchStartYRef.current = null;
      pullEligibleRef.current = false;
    }
  }, [pullRefreshing, refresh]);

  const handlePullStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    if ((container.scrollTop ?? 0) > 0 || pullRefreshing) {
      touchStartYRef.current = null;
      pullEligibleRef.current = false;
      return;
    }
    const touchY = event.touches[0]?.clientY;
    pullEligibleRef.current = typeof touchY === "number" && touchY >= 60;
    touchStartYRef.current = pullEligibleRef.current ? touchY : null;
  }, [pullRefreshing]);

  const handlePullMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!pullEligibleRef.current) return;
    const startY = touchStartYRef.current;
    if (startY == null) return;
    const currentY = event.touches[0]?.clientY;
    if (typeof currentY !== "number") return;
    const delta = currentY - startY;
    if (delta <= 0) {
      setPullOffset(0);
      return;
    }
    const eased = Math.min(84, delta * 0.45);
    setPullOffset(eased);
  }, []);

  const handlePullEnd = useCallback(() => {
    if (pullOffset >= PULL_REFRESH_THRESHOLD && !pullRefreshing) {
      void triggerPullRefresh();
      return;
    }
    touchStartYRef.current = null;
    pullEligibleRef.current = false;
    setPullOffset(0);
  }, [pullOffset, pullRefreshing, triggerPullRefresh]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <GlobalHeader />

      <div
        className="flex-1 overflow-y-auto"
        onScroll={(e) => setDeckCompressed(e.currentTarget.scrollTop > 20)}
        onTouchStart={handlePullStart}
        onTouchMove={handlePullMove}
        onTouchEnd={handlePullEnd}
        onTouchCancel={handlePullEnd}
      >
        <div
          className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground transition-all duration-150"
          style={{
            height: pullRefreshing ? 28 : pullOffset > 0 ? Math.max(14, Math.min(28, pullOffset * 0.55)) : 0,
            opacity: pullRefreshing || pullOffset > 0 ? 1 : 0,
          }}
        >
          <Loader2 className={pullRefreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          <span>
            {pullRefreshing
              ? "Refreshing..."
              : pullOffset >= PULL_REFRESH_THRESHOLD
                ? "Release to refresh"
                : "Pull to refresh"}
          </span>
        </div>
        <div
          className={
            deckCompressed
              ? "sticky top-0 z-20 bg-background/95 backdrop-blur-sm px-4 pb-1 pt-1 border-b border-border/60"
              : "sticky top-0 z-20 bg-background/95 backdrop-blur-sm px-4 pb-1.5 pt-1.5 border-b border-border/60"
          }
        >
          <div className="flex items-center gap-0.5">
            <div className="form-field-rest relative flex flex-1 min-w-0 items-center !h-10 !rounded-[20px] px-3">
              <Search className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" strokeWidth={1.75} />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                placeholder=""
                aria-label="Search services"
                className="field-input-core pl-2 text-sm"
              />
            </div>
            <ServiceMultiDropdown
              selected={filters.serviceTypes}
              onChange={(serviceTypes) => setFilters((prev) => ({ ...prev, serviceTypes }))}
            />
            <button
              type="button"
              onClick={() => setIsFilterOpen(true)}
              aria-label="Open filters"
              className="h-6 w-6 rounded-none text-[var(--text-tertiary)] flex items-center justify-center hover:bg-transparent shrink-0"
            >
              <Filter className="w-5 h-5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setIsDateOpen(true)}
              aria-label="Choose service date"
              className="h-6 w-6 rounded-none text-[var(--text-tertiary)] flex items-center justify-center hover:bg-transparent shrink-0"
            >
              <CalendarDays className="w-5 h-5" strokeWidth={1.75} />
            </button>
            <ServiceSortDropdown
              value={filters.sort}
              onChange={(sort) => setFilters((prev) => ({ ...prev, sort }))}
            />
          </div>
        </div>

        {loading ? (
          <ServiceSkeleton />
        ) : error ? (
          <div className="px-4 py-16 text-center text-sm text-muted-foreground">{error}</div>
        ) : visibleProviders.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-muted-foreground">No providers match these filters.</div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="px-4 pt-4 pb-28"
          >
            <div className="grid grid-cols-2 gap-x-3">
              <div className="space-y-[14px]">
                {leftColumn.map((provider) => (
                  <CarerPolaroidCard
                    key={provider.userId}
                    provider={provider}
                    onTap={() => setActiveProviderId(provider.userId)}
                    onBookmark={(event) => {
                      event.stopPropagation();
                      void handleBookmark(provider.userId);
                    }}
                  />
                ))}
              </div>
              <div className="space-y-[14px] pt-[86px]">
                {rightColumn.map((provider) => (
                  <CarerPolaroidCard
                    key={provider.userId}
                    provider={provider}
                    onTap={() => setActiveProviderId(provider.userId)}
                    onBookmark={(event) => {
                      event.stopPropagation();
                      void handleBookmark(provider.userId);
                    }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <ServiceFilterSheet
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        onApply={setFilters}
      />
      <ServiceDateSheet
        isOpen={isDateOpen}
        onClose={() => setIsDateOpen(false)}
        selectedDates={selectedDates}
        onApply={(dates, weekdays) => {
          setSelectedDates(dates);
          setFilters((prev) => ({ ...prev, selectedWeekdays: weekdays }));
        }}
      />
      <PublicCarerProfileModal
        isOpen={Boolean(activeProviderId)}
        providerUserId={activeProviderId}
        canRequestService={profile?.is_verified === true}
        onClose={() => setActiveProviderId(null)}
        onRequestService={handleRequestService}
      />
    </div>
  );
};

export default Service;
