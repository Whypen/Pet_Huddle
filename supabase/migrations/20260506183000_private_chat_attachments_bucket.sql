insert into storage.buckets (id, name, public)
values ('chat_attachments', 'chat_attachments', false)
on conflict (id) do update
set public = false;

create or replace function public.chat_attachment_room_id(object_name text)
returns uuid
language sql
stable
set search_path = public, storage
as $$
  select case
    when (storage.foldername(object_name))[3] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then ((storage.foldername(object_name))[3])::uuid
    else null
  end
$$;

drop policy if exists chat_attachments_select_room_members on storage.objects;
create policy chat_attachments_select_room_members
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'chat_attachments'
    and exists (
      select 1
      from public.chat_room_members crm
      where crm.chat_id = public.chat_attachment_room_id(name)
        and crm.user_id = auth.uid()
    )
  );

drop policy if exists chat_attachments_insert_room_members on storage.objects;
create policy chat_attachments_insert_room_members
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat_attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
    and exists (
      select 1
      from public.chat_room_members crm
      where crm.chat_id = public.chat_attachment_room_id(name)
        and crm.user_id = auth.uid()
    )
  );

drop policy if exists chat_attachments_update_own_room_member on storage.objects;
create policy chat_attachments_update_own_room_member
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'chat_attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
    and exists (
      select 1
      from public.chat_room_members crm
      where crm.chat_id = public.chat_attachment_room_id(name)
        and crm.user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'chat_attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
    and exists (
      select 1
      from public.chat_room_members crm
      where crm.chat_id = public.chat_attachment_room_id(name)
        and crm.user_id = auth.uid()
    )
  );

drop policy if exists chat_attachments_delete_own_room_member on storage.objects;
create policy chat_attachments_delete_own_room_member
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'chat_attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
    and exists (
      select 1
      from public.chat_room_members crm
      where crm.chat_id = public.chat_attachment_room_id(name)
        and crm.user_id = auth.uid()
    )
  );
