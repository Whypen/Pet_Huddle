/**
 * The public alert page — the one surface a stranger sees before they have the
 * app, so it has to carry the whole story on its own.
 *
 * Server-rendered and self-contained: no SPA bundle, no Mapbox GL. A shared link
 * must show the pet before it downloads anything.
 *
 * NO PRECISE LOCATION LEAVES THIS FILE. The alert's `latitude`/`longitude` are
 * never selected, never rendered, and never used to centre the map — the static
 * map is centred on the DISTRICT centroid and carries no marker. Same reasoning
 * as `api/public-alerts.ts` and the revoked `get_map_alerts_nearby` grant: an
 * exact location for a lost or stray animal is actionable by whoever reads it
 * first.
 */

import QRCode from "qrcode";
import { escapeHtml } from "./_shareHtml";

/**
 * QR for the desktop CTA. Rendered to inline SVG at request time and embedded
 * directly, so the page stays self-contained — no client library, no external
 * image host, nothing added to the browser bundle. `qrcode` is server-side only.
 *
 * Returns null on failure: a missing QR degrades to the Copy link button, which
 * is never worse than failing the page.
 */
export const renderQrSvg = async (url: string): Promise<string | null> => {
  try {
    return await QRCode.toString(url, {
      type: "svg",
      margin: 1,
      width: 148,
      color: { dark: "#2145CF", light: "#FFFFFF" },
    });
  } catch {
    return null;
  }
};

/**
 * Cap the OG image server-side.
 *
 * `photo_url` is a user upload and can be several megabytes; WhatsApp silently
 * drops previews over roughly 300KB, so an uncapped image means the link unfurls
 * with no picture at all — the single most valuable part of the preview.
 *
 * Supabase Storage can do this natively, so there is no resize step and no new
 * dependency: swap `/object/public/` for `/render/image/public/` and pass width
 * and quality. Non-Supabase URLs are returned untouched rather than guessed at.
 *
 * `resize=cover` at an explicit 1200x630 is what makes the declared
 * `og:image:width/height` TRUE. Width alone left portrait and square uploads at
 * their own aspect ratio while the tags still claimed 1.91:1, so WhatsApp and
 * iMessage letterboxed them onto grey.
 *
 * `fallback` is nullable: with no usable photo the share page omits the image
 * tags entirely and every renderer draws its own text-only preview. A bare logo
 * pillarboxed onto grey is worse than no picture at all.
 */
export const OG_WIDE = { width: 1200, height: 630 } as const;
/**
 * People are shown as a SQUARE THUMBNAIL, not a banner.
 *
 * An avatar is square, so cropping it to 1.91:1 saws the head off. Every
 * renderer draws a small square tile for `twitter:card=summary`, which is also
 * how a link to a person is supposed to read — a face, not a billboard.
 */
export const OG_SQUARE = { width: 400, height: 400 } as const;

export const cappedOgImage = <T extends string | null>(
  photoUrl: string | null,
  fallback: T,
  size: { width: number; height: number } = OG_WIDE,
): string | T => {
  const url = String(photoUrl || "").trim();
  if (!url) return fallback;
  if (!url.includes("/storage/v1/object/public/")) return url;
  const rendered = url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  const separator = rendered.includes("?") ? "&" : "?";
  // These dimensions are the ones the tags declare — see renderOgImageTags.
  return `${rendered}${separator}width=${size.width}&height=${size.height}&resize=cover&quality=80`;
};

/**
 * The Open Graph image tags, or NOTHING.
 *
 * Shared by both share surfaces so they cannot drift into different answers for
 * "there is no picture". With no real image every renderer draws its own
 * text-only preview (title, description, domain), which is clean — whereas a
 * stand-in logo declared as 1200x630 gets pillarboxed onto grey.
 *
 * `twitter:card` degrades with it: `summary_large_image` promises a picture.
 */
export const renderOgImageTags = (
  ogImage: string | null,
  escape: (v: string) => string,
  size: { width: number; height: number } = OG_WIDE,
): string => {
  if (!ogImage) return '<meta name="twitter:card" content="summary" />';
  const safe = escape(ogImage);
  // `summary_large_image` PROMISES a banner. A square avatar declared that way
  // gets letterboxed, so the card type follows the shape it actually has.
  const card = size.width === size.height ? "summary" : "summary_large_image";
  return [
    `<meta property="og:image" content="${safe}" />`,
    `<meta property="og:image:secure_url" content="${safe}" />`,
    `<meta property="og:image:width" content="${size.width}" />`,
    `<meta property="og:image:height" content="${size.height}" />`,
    `<meta name="twitter:card" content="${card}" />`,
    `<meta name="twitter:image" content="${safe}" />`,
  ].join("\n    ");
};

export type AlertPageData = {
  id: string;
  title: string;
  description: string;
  photoUrl: string | null;
  alertType: string;
  area: string;
  country: string;
  createdAt: string;
  /** Archived alerts render the resolved state instead of the alert. */
  archived: boolean;
  nearbyCount: number;
};

/**
 * Chip colours. Caution is BLUE here, not grey: this is a page, not a map
 * marker. Grey is reserved for the map alone, where it stops Caution reading as
 * a verified friend pin (`src/lib/broadcastPinStyle.ts`, and the three-site
 * table in WEB_BUILD_RULES.md).
 */
const CHIP_COLOR: Record<string, string> = {
  lost: "#EF4444",
  stray: "#EAB308",
  caution: "#2145CF",
  others: "#A1A4A9",
  other: "#A1A4A9",
};

const chipColor = (alertType: string) =>
  CHIP_COLOR[String(alertType || "").trim().toLowerCase()] || "#EAB308";

const relativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const minutes = Math.max(1, Math.floor((Date.now() - then) / 60000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return `${Math.floor(days / 7)} week${Math.floor(days / 7) === 1 ? "" : "s"} ago`;
};

/**
 * A static map of the AREA. Centred on the district centroid at neighbourhood
 * zoom with no marker — a marker would reassert a point, which is the thing this
 * page must not publish.
 */
const staticMapUrl = (area: string, country: string, mapboxToken: string): string | null => {
  if (!mapboxToken || !area) return null;
  const place = encodeURIComponent([area, country].filter(Boolean).join(", "));
  // Geocoding happens client-side of this URL: Mapbox's static endpoint cannot
  // take a place name, so the caller resolves the centroid first.
  return `https://api.mapbox.com/geocoding/v5/mapbox.places/${place}.json?types=place,district,locality,neighborhood&limit=1&language=en&access_token=${mapboxToken}`;
};

export const resolveStaticMapImage = async (
  area: string,
  country: string,
  mapboxToken: string,
): Promise<string | null> => {
  const geocodeUrl = staticMapUrl(area, country, mapboxToken);
  if (!geocodeUrl) return null;
  try {
    const response = await fetch(geocodeUrl);
    if (!response.ok) return null;
    const data = await response.json();
    const centre = data?.features?.[0]?.center;
    if (!Array.isArray(centre) || centre.length !== 2) return null;
    const [lng, lat] = centre;
    // zoom 12 ≈ neighbourhood. No marker overlay, deliberately.
    return (
      `https://api.mapbox.com/styles/v1/whypen/cmpx5mu4m000l01sb5fmm2imv/static/` +
      `${lng},${lat},12,0/640x260@2x?logo=false&attribution=false&access_token=${mapboxToken}`
    );
  } catch {
    return null;
  }
};

const RESOLVED_COPY = {
  headline: "This alert has been resolved.",
  body: "The neighbour who raised it has closed it. Thanks for checking — that instinct is exactly what huddle is for.",
};

export const renderAlertPage = (input: {
  data: AlertPageData;
  shareUrl: string;
  staticMapImage: string | null;
  iosDownloadUrl: string;
  androidDownloadUrl: string;
  ogImage: string | null;
  title: string;
  description: string;
  /** Inline SVG for the desktop CTA; null degrades to Copy link alone. */
  qrSvg: string | null;
}): string => {
  const { data, shareUrl, staticMapImage, iosDownloadUrl, androidDownloadUrl } = input;
  const colour = chipColor(data.alertType);
  const chipLabel = String(data.alertType || "Alert").toUpperCase();

  // "Never stale data" has to include the link preview. An archived alert
  // re-shared into a chat would otherwise unfurl with the original title,
  // description and photo — the resolved state would only appear after opening
  // it. So the metadata is replaced too, not just the body.
  // "This alert has been resolved" answered RESOLVED WHAT? with nothing — and on
  // iMessage, which drops og:description, that fixed string was the entire
  // preview. `input.title` already arrives prefixed ("Resolved — Lost cat in
  // Kowloon City: ..."), so the subject survives the resolution.
  const metaTitle = input.title;
  const metaDescription = data.archived ? RESOLVED_COPY.body : input.description;
  // Resolved alerts drop the photo entirely rather than swapping in a logo:
  // the preview becomes text-only, which states the resolution honestly.
  const ogImage = data.archived ? null : input.ogImage;

  // Archived: the whole page is replaced. Never a 404, never stale detail.
  //
  // NOTE: the schema has no "found" flag — only `archived_at` — so this cannot
  // truthfully say "Milo was found". An archived alert may have been resolved,
  // withdrawn or removed, and asserting a happy ending we cannot verify would be
  // inventing a fact about someone's pet.
  const body = data.archived
    ? `
      <div class="resolved">
        <div class="resolved-mark" aria-hidden>🐾</div>
        <h1 class="resolved-title">${escapeHtml(RESOLVED_COPY.headline)}</h1>
        <p class="resolved-body">${escapeHtml(RESOLVED_COPY.body)}</p>
      </div>`
    : `
      ${data.photoUrl ? `<img class="hero" src="${escapeHtml(data.photoUrl)}" alt="" />` : ""}
      <div class="pad">
        <p class="meta">
          <span class="chip" style="background:${colour}">${escapeHtml(chipLabel)}</span>
          ${data.area ? `<span>${escapeHtml(data.area)}</span>` : ""}
          <span>${escapeHtml(relativeTime(data.createdAt))}</span>
        </p>
        <h1 class="name">${escapeHtml(data.title || "Alert nearby")}</h1>
        ${data.description ? `<p class="desc">${escapeHtml(data.description)}</p>` : ""}
        ${staticMapImage ? `<img class="map" src="${escapeHtml(staticMapImage)}" alt="Map of ${escapeHtml(data.area)}" loading="lazy" />` : ""}
        <p class="map-note">Area only. Exact location is visible to members in the app.</p>
        ${
          // Live data, not decoration: omitted entirely at zero rather than
          // printing "0 pets nearby".
          data.nearbyCount > 0
            ? `<p class="proof">${data.nearbyCount} ${data.nearbyCount === 1 ? "alert" : "alerts"} raised near ${escapeHtml(data.area || "here")}</p>`
            : ""
        }
      </div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="apple-itunes-app" content="app-id=6766207079" />
    <title>${escapeHtml(metaTitle)}</title>
    <meta name="description" content="${escapeHtml(metaDescription)}" />
    <meta property="og:title" content="${escapeHtml(metaTitle)}" />
    <meta property="og:description" content="${escapeHtml(metaDescription)}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${escapeHtml(shareUrl)}" />
    ${renderOgImageTags(ogImage, escapeHtml)}
    <meta name="twitter:title" content="${escapeHtml(metaTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(metaDescription)}" />
    <link rel="icon" type="image/png" sizes="32x32" href="/huddle-favicon-32-v5.png" />
    <link rel="icon" type="image/png" href="/huddle-favicon-v5.png" />
    <link rel="apple-touch-icon" href="/huddle-apple-touch-icon-v5.png" />
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { margin:0; font-family:"Urbanist",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:#f4f7fb; color:#424965; }
      .wrap { min-height:100vh; display:grid; place-items:start center; padding:20px; }
      .card { width:min(560px,100%); border-radius:20px; background:#fff; box-shadow:0 10px 34px rgba(36,55,120,.12); overflow:hidden; }
      .hero { width:100%; max-height:420px; object-fit:cover; display:block; background:#eef2f9; }
      .pad { padding:18px 18px 4px; }
      .meta { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:0 0 10px; font-size:13px; font-weight:600; color:rgba(66,73,101,.7); }
      .chip { color:#fff; font-size:11px; font-weight:800; letter-spacing:.08em; border-radius:999px; padding:4px 9px; }
      .name { margin:0 0 8px; font-size:32px; font-weight:800; letter-spacing:-.02em; line-height:1.1; }
      .desc { margin:0 0 14px; font-size:15px; line-height:1.5; color:rgba(66,73,101,.9); white-space:pre-wrap; }
      .map { width:100%; border-radius:14px; display:block; background:#eef2f9; }
      .map-note { margin:6px 0 0; font-size:12px; font-weight:500; color:rgba(66,73,101,.6); }
      .proof { margin:14px 0 0; font-size:14px; font-weight:700; color:#2145CF; }
      .actions { padding:16px 18px 20px; display:flex; flex-direction:column; gap:9px; }
      .cta { display:flex; align-items:center; justify-content:center; height:48px; border-radius:14px; background:#2145CF; color:#fff; text-decoration:none; font-weight:700; font-size:15px; border:0; cursor:pointer; width:100%; }
      .cta.secondary { background:#fff; color:#424965; border:1px solid rgba(66,73,101,.18); }
      .replies { margin:0; padding:0 18px 20px; font-size:12.5px; font-weight:500; color:rgba(66,73,101,.6); text-align:center; }
      .resolved { padding:44px 24px; text-align:center; }
      .resolved-mark { font-size:44px; }
      .resolved-title { margin:12px 0 6px; font-size:24px; font-weight:800; letter-spacing:-.02em; }
      .resolved-body { margin:0; font-size:15px; line-height:1.5; color:rgba(66,73,101,.78); }
      .desktop-only { display:none; }
      .qr-label { margin:0 0 10px; font-size:13px; font-weight:600; color:rgba(66,73,101,.7); text-align:center; }
      .qr { display:flex; justify-content:center; margin-bottom:12px; }
      .qr svg { width:148px; height:148px; border-radius:10px; }
      @media (min-width:820px) { .mobile-only { display:none; } .desktop-only { display:block; } }
    </style>
  </head>
  <body>
    <main class="wrap">
      <article class="card">
        ${body}
        <div class="actions">
          <a class="cta mobile-only" id="open-app" href="${escapeHtml(iosDownloadUrl)}" data-track="open_app">Get huddle</a>
          <div class="desktop-only">
            <p class="qr-label">huddle is a mobile app — scan to open this alert on your phone:</p>
            ${input.qrSvg ? `<div class="qr">${input.qrSvg}</div>` : ""}
            <button class="cta secondary" type="button" id="copy-link" data-track="copy_link">Copy link</button>
          </div>
          <button class="cta secondary" type="button" id="share-link" data-track="share">Share</button>
        </div>
        <p class="replies">Replies are visible in the huddle app.</p>
      </article>
    </main>
    <script>
      (() => {
        const ua = navigator.userAgent || "";
        const store = /Android/i.test(ua)
          ? ${JSON.stringify(androidDownloadUrl)}
          : ${JSON.stringify(iosDownloadUrl)};
        const openApp = document.getElementById("open-app");
        if (openApp) openApp.href = store;

        // NOTE: the old stub auto-redirected mobile visitors to the store after
        // 80ms. That is removed on purpose — the whole point of this page is
        // that a shared alert shows the pet before anyone is asked to install.

        const beacon = (event) => {
          try {
            navigator.sendBeacon(
              "/api/share-event",
              new Blob([JSON.stringify({ alert_id: ${JSON.stringify(data.id)}, event })], { type: "application/json" }),
            );
          } catch (_) { /* analytics must never break the page */ }
        };
        beacon("view");
        document.querySelectorAll("[data-track]").forEach((el) => {
          el.addEventListener("click", () => beacon(el.getAttribute("data-track")));
        });

        const copy = document.getElementById("copy-link");
        if (copy) copy.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(${JSON.stringify(shareUrl)});
            copy.textContent = "Link copied";
          } catch (_) { copy.textContent = ${JSON.stringify(shareUrl)}; }
        });

        const share = document.getElementById("share-link");
        if (share) share.addEventListener("click", async () => {
          const url = ${JSON.stringify(shareUrl)};
          if (navigator.share) { try { await navigator.share({ url }); return; } catch (_) {} }
          try { await navigator.clipboard.writeText(url); share.textContent = "Link copied"; } catch (_) {}
        });
      })();
    </script>
  </body>
</html>`;
};
