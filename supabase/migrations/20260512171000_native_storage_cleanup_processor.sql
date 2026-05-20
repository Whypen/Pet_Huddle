alter table public.storage_cleanup_queue
  add column if not exists error_message text,
  add column if not exists attempts integer not null default 0;

create index if not exists idx_storage_cleanup_queue_pending
  on public.storage_cleanup_queue(created_at)
  where processed_at is null;

drop function if exists public.process_storage_cleanup_queue(integer);

create or replace function public.process_storage_cleanup_queue(p_limit integer default 100)
returns table(id uuid, bucket text, object_path text, processed boolean, error_message text)
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_role text := coalesce(auth.role(), '');
  rec record;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  if v_role <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'service_role_required';
  end if;

  for rec in
    select q.id, q.bucket, q.object_path
    from public.storage_cleanup_queue q
    where q.processed_at is null
    order by q.created_at asc
    limit v_limit
    for update skip locked
  loop
    begin
      delete from storage.objects o
      where o.bucket_id = rec.bucket
        and o.name = rec.object_path;

      update public.storage_cleanup_queue q
      set processed_at = now(),
          attempts = q.attempts + 1,
          error_message = null
      where q.id = rec.id;

      update public.media_assets ma
      set deleted_at = coalesce(ma.deleted_at, now())
      where ma.bucket = rec.bucket
        and ma.object_path = rec.object_path;

      id := rec.id;
      bucket := rec.bucket;
      object_path := rec.object_path;
      processed := true;
      error_message := null;
      return next;
    exception when others then
      update public.storage_cleanup_queue q
      set attempts = q.attempts + 1,
          error_message = sqlerrm
      where q.id = rec.id;

      id := rec.id;
      bucket := rec.bucket;
      object_path := rec.object_path;
      processed := false;
      error_message := sqlerrm;
      return next;
    end;
  end loop;
end;
$$;

revoke all on function public.process_storage_cleanup_queue(integer) from public, anon, authenticated;
grant execute on function public.process_storage_cleanup_queue(integer) to service_role;

do $$
declare
  v_job record;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    for v_job in
      select jobid from cron.job where jobname = 'native_storage_cleanup_hourly'
    loop
      perform cron.unschedule(v_job.jobid);
    end loop;

    perform cron.schedule(
      'native_storage_cleanup_hourly',
      '17 * * * *',
      $cron$select public.process_storage_cleanup_queue(250);$cron$
    );
  else
    raise notice 'pg_cron not available; schedule public.process_storage_cleanup_queue(integer) via Scheduled Edge Function.';
  end if;
exception
  when undefined_table or undefined_function then
    raise notice 'pg_cron metadata unavailable; schedule public.process_storage_cleanup_queue(integer) manually.';
end $$;
