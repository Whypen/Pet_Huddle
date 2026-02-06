# SPEC_CHANGELOG

## Template
### [version] - YYYY-MM-DD
- **Author:**
- **Summary:**
- **Why change was needed:**
- **Sections changed:**
- **Behavioral impact:**
- **DB migration impact:**
- **Rollback plan:**
- **Verification steps:**

---

## [v1.0.0-final] - 2026-02-05
- **Author:** Codex + Hyphen
- **Summary:** Finalized full rebuild specification for huddle.
- **Why change was needed:** Consolidate all prior directives into one canonical source of truth.
- **Sections changed:** New complete spec baseline.
- **Behavioral impact:** Defines exact architecture, flows, security, testing, and release gates.
- **DB migration impact:** Requires schema parity with canonical profile + operational tables.
- **Rollback plan:** Restore previous spec from git history and invalidate v1.0.0-final.
- **Verification steps:** Run checklist in Section 13 of APP_MASTER_SPEC.md.

## [v1.0.1-traceability] - 2026-02-05
- **Author:** Codex + Hyphen
- **Summary:** Added full document-to-spec traceability map and cross-links.
- **Why change was needed:** Ensure each operational/security/testing/protection doc maps to exact spec sections.
- **Sections changed:** `TRACEABILITY_MAP.md` added; traceability blocks inserted in `RUNBOOK.md`, `SECURITY.md`, `TEST_PLAN.md`, `BRANCH_PROTECTION.md`; CI workflow annotated.
- **Behavioral impact:** No runtime behavior change; governance and auditability improved.
- **DB migration impact:** None.
- **Rollback plan:** Remove traceability additions and restore prior docs from git history.
- **Verification steps:** Validate links and section mapping table against current `APP_MASTER_SPEC.md` headings.

## [v1.1.0-kyc-age-gating-schema] - 2026-02-05
- **Author:** Codex + Hyphen
- **Summary:** Added schema-alignment, age-gating, KYC multi-step flow, map TTL, settings UX, and USD checkout requirements.
- **Why change was needed:** Resolve schema mismatches and formalize safety/compliance requirements.
- **Sections changed:** APP_MASTER_SPEC sections 2.2.1, 4.5, 5.1, 5.2, 5.2.1, 5.3, 5.5, 5.9, 5.11, 7, 13.
- **Behavioral impact:** Introduces strict under-16 social restrictions, mandatory KYC workflow, and updated marketplace currency requirement.
- **DB migration impact:** New migration `20260205200000_schema_alignment_age_kyc.sql`.
- **Rollback plan:** Revert migration with follow-up rollback SQL + revert spec to v1.0.1.
- **Verification steps:** Validate schema columns, KYC route readiness, and release checklist items 14–17.

## [v1.1.1-alignment-pass] - 2026-02-05
- **Author:** Codex + Hyphen
- **Summary:** Completed integration alignment pass for route wiring, age-gate overlays, pet profile vet-field split, and schema contract migration coverage.
- **Why change was needed:** Close remaining gaps between UI behavior and locked spec requirements after UAT findings.
- **Sections changed:** APP_MASTER_SPEC route access + schema alignment + feature flow sections remained authoritative; implementation synced to those sections.
- **Behavioral impact:** `/verify-identity` and `/manage-subscription` are now routed, under-16 users see non-interactive overlays on Social/Chats, and pet profile forms now capture clinic/vet/phone and future reminder validation.
- **DB migration impact:** Added `20260205213000_profiles_contract_columns.sql` and `20260205220000_verification_status_enum.sql`.
- **Rollback plan:** Revert migration files and corresponding UI changes in `src/App.tsx`, `src/pages/Social.tsx`, `src/pages/Chats.tsx`, `src/pages/EditPetProfile.tsx`.
- **Verification steps:** `npm run build`, `node scripts/backend-wiring-v21.mjs`, and `node scripts/uat-role-pass.mjs`.

## v1.2.0 (upgrade-v1.2)
- Massive structural overhaul: UI/UX consistency, KYC/age gating, social/chats restructure, subscription algo, family invites, pet/user profile enhancements, real AI Vet via Gemini, escrow bookings, threads system, map refinements.
- Impact: heavy Supabase (new buckets, columns, RLS, triggers), Stripe Connect/escrow, Gemini API.
- Rollback: revert to v1.1.1 backup if UAT fails >20% scenarios.

## [v1.2.1-profiles-rls-recursion-fix] - 2026-02-05
- **Author:** Codex + Hyphen
- **Summary:** Replaced legacy/duplicated `profiles` RLS policies with a minimal non-recursive policy set.
- **Why change was needed:** Eliminate recursion risk and enforce authenticated-only profile access while preserving admin updates.
- **Sections changed:** APP_MASTER_SPEC 4.4, 7, Protocols & Execution (SecOps RLS check).
- **Behavioral impact:** Unauthenticated reads of `profiles` are blocked; admins can update profiles via JWT claim; service role retains full access.
- **DB migration impact:** Added `20260206093000_fix_profiles_rls.sql`.
- **Rollback plan:** Drop new policies and restore previous policy set from `pg_policies` dump or prior migrations.
- **Verification steps:** `npx supabase db push`; attempt anon `select * from profiles` (should fail); verify admin update in `/admin` UI.


## [v1.2.2-profiles-anon-revoke] - 2026-02-05
- **Author:** Codex + Hyphen
- **Summary:** Explicitly revoked `anon` SELECT on `public.profiles` to force unauth access denial.
- **Why change was needed:** SecOps requirement mandates a visible RLS policy violation for unauthenticated access.
- **Sections changed:** APP_MASTER_SPEC 4.4; Protocols & Execution (SecOps).
- **DB migration impact:** Added `20260206094500_profiles_revoke_anon.sql`.
- **Rollback plan:** `GRANT SELECT ON public.profiles TO anon;` (only if public profiles are intentionally exposed).
- **Verification steps:** `npx supabase db push` then anon request should return 401/403.

## [v1.2.3-threads-discover-kyc-booking-wiring] - 2026-02-05
- **Author:** Codex + Hyphen
- **Summary:** Wired Threads to `threads` table, added Discover backend via `social-discovery`, polished KYC flow (camera direction + uploads), and upgraded booking UX (currency + multi-day range + button copy).
- **Why change was needed:** Close critical blockers on Threads/Discover/KYC/Booking before upgrade approval.
- **Sections changed:** APP_MASTER_SPEC 5.2, 5.4, 5.5, 5.6; Protocols & Execution (UAT).
- **DB migration impact:** Added `20260206101000_verification_uploads_selfie.sql`, `20260206102000_marketplace_bookings_grants.sql`, `20260206103000_social_discovery_fn.sql`, `20260206104000_admin_select_verification_uploads.sql`.
- **Edge functions:** Added `social-discovery`; updated `create-marketplace-booking` to accept `currency`.
- **Rollback plan:** Revert migrations, restore `NoticeBoard` to `notice_board`, revert `Discover` to static data, and roll back `Chats` booking modal changes.
- **Verification steps:** `node scripts/uat-role-pass.mjs`, `node scripts/backend-wiring-v21.mjs`, and verify `marketplace_bookings` grants in DB dump.
