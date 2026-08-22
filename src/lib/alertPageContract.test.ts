/**
 * The public alert page is server-rendered HTML shown to strangers, built from
 * user-written text. Three things must hold and none of them are visible in a
 * screenshot:
 *
 *  1. No coordinate ever reaches the page.
 *  2. User text is escaped — titles and descriptions are attacker-influenced.
 *  3. The local-proof line is live data, omitted at zero rather than printed.
 *
 * (Lives under src/ because vitest.config.ts only scans src/ and app/src/, and
 * that file has uncommitted changes from another agent.)
 */

import { describe, expect, it } from "vitest";
import { cappedOgImage, renderAlertPage, renderQrSvg, type AlertPageData } from "../../api/_alertPage";

const baseData: AlertPageData = {
  id: "a1",
  title: "Milo",
  description: "Grey tabby, very shy",
  photoUrl: "https://cdn.example/milo.jpg",
  alertType: "Lost",
  area: "Sheung Wan, Hong Kong",
  country: "Hong Kong",
  createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
  archived: false,
  nearbyCount: 3,
};

const render = (overrides: Partial<AlertPageData> = {}) =>
  renderAlertPage({
    data: { ...baseData, ...overrides },
    shareUrl: "https://huddle.pet/share/alert_a1",
    staticMapImage: "https://api.mapbox.com/styles/v1/whypen/x/static/114.15,22.28,12,0/640x260@2x",
    iosDownloadUrl: "https://apps.apple.com/app/id6766207079",
    androidDownloadUrl: "https://play.google.com/store/apps/details?id=pet.huddle",
    ogImage: "https://cdn.example/milo.jpg",
    title: "Milo — lost near Sheung Wan",
    description: "Grey tabby, very shy",
    qrSvg: "<svg id=\"qr\"></svg>",
  });

describe("OG image capping", () => {
  it("routes a Supabase Storage photo through the render endpoint with width and quality", () => {
    const raw = "https://x.supabase.co/storage/v1/object/public/alerts/milo.jpg";
    const capped = cappedOgImage(raw, "fallback.jpg");
    expect(capped).toContain("/storage/v1/render/image/public/");
    expect(capped).toContain("width=1200");
    expect(capped).toContain("quality=80");
  });

  it("leaves non-Supabase URLs alone rather than guessing", () => {
    const raw = "https://cdn.elsewhere.com/milo.jpg";
    expect(cappedOgImage(raw, "fallback.jpg")).toBe(raw);
  });

  it("falls back when there is no photo", () => {
    expect(cappedOgImage(null, "fallback.jpg")).toBe("fallback.jpg");
  });
});

describe("desktop QR", () => {
  it("generates an inline SVG for the share URL", async () => {
    const svg = await renderQrSvg("https://huddle.pet/share/alert_a1");
    expect(svg).toContain("<svg");
    expect(svg).toContain("#2145CF");
  });

  it("embeds the QR on the page and keeps Copy link beside it", () => {
    const html = render();
    expect(html).toContain(`<svg id="qr">`);
    expect(html).toContain("scan to open this alert on your phone");
    expect(html).toContain("Copy link");
  });
});

describe("public alert page", () => {
  it("renders the alert with area and relative time", () => {
    const html = render();
    expect(html).toContain("Milo");
    expect(html).toContain("Sheung Wan, Hong Kong");
    expect(html).toContain("2 hours ago");
    expect(html).toContain("LOST");
  });

  it("publishes no coordinate for the alert itself", () => {
    const html = render();
    // The static map URL legitimately carries the DISTRICT centroid; the alert's
    // own position must appear nowhere. Assert no lat/lng field names leak.
    expect(html).not.toMatch(/\blatitude\b/);
    expect(html).not.toMatch(/\blongitude\b/);
    expect(html).toContain("Exact location is visible to members");
  });

  it("omits the local-proof line entirely at zero rather than printing 0", () => {
    expect(render({ nearbyCount: 0 })).not.toMatch(/0 alerts raised near/);
    expect(render({ nearbyCount: 0 })).not.toMatch(/raised near/);
    expect(render({ nearbyCount: 1 })).toContain("1 alert raised near");
    expect(render({ nearbyCount: 3 })).toContain("3 alerts raised near");
  });

  it("replaces the whole page when the alert is archived", () => {
    const html = render({ archived: true });
    expect(html).toContain("This alert has been resolved");
    // No stale detail alongside the resolved state.
    expect(html).not.toContain("Grey tabby, very shy");
    expect(html).not.toContain("LOST");
  });

  it("escapes user-written text", () => {
    const html = render({
      title: '<script>alert(1)</script>',
      description: '" onerror="alert(2)',
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot; onerror=");
  });

  it("uses blue for Caution — this is a page, not a map marker", () => {
    expect(render({ alertType: "Caution" })).toContain("background:#2145CF");
    expect(render({ alertType: "Lost" })).toContain("background:#EF4444");
    expect(render({ alertType: "Stray" })).toContain("background:#EAB308");
    expect(render({ alertType: "Others" })).toContain("background:#A1A4A9");
  });

  it("does not auto-redirect to the app store", () => {
    const html = render();
    // The old stub did `location.replace(store)` after 80ms, which defeated the
    // entire purpose of the page.
    expect(html).not.toContain("location.replace");
  });

  it("keeps the OG, twitter and apple-itunes-app tags", () => {
    const html = render();
    expect(html).toContain('name="apple-itunes-app"');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('name="twitter:card"');
  });
});
