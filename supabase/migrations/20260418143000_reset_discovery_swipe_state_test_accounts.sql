do $$
declare
  v_target_emails text[] := array[
    'twenty_illkid@msn.com',
    'fongpoman114@gmail.com'
  ];
  v_target_user_ids uuid[];
begin
  select coalesce(array_agg(au.id), '{}'::uuid[])
    into v_target_user_ids
  from auth.users au
  where lower(au.email) = any (
    select lower(email_value)
    from unnest(v_target_emails) as email_value
  );

  if coalesce(array_length(v_target_user_ids, 1), 0) = 0 then
    raise notice 'No target accounts found for discovery swipe reset.';
    return;
  end if;

  delete from public.waves
  where sender_id = any(v_target_user_ids)
     or receiver_id = any(v_target_user_ids)
     or from_user_id = any(v_target_user_ids)
     or to_user_id = any(v_target_user_ids);

  delete from public.matches
  where user1_id = any(v_target_user_ids)
     or user2_id = any(v_target_user_ids);

  delete from public.discover_match_seen
  where viewer_id = any(v_target_user_ids)
     or matched_user_id = any(v_target_user_ids);

  update public.user_quotas
  set
    discovery_profiles_today = 0,
    discovery_views_today = 0,
    updated_at = now()
  where user_id = any(v_target_user_ids);

  raise notice 'Discovery swipe state reset for % account(s).', array_length(v_target_user_ids, 1);
end
$$;
