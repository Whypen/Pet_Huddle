-- Bug fix: the partial unique index WHERE is_scored=true permanently blocks
-- a reporter from ever re-reporting the same target after 30 days.
-- The application-level 30-day check in process_user_report() is the correct
-- dedup mechanism. Drop the unique constraint and use a non-unique index instead.
drop index if exists public.user_reports_dedup_idx;

create index if not exists user_reports_reporter_target_idx
  on public.user_reports (reporter_id, target_id, window_start desc)
  where is_scored = true;
