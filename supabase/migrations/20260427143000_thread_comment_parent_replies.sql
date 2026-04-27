alter table public.thread_comments
  add column if not exists parent_comment_id uuid;

alter table public.thread_comments
  drop constraint if exists thread_comments_parent_comment_id_fkey;

alter table public.thread_comments
  add constraint thread_comments_parent_comment_id_fkey
  foreign key (parent_comment_id)
  references public.thread_comments(id)
  on delete set null;

create index if not exists idx_thread_comments_parent_comment_id
  on public.thread_comments(parent_comment_id);

create or replace function public.enforce_thread_comment_parent_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_thread_id uuid;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  if new.parent_comment_id = new.id then
    raise exception 'thread_comment_parent_self_reference';
  end if;

  select thread_id
    into parent_thread_id
  from public.thread_comments
  where id = new.parent_comment_id;

  if parent_thread_id is null then
    raise exception 'thread_comment_parent_not_found';
  end if;

  if parent_thread_id <> new.thread_id then
    raise exception 'thread_comment_parent_thread_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_thread_comment_parent_scope on public.thread_comments;

create trigger trg_enforce_thread_comment_parent_scope
before insert or update of parent_comment_id, thread_id on public.thread_comments
for each row
execute function public.enforce_thread_comment_parent_scope();
