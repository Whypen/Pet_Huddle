/**
 * `/sitemap-alerts.xml` — the district pages, generated from live data.
 *
 * DISTRICTS, NOT ALERTS. An individual alert lives for hours and then resolves;
 * submitting thousands of them would fill the index with URLs that are stale
 * before they are crawled, and every resolved one becomes a page telling a
 * searcher about a pet that is already home. A district URL is durable — it is
 * still the right answer next month — and it is what someone actually searches
 * for. Alerts reach search through the district page that lists them.
 *
 * Only districts that currently have public alerts are emitted, so the file is
 * a record of where huddle genuinely has something to say. Redaction is the
 * RPC's: `get_public_map_alerts` never returns sensitive or verified-only rows,
 * and nothing is added back here.
 */

import { fetchPublicProjection, resolvePublicReadConfig } from "./_publicRead.js";

type ResponseShape = {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { send: (body: string) => void };
};

type PublicAlert = {
  id: string;
  latitude: number;
  longitude: number;
  alert_type: string;
  area: string;
  created_at: string;
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/**
 * The countries huddle covers. A district slug alone is ambiguous, and the page
 * geocodes "{district}, {country}" — so the sitemap has to name the country it
 * means rather than guessing per row.
 */
const COVERAGE: Array<{ slug: string; label: string; lat: number; lng: number }> = [
  { slug: "hong-kong", label: "Hong Kong", lat: 22.3193, lng: 114.1694 },
];

export default async function handler(_req: unknown, res: ResponseShape) {
  const config = resolvePublicReadConfig();
  const seen = new Map<string, string>();

  if (config) {
    for (const country of COVERAGE) {
      const { rows, failed } = await fetchPublicProjection<PublicAlert>(config, "get_public_map_alerts", {
        p_bbox: { lat: country.lat, lng: country.lng, radius_m: 60000, limit: 200 },
      });
      if (failed) continue;
      for (const row of rows) {
        const districtSlug = slugify(String(row.area || ""));
        if (!districtSlug) continue;
        const loc = `https://huddle.pet/pet-alerts/${country.slug}/${districtSlug}`;
        // Keep the most recent alert time per district as lastmod.
        const existing = seen.get(loc);
        if (!existing || row.created_at > existing) seen.set(loc, row.created_at);
      }
    }
  }

  const urls = [...seen.entries()]
    .map(
      ([loc, lastmod]) =>
        `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>\n    <changefreq>hourly</changefreq>\n    <priority>0.7</priority>\n  </url>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=1800, s-maxage=1800");
  res.status(200).send(xml);
}
