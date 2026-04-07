-- Add service_rank_weight to pet_care_profiles for tier-as-tiebreaker ranking.
-- Gold=20, Plus=10, Free=0. Kept current by trigger on profiles.effective_tier.

ALTER TABLE pet_care_profiles
  ADD COLUMN IF NOT EXISTS service_rank_weight integer NOT NULL DEFAULT 0;

-- Back-fill from current effective_tier
UPDATE pet_care_profiles p
SET service_rank_weight = CASE
  WHEN pr.effective_tier = 'gold' THEN 20
  WHEN pr.effective_tier = 'plus' THEN 10
  ELSE 0
END
FROM profiles pr
WHERE pr.id = p.user_id;

-- Trigger function
CREATE OR REPLACE FUNCTION sync_service_rank_weight()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE pet_care_profiles
  SET service_rank_weight = CASE
    WHEN NEW.effective_tier = 'gold' THEN 20
    WHEN NEW.effective_tier = 'plus' THEN 10
    ELSE 0
  END
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_service_rank_weight ON profiles;
CREATE TRIGGER trg_sync_service_rank_weight
  AFTER UPDATE OF effective_tier, tier ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_service_rank_weight();
