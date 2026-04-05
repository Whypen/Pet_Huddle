create table if not exists public.plan_metadata (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null,
  plan_name text not null,
  billing_cycle text not null check (billing_cycle in ('monthly', 'annual', 'one_time')),
  currency text not null default 'USD',
  stripe_lookup_key text not null,
  stripe_product_id text,
  is_active boolean not null default true,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists plan_metadata_plan_currency_active_uniq
  on public.plan_metadata (plan_key, currency, is_active)
  where is_active = true;
create index if not exists plan_metadata_lookup_idx
  on public.plan_metadata (stripe_lookup_key);
create or replace function public.set_plan_metadata_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_plan_metadata_updated_at on public.plan_metadata;
create trigger trg_plan_metadata_updated_at
before update on public.plan_metadata
for each row
execute function public.set_plan_metadata_updated_at();
insert into public.plan_metadata (plan_key, plan_name, billing_cycle, currency, stripe_lookup_key, priority)
values
  ('plus_monthly', 'Huddle+ Monthly', 'monthly', 'USD', 'plus_monthly', 100),
  ('plus_annual', 'Huddle+ Annual', 'annual', 'USD', 'plus_yearly', 100),
  ('gold_monthly', 'Huddle Gold Monthly', 'monthly', 'USD', 'Gold_monthly', 100),
  ('gold_annual', 'Huddle Gold Annual', 'annual', 'USD', 'Gold_yearly', 100),
  ('superBroadcast', 'Super Broadcast', 'one_time', 'USD', 'super_broadcast', 100),
  ('topProfileBooster', 'Top Profile Booster', 'one_time', 'USD', 'top_profile_booster', 100),
  ('sharePerks', 'Share Perks', 'monthly', 'USD', 'Family_Member', 100),
  ('star_pack', 'Star Pack', 'one_time', 'USD', 'star_pack', 100),
  ('emergency_alert', 'Emergency Alert', 'one_time', 'USD', 'emergency_alert', 100),
  ('vet_media', 'Vet Media', 'one_time', 'USD', 'vet_media_10', 100)
on conflict do nothing;
