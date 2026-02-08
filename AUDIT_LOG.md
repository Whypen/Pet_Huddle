# UAT + Contract Override Audit Log

Date: 2026-02-08

Scope scanned:
- Web: `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src`
- Mobile: `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/src`
- Backend: `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/supabase` (migrations + Edge Functions)

Tooling notes:
- `rg` (ripgrep) is not installed in this environment. Searches were performed with `grep -R`, `find`, and `nl/sed`.

## Verified Implementations (Evidence Pointers)

Note:
- The authoritative execution proof for this sweep is in `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/SWEEP_LOG.md` (commands + outputs + UAT JSON).

1. Chats runtime error fix ("useMemo is not defined")
- Evidence: `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/pages/Chats.tsx` now imports `useMemo`.

2. Premium add-on type wiring matches Stripe Edge Function
- Evidence:
  - `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/pages/Premium.tsx` add-on ids: `star_pack`, `emergency_alert`, `vet_media`
  - `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/src/screens/PremiumScreen.tsx` add-on ids: `star_pack`, `emergency_alert`, `vet_media`
  - `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/supabase/functions/create-checkout-session/index.ts` expects `star_pack`, `emergency_alert`, `vet_media`

3. Contract QMS (Quota Management System) migration pushed + verified via UAT script
- Evidence: `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/supabase/migrations/20260208160000_qms_v2_full_override.sql`
- Provides:
  - `public.user_quotas` (contract counters + extras)
  - `public.check_and_increment_quota(action_type text)` (security definer)
  - `public.qms_rollover_all()` (daily rollover; monthly rollover computed per subscription anchor)
  - `public.increment_user_credits(...)` overridden to mirror add-ons into QMS extras

4. Broadcast radius contract update (backend + web UI)
- Evidence:
  - `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/supabase/functions/mesh-alert/index.ts` now uses 10km/25km/50km
  - `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/pages/Map.tsx` now computes `broadcastRange` as 10/25/50 (km)

5. Contract header override (logo centered only)
- Evidence:
  - `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/components/layout/GlobalHeader.tsx` removed left wordmark, kept centered logo
  - `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/src/components/Header.tsx` removed left wordmark, kept centered logo

6. Thread posting quota is popup-only (no quota display) and uses QMS RPC
- Evidence:
  - `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/components/social/NoticeBoard.tsx`
    - Removed displayed quota line
    - Uses `supabase.rpc("check_and_increment_quota", { action_type: "thread_post" })`
    - Shows a dialog with contract fragments ("Limited. Upgrade to Premium/Gold...")

7. Auth consent (legal) is enforced on signup (web + mobile)
- Evidence:
  - `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/pages/Auth.tsx` signup consent checkbox blocks submit until checked
  - `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/src/screens/AuthScreen.tsx` signup consent blocks submit until checked

## Known Divergences / Follow-ups Required

1. Universal styling via Tailwind/NativeWind on mobile is not complete
- Many mobile screens still use inline `style` objects instead of `className` NativeWind utilities.
- Example: `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/src/screens/PremiumScreen.tsx`

2. Full contract algorithm surface area not fully wired everywhere
- Some pages still use legacy "credits" checks (profiles counters) via `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/hooks/useUpsell.tsx`.
- Map uses `PremiumFooter` upsell instead of a strict tier-specific popup modal.

3. MASTER_SPEC contract section insertion pending
- Requirement: `## 11. Contract Requirements` (verbatim override block + rendered perks table) must be added to `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/MASTER_SPEC.md`.
