-- One-time hard purge for stale deleted/orphan profiles.
-- Goal: no lingering profile rows for removed or orphaned accounts.

do $$
declare
  r record;
begin
  for r in
    select p.id
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.account_status = 'removed'
       or u.id is null
  loop
    perform public.delete_user_account(r.id);
  end loop;
end;
$$;
