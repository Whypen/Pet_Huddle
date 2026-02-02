-- CREATE EMERGENCY_LOGS TABLE
-- Tracks all mesh-alert notifications for testing and debugging
-- Used when FCM keys are missing to log MOCK_SENT status

CREATE TABLE IF NOT EXISTS emergency_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES lost_pet_alerts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('ALERT_CREATED', 'FCM_SENT', 'MOCK_SENT', 'ALERT_RESOLVED')),
  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILURE', 'PENDING')),
  recipients_count INT DEFAULT 0,
  success_count INT DEFAULT 0,
  failure_count INT DEFAULT 0,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for alert history queries
CREATE INDEX idx_emergency_logs_alert_id ON emergency_logs(alert_id);
CREATE INDEX idx_emergency_logs_created_at ON emergency_logs(created_at DESC);
CREATE INDEX idx_emergency_logs_event_type ON emergency_logs(event_type);

-- Enable RLS
ALTER TABLE emergency_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view logs for their own alerts
CREATE POLICY "users_view_own_emergency_logs"
  ON emergency_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lost_pet_alerts
      WHERE lost_pet_alerts.id = emergency_logs.alert_id
      AND lost_pet_alerts.owner_id = auth.uid()
    )
  );

-- Policy: Service role can insert logs (Edge Function)
CREATE POLICY "service_role_insert_emergency_logs"
  ON emergency_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Policy: Service role can update logs (for status changes)
CREATE POLICY "service_role_update_emergency_logs"
  ON emergency_logs
  FOR UPDATE
  USING (auth.role() = 'service_role');

COMMENT ON TABLE emergency_logs IS 'Emergency event logs for mesh-alert system. Includes MOCK_SENT entries for testing when FCM keys are not configured.';
