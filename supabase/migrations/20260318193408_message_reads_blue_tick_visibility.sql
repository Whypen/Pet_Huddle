-- Allow chat members to see read receipts for messages in shared chats.
-- Without this, the sender cannot query whether the recipient has read their
-- message (RLS blocks selecting other users' message_reads rows), so the blue
-- double-tick (✓✓) never appears.

drop policy if exists "message_reads select chat member" on public.message_reads;
create policy "message_reads select chat member"
on public.message_reads
for select
to authenticated
using (
  exists (
    select 1
    from public.messages m
    join public.chat_room_members crm on crm.chat_id = m.chat_id
    where m.id = message_reads.message_id
      and crm.user_id = (select auth.uid())
  )
);
