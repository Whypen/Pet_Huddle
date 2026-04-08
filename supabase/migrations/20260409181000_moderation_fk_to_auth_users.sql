-- Moderation must bind to canonical auth identity, not profile row existence.
-- This allows banning users created via OAuth/direct auth paths before/without profile hydration.

alter table public.user_moderation
  drop constraint if exists user_moderation_user_id_fkey;

alter table public.user_moderation
  add constraint user_moderation_user_id_fkey
  foreign key (user_id) references auth.users(id)
  on delete cascade;

alter table public.banned_identifiers
  drop constraint if exists banned_identifiers_source_user_id_fkey;

alter table public.banned_identifiers
  add constraint banned_identifiers_source_user_id_fkey
  foreign key (source_user_id) references auth.users(id)
  on delete set null;

alter table public.abuse_signals
  drop constraint if exists abuse_signals_source_user_id_fkey;

alter table public.abuse_signals
  add constraint abuse_signals_source_user_id_fkey
  foreign key (source_user_id) references auth.users(id)
  on delete set null;
