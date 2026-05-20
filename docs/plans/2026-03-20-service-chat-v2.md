# Service Chat — Definitive Implementation Plan (v2)

> **Apple UX Audit Applied.** This replaces the original service-chat plan.
> Every UX decision is justified. Every component is fully specified. No guesswork.

---

## Complexity Rating: HIGH

| Area | Risk | Why |
|------|------|-----|
| Stripe hold-then-release | HIGH | No `transfer_data` at checkout; metadata must survive full lifecycle; manual `transfers.create` on completion |
| Realtime dual-user state sync | HIGH | Two users, same DB row, different UI — requester sees "Accept & pay", provider sees "Edit quote" |
| State machine enforcement | MEDIUM | 6 states, 9 transitions, each guarded by a security-definer RPC |
| Role-aware UI (same page, two renders) | MEDIUM | Every chip, card action, and header element is role-conditional |
| Layout stacking (fixed layers) | MEDIUM | Header + BookingCard + ActionBar + Composer all fixed; message list must measure and pad correctly |
| Progressive multi-step forms | MEDIUM | RequestForm, ReviewFlow, DisputeFlow all need step management |

---

## Apple UX Audit — What Was Wrong in v1 (and Why)

### ❌ Problem 1: Primary CTA Buried in Scroll
`PublicCarerProfileView` — "Request a service" button at the bottom of a scrollable content area.
**Apple principle:** The primary action must always be visible. Never make the user scroll to find it.
**Fix:** Sticky CTA footer inside the modal — always visible regardless of scroll position. Visually separated from content with a gradient fade.

### ❌ Problem 2: Two Separate Pinned Cards
`RequestCard` + `QuoteCard` stacked above the message list.
**Apple principle:** One surface, one truth. Multiple stacked cards create visual noise and communicate nothing clearly.
**Fix:** ONE `BookingCard` that morphs through states. It's a single card that transforms as the booking progresses — like a boarding pass. Status-driven views: Empty → Request → Quote → Booked (receipt). `AnimatePresence` + `layout` for smooth morphing.

### ❌ Problem 3: Horizontal Scrolling Action Chips
`QuickActionChips` — a scrollable horizontal strip of buttons.
**Apple principle:** Horizontal scrolling in action areas is an Android pattern. It implies the designer didn't know which action to prioritise. Apple always has ONE primary action.
**Fix:** `ActionBar` — a single prominent primary CTA button above the Composer, plus one optional secondary text action. Only ever one button highlighted at a time. Returns `null` when no action is available.

### ❌ Problem 4: Locked Composer Showing a Disabled Input
Disabling the Composer textarea with a placeholder message.
**Apple principle:** Never show a broken or disabled control as the focus of a screen. If an action isn't available, replace it with something that IS available.
**Fix:** When the requester hasn't sent a request yet, replace the Composer entirely with a `StartRequestBar` — a tappable full-width row ("Start with a request →") that opens RequestForm. The Composer appears only after the first request is sent.

### ❌ Problem 5: BookingConfirmSheet is a Modal Sheet
Payment confirmation as a bottom sheet with a checkbox.
**Apple principle:** Payment is a MOMENT. It deserves the full screen. It should feel as premium as Apple Pay — clean summary, clear total, single action button. Terms should not be a blocking checkbox; they should be a scrollable section the user can read inline.
**Fix:** `BookingConfirmScreen` — a full-page push modal (not a sheet). Receipt-style booking summary. "Proceed to payment" as the one and only CTA. Terms as a scrollable inline block, not a checkbox gate.

### ❌ Problem 6: Status Transitions Are Silent
When status changes (pending → booked, booked → completed), only the header badge updates.
**Apple principle:** State transitions are moments worth celebrating or acknowledging. A silent badge change misses the emotional beat.
**Fix:**
- `booked`: Full-screen `BookingConfirmedOverlay` — green checkmark, spring animation, "Booking confirmed", auto-dismisses after 2.5s. This plays on return from Stripe AND on realtime update.
- `completed`: Inline celebration — `service_completed` system pill + `ReviewPrompt` nudge appears in ActionBar.
- Other transitions: Animated system event pill slides up from the message list.

### ❌ Problem 7: "Mark Finished" Has No Waiting State
Both parties tap independently with no feedback about whether the other has confirmed.
**Apple principle:** When an action requires confirmation from both parties, communicate the waiting state explicitly. Don't leave users wondering "did it work?"
**Fix:** After tapping "Service complete", if the other party hasn't confirmed yet: ActionBar shows "Waiting for [Name] to confirm…" with a subtle pulse animation. If they already confirmed: instant completion flow. The `requesterMarkFinished` / `providerMarkFinished` flags drive this.

### ❌ Problem 8: ReviewSheet Is One Form Dump
Stars + tags + textarea all visible simultaneously.
**Apple principle:** Progressive disclosure. Guide the user one step at a time. Each step should feel easy and natural — not like filling out a form.
**Fix:** `ReviewFlow` — a 3-step progressive experience:
1. **Stars** (centred, large, spring animation on tap) — "How was [Name]?"
2. **Tags** (fade in after rating) — "What stood out?"
3. **Text** (optional, appears after tags) — "Anything to add?"
Submit CTA only appears after Step 1. Each step is a `AnimatePresence` transition.

### ❌ Problem 9: DisputeForm Feels Bureaucratic
One-page form with a dropdown, textarea, and file picker.
**Apple principle:** When something goes wrong, the user is already stressed. Lead with empathy. Use large, clear choices. Break into steps so it feels manageable.
**Fix:** `DisputeFlow` — 3-step flow:
1. **Category** (large tappable option cards, not a dropdown) — "What happened?"
2. **Details** (textarea with character count, helper text) — "Tell us more"
3. **Evidence** (optional image upload, clear empty state) — "Add photos if you have them"

### ❌ Problem 10: Chats Service Tab Rows Look Like DMs
Service chat rows would render the same as regular chat rows.
**Apple principle:** A booking is not a conversation. It has status, a service type, a date. The row should communicate these things at a glance.
**Fix:** Dedicated `ServiceChatRow` component — status badge as the leading visual element, service type + booking date visible in the subtitle line, no "last message" preview (the status IS the status).

### ❌ Problem 11: No Idempotent Entry from Carer Profile
Tapping "Request a service" always calls `create_service_chat`, potentially creating duplicates.
**Fix:** Before creating a new chat, check for an existing `service_chats` row where `requester_id = uid AND provider_id = providerId`. If one exists, navigate to it. Only create a new one if none exists. This must be done client-side before calling the RPC.

### ❌ Problem 12: No Loading / Error / Empty States Specified
The original plan mentions no skeleton loaders, no empty states, no retry patterns.
**Apple principle:** The app should feel polished at every state — loading, empty, error, success.
**Fix:** Every async surface needs:
- **Loading:** Skeleton shimmer (not spinners) for the BookingCard and message list
- **Empty state:** Purposeful illustration + contextual guidance
- **Error:** Inline error with retry action, not just a toast

---

## Visual Design System for Service Chat

### Colour Language (service-specific, extends app tokens)

```css
/* Service status colours — MUST be added to UI_CONTRACT Section 12 + tokens.css in Phase 0
   before any component uses these vars. UI_CONTRACT Rule 2: no new :root tokens outside Section 12. */
--service-pending:    #888888;        /* Neutral grey — not started */
--service-pending-bg: rgba(136,136,136,0.10);
--service-booked:     #16a34a;        /* Emerald — confirmed */
--service-booked-bg:  rgba(22,163,74,0.10);
--service-progress:   #2563eb;        /* Blue — active */
--service-progress-bg:rgba(37,99,235,0.10);
--service-complete:   #16a34a;        /* Emerald — done */
--service-complete-bg:rgba(22,163,74,0.10);
--service-disputed:   #ef6450;        /* Coral — problem */
--service-disputed-bg:rgba(239,100,80,0.10);
```

### Typography Scale (service-chat components only)

| Use | Size | Weight | Colour |
|-----|------|--------|--------|
| Card section label | 10px | 700 | `--muted-foreground`, tracking-widest, UPPERCASE |
| Card primary value | 15px | 600 | `#424965` |
| Card secondary | 13px | 400 | `#424965` |
| Card meta (date, location) | 12px | 400 | muted-foreground |
| Price display | 22px | 700 | `#424965` |
| Price unit | 12px | 400 | muted-foreground |
| Status badge | 10px | 600 | status colour var |
| System event pill | 12px | 500 | contextual |
| Action button | 14px | 600 | white / brandText |
| Secondary action | 13px | 500 | muted-foreground |

### Component Shells

```
BookingCard:    rounded-[18px] border border-border/30 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.06)]
                ⚠ NO backdrop-filter. NeuSurface recipe. Not a glass surface.
ActionBar:      px-4 py-3 bg-background border-t border-border/20
                ⚠ NO backdrop-blur. NO backdrop-filter. Solid background only.
                  Glass Chrome Density Rule: ChatHeader is the 1 glass bar. ActionBar is solid.
SystemPill:     rounded-full px-3 py-1 text-[12px] font-[500] — contextual bg/colour
ReceiptCard:    rounded-[16px] bg-[rgba(33,69,207,0.04)] border border-[#2145CF]/15 p-4
```

### Animations (framer-motion throughout)

- **BookingCard morph:** `layout` + `AnimatePresence` on child sections. Duration 300ms, spring damping 28, stiffness 220.
- **System pills:** `initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}`. Duration 200ms ease-out.
- **ActionBar transitions:** `AnimatePresence` mode="wait". Slide + fade, 150ms.
- **BookingConfirmed overlay:** Scale from 0.92 + fade. Spring damping 20, stiffness 280.
- **Review stars:** Scale 1 → 1.3 → 1 on select, spring. Gold fill transition 120ms.
- **Step transitions (ReviewFlow/DisputeFlow):** `x: [-20,0]` + `opacity: [0,1]` slide-in. 180ms ease.
- **StartRequestBar pulse:** Subtle `scale: [1,1.02,1]` loop, 2s interval.

---

## State Machine Reference

```
┌─────────────────────────────────────────────────────────────────────┐
│  Status: pending                                                     │
│  ├─ No request_card → requester sees StartRequestBar                │
│  │                    provider sees "Awaiting request from [Name]"  │
│  ├─ Has request_card, no quote_card                                 │
│  │  → requester: "Request sent" on BookingCard, chat enabled        │
│  │  → provider: ActionBar shows "Send a quote"                      │
│  └─ Has request_card + quote_card                                   │
│     → requester: ActionBar shows "Accept & pay" + "Ask to revise"  │
│     → provider: "Quote sent" on BookingCard                         │
├─────────────────────────────────────────────────────────────────────┤
│  Status: booked                                                      │
│  → BookingCard shows receipt view (service + pet + date + amount)  │
│  → requester: "Dispute" secondary action only                       │
│  → provider: ActionBar "Start service" + "Dispute" secondary        │
├─────────────────────────────────────────────────────────────────────┤
│  Status: in_progress                                                 │
│  → requester: ActionBar "Service complete" (disabled if date !past)│
│  → provider: ActionBar "Service complete" (disabled if date !past) │
│  → both: "Waiting for [Name]…" if own flag set but not other's     │
│  → "Dispute" secondary action for both                              │
├─────────────────────────────────────────────────────────────────────┤
│  Status: completed                                                   │
│  → requester: ActionBar "Leave a review" (if not reviewed)         │
│  │            "Dispute" secondary (within 48h)                      │
│  → provider: no ActionBar (or "Dispute" within 48h)                │
├─────────────────────────────────────────────────────────────────────┤
│  Status: disputed                                                    │
│  → DisputeBanner replaces BookingCard                               │
│  → ActionBar hidden for both                                        │
│  → Composer still open                                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## File Manifest

| Phase | Action | File | Notes |
|-------|--------|------|-------|
| 0 | AMEND | `MASTER_SPEC.md` | Add `/service-chat` route to route manifest |
| 0 | AMEND | `UI_CONTRACT.md` Section 4 | Add ServiceChat to Page Index with T6 template |
| 0 | AMEND | `UI_CONTRACT.md` Section 12 | Add service-status CSS tokens |
| 0 | AMEND | `DESIGN_MASTER_SPEC.md` Section 12 | Mirror token additions (consolidated spec) |
| 0 | AMEND | `src/routes/ROUTE_MANIFEST.ts` | Add `/service-chat` path |
| 1 | CREATE | `supabase/migrations/20260320100000_service_chat_schema.sql` | Already written |
| 2 | CREATE | `supabase/functions/create-service-payment/index.ts` | New edge fn |
| 2 | CREATE | `supabase/functions/release-service-payout/index.ts` | New edge fn |
| 2 | MODIFY | `supabase/functions/stripe-webhook/index.ts` | Add service_booking case |
| 3 | CREATE | `src/components/service-chat/types.ts` | All TS interfaces |
| 4 | CREATE | `src/hooks/useServiceChat.ts` | Full data + mutation hook |
| 5 | CREATE | `src/components/service-chat/BookingCard.tsx` | Morphing state card |
| 5 | CREATE | `src/components/service-chat/ActionBar.tsx` | Single CTA bar |
| 5 | CREATE | `src/components/service-chat/ServiceChatHeader.tsx` | Fixed header |
| 5 | CREATE | `src/components/service-chat/DisputeBanner.tsx` | Dispute state banner |
| 5 | CREATE | `src/components/service-chat/StartRequestBar.tsx` | Replaces composer pre-request |
| 5 | CREATE | `src/components/service-chat/BookingConfirmedOverlay.tsx` | Full-screen celebration |
| 5 | CREATE | `src/components/service-chat/SystemEventPill.tsx` | Animated status event |
| 6 | CREATE | `src/components/service-chat/RequestForm.tsx` | Request bottom sheet |
| 6 | CREATE | `src/components/service-chat/QuoteForm.tsx` | Quote bottom sheet |
| 6 | CREATE | `src/components/service-chat/BookingConfirmScreen.tsx` | Full-screen payment confirm (T4) |
| 6 | CREATE | `src/components/service-chat/ReviewFlow.tsx` | 3-step progressive review |
| 6 | CREATE | `src/components/service-chat/DisputeFlow.tsx` | 3-step dispute form |
| 7 | CREATE | `src/pages/ServiceChat.tsx` | Main page |
| 8 | MODIFY | `src/App.tsx` | Add `/service-chat` route |
| 8 | MODIFY | `src/routes/ROUTE_MANIFEST.ts` | Add `/service-chat` path string |
| 8 | MODIFY | `src/components/service/PublicCarerProfileView.tsx` | Sticky CTA + nav |
| 8 | MODIFY | `src/components/service/PublicCarerProfileModal.tsx` | Pass onClose down |
| 8 | MODIFY | `src/pages/Chats.tsx` | Service tab + ServiceChatRow |
| 9 | CREATE | `src/legal/pet-care-booking-terms.html` | Booking terms |
| 10 | — | `npm run build` | Verification |
| 11 | — | `supabase functions deploy` | Deploy 3 functions |

**Total: 29 files. 18 new, 11 modified (includes 4 contract amendments + ROUTE_MANIFEST).**

---

## Phase 0 — Contract Amendments (MUST complete before any other phase)

### Goal
The UI_CONTRACT and MASTER_SPEC are the single source of truth. Introducing a new route and new CSS tokens without amending them first is a contract violation. This phase makes the amendments official before any code is written.

### Why This Phase Exists
- DESIGN_MASTER_SPEC Rule 4: *"Every route MUST have a Page Index entry. A page with no entry is UNMAPPED and MUST NOT be modified until it receives a contract amendment."*
- DESIGN_MASTER_SPEC Rule 2: *"MUST NOT create new CSS custom properties outside Section 12. If a value has no Section 12 token, amend Section 12 first."*
- DESIGN_MASTER_SPEC No-guessing rule: *"Do not add new tabs, screens, or routes that are not already defined in MASTER_SPEC.md."*

### Task List
- [ ] 0.1 — Amend `MASTER_SPEC.md` — add `/service-chat` to the canonical route list
- [ ] 0.2 — Amend `UI_CONTRACT.md` Section 4 Page Index — add ServiceChat entry
- [ ] 0.3 — Amend `UI_CONTRACT.md` Section 12 — add service-status tokens
- [ ] 0.4 — Mirror the same token additions in `DESIGN_MASTER_SPEC.md` Section 12 (consolidated spec)
- [ ] 0.5 — Update `src/routes/ROUTE_MANIFEST.ts` — add `/service-chat` path

---

### 0.1 — MASTER_SPEC.md Amendment

In the canonical route list (around line 1091 where `/chats` and `/chat-dialogue` appear), add:
```
- `/service-chat`        (service booking conversation)
```

---

### 0.2 — UI_CONTRACT.md Section 4 Page Index Amendment

In the MAPPED ROUTES table, add the following row **after the `/chat/:id` (Group) row**:

```
| `/service-chat` | T6 Conversational (Extended) | ServiceChatHeader + BookingCard(fixed) + ActionBar(fixed) + MessageThread + Composer or StartRequestBar | See service-chat notes below |
```

Add the following note block immediately after the table:

```
### T6 Extension — Service Chat (`/service-chat`)

ServiceChat uses T6 Conversational as its base template with two structural additions:

1. **BookingCard** (fixed, `top: 56px`, below ChatHeader)
   - NOT a glass surface. Uses NeuSurface recipe: `bg-white border border-border/30
     shadow-[0_2px_16px_rgba(0,0,0,0.06)]`. No `backdrop-filter`.
   - Does NOT count as a persistent glass chrome bar (not glass-e1/e2/e3).
   - MessageThread `paddingTop` is dynamically measured via ResizeObserver to account
     for both the 56px ChatHeader and the BookingCard height.

2. **ActionBar** (fixed, above Composer)
   - NOT a glass surface. Uses solid background: `bg-background border-t border-border/20`.
     No `backdrop-filter`. No `backdrop-blur`.
   - Counts as a secondary action zone (same status as StickyCTA in T3/T4).
   - Glass Chrome Density: ChatHeader (1 glass bar) + Composer (1 glass action zone) +
     ActionBar (solid, non-glass) = COMPLIANT.

Safe-area for ActionBar: `pb-[env(safe-area-inset-bottom,0px)]` applied to the ActionBar
container (it sits above Composer which already handles safe-area).

Control compliance: All interactive elements in BookingCard, ActionBar, RequestForm,
QuoteForm, BookingConfirmScreen, ReviewFlow, DisputeFlow MUST use NeuControl + FormField
primitives per Section 2. No raw `<button>`, `<input>`, `<textarea>`, `<select>`.
```

---

### 0.3 / 0.4 — Section 12 Token Amendment (both UI_CONTRACT.md and DESIGN_MASTER_SPEC.md)

In Section 12 of **both files**, under the colour tokens block, add:

```css
/* ── Service Chat status colours ───────────────────────────────────────── */
--service-pending:     #888888;
--service-pending-bg:  rgba(136,136,136,0.10);
--service-booked:      #16a34a;
--service-booked-bg:   rgba(22,163,74,0.10);
--service-progress:    #2563eb;
--service-progress-bg: rgba(37,99,235,0.10);
--service-complete:    #16a34a;
--service-complete-bg: rgba(22,163,74,0.10);
--service-disputed:    #ef6450;
--service-disputed-bg: rgba(239,100,80,0.10);
```

Also add to `src/styles/tokens.css` (whichever file `src/styles/tokens.css` or `src/index.css` holds `:root` tokens).

---

### 0.5 — ROUTE_MANIFEST.ts

Open `src/routes/ROUTE_MANIFEST.ts`. Add `/service-chat` to the exported array:
```typescript
// Find the array of route paths. Add:
"/service-chat",
```

### Phase 0 Verification
```bash
# Confirm route appears in MASTER_SPEC
grep "service-chat" MASTER_SPEC.md
# Confirm route appears in UI_CONTRACT Section 4
grep "service-chat" UI_CONTRACT.md
# Confirm tokens appear in both contract files
grep "service-pending" UI_CONTRACT.md DESIGN_MASTER_SPEC.md
# Confirm ROUTE_MANIFEST updated
grep "service-chat" src/routes/ROUTE_MANIFEST.ts
```
Expected: all 4 commands return matches.

---

## Phase 1 — Database Foundation

### Goal
All tables and RPCs live in the database. Frontend can be type-checked against this schema from day one.

### Task List
- [ ] 1.1 — Apply migration via Supabase MCP `apply_migration`
- [ ] 1.2 — Verify 3 tables created in Supabase dashboard
- [ ] 1.3 — Verify 9 RPCs created and callable
- [ ] 1.4 — Test `create_service_chat` RPC manually returns a `chat_id`

### Schema: `service_chats`
```sql
id                        uuid PK default gen_random_uuid()
chat_id                   uuid UNIQUE NOT NULL FK → chats(id) ON DELETE CASCADE
requester_id              uuid NOT NULL FK → auth.users(id)
provider_id               uuid NOT NULL FK → auth.users(id)
status                    text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','booked','in_progress','completed','disputed'))
request_card              jsonb          -- ServiceRequestCard shape
quote_card                jsonb          -- ServiceQuoteCard shape
request_sent_at           timestamptz
quote_sent_at             timestamptz
booked_at                 timestamptz
in_progress_at            timestamptz
completed_at              timestamptz
disputed_at               timestamptz
stripe_payment_intent_id  text
stripe_checkout_session_id text
payout_released_at        timestamptz
requester_mark_finished   boolean NOT NULL DEFAULT false
provider_mark_finished    boolean NOT NULL DEFAULT false
created_at                timestamptz DEFAULT now()
updated_at                timestamptz DEFAULT now()
```

RLS:
- `SELECT`: `requester_id = auth.uid() OR provider_id = auth.uid()`
- No INSERT/UPDATE/DELETE policies — all writes through security-definer RPCs only

### Schema: `service_disputes`
```sql
id                uuid PK
service_chat_id   uuid NOT NULL FK → service_chats(id) ON DELETE CASCADE
filed_by          uuid NOT NULL FK → auth.users(id)
category          text NOT NULL
description       text NOT NULL
evidence_urls     text[] NOT NULL DEFAULT '{}'
status            text NOT NULL DEFAULT 'open' CHECK IN ('open','resolved','closed')
admin_notes       text
created_at / updated_at  timestamptz
```

RLS SELECT: `filed_by = auth.uid()` OR is either party of the linked service_chat.

### Schema: `service_reviews`
```sql
id                uuid PK
service_chat_id   uuid NOT NULL FK → service_chats(id)
reviewer_id       uuid NOT NULL FK → auth.users(id)
provider_id       uuid NOT NULL FK → auth.users(id)
rating            int NOT NULL CHECK (rating BETWEEN 1 AND 5)
tags              text[] NOT NULL DEFAULT '{}'
review_text       text
created_at        timestamptz
UNIQUE (service_chat_id, reviewer_id)     -- one review per requester per booking
```

RLS SELECT: `true` (reviews are public). INSERT: `reviewer_id = auth.uid()`.

### 9 RPCs — All `security definer`, `set search_path to 'public'`

**`create_service_chat(p_provider_id uuid) → uuid`**
```
Guards:  auth.uid() NOT NULL; p_provider_id ≠ auth.uid()
Action:  INSERT chats (type='service', created_by=uid)
         INSERT chat_room_members × 2
         INSERT service_chats (chat_id, requester_id=uid, provider_id)
Returns: chat_id (the chats.id, used for navigation and all subsequent calls)
```

**`send_service_request(p_chat_id uuid, p_request_card jsonb) → void`**
```
Guards:  caller = requester_id; status = 'pending'
Action:  UPDATE service_chats SET request_card, request_sent_at, updated_at
         INSERT chat_messages content = '{"kind":"service_request_sent","serviceType":...,"requestedDate":...}'
         UPDATE chats SET last_message_at
```

**`withdraw_service_request(p_chat_id uuid) → void`**
```
Guards:  caller = requester_id; status = 'pending'
Action:  UPDATE service_chats SET request_card=null, request_sent_at=null,
                                   quote_card=null, quote_sent_at=null
         (clears quote too — a withdrawn request invalidates any pending quote)
```

**`send_service_quote(p_chat_id uuid, p_quote_card jsonb) → void`**
```
Guards:  caller = provider_id; request_card IS NOT NULL; status = 'pending'
Action:  UPDATE service_chats SET quote_card, quote_sent_at, updated_at
         INSERT chat_messages content = '{"kind":"service_quote_sent","currency":...,"finalPrice":...,"rate":...}'
         UPDATE chats SET last_message_at
```

**`withdraw_service_quote(p_chat_id uuid) → void`**
```
Guards:  caller = provider_id; status = 'pending'
Action:  UPDATE service_chats SET quote_card=null, quote_sent_at=null
```

**`start_service(p_chat_id uuid) → void`**
```
Guards:  caller = provider_id; status = 'booked'
Action:  UPDATE service_chats SET status='in_progress', in_progress_at=now()
         INSERT chat_messages content = '{"kind":"service_in_progress"}'
         UPDATE chats SET last_message_at
```

**`mark_service_finished(p_chat_id uuid) → void`**
```
Guards:  caller = requester_id OR provider_id; status IN ('booked','in_progress')
Action:  SET requester_mark_finished=true  (if caller = requester)
      OR SET provider_mark_finished=true   (if caller = provider)
         Re-fetch both flags:
         IF both true:
           UPDATE status='completed', completed_at=now()
           INSERT chat_messages '{"kind":"service_completed"}'
           UPDATE chats.last_message_at
```

**`file_service_dispute(p_chat_id, p_category, p_description, p_evidence_urls[]) → uuid`**
```
Guards:  caller = either party
         status IN ('booked','in_progress','completed')
         IF status='completed': completed_at > now() - interval '48 hours'
Action:  INSERT service_disputes, returns dispute id
         UPDATE service_chats SET status='disputed', disputed_at=now()
         INSERT chat_messages '{"kind":"service_disputed"}'
         UPDATE chats.last_message_at
```

**`submit_service_review(p_chat_id, p_rating, p_tags[], p_review_text) → void`**
```
Guards:  caller = requester_id; status = 'completed'
Action:  INSERT service_reviews ON CONFLICT DO NOTHING (idempotent)
```

### Phase 1 Verification
```sql
-- Run in Supabase SQL editor after applying migration:
SELECT table_name FROM information_schema.tables
  WHERE table_name IN ('service_chats','service_disputes','service_reviews');
-- Expected: 3 rows

SELECT routine_name FROM information_schema.routines
  WHERE routine_name IN (
    'create_service_chat','send_service_request','withdraw_service_request',
    'send_service_quote','withdraw_service_quote','start_service',
    'mark_service_finished','file_service_dispute','submit_service_review'
  );
-- Expected: 9 rows
```

---

## Phase 2 — Payment Infrastructure

### Goal
Stripe edge functions are deployed and callable. The webhook correctly transitions service_chats status on payment.

### Task List
- [ ] 2.1 — Create `create-service-payment` edge function
- [ ] 2.2 — Create `release-service-payout` edge function
- [ ] 2.3 — Modify `stripe-webhook` to handle `service_booking`
- [ ] 2.4 — Deploy all 3 functions
- [ ] 2.5 — Verify with test: invoke `create-service-payment` manually, check Stripe dashboard for session

### `create-service-payment/index.ts`

Full implementation:
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const stripe = new Stripe(
  Deno.env.get("STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_LIVE_SECRET_KEY") || "",
  { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() }
);
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // 1. Auth
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  // 2. Parse body
  const { service_chat_id, amount_cents, currency, success_url, cancel_url } = await req.json();
  if (!service_chat_id || !amount_cents || !currency || !success_url || !cancel_url)
    return json({ error: "Missing required fields" }, 400);

  // 3. Verify caller is requester, status is pending
  const { data: sc } = await supabase
    .from("service_chats")
    .select("id, requester_id, provider_id, status")
    .eq("chat_id", service_chat_id)
    .maybeSingle();
  if (!sc) return json({ error: "Service chat not found" }, 404);
  if (sc.requester_id !== user.id) return json({ error: "Forbidden" }, 403);
  if (sc.status !== "pending") return json({ error: "Invalid status — already booked?" }, 409);

  // 4. Verify provider has completed Stripe Connect
  const { data: pcp } = await supabase
    .from("pet_care_profiles")
    .select("stripe_account_id, stripe_payout_status")
    .eq("user_id", sc.provider_id)
    .maybeSingle();
  if (!pcp?.stripe_account_id || pcp.stripe_payout_status !== "complete")
    return json({ error: "Provider has not completed payout setup" }, 409);

  // 5. Get or create Stripe customer for requester
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  let customerId = (profile as Record<string, unknown>)?.stripe_customer_id as string | null;
  if (!customerId) {
    const authUser = await supabase.auth.admin.getUserById(user.id);
    const customer = await stripe.customers.create({
      email: authUser.data?.user?.email,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  // 6. Calculate fee (10% platform, 90% to provider)
  const platformFee = Math.round(amount_cents * 0.10);
  const sitterPayout = amount_cents - platformFee;

  // 7. Create checkout session — hold on platform, NO transfer_data
  // Payout metadata stored in payment_intent so it survives until release-service-payout is called
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [{
      price_data: {
        currency: currency.toLowerCase(),
        unit_amount: amount_cents,
        product_data: { name: "Pet Care Service Booking" },
      },
      quantity: 1,
    }],
    payment_intent_data: {
      metadata: {
        type: "service_booking",
        service_chat_id,
        requester_id: user.id,
        provider_id: sc.provider_id,
        provider_stripe_account_id: pcp.stripe_account_id,
        platform_fee_cents: String(platformFee),
        sitter_payout_cents: String(sitterPayout),
      },
    },
    metadata: {
      type: "service_booking",
      service_chat_id,
      requester_id: user.id,
      provider_id: sc.provider_id,
    },
    success_url,
    cancel_url,
  });

  return json({ url: session.url });
});
```

### `release-service-payout/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const stripe = new Stripe(
  Deno.env.get("STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_LIVE_SECRET_KEY") || "",
  { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() }
);
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  // This function is called fire-and-forget from the client after mark_service_finished
  // No user auth check — validates state from DB before any action
  const { service_chat_id } = await req.json().catch(() => ({}));
  if (!service_chat_id) return new Response("missing_service_chat_id", { status: 400 });

  const { data: sc } = await supabase
    .from("service_chats")
    .select("*")
    .eq("chat_id", service_chat_id)
    .maybeSingle();

  // Guards — all must pass or we bail silently (idempotent)
  if (!sc) return new Response("not_found", { status: 200 });
  if (sc.status !== "completed") return new Response("not_completed", { status: 200 });
  if (!sc.stripe_payment_intent_id) return new Response("no_payment_intent", { status: 200 });
  if (sc.payout_released_at) return new Response("already_released", { status: 200 });

  // Read payout metadata from PaymentIntent (stored at checkout creation)
  const pi = await stripe.paymentIntents.retrieve(sc.stripe_payment_intent_id);
  const providerAccount = pi.metadata?.provider_stripe_account_id;
  const payoutCents = Number(pi.metadata?.sitter_payout_cents || 0);
  const currency = pi.currency;

  if (!providerAccount || !payoutCents)
    return new Response("missing_payout_metadata", { status: 200 });

  // Transfer funds from platform to provider's Express account
  await stripe.transfers.create({
    amount: payoutCents,
    currency,
    destination: providerAccount,
    transfer_group: `service_chat_${service_chat_id}`,
    metadata: {
      service_chat_id,
      payment_intent_id: sc.stripe_payment_intent_id,
    },
  });

  // Mark payout as released
  await supabase
    .from("service_chats")
    .update({ payout_released_at: new Date().toISOString() })
    .eq("chat_id", service_chat_id);

  return new Response("ok", { status: 200 });
});
```

### `stripe-webhook/index.ts` — Add service_booking case

Locate the `handleCheckoutSessionCompleted` function. After the `nanny_booking` block, add:

```typescript
// ── service_booking ──────────────────────────────────────────────────────────
if (type === "service_booking" && session.payment_intent) {
  const serviceChatId = session.metadata?.service_chat_id;
  if (!serviceChatId) {
    console.error("[SERVICE_BOOKING] Missing service_chat_id in session metadata");
  } else {
    // Update service_chats: pending → booked
    const { error: updateErr } = await supabase
      .from("service_chats")
      .update({
        status: "booked",
        booked_at: new Date().toISOString(),
        stripe_payment_intent_id: session.payment_intent as string,
        stripe_checkout_session_id: session.id,
      })
      .eq("chat_id", serviceChatId);

    if (updateErr) {
      console.error("[SERVICE_BOOKING] Failed to update service_chats:", updateErr);
    } else {
      // Insert "service_booked" system message
      const { data: sc } = await supabase
        .from("service_chats")
        .select("requester_id")
        .eq("chat_id", serviceChatId)
        .maybeSingle();
      if (sc) {
        await supabase.from("chat_messages").insert({
          chat_id: serviceChatId,
          sender_id: sc.requester_id,
          content: JSON.stringify({ kind: "service_booked" }),
        });
        await supabase
          .from("chats")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", serviceChatId);
      }
      console.log(`[SERVICE_BOOKING] Chat ${serviceChatId} → booked, PI=${session.payment_intent}`);
    }
  }
}
```

In `handlePaymentIntentSucceeded`, after `nanny_booking` block:
```typescript
if (meta?.type === "service_booking") {
  // Status already updated in checkout.session.completed handler — just log
  console.log(`[SERVICE_BOOKING] Payment confirmed: PI=${paymentIntent.id}`);
}
```

---

## Phase 3 — TypeScript Types + Hook

### Task List
- [ ] 3.1 — Create `src/components/service-chat/types.ts`
- [ ] 3.2 — Create `src/hooks/useServiceChat.ts`
- [ ] 3.3 — Verify TypeScript compiles (`npm run build` after this phase)

### `types.ts`
```typescript
export type ServiceStatus =
  | 'pending'
  | 'booked'
  | 'in_progress'
  | 'completed'
  | 'disputed';

export type ServiceRole = 'requester' | 'provider';

export interface ServiceRequestCard {
  serviceType: string;          // matches provider's services_offered entry
  petId: string;                // pets.id
  petName: string;
  petType: string;              // pet species e.g. "Dogs"
  requestedDate: string;        // "YYYY-MM-DD"
  requestedTime: string;        // "HH:MM"
  location: string;             // area / address text
  suggestedCurrency?: string;   // optional budget
  suggestedPrice?: string;      // numeric string
  suggestedRate?: string;       // "Per hour" etc.
  notes?: string;               // max 300 chars
  allowProfileView: boolean;    // toggle: let provider see requester's profile
}

export interface ServiceQuoteCard {
  serviceType: string;
  petName: string;
  petType: string;
  requestedDate: string;
  requestedTime: string;
  location: string;
  currency: string;             // required
  finalPrice: string;           // numeric string; used to compute amount_cents
  rate: string;                 // "Per hour" | "Per day" | "Per session" | "Per night"
  note?: string;                // max 200 chars
}

export interface ServiceChat {
  id: string;                   // service_chats.id (PK)
  chatId: string;               // service_chats.chat_id = chats.id
  requesterId: string;
  providerId: string;
  status: ServiceStatus;
  requestCard: ServiceRequestCard | null;
  quoteCard: ServiceQuoteCard | null;
  requestSentAt: string | null;
  quoteSentAt: string | null;
  bookedAt: string | null;
  inProgressAt: string | null;
  completedAt: string | null;
  disputedAt: string | null;
  requesterMarkFinished: boolean;
  providerMarkFinished: boolean;
  stripePaymentIntentId: string | null;
}

export interface ServiceChatMessage {
  id: string;
  senderId: string;
  content: string;              // plain text OR JSON string with `kind` field
  createdAt: string;
}

export type ServiceMessageKind =
  | 'service_request_sent'
  | 'service_quote_sent'
  | 'service_booked'
  | 'service_in_progress'
  | 'service_completed'
  | 'service_disputed';

export interface ServiceMessageParsed {
  kind?: ServiceMessageKind;
  [key: string]: unknown;
}

export interface ServiceCounterpart {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  // Only populated when viewer is the requester (needed for "Accept & pay" gate)
  stripePayoutStatus: string | null;
  stripeAccountId: string | null;
}
```

### `useServiceChat.ts` — Full API contract

```typescript
interface UseServiceChatResult {
  // ── State ──
  serviceChat: ServiceChat | null;
  messages: ServiceChatMessage[];
  counterpart: ServiceCounterpart | null;
  role: ServiceRole | null;          // derived: requesterId === user.id → 'requester'
  loading: boolean;
  sending: boolean;                  // true during any mutation

  // ── Computed ──
  canMarkFinished: boolean;
  // true when: status in booked/in_progress
  //            AND this user hasn't set their own flag yet
  //            AND (requestCard is null OR new Date() >= requestedDate+T+requestedTime)

  canDispute: boolean;
  // true when: status in booked/in_progress
  //            OR (completed AND completedAt within 48h)

  hasReviewed: boolean;
  // true when: role=requester AND a service_reviews row exists for this booking+reviewer

  providerStripeReady: boolean;
  // true when: counterpart.stripePayoutStatus === 'complete'
  // (only relevant for requester — drives "Accept & pay" enabled state)

  // ── Actions ──
  sendMessage: (text: string) => Promise<void>;
  sendRequest: (card: ServiceRequestCard) => Promise<void>;
  withdrawRequest: () => Promise<void>;
  sendQuote: (card: ServiceQuoteCard) => Promise<void>;
  withdrawQuote: () => Promise<void>;
  startService: () => Promise<void>;
  markFinished: () => Promise<void>;
  // After successful markFinished: always fires release-service-payout (fire-and-forget)

  fileDispute: (category: string, description: string, evidenceUrls: string[]) => Promise<void>;
  submitReview: (rating: number, tags: string[], text: string) => Promise<void>;
  // Sets hasReviewed=true on success
}
```

Load sequence on mount:
1. `SELECT * FROM service_chats WHERE chat_id = roomId` — if not found, redirect to `/chats`
2. Map row → `ServiceChat` typed object
3. `counterpartId` = `requester_id === user.id ? provider_id : requester_id`
4. Parallel: `profiles_public` for counterpart info + (if requester) `pet_care_profiles` for stripe status
5. `SELECT * FROM chat_messages WHERE chat_id ORDER BY created_at ASC`
6. If requester + completed: check `service_reviews` for existing review

Realtime subscriptions (two channels, cleaned up on unmount):
- `INSERT` on `chat_messages` filter `chat_id=eq.{roomId}` → append to messages state
- `UPDATE` on `service_chats` filter `chat_id=eq.{roomId}` → merge all fields into serviceChat state

`markFinished` implementation:
```typescript
const markFinished = useCallback(async () => {
  if (!roomId) return;
  const { error } = await supabase.rpc("mark_service_finished", { p_chat_id: roomId });
  if (error) { toast.error("Failed to mark as finished."); return; }
  // Always invoke — function is idempotent (checks payout_released_at before acting)
  void supabase.functions.invoke("release-service-payout", { body: { service_chat_id: roomId } });
}, [roomId]);
```

---

## Phase 4 — Core UI Components

All components are **stateless** (data in via props, callbacks out). No direct Supabase calls.

### ⚠ Contract Compliance — MANDATORY for ALL Phase 4 & 5 components

The UI_CONTRACT Rules 1 and MCL-03 apply to every component. The code samples below show
structure and logic. **Implementation MUST replace all raw HTML controls with primitives:**

| Raw element | Required primitive | Variant |
|---|---|---|
| `<button>` primary CTA | `NeuControl` | `variant="primary" size="lg"` |
| `<button>` secondary action | `NeuControl` | `variant="tertiary" size="sm"` |
| `<button>` icon button | `NeuControl` | `variant="icon" size="md"` |
| Chip / filter button | `NeuControl` | `variant="sm"` (chip style) |
| `<input type="text">` | `FormField` | `variant="text"` |
| `<input type="number">` | `FormField` | `variant="text" inputMode="numeric"` |
| `<input type="date">` | `FormField` | `variant="text" type="date"` |
| `<input type="time">` | `FormField` | `variant="text" type="time"` |
| `<textarea>` | `FormField` | `variant="textarea"` |
| `<select>` | `NeuDropdown` | — |
| Toggle switch | `NeuToggle` | — |

Run the control audit gate before completing Phase 4/5:
```bash
grep -rn "<input\|<select\|<textarea\|<button" src/components/service-chat/ \
  | grep -v "FormField\|NeuControl\|NeuCheckbox\|NeuToggle\|NeuSlider\|NeuDropdown"
# Expected: zero matches
```

### Task List
- [ ] 4.1 — `BookingCard.tsx`
- [ ] 4.2 — `ActionBar.tsx`
- [ ] 4.3 — `ServiceChatHeader.tsx`
- [ ] 4.4 — `DisputeBanner.tsx`
- [ ] 4.5 — `StartRequestBar.tsx`
- [ ] 4.6 — `BookingConfirmedOverlay.tsx`
- [ ] 4.7 — `SystemEventPill.tsx`

---

### 4.1 — `BookingCard.tsx`

The single most important UI element. One card that morphs through 4 states via `AnimatePresence`.

```typescript
interface BookingCardProps {
  serviceChat: ServiceChat;
  role: ServiceRole;
  providerStripeReady: boolean;
  onEditRequest: () => void;
  onWithdrawRequest: () => void;
  onEditQuote: () => void;
  onWithdrawQuote: () => void;
  onAcceptPay: () => void;
  onAskRevise: () => void;
}
```

**State → View mapping:**

| Condition | View shown |
|-----------|-----------|
| `status='pending'`, no `requestCard` | Nothing (card hidden) |
| `status='pending'`, has `requestCard`, no `quoteCard` | **RequestView** |
| `status='pending'`, has `requestCard` AND `quoteCard` | **QuoteView** |
| `status` in `booked/in_progress/completed/disputed` | **ReceiptView** |

**Shell (all views share):**
```tsx
<motion.div layout className="mx-3 my-2 rounded-[18px] border border-border/30 bg-white
  shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">
  <AnimatePresence mode="wait">
    {/* view rendered based on condition above */}
  </AnimatePresence>
</motion.div>
```

**RequestView** (request sent, awaiting quote):
- Header: `"SERVICE REQUEST"` label (10px, uppercase, tracking-widest, muted) + `"Request sent"` status dot (grey) + Edit/Withdraw pencil icon (requester + pending only)
- Edit/Withdraw: Radix `DropdownMenu` with two items: "Edit request" and "Withdraw" (destructive)
- Body rows (12px, muted, icon + text):
  - `{serviceType}` (15px, 600, brandText)
  - `{petName} · {petType}` (13px)
  - `Calendar` icon + `{requestedDate}` + `Clock` icon + `{requestedTime}`
  - `MapPin` icon + `{location}`
  - (if suggestedPrice) `DollarSign` icon + `"Suggested: {currency} {price} {rate}"`
  - (if notes) Italic quote: `"{notes}"`
- Footer divider: `Eye/EyeOff` + profile view toggle state

**QuoteView** (quote received, pending payment):
- Header: `"QUOTE RECEIVED"` label + (provider: Edit/Withdraw dropdown)
- Body:
  - Service type, pet, date/time, location — same as RequestView
  - **Price block** (prominent, separated by top border):
    - `{currency}` (12px muted) + `{finalPrice}` (22px, 700, brandText) + `/{rate stripped of "Per "}` (12px muted)
  - (if note) italic note
- Footer: **Requester only** — two buttons:
  - `"Accept & pay"` — full blue gradient, disabled if `!providerStripeReady`, tooltip "Provider's payout not set up yet" if disabled
  - `"Ask to revise"` — grey outline

**ReceiptView** (post-payment):
- Header: `CheckCircle` icon (emerald) + `"Booking confirmed"` label
- Body (clean receipt style):
  - `{quoteCard.serviceType}` (15px, 600)
  - `{quoteCard.petName} · {quoteCard.petType}` (13px)
  - Date + time row
  - Location row
  - Divider: `{currency} {finalPrice} {rate}` (right-aligned, 15px, 600) + `"Paid"` (emerald badge)
- Status indicator: `status` translated to human text + colour (see status colour vars)

---

### 4.2 — `ActionBar.tsx`

Replaces `QuickActionChips`. Single primary CTA + optional secondary. Returns `null` when no action.

```typescript
interface ActionBarProps {
  serviceChat: ServiceChat;
  role: ServiceRole;
  canMarkFinished: boolean;
  canDispute: boolean;
  hasReviewed: boolean;
  onRequestQuote: () => void;      // opens RequestForm
  onSendQuote: () => void;         // opens QuoteForm
  onAcceptPay: () => void;         // opens BookingConfirmScreen
  onAskRevise: () => void;         // sends "Could you revise the quote?" message
  onStartService: () => void;      // calls startService()
  onMarkFinished: () => void;      // calls markFinished()
  onDispute: () => void;           // opens DisputeFlow
  onReview: () => void;            // opens ReviewFlow
}
```

Logic (returns null if no primary action):

```
pending + requester + no requestCard:
  Primary: "Start with a request →" (full width, subtle blue gradient)
  → this replaces the StartRequestBar for status=pending but no request yet

pending + provider + requestCard + no quoteCard:
  Primary: "Send a quote" (full width, blue gradient)

pending + requester + quoteCard:
  Primary: "Accept & pay" (full width, blue gradient)
  Secondary: "Ask to revise" (text link)

booked + provider:
  Primary: "Start service" (full width, blue gradient)
  Secondary: "Dispute" (text link, coral)

booked + requester:
  Primary: "Mark service complete" (disabled until date passed)
  Secondary: "Dispute" (text link, coral)

booked + own flag set, other not set:
  Primary: ← animated pulse → "Waiting for {counterpartName} to confirm…"
  (no secondary)

in_progress + either + canMarkFinished:
  Primary: "Service complete" (full width, blue gradient)
  Secondary: "Dispute" (text link, coral)

in_progress + own flag set:
  Primary: "Waiting for {counterpartName}…" (pulse animation, disabled)

completed + requester + !hasReviewed:
  Primary: "Leave a review" (blue outline, star icon)
  Secondary: (if canDispute) "Dispute" (text link, coral)

completed + either + hasReviewed:
  Returns null (no ActionBar shown)

disputed:
  Returns null

```

Layout:
```tsx
{/* ⚠ NO backdrop-blur — Glass Chrome Density Rule. bg-background is solid. */}
<div className="px-4 py-3 bg-background border-t border-border/20">
  <AnimatePresence mode="wait">
    <motion.div key={actionKey} initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}}>
      {/* Primary CTA — use NeuControl variant="primary" size="lg" (Rule 1 / MCL-03) */}
      <NeuControl
        variant="primary"
        size="lg"
        className="w-full"
        disabled={primaryDisabled}
        onClick={onPrimaryAction}
      >
        {primaryLabel}
      </NeuControl>
      {/* Secondary — use NeuControl variant="tertiary" size="sm" (Rule 1 / MCL-03) */}
      {secondaryLabel && (
        <NeuControl
          variant="tertiary"
          size="sm"
          className="w-full mt-2"
          onClick={onSecondaryAction}
        >
          {secondaryLabel}
        </NeuControl>
      )}
    </motion.div>
  </AnimatePresence>
</div>
```

---

### 4.3 — `ServiceChatHeader.tsx`

```typescript
interface ServiceChatHeaderProps {
  status: ServiceStatus;
  counterpartName: string;
  counterpartAvatarUrl: string | null;
  isVerified: boolean;
  role: ServiceRole;
  hasReviewed: boolean;
  onBack: () => void;
  onReview?: () => void;
}
```

Layout: `glass-bar h-[56px] fixed top-0 inset-x-0 z-[20]`

Left to right:
1. `ArrowLeft` back button (40×40, rounded-[12px])
2. Avatar (40×40, rounded-full) — image or initials fallback (first 2 chars, bg `rgba(33,69,207,0.10)`, text `#2145CF`)
3. Column (flex-1, min-w-0):
   - Name: 16px/600, `#424965`, truncate
   - Status badge: `rounded-full px-2 py-0.5 text-[10px] font-[600]` with status vars:
     ```
     pending    → bg --service-pending-bg,  text --service-pending
     booked     → bg --service-booked-bg,   text --service-booked
     in_progress→ bg --service-progress-bg, text --service-progress
     completed  → bg --service-complete-bg, text --service-complete
     disputed   → bg --service-disputed-bg, text --service-disputed
     ```
4. (if verified) `BadgeCheck` size-16, `#2145CF`
5. (if completed + requester + !hasReviewed) `"Review"` pill: `rounded-full px-2.5 py-1 text-[11px] font-[600] text-[#2145CF] border border-[#2145CF]/30 bg-[#2145CF]/5` with `Star` icon

---

### 4.4 — `DisputeBanner.tsx`

Replaces the BookingCard when `status === 'disputed'`.

```typescript
interface DisputeBannerProps { role: ServiceRole }
```

```tsx
<div className="mx-3 my-2 rounded-[18px] border border-[#ef6450]/25 bg-[#ef6450]/6 p-4">
  <div className="flex items-start gap-3">
    <div className="h-9 w-9 rounded-full bg-[#ef6450]/12 flex items-center justify-center shrink-0">
      <ShieldAlert size={18} className="text-[#ef6450]" strokeWidth={1.75} />
    </div>
    <div>
      <p className="text-[14px] font-[600] text-[#ef6450]">Payment on hold</p>
      <p className="text-[13px] text-muted-foreground mt-0.5 leading-relaxed">
        {role === "requester"
          ? "We've received your dispute and are looking into it. We'll reach out within 48 hours."
          : "A dispute has been filed against this booking. Huddle is mediating."}
      </p>
    </div>
  </div>
</div>
```

---

### 4.5 — `StartRequestBar.tsx`

Shown instead of Composer when `role='requester'` and no `requestCard` yet.

```typescript
interface StartRequestBarProps {
  onClick: () => void;
  navOffset?: number;  // default 64
}
```

```tsx
<div className="fixed inset-x-0 z-[40]" style={{ bottom: `${navOffset}px` }}>
  <div className="glass-bar border-t-0 mx-auto max-w-[430px] px-4 py-3">
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      className="w-full rounded-[14px] py-[14px] flex items-center justify-center gap-2
        bg-gradient-to-br from-[#2A53E0] to-[#1C3ECC] text-white
        text-[14px] font-[600] shadow-[0_4px_16px_rgba(33,69,207,0.28)]"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
    >
      <PawPrint size={16} strokeWidth={1.75} />
      Start with a request
      <ArrowRight size={16} strokeWidth={2} />
    </motion.button>
  </div>
</div>
```

---

### 4.6 — `BookingConfirmedOverlay.tsx`

Full-screen celebration overlay. Plays when `status` transitions to `booked`.

```typescript
interface BookingConfirmedOverlayProps {
  providerName: string;
  onDone: () => void;  // called after auto-dismiss (2.5s) or tap
}
```

```tsx
// Auto-dismiss after 2500ms via useEffect
<AnimatePresence>
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center gap-4"
    onClick={onDone}
  >
    <motion.div
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", damping: 15, stiffness: 260 }}
      className="h-20 w-20 rounded-full bg-emerald-50 flex items-center justify-center"
    >
      <CheckCircle2 size={44} className="text-emerald-500" strokeWidth={1.5} />
    </motion.div>
    <motion.div
      initial={{ y: 12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.15 }}
      className="text-center"
    >
      <p className="text-[22px] font-[700] text-[#424965]">Booking confirmed</p>
      <p className="text-[15px] text-muted-foreground mt-1">{providerName} has been notified</p>
    </motion.div>
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.8 }}
      className="text-[12px] text-muted-foreground/50 absolute bottom-12"
    >
      Tap anywhere to continue
    </motion.p>
  </motion.div>
</AnimatePresence>
```

---

### 4.7 — `SystemEventPill.tsx`

Animated centered pill for structured message events.

```typescript
const EVENT_CONFIG: Record<ServiceMessageKind, { label: string; bgClass: string; textClass: string; icon?: React.ReactNode }> = {
  service_request_sent: { label: "Request sent",         bgClass: "bg-muted",             textClass: "text-muted-foreground" },
  service_quote_sent:   { label: "Quote received",        bgClass: "bg-muted",             textClass: "text-muted-foreground" },
  service_booked:       { label: "Booking confirmed 🎉",  bgClass: "bg-emerald-50",        textClass: "text-emerald-700" },
  service_in_progress:  { label: "Service started",       bgClass: "bg-blue-50",           textClass: "text-blue-600" },
  service_completed:    { label: "Service completed ✓",   bgClass: "bg-emerald-50",        textClass: "text-emerald-700" },
  service_disputed:     { label: "Dispute filed",         bgClass: "bg-red-50",            textClass: "text-red-600" },
};
```

```tsx
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2, ease: "easeOut" }}
  className="flex justify-center py-2"
>
  <span className={`rounded-full px-3 py-1 text-[12px] font-[500] ${cfg.bgClass} ${cfg.textClass}`}>
    {cfg.label}
  </span>
</motion.div>
```

---

## Phase 5 — Forms & Flows

### Task List
- [ ] 5.1 — `RequestForm.tsx`
- [ ] 5.2 — `QuoteForm.tsx`
- [ ] 5.3 — `BookingConfirmScreen.tsx`
- [ ] 5.4 — `ReviewFlow.tsx`
- [ ] 5.5 — `DisputeFlow.tsx`

All forms use Radix `Sheet` with `side="bottom"` except `BookingConfirmScreen` which is a full-page push.

---

### 5.1 — `RequestForm.tsx`

```typescript
interface RequestFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (card: ServiceRequestCard) => Promise<void>;
  providerServices: string[];        // from provider's services_offered
  initialCard?: ServiceRequestCard;  // for editing existing request
}
```

**Internal state:**
```typescript
serviceType, petId, petName, petType,
requestedDate, requestedTime, location,
suggestedCurrency, suggestedPrice, suggestedRate,
notes, allowProfileView,
pets: { id, name, species }[],    // fetched on open
submitting
```

**Pet fetch (on open):**
```typescript
useEffect(() => {
  if (!open) return;
  supabase.from("pets")
    .select("id, name, species")
    .eq("owner_id", userId)
    .eq("is_active", true)
    .then(({ data }) => setPets(data || []));
}, [open, userId]);
```

When pet is selected from dropdown: auto-set `petName` and `petType` from the pets array.

**Fields in sheet (scrollable):**
1. Section: "Service" — `Select` from `providerServices`
2. Section: "Your pet" — `Select` from pets (label: "{name} ({species})"). If no pets: link to Add Pet.
3. Section: "When" — Date input (type="date", min=today) + Time input (type="time")
4. Section: "Location" — Text input, placeholder "e.g. Wan Chai, Hong Kong"
5. Section: "Suggested budget" (collapsible, "Optional" label) — Currency select + Price number input + Rate select. Only show if user taps "Add budget suggestion"
6. Section: "Notes" — Textarea, placeholder "Anything the provider should know?", maxLength=300, char counter
7. Toggle: "Let provider see your profile" (default ON)
8. Terms footnote: 10px muted — "By requesting, you agree to the [Pet Care Service Booking Terms]" (link opens new tab)

**Validation:** serviceType, petId, requestedDate, requestedTime, location all required. Show inline error under each field if missing on submit attempt.

**Submit button:** "Save & send request" → calls `onSubmit(card)` → closes on success

---

### 5.2 — `QuoteForm.tsx`

```typescript
interface QuoteFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (card: ServiceQuoteCard) => Promise<void>;
  requestCard: ServiceRequestCard;       // read-only reference data
  initialCard?: ServiceQuoteCard;        // for editing existing quote
}
```

**Summary block** (read-only, shows request context to provider):
```tsx
<div className="rounded-[14px] bg-muted/40 p-4 mb-4 space-y-1.5">
  <p className="text-[13px] font-[600] text-brandText">{requestCard.serviceType}</p>
  <p className="text-[13px] text-muted-foreground">{requestCard.petName} · {requestCard.petType}</p>
  <p className="text-[12px] text-muted-foreground">{requestCard.requestedDate} at {requestCard.requestedTime}</p>
  <p className="text-[12px] text-muted-foreground">{requestCard.location}</p>
</div>
```

**Editable fields:**
1. Currency `Select` from CURRENCIES (required)
2. Final price `input[type=number]` (required) — placeholder "0.00"
3. Rate `Select` from `["Per hour","Per day","Per session","Per night"]` (required)
4. Note `Textarea` optional — placeholder "e.g. Price includes travel time"

**Price preview** (live, appears after currency + price filled): `{currency} {price} {rate}` — 18px bold

**Submit:** "Send quote"

---

### 5.3 — `BookingConfirmScreen.tsx`

**IMPORTANT:** This is NOT a sheet. It's a full-page modal pushed on top of ServiceChat.

```typescript
interface BookingConfirmScreenProps {
  open: boolean;
  onClose: () => void;
  quoteCard: ServiceQuoteCard;
  roomId: string;
}
```

**State:** `termsScrolled: bool`, `loading: bool`, `error: string|null`

**Layout** (full screen, white background, safe area):

```
┌────────────────────────────────────────┐
│  ← Back                                │  ← top bar (56px)
├────────────────────────────────────────┤
│                                        │
│  Confirm booking                       │  ← 24px/700 title
│  Make sure all details are correct.    │  ← 14px muted
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ SERVICE REQUEST                  │  │  ← ReceiptCard
│  │ {serviceType}                    │  │
│  │ {petName} · {petType}            │  │
│  │ {date} at {time}                 │  │
│  │ {location}                       │  │
│  │ ─────────────────────────────── │  │
│  │ Total        {currency} {price}  │  │
│  │              {rate}              │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ Booking terms (scrollable)       │  │  ← inline scroll, max-h-[120px]
│  │ By proceeding, you agree...      │  │
│  │ [Read full terms →]              │  │
│  └──────────────────────────────────┘  │
│                                        │
└────────────────────────────────────────┘
│  Proceed to payment                    │  ← sticky bottom CTA
└────────────────────────────────────────┘
```

**Terms block:** Scrollable `div` with inline summary text + "Read full terms →" link. No checkbox required — agreement is implicit on proceeding (per the label).

**Pay button:** full width, blue gradient. Shows loading spinner inside when `loading=true`. Text: `"Pay {currency} {finalPrice}"`.

**On pay:**
```typescript
const { data, error } = await supabase.functions.invoke("create-service-payment", {
  body: {
    service_chat_id: roomId,
    amount_cents: Math.round(parseFloat(quoteCard.finalPrice) * 100),
    currency: quoteCard.currency.toLowerCase(),
    success_url: `${window.location.origin}/service-chat?roomId=${roomId}&payment=success`,
    cancel_url: `${window.location.origin}/service-chat?roomId=${roomId}`,
  },
});
if (data?.url) window.location.href = data.url;
else setError("Payment failed to start. Please try again.");
```

---

### 5.4 — `ReviewFlow.tsx`

3-step progressive flow inside a Sheet.

```typescript
interface ReviewFlowProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (rating: number, tags: string[], text: string) => Promise<void>;
  providerName: string;
}
```

**State:** `step: 1|2|3`, `rating: 0-5`, `tags: string[]`, `text: string`, `submitting: bool`, `done: bool`

**Step 1 — Rating:**
```tsx
<div className="flex flex-col items-center gap-6 py-8">
  <p className="text-[18px] font-[600] text-brandText">How was {providerName}?</p>
  <div className="flex gap-3">
    {[1,2,3,4,5].map(n => (
      {/* Star tap target — NeuControl icon variant (Rule 1 / MCL-03) */}
      <NeuControl
        key={n}
        variant="icon"
        size="md"
        onClick={() => { setRating(n); setTimeout(() => setStep(2), 300); }}
        asChild
      >
        <motion.button whileTap={{ scale: 1.3 }}>
          <Star
            size={36}
            strokeWidth={1.5}
            className={n <= rating ? "fill-[#FBBF24] text-[#FBBF24]" : "text-muted-foreground/30"}
          />
        </motion.button>
      </NeuControl>
    ))}
  </div>
</div>
```

**Step 2 — Tags (fade in after rating):**
```tsx
<motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}>
  <p className="text-[16px] font-[600] mb-4">What stood out?</p>
  <div className="flex flex-wrap gap-2">
    {REVIEW_TAGS.map(tag => (
      {/* Chip — NeuControl variant="sm" selected state (Rule 1 / MCL-03) */}
      <NeuControl
        key={tag}
        variant="sm"
        selected={tags.includes(tag)}
        onClick={() => toggleTag(tag)}
      >
        {tag}
      </NeuControl>
    ))}
  </div>
  {/* Continue/Skip — NeuControl tertiary (Rule 1) */}
  <NeuControl variant="tertiary" size="sm" className="mt-4" onClick={() => setStep(3)}>
    {tags.length > 0 ? "Continue →" : "Skip"}
  </NeuControl>
</motion.div>
```

REVIEW_TAGS constant: `["Punctual","Great with pets","Clear communication","Friendly","Reliable","Patient","Attentive","Professional","Flexible","Helpful","Clean & tidy","Followed instructions"]`

**Step 3 — Text (optional):**
```tsx
<motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}>
  {/* textarea — FormField variant="textarea" (Rule 1 / MCL-03. No raw <textarea>) */}
  <FormField
    variant="textarea"
    value={text}
    onChange={e => setText(e.target.value)}
    placeholder="Write a public review (optional)"
    maxLength={500}
    rows={4}
  />
  {/* Submit — NeuControl primary (Rule 1 / MCL-03. No raw <button>) */}
  <NeuControl
    variant="primary"
    size="lg"
    className="mt-4 w-full"
    onClick={handleSubmit}
    disabled={submitting || rating === 0}
    loading={submitting}
  >
    {done ? "Review submitted ✓" : "Submit review"}
  </NeuControl>
</motion.div>
```

---

### 5.5 — `DisputeFlow.tsx`

3-step empathetic flow inside a Sheet.

```typescript
interface DisputeFlowProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (category: string, description: string, evidenceUrls: string[]) => Promise<void>;
}
```

**State:** `step: 1|2|3`, `category: string`, `description: string`, `evidenceFiles: File[]`, `evidenceUrls: string[]`, `uploading: bool`, `submitting: bool`

**Step 1 — Category (large tappable cards, not a dropdown):**
```
Title: "What happened?"
Subtitle: "We want to make this right."

Option cards (each: rounded-[14px] border, py-4 px-4, tap to select):
  🚫  No-show                   provider didn't show up
  🕐  Late arrival               significantly late
  ❌  Service not completed      left early or didn't finish
  🐾  Pet injury / safety issue  pet was harmed or put at risk
  🔨  Property damage            damage to home or belongings
  💸  Payment / billing issue    overcharged or other payment problem
  ❓  Other                      something else happened
```

On select: sets `category`, auto-advances to step 2.

**Step 2 — Description:**
```
Title: "Tell us what happened"
Helper: "Please be as specific as possible. This helps us investigate."

Textarea: min-h-[140px], placeholder "Describe what happened in detail…", maxLength=1000, char counter
"Back" + "Continue →" buttons
```

**Step 3 — Evidence (optional):**
```
Title: "Add photos (optional)"
Helper: "Photos help us resolve disputes faster."

File picker: accept="image/*" multiple, max 5 files.
Each selected: thumbnail 72×72, remove X button.
Upload progress: per-file progress bar.
"Back" + "Submit dispute" buttons.
```

On submit: upload all files to `chat-attachments` bucket → collect URLs → call `onSubmit(category, description, evidenceUrls)`.

---

## Phase 6 — ServiceChat Page

### ⚠ Template Compliance — T6 Conversational (Extended)

ServiceChat is mapped to T6 in the Page Index (Phase 0). Key T6 rules:

- `ServiceChatHeader`: glass-e2, h-56px, fixed top, z:nav — **the one and only glass chrome bar**
- `MessageThread`: content-region with `overflow-y: auto`. `paddingTop` must account for BOTH the 56px header AND the dynamic BookingCard height (measured via ResizeObserver). `paddingBottom` must account for ActionBar height + Composer height + safe-area.
- `BookingCard` (fixed structural element): NOT glass. Solid `bg-white` surface. Does NOT violate the Glass Chrome Density Rule because it is not a glass surface.
- T6 rule: **"No sticky sections inside MessageThread."** BookingCard must be `position: fixed` outside the scroll region — NOT `position: sticky` inside it. The page JSX below implements this correctly with the `stickyRef` / `stickyH` ResizeObserver pattern.
- `ActionBar` (fixed, above Composer): NOT glass (`bg-background` solid, no blur). Follows same contract status as StickyCTA.
- `Composer` or `StartRequestBar` (fixed bottom): glass-e2. `pb-[env(safe-area-inset-bottom,10px)]`.
- `BookingConfirmScreen` follows **T4 Form/Stepper** template when pushed: ProgressBar (optional, single step) + StepNav back button + FormBody + StickyCTA.

### Task List
- [ ] 6.1 — Create `src/pages/ServiceChat.tsx`
- [ ] 6.2 — Implement layout with ResizeObserver measurements (header 56px + stickyH for BookingCard)
- [ ] 6.3 — Implement message list with `ChatBubble` + `SystemEventPill`
- [ ] 6.4 — Wire all 5 sheets/flows to `activeSheet` state
- [ ] 6.5 — Implement `BookingConfirmedOverlay` trigger on `booked` transition
- [ ] 6.6 — Implement payment return handling

### File: `src/pages/ServiceChat.tsx`

**URL:** `/service-chat?roomId=xxx` (+ optional `?payment=success` on Stripe return)

**Imports:**
```typescript
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Composer } from "@/components/chat/Composer";
import ChatBubble from "@/components/chat/ChatBubble";
import { useServiceChat } from "@/hooks/useServiceChat";
import { useAuth } from "@/contexts/AuthContext";
// All service-chat components...
import { parseServiceMessage } from "@/components/service-chat/utils";
```

**`parseServiceMessage` utility:**
```typescript
// src/components/service-chat/utils.ts
export function parseServiceMessage(content: string): ServiceMessageParsed | null {
  try {
    const p = JSON.parse(content);
    return p?.kind ? p : null;
  } catch {
    return null;
  }
}
```

**Page state:**
```typescript
const [searchParams, setSearchParams] = useSearchParams();
const roomId = searchParams.get("roomId");
const { user } = useAuth();

// Hook — all data and mutations
const {
  serviceChat, messages, counterpart, role, loading, sending,
  canMarkFinished, canDispute, hasReviewed, providerStripeReady,
  sendMessage, sendRequest, withdrawRequest, sendQuote, withdrawQuote,
  startService, markFinished, fileDispute, submitReview,
} = useServiceChat(roomId);

// Layout measurements
const stickyRef = useRef<HTMLDivElement>(null);
const [stickyH, setStickyH] = useState(0);
const [composerH, setComposerH] = useState(64);
const bottomRef = useRef<HTMLDivElement>(null);

// Active modal/sheet
type ActiveSheet = null | 'request' | 'quote' | 'booking-confirm' | 'review' | 'dispute';
const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
const [showConfirmedOverlay, setShowConfirmedOverlay] = useState(false);
const prevStatusRef = useRef<string | null>(null);
```

**Payment return (runs once on mount):**
```typescript
useEffect(() => {
  if (searchParams.get("payment") === "success") {
    setShowConfirmedOverlay(true);
    setSearchParams({}, { replace: true });
  }
}, []);
```

**Status transition watch (for realtime booked transition):**
```typescript
useEffect(() => {
  if (!serviceChat) return;
  const prev = prevStatusRef.current;
  if (prev && prev !== 'booked' && serviceChat.status === 'booked') {
    setShowConfirmedOverlay(true);
  }
  prevStatusRef.current = serviceChat.status;
}, [serviceChat?.status]);
```

**Sticky cards height:**
```typescript
useEffect(() => {
  if (!stickyRef.current) return;
  const obs = new ResizeObserver(([entry]) => setStickyH(entry.contentRect.height));
  obs.observe(stickyRef.current);
  return () => obs.disconnect();
}, []);
```

**Auto-scroll to bottom:**
```typescript
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: messages.length === 1 ? "instant" : "smooth" });
}, [messages.length]);
```

### Page JSX Structure

```tsx
{/* RULE 14: viewport-locked frame. screen-frame + content-region classes required. */}
return (
  <div className="screen-frame bg-background">
    {/* ── Header ── */}
    {counterpart && role && serviceChat && (
      <ServiceChatHeader
        status={serviceChat.status}
        counterpartName={counterpart.displayName}
        counterpartAvatarUrl={counterpart.avatarUrl}
        isVerified={counterpart.isVerified}
        role={role}
        hasReviewed={hasReviewed}
        onBack={() => navigate("/chats")}
        onReview={() => setActiveSheet("review")}
      />
    )}

    {/* ── Sticky Cards (below header, above scroll) ── */}
    <div
      ref={stickyRef}
      className="fixed inset-x-0 z-[15]"
      style={{ top: 56 }}  // below header
    >
      {serviceChat && role && (
        <>
          {serviceChat.status === "disputed" ? (
            <DisputeBanner role={role} />
          ) : (serviceChat.requestCard || ['booked','in_progress','completed'].includes(serviceChat.status)) ? (
            <BookingCard
              serviceChat={serviceChat}
              role={role}
              providerStripeReady={providerStripeReady}
              onEditRequest={() => setActiveSheet("request")}
              onWithdrawRequest={() => withdrawRequest()}
              onEditQuote={() => setActiveSheet("quote")}
              onWithdrawQuote={() => withdrawQuote()}
              onAcceptPay={() => setActiveSheet("booking-confirm")}
              onAskRevise={() => {
                sendMessage("Could you revise the quote?");
                toast.success("Message sent");
              }}
            />
          ) : null}
        </>
      )}
    </div>

    {/* ── Message List (content-region per RULE 14 — flex-1, overflow-y: auto) ── */}
    <div
      className="content-region"
      style={{
        paddingTop: `${56 + stickyH + 8}px`,
        paddingBottom: `${composerH + 64 + 16}px`,
      }}
    >
      {loading && (
        <div className="flex flex-col gap-3 px-4 pt-4">
          {/* Skeleton loaders */}
          {[...Array(4)].map((_, i) => (
            <div key={i} className={`h-10 rounded-[20px] animate-pulse bg-muted/40 ${i%2===0 ? 'self-end w-3/5' : 'self-start w-2/3'}`} />
          ))}
        </div>
      )}

      {!loading && messages.length === 0 && role && serviceChat && (
        <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
          <div className="h-14 w-14 rounded-full bg-muted/40 flex items-center justify-center mb-3">
            <PawPrint size={24} className="text-muted-foreground/40" strokeWidth={1.5} />
          </div>
          <p className="text-[14px] font-[500] text-muted-foreground">
            {role === "requester"
              ? "Start by sending a service request"
              : `Waiting for a request from ${counterpart?.displayName ?? "them"}`}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1 px-4 py-2">
        {messages.map((msg) => {
          const parsed = parseServiceMessage(msg.content);
          if (parsed?.kind) {
            return <SystemEventPill key={msg.id} kind={parsed.kind} />;
          }
          const isMine = msg.senderId === user?.id;
          return (
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"} py-0.5`}>
              <ChatBubble variant={isMine ? "sent" : "received"}>
                {msg.content}
              </ChatBubble>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>

    {/* ── ActionBar ── */}
    {serviceChat && role && (
      <div className="fixed inset-x-0 z-[35]" style={{ bottom: `${64 + composerH}px` }}>
        <ActionBar
          serviceChat={serviceChat}
          role={role}
          canMarkFinished={canMarkFinished}
          canDispute={canDispute}
          hasReviewed={hasReviewed}
          onRequestQuote={() => setActiveSheet("request")}
          onSendQuote={() => setActiveSheet("quote")}
          onAcceptPay={() => setActiveSheet("booking-confirm")}
          onAskRevise={() => sendMessage("Could you revise the quote?")}
          onStartService={() => startService()}
          onMarkFinished={() => markFinished()}
          onDispute={() => setActiveSheet("dispute")}
          onReview={() => setActiveSheet("review")}
        />
      </div>
    )}

    {/* ── Composer OR StartRequestBar ── */}
    {role === "requester" && !serviceChat?.requestSentAt ? (
      <StartRequestBar onClick={() => setActiveSheet("request")} navOffset={64} />
    ) : (
      <Composer
        value={composerValue}
        onChange={setComposerValue}
        onSend={() => { sendMessage(composerValue); setComposerValue(""); }}
        placeholder="Ask a question…"
        disabled={sending}
        navOffset={64}
        onHeightChange={setComposerH}
        showAttach={false}
        showCamera={false}
      />
    )}

    {/* ── Sheets / Modals ── */}
    {serviceChat && (
      <>
        <RequestForm
          open={activeSheet === "request"}
          onClose={() => setActiveSheet(null)}
          onSubmit={async (card) => { await sendRequest(card); setActiveSheet(null); }}
          providerServices={serviceChat.requestCard?.serviceType
            ? [serviceChat.requestCard.serviceType]
            : (counterpart as unknown as { services?: string[] })?.services ?? []}
          initialCard={activeSheet === "request" && serviceChat.requestCard
            ? serviceChat.requestCard : undefined}
        />

        {serviceChat.requestCard && (
          <QuoteForm
            open={activeSheet === "quote"}
            onClose={() => setActiveSheet(null)}
            onSubmit={async (card) => { await sendQuote(card); setActiveSheet(null); }}
            requestCard={serviceChat.requestCard}
            initialCard={activeSheet === "quote" && serviceChat.quoteCard
              ? serviceChat.quoteCard : undefined}
          />
        )}

        {serviceChat.quoteCard && (
          <BookingConfirmScreen
            open={activeSheet === "booking-confirm"}
            onClose={() => setActiveSheet(null)}
            quoteCard={serviceChat.quoteCard}
            roomId={roomId!}
          />
        )}

        <ReviewFlow
          open={activeSheet === "review"}
          onClose={() => setActiveSheet(null)}
          onSubmit={async (rating, tags, text) => {
            await submitReview(rating, tags, text);
            setActiveSheet(null);
            toast.success("Review submitted!");
          }}
          providerName={counterpart?.displayName ?? "your provider"}
        />

        <DisputeFlow
          open={activeSheet === "dispute"}
          onClose={() => setActiveSheet(null)}
          onSubmit={async (category, description, urls) => {
            await fileDispute(category, description, urls);
            setActiveSheet(null);
          }}
        />
      </>
    )}

    {/* ── Booking Confirmed Overlay ── */}
    <BookingConfirmedOverlay
      show={showConfirmedOverlay}
      providerName={counterpart?.displayName ?? "your provider"}
      onDone={() => setShowConfirmedOverlay(false)}
    />
  </div>
);
```

---

## Phase 7 — App Integration

### Task List
- [ ] 7.1 — Add `/service-chat` route to `src/App.tsx`
- [ ] 7.2 — Add `/service-chat` to `src/routes/ROUTE_MANIFEST.ts` (required by UI_CONTRACT Section 4 Route Discovery Gate)
- [ ] 7.3 — Modify `PublicCarerProfileView.tsx` — sticky CTA + idempotent entry
- [ ] 7.4 — Modify `PublicCarerProfileModal.tsx` — pass `onClose` down
- [ ] 7.5 — Modify `Chats.tsx` — service tab + `ServiceChatRow`
- [ ] 7.6 — Create `src/legal/pet-care-booking-terms.html`

---

### 7.1 — App.tsx Route + ROUTE_MANIFEST.ts

First, open `src/routes/ROUTE_MANIFEST.ts` and add `/service-chat` to the exported array.
This satisfies the UI_CONTRACT Section 4 Route Discovery Gate requirement.

Then, find the `/chat-dialogue` route in App.tsx. Add immediately after:
```tsx
import ServiceChat from "./pages/ServiceChat";

<Route
  path="/service-chat"
  element={
    <ProtectedRoute>
      <AppShell>
        <ServiceChat />
        <BottomNav />
      </AppShell>
    </ProtectedRoute>
  }
/>
```

---

### 7.2 — PublicCarerProfileView.tsx

**What to read first:** Read the current file to find the end of the JSX content — find the last `</div>` of the scrollable section.

**New imports to add:**
```typescript
import { useNavigate } from "react-router-dom";
import { useState } from "react";    // (may already be imported)
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
```

**New prop:**
```typescript
interface PublicCarerProfileViewProps {
  provider: ProviderSummary;
  onClose?: () => void;        // ADD THIS
}
```

**New state + handler inside component:**
```typescript
const navigate = useNavigate();
const [creating, setCreating] = useState(false);

const handleRequestService = async () => {
  if (creating) return;
  setCreating(true);
  try {
    // Idempotency check: does a service chat already exist between these two users?
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Sign in to request a service."); return; }

    const { data: existing } = await supabase
      .from("service_chats")
      .select("chat_id")
      .eq("requester_id", user.id)
      .eq("provider_id", provider.userId)
      .maybeSingle();

    if (existing?.chat_id) {
      onClose?.();
      navigate(`/service-chat?roomId=${existing.chat_id}`);
      return;
    }

    // Create new service chat
    const { data: chatId, error } = await supabase.rpc("create_service_chat", {
      p_provider_id: provider.userId,
    });
    if (error) throw error;
    onClose?.();
    navigate(`/service-chat?roomId=${chatId}`);
  } catch (e) {
    console.error("[PublicCarerProfileView] create_service_chat failed", e);
    toast.error("Unable to start conversation. Please try again.");
  } finally {
    setCreating(false);
  }
};
```

**Sticky CTA — add at the very end of the component's JSX, OUTSIDE the scrollable div:**
```tsx
{/* Sticky "Request a service" CTA — always visible.
    ⚠ Use NeuControl primary — not a raw <button> (Rule 1 / MCL-03) */}
<div className="sticky bottom-0 left-0 right-0 px-4 pb-[env(safe-area-inset-bottom,16px)] pt-2
  bg-gradient-to-t from-background via-background/90 to-transparent">
  <NeuControl
    variant="primary"
    size="lg"
    className="w-full"
    onClick={handleRequestService}
    disabled={creating || !provider.agreementAccepted}
    loading={creating}
  >
    {creating ? "Starting…" : "Request a service"}
  </NeuControl>
  {!provider.agreementAccepted && (
    <p className="text-[11px] text-center text-muted-foreground mt-1.5">
      This provider hasn't completed their setup yet.
    </p>
  )}
</div>
```

**IMPORTANT:** The scrollable content area must have `pb-20` or similar to not be hidden behind this sticky bar.

---

### 7.3 — PublicCarerProfileModal.tsx

Pass `onClose` to the view:
```tsx
// Find this line:
<PublicCarerProfileView provider={provider} />

// Replace with:
<PublicCarerProfileView provider={provider} onClose={onClose} />
```

---

### 7.4 — Chats.tsx — Service Tab

The file already imports `serviceImage`. Find the Service tab section.

**Fetch service chats (add alongside other data fetches in the service tab load):**
```typescript
const loadServiceChats = async (userId: string) => {
  const { data: rows } = await supabase
    .from("service_chats")
    .select("chat_id, status, requester_id, provider_id, request_card, quote_card, updated_at")
    .or(`requester_id.eq.${userId},provider_id.eq.${userId}`)
    .order("updated_at", { ascending: false });
  if (!rows?.length) return [];

  // Fetch counterpart profiles
  const counterpartIds = rows.map(r => r.requester_id === userId ? r.provider_id : r.requester_id);
  const { data: profiles } = await supabase
    .from("profiles_public")
    .select("id, display_name, avatar_url")
    .in("id", counterpartIds);
  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

  return rows.map(r => ({
    ...r,
    counterpartId: r.requester_id === userId ? r.provider_id : r.requester_id,
    counterpart: profileMap[r.requester_id === userId ? r.provider_id : r.requester_id] ?? null,
    iAmRequester: r.requester_id === userId,
  }));
};
```

**`ServiceChatRow` component (inline or extract to separate file):**

```typescript
function ServiceChatRow({ row, userId, navigate }: { row: ServiceChatRowData, userId: string, navigate: NavigateFunction }) {
  const iAmRequester = row.requester_id === userId;
  const status = row.status;

  const statusConfig = {
    pending:     { label: "Pending",      bg: "rgba(136,136,136,0.10)", color: "#888" },
    booked:      { label: "Booked",       bg: "rgba(22,163,74,0.10)",   color: "#16a34a" },
    in_progress: { label: "In Progress",  bg: "rgba(37,99,235,0.10)",   color: "#2563eb" },
    completed:   { label: "Completed",    bg: "rgba(22,163,74,0.10)",   color: "#16a34a" },
    disputed:    { label: "Disputed",     bg: "rgba(239,100,80,0.10)",  color: "#ef6450" },
  }[status] ?? { label: status, bg: "rgba(136,136,136,0.10)", color: "#888" };

  const preview = (() => {
    if (status === "booked")      return "Booking confirmed";
    if (status === "in_progress") return "Service in progress";
    if (status === "completed")   return "Service completed";
    if (status === "disputed")    return "Dispute under review";
    // pending states
    if (!row.request_card)        return "Start a conversation";
    if (!row.quote_card) return iAmRequester ? "You've sent a request" : "Request received";
    return iAmRequester ? "Quote received" : "You've sent a quote";
  })();

  const serviceType = (row.request_card as ServiceRequestCard | null)?.serviceType
    || (row.quote_card as ServiceQuoteCard | null)?.serviceType
    || "Service booking";

  const name = row.counterpart?.display_name || "Pet Carer";
  const avatar = row.counterpart?.avatar_url || null;
  const updatedAt = new Date(row.updated_at);
  const timeAgo = formatDistanceToNow(updatedAt, { addSuffix: true }); // date-fns

  return (
    <button
      type="button"
      onClick={() => navigate(`/service-chat?roomId=${row.chat_id}`)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 active:bg-muted/50 transition-colors"
    >
      {/* Avatar */}
      {avatar ? (
        <img src={avatar} alt={name} className="w-[46px] h-[46px] rounded-full object-cover shrink-0" />
      ) : (
        <span className="w-[46px] h-[46px] rounded-full bg-[rgba(33,69,207,0.10)] flex items-center justify-center text-[16px] font-[600] text-[#2145CF] shrink-0">
          {name.slice(0,2).toUpperCase()}
        </span>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] font-[600] text-[#424965] truncate">{name}</span>
          <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-[600] shrink-0"
            style={{ background: statusConfig.bg, color: statusConfig.color }}
          >
            {statusConfig.label}
          </span>
          <span className="text-[13px] text-muted-foreground truncate">{preview}</span>
        </div>
        <p className="text-[12px] text-muted-foreground/60 mt-0.5 truncate">{serviceType}</p>
      </div>

      <ChevronRight size={16} className="text-muted-foreground/40 shrink-0" />
    </button>
  );
}
```

---

### 7.5 — Legal File

`src/legal/pet-care-booking-terms.html`

Read `src/legal/terms.html` first for CSS. Clone the page structure, replace body content with:
1. **Direct Booking** — "Your booking is directly with the service provider. Huddle is a platform connecting you, and is not a party to the service agreement."
2. **Payment & Escrow** — "Payment is securely held by Huddle until the service is marked complete by both parties. Funds are released to the provider within 24 hours of confirmation."
3. **Dispute Resolution** — "Either party may file a dispute within 48 hours of service completion. Huddle will review and mediate. Payouts may be delayed during investigation."
4. **Cancellation** — "Contact your provider directly to cancel or reschedule. Refunds are at Huddle's reasonable discretion based on the circumstances."
5. **Liability** — "The service provider is solely responsible for the care of your pet during the booked period. Huddle is not liable for pet injury, loss, or property damage arising from the service."

---

## Phase 8 — Build Verification

### Task List
- [ ] 8.1 — Run `npm run build`
- [ ] 8.2 — Fix all TypeScript errors (no `any`, no missing props, no unused imports)
- [ ] 8.3 — Run `npm run lint` — zero warnings

**Common issues to pre-empt:**
- `onClose` added to `PublicCarerProfileViewProps` — verify it's passed everywhere the component is used (check `PublicCarerProfileModal.tsx`)
- `serviceChat` can be `null` before loading — guard all property accesses with `?.` or early returns
- `supabase.rpc("create_service_chat", ...)` — TypeScript may not know the return type; cast as `{ data: string; error: unknown }`
- `formatDistanceToNow` from date-fns — verify it's already a dependency (`package.json`); if not, use manual calculation
- `service_chat_id` parameter in `BookingConfirmScreen.tsx` — it's named `roomId` in the page's `searchParams`, make sure it's passed correctly
- `BookingConfirmedOverlay` needs an `open: boolean` prop or use conditional render — be consistent with the rest of the sheets

---

## Phase 9 — Deploy

### Task List
- [ ] 9.1 — `supabase functions deploy create-service-payment`
- [ ] 9.2 — `supabase functions deploy release-service-payout`
- [ ] 9.3 — `supabase functions deploy stripe-webhook`
- [ ] 9.4 — Verify `STRIPE_SECRET_KEY` env var is set in Supabase project settings
- [ ] 9.5 — Smoke test: end-to-end flow with test Stripe key

---

## End-to-End Flow Summary

```
User opens Carer Profile modal
  ↓ taps "Request a service" (sticky, always visible)
  ↓ idempotency check → create_service_chat RPC → navigate to /service-chat

ServiceChat page loads
  ↓ useServiceChat loads service_chats row → status='pending', no requestCard
  ↓ role='requester' → StartRequestBar shown instead of Composer

Requester taps StartRequestBar
  ↓ RequestForm sheet opens → fills details → "Save & send request"
  ↓ send_service_request RPC → requestCard saved, system message inserted
  ↓ Realtime UPDATE → BookingCard shows RequestView, Composer unlocked

Provider opens chat (via Chats service tab)
  ↓ ActionBar shows "Send a quote"
  ↓ Provider taps → QuoteForm opens (pre-filled from requestCard)
  ↓ send_service_quote RPC → quoteCard saved, system message inserted
  ↓ Realtime UPDATE → both users: BookingCard shows QuoteView

Requester sees QuoteView → taps "Accept & pay"
  ↓ BookingConfirmScreen pushes (full screen)
  ↓ "Pay {currency} {amount}" → create-service-payment edge function
  ↓ Stripe Checkout → success_url = /service-chat?roomId=xxx&payment=success

Payment confirmed
  ↓ stripe-webhook: checkout.session.completed → service_booking type
  ↓ service_chats.status → 'booked', stripe_payment_intent_id stored
  ↓ "service_booked" message inserted
  ↓ Client returns to /service-chat?payment=success → BookingConfirmedOverlay (2.5s)
  ↓ Realtime UPDATE on service_chats → BookingCard shows ReceiptView

Service day arrives
  ↓ Provider taps ActionBar "Start service" → start_service RPC → status='in_progress'
  ↓ Both parties see "Service started" system pill

Service complete
  ↓ Provider taps "Service complete" → mark_service_finished RPC (provider flag=true)
  ↓ Requester sees "Waiting for your confirmation…" ActionBar
  ↓ Requester taps "Service complete" → mark_service_finished (both flags → status='completed')
  ↓ release-service-payout fires → stripe.transfers.create → payout_released_at set
  ↓ "Service completed ✓" system pill appears

Post-completion
  ↓ Requester: ActionBar shows "Leave a review"
  ↓ ReviewFlow (3 steps: stars → tags → text) → submit_service_review RPC
  ↓ (within 48h) either party can file dispute → DisputeFlow → file_service_dispute RPC
```

---

## Constants Reference

```typescript
// Used in RequestForm + QuoteForm
const SERVICES_OFFERED = [
  "Boarding","Walking","Day Care","Drop-in","Grooming",
  "Training","Vet / Licensed Care","Transport","Emergency Help","Others"
];

const PET_TYPES = [
  "Dogs","Cats","Rabbits","Birds","Hamsters / Guinea Pigs",
  "Reptiles","Fish","Small pets","Others"
];

const CURRENCIES = ["USD","HKD","GBP","EUR","AUD","SGD","CAD","JPY"];

const RATE_OPTIONS = ["Per hour","Per day","Per session","Per night"];

const REVIEW_TAGS = [
  "Punctual","Great with pets","Clear communication","Friendly",
  "Reliable","Patient","Attentive","Professional","Flexible",
  "Helpful","Clean & tidy","Followed instructions"
];

const DISPUTE_CATEGORIES = [
  "No-show","Late arrival","Service not completed",
  "Pet injury / safety issue","Property damage",
  "Payment / billing issue","Other"
];
```

---

*Plan version: v2. Supersedes 2026-03-20-service-chat.md.*
*Apple UX audit applied: 12 design problems identified and resolved.*
*25 files: 18 new, 7 modified.*
