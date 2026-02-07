-- Social discovery scoring + map pin retention

alter table public.profiles
  add column if not exists location_pinned_until timestamptz,
  add column if not exists location_retention_until timestamptz;

alter table public.profiles
  add column if not exists location geography(point, 4326);

alter table public.profiles
  add column if not exists location_geog geography(point, 4326);

create or replace function public.set_user_location(
  p_lat double precision,
  p_lng double precision,
  p_pin_hours int default 2,
  p_retention_hours int default 24
)
returns void
language plpgsql
security definer
as $$
begin
  update public.profiles
  set
    last_lat = p_lat,
    last_lng = p_lng,
    location = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    location_geog = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    location_pinned_until = now() + (p_pin_hours || ' hours')::interval,
    location_retention_until = now() + (p_retention_hours || ' hours')::interval,
    updated_at = now()
  where id = auth.uid();
end;
$$;

grant execute on function public.set_user_location(double precision, double precision, int, int) to authenticated;

-- Social discovery RPC using PostGIS + weighted scoring
create or replace function public.social_discovery(
  p_user_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer,
  p_min_age integer,
  p_max_age integer,
  p_role text default null,
  p_gender text default null,
  p_species text[] default null,
  p_pet_size text default null,
  p_advanced boolean default false
)
returns table(
  id uuid,
  display_name text,
  avatar_url text,
  is_verified boolean,
  has_car boolean,
  bio text,
  relationship_status text,
  dob date,
  location_name text,
  occupation text,
  school text,
  major text,
  gender_genre text,
  orientation text,
  height numeric,
  weight numeric,
  weight_unit text,
  tier text,
  pets jsonb,
  pet_species text[],
  pet_size text,
  social_album text[],
  show_occupation boolean,
  show_academic boolean,
  show_bio boolean,
  show_relationship_status boolean,
  show_age boolean,
  show_gender boolean,
  show_orientation boolean,
  show_height boolean,
  show_weight boolean,
  social_role text,
  score numeric
)
language sql
security definer
as $$
  with viewer as (
    select id, relationship_status, care_circle
    from public.profiles
    where id = p_user_id
  ),
  pet_data as (
    select
      owner_id,
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'name', name,
          'species', species,
          'breed', breed,
          'photo_url', photo_url,
          'weight', weight,
          'weight_unit', weight_unit
        )
      ) as pets,
      array_remove(array_agg(distinct species), null) as pet_species,
      max(
        case
          when weight is null then null
          when weight_unit = 'lb' then weight * 0.453592
          else weight
        end
      ) as max_weight_kg
    from public.pets
    where is_active = true
    group by owner_id
  ),
  base as (
    select
      p.*,
      pd.pets,
      pd.pet_species,
      pd.max_weight_kg,
      case
        when sp.user_id is not null then 'nannies'
        when p.owns_pets then 'playdates'
        else 'animal-lovers'
      end as social_role
    from public.profiles p
    left join public.sitter_profiles sp on sp.user_id = p.id
    left join pet_data pd on pd.owner_id = p.id
    where p.id <> p_user_id
  ),
  filtered as (
    select
      b.*,
      case
        when b.max_weight_kg is null then null
        when b.max_weight_kg <= 9 then 'Small'
        when b.max_weight_kg <= 22 then 'Medium'
        else 'Large'
      end as pet_size
    from base b
  ),
  scored as (
    select
      f.*,
      (
        case
          when p_species is not null
            and array_length(p_species, 1) > 0
            and f.pet_species && p_species then 100
          else 0
        end
        + case when p_advanced and f.is_verified then 50 else 0 end
        + case when p_advanced and v.relationship_status is not null and f.relationship_status = v.relationship_status then 30 else 0 end
        + case when p_advanced and (f.has_car or coalesce(f.experience_years, 0) > 0 or array_length(f.pet_experience, 1) > 0) then 30 else 0 end
        + case when p_advanced and (f.social_availability = true or array_length(f.availability_status, 1) > 0) then 20 else 0 end
        + case when p_advanced and (
            f.id = any(v.care_circle)
            or exists (
              select 1 from public.family_members fm
              where fm.status = 'accepted'
                and (
                  (fm.inviter_user_id = v.id and fm.invitee_user_id = f.id)
                  or (fm.inviter_user_id = f.id and fm.invitee_user_id = v.id)
                )
            )
          ) then 20 else 0 end
      ) as score,
      case when f.tier in ('premium','gold') then 2 else 1 end as membership_priority
    from filtered f
    join viewer v on true
    where f.dob is not null
      and (extract(year from age(current_date, f.dob)) between p_min_age and p_max_age)
      and (p_gender is null or p_gender = '' or p_gender = 'Any' or f.gender_genre = p_gender)
      and (p_role is null or p_role = '' or f.social_role = p_role)
      and (p_species is null or array_length(p_species, 1) = 0 or f.pet_species && p_species)
      and (p_pet_size is null or p_pet_size = '' or p_pet_size = 'Any' or f.pet_size = p_pet_size)
      and (coalesce(f.location, f.location_geog) is not null)
      and ST_DWithin(
        coalesce(f.location, f.location_geog),
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        p_radius_m
      )
      and (f.location_retention_until is null or f.location_retention_until > now())
  ),
  premium as (
    select * from scored
    where membership_priority = 2
    order by score desc nulls last, created_at desc
    limit 10
  ),
  rest as (
    select * from scored
    where id not in (select id from premium)
    order by score desc nulls last, created_at desc
    limit 40
  )
  select
    id,
    display_name,
    avatar_url,
    is_verified,
    has_car,
    bio,
    relationship_status,
    dob,
    location_name,
    occupation,
    school,
    major,
    gender_genre,
    orientation,
    height,
    weight,
    weight_unit,
    tier,
    pets,
    pet_species,
    pet_size,
    social_album,
    show_occupation,
    show_academic,
    show_bio,
    show_relationship_status,
    show_age,
    show_gender,
    show_orientation,
    show_height,
    show_weight,
    social_role,
    score
  from premium
  union all
  select
    id,
    display_name,
    avatar_url,
    is_verified,
    has_car,
    bio,
    relationship_status,
    dob,
    location_name,
    occupation,
    school,
    major,
    gender_genre,
    orientation,
    height,
    weight,
    weight_unit,
    tier,
    pets,
    pet_species,
    pet_size,
    social_album,
    show_occupation,
    show_academic,
    show_bio,
    show_relationship_status,
    show_age,
    show_gender,
    show_orientation,
    show_height,
    show_weight,
    social_role,
    score
  from rest;
$$;

revoke all on function public.social_discovery(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean) from anon;
grant execute on function public.social_discovery(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean) to authenticated;
grant execute on function public.social_discovery(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean) to service_role;
