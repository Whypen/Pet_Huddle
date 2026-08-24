/**
 * `/pet-alerts/{country}/{district}` — the district page.
 *
 * The question people actually type is not "pet safety app". It is "lost dog
 * near me" and "where do I report a stray in Kowloon City". Nothing huddle
 * publishes answers that today: brandweb describes a product, and `/map` is a
 * JavaScript bundle most answer-engine crawlers never execute. This page is the
 * answer — server-rendered, current, and specific to one place.
 *
 * NOT UNDER /api/ WHEN PUBLIC. robots.txt disallows `/api/`, so this handler is
 * only ever reached through the `/pet-alerts/...` rewrite in vercel.json. Every
 * URL it emits about itself uses the public path; linking to `/api/area` would
 * hand crawlers a blocked address.
 *
 * DISTRICT ONLY, NEVER A POINT. Alerts are listed with the area name and the
 * time, exactly as the share page shows them. `latitude`/`longitude` come back
 * from the RPC and are used for nothing but the district-centroid query that
 * found them. A page built for machines to read at scale is the last place an
 * exact location for a missing animal may appear.
 */

import { resolveAreaCentroid, staticMapImageForCentroid } from "./_alertPage.js";
import { escapeHtml } from "./_shareHtml.js";
import { fetchPublicProjection, resolvePublicReadConfig } from "./_publicRead.js";
import { checkDistributedRateLimit } from "./_distributedRateLimit.js";

type MaybeString = string | string[] | undefined;
type RequestShape = {
  query?: Record<string, MaybeString>;
  headers?: Record<string, MaybeString>;
};

/** This route serves HTML, so it needs `send` — `_publicRead`'s JSON-only
 *  ResponseShape does not describe it. */
type ResponseShape = {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { send: (body: string) => void; json: (body: unknown) => void };
};

type PublicAlert = {
  id: string;
  latitude: number;
  longitude: number;
  alert_type: string;
  area: string;
  created_at: string;
};

const first = (value: MaybeString): string =>
  String(Array.isArray(value) ? value[0] : value || "").trim();

/**
 * Slugs come from the URL, so they are attacker-controlled. Only letters,
 * digits and single hyphens survive, and the result is capped — this string is
 * used to build a geocoding query and is rendered into the page.
 */
const readableFromSlug = (slug: string): string =>
  slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 60)
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const relativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "recently";
  const minutes = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
};

const CHIP_COLOUR: Record<string, string> = {
  lost: "#FF7F50",
  stray: "#2145CF",
  caution: "#CFAB21",
};
const chipColour = (type: string): string => CHIP_COLOUR[String(type || "").toLowerCase()] || "#424965";

/**
 * The evergreen half. A district with no live alerts still has to be worth
 * landing on — otherwise the page is an empty shell that ranks for a question
 * it does not answer, which is worse than not existing.
 */
const FIRST_HOUR = [
  {
    h: "Search the ground they know",
    p: "Most pets are found within a few streets of home. Check under cars, behind bins, in hedges and any gap a frightened animal could press into. Cats in particular tend to hide close and silent rather than run.",
  },
  {
    h: "Tell the block, not the internet",
    p: "The people who will actually spot your pet are the ones walking past in the next hour. Neighbours, the corner shop, dog walkers, delivery riders, the school run. A Broadcast Alert on huddle reaches nearby members at once.",
  },
  {
    h: "Call the local shelters and vets",
    p: "Ring every shelter, rescue and veterinary practice within reach and give a description and your number. Ask them to log it. Call again the next day — intake staff change and notes get missed.",
  },
  {
    h: "Check the microchip registry",
    p: "Confirm the chip is registered to a phone number you still use. An out-of-date registration is the single most common reason a found pet does not make it home.",
  },
];

const renderAreaPage = (input: {
  districtName: string;
  countryName: string;
  countrySlug: string;
  districtSlug: string;
  alerts: PublicAlert[];
  mapImage: string | null;
  canonical: string;
}): string => {
  const { districtName, countryName, alerts, canonical } = input;
  const count = alerts.length;
  const title = count
    ? `${count} pet ${count === 1 ? "alert" : "alerts"} in ${districtName} right now · huddle`
    : `Lost and found pets in ${districtName} · huddle`;
  const description = count
    ? `${count} active pet ${count === 1 ? "alert" : "alerts"} reported in ${districtName}, ${countryName}. See lost pets, strays and hazards near you on the huddle Live Map — in your browser, no app required.`
    : `Report a lost pet or a stray in ${districtName}, ${countryName}, and see what neighbours have already reported. Open the huddle Live Map in your browser — no app required.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: canonical,
    about: { "@type": "Place", name: `${districtName}, ${countryName}` },
    isPartOf: { "@type": "WebSite", name: "huddle", url: "https://huddle.pet" },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: count,
      itemListElement: alerts.slice(0, 20).map((alert, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "SpecialAnnouncement",
          name: `${alert.alert_type} reported in ${alert.area || districtName}`,
          datePosted: alert.created_at,
          url: `https://huddle.pet/share/alert_${alert.id}`,
          spatialCoverage: { "@type": "Place", name: alert.area || districtName },
          category: "https://www.wikidata.org/wiki/Q39201",
        },
      })),
    },
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "huddle", item: "https://huddle.pet/" },
      { "@type": "ListItem", position: 2, name: "Pet alerts", item: "https://huddle.pet/pet-alerts" },
      { "@type": "ListItem", position: 3, name: districtName, item: canonical },
    ],
  };

  const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="apple-itunes-app" content="app-id=6766207079" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(canonical)}" />
<meta name="theme-color" content="#2145CF" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="huddle" />
<meta property="og:url" content="${escapeHtml(canonical)}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="https://huddle.pet/brandweb/og-card.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<link rel="icon" type="image/x-icon" href="/favicon.ico" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="apple-touch-icon" href="/favicon.png" />
<script type="application/ld+json">${safeJson(jsonLd)}</script>
<script type="application/ld+json">${safeJson(breadcrumb)}</script>
<link rel="stylesheet" href="/brandweb/huddle.css" />
<style>
  body { background: var(--cream); }
  .area-nav {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 16px max(20px, 4vw); background: var(--white);
    border-bottom: 1px solid rgba(33,69,207,0.08);
  }
  .area-nav .brand img { height: 24px; width: auto; display: block; }
  .area-nav .doors { display: flex; align-items: center; gap: 10px; }
  .area-nav .ghost {
    border: 1.5px solid rgba(33,69,207,0.3); color: var(--blue); border-radius: 999px;
    padding: 8px 15px; font-size: 13.5px; font-weight: 700;
  }
  .area-nav .ghost:hover { background: rgba(33,69,207,0.07); }
  .area-nav .solid {
    background: var(--blue); color: var(--white); border-radius: 999px;
    padding: 9px 18px; font-size: 13.5px; font-weight: 800;
  }
  .area-nav .solid:hover { background: var(--coral); }
  .area-wrap { max-width: 860px; margin: 0 auto; padding: 44px max(20px, 4vw) 90px; }
  .area-crumb { font-size: 13px; font-weight: 600; color: var(--fg1); opacity: 0.7; margin-bottom: 14px; }
  .area-crumb a { color: var(--blue); }
  h1.area-title {
    font-size: clamp(32px, 6vw, 52px); font-weight: 800; letter-spacing: -0.035em;
    line-height: 1.04; color: var(--ink); margin-bottom: 14px; text-wrap: balance;
  }
  .area-lead { font-size: 17.5px; font-weight: 500; line-height: 1.55; color: var(--fg1); max-width: 62ch; }
  .area-live {
    display: inline-flex; align-items: center; gap: 9px; margin-top: 22px;
    background: rgba(33,69,207,0.07); border-radius: 999px; padding: 9px 16px;
    font-size: 14px; font-weight: 700; color: var(--blue);
  }
  .area-live .pulse {
    width: 9px; height: 9px; border-radius: 50%; background: var(--coral);
    box-shadow: 0 0 0 4px rgba(255,127,80,0.22);
  }
  .area-map { margin-top: 28px; border-radius: 18px; overflow: hidden; border: 1px solid rgba(33,69,207,0.1); }
  .area-map img { width: 100%; display: block; }
  .area-map-note { margin-top: 8px; font-size: 12.5px; font-weight: 500; color: var(--fg1); opacity: 0.62; }
  .area-section-title {
    margin-top: 52px; margin-bottom: 18px; font-size: 12px; font-weight: 800;
    letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg1); opacity: 0.62;
  }
  .alert-list { display: flex; flex-direction: column; gap: 10px; list-style: none; }
  .alert-item {
    background: var(--white); border: 1px solid rgba(33,69,207,0.08); border-radius: 16px;
    padding: 16px 18px; display: flex; align-items: center; gap: 14px;
    transition: transform 0.25s var(--ease), box-shadow 0.25s;
  }
  .alert-item:hover { transform: translateY(-2px); box-shadow: 0 16px 34px -18px rgba(20,46,153,0.22); }
  .alert-chip {
    color: var(--white); font-size: 10.5px; font-weight: 800; letter-spacing: 0.08em;
    border-radius: 999px; padding: 5px 10px; text-transform: uppercase; flex-shrink: 0;
  }
  .alert-where { font-size: 15.5px; font-weight: 700; color: var(--ink); }
  .alert-when { font-size: 13px; font-weight: 500; color: var(--fg1); opacity: 0.7; }
  .alert-go { margin-left: auto; font-size: 14px; font-weight: 700; color: var(--blue); flex-shrink: 0; }
  .area-empty {
    background: var(--white); border: 1px dashed rgba(33,69,207,0.22); border-radius: 18px;
    padding: 34px 26px; text-align: center;
  }
  .area-empty p { font-size: 16px; font-weight: 600; color: var(--ink); }
  .area-empty span { display: block; margin-top: 6px; font-size: 14.5px; font-weight: 500; color: var(--fg1); }
  .guide { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  @media (max-width: 720px) { .guide { grid-template-columns: 1fr; } }
  .guide-card { background: var(--white); border: 1px solid rgba(33,69,207,0.08); border-radius: 18px; padding: 24px; }
  .guide-card h3 { font-size: 17px; font-weight: 800; letter-spacing: -0.015em; color: var(--ink); margin-bottom: 8px; }
  .guide-card p { font-size: 14.5px; font-weight: 500; line-height: 1.55; color: var(--fg1); }
  .area-cta {
    margin-top: 56px; background: var(--blue); border-radius: 22px; padding: 38px 34px; color: var(--white);
  }
  .area-cta h2 { font-size: clamp(24px, 4vw, 32px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.08; margin-bottom: 12px; }
  .area-cta p { font-size: 16px; font-weight: 500; line-height: 1.5; color: rgba(255,255,255,0.85); margin-bottom: 24px; max-width: 52ch; }
  .area-cta .row { display: flex; gap: 12px; flex-wrap: wrap; }
  .area-cta .btn-w { background: var(--white); color: var(--blue); border-radius: 999px; padding: 13px 24px; font-size: 15px; font-weight: 800; }
  .area-cta .btn-w:hover { background: var(--lime); color: var(--ink); }
  .area-cta .btn-o { border: 1.5px solid rgba(255,255,255,0.6); color: var(--white); border-radius: 999px; padding: 12px 22px; font-size: 15px; font-weight: 700; }
  .area-cta .btn-o:hover { background: rgba(255,255,255,0.15); }
</style>
</head>
<body>
<nav class="area-nav">
  <a class="brand" href="/" aria-label="huddle home"><img src="/brandweb/wm-blue.png" alt="huddle" /></a>
  <div class="doors">
    <a class="ghost" href="/map">Open the map</a>
    <a class="solid" href="/get">Get the app</a>
  </div>
</nav>

<main class="area-wrap">
  <p class="area-crumb"><a href="/">huddle</a> › Pet alerts › ${escapeHtml(districtName)}</p>
  <h1 class="area-title">Lost and found pets in ${escapeHtml(districtName)}</h1>
  <p class="area-lead">Every alert below was reported by someone nearby, on the huddle Live Map. You can read them here, and open the map in your browser — there is nothing to install, and nothing to sign up for just to look.</p>
  ${count ? `<p class="area-live"><span class="pulse" aria-hidden="true"></span>${count} active ${count === 1 ? "alert" : "alerts"} right now</p>` : ""}

  ${input.mapImage ? `<div class="area-map"><img src="${escapeHtml(input.mapImage)}" alt="Map of ${escapeHtml(districtName)}" loading="lazy" /></div><p class="area-map-note">Area only. Exact locations stay with members in the app.</p>` : ""}

  <h2 class="area-section-title">Reported in ${escapeHtml(districtName)}</h2>
  ${
    count
      ? `<ul class="alert-list">${alerts
          .slice(0, 40)
          .map(
            (alert) => `<li><a class="alert-item" href="/share/alert_${escapeHtml(alert.id)}">
        <span class="alert-chip" style="background:${chipColour(alert.alert_type)}">${escapeHtml(String(alert.alert_type || "alert"))}</span>
        <span>
          <span class="alert-where">${escapeHtml(alert.area || districtName)}</span><br />
          <span class="alert-when">${escapeHtml(relativeTime(alert.created_at))}</span>
        </span>
        <span class="alert-go">See it →</span>
      </a></li>`,
          )
          .join("")}</ul>`
      : `<div class="area-empty"><p>No open alerts in ${escapeHtml(districtName)} right now.</p><span>That is good news. If something changes, this page and the Live Map update straight away.</span></div>`
  }

  <h2 class="area-section-title">If you have lost a pet in ${escapeHtml(districtName)}</h2>
  <div class="guide">
    ${FIRST_HOUR.map((item) => `<div class="guide-card"><h3>${escapeHtml(item.h)}</h3><p>${escapeHtml(item.p)}</p></div>`).join("")}
  </div>

  <section class="area-cta">
    <h2>Report it to the block in ${escapeHtml(districtName)}.</h2>
    <p>A Broadcast Alert reaches huddle members near you the moment you send it. The web shows you what is happening. The app tells you when it does.</p>
    <div class="row">
      <a class="btn-w" href="/get">Get the app — free</a>
      <a class="btn-o" href="/map">Open the map on the web →</a>
    </div>
  </section>
</main>
</body>
</html>`;
};

export default async function handler(req: RequestShape, res: ResponseShape) {
  const rate = await checkDistributedRateLimit(req, "area", 60);
  if ("retryAfter" in rate) {
    res.setHeader("Retry-After", String(rate.retryAfter));
    res.status(rate.unavailable ? 503 : 429).json({ error: "rate_limited" });
    return;
  }

  const countrySlug = first(req.query?.country).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  const districtSlug = first(req.query?.district).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
  const districtName = readableFromSlug(districtSlug);
  const countryName = readableFromSlug(countrySlug);
  if (!districtName || !countryName) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const config = resolvePublicReadConfig();
  const mapboxToken = String(process.env.MAPBOX_ACCESS_TOKEN || process.env.VITE_MAPBOX_ACCESS_TOKEN || "").trim();
  const centre = await resolveAreaCentroid(districtName, countryName, mapboxToken);

  let alerts: PublicAlert[] = [];
  if (config && centre) {
    const { rows, failed } = await fetchPublicProjection<PublicAlert>(config, "get_public_map_alerts", {
      p_bbox: { lat: centre.lat, lng: centre.lng, radius_m: 8000, limit: 60 },
    });
    // A failed read renders the evergreen page rather than a 503: the guidance
    // below is the half of this page that is always true, and a district with a
    // temporarily unreachable database is not a district that stopped existing.
    if (!failed) alerts = rows;
  }

  const canonical = `https://huddle.pet/pet-alerts/${countrySlug}/${districtSlug}`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=1800");
  res.status(200).send(
    renderAreaPage({
      districtName,
      countryName,
      countrySlug,
      districtSlug,
      alerts,
      mapImage: centre && mapboxToken ? staticMapImageForCentroid(centre, mapboxToken) : null,
      canonical,
    }),
  );
}
