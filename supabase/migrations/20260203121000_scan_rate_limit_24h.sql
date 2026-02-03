-- Update scan rate limit to 3 per 24 hours for free tier

CREATE OR REPLACE FUNCTION check_scan_rate_limit(
  user_uuid UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  user_tier TEXT;
  recent_scans INT;
BEGIN
  SELECT tier INTO user_tier
  FROM profiles
  WHERE id = user_uuid;

  IF user_tier IN ('premium', 'gold') THEN
    RETURN TRUE;
  END IF;

  SELECT COUNT(*) INTO recent_scans
  FROM scan_rate_limits
  WHERE user_id = user_uuid
    AND scan_timestamp > NOW() - INTERVAL '24 hours';

  RETURN recent_scans < 3;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_scan_rate_limit IS 'Validates if user can perform a scan based on tier and recent usage (3 scans per 24 hours for free tier).';
