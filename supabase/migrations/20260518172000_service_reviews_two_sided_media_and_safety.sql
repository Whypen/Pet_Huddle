-- Service review v2: two-sided reviews, optional media, and low-rating safety dispute routing.
-- This keeps the existing requester review RPC compatible while giving native a richer RPC.

alter table public.service_reviews
  add column if not exists reviewer_role text,
  add column if not exists reviewee_id uuid,
  add column if not exists media_urls text[] not null default '{}'::text[],
  add column if not exists eligible_for_provider_rating boolean not null default true,
  add column if not exists safety_incident_reported boolean not null default false,
  add column if not exists service_dispute_id uuid references public.service_disputes(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'service_reviews_reviewer_role_check'
      and conrelid = 'public.service_reviews'::regclass
  ) then
    alter table public.service_reviews
      add constraint service_reviews_reviewer_role_check
      check (reviewer_role is null or reviewer_role in ('requester', 'provider'));
  end if;
end $$;

create index if not exists idx_service_reviews_reviewee_id
  on public.service_reviews(reviewee_id)
  where reviewee_id is not null;

create index if not exists idx_service_reviews_provider_public_rating
  on public.service_reviews(provider_id, created_at desc)
  where eligible_for_provider_rating is true;

create or replace function public.submit_service_review(
  p_chat_id uuid,
  p_rating integer,
  p_tags text[],
  p_review_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats%rowtype;
  v_reviewer_role text;
  v_reviewee_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_sc
  from public.service_chats
  where chat_id = p_chat_id;

  if v_sc.id is null then
    raise exception 'service_chat_not_found';
  end if;

  if v_sc.status not in ('completed', 'disputed') then
    raise exception 'service_not_completed';
  end if;

  if v_sc.requester_id = v_uid then
    v_reviewer_role := 'requester';
    v_reviewee_id := v_sc.provider_id;
  elsif v_sc.provider_id = v_uid then
    v_reviewer_role := 'provider';
    v_reviewee_id := v_sc.requester_id;
  else
    raise exception 'not_service_participant';
  end if;

  if p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating';
  end if;

  insert into public.service_reviews (
    service_chat_id,
    reviewer_id,
    provider_id,
    rating,
    tags,
    review_text,
    reviewer_role,
    reviewee_id,
    eligible_for_provider_rating,
    media_urls,
    safety_incident_reported
  )
  values (
    v_sc.id,
    v_uid,
    v_sc.provider_id,
    p_rating,
    coalesce(p_tags, '{}'::text[]),
    nullif(btrim(coalesce(p_review_text, '')), ''),
    v_reviewer_role,
    v_reviewee_id,
    v_reviewer_role = 'requester',
    '{}'::text[],
    false
  );
end;
$$;

drop function if exists public.submit_service_review_v2(uuid, integer, text[], text, text[], boolean);

create function public.submit_service_review_v2(
  p_chat_id uuid,
  p_rating integer,
  p_tags text[],
  p_review_text text,
  p_media_urls text[] default '{}'::text[],
  p_safety_incident_reported boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats%rowtype;
  v_reviewer_role text;
  v_reviewee_id uuid;
  v_review_id uuid;
  v_dispute_id uuid;
  v_media_urls text[] := coalesce(p_media_urls, '{}'::text[]);
  v_review_text text := nullif(btrim(coalesce(p_review_text, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_sc
  from public.service_chats
  where chat_id = p_chat_id;

  if v_sc.id is null then
    raise exception 'service_chat_not_found';
  end if;

  if v_sc.status not in ('completed', 'disputed') then
    raise exception 'service_not_completed';
  end if;

  if v_sc.requester_id = v_uid then
    v_reviewer_role := 'requester';
    v_reviewee_id := v_sc.provider_id;
  elsif v_sc.provider_id = v_uid then
    v_reviewer_role := 'provider';
    v_reviewee_id := v_sc.requester_id;
  else
    raise exception 'not_service_participant';
  end if;

  if p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating';
  end if;

  if cardinality(coalesce(p_tags, '{}'::text[])) < 2 then
    raise exception 'minimum_review_tags_required';
  end if;

  insert into public.service_reviews (
    service_chat_id,
    reviewer_id,
    provider_id,
    rating,
    tags,
    review_text,
    reviewer_role,
    reviewee_id,
    media_urls,
    eligible_for_provider_rating,
    safety_incident_reported
  )
  values (
    v_sc.id,
    v_uid,
    v_sc.provider_id,
    p_rating,
    coalesce(p_tags, '{}'::text[]),
    v_review_text,
    v_reviewer_role,
    v_reviewee_id,
    v_media_urls,
    v_reviewer_role = 'requester',
    coalesce(p_safety_incident_reported, false)
  )
  returning id into v_review_id;

  if coalesce(p_safety_incident_reported, false) then
    insert into public.service_disputes (
      service_chat_id,
      filed_by,
      category,
      description,
      evidence_urls,
      status
    )
    values (
      v_sc.id,
      v_uid,
      'Safety incident from review',
      coalesce(v_review_text, 'Safety incident reported from completed booking review.'),
      v_media_urls,
      'open'
    )
    returning id into v_dispute_id;

    update public.service_reviews
    set service_dispute_id = v_dispute_id
    where id = v_review_id;

    update public.service_chats
    set status = 'disputed',
        disputed_at = coalesce(disputed_at, now()),
        payout_release_requested_at = null,
        payout_release_lock_token = null,
        payout_release_locked_at = null,
        updated_at = now()
    where id = v_sc.id
      and payout_released_at is null;
  end if;

  return jsonb_build_object(
    'review_id', v_review_id,
    'reviewer_role', v_reviewer_role,
    'safety_dispute_id', v_dispute_id
  );
end;
$$;

revoke all on function public.submit_service_review(uuid, integer, text[], text) from public, anon;
grant execute on function public.submit_service_review(uuid, integer, text[], text) to authenticated;

revoke all on function public.submit_service_review_v2(uuid, integer, text[], text, text[], boolean) from public, anon;
grant execute on function public.submit_service_review_v2(uuid, integer, text[], text, text[], boolean) to authenticated;
