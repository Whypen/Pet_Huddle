# UI Design System (Branded)

This document defines the branded design tokens and typography rules that must be used across the app UI. These tokens MUST be kept in sync with `MASTER_SPEC.md`.

## Brand Tokens

- Primary (Huddle Blue): `#2145CF`
- Secondary (Premium Gold): `#CFAB21`
- Primary Text: `#424965` (Apply to all headings and body)
- Subtext: `#4a4a4a` (Apply to captions and vaccination remarks)
- Validation/Error: `#EF4444` (Pure red for borders and text)

## Typography

Font Stack (Tailwind `font-sans`):

`["Microsoft YaHei UI", "Microsoft YaHei", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"]`

Rules:
- Default body text color MUST be `#424965`.
- `h1`, `h2`, `h3` MUST use `#424965`.
- Captions/subtext MUST use `#4a4a4a`.
- Validation error borders and text MUST use `#EF4444`.

## UAT Global UI Guidelines (v1.1)

These are UAT-driven UI requirements and MUST be enforced across iOS/Android/Web where applicable.

### Header
- Center logo horizontally.
- Align "huddle" word to left in larger font (e.g., fontSize 24, bold).
- Header height: 48px.

### Return Arrows (Back Buttons)
- Back arrow pinned to top-left (consistent placement across screens).
- Icon size: 24px.
- Apply primary tint on press (use `brandBlue`).
- Add light haptic feedback on press.
  - React Native (Expo): `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` with ~10ms duration.
  - Web: use `navigator.vibrate(10)` where supported.

### Key Measurements
- Tabs height: 40px.
- Section padding: vertical 8px, horizontal 16px.
- Gap between sections: 8px.
- Item row height: 40px.
- Minimum touch target 44px on tappables (RN: `hitSlop`; Web: padding).

### Visual Style of Inputs
- Center text/inputs horizontally for mobile-first feel.
- On wide screens (>600px), left-align labels for readability.
- Input fields:
  - White background, thin border `#424965`.
  - Border radius 12px.
  - Placeholder: gray, opacity 0.6, italic.
  - On focus: border width 1.5px, shadow-sm.
  - Blocked/disabled fields: light gray background (`#f0f0f0`).
- Date fields:
  - RN: native pickers via `@react-native-community/datetimepicker`.
  - Web: `input[type="date"]`.

### CTA Behavior (Primary Buttons)
- Invalid/no change: disabled + opacity 0.5.
- Valid: bright `brandBlue`.
- Active CTA: subtle pulse animation (scale 1.02 every 2s).
- Invalid submit attempt: shake animation (translateX +-4px) and keep CTA disabled until valid.

### Typography (UAT)
- Headings: 16px, medium/bold (600).
- Body/Labels: 14px, regular (400).
- Meta/Remarks: 10px, regular (400).
- Accessibility:
  - RN: respect Dynamic Type (DTS) scaling.
  - Web: respect browser text scaling (no fixed pixel lockouts).

### Settings Screen / Navigation
- Account Info: remove "identity pending" status text; keep badge on avatar (gold rim verified, gray rim pending).
- Structure order:
  - PREMIUM + GOLD BANNER (sticky on scroll)
  - Profiles
  - Account Settings
  - Subscription
  - Legal Information (collapsible accordion)
    - Terms of Service
    - Privacy Policy
  - Help & Support
  - Logout (destructive on press)
- Remove version string display.

### PREMIUM + GOLD Banner
- Two horizontal scrolling cards (snap-to-center).
- Tap: 2px gold border + light haptic + scale 1.05.
- Card styles:
  - Rounded 16px, padding 16px, shadow-sm, aspect ratio 1.8:1.
  - Premium card: `brandBlue` border.
  - Gold card: `brandGold` border.
- Gold card includes "Recommended" pill.

### Chats
- Swipe right for more filtering (horizontal scroll + snap).
- Discovery profile cards: horizontal scroll + snap; card width 80% screen; padding horizontal 16px.
- Free users: max 40 profiles/day.
  - After limit: blur overlay + "Unlock Premium to see more users" + button.
- Chats/Groups toggle smaller; move search icon + Create Group next to it.
- Search bar appears below on tap with placeholder "Conversations" (searches user/group names).
- Realtime: initialize early, show "Connecting..." state.
- User icon: only verified badge + car badge; no crown/premium badge.
- Nav bar: non-floating footer; add leftmost "Pet" icon linking to Home Dashboard, label "Pet".

### /Premium Page Remodeling
- Header: "Choose Your Privileges".
- Tier tabs: Premium / Gold / Add-on with sticky behavior, active gold underline + gold text.
- Fixed purchase area at bottom (90px).

### Account Settings
- Remove Account Info section.
- Under Account Security:
  - Identity Verification row with right-side pill badge (pending gray, verified gold, rejected red).
  - Personal Info, Password, Family (gated), Biometric Login.
  - Remove 2FA, Hide from Map/Notifications, Manage Subscription, Deactivate.
  - Help & Support moved to nav bar.

### Pet Profile
- Pet Name placeholder: "Name".
- Remove "fixed?" under Neutered/Spayed.
- DOB max date: CURRENT_DATE - 40 years; auto-show "Age: XX".
- Vaccinations label: "Vaccinations / Checkups".
- Select vaccines includes "Check-up" and "Others" with conditional input.
- Dates min = pet DOB; remove subtext.
- Reminder label: "Vaccination/ Check-up Reminder" with specified options and conditional input.
- Home dashboard next event format: "DD MMM, Reasons".

### User Profile
- Legal Name placeholder "Legal Name"; disabled if verified.
- Display Name placeholder "Name".
- User ID disabled gray 10-digit.
- Phone / DOB disabled if verified; show age.
- Social Album: max 5 images (<500kb), full-screen carousel.
- Gender/Orientation dropdown as per spec.
- Physical: remove weight field.
- Languages: dropdown + Others, chips.

### Thread
- Create Thread:
  - Topic dropdown: Dog, Cat, News, Social, Adoption, Others with icons.
  - Remove max chars subtext.
  - Upsell banner: white bg, brand border 1px.
  - Quota text: "Available post: X remaining" pt12 gray near Post button.

## Tailwind Token Mapping

Tailwind `theme.extend.colors` MUST include:
- `brandBlue` -> `#2145CF`
- `brandGold` -> `#CFAB21`
- `brandText` -> `#424965`
- `brandSubtext` -> `#4a4a4a`
- `brandError` -> `#EF4444`

## Navigation

Bottom navigation MUST be a non-floating footer bar:
- Fixed bottom, full-width.
- Leftmost "Pet" icon links to Home Dashboard.
- Active icons/text MUST use `#2145CF`.

## Validation Infrastructure (Global)

All forms MUST enforce:
- Input border switches to `border-red-500` immediately on validation failure.
- Error text (`text-red-500`, pt12) appears directly below the field.
- Submit/Next buttons MUST be disabled (and visually reduced opacity) until `isValid` is true.
