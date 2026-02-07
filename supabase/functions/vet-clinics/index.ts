import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async () => {
  try {
    if (!apiKey) {
      return json({ clinics: [] });
    }

    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=veterinary%20clinic%20hong%20kong&key=${apiKey}`;
    const searchRes = await fetch(searchUrl);
    const searchData: unknown = await searchRes.json();
    const searchRec = (typeof searchData === "object" && searchData !== null) ? (searchData as Record<string, unknown>) : {};
    const rawResults = Array.isArray(searchRec.results) ? (searchRec.results as unknown[]) : [];
    const results = rawResults
      .slice(0, 10)
      .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null);

    const clinics = await Promise.all(
      results.map(async (place) => {
        const placeId = typeof place.place_id === "string" ? place.place_id : "";
        let detail: Record<string, unknown> = place;
        if (placeId) {
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,geometry,formatted_address,formatted_phone_number,opening_hours,rating&key=${apiKey}`;
          const detailsRes = await fetch(detailsUrl);
          const detailsData: unknown = await detailsRes.json();
          const detailsRec = (typeof detailsData === "object" && detailsData !== null) ? (detailsData as Record<string, unknown>) : {};
          const resultRec = (typeof detailsRec.result === "object" && detailsRec.result !== null) ? (detailsRec.result as Record<string, unknown>) : null;
          if (resultRec) {
            detail = { ...place, ...resultRec };
          }
        }

        const geometry = (typeof detail.geometry === "object" && detail.geometry !== null) ? (detail.geometry as Record<string, unknown>) : {};
        const location = (typeof geometry.location === "object" && geometry.location !== null) ? (geometry.location as Record<string, unknown>) : {};
        const lat = typeof location.lat === "number" ? location.lat : null;
        const lng = typeof location.lng === "number" ? location.lng : null;
        const opening = (typeof detail.opening_hours === "object" && detail.opening_hours !== null) ? (detail.opening_hours as Record<string, unknown>) : {};
        const weekdayText = Array.isArray(opening.weekday_text) ? opening.weekday_text : null;

        return {
          id: placeId || String(detail.name || ""),
          name: String(detail.name || ""),
          lat,
          lng,
          phone: typeof detail.formatted_phone_number === "string" ? detail.formatted_phone_number : undefined,
          openingHours: weekdayText
            ? (weekdayText as unknown[]).map((v) => String(v)).join("; ")
            : undefined,
          address: typeof detail.formatted_address === "string" ? detail.formatted_address : undefined,
          rating: typeof detail.rating === "number" ? detail.rating : undefined,
          isOpen: typeof opening.open_now === "boolean" ? opening.open_now : undefined,
        };
      })
    );

    return json({ clinics: clinics.filter((c) => c.lat && c.lng) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message || "Failed to load vet clinics" }, 500);
  }
});
