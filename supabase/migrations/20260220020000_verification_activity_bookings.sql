-- Align verification status enum to unverified/pending/verified
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'verification_status_enum_new'
  ) THEN
    CREATE TYPE public.verification_status_enum_new AS ENUM ('unverified', 'pending', 'verified');
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_non_admin_verification ON public.profiles;
DROP TRIGGER IF EXISTS trg_queue_identity_cleanup ON public.profiles;

ALTER TABLE public.profiles
  ALTER COLUMN verification_status DROP DEFAULT;

ALTER TABLE public.profiles
  ALTER COLUMN verification_status TYPE public.verification_status_enum_new
  USING (
    CASE
      WHEN verification_status IS NULL THEN NULL
      WHEN verification_status::text IN ('approved', 'verified') THEN 'verified'::public.verification_status_enum_new
      WHEN verification_status::text IN ('rejected', 'unverified', 'not_submitted') THEN 'unverified'::public.verification_status_enum_new
      WHEN verification_status::text = 'pending' THEN 'pending'::public.verification_status_enum_new
      ELSE NULL
    END
  );

DROP TYPE IF EXISTS public.verification_status_enum_old;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'verification_status_enum'
  ) THEN
    ALTER TYPE public.verification_status_enum RENAME TO verification_status_enum_old;
  END IF;
  ALTER TYPE public.verification_status_enum_new RENAME TO verification_status_enum;
END $$;

ALTER TABLE public.profiles
  ALTER COLUMN verification_status SET DEFAULT 'unverified'::public.verification_status_enum;

DROP TYPE IF EXISTS public.verification_status_enum_old;

COMMENT ON COLUMN public.profiles.verification_status IS 'Status of identity verification: unverified, pending, verified.';
COMMENT ON COLUMN public.profiles.verification_comment IS 'Admin review comment for verification (pending/verified/unverified).';

-- Migrate verification upload statuses
UPDATE public.verification_uploads
SET status = CASE
  WHEN status = 'approved' THEN 'verified'
  WHEN status = 'rejected' THEN 'unverified'
  ELSE status
END;

ALTER TABLE public.verification_uploads
  DROP CONSTRAINT IF EXISTS verification_uploads_status_check;
ALTER TABLE public.verification_uploads
  ADD CONSTRAINT verification_uploads_status_check
  CHECK (status = ANY (ARRAY['pending', 'verified', 'unverified']));

-- Activity tracking (server computed)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

UPDATE public.profiles
SET last_active_at = COALESCE(last_active_at, last_login)
WHERE last_active_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_last_active_at ON public.profiles (last_active_at DESC);

CREATE OR REPLACE FUNCTION public.touch_last_active_at()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET last_active_at = now()
  WHERE id = auth.uid();
END;
$$;

-- Bookings compatibility view
CREATE OR REPLACE VIEW public.bookings AS
SELECT * FROM public.marketplace_bookings;

-- Verification guardrail updates
CREATE OR REPLACE FUNCTION public.prevent_non_admin_verification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.verification_status = 'verified' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
    ) THEN
      RAISE EXCEPTION 'Only admins can verify users';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_sensitive_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  role text := (auth.jwt() ->> 'role');
  is_admin boolean := false;
  allowed_kyc_transition boolean := false;
  admin_verification_transition boolean := false;
BEGIN
  IF role = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT (p.is_admin = true OR p.role = 'admin')
    INTO is_admin
  FROM public.profiles p
  WHERE p.id = auth.uid();

  allowed_kyc_transition :=
    (old.verification_status IS NULL OR old.verification_status = 'unverified'::public.verification_status_enum)
    AND (new.verification_status = 'pending'::public.verification_status_enum);

  admin_verification_transition :=
    is_admin
    AND new.verification_status IS DISTINCT FROM old.verification_status
    AND new.verification_status IN (
      'verified'::public.verification_status_enum,
      'unverified'::public.verification_status_enum
    );

  IF new.verification_status = 'verified'::public.verification_status_enum AND NOT is_admin THEN
    RAISE EXCEPTION 'forbidden_profile_update';
  END IF;

  IF (new.legal_name IS DISTINCT FROM old.legal_name) AND NOT allowed_kyc_transition THEN
    RAISE EXCEPTION 'forbidden_profile_update';
  END IF;

  IF (new.tier IS DISTINCT FROM old.tier)
     OR (new.subscription_status IS DISTINCT FROM old.subscription_status)
     OR (new.subscription_cycle_anchor_day IS DISTINCT FROM old.subscription_cycle_anchor_day)
     OR (new.subscription_current_period_start IS DISTINCT FROM old.subscription_current_period_start)
     OR (new.subscription_current_period_end IS DISTINCT FROM old.subscription_current_period_end)
     OR ((new.verification_comment IS DISTINCT FROM old.verification_comment) AND NOT admin_verification_transition)
     OR (new.family_slots IS DISTINCT FROM old.family_slots)
     OR (new.media_credits IS DISTINCT FROM old.media_credits)
     OR (new.stars_count IS DISTINCT FROM old.stars_count)
     OR (new.mesh_alert_count IS DISTINCT FROM old.mesh_alert_count)
     OR ((new.verification_status IS DISTINCT FROM old.verification_status)
         AND NOT allowed_kyc_transition
         AND NOT admin_verification_transition)
  THEN
    RAISE EXCEPTION 'forbidden_profile_update';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_identity_cleanup()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (old.verification_status = 'pending'::public.verification_status_enum)
     AND (new.verification_status IN ('verified'::public.verification_status_enum, 'unverified'::public.verification_status_enum))
     AND new.verification_document_url IS NOT NULL
  THEN
    INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
    VALUES (new.id, new.verification_document_url, now() + interval '7 days');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_non_admin_verification ON public.profiles;
CREATE TRIGGER trg_prevent_non_admin_verification
BEFORE UPDATE OF verification_status ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_non_admin_verification();

DROP TRIGGER IF EXISTS trg_queue_identity_cleanup ON public.profiles;
CREATE TRIGGER trg_queue_identity_cleanup
AFTER UPDATE OF verification_status ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.queue_identity_cleanup();

CREATE OR REPLACE FUNCTION public.purge_expired_verification_docs()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'identity_verification'
  AND name IN (
    SELECT verification_document_url
    FROM public.profiles
    WHERE verification_status IN ('verified', 'unverified')
    AND updated_at < now() - interval '7 days'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_identity_review(target_user_id uuid, action text, notes text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin uuid;
  v_is_admin boolean;
  v_upload record;
  v_action text;
  v_decision text;
BEGIN
  v_admin := auth.uid();

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin;

  INSERT INTO public.admin_audit_logs (actor_id, action, target_user_id, notes)
  VALUES (v_admin, 'kyc_review_attempt', target_user_id, notes);

  IF v_is_admin IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF action IN ('verify', 'verified') THEN
    v_decision := 'verified';
  ELSIF action IN ('unverify', 'unverified') THEN
    v_decision := 'unverified';
  ELSE
    RAISE EXCEPTION 'Invalid action: %', action;
  END IF;

  SELECT *
  INTO v_upload
  FROM public.verification_uploads
  WHERE user_id = target_user_id AND status = 'pending'
  ORDER BY uploaded_at DESC
  LIMIT 1;

  IF v_upload IS NULL THEN
    RAISE EXCEPTION 'No pending upload';
  END IF;

  IF v_decision = 'verified' THEN
    UPDATE public.profiles AS prof
      SET verification_status = 'verified'::public.verification_status_enum,
          verification_comment = NULL
    WHERE prof.id = target_user_id;

    UPDATE public.verification_uploads AS vu
      SET status = 'verified',
          reviewed_by = v_admin,
          reviewed_at = now(),
          rejection_reason = NULL
    WHERE vu.id = v_upload.id;

    INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
    VALUES (target_user_id, v_upload.document_url, now() + interval '7 days');

    IF v_upload.selfie_url IS NOT NULL THEN
      INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
      VALUES (target_user_id, v_upload.selfie_url, now() + interval '7 days');
    END IF;

    v_action := 'kyc_verified';
  ELSE
    UPDATE public.profiles AS prof
      SET verification_status = 'unverified'::public.verification_status_enum,
          verification_comment = notes
    WHERE prof.id = target_user_id;

    UPDATE public.verification_uploads AS vu
      SET status = 'unverified',
          reviewed_by = v_admin,
          reviewed_at = now(),
          rejection_reason = notes
    WHERE vu.id = v_upload.id;

    v_action := 'kyc_unverified';
  END IF;

  INSERT INTO public.admin_audit_logs (actor_id, action, target_user_id, notes)
  VALUES (v_admin, v_action, target_user_id, notes);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_verification_status(p_user_id uuid, p_decision text, p_comment text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin boolean;
  v_role text;
  v_action text;
  v_actor_social_id text;
  v_target_social_id text;
  v_upload record;
BEGIN
  SELECT is_admin, role, social_id
    INTO v_is_admin, v_role, v_actor_social_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT (v_is_admin IS TRUE OR v_role = 'admin') THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  SELECT social_id
    INTO v_target_social_id
  FROM public.profiles
  WHERE id = p_user_id;

  IF p_decision NOT IN ('verified', 'unverified') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;

  SELECT *
    INTO v_upload
  FROM public.verification_uploads
  WHERE user_id = p_user_id
  ORDER BY uploaded_at DESC
  LIMIT 1;

  IF p_decision = 'verified' THEN
    UPDATE public.profiles
    SET
      verification_status = 'verified'::public.verification_status_enum,
      verification_comment = p_comment
    WHERE id = p_user_id;
    v_action := 'kyc_verified';
  ELSE
    UPDATE public.profiles
    SET
      verification_status = 'unverified'::public.verification_status_enum,
      verification_comment = p_comment
    WHERE id = p_user_id;
    v_action := 'kyc_unverified';
  END IF;

  IF v_upload.id IS NOT NULL THEN
    IF p_decision = 'verified' THEN
      UPDATE public.verification_uploads
      SET
        status = 'verified',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        rejection_reason = NULL,
        archived_at = NULL,
        archived_by = NULL
      WHERE id = v_upload.id;
    ELSE
      UPDATE public.verification_uploads
      SET
        status = 'unverified',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        rejection_reason = p_comment,
        archived_at = NULL,
        archived_by = NULL
      WHERE id = v_upload.id;
    END IF;

    IF v_upload.document_url IS NOT NULL THEN
      INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
      VALUES (p_user_id, v_upload.document_url, now() + interval '7 days');
    END IF;

    IF v_upload.selfie_url IS NOT NULL THEN
      INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
      VALUES (p_user_id, v_upload.selfie_url, now() + interval '7 days');
    END IF;
  END IF;

  INSERT INTO public.admin_audit_logs (
    actor_id,
    target_user_id,
    action,
    notes,
    created_at,
    actor_social_id,
    target_social_id
  )
  VALUES (
    auth.uid(),
    p_user_id,
    v_action,
    p_comment,
    now(),
    v_actor_social_id,
    v_target_social_id
  );

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id, 'decision', p_decision);
END;
$$;

-- Threads score uses verified status
CREATE OR REPLACE FUNCTION public.update_threads_scores()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.threads t
  SET score = (
    (EXTRACT(EPOCH FROM (now() - t.created_at)) / 86400.0) * 10
    +
    CASE
      WHEN (
        (p.care_circle IS NOT NULL AND array_length(p.care_circle, 1) > 0)
        OR EXISTS (
          SELECT 1
          FROM public.family_members fm
          WHERE fm.status = 'accepted'
            AND (fm.inviter_user_id = p.id OR fm.invitee_user_id = p.id)
        )
      ) THEN 20
      ELSE 0
    END
    +
    CASE WHEN p.verification_status = 'verified'::public.verification_status_enum THEN 50 ELSE 0 END
    +
    CASE WHEN p.tier = 'gold' THEN 30 ELSE 0 END
    +
    ((SELECT count(*) FROM public.thread_comments c WHERE c.thread_id = t.id) * 5)
    + (COALESCE(t.likes, 0) * 3)
    + (COALESCE(t.clicks, 0) * 1)
    -
    (ln(EXTRACT(day FROM (now() - t.created_at)) + 1) * 5)
  )
  FROM public.profiles p
  WHERE p.id = t.user_id;
END;
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
    p.tier,
    p.effective_tier
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
    tier,
    effective_tier,
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
