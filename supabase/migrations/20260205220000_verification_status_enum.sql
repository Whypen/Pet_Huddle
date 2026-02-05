-- Introduce verification_status enum and align profiles column to enum.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'verification_status_enum') then
    create type public.verification_status_enum as enum ('pending', 'approved', 'rejected');
  end if;
end $$;

alter table public.profiles
  add column if not exists verification_document_url text;

alter table public.profiles
  alter column verification_status drop default;

alter table public.profiles
  alter column verification_status type public.verification_status_enum
  using (
    case
      when verification_status in ('pending', 'approved', 'rejected') then verification_status::public.verification_status_enum
      else 'pending'::public.verification_status_enum
    end
  );

alter table public.profiles
  alter column verification_status set default 'pending'::public.verification_status_enum;
