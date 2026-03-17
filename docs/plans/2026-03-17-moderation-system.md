# Moderation System + UI Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a complete user-report-to-auto-enforcement moderation pipeline, fix 9 outstanding ChatDialogue/Chats UI items, and add group invite notifications.

**Architecture:** New `user_reports` table receives scored reports; a Postgres function `process_user_report()` rolls 30-day risk scores and writes enforcement actions directly to `profiles.account_status`; frontend gates render wall screens or restricted banners based on that column. The existing `support-request` edge function is extended to fire emails for every report. All quick UI fixes are applied in Phase A before any DB work begins.

**Tech Stack:** React 18 + TypeScript + Vite, Tailwind + shadcn/ui Radix, Supabase Postgres + RLS + Edge Functions (Deno), Framer Motion, Resend API, Lucide icons.

---

## AUDIT FINDINGS (context for implementer)

| # | Finding | File / Line |
|---|---------|------------|
| Report modal title | "Report user" not "Report" | `ChatDialogue.tsx:1004` |
| Report DB | Inserts to `support_requests` with raw JSON, no scoring | `ChatDialogue.tsx:641` |
| No moderation cols | `profiles` has no `account_status`, `restriction_expires_at` | migrations confirm |
| No `user_reports` table | Doesn't exist in any migration | confirmed |
| No duplicate prevention | None | confirmed |
| No account walls | No suspended/restricted UI anywhere | confirmed |
| Discover gating | Only `non_social` filter, no account_status filter | `Discover.tsx:265-269` |
| Paw-Vibe in group | No `isGroup` guard | `ChatDialogue.tsx:788` |
| Back button | Always goes to `?tab=chats` for groups too | `ChatDialogue.tsx:679` |
| "Add" button text | NeuButton shows "Add" text not UserPlus icon | `Chats.tsx:4392` |
| No verify gate | Add/remove member has no verification gate | `Chats.tsx:4380` |
| group_invite type | Already in notifications check constraint | confirmed |
| Report email | handleReportSubmit never calls edge function | `ChatDialogue.tsx:641` |
| support-request fn | `supportEmailTo` defaults to wrong address | `support-request/index.ts:7` |

---

## Phase A — ChatDialogue + Chats Quick Fixes

### Task A1: Remove Paw-Vibe Check card from group chats

**Files:**
- Modify: `src/pages/ChatDialogue.tsx:788-803`

**Step 1: Read the file at line 788**

Confirm the block reads:
```tsx
{messages.length === 0 ? (
  <div className="mt-auto rounded-[18px] border ...">
    <p className="text-sm font-semibold text-[#4F5677]">Paw-Vibe Check?</p>
    ...
  </div>
) : (
```

**Step 2: Add `isGroup` guard so the card only shows for direct chats**

Change:
```tsx
{messages.length === 0 ? (
```
To:
```tsx
{messages.length === 0 && !isGroup ? (
```

**Step 3: Build**

Run: `npm run build`
Expected: ✅ no errors

**Step 4: Commit**

```bash
git add src/pages/ChatDialogue.tsx
git commit -m "fix: hide Paw-Vibe Check in group chats"
```

---

### Task A2: Fix back button in group chat to go to Groups tab

**Files:**
- Modify: `src/pages/ChatDialogue.tsx:679`

**Step 1: Read line ~679**

Current:
```tsx
<button onClick={() => navigate("/chats?tab=chats")} className="rounded-full p-2 hover:bg-muted" aria-label="Back">
```

**Step 2: Make navigation conditional on `isGroup`**

```tsx
<button
  onClick={() => navigate(isGroup ? "/chats?tab=groups" : "/chats?tab=chats")}
  className="rounded-full p-2 hover:bg-muted"
  aria-label="Back"
>
```

**Step 3: Build + commit**

```bash
npm run build
git add src/pages/ChatDialogue.tsx
git commit -m "fix: group chat back button navigates to Groups tab"
```

---

### Task A3: Replace "Add" text with UserPlus icon in group manage dialog

**Files:**
- Modify: `src/pages/Chats.tsx:4377-4393`

**Step 1: Read lines 4377-4394**

Current button:
```tsx
<NeuButton
  size="sm"
  className="h-6 text-[10px] px-2"
  onClick={async () => { ... }}
>
  Add
</NeuButton>
```

**Step 2: Replace with icon-only button**

```tsx
<NeuButton
  size="sm"
  className="h-7 w-7 p-0 flex items-center justify-center"
  onClick={async () => { ... }}
  aria-label="Add member"
>
  <UserPlus className="h-3.5 w-3.5" />
</NeuButton>
```

**Step 3: Build + commit**

```bash
npm run build
git add src/pages/Chats.tsx
git commit -m "fix: replace Add text with UserPlus icon in group member list"
```

---

### Task A4: Verification gate on group add/remove actions

**Files:**
- Modify: `src/pages/Chats.tsx` (add/remove member onClick handlers)

**Step 1: Confirm `profile.is_verified` is available**

`profile` comes from `useAuth()` and has `is_verified` boolean. The page already has a `groupVerifyGateOpen` state and dialog at line ~4407.

**Step 2: Add verification check to the "Add" onClick (line ~4380)**

Find the add member onClick and prepend:
```tsx
onClick={async () => {
  if (!profile?.is_verified) {
    setGroupVerifyGateOpen(true);
    return;
  }
  if (!profile?.id || !groupManageId) return;
  // ... rest of existing add logic
}}
```

**Step 3: Add the same check to the "Remove" onClick (line ~4324)**

```tsx
onClick={async () => {
  if (!profile?.is_verified) {
    setGroupVerifyGateOpen(true);
    return;
  }
  try {
    // ... existing remove logic
  }
}}
```

**Step 4: Build + commit**

```bash
npm run build
git add src/pages/Chats.tsx
git commit -m "fix: gate add/remove group members behind identity verification"
```

---

### Task A5: Report modal headline → "Report"

**Files:**
- Modify: `src/pages/ChatDialogue.tsx:1004`

**Step 1: Change title**

```tsx
// Before:
<DialogTitle>Report user</DialogTitle>
// After:
<DialogTitle>Report</DialogTitle>
```

**Step 2: Build + commit**

```bash
npm run build
git add src/pages/ChatDialogue.tsx
git commit -m "fix: report modal headline changed to Report"
```

---

### Task A6: Group info sheet — extend to footer + swipeable media album

**Files:**
- Modify: `src/pages/ChatDialogue.tsx:1098-1191` (GroupInfoSheet)

**Step 1: Read the current GroupInfoSheet (lines 1097-1191)**

**Step 2: Replace static grid with horizontal swipeable row and extend sheet height**

Change `SheetContent`:
```tsx
<SheetContent side="bottom" className="rounded-t-2xl h-[92vh] flex flex-col overflow-hidden pb-safe">
```

Replace the media section:
```tsx
{/* Media — horizontal scroll album */}
<div className="mb-5">
  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
    Media {groupMediaUrls.length > 0 ? `(${groupMediaUrls.length})` : ""}
  </p>
  {groupMediaUrls.length > 0 ? (
    <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
      {groupMediaUrls.map((url, idx) => (
        <a
          key={idx}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex-none w-24 h-24 snap-start overflow-hidden rounded-xl"
        >
          <img src={url} alt="" className="h-full w-full object-cover" />
        </a>
      ))}
    </div>
  ) : (
    <div className="flex items-center gap-2 text-muted-foreground">
      <ImageIcon className="h-4 w-4" />
      <span className="text-sm">No media shared yet</span>
    </div>
  )}
</div>
```

Also increase media collection limit (currently `slice(0, 12)`) to all messages:
```tsx
// In the MoreVertical onClick handler, change:
setGroupMediaUrls(media.slice(0, 12));
// To:
setGroupMediaUrls(media);
```

**Step 3: Build + commit**

```bash
npm run build
git add src/pages/ChatDialogue.tsx
git commit -m "feat: group info sheet extends to footer with swipeable media album"
```

---

### Task A7: Group invite notification + acceptance popup

**Files:**
- Modify: `src/pages/Chats.tsx` (load notifications on mount, acceptance popup state + dialog)
- No new migration needed (`group_invite` already in notifications type check)

**Step 1: Add state for invite popup**

In the state declarations block in Chats.tsx, add:
```tsx
const [pendingGroupInvite, setPendingGroupInvite] = useState<{
  notifId: string;
  chatId: string;
  chatName: string;
  inviterName: string;
} | null>(null);
```

**Step 2: Load pending group_invite notifications on mount**

In the main `useEffect` that loads chats data (or a dedicated effect), add:
```tsx
// Load pending group invites
const { data: invites } = await supabase
  .from("notifications")
  .select("id, data, sender_id, profiles!notifications_sender_id_fkey(display_name)")
  .eq("user_id", profile.id)
  .eq("type", "group_invite")
  .eq("is_read", false)
  .order("created_at", { ascending: false })
  .limit(1);

if (invites && invites.length > 0) {
  const inv = invites[0];
  const senderProfile = Array.isArray(inv.profiles) ? inv.profiles[0] : inv.profiles;
  setPendingGroupInvite({
    notifId: inv.id,
    chatId: (inv.data as { chat_id?: string })?.chat_id || "",
    chatName: (inv.data as { chat_name?: string })?.chat_name || "a group",
    inviterName: (senderProfile as { display_name?: string })?.display_name || "Someone",
  });
}
```

**Step 3: Add the acceptance popup Dialog**

After the existing group verify gate dialog (line ~4407), add:
```tsx
<Dialog open={!!pendingGroupInvite} onOpenChange={() => setPendingGroupInvite(null)}>
  <DialogContent className="max-w-sm">
    <DialogHeader>
      <DialogTitle>Group invite</DialogTitle>
      <DialogDescription>
        {pendingGroupInvite?.inviterName} invited you to join{" "}
        <strong>{pendingGroupInvite?.chatName}</strong>.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter className="!flex-row gap-2 pt-2">
      <NeuButton
        variant="secondary"
        size="lg"
        className="flex-1 min-w-0"
        onClick={async () => {
          // Mark as read / declined
          if (pendingGroupInvite) {
            await supabase
              .from("notifications")
              .update({ is_read: true })
              .eq("id", pendingGroupInvite.notifId);
          }
          setPendingGroupInvite(null);
        }}
      >
        Decline
      </NeuButton>
      <NeuButton
        size="lg"
        className="flex-1 min-w-0"
        onClick={async () => {
          if (!pendingGroupInvite || !profile?.id) return;
          try {
            await supabase.from("chat_room_members").insert({
              chat_id: pendingGroupInvite.chatId,
              user_id: profile.id,
            });
            await supabase
              .from("notifications")
              .update({ is_read: true })
              .eq("id", pendingGroupInvite.notifId);
            toast.success(`Joined ${pendingGroupInvite.chatName}`);
            // Reload groups
            void loadGroupsData();
          } catch {
            toast.error("Unable to join group right now.");
          } finally {
            setPendingGroupInvite(null);
          }
        }}
      >
        Join
      </NeuButton>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Step 4: Wire group invite sending**

When a user adds a member in the group manage dialog (existing add logic), after the `chat_room_members.insert` succeeds, also insert a notification:
```tsx
// After successful insert:
await supabase.from("notifications").insert({
  user_id: u.id,
  sender_id: profile.id,
  type: "group_invite",
  title: `${profile.display_name || "Someone"} added you to a group`,
  body: `You've been added to ${groups.find((g) => g.id === groupManageId)?.name || "a group"}`,
  data: {
    chat_id: groupManageId,
    chat_name: groups.find((g) => g.id === groupManageId)?.name || "",
  },
  is_read: false,
});
```

**Step 5: Build + commit**

```bash
npm run build
git add src/pages/Chats.tsx
git commit -m "feat: group invite notification with join/decline popup on Groups tab"
```

---

## Phase B — Report Email via Resend

### Task B1: Update support-request edge function

**Files:**
- Modify: `supabase/functions/support-request/index.ts`

**Step 1: Read the file**

Current: `supportEmailTo` defaults to `"kuriocollectives"`, no source context in subject.

**Step 2: Update the function to accept `source` param and send to support@huddle.pet**

```typescript
// Change line 7:
const supportEmailTo = Deno.env.get("SUPPORT_EMAIL_TO") || "support@huddle.pet";

// In the serve handler, update the destructure:
const { userId, subject, message, email, source } = await req.json();

// Update the email subject line sent to Resend:
const emailSubject = source
  ? `REPORT (${source}) — ${subject || "Huddle Report"}`
  : subject || "Huddle Support Request";

// Update the fetch body subject field:
subject: emailSubject,
```

**Step 3: Deploy edge function**

```bash
npx supabase functions deploy support-request --project-ref <your-ref>
```

**Step 4: Commit**

```bash
git add supabase/functions/support-request/index.ts
git commit -m "feat: report email to support@huddle.pet with source context in subject"
```

---

### Task B2: Call edge function from handleReportSubmit

**Files:**
- Modify: `src/pages/ChatDialogue.tsx` — `handleReportSubmit` (lines 623-660)

**Step 1: After the existing `supabase.from("support_requests").insert(...)` succeeds, add edge function call**

```tsx
// Call the edge function to send email
await supabase.functions.invoke("support-request", {
  body: {
    userId: profile.id,
    subject: `Report: ${counterpart?.displayName || counterpart?.id}`,
    message: JSON.stringify(payload),
    email: profile.email || null,
    source: isGroup ? "Group Chat" : "Chat",
  },
});
```

Note: The edge function also inserts to `support_requests` — to avoid double-insert, remove the direct `supabase.from("support_requests").insert(...)` call and let the edge function handle it.

**Step 2: Revised handleReportSubmit (replace the whole function body)**

```tsx
const handleReportSubmit = useCallback(async () => {
  if (!profile?.id || !counterpart?.id) return;
  const selectedReasons = Array.from(reportReasons);
  if (selectedReasons.length === 0) {
    toast.error("Select at least one reason.");
    return;
  }
  setReportSubmitting(true);
  try {
    const attachments = await uploadFilesToNotices(reportUploads, "reports");
    const payload = {
      target_user_id: counterpart.id,
      room_id: roomId,
      reasons: selectedReasons,
      other: selectedReasons.includes("Other") ? reportOther.trim() : "",
      details: reportDetails.trim(),
      attachments: attachments.map((item) => item.url),
    };
    const { error } = await supabase.functions.invoke("support-request", {
      body: {
        userId: profile.id,
        subject: `Report: ${counterpart.displayName || counterpart.id}`,
        message: JSON.stringify(payload),
        email: profile.email || null,
        source: isGroup ? "Group Chat" : "Chat",
      },
    });
    if (error) throw error;
    toast.success("Report sent");
    setReportOpen(false);
    setReportReasons(new Set());
    setReportOther("");
    setReportDetails("");
    setReportUploads([]);
  } catch {
    toast.error("Unable to submit report right now.");
  } finally {
    setReportSubmitting(false);
  }
}, [counterpart, isGroup, profile, reportDetails, reportOther, reportReasons, reportUploads, roomId, uploadFilesToNotices]);
```

**Step 3: Build + commit**

```bash
npm run build
git add src/pages/ChatDialogue.tsx
git commit -m "feat: report submit calls edge function, email to support@huddle.pet with source context"
```

---

## Phase C — Moderation Database Schema

### Task C1: Create migration file for moderation tables

**Files:**
- Create: `supabase/migrations/20260317150000_moderation_system.sql`

**Step 1: Create the migration**

```sql
-- ── Moderation System ────────────────────────────────────────────────────────
-- Tables: user_reports
-- Columns added to profiles: account_status, restriction_expires_at, suspension_expires_at
-- Function: process_user_report()

-- ── 1. account_status enum ──────────────────────────────────────────────────
do $$ begin
  create type public.account_status_enum as enum ('active','restricted','suspended','removed');
exception when duplicate_object then null; end $$;

-- ── 2. Add columns to profiles ──────────────────────────────────────────────
alter table public.profiles
  add column if not exists account_status public.account_status_enum
    not null default 'active',
  add column if not exists restriction_expires_at timestamptz,
  add column if not exists suspension_expires_at timestamptz;

-- ── 3. user_reports table ───────────────────────────────────────────────────
create table if not exists public.user_reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references public.profiles(id) on delete cascade,
  target_id       uuid not null references public.profiles(id) on delete cascade,
  categories      text[] not null default '{}',
  score           int  not null default 0,
  details         text,
  attachment_urls text[] not null default '{}',
  is_scored       boolean not null default true,
  window_start    timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- Prevent duplicate scored reports within a 30-day window per reporter→target pair
create unique index if not exists user_reports_dedup_idx
  on public.user_reports (reporter_id, target_id)
  where is_scored = true
    and window_start > (now() - interval '30 days');

-- ── 4. RLS on user_reports ──────────────────────────────────────────────────
alter table public.user_reports enable row level security;

-- Reporter can insert their own report
create policy "user_reports_insert"
  on public.user_reports
  for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- Reporter can read their own reports
create policy "user_reports_select_own"
  on public.user_reports
  for select
  to authenticated
  using (reporter_id = auth.uid());

-- ── 5. Category weight helper ────────────────────────────────────────────────
-- Weights: spam_or_fake=1, inappropriate=2, harassment=3, impersonation=4,
--          unsafe=5, scam=5, hate=6, other=1
create or replace function public.report_category_weight(category text)
returns int
language sql
immutable
as $$
  select case category
    when 'Spam or fake account'                           then 1
    when 'Inappropriate or offensive content'             then 2
    when 'Harassment or bullying'                         then 3
    when 'Impersonation or stolen photos'                 then 4
    when 'Unsafe or harmful behavior (online or in-person)' then 5
    when 'Scams, money requests, or promotions'           then 5
    when 'Hate, discrimination, or threats'               then 6
    when 'Other'                                          then 1
    else 1
  end;
$$;

-- ── 6. process_user_report() ─────────────────────────────────────────────────
create or replace function public.process_user_report(
  p_target_id      uuid,
  p_categories     text[],
  p_details        text      default null,
  p_attachment_urls text[]   default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter_id        uuid := auth.uid();
  v_base_score         int;
  v_bonus              int := 0;
  v_final_score        int;
  v_rolling_risk       int;
  v_existing_report_id uuid;
  v_report_id          uuid;
  v_new_status         public.account_status_enum;
  v_expires_at         timestamptz;
  v_immediate          boolean := false;
begin
  if v_reporter_id is null then
    raise exception 'auth_required';
  end if;
  if p_target_id is null or p_target_id = v_reporter_id then
    raise exception 'invalid_target';
  end if;
  if array_length(p_categories, 1) is null then
    raise exception 'categories_required';
  end if;

  -- Base score = weight of highest-severity selected category
  select max(public.report_category_weight(c))
  into v_base_score
  from unnest(p_categories) as c;

  v_base_score := coalesce(v_base_score, 1);

  -- Bonus: +2 if attachment, +1 if details ≥ 20 chars
  if array_length(p_attachment_urls, 1) > 0 then v_bonus := v_bonus + 2; end if;
  if length(coalesce(p_details,'')) >= 20        then v_bonus := v_bonus + 1; end if;

  v_final_score := least(v_base_score + v_bonus, 8);

  -- Immediate action: unsafe/scam/hate AND has attachment
  if array_length(p_attachment_urls, 1) > 0 and (
    'Unsafe or harmful behavior (online or in-person)' = any(p_categories) or
    'Scams, money requests, or promotions'             = any(p_categories) or
    'Hate, discrimination, or threats'                 = any(p_categories)
  ) then
    v_immediate := true;
  end if;

  -- Anti-abuse: check for existing scored report from this reporter→target in last 30d
  select id into v_existing_report_id
  from public.user_reports
  where reporter_id = v_reporter_id
    and target_id   = p_target_id
    and is_scored   = true
    and window_start > (now() - interval '30 days')
  limit 1;

  if v_existing_report_id is not null then
    -- Append evidence only, do not re-score
    update public.user_reports
    set
      attachment_urls = attachment_urls || p_attachment_urls,
      details = coalesce(details, '') || E'\n---\n' || coalesce(p_details, '')
    where id = v_existing_report_id;
    return jsonb_build_object('action', 'evidence_appended', 'report_id', v_existing_report_id);
  end if;

  -- Insert scored report
  insert into public.user_reports
    (reporter_id, target_id, categories, score, details, attachment_urls, is_scored, window_start)
  values
    (v_reporter_id, p_target_id, p_categories, v_final_score, p_details, p_attachment_urls, true, now())
  returning id into v_report_id;

  -- Rolling 30-day risk for target
  select coalesce(sum(score), 0)
  into v_rolling_risk
  from public.user_reports
  where target_id  = p_target_id
    and is_scored  = true
    and window_start > (now() - interval '30 days');

  -- Determine enforcement action
  if v_immediate then
    -- Immediate: 72h suspend
    v_new_status := 'suspended';
    v_expires_at := now() + interval '72 hours';
  elsif v_rolling_risk between 5 and 6 then
    v_new_status := 'restricted';
    v_expires_at := now() + interval '24 hours';
  elsif v_rolling_risk between 7 and 8 then
    v_new_status := 'restricted';
    v_expires_at := now() + interval '72 hours';
  elsif v_rolling_risk between 9 and 11 then
    v_new_status := 'suspended';
    v_expires_at := now() + interval '7 days';
  elsif v_rolling_risk between 12 and 14 then
    v_new_status := 'suspended';
    v_expires_at := now() + interval '30 days';
  elsif v_rolling_risk >= 15 then
    v_new_status := 'removed';
    v_expires_at := null;
  end if;

  -- Apply to profile (only escalate, never de-escalate automatically)
  if v_new_status is not null then
    update public.profiles
    set
      account_status = case
        when account_status = 'removed' then 'removed'
        when account_status = 'suspended' and v_new_status = 'restricted' then 'suspended'
        else v_new_status
      end,
      restriction_expires_at = case
        when v_new_status = 'restricted' then v_expires_at
        else restriction_expires_at
      end,
      suspension_expires_at = case
        when v_new_status = 'suspended' then v_expires_at
        when v_new_status = 'removed'   then null
        else suspension_expires_at
      end
    where id = p_target_id;
  end if;

  return jsonb_build_object(
    'action',        coalesce(v_new_status::text, 'none'),
    'report_id',     v_report_id,
    'score',         v_final_score,
    'rolling_risk',  v_rolling_risk
  );
end;
$$;
grant execute on function public.process_user_report(uuid, text[], text, text[]) to authenticated;

-- ── 7. Auto-expire restriction/suspension on login ───────────────────────────
create or replace function public.expire_account_restrictions()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set
    account_status = 'active',
    restriction_expires_at = null
  where account_status = 'restricted'
    and restriction_expires_at is not null
    and restriction_expires_at < now();

  update public.profiles
  set
    account_status = 'active',
    suspension_expires_at = null
  where account_status = 'suspended'
    and suspension_expires_at is not null
    and suspension_expires_at < now();
$$;
grant execute on function public.expire_account_restrictions() to authenticated;
```

**Step 2: Apply migration to remote**

```bash
npx supabase db push --project-ref <your-ref>
```
Or via MCP: `apply_migration` with the SQL above.

**Step 3: Commit**

```bash
git add supabase/migrations/20260317150000_moderation_system.sql
git commit -m "feat: moderation system DB — user_reports, account_status, process_user_report()"
```

---

## Phase D — Report Modal Refactor + Scoring

### Task D1: Extract ReportModal component

**Files:**
- Create: `src/components/moderation/ReportModal.tsx`

**Step 1: Create the component**

```tsx
import { useCallback, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export type ReportSource = "Chat" | "Group Chat" | "Social" | "Map";

const REPORT_CATEGORIES = [
  "Spam or fake account",
  "Harassment or bullying",
  "Inappropriate or offensive content",
  "Unsafe or harmful behavior (online or in-person)",
  "Hate, discrimination, or threats",
  "Scams, money requests, or promotions",
  "Impersonation or stolen photos",
  "Other",
] as const;

type ReportCategory = (typeof REPORT_CATEGORIES)[number];

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  targetUserId: string | null;
  targetName?: string;
  source: ReportSource;
}

async function uploadReportImages(files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `reports/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("notices").upload(path, file);
    if (!error) {
      const { data } = supabase.storage.from("notices").getPublicUrl(path);
      urls.push(data.publicUrl);
    }
  }
  return urls;
}

export function ReportModal({ open, onClose, targetUserId, targetName, source }: ReportModalProps) {
  const { profile } = useAuth();
  const [reasons, setReasons] = useState<Set<ReportCategory>>(new Set());
  const [otherText, setOtherText] = useState("");
  const [details, setDetails] = useState("");
  const [uploads, setUploads] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setReasons(new Set());
    setOtherText("");
    setDetails("");
    setUploads([]);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = useCallback(async () => {
    if (!profile?.id || !targetUserId) return;
    const selectedCategories = Array.from(reasons);
    if (selectedCategories.length === 0) {
      toast.error("Select at least one reason.");
      return;
    }
    setSubmitting(true);
    try {
      const attachmentUrls = await uploadReportImages(uploads);

      // Call DB function for scoring + enforcement
      await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ error: unknown }>)(
        "process_user_report",
        {
          p_target_id:       targetUserId,
          p_categories:      selectedCategories,
          p_details:         details.trim() || null,
          p_attachment_urls: attachmentUrls,
        }
      );

      // Fire email via edge function (best-effort, don't block on error)
      supabase.functions.invoke("support-request", {
        body: {
          userId:  profile.id,
          subject: `Report: ${targetName || targetUserId}`,
          message: JSON.stringify({
            target_user_id: targetUserId,
            categories:     selectedCategories,
            other:          reasons.has("Other") ? otherText.trim() : "",
            details:        details.trim(),
            attachments:    attachmentUrls,
          }),
          email:  (profile as { email?: string }).email || null,
          source,
        },
      }).catch(() => null);

      toast.success("Report sent");
      handleClose();
    } catch {
      toast.error("Unable to submit report right now.");
    } finally {
      setSubmitting(false);
    }
  }, [details, handleClose, otherText, profile, reasons, source, targetName, targetUserId, uploads]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report</DialogTitle>
          <DialogDescription>
            Tell us what happened so we can protect the community.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            {REPORT_CATEGORIES.map((cat) => (
              <label key={cat} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reasons.has(cat)}
                  onChange={(e) => {
                    setReasons((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(cat);
                      else next.delete(cat);
                      return next;
                    });
                  }}
                />
                <span>{cat}</span>
              </label>
            ))}
          </div>
          {reasons.has("Other") && (
            <div className="form-field-rest relative flex items-center">
              <input
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="Other reason"
                className="field-input-core"
              />
            </div>
          )}
          <div className="form-field-rest relative h-auto min-h-[96px] py-3">
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Add details (optional)"
              className="field-input-core min-h-[72px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
          </div>
          <div>
            <button
              type="button"
              className="neu-icon h-10 w-10"
              onClick={() => imageInputRef.current?.click()}
              aria-label="Upload image"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                setUploads((prev) => [...prev, ...files].slice(0, 5));
                e.currentTarget.value = "";
              }}
            />
            {uploads.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {uploads.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="h-[96px] w-[96px] overflow-hidden rounded-xl bg-muted/30">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={`Upload ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="h-11 w-full rounded-full bg-brandBlue text-sm font-semibold text-white disabled:opacity-45"
          >
            {submitting ? "Sending..." : "Send report"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Build to verify no compile errors**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/components/moderation/ReportModal.tsx
git commit -m "feat: extract ReportModal component with scoring and source context"
```

---

### Task D2: Replace inline report dialog in ChatDialogue with ReportModal

**Files:**
- Modify: `src/pages/ChatDialogue.tsx`

**Step 1: Add import**

```tsx
import { ReportModal } from "@/components/moderation/ReportModal";
```

**Step 2: Remove all inline report state and the inline Dialog block**

Remove from state declarations:
- `reportReasons` (Set)
- `reportOther` (string)
- `reportDetails` (string)
- `reportUploads` (File[])
- `reportUploadPreviews`
- `reportSubmitting`
- `reportImageInputRef`

Remove the entire `handleReportSubmit` useCallback.

Remove the inline `<Dialog open={reportOpen} ...>` report modal block (lines 1001-1095).

**Step 3: Replace with ReportModal component**

After the `confirmBlock` Dialog closing tag, add:
```tsx
<ReportModal
  open={reportOpen}
  onClose={() => setReportOpen(false)}
  targetUserId={isGroup ? roomId : (counterpart?.id ?? null)}
  targetName={isGroup ? roomName : counterpart?.displayName}
  source={isGroup ? "Group Chat" : "Chat"}
/>
```

**Step 4: Remove now-unused imports**

Remove from imports: `Textarea` (if no longer used elsewhere), `uploadFilesToNotices` (if only used in report).

**Step 5: Build + lint**

```bash
npm run lint && npm run build
```

**Step 6: Commit**

```bash
git add src/pages/ChatDialogue.tsx
git commit -m "refactor: ChatDialogue uses ReportModal component"
```

---

## Phase E — Account State Enforcement

### Task E1: Refresh account status on app load and auto-expire

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

**Step 1: Read AuthContext.tsx to find where profile is loaded**

Locate the `fetchProfile` or equivalent function that reads from `profiles`.

**Step 2: After profile load, call expire function**

```tsx
// After successful profile fetch:
await supabase.rpc("expire_account_restrictions");
// Then re-fetch profile to get updated account_status
```

**Step 3: Build + commit**

```bash
npm run build
git add src/contexts/AuthContext.tsx
git commit -m "feat: auto-expire restriction/suspension on profile load"
```

---

### Task E2: Create AccountWall and RestrictedBanner components

**Files:**
- Create: `src/components/moderation/AccountWall.tsx`

```tsx
import restrictedImg from "@/assets/Notifications/Restricted.jpg";

interface AccountWallProps {
  status: "suspended" | "removed";
  expiresAt?: string | null;
}

export function AccountWall({ status, expiresAt }: AccountWallProps) {
  const isRemoved = status === "removed";
  const expiryLabel = expiresAt
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short" }).format(new Date(expiresAt))
    : null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background p-6 text-center">
      <img
        src={restrictedImg}
        alt=""
        className="mb-6 h-48 w-48 object-contain opacity-80"
      />
      <h1 className="text-xl font-bold text-brandText mb-2">
        {isRemoved ? "Account removed" : "Account suspended"}
      </h1>
      <p className="text-sm text-muted-foreground mb-1 max-w-xs">
        {isRemoved
          ? "Your account has been permanently removed for violating community guidelines."
          : "Your account has been temporarily suspended for violating community guidelines."}
      </p>
      {expiryLabel && !isRemoved && (
        <p className="text-xs text-muted-foreground mb-4">
          Suspension lifts on {expiryLabel}.
        </p>
      )}
      <a
        href={`mailto:support@huddle.pet?subject=${encodeURIComponent(
          isRemoved ? "Account Removed — Appeal" : "Account Suspended — Appeal"
        )}`}
        className="mt-4 rounded-full bg-brandBlue px-6 py-3 text-sm font-semibold text-white"
      >
        Contact Support
      </a>
    </div>
  );
}
```

**Files:**
- Create: `src/components/moderation/RestrictedBanner.tsx`

```tsx
interface RestrictedBannerProps {
  expiresAt?: string | null;
}

export function RestrictedBanner({ expiresAt }: RestrictedBannerProps) {
  const expiryLabel = expiresAt
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(expiresAt))
    : null;

  return (
    <div className="sticky top-0 z-50 w-full bg-amber-500 px-4 py-2 text-center text-xs font-medium text-white">
      Your account is restricted.{expiryLabel ? ` Access restores on ${expiryLabel}.` : ""}{" "}
      <a
        href="mailto:support@huddle.pet?subject=Account%20Restricted%20%E2%80%94%20Appeal"
        className="underline"
      >
        Contact support
      </a>
    </div>
  );
}
```

**Step: Build + commit**

```bash
npm run build
git add src/components/moderation/AccountWall.tsx src/components/moderation/RestrictedBanner.tsx
git commit -m "feat: AccountWall and RestrictedBanner components"
```

---

### Task E3: Gate ProtectedRoute on account_status

**Files:**
- Modify: `src/App.tsx` or wherever `ProtectedRoute` is defined

**Step 1: Read `src/components/ProtectedRoute.tsx` or `App.tsx` to find ProtectedRoute**

**Step 2: Import AccountWall**

```tsx
import { AccountWall } from "@/components/moderation/AccountWall";
```

**Step 3: Inside ProtectedRoute, after profile loads, render wall if status is suspended/removed**

```tsx
const accountStatus = (profile as { account_status?: string })?.account_status;
const suspensionExpires = (profile as { suspension_expires_at?: string | null })?.suspension_expires_at;

if (accountStatus === "removed") {
  return <AccountWall status="removed" />;
}
if (accountStatus === "suspended") {
  return <AccountWall status="suspended" expiresAt={suspensionExpires} />;
}
```

**Step 4: Build + commit**

```bash
npm run build
git add src/App.tsx  # or ProtectedRoute.tsx
git commit -m "feat: ProtectedRoute renders AccountWall for suspended/removed accounts"
```

---

### Task E4: Add RestrictedBanner to app layout + block actions for restricted users

**Files:**
- Modify: `src/App.tsx` or the main layout component wrapping all pages

**Step 1: Import RestrictedBanner**

```tsx
import { RestrictedBanner } from "@/components/moderation/RestrictedBanner";
```

**Step 2: Render banner conditionally at top of layout**

```tsx
const accountStatus = (profile as { account_status?: string })?.account_status;
const restrictionExpires = (profile as { restriction_expires_at?: string | null })?.restriction_expires_at;

// Inside JSX, before children/Outlet:
{accountStatus === "restricted" && (
  <RestrictedBanner expiresAt={restrictionExpires} />
)}
```

**Step 3: Block write actions for restricted users with a toast**

Create a reusable helper:
```tsx
// src/lib/accountGuard.ts
export function assertNotRestricted(accountStatus?: string): boolean {
  if (accountStatus === "restricted") {
    import("sonner").then(({ toast }) => {
      toast.error("Your account is restricted. Read-only access until restriction lifts.");
    });
    return false;
  }
  return true;
}
```

**Step 4: Build + commit**

```bash
npm run build
git add src/App.tsx src/lib/accountGuard.ts src/components/moderation/RestrictedBanner.tsx
git commit -m "feat: persistent RestrictedBanner in layout + accountGuard helper"
```

---

### Task E5: Filter Discover to exclude non-active accounts

**Files:**
- Modify: `src/pages/Discover.tsx:265-269`

**Step 1: Read lines 260-275 of Discover.tsx**

**Step 2: Add account_status filter to the fallback profiles query**

```tsx
// Existing query:
.from("profiles")
.select("id, display_name, ...")
.in("id", fallbackIds)
.or("non_social.is.null,non_social.eq.false")

// Add after the .or():
.or("account_status.is.null,account_status.eq.active")
```

**Step 3: Build + commit**

```bash
npm run build
git add src/pages/Discover.tsx
git commit -m "feat: Discover excludes restricted/suspended/removed profiles"
```

---

## Phase F — Final Audit

### Task F1: Lint + build clean check

```bash
npm run lint && npm run build
```
Expected: ✅ zero errors (pre-existing chunk size advisory is OK)

### Task F2: Manual smoke test checklist

1. **Paw-Vibe**: Open a group chat with 0 messages → no card visible. Open direct chat with 0 messages → card visible.
2. **Back button**: In group chat, tap back → lands on Groups tab. In direct chat, tap back → lands on Chats tab.
3. **Add member icon**: Open Manage Group → add member button shows UserPlus icon.
4. **Verify gate**: Log in as unverified user, open Manage Group, try to add → verify CTA popup appears.
5. **Report modal**: Open report in direct chat → title shows "Report" not "Report user".
6. **Report email**: Submit report → check Supabase edge function logs + email inbox at support@huddle.pet.
7. **Group info media**: Open group with media → images scroll horizontally.
8. **Group invite**: Add a user to a group → they receive `group_invite` notification → open Groups tab → popup appears → join works.
9. **Moderation scoring**: Manually call `process_user_report()` via Supabase SQL editor with high-severity categories + attachment_urls → verify `profiles.account_status` updates.
10. **Account wall**: Set `account_status = 'suspended'` on a test profile → app renders AccountWall full-screen, not regular content.
11. **Restricted banner**: Set `account_status = 'restricted'` → amber banner appears at top on all pages.
12. **Discover filter**: Set `account_status = 'suspended'` → user no longer appears in discover feed.

### Task F3: Commit final cleanup

```bash
git add -p  # stage any remaining changes
git commit -m "chore: final cleanup after moderation system implementation"
```

---

## Migration Apply Order

```
20260317150000_moderation_system.sql   ← Phase C (apply to remote with MCP apply_migration)
```

Edge function to deploy:
```
supabase/functions/support-request/index.ts   ← Phase B1
```
