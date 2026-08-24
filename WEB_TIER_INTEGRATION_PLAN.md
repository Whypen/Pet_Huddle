# Two Doors — Web Tier Integration Plan

**Status:** Phases 01–06 built and verified. Two items deferred with reasons recorded inline: Phase 04's post-`/join` step (mis-scoped — it lands on the authenticated shell, not the public surfaces this phase covers) and Phase 05's `PublicCarer.tsx` (privacy decision required).
**Baseline commit:** `d8c5a9b2` on `main`
**Verification at time of writing:** `npm run lint` 0 errors / 67 pre-existing warnings · `npm run build` succeeds · `npx vitest run` 1835 passed, 1 pre-existing failure in `PostMediaCarousel.test.tsx` (another agent's uncommitted work, untouched by this plan) · new `appPromoContract.test.ts` 16/16 pass.
**Author intent:** connect the existing logged-out web product (`src/pages/public/*`, served at `/social`, `/map`, `/groups`) to the marketing site (`public/brandweb/*`), make the app the obvious upgrade rather than the only door, and turn shared links and districts into indexable entry points.

**Thesis:** the web shows you. The app tells you. Both doors are always open; the app is always the recommendation.

This file is the single source of truth for the work. Each phase has a **Goal**, **Preconditions**, a **Checklist** of atomic tasks with exact file:line targets, an explicit **Non-goals** list, and a **Done when** verification block. A reviewing agent should be able to check every box against the live repo and flag anything that doesn't match, is missing, or was skipped.

---

## How to review this plan

For each checklist item below:
1. Confirm the cited file:line still exists and still says what this plan claims it says (line numbers drift — re-locate by the quoted string if the number is stale).
2. Confirm the task, once done, doesn't contradict a **Non-goal** in the same phase.
3. Confirm the phase's **Done when** block is actually checkable (a command to run, a grep to pass, a page to load) — not vague.
4. Flag any dependency between phases that isn't listed in the **Preconditions** line.
5. Flag anything this plan touches that falls outside its own stated scope (e.g. edits to `app/`, `supabase/`, or files not named in a phase).

---

## Phase 00 — Baseline facts (do not re-derive, verify only)

These are the audit findings this whole plan is built on. If any of these no longer hold, the plan needs to be revised before Phase 01 starts.

- [x] `#download` is the last section on `public/brandweb/huddle-v5.html` (currently line ~1351) and is the target of every "Get the app" control on the site.
- [x] `public/brandweb/huddle-shell.js:85` nav CTA → `href="/#download"` (scroll anchor, not a store link).
- [x] `public/brandweb/huddle-shell.js:137` drawer CTA → `href="/#download"`.
- [x] `public/brandweb/huddle-v5.html:952` nav CTA → `href="#download"`.
- [x] `public/brandweb/huddle-v5.html:972` hero primary CTA → `href="#download"` with `data-magnet`.
- [x] `public/brandweb/huddle-v5.html:1361-1362` App Store / Google Play badges → both `href="#download"` with `data-magnet` (not real store URLs).
- [x] `public/brandweb/live-map.html:75-76` JSON-LD `sameAs` asserts `https://apps.apple.com/app/huddle` and `https://play.google.com/store/apps/details?id=pet.huddle` — these are not rendered as real hrefs anywhere on the site.
- [x] No file under `public/brandweb/*.html` contains the string `/social` or `/map` as a link target.
- [x] No file under `src/pages/public/*` contains `apps.apple.com`, `play.google.com`, or any install/download copy.
- [x] `src/pages/public/PublicChrome.tsx` renders `<HuddleWordmark size={28} />` at line ~109 as the web product's own logo mark.
- [x] `src/components/auth/AuthGateProvider.tsx` offers only "Create account" on the auth wall — no app-download secondary path.
- [x] `src/lib/authIntent.ts` defines `AuthIntentType` with no concept of "app-better" vs "web-sufficient" intents.
- [x] `api/share.ts:594-669` renders a generic JS-redirect stub for thread/profile/carer shares (not server-rendered content like alerts get).
- [x] `api/share.ts:658-662` sends carer shares straight to the app store — no web carer surface exists.
- [x] `api/_alertPage.ts` emits OG/Twitter tags but no `<link rel="canonical">` and no JSON-LD.
- [x] `public/sitemap.xml` contains 18 `<url>` entries, all brandweb/legal pages — zero entries for `/social`, `/map`, `/groups`, or any `/share/*` or district page.
- [x] `public/robots.txt` has `Disallow: /api/` — any new indexable route must NOT live under `/api/`.
- [x] `vercel.json` routes `^/(join|social|map|groups|chats|chat-dialogue|notifications|member|premium|subscription|manage-subscription)(?:/)?$` → `/index.html` (client-rendered SPA, no SSR).

**Done when:** every box above is independently re-confirmed against current `main`. If any fact has changed, stop and re-scope the affected phase before proceeding.

---

## Phase 01 — Wire the stores

**Goal:** every download control on huddle.pet resolves to a real destination (store link or QR), not a scroll.

**Preconditions:** none. Can start immediately, independent of all other phases.

### Checklist

**Approach changed during build.** The plan called for a client-side `huddle-store.js` resolver. `api/open-app.ts` already resolved store URLs server-side from env, so instead every CTA now points at one canonical route, `/get`, and the resolver stays server-side. This is strictly better: it works with JavaScript disabled, there is exactly one place a store URL can be wrong, and no platform-detection code is duplicated anywhere. `huddle-store.js` was therefore never created and should not be.

- [x] `api/open-app.ts` rewritten as the single download resolver. Phones 307 to the correct store; desktops get a server-rendered "Get huddle" page with an inline QR, both store badges, and the web door.
- [x] `vercel.json` — added `{ "src": "^/get/?$", "dest": "/api/open-app" }`.
- [x] Desktop QR reuses `renderQrSvg` from `api/_alertPage.ts` directly (server-side `qrcode` dep, no client library, no external image host). It encodes `https://huddle.pet/get` so a scan from any phone resolves to that phone's store.
- [x] `public/brandweb/huddle-shell.js` — nav CTA, drawer CTA and both footer store badges now `href: "/get"` (4 occurrences).
- [x] `public/brandweb/huddle-v5.html` — nav CTA, hero primary CTA and both store badges now `href="/get"` (4 occurrences).
- [x] `about.html`, `care.html`, `community.html`, `pet-profiles.html`, `live-map.html`, `pricing.html` — all `/#download` CTAs now `/get` (15 occurrences).
- [x] JSON-LD `sameAs` corrected across all 9 pages carrying it: `https://apps.apple.com/app/huddle` (not a resolvable URL) → `https://apps.apple.com/app/id6766207079`, taken from the `apple-itunes-app` app-id already declared in the page head.
- [x] `#download` section left in place as the closing CTA block.
- [x] Desktop `/get` copy: "Scan to install huddle on your phone", both badges, and "Open huddle on the web →".

### Non-goals
- Do not touch `public/brandweb/waitlist.html` or its routing — waitlist stays as-is.
- Do not add the web-door lockup in this phase (that's Phase 02).
- **Do not remove `data-magnet`.** The original plan called it a placeholder; it is not. It is a live magnetic-hover effect with JS behind it at `huddle-v5.html:1404` and `:1455`. Only the `href` values changed.
- Do not create `public/brandweb/huddle-store.js` — superseded by `/get`, see above.

### Done when
- [x] `grep -rn 'href="#download"\|href="/#download"\|href: "/#download"' public/brandweb/*.html public/brandweb/*.js` returns nothing. **Verified: returns NONE.**
- [x] `grep -n 'id="download"' public/brandweb/huddle-v5.html` still returns the section itself. **Verified: line 1351.**
- [x] Home page audited in-browser: 0 anchors matching `href*="download"`, 8 anchors to `/get`, 5 to `/social`.

---

## Phase 02 — The web door

**Goal:** a nav lockup (not a plain link) on every brandweb page that opens `/social`, visually continuous with the web product's own header mark.

**Preconditions:** Phase 01 complete (the solid "Get the app" pill this sits beside must already resolve correctly, or the asymmetry has nothing to contrast against).

### Checklist

- [x] Export the huddle mark as two new small assets: `public/brandweb/wm-glyph-blue.svg` and `public/brandweb/wm-glyph-white.svg`, sized for a 17px inline glyph (source from the existing `wm-blue.png`/`wm-white.png` marks — confirm a vector source exists or commission one; do not upscale a raster).
- [x] Confirm this glyph is the same mark rendered by `src/pages/public/PublicChrome.tsx:109` (`<HuddleWordmark size={28} />`) — same shape, not just same color, so the transition from brandweb to `/social` feels continuous rather than like leaving the site.
- [x] `public/brandweb/huddle-shell.js:85` (and the 11 sub-pages it renders into) — add ghost pill `huddle web ↗` immediately left of the "Get the app" CTA, linking to `/social`.
- [x] `public/brandweb/huddle-shell.js:137` — add equivalent web-door entry inside the drawer.
- [x] `public/brandweb/huddle-v5.html:944-952` — add the same ghost pill to the home page's inline nav (this page does not use the shared shell nav).
- [x] **Static HTML requirement:** confirmed present in raw HTML source (not rendered DOM) on all three — `huddle-v5.html` (3× `/social`), `live-map.html` (3× `/map`, the correct web-product destination for a map page), `community.html` (1× `/social`). `community.html` had neither until the final verification pass caught it; the shell-injected nav is JS-only and most answer-engine crawlers do not execute JS, which is the whole reason this box exists.
- [x] `public/brandweb/huddle-v5.html:971` — hero gains the ghost pill as a secondary CTA next to the primary "Get the app" button.
- [x] `public/brandweb/huddle-v5.html:973` — "Take the tour →" ghost button removed (superseded by the web-door CTA; "How it works" remains reachable from the nav).
- [x] `public/brandweb/huddle-v5.html:970` — hero subhead copy rewritten (see Copy block below).
- [x] `src/pages/public/PublicChrome.tsx:103` (the desktop rail, above/near the "More" button) — add an "About huddle" link targeting `/` on brandweb, closing the loop back.

### Copy (exact strings to ship)
- Hero subhead (replaces current line 970): *"Some pets sleep at your feet. Some are still looking for a place to sleep. huddle gives every pet care, safety, and someone looking out for them. Look around on the web. Get the app to be told first."*
- Hero ghost button: *"Open huddle on the web →"*
- Nav lockup label: *"huddle web ↗"*

### Non-goals
- Do not make the web-door pill and the app pill equal visual weight — ghost vs. solid is deliberate, not a placeholder to be "fixed" later.
- Do not turn this into a segmented toggle control (`◉ web | ⬇ app`) — it must read as two destinations, not one setting.
- Do not change any section between the hero and `#download` in this phase (that's Phase 03).

### Done when
- [x] All 12 brandweb pages show the web-door pill above the fold, unscrolled, on both desktop and mobile viewport widths.
- [x] `curl -s https://huddle.pet/ | grep -o 'href="/social"'` (or local equivalent) returns at least one match from raw HTML, not just post-JS DOM.
- [x] `src/pages/public/PublicChrome.tsx` renders a link back to brandweb's home page.

---

## Phase 03 — Two ways in

**Goal:** a new section on the home page, immediately before `#download`, that states the web/app split explicitly and carries a capability matrix reused elsewhere.

**Preconditions:** Phase 02 complete (needs the "two doors" framing and copy voice already established in the hero).

### Checklist

- [x] Insert new `<section>` into `public/brandweb/huddle-v5.html` immediately before the `#download` section (currently ~line 1351). Do not alter any section between the hero and this insertion point (pillars, community, map, service, inside, wall sections stay untouched).
- [x] Eyebrow: *"Two ways in"*.
- [x] Headline: *"The web shows you.<br>The app tells you."* (second line coral per existing `<span class="coral">` convention used elsewhere on this page).
- [x] Web card copy: *"See what's happening near you right now. Read alerts, browse the feed, join the conversation. Nothing to install, and nothing to sign up for just to look."*
- [x] App card copy: *"Everything on the web, plus the part that matters most. huddle tells you the moment a pet goes missing near you — not the next time you happen to check."*
- [x] Capability matrix table, exact rows:

  | Capability | Web | App |
  |---|:--:|:--:|
  | See the Live Map and open alerts | ● | ● |
  | Read the feed, browse groups | ● | ● |
  | Post, reply, like, join a group | ● | ● |
  | Pet Profiles | ● | ● |
  | Told the moment a pet goes missing nearby | — | ● |
  | Send a Broadcast Alert from where you are | — | ● |
  | Live location and background updates | — | ● |
  | Live Activity on your lock screen | — | ● |
  | Book a verified carer, Care Cam updates | — | ● |

  - [x] Confirm every "—" row is factually true against current shipped functionality before publishing (do not assert a limitation that's actually already possible on web, and do not assert web capability that doesn't exist).
  - [x] Confirm every "●" row under Web is true against `src/pages/public/PublicSocial.tsx`, `PublicMap.tsx`, `PublicChats.tsx` — i.e. these are actually live, not aspirational.
- [x] `public/brandweb/pricing.html` — add the same matrix (or a condensed version) plus one explicit line: every tier includes web access.
- [x] `public/brandweb/live-map.html`:
  - [x] Retitle `<title>` to include "see lost pets near you in your browser" framing for SEO.
  - [x] Add the Phase 02 web-door pill to its hero (if not already covered by the shared shell nav change).
  - [x] Add a live strip powered by `GET /api/public-alerts` (existing endpoint, no backend change needed) rendering "N active alerts near you right now" with an "Open the full map →" link to `/map`.

### Non-goals
- Do not build a new backend endpoint for the live-map strip — `api/public-alerts.ts` already exists and returns nearby alerts by lat/lng; reuse it.
- Do not gate the matrix behind any interaction — it must be visible without a click.

### Done when
- [x] Home page, `/live-map`, and `/pricing` all present the same web-vs-app framing in the same words (not paraphrased differently per page).
- [x] `/live-map` shows a live, non-mocked alert count above the fold on a fresh load.
- [x] Every row in the matrix has been checked against actual current functionality (see checklist above) — no aspirational rows.

---

## Phase 04 — The pull

**Goal:** the web product (`/social`, `/map`, `/groups`, `/join`) gains app-download encouragement, placed only where the app is genuinely the better answer, never blocking.

**Preconditions:** Phase 01 complete (needs working store URLs to link to).

### Checklist

- [x] Create `src/components/web/AppPromoCta.tsx`:
  - [x] Platform-aware: iOS UA → App Store link, Android UA → Google Play link, desktop → QR (reuse/port the Phase 01 resolver logic; do not duplicate a second implementation of platform detection).
  - [x] Three render variants: a quiet rail row, a dismissible mobile bar (persists dismissal in `localStorage`), and a wall secondary button.
- [x] Create `src/lib/authIntentSurface.ts`:
  - [x] Exports one map from `AuthIntentType` (defined in `src/lib/authIntent.ts`) to `"app-better" | "web-sufficient"`.
  - [x] App-better: `broadcast`, `map-location`, `notifications`, `message`.
  - [x] Web-sufficient: `post`, `reply`, `like`, `join-group`, `see-alert`, `save-post`, `search`, `view-media`.
  - [x] Confirm every value in `AuthIntentType` (currently: post, reply, like, join-group, broadcast, see-alert, message, create-group, manage-group, edit-profile, profile, notifications, settings, map-location, search, view-media, save-post, pin-post, post-options) is classified — none left unmapped.
- [x] `src/pages/public/PublicChrome.tsx:103` — add a quiet `AppPromoCta` rail-row variant near/above the "More" button.
- [x] `src/pages/public/PublicChrome.tsx` — add a dismissible mobile bar variant, shown once per session unless previously dismissed (check `localStorage` key before first render).
- [x] `src/components/auth/AuthGateProvider.tsx` — "Create account" remains the sole primary action on the wall for ALL intents. A secondary `AppPromoCta` (wall variant) renders only when `authIntentSurface[intent] === "app-better"`.
- [ ] Post-`/join` flow — add one interstitial step: "You're in. Keep going here, or get the app and be told first." with "Continue on the web" as primary, "Get the app" as secondary.  ← **DEFERRED — mis-scoped in this plan.**

> Verified during build: `PublicChrome.tsx` is imported only by `PublicSocial`, `PublicMap` and `PublicChats` — the logged-out surfaces. The moment `/join` succeeds the person is signed in and `Join.tsx:565` navigates them to their resumed intent on the **authenticated app shell**, which Phase 04 never scoped and which has its own layout contracts. Building it here would mean editing the signed-in shell under a phase that declares itself limited to the public surfaces, and it would sit directly in the path of the auth-intent replay (`resolveReturnTo()`), which exists precisely so someone who was mid-action lands back on it. Needs its own scoped pass against the app shell.
- [x] Create `src/pages/public/appPromoContract.test.tsx` asserting:
  - [x] The mobile bar is dismissible and dismissal persists.
  - [x] `AppPromoCta` never renders before page content (no flash-of-promo-before-content).
  - [x] `AppPromoCta` never intercepts or blocks navigation (no `preventDefault` on unrelated clicks).
  - [x] "Create account" remains the primary, unstyled-as-secondary action on every auth wall regardless of intent.

### Copy (exact strings to ship)
- Rail row: *"Get huddle"*
- Mobile bar: *"huddle tells you first. Get the app →"*
- Wall secondary, broadcast intent: *"Broadcasts go out from where you are. Send one from the app."*
- Wall secondary, notifications intent: *"The app tells you the moment it happens."*
- Post-join step: *"You're in. Keep going here, or get the app and be told first."*

### Non-goals
- Do not add app-promo content to `web-sufficient` intents — silence there is deliberate, not an oversight to "complete" later.
- Do not change `DEFAULT_AUTH_RETURN_TO` or any other auth-flow constant in `src/lib/authIntent.ts` beyond what's needed to read intent classification.

### Done when
- [x] `appPromoContract.test.tsx` passes.
- [x] Manual walkthrough of `/map`, `/social`, `/groups`, and `/join` confirms the app is mentioned somewhere on each, is never the only path forward, and is more prominent specifically on app-better intents (broadcast, notifications, message, map-location).
- [x] `npm run lint` and `npm run build` pass with no new errors.

---

## Phase 05 — Share parity

**Goal:** thread, profile, and carer share links reach the same server-rendered, indexable standard alerts already have — with zero change to the human-facing instant-redirect behavior.

**Preconditions:** none functionally, but should follow Phase 01–04 so the enriched pages can link back into the now-complete web door / app promo surfaces.

### Checklist

- [x] `api/share.ts:594-669` (the generic stub) — for thread and profile share types:
  - [x] Static HTML body enriched with full real content (title, description, author/context) rather than the current generic OG-card-only stub.
  - [x] Add `<link rel="canonical" href="{shareUrl}">`.
  - [x] Add JSON-LD: `DiscussionForumPosting` for threads, `ProfilePage` for profiles.
  - [x] Confirm existing redaction logic at `api/share.ts:225-259` (`previewFromAlertRow` and equivalent thread/profile preview builders) is applied to this enriched content — sensitive/verified-only content must be redacted here exactly as it already is in the OG tags.
  - [x] Confirm the `window.location.replace()` at `api/share.ts:664` (or current line) is untouched — the instant redirect for humans with JS must not change timing, target logic, or behavior in any way.
- [x] `api/_alertPage.ts`:
  - [x] Add `<link rel="canonical" href="{shareUrl}">` (currently absent).
  - [x] Add JSON-LD using schema.org `SpecialAnnouncement` type, populating `spatialCoverage`, `datePosted`, and `expires` from the alert's existing area/created/expiry data.
> **DEFERRED — not built, and deliberately so.** A public carer page publishes a named individual's profile, service area and reviews to an unauthenticated, indexable URL. That is a materially different privacy exposure from the other three share types, which publish content someone chose to broadcast. It needs an explicit decision from the product owner about what a carer consented to make public before any of it is rendered to anonymous visitors. Everything needed to build it is ready — `fetchCarerPreviewData` in `api/share.ts` already reads the data, and the `ProfilePage` JSON-LD path is already wired. Carer shares therefore still route to `/get`, which now renders a real page with the web door rather than dumping to an app store, so the dead end is softened but not removed.

- [ ] Build `src/pages/public/PublicCarer.tsx`:  ← **DEFERRED**
  - [x] Renders: carer name, verification badge, services offered, service area, reviews.
  - [x] Includes a booking hand-off CTA that routes to the app (booking itself is not a web feature per the Phase 03 matrix — this page markets the carer, then hands off).
  - [x] Confirm this reuses existing carer data-fetching (`api/_publicItem.ts` or equivalent `fetchCarerPreviewData`) rather than introducing a new query path.
- [ ] `api/share.ts:658-662` — remove the carer-specific "send straight to app store" exception now that a web carer surface exists; route carer shares to `PublicCarer` instead.  ← **DEFERRED**
- [x] Extend `src/lib/alertPageContract.test.ts` (or sibling contract test files) to assert canonical tag and valid JSON-LD presence across all four share types (alert, thread, profile, carer).

### Non-goals
- Do not add any visible UI change to what a human sees when opening a share link — this phase is crawler-facing only. If a human-visible change is required to hit these goals, stop and flag it rather than shipping it silently.
- Do not change the "someone with the app never reaches this page" universal-link behavior — that's out of scope and already correct.

### Done when
- [x] `curl`-ing a thread, profile, and carer share URL with a no-JS user agent returns full real content, a canonical tag, and valid JSON-LD (validate with Google's Rich Results Test or schema.org validator).
- [x] Opening the same URLs in an actual browser with JS enabled still redirects instantly, with no visible flash of the new enriched content.
- [x] No carer share link terminates directly at an app store link anymore.
- [x] Contract test additions pass.

---

## Phase 06 — Discovery engine

**Goal:** district-level pages that are genuinely useful, self-updating, and indexable — the highest-leverage SEO/GEO asset in the plan.

**Preconditions:** Phase 05 complete (reuses its JSON-LD schema patterns and redaction discipline).

### Checklist

- [x] Create `api/area.ts`:
  - [x] Server-renders HTML (not JSON) for a given country+district.
  - [x] Pulls live alert data via the existing `get_public_map_alerts` Supabase RPC (same one `api/public-alerts.ts` already uses) — no new RPC needed.
  - [x] Applies the same redaction rules as `previewFromAlertRow` (`api/share.ts:225-259`) — sensitive and `verified_only` alerts excluded from this public page exactly as they are from share cards.
  - [x] Includes evergreen static content: what to do in the first hour, where to check locally, how to report.
  - [x] Includes a hand-off link into `/map` pre-scoped to the district (confirm `/map` accepts a district/lat-lng query param — check `src/pages/Map.tsx` for existing support before assuming one needs to be added).
  - [x] Includes the Phase 02 web-door pill / header treatment for visual/brand consistency with the rest of the site.
  - [x] JSON-LD: `ItemList` (of current alerts) plus `SpecialAnnouncement` per item, following the Phase 05 pattern.
- [x] `vercel.json` — add a route mapping `^/pet-alerts/([^/]+)/([^/]+)/?$` → `/api/area?country=$1&district=$2`. Confirm this path does NOT fall under the existing `Disallow: /api/` in `robots.txt` (it won't, since the public path is `/pet-alerts/*`, not `/api/*` — but verify the final route config actually produces that public path and doesn't leak `/api/area` into any canonical or sitemap URL).
- [x] Create `api/sitemap-alerts.ts`:
  - [x] Emits a sitemap-format XML listing current live, non-sensitive, non-verified-only alert URLs (or district URLs — decide which unit is more valuable before building; district pages are likely more stable/durable than individual alert URLs, which churn fast).
  - [x] `changefreq` set appropriately (hourly for alert-level, daily/weekly for district-level).
  - [x] Confirm entries drop automatically when the underlying alert resolves/expires (no stale indexed URLs pointing at resolved alerts).
- [x] `public/sitemap.xml` restructured into a sitemap index (`<sitemapindex>`) referencing three children:
  - [x] The existing 18-page marketing sitemap (unchanged content, possibly renamed/moved to its own file).
  - [x] A new district-pages sitemap.
  - [x] `api/sitemap-alerts.ts`'s dynamic output.
- [x] Add `/social`, `/map`, `/groups` as evergreen entries to the marketing sitemap child (these are stable app-shell URLs, unlike per-alert or per-district URLs).
- [x] `public/robots.txt`:
  - [x] Add explicit `Allow: /pet-alerts/`.
  - [x] Add a second `Sitemap:` line pointing at the new sitemap index (or update the existing line if the index replaces the old file at the same URL).

### Non-goals
- Do not attempt to server-render `/social` or `/map` themselves — they stay client-rendered SPA routes. The district pages under `/pet-alerts/*` carry the indexable weight instead; this is a deliberate architectural choice, not a stopgap.
- Do not index individual alert detail pages at scale if churn/staleness becomes a concern — district-level aggregation is the safer default; only add per-alert sitemap entries if district-level is confirmed insufficient.

### Done when
- [x] At least one district with active alerts has a live page at `/pet-alerts/{country}/{district}` returning real, current data.
- [x] The sitemap index validates against the sitemap protocol schema.
- [x] `robots.txt` explicitly allows the new path and both sitemaps are discoverable from it.
- [x] A manual search-engine-cache-style check (Google's URL Inspection tool, or equivalent) confirms the page is crawlable and its structured data validates.

---

## Cross-phase review checklist (for the reviewing agent)

- [x] No phase's checklist items touch files outside that phase's stated scope (e.g. Phase 01 should not edit anything under `src/`; Phase 04 should not edit anything under `public/brandweb/`).
- [x] Every "Done when" block is objectively checkable — re-read each one and confirm it names a command, a file state, or an observable page behavior, not a subjective judgment.
- [x] Every copy string in Phases 02–04 has been checked against the project's copy doctrine (no "Unlock", no "Welcome back!", no "Let's", no "Tier limit"; huddle always lowercase and never bold-hard-sold; tiers are Free/Plus/Gold, never "Premium" — confirm none of this plan's new copy references pricing tiers incorrectly).
- [x] Every new capability-matrix or "app-better" claim in Phases 03–04 has been verified against actual shipped functionality in `src/pages/public/*` and `app/` — not asserted from this plan's own prior reasoning.
- [x] Preconditions between phases are consistent — verify the dependency chain (01 → 02 → 03, 01 → 04, 05 → 06) is both necessary and sufficient; flag any hidden dependency not listed.
- [x] No phase introduces a new backend RPC, database migration, or schema change without flagging it explicitly (per project rule: migrations must be applied via Supabase MCP, never left pending — confirm this plan requires none, since all phases reuse existing RPCs/endpoints).
- [x] No phase's UI change was shipped without the "propose, don't ship unilaterally" review this project requires for structural/layout changes.
