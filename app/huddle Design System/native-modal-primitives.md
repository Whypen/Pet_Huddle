# Native Modal Primitives

This is the canonical `/app` native modal/input/button reference.

Agents must reuse or port `native-modal-primitives.tsx` when building app-owned modals. Do not invent new close button, modal card, input, error, subtext, button, or scroll styles unless the user explicitly approves a design exception.

## Required Primitives

- `AppModalCloseButton`
  - one close placement for all app modals
  - absolute top/right at 12px
  - 44x44 touch target

- `AppModalCard`
  - app-owned modals use the shrink-wrapped `maxHeight: "88%"` card
  - legal/document modals may use `fullHeight`
  - radius 28
  - white canvas
  - glass elevation E2 shadow

- `AppModalScroll`
  - all app-owned modal content must be scroll-safe
  - content padding: 16 side, 24 top, 40 bottom
  - keyboard taps must persist

- `AppModalField`
  - shared placeholder typography, field height, inner padding, radius, rest/focus/error states
  - height 52 for single-line fields
  - text area height fixed at 108 and internally scrollable
  - never let long text expand the modal and push actions off-screen

- `AppModalError`
  - same error line height and spacing for inputs and verification widgets

- `AppModalActionRow`
  - side-by-side peer actions
  - gap 12
  - padding top 4

- `AppModalButton`
  - height 44
  - radius 14
  - shared primary/secondary/disabled/loading surface rules

## Exact Token Contract

- Close button: 44x44, top 12, right 12.
- Modal card radius: 28.
- App-owned modal max height: 88%.
- Modal scroll padding: 16 side, 24 top, 40 bottom.
- Modal inner panel padding: 16 side, 16 top, 12 bottom, gap 16.
- Field height: 52.
- Text area height: 108 fixed; scroll inside field.
- Field radius: 14.
- Field horizontal padding: 16.
- Field font: Urbanist-500, 16/22.
- Label/error font: Urbanist-600, 12/16.
- Subtext font: Urbanist-500, 13/18.
- Button height: 44.
- Button radius: 14.
- Peer button gap: 12.
- Focus border: rgba(33,69,207,0.62).
- Error border: rgba(232,69,69,0.72).
- Error color: #EF4444.

## WebView Rule

Do not open app-owned auth/help flows through web route WebViews. Build those flows in `/app`. Use WebView only for embedded web-origin requirements such as Turnstile or legal document content.
