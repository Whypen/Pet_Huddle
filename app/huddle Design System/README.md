# huddle Design System

> The pet-centric super-app that huddles pet owners, carers, and neighbours into one trusted, hyper-local community.

---

## Product context

**huddle** is a hybrid "Super App" for pet owners. It stitches three product surfaces into a single mobile-first experience:

1. **Community & Social** — a hyper-local social network for pet owners, including threads, a people/pet Discover feed, group chats, and public profiles.
2. **Marketplace & Services** — a two-sided marketplace for pet-care services (walking, sitting, boarding), with an in-app service chat, booking lifecycle (pending → booked → in-progress → complete), and Stripe checkout.
3. **Safety & Logistics** — emergency broadcast ("lost pet", hazards) with radius/time controls, verified identities, an AI Vet assistant, and a Hazard Scanner.

A **Premium** tier unlocks higher quotas, advanced filters, and priority discovery. A separate **Gold** tier adds Stars (direct-chat superpowers), family quota sharing, and longer/wider broadcasts.

### Products represented in this system

- **`mobile` app** — the production product. React Native + Expo + NativeWind. Surfaces: Home, Auth, Chats, Notifications, Map, Premium, Pet Profile, Settings.
- **`web` app** — mirrored web client. React + Vite + Tailwind + shadcn/ui. Canonical styling lives here (`src/styles/tokens.css`, `src/styles/global.css`, `src/index.css`).
- **`app` (Expo sibling)** — an older Expo codebase retained for reference.

This design system leans on the **web** codebase as the source of truth for visual tokens (it's the richest/most complete), and uses the **mobile** codebase for interaction patterns and tone.

---

## Sources

- **Codebase (attached):** `Pet_Huddle/`
  - Web tokens & globals: `Pet_Huddle/src/styles/tokens.css`, `Pet_Huddle/src/styles/global.css`, `Pet_Huddle/src/index.css`
  - Web components: `Pet_Huddle/src/components/ui/` (NeuControl, NeuChip, FormField, GlassModal, GlassSheet, ComposerDock, NeuButton, InsetPanel…)
  - Mobile theme: `Pet_Huddle/mobile/src/theme/tokens.ts`
  - Mobile components: `Pet_Huddle/mobile/src/components/` (CTAButton, InputField, Header, HText, UpsellBanner)
  - Brand constants: `Pet_Huddle/src/lib/brand.ts`
  - Brand book: `Pet_Huddle/src/assets/huddle_brand_book_v4.docx` (not parsed here — referenced for copy voice)
- **Uploaded logos:** `uploads/huddle transparent logo.png` (mark), `uploads/huddle name transparent.png` (wordmark) — copied into `assets/`.
- **Uploaded brand illustrations:** `Pet Care.jpg` (Friendly Outliner reference), `07-daniel-kwok.svg`, `08-victor-cheng.svg` (vector line illustrations) — copied into `assets/`.
- **Uploaded social posts:** Instagram story set + two story-sized campaign layouts ("All Things Pet Care, In One Place.", "Because They're Family, We Build Safety.") — copied into `assets/`.
- **Uploaded fonts:** Urbanist 300/400/500/600/700/800 + 400/600 italic (TTF) — copied into `fonts/`.
- **User-provided brief:** brand tone ("Calm, Confident, & Human"), philosophy ("Restrained Neumorphism + Glassmorphism", "Editorial not Dashboard"), illustration style ("The Friendly Outliner"), and the canonical palette.
- **Native app modal primitives:** `native-modal-primitives.tsx` and `native-modal-primitives.md` are the canonical `/app` modal/input/button source for app-owned modals. Reuse or port these primitives for close button placement, modal card edge/radius/shadow/padding, input placeholder/inner padding/focus/error states, error/subtext spacing, button size/radius, side-by-side actions, and scroll-safe modal behavior.

---

## Content Fundamentals

**Voice: Calm, Confident, & Human.** The product talks to you the way a trusted neighbour does — not a dashboard and not a drill sergeant. It's minimal, supportive, and image-led.

- **Person.** First-person plural *we* for the brand ("We verify every member"); second-person *you* for the reader. Avoid third-person "the user".
- **Casing.** Sentence case everywhere — buttons, labels, section titles. Title Case only for proper nouns (Premium, Gold, Animal Friend, AI Vet, Emergency Broadcast). The brand itself is always lowercase **huddle**, never "Huddle" in UI copy. (The one exception: screen readers / logos / legal headings use "Huddle".)
- **Button verbs.** Short, direct, specific — `Add Pet`, `Create Thread`, `Secure Privileges`, `Scan for Hazards`, `Sign In`, `Sign Up`. Avoid generic `Submit` / `OK`.
- **Labels.** Single noun where possible — `Email`, `Password`, `Phone`. No colon after labels.
- **Placeholders.** Italic, soft tertiary text, in examples not echoes. `+852...` for phone; `Email` for email; `Password` for password.
- **Errors.** Plain, no shame. "Enter a valid email." "Password must be at least 6 characters." Never capitalised ALL-CAPS; never "Invalid input!!".
- **Empty states.** Encouraging, never scolding. "No upcoming events" — not "You haven't added anything."
- **Tips & wisdom.** Species-specific pet-care wisdom on the home screen, written like a calm friend. Keyed like `home.wisdom.dog.1`…`home.wisdom.other.4`.
- **Urgency.** The word *Emergency* (orange `#F97316`) is reserved for lost pets and safety broadcasts only. Everything else — including paywall, form errors, discards — uses the cooler validation-red `#EF4444` or stays neutral. **No alarmist language.**
- **Ampersand & em-dash.** `&` allowed in short labels ("Terms & Privacy"); em-dash in long-form. Middle-dot `·` separates metadata ("Dog · Labrador").
- **Emoji.** Not used in product UI. Only real asset illustrations (WaveHandCTA, Polaroid, Badge) stand in for expressive moments. If emoji appears at all it's user-generated content, never brand voice.
- **Numbers.** Money is `$9.99 / mo`, never "USD 9.99". Distances in km ("20km"), time in hours ("72h"). Dates: `DD MMM` ("24 Apr").

**Examples lifted from the product:**

- Home empty state pet card tip: *"Next event: No upcoming events"* (not "You have no events").
- Auth consent: *"I have read and agree to the Terms of Service and Privacy Policy."*
- Premium CTA: *"Secure Privileges"* (confident, not pushy).
- Broadcast pill: *"72H"* or *"10km · 24h"* (compact, factual).
- Role pill: *"Animal Friend"* (for members who don't have a pet yet — inclusive, not exclusionary).

---

## Visual Foundations

### Philosophy

A hybrid of **Restrained Neumorphism** and **Glassmorphism** called a *"lifestyle-premium"* system. Buttons and chips feel physical and tactile (soft 3D bevel + neutral grey drop shadow, never blue-tinted). Overlays and sheets feel airy and modern (frosted translucent white with subtle blue-tinted shadow). The two languages never collide — content sits on glass, controls sit on top of glass.

The visual doctrine is **Editorial, not Dashboard**: image-led, generous whitespace, centered wordmarks, soft cards over hard grids. Avoid the KPI-tile look of analytics dashboards.

### Colors

- **Huddle Blue `#2145CF`** — the primary. Logo fill, primary CTA, active icon, primary-tier indicators, focus rings.
- **Coral Orange `#FF7F50`** — hero display typography, warmth moments, email accents. Never a button background.
- **Lime Green `#BFFF00`** — email header/footer only. Lifestyle vibrancy. Does not appear in core app UI.
- **Premium Gold `#CFAB21`** — Gold tier ONLY. Verified badges, Gold tier paywall CTA, Gold tier block. Forbidden as a generic accent.
- **Primary Text `#424965`** — all headings and body.
- **Subtext `#4A4A4A`** — captions, metadata.
- **Emergency Red `#F97316`** — warm orange-red. Safety broadcasts ONLY. Not a generic danger.
- **Validation Red `#EF4444`** — form errors and destructive confirmations.

### Type

- **Urbanist** exclusively for Latin text. Weights 300/400/500/600/700/800 + 400/600 italic.
- **Microsoft YaHei UI** fallback for CJK (huddle has a zh-TW locale).
- Hero display: **60px / 600** in Coral Orange, tight leading (1.1), slight negative tracking (-0.02em).
- H1: 32px / 700. H2: 24px / 700. H3: 20px / 700. Body: 16px / 400. Label: 14px / 600. Helper: 12px. Meta: 10px uppercase with 0.08em tracking.
- Minimum body size on mobile: 14px. Minimum button size: 44×44 touch target.

### Backgrounds

- **In-app canvas = `#FFFFFF` flat.** No full-bleed image backgrounds on content screens. No gradients on the canvas. Product UI is image-led at the *content* level (pet cards, avatars, profile covers), not the *chrome* level.
- **Social/marketing canvas = Huddle Blue `#2145CF` or Torn Paper `#F5F3EE`.** Social posts use a high-contrast *blue solid + torn paper* construction. The torn-paper edge is jagged, off-white, with a soft darker undershadow.
- Pet cards and profile hero units are full-bleed photos with a top-to-bottom **foreground/80 → transparent** scrim so caption chips stay legible.
- Illustrations are always the house **Friendly Outliner** style (see below) — never generic stock, never AI slop.
- No repeating patterns or textures inside the product. A subtle paper-grain texture is allowed on marketing surfaces only.
- Asterisk `*` (Huddle Blue) is a recurring decorative mark on marketing — it sits beside titles as a proofing/editorial cue, like a footnote marker.

### Animation

- **Duration scale:** 75ms / 150ms / 200ms / 300ms / 350ms. Nothing longer than 350ms.
- **Easing:** `ease-out = cubic-bezier(0.22, 1, 0.36, 1)` for entrances; `ease-std = cubic-bezier(0.4, 0, 0.2, 1)` for state; `ease-in` for exits. **No spring/bounce** — any cubic-bezier with a parameter >1.0 is banned (no overshoot).
- **Patterns:** subtle scale pulse (1 → 1.02 → 1) on primary CTAs (1s loop, disables when disabled), soft shimmer on skeletons (1400ms linear), dot-pulse for AI-Vet thinking (800ms), sheet slide-in from bottom (350ms), modal scale (0.96 → 1, 300ms).
- **Press state:** `transform: scale(0.97)` + bevel inversion on neumorphic controls. 150ms.
- **Reduced motion:** enforced globally — all transitions collapse to 0.01ms.

### Hover / press states

- **Hover** (web): soft background tint — `rgba(255,255,255,0.28)` for tertiary; no color shift for primary/gold/danger (they already have a strong surface).
- **Press:** neumorphic bevel inversion (outer shadow → inner shadow) + scale(0.97). Never opacity fade alone — the bevel flip is the key affordance.
- **Disabled:** opacity 0.38–0.5, no shadow, pointer-events off.
- **Focus-visible:** 2px solid `--huddle-blue` outline with 2px offset, composed with the resting shadow. WCAG 2.1 AA.

### Borders, shadows, elevation

- **Elevation tiers.** E0 = flat canvas; E1 = content card (`--shadow-e1`, soft dark drop); E2 = sheet/composer (glass or light elevated); E3 = active modal (glass or max elevated).
- **Neumorphic shadow family** uses **neutral cool grey** `rgba(163, 168, 190, 0.28)` for the drop. Never blue-tinted — this is a hard rule from the contract.
- **Glass shadow family** uses **blue-tinted** `rgba(0, 87, 255, 0.12)` — this is permitted *only* on glass surfaces.
- Content cards: 1px border `rgba(0,0,0,0.04)`, radius 12px, shadow E1.
- Glass cards: 1px border `rgba(255,255,255,0.55)`, radius 20px, backdrop-filter blur(18px).
- Thin dividers: 1px `rgba(255,255,255,0.30)` on glass; `rgba(66,73,101,0.10)` on opaque.

### Capsules vs. protection gradients

- **Capsule pills** (radius 9999px) carry metadata: species ("Dog · Labrador"), age, weight, "72H", "20km". Always neumorphic chip or translucent `white/20 backdrop-blur` chip when over imagery.
- **Protection gradients** (top-to-bottom black scrim) appear over every photo where caption chips must remain legible — not decorative, functional only.

### Layout

- **Mobile-first.** Viewport cap `--app-max-width: 430px`. The web app renders inside this rail on desktop.
- **Safe-area aware.** Bottom nav reserves `env(safe-area-inset-bottom)` + nav height (64px).
- **Fixed chrome:** top header 56px, bottom nav 64px, sticky CTA 56px. Content scrolls between.
- **8pt grid** for all spacing: 4 / 8 / 12 / 16 / 24 / 32 / 40 / 48 / 64.
- **Centered wordmark** in the top header — editorial signal, not left-aligned with a hamburger.
- **z-index:** fab 30, nav 40, backdrop 39, modal 40, progress 50, toast 60.

### Transparency & blur

- **Permitted backdrop-filter consumers only:** `.glass-card`, `.glass-l2`, `.glass-l3`, `.glass-bar`, `.glass-nav`. Ad-hoc `backdrop-filter: blur(…)` is forbidden.
- Glass opacity range: E1 0.58–0.65, E2 0.68–0.76, E3 0.78–0.86.
- Blur range: E1 16–20px, E2 22–26px, E3 28–36px.
- When glass overlaps media/maps/photos, a `.glass-scrim` (top→bottom white gradient) is added so text passes AA contrast.

### Corner radii

- 8 (buttons/inputs), 12 (cards), 14 (form fields), 16 (glass cards), 20 (glass L1), 24 (sheets), 28 (modals), 9999 (pills).

### Card anatomy

- **Content card:** white background, 1px hairline border `rgba(0,0,0,0.04)`, shadow E1, radius 12. Inside: 16px padding, 8pt vertical rhythm.
- **Pet card:** full-bleed photo (4:5 aspect), bottom content with protection gradient + translucent white/20 chips. Animated gentle lift (y: 0 → -1.5 → 0, 3.2s infinite) when it's the selected card.
- **Glass card:** translucent white, inset top-highlight (1px), radius 20, blue-tinted shadow.

### Imagery

- **Color vibe.** Warm, natural, outdoor. Real pet photography. No cool-blue Instagram filters, no black & white, no heavy grain.
- **Treatment.** Always `object-cover` center. Protection gradient overlay when text sits on top.
- **Fallback.** When no pet photo exists: `linear-gradient(br, var(--huddle-blue), var(--huddle-blue-light))`.

---

## Illustration — "The Friendly Outliner"

huddle has one house illustration style. It carries personality, not detail.

- **Line.** Monolinear ink (`--ink: #0E0E10`), medium-thick stroke (~2.25px at 1000px canvas), **rounded terminals**, consistent weight. No tapered calligraphy, no varied stroke widths. Strokes make closed silhouettes — humans, dogs, cats, phones, houses, hearts — with tiny expressive marks (dots for eyes, short lines for whiskers/motion).
- **Fills.** Flat bold "pop" colors — **Huddle Blue `#2145CF`**, **Coral Orange `#FF7F50`**, or **Lime Green `#BFFF00`** — applied selectively to one or two shapes per illustration. Fills are *intentionally offset/misaligned* from the outlines by 2–4px to create a handmade, screen-printed feel. Not every shape gets a fill; often the dog is unfilled line-only while the human wears a blue sweater.
- **Palette inside an illustration.** Ink + paper + **one** pop color is the default. Two pop colors is a stretch; three is too much.
- **Character roster.** A short-haired woman with a blunt fringe, a shaggy golden dog, a scruffy terrier, a calico cat, a puppy in a cardboard box. Consistent faces: two dot eyes, optional smile curve, occasional eyebrow. No rendered skin-tones — faces are paper-white with ink features.
- **Sizing & framing.** Illustrations sit on **torn-paper rectangles** over blue or white backgrounds. When inline in UI, they sit at 120–200px wide with transparent background.
- **Don't:** add soft gradients, drop shadows, textured shading, isometric perspective, or photorealism. Don't mix this style with emoji. Don't redraw using Lucide icons — icons and illustrations have different jobs.

Reference assets: `assets/illustration-pet-care.jpg` (the canonical style reference), `assets/illustration-daniel-kwok.svg`, `assets/illustration-victor-cheng.svg`.

---

## Social & Marketing — "Editorial Cleanliness"

Social posts are image-led and vertical-first. They avoid the dashboard grid look entirely.

- **Canvas.** 1080×1920 (story) or 1080×1350 (feed post). Full-bleed Huddle Blue with a **torn-paper block** (~8–18% of height) at top and/or bottom. The torn edge is irregular, drawn as a jagged SVG path, not a clean line.
- **Header cue.** Small asterisk `*` in Huddle Blue top-left, paired with a short SCREAMING sentence split across 2–3 lines in Urbanist 700/800 — e.g. *CARE. CONNECTED. TOGETHER.* or *SAFETY. COMMUNITY. PEACE OF MIND.*
- **Headline.** Display text 72–120pt, Urbanist 800, **all caps**, set on the blue field. One half in **white**, the other half in **Coral Orange** for emphasis. Kerning tight, line-height 1.0–1.05.
- **Illustration.** One or two Friendly Outliner illustrations placed asymmetrically — person-with-pet at bottom-left, phone-mockup at right. They sit on torn paper — never floating on the blue directly.
- **Phone mockup.** Line-drawn smartphone with torn-paper/white screen, hand-sketched app UI inside. The app UI uses the same monoline style and flat-fill logic as the rest of the illustration.
- **Footer.** A horizontal row of 4 line-icon + label pairs (e.g. *LOST PET ALERTS · VERIFIED PROFILES · REAL COMMUNITY · PEACE OF MIND*) on a paper strip, followed by the huddle wordmark, centered.
- **CTA pill.** Outlined lozenge, Lime Green stroke on blue, or Huddle Blue stroke on paper. Label in caps: *JOIN THE HUDDLE →*, *DOWNLOAD NOW*.
- **Layout doctrine.** Never a symmetric grid. Every post reads top→bottom as a magazine cover: eyebrow, headline, illustration, supporting copy, CTA, footer.

Reference: `assets/social-all-things-pet-care.png`, `assets/social-because-theyre-family.png`, `assets/social-instagram-story-set.png`.

---

## Iconography

- **Primary icon set: Lucide React** (`lucide-react`) — used throughout the web codebase. Stroke-based, 1.75 stroke-width, 16/18/24 sizes.
- **Mobile icon set: Ionicons** (via `@expo/vector-icons`) — `*-outline` variants preferred (matches Lucide's stroke language).
- **Icon color:** default `rgba(66, 73, 101, 0.75)` (subtext at 75%). Active state: `--huddle-blue`. On pressed neumorphic primary: `#FFFFFF`.
- **Emoji:** not used in product UI.
- **Unicode chars as icons:** only `·` (metadata separator) and `✕` (clear/close, but prefer Lucide `X`).
- **Custom PNG icons:** `WaveHandCTA.png` is a real asset (not SVG) — used as a playful "say hi" cue. `Badge.png` is the verified badge. `Polaroid.png` frames pet photos on the profile.
- **Logo:** `assets/huddle-logo.png` (mark), `assets/huddle-wordmark.png` (mark + wordmark). Use the wordmark in headers; the mark for avatars/favicons/loading.
- **Favicons / app icons:** `assets/huddle-favicon.png`, `assets/huddle-icon-512.png`.

The web codebase uses Lucide; the mobile codebase uses Ionicons. If linking from CDN for prototypes, use `https://cdn.jsdelivr.net/npm/lucide@latest` — this is a **CDN-link substitution** for the in-repo `lucide-react` package, flagged here.

---

## Index

| File / folder | Purpose |
|---|---|
| `README.md` | You are here — product context, voice, visual foundations, iconography, index |
| `SKILL.md` | Agent-Skill metadata — invokable as "huddle-design" |
| `colors_and_type.css` | Canonical CSS variables: palette, type scale, radii, spacing, motion, fonts |
| `fonts/` | Urbanist woff2 (400, 500, 600, 700, 800, 400 italic) |
| `assets/` | Logo mark, wordmark, Friendly Outliner illustrations, social post references |
| `preview/` | Design-system cards that populate the Design System tab |
| `ui_kits/mobile/` | huddle mobile app UI kit — JSX components + interactive `index.html` |

### UI Kits

- **`ui_kits/mobile/`** — primary product surface. Mobile-first recreation of the Home, Auth, Chats, Premium, and Notifications screens with reusable `NeuButton`, `NeuChip`, `FormField`, `Header`, `BottomNav`, `PetCard`, `GlassSheet`, `UpsellBanner` components.

---

## Caveats

- Brand book `huddle_brand_book_v4.docx` and FAQ `huddle_FAQ.docx` were referenced by path but not fully parsed into this system. The content-fundamentals section is synthesised from codebase copy + user brief. If the brand book contradicts anything here, it wins — please share key excerpts so we can reconcile.
- Icon set is declared as Lucide (web) / Ionicons (mobile). We link Lucide from CDN in prototypes.
- Color vibe of photography is inferred from the product context; we do not have a photo-style reference library attached.
