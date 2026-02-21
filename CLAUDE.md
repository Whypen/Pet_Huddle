# CLAUDE.md — Project Operating Doctrine (Single Source)

## Authority
- MASTER_SPEC.md is the single source of truth for product, flows, rules, tiers, quotas, and copy.
- Design_Master_Spec.md is the single source of truth for UI/UX visuals and design rules.
- If anything conflicts: MASTER_SPEC.md wins for product rules; Design_Master_Spec.md wins for visuals.

## Non-Negotiables
- Before ANY change: read the relevant spec sections and quote the exact excerpts you are using.
- No partial delivery: implement ALL requirements in one pass.
- No duplicated instructions elsewhere: this file is the only doctrine.
- If git diff includes unrelated changes OR working tree is contaminated: output exactly
  AUDIT INCOMPLETE – NO COMMIT
  and stop.

## Required Proof Output (always in this order)
1) FILES CHANGED
2) PATCH DIFFS
3) SQL / RLS / TRIGGERS / RPC (if any)
4) AUDIT EVIDENCE (3 passes)
5) TEST RESULTS

## Fresh Hats Self-Audit (run every task)
1) Product Architect: flows + copy + permissions match MASTER_SPEC.md
2) Mobile Systems Engineer: crash-proofing, hydration, async edges, retries, null states
3) Data/RLS Guardian: schema + RLS + triggers + policies match spec and cannot be bypassed
4) Release Manager: env vars, builds, secrets, store compliance

## Skill: MASTER_SPEC_AUDITOR
Preconditions:
- Read MASTER_SPEC.md + Design_Master_Spec.md (only relevant sections).
Steps:
- Compare spec vs runtime implementation for touched areas.
- Flag any tier/cap/economy text outside authoritative sections.
Stop conditions:
- Any contradiction or missing proof => AUDIT INCOMPLETE – NO COMMIT

## Skill: SYSTEMATIC_DEBUGGING_ENGINE
Steps:
- Repro steps + capture stack trace/logs.
- Identify root cause (not symptoms).
- Replace page-level throws with controlled error UI + retry.
- Validate: signed-out state, empty data, slow network, permission denied, null map objects.
Proof:
- Before/after logs, and test commands output.

## Skill: FLUTTER_SOCIAL_LOGIN
Steps:
- Validate OAuth flow end-to-end: redirect URI, nonce/state, token exchange, persistence.
- Apple Sign In: nonce + identity token validation.
- Google: token exchange + refresh behavior.
- Supabase: session persistence + secure storage + sign-out cleanup.
Proof:
- Config references + code paths + runtime verification steps.

## Skill: APPLE_APPSTORE_MANAGER
Steps:
- Validate IAP/subscription product IDs match entitlement mapping.
- Restore purchases flow works.
- Upgrade/downgrade/cancel paths handled.
- No client-side tier tampering; server authoritative.
Proof:
- Entitlement mapping table + receipt validation approach + test notes.

## Skill: GOOGLE_PLAY_MANAGER
Steps:
- Play Billing v5+ flow, purchase token server-side verification.
- Handle grace period/account hold/cancel.
- Optional RTDN support for subscription updates.
Proof:
- Token verification path + subscription state mapping + test notes.
