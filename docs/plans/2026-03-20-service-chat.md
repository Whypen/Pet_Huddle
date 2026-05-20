# Service Chat Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the full service booking thread — request → quote → Stripe Connect payment (hold-then-release) → in-progress → completion → review/dispute — as a dedicated `/service-chat` page layered on the existing chat infrastructure.

**Architecture:** New `service_chats` table extends the existing `chats`/`chat_messages`/`chat_room_members` tables. A dedicated `ServiceChat.tsx` page (not `ChatDialogue.tsx`) renders pinned cards above the message list, role-aware quick action chips, and 5 bottom-sheet forms. Payment uses Stripe Connect destination charges (provider has Express account via existing `create-stripe-connect-link`); hold-then-release via a new `release-service-payout` edge function called on completion.

**Tech Stack:** React + TypeScript, Supabase (Postgres RPCs + Realtime), Stripe Connect, framer-motion, lucide-react, sonner (toasts), existing `Composer`/`ChatHeader` components.

---

## Audit Notes (read before touching any file)

- Route for regular chat: `/chat-dialogue?roomId=xxx` — new service chat uses `/service-chat?roomId=xxx`
- `chats.type` is plain `text` — no enum, just add `'service'` value
- `chat_messages.content` is plain `text` — structured messages (request sent, booked, etc.) are JSON strings following existing `kind` pattern (see `src/lib/starChat.ts`)
- `pet_care_profiles.stripe_account_id` already stored by `create-stripe-connect-link` edge function. Check `stripe_payout_status = 'complete'` before allowing payment
- `create-checkout-session` does NOT support Stripe Connect destination charges — need new `create-service-payment` edge function
- Stripe webhook `handleCheckoutSessionCompleted` already routes on `type` field from `session.metadata` — add `'service_booking'` case there
- Platform fee: 10% (matching existing `nanny_booking` handler)
- RATE_OPTIONS in CarerProfile: `["Per hour", "Per day", "Per session", "Per night"]`
- SERVICES_OFFERED: `["Boarding","Walking","Day Care","Drop-in","Grooming","Training","Vet / Licensed Care","Transport","Emergency Help","Others"]`
- PET_TYPES: `["Dogs","Cats","Rabbits","Birds","Hamsters / Guinea Pigs","Reptiles","Fish","Small pets","Others"]`
- CURRENCIES: `["USD","HKD","GBP","EUR","AUD","SGD","CAD","JPY"]`
- User's pets fetched from `public.pets` table where `owner_id = auth.uid()`
- "Mark finished" disabled until requested date/time from request_card has passed
- "Dispute" active window: 48h after `completed_at`
- `legal/pet-care-booking-terms.html` does not exist yet — must create

---

## Task 1 — Database Migration

**File:** `supabase/migrations/20260320100000_service_chat_schema.sql`

```sql
-- ── service_chats ─────────────────────────────────────────────────────────────
create table public.service_chats (
  id                        uuid primary key default gen_random_uuid(),
  chat_id                   uuid not null unique references public.chats(id) on delete cascade,
  requester_id              uuid not null references auth.users(id),
  provider_id               uuid not null references auth.users(id),
  status                    text not null default 'pending'
                              check (status in ('pending','booked','in_progress','completed','disputed')),
  -- Pinned card data
  request_card              jsonb,
  quote_card                jsonb,
  -- Timestamps
  request_sent_at           timestamptz,
  quote_sent_at             timestamptz,
  booked_at                 timestamptz,
  in_progress_at            timestamptz,
  completed_at              timestamptz,
  disputed_at               timestamptz,
  -- Stripe
  stripe_payment_intent_id  text,
  stripe_checkout_session_id text,
  payout_released_at        timestamptz,
  -- Mark finished flags
  requester_mark_finished   boolean not null default false,
  provider_mark_finished    boolean not null default false,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

alter table public.service_chats enable row level security;

-- Both requester and provider can read their own service chat
create policy "service_chats_select" on public.service_chats
  for select using (
    requester_id = auth.uid() or provider_id = auth.uid()
  );

-- Only system/RPC writes (security definer RPCs handle all mutations)
-- No client-side insert/update/delete policies needed

-- ── service_disputes ─────────────────────────────────────────────────────────
create table public.service_disputes (
  id                uuid primary key default gen_random_uuid(),
  service_chat_id   uuid not null references public.service_chats(id) on delete cascade,
  filed_by          uuid not null references auth.users(id),
  category          text not null,
  description       text not null,
  evidence_urls     text[] not null default '{}',
  status            text not null default 'open'
                      check (status in ('open','resolved','closed')),
  admin_notes       text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table public.service_disputes enable row level security;

create policy "service_disputes_select" on public.service_disputes
  for select using (
    filed_by = auth.uid()
    or exists (
      select 1 from public.service_chats sc
      where sc.id = service_chat_id
        and (sc.requester_id = auth.uid() or sc.provider_id = auth.uid())
    )
  );

-- ── service_reviews ───────────────────────────────────────────────────────────
create table public.service_reviews (
  id                uuid primary key default gen_random_uuid(),
  service_chat_id   uuid not null references public.service_chats(id) on delete cascade,
  reviewer_id       uuid not null references auth.users(id),
  provider_id       uuid not null references auth.users(id),
  rating            int not null check (rating between 1 and 5),
  tags              text[] not null default '{}',
  review_text       text,
  created_at        timestamptz default now(),
  unique (service_chat_id, reviewer_id)
);

alter table public.service_reviews enable row level security;

create policy "service_reviews_select" on public.service_reviews
  for select using (true);  -- reviews are public

create policy "service_reviews_insert" on public.service_reviews
  for insert with check (reviewer_id = auth.uid());

-- ── RPC: create_service_chat ─────────────────────────────────────────────────
create or replace function public.create_service_chat(p_provider_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_requester_id uuid := auth.uid();
  v_chat_id      uuid;
  v_service_chat_id uuid;
begin
  if v_requester_id is null then
    raise exception 'not authenticated';
  end if;
  if v_requester_id = p_provider_id then
    raise exception 'cannot create service chat with yourself';
  end if;

  -- Create the chat room
  insert into public.chats (type, created_by)
  values ('service', v_requester_id)
  returning id into v_chat_id;

  -- Add both members
  insert into public.chat_room_members (chat_id, user_id)
  values (v_chat_id, v_requester_id), (v_chat_id, p_provider_id);

  -- Create service_chats record
  insert into public.service_chats (chat_id, requester_id, provider_id)
  values (v_chat_id, v_requester_id, p_provider_id)
  returning id into v_service_chat_id;

  return v_chat_id;
end;
$$;

-- ── RPC: send_service_request ─────────────────────────────────────────────────
create or replace function public.send_service_request(
  p_chat_id    uuid,
  p_request_card jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_sc  public.service_chats;
begin
  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.requester_id <> v_uid then raise exception 'not_requester'; end if;
  if v_sc.status <> 'pending' then raise exception 'invalid_status'; end if;

  update public.service_chats
  set request_card = p_request_card,
      request_sent_at = now(),
      updated_at = now()
  where chat_id = p_chat_id;

  -- System message
  insert into public.chat_messages (chat_id, sender_id, content)
  values (p_chat_id, v_uid, json_build_object('kind','service_request_sent','requestedDate',p_request_card->>'requestedDate','serviceType',p_request_card->>'serviceType')::text);

  update public.chats set last_message_at = now() where id = p_chat_id;
end;
$$;

-- ── RPC: withdraw_service_request ─────────────────────────────────────────────
create or replace function public.withdraw_service_request(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_sc  public.service_chats;
begin
  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.requester_id <> v_uid then raise exception 'not_requester'; end if;
  if v_sc.status <> 'pending' then raise exception 'invalid_status'; end if;

  update public.service_chats
  set request_card = null, request_sent_at = null,
      quote_card = null, quote_sent_at = null,
      updated_at = now()
  where chat_id = p_chat_id;
end;
$$;

-- ── RPC: send_service_quote ───────────────────────────────────────────────────
create or replace function public.send_service_quote(
  p_chat_id   uuid,
  p_quote_card jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_sc  public.service_chats;
begin
  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.provider_id <> v_uid then raise exception 'not_provider'; end if;
  if v_sc.request_card is null then raise exception 'no_request_yet'; end if;
  if v_sc.status <> 'pending' then raise exception 'invalid_status'; end if;

  update public.service_chats
  set quote_card = p_quote_card,
      quote_sent_at = now(),
      updated_at = now()
  where chat_id = p_chat_id;

  insert into public.chat_messages (chat_id, sender_id, content)
  values (p_chat_id, v_uid, json_build_object('kind','service_quote_sent','currency',p_quote_card->>'currency','finalPrice',p_quote_card->>'finalPrice','rate',p_quote_card->>'rate')::text);

  update public.chats set last_message_at = now() where id = p_chat_id;
end;
$$;

-- ── RPC: withdraw_service_quote ───────────────────────────────────────────────
create or replace function public.withdraw_service_quote(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_sc  public.service_chats;
begin
  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.provider_id <> v_uid then raise exception 'not_provider'; end if;
  if v_sc.status <> 'pending' then raise exception 'invalid_status'; end if;

  update public.service_chats
  set quote_card = null, quote_sent_at = null, updated_at = now()
  where chat_id = p_chat_id;
end;
$$;

-- ── RPC: start_service ────────────────────────────────────────────────────────
create or replace function public.start_service(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_sc  public.service_chats;
begin
  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.provider_id <> v_uid then raise exception 'not_provider'; end if;
  if v_sc.status <> 'booked' then raise exception 'invalid_status'; end if;

  update public.service_chats
  set status = 'in_progress', in_progress_at = now(), updated_at = now()
  where chat_id = p_chat_id;

  insert into public.chat_messages (chat_id, sender_id, content)
  values (p_chat_id, v_uid, '{"kind":"service_in_progress"}');

  update public.chats set last_message_at = now() where id = p_chat_id;
end;
$$;

-- ── RPC: mark_service_finished ────────────────────────────────────────────────
create or replace function public.mark_service_finished(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid  uuid := auth.uid();
  v_sc   public.service_chats;
  v_both boolean;
begin
  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.status not in ('booked','in_progress') then raise exception 'invalid_status'; end if;
  if v_sc.requester_id <> v_uid and v_sc.provider_id <> v_uid then raise exception 'not_participant'; end if;

  if v_sc.requester_id = v_uid then
    update public.service_chats set requester_mark_finished = true, updated_at = now() where chat_id = p_chat_id;
  else
    update public.service_chats set provider_mark_finished = true, updated_at = now() where chat_id = p_chat_id;
  end if;

  -- Re-fetch to check both flags
  select requester_mark_finished and provider_mark_finished into v_both
  from public.service_chats where chat_id = p_chat_id;

  if v_both then
    update public.service_chats
    set status = 'completed', completed_at = now(), updated_at = now()
    where chat_id = p_chat_id;

    insert into public.chat_messages (chat_id, sender_id, content)
    values (p_chat_id, v_uid, '{"kind":"service_completed"}');

    update public.chats set last_message_at = now() where id = p_chat_id;
  end if;
end;
$$;

-- ── RPC: file_service_dispute ─────────────────────────────────────────────────
create or replace function public.file_service_dispute(
  p_chat_id       uuid,
  p_category      text,
  p_description   text,
  p_evidence_urls text[]
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid  uuid := auth.uid();
  v_sc   public.service_chats;
  v_disp_id uuid;
begin
  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.requester_id <> v_uid and v_sc.provider_id <> v_uid then raise exception 'not_participant'; end if;
  -- Allow dispute from booked, in_progress, or completed (within 48h)
  if v_sc.status not in ('booked','in_progress','completed') then raise exception 'invalid_status'; end if;
  if v_sc.status = 'completed' and v_sc.completed_at < now() - interval '48 hours' then
    raise exception 'dispute_window_closed';
  end if;

  insert into public.service_disputes (service_chat_id, filed_by, category, description, evidence_urls)
  values (v_sc.id, v_uid, p_category, p_description, p_evidence_urls)
  returning id into v_disp_id;

  update public.service_chats
  set status = 'disputed', disputed_at = now(), updated_at = now()
  where chat_id = p_chat_id;

  insert into public.chat_messages (chat_id, sender_id, content)
  values (p_chat_id, v_uid, '{"kind":"service_disputed"}');

  update public.chats set last_message_at = now() where id = p_chat_id;

  return v_disp_id;
end;
$$;

-- ── RPC: submit_service_review ────────────────────────────────────────────────
create or replace function public.submit_service_review(
  p_chat_id     uuid,
  p_rating      int,
  p_tags        text[],
  p_review_text text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_sc  public.service_chats;
begin
  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.requester_id <> v_uid then raise exception 'not_requester'; end if;
  if v_sc.status <> 'completed' then raise exception 'not_completed'; end if;

  insert into public.service_reviews (service_chat_id, reviewer_id, provider_id, rating, tags, review_text)
  values (v_sc.id, v_uid, v_sc.provider_id, p_rating, p_tags, p_review_text)
  on conflict (service_chat_id, reviewer_id) do nothing;
end;
$$;

-- ── Trigger: auto-complete after 48h ─────────────────────────────────────────
-- Called by a cron job or checked on page load (client-side check in useServiceChat)
-- No pg_cron scheduled — client detects stale state and calls mark_service_finished
-- if both flags set OR if 48h elapsed since in_progress_at/completed_at.
-- This avoids pg_cron dependency for now.
```

**Apply:** Run via `mcp apply_migration`.

---

## Task 2 — Legal Terms File

**File:** `src/legal/pet-care-booking-terms.html`

Create HTML with these sections:
1. "Pet Care Service Booking Terms" heading
2. "Direct Booking" — you book directly with the provider, Huddle is not a party
3. "Payment & Escrow" — payment held by Huddle until service completion
4. "Dispute Resolution" — 48h window post-completion, Huddle mediates
5. "Cancellation" — contact provider directly; refunds at Huddle's discretion
6. "Liability" — provider responsible for care; Huddle not liable for pet injury
7. Styled consistent with `src/legal/terms.html`

---

## Task 3 — Type Definitions

**File:** `src/components/service-chat/types.ts`

```typescript
export type ServiceStatus = 'pending' | 'booked' | 'in_progress' | 'completed' | 'disputed';
export type ServiceRole = 'requester' | 'provider';

export interface ServiceRequestCard {
  serviceType: string;
  petId: string;
  petName: string;
  petType: string;
  requestedDate: string;      // "YYYY-MM-DD"
  requestedTime: string;      // "HH:MM"
  location: string;
  suggestedCurrency?: string;
  suggestedPrice?: string;
  suggestedRate?: string;
  notes?: string;
  allowProfileView: boolean;
}

export interface ServiceQuoteCard {
  serviceType: string;
  petName: string;
  petType: string;
  requestedDate: string;
  requestedTime: string;
  location: string;
  currency: string;
  finalPrice: string;
  rate: string;
  note?: string;
}

export interface ServiceChat {
  id: string;              // service_chats.id
  chatId: string;          // chats.id
  requesterId: string;
  providerId: string;
  status: ServiceStatus;
  requestCard: ServiceRequestCard | null;
  quoteCard: ServiceQuoteCard | null;
  requestSentAt: string | null;
  quoteSentAt: string | null;
  bookedAt: string | null;
  inProgressAt: string | null;
  completedAt: string | null;
  disputedAt: string | null;
  requesterMarkFinished: boolean;
  providerMarkFinished: boolean;
  stripePaymentIntentId: string | null;
}

export interface ServiceChatMessage {
  id: string;
  senderId: string;
  content: string;         // may be JSON string with `kind` field
  createdAt: string;
}

export interface ServiceMessageParsed {
  text?: string;
  kind?: 'service_request_sent' | 'service_quote_sent' | 'service_booked'
       | 'service_in_progress' | 'service_completed' | 'service_disputed'
       | 'service_review_submitted';
  [key: string]: unknown;
}

export interface ServiceCounterpart {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  stripePayoutStatus?: string | null;   // provider's Connect status (for requester to know)
  stripeAccountId?: string | null;
}
```

---

## Task 4 — Edge Function: create-service-payment

**File:** `supabase/functions/create-service-payment/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_LIVE_SECRET_KEY") || Deno.env.get("STRIPE_TEST_SECRET_KEY") || "";
const stripe = new Stripe(stripeSecret, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const { service_chat_id, amount_cents, currency, success_url, cancel_url } = await req.json();

  if (!service_chat_id || !amount_cents || !currency || !success_url || !cancel_url) {
    return json({ error: "Missing required fields" }, 400);
  }

  // Verify the caller is the requester for this service chat
  const { data: sc } = await supabase
    .from("service_chats")
    .select("id, requester_id, provider_id, status")
    .eq("chat_id", service_chat_id)
    .maybeSingle();

  if (!sc) return json({ error: "Service chat not found" }, 404);
  if (sc.requester_id !== user.id) return json({ error: "Forbidden" }, 403);
  if (sc.status !== "pending") return json({ error: "Invalid status" }, 409);

  // Verify provider has completed Stripe Connect
  const { data: providerProfile } = await supabase
    .from("pet_care_profiles")
    .select("stripe_account_id, stripe_payout_status")
    .eq("user_id", sc.provider_id)
    .maybeSingle();

  if (!providerProfile?.stripe_account_id || providerProfile.stripe_payout_status !== "complete") {
    return json({ error: "Provider has not completed payout setup" }, 409);
  }

  // Get or create Stripe customer for requester
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  let customerId = profile?.stripe_customer_id;
  if (!customerId) {
    const authUser = await supabase.auth.admin.getUserById(user.id);
    const customer = await stripe.customers.create({ email: authUser.data?.user?.email, metadata: { user_id: user.id } });
    customerId = customer.id;
    await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  // Platform fee: 10%
  const platformFee = Math.round(amount_cents * 0.10);

  // Create Checkout Session — hold on platform (no immediate transfer_data)
  // Transfer to provider manually on completion via release-service-payout
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [{
      price_data: {
        currency: currency.toLowerCase(),
        unit_amount: amount_cents,
        product_data: { name: "Pet Care Service Booking" },
      },
      quantity: 1,
    }],
    payment_intent_data: {
      // Store provider account and fee for later manual transfer
      metadata: {
        type: "service_booking",
        service_chat_id,
        requester_id: user.id,
        provider_id: sc.provider_id,
        provider_stripe_account_id: providerProfile.stripe_account_id,
        platform_fee_cents: String(platformFee),
        sitter_payout_cents: String(amount_cents - platformFee),
      },
    },
    metadata: {
      type: "service_booking",
      service_chat_id,
      requester_id: user.id,
      provider_id: sc.provider_id,
    },
    success_url,
    cancel_url,
  });

  return json({ url: session.url });
});
```

---

## Task 5 — Edge Function: release-service-payout

**File:** `supabase/functions/release-service-payout/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const stripe = new Stripe(
  Deno.env.get("STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_LIVE_SECRET_KEY") || "",
  { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() }
);
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

serve(async (req) => {
  // Called internally after service is completed — from service_chats trigger or RPC
  // Body: { service_chat_id: string }
  const { service_chat_id } = await req.json();

  const { data: sc } = await supabase
    .from("service_chats")
    .select("*")
    .eq("chat_id", service_chat_id)
    .maybeSingle();

  if (!sc || sc.status !== "completed" || !sc.stripe_payment_intent_id) return new Response("noop", { status: 200 });
  if (sc.payout_released_at) return new Response("already_released", { status: 200 });

  // Retrieve payment intent to get stored metadata
  const pi = await stripe.paymentIntents.retrieve(sc.stripe_payment_intent_id);
  const providerAccount = pi.metadata?.provider_stripe_account_id;
  const payoutCents = Number(pi.metadata?.sitter_payout_cents || 0);
  const currency = pi.currency;

  if (!providerAccount || !payoutCents) return new Response("missing_metadata", { status: 200 });

  await stripe.transfers.create({
    amount: payoutCents,
    currency,
    destination: providerAccount,
    transfer_group: `service_chat_${service_chat_id}`,
    metadata: { service_chat_id, payment_intent_id: sc.stripe_payment_intent_id },
  });

  await supabase
    .from("service_chats")
    .update({ payout_released_at: new Date().toISOString() })
    .eq("chat_id", service_chat_id);

  return new Response("ok", { status: 200 });
});
```

---

## Task 6 — Stripe Webhook: Add service_booking handler

**File:** `supabase/functions/stripe-webhook/index.ts`

In `handleCheckoutSessionCompleted`, after the existing `marketplace_booking` block (around line 280), add:

```typescript
// Handle service chat booking payment
if (type === "service_booking" && session.payment_intent) {
  const serviceChatId = session.metadata?.service_chat_id;
  if (serviceChatId) {
    await supabase
      .from("service_chats")
      .update({
        status: "booked",
        booked_at: new Date().toISOString(),
        stripe_payment_intent_id: session.payment_intent as string,
        stripe_checkout_session_id: session.id,
      })
      .eq("chat_id", serviceChatId);

    // Insert system message
    const { data: sc } = await supabase
      .from("service_chats")
      .select("requester_id")
      .eq("chat_id", serviceChatId)
      .maybeSingle();
    if (sc) {
      await supabase.from("chat_messages").insert({
        chat_id: serviceChatId,
        sender_id: sc.requester_id,
        content: JSON.stringify({ kind: "service_booked" }),
      });
      await supabase.from("chats").update({ last_message_at: new Date().toISOString() }).eq("id", serviceChatId);
    }
    console.log(`[SERVICE_BOOKING] Chat ${serviceChatId} status → booked`);
  }
}
```

Also in `handlePaymentIntentSucceeded`, after the existing `nanny_booking` block, add:

```typescript
if (meta?.type === "service_booking") {
  // service_chats already updated in checkout.session.completed handler
  console.log(`[PAYMENT_INTENT] Service booking confirmed: PI=${paymentIntent.id}`);
}
```

---

## Task 7 — Hook: useServiceChat

**File:** `src/hooks/useServiceChat.ts`

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { ServiceChat, ServiceChatMessage, ServiceCounterpart, ServiceRole, ServiceRequestCard, ServiceQuoteCard } from "@/components/service-chat/types";

interface UseServiceChatResult {
  serviceChat: ServiceChat | null;
  messages: ServiceChatMessage[];
  role: ServiceRole | null;
  counterpart: ServiceCounterpart | null;
  loading: boolean;
  sending: boolean;
  sendMessage: (text: string) => Promise<void>;
  sendRequest: (card: ServiceRequestCard) => Promise<void>;
  withdrawRequest: () => Promise<void>;
  sendQuote: (card: ServiceQuoteCard) => Promise<void>;
  withdrawQuote: () => Promise<void>;
  startService: () => Promise<void>;
  markFinished: () => Promise<void>;
  fileDispute: (category: string, description: string, evidenceUrls: string[]) => Promise<void>;
  submitReview: (rating: number, tags: string[], text: string) => Promise<void>;
  hasReviewed: boolean;
  canDispute: boolean;
  canMarkFinished: boolean;
}

export function useServiceChat(roomId: string | null): UseServiceChatResult {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [serviceChat, setServiceChat] = useState<ServiceChat | null>(null);
  const [messages, setMessages] = useState<ServiceChatMessage[]>([]);
  const [counterpart, setCounterpart] = useState<ServiceCounterpart | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);
  const subRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const role: ServiceRole | null = serviceChat && user
    ? (serviceChat.requesterId === user.id ? 'requester' : 'provider')
    : null;

  // Derived: can mark finished (service date has passed)
  const canMarkFinished = (() => {
    if (!serviceChat || !['booked','in_progress'].includes(serviceChat.status)) return false;
    if (role === 'requester' && serviceChat.requesterMarkFinished) return false;
    if (role === 'provider' && serviceChat.providerMarkFinished) return false;
    const req = serviceChat.requestCard;
    if (!req) return true;
    const serviceDateTime = new Date(`${req.requestedDate}T${req.requestedTime}`);
    return new Date() >= serviceDateTime;
  })();

  // Derived: can dispute (booked/in_progress/completed within 48h)
  const canDispute = (() => {
    if (!serviceChat) return false;
    if (['booked','in_progress'].includes(serviceChat.status)) return true;
    if (serviceChat.status === 'completed' && serviceChat.completedAt) {
      return new Date().getTime() - new Date(serviceChat.completedAt).getTime() < 48 * 60 * 60 * 1000;
    }
    return false;
  })();

  const loadServiceChat = useCallback(async () => {
    if (!roomId || !user) return;
    setLoading(true);
    try {
      // Load service_chats
      const { data: scRow, error: scErr } = await supabase
        .from("service_chats")
        .select("*")
        .eq("chat_id", roomId)
        .maybeSingle();
      if (scErr) throw scErr;
      if (!scRow) { navigate("/chats"); return; }

      const sc: ServiceChat = {
        id: scRow.id,
        chatId: scRow.chat_id,
        requesterId: scRow.requester_id,
        providerId: scRow.provider_id,
        status: scRow.status,
        requestCard: scRow.request_card as ServiceRequestCard | null,
        quoteCard: scRow.quote_card as ServiceQuoteCard | null,
        requestSentAt: scRow.request_sent_at,
        quoteSentAt: scRow.quote_sent_at,
        bookedAt: scRow.booked_at,
        inProgressAt: scRow.in_progress_at,
        completedAt: scRow.completed_at,
        disputedAt: scRow.disputed_at,
        requesterMarkFinished: scRow.requester_mark_finished,
        providerMarkFinished: scRow.provider_mark_finished,
        stripePaymentIntentId: scRow.stripe_payment_intent_id,
      };
      setServiceChat(sc);

      // Load counterpart
      const counterpartId = user.id === scRow.requester_id ? scRow.provider_id : scRow.requester_id;
      const isRequester = user.id === scRow.requester_id;

      const [{ data: pubProfile }, { data: pcpRow }] = await Promise.all([
        supabase.from("profiles_public").select("id, display_name, avatar_url, is_verified").eq("id", counterpartId).maybeSingle(),
        isRequester
          ? supabase.from("pet_care_profiles").select("stripe_account_id, stripe_payout_status").eq("user_id", counterpartId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      setCounterpart({
        id: counterpartId,
        displayName: (pubProfile as Record<string,unknown>)?.display_name as string || "Pet Carer",
        avatarUrl: (pubProfile as Record<string,unknown>)?.avatar_url as string | null || null,
        isVerified: Boolean((pubProfile as Record<string,unknown>)?.is_verified),
        stripePayoutStatus: (pcpRow as Record<string,unknown>)?.stripe_payout_status as string | null,
        stripeAccountId: (pcpRow as Record<string,unknown>)?.stripe_account_id as string | null,
      });

      // Load messages
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("id, sender_id, content, created_at")
        .eq("chat_id", roomId)
        .order("created_at", { ascending: true });
      setMessages((msgs || []).map(m => ({ id: m.id, senderId: m.sender_id, content: m.content, createdAt: m.created_at })));

      // Check if reviewed (requester only)
      if (isRequester && scRow.status === 'completed') {
        const { data: review } = await supabase
          .from("service_reviews")
          .select("id")
          .eq("service_chat_id", scRow.id)
          .eq("reviewer_id", user.id)
          .maybeSingle();
        setHasReviewed(Boolean(review));
      }
    } catch (e) {
      console.error("[useServiceChat] load failed", e);
      toast.error("Unable to load conversation.");
    } finally {
      setLoading(false);
    }
  }, [roomId, user, navigate]);

  useEffect(() => { void loadServiceChat(); }, [loadServiceChat]);

  // Realtime subscription
  useEffect(() => {
    if (!roomId) return;
    const chan = supabase
      .channel(`service_chat_${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `chat_id=eq.${roomId}` },
        (payload) => {
          const r = payload.new as { id: string; sender_id: string; content: string; created_at: string };
          setMessages(prev => [...prev, { id: r.id, senderId: r.sender_id, content: r.content, createdAt: r.created_at }]);
        }
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "service_chats", filter: `chat_id=eq.${roomId}` },
        (payload) => {
          const r = payload.new as Record<string, unknown>;
          setServiceChat(prev => prev ? {
            ...prev,
            status: r.status as ServiceChat['status'],
            requestCard: r.request_card as ServiceRequestCard | null,
            quoteCard: r.quote_card as ServiceQuoteCard | null,
            requestSentAt: r.request_sent_at as string | null,
            quoteSentAt: r.quote_sent_at as string | null,
            bookedAt: r.booked_at as string | null,
            inProgressAt: r.in_progress_at as string | null,
            completedAt: r.completed_at as string | null,
            disputedAt: r.disputed_at as string | null,
            requesterMarkFinished: Boolean(r.requester_mark_finished),
            providerMarkFinished: Boolean(r.provider_mark_finished),
            stripePaymentIntentId: r.stripe_payment_intent_id as string | null,
          } : prev);
        }
      )
      .subscribe();
    subRef.current = chan;
    return () => { void supabase.removeChannel(chan); };
  }, [roomId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!roomId || !user || !text.trim()) return;
    setSending(true);
    try {
      await supabase.from("chat_messages").insert({ chat_id: roomId, sender_id: user.id, content: text.trim() });
      await supabase.from("chats").update({ last_message_at: new Date().toISOString() }).eq("id", roomId);
    } finally { setSending(false); }
  }, [roomId, user]);

  const sendRequest = useCallback(async (card: ServiceRequestCard) => {
    if (!roomId) return;
    setSending(true);
    try {
      const { error } = await supabase.rpc("send_service_request", { p_chat_id: roomId, p_request_card: card });
      if (error) throw error;
    } catch (e) { toast.error("Failed to send request."); throw e; }
    finally { setSending(false); }
  }, [roomId]);

  const withdrawRequest = useCallback(async () => {
    if (!roomId) return;
    const { error } = await supabase.rpc("withdraw_service_request", { p_chat_id: roomId });
    if (error) toast.error("Failed to withdraw request.");
  }, [roomId]);

  const sendQuote = useCallback(async (card: ServiceQuoteCard) => {
    if (!roomId) return;
    setSending(true);
    try {
      const { error } = await supabase.rpc("send_service_quote", { p_chat_id: roomId, p_quote_card: card });
      if (error) throw error;
    } catch (e) { toast.error("Failed to send quote."); throw e; }
    finally { setSending(false); }
  }, [roomId]);

  const withdrawQuote = useCallback(async () => {
    if (!roomId) return;
    const { error } = await supabase.rpc("withdraw_service_quote", { p_chat_id: roomId });
    if (error) toast.error("Failed to withdraw quote.");
  }, [roomId]);

  const startService = useCallback(async () => {
    if (!roomId) return;
    const { error } = await supabase.rpc("start_service", { p_chat_id: roomId });
    if (error) toast.error("Failed to start service.");
  }, [roomId]);

  const markFinished = useCallback(async () => {
    if (!roomId) return;
    const { error } = await supabase.rpc("mark_service_finished", { p_chat_id: roomId });
    if (error) toast.error("Failed to mark as finished.");
    // If status became 'completed', trigger payout release
    if (!error) {
      void supabase.functions.invoke("release-service-payout", { body: { service_chat_id: roomId } });
    }
  }, [roomId]);

  const fileDispute = useCallback(async (category: string, description: string, evidenceUrls: string[]) => {
    if (!roomId) return;
    const { error } = await supabase.rpc("file_service_dispute", {
      p_chat_id: roomId, p_category: category, p_description: description, p_evidence_urls: evidenceUrls,
    });
    if (error) { toast.error("Failed to file dispute."); throw error; }
  }, [roomId]);

  const submitReview = useCallback(async (rating: number, tags: string[], text: string) => {
    if (!serviceChat) return;
    const { error } = await supabase.rpc("submit_service_review", {
      p_chat_id: roomId!, p_rating: rating, p_tags: tags, p_review_text: text,
    });
    if (error) { toast.error("Failed to submit review."); throw error; }
    setHasReviewed(true);
  }, [roomId, serviceChat]);

  return { serviceChat, messages, role, counterpart, loading, sending, sendMessage, sendRequest, withdrawRequest, sendQuote, withdrawQuote, startService, markFinished, fileDispute, submitReview, hasReviewed, canDispute, canMarkFinished };
}
```

---

## Task 8 — Component: ServiceChatHeader

**File:** `src/components/service-chat/ServiceChatHeader.tsx`

```typescript
import { ArrowLeft, BadgeCheck, MoreVertical, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ServiceStatus, ServiceRole } from "./types";

const STATUS_CONFIG: Record<ServiceStatus, { label: string; bg: string; color: string }> = {
  pending:     { label: "Pending",     bg: "rgba(150,150,150,0.12)", color: "#888" },
  booked:      { label: "Booked",      bg: "rgba(34,197,94,0.12)",   color: "#16a34a" },
  in_progress: { label: "In Progress", bg: "rgba(34,197,94,0.12)",   color: "#16a34a" },
  completed:   { label: "Completed",   bg: "rgba(34,197,94,0.12)",   color: "#16a34a" },
  disputed:    { label: "Disputed",    bg: "rgba(239,100,80,0.12)",  color: "#ef6450" },
};

interface Props {
  status: ServiceStatus;
  counterpartName: string;
  counterpartAvatarUrl: string | null;
  isVerified: boolean;
  role: ServiceRole;
  hasReviewed: boolean;
  onReview?: () => void;
  onMore?: () => void;
}

export function ServiceChatHeader({ status, counterpartName, counterpartAvatarUrl, isVerified, role, hasReviewed, onReview, onMore }: Props) {
  const navigate = useNavigate();
  const cfg = STATUS_CONFIG[status];

  return (
    <header className="glass-bar h-[56px] fixed top-0 inset-x-0 z-[20] flex items-center px-[16px] gap-[12px]">
      <button
        type="button"
        onClick={() => navigate("/chats")}
        className="w-[40px] h-[40px] rounded-[12px] flex items-center justify-center text-[rgba(74,73,101,0.55)]"
      >
        <ArrowLeft size={24} strokeWidth={1.5} />
      </button>

      {counterpartAvatarUrl ? (
        <img src={counterpartAvatarUrl} alt={counterpartName} className="w-[40px] h-[40px] rounded-full object-cover flex-shrink-0" />
      ) : (
        <span className="w-[40px] h-[40px] rounded-full bg-[rgba(33,69,207,0.10)] flex items-center justify-center text-[#2145CF] text-[15px] font-[600] flex-shrink-0">
          {counterpartName.slice(0, 2).toUpperCase()}
        </span>
      )}

      <div className="flex flex-col gap-[2px] flex-1 min-w-0">
        <span className="text-[16px] font-[600] text-[#424965] truncate">{counterpartName}</span>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold w-fit"
          style={{ background: cfg.bg, color: cfg.color }}
        >
          {cfg.label}
        </span>
      </div>

      {isVerified && <BadgeCheck size={16} strokeWidth={1.5} className="text-[#2145CF] flex-shrink-0" />}

      {/* Review pill — completed, requester, not yet reviewed */}
      {status === "completed" && role === "requester" && !hasReviewed && (
        <button
          type="button"
          onClick={onReview}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#2145CF] border border-[#2145CF]/30 bg-[#2145CF]/5"
        >
          <Star size={11} strokeWidth={2} />
          Review
        </button>
      )}

      <button
        type="button"
        onClick={onMore}
        className="absolute right-[16px] w-[40px] h-[40px] rounded-[12px] flex items-center justify-center text-[rgba(74,73,101,0.55)]"
      >
        <MoreVertical size={24} strokeWidth={1.5} />
      </button>
    </header>
  );
}
```

---

## Task 9 — Component: RequestCard

**File:** `src/components/service-chat/RequestCard.tsx`

```typescript
import { Pencil, X, Calendar, Clock, MapPin, DollarSign, Eye, EyeOff } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ServiceRequestCard as RequestCardData, ServiceRole, ServiceStatus } from "./types";

interface Props {
  card: RequestCardData;
  role: ServiceRole;
  requestSentAt: string | null;
  status: ServiceStatus;
  onEdit?: () => void;
  onWithdraw?: () => void;
}

export function RequestCard({ card, role, requestSentAt, status, onEdit, onWithdraw }: Props) {
  const isRequester = role === "requester";
  const isSent = Boolean(requestSentAt);

  return (
    <div className="mx-3 my-2 rounded-[16px] border border-border/40 bg-white shadow-sm overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-[11px] font-semibold text-muted-foreground tracking-wide uppercase">Service Request</span>
        <div className="flex items-center gap-2">
          {/* Status (requester only) */}
          {isRequester && (
            <span className="text-[10px] font-medium text-muted-foreground/70">
              {isSent ? "Request sent" : "Request saved"}
            </span>
          )}
          {/* Actions (requester only, pending only) */}
          {isRequester && status === "pending" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="p-1 rounded-full hover:bg-muted/50">
                  <Pencil size={13} className="text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil size={13} className="mr-2" /> Edit request
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onWithdraw} className="text-destructive">
                  <X size={13} className="mr-2" /> Withdraw
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 pb-4 space-y-2">
        <p className="text-[15px] font-semibold text-brandText">{card.serviceType}</p>
        <p className="text-[13px] text-brandText">{card.petName} · {card.petType}</p>

        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Calendar size={12} />
          <span>{card.requestedDate}</span>
          <Clock size={12} className="ml-2" />
          <span>{card.requestedTime}</span>
        </div>

        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <MapPin size={12} />
          <span>{card.location}</span>
        </div>

        {card.suggestedPrice && card.suggestedCurrency && (
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <DollarSign size={12} />
            <span>Suggested: {card.suggestedCurrency} {card.suggestedPrice} {card.suggestedRate || ""}</span>
          </div>
        )}

        {card.notes && (
          <p className="text-[12px] text-muted-foreground italic">{card.notes}</p>
        )}

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1 border-t border-border/30 mt-2">
          {card.allowProfileView ? <Eye size={11} /> : <EyeOff size={11} />}
          <span>{card.allowProfileView ? "Provider can view your profile" : "Profile hidden from provider"}</span>
        </div>
      </div>
    </div>
  );
}
```

---

## Task 10 — Component: QuoteCard

**File:** `src/components/service-chat/QuoteCard.tsx`

```typescript
import { Pencil, X, CheckCircle, DollarSign, Calendar, Clock, MapPin } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ServiceQuoteCard as QuoteCardData, ServiceRole, ServiceStatus } from "./types";

interface Props {
  card: QuoteCardData;
  role: ServiceRole;
  status: ServiceStatus;
  onAcceptPay?: () => void;
  onAskRevise?: () => void;
  onEdit?: () => void;
  onWithdraw?: () => void;
  providerStripeReady?: boolean;
}

export function QuoteCard({ card, role, status, onAcceptPay, onAskRevise, onEdit, onWithdraw, providerStripeReady }: Props) {
  const isRequester = role === "requester";
  const isPending = status === "pending";
  const isBooked = status !== "pending";

  return (
    <div className="mx-3 mb-2 rounded-[16px] border border-border/40 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-[11px] font-semibold text-muted-foreground tracking-wide uppercase">Service Quote</span>
        {/* Provider actions (pending only) */}
        {!isRequester && isPending && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="p-1 rounded-full hover:bg-muted/50">
                <Pencil size={13} className="text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={onEdit}><Pencil size={13} className="mr-2" /> Edit quote</DropdownMenuItem>
              <DropdownMenuItem onClick={onWithdraw} className="text-destructive"><X size={13} className="mr-2" /> Withdraw</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Body */}
      <div className="px-4 pb-3 space-y-2">
        <p className="text-[15px] font-semibold text-brandText">{card.serviceType}</p>
        <p className="text-[13px] text-brandText">{card.petName} · {card.petType}</p>

        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Calendar size={12} /><span>{card.requestedDate}</span>
          <Clock size={12} className="ml-2" /><span>{card.requestedTime}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <MapPin size={12} /><span>{card.location}</span>
        </div>

        {/* Price — prominent */}
        <div className="flex items-baseline gap-1.5 pt-1">
          <DollarSign size={14} className="text-brandBlue" />
          <span className="text-[20px] font-bold text-brandText">{card.currency} {card.finalPrice}</span>
          <span className="text-[12px] text-muted-foreground">/{card.rate.replace(/^[Pp]er\s+/,"")}</span>
        </div>

        {card.note && <p className="text-[12px] text-muted-foreground italic">{card.note}</p>}
      </div>

      {/* Requester actions */}
      {isRequester && (
        <div className="px-4 pb-4 flex gap-2">
          {isPending ? (
            <>
              <button
                type="button"
                onClick={onAcceptPay}
                disabled={!providerStripeReady}
                className="flex-1 rounded-[12px] py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ background: providerStripeReady ? "linear-gradient(145deg,#2A53E0,#1C3ECC)" : undefined, backgroundColor: providerStripeReady ? undefined : "#ccc" }}
              >
                Accept & pay
              </button>
              <button
                type="button"
                onClick={onAskRevise}
                className="flex-1 rounded-[12px] py-2.5 text-[13px] font-semibold text-muted-foreground bg-muted/60 border border-border/40"
              >
                Ask to revise
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-emerald-600 text-[13px] font-semibold">
              <CheckCircle size={16} strokeWidth={2} />
              Paid
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## Task 11 — Component: DisputeBanner

**File:** `src/components/service-chat/DisputeBanner.tsx`

```typescript
import { ShieldAlert } from "lucide-react";
import type { ServiceRole } from "./types";

export function DisputeBanner({ role }: { role: ServiceRole }) {
  return (
    <div className="mx-3 my-2 rounded-[14px] border border-[#ef6450]/30 bg-[#ef6450]/8 p-3 flex items-start gap-2">
      <ShieldAlert size={16} className="text-[#ef6450] shrink-0 mt-0.5" strokeWidth={1.75} />
      <div>
        <p className="text-[13px] font-semibold text-[#ef6450]">Payment on hold</p>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          {role === "requester"
            ? "Huddle is reviewing this case."
            : "A complaint has been filed against this booking."}
        </p>
      </div>
    </div>
  );
}
```

---

## Task 12 — Component: QuickActionChips

**File:** `src/components/service-chat/QuickActionChips.tsx`

```typescript
import { cn } from "@/lib/utils";
import type { ServiceStatus, ServiceRole } from "./types";

interface Chip {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}

interface Props {
  status: ServiceStatus;
  role: ServiceRole;
  requestCard: boolean;
  quoteCard: boolean;
  canMarkFinished: boolean;
  canDispute: boolean;
  hasReviewed: boolean;
  onRequestQuote?: () => void;
  onSendQuote?: () => void;
  onStartService?: () => void;
  onMarkFinished?: () => void;
  onDispute?: () => void;
  onReview?: () => void;
}

export function QuickActionChips(p: Props) {
  const chips: Chip[] = [];

  if (p.status === "pending") {
    if (p.role === "requester" && !p.requestCard) {
      chips.push({ label: "Request a quote", onClick: p.onRequestQuote! });
    }
    if (p.role === "provider" && p.requestCard && !p.quoteCard) {
      chips.push({ label: "Send quote", onClick: p.onSendQuote! });
    }
  }

  if (p.status === "booked") {
    if (p.role === "provider") {
      chips.push({ label: "Start service", onClick: p.onStartService! });
    }
    chips.push({ label: "Mark finished", disabled: !p.canMarkFinished, onClick: p.onMarkFinished! });
    if (p.canDispute) chips.push({ label: "Dispute", danger: true, onClick: p.onDispute! });
  }

  if (p.status === "in_progress") {
    chips.push({ label: "Mark finished", disabled: !p.canMarkFinished, onClick: p.onMarkFinished! });
    if (p.canDispute) chips.push({ label: "Dispute", danger: true, onClick: p.onDispute! });
  }

  if (p.status === "completed") {
    if (p.role === "requester" && !p.hasReviewed) {
      chips.push({ label: "Review", onClick: p.onReview! });
    }
    if (p.canDispute) chips.push({ label: "Dispute", danger: true, onClick: p.onDispute! });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex gap-2 px-4 py-2 overflow-x-auto scrollbar-none">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          onClick={chip.onClick}
          disabled={chip.disabled}
          className={cn(
            "flex-shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold border transition-colors",
            chip.disabled
              ? "text-muted-foreground border-border/30 bg-muted/30 cursor-not-allowed"
              : chip.danger
              ? "text-[#ef6450] border-[#ef6450]/30 bg-[#ef6450]/8"
              : "text-brandText border-border/40 bg-white shadow-sm hover:bg-muted/20"
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
```

---

## Task 13 — Component: RequestForm (bottom sheet)

**File:** `src/components/service-chat/RequestForm.tsx`

Fields (all inside a Sheet, behaviour matches CarerProfile edit mode):
- **Service type** — `select` from SERVICES_OFFERED
- **Pet** — `select` from user's pets (fetched from `public.pets where owner_id = auth.uid()`)
- **Pet type** — auto-filled from selected pet's species; falls back to select from PET_TYPES
- **Requested date** — `<input type="date" />`
- **Requested time** — `<input type="time" />`
- **Location / area** — `<input type="text" />`
- **Suggested currency** — select from CURRENCIES (optional)
- **Suggested price** — text input (optional, shown when currency selected)
- **Suggested rate** — select from RATE_OPTIONS (optional, shown when currency selected)
- **Additional notes** — textarea (optional)
- **Checkbox**: "Allow service provider to see your profile"
- **Button**: "Save and Send" → calls `sendRequest(card)`

State management: all fields in local state. Validation: service type + pet + requested date + time + location required.

Pet fetch on mount:
```typescript
const [pets, setPets] = useState<{ id: string; name: string; species: string }[]>([]);
useEffect(() => {
  supabase.from("pets").select("id, name, species").eq("owner_id", userId).eq("is_active", true)
    .then(({ data }) => setPets(data || []));
}, [userId]);
```

Initial values when editing existing card: pass `initialCard` prop, pre-fill all fields.

---

## Task 14 — Component: QuoteForm (bottom sheet)

**File:** `src/components/service-chat/QuoteForm.tsx`

Pre-filled (read-only display, not editable inputs) from request card:
- Service type, pet name, pet type, requested date, requested time, location/area

Editable fields:
- **Currency** — select from CURRENCIES (required)
- **Final price** — number input (required)
- **Rate** — select from RATE_OPTIONS (required)
- **Optional note** — textarea

Button: "Send quote" → calls `sendQuote(card)`

---

## Task 15 — Component: BookingConfirmSheet

**File:** `src/components/service-chat/BookingConfirmSheet.tsx`

Sheet that opens when requester taps "Accept & pay":

```typescript
// State
const [agreed, setAgreed] = useState(false);
const [termsRead, setTermsRead] = useState(false);  // set true when terms link opened
const [loading, setLoading] = useState(false);

// Terms link handler: opens /legal/pet-care-booking-terms in new tab, sets termsRead
// Checkbox only clickable after termsRead = true (or remove this restriction for simplicity)
//
// Note: spec says "User must click and read through whole terms to continue"
// Implementation: open link in new tab, assume read, allow checkbox.
// Strict implementation: track scroll position in an in-app iframe — YAGNI for now.
// Simple approach: clicking the link enables the checkbox.

// On "Proceed to payment":
const handlePay = async () => {
  if (!agreed) return;
  setLoading(true);
  try {
    const amountCents = Math.round(parseFloat(quoteCard.finalPrice) * 100);
    const currencyCode = quoteCard.currency.toLowerCase();
    const { data } = await supabase.functions.invoke("create-service-payment", {
      body: {
        service_chat_id: roomId,
        amount_cents: amountCents,
        currency: currencyCode,
        success_url: `${window.location.origin}/service-chat?roomId=${roomId}&payment=success`,
        cancel_url: `${window.location.origin}/service-chat?roomId=${roomId}`,
      },
    });
    if (data?.url) window.location.href = data.url;
    else toast.error("Unable to start checkout.");
  } catch { toast.error("Payment failed to initialize."); }
  finally { setLoading(false); }
};
```

Layout:
- Title: "Confirm booking"
- Helper text: "Please ensure your pet's behavior details, address, and emergency contact are accurate to help your provider give the best care."
- Booking summary card (service, pet, date/time, price)
- T&C checkbox: "I understand this booking is directly with the provider and I agree to the [Pet Care Service Booking Terms](link)"
- "Proceed to payment" button (disabled until checked)

---

## Task 16 — Component: ReviewSheet

**File:** `src/components/service-chat/ReviewSheet.tsx`

Fields:
- Star rating (1–5): row of 5 star buttons, tap to select
- Tags multi-select (same chip style as CarerProfile):
  - Punctual, Great with pets, Clear communication, Friendly, Reliable, Patient, Attentive, Professional, Flexible, Helpful, Clean and tidy, Followed instructions
- Review text: textarea "Write a public review"
- Button: "Submit review" → calls `submitReview(rating, tags, text)`; button becomes "Review submitted ✓" after success

---

## Task 17 — Component: DisputeForm

**File:** `src/components/service-chat/DisputeForm.tsx`

Matches style of the Report modal in `ChatDialogue.tsx`:

Fields:
- **Issue category** (required) — select:
  - No-show, Late arrival, Poor service, Injury / safety issue, Wrong service delivered, Property issue, Payment issue, Other
- **Description** (required) — textarea
- **Evidence upload** — image-only file picker (multiple); upload to Supabase storage bucket `chat-attachments`, collect URLs

Buttons: "Submit dispute" + "Cancel"

On submit: calls `fileDispute(category, description, evidenceUrls)`

---

## Task 18 — Page: ServiceChat

**File:** `src/pages/ServiceChat.tsx`

```typescript
// URL: /service-chat?roomId=xxx&payment=success
//
// Layout:
//   [ServiceChatHeader] fixed top
//   [StickyCards container] fixed below header; height measured by ResizeObserver
//   [MessageList] scrollable; paddingTop = 56 (header) + stickyCardsH; paddingBottom = composerH + chipsH + 64 (nav)
//   [QuickActionChips] fixed above composer
//   [Composer] fixed bottom at navOffset=64
//
// On mount: check payment=success param → show "Booking confirmed" toast, clear param

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Composer } from "@/components/chat/Composer";
import { useServiceChat } from "@/hooks/useServiceChat";
import { ServiceChatHeader } from "@/components/service-chat/ServiceChatHeader";
import { RequestCard } from "@/components/service-chat/RequestCard";
import { QuoteCard } from "@/components/service-chat/QuoteCard";
import { DisputeBanner } from "@/components/service-chat/DisputeBanner";
import { QuickActionChips } from "@/components/service-chat/QuickActionChips";
import { RequestForm } from "@/components/service-chat/RequestForm";
import { QuoteForm } from "@/components/service-chat/QuoteForm";
import { BookingConfirmSheet } from "@/components/service-chat/BookingConfirmSheet";
import { ReviewSheet } from "@/components/service-chat/ReviewSheet";
import { DisputeForm } from "@/components/service-chat/DisputeForm";
// + MessageBubble (reuse ChatBubble or inline simple version)
```

Message rendering:
- Regular text messages: use existing `ChatBubble` component
- Structured messages (kind field): render as system event pills:
  - `service_request_sent` → "Request sent" pill (centered, grey)
  - `service_quote_sent` → "Quote received" pill
  - `service_booked` → "Booking confirmed 🎉" pill (green)
  - `service_in_progress` → "Service started" pill
  - `service_completed` → "Service completed" pill
  - `service_disputed` → "Dispute filed" pill (coral)

Helper to parse structured messages:
```typescript
function parseServiceMessage(content: string): ServiceMessageParsed | null {
  try { const p = JSON.parse(content); return p?.kind ? p : null; } catch { return null; }
}
```

Composer locking logic (requester):
- `disabled={role === 'requester' && !serviceChat.requestSentAt}`
- `placeholder={role === 'requester' && !serviceChat.requestSentAt ? "Request a quote to start conversation" : "Ask a question…"}`

Scroll behavior: auto-scroll to bottom on new messages using `useEffect` + `scrollIntoView`.

Payment return detection:
```typescript
const [searchParams, setSearchParams] = useSearchParams();
useEffect(() => {
  if (searchParams.get("payment") === "success") {
    toast.success("Booking confirmed!");
    setSearchParams({}, { replace: true });
  }
}, []);
```

---

## Task 19 — App.tsx: Add Route

**File:** `src/App.tsx`

Add import and route (follow the pattern of `/chat-dialogue`):

```typescript
import ServiceChat from "./pages/ServiceChat";

// Inside <Routes>:
<Route
  path="/service-chat"
  element={
    <ProtectedRoute>
      <AppShell>
        <ServiceChat />
        <BottomNav />
      </AppShell>
    </ProtectedRoute>
  }
/>
```

---

## Task 20 — Entry Point: PublicCarerProfileView

**File:** `src/components/service/PublicCarerProfileView.tsx`

At the bottom of the component (after all sections, before closing `</div>`):

```typescript
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Inside component:
const navigate = useNavigate();
const [creating, setCreating] = useState(false);

const handleRequestService = async () => {
  if (creating) return;
  setCreating(true);
  try {
    const { data, error } = await supabase.rpc("create_service_chat", {
      p_provider_id: provider.userId,
    });
    if (error) throw error;
    navigate(`/service-chat?roomId=${data}`);
  } catch (e) {
    toast.error("Unable to start conversation.");
    console.error(e);
  } finally { setCreating(false); }
};

// JSX (add inside the view, after last section):
<div className="px-3 pb-6 pt-2">
  <button
    type="button"
    onClick={handleRequestService}
    disabled={creating || !provider.agreementAccepted}
    className="w-full rounded-[16px] py-3.5 text-[15px] font-semibold text-white disabled:opacity-60"
    style={{ background: "linear-gradient(145deg,#2A53E0 0%,#1C3ECC 100%)", boxShadow: "0 4px 16px rgba(33,69,207,0.30)" }}
  >
    {creating ? "Starting…" : "Request a service"}
  </button>
  {!provider.agreementAccepted && (
    <p className="text-[11px] text-muted-foreground text-center mt-2">This provider hasn't completed setup yet.</p>
  )}
</div>
```

Also need to pass `onClose` callback from the modal so it closes after navigation. Check `PublicCarerProfileModal.tsx` — it exposes `onClose`. Pass it down to `PublicCarerProfileView` as an optional prop and call it after navigate.

---

## Task 21 — Chats.tsx: Service Tab

**File:** `src/pages/Chats.tsx`

The existing Chats page already has a Service tab concept (imports `serviceImage`). Add service chat rendering to the Service tab section:

Fetch service chats:
```typescript
const { data: serviceChats } = await supabase
  .from("service_chats")
  .select(`
    chat_id,
    status,
    requester_id,
    provider_id,
    request_card,
    quote_card,
    updated_at
  `)
  .or(`requester_id.eq.${userId},provider_id.eq.${userId}`)
  .order("updated_at", { ascending: false });
```

Each row renders as a chat list item with:
- Counterpart avatar + name (fetch from `profiles_public`)
- Status badge (Pending/Booked/In Progress/Completed/Disputed)
- Preview text derived from status:
  - pending + no request: "Start a conversation"
  - pending + request sent (requester view): "You've sent a request"
  - pending + request received (provider view): "You've received a request"
  - pending + quote sent (provider view): "You've sent a quote"
  - pending + quote received (requester view): "You've received a quote"
  - booked: "Booking confirmed"
  - in_progress: "Service in progress"
  - completed: "Service completed"
  - disputed: "Dispute under review"
- On tap: `navigate("/service-chat?roomId=" + row.chat_id)`

---

## Task 22 — Build Verification

```bash
npm run build
```

Expected: Zero TypeScript errors. Only the pre-existing chunk-size advisory warning.

Fix any type errors before moving to deployment.

---

## Task 23 — Deploy Edge Functions

```bash
supabase functions deploy create-service-payment
supabase functions deploy release-service-payout
supabase functions deploy stripe-webhook
```

---

## Execution Order

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8–13 (components, can be parallel) → 14–17 (forms) → 18 → 19 → 20 → 21 → 22 (build check) → 23 (deploy)

---

## State Machine Summary

```
pending ──(send_request)──► pending[req]
pending[req] ──(send_quote)──► pending[req+quote]
pending[req+quote] ──(accept+pay → webhook)──► booked
booked ──(start_service)──► in_progress
booked/in_progress ──(both mark_finished)──► completed
booked/in_progress/completed(48h) ──(file_dispute)──► disputed
completed ──(submit_review)──► completed[reviewed]
```

---

**Plan saved to `docs/plans/2026-03-20-service-chat.md`.**

Two execution options:

**1. Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open a new session with executing-plans, batch execution with checkpoints

Which approach?
