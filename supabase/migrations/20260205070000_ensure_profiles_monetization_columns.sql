-- Ensure monetization counters exist in cloud even if earlier migrations were skipped.
alter table public.profiles
  add column if not exists mesh_alert_count integer not null default 0,
  add column if not exists family_slots integer not null default 0;
