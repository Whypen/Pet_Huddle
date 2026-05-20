create table if not exists public.group_chat_invites (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  chat_name text,
  inviter_user_id uuid not null references public.profiles(id) on delete cascade,
  invitee_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (chat_id, invitee_user_id)
);

alter table public.group_chat_invites enable row level security;

create index if not exists idx_group_chat_invites_chat_id
  on public.group_chat_invites(chat_id);

create index if not exists idx_group_chat_invites_invitee_status
  on public.group_chat_invites(invitee_user_id, status, created_at desc);

create index if not exists idx_group_chat_invites_inviter_status
  on public.group_chat_invites(inviter_user_id, status, created_at desc);

drop policy if exists group_chat_invites_select_participant_or_invitee on public.group_chat_invites;
create policy group_chat_invites_select_participant_or_invitee
  on public.group_chat_invites
  for select
  to authenticated
  using (
    auth.uid() = invitee_user_id
    or auth.uid() = inviter_user_id
    or exists (
      select 1
      from public.chat_participants cp
      where cp.chat_id = group_chat_invites.chat_id
        and cp.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.chats c
      where c.id = group_chat_invites.chat_id
        and c.created_by = auth.uid()
    )
  );

drop policy if exists group_chat_invites_insert_group_admin on public.group_chat_invites;
create policy group_chat_invites_insert_group_admin
  on public.group_chat_invites
  for insert
  to authenticated
  with check (
    auth.uid() = inviter_user_id
    and invitee_user_id <> inviter_user_id
    and status = 'pending'
    and (
      exists (
        select 1
        from public.chat_participants cp
        where cp.chat_id = group_chat_invites.chat_id
          and cp.user_id = auth.uid()
          and coalesce(cp.role, 'member') = 'admin'
      )
      or exists (
        select 1
        from public.chats c
        where c.id = group_chat_invites.chat_id
          and c.created_by = auth.uid()
      )
    )
  );

drop policy if exists group_chat_invites_update_invitee_or_admin on public.group_chat_invites;
create policy group_chat_invites_update_invitee_or_admin
  on public.group_chat_invites
  for update
  to authenticated
  using (
    auth.uid() = invitee_user_id
    or auth.uid() = inviter_user_id
    or exists (
      select 1
      from public.chat_participants cp
      where cp.chat_id = group_chat_invites.chat_id
        and cp.user_id = auth.uid()
        and coalesce(cp.role, 'member') = 'admin'
    )
    or exists (
      select 1
      from public.chats c
      where c.id = group_chat_invites.chat_id
        and c.created_by = auth.uid()
    )
  )
  with check (
    status in ('pending', 'accepted', 'declined')
    and (
      auth.uid() = invitee_user_id
      or auth.uid() = inviter_user_id
      or exists (
        select 1
        from public.chat_participants cp
        where cp.chat_id = group_chat_invites.chat_id
          and cp.user_id = auth.uid()
          and coalesce(cp.role, 'member') = 'admin'
      )
      or exists (
        select 1
        from public.chats c
        where c.id = group_chat_invites.chat_id
          and c.created_by = auth.uid()
      )
    )
  );

drop policy if exists group_chat_invites_delete_group_admin on public.group_chat_invites;
create policy group_chat_invites_delete_group_admin
  on public.group_chat_invites
  for delete
  to authenticated
  using (
    auth.uid() = inviter_user_id
    or exists (
      select 1
      from public.chat_participants cp
      where cp.chat_id = group_chat_invites.chat_id
        and cp.user_id = auth.uid()
        and coalesce(cp.role, 'member') = 'admin'
    )
    or exists (
      select 1
      from public.chats c
      where c.id = group_chat_invites.chat_id
        and c.created_by = auth.uid()
    )
  );

grant select, insert, update, delete on public.group_chat_invites to authenticated;
