-- Maintain map_alerts support_count and report_count from alert_interactions.

create or replace function public.map_alerts_apply_interaction_counts()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' then
    if new.interaction_type = 'support' then
      update public.map_alerts set support_count = coalesce(support_count, 0) + 1 where id = new.alert_id;
    elsif new.interaction_type = 'report' then
      update public.map_alerts set report_count = coalesce(report_count, 0) + 1 where id = new.alert_id;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.interaction_type = 'support' then
      update public.map_alerts set support_count = greatest(0, coalesce(support_count, 0) - 1) where id = old.alert_id;
    elsif old.interaction_type = 'report' then
      update public.map_alerts set report_count = greatest(0, coalesce(report_count, 0) - 1) where id = old.alert_id;
    end if;
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_alert_interactions_counts_ins on public.alert_interactions;
create trigger trg_alert_interactions_counts_ins
after insert on public.alert_interactions
for each row
execute function public.map_alerts_apply_interaction_counts();

drop trigger if exists trg_alert_interactions_counts_del on public.alert_interactions;
create trigger trg_alert_interactions_counts_del
after delete on public.alert_interactions
for each row
execute function public.map_alerts_apply_interaction_counts();

