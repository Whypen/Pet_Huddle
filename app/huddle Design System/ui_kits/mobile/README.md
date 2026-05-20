# huddle mobile UI kit

Interactive, mobile-first recreation of the huddle app's core flows. Built as a React + Babel prototype inside an iOS 26 device frame.

## Structure

| File | What's in it |
|---|---|
| `index.html` | Entrypoint — loads React, Babel, styles, and the JSX files |
| `styles.css` | Kit-specific styles (imports `../../colors_and_type.css`) |
| `ios-frame.jsx` | iOS 26 device chrome (starter component) |
| `components.jsx` | Shared primitives: `Header`, `BottomNav`, `Chip`, `CTAButton`, `GhostButton`, `GoldButton`, `InputField`, `UpsellBanner`, `Icon` |
| `screens.jsx` | Screen components: `AuthScreen`, `HomeScreen`, `DiscoverScreen`, `ChatsScreen`, `AlertsScreen`, `PremiumScreen`, `YouScreen` |
| `app.jsx` | Shell — wires sign-in state, tab state, and the Premium overlay |

## Click-through flow

1. **Auth screen** (`AuthScreen`) — sign-in / sign-up toggle, consent checkbox for sign-up. Tap *Sign In* (after filling in valid-ish inputs) to enter the app.
2. **Home** — pet dashboard, next-event card, pet photo card, Premium upsell, *Add Pet* / *Create Thread* buttons.
3. **Discover** — nearby pets and Animal Friends with distance chips.
4. **Chats** — threads list (walker, group, clinic, AI Vet). Search affordance, unread counts.
5. **Alerts** — active *Lost pet* emergency (72H · 10km), plus earlier-week verification + discovery notifications.
6. **You** — profile, verified chip, settings list, sign-out.
7. Tap the **Premium** upsell (Home or You) to open `PremiumScreen` — shows Premium vs Gold cards with *Secure Privileges* / *Go Gold* CTAs.

## Fidelity notes

- Copy is lifted directly from the mobile codebase where possible: *"Welcome back"*, *"Create an account"*, *"Password must be at least 6 characters"*, *"Secure Privileges"*, *"No upcoming events"*, *"Animal Friend"*, consent sentence verbatim.
- All surfaces use the shared colors_and_type.css tokens — no one-off hex values.
- Icons are inline Lucide-shaped SVGs (same stroke language as the production `lucide-react` set).
- Neumorphic shadows use the neutral-grey drop family; glass shadows use the blue-tinted family. No mixing.
- Pet photos are gradient placeholders (no real pet photography is shipped in the codebase) — swap for real imagery in production.

## Known omissions

- Map screen, Thread compose screen, and AI Vet chat view are stubs referenced by navigation but not built out.
- No real keyboard / form validation wiring — the Auth CTA enables on email-contains-`@` + password ≥ 6 chars (+ consent for sign-up).
