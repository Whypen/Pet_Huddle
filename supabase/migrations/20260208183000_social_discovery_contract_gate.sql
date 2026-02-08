-- Contract v2.0: server-side gating for advanced discovery filters + Gold-only extras.
-- Notes:
-- - Free users cannot enable advanced filters via p_advanced.
-- - Gold-only flags: p_only_waved, p_active_only are ignored unless viewer is gold.
-- - Result size: Free returns up to 40, Premium/Gold returns up to 200.

-- Avoid PostgREST ambiguity: drop older overloads so RPC resolution is deterministic.
drop function if exists public.social_discovery(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean);
drop function if exists public.social_discovery(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean, numeric, numeric);

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
  p_advanced boolean default false,
  p_height_min numeric default null,
  p_height_max numeric default null,
  p_only_waved boolean default false,
  p_active_only boolean default false
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
  with viewer_base as (
    select
      p.id,
      p.relationship_status,
      p.care_circle,
      coalesce(nullif((row_to_json(p)::jsonb->>'effective_tier'), ''), p.tier, 'free') as tier_raw,
      p.last_login
    from public.profiles p
    where p.id = p_user_id
  ),
  viewer as (
    select
      vb.*,
      -- Gold family pooling/inheritance for discovery tier checks.
      coalesce(
        (
          select coalesce(inv.tier, 'free')
          from public.family_members fm
          join public.profiles inv on inv.id = fm.inviter_user_id
          where fm.invitee_user_id = vb.id
            and fm.status = 'accepted'
          limit 1
        ),
        vb.tier_raw
      ) as effective_tier
    from viewer_base vb
  ),
  flags as (
    select
      v.*,
      (v.effective_tier in ('premium','gold')) as adv_allowed,
      (v.effective_tier = 'gold') as gold_allowed,
      case when v.effective_tier in ('premium','gold') then 200 else 40 end as max_rows
    from viewer v
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
        + case when (p_advanced and fl.adv_allowed) and f.is_verified then 50 else 0 end
        + case when (p_advanced and fl.adv_allowed) and fl.relationship_status is not null and f.relationship_status = fl.relationship_status then 30 else 0 end
        + case when (p_advanced and fl.adv_allowed) and (f.has_car or coalesce(f.experience_years, 0) > 0 or array_length(f.pet_experience, 1) > 0) then 30 else 0 end
        + case when (p_advanced and fl.adv_allowed) and (f.social_availability = true or array_length(f.availability_status, 1) > 0) then 20 else 0 end
        + case when (p_advanced and fl.adv_allowed) and (
            f.id = any(fl.care_circle)
            or exists (
              select 1 from public.family_members fm
              where fm.status = 'accepted'
                and (
                  (fm.inviter_user_id = fl.id and fm.invitee_user_id = f.id)
                  or (fm.inviter_user_id = f.id and fm.invitee_user_id = fl.id)
                )
            )
          ) then 20 else 0 end
      ) as score,
      case
        when f.tier = 'gold' then 3
        when f.tier = 'premium' then 2
        else 1
      end as membership_priority
    from filtered f
    cross join flags fl
    where f.dob is not null
      and (extract(year from age(current_date, f.dob)) between p_min_age and p_max_age)
      and (p_gender is null or p_gender = '' or p_gender = 'Any' or f.gender_genre = p_gender)
      and (p_role is null or p_role = '' or f.social_role = p_role)
      and (p_species is null or array_length(p_species, 1) = 0 or f.pet_species && p_species)
      and (p_pet_size is null or p_pet_size = '' or p_pet_size = 'Any' or f.pet_size = p_pet_size)
      and (p_height_min is null or f.height >= p_height_min)
      and (p_height_max is null or f.height <= p_height_max)
      and (coalesce(f.location, f.location_geog) is not null)
      and ST_DWithin(
        coalesce(f.location, f.location_geog),
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        p_radius_m
      )
      and (f.location_retention_until is null or f.location_retention_until > now())
      and (
        -- Gold-only filters
        fl.gold_allowed is false
        or p_only_waved is false
        or exists (
          select 1 from public.waves w
          where w.to_user_id = fl.id
            and w.from_user_id = f.id
        )
      )
      and (
        fl.gold_allowed is false
        or p_active_only is false
        or (f.last_login is not null and f.last_login > (now() - interval '24 hours'))
      )
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
  from scored
  order by membership_priority desc, score desc nulls last, created_at desc
  limit (select max_rows from flags);
$$;

revoke all on function public.social_discovery(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean, numeric, numeric, boolean, boolean) from anon;
grant execute on function public.social_discovery(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean, numeric, numeric, boolean, boolean) to authenticated;
grant execute on function public.social_discovery(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean, numeric, numeric, boolean, boolean) to service_role;
