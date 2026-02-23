# DESIGN_MASTER_SPEC.md — Visual Architecture Bible (v3.0)

**Version:** 3.0 Canonical — Surface Architecture Update  
**Last Updated:** 2026-02-18  
**Status:** Authoritative Design System

---

> **VISUAL-ONLY AUTHORITY (MANDATORY):** This document governs **tokens, layout, components, motion, and UI interaction patterns** only.
> - **MASTER_SPEC.md** is the single source of truth for **data model, routes, tiers/quotas, enforcement, privacy rules, and business logic**.
> - If any section here mentions verification/privacy/tiers/quotas/logic, treat it as **UI presentation guidance only**; **MASTER_SPEC.md overrides**.


## Changelog

- **v3.0**: Surface Architecture Upgrade — Restrained Neumorphism + Glassmorphism hybrid. 4-layer elevation system. Neumorphic interaction components only. Glass overlays for modals/composers. Social feed editorial doctrine. Motion physics refined. Iconography weight update. Accessibility safeguards for depth system.
- **v2.1**: Resolved 10 systemic diagnosis failures. Input height 36px→40px. Privacy toggles removed. Key Dates UX. Unified Settings. Skeleton loading. Motion physics. Haptic hierarchy. Emergency warm red.
- **v2.0**: Initial sweep audit.

---

## SURFACE ARCHITECTURE PHILOSOPHY

huddle is a **lifestyle-premium pet safety super-app** that combines:
- Modern depth perception (neumorphism for tactile feedback)
- Atmospheric layering (glassmorphism for modal hierarchy)
- Editorial restraint (no decorative overuse)

**NOT:**
- Flat material design
- Heavy skeuomorphism
- Dribbble-style decoration
- SaaS dashboard grids

**Forbidden:**
- Full-page frosted backgrounds
- Neumorphic content containers
- Excessive depth on static elements
- Cartoon illustrations

---

## 1. SURFACE & DEPTH ARCHITECTURE


### 1.3 Glass Contrast Safeguard (Non‑Negotiable)

Glass overlays must remain readable over **photos, video, map tiles, and any dynamic imagery**.

**Rule:** If the background under a glass layer fails legibility, the UI must auto‑stabilize contrast.

**Required Safeguards (choose at least one; may combine):**
1. **Gradient scrim inside the glass panel** behind text:
   - Top→bottom or bottom→top depending on text placement
   - Scrim must not affect tappable content areas
2. **Local frost boost behind text blocks**
   - Increase background opacity in the text region only (e.g., 0.80 → 0.88)
3. **Text container chip**
   - Put text on an inner “micro-surface” (small rounded container) within the glass with higher opacity

**Never allowed:**
- Thin gray text directly on glass over busy imagery
- Relying on “it looks fine on my device”

**Implementation note (practical):**
- If you cannot compute contrast dynamically, treat **media + glass + text** as “high risk” and always apply a subtle scrim for those templates.

### 1.1 Four-Layer Elevation System

**Level 0 — Base Page Surface**
- Purpose: Background canvas
- Treatment: Flat, neutral
- Color: `--bg-white` (#FFFFFF) or `--bg-muted` (#F3F4F6)
- Shadow: None
- Usage: Page backgrounds, feed backgrounds

**Level 1 — Content Cards**
- Purpose: Editorial content containers
- Treatment: Subtle shadow, clean separation
- Shadow: `0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)`
- Border: None or 1px solid rgba(0,0,0,0.04)
- Corner Radius: 12px
- Usage: Pet profiles, thread posts, nanny bookings, discover cards

**Level 2 — Glass Overlay (Restricted)**
- Purpose: Floating UI, temporary overlays
- Treatment: Backdrop blur + frost effect
- Backdrop Blur: 16–24px
- Background: rgba(255, 255, 255, 0.75–0.85)
- Border: 1px solid rgba(255, 255, 255, 0.3)
- Noise Overlay: 2–3% grain texture (optional)
- Tint: Warm neutral (slight yellow shift)
- Shadow: `0 8px 32px rgba(0, 0, 0, 0.12)`
- Corner Radius: 16px

**Allowed ONLY for:**
- Bottom sheets
- Floating modals (upsell, block/report, confirmation)
- Broadcast composer modal
- Cart / Checkout overlay
- Comment composer overlay

**Prohibited for:**
- Page backgrounds
- Static content cards
- Navigation bars
- Headers

**Level 3 — Active Modal (Stronger Depth)**
- Purpose: High-priority dialogs requiring focus
- Treatment: Stronger blur + deeper shadow
- Backdrop Blur: 24px
- Background: rgba(255, 255, 255, 0.85–0.90)
- Border: 1px solid rgba(255, 255, 255, 0.4)
- Shadow: `0 16px 48px rgba(0, 0, 0, 0.16), 0 0 1px rgba(0, 0, 0, 0.08)`
- Corner Radius: 20px
- Usage: Critical confirmations, payment modals, identity verification

### 1.2 Glass Implementation Specs

**CSS Foundation:**
```css
.glass-overlay {
  background: rgba(255, 255, 255, 0.80);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

/* Noise overlay (optional) */
.glass-overlay::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url('data:image/svg+xml,...'); /* 2% noise */
  opacity: 0.03;
  pointer-events: none;
}
```

**Fallback (No backdrop-filter support):**
- Solid background: rgba(255, 255, 255, 0.95)
- Stronger shadow: `0 8px 32px rgba(0, 0, 0, 0.16)`

---

## 2. NEUMORPHIC INTERACTION SYSTEM


### 2.5 Neumorphic Density Rule (Premium Minimalism Guardrail)

Neumorphism is tactile, but overuse makes the UI feel “designed” instead of “premium.”

**Viewport limit:** Maximum **3** raised neumorphic elements visible at once.
- Primary CTA counts as 1
- FAB counts as 1
- Each neumorphic icon button counts as 1 (stacking many is prohibited)

**Hierarchy enforcement:**
- Primary CTA = strongest depth
- Secondary actions = flatter (ghost/outline)
- Tertiary actions = text links

**Where density applies most:**
- Social feed action row
- Map overlays
- Premium/Checkout

If a layout requires more than 3 raised elements, convert the rest to:
- Flat icon buttons (no raised shadow) OR
- Ghost buttons with border only

### 2.1 Neumorphism Scope (Restricted)

**Allowed ONLY for interactive components:**
- Primary CTA buttons
- Icon buttons (bottom nav, floating actions)
- Toggle chips (filter pills, tabs)
- Floating Action Button (Broadcast FAB)
- Segmented controls

**Prohibited for:**
- Content cards (use Level 1 shadow instead)
- Static containers
- Feed posts
- Headers
- Text blocks

### 2.2 Neumorphic Visual Specs

**Light Source:** Top-left (consistent throughout app)

**Raised State (Default):**
```css
.neu-button {
  background: linear-gradient(145deg, #ffffff, #f0f0f0);
  box-shadow:
    6px 6px 12px rgba(0, 0, 0, 0.08),    /* Soft shadow bottom-right */
    -4px -4px 8px rgba(255, 255, 255, 0.8); /* Soft highlight top-left */
}
```

**Pressed State:**
```css
.neu-button:active {
  background: linear-gradient(145deg, #f0f0f0, #e8e8e8);
  box-shadow:
    inset 3px 3px 6px rgba(0, 0, 0, 0.1),   /* Inner shadow */
    inset -2px -2px 4px rgba(255, 255, 255, 0.6); /* Reduced highlight */
  transform: scale(0.98);
}
```

**Interaction Animation:**
- Duration: 150ms
- Easing: cubic-bezier(0.4, 0, 0.2, 1) (ease-out)
- Transform: scale(0.98) on press
- Shadow transition: all 150ms ease-out

**Disabled State:**
```css
.neu-button:disabled {
  background: #f3f4f6;
  box-shadow: none;
  opacity: 0.5;
  cursor: not-allowed;
}
```

### 2.3 Neumorphic Color Integration

**Primary CTA (Huddle Blue):**
```css
.neu-button-primary {
  background: linear-gradient(145deg, #2349dd, #1d3bb5);
  box-shadow:
    6px 6px 12px rgba(33, 69, 207, 0.25),
    -4px -4px 8px rgba(60, 100, 255, 0.4);
  color: white;
}
```

**Gold Tier CTA:**
```css
.neu-button-gold {
  background: linear-gradient(145deg, #d9b733, #c29e1d);
  box-shadow:
    6px 6px 12px rgba(207, 171, 33, 0.25),
    -4px -4px 8px rgba(240, 200, 80, 0.4);
  color: #1f2937;
}
```

**Icon Button (Neutral):**
```css
.neu-icon-button {
  background: linear-gradient(145deg, #fafafa, #f0f0f0);
  box-shadow:
    4px 4px 8px rgba(0, 0, 0, 0.06),
    -3px -3px 6px rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  width: 44px;
  height: 44px;
}
```

### 2.4 Accessibility Compliance

**Contrast Requirements:**
- Text on neumorphic buttons: WCAG 2.1 AA (4.5:1 minimum)
- Primary blue text: White (#FFFFFF) ✓
- Gold tier text: Gray-800 (#1F2937) ✓
- Icon buttons: Gray-600 (#4B5563) on light background ✓

**Touch Target:**
- Minimum 44×44px (iOS Human Interface Guidelines)
- Neumorphic effect must not reduce tap area

**Focus State:**
- Visible focus ring: 2px solid Huddle Blue
- Offset: 2px outset
- Announced to screen readers

---

## 3. COLOR TOKENS (Updated)

```css
/* Brand */
--huddle-blue:        #2145CF;   /* Primary CTA, buttons, links */
--plus-gold:          #CFAB21;   /* Plus/Gold tier, badges */

/* Text */
--text-primary:       #424965;   /* All headings and body */
--text-subtext:       #4a4a4a;   /* Captions, helper text, metadata */

/* Semantic */
--error-red:          #EF4444;   /* Validation errors, destructive */
--success-green:      #10b981;   /* Verified badge, success state */
--warning-amber:      #F59E0B;   /* Pending states, warnings */
--emergency-warm-red: #F97316;   /* Emergency broadcasts — warm orange-red */

/* Surface */
--bg-white:           #FFFFFF;
--bg-muted:           #F3F4F6;   /* Skeleton, disabled */
--bg-blue-soft:       #EBF5FF;   /* Unverified banner */
--bg-yellow-soft:     #FFF9E6;   /* Pending banner */

/* Depth (New) */
--glass-white:        rgba(255, 255, 255, 0.80);   /* Glass overlay base */
--glass-border:       rgba(255, 255, 255, 0.30);   /* Glass border */
--neu-light:          #fafafa;   /* Neumorphic highlight */
--neu-shadow:         #e8e8e8;   /* Neumorphic shadow */
```

**Emergency Red Rule:** MUST use #F97316 (warm orange-red). #DC2626 or #EF4444 are violations for emergency contexts.

---

## 4. TYPOGRAPHY SCALE (Locked)


### 4.1 Hero Typography (Lifestyle Premium Moments)

The locked scale above is for **standard in-app UI** (forms, settings, dense flows).
However, huddle also needs **editorial hero moments** that feel premium and modern.

**Hero Use-Cases (Allowed):**
- Splash / onboarding “statement” screens
- Premium marketing hero section
- Social “campaign” header moments
- Empty states with big emotional headline

**Hero Scale (Allowed only in the above use-cases):**
- Hero H1: **56–64px** (Clash Display, semibold)
- Hero H2: **40–44px**
- Hero H3: **28–32px**

**Guardrails:**
- Never use hero scale in: settings, admin lists, long forms
- Keep hero text short (1–2 lines)
- Maintain contrast and avoid truncation with Dynamic Type

```
H1 Page Header:  24px / font-semibold / text-[#424965] / leading-tight
H2 Section:      20px / font-semibold / text-[#424965] / leading-tight
H3 Card Title:   18px / font-semibold / text-[#424965] / leading-snug
Body Primary:    16px / font-normal  / text-[#424965] / leading-normal
Label:           14px / font-medium  / text-[#424965]/70 / leading-normal
Helper:          12px / font-normal  / text-[#4a4a4a] / leading-relaxed
Error:           12px / font-medium  / text-[#EF4444] / leading-relaxed
```

**Rules:**
- ONLY use font-weight 400 (normal), 500 (medium), 600 (semibold)
- NEVER use custom line-heights outside this scale
- NEVER use font sizes not in this scale
- NEVER use font-bold (700) except emergency states

**Header Font:** Clash Display (primary), Satoshi (fallback), Urbanist (body)  
**Forbidden:** Trebuchet MS, Calibri, generic system fonts

---

## 5. SPACING SYSTEM (8-Point Grid)

```
Base unit: 8px

space-1:  8px  → gap-2,  p-2
space-2:  16px → gap-4,  p-4   ← card inner padding (default)
space-3:  24px → gap-6,  p-6   ← section gap
space-4:  32px → gap-8,  p-8
space-5:  40px → gap-10, p-10
space-6:  48px → gap-12, p-12
```

**Rules:**
- DO NOT use p-3, p-5, p-7, p-9 (breaks 8px grid)
- Card padding: p-4 (16px) exclusively
- Section vertical gap: space-y-4 or space-y-6
- Form field gap: space-y-4 (16px)

---

## 6. INPUT & BUTTON SIZING (iOS Zoom-Safe)

```
All Text Inputs:   h-10 (40px)  px-3  text-base (16px)
All Buttons:       h-10 (40px)  px-4  text-base (16px)
Textareas:         min-h-24 (96px) px-3 py-2
Select/Dropdown:   h-10 (40px)  px-3
```

**Rules:**
- NEVER use h-9 (36px)
- Input font-size MUST be 16px (text-base) — iOS Safari auto-zooms <16px
- Placeholder text disabled EXCEPT search fields

---

## 7. COMPONENT STANDARDS (Updated)

### 7.1 Touch Targets

**Minimum:** 44×44px (iOS HIG, WCAG 2.5.5)  
**Spacing:** 8px minimum between adjacent touch targets

### 7.2 Avatar Sizes

```
xs:  32×32px  (message thread, list item)
sm:  40×40px  (discovery card, comment author)
md:  64×64px  (profile view, chat header)
lg:  96×96px  (full profile page top)
```

### 7.3 Border Radius

```
xs:  4px   (badges, pills)
sm:  8px   (buttons, inputs)
md:  12px  (cards, Level 1 surfaces)
lg:  16px  (modals, Level 2 glass)
xl:  20px  (Level 3 active modals)
full: 9999px (avatars, circular buttons)
```

### 7.4 Icon Sizes

```
xs:  16×16px  (inline text icons)
sm:  20×20px  (buttons, form indicators)
md:  24×24px  (navigation, primary actions)
lg:  32×32px  (FAB, large CTAs)
```

### 7.5 Button Visual Hierarchy (Neumorphic)

**Primary CTA:**
```tsx
<button className="
  h-10 px-4 text-base font-medium text-white
  bg-gradient-to-br from-[#2349dd] to-[#1d3bb5]
  shadow-[6px_6px_12px_rgba(33,69,207,0.25),-4px_-4px_8px_rgba(60,100,255,0.4)]
  active:shadow-[inset_3px_3px_6px_rgba(0,0,0,0.1),inset_-2px_-2px_4px_rgba(255,255,255,0.6)]
  active:scale-98
  transition-all duration-150
  rounded-lg
">
  Send Broadcast
</button>
```

**Secondary (Ghost):**
```tsx
<button className="
  h-10 px-4 text-base font-medium text-[#424965]
  bg-transparent border border-gray-300
  hover:bg-gray-50
  active:bg-gray-100
  transition-all duration-150
  rounded-lg
">
  Cancel
</button>
```

**Icon Button (Neumorphic):**
```tsx
<button className="
  w-11 h-11 rounded-full
  bg-gradient-to-br from-[#fafafa] to-[#f0f0f0]
  shadow-[4px_4px_8px_rgba(0,0,0,0.06),-3px_-3px_6px_rgba(255,255,255,0.8)]
  active:shadow-[inset_3px_3px_6px_rgba(0,0,0,0.1),inset_-2px_-2px_4px_rgba(255,255,255,0.6)]
  active:scale-98
  transition-all duration-150
  flex items-center justify-center
">
  <Icon className="w-6 h-6 text-gray-600" />
</button>
```

**Filter Pill (Neumorphic Toggle):**
```tsx
<button className={`
  h-8 px-3 text-sm font-medium
  ${isActive
    ? 'bg-gradient-to-br from-[#2349dd] to-[#1d3bb5] text-white shadow-[6px_6px_12px_rgba(33,69,207,0.25),-4px_-4px_8px_rgba(60,100,255,0.4)]'
    : 'bg-gradient-to-br from-[#fafafa] to-[#f0f0f0] text-gray-700 shadow-[4px_4px_8px_rgba(0,0,0,0.06),-3px_-3px_6px_rgba(255,255,255,0.8)]'
  }
  active:scale-98
  transition-all duration-150
  rounded-full
`}>
  Dog
</button>
```

### 7.6 Badge Standards

```
Verified:    bg-[#10b981] text-white rounded-full px-2 h-5 text-xs
Gold:        bg-[#CFAB21] text-gray-900 rounded-full px-2 h-5 text-xs
Pending:     bg-[#F59E0B] text-white rounded-full px-2 h-5 text-xs
```

---

## 8. MODAL & OVERLAY SYSTEM (Glass)

### 8.1 Bottom Sheet (Glass — Level 2)

**Structure:**
```tsx
<div className="fixed inset-0 z-50 flex items-end">
  {/* Backdrop */}
  <div className="absolute inset-0 bg-black/40" onClick={onClose} />
  
  {/* Glass Bottom Sheet */}
  <div className="
    relative w-full max-h-[90vh] overflow-y-auto
    bg-white/80 backdrop-blur-[20px]
    border-t border-white/30
    shadow-[0_-8px_32px_rgba(0,0,0,0.12)]
    rounded-t-2xl
    pb-safe
  ">
    {/* Drag Handle */}
    <div className="flex justify-center pt-3 pb-2">
      <div className="w-10 h-1 bg-gray-300 rounded-full" />
    </div>
    
    {/* Content */}
    <div className="px-4 pb-6">
      {children}
    </div>
  </div>
</div>
```

**Behavior:**
- Slide up from bottom (300ms ease-out)
- Backdrop blur fades in (200ms)
- Drag handle visible at top
- Safe area padding at bottom
- Swipe-down to dismiss

### 8.2 Floating Modal (Glass — Level 2/3)

**Structure:**
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
  {/* Backdrop */}
  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
  
  {/* Glass Modal */}
  <div className="
    relative w-full max-w-md
    bg-white/85 backdrop-blur-[24px]
    border border-white/40
    shadow-[0_16px_48px_rgba(0,0,0,0.16)]
    rounded-2xl
    p-6
  ">
    {/* Close Button (Neumorphic Icon Button) */}
    <button className="absolute top-4 right-4 neu-icon-button">
      <XIcon />
    </button>
    
    {/* Content */}
    <h3 className="text-xl font-semibold text-gray-900 mb-3">
      {title}
    </h3>
    <p className="text-base text-gray-600 mb-6">
      {description}
    </p>
    
    {/* Actions */}
    <div className="flex gap-3">
      <button className="neu-button-primary">Confirm</button>
      <button className="ghost-button">Cancel</button>
    </div>
  </div>
</div>
```

### 8.3 Broadcast Composer (Glass)

**Behavior:**
- Opens as full-screen modal on mobile
- Glass background: rgba(255, 255, 255, 0.80)
- Backdrop blur: 20px
- 4-constraint UI (quota, active, duration, radius)
- Neumorphic "Send Broadcast" button at bottom
- Glass overlay contains scrollable content

---

## 9. SOCIAL FEED VISUAL DOCTRINE


### 9.5 Social Feed Rhythm Rules (Prevent “Generic Feed”)

These rules are mandatory to keep Social premium and editorial.

**Text preview:**
- Caption preview must be **max 3 lines** with “Read more” expansion.
- Replies preview: max 2 lines, expand on tap.

**Media:**
- Preferred ratio: **4:5** for premium editorial bias.
- Full‑bleed hero media allowed but limited (no more than 1 in 6 posts).

**Spacing:**
- Minimum vertical rhythm: `space-y-6` (24px) between posts.
- Action row always aligned to a fixed baseline.

**Composer:**
- Opens as **glass bottom sheet (Level 2)**
- Composer input stays pinned above safe area (`pb-safe`) while scrolling comments.

**No grid feeds:**
- No two-column layouts in Social.
- No dashboard widgets.

### 9.1 Feed Architecture

**Core Principles:**
- Image-led (not text-heavy)
- Editorial (not dashboard-style)
- Asymmetric layout allowed
- Strong visual hierarchy
- Generous vertical rhythm (space-y-6 minimum)

**Prohibited:**
- Symmetric grid layouts
- Text-first cards
- Dashboard widgets
- Cluttered information density

### 9.2 Thread Post Card (Level 1)

**Structure:**
```tsx
<article className="
  bg-white
  border border-gray-100
  shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)]
  rounded-xl
  p-4
  space-y-3
">
  {/* Author Header */}
  <div className="flex items-center gap-3">
    <img src={avatar} className="w-10 h-10 rounded-full" />
    <div>
      <p className="text-base font-semibold text-gray-900">{name}</p>
      <p className="text-sm text-gray-500">{timestamp}</p>
    </div>
  </div>
  
  {/* Image (Hero Treatment) */}
  {image && (
    <img 
      src={image} 
      className="w-full aspect-[4/3] object-cover rounded-lg" 
    />
  )}
  
  {/* Title + Content */}
  <h3 className="text-lg font-semibold text-gray-900 leading-snug">
    {title}
  </h3>
  <p className="text-base text-gray-700 leading-normal line-clamp-3">
    {content}
  </p>
  
  {/* Interaction Controls (Neumorphic) */}
  <div className="flex items-center gap-4 pt-2">
    <button className="neu-icon-button-sm">
      <HeartIcon />
      <span className="text-sm text-gray-600 ml-1">{likes}</span>
    </button>
    <button className="neu-icon-button-sm">
      <MessageIcon />
      <span className="text-sm text-gray-600 ml-1">{replies}</span>
    </button>
  </div>
</article>
```

### 9.3 Comment Composer (Glass)

**Structure:**
```tsx
<div className="glass-bottom-sheet">
  <textarea 
    className="w-full min-h-24 p-3 bg-white/50 border border-white/30 rounded-lg" 
    placeholder="Add a comment..."
  />
  <div className="flex items-center justify-between mt-4">
    <button className="neu-icon-button">
      <ImageIcon />
    </button>
    <button className="neu-button-primary h-9 px-4">
      Send
    </button>
  </div>
</div>
```

### 9.4 Discovery Card (Glass Overlay)

**Structure:**
```tsx
<div className="
  bg-white
  shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)]
  rounded-xl
  overflow-hidden
  relative
">
  {/* Hero Image */}
  <img 
    src={profileImage} 
    className="w-full aspect-square object-cover" 
  />
  
  {/* Glass Content Overlay */}
  <div className="
    absolute bottom-0 inset-x-0
    bg-white/80 backdrop-blur-[16px]
    border-t border-white/30
    p-4
  ">
    <h3 className="text-lg font-semibold text-gray-900">{name}, {age}</h3>
    <p className="text-sm text-gray-600">{location} • {distance}</p>
    
    {/* Neumorphic Action Buttons */}
    <div className="flex gap-3 mt-3">
      <button className="neu-icon-button-lg">
        <XIcon className="text-error-red" />
      </button>
      <button className="neu-icon-button-lg">
        <StarIcon className="text-plus-gold" />
      </button>
      <button className="neu-icon-button-lg">
        <WaveIcon className="text-huddle-blue" />
      </button>
    </div>
  </div>
</div>
```

---

## 10. ICONOGRAPHY SYSTEM (Updated)


### 10.5 Proprietary Icon Rules (No “Lucide Default” Feel)

Icons must feel custom and brand-owned.

**Required optical rules:**
- Optical centering (by eye), not mathematical centering
- Consistent negative space logic across the set
- Corner smoothing is mandatory; no sharp joins
- Avoid overly literal geometry (no “clipart” symbols)

**Neumorphic compatibility:**
- Active state may include subtle fill + tiny drop shadow
- Pressed state may slightly increase stroke (already defined) but must keep silhouette stable

**Production requirement:**
- Export canonical SVGs for the full required set and treat them as design tokens (no mixing with library icons).

### 10.1 Base Specifications

**Style:** Proprietary thin rounded stroke (NOT generic Lucide)

**Core Specs:**
- Stroke width: 1.75pt (increased from 1.5pt for neumorphic compatibility)
- Corner radius: 2pt
- Touch targets: 44×44px minimum
- Grid: 2pt snap
- Weight variation: 1.5pt default, 1.75pt active, 2pt pressed

### 10.2 Icon States

**Default:**
```css
.icon-default {
  stroke-width: 1.75pt;
  color: #6B7280;
  opacity: 0.7;
}
```

**Active (Neumorphic):**
```css
.icon-active {
  stroke-width: 1.75pt;
  fill: #2145CF;
  filter: drop-shadow(2px 2px 4px rgba(33, 69, 207, 0.3));
  opacity: 1;
}
```

**Pressed:**
```css
.icon-pressed {
  stroke-width: 2pt;
  transform: scale(0.95);
  filter: drop-shadow(1px 1px 2px rgba(0, 0, 0, 0.2));
}
```

### 10.3 Required Icons

Home, Map, Broadcast, Threads, Chat, Profile, Settings, Premium (diamond), Verification (checkmark), Nanny, Cart, AI Vet, Star, Wave, Block (circle-slash), Report (flag), Heart, Message, Image, Send, Close

### 10.4 Icon Guidelines

**Prohibited:**
- Copying Lucide directly
- Inconsistent stroke weights
- Sharp corners (0pt radius)
- Decorative flourishes

**Required:**
- Consistent 2pt corner radius
- Smooth curves
- Balanced negative space
- State-aware weight variations

---

## 11. MOTION & PHYSICS (Updated)

### 11.1 Core Principles

**Motion Purpose:**
- Purposeful (not decorative)
- Smooth (no jarring transitions)
- Subtle (no playful bounce)
- Zero layout shift

**Prohibited:**
- Bouncy animations
- Decorative motion (parallax)
- Excessive duration (>500ms)

### 11.2 Animation Tokens

| Interaction | Duration | Easing | Transform |
|-------------|----------|--------|-----------|
| Button press (neumorphic) | 150ms | ease-out | scale(0.98) |
| Glass fade-in | 300ms | ease-out | opacity 0→1, translateY(20px→0) |
| Modal entrance | 300ms | cubic-bezier(0.4,0,0.2,1) | opacity 0→1, scale(0.95→1) |
| Page transition | 250ms | ease-in-out | opacity cross-fade |
| Skeleton shimmer | 1.5s loop | linear | translateX(-100%→100%) |
| Icon state | 200ms | ease-out | fill transition |

### 11.3 Glass Overlay Animation

**Entry:**
```css
@keyframes glass-fade-in {
  0% {
    opacity: 0;
    transform: translateY(20px);
    backdrop-filter: blur(0px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
    backdrop-filter: blur(20px);
  }
}

.glass-overlay {
  animation: glass-fade-in 300ms ease-out;
}
```

### 11.4 Neumorphic Press Physics

**Press Sequence:**
1. User touches (0ms)
2. Scale 1.0 → 0.98 (0-80ms, ease-out)
3. Shadow outer → inner (0-80ms)
4. Hold pressed state
5. Release: 0.98 → 1.0 (80-150ms)

**Implementation:**
```css
.neu-button {
  transition:
    transform 150ms cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.neu-button:active {
  transform: scale(0.98);
  box-shadow:
    inset 3px 3px 6px rgba(0, 0, 0, 0.1),
    inset -2px -2px 4px rgba(255, 255, 255, 0.6);
}
```

### 11.5 Haptic Integration

**iOS:**
```javascript
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';

// Neumorphic button press
const handlePress = async () => {
  await impactAsync(ImpactFeedbackStyle.Light);
};

// Destructive action
const handleDestruct = async () => {
  await impactAsync(ImpactFeedbackStyle.Heavy);
};
```

**Android:**
```javascript
import { HapticFeedbackConstants } from 'react-native';

View.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
View.performHapticFeedback(HapticFeedbackConstants.REJECT);
```

---

## 12. ACCESSIBILITY SAFEGUARDS

### 12.1 Contrast Requirements

**Neumorphic Elements:**
- Text on light: 4.5:1 minimum (WCAG AA)
- Primary blue: White text ✓ (7.2:1)
- Gold: Gray-800 text ✓ (5.8:1)
- Icon buttons: Gray-600 ✓ (4.8:1)

**Glass Overlays:**
- Text on glass: 4.5:1 minimum
- Opacity must not reduce legibility

### 12.2 Focus Indicators

```css
.focusable:focus-visible {
  outline: 2px solid #2145CF;
  outline-offset: 2px;
  border-radius: inherit;
}

.neu-button:focus-visible {
  outline: 2px solid #2145CF;
  outline-offset: 3px;
}
```

### 12.3 Dynamic Type Support

- iOS: Support Dynamic Type
- Android: Support font scaling 1.0–2.0×
- Glass overlays must reflow
- Min 44px touch target maintained

### 12.4 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  
  .glass-overlay {
    animation: none;
    opacity: 1;
    transform: none;
  }
  
  .neu-button:active {
    transition: none;
  }
}
```

### 12.5 Screen Reader Support

```tsx
<button
  className="neu-icon-button"
  aria-label="Send message"
  aria-pressed={isActive}
>
  <SendIcon />
</button>

<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  className="glass-modal"
>
  <h3 id="modal-title">Confirm Action</h3>
</div>
```

---

## 13. IMPLEMENTATION CHECKLIST


## 14. EMOTIONAL TONE & COPY DOCTRINE (Additive)

This section standardizes tone so the product reads premium and calm.

**Voice qualities:**
- Calm, confident, human
- Minimal, never robotic
- Clear, never vague
- Safety-first, never alarmist

**Empty states (pattern):**
- 1 short headline (≤ 8 words)
- 1 supportive line (≤ 14 words)
- 1 primary action

**Upsell states:**
- Transparent: show value, not shame
- One sentence max before CTA
- Always provide “Not now” secondary action

**Safety messaging:**
- Direct instructions
- Avoid exclamation points
- Use warm reassurance, not urgency

(Exact canonical copy lives in MASTER_SPEC.md; this section defines tone + layout rules.)

### Surface Architecture
- [ ] Level 0 (base) on all pages
- [ ] Level 1 (cards) shadow applied
- [ ] Level 2 (glass) restricted to modals only
- [ ] Level 3 (active modal) for critical dialogs
- [ ] No full-page frosted backgrounds
- [ ] Glass fallback implemented

### Neumorphic Components
- [ ] Primary CTA buttons neumorphic
- [ ] Icon buttons neumorphic
- [ ] Filter pills neumorphic toggle
- [ ] Broadcast FAB neumorphic
- [ ] Content cards NOT neumorphic

### Social Feed
- [ ] Thread posts image-led
- [ ] Discovery cards glass overlay
- [ ] Comment composer glass sheet
- [ ] Interaction buttons neumorphic
- [ ] Vertical rhythm space-y-6
- [ ] No symmetric grids

### Motion & Physics
- [ ] Button press 150ms scale(0.98)
- [ ] Glass fade-in 300ms
- [ ] No bounce animations
- [ ] Zero layout shift
- [ ] Haptic integrated

### Accessibility
- [ ] Contrast ratios tested (4.5:1)
- [ ] Focus indicators visible
- [ ] Dynamic Type supported
- [ ] Reduced motion respected
- [ ] ARIA labels added
- [ ] Screen reader tested

---

END OF DESIGN_MASTER_SPEC.md v3.0
