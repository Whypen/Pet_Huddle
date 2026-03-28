-- Phase 2: Discover contract alignment (DB only)
-- Replaces active public.social_discovery(...) with discover_contract.md behavior.

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
set search_path to 'public'
as $$
with viewer_profile as (
  select
    p.id,
    p.created_at,
    p.relationship_status,
    p.orientation,
    p.languages,
    coalesce(
      nullif((row_to_json(p)::jsonb ->> 'effective_tier'), ''),
      nullif(p.tier::text, ''),
      'free'
    ) as effective_tier,
    coalesce(
      ul.location,
      p.location,
      p.location_geog,
      case
        when p.last_lng is not null and p.last_lat is not null
          then st_setsrid(st_makepoint(p.last_lng, p.last_lat), 4326)::geography
        else null
      end,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
    ) as viewer_geog,
    coalesce(p.last_active_at, p.updated_at, p.created_at) as viewer_last_active,
    p.gender_genre,
    p.pet_experience
  from public.profiles p
  left join lateral (
    select ul.location
    from public.user_locations ul
    where ul.user_id = p.id
      and coalesce(ul.is_public, false) = true
      and (ul.expires_at is null or ul.expires_at > now())
    order by ul.updated_at desc
    limit 1
  ) ul on true
  where p.id = p_user_id
),
viewer_role as (
  select
    vp.id,
    (
      select
        case
          when lower(trim(v)) = 'pet parent' then 'Pet Parent'
          when lower(trim(v)) = 'pet nanny' then 'Pet Nanny'
          when lower(trim(v)) = 'animal friend (no pet)' then 'Animal Friend (No Pet)'
          when lower(trim(v)) = 'veterinarian' then 'Veterinarian'
          when lower(trim(v)) = 'pet photographer' then 'Pet Photographer'
          when lower(trim(v)) = 'pet groomer' then 'Pet Groomer'
          when lower(trim(v)) = 'vet nurse' then 'Vet Nurse'
          when lower(trim(v)) = 'volunteer' then 'Volunteer'
          when lower(trim(v)) in ('playdates', 'pet owner') then 'Pet Parent'
          when lower(trim(v)) in ('nannies', 'pet sitter') then 'Pet Nanny'
          when lower(trim(v)) in ('animal-lovers', 'animal lovers') then 'Animal Friend (No Pet)'
          else null
        end
      from unnest(coalesce((select p2.availability_status from public.profiles p2 where p2.id = vp.id), '{}'::text[])) with ordinality as r(v, ord)
      where v is not null and trim(v) <> ''
      order by ord
      limit 1
    ) as social_role
  from viewer_profile vp
),
viewer as (
  select
    vp.*,
    vr.social_role,
    case
      when lower(vp.effective_tier) = 'gold' then 400
      when lower(vp.effective_tier) in ('plus', 'premium') then 250
      else 100
    end as cap_target,
    case
      when vp.gender_genre is null or trim(vp.gender_genre) = '' then false
      when vp.viewer_geog is null then false
      when vr.social_role is null then false
      when coalesce(array_length(vp.pet_experience, 1), 0) = 0 then false
      else true
    end as viewer_discover_ready,
    greatest(extract(day from now() - vp.created_at), 0)::int as viewer_account_age_days
  from viewer_profile vp
  join viewer_role vr on vr.id = vp.id
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
      order by created_at desc nulls last
    ) as pets,
    array_remove(array_agg(distinct species), null) as pet_species,
    max(
      case
        when weight is null then null
        when lower(coalesce(weight_unit, 'kg')) = 'lb' then weight * 0.453592
        else weight
      end
    ) as max_weight_kg,
    min(lower(trim(species))) filter (where species is not null and trim(species) <> '') as primary_species
  from public.pets
  where is_active = true
  group by owner_id
),
candidate_location as (
  select distinct on (ul.user_id)
    ul.user_id,
    ul.location,
    ul.updated_at
  from public.user_locations ul
  where coalesce(ul.is_public, false) = true
    and (ul.expires_at is null or ul.expires_at > now())
  order by ul.user_id, ul.updated_at desc
),
base as (
  select
    p.id,
    p.display_name,
    p.avatar_url,
    p.verification_status,
    p.is_verified,
    p.has_car,
    p.bio,
    p.relationship_status,
    p.dob,
    p.location_name,
    p.occupation,
    p.school,
    p.major,
    p.degree,
    p.gender_genre,
    p.orientation,
    p.height,
    p.weight,
    p.weight_unit,
    p.tier,
    p.effective_tier,
    p.social_album,
    p.show_occupation,
    p.show_academic,
    p.show_bio,
    p.show_relationship_status,
    p.show_age,
    p.show_gender,
    p.show_orientation,
    p.show_height,
    p.show_weight,
    p.languages,
    p.pet_experience,
    p.experience_years,
    p.created_at,
    coalesce(p.last_active_at, p.updated_at, p.created_at) as effective_last_active_at,
    pd.pets,
    pd.pet_species,
    pd.max_weight_kg,
    pd.primary_species,
    cl.updated_at as candidate_location_updated_at,
    coalesce(
      cl.location,
      p.location,
      p.location_geog,
      case
        when p.last_lng is not null and p.last_lat is not null
          then st_setsrid(st_makepoint(p.last_lng, p.last_lat), 4326)::geography
        else null
      end
    ) as candidate_geog,
    (
      select
        case
          when lower(trim(v)) = 'pet parent' then 'Pet Parent'
          when lower(trim(v)) = 'pet nanny' then 'Pet Nanny'
          when lower(trim(v)) = 'animal friend (no pet)' then 'Animal Friend (No Pet)'
          when lower(trim(v)) = 'veterinarian' then 'Veterinarian'
          when lower(trim(v)) = 'pet photographer' then 'Pet Photographer'
          when lower(trim(v)) = 'pet groomer' then 'Pet Groomer'
          when lower(trim(v)) = 'vet nurse' then 'Vet Nurse'
          when lower(trim(v)) = 'volunteer' then 'Volunteer'
          when lower(trim(v)) in ('playdates', 'pet owner') then 'Pet Parent'
          when lower(trim(v)) in ('nannies', 'pet sitter') then 'Pet Nanny'
          when lower(trim(v)) in ('animal-lovers', 'animal lovers') then 'Animal Friend (No Pet)'
          else null
        end
      from unnest(coalesce(p.availability_status, '{}'::text[])) with ordinality as av(v, ord)
      where v is not null and trim(v) <> ''
      order by ord
      limit 1
    ) as social_role,
    coalesce(p.non_social, false) as non_social
  from public.profiles p
  left join pet_data pd on pd.owner_id = p.id
  left join candidate_location cl on cl.user_id = p.id
  where p.id <> p_user_id
),
viewer_species as (
  select
    array_remove(
      array_agg(distinct lower(trim(pet.species))) filter (where pet.species is not null and trim(pet.species) <> ''),
      null
    ) as species_list,
    min(lower(trim(pet.species))) filter (where pet.species is not null and trim(pet.species) <> '') as primary_species
  from public.pets pet
  where pet.owner_id = p_user_id
    and pet.is_active = true
),
hard_filtered as (
  select
    b.*,
    v.effective_tier as viewer_effective_tier,
    v.cap_target,
    v.viewer_geog,
    v.viewer_last_active,
    v.relationship_status as viewer_relationship_status,
    v.orientation as viewer_orientation,
    v.languages as viewer_languages,
    v.viewer_account_age_days,
    v.viewer_discover_ready,
    vs.species_list as viewer_species_list,
    vs.primary_species as viewer_primary_species,
    case
      when b.max_weight_kg is null then null
      when b.max_weight_kg <= 9 then 'Small'
      when b.max_weight_kg <= 22 then 'Medium'
      else 'Large'
    end as pet_size,
    case
      when b.candidate_geog is not null and v.viewer_geog is not null
        then st_distance(b.candidate_geog, v.viewer_geog)
      else null
    end as distance_m,
    array(
      select lower(trim(x))
      from unnest(coalesce(b.pet_species, '{}'::text[]) || coalesce(b.pet_experience, '{}'::text[])) as x
      where x is not null and trim(x) <> ''
      group by lower(trim(x))
    ) as combined_species_norm,
    coalesce(array_length(b.social_album, 1), 0) as album_count,
    greatest(coalesce(length(regexp_replace(coalesce(b.bio, ''), '\\s+', '', 'g')), 0), 0) as bio_non_space_len,
    (
      (case when b.occupation is not null and trim(b.occupation) <> '' then 1 else 0 end) +
      (case when b.school is not null and trim(b.school) <> '' then 1 else 0 end) +
      (case when b.degree is not null and trim(b.degree) <> '' then 1 else 0 end) +
      (case when b.relationship_status is not null and trim(b.relationship_status) <> '' then 1 else 0 end) +
      (case when b.orientation is not null and trim(b.orientation) <> '' then 1 else 0 end) +
      (case when coalesce(array_length(b.languages, 1), 0) > 0 then 1 else 0 end)
    ) as integrity_fields,
    case
      when lower(coalesce(b.effective_tier::text, b.tier::text, 'free')) = 'gold' then 15
      when lower(coalesce(b.effective_tier::text, b.tier::text, 'free')) in ('plus', 'premium') then 8
      else 0
    end as tier_boost_score
  from base b
  cross join viewer v
  left join viewer_species vs on true
  where v.viewer_discover_ready = true
    and b.non_social = false
    and b.dob is not null
    and extract(year from age(current_date, b.dob)) >= 16
    and extract(year from age(current_date, b.dob)) between greatest(p_min_age, 16) and greatest(p_max_age, greatest(p_min_age, 16))
    and b.gender_genre is not null and trim(b.gender_genre) <> ''
    and b.candidate_geog is not null
    and b.social_role is not null
    and coalesce(array_length(b.pet_experience, 1), 0) > 0
    and not exists (
      select 1
      from public.matches m
      where (m.user1_id = p_user_id and m.user2_id = b.id)
         or (m.user1_id = b.id and m.user2_id = p_user_id)
    )
    and not exists (
      select 1
      from public.user_blocks ub
      where (ub.blocker_id = p_user_id and ub.blocked_id = b.id)
         or (ub.blocker_id = b.id and ub.blocked_id = p_user_id)
    )
    and st_dwithin(b.candidate_geog, v.viewer_geog, greatest(1, p_radius_m))
),
filter_gated as (
  select hf.*
  from hard_filtered hf
  where (p_gender is null or trim(p_gender) = '' or lower(trim(p_gender)) = 'any' or hf.gender_genre = p_gender)
    and (p_role is null or trim(p_role) = '' or hf.social_role = p_role)
    and (
      p_species is null
      or array_length(p_species, 1) = 0
      or exists (
        select 1
        from unnest(p_species) ps
        where lower(trim(ps)) = any(coalesce(hf.combined_species_norm, '{}'::text[]))
      )
    )
    and (p_pet_size is null or trim(p_pet_size) = '' or lower(trim(p_pet_size)) = 'any' or hf.pet_size = p_pet_size)
    and (p_height_min is null or hf.height >= p_height_min)
    and (p_height_max is null or hf.height <= p_height_max)
    and (
      not p_only_waved
      or exists (
        select 1
        from public.waves w
        where coalesce(w.to_user_id, w.receiver_id) = p_user_id
          and coalesce(w.from_user_id, w.sender_id) = hf.id
      )
    )
    and (
      not p_active_only
      or hf.effective_last_active_at >= now() - interval '7 days'
    )
),
pool_stats as (
  select
    count(*)::int as eligible_pool_count,
    max(cap_target)::int as cap_target
  from filter_gated
),
freshness_gated as (
  select
    fg.*,
    ps.eligible_pool_count,
    ps.cap_target,
    case when ps.eligible_pool_count < ps.cap_target then 30 else 14 end as freshness_days
  from filter_gated fg
  cross join pool_stats ps
  where fg.effective_last_active_at >= now() - interval '30 days'
    and fg.effective_last_active_at >= now() - make_interval(days => case when ps.eligible_pool_count < ps.cap_target then 30 else 14 end)
),
viewer_behavior as (
  with viewer_recent_decisions as (
    select
      d.matched_user_id
    from public.discover_match_seen d
    join viewer v0 on v0.id = d.viewer_id
    order by d.seen_at desc nulls last
    limit 50
  )
  select
    v.id as viewer_id,
    v.viewer_account_age_days,
    coalesce((
      select count(*)::int
      from viewer_recent_decisions
    ), 0) as reviewed_count,
    coalesce((
      select count(*)::int
      from viewer_recent_decisions d
      where exists (
        select 1
        from public.waves w
        where coalesce(w.from_user_id, w.sender_id) = v.id
          and coalesce(w.to_user_id, w.receiver_id) = d.matched_user_id
      )
    ), 0) as waved_count
  from viewer v
),
scored as (
  select
    fg.*,
    -- A. Pet fit (0..70)
    (
      case
        when fg.viewer_primary_species is not null and fg.primary_species is not null and fg.viewer_primary_species = fg.primary_species then 35
        when coalesce(array_length(fg.viewer_species_list, 1), 0) > 0 and coalesce(array_length(fg.combined_species_norm, 1), 0) > 0 and fg.viewer_species_list && fg.combined_species_norm then 22
        when coalesce(array_length(fg.viewer_species_list, 1), 0) > 0 and coalesce(array_length(fg.combined_species_norm, 1), 0) > 0 then 10
        else 0
      end
      + case
          when fg.pet_size is null then 0
          when fg.pet_size = p_pet_size then 10
          when (fg.pet_size = 'Small' and p_pet_size = 'Medium') or (fg.pet_size = 'Medium' and p_pet_size in ('Small','Large')) or (fg.pet_size = 'Large' and p_pet_size = 'Medium') then 5
          when p_pet_size is null or trim(p_pet_size) = '' or lower(trim(p_pet_size)) = 'any' then 0
          else 0
        end
      + case
          when coalesce(fg.experience_years, 0) >= 5 then 25
          when coalesce(fg.experience_years, 0) >= 2 then 15
          when coalesce(fg.experience_years, 0) > 0 or coalesce(array_length(fg.pet_experience, 1), 0) > 0 then 8
          else 0
        end
    )::numeric as pet_fit_score,

    -- B. Proximity & readiness (0..35)
    (
      case
        when fg.distance_m is null then 0
        when fg.distance_m <= 1000 then 20
        when fg.distance_m <= 3000 then 16
        when fg.distance_m <= 5000 then 12
        when fg.distance_m <= 10000 then 8
        when fg.distance_m <= 25000 then 5
        else 2
      end
      + case when fg.has_car then 5 else 0 end
      + case
          when fg.candidate_location_updated_at is not null and fg.candidate_location_updated_at >= now() - interval '15 minutes' then 10
          when fg.candidate_location_updated_at is not null and fg.candidate_location_updated_at >= now() - interval '12 hours' then 8
          when fg.candidate_geog is not null then 3
          else 0
        end
    )::numeric as proximity_score,

    -- C. Trust & quality (0..30)
    (
      case when lower(coalesce(fg.verification_status::text, '')) = 'verified' then 15 else 0 end
      + case when fg.album_count > 0 then 5 else 0 end
      + case when fg.bio_non_space_len >= 30 then 5 else 0 end
      + case
          when fg.integrity_fields >= 4 then 5
          when fg.integrity_fields >= 2 then 3
          when fg.integrity_fields >= 1 then 1
          else 0
        end
    )::numeric as trust_quality_score,

    -- D. Role intent (0..15)
    (
      case
        when p_role is not null and trim(p_role) <> '' and fg.social_role = p_role then 10
        else 0
      end
      + case
          when p_role is null or trim(p_role) = '' then
            case
              when fg.social_role in ('Veterinarian', 'Vet Nurse', 'Pet Groomer', 'Pet Photographer', 'Pet Nanny', 'Volunteer') then 5
              when fg.social_role in ('Pet Parent', 'Animal Friend (No Pet)') then 3
              else 0
            end
          else 0
        end
    )::numeric as role_intent_score,

    -- E. Freshness (0..20)
    (
      case
        when fg.effective_last_active_at >= now() - interval '24 hours' then 20
        when fg.effective_last_active_at >= now() - interval '3 days' then 15
        when fg.effective_last_active_at >= now() - interval '7 days' then 10
        when fg.effective_last_active_at >= now() - interval '14 days' then 5
        else 1
      end
    )::numeric as freshness_score,

    -- F. Compatibility (0..10)
    (
      case
        when exists (
          select 1
          from unnest(coalesce(fg.viewer_languages, '{}'::text[])) vl
          join unnest(coalesce(fg.languages, '{}'::text[])) cl
            on lower(trim(vl)) = lower(trim(cl))
        ) then 5 else 0
      end
      + case
          when fg.viewer_relationship_status is not null and trim(fg.viewer_relationship_status) <> '' and fg.relationship_status = fg.viewer_relationship_status then 3
          else 0
        end
      + case
          when fg.viewer_orientation is not null and trim(fg.viewer_orientation) <> '' and fg.orientation = fg.viewer_orientation then 2
          else 0
        end
    )::numeric as compatibility_score,

    -- G. Connection (0..5)
    (
      case
        when exists (
          select 1
          from public.waves w
          where coalesce(w.to_user_id, w.receiver_id) = p_user_id
            and coalesce(w.from_user_id, w.sender_id) = fg.id
        ) then 5 else 0
      end
    )::numeric as connection_score,

    fg.tier_boost_score::numeric as tier_boost_component,

    (
      case
        when vb.viewer_account_age_days < 3 then 0
        when fg.eligible_pool_count < 30 then 0
        when vb.reviewed_count < 30 then 0
        when vb.reviewed_count > 0 and (vb.waved_count::numeric / vb.reviewed_count::numeric) = 1 then 10
        when vb.reviewed_count > 0 and (vb.waved_count::numeric / vb.reviewed_count::numeric) >= 0.9 then 5
        else 0
      end
    )::numeric as wave_spam_penalty_component
  from freshness_gated fg
  cross join viewer_behavior vb
),
final_ranked as (
  select
    s.*,
    (
      s.pet_fit_score
      + s.proximity_score
      + s.trust_quality_score
      + s.role_intent_score
      + s.freshness_score
      + s.compatibility_score
      + s.connection_score
      + s.tier_boost_component
      - s.wave_spam_penalty_component
    )::numeric as final_score
  from scored s
)
select
  fr.id,
  fr.display_name,
  fr.avatar_url,
  (lower(coalesce(fr.verification_status::text, '')) = 'verified') as is_verified,
  fr.has_car,
  fr.bio,
  fr.relationship_status,
  fr.dob,
  fr.location_name,
  fr.occupation,
  fr.school,
  fr.major,
  fr.gender_genre,
  fr.orientation,
  fr.height,
  fr.weight,
  fr.weight_unit,
  fr.tier::text,
  fr.pets,
  fr.pet_species,
  fr.pet_size,
  fr.social_album,
  fr.show_occupation,
  fr.show_academic,
  fr.show_bio,
  fr.show_relationship_status,
  fr.show_age,
  fr.show_gender,
  fr.show_orientation,
  fr.show_height,
  fr.show_weight,
  fr.social_role,
  fr.final_score as score
from final_ranked fr
order by fr.final_score desc, fr.freshness_score desc, fr.distance_m asc nulls last, fr.created_at desc
limit (select cap_target from viewer limit 1);
$$;

revoke all on function public.social_discovery(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean, numeric, numeric, boolean, boolean) from anon;
grant execute on function public.social_discovery(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean, numeric, numeric, boolean, boolean) to authenticated;
grant execute on function public.social_discovery(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean, numeric, numeric, boolean, boolean) to service_role;
