-- Adds 'family_invite' to the notifications type column.
-- Uses DROP/ADD pattern to extend the check constraint safely.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (
    type in (
      'wave','star','match','message','group_invite','broadcast','mention',
      'thread_reply','booking','system','family_invite'
    )
  );
