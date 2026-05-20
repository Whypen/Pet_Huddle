# Explore-Groups → Marketplace Card 1:1 — Execution Plan

> **Authoring constraint:** `Read First.md` + `No Mistake Codex.md` apply.
> **Scope:** Web only (`/src`). `/app` and `/mobile` untouched. Native port planned, not in this pass.
> **Surface:** `Chats > Groups > Explore` tab inside `src/pages/Chats.tsx`.
> **Date:** 2026-04-30.
> **Status until approved:** PLAN ONLY.

---

## 0. Goal

Replace the current dense row-style cards in the Explore-Groups tab with a 1:1 lift of the dead `/marketplace` `NannyCard` layout — image-led catalog card with basic info overlaid on the cover. Same data, no new query, no new asset upload, no new dependency.

---

## 1. Source-of-truth files (read line-by-line before editing)

| File | Purpose | Edit / read-only |
|---|---|---|
| `src/components/marketplace/NannyCard.tsx` | Visual contract being lifted | **Read-only** |
| `src/pages/Marketplace.tsx` | Filter-bar reference (not lifted in this pass) | Read-only |
| `src/pages/Chats.tsx` | Inline Explore-Groups JSX to be replaced | **Edit** |
| `src/styles/tokens.css` / `src/index.css` | Verify `glass-card` class exists and matches Marketplace's expectation | Read-only |

Lines in `Chats.tsx` that are replaced:
- L5982–L6083 — invited explore card block
- L6087–L6160ish — browse explore card block

Both blocks are replaced by a single shared component.

---

## 2. Non-goals

- Filter bar (Marketplace's `glass-bar` chip strip) — **not** in this pass. Future enhancement.
- Section headers between Invited / Discover — **not** in this pass.
- Cover-photo upload for groups — out of scope (no schema change, no mutation).
- Friends or Service tabs — untouched.
- Native port — separate pass.
- Any data/query/RPC change — none.
- Any change to `openGroupDetailsSheet`, `acceptGroupInviteAndOpen`, `joinPublicGroupAndOpen`, `requestGroupJoin` — handlers stay identical, callers move into the new component as props.
- `framer-motion` stagger — preserved exactly as-is for this pass (kill in a follow-up if desired).

---

## 3. Component contract — `<ExploreGroupCard>`

### Location
`src/components/chat/ExploreGroupCard.tsx` (new file).

### Props

```ts
type ExploreGroupCardCTA =
  | { kind: "join"; onJoin: () => void }
  | { kind: "request"; onRequest: () => void }
  | { kind: "requested" }
  | { kind: "invited"; onAccept: () => void }
  | { kind: "open"; onOpen: () => void };

type ExploreGroupCardProps = {
  group: Group;                // existing type from Chats.tsx
  cta: ExploreGroupCardCTA;
  onCardOpen: () => void;      // tap on cover or name → openGroupDetailsSheet
  // motion is owned by parent (framer-motion wrapper stays in Chats.tsx)
};
```

The component renders **only the card body**. The `motion.div` wrapper with `initial`/`animate`/`transition` stays in the parent so existing stagger behavior and per-card delay remain unchanged.

### Visual contract (1:1 lift from `NannyCard`)

```
┌─ glass-card ─────────────────────────────┐
│  ┌──────────────────────────────────┐   │
│  │  aspect-[4/3]                    │   │ ← cover (avatarUrl object-cover OR gradient)
│  │                                  │   │   gradient scrim bottom h-1/3
│  │  ┌──────────┐                    │   │
│  │  │ N members│ ← top-right pill   │   │   member count
│  │  └──────────┘                    │   │
│  │                                  │   │
│  │  Group name           ✓          │   │ ← bottom-left overlay (profile-card move)
│  │  📍 Brunswick                    │   │   white text on scrim
│  └──────────────────────────────────┘   │
│  px-4 py-4 space-y-3                     │
│  [Dog] [Cat] [Outdoors]                  │ ← pet-focus chips, brand-blue tint
│  Two-line description text…              │
│  ┌────────────────────────────────────┐  │
│  │            Join                    │  │ ← full-width CTA, 5 states
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### Visual specification (token-bound)

| Element | Spec |
|---|---|
| Card shell | `glass-card overflow-hidden` (existing class) |
| Cover container | `relative aspect-[4/3] overflow-hidden rounded-[20px_20px_0_0]` |
| Cover image | `<img>` from `group.avatarUrl`, `object-cover` |
| Cover fallback | `<div>` with gradient: `linear-gradient(160deg, #2145CF 0%, #3A5FE8 100%)` (Huddle Blue) when no `avatarUrl` |
| Bottom scrim | absolute, bottom-0, h-1/3, `linear-gradient(to top, rgba(20,24,38,0.65), transparent)` (deeper than NannyCard's 0.55 because text overlays it) |
| Member-count pill | top-right, `text-[11px] font-[500] px-[8px] py-[3px] rounded-full bg-[rgba(20,24,38,0.55)] backdrop-blur-sm text-white` |
| Name overlay | bottom-left in cover, `text-[18px] font-[600] text-white` + truncate, lucide `BadgeCheck` 16/1.5 in white at 90% opacity inline if `group.isVerified` (only if that field exists; otherwise omit) |
| Location overlay | below name, `text-[12px] font-[500] text-white/85` with lucide `MapPin` 12/1.5 inline; renders only when `group.locationLabel` exists |
| Body padding | `px-4 py-4 space-y-3` |
| Pet-focus chip row | `flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5` |
| Pet-focus chip | `flex-shrink-0 text-[11px] font-[500] px-2.5 py-1 rounded-full bg-[rgba(33,69,207,0.08)] text-[#2145CF] border border-[rgba(33,69,207,0.10)]` (lifted verbatim from NannyCard) |
| Chip count | `group.petFocus.slice(0, 4)` |
| Description | `text-[13px] leading-relaxed text-[rgba(74,73,101,0.70)] line-clamp-2 break-words` |
| CTA row | `pt-1` |
| CTA button (all states) | `w-full h-10 rounded-full text-[14px] font-[600] flex items-center justify-center gap-1` |

### CTA state styling

| State | Background | Text | Border |
|---|---|---|---|
| `join` | `var(--blue, #2145CF)` solid | white | none |
| `request` | transparent | `var(--blue)` | `1px solid var(--blue)` |
| `requested` | `rgba(74,73,101,0.08)` | `rgba(74,73,101,0.55)` | none, disabled |
| `invited` | `var(--coral-orange, #FF7F50)` solid | white | none |
| `open` | transparent | `var(--blue)` | `1px solid var(--blue)`, suffix `<ChevronRight />` |

CTA labels: `Join`, `Request to join`, `Requested`, `You're invited`, `Open`.

All states share identical height (`h-10`), radius (`rounded-full`), and padding so the card height stays stable across states.

### Tap targets

- Cover image **and** name overlay → `onCardOpen` (opens details sheet, same as current behavior).
- CTA → respective handler.
- No other interactive surfaces.

---

## 4. Data mapping (no schema change)

| Source field | Use |
|---|---|
| `group.id` | React `key` (parent owns) |
| `group.avatarUrl` | Cover `<img>` source; falls back to gradient |
| `group.name` | Bottom-left overlay |
| `group.locationLabel` | Below name; conditional |
| `group.memberCount` | Top-right pill |
| `group.petFocus` | Pet-focus chip row, slice(0, 4) |
| `group.description` | Body line-clamp-2 |
| `group.joinMethod` | Determines CTA kind in parent |
| `group.inviteId` | Used by parent's accept-invite handler |
| `group.isVerified` | If field exists, render verified tick; otherwise omit (no new field added) |

If any of these fields are not currently on the `Group` type, **do not add them**. Render conditionally.

---

## 5. Parent (Chats.tsx) refactor

### Replace L5982–L6083 (invited block)

Before:
```tsx
{invitedExploreGroups.map((group, index) => {
  const handleExploreCardCTA = async (e) => { /* … */ };
  return (
    <motion.div /* … */ className="relative rounded-xl bg-card p-3 shadow-card">
      {/* 60+ lines of inline JSX */}
    </motion.div>
  );
})}
```

After:
```tsx
{invitedExploreGroups.map((group, index) => (
  <motion.div
    key={`invite-${group.id}`}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.04, duration: 0.2 }}
  >
    <ExploreGroupCard
      group={group}
      onCardOpen={() => void openGroupDetailsSheet(group)}
      cta={{
        kind: "invited",
        onAccept: async () => {
          try {
            await acceptGroupInviteAndOpen({
              chatId: group.id,
              chatName: group.name,
              inviteId: group.inviteId,
            });
          } catch {
            toast.error("Unable to join group right now.");
          }
        },
      }}
    />
  </motion.div>
))}
```

### Replace L6087–L6160ish (browse block)

```tsx
{exploreGroups.map((group, index) => {
  const isMember = groups.some((g) => g.id === group.id);
  const hasSentRequest = sentJoinRequests.has(group.id);

  const cta: ExploreGroupCardCTA = isMember
    ? {
        kind: "open",
        onOpen: () =>
          navigate(
            `/chat-dialogue?room=${encodeURIComponent(group.id)}&name=${encodeURIComponent(group.name)}`,
          ),
      }
    : hasSentRequest
    ? { kind: "requested" }
    : group.joinMethod === "instant"
    ? { kind: "join", onJoin: () => void joinPublicGroupAndOpen(group) }
    : { kind: "request", onRequest: () => void requestGroupJoin(group) };

  return (
    <motion.div
      key={group.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: (invitedExploreGroups.length + index) * 0.04,
        duration: 0.2,
      }}
    >
      <ExploreGroupCard
        group={group}
        onCardOpen={() => void openGroupDetailsSheet(group)}
        cta={cta}
      />
    </motion.div>
  );
})}
```

### Spacing

The current `space-y-2` on the wrapping `<div className="px-5 space-y-2">` becomes `space-y-4` to match Marketplace's `space-y-4` rhythm — the new cards are taller and need more breathing room.

That's the only structural change in the wrapper.

---

## 6. Cover fallback decision

`group.avatarUrl` may be missing for many groups. Two acceptable fallbacks:

- **A)** Solid `linear-gradient(160deg, #2145CF, #3A5FE8)` (Huddle Blue → Blue Light).
- **B)** Coral variant for `joinMethod === "instant"` to differentiate "open" groups visually.

**Decision:** ship A only this pass. B is a polish enhancement that requires copy + accessibility review (color-as-info concerns).

---

## 7. Files plan

### New files (1)
```
src/components/chat/ExploreGroupCard.tsx       # ~120 lines
```

### Modified files (1)
```
src/pages/Chats.tsx                            # ~140 lines net deletion
```

### Deleted code
- The two inline JSX blocks for invited + browse cards (~180 lines combined). Replaced by the new component.

### Untouched
- `src/components/marketplace/NannyCard.tsx` — read-only reference; do not edit.
- `src/pages/Marketplace.tsx` — read-only reference.
- All hooks, queries, and side-effects in `Chats.tsx` — preserved exactly.

---

## 8. Token compliance gate

- `glass-card` is the existing tokenized class — verified before edit.
- All colors reference CSS variables (`--blue`, `--coral-orange`) or the exact Marketplace `rgba(...)` values (which themselves trace to brand tokens).
- No new color, font, spacing, or shadow value introduced.
- No `backdrop-filter` outside the member-count pill (which is a **non-fixed** surface — exception flagged below).

**Exception note:** the member-count pill uses `backdrop-blur-sm`. Per `Read First.md`, ad-hoc `backdrop-filter` is forbidden outside the permitted list (`.glass-card`, `.glass-l2`, `.glass-l3`, `.glass-bar`, `.glass-nav`). To honor the rule strictly, use a solid `bg-[rgba(20,24,38,0.65)]` instead of `backdrop-blur-sm` + lighter alpha. Same readability, no rule break.

**Decision:** drop `backdrop-blur-sm`; pill is solid `rgba(20,24,38,0.65)` text-white.

---

## 9. Tap target & accessibility

- Cover image is wrapped in a `<button type="button">` for screen-reader navigation, with `aria-label={'Open ${group.name} details'}`.
- Name overlay sits inside that same button. Keyboard activation triggers `onCardOpen`.
- CTA is a separate `<button>` with state-specific `aria-label`:
  - `join` → `Join ${group.name}`
  - `request` → `Request to join ${group.name}`
  - `requested` → `Join request pending` + `aria-disabled="true"`
  - `invited` → `Accept invite to ${group.name}`
  - `open` → `Open ${group.name}`
- Pet-focus chip row is non-interactive; chips are `<span>`, not `<button>`.
- `requested` state has `disabled` and pointer-events-none.

---

## 10. Acceptance criteria

1. Both invited and browse cards render via `<ExploreGroupCard>` with no visual difference between them other than CTA state.
2. Visual diff against `NannyCard` shows: same shell, same cover aspect, same chip styling, same body padding, same CTA height/radius. The only structural difference is single CTA vs. NannyCard's two-button row.
3. All five CTA states render at identical card height (no layout shift between states).
4. No new package, no new query, no new RPC.
5. `npm run lint` clean.
6. `npm run build` clean.
7. Existing handlers (`openGroupDetailsSheet`, `acceptGroupInviteAndOpen`, `joinPublicGroupAndOpen`, `requestGroupJoin`) are wired identically.
8. `groupSubTab === "explore"` rendering condition unchanged.
9. Empty state (`emptyChatImage` block) untouched.
10. Loading state (`exploreLoading` spinner) untouched.

---

## 11. Test plan

### Manual smoke

| Scenario | Expected |
|---|---|
| Open `/chats?tab=groups`, switch to "Explore" | Two stacked groups render: invited (top), browse (bottom) |
| Group has `avatarUrl` | Cover renders the photo `object-cover` |
| Group has no `avatarUrl` | Cover renders Huddle Blue gradient |
| Group has `petFocus: ["dog", "cat", "rabbit", "other", "fifth"]` | Only first 4 chips render |
| Group has no `petFocus` | Chip row absent (no empty placeholder) |
| Group has no `description` | Description line absent |
| Group has long name | Name truncates at one line |
| `joinMethod === "instant"`, not member, no request | CTA: `Join` (solid blue) |
| `joinMethod === "request"`, not member, no request | CTA: `Request to join` (outlined blue) |
| `joinMethod === "request"`, request sent | CTA: `Requested` (disabled grey) |
| `invitedExploreGroups` row | CTA: `You're invited` (Coral solid) |
| Already a member (in `groups`) | CTA: `Open` with chevron |
| Tap cover | Opens details sheet via `openGroupDetailsSheet(group)` |
| Tap name | Same as cover tap |
| Tap CTA | Triggers correct handler; does not also fire `onCardOpen` (event.stopPropagation in CTA) |

### Automated
- TypeScript: `npm run typecheck` (or `tsc --noEmit`) clean.
- Lint: `npm run lint` clean.
- Build: `npm run build` clean.

### Visual diff
- Screenshot the Explore tab before edit (baseline).
- Screenshot the Explore tab after edit.
- Side-by-side compare against `/marketplace` for shell, cover, scrim, body, CTA fidelity.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| `glass-card` class doesn't exist or has drifted | Read `src/index.css` / `src/styles/global.css` before edit; abort if class missing |
| Existing `Group` type lacks `isVerified` | Render conditionally; do not extend the type |
| Tall 4:3 cover reduces above-the-fold density | Accepted tradeoff — Marketplace ships this aspect; we mirror it 1:1 |
| `framer-motion` mount delay × N cards × taller card → sluggish first paint | Existing stagger is `0.04s × index, 0.2s duration` — same as before; no new cost |
| User has 50+ groups in explore feed | Out of scope; current implementation already maps all of them — same behavior preserved |
| Native port later picks up the inline name overlay and gradient scrim | Both map cleanly to `expo-image` + `LinearGradient`; no new dep needed |

---

## 13. Phased plan

| Phase | Scope | Files | Approval |
|---|---|---|---|
| **1** | Read source-of-truth + verify `glass-card` token + verify `Group` type fields | none (audit only) | yes — quick audit |
| **2** | Build `ExploreGroupCard.tsx` with all 5 CTA states; render alongside existing JSX behind a temporary feature flag (or render via story page) for visual diff | `src/components/chat/ExploreGroupCard.tsx` | yes |
| **3** | Swap parent JSX: replace invited block with `<ExploreGroupCard>` | `src/pages/Chats.tsx` (invited block only) | yes — half-cut visible to user |
| **4** | Swap browse block | `src/pages/Chats.tsx` (browse block) | yes — full cutover |
| **5** | Lint + build + visual diff sign-off; remove dead handlers if any | `src/pages/Chats.tsx` polish | yes — final |
| **6** | Native port (separate plan, separate pass) | `app/...` | not in this plan |

Phase 2 is the biggest single deliverable. 3 and 4 are minutes each.

---

## 14. Required reporting (per `Read First.md` §13)

```text
SCOPE: src/pages/Chats.tsx + src/components/chat/ExploreGroupCard.tsx (new)
ROOT OWNER: web product (src)
LAYERS INSPECTED: src
LAYERS TOUCHED: src
WEB SRC TOUCHED: yes (this is a web product change, explicitly approved)
APP TOUCHED: no
MOBILE TOUCHED: no

FILES CHANGED:
- src/components/chat/ExploreGroupCard.tsx (new)
- src/pages/Chats.tsx (invited + browse blocks replaced)

NEW PACKAGE(S): none
TOKEN(S) ADDED: none
NEW QUERY/RPC: none

LINT: pass
TYPECHECK: pass
BUILD: pass

BEHAVIOR CHANGED: no (handlers, data, navigation all preserved 1:1)
ROUTE OWNERSHIP CHANGED: no
SHELL OWNERSHIP CHANGED: no

VISUAL PARITY PROOF: pass (against /marketplace NannyCard, same shell + cover + body)
NO-PERMISSION BEHAVIOR PRESERVED: yes
RUNTIME PROOF: local pass / live not run
SAFE TO PUSH: yes (after lint + build pass)
SAFE TO DEPLOY LIVE: yes (web change, no migration, no env, no backend)
```

---

## 15. What this plan explicitly will not do

- Add a filter chip bar (Marketplace's strip).
- Add section headers between Invited and Discover.
- Change `framer-motion` stagger.
- Change `Group` type, schema, query, or RPC.
- Touch Friends or Service tabs.
- Touch the Marketplace page itself.
- Touch `/app` or `/mobile`.
- Add or remove any package.
- Change any token.
- Add cover-photo upload.

---

## 16. Approval

To proceed, user picks one:

- **A)** Approve Phase 1 only (audit pass, no code).
- **B)** Approve Phases 1–5 (full cutover, single PR).
- **C)** Approve in two PRs: 1+2 first (component build behind temp visibility), then 3+4+5 after visual diff.

No code is written until one of the above is chosen.

---

*End of plan.*
