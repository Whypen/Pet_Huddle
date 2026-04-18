do $$
declare
  target_ids uuid[];
begin
  select array_agg(id)
  into target_ids
  from public.profiles
  where lower(coalesce(display_name, '')) in ('social manager', 'hyphen fong');

  if coalesce(array_length(target_ids, 1), 0) = 0 then
    raise notice 'No matching profiles found for star quota reset.';
    return;
  end if;

  insert into public.user_quotas (user_id)
  select unnest(target_ids)
  on conflict (user_id) do nothing;

  update public.user_quotas
  set
    stars_used_cycle = 0,
    stars_month_used = 0
  where user_id = any(target_ids);

  raise notice 'Reset star quota for % account(s).', array_length(target_ids, 1);
end $$;
