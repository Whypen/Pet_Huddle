import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const carerScreen = () => readFileSync(resolve(root, "app/src/screens/NativeCarerProfileScreen.tsx"), "utf8");
const migration = () => readFileSync(resolve(root, "supabase/migrations/20260811163312_care_multi_area_listing_and_country_contract.sql"), "utf8");

describe("native carer preferred area contract", () => {
  it("requires selected location suggestions for preferred meetup areas", () => {
    const s = carerScreen();
    expect(s).toMatch(/Choose a valid area from search\./);
    expect(s).not.toMatch(/Use "\{preferredMeetupQuery\.trim\(\)\}"/);
    expect(s).not.toMatch(/country: "", label: preferredMeetupQuery\.trim\(\), lat: null, lng: null/);
  });

  it("saves selected preferred areas with country and coordinates", () => {
    const s = carerScreen();
    expect(s).toMatch(/const nextAreas = \[\.\.\.prev\.preferredMeetupAreas, area\]\.slice\(0, 5\)/);
    expect(s).toMatch(/country: item\.country/);
    expect(s).toMatch(/lat: Number\.isFinite\(item\.lat\)/);
    expect(s).toMatch(/lng: Number\.isFinite\(item\.lng\)/);
  });

  it("backend ranks all selected preferred areas before falling back to listing or profile location", () => {
    const sql = migration();
    expect(sql).toMatch(/jsonb_array_elements\(coalesce\(pc\.preferred_meetup_areas/);
    expect(sql).toMatch(/preferred_area\.match_priority < 9/);
    expect(sql).toMatch(/matched_area\.country,[\s\S]*public\.normalize_country_key\(pc\.area_country\),[\s\S]*listing_area\.country,[\s\S]*public\.normalize_country_key\(public\.resolve_location_country\(p\.location_country, p\.location_name\)\)/);
  });

  it("allows profile-country fallback with no areas but rejects countryless supplied areas server-side", () => {
    const sql = migration();
    expect(sql).not.toMatch(/jsonb_array_length\(coalesce\(new\.preferred_meetup_areas, '\[\]'::jsonb\)\) > 0/);
    expect(sql).toMatch(/jsonb_array_elements\([\s\S]*new\.preferred_meetup_areas[\s\S]*where nullif\(btrim\(coalesce\(area->>'country', ''\)\), ''\) is null/);
  });
});
