-- Vouch system: increment vouch_score after completed booking + dispute window

CREATE OR REPLACE FUNCTION award_sitter_vouch()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed'
     AND (OLD.status IS DISTINCT FROM 'completed')
     AND NEW.dispute_flag = FALSE
     AND NEW.escrow_release_date IS NOT NULL
     AND NEW.escrow_release_date <= NOW() THEN
    UPDATE profiles
    SET vouch_score = COALESCE(vouch_score, 0) + 1
    WHERE id = NEW.sitter_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS award_sitter_vouch_trigger ON marketplace_bookings;
CREATE TRIGGER award_sitter_vouch_trigger
  AFTER UPDATE ON marketplace_bookings
  FOR EACH ROW
  EXECUTE FUNCTION award_sitter_vouch();
