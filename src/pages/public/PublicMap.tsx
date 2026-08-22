/**
 * /map, logged out — alert pins and pan/zoom, nothing else.
 *
 * WHERE THE PINS COME FROM
 * ------------------------
 * Each public alert carries the same stored coordinate the app uses for its map
 * marker. The pin itself is the allowed general location; all alert and creator
 * detail remains behind the auth wall.
 *
 * WHAT IS ABSENT WHEN LOGGED OUT
 * ------------------------------
 * No friend pins, no self pin, no alert-type segment control. These are not
 * hidden with CSS — this component never fetches or renders them at all.
 *
 * Every tap except pan/zoom opens the auth wall. Never a silent no-op.
 */

import { useEffect, useRef, useState } from "react";
import { Minus, Navigation, Plus, Search, X } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/constants";
import { useAuthGate } from "@/components/auth/authGateContext";
import { usePublicAlerts } from "@/lib/publicRead";
import { PublicTopBar, PublicFailed } from "./PublicChrome";
import AlertMarkersOverlay from "@/components/map/AlertMarkersOverlay";
import { supabase } from "@/integrations/supabase/client";
import { SharedAlertDetail, type SharedAlert } from "./SharedAlertDetail";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const callRpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args: Record<string, string>,
) => Promise<{ data: unknown; error: unknown }>;

const PublicMap = () => {
  const { requireAuth } = useAuthGate();
  const { data: alerts, loading, failed } = usePublicAlerts();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const initialAlertViewportApplied = useRef(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [sharedAlert, setSharedAlert] = useState<SharedAlert | null>(null);
  const [sharedAlertFailed, setSharedAlertFailed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  const [locationNotice, setLocationNotice] = useState("");

  const searchMap = async () => {
    const query = searchQuery.trim();
    if (!query || !MAPBOX_ACCESS_TOKEN || !map.current) return;
    setSearchError("");
    try {
      const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${encodeURIComponent(MAPBOX_ACCESS_TOKEN)}&types=postcode,address,place,locality,neighborhood,district&limit=1&language=en`);
      const payload = response.ok ? await response.json() as { features?: Array<{ center?: [number, number] }> } : null;
      const center = payload?.features?.[0]?.center;
      if (!center) {
        setSearchError("No matching area found. Try a city, district, or postcode.");
        return;
      }
      map.current.flyTo({ center, zoom: 13.5 });
    } catch {
      setSearchError("Area search is unavailable right now. Try again.");
    }
  };

  const recenter = () => {
    setLocationNotice("");
    requireAuth("map-location", () => {}, { returnTo: "/map" });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const alertId = String(params.get("alert") || "").trim();
    const shareToken = String(params.get("access") || "").trim();
    if (!UUID.test(alertId) || !UUID.test(shareToken)) return;

    let active = true;
    void callRpc(
      "get_broadcast_alert_by_share_token",
      { p_alert_id: alertId, p_share_token: shareToken },
    ).then(({ data, error }) => {
      if (!active) return;
      const row = Array.isArray(data) ? data[0] : null;
      if (error || !row || typeof row !== "object") {
        setSharedAlertFailed(true);
        return;
      }
      setSharedAlert(row as SharedAlert);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!container.current || map.current) return;
    if (!MAPBOX_ACCESS_TOKEN) {
      setMapFailed(true);
      return;
    }
    let observer: ResizeObserver | null = null;
    let resizeFrame: number | null = null;
    const queueResize = () => {
      if (resizeFrame !== null) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        map.current?.resize();
      });
    };

    try {
      mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
      map.current = new mapboxgl.Map({
        container: container.current,
        style: "mapbox://styles/whypen/cmpx5mu4m000l01sb5fmm2imv",
        center: [114.1694, 22.3193],
        zoom: 10,
        failIfMajorPerformanceCaveat: false,
      });
      setMapInstance(map.current);
      observer = new ResizeObserver(queueResize);
      observer.observe(container.current);
      window.addEventListener("resize", queueResize);
      map.current.once("render", queueResize);
    } catch {
      setMapFailed(true);
    }
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", queueResize);
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      map.current?.remove();
      map.current = null;
      setMapInstance(null);
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    if (alerts.length === 0) return;

    const placed = new mapboxgl.LngLatBounds();
    let any = false;

    for (const alert of alerts) {
      placed.extend([alert.longitude, alert.latitude]);
      any = true;
    }

    if (any && !initialAlertViewportApplied.current) {
      try {
        instance.fitBounds(placed, { padding: 72, maxZoom: 12, duration: 0 });
        initialAlertViewportApplied.current = true;
      } catch {
        // A single point makes degenerate bounds; the default centre is fine.
      }
    }
  }, [alerts]);

  return (
    <main className="flex h-[100svh] w-full flex-col overflow-hidden bg-background transition-[padding] duration-200 lg:pl-[var(--public-rail-width,256px)]">
      <PublicTopBar title="Map" subtitle="" showIntro={false} mobileActions={<button type="button" aria-label="Search map" aria-expanded={searchOpen} onClick={() => setSearchOpen((value) => !value)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-muted"><Search className="h-5 w-5" /></button>} />

      <div className="relative min-h-0 flex-1">
        {/* The map and the alert list fail independently. A failed alerts fetch
            must NOT remove the map — pan and zoom are promised to logged-out
            visitors regardless, and swapping the whole surface for an error card
            takes away something that still works. */}
        {mapFailed ? (
          <PublicFailed what="the map" />
        ) : (
          <>
            <div
              ref={container}
              className="absolute inset-0 h-full w-full overflow-hidden bg-[#EAF2F8]"
            />
            <AlertMarkersOverlay
              map={mapInstance}
              alerts={alerts}
              onSelect={(alertId) => requireAuth("see-alert", () => {}, { targetId: alertId })}
            />
            {searchOpen ? (
              <div className="absolute left-4 right-4 top-4 z-20 mx-auto max-w-[520px]">
                <form onSubmit={(event) => { event.preventDefault(); void searchMap(); }} className="flex h-11 items-center gap-2 rounded-full border border-border bg-background/95 px-4 shadow-elevated backdrop-blur">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={(event) => { setSearchQuery(event.target.value); setSearchError(""); }}
                    placeholder="Search an area"
                    aria-describedby={searchError ? "public-map-search-error" : undefined}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  <button type="button" aria-label="Close search" onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchError(""); }} className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
                </form>
                {searchError ? <p id="public-map-search-error" role="status" className="mx-4 mt-1 rounded-[10px] border border-border bg-background/95 px-3 py-2 text-[12px] font-medium text-muted-foreground shadow-elevated backdrop-blur">{searchError}</p> : null}
              </div>
            ) : null}
            <div className="absolute bottom-24 right-4 z-20 flex flex-col overflow-hidden rounded-[14px] border border-white/70 bg-white/80 shadow-elevated backdrop-blur-xl">
              <button type="button" aria-label="Zoom in" onClick={() => map.current?.zoomIn()} className="grid h-[42px] w-[42px] place-items-center text-brandText hover:bg-white/70"><Plus className="h-5 w-5"/></button>
              <span className="mx-2 h-px bg-border" />
              <button type="button" aria-label="Zoom out" onClick={() => map.current?.zoomOut()} className="grid h-[42px] w-[42px] place-items-center text-brandText hover:bg-white/70"><Minus className="h-5 w-5"/></button>
              <span className="mx-2 h-px bg-border" />
              <button type="button" aria-label="Recenter" onClick={recenter} className="grid h-[42px] w-[42px] place-items-center text-brandBlue hover:bg-white/70"><Navigation className="h-4 w-4"/></button>
            </div>
            {locationNotice ? <p role="status" className="absolute inset-x-4 bottom-24 z-20 mx-auto max-w-[430px] rounded-[14px] border border-border bg-background/95 px-4 py-3 text-center text-[13px] font-medium text-muted-foreground shadow-elevated backdrop-blur">{locationNotice}</p> : null}
            {failed ? (
              <p
                className="absolute inset-x-4 top-4 z-20 rounded-[14px] border border-border bg-background/95 px-4 py-3 text-[13px] font-medium text-muted-foreground shadow-elevated backdrop-blur"
                role="status"
              >
                Couldn&apos;t load alerts just now — the map still works. Refresh to try again.
              </p>
            ) : null}
          </>
        )}
      </div>

      {sharedAlert ? <SharedAlertDetail alert={sharedAlert} onClose={() => setSharedAlert(null)} /> : null}
      {sharedAlertFailed ? (
        <div className="fixed inset-x-4 bottom-6 z-[5000] mx-auto max-w-[430px] rounded-[14px] border border-border bg-card px-4 py-3 text-center text-sm font-medium text-muted-foreground shadow-elevated" role="alert">
          This shared alert is no longer available.
        </div>
      ) : null}
    </main>
  );
};

export default PublicMap;
