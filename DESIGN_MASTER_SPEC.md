# DESIGN_MASTER_SPEC.md — huddle Visual Architecture Bible

**Version:** 3.2 Canonical  
**Last Updated:** 2026-02-18  
**Status:** Authoritative Design System

---

## 1. Visual Identity Doctrine

### 1.1 Design Philosophy

huddle is a **lifestyle-premium pet safety super-app**, NOT a corporate SaaS dashboard.

**Forbidden Aesthetics:**
- Generic blue SaaS templates
- Symmetric grid layouts
- Dashboard-heavy interfaces
- Dark-mode dominant
- Cartoon pet illustrations
- Cluttered information density

**Required Aesthetics:**
- Lifestyle premium (Airbnb/Spotify editorial quality)
- Asymmetric layouts with intentional tension
- Image-led storytelling
- Hero headers 56-64px
- Warm modern palette (not clinical blue)
- Gradient restraint (accent only, not primary UI)
- Tasteful transparency (overlays, modals)
- Generous whitespace

### 1.2 Color System

**Primary:**
- Huddle Blue: `#2D37C8`
- Usage: CTAs, active states, primary navigation

**Secondary:**
- Gold: `#CFAB21`
- Usage: Premium tier signals, success states, highlights

**Neutral Scale:**
- Gray-50: `#F9FAFB`
- Gray-100: `#F3F4F6`
- Gray-200: `#E5E7EB`
- Gray-300: `#D1D5DB`
- Gray-400: `#9CA3AF`
- Gray-500: `#6B7280`
- Gray-600: `#4B5563`
- Gray-700: `#374151`
- Gray-800: `#1F2937`
- Gray-900: `#111827`

**Semantic Colors:**
- Success: `#10B981`
- Warning: `#F59E0B`
- Error: `#EF4444`
- Info: `#3B82F6`

---

## 2. Typography System

### 2.1 Font Families

**Body Font:** Urbanist (mandatory)
- Warm, humanist, highly readable
- Variable font with 100-900 weight range

**Header Font:** Clash Display (primary recommendation)
- Bold, editorial presence
- Alternatives: Satoshi, General Sans
- Usage: H1-H3 only

**Forbidden:**
- Trebuchet MS
- Calibri
- Generic system fonts as primary

### 2.2 Type Scale

| Level | Font | Weight | Size | Line Height |
|-------|------|--------|------|-------------|
| H1 | Clash Display | Semibold | 56pt | 1.08 (60pt) |
| H2 | Clash Display | Medium | 44pt | 1.1 (48pt) |
| H3 | Clash Display | Medium | 32pt | 1.1 (35pt) |
| H4 | Urbanist | Semibold | 22pt | 1.2 (26pt) |
| Body | Urbanist | Regular | 16pt | 1.5 (24pt) |
| Caption | Urbanist | Medium | 14pt | 1.4 (20pt) |
| Small | Urbanist | Regular | 13pt | 1.45 (19pt) |

### 2.3 Accessibility

**WCAG 2.1 AA Compliance:**
- Headers: 20pt+ minimum
- Body: 14pt+ minimum
- Contrast ratio: 4.5:1 for body text, 3:1 for large text

**Dynamic Type:**
- iOS: Support Dynamic Type size categories
- Android: Support font scaling preferences

---

## 3. Iconography System

### 3.1 Style

**Proprietary thin rounded stroke system**

**Specifications:**
- Stroke width: 1.5pt (at 24×24pt base size)
- Corner radius: 2pt
- Touch targets: 44×44pt minimum
- Grid: 2pt snap

**Prohibited:**
- Generic Lucide icon copies
- Inconsistent stroke weights
- Sharp corners (0pt radius)

### 3.2 Icon States

**Default:**
- 1.5pt stroke
- Gray-500 (#6B7280)
- 60% opacity

**Active:**
- Fill: Huddle Blue (#2D37C8)
- Scale animation: 0.9→1.0 (150ms ease-out)

**Hover:**
- Gray-500 (#6B7280)
- 100% opacity
- No scale change

### 3.3 Required Icons

- Home
- Map
- Broadcast
- Threads
- Chat
- Profile
- Settings
- Premium (diamond)
- Verification (checkmark badge)
- Nanny
- Cart
- AI Vet
- Star
- Wave
- Block (circle with slash)
- Report (flag)

---

## 4. Mobile-First Information Architecture

### 4.1 Core Principles

**Mobile-First Doctrine:**
- No split-pane layouts
- 44px minimum tap targets (iOS Human Interface Guidelines)
- Stacked navigation (no horizontal tabs on mobile)
- Bottom-sheet modal pattern
- Touch-first design (hover optional)
- Safe-area compatible (notch/home indicator)
- Dynamic Type compatible

**Prohibited:**
- Desktop-first layouts adapted for mobile
- Touch targets <44px
- Horizontal scrolling as primary navigation
- Hover-dependent interactions

### 4.2 Navigation Structure

**Bottom Tab Bar (Primary Navigation):**
1. Home
2. Map
3. Broadcast (FAB-style, elevated)
4. Threads
5. Chats

**Top Navigation:**
- Page title (center)
- Back button (left, when applicable)
- Context actions (right, max 2)

**Settings Access:**
- Profile tab → Gear icon (top-right)

---

## 5. Broadcast Modal UI

### 5.1 Four-Constraint Separation

**Modal MUST visually separate four distinct concepts:**

**1. Monthly Quota Remaining**
- Position: Top-right corner badge
- Format: "8 broadcasts left this month"
- Prohibited: "8 of 10", "8/10", or numeric cap exposure
- Color: Gray-500 text, white background, pill shape
- Updates: Real-time after each broadcast creation

**2. Active Slots Used**
- Position: Below quota badge
- Format: "Active broadcasts: 5"
- Prohibited: Limit numbers (e.g., "5 of 7")
- Tooltip: "Upgrade for more active slots" (do NOT state numeric cap)
- Color: Gray-700 default, Warning (#F59E0B) if approaching limit
- Behavior: User learns limit by hitting boundary, not by seeing number

**3. Duration Selector**
- Position: Middle section, horizontal slider
- Range: 1h → tier_max (12h/24h/48h)
- Label: "Broadcast duration"
- Display: "12 hours" (dynamic text below slider)
- Super Broadcast override: Lock to 72h with gold badge if credit available

**4. Radius Selector**
- Position: Below duration, horizontal slider
- Range: 0.5km → tier_max (10km/25km/50km)
- Label: "Broadcast radius"
- Display: "10 km" (dynamic text below slider)
- Visual: Circle preview on mini-map
- Super Broadcast override: Lock to 150km with gold badge if credit available

### 5.2 Validation States

**Quota Exhausted:**
- Disable "Send Broadcast" button
- Show upsell modal on tap

**Active Slots Full:**
- Disable "Send Broadcast" button
- Show upsell modal on tap

**Super Broadcast Toggle:**
- When enabled: Duration=72h, Radius=150km, bypass active slot check
- Gold badge indicator on toggle

---

## 6. Upsell Modals

### 6.1 Modal Structure

**Layout:**
- Centered modal on web
- Bottom-sheet on mobile
- Dismiss: Tap outside or close icon (top-right)

**Content:**
- Headline (H3, Clash Display Medium)
- Body text (Body, Urbanist Regular)
- Primary CTA (Button, Huddle Blue)
- Secondary CTA (Text button, Gray-600, optional)

### 6.2 Upsell Copy (Required)

**Discovery Exhausted:**
- Headline: "Discovery limit reached"
- Body: "Upgrade to Plus for ×2 daily discovery"
- CTA: "Upgrade to Plus"

**Threads Exhausted:**
- Headline: "Daily post limit reached"
- Body: "Upgrade to Plus to post more"
- CTA: "Upgrade to Plus"

**Broadcast Quota Exhausted:**
- Headline: "You've reached your broadcast limit"
- Body: "Upgrade to Plus for more monthly broadcasts"
- CTA: "Upgrade to Plus"
- Prohibited: "Upgrade to Plus for 40 broadcasts" (exposes backend cap)

**Active Slots Full:**
- Headline: "You have too many active broadcasts"
- Body: "Wait for one to expire or upgrade for more active slots"
- CTA Primary: "Upgrade to Plus"
- CTA Secondary: "Wait"
- Prohibited: "Upgrade to Plus for 7 active slots" (exposes backend cap)

**Stars Depleted:**
- Headline: "Out of Stars"
- Body: "Upgrade to Plus for 4 Stars per month or Gold for 10"
- CTA: "Upgrade"

**AI Vet Exhausted:**
- Headline: "Daily photo upload limit reached"
- Body: "Upgrade to Plus for 20 uploads per day"
- CTA: "Upgrade to Plus"

### 6.3 Upsell Rules

**Prohibited:**
- Exposing backend caps (threads numeric totals, discovery numeric totals, broadcast numeric quotas/slots)

**Allowed:**
- User-facing perks (AI Vet upload numbers, Star numbers)

**General Principle:**
- User learns limits by hitting boundaries, not by reading numbers

---

## 7. Membership Comparison UI

### 7.1 Tier Cards

**Layout:**
- Three vertical cards: Free | Plus ($5.99/mo) | Gold ($11.99/mo)
- Monthly/Annual toggle at top
- Annual shows "Save 17%" badge

**Card Structure:**
- Tier name (H3)
- Price (H2, emphasized)
- Feature list (Body, 8-12 items)
- CTA button ("Current Plan" or "Upgrade")

### 7.2 Feature Display Rules

**Show Publicly:**
- AI Vet: "5/day", "20/day", "40/day"
- Discovery: "Limited", "×2 Discovery", "Unlimited"
- Stars: "4/month", "10/month"
- Filters: "Basic", "Advanced", "Advanced + Active Now"

**Never Show:**
- Threads: "10/day", "30/day", "60/day"
- Discovery: "100/day", "250/day"
- Broadcast: "10/month", "40/month", "80/month"
- Active slots: "7", "7", "7"
- Any "X of Y" format

---

## 8. Block & Report UI

### 8.1 Block Action

**Entry Points:**
- Profile view: Three-dot menu → "Block User"
- Chat view: Three-dot menu → "Block User"

**Flow:**
1. User taps "Block User"
2. Confirmation modal appears:
   - Headline: "Block [DisplayName]?"
   - Body: "You won't see each other in Discovery, Map, or Threads. You can unblock later in Settings."
   - Primary CTA: "Block" (red, destructive)
   - Secondary CTA: "Cancel" (gray)
3. On confirm: Immediate block, modal dismisses, user removed from view

**Visual:**
- Block icon: Red circle with diagonal slash (universal prohibition symbol)
- Modal: Bottom-sheet on mobile, centered on web
- Destructive action: Red primary button

**Post-Block State:**
- Show brief toast: "User blocked"
- Remove blocked user from all views immediately

### 8.2 Report Action

**Entry Points:**
- Profile view: Three-dot menu → "Report User"
- Message view: Long-press message → "Report Message"

**Flow:**
1. User taps "Report"
2. Report modal appears:
   - Headline: "Report [DisplayName]"
   - Body: "Select reason for reporting:"
   - Category dropdown:
     - Harassment
     - Spam
     - Inappropriate content
     - Underage user
     - Other
   - Optional text input: "Additional details" (500 char max)
   - Primary CTA: "Submit Report"
   - Secondary CTA: "Cancel"
3. On submit: Report filed, modal dismisses, confirmation shown

**Visual:**
- Report icon: Yellow flag
- Modal: Standard modal (not bottom-sheet)
- Emphasis: Moderate (not destructive like Block)

**Post-Report State:**
- Show brief toast: "Report submitted. Our team will review."
- Do NOT hide reported user from reporter

### 8.3 Combined Block + Report

**Entry Point:**
- Three-dot menu → "Block & Report User"

**Flow:**
- Same as Report flow, but automatically blocks user after report submission

**Use Case:**
- Severe violations requiring both immediate protection and admin review

---

## 9. Motion & Haptic Hierarchy

### 9.1 Motion Principles

**Core Principles:**
- Purposeful, not decorative
- Smooth transitions (150-300ms)
- Ease-out for entrances
- Ease-in for exits
- Scale transformations for emphasis (0.9→1.0)

**Prohibited:**
- Bouncy animations
- Excessive motion (>500ms for single transition)
- Parallax scrolling as primary pattern

### 9.2 Animation Tokens

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Micro-interactions (button tap) | 150ms | ease-out |
| Page transitions | 250ms | ease-in-out |
| Modal entrances | 300ms | ease-out |
| Loading states (skeleton shimmer) | 1.5s loop | linear |

### 9.3 Haptic Feedback (iOS)

**Impact Levels:**
- Light: Button taps, toggles, minor interactions
- Medium: Form submissions, confirmations, successful actions
- Heavy: Destructive actions (delete, block), critical errors

**Notification Types:**
- Success: Broadcast sent, upload complete, booking confirmed
- Warning: Quota limits, upsells, non-blocking errors
- Error: Failed actions, validation errors, network failures

**Implementation:**
```javascript
import { impactAsync, ImpactFeedbackStyle, notificationAsync, NotificationFeedbackType } from 'expo-haptics';

// Button tap
impactAsync(ImpactFeedbackStyle.Light);

// Form submit
impactAsync(ImpactFeedbackStyle.Medium);

// Block user
impactAsync(ImpactFeedbackStyle.Heavy);

// Success state
notificationAsync(NotificationFeedbackType.Success);
```

### 9.4 Haptic Feedback (Android)

**Constants:**
- VIRTUAL_KEY: Button taps
- CONFIRM: Form submissions
- REJECT: Destructive actions

**Implementation:**
```javascript
import { HapticFeedbackConstants } from 'react-native';

// Button tap
View.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);

// Form submit
View.performHapticFeedback(HapticFeedbackConstants.CONFIRM);

// Block user
View.performHapticFeedback(HapticFeedbackConstants.REJECT);
```

---

## 10. Component Library

### 10.1 Button System

**Primary Button:**
- Background: Huddle Blue (#2D37C8)
- Text: White
- Height: 48px (mobile), 44px (web)
- Border radius: 8px
- Hover: Darken 10%
- Active: Scale 0.98

**Secondary Button:**
- Background: Transparent
- Border: 1px solid Gray-300
- Text: Gray-700
- Height: 48px (mobile), 44px (web)
- Border radius: 8px

**Destructive Button:**
- Background: Error (#EF4444)
- Text: White
- Height: 48px (mobile), 44px (web)
- Border radius: 8px

### 10.2 Input Fields

**Text Input:**
- Height: 48px
- Border: 1px solid Gray-300
- Border radius: 8px
- Padding: 12px 16px
- Focus: Border → Huddle Blue, 2px
- Error: Border → Error (#EF4444), 2px

**Label:**
- Font: Urbanist Medium 14pt
- Color: Gray-700
- Position: Above input, 8px margin

**Helper Text:**
- Font: Urbanist Regular 13pt
- Color: Gray-500
- Position: Below input, 6px margin

**Error Text:**
- Font: Urbanist Medium 13pt
- Color: Error (#EF4444)
- Position: Below input, 6px margin

### 10.3 Modal System

**Standard Modal (Web):**
- Max width: 500px
- Centered on screen
- Overlay: Black 40% opacity
- Border radius: 12px
- Padding: 24px

**Bottom Sheet (Mobile):**
- Full width
- Slide up from bottom
- Border radius: 16px 16px 0 0
- Safe area padding (bottom)
- Drag handle at top

### 10.4 Card System

**Profile Card:**
- Border radius: 12px
- Shadow: 0 2px 8px rgba(0,0,0,0.08)
- Padding: 16px
- Image aspect ratio: 1:1

**Broadcast Alert Card:**
- Border radius: 8px
- Border left: 4px solid (alert type color)
- Padding: 12px
- Shadow: 0 1px 4px rgba(0,0,0,0.06)

---

## 11. Spacing System

### 11.1 Base Unit

**8pt Grid System:**
- All spacing increments of 8pt
- Tailwind spacing: `space-{n}` where n × 0.25rem = spacing

### 11.2 Common Spacing

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon padding, micro-spacing |
| sm | 8px | Tight grouping |
| md | 16px | Standard element spacing |
| lg | 24px | Section spacing |
| xl | 32px | Major section breaks |
| 2xl | 48px | Page-level spacing |

---

## 12. Responsive Breakpoints

| Breakpoint | Min Width | Usage |
|------------|-----------|-------|
| sm | 640px | Large phones, small tablets |
| md | 768px | Tablets |
| lg | 1024px | Laptops |
| xl | 1280px | Desktops |
| 2xl | 1536px | Large desktops |

**Mobile-First Approach:**
- Base styles: Mobile (320px+)
- Progressive enhancement: Tablet (768px+), Desktop (1024px+)

---

## 13. Illustration Style

### 13.1 Photography

**Style:**
- Lifestyle, candid
- Natural lighting
- Pet-centric composition
- Warm tones

**Prohibited:**
- Stock photo aesthetics
- Overly posed
- Clinical/sterile environments

### 13.2 Icons & Graphics

**Style:**
- Thin rounded stroke (1.5pt)
- 2pt corner radius
- Monochromatic or two-tone
- Minimal detail

**Prohibited:**
- Cartoon illustrations
- Flat 2D pet graphics
- Emoji-style icons

---

END OF DESIGN_MASTER_SPEC.md
