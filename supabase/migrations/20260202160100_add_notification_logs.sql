-- CREATE NOTIFICATION_LOGS TABLE
-- Referenced by mesh-alert Edge Function for tracking notification delivery

CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES lost_pet_alerts(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('mesh_alert', 'emergency', 'system')),
  recipients_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  failure_count INT NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for alert history queries
CREATE INDEX idx_notification_logs_alert_id ON notification_logs(alert_id);
CREATE INDEX idx_notification_logs_created_at ON notification_logs(created_at DESC);

-- Enable RLS
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view logs for their own alerts
CREATE POLICY "users_view_own_notification_logs"
  ON notification_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lost_pet_alerts
      WHERE lost_pet_alerts.id = notification_logs.alert_id
      AND lost_pet_alerts.owner_id = auth.uid()
    )
  );

-- Policy: Service role can insert logs (Edge Function)
CREATE POLICY "service_role_insert_notification_logs"
  ON notification_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE notification_logs IS 'Tracks mesh-alert and emergency notification delivery for analytics and debugging';
