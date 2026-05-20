create or replace function public.can_write_native_group_avatar(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  with parts as (
    select storage.foldername(p_object_name) as folders
  ),
  target as (
    select
      folders,
      case
        when array_length(folders, 1) >= 2
          and folders[1] = 'groups'
          and folders[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then folders[2]::uuid
        else null::uuid
      end as chat_id
    from parts
  )
  select exists (
    select 1
    from target t
    left join public.chats c on c.id = t.chat_id
    left join public.chat_room_members crm
      on crm.chat_id = t.chat_id
      and crm.user_id = auth.uid()
      and coalesce(crm.left_at, crm.deleted_at) is null
    where auth.uid() is not null
      and t.chat_id is not null
      and (
        c.created_by = auth.uid()
        or crm.user_id = auth.uid()
      )
  );
$$;

revoke all on function public.can_write_native_group_avatar(text) from public, anon;
grant execute on function public.can_write_native_group_avatar(text) to authenticated, service_role;

drop policy if exists "Authenticated users can upload group avatars" on storage.objects;
drop policy if exists "Authenticated users can update group avatars" on storage.objects;
drop policy if exists "Authenticated users can delete group avatars" on storage.objects;
drop policy if exists avatars_groups_auth_insert on storage.objects;
drop policy if exists avatars_groups_auth_update on storage.objects;
drop policy if exists avatars_groups_auth_delete on storage.objects;
drop policy if exists avatars_groups_member_insert on storage.objects;
drop policy if exists avatars_groups_member_update on storage.objects;
drop policy if exists avatars_groups_member_delete on storage.objects;

create policy avatars_groups_member_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'groups'
  and public.can_write_native_group_avatar(name)
);

create policy avatars_groups_member_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'groups'
  and public.can_write_native_group_avatar(name)
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'groups'
  and public.can_write_native_group_avatar(name)
);

create policy avatars_groups_member_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'groups'
  and public.can_write_native_group_avatar(name)
);
