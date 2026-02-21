begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tier_enum') then
    create type public.tier_enum as enum ('free', 'plus', 'gold');
  end if;
end $$;

alter table public.profiles
  add column if not exists tier public.tier_enum;

alter table public.profiles
  add column if not exists effective_tier public.tier_enum;

alter table public.profiles
  drop constraint if exists profiles_tier_check;

alter table public.profiles
  drop constraint if exists profiles_membership_tier_check;

update public.profiles
set tier = (
    case
      when tier is null or tier::text = '' then
        case
          when membership_tier is not null and membership_tier::text <> '' then membership_tier::text
          else 'free'
        end
      when tier::text = 'premium' then 'plus'
      else tier::text
    end
  )::public.tier_enum
where tier is null
   or tier::text in ('', 'premium')
   or membership_tier is not null;

update public.profiles
set effective_tier = coalesce(
    effective_tier,
    (
      case
        when tier is null or tier::text = '' then
          case
            when membership_tier is not null and membership_tier::text <> '' then membership_tier::text
            else 'free'
          end
        when tier::text = 'premium' then 'plus'
        else tier::text
      end
    )::public.tier_enum,
    'free'::public.tier_enum
  )
where effective_tier is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'tier'
      and udt_name <> 'tier_enum'
  ) then
    execute $sql$
      alter table public.profiles
        alter column tier drop default;
      alter table public.profiles
        alter column tier type public.tier_enum
        using (
          case
            when tier is null or tier::text = '' then
              case
                when membership_tier is not null and membership_tier::text <> '' then membership_tier::text
                else 'free'
              end
            when tier::text = 'premium' then 'plus'
            else tier::text
          end
        )::public.tier_enum
    $sql$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'effective_tier'
      and udt_name <> 'tier_enum'
  ) then
    execute $sql$
      alter table public.profiles
        alter column effective_tier type public.tier_enum
        using (
          case
            when effective_tier is null or effective_tier::text = '' then 'free'
            when effective_tier::text = 'premium' then 'plus'
            else effective_tier::text
          end
        )::public.tier_enum
    $sql$;
  end if;
end $$;

alter table public.profiles
  alter column tier set default 'free'::public.tier_enum;

alter table public.profiles
  alter column effective_tier set default 'free'::public.tier_enum;

drop index if exists idx_profiles_membership_tier;

alter table public.profiles
  drop column if exists membership_tier;

update public.profiles
set verification_status = 'unverified'::public.verification_status_enum
where verification_status is null;

alter table public.profiles
  alter column verification_status set default 'unverified'::public.verification_status_enum;

alter table public.profiles
  alter column verification_status set not null;

create or replace function public.update_threads_scores()
returns void
language plpgsql
as $$
begin
  update public.threads t
  set score = (
    (extract(epoch from (now() - t.created_at)) / 86400.0) * 10
    +
    case
      when (
        (p.care_circle is not null and array_length(p.care_circle, 1) > 0)
        or exists (
          select 1
          from public.family_members fm
          where fm.status = 'accepted'
            and (fm.inviter_user_id = p.id or fm.invitee_user_id = p.id)
        )
      ) then 20
      else 0
    end
    +
    case when p.verification_status = 'verified'::public.verification_status_enum then 50 else 0 end
    +
    case when p.tier = 'gold'::public.tier_enum then 30 else 0 end
    +
    ((select count(*) from public.thread_comments c where c.thread_id = t.id) * 5)
    + (coalesce(t.likes, 0) * 3)
    + (coalesce(t.clicks, 0) * 1)
    -
    (ln(extract(day from (now() - t.created_at)) + 1) * 5)
  )
  from public.profiles p
  where p.id = t.user_id;
end;
$$;

-- Social discovery (minimal + advanced)
DROP FUNCTION IF EXISTS public.social_discovery(uuid,double precision,double precision,integer,integer,integer);
DROP FUNCTION IF EXISTS public.social_discovery(uuid,double precision,double precision,integer,integer,integer,text,text,text[],text,boolean,numeric,numeric,boolean,boolean);

CREATE OR REPLACE FUNCTION public.social_discovery(
  p_user_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer,
  p_min_age integer,
  p_max_age integer
)
RETURNS TABLE(
  id uuid,
  display_name text,
  avatar_url text,
  verification_status text,
  has_car boolean,
  bio text,
  last_lat double precision,
  last_lng double precision,
  tier text,
  effective_tier text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    p.verification_status::text,
    p.has_car,
    p.bio,
    p.last_lat,
    p.last_lng,
    p.tier::text,
    p.effective_tier::text
  FROM public.profiles p
  WHERE p.id <> p_user_id
    AND p.dob IS NOT NULL
    AND (EXTRACT(YEAR FROM age(current_date, p.dob)) BETWEEN p_min_age AND p_max_age)
    AND p.location_geog IS NOT NULL
    AND ST_DWithin(
      p.location_geog,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_m
    )
  ORDER BY (p.verification_status = 'verified') DESC, p.created_at DESC
  LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION public.social_discovery(
  p_user_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer,
  p_min_age integer,
  p_max_age integer,
  p_role text DEFAULT NULL::text,
  p_gender text DEFAULT NULL::text,
  p_species text[] DEFAULT NULL::text[],
  p_pet_size text DEFAULT NULL::text,
  p_advanced boolean DEFAULT false,
  p_height_min numeric DEFAULT NULL::numeric,
  p_height_max numeric DEFAULT NULL::numeric,
  p_only_waved boolean DEFAULT false,
  p_recently_active boolean DEFAULT false
)
RETURNS TABLE(
  id uuid,
  display_name text,
  avatar_url text,
  verification_status text,
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
  effective_tier text,
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
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH viewer_base AS (
    SELECT
      p.id,
      p.relationship_status,
      p.care_circle,
      COALESCE(p.effective_tier::text, p.tier::text, 'free') AS effective_tier,
      p.last_active_at
    FROM public.profiles p
    WHERE p.id = p_user_id
  ),
  flags AS (
    SELECT
      vb.*,
      (vb.effective_tier IN ('plus','gold')) AS adv_allowed,
      (vb.effective_tier = 'gold') AS gold_allowed,
      CASE WHEN vb.effective_tier IN ('plus','gold') THEN 200 ELSE 40 END AS max_rows
    FROM viewer_base vb
  ),
  pet_data AS (
    SELECT
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
      ) AS pets,
      array_remove(array_agg(DISTINCT species), NULL) AS pet_species,
      max(
        CASE
          WHEN weight IS NULL THEN NULL
          WHEN weight_unit = 'lb' THEN weight * 0.453592
          ELSE weight
        END
      ) AS max_weight_kg
    FROM public.pets
    WHERE is_active = true
    GROUP BY owner_id
  ),
  base AS (
    SELECT
      p.*,
      pd.pets,
      pd.pet_species,
      pd.max_weight_kg,
      CASE
        WHEN sp.user_id IS NOT NULL THEN 'nannies'
        WHEN p.owns_pets THEN 'playdates'
        ELSE 'animal-lovers'
      END AS social_role
    FROM public.profiles p
    LEFT JOIN public.sitter_profiles sp ON sp.user_id = p.id
    LEFT JOIN pet_data pd ON pd.owner_id = p.id
    WHERE p.id <> p_user_id
  ),
  filtered AS (
    SELECT
      b.*,
      CASE
        WHEN b.max_weight_kg IS NULL THEN NULL
        WHEN b.max_weight_kg <= 9 THEN 'Small'
        WHEN b.max_weight_kg <= 22 THEN 'Medium'
        ELSE 'Large'
      END AS pet_size
    FROM base b
  ),
  scored AS (
    SELECT
      f.*,
      (
        CASE
          WHEN p_species IS NOT NULL
            AND array_length(p_species, 1) > 0
            AND f.pet_species && p_species THEN 100
          ELSE 0
        END
        + CASE WHEN (p_advanced AND fl.adv_allowed) AND f.verification_status = 'verified' THEN 50 ELSE 0 END
        + CASE WHEN (p_advanced AND fl.adv_allowed) AND fl.relationship_status IS NOT NULL AND f.relationship_status = fl.relationship_status THEN 30 ELSE 0 END
        + CASE WHEN (p_advanced AND fl.adv_allowed) AND (f.has_car OR COALESCE(f.experience_years, 0) > 0 OR array_length(f.pet_experience, 1) > 0) THEN 30 ELSE 0 END
        + CASE WHEN (p_advanced AND fl.adv_allowed) AND (f.social_availability = true OR array_length(f.availability_status, 1) > 0) THEN 20 ELSE 0 END
        + CASE WHEN (p_advanced AND fl.adv_allowed) AND (
            f.id = ANY(fl.care_circle)
            OR EXISTS (
              SELECT 1 FROM public.family_members fm
              WHERE fm.status = 'accepted'
                AND (
                  (fm.inviter_user_id = fl.id AND fm.invitee_user_id = f.id)
                  OR (fm.inviter_user_id = f.id AND fm.invitee_user_id = fl.id)
                )
            )
          ) THEN 20 ELSE 0 END
      ) AS score,
      CASE
        WHEN COALESCE(f.effective_tier::text, f.tier::text, 'free') = 'gold' THEN 3
        WHEN COALESCE(f.effective_tier::text, f.tier::text, 'free') = 'plus' THEN 2
        ELSE 1
      END AS membership_priority
    FROM filtered f
    CROSS JOIN flags fl
    WHERE f.dob IS NOT NULL
      AND (EXTRACT(YEAR FROM age(current_date, f.dob)) BETWEEN p_min_age AND p_max_age)
      AND (p_gender IS NULL OR p_gender = '' OR p_gender = 'Any' OR f.gender_genre = p_gender)
      AND (p_role IS NULL OR p_role = '' OR f.social_role = p_role)
      AND (p_species IS NULL OR array_length(p_species, 1) = 0 OR f.pet_species && p_species)
      AND (p_pet_size IS NULL OR p_pet_size = '' OR p_pet_size = 'Any' OR f.pet_size = p_pet_size)
      AND (p_height_min IS NULL OR f.height >= p_height_min)
      AND (p_height_max IS NULL OR f.height <= p_height_max)
      AND (COALESCE(f.location, f.location_geog) IS NOT NULL)
      AND ST_DWithin(
        COALESCE(f.location, f.location_geog),
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        p_radius_m
      )
      AND (f.location_retention_until IS NULL OR f.location_retention_until > now())
      AND (
        -- Gold-only filters
        fl.gold_allowed IS FALSE
        OR p_only_waved IS FALSE
        OR EXISTS (
          SELECT 1 FROM public.waves w
          WHERE w.to_user_id = fl.id
            AND w.from_user_id = f.id
        )
      )
      AND (
        fl.gold_allowed IS FALSE
        OR p_recently_active IS FALSE
        OR (f.last_active_at IS NOT NULL AND f.last_active_at >= (now() - interval '7 days'))
      )
  )
  SELECT
    id,
    display_name,
    avatar_url,
    verification_status::text,
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
    tier::text,
    effective_tier::text,
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
  FROM scored
  ORDER BY membership_priority DESC, score DESC NULLS LAST, created_at DESC
  LIMIT (SELECT max_rows FROM flags);
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_display_name text;
  v_legal_name text;
  v_phone text;
  v_social_id text;
begin
  v_display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'User'
  );

  v_legal_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'legal_name'), ''),
    v_display_name
  );

  v_phone := nullif(btrim(coalesce(new.raw_user_meta_data->>'phone', new.phone, '')), '');
  if v_phone is null then
    v_phone := '+0000000000';
  end if;

  v_social_id := nullif(btrim(lower(coalesce(new.raw_user_meta_data->>'social_id', ''))), '');
  if v_social_id is null then
    v_social_id := 'u' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;

  insert into public.profiles (
    id,
    display_name,
    legal_name,
    phone,
    dob,
    social_id,
    verification_status,
    tier,
    effective_tier,
    onboarding_completed
  )
  values (
    new.id,
    v_display_name,
    v_legal_name,
    v_phone,
    (new.raw_user_meta_data->>'dob')::date,
    v_social_id,
    'unverified'::public.verification_status_enum,
    'free'::public.tier_enum,
    'free'::public.tier_enum,
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

commit;
