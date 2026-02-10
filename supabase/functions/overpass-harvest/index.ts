// Overpass API Harvest Edge Function
// Fetches veterinary clinics and pet shops from OpenStreetMap via Overpass API
// Triggered by pg_cron every 30 days OR manually via HTTP POST
// Zero cost — no API key, no usage quota

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Hong Kong bounding box (fallback) — covers entire territory
const HK_BBOX = "22.15,113.83,22.56,114.44";

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Overpass QL query: fetch veterinary clinics, pet shops, pet grooming within Hong Kong bbox
    // Expanded coverage: amenity=veterinary, healthcare:speciality=veterinary,
    // shop=pet, shop=pet_grooming
    // Uses [out:json] for JSON response, [timeout:90] to prevent hanging
    const query = `
      [out:json][timeout:90];
      (
        node["amenity"="veterinary"](${HK_BBOX});
        way["amenity"="veterinary"](${HK_BBOX});
        node["healthcare:speciality"="veterinary"](${HK_BBOX});
        way["healthcare:speciality"="veterinary"](${HK_BBOX});
        node["shop"="pet"](${HK_BBOX});
        way["shop"="pet"](${HK_BBOX});
        node["shop"="pet_grooming"](${HK_BBOX});
        way["shop"="pet_grooming"](${HK_BBOX});
      );
      out center;
    `;

    console.log("[overpass-harvest] Fetching from Overpass API...");

    const overpassRes = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!overpassRes.ok) {
      throw new Error(`Overpass API returned ${overpassRes.status}: ${await overpassRes.text()}`);
    }

    const overpassData = await overpassRes.json();
    const elements: OverpassElement[] = overpassData.elements || [];

    console.log(`[overpass-harvest] Received ${elements.length} elements from Overpass`);

    // Map Overpass elements to our poi_locations schema
    const records = elements
      .map((el) => {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (!lat || !lon) return null;

        const tags = el.tags || {};
        const isVet = tags.amenity === "veterinary" || tags["healthcare:speciality"] === "veterinary";
        const isGrooming = tags.shop === "pet_grooming";
        const name = tags.name || (isVet ? "Veterinary Clinic" : isGrooming ? "Pet Grooming" : "Pet Shop");
        const address =
          tags["addr:full"] ||
          [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ") ||
          null;
        const phone = tags.phone || tags["contact:phone"] || null;
        const openingHours = tags.opening_hours || null;

        return {
          osm_id: `${el.type}_${el.id}`,
          poi_type: isVet ? "veterinary" : isGrooming ? "pet_grooming" : "pet_shop",
          name,
          latitude: lat,
          longitude: lon,
          address,
          phone,
          opening_hours: openingHours,
          is_active: true,
          last_harvested_at: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    console.log(`[overpass-harvest] Mapped ${records.length} valid records`);

    if (records.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No records found", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reconciliation logic:
    // 1. Get existing OSM IDs from poi_locations
    const { data: existing } = await supabase
      .from("poi_locations")
      .select("osm_id")
      .eq("is_active", true);

    const existingIds = new Set((existing || []).map((r: { osm_id: string }) => r.osm_id));
    const newIds = new Set(records.map((r: { osm_id: string }) => r.osm_id));

    // 2. Mark missing locations as inactive
    const toDeactivate = [...existingIds].filter((id) => !newIds.has(id));
    if (toDeactivate.length > 0) {
      await supabase
        .from("poi_locations")
        .update({ is_active: false })
        .in("osm_id", toDeactivate);
      console.log(`[overpass-harvest] Deactivated ${toDeactivate.length} stale records`);
    }

    // 3. Upsert all records (INSERT or UPDATE on conflict)
    const { error: upsertError } = await supabase
      .from("poi_locations")
      .upsert(records, { onConflict: "osm_id" });

    if (upsertError) {
      console.error("[overpass-harvest] Upsert error:", upsertError);
      throw upsertError;
    }

    console.log(`[overpass-harvest] Successfully upserted ${records.length} records`);

    return new Response(
      JSON.stringify({
        success: true,
        count: records.length,
        deactivated: toDeactivate.length,
        message: `Harvested ${records.length} POIs, deactivated ${toDeactivate.length} stale records`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[overpass-harvest] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
