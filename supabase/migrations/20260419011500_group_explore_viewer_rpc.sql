create or replace function public.get_public_groups_for_viewer()
returns table(
  id uuid,
  name text,
  avatar_url text,
  location_label text,
  location_country text,
  pet_focus text[],
  join_method text,
  last_message_at timestamptz,
  created_at timestamptz,
  description text,
  member_count bigint,
  created_by uuid
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.get_public_groups_for_country(
    auth.uid(),
    public.resolve_group_country_for_user(auth.uid())
  );
$$;
