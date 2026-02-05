# BRANCH_PROTECTION.md — huddle GitHub Branch Protection Guide
**FINAL EDITION — LOCKED**  
**Audience:** Repo admins setting up protection  
**Purpose:** Exact, production-grade branch rules for `main`, aligned to CI gates and release safety.

## Traceability
- Master map: `TRACEABILITY_MAP.md`
- Primary spec links:
  - `APP_MASTER_SPEC.md#11-cicd--deployment`
  - `APP_MASTER_SPEC.md#13-release-verification-gate-all-yes-required`

## 1. Scope
This file defines mandatory GitHub branch protection for `main` so no code merges without passing quality, security, and review requirements.

## 2. Rule Target
- Branch name pattern: `main`
- Enforcement: include administrators

## 3. Mandatory Rule Configuration (GitHub UI)
1. Go to `Settings -> Branches -> Add rule`.
2. Set branch name pattern to `main`.
3. Enable `Require a pull request before merging`.
4. Under PR requirements:
   - Enable `Dismiss stale approvals when new commits are pushed`.
   - Enable `Require approval of the most recent reviewable push`.
   - Enable `Require review from Code Owners` (if `.github/CODEOWNERS` exists).
   - Minimum approvals: `1` (recommended `2` once team expands).
5. Enable `Require status checks to pass before merging`.
6. Enable `Require branches to be up to date before merging`.
7. Add required status checks from CI.
8. Enable `Require conversation resolution before merging`.
9. Enable `Require linear history`.
10. Disable bypass options:
    - Do **not** allow force pushes.
    - Do **not** allow deletions.
    - Do **not** allow bypassing required checks/rules.
11. Save rule.

## 4. Required Status Checks (CI Mapping)
Use checks produced by `.github/workflows/ci.yml`.

### 4.1 Required (Strict)
- `build-test`
- `migration-sanity`

### 4.2 Conditionally Required
- `e2e-smoke`
  - Set required when stable.
  - If flaky, keep as non-blocking until stabilized, then promote to required.

### 4.3 Workflow Name Note
- Workflow is named `CI`.
- Required checks in GitHub usually map to job-level check names (for example `build-test`) rather than only workflow name.

## 5. Merge Policy
- Recommended merge method: **Squash only**.
- Block direct pushes to `main` for non-maintainers.
- Auto-delete branch after merge: recommended.

## 6. Verification Procedure (Must Run Once After Setup)
1. Open a test PR.
2. Confirm checks appear:
   - `build-test`
   - `migration-sanity`
   - `e2e-smoke` (PR-only)
3. Force one check to fail and verify merge is blocked.
4. Add unresolved review conversation and verify merge is blocked.
5. Push new commit after approval and verify stale approval behavior works.
6. Confirm direct push to `main` is blocked for non-allowed users.

## 7. Operational Notes
- If CI job names change, update required status checks immediately.
- Keep this file aligned with `.github/workflows/ci.yml` and `APP_MASTER_SPEC.md`.
- Any policy change requires entry in `SPEC_CHANGELOG.md`.

This protects `main` end-to-end: every merge must pass CI and review gates before release. No loopholes.

---
## Legacy Logs (Preserved)
The full previous BRANCH_PROTECTION content is preserved below unchanged:

# BRANCH_PROTECTION

## Target Branch
- `main`

## Required Settings (GitHub Branch Protection)

### 1. Require pull request before merging
- Enabled
- Require approvals: `1` (minimum)
- Dismiss stale approvals when new commits are pushed: Enabled
- Require review from code owners: Enabled (if CODEOWNERS exists)

### 2. Require status checks to pass before merging
- Enabled
- Require branches to be up to date before merging: Enabled

### 3. Required status checks (from `.github/workflows/ci.yml`)
- `build-test`
- `migration-sanity`
- `e2e-smoke` (recommended for PRs; if flaky, keep required only on release PRs)

### 4. Require conversation resolution before merging
- Enabled

### 5. Require signed commits
- Recommended: Enabled

### 6. Require linear history
- Enabled

### 7. Restrict who can push to matching branches
- Enabled
- Allowed: maintainers only

### 8. Do not allow force pushes
- Enabled

### 9. Do not allow deletions
- Enabled

### 10. Include administrators
- Enabled

## Optional (Recommended)
- Merge method: Squash merge only
- Auto-delete head branches after merge: Enabled
- Require deployment to production environment before merge: Enable when deployment workflow is added

## Verification Steps
1. Open repo Settings -> Branches -> Add rule for `main`.
2. Apply settings above.
3. Open a test PR and confirm checks appear:
   - `build-test`
   - `migration-sanity`
   - `e2e-smoke` (PR only)
4. Confirm merge is blocked when any required check fails.

## Notes
- If `e2e-smoke` is not consistently stable yet, do not mark it required until stabilized.
- Revisit required checks whenever workflow names change.
