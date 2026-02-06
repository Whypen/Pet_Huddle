-- UAT: Fix schema cache mismatch between app and DB.
-- App expects thread_comments.content; initial schema used thread_comments.text.

alter table public.thread_comments
  add column if not exists content text;

update public.thread_comments
set content = coalesce(content, text)
where content is null;

alter table public.thread_comments
  alter column content set default '',
  alter column content set not null;

create or replace function public.sync_thread_comment_content()
returns trigger
language plpgsql
as $$
begin
  -- Keep legacy column and new column in sync.
  if new.content is null or new.content = '' then
    new.content := coalesce(new.text, '');
  end if;
  if new.text is null or new.text = '' then
    new.text := new.content;
  end if;
  return new;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_sync_thread_comment_content') then
    create trigger trg_sync_thread_comment_content
    before insert or update on public.thread_comments
    for each row
    execute function public.sync_thread_comment_content();
  end if;
end $$;

