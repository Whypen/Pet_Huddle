/**
 * The app door must never become a wall.
 *
 * huddle's web surfaces exist so that someone handed a link can see what they
 * were sent without installing anything. Every rule below protects that: the
 * moment the app prompt blocks, covers, or replaces the primary action, the web
 * tier stops being a bridge and becomes an interstitial — which is the exact
 * pattern this whole surface was built to avoid.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("app promo contract", () => {
  it("routes every app CTA through /get rather than re-detecting the platform", () => {
    const promo = source("src/components/web/AppPromoCta.tsx");
    expect(promo).toContain('href="/get"');
    // A second platform detection would drift from api/open-app.ts.
    expect(promo).not.toMatch(/iPhone|iPad|Android|userAgent/);
    expect(promo).not.toContain("apps.apple.com");
    expect(promo).not.toContain("play.google.com");
  });

  it("keeps the mobile bar dismissible and the dismissal persistent", () => {
    const promo = source("src/components/web/AppPromoCta.tsx");
    expect(promo).toContain("huddle_web_app_bar_dismissed");
    expect(promo).toContain("localStorage.setItem");
    expect(promo).toContain("if (dismissed) return null;");
    expect(promo).toContain('aria-label="Dismiss"');
  });

  it("never lets the promo intercept navigation or cover the page", () => {
    const promo = source("src/components/web/AppPromoCta.tsx");
    expect(promo).not.toContain("preventDefault");
    expect(promo).not.toContain("position: fixed");
    expect(promo).not.toContain("fixed inset");
    expect(promo).not.toContain("z-[");
  });

  it("places the bar below the page title, inside the reading order", () => {
    const chrome = source("src/pages/public/PublicChrome.tsx");
    const introIndex = chrome.indexOf("{showIntro ?");
    const barIndex = chrome.indexOf('<AppPromoCta variant="bar" />');
    expect(introIndex).toBeGreaterThan(-1);
    expect(barIndex).toBeGreaterThan(introIndex);
  });

  it("keeps Create account primary on the auth wall for every intent", () => {
    const wall = source("src/components/auth/AuthWall.tsx");

    // Match the rendered elements, not prose about them — the file discusses
    // both labels in comments, and a substring search finds those first.
    // `[\s\S]` rather than `[^>]`: JSX attributes contain `>` inside arrow
    // functions, which stops a naive attribute match at `onClick={() =>`.
    const createButton = wall.match(/<button[\s\S]{0,400}?className="([^"]*)"[\s\S]{0,120}?>\s*Create account\s*</);
    expect(createButton, "no Create account button rendered").not.toBeNull();
    expect(createButton![1]).toContain("neu-primary");

    const appLink = wall.match(/<a\s+href="\/get"[\s\S]*?className="([^"]*)"[\s\S]*?>\s*Get the app\s*</);
    expect(appLink, "no /get link rendered on the wall").not.toBeNull();
    expect(appLink![1]).not.toContain("neu-primary");

    // And the app never precedes the account decision in the markup.
    expect(wall.indexOf('href="/get"')).toBeGreaterThan(wall.search(/>\s*Create account\s*</));
  });

  it("shows the app on the wall only for intents the app answers better", () => {
    const wall = source("src/components/auth/AuthWall.tsx");
    expect(wall).toContain("APP_BETTER_REASON");
    expect(wall).toContain("appReason ?");
  });

  it("classifies every auth intent as app-better or web-sufficient", () => {
    const intents = source("src/lib/authIntent.ts");
    const surface = source("src/lib/authIntentSurface.ts");
    const declared = intents
      .slice(intents.indexOf("export type AuthIntentType"), intents.indexOf("export type AuthIntent = {"))
      .match(/"([a-z-]+)"/g)
      ?.map((raw) => raw.replace(/"/g, "")) ?? [];
    expect(declared.length).toBeGreaterThan(10);
    for (const intent of declared) {
      // Keys are quoted only when hyphenated, so accept either form.
      const classified = new RegExp(`(^|\\s)"?${intent}"?:\\s*"(app-better|web-sufficient)"`, "m").test(surface);
      expect(classified, `${intent} is unclassified in authIntentSurface.ts`).toBe(true);
    }
  });

  it("keeps posting and reading on the web, never behind the app", () => {
    const surface = source("src/lib/authIntentSurface.ts");
    for (const webIntent of ["post", "reply", "like", "see-alert"]) {
      expect(surface).toMatch(new RegExp(`"?${webIntent}"?:\\s*"web-sufficient"`));
    }
    for (const appIntent of ["broadcast", "notifications"]) {
      expect(surface).toMatch(new RegExp(`"?${appIntent}"?:\\s*"app-better"`));
    }
  });
});

describe("web tier discovery contract", () => {
  it("keeps every brandweb download CTA on the one resolving route", () => {
    for (const file of ["huddle-v5.html", "huddle-shell.js", "live-map.html", "pricing.html", "care.html", "community.html", "about.html", "pet-profiles.html"]) {
      const html = source(`public/brandweb/${file}`);
      expect(html, `${file} still scroll-anchors to #download`).not.toMatch(/href[:=]\s*"\/?#download"/);
    }
  });

  it("links brandweb to the web product from the shared nav, drawer and footer", () => {
    const shell = source("public/brandweb/huddle-shell.js");
    expect(shell).toContain('href: "/social", class: "nav-web"');
    expect(shell).toContain('["/social", "Open huddle on the web"]');
    expect(shell).toContain('["/social", "huddle on the web"]');
  });

  it("puts the web door in the home page's static markup, not only in JS", () => {
    const home = source("public/brandweb/huddle-v5.html");
    expect(home).toContain('href="/social" class="nav-web"');
    expect(home).toContain('<a href="/social" class="btn-ghost">Open huddle on the web →</a>');
    expect(home).toContain('id="two-ways-in"');
  });

  it("keeps the capability matrix honest about what the web cannot do", () => {
    const home = source("public/brandweb/huddle-v5.html");
    expect(home).toContain("Told the moment a pet goes missing nearby");
    expect(home).toContain("Send a Broadcast Alert from where you are");
    expect(home).toContain("Book a verified carer, Care Cam updates");
  });

  it("gives share pages a canonical and structured data", () => {
    const alertPage = source("api/_alertPage.ts");
    expect(alertPage).toContain('<link rel="canonical"');
    expect(alertPage).toContain("SpecialAnnouncement");
    // A resolved alert must not be announced as live.
    expect(alertPage).toMatch(/if \(input\.data\.archived\) return "";/);
    const share = source("api/share.ts");
    expect(share).toContain('<link rel="canonical"');
    expect(share).toContain("DiscussionForumPosting");
    expect(share).toContain("ProfilePage");
    // Adding crawler metadata must not add a redirect. The share stub shows the
    // recipient what they were sent and lets them choose; `sharePreviewContract`
    // owns that rule, and this guards the SEO work from quietly breaking it.
    expect(share).not.toContain("location.replace");
  });

  it("serves district pages on a public path robots.txt allows", () => {
    const vercel = source("vercel.json");
    expect(vercel).toContain('"^/pet-alerts/([^/]+)/([^/]+)/?$"');
    expect(vercel).toContain('"^/get/?$"');
    const robots = source("public/robots.txt");
    expect(robots).toContain("Allow: /pet-alerts/");
    expect(robots).toContain("Disallow: /api/");
    // The district page must never advertise its own /api/ address.
    const area = source("api/area.ts");
    expect(area).toContain("https://huddle.pet/pet-alerts/");
    expect(area).not.toMatch(/canonical[^]{0,80}\/api\//);
  });

  it("indexes the web product and the districts", () => {
    const index = source("public/sitemap.xml");
    expect(index).toContain("<sitemapindex");
    expect(index).toContain("sitemap-pages.xml");
    expect(index).toContain("sitemap-alerts.xml");
    const pages = source("public/sitemap-pages.xml");
    for (const url of ["/social", "/map", "/groups", "/get"]) {
      expect(pages).toContain(`https://huddle.pet${url}`);
    }
  });

  it("emits durable district URLs rather than alert URLs that resolve away", () => {
    const sitemap = source("api/sitemap-alerts.ts");
    expect(sitemap).toContain("/pet-alerts/");
    expect(sitemap).not.toContain("/share/alert_");
  });
});
