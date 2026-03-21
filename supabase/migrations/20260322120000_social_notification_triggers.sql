-- Make social like/comment notifications native-app-proof.
--
-- upsert_notification_window() uses auth.uid() to verify the caller is the actor,
-- which works from the web client but not from a DB trigger (no auth session).
-- This migration adds an internal variant (no auth check, trusted server-side path)
-- and wires it to AFTER INSERT triggers on thread_supports and thread_comments.
--
-- Both the web client and the trigger call the window function; the second call is
-- deduplicated (actor_id already in window.actor_ids → early return), so no
-- double-notifications occur regardless of which path fires first.

-- ── 1. Internal window upsert (no auth.uid() check) ──────────────────────────

create or replace function public.upsert_notification_window_internal(
  p_owner_user_id uuid,
  p_subject_id    uuid,
  p_subject_type  text,
  p_kind          text,
  p_category      text,
  p_href          text,
  p_actor_id      uuid,
  p_actor_name    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_win record;
begin
  -- Do not notify yourself
  if p_owner_user_id = p_actor_id then return; end if;

  -- Block check
  if public.is_user_blocked(p_owner_user_id, p_actor_id) then return; end if;

  -- Find active window (initial or digest)
  select * into v_win
  from public.notification_aggregation_windows
  where owner_user_id = p_owner_user_id
    and subject_id    = p_subject_id
    and kind          = p_kind
    and (
      last_emit_at is null
      or (last_emit_at is not null and digest_closes_at > now())
    )
  order by created_at desc
  limit 1;

  if found then
    -- Skip if this actor is already in the window (dedup)
    if p_actor_id = any(v_win.actor_ids) then return; end if;

    update public.notification_aggregation_windows
    set
      actor_ids   = actor_ids   || p_actor_id,
      actor_names = actor_names || p_actor_name,
      count       = count + 1
    where id = v_win.id;
  else
    insert into public.notification_aggregation_windows (
      owner_user_id, subject_id, subject_type, kind, category, href,
      actor_ids, actor_names, count, window_closes_at
    ) values (
      p_owner_user_id, p_subject_id, p_subject_type, p_kind, p_category, p_href,
      array[p_actor_id], array[p_actor_name], 1,
      now() + interval '60 seconds'
    );
  end if;
end;
$$;

-- Only service_role (and this function itself, security definer) can call it
revoke all on function public.upsert_notification_window_internal(uuid,uuid,text,text,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.upsert_notification_window_internal(uuid,uuid,text,text,text,text,uuid,text) to service_role;

-- ── 2. Trigger: thread_supports (likes) ──────────────────────────────────────

create or replace function public.notify_thread_support()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread_owner_id uuid;
  v_actor_name      text;
begin
  -- Get thread owner
  select user_id into v_thread_owner_id
  from public.threads
  where id = new.thread_id;

  if not found or v_thread_owner_id is null then return new; end if;

  -- Get actor display name
  select coalesce(display_name, 'Someone') into v_actor_name
  from public.profiles
  where id = new.user_id;

  perform public.upsert_notification_window_internal(
    v_thread_owner_id,
    new.thread_id,
    'thread',
    'like',
    'social',
    '/social?focus=' || new.thread_id,
    new.user_id,
    coalesce(v_actor_name, 'Someone')
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_thread_support on public.thread_supports;
create trigger trg_notify_thread_support
after insert on public.thread_supports
for each row
execute function public.notify_thread_support();

-- ── 3. Trigger: thread_comments ───────────────────────────────────────────────

create or replace function public.notify_thread_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread_owner_id uuid;
  v_actor_name      text;
begin
  -- Get thread owner
  select user_id into v_thread_owner_id
  from public.threads
  where id = new.thread_id;

  if not found or v_thread_owner_id is null then return new; end if;

  -- Get actor display name
  select coalesce(display_name, 'Someone') into v_actor_name
  from public.profiles
  where id = new.user_id;

  perform public.upsert_notification_window_internal(
    v_thread_owner_id,
    new.thread_id,
    'thread',
    'comment',
    'social',
    '/social?focus=' || new.thread_id,
    new.user_id,
    coalesce(v_actor_name, 'Someone')
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_thread_comment on public.thread_comments;
create trigger trg_notify_thread_comment
after insert on public.thread_comments
for each row
execute function public.notify_thread_comment();
