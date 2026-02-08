-- Add profiles.prefs for notification settings + misc client preferences.
alter table public.profiles
  add column if not exists prefs jsonb not null default '{}'::jsonb;

comment on column public.profiles.prefs is
  'User preferences JSON. Keys include push_notifications_enabled and email_notifications_enabled.';

