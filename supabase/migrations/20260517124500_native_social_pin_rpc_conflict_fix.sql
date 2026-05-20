create or replace function public.set_native_social_post_pinned(
  p_thread_id uuid,
  p_pinned boolean
)
returns table (
  thread_id uuid,
  is_pinned boolean,
  pinned_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_pins integer;
  v_pinned_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'missing_auth'
      using errcode = '28000';
  end if;

  if not exists (select 1 from public.threads t where t.id = p_thread_id) then
    raise exception 'thread_not_found'
      using errcode = 'P0002';
  end if;

  if p_pinned then
    select count(*)
      into v_existing_pins
    from public.native_social_post_pins p
    where p.user_id = v_user_id
      and p.thread_id <> p_thread_id;

    if v_existing_pins >= 3 then
      raise exception 'native_social_pin_limit_reached'
        using errcode = 'P0001';
    end if;

    insert into public.native_social_post_pins (user_id, thread_id, pinned_at)
    values (v_user_id, p_thread_id, now())
    on conflict on constraint native_social_post_pins_pkey do update
      set pinned_at = excluded.pinned_at
    returning native_social_post_pins.pinned_at into v_pinned_at;

    return query select p_thread_id, true, v_pinned_at;
    return;
  end if;

  delete from public.native_social_post_pins p
  where p.user_id = v_user_id
    and p.thread_id = p_thread_id;

  return query select p_thread_id, false, null::timestamptz;
end;
$$;

revoke all on function public.set_native_social_post_pinned(uuid, boolean) from public;
revoke all on function public.set_native_social_post_pinned(uuid, boolean) from anon;
grant execute on function public.set_native_social_post_pinned(uuid, boolean) to authenticated;
