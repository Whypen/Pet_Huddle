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

## Tailwind Token Mapping

Tailwind `theme.extend.colors` MUST include:
- `brandBlue` -> `#2145CF`
- `brandGold` -> `#CFAB21`
- `brandText` -> `#424965`
- `brandSubtext` -> `#4a4a4a`
- `brandError` -> `#EF4444`

## Navigation

Bottom navigation MUST be a floating dock:
- `bg-white/90`
- `backdrop-blur-md`
- `rounded-full`
- Active icons/text MUST use `#2145CF`.

## Validation Infrastructure (Global)

All forms MUST enforce:
- Input border switches to `border-red-500` immediately on validation failure.
- Error text (`text-red-500`, pt12) appears directly below the field.
- Submit/Next buttons MUST be disabled (and visually reduced opacity) until `isValid` is true.

