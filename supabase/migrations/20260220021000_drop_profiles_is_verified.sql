begin;

-- Drop dependencies before altering columns.
drop trigger if exists trg_prevent_non_admin_verification on public.profiles;
drop view if exists public.profiles_public;

alter table public.profiles
  drop column if exists is_verified;
alter table public.profiles
  drop column if exists verified;

create view public.profiles_public as
select
  id,
  display_name,
  avatar_url,
  case when show_bio then bio else null end as bio,
  case when show_gender then gender_genre else null end as gender_genre,
  case when show_age then dob else null end as dob,
  case when show_height then height else null end as height,
  case when show_weight then weight else null end as weight,
  weight_unit,
  case when show_academic then degree else null end as degree,
  case when show_academic then school else null end as school,
  case when show_academic then major else null end as major,
  case when show_affiliation then affiliation else null end as affiliation,
  location_name,
  verification_status,
  has_car,
  user_role,
  pet_experience,
  experience_years,
  languages,
  relationship_status,
  owns_pets,
  social_availability,
  availability_status,
  created_at
from public.profiles;

create trigger trg_prevent_non_admin_verification
  before update of verification_status on public.profiles
  for each row execute function public.prevent_non_admin_verification();

commit;
