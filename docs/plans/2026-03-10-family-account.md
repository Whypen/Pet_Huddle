# Family Account Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add "Manage Family Account" to Settings, letting users link household members who mirror the owner's tier features (no quota pooling).

**Architecture:** New `ManageFamilySheet` + `FamilySearchDrawer` + `SharePerksModal` components. Settings.tsx gets a Family Account row below Manage Membership. All DB work uses the existing `family_members` table + `profiles.family_slots`. One migration adds `family_invite` to the notifications type constraint.

**Tech Stack:** React + TypeScript, Supabase (existing `family_members` table), Framer Motion, GlassSheet/GlassModal primitives, Lucide icons, Tailwind.

---

### Task 1: Migration — add `family_invite` notification type

**Files:**
- Create: `supabase/migrations/20260310120000_family_invite_notification_type.sql`

**Step 1: Write migration**

```sql
-- Adds 'family_invite' to the notifications type column.
-- Uses DROP/ADD pattern to extend the check constraint safely.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (
    type in (
      'wave','star','match','message','group_invite','broadcast','mention',
      'thread_reply','booking','system','family_invite'
    )
  );
```

**Step 2: Apply migration to local Supabase (if running) or note for prod push**

```bash
# If local supabase running:
supabase db push
# Otherwise, migration will run on next deploy. Proceed to UI tasks.
```

**Step 3: Commit**
```bash
git add supabase/migrations/20260310120000_family_invite_notification_type.sql
git commit -m "feat(db): add family_invite notification type"
```

---

### Task 2: `SharePerksModal.tsx` — focused slot-purchase modal

**Files:**
- Create: `src/components/monetization/SharePerksModal.tsx`

**Context:** This is a focused GlassModal that shows only the Share Perks add-on card. It opens when a user with no family slots taps the "🛍 Member slot" row. It reuses the existing `create-checkout-session` edge function invocation pattern from `Premium.tsx`.

**Step 1: Read reference files**
```
Read: src/components/ui/GlassModal.tsx   (props: isOpen, onClose, title, children)
Read: src/pages/Premium.tsx lines 100-115 (sharePerks addon definition)
Read: src/pages/Premium.tsx lines 245-295 (checkout invocation pattern)
```

**Step 2: Create the component**

```tsx
// src/components/monetization/SharePerksModal.tsx
import { useState } from "react";
import { Users2, Check } from "lucide-react";
import { GlassModal } from "@/components/ui/GlassModal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const BRAND_BLUE = "#2145CF";
const CARD_FLOAT_STYLE = {
  border: "1.5px solid rgba(255,255,255,0.88)",
  boxShadow: "0 8px 28px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.07)",
};

const SHARE_PERKS_PRICE = 4.99;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Owner's tier — used to show correct feature list */
  tier: string;
}

const FEATURES_BASE = [
  "Your filters access",
  "Broadcast range & duration",
  "More Discovery",
];
const FEATURES_GOLD = ["Video uploads", "Top Profile Visibility"];

export function SharePerksModal({ isOpen, onClose, tier }: Props) {
  const [loading, setLoading] = useState(false);
  const isGold = tier === "gold";
  const features = isGold ? [...FEATURES_BASE, ...FEATURES_GOLD] : FEATURES_BASE;

  async function handlePurchase() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-checkout-session",
        {
          body: {
            addon: "sharePerks",
            successUrl: `${window.location.origin}/settings?addon_done=1`,
            cancelUrl: window.location.href,
          },
        }
      );
      if (error || !data?.url) throw error ?? new Error("No checkout URL");
      window.location.href = data.url;
    } catch {
      toast.error("Could not start checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Member Slot" maxWidth="max-w-sm">
      <div className="rounded-[16px] overflow-hidden" style={CARD_FLOAT_STYLE}>
        {/* Header stripe */}
        <div
          className="flex items-center gap-2 px-5 py-4"
          style={{ background: BRAND_BLUE }}
        >
          <Users2 size={18} color="#fff" strokeWidth={1.75} />
          <span className="text-[15px] font-[600] text-white">Share Perks</span>
          <span className="ml-auto text-[13px] font-[500] text-white/80">
            ${SHARE_PERKS_PRICE}/mo
          </span>
        </div>
        {/* Body */}
        <div className="bg-white px-5 py-4 space-y-2">
          <p className="text-[12px] text-[var(--text-secondary)]">
            Mirrors tier's access to exclusive features
          </p>
          <div className="space-y-1.5 pt-1">
            {features.map((f) => (
              <div key={f} className="flex items-center gap-2">
                <Check size={13} strokeWidth={2.5} style={{ color: BRAND_BLUE }} />
                <span className="text-[13px] text-[var(--text-primary)]">{f}</span>
              </div>
            ))}
          </div>
          <button
            onClick={handlePurchase}
            disabled={loading}
            className="mt-4 w-full rounded-[12px] py-3 text-[14px] font-[600] bg-white"
            style={{ color: BRAND_BLUE, border: `1.5px solid ${BRAND_BLUE}` }}
          >
            {loading ? "Loading…" : "Purchase Member Slot"}
          </button>
          <button
            onClick={onClose}
            className="w-full text-center text-[12px] text-[var(--text-tertiary)] pt-1"
          >
            Maybe later
          </button>
        </div>
      </div>
    </GlassModal>
  );
}
```

**Step 3: Commit**
```bash
git add src/components/monetization/SharePerksModal.tsx
git commit -m "feat(family): SharePerksModal — slot purchase modal"
```

---

### Task 3: `FamilySearchDrawer.tsx` — user search sub-sheet

**Files:**
- Create: `src/components/monetization/FamilySearchDrawer.tsx`

**Context:** Layered GlassSheet (z-[5300]) that slides over `ManageFamilySheet`. Searches profiles by `display_name` or `social_id`. On invite: inserts `family_members` row + notification.

**Step 1: Read reference**
```
Read: src/components/ui/GlassSheet.tsx  (props: isOpen, onClose, title, children)
```

**Step 2: Create the component**

```tsx
// src/components/monetization/FamilySearchDrawer.tsx
import { useState, useEffect } from "react";
import { Search, UserPlus } from "lucide-react";
import { GlassSheet } from "@/components/ui/GlassSheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface SearchResult {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  social_id: string | null;
  tier: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onInviteSent: () => void;
  /** IDs already linked (to exclude from results) */
  linkedIds: string[];
}

export function FamilySearchDrawer({ isOpen, onClose, onInviteSent, linkedIds }: Props) {
  const { profile } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [inviting, setInviting] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      const q = query.trim().replace(/^@/, "");
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, social_id, tier")
        .or(`display_name.ilike.%${q}%,social_id.ilike.%${q}%`)
        .neq("id", profile?.id ?? "")
        .limit(10) as unknown as { data: SearchResult[] | null };
      const filtered = (data ?? []).filter(
        (r) => !linkedIds.includes(r.id)
      );
      setResults(filtered);
    }, 300);
    return () => clearTimeout(t);
  }, [query, linkedIds, profile?.id]);

  async function sendInvite(target: SearchResult) {
    if (!profile?.id) return;
    setInviting(target.id);
    try {
      const { data: row, error } = await supabase
        .from("family_members" as "profiles")
        .insert({
          inviter_user_id: profile.id,
          invitee_user_id: target.id,
          status: "pending",
        } as never)
        .select("id")
        .single() as unknown as { data: { id: string } | null; error: unknown };

      if (error) throw error;

      // Insert notification for invitee
      await supabase.from("notifications").insert({
        user_id: target.id,
        type: "family_invite",
        title: "Family Invite",
        body: `${profile.display_name} has invited you to join their family!`,
        message: `${profile.display_name} has invited you to join their family!`,
        metadata: { inviter_id: profile.id, family_member_id: (row as { id: string }).id },
        data: { kind: "family_invite", href: "/settings" },
        read: false,
        is_read: false,
      } as never);

      toast.success(`Invite sent to ${target.display_name ?? "user"}`);
      onInviteSent();
      onClose();
    } catch {
      toast.error("Could not send invite. Please try again.");
    } finally {
      setInviting(null);
    }
  }

  return (
    <GlassSheet isOpen={isOpen} onClose={onClose} title="Search user" className="z-[5300]">
      <div className="px-4 pb-4 space-y-3">
        {/* Search field */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" strokeWidth={1.75} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="@Username or @SocialID"
            className="w-full pl-9 pr-4 py-3 rounded-[12px] bg-[var(--surface-neu)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none border border-transparent focus:border-[var(--brand-blue)]"
          />
        </div>

        {/* Results */}
        {results.map((r) => (
          <div key={r.id} className="flex items-center gap-3 py-2">
            <img
              src={r.avatar_url ?? "/placeholder.svg"}
              alt={r.display_name ?? ""}
              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-[500] text-[var(--text-primary)] truncate">
                {r.display_name}
              </p>
              {r.social_id && (
                <p className="text-[11px] text-[var(--text-tertiary)]">@{r.social_id}</p>
              )}
            </div>
            <button
              onClick={() => sendInvite(r)}
              disabled={inviting === r.id}
              className="flex items-center gap-1 px-3 py-1.5 rounded-[10px] text-[12px] font-[600] text-white"
              style={{ background: "#2145CF" }}
            >
              <UserPlus size={12} strokeWidth={2} />
              {inviting === r.id ? "…" : "Invite"}
            </button>
          </div>
        ))}

        {query.length > 0 && results.length === 0 && (
          <p className="text-center text-[13px] text-[var(--text-tertiary)] py-4">
            No users found
          </p>
        )}
      </div>
    </GlassSheet>
  );
}
```

**Step 3: Commit**
```bash
git add src/components/monetization/FamilySearchDrawer.tsx
git commit -m "feat(family): FamilySearchDrawer — search + invite flow"
```

---

### Task 4: `ManageFamilySheet.tsx` — main family management sheet

**Files:**
- Create: `src/components/monetization/ManageFamilySheet.tsx`

**Context:** Owner sees member list, [+] add button, slot upsell, info card. Member sees owner + Leave Family. Swipe-left to delete (same gesture pattern as Chats.tsx swipe-to-delete).

**Step 1: Read reference for swipe gesture pattern**
```
Read: src/pages/Chats.tsx — search for "dragX" or "swipe" to see the drag-to-delete pattern
```

**Step 2: Create the component**

```tsx
// src/components/monetization/ManageFamilySheet.tsx
import { useState, useEffect, useCallback } from "react";
import { Plus, ShoppingBag, Check, Trash2, Users } from "lucide-react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { GlassSheet } from "@/components/ui/GlassSheet";
import { FamilySearchDrawer } from "./FamilySearchDrawer";
import { SharePerksModal } from "./SharePerksModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const BRAND_BLUE = "#2145CF";
const SWIPE_THRESHOLD = -60;

const FEATURES_BASE = [
  "Your filters access",
  "Broadcast range & duration",
  "More Discovery",
];
const FEATURES_GOLD = ["Video uploads", "Top Profile Visibility"];

interface FamilyMember {
  id: string;
  inviter_user_id: string;
  invitee_user_id: string;
  status: "pending" | "accepted" | "declined";
  peer: { id: string; display_name: string | null; avatar_url: string | null; social_id: string | null };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function MemberRow({
  member,
  isOwner,
  onRemove,
}: {
  member: FamilyMember;
  isOwner: boolean;
  onRemove: (id: string) => void;
}) {
  const x = useMotionValue(0);
  const trashOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const [swiped, setSwiped] = useState(false);

  function handleDragEnd() {
    if (x.get() <= SWIPE_THRESHOLD) {
      setSwiped(true);
      animate(x, SWIPE_THRESHOLD);
    } else {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
      setSwiped(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-[12px]">
      {/* Trash background */}
      {isOwner && (
        <motion.div
          className="absolute inset-y-0 right-0 flex items-center justify-center w-14 bg-red-500 rounded-[12px]"
          style={{ opacity: trashOpacity }}
        >
          <Trash2 size={16} color="#fff" strokeWidth={1.75} />
        </motion.div>
      )}
      <motion.div
        drag={isOwner ? "x" : false}
        dragConstraints={{ left: SWIPE_THRESHOLD, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="relative flex items-center gap-3 py-3 px-1 bg-[var(--surface-neu)] rounded-[12px]"
      >
        <img
          src={member.peer.avatar_url ?? "/placeholder.svg"}
          alt={member.peer.display_name ?? ""}
          className="w-9 h-9 rounded-full object-cover flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-[500] text-[var(--text-primary)] truncate">
            {member.peer.display_name}
          </p>
          <span className="text-[10px] font-[600] text-white bg-[var(--brand-blue)] rounded-full px-2 py-0.5">
            Family Member
          </span>
        </div>
        <span
          className={`text-[11px] font-[500] px-2 py-0.5 rounded-full ${
            member.status === "accepted"
              ? "bg-green-100 text-green-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {member.status === "accepted" ? "Active" : "Pending"}
        </span>
        {swiped && isOwner && (
          <button
            onClick={() => onRemove(member.id)}
            className="absolute inset-0 opacity-0"
            aria-label="Confirm remove"
          />
        )}
      </motion.div>
    </div>
  );
}

export function ManageFamilySheet({ isOpen, onClose }: Props) {
  const { profile, fetchProfile } = useAuth() as ReturnType<typeof useAuth> & {
    fetchProfile?: (id: string) => Promise<void>;
  };
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showSlotModal, setShowSlotModal] = useState(false);

  const tier = String(profile?.effective_tier || profile?.tier || "free").toLowerCase();
  const familySlots = profile?.family_slots ?? 0;
  const MAX_MEMBERS = 3;

  // Determine if current user is the owner of a family group
  const ownerRow = members.find((m) => m.inviter_user_id === profile?.id);
  const memberRow = members.find((m) => m.invitee_user_id === profile?.id);
  const isOwner = !!ownerRow || members.length === 0; // no rows = potential owner
  const acceptedCount = members.filter(
    (m) => m.inviter_user_id === profile?.id && m.status !== "declined"
  ).length;
  const canAdd = isOwner && acceptedCount < familySlots && acceptedCount < MAX_MEMBERS;
  const canBuyMore = isOwner && acceptedCount >= familySlots && familySlots < MAX_MEMBERS;

  const loadMembers = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { data } = await (supabase as unknown as {
      from: (t: string) => {
        select: (q: string) => {
          or: (q: string) => {
            neq: (col: string, val: string) => Promise<{ data: unknown[] | null }>;
          };
        };
      };
    })
      .from("family_members")
      .select(
        `id, inviter_user_id, invitee_user_id, status,
         inviter:profiles!family_members_inviter_user_id_fkey(id,display_name,avatar_url,social_id),
         invitee:profiles!family_members_invitee_user_id_fkey(id,display_name,avatar_url,social_id)`
      )
      .or(`inviter_user_id.eq.${profile.id},invitee_user_id.eq.${profile.id}`) as unknown as {
      data: Array<{
        id: string;
        inviter_user_id: string;
        invitee_user_id: string;
        status: "pending" | "accepted" | "declined";
        inviter: { id: string; display_name: string | null; avatar_url: string | null; social_id: string | null };
        invitee: { id: string; display_name: string | null; avatar_url: string | null; social_id: string | null };
      }> | null;
    };

    const rows = (data ?? [])
      .filter((r) => r.status !== "declined")
      .map((r) => ({
        id: r.id,
        inviter_user_id: r.inviter_user_id,
        invitee_user_id: r.invitee_user_id,
        status: r.status,
        peer:
          r.inviter_user_id === profile.id
            ? r.invitee
            : r.inviter,
      }));
    setMembers(rows);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => { if (isOpen) loadMembers(); }, [isOpen, loadMembers]);

  async function removeMember(rowId: string) {
    const { error } = await (supabase as never)
      .from("family_members")
      .delete()
      .eq("id", rowId)
      .eq("inviter_user_id", profile?.id);
    if (error) { toast.error("Could not remove member."); return; }
    toast.success("Member removed.");
    loadMembers();
  }

  async function leaveFamily() {
    if (!memberRow) return;
    const { error } = await (supabase as never)
      .from("family_members")
      .delete()
      .eq("id", memberRow.id)
      .eq("invitee_user_id", profile?.id);
    if (error) { toast.error("Could not leave family."); return; }
    toast.success("You have left the family.");
    if (fetchProfile && profile?.id) await fetchProfile(profile.id);
    onClose();
  }

  const features = tier === "gold" ? [...FEATURES_BASE, ...FEATURES_GOLD] : FEATURES_BASE;
  const ownerMembers = members.filter((m) => m.inviter_user_id === profile?.id);
  const linkedIds = ownerMembers.map((m) => m.invitee_user_id);

  return (
    <>
      <GlassSheet isOpen={isOpen} onClose={onClose} title="Family Account">
        <div className="px-4 pb-6 space-y-3">
          {/* Tier / slot subtitle — owner only */}
          {isOwner && (
            <p className="text-[12px] text-[var(--text-secondary)] -mt-1">
              {tier.charAt(0).toUpperCase() + tier.slice(1)} ·{" "}
              {acceptedCount} of {Math.min(familySlots, MAX_MEMBERS)} slot
              {familySlots !== 1 ? "s" : ""} used
            </p>
          )}

          {/* Owner row */}
          <div className="flex items-center gap-3 py-3 px-1">
            <img
              src={profile?.avatar_url ?? "/placeholder.svg"}
              alt="you"
              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-[500] text-[var(--text-primary)] truncate">
                {profile?.display_name}
              </p>
              <span className="text-[11px] text-[var(--text-tertiary)]">
                {isOwner ? "You · Owner" : ""}
              </span>
            </div>
          </div>

          {/* Member rows */}
          {loading ? (
            <p className="text-[13px] text-[var(--text-tertiary)] py-2">Loading…</p>
          ) : (
            ownerMembers.map((m) => (
              <MemberRow key={m.id} member={m} isOwner={true} onRemove={removeMember} />
            ))
          )}

          {/* Member view: show owner */}
          {memberRow && (
            <div className="flex items-center gap-3 py-3 px-1">
              <img
                src={memberRow.peer.avatar_url ?? "/placeholder.svg"}
                alt={memberRow.peer.display_name ?? ""}
                className="w-9 h-9 rounded-full object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-[500] text-[var(--text-primary)] truncate">
                  {memberRow.peer.display_name}
                </p>
                <span className="text-[11px] text-[var(--text-tertiary)]">Family Owner</span>
              </div>
            </div>
          )}

          {ownerMembers.length === 0 && !loading && isOwner && (
            <p className="text-[13px] text-[var(--text-tertiary)] py-1">No members yet.</p>
          )}

          {/* Add / slot upsell */}
          {canAdd && (
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center justify-center w-9 h-9 rounded-full border-[1.5px]"
              style={{ borderColor: BRAND_BLUE, color: BRAND_BLUE }}
              aria-label="Add member"
            >
              <Plus size={16} strokeWidth={2.5} />
            </button>
          )}
          {canBuyMore && (
            <button
              onClick={() => setShowSlotModal(true)}
              className="flex items-center gap-2 text-[13px] font-[500] py-2"
              style={{ color: BRAND_BLUE }}
            >
              <ShoppingBag size={15} strokeWidth={1.75} />
              Member slot
            </button>
          )}

          {/* What members get */}
          {isOwner && familySlots > 0 && (
            <div className="mt-2 rounded-[14px] overflow-hidden border border-[rgba(0,0,0,0.06)]"
              style={{ background: "rgba(255,255,255,0.7)" }}>
              <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)]">
                <p className="text-[12px] font-[600] text-[var(--text-primary)]">
                  What members get
                </p>
              </div>
              <div className="px-4 py-3 space-y-2">
                {features.map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <Check size={12} strokeWidth={2.5} style={{ color: BRAND_BLUE }} />
                    <span className="text-[12px] text-[var(--text-primary)]">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Leave family (member view) */}
          {memberRow && (
            <button
              onClick={leaveFamily}
              className="w-full text-center text-[13px] font-[500] text-red-500 pt-2"
            >
              Leave Family
            </button>
          )}
        </div>
      </GlassSheet>

      <FamilySearchDrawer
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        onInviteSent={loadMembers}
        linkedIds={linkedIds}
      />
      <SharePerksModal
        isOpen={showSlotModal}
        onClose={() => setShowSlotModal(false)}
        tier={tier}
      />
    </>
  );
}
```

**Step 3: Commit**
```bash
git add src/components/monetization/ManageFamilySheet.tsx
git commit -m "feat(family): ManageFamilySheet — owner/member views, swipe-delete, info card"
```

---

### Task 5: Wire into `Settings.tsx`

**Files:**
- Modify: `src/pages/Settings.tsx`

**Step 1: Read relevant section**
```
Read src/pages/Settings.tsx lines 1-30 (imports)
Read src/pages/Settings.tsx lines 295-320 (Manage Membership InsetPanel)
```

**Step 2: Add import at top of imports block**
```tsx
import { ManageFamilySheet } from "@/components/monetization/ManageFamilySheet";
import { SharePerksModal } from "@/components/monetization/SharePerksModal";
import { ShoppingBag, Users } from "lucide-react";
```
(If `Users` or `ShoppingBag` already imported from lucide-react, just add the missing ones.)

**Step 3: Add state near top of component**
```tsx
const [familySheetOpen, setFamilySheetOpen] = useState(false);
const [slotModalOpen, setSlotModalOpen] = useState(false);
```

**Step 4: Add row inside the Membership InsetPanel, after the `Manage Membership` InsetRow**

Find this block in Settings.tsx:
```tsx
<InsetPanel>
  <InsetRow
    label="Manage Membership"
    variant="nav"
    onClick={() => navigate("/premium")}
  />
</InsetPanel>
```

Replace with:
```tsx
<InsetPanel>
  <InsetRow
    label="Manage Membership"
    variant="nav"
    onClick={() => navigate("/premium")}
  />
  <InsetDivider />
  <InsetRow
    label="Family Account"
    icon={<Users size={16} strokeWidth={1.75} />}
    variant="nav"
    trailingSlot={
      (profile?.family_slots ?? 0) > 0 ? (
        <span className="text-[11px] font-[600] px-2 py-0.5 rounded-full bg-[var(--surface-neu)] text-[var(--text-secondary)]">
          {Math.min(
            members.filter((m: { inviter_user_id: string; status: string }) =>
              m.inviter_user_id === profile?.id && m.status !== "declined"
            ).length,
            3
          )}{" "}
          /{" "}
          {Math.min(profile?.family_slots ?? 0, 3)}
        </span>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setSlotModalOpen(true); }}
          className="flex items-center gap-1 text-[11px] font-[500] text-[var(--text-secondary)]"
        >
          <ShoppingBag size={12} strokeWidth={1.75} />
          Member slot
        </button>
      )
    }
    onClick={() => setFamilySheetOpen(true)}
  />
</InsetPanel>
```

> **Note:** The `members` state for the trailing chip is not pre-loaded in Settings. For simplicity, derive count from a quick Supabase query on mount, OR use a simpler approach: just show `0 / {slots}` statically — the real count is shown inside the sheet. Replace the complex filter above with:

```tsx
trailingSlot={
  (profile?.family_slots ?? 0) > 0 ? (
    <span className="text-[11px] font-[600] px-2 py-0.5 rounded-full bg-[var(--surface-neu)] text-[var(--text-secondary)]">
      — / {Math.min(profile?.family_slots ?? 0, 3)}
    </span>
  ) : (
    <button
      onClick={(e) => { e.stopPropagation(); setSlotModalOpen(true); }}
      className="flex items-center gap-1 text-[11px] font-[500] text-[var(--text-secondary)]"
    >
      <ShoppingBag size={12} strokeWidth={1.75} />
      Member slot
    </button>
  )
}
```
(The exact count `X / Y` is shown inside ManageFamilySheet once opened — no need to pre-fetch.)

**Step 5: Add components at bottom of Settings return (before closing fragment)**
```tsx
<ManageFamilySheet open={familySheetOpen} onClose={() => setFamilySheetOpen(false)} />
<SharePerksModal
  isOpen={slotModalOpen}
  onClose={() => setSlotModalOpen(false)}
  tier={String(effectiveTier).toLowerCase()}
/>
```

**Step 6: Commit**
```bash
git add src/pages/Settings.tsx
git commit -m "feat(settings): add Family Account row below Manage Membership"
```

---

### Task 6: Update `Premium.tsx` — Share Perks subtitle + Add-ons blue

**Files:**
- Modify: `src/pages/Premium.tsx`

**Step 1: Read the addons array and Add-ons section**
```
Read src/pages/Premium.tsx lines 100-115  (sharePerks addon def)
Read src/pages/Premium.tsx lines 370-430  (Add-ons render section, look for "Add-ons" text)
```

**Step 2: Change `subtitle` of sharePerks addon**

Find:
```ts
subtitle: "Mirror tier to 2 members",
```
Replace with:
```ts
subtitle: "Mirrors tier's access to exclusive features",
```

**Step 3: Find "Add-ons" section header / button text and add blue color**

Look for the element rendering "Add-ons" (likely a `<h3>` or `<button>` or toggle). Add `style={{ color: "#2145CF" }}` or `className` with blue text. The exact element will be visible from the read — look for text content `"Add-ons"`.

**Step 4: Commit**
```bash
git add src/pages/Premium.tsx
git commit -m "fix(premium): Share Perks subtitle update + Add-ons blue"
```

---

### Task 7: Update `Subscription.tsx` — Add-ons label blue

**Files:**
- Modify: `src/pages/Subscription.tsx`

**Step 1: Read**
```
Read src/pages/Subscription.tsx — search for "Add-ons" text
```

**Step 2: Add `style={{ color: "#2145CF" }}` to the "Add-ons" label element**

**Step 3: Commit**
```bash
git add src/pages/Subscription.tsx
git commit -m "fix(subscription): Add-ons label blue"
```

---

### Task 8: Verify + final commit

**Step 1: Run lint**
```bash
npm run lint
```
Expected: 0 errors (pre-existing warnings only)

**Step 2: Run build**
```bash
npm run build
```
Expected: ✓ built (chunk-size advisory only)

**Step 3: Manual smoke test via preview server**
```bash
# Server already running on port 8080, or:
# Use preview_start "Pet Huddle Dev"
```

Verify:
- [ ] Settings → Family Account row below Manage Membership
- [ ] Gold user: shows slot chip (e.g., `— / 1`)
- [ ] Free/Plus (no slots): shows 🛍 Member slot button → SharePerksModal opens
- [ ] Tapping Family Account row → ManageFamilySheet opens
- [ ] `[+]` button visible when slots available
- [ ] Search drawer opens, shows results for name/social_id query
- [ ] Share Perks subtitle reads "Mirrors tier's access to exclusive features"
- [ ] Add-ons text is blue in Premium + Subscription pages
- [ ] Gold tier info card shows 5 items; Plus shows 3

**Step 4: Final commit if any fixup needed**
```bash
git add -p
git commit -m "fix(family): post-verification fixups"
```
