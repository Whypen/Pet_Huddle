-- Allow chat members to see read receipts for messages in shared chats.
-- Without this, the sender cannot query whether the recipient has read their
-- message (RLS blocks selecting other users' message_reads rows), so the blue
-- double-tick (✓✓) never appears.
--
-- NOTE: message_reads.message_id FK references chat_messages (not messages).

drop policy if exists "message_reads select chat member" on public.message_reads;
create policy "message_reads select chat member"
on public.message_reads
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_messages cm
    join public.chat_room_members crm on crm.chat_id = cm.chat_id
    where cm.id = message_reads.message_id
      and crm.user_id = (select auth.uid())
  )
);
