-- Threads scoring: include family relationship weight

create or replace function public.update_threads_scores()
returns void
language plpgsql
as $$
begin
  update public.threads t
  set score = (
    -- time boost: older = higher per spec
    (extract(epoch from (now() - t.created_at)) / 86400.0) * 10
    +
    -- relationship weight: care circle or family membership
    case
      when (
        (p.care_circle is not null and array_length(p.care_circle, 1) > 0)
        or exists (
          select 1
          from public.family_members fm
          where fm.status = 'accepted'
            and (fm.inviter_user_id = p.id or fm.invitee_user_id = p.id)
        )
      ) then 20
      else 0
    end
    +
    -- badge/role weight
    case when p.is_verified then 50 else 0 end
    +
    case when p.tier = 'gold' then 30 else 0 end
    +
    -- engagement
    ((select count(*) from public.thread_comments c where c.thread_id = t.id) * 5)
    + (coalesce(t.likes, 0) * 3)
    + (coalesce(t.clicks, 0) * 1)
    -
    -- decay
    (ln(extract(day from (now() - t.created_at)) + 1) * 5)
  )
  from public.profiles p
  where p.id = t.user_id;
end;
$$;
