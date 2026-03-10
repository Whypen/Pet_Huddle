# Family Account — Design Doc
**Date:** 2026-03-10

## Overview
"Manage Family Account" lets users link household members so they mirror the owner's tier features (filters, broadcast range, video, discovery priority). No quota pooling. Lives in Settings below Manage Membership.

---

## Rules
- **All tiers** can open the sheet. Free/Plus with 0 slots see purchase CTA.
- **Gold**: 1 free slot included (`family_slots = 1` on upgrade).
- **Hard cap**: 4 total household (owner + 3 members). Max purchasable: 3 slots.
- **What mirrors**: filters access, broadcast range & duration, More Discovery, video uploads (Gold only), Top Profile Visibility (Gold only).
- **What doesn't mirror**: stars, broadcasts, AI Vet credits — each account independent.
- **effective_tier**: already set by AuthContext on login if invitee has accepted row in `family_members`.

---

## DB Schema (existing)
```sql
family_members (
  id uuid PK,
  inviter_user_id uuid → profiles,
  invitee_user_id uuid → profiles,
  status text CHECK ('pending','accepted','declined'),
  created_at timestamptz
)
-- RLS: select = inviter OR invitee; insert = inviter only; update = inviter OR invitee
```
No migration needed — table + RLS already exist.

---

## Files to Create
| File | Purpose |
|---|---|
| `src/components/monetization/ManageFamilySheet.tsx` | Main family management GlassSheet |
| `src/components/monetization/FamilySearchDrawer.tsx` | Layered search sub-sheet |
| `src/components/monetization/SharePerksModal.tsx` | Mini add-on modal for slot purchase |

## Files to Modify
| File | Change |
|---|---|
| `src/pages/Settings.tsx` | Add Family Account row below Manage Membership |
| `src/pages/Premium.tsx` | Update Share Perks subtitle; `Add-ons` button → blue |
| `src/pages/Subscription.tsx` | `Add-ons` label → `#2145CF` blue |

---

## ManageFamilySheet

### Props
```ts
interface Props { open: boolean; onClose: () => void; }
```

### State
```ts
members: FamilyMember[]   // fetched from family_members (both directions)
isOwner: boolean          // true if any row has inviter_user_id === profile.id
familySlots: number       // profile.family_slots
loading: boolean
showSearch: boolean
```

### FamilyMember type
```ts
{ id: string; inviter_user_id: string; invitee_user_id: string;
  status: 'pending'|'accepted'|'declined';
  peer: { display_name: string; avatar_url: string; social_id: string; } }
```

### Data fetch (on open)
```sql
SELECT fm.*,
  p.display_name, p.avatar_url, p.social_id
FROM family_members fm
JOIN profiles p ON p.id = CASE
  WHEN fm.inviter_user_id = auth.uid() THEN fm.invitee_user_id
  ELSE fm.inviter_user_id END
WHERE fm.inviter_user_id = auth.uid() OR fm.invitee_user_id = auth.uid()
  AND fm.status != 'declined'
```

### Layout
```
GlassSheet (tall, handle)
  Header: "Family Account"  [×]
  Subtext: "{tier} · {used} of {slots} slot{s} used"  ← owner only

  [Owner row] — You · Owner (no action)

  [Member rows] — swipe-left reveals red trash
    • avatar + display_name + "Family Member" badge + Active/Pending chip

  [+ icon button]  ← visible if used < slots
  [🛍 Member slot] row  ← visible if used >= slots AND slots < 3 (→ SharePerksModal)
  [empty state]  ← if no members

  What members get (info card, always shown):
    ✓ Your filters access
    ✓ Broadcast range & duration
    ✓ More Discovery
    ✓ Video uploads          ← only if tier === 'gold'
    ✓ Top Profile Visibility ← only if tier === 'gold'

  [Leave Family] text btn (red)  ← member view only, bottom
```

### Actions
**Remove member (owner):** `DELETE FROM family_members WHERE id = $rowId AND inviter_user_id = auth.uid()` → refetch
**Leave family (member):** `DELETE FROM family_members WHERE id = $rowId AND invitee_user_id = auth.uid()` → `fetchProfile()` (clears effective_tier) → close
**Send invite:** see FamilySearchDrawer below

---

## FamilySearchDrawer

Layered GlassSheet on top of ManageFamilySheet (z-[5300]).

### Search query (on input change, debounce 300ms)
```sql
SELECT id, display_name, avatar_url, social_id, tier
FROM profiles
WHERE (display_name ILIKE '%{q}%' OR social_id ILIKE '%{q}%')
  AND id != auth.uid()
  AND id NOT IN (SELECT invitee_user_id FROM family_members WHERE inviter_user_id = auth.uid())
  AND id NOT IN (SELECT inviter_user_id FROM family_members WHERE invitee_user_id = auth.uid())
LIMIT 10
```

### Send invite
1. `INSERT INTO family_members (inviter_user_id, invitee_user_id, status) VALUES (uid, target_id, 'pending')`
2. Insert notification for target:
```ts
supabase.from("notifications").insert({
  user_id: target_id,
  type: "family_invite",
  title: "Family Invite",
  body: `${profile.display_name} has invited you to join their family!`,
  message: `${profile.display_name} has invited you to join their family!`,
  metadata: { inviter_id: uid, family_member_id: newRow.id },
  data: { kind: "family_invite", href: "/settings" },
  read: false,
  is_read: false,
})
```
3. Close drawer, refetch members.

### Accept/Decline (notification action — existing notification hub)
- Accept: `UPDATE family_members SET status='accepted' WHERE id=$id AND invitee_user_id=uid` → `fetchProfile()` (elevates effective_tier)
- Decline: `UPDATE family_members SET status='declined' WHERE id=$id AND invitee_user_id=uid`

---

## SharePerksModal

Focused GlassModal (centered, same pattern as StarUpgradeSheet).
Shows only the Share Perks add-on card from Premium.tsx.
CTA invokes `create-checkout-session` with `sharePerks` add-on (existing Premium.tsx checkout path).
After success → close modal → refetch `family_slots` from profile.

---

## Settings.tsx change

Below the existing `<InsetRow label="Manage Membership" .../>` row, inside the same `<InsetPanel>`:

```tsx
<InsetDivider />
<InsetRow
  label="Family Account"
  icon={<Users size={16} strokeWidth={1.75} />}
  variant="nav"
  trailingSlot={
    hasSlots
      ? <NeuChip>{usedCount} / {totalSlots}</NeuChip>
      : <button onClick={openSharePerks} className="flex items-center gap-1 text-[12px] text-[var(--text-secondary)]">
          <ShoppingBag size={12} /> Member slot
        </button>
  }
  onClick={() => setFamilySheetOpen(true)}
/>
```

`hasSlots` = `(profile?.family_slots ?? 0) > 0`
`totalSlots` = `Math.min(profile?.family_slots ?? 0, 3)`

---

## Premium.tsx changes
1. Share Perks `subtitle`: `"Mirrors tier's access to exclusive features"`
2. `Add-ons` toggle/button label: color `#2145CF`

## Subscription.tsx change
`Add-ons` row label: color `#2145CF`

---

## Notification type
`"family_invite"` — check if already in the `type` CHECK constraint. If not, a migration must add it.

### Migration needed
```sql
-- Check existing constraint on notifications.type and add 'family_invite' if missing
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'wave','star','match','message','group_invite','broadcast','mention',
    'thread_reply','booking','system','family_invite'
  ));
```

---

## Acceptance Criteria
- [ ] Settings shows Family Account row below Manage Membership
- [ ] Gold user (family_slots=1) sees "0 / 1" chip
- [ ] Free/Plus (no slots) sees 🛍 Member slot → SharePerksModal opens
- [ ] Owner can search by display_name or social_id (excludes self + already linked)
- [ ] Invite inserts family_members row + notification to invitee
- [ ] Swipe-left reveals trash; confirm removes row
- [ ] Member (invitee) sees Leave Family; leaving clears effective_tier via fetchProfile
- [ ] Info card shows 3 items for Plus, 5 for Gold (no tier labels in text)
- [ ] Share Perks subtitle updated; Add-ons labels blue
- [ ] lint + build clean
