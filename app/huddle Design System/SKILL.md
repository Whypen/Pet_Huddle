---
name: huddle-design
description: Use this skill to generate well-branded interfaces and assets for huddle, a pet-centric "super app", either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

Key entry points:

- `README.md` — full brand context, content fundamentals, visual foundations, illustration style ("The Friendly Outliner"), social/marketing doctrine ("Editorial Cleanliness"), iconography, and an index to all files.
- `colors_and_type.css` — canonical CSS variables. Always import this from any artifact you produce. Covers palette, type scale, radii, spacing, motion, and glass/neumorphic shadow tokens.
- `native-modal-primitives.tsx` — canonical `/app` native modal/input/button primitives. Reuse or port this for app-owned modals; do not invent modal-specific close buttons, card edges, input padding, focus/error states, error spacing, button sizing, or action layouts.
- `native-modal-primitives.md` — exact modal token contract for close button placement, modal edge/radius/shadow/padding, field placeholder/inner padding/focus/error states, error/subtext spacing, button height/radius, and scroll-safe behavior.
- `fonts/` — Urbanist 300/400/500/600/700/800 + 400/600 italic (TTF). Self-host from this folder; do not Google-Fonts substitute.
- `assets/` — logo mark, wordmark, Friendly Outliner illustrations (`illustration-pet-care.jpg`, `illustration-daniel-kwok.svg`, `illustration-victor-cheng.svg`), and three social-post references. Prefer these over inventing new illustrations.
- `ui_kits/mobile/` — full mobile UI kit (Auth, Home, Discover, Chats, Alerts, Premium, You) as React + inline SVG icons. Copy primitives (`Header`, `BottomNav`, `Chip`, `CTAButton`, `InputField`, `UpsellBanner`) into new screens instead of rewriting.
- `preview/` — small design-system cards showing how individual tokens and components look in isolation. Useful as reference.

House rules to preserve:

1. **Brand name is lowercase `huddle`** in copy. Capital "Huddle" only in legal/screen-reader/logo contexts.
2. Voice is *Calm, Confident, & Human*. Sentence case. No emoji. No alarmist language.
3. The word *Emergency* (orange `#F97316`) is reserved for lost-pet and hazard broadcasts — never a general danger color. Use `#EF4444` for form errors / destructive actions.
4. Neumorphic shadows use **neutral grey drops**; glass shadows use **blue-tinted drops**. Never mix.
5. Illustrations are always the Friendly Outliner style. Do not draw your own stylized SVG illustrations; prefer placeholders, the provided assets, or ask the user.
6. No dashboard grids. Editorial layouts. Centered wordmark in headers.
7. Pet imagery is warm, natural, outdoor — no cool-blue filter, no B&W.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc.), copy assets out of `assets/` and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask clarifying questions about audience, surface (app/marketing/slide), and variation count, then act as an expert designer who outputs HTML artifacts *or* production code, depending on the need.
