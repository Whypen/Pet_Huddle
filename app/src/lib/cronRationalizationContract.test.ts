import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/20260812124711_rationalize_cron_and_bound_history.sql'),
  'utf8',
);

describe('cron rationalization contract', () => {
  it('removes the confirmed legacy no-op worker', () => {
    expect(migration).toContain("jobname = 'process_map_alert_notifications_minutely'");
    expect(migration).toContain('cron.unschedule');
  });

  it('indexes each remaining deadline-sensitive candidate lookup', () => {
    expect(migration).toContain('notification_aggregation_windows_initial_due_idx');
    expect(migration).toContain('notification_aggregation_windows_digest_due_idx');
    expect(migration).toContain('service_chats_no_start_candidates_idx');
    expect(migration).toContain('service_chats_no_start_refund_candidates_idx');
  });

  it('retains seven days of run evidence and prunes in bounded batches', () => {
    expect(migration).toContain("interval '7 days'");
    expect(migration).toContain('limit p_batch_size');
    expect(migration).toContain("'prune-cron-history-hourly'");
    expect(migration).toContain('50000');
  });

  it('does not expose the maintenance function to clients', () => {
    expect(migration).toContain('revoke all on function public.prune_cron_job_run_details');
    expect(migration).toContain('from anon, authenticated');
  });
});
